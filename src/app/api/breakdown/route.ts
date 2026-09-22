import { NextRequest, NextResponse } from 'next/server';
import { ensureFresh, breakdown } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const scanner = await ensureFresh();
  return NextResponse.json(breakdown(scanner, { from: q.get('from'), to: q.get('to'), project: q.get('project') }));
}
