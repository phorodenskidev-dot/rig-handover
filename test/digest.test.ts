import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/types.js';

describe('readNight', () => {
  it('reads runs/2026-10-28.jsonl into 5 jobs and 1 bad line', () => {
    const night = readNight('runs', '2026-10-28');
    expect(night).not.toBeNull();
    expect(night?.badLines).toBe(1);
    expect(night?.rows.map((row) => row.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);

    expect(night?.rows.find((row) => row.job === 'digest/render')).toMatchObject({
      owner: null,
      runs: 1,
      retries: 0,
      lastStatus: 'ok',
      lastError: null,
      firstAt: '2026-10-29T05:41:09+01:00',
      lastAt: '2026-10-29T05:41:09+01:00',
    });
    expect(night?.rows.find((row) => row.job === 'fixtures/refresh')).toMatchObject({
      owner: 'rook',
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
      lastError: null,
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });
    expect(night?.rows.find((row) => row.job === 'lane/sync')).toMatchObject({
      owner: 'rook',
      runs: 8,
      retries: 1,
      lastStatus: 'ok',
      lastError: null,
      firstAt: '2026-10-28T23:00:06+01:00',
      lastAt: '2026-10-29T05:00:04+01:00',
    });
    expect(night?.rows.find((row) => row.job === 'notes/backup')).toMatchObject({
      owner: 'lane-07',
      runs: 1,
      retries: 0,
      lastStatus: 'fail',
      lastError: 'quota exceeded',
      firstAt: '2026-10-29T04:00:01+01:00',
      lastAt: '2026-10-29T04:00:01+01:00',
    });
    expect(night?.counts).toEqual({ ok: 10, retry: 4, fail: 1 });

    expect(night?.rows.find((row) => row.job === 'rig/rotate-logs')).toMatchObject({
      owner: 'lane-07',
      runs: 1,
      retries: 0,
      lastStatus: 'ok',
      lastError: null,
      firstAt: '2026-10-28T23:00:02+01:00',
      lastAt: '2026-10-28T23:00:02+01:00',
    });
  });

  it('returns null when the night file is missing', () => {
    expect(readNight('runs', '1999-01-01')).toBeNull();
  });

  it('renders an empty file as no rows', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
    writeFileSync(join(dir, '2026-01-01.jsonl'), '');
    expect(readNight(dir, '2026-01-01')).toEqual({
      rows: [],
      badLines: 0,
      counts: { ok: 0, retry: 0, fail: 0 },
    });
  });

  it('counts a bad line and still returns the good jobs', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
    writeFileSync(
      join(dir, '2026-01-02.jsonl'),
      [
        '{"at":"2026-01-02T01:00:00+01:00","job":"lane/sync","status":"ok","owner":"rook"}',
        '{"at":"2026-01-02T01:00:01+01:00","job":"lane/sy',
        '',
      ].join('\n'),
    );
    const night = readNight(dir, '2026-01-02');
    expect(night?.badLines).toBe(1);
    expect(night?.rows).toHaveLength(1);
    expect(night?.rows[0]?.job).toBe('lane/sync');
  });
});
