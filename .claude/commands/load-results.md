---
description: Load a lab results file (one result per row: location, sample, test, parameter, value, units). Tests and the schedule close as results arrive.
---

Run `npm run geo -- load-results --file=<path> --schedule=<name> --actor=NAME --json`.

Confirm the change in one line. Run it with `--dry-run` first when the operator is unsure, and always pass `--actor` with their name.

If the lab sends results in another layout, reshape it into the long format first and show the operator the first five rows before loading.
