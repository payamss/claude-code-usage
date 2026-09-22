// Fixed categorical colour slot per model; never re-assigned when the set of models on screen shrinks.
export { shortModel } from './pricing';

export const MODEL_ORDER = [
  'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5', 'claude-fable-5-1',
  'claude-haiku-4-5-20251001', 'claude-opus-4-8', 'claude-haiku-4-5', 'claude-opus-4-7',
];

const slotOf: Record<string, number> = {};

export function modelSlot(m: string): number {
  if (slotOf[m] == null) {
    const i = MODEL_ORDER.indexOf(m);
    slotOf[m] = i >= 0 ? i + 1 : Math.min(8, Object.keys(slotOf).length + 1);
  }
  return Math.min(8, slotOf[m]);
}

/** CSS colour for a model (a design-token variable, so it follows light/dark). */
export function modelColor(m: string): string {
  if (m === '<synthetic>' || /gemma|gguf/i.test(m)) return 'var(--muted)';
  return `var(--s${modelSlot(m)})`;
}

export function sortModels(models: string[]): string[] {
  return [...models].sort((a, b) => (MODEL_ORDER.indexOf(a) + 1 || 99) - (MODEL_ORDER.indexOf(b) + 1 || 99));
}
