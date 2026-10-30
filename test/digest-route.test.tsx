import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { NightDigest } from '../src/digest/types.js';

const real = {
  adapter: 'shim',
  installed: '2026-10-29T14:06:00+01:00',
  beatEverySeconds: 60,
  runsDir: 'runs',
};

function appWith(dir: string) {
  return createApp({ ...real, runsDir: dir });
}

function writeNight(dir: string, night: string, body: string) {
  writeFileSync(join(dir, `${night}.jsonl`), body);
}

describe('digest routes', () => {
  it('renders /digest/2026-10-28 and matches the JSON job order', async () => {
    const app = createApp(real);
    const page = await app.request('/digest/2026-10-28');
    const html = await page.text();
    const json = await app.request('/api/digest/2026-10-28');
    const body = (await json.json()) as NightDigest;

    expect(page.status).toBe(200);
    expect(json.status).toBe(200);
    expect(body.rows.map((row) => row.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
    let from = 0;
    for (const job of body.rows.map((row) => row.job)) {
      const at = html.indexOf(job, from);
      expect(at).toBeGreaterThanOrEqual(0);
      from = at + job.length;
    }
    expect(html).toContain('—');
    expect(html).toContain('quota exceeded');
  });

  it('returns 200 for a night in a temp runs dir', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
    writeNight(
      dir,
      '2026-02-01',
      '{"at":"2026-02-01T01:00:00+01:00","job":"lane/sync","status":"ok","owner":"rook"}\n',
    );
    const res = await appWith(dir).request('/digest/2026-02-01');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('lane/sync');
  });

  it('returns 404 when the night file is missing', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
    const app = appWith(dir);
    expect((await app.request('/digest/2026-02-02')).status).toBe(404);
    expect((await app.request('/api/digest/2026-02-02')).status).toBe(404);
  });

  it('renders nothing ran for an empty night', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
    writeNight(dir, '2026-02-03', '');
    const app = appWith(dir);
    const page = await app.request('/digest/2026-02-03');
    const json = (await (await app.request('/api/digest/2026-02-03')).json()) as NightDigest;
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('nothing ran');
    expect(json.rows).toEqual([]);
  });

  it('renders a night that contains a bad line', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
    writeNight(
      dir,
      '2026-02-04',
      [
        '{"at":"2026-02-04T01:00:00+01:00","job":"lane/sync","status":"ok","owner":"rook"}',
        '{"job":"lane/sy',
      ].join('\n'),
    );
    const app = appWith(dir);
    const page = await app.request('/digest/2026-02-04');
    const json = (await (await app.request('/api/digest/2026-02-04')).json()) as NightDigest;
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('lane/sync');
    expect(json.badLines).toBe(1);
    expect(json.rows.map((row) => row.job)).toEqual(['lane/sync']);
  });
});

describe('board links', () => {
  it('links both nights on disk to a digest that renders', async () => {
    const app = createApp(real);
    const html = await (await app.request('/')).text();
    expect(html).toContain('href="/digest/2026-10-28"');
    expect(html).toContain('10 ok / 4 retry / 1 fail');
    expect(html).toContain('href="/digest/2026-10-27"');
    expect(html).toContain('7 ok / 0 retry / 0 fail');
    expect((await app.request('/digest/2026-10-28')).status).toBe(200);
    expect((await app.request('/digest/2026-10-27')).status).toBe(200);
  });
});
