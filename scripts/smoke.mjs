#!/usr/bin/env node
// npm test: a fresh database in a temp folder, migrate twice, seed twice, then every
// command with assertions on what it returns. PASS or a failing assertion.
// Set TEST_DATABASE_URL to an empty Postgres database to run the same checks there.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { getDb, REPO_ROOT } from './lib/db.mjs';
import { sptN, parseAgs, writeAgs, isoDate } from './geotech.mjs';

const dir = mkdtempSync(path.join(tmpdir(), 'geotech-smoke-'));
process.env.DATA_DIR = path.join(dir, 'db');
process.env.OUTPUT_DIR = dir;
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || '';
const env = { ...process.env };
const covered = new Set();
let checks = 0;

function run(script, args = [], ok = true) {
  const r = spawnSync(process.execPath, [path.join(REPO_ROOT, 'scripts', script), ...args], { cwd: REPO_ROOT, env, encoding: 'utf8' });
  assert.equal(r.status, ok ? 0 : 1, `${script} ${args.join(' ')}\n${r.stdout}\n${r.stderr}`);
  checks++;
  return r;
}
function cli(cmd, args = [], ok = true) {
  covered.add(cmd);
  const r = run('geotech.mjs', [cmd, ...args, ...(cmd === 'help' ? [] : ['--json'])], ok);
  return ok && cmd !== 'help' ? JSON.parse(r.stdout) : r;
}
const refuse = (cmd, args, pattern) => {
  const r = cli(cmd, args, false);
  assert.match(r.stderr, pattern, `${cmd} should refuse: ${r.stderr}`);
};
async function query(sql, params = []) {
  const db = await getDb();
  try { return await db.query(sql, params); } finally { await db.close(); }
}
const actor = '--actor=Tester';
const rules = () => cli('compliance');
const has = (rule, subject) => rules().some((c) => c.rule === rule && (!subject || c.subject === subject));
const fixture = (...p) => path.join(REPO_ROOT, 'fixtures', ...p);

try {
  assert.equal((await query("select tablename from pg_tables where schemaname = 'public'")).length, 0, 'TEST_DATABASE_URL must point at an empty database');
  run('migrate.mjs'); run('migrate.mjs');
  const seedArgs = process.env.TEST_DATABASE_URL ? ['--demo-database'] : [];
  run('seed.mjs', seedArgs); run('seed.mjs', seedArgs);
  assert.equal((await query('select count(*)::int as n from locations'))[0].n, 10, 'seed runs once');
  assert.equal((await query('select count(*)::int as n from strata'))[0].n, 24, 'seed runs once');

  // The rules on their own.
  assert.deepEqual(sptN(3, 5, 6), { n: 11, refusal: false });
  assert.deepEqual(sptN(25, 50, null), { n: null, refusal: true });
  assert.deepEqual(sptN(4, 7, null), { n: null, refusal: false });
  const ags = parseAgs(writeAgs([{ name: 'LOCA', headings: ['LOCA_ID', 'LOCA_PURP'], rows: [{ LOCA_ID: 'BH1', LOCA_PURP: 'Say "hi", twice' }] }]));
  assert.equal(ags.LOCA.rows[0].LOCA_PURP, 'Say "hi", twice', 'AGS quoting round-trips');
  assert.throws(() => parseAgs('"GROUP","LOCA"\n"HEADING","LOCA_ID"\nDATA,BH1'), /double quotes/);
  assert.equal(isoDate('09/03/2025'), '2025-03-09');

  // Reads on the demo.
  assert.match(cli('help').stdout, /import gint/);
  assert.equal(cli('projects').find((p) => p.code === 'HS3').locations, 4);
  assert.equal(cli('clients').length, 3);
  assert.equal(cli('labs').find((l) => l.code === 'RVT').accreditation, '');
  assert.equal(cli('locations').length, 10);
  assert.equal(cli('methods').find((m) => m.country === 'AU' && m.test === 'MC').method, 'AS 1289.2.1.1');
  assert.equal(cli('settings').find((s) => s.key === 'log_check_days').value, '7');
  const expected = ['COORDS', 'FD_ROCK', 'FD_SOIL', 'GROUNDWATER', 'LAB_ACCREDITED', 'LAB_LATE', 'LAB_METHOD', 'LAB_RECEIPT', 'LOG_CHECK', 'LOG_CONTINUOUS', 'NZGD', 'PIEZO_DUE', 'REPORT_REVIEW', 'SERVICES', 'SPT_N', 'TUBE_SCHEDULE', 'VANE'];
  assert.deepEqual([...new Set(rules().map((r) => r.rule))].sort(), expected, 'every rule fires on the demo');
  assert.equal(rules().length, 20);
  assert.ok(has('SPT_N', 'BH02') && has('LOG_CONTINUOUS', 'HA02') && has('SERVICES', 'BH01') && has('NZGD', 'CPT02'));

  refuse('location', ['--location=BH02'], /More than one location matches "BH02": HV26\/BH02; LR\/BH02/);
  refuse('location', ['--location=ZZ99'], /No location matches/);
  const bh02 = cli('location', ['--location=HV26/BH02']);
  assert.equal(bh02.strata.length, 4);
  assert.equal(bh02.spt.find((s) => s.depth_m == 6).calculated_n, 15);
  assert.ok(bh02.issues.some((i) => i.rule === 'TUBE_SCHEDULE'));
  assert.equal(cli('location', ['--location=hv26 bh03']).location[0].status, 'in progress', 'space and case work');
  assert.equal(cli('log', ['--location=HS3/HA02']).gaps[0].kind, 'gap');
  const insitu = cli('insitu', ['--project=HS3']);
  assert.equal(Number(insitu.vane.find((v) => v.depth_m == 2.1).sensitivity), 9);
  assert.equal(cli('insitu', ['--location=HV26/BH01']).spt.find((s) => s.depth_m == 9).check_result, 'refusal at 210 mm');
  assert.equal(Number(cli('lab-results', ['--project=LR']).find((r) => r.sample === 'D1').pi), 34);
  assert.equal(Number(cli('lab-results', ['--location=HV26/BH01']).find((r) => r.sample === 'U1').ll), 72);
  assert.equal(cli('schedules').length, 3);
  assert.equal(cli('schedule', ['--schedule=LS-HV26-01']).tests.length, 5);
  assert.ok(cli('pending').some((p) => p.schedule === '(not scheduled) BH02 U1'));
  assert.equal(cli('monitoring')[0].state, 'overdue');
  assert.equal(cli('reports').length, 2);
  assert.equal(cli('nzgd').find((n) => n.location === 'CPT02').state, 'overdue');
  assert.equal(cli('activity').length, 0, 'the seed writes no audit rows');

  const att = cli('attention');
  assert.equal(att['rule checks'].length, 20);
  assert.equal(att['in the field now'][0].location, 'BH03');
  assert.equal(Number(att['sensitive soils'][0].sensitivity), 9);
  assert.equal(att['reports not issued'][0].project, 'LR');
  const wr = cli('weekly-review');
  assert.ok(wr['rule checks by rule'].find((r) => r.rule === 'LOG_CHECK').open === 3);
  assert.ok(wr['logs to check'].some((l) => l.location === 'BH02'));

  // Drafts and documents land in files, never sent.
  const ft = cli('factual-tables', ['--project=HV26']);
  assert.ok(existsSync(ft.draft[0].file));
  assert.match(readFileSync(ft.draft[0].file, 'utf8'), /Coordinates in NZTM2000, levels in NZVD2016/);
  assert.equal(ft['location schedule'].length, 3);
  const chase = cli('draft-lab-chase', ['--schedule=LS-HV26-01']).draft[0];
  assert.equal(chase.tests_waiting, 2);
  assert.match(readFileSync(chase.file, 'utf8'), /OSL-26-0811/);
  assert.match(readFileSync(cli('draft-lab-chase', ['--schedule=LS-HS3-01']).draft[0].file, 'utf8'), /no receipt/);
  assert.match(readFileSync(cli('draft-client-update', ['--project=HS3']).draft[0].file, 'utf8'), /Hi Lisa/);

  // Field work, in the order a job runs.
  cli('add-client', ['--name=Harbourside Council', '--contact=Ana Smith', actor]);
  cli('add-project', ['--code=wb1', '--name=Wharf Bridge Renewal', '--client=Harbourside', '--country=AU', '--lead=Tom Walsh', actor]);
  assert.equal(cli('projects').find((p) => p.code === 'WB1').coord_system, 'MGA2020');
  assert.match(cli('add-lab', ['--name=Quick Lab', '--code=QL', actor]).warning, /accreditation/);
  cli('plan-location', ['--project=WB1', '--name=bh1', '--type=BH', '--depth=8', '--easting=505000', '--northing=6958000', actor]);
  const preview = cli('start-location', ['--location=WB1/BH1', actor, '--dry-run']);
  assert.match(preview.preview, /Nothing was changed/);
  assert.equal(cli('location', ['--location=WB1/BH1']).location[0].status, 'planned', 'dry run changes nothing');
  assert.match(cli('start-location', ['--location=WB1/BH1', '--on=2026-01-12', '--logged-by=Jess Nguyen', actor]).warning, /No services check/);
  assert.ok(has('SERVICES', 'BH1'));
  cli('services-checked', ['--location=WB1/BH1', '--on=2026-01-10', actor]);
  assert.ok(!has('SERVICES', 'BH1'));
  refuse('start-location', ['--location=WB1/BH1', actor], /is in progress, not planned/);
  cli('log-stratum', ['--location=WB1/BH1', '--from=0', '--to=1.2', '--material=fill', '--legend=fill', '--description=FILL: gravel', '--strength=loose', '--moisture=moist', actor]);
  assert.match(cli('log-stratum', ['--location=WB1/BH1', '--from=1.2', '--to=4', '--description=CLAY, grey', '--strength=stiff', actor]).warning, /moisture/);
  refuse('log-stratum', ['--location=WB1/BH1', '--from=3', '--to=5', '--description=overlap', actor], /cannot overlap/);
  refuse('log-stratum', ['--location=WB1/BH1', '--from=5', '--to=4', '--description=x', actor], /deeper/);
  cli('log-stratum', ['--location=WB1/BH1', '--from=4', '--to=8', '--material=rock', '--description=SANDSTONE', '--strength=weak', '--weathering=highly weathered', actor]);
  assert.equal(cli('add-spt', ['--location=WB1/BH1', '--depth=1.5', '--blows=2,3,4', actor]).n_value, 7);
  assert.match(cli('add-spt', ['--location=WB1/BH1', '--depth=3', '--blows=3,5,6', '--n=12', actor]).warning, /blows give N=11/);
  assert.ok(has('SPT_N', 'BH1'));
  const ref = cli('add-spt', ['--location=WB1/BH1', '--depth=6', '--blows=20,50', actor]);
  assert.equal(ref.refusal, true);
  assert.equal(ref.n_value, null);
  assert.equal(cli('add-vane', ['--location=WB1/BH1', '--depth=2', '--peak=60', '--remoulded=20', actor]).sensitivity, 3);
  cli('add-sample', ['--location=WB1/BH1', '--ref=u1', '--type=U', '--from=2', '--to=2.45', '--on=2026-01-12', actor]);
  cli('add-sample', ['--location=WB1/BH1', '--ref=D1', '--type=D', '--from=3', '--to=3.45', '--on=2026-01-12', actor]);
  refuse('complete-location', ['--location=WB1/BH1', '--depth=5', actor], /go to 8 m/);
  const done = cli('complete-location', ['--location=WB1/BH1', '--depth=8', '--on=2026-01-13', actor]);
  assert.equal(done.status, 'complete');
  assert.ok(done.open_checks.some((i) => i.rule === 'GROUNDWATER'));
  cli('record-water', ['--location=WB1/BH1', '--kind=not encountered', '--on=2026-01-13', actor]);
  refuse('record-water', ['--location=WB1/BH1', '--kind=strike', actor], /depth/);
  assert.ok(!has('GROUNDWATER', 'BH1'));
  cli('set-coords', ['--location=WB1/BH1', '--easting=505001.2', '--northing=6958003.4', '--level=4.21', '--method=RTK GPS', actor]);
  refuse('set-coords', ['--location=WB1/BH1', '--easting=1', '--northing=1', '--method=planned', actor], /Invalid method/);
  refuse('check-log', ['--location=WB1/BH1', '--by=Jess Nguyen', actor], /second person/);
  refuse('check-log', ['--location=WB1/BH1', '--by=Tom Walsh', actor], /Fix these before signing off.*FD_SOIL.*SPT_N/);
  cli('install', ['--location=WB1/BH1', '--top=2', '--base=6', '--on=2026-01-13', '--every=7', actor]);
  const reading = cli('read-piezo', ['--location=WB1/BH1', '--depth=2.8', '--on=2026-01-20', actor]);
  assert.equal(reading.next_due_on, '2026-01-27');

  cli('plan-location', ['--project=WB1', '--name=TP1', '--type=TP', '--depth=3', actor]);
  cli('services-checked', ['--location=WB1/TP1', '--on=2026-01-12', actor]);
  cli('start-location', ['--location=WB1/TP1', '--on=2026-01-12', actor]);
  cli('log-stratum', ['--location=WB1/TP1', '--from=0', '--to=0.9', '--material=fill', '--description=FILL', '--strength=loose', '--moisture=wet', actor]);
  assert.equal(cli('abandon-location', ['--location=WB1/TP1', '--depth=0.9', '--on=2026-01-12', '--termination=Side wall collapse', actor]).status, 'abandoned');
  refuse('abandon-location', ['--location=WB1/TP1', '--depth=1', actor], /already abandoned/);

  // The lab.
  const sch = cli('schedule-tests', ['--lab=QL', '--samples=WB1/BH1/U1,WB1/BH1/D1', '--tests=MC,ATT', '--on=2026-01-14', actor]);
  assert.equal(sch.schedule[0].name, 'LS-WB1-01');
  assert.equal(sch.tests.find((t) => t.test === 'MC').method, 'AS 1289.2.1.1', 'the country default method is filled in');
  refuse('schedule-tests', ['--lab=QL', '--samples=WB1/BH1/U1', '--tests=MC', actor], /already has MC/);
  refuse('schedule-tests', ['--lab=QL', '--samples=WB1/BH1/U1,HV26/BH02/U1', '--tests=UU', actor], /One schedule covers one project/);
  assert.equal(cli('receive', ['--schedule=LS-WB1-01', '--on=2026-01-15', '--job=QL-1', actor]).results_due, '2026-01-30');
  const csv = path.join(dir, 'wb1.csv');
  writeFileSync(csv, 'Location,Sample,Test,Parameter,Value,Units\nWB1/BH1,U1,MC,MC,31.5,%\nWB1/BH1,U1,ATT,LL,61,%\nWB1/BH1,U1,ATT,PL,27,%\nWB1/BH1,U1,ATT,PI,34,%\nWB1/BH1,D1,MC,MC,22,%\nWB1/BH1,D1,ATT,LL,45,%\n');
  const loaded = cli('load-results', [`--file=${csv}`, '--schedule=LS-WB1-01', '--on=2026-01-28', actor]);
  assert.equal(loaded.results_added, 6);
  assert.equal(loaded.tests_reported, 4);
  assert.equal(loaded['LS-WB1-01 tests still waiting'], 0);
  assert.equal(cli('schedules').find((s) => s.schedule === 'LS-WB1-01').stage, 'results in');
  assert.equal(Number(cli('lab-results', ['--location=WB1/BH1']).find((r) => r.sample === 'U1').pi), 34);
  writeFileSync(csv, 'Location,Sample,Test,Parameter,Value\nWB1/BH1,U1,MC,LL,10\n');
  refuse('load-results', [`--file=${csv}`, actor], /MC reports MC, not LL/);
  writeFileSync(csv, 'Location,Sample,Test,Parameter,Value\nWB1/BH1,U1,UU,CU,10\n');
  refuse('load-results', [`--file=${csv}`, actor], /never scheduled/);
  const hv = cli('load-results', [`--file=${fixture('lab-results-ls-hv26-01.csv')}`, '--schedule=LS-HV26-01', actor]);
  assert.equal(hv.results_added, 3);
  assert.ok(!has('LAB_LATE', 'LS-HV26-01'), 'a late schedule clears when its results arrive');
  cli('set-method', ['--country=NZ', '--test=PSD', '--method=NZS 4402:1986 Test 2.8.1', actor]);

  // Clearing the demo's checks.
  cli('services-checked', ['--location=LR/BH01', '--on=2026-10-01', actor]);
  assert.ok(!has('SERVICES', 'BH01'));
  cli('upload-nzgd', ['--location=HS3/CPT02', '--id=CPT_230001', actor]);
  assert.ok(!has('NZGD', 'CPT02'));
  refuse('issue-report', ['--report=LR Geotechnical', '--reviewer=Tom Walsh', actor], /Someone else reviews it/);
  assert.equal(cli('issue-report', ['--report=LR Geotechnical', actor]).status, 'issued');
  refuse('issue-report', ['--report=Wharf', actor], /No report matches/);
  cli('add-report', ['--project=WB1', '--name=WB1 Factual Report', '--author=Tom Walsh', actor]);
  refuse('issue-report', ['--report=WB1 Factual', actor], /no reviewer/);
  refuse('set', ['--key=nope', '--value=1', actor], /No setting/);
  cli('set', ['--key=nzgd_upload_days', '--value=60', actor]);
  assert.equal(cli('nzgd').find((n) => n.location === 'HA01').state.startsWith('due'), true);
  cli('receive', ['--schedule=LS-HS3-01', actor]);
  assert.ok(!has('LAB_RECEIPT', 'LS-HS3-01'));

  // gINT import (AGS4), twice.
  const imp = cli('import', ['gint', `--file=${fixture('gint', 'hv26-stage2.ags')}`, '--project=HV26', actor]);
  assert.equal(imp.locations_added, 3);
  assert.equal(imp.strata_added, 6);
  assert.equal(imp.spt_added, 3);
  assert.equal(imp.samples_added, 3);
  assert.equal(imp.results_added, 4);
  const again = cli('import', ['gint', `--file=${fixture('gint', 'hv26-stage2.ags')}`, '--project=HV26', actor]);
  assert.equal(again.locations_on_file, 3);
  assert.equal(again.strata_added + again.spt_added + again.samples_added + again.results_added, 0, 'a second import adds nothing');
  const bh04 = cli('location', ['--location=HV26/BH04']);
  assert.equal(bh04.spt.find((s) => s.depth_m == 4.5).calculated_n, 19, 'AGS 75 mm increments pair into 150 mm');
  assert.equal(bh04.spt.find((s) => s.depth_m == 7.5).check_result, 'refusal at 90 mm');
  assert.equal(bh04.strata.find((s) => s.from_m == 6.8).material, 'rock');
  assert.equal(bh04.strata.find((s) => s.from_m == 6.8).weathering, 'moderately weathered');
  assert.equal(bh04.position[0].method, 'RTK GPS');
  assert.equal(cli('location', ['--location=HV26/CPT03']).location[0].type, 'CPT');
  assert.ok(has('FD_SOIL', 'TP02'), 'a description without moisture is flagged after import');
  refuse('import', ['gint', `--file=${fixture('lab-results-ls-hv26-01.csv')}`, '--project=HV26', actor], /double quotes|No LOCA/);

  // AGS out for the NZGD, and back in to a fresh project.
  const agsOut = cli('export-ags', ['--project=HS3', `--out=${path.join(dir, 'hs3.ags')}`])[0];
  assert.equal(agsOut.LOCA, 4);
  assert.equal(agsOut.IVAN, 5);
  cli('add-project', ['--code=RT', '--name=Round Trip', actor]);
  const rt = cli('import', ['gint', `--file=${agsOut.file}`, '--project=RT', actor]);
  assert.equal(rt.locations_added, 4);
  assert.equal(rt.vanes_added, 5);

  // Export everything.
  const ex = cli('export', [`--out=${path.join(dir, 'all.json')}`])[0];
  assert.ok(ex.locations >= 18 && ex.events > 50);
  assert.equal(JSON.parse(readFileSync(ex.file, 'utf8')).tables.projects.length, 5);

  // The audit trail is append-only.
  assert.ok(cli('activity').some((a) => a.action === 'import-gint'));
  await assert.rejects(query('delete from events'), /append-only/);

  // Unknown flags and commands are refused.
  refuse('locations', ['--nope=1'], /Unknown flag/);
  const unknown = run('geotech.mjs', ['frobnicate'], false);
  assert.match(unknown.stderr, /Unknown command/);
  refuse('import', ['mx', `--file=x`, actor], /Usage: import gint/);

  // Every command in the CLI is exercised.
  const { reads } = await import('./geotech.mjs');
  const helpText = cli('help').stdout;
  const all = [...helpText.matchAll(/^  ([a-z-]+)/gm)].map((m) => m[1]);
  const missed = all.filter((c) => !covered.has(c));
  assert.deepEqual(missed, [], `commands not exercised: ${missed.join(', ')}`);
  assert.ok(Object.keys(reads).every((k) => covered.has(k)));

  // Every slash command points at a real CLI command, and every view and document renders.
  const cmdDir = path.join(REPO_ROOT, '.claude', 'commands');
  for (const f of readdirSync(cmdDir).filter((f) => f.endsWith('.md') && f !== 'README.md')) {
    const body = readFileSync(path.join(cmdDir, f), 'utf8');
    for (const m of body.matchAll(/npm run geo -- ([a-z-]+)/g)) assert.ok(all.includes(m[1]), `${f} calls unknown command ${m[1]}`);
  }
  const views = run('view.mjs');
  assert.match(views.stdout, /3 view\(s\)|view/);
  const docs = run('docs.mjs');
  const n = Number(docs.stdout.match(/(\d+) document\(s\) rendered/)[1]);
  assert.ok(n >= 10, `documents rendered: ${n}`);
  const logs = readdirSync(path.join(dir, 'docs-out', 'borehole-log'));
  assert.ok(logs.some((f) => f.startsWith('hv26-bh01')));
  const html = readFileSync(path.join(dir, 'docs-out', 'borehole-log', logs.find((f) => f.startsWith('hv26-bh01'))), 'utf8');
  assert.match(html, /East Coast Bays Formation/);

  console.log(`PASS: ${checks} command runs, ${covered.size} commands covered, every rule fired on the demo`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
