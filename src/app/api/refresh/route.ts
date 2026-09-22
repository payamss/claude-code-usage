import { NextResponse } from 'next/server';
import { getScanner } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function POST() {
  const s = getScanner();
  const st = await s.scan();
  return NextResponse.json({ ok: true, ...st, lastScan: s.lastScan });
}
