// USD per 1M tokens: [input, output, cacheWrite5m, cacheWrite1h, cacheRead]
// Cache write = 1.25x input (5m TTL) / 2x input (1h TTL); cache read = 0.1x input,
// except Fable 5.1 whose cache read is $0.25/M.
export type PriceRow = [number, number, number, number, number];

/**
 * Built-in list prices, checked against Anthropic's pricing page.
 * They can be refreshed at runtime from a public dataset (see src/lib/prices.ts
 * and the Settings page) — that only ever overwrites this table in memory.
 */
export const BUILTIN_UPDATED = '2026-09-22';

export const BUILTIN_PRICES: Record<string, PriceRow> = {
  'claude-opus-5': [5, 25, 6.25, 10, 0.5],
  'claude-opus-4-8': [5, 25, 6.25, 10, 0.5],
  'claude-opus-4-7': [5, 25, 6.25, 10, 0.5],
  'claude-opus-4-6': [5, 25, 6.25, 10, 0.5],
  'claude-sonnet-5': [2, 10, 2.5, 4, 0.2],
  'claude-sonnet-4-6': [3, 15, 3.75, 6, 0.3],
  'claude-fable-5-1': [10, 50, 12.5, 20, 0.25],
  'claude-fable-5': [10, 50, 12.5, 20, 1.0],
  'claude-haiku-4-5': [1, 5, 1.25, 2, 0.1],
  'claude-haiku-4-5-20251001': [1, 5, 1.25, 2, 0.1],
};

/** The table actually used for every calculation. Replaced by applyPrices(). */
export let PRICES: Record<string, PriceRow> = { ...BUILTIN_PRICES };

/** Swap in refreshed prices (server-side only; pass null to go back to built-in). */
export function applyPrices(models: Record<string, PriceRow> | null): void {
  PRICES = models ? { ...BUILTIN_PRICES, ...models } : { ...BUILTIN_PRICES };
}

export const FREE_MODELS = new Set(['<synthetic>']);

export interface Usage {
  input: number;
  output: number;
  cw5: number;
  cw1: number;
  cr: number;
}

export const emptyUsage = (): Usage => ({ input: 0, output: 0, cw5: 0, cw1: 0, cr: 0 });

export function addUsage<T extends Usage>(a: T, b: Usage): T {
  a.input += b.input; a.output += b.output; a.cw5 += b.cw5; a.cw1 += b.cw1; a.cr += b.cr;
  return a;
}

export function priceFor(model: string): PriceRow | null {
  if (PRICES[model]) return PRICES[model];
  // tolerate date-suffixed ids like claude-sonnet-5-20260101
  const base = Object.keys(PRICES).find((k) => model && model.startsWith(k + '-'));
  return base ? PRICES[base] : null;
}

/** Cost in USD, or null when the model has no known price. */
export function costOf(model: string, u: Usage): number | null {
  if (FREE_MODELS.has(model)) return 0;
  const p = priceFor(model);
  if (!p) return null;
  return (u.input * p[0] + u.output * p[1] + u.cw5 * p[2] + u.cw1 * p[3] + u.cr * p[4]) / 1e6;
}

export function shortModel(model: string): string {
  if (!model) return '?';
  return model.replace(/^claude-/, '').replace(/-\d{8}$/, '').replace(/-(\d)-(\d)$/, '-$1.$2');
}
