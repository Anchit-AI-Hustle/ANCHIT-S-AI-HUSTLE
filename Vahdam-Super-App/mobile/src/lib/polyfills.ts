/**
 * Polyfills required by the AI SDK on React Native / Hermes.
 * Import this FIRST, before any AI SDK usage (done in the root _layout).
 */
import structuredClonePolyfill from '@ungap/structured-clone';

const g = globalThis as unknown as { structuredClone?: unknown };
if (typeof g.structuredClone !== 'function') {
  g.structuredClone = structuredClonePolyfill;
}
