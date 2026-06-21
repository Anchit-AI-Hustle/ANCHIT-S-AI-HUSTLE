"""Shared multi-voice + cloning TTS service.

This generalizes the single-speaker XTTS server that ships inside
``Anchit-Work-Portfolio/tts-server`` into a reusable voice layer that every
app in this workspace (except the portfolio, which keeps its own embedded
server) can point at via one HTTP/WebSocket contract.

What it adds over the portfolio server:
  * A **voice-profile registry** — built-in stock voices plus user-cloned ones.
  * **Voice cloning** — POST an audio sample and it becomes a usable profile.
    XTTS-v2 is zero-shot, so "cloning" is just storing a clean reference clip;
    no training step, no GPU time beyond the first model load.
  * Every synthesis endpoint takes a ``voice_id`` so the same server speaks in
    any registered voice.
  * **Graceful degradation** — if the heavy ``TTS`` package / model isn't
    present (a dev laptop), the registry + cloning endpoints still work and the
    synthesis endpoints return 503 ``tts_unavailable`` so clients fall back
    exactly like the portfolio's ``audio-skipped`` path.

Contract (consumed by every app's client voice module):
  GET    /health
  GET    /api/voices                      -> { voices: [VoiceProfile] }
  POST   /api/voices/clone  (multipart)   -> VoiceProfile        (fields: name, file)
  DELETE /api/voices/{id}                 -> { ok, id }          (built-ins protected)
  GET    /api/voices/{id}/preview?text=   -> audio/wav
  POST   /api/tts          { text, voice_id, format }      -> audio/wav (whole answer)
  POST   /api/tts-packet   { text, voice_id }              -> audio/wav (one chat packet)
  WS     /ws/tts           { seq, text, voice_id }         -> status json, audio bytes, done json

VoiceProfile = { id, name, kind: "builtin"|"cloned", ready: bool, description }

Env:
  VOICE_DATA_DIR     where cloned reference WAVs + profiles.json live (default ./voice-data)
  VOICE_SEED_FILE    JSON describing built-in voices (default ./voices.seed.json)
  ANCHIT_SAMPLE_WAV  optional path to Anchit's reference clip (e.g. the portfolio's
                     audio/anchit-xtts-sample.wav) to seed the "anchit" built-in voice
  XTTS_LANGUAGE      synthesis language (default "en")
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import shutil
import subprocess
import tempfile
import uuid
from pathlib import Path
from typing import Any, Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

# ---------------------------------------------------------------------------
# Heavy model is optional so the service runs on a plain dev box. On a GPU host
# with `TTS` installed it loads once; everywhere else synthesis returns 503 and
# clients fall back to their device voice / text-only path.
# ---------------------------------------------------------------------------
os.environ.setdefault("COQUI_TOS_AGREED", "1")
try:
    from TTS.api import TTS  # type: ignore

    _TTS_IMPORTABLE = True
except Exception:  # noqa: BLE001 - any import failure means "no model here"
    TTS = None  # type: ignore
    _TTS_IMPORTABLE = False

ROOT = Path(__file__).resolve().parent
DATA_DIR = Path(os.environ.get("VOICE_DATA_DIR", ROOT / "voice-data"))
SEED_FILE = Path(os.environ.get("VOICE_SEED_FILE", ROOT / "voices.seed.json"))
LANGUAGE = os.environ.get("XTTS_LANGUAGE", "en")
DATA_DIR.mkdir(parents=True, exist_ok=True)
PROFILES_JSON = DATA_DIR / "profiles.json"

PREVIEW_LINE = "Hi, this is how I sound. I can read your answers aloud in this voice."

# Pronunciation fixes shared with the portfolio server.
_REPLACEMENTS = {
    "Vahdam": "Vah-dam",
    "D2C": "D to C",
    "MRR": "M R R",
    "ARR": "A R R",
    "AI": "A I",
}


# Emoji / pictographs / dingbats / symbols that must never be read aloud.
_EMOJI_RE = re.compile(
    "["
    "\U0001f300-\U0001faff"  # symbols, pictographs, emoticons, transport, supplemental
    "\U00002600-\U000027bf"  # misc symbols + dingbats
    "\U0001f000-\U0001f0ff"
    "\U00002190-\U000021ff"  # arrows
    "\U00002b00-\U00002bff"
    "\U0000fe00-\U0000fe0f"  # variation selectors
    "\U0001f1e6-\U0001f1ff"  # regional indicators
    "‍♀♂⚖❤"
    "]+",
    flags=re.UNICODE,
)


def clean_for_speech(text: str) -> str:
    """Strip markdown and emoji and turn line breaks / list items into sentence
    stops, so synthesized speech reads as flowing sentences — never literal
    bullet characters, asterisks, or run-on lists."""
    if not text:
        return ""
    t = text
    # Fenced + inline code: keep the words, drop the backticks.
    t = re.sub(r"```[a-zA-Z0-9]*\n?", " ", t)
    t = t.replace("```", " ").replace("`", "")
    # Links / images: [label](url) -> label, ![alt](url) -> alt.
    t = re.sub(r"!?\[([^\]]*)\]\([^)]*\)", r"\1", t)
    # Line-start chrome: headings, blockquotes, bullets, numbered markers.
    t = re.sub(r"(?m)^\s{0,3}#{1,6}\s*", "", t)
    t = re.sub(r"(?m)^\s{0,3}>\s?", "", t)
    t = re.sub(r"(?m)^\s*([-*+•]|\d+[.)])\s+", "", t)
    # Emphasis markers.
    t = re.sub(r"(\*\*|\*|__|_|~~)", "", t)
    # Drop emoji & pictographs.
    t = _EMOJI_RE.sub(" ", t)
    # Turn each line into a sentence: if it doesn't end in terminal punctuation,
    # add a period so the voice pauses instead of running lines together.
    out: list[str] = []
    for raw in t.splitlines():
        ln = raw.strip()
        if not ln:
            continue
        if ln[-1] not in ".!?:;,…":
            ln += "."
        out.append(ln)
    t = " ".join(out)
    t = re.sub(r"\s+([.,!?;:])", r"\1", t)  # no space before punctuation
    return re.sub(r"\s+", " ", t).strip()


def preprocess_text(text: str, limit: int = 1200) -> str:
    text = clean_for_speech(text or "")
    for src, dest in _REPLACEMENTS.items():
        text = text.replace(src, dest)
    return " ".join(text.split())[:limit]


def slugify(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", (name or "").lower()).strip("-")
    return s or "voice"


# ---------------------------------------------------------------------------
# Profile registry. A profile is metadata + a 24kHz mono reference WAV.
# Built-ins come from the seed file; cloned ones are created at runtime.
# ---------------------------------------------------------------------------
class Registry:
    def __init__(self) -> None:
        self.profiles: dict[str, dict[str, Any]] = {}
        self._load_seed()
        self._load_cloned()

    def _load_seed(self) -> None:
        seed: list[dict[str, Any]] = []
        if SEED_FILE.exists():
            try:
                seed = json.loads(SEED_FILE.read_text())
            except Exception:  # noqa: BLE001
                seed = []
        # Allow seeding Anchit's voice from the portfolio sample via env.
        anchit_sample = os.environ.get("ANCHIT_SAMPLE_WAV")
        for entry in seed:
            vid = entry.get("id")
            if not vid:
                continue
            ref = entry.get("ref")
            if vid == "anchit" and anchit_sample:
                ref = anchit_sample
            ref_path = Path(ref).expanduser() if ref else None
            self.profiles[vid] = {
                "id": vid,
                "name": entry.get("name", vid),
                "kind": "builtin",
                "description": entry.get("description", ""),
                "ref": str(ref_path) if ref_path else None,
            }

    def _load_cloned(self) -> None:
        if not PROFILES_JSON.exists():
            return
        try:
            saved = json.loads(PROFILES_JSON.read_text())
        except Exception:  # noqa: BLE001
            return
        for entry in saved:
            vid = entry.get("id")
            if not vid:
                continue
            self.profiles[vid] = {
                "id": vid,
                "name": entry.get("name", vid),
                "kind": "cloned",
                "description": entry.get("description", "Cloned voice"),
                "ref": entry.get("ref"),
            }

    def _persist_cloned(self) -> None:
        cloned = [
            {"id": p["id"], "name": p["name"], "description": p["description"], "ref": p["ref"]}
            for p in self.profiles.values()
            if p["kind"] == "cloned"
        ]
        PROFILES_JSON.write_text(json.dumps(cloned, indent=2))

    @staticmethod
    def _ready(p: dict[str, Any]) -> bool:
        ref = p.get("ref")
        return bool(ref) and Path(ref).exists() and Path(ref).stat().st_size > 0

    def public(self) -> list[dict[str, Any]]:
        return [
            {
                "id": p["id"],
                "name": p["name"],
                "kind": p["kind"],
                "description": p["description"],
                "ready": self._ready(p),
            }
            for p in self.profiles.values()
        ]

    def ref_for(self, voice_id: Optional[str]) -> str:
        vid = voice_id or DEFAULT_VOICE_ID
        p = self.profiles.get(vid) or self.profiles.get(DEFAULT_VOICE_ID)
        if not p or not self._ready(p):
            raise HTTPException(status_code=409, detail=f"voice '{vid}' has no usable reference clip")
        return p["ref"]

    def add_cloned(self, name: str, ref_wav: Path) -> dict[str, Any]:
        vid = f"{slugify(name)}-{uuid.uuid4().hex[:6]}"
        self.profiles[vid] = {
            "id": vid,
            "name": name.strip()[:60] or "My voice",
            "kind": "cloned",
            "description": "Your cloned voice",
            "ref": str(ref_wav),
        }
        self._persist_cloned()
        return self.profiles[vid]

    def remove(self, vid: str) -> None:
        p = self.profiles.get(vid)
        if not p:
            raise HTTPException(status_code=404, detail="voice not found")
        if p["kind"] == "builtin":
            raise HTTPException(status_code=403, detail="built-in voices cannot be deleted")
        ref = p.get("ref")
        if ref and Path(ref).exists():
            try:
                Path(ref).unlink()
            except OSError:
                pass
        del self.profiles[vid]
        self._persist_cloned()


DEFAULT_VOICE_ID = os.environ.get("VOICE_DEFAULT_ID", "anchit")
registry = Registry()

# ---------------------------------------------------------------------------
# Model load (best effort).
# ---------------------------------------------------------------------------
_tts_model = None
_tts_error: Optional[str] = None


def get_model():
    global _tts_model, _tts_error
    if _tts_model is not None:
        return _tts_model
    if not _TTS_IMPORTABLE:
        _tts_error = "TTS package not installed on this host"
        return None
    try:
        print("Loading XTTS-v2 model...")
        _tts_model = TTS("tts_models/multilingual/multi-dataset/xtts_v2")
        print("XTTS-v2 model loaded.")
    except Exception as exc:  # noqa: BLE001
        _tts_error = str(exc)
        _tts_model = None
    return _tts_model


def ffmpeg_to_reference(src: Path, dest: Path) -> None:
    """Normalize any uploaded sample to the 24kHz mono WAV XTTS expects."""
    if not shutil.which("ffmpeg"):
        raise HTTPException(status_code=500, detail="ffmpeg not available to normalize the sample")
    proc = subprocess.run(
        ["ffmpeg", "-y", "-i", str(src), "-ar", "24000", "-ac", "1", str(dest)],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        text=True,
    )
    if proc.returncode != 0 or not dest.exists():
        raise HTTPException(status_code=400, detail=f"could not process audio sample: {proc.stderr[-300:]}")


def synthesize_to_file(text: str, voice_id: Optional[str]) -> Path:
    model = get_model()
    if model is None:
        raise HTTPException(status_code=503, detail=f"tts_unavailable: {_tts_error or 'model not loaded'}")
    ref = registry.ref_for(voice_id)
    out = Path(tempfile.gettempdir()) / f"voice-{uuid.uuid4().hex}.wav"
    model.tts_to_file(text=text, speaker_wav=ref, language=LANGUAGE, file_path=str(out))
    return out


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------
app = FastAPI(title="Shared Voice + Cloning Service")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class TTSRequest(BaseModel):
    text: str
    voice_id: Optional[str] = None
    format: Optional[str] = "wav"


@app.get("/health")
async def health() -> dict[str, Any]:
    return {
        "ok": True,
        "tts_available": _TTS_IMPORTABLE,
        "model_loaded": _tts_model is not None,
        "default_voice": DEFAULT_VOICE_ID,
        "voices": len(registry.profiles),
    }


@app.get("/api/voices")
async def list_voices() -> dict[str, Any]:
    return {"voices": registry.public(), "default": DEFAULT_VOICE_ID}


@app.post("/api/voices/clone")
async def clone_voice(name: str = Form(...), file: UploadFile = File(...)) -> JSONResponse:
    """Turn an uploaded audio sample (6-30s of clean speech) into a voice profile."""
    suffix = Path(file.filename or "sample").suffix or ".m4a"
    raw = Path(tempfile.gettempdir()) / f"upload-{uuid.uuid4().hex}{suffix}"
    raw.write_bytes(await file.read())
    if raw.stat().st_size < 2000:
        raw.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail="sample too short or empty")
    ref = DATA_DIR / f"{slugify(name)}-{uuid.uuid4().hex[:6]}.wav"
    try:
        ffmpeg_to_reference(raw, ref)
    finally:
        raw.unlink(missing_ok=True)
    profile = registry.add_cloned(name, ref)
    return JSONResponse(
        {
            "id": profile["id"],
            "name": profile["name"],
            "kind": "cloned",
            "description": profile["description"],
            "ready": True,
        }
    )


@app.delete("/api/voices/{voice_id}")
async def delete_voice(voice_id: str) -> dict[str, Any]:
    registry.remove(voice_id)
    return {"ok": True, "id": voice_id}


@app.get("/api/voices/{voice_id}/preview")
async def preview_voice(voice_id: str, text: Optional[str] = None):
    line = preprocess_text(text or PREVIEW_LINE, limit=240)
    out = await asyncio.to_thread(synthesize_to_file, line, voice_id)
    return FileResponse(str(out), media_type="audio/wav", filename=f"{voice_id}-preview.wav")


@app.post("/api/tts")
async def tts(req: TTSRequest):
    text = preprocess_text(req.text or "")
    if not text:
        raise HTTPException(status_code=400, detail="text cannot be empty")
    out = await asyncio.to_thread(synthesize_to_file, text, req.voice_id)
    return FileResponse(str(out), media_type="audio/wav", filename="narration.wav")


@app.post("/api/tts-packet")
async def tts_packet(req: TTSRequest):
    text = preprocess_text(req.text or "", limit=320)
    if not text:
        raise HTTPException(status_code=400, detail="text cannot be empty")
    out = await asyncio.to_thread(synthesize_to_file, text, req.voice_id)
    return FileResponse(str(out), media_type="audio/wav", filename=f"packet-{uuid.uuid4().hex}.wav")


@app.websocket("/ws/tts")
async def tts_socket(ws: WebSocket):
    await ws.accept()
    try:
        while True:
            payload = await ws.receive_json()
            seq = payload.get("seq")
            voice_id = payload.get("voice_id")
            text = preprocess_text(payload.get("text") or "", limit=320)
            if not text:
                await ws.send_json({"type": "error", "seq": seq, "error": "empty_text"})
                continue
            await ws.send_json({"type": "buffering", "seq": seq})
            try:
                out = await asyncio.to_thread(synthesize_to_file, text, voice_id)
                await ws.send_json({"type": "audio", "seq": seq, "mime": "audio/wav", "text": text})
                await ws.send_bytes(out.read_bytes())
                await ws.send_json({"type": "done", "seq": seq})
            except HTTPException as exc:
                await ws.send_json({"type": "error", "seq": seq, "error": exc.detail})
            except Exception as exc:  # noqa: BLE001
                await ws.send_json({"type": "error", "seq": seq, "error": str(exc)})
    except WebSocketDisconnect:
        return


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "8000")))
