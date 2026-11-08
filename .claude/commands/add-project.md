---
description: Add a project with its client, site, country, coordinate system, height datum, lead engineer and whether the council wants NZGD upload.
---

Run `npm run geo -- add-project --code=<CODE> --name="…" --client="…" --site="…" --country=<NZ|AU> --lead="…" --nzgd=<yes|no> --actor=NAME --json`.

Confirm the change in one line. Run it with `--dry-run` first when the operator is unsure, and always pass `--actor` with their name.
