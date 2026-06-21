# Voice layer rollout — bringing the portfolio's cloned-voice chat to every app

Goal: every app that has a chat (**except `Anchit-Work-Portfolio`**, which is the
reference and already ships its own embedded `tts-server`) gets the same voice
experience:

- a **voice picker** — built-in stock voices **and** the user's own cloned voices,
- **clone your voice** (record/upload a short sample → usable voice, no training),
- **preview** any voice,
- chat replies **spoken in the selected voice**, streamed in packets like the
  portfolio's `/api/chat-stream`.

All apps point at the **one shared service** in this folder. They never re-implement
synthesis — they only (1) call the registry/clone endpoints and (2) stream packets.

## The contract (identical for every stack)

```
GET    {VOICE}/api/voices                    -> { voices: [{id,name,kind,description,ready}], default }
POST   {VOICE}/api/voices/clone  (multipart) -> voice            fields: name, file
DELETE {VOICE}/api/voices/{id}               -> { ok, id }       (built-ins protected)
GET    {VOICE}/api/voices/{id}/preview       -> audio/wav
POST   {VOICE}/api/tts-packet  {text,voice_id} -> audio/wav      one chat packet
POST   {VOICE}/api/tts         {text,voice_id} -> audio/wav      whole answer
WS     {VOICE}/ws/tts          {seq,text,voice_id} -> json/bytes/json
```

`{VOICE}` is configured per app via env (see table). When unset or unreachable,
every app must **degrade to its on-device / browser voice** and never break chat.

## Three client primitives each app needs

The Vahdam Super App is the **reference implementation** — copy its three pieces:

| Primitive | Vahdam file | What it does |
|---|---|---|
| Service client | `src/lib/voiceProfiles.ts` | list / clone / delete / preview / persist selected voice |
| Packet player | `src/lib/voicePlayer.ts` | chunk reply → fetch `tts-packet` per chunk → play sequentially; throws so caller falls back |
| Picker UI | `src/components/voice-picker.tsx` | list + preview + select + "add your voice" (record/upload) + delete |

Wiring (see `src/app/(tabs)/assistant.tsx`): load saved voice on mount, route the
"speak this reply" action through the packet player first and fall back to the
device voice on failure, and add a header entry point that opens the picker.

### Chunking must match the server

`chunkForSpeech()` in `voicePlayer.ts` uses the **same** sentence boundaries
(MIN 60 / MAX 220 chars) as the server's `takeChunk` and the portfolio's
`chat-stream.js`. Keep them in sync if you tune one.

## Per-stack integration notes

- **Expo / React Native (Vahdam Super App, MusicGenAI if RN):** done as the
  reference. Web build uses `fetch` + `Audio` + `MediaRecorder`; native uses
  `expo-audio` (lazy-required) and falls back to `expo-speech`. To enable native
  recording/cloning, add `expo-audio` and a recorder in the picker.
- **React web (The-Third-Eye frontend, AI-TeleSuite, Vahdam-LifeCycle-OS,
  marketing_mailers, vahdam_dtc):** port the three primitives to plain web APIs
  (`fetch`, `Audio`, `URL.createObjectURL`, `MediaRecorder`). This is essentially
  the portfolio's `index.html` packet player generalized with a `voice_id` and a
  picker component.
- **FastAPI / Python backends (The-Third-Eye, Personal-AI-OS):** the backend only
  needs to **pass through** `voice_id` and proxy packet bytes if you don't want the
  browser hitting the voice host directly. The voice work itself is client-side.

## Env per app

| App | Voice env var | Notes |
|---|---|---|
| Vahdam Super App | `EXPO_PUBLIC_VOICE_URL` | falls back to API origin in dev |
| The-Third-Eye | `VITE_VOICE_URL` (frontend) | |
| Personal-AI-OS | `VOICE_URL` | |
| Vahdam-LifeCycle-OS | per its build (`VITE_`/`NEXT_PUBLIC_`) | |
| AI-TeleSuite | per its build | |
| marketing_mailers | per its build | |
| vahdam_dtc | per its build | |
| MusicGenAI | `VITE_VOICE_URL` / `EXPO_PUBLIC_VOICE_URL` | |

Seed `anchit` ("my voice") on the service host with
`ANCHIT_SAMPLE_WAV=/path/to/portfolio/audio/anchit-xtts-sample.wav`.

## Status

- [x] Shared service (`voice-service/`) — registry, cloning, preview, packet/WS synthesis, graceful 503.
- [x] Vahdam Super App — full integration (picker, preview, clone, cloned-voice playback, persisted selection).
- [ ] The-Third-Eye / Personal-AI-OS / Vahdam-LifeCycle-OS / AI-TeleSuite / marketing_mailers / vahdam_dtc / MusicGenAI.
