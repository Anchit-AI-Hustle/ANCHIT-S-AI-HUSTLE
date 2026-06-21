# Shared Voice + Cloning Service

One small FastAPI service that gives **every app in this workspace** (except
`Anchit-Work-Portfolio`, which keeps its own embedded `tts-server`) the same
voice features the portfolio chat has:

- **Voice profiles** — built-in stock voices + the user's own cloned voices.
- **Voice cloning** — upload/record a short sample, it becomes a usable voice
  (XTTS-v2 is zero-shot, so there is no training step).
- **Preview** any voice before selecting it.
- **Streaming packet synthesis** so chat replies are spoken while they generate.

Apps talk to it over one HTTP/WebSocket contract (see `app.py` docstring). They
select a `voice_id` per user and stream packets exactly like the portfolio's
`/api/chat-stream`.

## Run

Dev (registry + cloning only, no GPU — synthesis returns `503 tts_unavailable`,
clients fall back to device voice):

```bash
pip install fastapi "uvicorn[standard]" python-multipart
python app.py            # http://localhost:8000
```

Production (GPU host, real synthesis):

```bash
pip install -r requirements.txt        # includes TTS (Coqui XTTS-v2)
ANCHIT_SAMPLE_WAV=/path/to/anchit-xtts-sample.wav \
  uvicorn app:app --host 0.0.0.0 --port 8000
```

Use an NVIDIA L4/A10G/T4-class GPU; keep the process warm (cold-starting XTTS
per request feels broken). Same guidance as the portfolio's
`STREAMING_VOICE_ARCHITECTURE.md`.

## Voice profiles

- **Built-ins** are declared in `voices.seed.json`. Each needs a clean 24kHz
  mono reference WAV at the `ref` path (drop stock clips into `voices/`).
- **`anchit`** is seeded from `ANCHIT_SAMPLE_WAV` (point it at the portfolio's
  `audio/anchit-xtts-sample.wav`) so "my voice" works out of the box.
- **Cloned** voices are created at runtime via `POST /api/voices/clone` and
  stored under `VOICE_DATA_DIR` (default `./voice-data`, gitignored).

A voice with no usable reference clip still lists, but reports `ready: false`
and is skipped for synthesis (409) so the UI can grey it out.

## Env

| Var | Default | Purpose |
|---|---|---|
| `VOICE_DATA_DIR` | `./voice-data` | where cloned WAVs + `profiles.json` live |
| `VOICE_SEED_FILE` | `./voices.seed.json` | built-in voice definitions |
| `ANCHIT_SAMPLE_WAV` | — | seed the `anchit` built-in from this clip |
| `VOICE_DEFAULT_ID` | `anchit` | fallback voice when none requested |
| `XTTS_LANGUAGE` | `en` | synthesis language |
| `PORT` | `8000` | listen port |
