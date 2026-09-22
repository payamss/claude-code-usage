import { NextRequest, NextResponse } from 'next/server';
import { ensureFresh, overview } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const scanner = await ensureFresh(q.get('refresh') === '1');
  return NextResponse.json(overview(scanner, { from: q.get('from'), to: q.get('to'), project: q.get('project') }));
}
