import fs from "node:fs";
import path from "node:path";
import { STATE_DIR, STATE_FILE } from "./config";
import type { FlowRecord, RunState } from "./types";

function nowIso(): string {
  return new Date().toISOString();
}

export function loadState(): RunState {
  try {
    const raw = fs.readFileSync(STATE_FILE, "utf8");
    const parsed = JSON.parse(raw) as RunState;
    if (parsed && typeof parsed === "object" && parsed.records) return parsed;
  } catch {
    // no state yet
  }
  return { startedAt: nowIso(), updatedAt: nowIso(), records: {}, done: [] };
}

export function saveState(state: RunState): void {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  state.updatedAt = nowIso();
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

/** Record a finished flow and checkpoint to disk. */
export function commitRecord(state: RunState, record: FlowRecord): void {
  state.records[record.name] = record;
  if (!state.done.includes(record.name)) state.done.push(record.name);
  saveState(state);
}

export function isDone(state: RunState, name: string): boolean {
  return state.done.includes(name) && Boolean(state.records[name]);
}

export function clearState(): void {
  try {
    fs.rmSync(path.dirname(STATE_FILE), { recursive: true, force: true });
  } catch {
    // ignore
  }
}
