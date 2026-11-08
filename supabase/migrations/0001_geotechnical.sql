-- Geotechnical Data for Claude Code: clients, projects, exploratory locations (boreholes,
-- CPTs, test pits, hand augers), the strata log, SPT and shear vane tests, samples, lab
-- schedules and results, groundwater and piezometers, reports, and the audit trail.
-- Plain Postgres. Runs on any Postgres 13+ and on the embedded PGlite.

create table if not exists settings (
  key text primary key,
  value text not null,
  note text not null default ''
);

insert into settings (key, value, note) values
  ('log_check_days', '7', 'Days after a location is finished for a second person to check and sign off the field log.'),
  ('tube_schedule_days', '7', 'Days an undisturbed tube sample may wait before it is scheduled for testing. Tubes dry out and lose their structure.'),
  ('lab_receipt_days', '3', 'Days after a schedule is sent for the lab to confirm it has the samples.'),
  ('lab_results_days', '15', 'Days after the lab receives a schedule that results are expected, unless the schedule has its own due date.'),
  ('nzgd_upload_days', '30', 'Days after a location is finished to upload it to the New Zealand Geotechnical Database, on projects where the council or the client asks for it.'),
  ('piezo_read_days', '30', 'Default days between piezometer readings when an installation has no interval of its own.'),
  ('spt_refusal_blows', '50', 'Blows in one 150 mm increment, or the seating drive, at which the SPT is recorded as refusal.'),
  ('vane_sensitivity_flag', '8', 'Flag a shear vane where peak over remoulded strength is at or above this (extra sensitive soil).')
on conflict (key) do nothing;

create or replace function setting_num(k text) returns numeric language sql stable as
$$ select value::numeric from settings where key = k $$;

create or replace function touch_updated_at() returns trigger language plpgsql as
$$ begin new.updated_at = now(); return new; end $$;

-- The standard method each test is reported under, by country. Scheduling a test fills it in.
create table if not exists test_methods (
  country text not null check (country in ('NZ', 'AU')),
  test text not null,
  name text not null,
  method text not null,
  primary key (country, test)
);

insert into test_methods (country, test, name, method) values
  ('NZ', 'MC', 'Water content', 'NZS 4402:1986 Test 2.1'),
  ('NZ', 'ATT', 'Atterberg limits', 'NZS 4402:1986 Tests 2.2, 2.3, 2.4'),
  ('NZ', 'PSD', 'Particle size distribution', 'NZS 4402:1986 Test 2.8.1'),
  ('NZ', 'COMP', 'Standard compaction', 'NZS 4402:1986 Test 4.1.1'),
  ('NZ', 'CBR', 'California bearing ratio', 'NZS 4402:1986 Test 6.1.1'),
  ('NZ', 'UU', 'Unconsolidated undrained triaxial', 'ASTM D2850'),
  ('NZ', 'UCS', 'Unconfined compressive strength', 'ASTM D2166'),
  ('NZ', 'CON', 'One-dimensional consolidation', 'ASTM D2435'),
  ('AU', 'MC', 'Moisture content', 'AS 1289.2.1.1'),
  ('AU', 'ATT', 'Atterberg limits', 'AS 1289.3.1.2, 3.2.1, 3.3.1'),
  ('AU', 'PSD', 'Particle size distribution', 'AS 1289.3.6.1'),
  ('AU', 'HYD', 'Hydrometer', 'AS 1289.3.6.3'),
  ('AU', 'SG', 'Soil particle density', 'AS 1289.3.5.1'),
  ('AU', 'COMP', 'Standard compaction', 'AS 1289.5.1.1'),
  ('AU', 'CBR', 'California bearing ratio', 'AS 1289.6.1.1'),
  ('AU', 'UU', 'Unconsolidated undrained triaxial', 'ASTM D2850'),
  ('AU', 'UCS', 'Unconfined compressive strength', 'ASTM D2166'),
  ('AU', 'CON', 'One-dimensional consolidation', 'ASTM D2435')
on conflict do nothing;

create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  contact text not null default '',
  email text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null unique,
  client_id uuid references clients(id),
  site text not null default '',
  country text not null default 'NZ' check (country in ('NZ', 'AU')),
  coord_system text not null default 'NZTM2000',
  height_datum text not null default 'NZVD2016',
  lead_engineer text not null default '',
  nzgd_required boolean not null default false,
  status text not null default 'active' check (status in ('active', 'reporting', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists labs (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  code text not null unique,
  accreditation text not null default '',
  email text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists locations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id),
  name text not null,
  loc_type text not null check (loc_type in ('BH', 'CPT', 'TP', 'HA')),
  status text not null default 'planned' check (status in ('planned', 'in progress', 'complete', 'abandoned')),
  purpose text not null default '',
  method text not null default '',
  contractor text not null default '',
  planned_depth numeric,
  final_depth numeric,
  easting numeric,
  northing numeric,
  ground_level numeric,
  coord_method text not null default 'planned' check (coord_method in ('planned', 'measured from plan', 'handheld GPS', 'RTK GPS', 'total station')),
  services_checked_on date,
  started_on date,
  completed_on date,
  termination text not null default '',
  logged_by text,
  checked_by text,
  checked_on date,
  data_file text,
  nzgd_id text,
  nzgd_uploaded_on date,
  source_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, name)
);

create table if not exists strata (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id),
  from_m numeric not null check (from_m >= 0),
  to_m numeric not null,
  material text not null default 'soil' check (material in ('topsoil', 'fill', 'soil', 'rock')),
  legend text not null default '',
  description text not null default '',
  strength_density text,
  moisture text,
  plasticity text,
  weathering text,
  geology_unit text,
  logged_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (to_m > from_m)
);

create table if not exists spt_tests (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id),
  depth_m numeric not null,
  seat_blows int check (seat_blows >= 0),
  blows_2 int check (blows_2 >= 0),
  blows_3 int check (blows_3 >= 0),
  penetration_mm int not null default 450,
  n_value int,
  refusal boolean not null default false,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (location_id, depth_m)
);

create table if not exists vane_tests (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id),
  depth_m numeric not null,
  peak_kpa numeric not null check (peak_kpa >= 0),
  remoulded_kpa numeric check (remoulded_kpa >= 0),
  vane_id text not null default '',
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (location_id, depth_m)
);

create table if not exists schedules (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  project_id uuid not null references projects(id),
  lab_id uuid not null references labs(id),
  sent_on date not null,
  received_on date,
  due_on date,
  results_on date,
  lab_job text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists samples (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id),
  ref text not null,
  sample_type text not null check (sample_type in ('U', 'D', 'B', 'C', 'W', 'ENV')),
  from_m numeric not null,
  to_m numeric,
  taken_on date,
  status text not null default 'held' check (status in ('held', 'scheduled', 'tested', 'disposed')),
  note text not null default '',
  source_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (location_id, ref)
);

create table if not exists lab_tests (
  id uuid primary key default gen_random_uuid(),
  sample_id uuid not null references samples(id),
  schedule_id uuid references schedules(id),
  test text not null check (test in ('MC', 'ATT', 'PSD', 'HYD', 'UCS', 'UU', 'CON', 'CBR', 'SG', 'COMP')),
  method text not null default '',
  status text not null default 'scheduled' check (status in ('scheduled', 'reported', 'cancelled')),
  reported_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sample_id, test)
);

create table if not exists lab_results (
  id uuid primary key default gen_random_uuid(),
  lab_test_id uuid not null references lab_tests(id),
  parameter text not null,
  value numeric,
  units text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lab_test_id, parameter)
);

create table if not exists installations (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id),
  kind text not null default 'standpipe piezometer' check (kind in ('standpipe piezometer', 'vibrating wire piezometer', 'inclinometer', 'monitoring well')),
  screen_top numeric,
  screen_base numeric,
  installed_on date not null,
  read_every_days int,
  decommissioned_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists groundwater (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id),
  installation_id uuid references installations(id),
  observed_on date not null,
  kind text not null check (kind in ('strike', 'standing', 'not encountered', 'reading')),
  depth_m numeric,
  read_by text,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind = 'not encountered' or depth_m is not null)
);

create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id),
  name text not null unique,
  kind text not null default 'factual' check (kind in ('factual', 'interpretive', 'geotechnical baseline', 'letter')),
  revision text not null default 'A',
  author text not null,
  reviewer text,
  status text not null default 'draft' check (status in ('draft', 'in review', 'issued')),
  issued_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists events (
  id bigserial primary key,
  actor text not null,
  action text not null,
  record_id uuid,
  before_record jsonb,
  after_record jsonb,
  created_at timestamptz not null default now()
);

create or replace function events_append_only() returns trigger language plpgsql as
$$ begin raise exception 'The audit trail is append-only'; end $$;

drop trigger if exists events_no_change on events;
create trigger events_no_change before update or delete on events
  for each row execute function events_append_only();

do $$
declare t text;
begin
  foreach t in array array['clients', 'projects', 'labs', 'locations', 'strata', 'spt_tests', 'vane_tests', 'schedules', 'samples', 'lab_tests', 'lab_results', 'installations', 'groundwater', 'reports'] loop
    execute format('drop trigger if exists %I_touch on %I', t, t);
    execute format('create trigger %I_touch before update on %I for each row execute function touch_updated_at()', t, t);
  end loop;
end $$;

create index if not exists strata_location on strata (location_id, from_m);
create index if not exists samples_location on samples (location_id, from_m);
create index if not exists lab_tests_schedule on lab_tests (schedule_id);
create index if not exists groundwater_location on groundwater (location_id, observed_on);

-- ---------------------------------------------------------------- views

-- The SPT N value is the blows for the second and third 150 mm after the 150 mm seating drive.
create or replace view spt_results as
select t.id as spt_id, l.id as location_id, l.name as location, p.code as project, t.depth_m, t.seat_blows, t.blows_2, t.blows_3,
       t.n_value as recorded_n,
       case when t.refusal or t.blows_2 is null or t.blows_3 is null then null else t.blows_2 + t.blows_3 end as calculated_n,
       t.refusal, t.penetration_mm,
       case when t.refusal then 'refusal at ' || t.penetration_mm || ' mm'
            when t.blows_2 is null or t.blows_3 is null then 'increments not recorded'
            when t.blows_2 + t.blows_3 is distinct from t.n_value then 'recorded N does not match the blows'
            else 'ok' end as check_result
from spt_tests t join locations l on l.id = t.location_id join projects p on p.id = l.project_id;

create or replace view vane_results as
select v.id as vane_id, l.id as location_id, l.name as location, p.code as project, v.depth_m, v.peak_kpa, v.remoulded_kpa,
       case when v.remoulded_kpa > 0 then round(v.peak_kpa / v.remoulded_kpa, 1) end as sensitivity, v.vane_id as vane
from vane_tests v join locations l on l.id = v.location_id join projects p on p.id = l.project_id;

create or replace view strata_gaps as
with s as (
  select st.location_id, st.from_m, st.to_m,
         lag(st.to_m) over (partition by st.location_id order by st.from_m, st.to_m) as prev_to
  from strata st
)
select l.id as location_id, l.name as location, p.code as project,
       case when s.prev_to is null and s.from_m > 0 then 'gap'
            when s.prev_to < s.from_m then 'gap'
            when s.prev_to > s.from_m then 'overlap' end as kind,
       coalesce(s.prev_to, 0) as from_m, s.from_m as to_m
from s join locations l on l.id = s.location_id join projects p on p.id = l.project_id
where (s.prev_to is null and s.from_m > 0) or s.prev_to <> s.from_m;

create or replace view schedule_status as
select sc.id as schedule_id, sc.name as schedule, p.code as project, lb.name as lab, sc.sent_on, sc.received_on,
       coalesce(sc.due_on, sc.received_on + setting_num('lab_results_days')::int) as due_on, sc.results_on, sc.lab_job,
       (select count(*) from lab_tests t where t.schedule_id = sc.id and t.status <> 'cancelled')::int as tests,
       (select count(*) from lab_tests t where t.schedule_id = sc.id and t.status = 'reported')::int as reported,
       case when sc.results_on is not null then 'results in' when sc.received_on is not null then 'at the lab' else 'in transit' end as stage,
       (current_date - coalesce(sc.results_on, sc.received_on, sc.sent_on))::int as days_in_stage
from schedules sc join projects p on p.id = sc.project_id join labs lb on lb.id = sc.lab_id;

create or replace view location_status as
select l.id as location_id, l.name as location, p.code as project, l.loc_type as type, l.status, l.planned_depth, l.final_depth,
       l.coord_method, l.started_on, l.completed_on, l.logged_by, l.checked_by, l.checked_on,
       coalesce((select sum(s.to_m - s.from_m) from strata s where s.location_id = l.id), 0) as metres_logged,
       (select count(*) from spt_tests t where t.location_id = l.id)::int as spts,
       (select count(*) from vane_tests v where v.location_id = l.id)::int as vanes,
       (select count(*) from samples s where s.location_id = l.id)::int as samples,
       (select count(*) from lab_tests t join samples s on s.id = t.sample_id where s.location_id = l.id and t.status = 'scheduled')::int as tests_pending,
       (select count(*) from groundwater g where g.location_id = l.id and g.kind <> 'reading')::int as water_records,
       case when not p.nzgd_required then 'not required' when l.nzgd_uploaded_on is not null then 'uploaded' else 'to upload' end as nzgd
from locations l join projects p on p.id = l.project_id;

create or replace view monitoring_status as
select i.id as installation_id, l.name as location, p.code as project, i.kind, i.screen_top, i.screen_base, i.installed_on,
       coalesce(i.read_every_days, setting_num('piezo_read_days')::int) as read_every_days,
       (select max(g.observed_on) from groundwater g where g.installation_id = i.id) as last_read_on,
       (select g.depth_m from groundwater g where g.installation_id = i.id order by g.observed_on desc limit 1) as last_depth_m,
       coalesce((select max(g.observed_on) from groundwater g where g.installation_id = i.id), i.installed_on)
         + coalesce(i.read_every_days, setting_num('piezo_read_days')::int) as next_due_on
from installations i join locations l on l.id = i.location_id join projects p on p.id = l.project_id
where i.decommissioned_on is null;

-- One row per tested sample with the common index results side by side.
create or replace view lab_summary as
select p.code as project, l.name as location, s.ref as sample, s.sample_type as type, s.from_m, s.to_m,
       (select st.legend from strata st where st.location_id = l.id and st.from_m <= s.from_m and st.to_m > s.from_m limit 1) as legend,
       max(case when r.parameter = 'MC' then r.value end) as mc_pct,
       max(case when r.parameter = 'LL' then r.value end) as ll,
       max(case when r.parameter = 'PL' then r.value end) as pl,
       max(case when r.parameter = 'PI' then r.value end) as pi,
       max(case when r.parameter = 'FINES' then r.value end) as fines_pct,
       max(case when r.parameter = 'UCS' then r.value end) as ucs_kpa,
       max(case when r.parameter = 'CU' then r.value end) as cu_kpa,
       max(case when r.parameter = 'CBR' then r.value end) as cbr_pct
from samples s join locations l on l.id = s.location_id join projects p on p.id = l.project_id
join lab_tests t on t.sample_id = s.id and t.status = 'reported' join lab_results r on r.lab_test_id = t.id
group by p.code, l.id, l.name, s.ref, s.sample_type, s.from_m, s.to_m;

create or replace view compliance_issues as
-- Field description: soil needs strength or density and moisture; rock needs strength and weathering.
select 'FD_SOIL' as rule, l.name as subject, p.code as project,
       'Stratum ' || st.from_m || ' to ' || st.to_m || ' m has no ' ||
       concat_ws(' or ', case when st.strength_density is null or st.strength_density = '' then 'strength or density' end,
                         case when st.moisture is null or st.moisture = '' then 'moisture' end) as issue
from strata st join locations l on l.id = st.location_id join projects p on p.id = l.project_id
where st.material in ('soil', 'fill') and (coalesce(st.strength_density, '') = '' or coalesce(st.moisture, '') = '')
union all
select 'FD_ROCK', l.name, p.code,
       'Rock ' || st.from_m || ' to ' || st.to_m || ' m has no ' ||
       concat_ws(' or ', case when coalesce(st.weathering, '') = '' then 'weathering' end, case when coalesce(st.strength_density, '') = '' then 'strength' end)
from strata st join locations l on l.id = st.location_id join projects p on p.id = l.project_id
where st.material = 'rock' and (coalesce(st.weathering, '') = '' or coalesce(st.strength_density, '') = '')
union all
-- The log runs continuously from the surface to the final depth.
select 'LOG_CONTINUOUS', g.location, g.project, initcap(g.kind) || ' in the log from ' || g.from_m || ' to ' || g.to_m || ' m'
from strata_gaps g
union all
select 'LOG_CONTINUOUS', l.name, p.code, 'Log ends at ' || coalesce(max(st.to_m), 0) || ' m but the final depth is ' || l.final_depth || ' m'
from locations l join projects p on p.id = l.project_id left join strata st on st.location_id = l.id
where l.loc_type in ('BH', 'TP', 'HA') and l.status in ('complete', 'abandoned') and l.final_depth is not null
group by l.id, l.name, p.code, l.final_depth having coalesce(max(st.to_m), 0) <> l.final_depth
union all
-- A second person checks the field log.
select 'LOG_CHECK', l.name, p.code, 'Finished ' || l.completed_on || ', log not checked after ' || (current_date - l.completed_on) || ' days'
from locations l join projects p on p.id = l.project_id
where l.loc_type in ('BH', 'TP', 'HA') and l.status in ('complete', 'abandoned') and l.checked_on is null
  and current_date - l.completed_on > setting_num('log_check_days')
union all
select 'LOG_CHECK', l.name, p.code, 'Checked by the person who logged it (' || l.logged_by || ')'
from locations l join projects p on p.id = l.project_id
where l.checked_by is not null and lower(l.checked_by) = lower(coalesce(l.logged_by, ''))
union all
-- Services located before breaking ground.
select 'SERVICES', l.name, p.code,
       case when l.services_checked_on is null then 'Started ' || l.started_on || ' with no services check recorded'
            else 'Services checked ' || l.services_checked_on || ', after the start on ' || l.started_on end
from locations l join projects p on p.id = l.project_id
where l.status <> 'planned' and l.started_on is not null and (l.services_checked_on is null or l.services_checked_on > l.started_on)
union all
-- Finished locations carry surveyed coordinates and a ground level.
select 'COORDS', l.name, p.code,
       case when l.coord_method = 'planned' then 'Coordinates are still the planned position' else 'No ground level recorded' end
from locations l join projects p on p.id = l.project_id
where l.status in ('complete', 'abandoned') and (l.coord_method = 'planned' or l.easting is null or l.ground_level is null)
union all
-- Every log says what happened with groundwater, including "not encountered".
select 'GROUNDWATER', l.name, p.code, 'No groundwater observation recorded, not even "not encountered"'
from locations l join projects p on p.id = l.project_id
where l.loc_type in ('BH', 'TP', 'HA') and l.status in ('complete', 'abandoned')
  and not exists (select 1 from groundwater g where g.location_id = l.id and g.kind <> 'reading')
union all
-- SPT N is the sum of the second and third increments.
select 'SPT_N', r.location, r.project, 'SPT at ' || r.depth_m || ' m: recorded N=' || coalesce(r.recorded_n::text, 'blank') || ', blows give N=' || r.calculated_n
from spt_results r where r.check_result = 'recorded N does not match the blows'
union all
select 'SPT_N', l.name, p.code, 'SPT at ' || t.depth_m || ' m: ' || greatest(coalesce(t.seat_blows, 0), coalesce(t.blows_2, 0), coalesce(t.blows_3, 0)) || ' blows in one increment without being recorded as refusal'
from spt_tests t join locations l on l.id = t.location_id join projects p on p.id = l.project_id
where not t.refusal and greatest(coalesce(t.seat_blows, 0), coalesce(t.blows_2, 0), coalesce(t.blows_3, 0)) >= setting_num('spt_refusal_blows')
union all
-- Shear vane: a remoulded reading so sensitivity can be stated.
select 'VANE', v.location, v.project, 'Vane at ' || v.depth_m || ' m has no remoulded reading, so sensitivity cannot be stated'
from vane_results v where v.remoulded_kpa is null
union all
-- Undisturbed tubes are scheduled before they dry out.
select 'TUBE_SCHEDULE', l.name, p.code, 'Tube ' || s.ref || ' at ' || s.from_m || ' m taken ' || s.taken_on || ', not scheduled after ' || (current_date - s.taken_on) || ' days'
from samples s join locations l on l.id = s.location_id join projects p on p.id = l.project_id
where s.sample_type = 'U' and s.status = 'held' and s.taken_on is not null and current_date - s.taken_on > setting_num('tube_schedule_days')
  and not exists (select 1 from lab_tests t where t.sample_id = s.id and t.status <> 'cancelled')
union all
-- Lab tests state the standard method and come from an accredited lab.
select 'LAB_METHOD', l.name, p.code, 'Test ' || t.test || ' on ' || s.ref || ' has no test method stated'
from lab_tests t join samples s on s.id = t.sample_id join locations l on l.id = s.location_id join projects p on p.id = l.project_id
where t.status <> 'cancelled' and coalesce(t.method, '') = ''
union all
select 'LAB_ACCREDITED', ss.lab, ss.project, 'Schedule ' || ss.schedule || ' went to a lab with no accreditation number on file'
from schedule_status ss join schedules sc on sc.id = ss.schedule_id join labs lb on lb.id = sc.lab_id where coalesce(lb.accreditation, '') = ''
union all
select 'LAB_RECEIPT', ss.schedule, ss.project, 'Sent to ' || ss.lab || ' ' || ss.sent_on || ', no receipt after ' || ss.days_in_stage || ' days'
from schedule_status ss where ss.stage = 'in transit' and ss.days_in_stage > setting_num('lab_receipt_days')
union all
select 'LAB_LATE', ss.schedule, ss.project, 'Results were due ' || ss.due_on || ' from ' || ss.lab || ': ' || ss.reported || ' of ' || ss.tests || ' tests in'
from schedule_status ss where ss.stage = 'at the lab' and ss.due_on < current_date
union all
-- Piezometers are read on their interval.
select 'PIEZO_DUE', m.location, m.project, upper(left(m.kind, 1)) || substr(m.kind, 2) || ' reading due ' || m.next_due_on || ' (last read ' || coalesce(m.last_read_on::text, 'never') || ')'
from monitoring_status m where m.next_due_on < current_date
union all
-- NZGD upload where the council asks for it.
select 'NZGD', l.name, p.code, 'Finished ' || l.completed_on || ', not uploaded to the NZ Geotechnical Database after ' || (current_date - l.completed_on) || ' days'
from locations l join projects p on p.id = l.project_id
where p.nzgd_required and l.status in ('complete', 'abandoned') and l.nzgd_uploaded_on is null
  and current_date - l.completed_on > setting_num('nzgd_upload_days')
union all
-- Reports are reviewed by someone other than the author before issue.
select 'REPORT_REVIEW', r.name, p.code,
       case when r.reviewer is null or r.reviewer = '' then 'Issued ' || r.issued_on || ' with no reviewer recorded' else 'Reviewed by its own author (' || r.author || ')' end
from reports r join projects p on p.id = r.project_id
where r.status = 'issued' and (coalesce(r.reviewer, '') = '' or lower(r.reviewer) = lower(r.author));
