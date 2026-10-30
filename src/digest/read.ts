import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, NightDigest, RunStatus } from './types.js';

const NIGHT = /^\d{4}-\d{2}-\d{2}$/;

type Parsed = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error: string | null;
  index: number;
};

function parseLine(line: string, index: number): Parsed | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (typeof row.at !== 'string' || typeof row.job !== 'string' || row.job === '') return null;
  if (row.status !== 'ok' && row.status !== 'retry' && row.status !== 'fail') return null;
  if (row.owner !== undefined && row.owner !== null && typeof row.owner !== 'string') return null;
  if (row.error !== undefined && row.error !== null && typeof row.error !== 'string') return null;
  return {
    at: row.at,
    job: row.job,
    status: row.status,
    owner: typeof row.owner === 'string' ? row.owner : null,
    error: typeof row.error === 'string' ? row.error : null,
    index,
  };
}

function timeValue(at: string): number {
  const value = Date.parse(at);
  return Number.isNaN(value) ? Number.POSITIVE_INFINITY : value;
}

function latest(events: Parsed[]): Parsed {
  return events.reduce((best, event) => {
    const byTime = timeValue(event.at) - timeValue(best.at);
    if (byTime !== 0) return byTime > 0 ? event : best;
    return event.index > best.index ? event : best;
  });
}

function earliest(events: Parsed[]): Parsed {
  return events.reduce((best, event) => {
    const byTime = timeValue(event.at) - timeValue(best.at);
    if (byTime !== 0) return byTime < 0 ? event : best;
    return event.index < best.index ? event : best;
  });
}

function toRow(events: Parsed[]): DigestRow {
  const last = latest(events);
  const first = earliest(events);
  return {
    job: last.job,
    owner: last.owner,
    runs: events.length,
    retries: events.filter((event) => event.status === 'retry').length,
    lastStatus: last.status,
    lastError: last.error,
    firstAt: first.at,
    lastAt: last.at,
  };
}

export function readNight(runsDir: string, night: string): NightDigest | null {
  if (!NIGHT.test(night)) return null;
  const path = join(runsDir, `${night}.jsonl`);
  if (!existsSync(path)) return null;

  const text = readFileSync(path, 'utf8');
  const byJob = new Map<string, Parsed[]>();
  let badLines = 0;

  text.split('\n').forEach((line, index) => {
    if (line.trim() === '') return;
    const parsed = parseLine(line, index);
    if (!parsed) {
      badLines += 1;
      return;
    }
    const group = byJob.get(parsed.job);
    if (group) group.push(parsed);
    else byJob.set(parsed.job, [parsed]);
  });

  const rows = [...byJob.values()]
    .map(toRow)
    .sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));

  return { rows, badLines };
}
