import { Platform } from 'react-native';

/**
 * Voice input (speech-to-text) via the Web Speech API. Available in Safari
 * (iOS 14.5+) and Chrome/Android — i.e. anywhere the app runs in a browser,
 * including the hosted https://vahdam-draft.expo.app build the team tests on.
 *
 * Text-to-speech (narration) is handled separately by expo-speech, which is
 * fully cross-platform (native + web), so the assistant always talks back.
 */
export function sttAvailable(): boolean {
  if (Platform.OS !== 'web') return false;
  const g = globalThis as any;
  return Boolean(g.SpeechRecognition || g.webkitSpeechRecognition);
}

export interface Recognizer {
  start: () => void;
  stop: () => void;
}

export interface RecognizerHandlers {
  onPartial?: (text: string) => void;
  onResult: (text: string) => void;
  onEnd?: () => void;
  onError?: (error: string) => void;
}

/** Create a one-shot recognizer, or null when STT isn't supported here. */
export function createRecognizer(handlers: RecognizerHandlers): Recognizer | null {
  const g = globalThis as any;
  const SR = g.SpeechRecognition || g.webkitSpeechRecognition;
  if (!SR) return null;

  const rec = new SR();
  rec.lang = 'en-US';
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 1;

  let finalText = '';

  rec.onresult = (e: any) => {
    let interim = '';
    finalText = '';
    for (let i = 0; i < e.results.length; i += 1) {
      const r = e.results[i];
      if (r.isFinal) finalText += r[0].transcript;
      else interim += r[0].transcript;
    }
    const live = (finalText || interim).trim();
    if (live) handlers.onPartial?.(live);
  };
  rec.onerror = (e: any) => handlers.onError?.(e?.error ?? 'speech_error');
  rec.onend = () => {
    const t = finalText.trim();
    if (t) handlers.onResult(t);
    handlers.onEnd?.();
  };

  return {
    start: () => {
      finalText = '';
      try {
        rec.start();
      } catch {
        /* already started */
      }
    },
    stop: () => {
      try {
        rec.stop();
      } catch {
        /* already stopped */
      }
    },
  };
}
