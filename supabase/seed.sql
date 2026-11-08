-- Fictional demo: one geotechnical practice, three projects (Auckland, Christchurch, Brisbane),
-- boreholes, CPTs, test pits and hand augers, with deliberately stale and broken records so
-- /attention and /compliance have something to say. Dates are relative to today. Safe to run twice.
do $$
declare
  c1 uuid; c2 uuid; c3 uuid;
  p1 uuid; p2 uuid; p3 uuid;
  lab1 uuid; lab2 uuid; lab3 uuid;
  hv_bh01 uuid; hv_bh02 uuid; hv_bh03 uuid; hv_tp01 uuid;
  hs_cpt01 uuid; hs_cpt02 uuid; hs_ha01 uuid; hs_ha02 uuid;
  lr_bh01 uuid; lr_bh02 uuid;
  sc1 uuid; sc2 uuid; sc3 uuid;
  s uuid; t uuid; inst uuid;
  d date := current_date;
begin
  if exists (select 1 from projects where code = 'HV26') then return; end if;

  insert into clients (name, contact, email) values ('Kowhai Developments Ltd', 'Rangi Paewai', 'rangi@kowhai.example') returning id into c1;
  insert into clients (name, contact, email) values ('Te Ara Homes', 'Lisa Morton', 'lisa@tearahomes.example') returning id into c2;
  insert into clients (name, contact, email) values ('Bremer Logistics Pty Ltd', 'Dean Kerr', 'dean.kerr@bremer.example') returning id into c3;

  insert into projects (code, name, client_id, site, country, coord_system, height_datum, lead_engineer, nzgd_required)
    values ('HV26', 'Harbour View Apartments', c1, '14 Esplanade Road, Takapuna, Auckland', 'NZ', 'NZTM2000', 'NZVD2016', 'Mere Tane', false) returning id into p1;
  insert into projects (code, name, client_id, site, country, coord_system, height_datum, lead_engineer, nzgd_required)
    values ('HS3', 'Halswell Stage 3 Subdivision', c2, 'Halswell Junction Road, Christchurch', 'NZ', 'NZTM2000', 'NZVD2016', 'Priya Shah', true) returning id into p2;
  insert into projects (code, name, client_id, site, country, coord_system, height_datum, lead_engineer, nzgd_required)
    values ('LR', 'Logan Road Warehouse', c3, '220 Logan Road, Brisbane QLD', 'AU', 'MGA2020 Zone 56', 'AHD', 'Tom Walsh', false) returning id into p3;

  insert into labs (name, code, accreditation, email) values ('Otahuhu Soils Lab', 'OSL', 'IANZ 1182', 'results@otahuhusoils.example') returning id into lab1;
  insert into labs (name, code, accreditation, email) values ('Riverside Testing', 'RVT', '', 'lab@riversidetesting.example') returning id into lab2;
  insert into labs (name, code, accreditation, email) values ('SEQ Geolab', 'SEQ', 'NATA 20417', 'jobs@seqgeolab.example') returning id into lab3;

  -- ---------------------------------------------------------------- HV26, Takapuna
  insert into locations (project_id, name, loc_type, status, purpose, method, contractor, planned_depth, final_depth, easting, northing, ground_level, coord_method,
                         services_checked_on, started_on, completed_on, termination, logged_by, checked_by, checked_on)
    values (p1, 'BH01', 'BH', 'complete', 'Foundation design, north tower', 'Rotary, HQ3 triple tube', 'North Shore Drilling', 15, 15.45, 1756210.4, 5925890.2, 12.84, 'RTK GPS',
            d - 44, d - 40, d - 38, 'Target depth', 'Ana Rewi', 'Mere Tane', d - 35) returning id into hv_bh01;
  insert into strata (location_id, from_m, to_m, material, legend, description, strength_density, moisture, plasticity, geology_unit, logged_by) values
    (hv_bh01, 0, 0.3, 'topsoil', 'TS', 'TOPSOIL: dark brown organic silt with rootlets', 'soft', 'moist', null, 'Topsoil', 'Ana Rewi'),
    (hv_bh01, 0.3, 2.5, 'soil', 'CH', 'Clayey SILT, orange brown mottled grey, high plasticity', 'stiff', 'moist', 'high', 'Residual East Coast Bays Formation', 'Ana Rewi'),
    (hv_bh01, 2.5, 7.8, 'soil', 'CL', 'Silty CLAY, light grey, some fine sand', 'very stiff', 'moist', 'medium', 'Residual East Coast Bays Formation', 'Ana Rewi'),
    (hv_bh01, 7.8, 10.2, 'rock', 'SST', 'SANDSTONE, light grey, fine grained, thinly bedded', 'extremely weak', null, null, 'East Coast Bays Formation', 'Ana Rewi'),
    (hv_bh01, 10.2, 15.45, 'rock', 'SST', 'Interbedded SANDSTONE and SILTSTONE, grey, moderately weathered', 'weak', null, null, 'East Coast Bays Formation', 'Ana Rewi');
  update strata set weathering = 'highly weathered' where location_id = hv_bh01 and from_m = 7.8;
  update strata set weathering = 'moderately weathered' where location_id = hv_bh01 and from_m = 10.2;
  insert into spt_tests (location_id, depth_m, seat_blows, blows_2, blows_3, n_value) values
    (hv_bh01, 1.5, 2, 3, 4, 7), (hv_bh01, 3.0, 4, 6, 7, 13), (hv_bh01, 4.5, 5, 8, 9, 17), (hv_bh01, 6.0, 7, 11, 12, 23);
  insert into spt_tests (location_id, depth_m, seat_blows, blows_2, blows_3, n_value, refusal, penetration_mm, note) values
    (hv_bh01, 9.0, 25, 50, null, null, true, 210, 'Refusal in extremely weak sandstone');
  insert into groundwater (location_id, observed_on, kind, depth_m, read_by, note) values
    (hv_bh01, d - 40, 'strike', 4.2, 'Ana Rewi', 'Seepage, rose to 3.6 m in 20 minutes');
  insert into installations (location_id, kind, screen_top, screen_base, installed_on, read_every_days)
    values (hv_bh01, 'standpipe piezometer', 3.0, 9.0, d - 38, 14) returning id into inst;
  insert into groundwater (location_id, installation_id, observed_on, kind, depth_m, read_by) values
    (hv_bh01, inst, d - 37, 'reading', 3.55, 'Ana Rewi'), (hv_bh01, inst, d - 23, 'reading', 3.41, 'Ana Rewi');

  insert into schedules (name, project_id, lab_id, sent_on, received_on, lab_job)
    values ('LS-HV26-01', p1, lab1, d - 30, d - 29, 'OSL-26-0811') returning id into sc1;
  insert into samples (location_id, ref, sample_type, from_m, to_m, taken_on, status) values (hv_bh01, 'U1', 'U', 2.0, 2.45, d - 40, 'tested') returning id into s;
  insert into lab_tests (sample_id, schedule_id, test, method, status, reported_on) values (s, sc1, 'MC', 'NZS 4402:1986 Test 2.1', 'reported', d - 18) returning id into t;
  insert into lab_results (lab_test_id, parameter, value, units) values (t, 'MC', 38.5, '%');
  insert into lab_tests (sample_id, schedule_id, test, method, status, reported_on) values (s, sc1, 'ATT', 'NZS 4402:1986 Tests 2.2, 2.3, 2.4', 'reported', d - 18) returning id into t;
  insert into lab_results (lab_test_id, parameter, value, units) values (t, 'LL', 72, '%'), (t, 'PL', 31, '%'), (t, 'PI', 41, '%');
  insert into lab_tests (sample_id, schedule_id, test, method, status) values (s, sc1, 'UU', 'ASTM D2850', 'scheduled');
  insert into samples (location_id, ref, sample_type, from_m, to_m, taken_on, status) values (hv_bh01, 'U2', 'U', 5.0, 5.45, d - 39, 'scheduled') returning id into s;
  insert into lab_tests (sample_id, schedule_id, test, method, status, reported_on) values (s, sc1, 'MC', 'NZS 4402:1986 Test 2.1', 'reported', d - 18) returning id into t;
  insert into lab_results (lab_test_id, parameter, value, units) values (t, 'MC', 29.1, '%');
  insert into lab_tests (sample_id, schedule_id, test, method, status) values (s, sc1, 'CON', 'ASTM D2435', 'scheduled');
  insert into samples (location_id, ref, sample_type, from_m, to_m, taken_on, status) values (hv_bh01, 'D1', 'D', 1.5, 1.95, d - 40, 'held'), (hv_bh01, 'D2', 'D', 4.5, 4.95, d - 40, 'held');

  insert into locations (project_id, name, loc_type, status, purpose, method, contractor, planned_depth, final_depth, easting, northing, ground_level, coord_method,
                         services_checked_on, started_on, completed_on, termination, logged_by)
    values (p1, 'BH02', 'BH', 'complete', 'Foundation design, south tower', 'Rotary, HQ3 triple tube', 'North Shore Drilling', 15, 12.0, 1756185.9, 5925851.7, 11.96, 'RTK GPS',
            d - 20, d - 16, d - 14, 'Target depth reached in rock', 'Ana Rewi') returning id into hv_bh02;
  insert into strata (location_id, from_m, to_m, material, legend, description, strength_density, moisture, plasticity, weathering, geology_unit, logged_by) values
    (hv_bh02, 0, 0.6, 'fill', 'FILL', 'FILL: brown silty gravel with brick fragments', 'loose', 'moist', null, null, 'Fill', 'Ana Rewi'),
    (hv_bh02, 0.6, 4.0, 'soil', 'CH', 'Clayey SILT, orange brown, high plasticity', 'firm', null, 'high', null, 'Residual East Coast Bays Formation', 'Ana Rewi'),
    (hv_bh02, 4.0, 8.5, 'soil', 'CL', 'Silty CLAY, grey', 'stiff', 'moist', 'medium', null, 'Residual East Coast Bays Formation', 'Ana Rewi'),
    (hv_bh02, 8.5, 12.0, 'rock', 'SST', 'SANDSTONE, grey, fine grained', 'weak', null, null, 'moderately weathered', 'East Coast Bays Formation', 'Ana Rewi');
  insert into spt_tests (location_id, depth_m, seat_blows, blows_2, blows_3, n_value) values
    (hv_bh02, 1.5, 1, 2, 2, 4), (hv_bh02, 3.0, 2, 3, 3, 6), (hv_bh02, 6.0, 4, 7, 8, 18);
  insert into groundwater (location_id, observed_on, kind, depth_m, read_by) values (hv_bh02, d - 14, 'standing', 3.9, 'Ana Rewi');
  insert into samples (location_id, ref, sample_type, from_m, to_m, taken_on) values
    (hv_bh02, 'U1', 'U', 2.0, 2.45, d - 15), (hv_bh02, 'D1', 'D', 1.5, 1.95, d - 15), (hv_bh02, 'D2', 'D', 6.0, 6.45, d - 15);

  insert into locations (project_id, name, loc_type, status, purpose, method, contractor, planned_depth, final_depth, easting, northing, coord_method, services_checked_on, started_on, logged_by)
    values (p1, 'BH03', 'BH', 'in progress', 'Basement retaining wall', 'Rotary, HQ3 triple tube', 'North Shore Drilling', 20, 6.0, 1756231.0, 5925862.0, 'planned', d - 3, d - 1, 'Ana Rewi') returning id into hv_bh03;
  insert into strata (location_id, from_m, to_m, material, legend, description, strength_density, moisture, plasticity, logged_by) values
    (hv_bh03, 0, 0.2, 'topsoil', 'TS', 'TOPSOIL', 'soft', 'moist', null, 'Ana Rewi'),
    (hv_bh03, 0.2, 6.0, 'soil', 'CH', 'Clayey SILT, orange brown mottled grey', 'stiff', 'moist', 'high', 'Ana Rewi');
  insert into spt_tests (location_id, depth_m, seat_blows, blows_2, blows_3, n_value) values (hv_bh03, 1.5, 2, 3, 3, 6), (hv_bh03, 4.5, 3, 5, 6, 11);

  insert into locations (project_id, name, loc_type, status, purpose, method, contractor, planned_depth, final_depth, easting, northing, coord_method, services_checked_on, started_on, completed_on,
                         termination, logged_by, checked_by, checked_on)
    values (p1, 'TP01', 'TP', 'complete', 'Fill depth at the carpark', '5 tonne excavator', 'Shore Civil', 3, 2.8, 1756199.0, 5925905.0, 'planned', d - 22, d - 20, d - 20,
            'Target depth', 'Josh Tamatea', 'Mere Tane', d - 18) returning id into hv_tp01;
  insert into strata (location_id, from_m, to_m, material, legend, description, strength_density, moisture, plasticity, logged_by) values
    (hv_tp01, 0, 1.4, 'fill', 'FILL', 'FILL: grey sandy gravel, hardfill', 'medium dense', 'dry', null, 'Josh Tamatea'),
    (hv_tp01, 1.4, 2.8, 'soil', 'CH', 'Clayey SILT, orange brown', 'stiff', 'moist', 'high', 'Josh Tamatea');

  -- ---------------------------------------------------------------- HS3, Christchurch (NZGD upload required)
  insert into locations (project_id, name, loc_type, status, purpose, method, contractor, final_depth, easting, northing, ground_level, coord_method, services_checked_on, started_on, completed_on,
                         termination, data_file, nzgd_id, nzgd_uploaded_on)
    values (p2, 'CPT01', 'CPT', 'complete', 'Liquefaction assessment', 'CPTu, 10 cm2 cone', 'Canterbury Cone Testing', 14.6, 1563102.5, 5175420.8, 18.12, 'RTK GPS', d - 64, d - 60, d - 60,
            'Refusal on dense gravel', 'HS3-CPT01.cpt', 'CPT_219884', d - 40) returning id into hs_cpt01;
  insert into locations (project_id, name, loc_type, status, purpose, method, contractor, final_depth, easting, northing, ground_level, coord_method, services_checked_on, started_on, completed_on,
                         termination, data_file)
    values (p2, 'CPT02', 'CPT', 'complete', 'Liquefaction assessment', 'CPTu, 10 cm2 cone', 'Canterbury Cone Testing', 11.2, 1563160.1, 5175388.0, 17.95, 'RTK GPS', d - 50, d - 45, d - 45,
            'Refusal on dense gravel', 'HS3-CPT02.cpt') returning id into hs_cpt02;
  insert into locations (project_id, name, loc_type, status, purpose, method, final_depth, easting, northing, ground_level, coord_method, services_checked_on, started_on, completed_on,
                         termination, logged_by, checked_by, checked_on)
    values (p2, 'HA01', 'HA', 'complete', 'Shallow foundations, lots 12 to 18', '50 mm hand auger', 3.0, 1563120.0, 5175401.0, 18.05, 'handheld GPS', d - 11, d - 10, d - 10,
            'Target depth', 'Liam Ford', 'Liam Ford', d - 9) returning id into hs_ha01;
  insert into strata (location_id, from_m, to_m, material, legend, description, strength_density, moisture, plasticity, geology_unit, logged_by) values
    (hs_ha01, 0, 0.3, 'topsoil', 'TS', 'TOPSOIL: dark brown silt', 'soft', 'moist', null, 'Topsoil', 'Liam Ford'),
    (hs_ha01, 0.3, 1.8, 'soil', 'ML', 'SILT, light brown, some clay, low plasticity', 'firm', 'moist', 'low', 'Springston Formation', 'Liam Ford'),
    (hs_ha01, 1.8, 3.0, 'soil', 'OH', 'Organic SILT, dark grey, with peat lenses', 'soft', 'wet', 'medium', 'Springston Formation', 'Liam Ford');
  insert into vane_tests (location_id, depth_m, peak_kpa, remoulded_kpa, vane_id) values
    (hs_ha01, 0.6, 78, 24, 'V19'), (hs_ha01, 1.2, 64, 19, 'V19'), (hs_ha01, 2.1, 27, 3, 'V19'), (hs_ha01, 2.7, 22, null, 'V19');
  insert into groundwater (location_id, observed_on, kind, depth_m, read_by) values (hs_ha01, d - 10, 'strike', 1.9, 'Liam Ford');

  insert into locations (project_id, name, loc_type, status, purpose, method, final_depth, easting, northing, ground_level, coord_method, services_checked_on, started_on, completed_on,
                         termination, logged_by)
    values (p2, 'HA02', 'HA', 'complete', 'Shallow foundations, lots 19 to 24', '50 mm hand auger', 2.5, 1563171.0, 5175379.0, 17.88, 'handheld GPS', d - 10, d - 9, d - 9,
            'Collapse below water table', 'Liam Ford') returning id into hs_ha02;
  insert into strata (location_id, from_m, to_m, material, legend, description, strength_density, moisture, plasticity, logged_by) values
    (hs_ha02, 0, 0.3, 'topsoil', 'TS', 'TOPSOIL', 'soft', 'moist', null, 'Liam Ford'),
    (hs_ha02, 0.3, 0.8, 'soil', 'ML', 'SILT, light brown', 'firm', 'moist', 'low', 'Liam Ford'),
    (hs_ha02, 1.0, 2.2, 'soil', 'SM', 'Silty fine SAND, grey', 'loose', 'wet', null, 'Liam Ford');
  insert into vane_tests (location_id, depth_m, peak_kpa, remoulded_kpa, vane_id) values (hs_ha02, 0.5, 71, 22, 'V19');
  insert into groundwater (location_id, observed_on, kind, read_by) values (hs_ha02, d - 9, 'not encountered', 'Liam Ford');
  update groundwater set kind = 'strike', depth_m = 1.6, note = 'Hole collapsed at 2.5 m' where location_id = hs_ha02;

  insert into schedules (name, project_id, lab_id, sent_on, lab_job) values ('LS-HS3-01', p2, lab2, d - 6, '') returning id into sc2;
  insert into samples (location_id, ref, sample_type, from_m, to_m, taken_on, status) values (hs_ha01, 'B1', 'B', 0.5, 1.0, d - 10, 'scheduled') returning id into s;
  insert into lab_tests (sample_id, schedule_id, test, method) values (s, sc2, 'MC', 'NZS 4402:1986 Test 2.1'), (s, sc2, 'PSD', '');
  insert into samples (location_id, ref, sample_type, from_m, to_m, taken_on, status) values (hs_ha01, 'B2', 'B', 2.0, 2.5, d - 10, 'scheduled') returning id into s;
  insert into lab_tests (sample_id, schedule_id, test, method) values (s, sc2, 'MC', 'NZS 4402:1986 Test 2.1'), (s, sc2, 'ATT', 'NZS 4402:1986 Tests 2.2, 2.3, 2.4');

  insert into reports (project_id, name, kind, revision, author, reviewer, status, issued_on)
    values (p2, 'HS3 Factual Report', 'factual', 'A', 'Priya Shah', null, 'issued', d - 5);

  -- ---------------------------------------------------------------- LR, Brisbane
  insert into locations (project_id, name, loc_type, status, purpose, method, contractor, planned_depth, final_depth, easting, northing, ground_level, coord_method,
                         services_checked_on, started_on, completed_on, termination, logged_by, checked_by, checked_on)
    values (p3, 'BH01', 'BH', 'complete', 'Slab and footing design', 'Solid flight auger to 6 m, NMLC coring below', 'Brisbane Geo Drilling', 12, 12.0, 505214.0, 6958802.0, 31.4, 'total station',
            null, d - 26, d - 25, 'Target depth', 'Jess Nguyen', 'Tom Walsh', d - 22) returning id into lr_bh01;
  insert into strata (location_id, from_m, to_m, material, legend, description, strength_density, moisture, plasticity, weathering, geology_unit, logged_by) values
    (lr_bh01, 0, 0.5, 'fill', 'FILL', 'FILL: gravelly clay, brown, with concrete fragments', 'stiff', 'moist', 'medium', null, 'Fill', 'Jess Nguyen'),
    (lr_bh01, 0.5, 4.2, 'soil', 'CH', 'CLAY, high plasticity, red brown mottled grey', 'very stiff', 'moist', 'high', null, 'Residual soil', 'Jess Nguyen'),
    (lr_bh01, 4.2, 6.0, 'soil', 'CL', 'Gravelly CLAY, grey, extremely weathered rock structure', 'hard', 'moist', 'medium', null, 'Residual soil', 'Jess Nguyen'),
    (lr_bh01, 6.0, 9.0, 'rock', 'PHY', 'PHYLLITE, grey, highly fractured', 'low strength', null, null, null, 'Neranleigh-Fernvale beds', 'Jess Nguyen'),
    (lr_bh01, 9.0, 12.0, 'rock', 'PHY', 'PHYLLITE, grey, slightly weathered', 'medium strength', null, null, 'slightly weathered', 'Neranleigh-Fernvale beds', 'Jess Nguyen');
  insert into spt_tests (location_id, depth_m, seat_blows, blows_2, blows_3, n_value) values
    (lr_bh01, 1.5, 5, 8, 10, 18), (lr_bh01, 3.0, 7, 12, 14, 26), (lr_bh01, 4.5, 15, 28, 31, 59);
  insert into groundwater (location_id, observed_on, kind, read_by, note) values (lr_bh01, d - 26, 'not encountered', 'Jess Nguyen', 'Not encountered during auger drilling');

  insert into schedules (name, project_id, lab_id, sent_on, received_on, results_on, lab_job)
    values ('LS-LR-01', p3, lab3, d - 20, d - 19, d - 8, 'SEQ-48812') returning id into sc3;
  insert into samples (location_id, ref, sample_type, from_m, to_m, taken_on, status) values (lr_bh01, 'D1', 'D', 1.5, 1.95, d - 26, 'tested') returning id into s;
  insert into lab_tests (sample_id, schedule_id, test, method, status, reported_on) values (s, sc3, 'MC', 'AS 1289.2.1.1', 'reported', d - 8) returning id into t;
  insert into lab_results (lab_test_id, parameter, value, units) values (t, 'MC', 21.4, '%');
  insert into lab_tests (sample_id, schedule_id, test, method, status, reported_on) values (s, sc3, 'ATT', 'AS 1289.3.1.2, 3.2.1, 3.3.1', 'reported', d - 8) returning id into t;
  insert into lab_results (lab_test_id, parameter, value, units) values (t, 'LL', 58, '%'), (t, 'PL', 24, '%'), (t, 'PI', 34, '%');
  insert into samples (location_id, ref, sample_type, from_m, to_m, taken_on, status) values (lr_bh01, 'B1', 'B', 0.5, 1.0, d - 26, 'tested') returning id into s;
  insert into lab_tests (sample_id, schedule_id, test, method, status, reported_on) values (s, sc3, 'CBR', 'AS 1289.6.1.1', 'reported', d - 8) returning id into t;
  insert into lab_results (lab_test_id, parameter, value, units) values (t, 'CBR', 4, '%');
  insert into lab_tests (sample_id, schedule_id, test, method, status, reported_on) values (s, sc3, 'PSD', 'AS 1289.3.6.1', 'reported', d - 8) returning id into t;
  insert into lab_results (lab_test_id, parameter, value, units) values (t, 'FINES', 62, '%');

  insert into locations (project_id, name, loc_type, status, purpose, planned_depth, easting, northing, coord_method)
    values (p3, 'BH02', 'BH', 'planned', 'Slab and footing design, east bay', 12, 505262.0, 6958790.0, 'planned') returning id into lr_bh02;

  insert into reports (project_id, name, kind, revision, author, reviewer, status)
    values (p3, 'LR Geotechnical Investigation Report', 'interpretive', '0', 'Tom Walsh', 'Jess Nguyen', 'in review');
end $$;
