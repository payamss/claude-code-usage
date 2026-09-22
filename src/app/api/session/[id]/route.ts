import { NextRequest, NextResponse } from 'next/server';
import { ensureFresh, sessionDetail } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const scanner = await ensureFresh();
  const d = sessionDetail(scanner, id);
  return d ? NextResponse.json(d) : NextResponse.json({ error: 'not found' }, { status: 404 });
}
