---
description: Record a standard penetration test as the seating drive and two test increments. N is worked out from the blows; refusal is detected.
---

Run `npm run geo -- add-spt --location=<PROJECT/NAME> --depth=<m> --blows=<seat,second,third> --actor=NAME --json`.

Confirm the change in one line. Run it with `--dry-run` first when the operator is unsure, and always pass `--actor` with their name.

If the operator gives N as well as the blows and they disagree, record both and say so: the check SPT_N will show it until it is fixed.
