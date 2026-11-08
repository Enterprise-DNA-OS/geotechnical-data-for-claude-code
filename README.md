<h1 align="center">Geotechnical Data for Claude Code</h1>

<p align="center">
  <strong>The open-source geotechnical site investigation database that is just a database and Claude Code.</strong>
</p>

<p align="center">
  Created by <a href="https://www.enterprisedna.co"><strong>Enterprise DNA</strong></a>. Free and open source. Works with Claude Code, Codex, OpenCode or Cursor.
</p>

<!-- three-doors -->
<table align="center">
  <tr>
    <td align="center"><strong>Do it yourself</strong><br/>Clone it, run it, own it. Free, MIT.<br/><a href="#quick-start">Quick start</a></td>
    <td align="center"><strong>We customise it</strong><br/>Your fields, your rules, your gINT data brought across.<br/><a href="https://enterprisedna.co/omni/book/?utm_source=github&utm_medium=readme&utm_campaign=gint">Book a call</a></td>
    <td align="center"><strong>We run it for you</strong><br/>Installed, connected and operated inside Omni. Setup fee, then a retainer.<br/><a href="https://enterprisedna.co/omni/instead-of/gint?utm_source=github&utm_medium=readme&utm_campaign=gint">How it works</a></td>
  </tr>
</table>

<p align="center">
  <a href="#what-is-this">What is this</a> &bull;
  <a href="#why-no-front-end">Why no front end</a> &bull;
  <a href="#quick-start">Quick start</a> &bull;
  <a href="#the-commands">Commands</a> &bull;
  <a href="#instead-of-gint">Instead of gINT</a> &bull;
  <a href="#want-it-installed-and-run-for-you">Installed for you</a> &bull;
  <a href="#license">License</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node-20+-339933?style=flat-square" alt="Node 20+" />
  <img src="https://img.shields.io/badge/PostgreSQL-any-336791?style=flat-square" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/PGlite-embedded-3ecf8e?style=flat-square" alt="PGlite" />
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=flat-square" alt="MIT License" />
</p>

---

## What is this

Geotechnical Data for Claude Code does the job you pay gINT for, as a Postgres database and a set of agent commands. There is no web front end. You open the folder in [Claude Code](https://claude.com/claude-code) (or Codex, OpenCode, Cursor: see `AGENTS.md`) and ask for what you want in plain language. It runs the right query, and it can answer questions the gINT dashboard cannot.

Bentley's own Australian store lists gINT at AU$1,040 a year for gINT Logs, AU$3,360 for gINT Professional and AU$4,675 for gINT Professional Plus, each a 12-month subscription for one named user ([bentley.com/en/products/gint](https://www.bentley.com/en/products/gint/), checked 8 November 2026). The same page says gINT is being retired and points to OpenGround, which is sold as a cloud service (AU$3,595 to AU$19,055 on Bentley's store, depending on the number of exploratory locations and whether you need the API) plus a user subscription for each person (AU$365 Base or AU$1,055 Advanced) ([bentley.com/en/products/openground](https://www.bentley.com/en/products/openground/)). A practice with twenty engineers and geologists pays that for every one of them, every year.

Want the same thing with a web front end, or built on a different stack? That is a customisation, and it is exactly what Enterprise DNA does: [book a call](https://enterprisedna.co/omni/book/?utm_source=github&utm_medium=readme&utm_campaign=gint).

It covers what a geotechnical practice does on every job: projects and clients, boreholes, CPTs, test pits and hand augers, the strata log, SPTs and shear vanes, samples, lab test schedules and results, groundwater and piezometer monitoring, log checking, NZ Geotechnical Database uploads, and the factual report tables. It is built for engineering consultancies in New Zealand and Australia, and `/compliance` checks your records against the NZGS Field Description of Soil and Rock, AS 1726-2017, the SPT and shear vane methods, the underground services duty and your own house rules, with the source for each.

## Why no front end

- The front end was only ever there because the database was hard to talk to. That is no longer true.
- Your data sits in plain Postgres tables you own. Any tool can read them. No export, no lock-in.
- No seats, no tiers, no add-ons. Read [docs/why-no-front-end.md](docs/why-no-front-end.md) for the honest trade-offs too.

## Quick start

Sixty seconds, no database install (an embedded Postgres runs inside Node):

```bash
git clone https://github.com/Enterprise-DNA-OS/geotechnical-data-for-claude-code.git
cd geotechnical-data-for-claude-code
npm install
npm run demo
```

Then open the folder in Claude Code and type `/attention`. It answers from three demo projects in Takapuna, Christchurch and Brisbane: an SPT whose recorded N does not match its blows, a hand auger with a gap in its log, a borehole log nobody has checked after 14 days, a tube sample 15 days old and not scheduled, a lab schedule ten days past due, a borehole started with no services check, a CPT not yet on the NZ Geotechnical Database, a piezometer reading overdue and a factual report issued with no reviewer.

### Use it with your own Postgres or Supabase

Copy `.env.example` to `.env`, set `DATABASE_URL`, then `npm run migrate`. Same commands, shared data, no per-seat fee.

## The commands

Every command drives one CLI, `npm run geo -- <command>` (`--json` for machines, `help` for every flag). A location is `PROJECT/NAME` (`HV26/BH01`), or just the name when only one project has it. Changes take `--actor` and `--dry-run`, and land in an audit trail nobody can edit.

**Every day**

| Command | What it does |
|---|---|
| `/attention` | What needs attention today: rule checks, locations in the field, lab schedules waiting, piezometers due, sensitive soils and reports not issued. |
| `/locations` | Every borehole, CPT, test pit and hand auger with status, depth, metres logged, tests, samples, coordinates, who checked the log and NZGD state. |
| `/location` | Everything about one location: position, strata, SPTs, vanes, samples and their tests, groundwater and open rule checks. |
| `/log` | The strata log for one location, with any gaps or overlaps. |
| `/pending` | Lab results still to come, and undisturbed tubes not yet scheduled. |
| `/projects` | Every project with client, country, coordinate system, lead engineer and NZGD requirement. |

**In the field**

| Command | What it does |
|---|---|
| `/plan-location` | Add a planned borehole, CPT, test pit or hand auger with purpose, target depth and planned position. |
| `/services-checked` | Record the date the underground services were located. |
| `/start-location` | Mark a location started. Warns when no services check came first. |
| `/log-stratum` | Log one stratum with material, legend, description, strength or density, moisture, plasticity, weathering and unit. Refused if it overlaps; warns if the description is short of what the guideline asks. |
| `/add-spt` | Record an SPT as seating drive and two increments. N is worked out and refusal detected. |
| `/add-vane` | Record a hand shear vane, peak and remoulded. Sensitivity is worked out. |
| `/add-sample` | Record a sample: U tube, disturbed, bulk, core, water or environmental. |
| `/record-water` | Record a water strike, a standing level, or "not encountered". |
| `/complete-location`, `/abandon-location` | Finish a location at its final depth with the reason. Refused if records go deeper. Lists the checks still open. |
| `/set-coords` | Record the surveyed position, ground level and survey method. |
| `/check-log` | Second-person sign-off of a finished log. Refused for the logger and while description, continuity, SPT, vane or groundwater checks are open. |

**Monitoring**

| Command | What it does |
|---|---|
| `/install` | Record a piezometer, monitoring well or inclinometer with screen depths and reading interval. |
| `/read-piezo` | Record a reading. Shows when the next one is due. |
| `/monitoring` | Every active installation, last reading, next due, overdue or not. |

**Lab**

| Command | What it does |
|---|---|
| `/schedule-tests` | Make a test schedule from samples and tests. The NZS 4402 or AS 1289 method for the project's country is filled in. |
| `/receive` | Record the lab's receipt and job number. Shows when results are due. |
| `/load-results` | Load a lab results file. Tests and the schedule close as results arrive. |
| `/lab-results` | Moisture content, Atterberg limits, fines, strengths and CBR side by side, with the stratum legend. |
| `/insitu` | SPT and shear vane results for a project or location, with N and sensitivity checked. |
| `/schedules`, `/schedule` | Every schedule with its dates and stage; one schedule with every test on it. |
| `/labs`, `/add-lab` | Laboratories with their IANZ or NATA accreditation number. |
| `/methods`, `/set-method` | The standard method for each test by country. |
| `/draft-lab-chase` | Draft a follow-up to the lab about a schedule with no receipt or results late. |

**Reporting and the NZGD**

| Command | What it does |
|---|---|
| `/factual-tables` | Lay out the factual report tables for a project: location schedule, strata, SPT, vane, groundwater, lab results and open checks. |
| `/reports`, `/add-report` | Reports with kind, revision, author, reviewer and status. |
| `/issue-report` | Record a report issued. Refused without a reviewer who is not the author. |
| `/draft-client-update` | Draft a progress update to the client from the records. |
| `/nzgd`, `/upload-nzgd` | What is uploaded, due or overdue on the NZ Geotechnical Database, and recording an upload. |
| `/export-ags` | Write a project to AGS4 for the NZGD, the client or the next consultant. |

**Monday and the rules**

| Command | What it does |
|---|---|
| `/weekly-review` | The Monday review: locations finished, metres by contractor, results in, schedules waiting, logs to check, reports, piezometers and rule checks by rule. |
| `/compliance` | Check the records against the field description guidelines, the SPT and vane methods, the services duty, lab method and accreditation, NZGD and your house rules, with the source for each. |

**Setup and data**

| Command | What it does |
|---|---|
| `/add-project`, `/clients`, `/add-client` | Projects with client, site, country, coordinate system, height datum and NZGD requirement. |
| `/settings`, `/set` | House limits: days to check a log, schedule a tube, get lab results, upload to the NZGD, read a piezometer; SPT refusal and vane sensitivity. |
| `/activity` | The audit trail: who changed what, when. |
| `/import` | Bring locations, strata, SPTs, vanes, samples, water strikes and index tests across from a gINT AGS4 export. |
| `/export` | Write every record to one JSON archive. |
| `/customise` | Make this system yours in plain language. Add a field, change a limit, add a lab test or an AGS group. Writes the migration, applies it, updates the commands that touch it. |
| `/new-view` | Add a read-only HTML view from a plain-language description, rendered in your brand by `npm run view`. |

Documents, in your brand from `brand.json`: `npm run docs` renders a borehole log for every borehole, test pit and hand auger, a laboratory test schedule for every schedule (with a receipt block for the lab to sign), and a factual summary for every project. `npm run view` renders three read-only pages: this week, laboratory, and locations.

## Ten questions gINT does not answer

1. Which SPTs have a recorded N that does not match their blows? (`/insitu`, `/compliance`)
2. Which logs finished more than a week ago has nobody checked, and which were checked by the person who logged them? (`/attention`)
3. Which undisturbed tubes have been sitting more than seven days without a lab schedule? (`/pending`)
4. Which lab schedules are past due, and which tests on them are still to come? Draft the chase. (`/pending`, `/draft-lab-chase`)
5. Which locations started before anyone recorded a services check? (`/compliance`)
6. Which finished locations still sit at their planned position, or have no groundwater record at all? (`/compliance`)
7. Which soft soils have a vane sensitivity of 8 or more, on every job this year? (`/attention`, `/insitu`)
8. What is still to upload to the NZ Geotechnical Database, and can I have the AGS file? (`/nzgd`, `/export-ags`)
9. How many metres did each drilling contractor do last month? (`/weekly-review`)
10. Which reports went out without a reviewer, and what is still in review? (`/reports`, `/compliance`)

## Your first hour: ten things to ask for

1. "Put our practice name and logo on every log." (`brand.json`)
2. "Add the Harbour View project for Kowhai Developments, NZTM2000, Mere Tane leading." (`/add-project`)
3. "Bring across this gINT export." (`/import`)
4. "What needs attention today?" (`/attention`)
5. "Log BH03 from this field sheet." (`/log-stratum`, `/add-spt`, `/add-sample`)
6. "Schedule moisture content and Atterberg limits on every U tube from BH02." (`/schedule-tests`)
7. "Load this results file from the lab." (`/load-results`)
8. "Lay out the factual report tables for HS3." (`/factual-tables`)
9. "Add a pocket penetrometer reading to the strata log." (`/customise`)
10. "Write Monday's review for the principal." (`/weekly-review`)

## Instead of gINT

Bentley is retiring gINT, so the move is coming either way. Export the project from gINT as AGS4, preview with `npm run geo -- import gint --file=imports/HV26.ags --project=HV26 --actor="Your name" --dry-run`, then load it. Locations, strata, SPTs, vanes, samples, water strikes and index test results come across; logged-by, checked-by and services dates need a step each, because AGS has no place for them. The full guide, with the group mapping: [docs/replace-gint.md](docs/replace-gint.md).

What the checks are based on: [docs/compliance.md](docs/compliance.md).

## Architecture

```
geotechnical-data-for-claude-code/
  CLAUDE.md                 how the operator wants this run (routing table + house rules)
  AGENTS.md                 the same, for Codex / OpenCode / Cursor / Gemini CLI
  .claude/commands/         the slash commands
  scripts/geotech.mjs       the one CLI the commands drive
  documents.json            borehole log, laboratory test schedule, factual summary
  views.json                this week, laboratory, locations
  fixtures/                 a gINT AGS4 export and a lab results file for the demo and tests
  scripts/lib/db.mjs        one adapter: DATABASE_URL (pg) or embedded PGlite
  supabase/migrations/      plain SQL schema
  supabase/seed.sql         demo data
  docs/                     the thesis and the migration guide
```

## Built for coding agents

The database, CLI and command recipes work with Claude Code, Codex, OpenCode or Cursor. Ask your coding agent for a new command and have it implement and test the change against the same records.

## Contributing

Issues and pull requests are welcome. Keep the shape: plain SQL, a small CLI, a slash command per recurring job, no front end.

## Want it installed and run for you?

Enterprise DNA installs Geotechnical Data for Claude Code for your business, migrates your gINT data, connects it to the rest of your tools, and runs it for you as part of **Omni**, our managed Command Center. One setup fee, then a monthly retainer.

- Book a call: [enterprisedna.co/omni/book](https://enterprisedna.co/omni/book/?offer=replace-software&utm_source=github&utm_medium=readme&utm_campaign=gint)
- Read more: [enterprisedna.co/omni/instead-of/gint](https://enterprisedna.co/omni/instead-of/gint?utm_source=github&utm_medium=readme&utm_campaign=gint)

## License

MIT. Copyright (c) 2026 Enterprise DNA.
