import { NextResponse } from 'next/server';
import { ensureFresh, lifetime } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(lifetime(await ensureFresh()));
}
