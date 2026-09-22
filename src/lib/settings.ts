import fs from 'node:fs';
import path from 'node:path';
import { CLAUDE_HOME } from './store';

// Only these keys may be written, with strict validation. Everything else in
// settings.json is preserved untouched.
export const EDITABLE = {
  cleanupPeriodDays: (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 3650,
  promptCacheTtl: (v: unknown) => v === '5m' || v === '1h',
  subagentPromptCacheTtl: (v: unknown) => v === '5m' || v === '1h',
} as const;

export type EditableKey = keyof typeof EDITABLE;

export interface SettingsState {
  file: string;
  exists: boolean;
  writable: boolean;
  values: Partial<Record<EditableKey, number | string>>;
  defaults: { cleanupPeriodDays: number; promptCacheTtl: string; subagentPromptCacheTtl: string };
  error?: string;
}

const file = () => path.join(CLAUDE_HOME, 'settings.json');

function canWrite(p: string): boolean {
  try {
    if (fs.existsSync(p)) { fs.accessSync(p, fs.constants.W_OK); return true; }
    fs.accessSync(path.dirname(p), fs.constants.W_OK);
    return true;
  } catch { return false; }
}

export function readSettings(): SettingsState {
  const f = file();
  const state: SettingsState = {
    file: f, exists: fs.existsSync(f), writable: canWrite(f), values: {},
    // what Claude Code does when the key is absent
    defaults: { cleanupPeriodDays: 30, promptCacheTtl: 'auto', subagentPromptCacheTtl: 'auto' },
  };
  if (!state.exists) return state;
  try {
    const j = JSON.parse(fs.readFileSync(f, 'utf8')) as Record<string, unknown>;
    for (const k of Object.keys(EDITABLE) as EditableKey[]) {
      if (j[k] !== undefined) state.values[k] = j[k] as number | string;
    }
  } catch (e) {
    state.error = (e as Error).message;
  }
  return state;
}

/**
 * Merges `patch` into ~/.claude/settings.json, preserving every other key and
 * the file's formatting style. A value of null removes the key. A timestamped
 * backup is written next to the file before the first change.
 */
export function writeSettings(patch: Record<string, unknown>): SettingsState {
  const f = file();
  const entries = Object.entries(patch);
  for (const [k, v] of entries) {
    if (!(k in EDITABLE)) throw new Error(`not editable: ${k}`);
    if (v !== null && !EDITABLE[k as EditableKey](v)) throw new Error(`invalid value for ${k}: ${JSON.stringify(v)}`);
  }
  let current: Record<string, unknown> = {};
  if (fs.existsSync(f)) {
    const raw = fs.readFileSync(f, 'utf8');
    current = JSON.parse(raw) as Record<string, unknown>;
    fs.writeFileSync(`${f}.backup-${new Date().toISOString().replace(/[:.]/g, '-')}`, raw);
  } else {
    fs.mkdirSync(path.dirname(f), { recursive: true });
  }
  for (const [k, v] of entries) {
    if (v === null) delete current[k]; else current[k] = v;
  }
  const tmp = `${f}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(current, null, 2) + '\n');
  fs.renameSync(tmp, f);
  return readSettings();
}
