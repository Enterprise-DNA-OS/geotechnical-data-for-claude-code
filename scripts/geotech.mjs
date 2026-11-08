#!/usr/bin/env node
// The one CLI for geotechnical site investigation data. Human tables by default, --json for machines.
//   npm run geo -- help
//   npm run geo -- attention
//   npm run geo -- location --location=HV26/BH02
//   npm run geo -- add-spt --location=HV26/BH03 --depth=6 --blows=4,6,7 --actor=Ana
// Every change takes --actor and can be previewed with --dry-run.
// A location is named PROJECT/NAME (HV26/BH01), or just NAME when only one project has it.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { getDb, REPO_ROOT } from './lib/db.mjs';
import { parseCsv, pick } from './lib/csv.mjs';
import { table as textTable } from './lib/format.mjs';

// ---------------------------------------------------------------- reads

export const reads = {
  projects: `select p.code, p.name, coalesce(c.name, '') as client, p.country, p.coord_system, p.lead_engineer, p.nzgd_required, p.status,
               (select count(*) from locations l where l.project_id = p.id)::int as locations,
               (select count(*) from locations l where l.project_id = p.id and l.status in ('complete', 'abandoned'))::int as finished
             from projects p left join clients c on c.id = p.client_id order by p.code`,
  clients: `select c.name, c.contact, c.email, (select count(*) from projects p where p.client_id = c.id)::int as projects from clients c order by c.name`,
  labs: `select l.name, l.code, l.accreditation, l.email, (select count(*) from schedules s where s.lab_id = l.id)::int as schedules from labs l order by l.name`,
  locations: `select project, location, type, status, final_depth, metres_logged, spts, vanes, samples, tests_pending, water_records,
                coord_method as coords, coalesce(checked_by, '') as checked_by, nzgd, coalesce(completed_on::text, '') as completed_on
              from location_status order by project, location`,
  schedules: `select schedule, project, lab, sent_on, coalesce(received_on::text, '') as received_on, coalesce(due_on::text, '') as due_on,
                coalesce(results_on::text, '') as results_on, lab_job, tests, reported, stage, days_in_stage
              from schedule_status order by sent_on desc`,
  pending: `select ss.schedule, ss.project, ss.lab, ss.stage, ss.days_in_stage, coalesce(ss.due_on::text, '') as due_on, ss.tests - ss.reported as tests_waiting
            from schedule_status ss where ss.stage <> 'results in'
            union all
            select '(not scheduled) ' || l.name || ' ' || s.ref, p.code, '', 'held', current_date - s.taken_on, '', 0
            from samples s join locations l on l.id = s.location_id join projects p on p.id = l.project_id
            where s.sample_type = 'U' and s.status = 'held' and not exists (select 1 from lab_tests t where t.sample_id = s.id and t.status <> 'cancelled')
            order by 5 desc nulls last, 1`,
  monitoring: `select location, project, kind, screen_top, screen_base, installed_on, read_every_days, coalesce(last_read_on::text, 'never') as last_read_on,
                 last_depth_m, next_due_on, case when next_due_on < current_date then 'overdue' when next_due_on <= current_date + 7 then 'this week' else 'ok' end as state
               from monitoring_status order by next_due_on`,
  reports: `select r.name, p.code as project, r.kind, r.revision, r.author, coalesce(r.reviewer, '') as reviewer, r.status, coalesce(r.issued_on::text, '') as issued_on
            from reports r join projects p on p.id = r.project_id order by r.status, r.name`,
  nzgd: `select p.code as project, l.name as location, l.loc_type as type, l.status, coalesce(l.completed_on::text, '') as completed_on,
           coalesce(l.nzgd_id, '') as nzgd_id, coalesce(l.nzgd_uploaded_on::text, '') as uploaded_on,
           case when l.nzgd_uploaded_on is not null then 'uploaded'
                when l.status not in ('complete', 'abandoned') then 'not finished'
                when current_date - l.completed_on > setting_num('nzgd_upload_days') then 'overdue'
                else 'due ' || (l.completed_on + setting_num('nzgd_upload_days')::int)::text end as state
         from locations l join projects p on p.id = l.project_id where p.nzgd_required order by p.code, l.name`,
  methods: `select country, test, name, method from test_methods order by country, test`,
  compliance: `select rule, project, subject, issue from compliance_issues order by rule, project, subject`,
  settings: `select key, value, note from settings order by key`,
  activity: `select to_char(created_at, 'YYYY-MM-DD HH24:MI') as at, actor, action, substr(record_id::text, 1, 8) as record from events order by created_at, id`,
};

const MUTATIONS = {
  'add-client': ['name', 'contact', 'email'],
  'add-project': ['code', 'name', 'client', 'site', 'country', 'coords', 'height-datum', 'lead', 'nzgd'],
  'add-lab': ['name', 'code', 'accreditation', 'email'],
  'plan-location': ['project', 'name', 'type', 'depth', 'purpose', 'method', 'contractor', 'easting', 'northing'],
  'services-checked': ['location', 'on'],
  'start-location': ['location', 'on', 'contractor', 'method', 'logged-by'],
  'complete-location': ['location', 'depth', 'on', 'termination'],
  'abandon-location': ['location', 'depth', 'on', 'termination'],
  'set-coords': ['location', 'easting', 'northing', 'level', 'method'],
  'log-stratum': ['location', 'from', 'to', 'material', 'legend', 'description', 'strength', 'moisture', 'plasticity', 'weathering', 'unit', 'by'],
  'add-spt': ['location', 'depth', 'blows', 'n', 'penetration', 'refusal', 'note'],
  'add-vane': ['location', 'depth', 'peak', 'remoulded', 'vane'],
  'add-sample': ['location', 'ref', 'type', 'from', 'to', 'on'],
  'record-water': ['location', 'kind', 'depth', 'on', 'by', 'note'],
  install: ['location', 'kind', 'top', 'base', 'on', 'every'],
  'read-piezo': ['location', 'depth', 'on', 'by'],
  'check-log': ['location', 'by', 'on'],
  'schedule-tests': ['name', 'lab', 'samples', 'tests', 'on', 'due'],
  receive: ['schedule', 'on', 'job'],
  'load-results': ['file', 'schedule', 'on'],
  'add-report': ['project', 'name', 'kind', 'author', 'reviewer', 'revision'],
  'issue-report': ['report', 'reviewer', 'on', 'revision'],
  'upload-nzgd': ['location', 'id', 'on'],
  'set-method': ['country', 'test', 'method'],
  set: ['key', 'value'],
  import: ['file', 'project'],
};
const OTHER = {
  location: ['location'],
  log: ['location'],
  insitu: ['location', 'project'],
  'lab-results': ['project', 'location'],
  schedule: ['schedule'],
  attention: [],
  'weekly-review': [],
  'factual-tables': ['project'],
  'draft-lab-chase': ['schedule'],
  'draft-client-update': ['project'],
  export: ['out'],
  'export-ags': ['project', 'out'],
  help: [],
};
const FLAGS = { ...Object.fromEntries(Object.keys(reads).map((k) => [k, []])), ...OTHER, ...MUTATIONS };
const BOOLEAN = new Set(['json', 'dry-run', 'refusal']);

// ---------------------------------------------------------------- argument parsing

function parseArgs(argv) {
  const cmd = argv[0] || 'help';
  if (!FLAGS[cmd]) throw new Error(`Unknown command "${cmd}". Run: npm run geo -- help`);
  const opts = {};
  const positional = [];
  for (const arg of argv.slice(1)) {
    if (!arg.startsWith('--')) { positional.push(arg); continue; }
    const at = arg.indexOf('=');
    const key = arg.slice(2, at < 0 ? undefined : at);
    const value = at < 0 ? true : arg.slice(at + 1);
    const allowed = [...FLAGS[cmd], 'json', ...(MUTATIONS[cmd] ? ['actor', 'dry-run'] : [])];
    if (!allowed.includes(key)) throw new Error(`Unknown flag --${key} for ${cmd}`);
    if (Object.hasOwn(opts, key)) throw new Error(`Repeated flag --${key}`);
    if (BOOLEAN.has(key) ? value !== true : value === true || value === '') throw new Error(`Invalid value for --${key}`);
    opts[key] = value;
  }
  if (cmd === 'import' ? positional.join(' ') !== 'gint' : positional.length) {
    throw new Error(cmd === 'import' ? 'Usage: import gint --file=<export.ags> --project=CODE --actor=NAME' : `Unexpected argument: ${positional[0]}`);
  }
  return { cmd, opts };
}

function help() {
  const line = (c) => `  ${c}${c === 'import' ? ' gint' : ''} ${FLAGS[c].map((f) => (BOOLEAN.has(f) ? `[--${f}]` : `--${f}=…`)).join(' ')}${MUTATIONS[c] ? ' --actor=NAME [--dry-run]' : ''} [--json]`;
  return ['Reads:', ...Object.keys(reads).map(line), ...Object.keys(OTHER).map(line), '', 'Changes:', ...Object.keys(MUTATIONS).map(line),
    '', 'A location is PROJECT/NAME (HV26/BH01), or NAME alone when only one project has it.'].join('\n');
}

// ---------------------------------------------------------------- value checks

// YYYY-MM-DD, or DD/MM/YYYY as New Zealand and Australian exports write it.
export const isoDate = (v, what = 'date') => {
  let s = String(v).trim();
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (dmy) s = `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  s = s.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(`${s}T00:00:00Z`)) || new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) !== s) throw new Error(`Invalid ${what}: ${v} (use YYYY-MM-DD)`);
  return s;
};
const num = (v, what, { min = -Infinity, max = Infinity } = {}) => {
  const s = String(v).trim();
  if (!/^-?\d+(\.\d+)?$/.test(s) || Number(s) < min || Number(s) > max) throw new Error(`Invalid ${what}: ${v}`);
  return Number(s);
};
const int = (v, what) => {
  if (!/^\d+$/.test(String(v).trim())) throw new Error(`Invalid ${what}: ${v}`);
  return Number(v);
};
const oneOf = (v, list, what) => {
  const s = String(v).trim();
  const hit = list.find((x) => x.toLowerCase() === s.toLowerCase());
  if (!hit) throw new Error(`Invalid ${what}: ${v} (one of ${list.join(', ')})`);
  return hit;
};
const yes = (v) => /^(yes|true|y|1)$/i.test(String(v).trim());

const TYPES = ['BH', 'CPT', 'TP', 'HA'];
const MATERIALS = ['topsoil', 'fill', 'soil', 'rock'];
const SAMPLE_TYPES = ['U', 'D', 'B', 'C', 'W', 'ENV'];
const TESTS = ['MC', 'ATT', 'PSD', 'HYD', 'UCS', 'UU', 'CON', 'CBR', 'SG', 'COMP'];
const COORD_METHODS = ['planned', 'measured from plan', 'handheld GPS', 'RTK GPS', 'total station'];
// Which result parameters each test reports. load-results refuses a parameter its test does not report.
export const PARAMETERS = { MC: ['MC'], ATT: ['LL', 'PL', 'PI'], PSD: ['FINES', 'SAND', 'GRAVEL'], HYD: ['CLAY', 'SILT'], UCS: ['UCS'], UU: ['CU'], CON: ['MV', 'CV', 'CC'], CBR: ['CBR'], SG: ['SG'], COMP: ['MDD', 'OMC'] };

// The SPT N value: blows for the second and third 150 mm increments after the seating drive.
export function sptN(seat, b2, b3, refusalBlows = 50) {
  if ([seat, b2, b3].some((b) => b !== null && b !== undefined && b >= refusalBlows)) return { n: null, refusal: true };
  if (b2 === null || b2 === undefined || b3 === null || b3 === undefined) return { n: null, refusal: false };
  return { n: b2 + b3, refusal: false };
}

// ---------------------------------------------------------------- AGS4

// AGS4 is the published data transfer format gINT, OpenGround and most labs write.
// Every line is a quoted CSV row: "GROUP","LOCA" / "HEADING",... / "UNIT",... / "TYPE",... / "DATA",...
export function parseAgs(text) {
  const groups = {};
  let current = null;
  const lines = String(text).replace(/^﻿/, '').split(/\r?\n/);
  for (const [i, raw] of lines.entries()) {
    if (!raw.trim()) continue;
    const cells = [];
    const re = /"((?:[^"]|"")*)"(?:,|$)/g;
    let m;
    let consumed = 0;
    while ((m = re.exec(raw)) !== null) { cells.push(m[1].replace(/""/g, '"')); consumed = re.lastIndex; if (re.lastIndex >= raw.length) break; }
    if (!cells.length || consumed < raw.trimEnd().length) throw new Error(`AGS line ${i + 1}: every field must be in double quotes`);
    const [kind, ...rest] = cells;
    if (kind === 'GROUP') { current = { name: rest[0], headings: [], rows: [] }; groups[rest[0]] = current; }
    else if (!current) throw new Error(`AGS line ${i + 1}: data before any GROUP line`);
    else if (kind === 'HEADING') current.headings = rest;
    else if (kind === 'DATA') {
      if (rest.length !== current.headings.length) throw new Error(`AGS line ${i + 1}: ${rest.length} fields for ${current.headings.length} headings in ${current.name}`);
      current.rows.push(Object.fromEntries(current.headings.map((h, j) => [h, rest[j]])));
    } else if (kind !== 'UNIT' && kind !== 'TYPE') throw new Error(`AGS line ${i + 1}: unknown line type ${kind}`);
  }
  return groups;
}

export function writeAgs(groups) {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const out = [];
  for (const g of groups) {
    out.push([q('GROUP'), q(g.name)].join(','));
    out.push([q('HEADING'), ...g.headings.map(q)].join(','));
    out.push([q('UNIT'), ...g.headings.map((h) => q(g.units?.[h] || ''))].join(','));
    out.push([q('TYPE'), ...g.headings.map((h) => q(g.types?.[h] || 'X'))].join(','));
    for (const r of g.rows) out.push([q('DATA'), ...g.headings.map((h) => q(r[h]))].join(','));
    out.push('');
  }
  return out.join('\r\n');
}

// ---------------------------------------------------------------- main

async function main() {
  const { cmd, opts } = parseArgs(process.argv.slice(2));
  if (cmd === 'help') { console.log(help()); return; }

  const db = await getDb();
  const q = (sql, params = []) => db.query(sql, params);
  const one = async (sql, params = []) => (await q(sql, params))[0];
  const req = (k) => {
    if (typeof opts[k] !== 'string' || !opts[k].trim()) throw new Error(`Required: --${k}=…`);
    return opts[k].trim();
  };
  const opt = (k) => (typeof opts[k] === 'string' && opts[k].trim() ? opts[k].trim() : null);

  try {
    const today = (await one('select current_date::text as d')).d;
    const setting = async (k) => Number((await one('select value from settings where key = $1', [k]))?.value);

    // Exact name or code (case-insensitive), id prefix, or a name fragment. Ambiguous lists and fails.
    const resolve = async (tableName, s, label = tableName, extraCol = null) => {
      const sql = (where) => `select * from ${tableName} where ${where} order by name, id`;
      let rows = await q(sql(`id::text = lower($1) or lower(name) = lower($1) or starts_with(id::text, lower($1))${extraCol ? ` or lower(${extraCol}) = lower($1)` : ''}`), [s]);
      if (!rows.length) rows = await q(sql("lower(replace(name, ' ', '')) like '%' || lower(replace($1, ' ', '')) || '%'"), [s]);
      if (rows.length !== 1) throw new Error(rows.length ? `More than one ${label} matches "${s}": ${rows.map((r) => `${r.name} (${r.id.slice(0, 8)})`).join('; ')}` : `No ${label} matches "${s}"`);
      return rows[0];
    };
    const project = (s = req('project')) => resolve('projects', s, 'project', 'code');
    // PROJECT/NAME, "PROJECT NAME", or NAME when it is unique across projects.
    const location = async (s = req('location')) => {
      const parts = s.split(/[/\s]+/).filter(Boolean);
      const rows = parts.length > 1
        ? await q('select l.*, p.code as project_code from locations l join projects p on p.id = l.project_id where lower(p.code) = lower($1) and lower(l.name) = lower($2)', [parts[0], parts.slice(1).join(' ')])
        : await q('select l.*, p.code as project_code from locations l join projects p on p.id = l.project_id where lower(l.name) = lower($1) or starts_with(l.id::text, lower($1)) order by p.code', [s]);
      if (rows.length !== 1) throw new Error(rows.length ? `More than one location matches "${s}": ${rows.map((r) => `${r.project_code}/${r.name}`).join('; ')}. Use PROJECT/NAME.` : `No location matches "${s}"`);
      return rows[0];
    };
    const label = (l) => `${l.project_code}/${l.name}`;
    const insert = async (t, obj) => {
      const keys = Object.keys(obj);
      return one(`insert into ${t} (${keys.join(', ')}) values (${keys.map((_, i) => `$${i + 1}`).join(', ')}) returning *`, Object.values(obj));
    };
    const update = async (t, row, obj) => {
      const keys = Object.keys(obj);
      return one(`update ${t} set ${keys.map((k, i) => `${k} = $${i + 1}`).join(', ')} where id = $${keys.length + 1} returning *`, [...Object.values(obj), row.id]);
    };
    const strip = (r) => { if (!r) return r; const { project_code, ...rest } = r; return rest; };
    const log = (action, before, after) =>
      q('insert into events (actor, action, record_id, before_record, after_record) values ($1, $2, $3, $4::jsonb, $5::jsonb)',
        [req('actor'), action, after?.id || before?.id || null, before ? JSON.stringify(strip(before)) : null, after ? JSON.stringify(strip(after)) : null]);
    const on = (k = 'on') => (opt(k) ? isoDate(req(k), k) : today);
    const issuesFor = (subject, project) => q('select rule, issue from compliance_issues where subject = $1 and project = $2 order by rule', [subject, project]);

    let out;
    if (reads[cmd]) {
      out = await q(reads[cmd]);
    } else if (MUTATIONS[cmd]) {
      req('actor');
      await db.exec('BEGIN');
      try {
        out = await mutate(cmd);
        await db.exec(opts['dry-run'] ? 'ROLLBACK' : 'COMMIT');
      } catch (e) {
        await db.exec('ROLLBACK');
        throw e;
      }
    } else {
      out = await other(cmd);
    }
    if (opts['dry-run'] && out && !Array.isArray(out)) out = { ...out, preview: 'Preview only. Nothing was changed.' };
    print(out);

    // ---------------------------------------------------------------- read helpers

    async function strataOf(id) {
      return q(`select from_m, to_m, legend, material, coalesce(strength_density, '') as strength_density, coalesce(moisture, '') as moisture,
                  coalesce(plasticity, '') as plasticity, coalesce(weathering, '') as weathering, description, coalesce(geology_unit, '') as unit
                from strata where location_id = $1 order by from_m`, [id]);
    }

    async function other(c) {
      if (c === 'location') {
        const l = await location();
        return {
          location: await q(`select project, location, type, status, planned_depth, final_depth, metres_logged, coord_method, coalesce(started_on::text, '') as started_on,
                               coalesce(completed_on::text, '') as completed_on, coalesce(logged_by, '') as logged_by, coalesce(checked_by, '') as checked_by, nzgd
                             from location_status where location_id = $1`, [l.id]),
          position: [{ easting: l.easting, northing: l.northing, ground_level: l.ground_level, method: l.coord_method, services_checked_on: l.services_checked_on || '', termination: l.termination }],
          strata: await strataOf(l.id),
          spt: await q('select depth_m, seat_blows, blows_2, blows_3, recorded_n, calculated_n, check_result from spt_results where location_id = $1 order by depth_m', [l.id]),
          vane: await q('select depth_m, peak_kpa, remoulded_kpa, sensitivity, vane from vane_results where location_id = $1 order by depth_m', [l.id]),
          samples: await q(`select s.ref, s.sample_type as type, s.from_m, s.to_m, s.status, coalesce(string_agg(t.test || ' ' || t.status, ', ' order by t.test), '') as tests
                            from samples s left join lab_tests t on t.sample_id = s.id where s.location_id = $1 group by s.id order by s.from_m, s.ref`, [l.id]),
          groundwater: await q(`select observed_on, kind, coalesce(depth_m::text, '') as depth_m, coalesce(read_by, '') as read_by, note from groundwater where location_id = $1 order by observed_on, depth_m`, [l.id]),
          issues: await issuesFor(l.name, l.project_code),
        };
      }
      if (c === 'log') {
        const l = await location();
        return { log: await strataOf(l.id), gaps: await q('select kind, from_m, to_m from strata_gaps where location_id = $1 order by from_m', [l.id]) };
      }
      if (c === 'insitu') {
        const params = [];
        let where = '';
        if (opt('location')) { params.push((await location()).id); where = 'where location_id = $1'; }
        else if (opt('project')) { params.push((await project()).code); where = 'where project = $1'; }
        return {
          spt: await q(`select project, location, depth_m, seat_blows, blows_2, blows_3, recorded_n, calculated_n, check_result from spt_results ${where} order by project, location, depth_m`, params),
          vane: await q(`select project, location, depth_m, peak_kpa, remoulded_kpa, sensitivity, vane from vane_results ${where} order by project, location, depth_m`, params),
        };
      }
      if (c === 'lab-results') {
        const params = [];
        const where = [];
        if (opt('project')) { params.push((await project()).code); where.push(`project = $${params.length}`); }
        if (opt('location')) { const l = await location(); params.push(l.project_code, l.name); where.push(`project = $${params.length - 1} and location = $${params.length}`); }
        return q(`select project, location, sample, type, from_m, legend, mc_pct, ll, pl, pi, fines_pct, ucs_kpa, cu_kpa, cbr_pct from lab_summary ${where.length ? 'where ' + where.join(' and ') : ''} order by project, location, from_m`, params);
      }
      if (c === 'schedule') {
        const s = await resolve('schedules', req('schedule'), 'schedule');
        return {
          schedule: await q('select schedule, project, lab, sent_on, received_on, due_on, results_on, lab_job, tests, reported, stage, days_in_stage from schedule_status where schedule_id = $1', [s.id]),
          tests: await q(`select l.name as location, sm.ref as sample, sm.sample_type as type, sm.from_m, sm.to_m, t.test, t.method, t.status, coalesce(t.reported_on::text, '') as reported_on
                          from lab_tests t join samples sm on sm.id = t.sample_id join locations l on l.id = sm.location_id where t.schedule_id = $1 order by l.name, sm.from_m, t.test`, [s.id]),
        };
      }
      if (c === 'attention') {
        return {
          'rule checks': await q(reads.compliance),
          'in the field now': await q("select project, location, type, started_on, final_depth as depth_so_far, planned_depth, metres_logged from location_status where status = 'in progress' order by started_on"),
          'lab schedules waiting': await q("select schedule, project, lab, stage, days_in_stage, due_on, tests - reported as tests_waiting from schedule_status where stage <> 'results in' order by days_in_stage desc"),
          'piezometers due in 7 days': await q('select location, project, kind, last_read_on, next_due_on from monitoring_status where next_due_on <= current_date + 7 order by next_due_on'),
          'sensitive soils': await q('select project, location, depth_m, peak_kpa, remoulded_kpa, sensitivity from vane_results where sensitivity >= $1 order by sensitivity desc', [await setting('vane_sensitivity_flag')]),
          'reports not issued': await q("select r.name, p.code as project, r.kind, r.status, r.author, coalesce(r.reviewer, '') as reviewer from reports r join projects p on p.id = r.project_id where r.status <> 'issued' order by r.name"),
        };
      }
      if (c === 'weekly-review') {
        return {
          'finished this week': await q("select project, location, type, final_depth, completed_on from location_status where completed_on > current_date - 7 order by completed_on"),
          'metres by contractor, last 30 days': await q(`select coalesce(nullif(l.contractor, ''), '(own crew)') as contractor, l.loc_type as type, count(*)::int as locations, sum(l.final_depth) as metres
                                                        from locations l where l.completed_on > current_date - 30 group by 1, 2 order by 1, 2`),
          'results in this week': await q("select schedule, project, lab, results_on, tests from schedule_status where results_on > current_date - 7 order by results_on"),
          'lab schedules waiting': await q("select schedule, project, lab, stage, days_in_stage, due_on from schedule_status where stage <> 'results in' order by days_in_stage desc"),
          'rule checks by rule': await q('select rule, count(*)::int as open from compliance_issues group by rule order by count(*) desc, rule'),
          'logs to check': await q("select project, location, completed_on, logged_by from location_status where type in ('BH', 'TP', 'HA') and status in ('complete', 'abandoned') and checked_on is null order by completed_on"),
          reports: await q(reads.reports),
          'piezometers due': await q('select location, project, next_due_on from monitoring_status where next_due_on <= current_date + 7 order by next_due_on'),
        };
      }
      if (c === 'factual-tables') {
        const p = await project();
        const tables = {
          'location schedule': await q(`select l.name as location, l.loc_type as type, l.easting, l.northing, l.ground_level, l.coord_method as surveyed_by, l.final_depth,
                                          coalesce(l.completed_on::text, '') as date, l.method, l.termination
                                        from locations l where l.project_id = $1 and l.status in ('complete', 'abandoned') order by l.name`, [p.id]),
          'strata summary': await q(`select l.name as location, s.from_m, s.to_m, s.legend, coalesce(s.geology_unit, '') as unit, s.description
                                     from strata s join locations l on l.id = s.location_id where l.project_id = $1 order by l.name, s.from_m`, [p.id]),
          'spt results': await q('select location, depth_m, seat_blows, blows_2, blows_3, recorded_n as n, check_result from spt_results where project = $1 order by location, depth_m', [p.code]),
          'shear vane results': await q('select location, depth_m, peak_kpa, remoulded_kpa, sensitivity from vane_results where project = $1 order by location, depth_m', [p.code]),
          groundwater: await q(`select l.name as location, g.observed_on, g.kind, coalesce(g.depth_m::text, '') as depth_m, g.note from groundwater g join locations l on l.id = g.location_id
                                where l.project_id = $1 and g.kind <> 'reading' order by l.name, g.observed_on`, [p.id]),
          'lab results': await q('select location, sample, type, from_m, legend, mc_pct, ll, pl, pi, fines_pct, ucs_kpa, cu_kpa, cbr_pct from lab_summary where project = $1 order by location, from_m', [p.code]),
          'open checks': await q('select rule, subject, issue from compliance_issues where project = $1 order by rule, subject', [p.code]),
        };
        const md = [`# DRAFT: factual report tables, ${p.code} ${p.name}`, '', `Prepared ${today} from the site investigation database. Coordinates in ${p.coord_system}, levels in ${p.height_datum}. For the engineer to check before issue.`, ''];
        for (const [k, rows] of Object.entries(tables)) md.push(`## ${k[0].toUpperCase()}${k.slice(1)}`, '', mdTable(rows), '');
        const file = draft(`factual-tables-${p.code.toLowerCase()}-${today}.md`, md.join('\n'));
        return { ...tables, draft: [{ file }] };
      }
      if (c === 'draft-lab-chase') {
        const s = await resolve('schedules', req('schedule'), 'schedule');
        const st = await one('select * from schedule_status where schedule_id = $1', [s.id]);
        const lab = await one('select * from labs where id = $1', [s.lab_id]);
        const waiting = await q(`select l.name as location, sm.ref as sample, sm.from_m, t.test from lab_tests t join samples sm on sm.id = t.sample_id join locations l on l.id = sm.location_id
                                 where t.schedule_id = $1 and t.status = 'scheduled' order by l.name, sm.from_m, t.test`, [s.id]);
        if (!waiting.length) throw new Error(`Every test on ${s.name} is reported. Nothing to chase.`);
        const body = [
          `To: ${lab.email || lab.name}`,
          `Subject: ${s.name}${s.lab_job ? ` (your job ${s.lab_job})` : ''}: results for ${waiting.length} test(s)`,
          '',
          `Hi ${lab.name} team,`,
          '',
          st.stage === 'in transit'
            ? `We sent schedule ${s.name} on ${s.sent_on} and have no receipt for it yet. Can you confirm the samples arrived and give us a job number?`
            : `Schedule ${s.name} arrived with you on ${st.received_on} and results were due on ${st.due_on}. These are still to come:`,
          '',
          mdTable(waiting),
          '',
          'Can you let us know when to expect them?',
          '',
          'Thanks,',
          '[YOUR NAME]',
        ].join('\n');
        return { draft: [{ file: draft(`lab-chase-${s.name.toLowerCase()}-${today}.md`, body), tests_waiting: waiting.length }] };
      }
      if (c === 'draft-client-update') {
        const p = await project();
        const client = p.client_id ? await one('select * from clients where id = $1', [p.client_id]) : null;
        const locs = await q('select location, type, status, final_depth, completed_on from location_status where project = $1 order by location', [p.code]);
        const labs = await q("select schedule, stage, tests, reported, due_on from schedule_status where project = $1 order by sent_on", [p.code]);
        const reps = await q('select name, kind, revision, status, issued_on from reports where project_id = $1 order by name', [p.id]);
        const done = locs.filter((l) => l.status === 'complete' || l.status === 'abandoned');
        const body = [
          `To: ${client?.email || '[client email]'}`,
          `Subject: ${p.name}: site investigation update`,
          '',
          `Hi ${client?.contact?.split(' ')[0] || 'there'},`,
          '',
          `Fieldwork: ${done.length} of ${locs.length} investigation locations are finished${locs.some((l) => l.status === 'in progress') ? `, and ${locs.filter((l) => l.status === 'in progress').map((l) => l.location).join(', ')} is under way` : ''}.`,
          labs.length ? `Laboratory testing: ${labs.reduce((a, l) => a + l.reported, 0)} of ${labs.reduce((a, l) => a + l.tests, 0)} tests are reported.` : 'Laboratory testing: none scheduled yet.',
          reps.length ? `Reporting: ${reps.map((r) => `${r.name} Rev ${r.revision} is ${r.status}${r.issued_on ? ` (${r.issued_on})` : ''}`).join('; ')}.` : 'Reporting: the factual report follows the lab results.',
          '',
          mdTable(locs),
          '',
          '[YOUR NAME]',
        ].join('\n');
        return { draft: [{ file: draft(`client-update-${p.code.toLowerCase()}-${today}.md`, body) }] };
      }
      if (c === 'export') {
        const tablesList = ['settings', 'test_methods', 'clients', 'projects', 'labs', 'locations', 'strata', 'spt_tests', 'vane_tests', 'schedules', 'samples', 'lab_tests', 'lab_results', 'installations', 'groundwater', 'reports', 'events'];
        const data = { exported_at: new Date().toISOString(), tables: {} };
        for (const t of tablesList) data.tables[t] = await q(`select * from ${t}`);
        const file = path.resolve(REPO_ROOT, opt('out') || path.join('exports', `geotechnical-${today}.json`));
        mkdirSync(path.dirname(file), { recursive: true });
        writeFileSync(file, JSON.stringify(data, null, 2), { mode: 0o600 });
        return [{ file, ...Object.fromEntries(Object.entries(data.tables).map(([k, v]) => [k, v.length])) }];
      }
      if (c === 'export-ags') {
        const p = await project();
        const locs = await q("select * from locations where project_id = $1 and status in ('complete', 'abandoned') order by name", [p.id]);
        const ids = locs.map((l) => l.id);
        const nm = Object.fromEntries(locs.map((l) => [l.id, l.name]));
        const AGS_TYPE = { BH: 'RC', CPT: 'CPT', TP: 'TP', HA: 'HA' };
        const groups = [
          { name: 'PROJ', headings: ['PROJ_ID', 'PROJ_NAME', 'PROJ_LOC', 'PROJ_CLNT', 'PROJ_ENG'], rows: [{ PROJ_ID: p.code, PROJ_NAME: p.name, PROJ_LOC: p.site, PROJ_CLNT: (await one('select name from clients where id = $1', [p.client_id]))?.name || '', PROJ_ENG: p.lead_engineer }] },
          { name: 'LOCA', headings: ['LOCA_ID', 'LOCA_TYPE', 'LOCA_STAT', 'LOCA_NATE', 'LOCA_NATN', 'LOCA_GL', 'LOCA_FDEP', 'LOCA_STAR', 'LOCA_ENDD', 'LOCA_PURP', 'LOCA_TERM', 'LOCA_LOCM'],
            units: { LOCA_NATE: 'm', LOCA_NATN: 'm', LOCA_GL: 'm', LOCA_FDEP: 'm', LOCA_STAR: 'yyyy-mm-dd', LOCA_ENDD: 'yyyy-mm-dd' },
            rows: locs.map((l) => ({ LOCA_ID: l.name, LOCA_TYPE: AGS_TYPE[l.loc_type], LOCA_STAT: 'FINAL', LOCA_NATE: l.easting, LOCA_NATN: l.northing, LOCA_GL: l.ground_level, LOCA_FDEP: l.final_depth, LOCA_STAR: l.started_on || '', LOCA_ENDD: l.completed_on || '', LOCA_PURP: l.purpose, LOCA_TERM: l.termination, LOCA_LOCM: l.coord_method })) },
          { name: 'GEOL', headings: ['LOCA_ID', 'GEOL_TOP', 'GEOL_BASE', 'GEOL_DESC', 'GEOL_LEG', 'GEOL_GEOL'], units: { GEOL_TOP: 'm', GEOL_BASE: 'm' },
            rows: (await q('select * from strata where location_id = any($1) order by location_id, from_m', [ids])).map((s) => ({ LOCA_ID: nm[s.location_id], GEOL_TOP: s.from_m, GEOL_BASE: s.to_m, GEOL_DESC: s.description, GEOL_LEG: s.legend, GEOL_GEOL: s.geology_unit || '' })) },
          { name: 'ISPT', headings: ['LOCA_ID', 'ISPT_TOP', 'ISPT_SEAT', 'ISPT_MAIN', 'ISPT_NPEN', 'ISPT_NVAL', 'ISPT_REP'], units: { ISPT_TOP: 'm', ISPT_NPEN: 'mm' },
            rows: (await q('select * from spt_tests where location_id = any($1) order by location_id, depth_m', [ids])).map((t) => ({ LOCA_ID: nm[t.location_id], ISPT_TOP: t.depth_m, ISPT_SEAT: t.seat_blows ?? '', ISPT_MAIN: t.blows_2 !== null && t.blows_3 !== null ? t.blows_2 + t.blows_3 : '', ISPT_NPEN: t.penetration_mm, ISPT_NVAL: t.n_value ?? '', ISPT_REP: t.refusal ? `${(t.seat_blows ?? 0) + (t.blows_2 ?? 0) + (t.blows_3 ?? 0)} blows for ${t.penetration_mm} mm` : `N=${t.n_value ?? ''}` })) },
          { name: 'IVAN', headings: ['LOCA_ID', 'IVAN_DPTH', 'IVAN_IVAN', 'IVAN_IVAR'], units: { IVAN_DPTH: 'm', IVAN_IVAN: 'kPa', IVAN_IVAR: 'kPa' },
            rows: (await q('select * from vane_tests where location_id = any($1) order by location_id, depth_m', [ids])).map((v) => ({ LOCA_ID: nm[v.location_id], IVAN_DPTH: v.depth_m, IVAN_IVAN: v.peak_kpa, IVAN_IVAR: v.remoulded_kpa ?? '' })) },
          { name: 'SAMP', headings: ['LOCA_ID', 'SAMP_TOP', 'SAMP_REF', 'SAMP_TYPE', 'SAMP_BASE'], units: { SAMP_TOP: 'm', SAMP_BASE: 'm' },
            rows: (await q('select * from samples where location_id = any($1) order by location_id, from_m', [ids])).map((s) => ({ LOCA_ID: nm[s.location_id], SAMP_TOP: s.from_m, SAMP_REF: s.ref, SAMP_TYPE: s.sample_type, SAMP_BASE: s.to_m ?? '' })) },
          { name: 'WSTK', headings: ['LOCA_ID', 'WSTK_DEP', 'WSTK_DTIM', 'WSTK_REM'], units: { WSTK_DEP: 'm', WSTK_DTIM: 'yyyy-mm-dd' },
            rows: (await q("select * from groundwater where location_id = any($1) and kind in ('strike', 'standing') order by location_id, observed_on", [ids])).map((g) => ({ LOCA_ID: nm[g.location_id], WSTK_DEP: g.depth_m, WSTK_DTIM: g.observed_on, WSTK_REM: [g.kind, g.note].filter(Boolean).join(': ') })) },
        ];
        const file = path.resolve(REPO_ROOT, opt('out') || path.join('exports', `${p.code}-${today}.ags`));
        mkdirSync(path.dirname(file), { recursive: true });
        writeFileSync(file, writeAgs(groups), { mode: 0o600 });
        return [{ file, ...Object.fromEntries(groups.map((g) => [g.name, g.rows.length])) }];
      }
      throw new Error(`Unhandled command ${c}`);
    }

    // ---------------------------------------------------------------- changes

    async function mutate(c) {
      if (c === 'add-client') {
        const row = await insert('clients', { name: req('name'), contact: opt('contact') || '', email: opt('email') || '' });
        await log(c, null, row);
        return row;
      }
      if (c === 'add-project') {
        const country = opt('country') ? oneOf(req('country'), ['NZ', 'AU'], 'country') : 'NZ';
        const client = opt('client') ? await resolve('clients', req('client'), 'client') : null;
        const row = await insert('projects', {
          code: req('code').toUpperCase(), name: req('name'), client_id: client?.id || null, site: opt('site') || '', country,
          coord_system: opt('coords') || (country === 'NZ' ? 'NZTM2000' : 'MGA2020'), height_datum: opt('height-datum') || (country === 'NZ' ? 'NZVD2016' : 'AHD'),
          lead_engineer: opt('lead') || '', nzgd_required: opt('nzgd') ? yes(req('nzgd')) : false,
        });
        await log(c, null, row);
        return row;
      }
      if (c === 'add-lab') {
        const row = await insert('labs', { name: req('name'), code: req('code').toUpperCase(), accreditation: opt('accreditation') || '', email: opt('email') || '' });
        await log(c, null, row);
        return { ...row, ...(row.accreditation ? {} : { warning: 'No IANZ or NATA accreditation number. Schedules to this lab will show under LAB_ACCREDITED until you add one.' }) };
      }
      if (c === 'plan-location') {
        const p = await project();
        const row = await insert('locations', {
          project_id: p.id, name: req('name').toUpperCase(), loc_type: oneOf(req('type'), TYPES, 'type'),
          planned_depth: opt('depth') ? num(req('depth'), 'depth', { min: 0 }) : null, purpose: opt('purpose') || '', method: opt('method') || '', contractor: opt('contractor') || '',
          easting: opt('easting') ? num(req('easting'), 'easting') : null, northing: opt('northing') ? num(req('northing'), 'northing') : null, coord_method: 'planned',
        });
        await log(c, null, row);
        return row;
      }
      if (c === 'services-checked') {
        const l = await location();
        const row = await update('locations', l, { services_checked_on: on() });
        await log(c, l, row);
        return strip(row);
      }
      if (c === 'start-location') {
        const l = await location();
        if (l.status !== 'planned') throw new Error(`${label(l)} is ${l.status}, not planned`);
        const date = on();
        const fields = { status: 'in progress', started_on: date };
        if (opt('contractor')) fields.contractor = req('contractor');
        if (opt('method')) fields.method = req('method');
        if (opt('logged-by')) fields.logged_by = req('logged-by');
        const row = await update('locations', l, fields);
        await log(c, l, row);
        return { ...strip(row), ...(l.services_checked_on && l.services_checked_on <= date ? {} : { warning: 'No services check recorded before this start. Record it with services-checked, or stop and get the plans first.' }) };
      }
      if (c === 'complete-location' || c === 'abandon-location') {
        const l = await location();
        if (!['in progress', 'planned'].includes(l.status)) throw new Error(`${label(l)} is already ${l.status}`);
        const depth = num(req('depth'), 'depth', { min: 0 });
        const deepest = await one(`select greatest(coalesce((select max(to_m) from strata where location_id = $1), 0), coalesce((select max(depth_m) from spt_tests where location_id = $1), 0),
                                     coalesce((select max(coalesce(to_m, from_m)) from samples where location_id = $1), 0))::float8 as d`, [l.id]);
        if (deepest.d > depth) throw new Error(`Records on ${label(l)} go to ${deepest.d} m, deeper than ${depth} m. Fix the depth or the records first.`);
        const date = on();
        const row = await update('locations', l, { status: c === 'complete-location' ? 'complete' : 'abandoned', final_depth: depth, completed_on: date, started_on: l.started_on || date, termination: opt('termination') || (c === 'complete-location' ? 'Target depth' : '') });
        await log(c, l, row);
        return { ...strip(row), open_checks: await issuesFor(l.name, l.project_code) };
      }
      if (c === 'set-coords') {
        const l = await location();
        const fields = { easting: num(req('easting'), 'easting'), northing: num(req('northing'), 'northing'), coord_method: oneOf(req('method'), COORD_METHODS.filter((x) => x !== 'planned'), 'method') };
        if (opt('level')) fields.ground_level = num(req('level'), 'ground level');
        const row = await update('locations', l, fields);
        await log(c, l, row);
        return strip(row);
      }
      if (c === 'log-stratum') {
        const l = await location();
        const from = num(req('from'), 'from', { min: 0 });
        const to = num(req('to'), 'to', { min: 0 });
        if (to <= from) throw new Error('--to must be deeper than --from');
        const clash = await one('select from_m, to_m from strata where location_id = $1 and from_m < $3 and to_m > $2 order by from_m limit 1', [l.id, from, to]);
        if (clash) throw new Error(`${label(l)} already has a stratum from ${clash.from_m} to ${clash.to_m} m. Logged intervals cannot overlap.`);
        const material = opt('material') ? oneOf(req('material'), MATERIALS, 'material') : 'soil';
        const row = await insert('strata', {
          location_id: l.id, from_m: from, to_m: to, material, legend: (opt('legend') || '').toUpperCase(), description: req('description'),
          strength_density: opt('strength'), moisture: opt('moisture'), plasticity: opt('plasticity'), weathering: opt('weathering'), geology_unit: opt('unit'), logged_by: opt('by') || req('actor'),
        });
        await log(c, null, row);
        const missing = material === 'rock' ? ['strength', 'weathering'].filter((k) => !opt(k)) : material === 'topsoil' ? [] : ['strength', 'moisture'].filter((k) => !opt(k));
        return { ...row, ...(missing.length ? { warning: `The field description needs ${missing.join(' and ')} for ${material} (see docs/compliance.md, FD_${material === 'rock' ? 'ROCK' : 'SOIL'}).` } : {}) };
      }
      if (c === 'add-spt') {
        const l = await location();
        const blows = req('blows').split(/[,/ ]+/).map((b) => int(b, 'blows'));
        if (blows.length < 1 || blows.length > 3) throw new Error('--blows takes the seating drive and up to two test increments, like 4,6,7');
        const [seat, b2 = null, b3 = null] = blows;
        const calc = sptN(seat, b2, b3, await setting('spt_refusal_blows'));
        const refusal = Boolean(opts.refusal) || calc.refusal;
        const n = opt('n') ? int(req('n'), 'N') : calc.n;
        const row = await insert('spt_tests', {
          location_id: l.id, depth_m: num(req('depth'), 'depth', { min: 0 }), seat_blows: seat, blows_2: b2, blows_3: b3, n_value: refusal ? null : n, refusal,
          penetration_mm: opt('penetration') ? int(req('penetration'), 'penetration') : refusal ? 150 * blows.length : 450, note: opt('note') || '',
        });
        await log(c, null, row);
        return { ...row, ...(calc.n !== null && n !== calc.n ? { warning: `Recorded N=${n} but the blows give N=${calc.n}. This will show under SPT_N.` } : {}) };
      }
      if (c === 'add-vane') {
        const l = await location();
        const peak = num(req('peak'), 'peak', { min: 0 });
        const rem = opt('remoulded') ? num(req('remoulded'), 'remoulded', { min: 0 }) : null;
        const row = await insert('vane_tests', { location_id: l.id, depth_m: num(req('depth'), 'depth', { min: 0 }), peak_kpa: peak, remoulded_kpa: rem, vane_id: opt('vane') || '' });
        await log(c, null, row);
        return { ...row, sensitivity: rem ? Number((peak / rem).toFixed(1)) : null };
      }
      if (c === 'add-sample') {
        const l = await location();
        const row = await insert('samples', {
          location_id: l.id, ref: req('ref').toUpperCase(), sample_type: oneOf(req('type'), SAMPLE_TYPES, 'type'),
          from_m: num(req('from'), 'from', { min: 0 }), to_m: opt('to') ? num(req('to'), 'to', { min: 0 }) : null, taken_on: on(),
        });
        await log(c, null, row);
        return row;
      }
      if (c === 'record-water') {
        const l = await location();
        const kind = oneOf(req('kind'), ['strike', 'standing', 'not encountered'], 'kind');
        if (kind !== 'not encountered' && !opt('depth')) throw new Error('Required: --depth=… (or --kind="not encountered")');
        const row = await insert('groundwater', { location_id: l.id, observed_on: on(), kind, depth_m: kind === 'not encountered' ? null : num(req('depth'), 'depth', { min: 0 }), read_by: opt('by') || req('actor'), note: opt('note') || '' });
        await log(c, null, row);
        return row;
      }
      if (c === 'install') {
        const l = await location();
        const row = await insert('installations', {
          location_id: l.id, kind: opt('kind') ? oneOf(req('kind'), ['standpipe piezometer', 'vibrating wire piezometer', 'inclinometer', 'monitoring well'], 'kind') : 'standpipe piezometer',
          screen_top: opt('top') ? num(req('top'), 'screen top', { min: 0 }) : null, screen_base: opt('base') ? num(req('base'), 'screen base', { min: 0 }) : null,
          installed_on: on(), read_every_days: opt('every') ? int(req('every'), 'interval') : null,
        });
        await log(c, null, row);
        return row;
      }
      if (c === 'read-piezo') {
        const l = await location();
        const inst = await q('select * from installations where location_id = $1 and decommissioned_on is null order by installed_on', [l.id]);
        if (inst.length !== 1) throw new Error(inst.length ? `${label(l)} has ${inst.length} installations. Read them one at a time with /customise.` : `${label(l)} has no installation. Add one with install.`);
        const row = await insert('groundwater', { location_id: l.id, installation_id: inst[0].id, observed_on: on(), kind: 'reading', depth_m: num(req('depth'), 'depth', { min: 0 }), read_by: opt('by') || req('actor') });
        await log(c, null, row);
        return { ...row, next_due_on: (await one('select next_due_on from monitoring_status where installation_id = $1', [inst[0].id])).next_due_on };
      }
      if (c === 'check-log') {
        const l = await location();
        if (!['complete', 'abandoned'].includes(l.status)) throw new Error(`${label(l)} is ${l.status}. Check the log once it is finished.`);
        const by = req('by');
        if (l.logged_by && by.toLowerCase() === l.logged_by.toLowerCase()) throw new Error(`${by} logged ${label(l)}. A second person checks it.`);
        const open = (await issuesFor(l.name, l.project_code)).filter((i) => /^(FD_|LOG_CONTINUOUS|SPT_N|GROUNDWATER|VANE)/.test(i.rule));
        if (open.length) throw new Error(`Fix these before signing off ${label(l)}: ${open.map((i) => `${i.rule} ${i.issue}`).join('; ')}`);
        const row = await update('locations', l, { checked_by: by, checked_on: on() });
        await log(c, l, row);
        return strip(row);
      }
      if (c === 'schedule-tests') {
        const lab = await resolve('labs', req('lab'), 'lab', 'code');
        const tests = req('tests').split(/[,+ ]+/).map((t) => oneOf(t, TESTS, 'test'));
        const refs = req('samples').split(',').map((s) => s.trim()).filter(Boolean);
        const samples = [];
        for (const ref of refs) {
          const parts = ref.split(/[/\s]+/);
          if (parts.length < 2) throw new Error(`Sample "${ref}": give LOCATION REF or PROJECT/LOCATION/REF`);
          const l = await location(parts.slice(0, -1).join('/'));
          const s = await one('select * from samples where location_id = $1 and lower(ref) = lower($2)', [l.id, parts[parts.length - 1]]);
          if (!s) throw new Error(`No sample ${parts[parts.length - 1]} on ${label(l)}`);
          samples.push({ ...s, project_id: l.project_id, label: `${label(l)} ${s.ref}` });
        }
        const projects = [...new Set(samples.map((s) => s.project_id))];
        if (projects.length !== 1) throw new Error('One schedule covers one project');
        const p = await one('select * from projects where id = $1', [projects[0]]);
        const sentOn = on();
        const n = (await one('select count(*)::int as n from schedules where project_id = $1', [p.id])).n + 1;
        const sc = await insert('schedules', { name: opt('name') || `LS-${p.code}-${String(n).padStart(2, '0')}`, project_id: p.id, lab_id: lab.id, sent_on: sentOn, due_on: opt('due') ? isoDate(req('due'), 'due') : null });
        await log(c, null, sc);
        const rows = [];
        for (const s of samples) {
          for (const t of tests) {
            const method = (await one('select method from test_methods where country = $1 and test = $2', [p.country, t]))?.method || '';
            const existing = await one("select * from lab_tests where sample_id = $1 and test = $2 and status <> 'cancelled'", [s.id, t]);
            if (existing) throw new Error(`${s.label} already has ${t} on another schedule`);
            const row = await insert('lab_tests', { sample_id: s.id, schedule_id: sc.id, test: t, method });
            await log(c, null, row);
            rows.push({ sample: s.label, test: t, method: method || '(no default method: set one with set-method)' });
          }
          const before = await one('select * from samples where id = $1', [s.id]);
          await log(c, before, await update('samples', before, { status: 'scheduled' }));
        }
        return { schedule: [{ name: sc.name, lab: lab.name, sent_on: sc.sent_on, tests: rows.length }], tests: rows, ...(lab.accreditation ? {} : { warning: [{ note: `${lab.name} has no accreditation number on file (LAB_ACCREDITED).` }] }) };
      }
      if (c === 'receive') {
        const s = await resolve('schedules', req('schedule'), 'schedule');
        const row = await update('schedules', s, { received_on: on(), lab_job: opt('job') || s.lab_job });
        await log(c, s, row);
        return { ...row, results_due: (await one('select due_on from schedule_status where schedule_id = $1', [s.id])).due_on };
      }
      if (c === 'load-results') {
        // Long format, one result per row: Location, Sample, Test, Parameter, Value, Units (Project optional).
        const rows = parseCsv(readFileSync(path.resolve(req('file')), 'utf8'));
        const sc = opt('schedule') ? await resolve('schedules', req('schedule'), 'schedule') : null;
        const date = on();
        const summary = { results_added: 0, results_updated: 0, tests_reported: 0 };
        const reported = new Set();
        for (const [i, r] of rows.entries()) {
          const at = `Row ${i + 2}`;
          const proj = pick(r, 'Project', 'PROJ_ID');
          const l = await location(proj ? `${proj}/${pick(r, 'Location', 'LOCA_ID')}` : pick(r, 'Location', 'LOCA_ID'));
          const s = await one('select * from samples where location_id = $1 and lower(ref) = lower($2)', [l.id, pick(r, 'Sample', 'SAMP_REF')]);
          if (!s) throw new Error(`${at}: no sample ${pick(r, 'Sample')} on ${label(l)}`);
          const test = oneOf(pick(r, 'Test'), TESTS, `${at} test`);
          const t = await one("select * from lab_tests where sample_id = $1 and test = $2 and status <> 'cancelled'", [s.id, test]);
          if (!t) throw new Error(`${at}: ${test} was never scheduled on ${label(l)} ${s.ref}`);
          if (sc && t.schedule_id !== sc.id) throw new Error(`${at}: ${label(l)} ${s.ref} ${test} is not on ${sc.name}`);
          const parameter = pick(r, 'Parameter').toUpperCase();
          if (!PARAMETERS[test].includes(parameter)) throw new Error(`${at}: ${test} reports ${PARAMETERS[test].join(', ')}, not ${parameter}`);
          const raw = pick(r, 'Value').trim();
          const value = raw === '' || /^n\.?p\.?$/i.test(raw) ? null : num(raw, `${at} value`);
          const before = await one('select * from lab_results where lab_test_id = $1 and parameter = $2', [t.id, parameter]);
          if (before) { await log(c, before, await update('lab_results', before, { value, units: pick(r, 'Units') || before.units })); summary.results_updated++; }
          else { await log(c, null, await insert('lab_results', { lab_test_id: t.id, parameter, value, units: pick(r, 'Units') || '' })); summary.results_added++; }
          if (!reported.has(t.id)) {
            reported.add(t.id);
            await log(c, t, await update('lab_tests', t, { status: 'reported', reported_on: date }));
            summary.tests_reported++;
            const left = await one("select count(*)::int as n from lab_tests where sample_id = $1 and status = 'scheduled'", [s.id]);
            if (!left.n) { const sb = await one('select * from samples where id = $1', [s.id]); await log(c, sb, await update('samples', sb, { status: 'tested' })); }
          }
        }
        const touched = await q("select distinct schedule_id from lab_tests where id = any($1) and schedule_id is not null", [[...reported]]);
        for (const { schedule_id } of touched) {
          const s = await one('select * from schedules where id = $1', [schedule_id]);
          const left = await one("select count(*)::int as n from lab_tests where schedule_id = $1 and status = 'scheduled'", [schedule_id]);
          if (!left.n && !s.results_on) await log(c, s, await update('schedules', s, { received_on: s.received_on || date, results_on: date }));
          summary[`${s.name} tests still waiting`] = left.n;
        }
        return summary;
      }
      if (c === 'add-report') {
        const p = await project();
        const row = await insert('reports', { project_id: p.id, name: req('name'), kind: opt('kind') ? oneOf(req('kind'), ['factual', 'interpretive', 'geotechnical baseline', 'letter'], 'kind') : 'factual', revision: opt('revision') || 'A', author: req('author'), reviewer: opt('reviewer') });
        await log(c, null, row);
        return row;
      }
      if (c === 'issue-report') {
        const r = await resolve('reports', req('report'), 'report');
        const reviewer = opt('reviewer') || r.reviewer;
        if (!reviewer) throw new Error(`${r.name} has no reviewer. Issue it with --reviewer=NAME once it is reviewed.`);
        if (reviewer.toLowerCase() === r.author.toLowerCase()) throw new Error(`${reviewer} wrote ${r.name}. Someone else reviews it before issue.`);
        const row = await update('reports', r, { reviewer, status: 'issued', issued_on: on(), revision: opt('revision') || r.revision });
        await log(c, r, row);
        return row;
      }
      if (c === 'upload-nzgd') {
        const l = await location();
        const row = await update('locations', l, { nzgd_id: req('id'), nzgd_uploaded_on: on() });
        await log(c, l, row);
        return strip(row);
      }
      if (c === 'set-method') {
        const country = oneOf(req('country'), ['NZ', 'AU'], 'country');
        const test = oneOf(req('test'), TESTS, 'test');
        const before = await one('select * from test_methods where country = $1 and test = $2', [country, test]);
        const row = before
          ? await one('update test_methods set method = $3 where country = $1 and test = $2 returning *', [country, test, req('method')])
          : await one('insert into test_methods (country, test, name, method) values ($1, $2, $2, $3) returning *', [country, test, req('method')]);
        await log(c, before, row);
        return row;
      }
      if (c === 'set') {
        const before = await one('select * from settings where key = $1', [req('key')]);
        if (!before) throw new Error(`No setting ${req('key')}. Run: npm run geo -- settings`);
        num(req('value'), req('key'), { min: 0 });
        const row = await one('update settings set value = $2 where key = $1 returning *', [req('key'), req('value')]);
        await log(c, before, row);
        return row;
      }
      if (c === 'import') return importGint();
      throw new Error(`Unhandled command ${c}`);
    }

    // ---------------------------------------------------------------- gINT import (AGS4)

    // gINT writes AGS4 from File > Export > AGS. LOCA is required; GEOL, ISPT, IVAN, SAMP, WSTK,
    // LNMC and LLPL come across when present. Re-running skips what is already on file.
    async function importGint() {
      const p = await project();
      const g = parseAgs(readFileSync(path.resolve(req('file')), 'utf8'));
      if (!g.LOCA?.rows.length) throw new Error('No LOCA group in the file. Export with the LOCA group ticked.');
      const summary = { locations_added: 0, locations_on_file: 0, strata_added: 0, spt_added: 0, vanes_added: 0, samples_added: 0, water_added: 0, results_added: 0 };
      const ids = new Map();
      const n = (v, what) => (String(v ?? '').trim() === '' ? null : num(String(v).trim(), what));
      const typeOf = (v) => { const s = String(v).toUpperCase(); return /CPT|SCP/.test(s) ? 'CPT' : /^TP|TRIAL|PIT/.test(s) ? 'TP' : /^HA|HAND/.test(s) ? 'HA' : 'BH'; };
      const coordOf = (v) => { const s = String(v).toUpperCase(); return /RTK/.test(s) ? 'RTK GPS' : /TOTAL|STATION|TS/.test(s) ? 'total station' : /GPS|GNSS/.test(s) ? 'handheld GPS' : /PLAN|TAPE/.test(s) ? 'measured from plan' : 'planned'; };
      const loc = (id, at) => { const v = ids.get(String(id).toUpperCase()); if (!v) throw new Error(`${at}: LOCA_ID ${id} is not in the LOCA group`); return v; };
      for (const [i, r] of g.LOCA.rows.entries()) {
        const at = `LOCA row ${i + 1}`;
        const name = String(r.LOCA_ID || '').trim().toUpperCase();
        if (!name) throw new Error(`${at}: blank LOCA_ID`);
        const existing = await one('select id from locations where project_id = $1 and name = $2', [p.id, name]);
        if (existing) { ids.set(name, existing.id); summary.locations_on_file++; continue; }
        const end = r.LOCA_ENDD ? isoDate(r.LOCA_ENDD, `${at} LOCA_ENDD`) : null;
        const row = await insert('locations', {
          project_id: p.id, name, loc_type: typeOf(r.LOCA_TYPE), status: end ? 'complete' : 'planned', purpose: r.LOCA_PURP || '', termination: r.LOCA_TERM || '',
          final_depth: n(r.LOCA_FDEP, `${at} LOCA_FDEP`), easting: n(r.LOCA_NATE, `${at} LOCA_NATE`), northing: n(r.LOCA_NATN, `${at} LOCA_NATN`), ground_level: n(r.LOCA_GL, `${at} LOCA_GL`),
          coord_method: coordOf(r.LOCA_LOCM), started_on: r.LOCA_STAR ? isoDate(r.LOCA_STAR, `${at} LOCA_STAR`) : end, completed_on: end, source_ref: `ags:${name}`,
        });
        ids.set(name, row.id);
        summary.locations_added++;
        await log('import-gint', null, row);
      }
      for (const [i, r] of (g.GEOL?.rows || []).entries()) {
        const at = `GEOL row ${i + 1}`;
        const lid = loc(r.LOCA_ID, at);
        const from = n(r.GEOL_TOP, `${at} GEOL_TOP`);
        const to = n(r.GEOL_BASE, `${at} GEOL_BASE`);
        if (await one('select 1 from strata where location_id = $1 and from_m = $2', [lid, from])) continue;
        const desc = r.GEOL_DESC || '';
        const legend = String(r.GEOL_LEG || '').toUpperCase();
        const material = /^TOPSOIL/i.test(desc) || legend === 'TS' ? 'topsoil' : /^FILL/i.test(desc) || legend === 'FILL' ? 'fill' : /(STONE|SCHIST|GREYWACKE|BASALT|ANDESITE|GRANITE|PHYLLITE|MUDSTONE|SILTSTONE|SANDSTONE|LIMESTONE|IGNIMBRITE)\b/.test(desc.split(/[,;]/)[0].toUpperCase()) ? 'rock' : 'soil';
        const word = (list) => list.find((w) => new RegExp(`\\b${w}\\b`, 'i').test(desc)) || null;
        const row = await insert('strata', {
          location_id: lid, from_m: from, to_m: to, material, legend, description: desc, geology_unit: r.GEOL_GEOL || null,
          strength_density: word(['very soft', 'soft', 'firm', 'very stiff', 'stiff', 'hard', 'very loose', 'loose', 'medium dense', 'very dense', 'dense', 'extremely weak', 'very weak', 'moderately weak', 'weak', 'moderately strong', 'very strong', 'strong']),
          moisture: material === 'rock' ? null : word(['dry', 'moist', 'wet', 'saturated']),
          weathering: material === 'rock' ? word(['unweathered', 'slightly weathered', 'moderately weathered', 'highly weathered', 'completely weathered', 'residual soil']) : null,
          plasticity: word(['high plasticity', 'medium plasticity', 'low plasticity'])?.split(' ')[0] || null,
        });
        summary.strata_added++;
        await log('import-gint', null, row);
      }
      for (const [i, r] of (g.ISPT?.rows || []).entries()) {
        const at = `ISPT row ${i + 1}`;
        const lid = loc(r.LOCA_ID, at);
        const depth = n(r.ISPT_TOP, `${at} ISPT_TOP`);
        if (await one('select 1 from spt_tests where location_id = $1 and depth_m = $2', [lid, depth])) continue;
        const inc = [1, 2, 3, 4, 5, 6].map((k) => (r[`ISPT_INC${k}`] === undefined || r[`ISPT_INC${k}`] === '' ? null : int(r[`ISPT_INC${k}`], `${at} ISPT_INC${k}`)));
        const pair = (a, b) => (a === null && b === null ? null : (a || 0) + (b || 0));
        const hasInc = inc.some((x) => x !== null);
        const pen = n(r.ISPT_NPEN, `${at} ISPT_NPEN`) ?? 450;
        const row = await insert('spt_tests', {
          location_id: lid, depth_m: depth, seat_blows: hasInc ? pair(inc[0], inc[1]) : n(r.ISPT_SEAT, `${at} ISPT_SEAT`), blows_2: hasInc ? pair(inc[2], inc[3]) : null, blows_3: hasInc ? pair(inc[4], inc[5]) : null,
          n_value: r.ISPT_NVAL === '' || r.ISPT_NVAL === undefined ? null : int(r.ISPT_NVAL, `${at} ISPT_NVAL`), refusal: pen < 450, penetration_mm: pen, note: r.ISPT_REP || '',
        });
        summary.spt_added++;
        await log('import-gint', null, row);
      }
      for (const [i, r] of (g.IVAN?.rows || []).entries()) {
        const at = `IVAN row ${i + 1}`;
        const lid = loc(r.LOCA_ID, at);
        const depth = n(r.IVAN_DPTH, `${at} IVAN_DPTH`);
        if (await one('select 1 from vane_tests where location_id = $1 and depth_m = $2', [lid, depth])) continue;
        const row = await insert('vane_tests', { location_id: lid, depth_m: depth, peak_kpa: n(r.IVAN_IVAN, `${at} IVAN_IVAN`), remoulded_kpa: n(r.IVAN_IVAR, `${at} IVAN_IVAR`) });
        summary.vanes_added++;
        await log('import-gint', null, row);
      }
      for (const [i, r] of (g.SAMP?.rows || []).entries()) {
        const at = `SAMP row ${i + 1}`;
        const lid = loc(r.LOCA_ID, at);
        const ref = String(r.SAMP_REF || '').trim().toUpperCase();
        if (!ref) throw new Error(`${at}: blank SAMP_REF`);
        if (await one('select 1 from samples where location_id = $1 and ref = $2', [lid, ref])) continue;
        const t = String(r.SAMP_TYPE || '').toUpperCase();
        const row = await insert('samples', {
          location_id: lid, ref, sample_type: /^U|^UT|^TW|^P$/.test(t) ? 'U' : /^B/.test(t) ? 'B' : /^C/.test(t) ? 'C' : /^W/.test(t) ? 'W' : /^ES|ENV/.test(t) ? 'ENV' : 'D',
          from_m: n(r.SAMP_TOP, `${at} SAMP_TOP`), to_m: n(r.SAMP_BASE, `${at} SAMP_BASE`), taken_on: r.SAMP_DTIM ? isoDate(r.SAMP_DTIM, `${at} SAMP_DTIM`) : null, source_ref: `ags:${r.LOCA_ID}:${ref}`,
        });
        summary.samples_added++;
        await log('import-gint', null, row);
      }
      for (const [i, r] of (g.WSTK?.rows || []).entries()) {
        const at = `WSTK row ${i + 1}`;
        const lid = loc(r.LOCA_ID, at);
        const depth = n(r.WSTK_DEP, `${at} WSTK_DEP`);
        const date = r.WSTK_DTIM ? isoDate(r.WSTK_DTIM, `${at} WSTK_DTIM`) : (await one('select coalesce(completed_on, current_date)::text as d from locations where id = $1', [lid])).d;
        if (await one("select 1 from groundwater where location_id = $1 and kind = 'strike' and depth_m = $2", [lid, depth])) continue;
        const row = await insert('groundwater', { location_id: lid, observed_on: date, kind: 'strike', depth_m: depth, note: r.WSTK_REM || '' });
        summary.water_added++;
        await log('import-gint', null, row);
      }
      // Index tests: one lab_test per sample and test, reported, method left for the engineer to confirm.
      const labGroups = [['LNMC', 'MC', { LNMC_MC: 'MC' }], ['LLPL', 'ATT', { LLPL_LL: 'LL', LLPL_PL: 'PL', LLPL_PI: 'PI' }]];
      for (const [group, test, fields] of labGroups) {
        for (const [i, r] of (g[group]?.rows || []).entries()) {
          const at = `${group} row ${i + 1}`;
          const lid = loc(r.LOCA_ID, at);
          const s = await one('select * from samples where location_id = $1 and ref = $2', [lid, String(r.SAMP_REF || '').toUpperCase()]);
          if (!s) throw new Error(`${at}: sample ${r.SAMP_REF} on ${r.LOCA_ID} is not in the SAMP group`);
          let t = await one('select * from lab_tests where sample_id = $1 and test = $2', [s.id, test]);
          if (!t) { t = await insert('lab_tests', { sample_id: s.id, test, method: r[`${group}_METH`] || '', status: 'reported' }); await log('import-gint', null, t); }
          for (const [col, parameter] of Object.entries(fields)) {
            if (r[col] === undefined || r[col] === '') continue;
            const row = await one('insert into lab_results (lab_test_id, parameter, value, units) values ($1, $2, $3, $4) on conflict (lab_test_id, parameter) do nothing returning *', [t.id, parameter, n(r[col], `${at} ${col}`), '%']);
            if (row) { summary.results_added++; await log('import-gint', null, row); }
          }
          if (s.status !== 'tested') await update('samples', s, { status: 'tested' });
        }
      }
      return {
        ...summary,
        notice: 'Locations, strata, SPTs, vanes, samples, water strikes and index test results come across. Strength, moisture and weathering are read from the description text: check /compliance for strata where they were not found. Logged-by, checked-by and services dates are not in AGS: add them per location.',
      };
    }
  } finally {
    await db.close();
  }

  // ---------------------------------------------------------------- output

  function print(value) {
    if (opts.json) { console.log(JSON.stringify(value, null, 2)); return; }
    const show = (rows) => {
      if (!rows.length) return '  (none)';
      return textTable(rows, Object.keys(rows[0]).map((k) => ({
        key: k, label: k, width: 70,
        format: (v) => (v === null || v === undefined ? '' : v instanceof Date ? v.toISOString().slice(0, 16).replace('T', ' ') : Array.isArray(v) ? `${v.length} item(s)` : typeof v === 'object' ? JSON.stringify(v) : v),
      })));
    };
    if (Array.isArray(value)) console.log(show(value));
    else if (value && Object.values(value).every(Array.isArray)) for (const [k, v] of Object.entries(value)) console.log(`\n${k}\n${show(v)}`);
    else console.log(show([value]));
  }
}

function mdTable(rows) {
  if (!rows.length) return '(none)';
  const cols = Object.keys(rows[0]);
  const cell = (v) => String(v ?? '').replace(/\|/g, '/').replace(/\n/g, ' ');
  return [`| ${cols.join(' | ')} |`, `|${cols.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${cols.map((c) => cell(r[c])).join(' | ')} |`)].join('\n');
}

function draft(name, body) {
  const dir = path.resolve(process.env.OUTPUT_DIR || REPO_ROOT, 'drafts');
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name);
  writeFileSync(file, body, { mode: 0o600 });
  return file;
}

if (/geotech\.mjs$/.test(process.argv[1] || '')) {
  main().catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
}
