---
description: What needs attention today: rule checks, locations in the field, lab schedules waiting, piezometers due, sensitive soils and reports not issued.
---

Run `npm run geo -- attention --json`.

Present the result as a short table in plain words. If a name matches more than one record the command lists them: ask which one.

Lead with what holds up a report (logs not checked, lab results late, gaps in a log), then the field (services, coordinates, groundwater), then the paperwork (NZGD uploads, reports without a reviewer). For each line name the project and location, the rule and the next step, and offer the command that fixes it (check-log, set-coords, record-water, draft-lab-chase, upload-nzgd, issue-report).
