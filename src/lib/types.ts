// Shapes returned by the API routes (shared between server and client).
import type { Usage } from './pricing';
import type { Bucket, CallStat, HeavyItem } from './analyze';

export type { Usage, Bucket, CallStat, HeavyItem };

export interface ModelRow extends Usage { model: string; short: string; cost: number; turns: number }

export interface DayRow { day: string; cost: number; tokens: number; turns: number; models: Record<string, number>; sessions: number }

export interface ProjectRow extends Usage {
  key: string; name: string; cwd: string; dirs: string[];
  sessions: number; turns: number; cost: number; reported: number;
  lastTs: string | null; firstTs: string | null; models: Record<string, number>; avgStartup: number;
}

export interface SessionRow {
  id: string; projectKey: string; project: string; cwd: string; title: string; agentName: string | null; archived: boolean;
  firstTs: string | null; lastTs: string | null; wallMs: number; apiMs: number;
  prompts: number; turns: number; toolCalls: number; subagents: number;
  models: string[]; usage: Usage; cost: number; estimate: number; costReported: boolean; subCost: number;
  reported: number | null; linesAdded: number | null; linesRemoved: number | null;
  version: string | null; gitBranch: string | null;
  avgCtx: number; peakCtx: number; startupTokens: number; misses: number; resets: number; crCost: number; think: number;
}

export interface Totals extends Usage {
  cost: number; estimate: number; reportedUsed: number; reported: number; reportedSessions: number; turns: number; prompts: number; toolCalls: number; apiMs: number;
  think: number; crCost: number; missCost: number; misses: number; subCost: number; sessions: number; projects: number;
}

export interface ScanStats { files: number; parsed: number; cached: number; archived: number; ms: number }

export interface Overview {
  generatedAt: string; lastScan: string | null; scanStats: ScanStats; claudeDir: string;
  range: { from: string | null; to: string | null; project: string | null };
  totals: Totals; byModel: ModelRow[]; byDay: DayRow[]; projects: ProjectRow[]; sessions: SessionRow[];
  unknownModels: string[];
}

export interface BucketRow extends Bucket { category: string }
export interface CategoryRow { category: string; calls: number; ctxTokens: number; ingestCost: number; carryCost: number; outCost: number; total: number }
export interface HeavyRow extends HeavyItem { session: string; title: string; project: string }
export interface SubRunRow { type: string; runs: number; cost: number; calls: number; tokens: number }
export interface LongSession { id: string; title: string; project: string; cost: number; crCost: number; avgCtx: number; peakCtx: number; calls: number; prompts: number; wallMs: number; resets: number }
export interface MissSession { id: string; title: string; project: string; misses: number; missCost: number; cost: number }

export interface Breakdown {
  range: { from: string | null; to: string | null; project: string | null };
  sessions: number; total: number; totalMain: number; attributed: number;
  buckets: BucketRow[]; categories: CategoryRow[]; heavy: HeavyRow[]; subRuns: SubRunRow[];
  commands: { command: string; count: number }[]; efforts: Record<string, number>;
  think: number; output: number; avgStartup: number;
  longSessions: LongSession[]; missSessions: MissSession[];
  whatIf: Record<string, { current: number; asSonnet: number | null }>;
}

export interface LifetimeModel extends Usage { model: string; short: string; cost: number }
export interface Lifetime {
  available: boolean; file: string;
  statsAvailable?: boolean; lastComputedDate?: string | null; firstDay?: string | null;
  cost?: number; estimate?: number; reportedUsed?: number;
  tx?: { cost: number; files: number; from: string | null; to: string | null };
  statsOnly?: { cost: number; raw: number; days: number; from: string | null; to: string | null; factor: number };
  sessions?: number; calls?: number;
  longestSession?: { sessionId: string; timestamp: string; duration: number; messageCount: number } | null;
  hourCounts?: Record<string, number>;
  daily?: { date: string; tokensByModel: Record<string, number>; fromStats: boolean }[];
  models?: LifetimeModel[]; cleanupPeriodDays?: number; lastCleanup?: string | null; settingsModel?: string | null; home?: string;
}

export interface SessionDetail {
  id: string; projectDir: string; projectKey: string; cwd: string; project: string; title: string; agentName: string | null;
  version: string | null; gitBranch: string | null; archived: boolean;
  firstTs: string | null; lastTs: string | null; wallMs: number; apiMs: number;
  prompts: { ts: string; text: string }[]; commands: Record<string, number>; turnCount: number; toolCalls: number; subagents: number;
  byModel: ModelRow[]; usage: Usage; cost: number; reported: number | null; think: number; efforts: Record<string, number>;
  linesAdded: number | null; linesRemoved: number | null; stopReasons: Record<string, number>;
  turns: { ts: string; model: string; input: number; output: number; cw5: number; cw1: number; cr: number; cost: number; cum: number; sub: boolean; think: number }[];
  analysis: { buckets: BucketRow[]; calls: CallStat[]; heavy: HeavyItem[]; startupTokens: number; avgCtx: number; peakCtx: number; resets: number; misses: number; missCost: number; crCost: number };
  file: string;
}
