# Rules this system checks

Checked 8 November 2026. The rules come from the guidelines a geotechnical practice in New Zealand or Australia already works to, plus house limits you set yourself:

- **NZGS, Field Description of Soil and Rock: Guideline for the field classification and description of soil and rock for engineering purposes** (New Zealand Geotechnical Society, December 2005). Soil is described by its composition, strength or density, and moisture; rock by its weathering and strength. Published at [nzgs.org](https://www.nzgs.org/libraries/field-description-of-soil-and-rock/).
- **AS 1726-2017 Geotechnical site investigations** (Standards Australia). The Australian equivalent for classifying and describing soil and rock on logs, including consistency or density, moisture condition, weathering and strength, and recording groundwater.
- **The Standard Penetration Test**, AS 1289.6.3.1 in Australia and ASTM D1586 (used in New Zealand practice): after a 150 mm seating drive, N is the number of blows for the next 300 mm, recorded as two 150 mm increments.
- **NZGS, Guideline for Hand Held Shear Vane Test** (New Zealand Geotechnical Society, August 2001): peak and remoulded shear strength, and sensitivity as their ratio.
- **Underground services before excavation.** Model Work Health and Safety Regulations, regulation 304: before excavation work starts, the person with management or control of the workplace must obtain current underground essential services information for the site and the areas next to it, and give it to anyone carrying out the work ([Safe Work Australia, Model Code of Practice: Excavation work](https://www.safeworkaustralia.gov.au/resources-and-publications/model-codes-practice/model-code-practice-excavation-work)). In New Zealand the same duty sits under the Health and Safety at Work Act 2015 primary duty of care, with WorkSafe's excavation guidance and the beforeUdig service.
- **New Zealand Geotechnical Database (NZGD).** MBIE runs the NZGD for sharing factual geotechnical data, in the AGS4 NZ format published by NZGS ([AGS4 NZ](https://www.nzgs.org/libraries/ags4-nz-electronic-transfer-of-data/)). Upload is generally voluntary, but some councils ask for it (Auckland Council's practice note AC2253, Geotechnical report requirements, asks for investigation data to be uploaded) and some clients write it into the contract. Set `nzgd_required` on those projects.
- **Laboratory testing.** Results in a factual report state the standard test method (NZS 4402:1986 Methods of testing soils for civil engineering purposes in New Zealand, AS 1289 Methods of testing soils for engineering purposes in Australia) and come from a laboratory accredited for the test (IANZ in New Zealand, NATA in Australia). The default method for each test and country is in `npm run geo -- methods`; change it with `set-method`.

`npm run geo -- compliance` runs every check below. It reads your records. It does not replace the engineer's judgement or a reviewer's sign-off, and it does not certify that you meet any law or standard. Change a limit with `/settings` and `/set`, or a rule with `/customise`.

| Rule | What the data must show | Source |
|---|---|---|
| FD_SOIL | Every soil and fill stratum has a strength or density term (soft, firm, stiff, loose, medium dense) and a moisture condition. `log-stratum` warns when one is missing. | NZGS Field Description (2005); AS 1726-2017 |
| FD_ROCK | Every rock stratum has a weathering grade and a strength term. | NZGS Field Description (2005); AS 1726-2017 |
| LOG_CONTINUOUS | A finished borehole, test pit or hand auger is logged from the surface to its final depth with no gaps or overlaps. `log-stratum` refuses overlaps. | Logging practice under both guidelines |
| LOG_CHECK | A finished log is checked by a second person within `log_check_days` (7), and never by the person who logged it. `check-log` refuses both, and refuses while description, continuity, SPT, vane or groundwater checks are open. | House quality rule |
| SERVICES | Services were located on or before the day a location started. | Model WHS Regulations r 304; HSWA 2015 |
| COORDS | A finished location has a surveyed position (not the planned one) and a ground level. | AGS4 NZ LOCA group; NZGD upload |
| GROUNDWATER | Every finished borehole, test pit and hand auger records groundwater: a strike, a standing level, or "not encountered". | AS 1726-2017; NZGS Field Description (2005) |
| SPT_N | A recorded N equals the blows for the second and third 150 mm increments, and any increment at `spt_refusal_blows` (50) is recorded as refusal. `add-spt` works N out for you. | AS 1289.6.3.1; ASTM D1586 |
| VANE | Every shear vane has a remoulded reading so sensitivity can be stated. `/attention` lists vanes with sensitivity at or above `vane_sensitivity_flag` (8). | NZGS Hand Held Shear Vane guideline (2001) |
| TUBE_SCHEDULE | An undisturbed tube sample is scheduled for testing within `tube_schedule_days` (7) of being taken. | House rule: tubes dry out |
| LAB_METHOD | Every lab test states its standard method. | NZS 4402; AS 1289 |
| LAB_ACCREDITED | Schedules go to a laboratory with an IANZ or NATA accreditation number on file. | IANZ; NATA |
| LAB_RECEIPT | The lab confirms receipt of a schedule within `lab_receipt_days` (3). | House rule, sample custody |
| LAB_LATE | Results arrive by the schedule's due date, or `lab_results_days` (15) after receipt. | House rule |
| PIEZO_DUE | Each active piezometer is read on its own interval, or every `piezo_read_days` (30). | House monitoring plan |
| NZGD | On projects marked `nzgd_required`, a finished location is uploaded to the NZGD within `nzgd_upload_days` (30). `export-ags` writes the AGS4 file. | Auckland Council AC2253; client contracts |
| REPORT_REVIEW | An issued report names a reviewer who is not its author. `issue-report` refuses otherwise. | House quality rule |

The guidelines are summarised here so the checks can be read in plain words. Buy and read the standards themselves (Standards New Zealand, Standards Australia, ASTM) for the full text; a rule here that does not match your edition is changed with `/customise`.
