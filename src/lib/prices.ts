import fs from 'node:fs';
import path from 'node:path';
import { BUILTIN_PRICES, BUILTIN_UPDATED, applyPrices, type PriceRow } from './pricing';

/**
 * Prices are built into the app (src/lib/pricing.ts). They can also be refreshed
 * at runtime from a public machine-readable dataset, which is stored in
 * cache/prices.json and merged over the built-in table. Nothing is sent to the
 * source — it is a plain GET of a public JSON file, only on an explicit refresh.
 */

export const SOURCES = [
  {
    id: 'litellm',
    name: 'LiteLLM model_prices_and_context_window.json',
    url: 'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json',
    home: 'https://github.com/BerriAI/litellm',
  },
] as const;

const FILE = () => path.join(process.cwd(), 'cache', 'prices.json');

export interface PriceFile {
  fetchedAt: string;
  sourceId: string;
  sourceName: string;
  sourceUrl: string;
  models: Record<string, PriceRow>;
}

export interface PriceState {
  /** the table in use */
  models: Record<string, PriceRow>;
  builtinUpdated: string;
  /** null when the built-in table is in use */
  fetchedAt: string | null;
  sourceName: string | null;
  sourceUrl: string | null;
  /** models whose refreshed price differs from the built-in one */
  changed: string[];
  file: string;
  sources: typeof SOURCES;
}

let loadedMtime = -1;

function readFile(): PriceFile | null {
  try {
    const f = FILE();
    const st = fs.statSync(f);
    loadedMtime = st.mtimeMs;
    const j = JSON.parse(fs.readFileSync(f, 'utf8')) as PriceFile;
    if (!j.models || typeof j.models !== 'object') return null;
    return j;
  } catch {
    loadedMtime = -1;
    return null;
  }
}

/** Applies cache/prices.json if present. Cheap: re-reads only when the file changed. */
export function loadPrices(force = false): PriceState {
  let mtime = -1;
  try { mtime = fs.statSync(FILE()).mtimeMs; } catch { /* no override file */ }
  if (force || mtime !== loadedMtime) {
    const j = mtime === -1 ? null : readFile();
    applyPrices(j ? j.models : null);
    if (mtime === -1) loadedMtime = -1;
  }
  return state();
}

function state(): PriceState {
  const j = loadedMtime === -1 ? null : readFile();
  const models = { ...BUILTIN_PRICES, ...(j?.models || {}) };
  const changed = j ? Object.keys(j.models).filter((m) => BUILTIN_PRICES[m] && String(BUILTIN_PRICES[m]) !== String(j.models[m])) : [];
  return {
    models,
    builtinUpdated: BUILTIN_UPDATED,
    fetchedAt: j?.fetchedAt ?? null,
    sourceName: j?.sourceName ?? null,
    sourceUrl: j?.sourceUrl ?? null,
    changed,
    file: FILE(),
    sources: SOURCES,
  };
}

export const priceState = state;

interface LiteLLMEntry {
  litellm_provider?: string;
  mode?: string;
  input_cost_per_token?: number;
  output_cost_per_token?: number;
  cache_creation_input_token_cost?: number;
  cache_creation_input_token_cost_above_1hr?: number;
  cache_read_input_token_cost?: number;
}

/** Maps the source dataset to our [input, output, cw5, cw1, cr] rows, USD per 1M tokens. */
function parseLiteLLM(data: Record<string, LiteLLMEntry>): Record<string, PriceRow> {
  const out: Record<string, PriceRow> = {};
  const M = 1e6;
  for (const [key, e] of Object.entries(data)) {
    // first-party Anthropic chat models only: no provider prefixes, no ":batch" variants
    if (e?.litellm_provider !== 'anthropic' || e.mode !== 'chat') continue;
    if (!key.startsWith('claude-') || key.includes('/') || key.includes(':')) continue;
    const input = e.input_cost_per_token, output = e.output_cost_per_token;
    if (typeof input !== 'number' || typeof output !== 'number') continue;
    const cw5 = typeof e.cache_creation_input_token_cost === 'number' ? e.cache_creation_input_token_cost : input * 1.25;
    const cw1 = typeof e.cache_creation_input_token_cost_above_1hr === 'number' ? e.cache_creation_input_token_cost_above_1hr : input * 2;
    const cr = typeof e.cache_read_input_token_cost === 'number' ? e.cache_read_input_token_cost : input * 0.1;
    const row: PriceRow = [input * M, output * M, cw5 * M, cw1 * M, cr * M];
    if (row.some((v) => !Number.isFinite(v) || v < 0 || v > 1000)) continue; // implausible → skip
    out[key] = row.map((v) => Math.round(v * 1e4) / 1e4) as PriceRow;
  }
  return out;
}

export interface RefreshResult extends PriceState {
  ok: boolean;
  error?: string;
  found: number;
  added: string[];
  updated: string[];
}

/** Downloads the dataset, writes cache/prices.json and applies it. */
export async function refreshPrices(sourceId = 'litellm'): Promise<RefreshResult> {
  const src = SOURCES.find((s) => s.id === sourceId) || SOURCES[0];
  const before = { ...BUILTIN_PRICES, ...(priceState().models) };
  try {
    const res = await fetch(src.url, { signal: AbortSignal.timeout(30000), headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`${src.url} → HTTP ${res.status}`);
    const data = (await res.json()) as Record<string, LiteLLMEntry>;
    const models = parseLiteLLM(data);
    if (Object.keys(models).length < 3) throw new Error('the source returned no usable Claude prices');

    const file: PriceFile = { fetchedAt: new Date().toISOString(), sourceId: src.id, sourceName: src.name, sourceUrl: src.url, models };
    fs.mkdirSync(path.dirname(FILE()), { recursive: true });
    fs.writeFileSync(FILE(), JSON.stringify(file, null, 2) + '\n');
    loadPrices(true);

    const added = Object.keys(models).filter((m) => !before[m]);
    const updated = Object.keys(models).filter((m) => before[m] && String(before[m]) !== String(models[m]));
    return { ...priceState(), ok: true, found: Object.keys(models).length, added, updated };
  } catch (e) {
    return { ...priceState(), ok: false, error: (e as Error).message, found: 0, added: [], updated: [] };
  }
}

/** Deletes cache/prices.json and goes back to the built-in table. */
export function resetPrices(): PriceState {
  try { fs.unlinkSync(FILE()); } catch { /* already gone */ }
  return loadPrices(true);
}
