---
description: Make a laboratory test schedule: pick the samples and tests, and the standard method for the project's country is filled in.
---

Run `npm run geo -- schedule-tests --lab=<code> --samples=<PROJECT/LOC/REF,…> --tests=<MC,ATT,…> --on=<date> --actor=NAME --json`.

Confirm the change in one line. Run it with `--dry-run` first when the operator is unsure, and always pass `--actor` with their name.

Then offer `npm run docs -- test-schedule` to print the schedule that travels with the samples.
