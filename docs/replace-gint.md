# Replacing gINT

Bentley says on its own gINT page that gINT is being retired and will no longer be sold, updated or supported, and points customers to OpenGround, its cloud successor ([bentley.com/en/products/gint](https://www.bentley.com/en/products/gint/), checked 8 November 2026). If you are moving anyway, you can move to a database you own instead of a new subscription.

## 1. Export from gINT

In gINT, open the project and run its AGS export (from the File menu; the exact item name depends on your version and your data template). Choose AGS 4 and include at least these groups:

| AGS group | What it holds | Comes across as |
|---|---|---|
| LOCA | Every location: id, type, coordinates, ground level, final depth, dates, purpose, termination, how it was located | `locations` |
| GEOL | The strata log: top, base, description, legend code, geological unit | `strata` |
| ISPT | SPTs: depth, seating and test blows, the 75 mm increments, N, penetration | `spt_tests` |
| IVAN | Hand shear vanes: depth, peak, remoulded | `vane_tests` |
| SAMP | Samples: reference, type, top and base, date | `samples` |
| WSTK | Water strikes: depth, date, remarks | `groundwater` |
| LNMC | Moisture content results | `lab_tests` and `lab_results` (MC) |
| LLPL | Liquid limit, plastic limit, plasticity index | `lab_tests` and `lab_results` (LL, PL, PI) |

OpenGround, HoleBASE and most labs write the same AGS4 groups, so the same import works from them too.

## 2. Import

Make the project first, then preview, then load:

```bash
npm run geo -- add-project --code=HV26 --name="Harbour View Apartments" --country=NZ --lead="Mere Tane" --actor="Your name"
npm run geo -- import gint --file=imports/HV26.ags --project=HV26 --actor="Your name" --dry-run
npm run geo -- import gint --file=imports/HV26.ags --project=HV26 --actor="Your name"
```

Or in Claude Code: "Bring across this gINT export for Harbour View." (`/import`).

Running it twice adds nothing the second time. Each location, stratum, test and sample is matched on what it already has.

## 3. What maps, and what to check

- **Location type.** AGS codes containing CPT become CPT, TP and trial pit become TP, HA and hand auger become HA, everything else (RC, CP, RO, WS and so on) becomes BH.
- **Survey method.** LOCA_LOCM text with RTK becomes RTK GPS, total station becomes total station, GPS or GNSS becomes handheld GPS, plan or tape becomes measured from plan. Anything else stays "planned" and shows under COORDS until you set it.
- **Strength, moisture and weathering** are read from the description text (stiff, medium dense, moist, moderately weathered). Strata where a term was not found show under FD_SOIL or FD_ROCK in `/compliance`. Fix them with `/customise` or by asking: "BH04 0.25 to 3.1 m is moist."
- **SPT.** When the 75 mm increments (ISPT_INC1 to ISPT_INC6) are present they pair into the seating drive and the two 150 mm test increments, and N is checked against them. A penetration under 450 mm is recorded as refusal.
- **Rock or soil** is read from the first clause of the description (SANDSTONE, SILTSTONE, GREYWACKE, BASALT and the rest are rock).
- **Index tests** come in as reported, with the method from LNMC_METH or LLPL_METH if your export has it. Where it does not, LAB_METHOD lists them for you to fill in with the method your lab used.

## 4. What does not come across

- **Logged by, checked by, the services check date.** AGS has no place for them. Add them per location with `check-log`, `services-checked` and `start-location`, or ask Claude Code to set them for the whole project at once.
- **CPT readings.** The CPT location, depth and termination come across; the raw cone file stays where it is (put its name on the location as `data_file`). Interpretation stays in your CPT software.
- **Graphic log templates and fence diagrams.** These were gINT's report layouts. `npm run docs -- borehole-log` renders a log in your brand from `brand.json`; a graphic column log, fence diagrams or a 3D model are the kind of thing Enterprise DNA builds into your version.
- **Strength tests and consolidation** (UU, UCS, CON) and other lab groups. Load them from the lab's results file with `/load-results` after scheduling, or ask for the group to be added to the import with `/customise`.

## 5. Going the other way

`npm run geo -- export-ags --project=HV26` writes PROJ, LOCA, GEOL, ISPT, IVAN, SAMP and WSTK as AGS4, ready for the New Zealand Geotechnical Database, the client, or the next consultant. `npm run geo -- export` writes every record to one JSON file.
