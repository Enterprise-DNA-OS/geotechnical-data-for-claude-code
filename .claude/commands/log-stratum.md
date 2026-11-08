---
description: Log one stratum: depth range, material, legend, description, strength or density, moisture, plasticity, weathering and geological unit. Refused if it overlaps.
---

Run `npm run geo -- log-stratum --location=<PROJECT/NAME> --from=<m> --to=<m> --material=<topsoil|fill|soil|rock> --legend=CH --description="…" --strength=stiff --moisture=moist --actor=NAME --json`.

Confirm the change in one line. Run it with `--dry-run` first when the operator is unsure, and always pass `--actor` with their name.

The operator will often read a whole field sheet out at once. Log each stratum in order, top down, and report any warning about missing description fields straight away so they can be fixed while the logger still remembers.
