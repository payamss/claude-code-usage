import { NextRequest, NextResponse } from 'next/server';
import { loadPrices, refreshPrices, resetPrices } from '@/lib/prices';
import { getScanner } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(loadPrices());
}

/** { action: "refresh" | "reset" } — both recompute every session cost afterwards. */
export async function POST(req: NextRequest) {
  let body: { action?: string; source?: string } = {};
  try { body = await req.json(); } catch { /* empty body = refresh */ }
  const result = body.action === 'reset' ? { ...resetPrices(), ok: true, found: 0, added: [], updated: [] } : await refreshPrices(body.source);
  // prices changed → rebuild the sessions so every total uses them
  await getScanner().scan();
  return NextResponse.json(result);
}
