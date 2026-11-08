---
description: Mark a location finished at its final depth, with the reason it stopped. Refused if records go deeper. Shows the checks still open.
---

Run `npm run geo -- complete-location --location=<PROJECT/NAME> --depth=<m> --on=<date> --termination="Target depth" --actor=NAME --json`.

Confirm the change in one line. Run it with `--dry-run` first when the operator is unsure, and always pass `--actor` with their name.

List the open checks it returns and offer to clear each one.
