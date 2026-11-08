---
description: Bring locations, strata, SPTs, vanes, samples, water strikes and index test results across from a gINT AGS4 export.
---

Run `npm run geo -- import gint --file=<export.ags> --project=<CODE> --actor=NAME --json`.

Run it with `--dry-run` first and show the counts. Then run it for real. Afterwards run /compliance: strength, moisture and weathering are read from the description text, so strata where they were not found show under FD_SOIL and FD_ROCK. The guide is `docs/replace-gint.md`.
