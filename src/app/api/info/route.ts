import fs from 'node:fs';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { CLAUDE_DIR, CLAUDE_HOME, ensureFresh } from '@/lib/store';
import { PRICES } from '@/lib/pricing';

export const dynamic = 'force-dynamic';

export async function GET() {
  const s = await ensureFresh();
  const cacheFile = path.join(process.cwd(), 'cache', 'files.json');
  let cacheSize = 0;
  try { cacheSize = fs.statSync(cacheFile).size; } catch { /* not written yet */ }
  return NextResponse.json({
    claudeHome: CLAUDE_HOME,
    claudeDir: CLAUDE_DIR,
    claudeDirExists: fs.existsSync(CLAUDE_DIR),
    cacheFile,
    cacheSize,
    lastScan: s.lastScan,
    stats: s.stats,
    sessions: s.sessions.length,
    rescanSeconds: Number(process.env.RESCAN_SECONDS || 30),
    node: process.version,
    pricing: PRICES,
  });
}
