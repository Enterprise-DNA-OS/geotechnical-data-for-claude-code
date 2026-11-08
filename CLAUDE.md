# Geotechnical Data for Claude Code: operating instructions

This file is the brain. Claude Code reads it at the start of every session. It says who this is for, how work gets done, and the one right way to do each recurring job.

## Who this is for

- **Business:** [YOUR BUSINESS]
- **Operator:** [YOUR NAME], [your role]
- **What matters most:** [the one or two outcomes you care about]

Fill this in once. A worker with context knows. A worker without it guesses.

## How to work

1. **Take a brief, not a script.** The operator describes the outcome. You run the right command and present the answer.
2. **Read before you write.** Before drafting anything about a record, read its full history first.
3. **Plain language.** Short sentences. No filler. Numbers in tables.
4. **Silent success, loud problems.** No play-by-play. Say what broke and what you did about it.
5. **Stop at the line.** Anything that sends, deletes, or faces a customer waits for a yes in this session.

## Routing table: one right way for each recurring job

| When the operator asks for... | Use this |
|---|---|
| What needs attention, what is overdue | `/attention` |
| The Monday review | `/weekly-review` |
| Where a location is up to | `/location`, `/locations`, `/log` |
| A new borehole, CPT, test pit or hand auger | `/plan-location`, `/services-checked`, then `/start-location` |
| The logger reads out the field sheet | `/log-stratum` for each stratum, `/add-spt`, `/add-vane`, `/add-sample`, `/record-water` |
| The location is finished | `/complete-location` (or `/abandon-location`), `/set-coords` |
| Sign off a log | `/check-log` (a second person) |
| A piezometer goes in, or is read | `/install`, `/read-piezo`, `/monitoring` |
| Samples go to the lab | `/schedule-tests`, then `npm run docs -- test-schedule` |
| The lab confirms receipt | `/receive` |
| Results arrive | `/load-results`, then `/lab-results` |
| The lab is slow | `/pending`, `/draft-lab-chase` |
| SPT and vane results | `/insitu` |
| The factual report | `/factual-tables`, then `npm run docs -- factual-summary` and `npm run docs -- borehole-log` |
| A report goes out | `/add-report`, `/issue-report` |
| Update the client | `/draft-client-update` |
| NZ Geotechnical Database | `/nzgd`, `/export-ags`, `/upload-nzgd` |
| Are we meeting the guidelines | `/compliance` |
| New project, client or lab | `/add-project`, `/add-client`, `/add-lab` |
| A test method or a house limit changes | `/methods`, `/set-method`, `/settings`, `/set` |
| Bring gINT data across | `/import` |
| Who changed what | `/activity` |
| Change a field, rule or table | `/customise` |
| A new page to look at | `/new-view` |

If an ask fits nothing here, run the CLI directly (`npm run geo -- help`) and then propose a new command for it.

## Hard rules

- Never send email or messages from here. Draft to `drafts/`, a person sends.
- Never delete records without an explicit yes in this session. Prefer marking closed or archived.
- Never invent a record. If a name is ambiguous, list the candidates and ask.
- The database is the source of truth. If the answer is not in it, say so.
- Never invent or adjust a depth, a blow count, a strength, a coordinate or a lab result. Field values come from the logger's sheet; results come from the lab's file.
- A log is signed off by someone other than the logger, and only once its checks are clear. Never record a check on someone's behalf without their name from the operator.
- Reports are not issued from here without a named reviewer who is not the author. Drafts for a factual or interpretive report go to `drafts/` for the engineer.
- Never upload to the NZ Geotechnical Database or send a file to a client from here. Write the AGS file; a person uploads or sends it.

## Where things live

- `scripts/` the CLI. `scripts/lib/db.mjs` picks `DATABASE_URL` (Postgres, Supabase) or the embedded database in `.data/`.
- `supabase/migrations/` the schema, plain SQL. `npm run migrate` applies it.
- `.claude/commands/` the slash commands. Add one every time the same ask comes twice.
- `docs/` the thesis, the rules and their sources (`compliance.md`), and the guide for moving off gINT.

Built by Enterprise DNA. Installed and run for you as part of Omni: https://enterprisedna.co/omni/instead-of/gint
