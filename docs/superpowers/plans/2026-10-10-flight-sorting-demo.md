# Flight Scheduling Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local web demo that enriches the provided flight data in place, compares the baseline CTOT queue with a fast improved schedule, visualizes a full day on the TSN parking chart, and replays DCL messages.

**Architecture:** Proposed stack is a browser-only React and TypeScript app served locally by Vite. SheetJS reads and writes the selected XLS/CSV through the browser File System Access API; a deterministic simulation core handles workbook normalization, CTOT scheduling, taxiway occupancy, optimization, and DCL events. The chart is a static image with a preconfigured SVG taxiway graph and aircraft overlays.

**Tech Stack:** Proposed React, TypeScript, Vite, SheetJS Community Edition, SVG, CSS, and Vitest. The direct in-place file workflow requires a supporting browser such as Chrome or Edge and a secure local origin; confirm the target before implementation.

**Spec:** `docs/superpowers/specs/2026-10-10-flight-sorting-demo-design.md`

## Global Constraints

- Use Vietnamese interface copy and standard aviation terms including stand, taxiway, holding point, CTOT, and DCL.
- Keep the 3-day and 7-day workbooks as separate data choices; never merge them.
- Preserve source flight fields and append missing simulation fields to the same selected file; do not generate a second data workbook.
- Reuse existing mock values on later imports and make generated values deterministic.
- Treat CTOT acceptance as CTOT − 5 minutes through CTOT + 10 minutes.
- A missed slot moves the aircraft to the end of the holding-point queue and receives the earliest feasible new CTOT.
- Compare baseline and proposed schedules using identical flights, mocked values, routes, runway settings, and constraints.
- Minimize total waiting time; exclude time spent moving from the wait metric.
- Support 24-hour playback and scenario-based DCL success, reject, and timeout messages.
- Run the app locally; do not connect to live ATC or CPDLC services.
- Apply the user-requested UI UX Pro Max guidance and its verified data-dense dashboard direction.

## Review Focus

- The 3-day workbook has no time columns, while the 7-day workbook has a different, wider schema; tests must verify normalization without dropping source columns.
- The workbook's airport field direction must be confirmed before filtering outbound VVTS flights.
- CTOT boundary checks must cover exactly −5 and +10 minutes, just outside each boundary, and midnight rollover.
- Taxiway/stand compatibility and occupied segments must prevent impossible routes or simultaneous use.
- File permission denial, malformed workbook rows, and write-back must leave original flight data intact and explain the problem.

---

### Task 1: Bootstrap the local dashboard and design system

**Files:**
- Create: `package.json`, `index.html`, `vite.config.ts`, `tsconfig.json`
- Create: `src/main.tsx`, `src/App.tsx`, `src/styles/tokens.css`, `src/styles/app.css`
- Create: `design-system/flight-management-demo/MASTER.md`
- Copy: `public/assets/parking-chart.jpg` from the supplied TSN PARKING CHART
- Test: `src/App.test.tsx`

**Interfaces:**
- Produces the Vite React app shell and design tokens used by every later UI task.

- [ ] Write a failing app-render test verifying the Vietnamese application title and the main map, queue, and event regions.
- [ ] Run `npm test -- --run src/App.test.tsx`; expect failure because the app shell is absent.
- [ ] Scaffold React/TypeScript/Vite and implement the dashboard shell with the UI UX Pro Max data-dense dashboard direction, high-contrast neutral palette, legible sans typography, subtle motion, visible focus, and reduced-motion support.
- [ ] Run `npm test -- --run src/App.test.tsx`; expect the app-render test to pass.

### Task 2: Read, normalize, enrich, and update the selected source file

**Files:**
- Create: `src/data/fileAccess.ts`
- Create: `src/data/workbook.ts`
- Create: `src/data/normalizeFlights.ts`
- Create: `src/data/mockFields.ts`
- Create: `src/data/writeBack.ts`
- Test: `src/data/workbook.test.ts`, `src/data/normalizeFlights.test.ts`, `src/data/writeBack.test.ts`

**Interfaces:**
- `openWorkbook(): Promise<{ file: File; handle: FileSystemFileHandle; workbook: XLSX.WorkBook }>`
- `normalizeFlights(workbook: XLSX.WorkBook, sourceName: string): NormalizedDataset`
- `enrichMissingFields(dataset: NormalizedDataset, config: MockConfig): EnrichedDataset`
- `writeBack(handle: FileSystemFileHandle, workbook: XLSX.WorkBook): Promise<void>`
- Produces stable flight records for the simulation and writes generated fields back to the selected same file.

- [ ] Write failing tests for each workbook schema, outbound airport mapping, generated time fields, repeatable CTOT/stand assignment, and preservation of existing workbook rows and values.
- [ ] Run `npm test -- --run src/data`; expect failures because the import and enrichment modules are absent.
- [ ] Implement XLS/CSV parsing, schema mapping, user-facing validation, deterministic mock values, and in-place writing through the selected file handle. Use source departure times when present; otherwise generate stable times across the day. Assign compatible stands without overlapping stand occupancy, derive ready time from configured taxi time, and generate a separate mock CTOT from schedule, traffic density, and runway capacity. Preserve all source columns and rows; add only missing simulation columns.
- [ ] Run `npm test -- --run src/data`; expect all import/enrichment/write-back tests to pass on representative 3-day and 7-day fixture subsets.

### Task 3: Model the parking chart and valid taxi routes

**Files:**
- Create: `src/simulation/mapTypes.ts`
- Create: `src/simulation/tsnMap.ts`
- Create: `src/simulation/routePlanner.ts`
- Create: `src/components/ParkingMap.tsx`
- Create: `src/components/ParkingMap.css`
- Test: `src/simulation/routePlanner.test.ts`
- Test: `src/components/ParkingMap.test.tsx`

**Interfaces:**
- `planTaxiRoute(graph: TaxiGraph, standId: string, runwayConfigId: string, aircraftType: string): TaxiRoute`
- `ParkingMap({ graph, aircraft, selectedFlightId, currentTime, playbackState }: ParkingMapProps): JSX.Element`
- Produces preconfigured stand-to-holding-point/runway routes over the PARKING CHART image.

- [ ] Write failing tests for route connectivity, aircraft/stand eligibility, closed segments, and the selected lower black departure taxi line.
- [ ] Run `npm test -- --run src/simulation/routePlanner.test.ts src/components/ParkingMap.test.tsx`; expect failures because the map model is absent.
- [ ] Digitize the relevant stand, taxiway, holding-point, and runway nodes for the default and alternate runway configurations; render the chart with an SVG route and aircraft overlay.
- [ ] Run the same focused tests; expect connected valid routes and selected-flight highlighting.

### Task 4: Simulate taxi movement, CTOT compliance, and the baseline schedule

**Files:**
- Create: `src/simulation/simulationTypes.ts`
- Create: `src/simulation/runSimulation.ts`
- Create: `src/simulation/waitMetrics.ts`
- Create: `src/simulation/ctot.ts`
- Test: `src/simulation/ctot.test.ts`
- Test: `src/simulation/runSimulation.test.ts`

**Interfaces:**
- `runSimulation(input: SimulationInput, schedule: FlightSchedule): SimulationResult`
- `isWithinCtotWindow(actualTakeoff: Date, ctot: Date): boolean`
- `summarizeWaiting(result: SimulationResult): WaitSummary`
- Produces a deterministic event timeline and baseline result.

- [ ] Write failing tests for the inclusive CTOT −5/+10 boundary, early/late missed slots, queue-tail re-entry, runway headway, taxiway occupancy conflicts, and waiting-time accounting.
- [ ] Run `npm test -- --run src/simulation/ctot.test.ts src/simulation/runSimulation.test.ts`; expect failures because the engine is absent.
- [ ] Implement a deterministic event simulation that tracks movement versus stopped waiting, runway availability, missed slots, and earliest feasible re-issued CTOTs. Apply the CTOT window to simulated wheels-off time.
- [ ] Run the same focused tests; expect all timing, queue-order, and conflict cases to pass.

### Task 5: Improve the schedule quickly and report comparable results

**Files:**
- Create: `src/simulation/optimizeSchedule.ts`
- Create: `src/simulation/compareSchedules.ts`
- Test: `src/simulation/optimizeSchedule.test.ts`
- Test: `src/simulation/compareSchedules.test.ts`

**Interfaces:**
- `optimizeSchedule(input: SimulationInput, baseline: FlightSchedule): FlightSchedule`
- `compareSchedules(baseline: SimulationResult, proposed: SimulationResult): ScheduleComparison`
- Produces a fast heuristic schedule that does not score worse than the baseline and reports minutes/percentage saved, re-slots, and takeoff order.

- [ ] Write failing tests for baseline identity, constraint-preserving reordering, deterministic results, no-worse-than-baseline output, and zero-baseline percentage handling.
- [ ] Run `npm test -- --run src/simulation/optimizeSchedule.test.ts src/simulation/compareSchedules.test.ts`; expect failures because optimization is absent.
- [ ] Implement a bounded local-search/rolling heuristic over feasible candidates; retain the baseline when no improvement exists.
- [ ] Run the same focused tests; expect proposed results to preserve constraints and never increase the objective.

### Task 6: Replay DCL messages and exception scenarios

**Files:**
- Create: `src/dcl/messageTemplates.ts`
- Create: `src/dcl/dclScenario.ts`
- Create: `src/components/DclEventLog.tsx`
- Create: `src/components/DclEventLog.css`
- Test: `src/dcl/dclScenario.test.ts`

**Interfaces:**
- `createDclEvents(flight: Flight, scenario: DclScenarioConfig): DclEvent[]`
- Produces timestamped normal, rejection, and timeout events based on the approved report templates.

- [ ] Write failing tests for the normal RCD/response/CLD/CDA completion sequence, rejection, timeout, and event linkage to the matching flight.
- [ ] Run `npm test -- --run src/dcl/dclScenario.test.ts`; expect failures because templates and scenario state are absent.
- [ ] Implement deterministic DCL scenarios and an event log that selects and highlights the corresponding aircraft.
- [ ] Run the same test; expect each scenario to reach the stated terminal status.

### Task 7: Integrate full-day playback and comparison dashboard

**Files:**
- Create: `src/components/PlaybackControls.tsx`
- Create: `src/components/FlightQueue.tsx`
- Create: `src/components/ComparisonPanel.tsx`
- Modify: `src/App.tsx`, `src/styles/app.css`
- Test: `src/components/PlaybackControls.test.tsx`, `src/App.test.tsx`

**Interfaces:**
- Playback speed values are `1 | 10 | 30 | 60`.
- The app coordinates selected data, runway configuration, baseline/optimized runs, synchronized map position, queue, DCL log, and comparison metrics.

- [ ] Write failing tests for full-day time progression, pause/resume/seek/speed controls, configuration selection, map/queue/event synchronization, and baseline-versus-proposed metrics.
- [ ] Run `npm test -- --run src/components/PlaybackControls.test.tsx src/App.test.tsx`; expect failures because playback and integrated views are absent.
- [ ] Wire data selection and write-back confirmation into the UI; add accessible control labels, loading/error states, and performance-conscious event rendering.
- [ ] Run the same tests; expect full-day playback and synchronized scenario results to pass.

### Task 8: Document local launch and validate real sample round-trips

**Files:**
- Create: `README.md`
- Modify: `package.json`
- Test: `src/data/sampleRoundTrip.test.ts`

**Interfaces:**
- Documents installation, local launch, supported-browser requirement, data permissions, runway settings, and mock-field labels.
- Produces a buildable local demo and verified write-back behavior on copies of both provided workbooks.

- [ ] Write a failing round-trip test using a small representative slice from each provided workbook; assert source columns and values remain and generated fields are readable after save/reopen.
- [ ] Run `npm test -- --run src/data/sampleRoundTrip.test.ts`; expect the preservation assertion to fail until write-back support is implemented.
- [ ] Implement any needed format-specific handling and document that imported/generated simulation fields are saved to the selected source file only after the user chooses the save action.
- [ ] Run the full automated suite and `npm run build`; expect all tests and the production build to pass.
- [ ] Manually open the app in Chrome or Edge, load both sample files, simulate one full day, and visually inspect map readability, queues, DCL events, and comparison metrics.

## Plan Notes

- The upstream GitHub repository is empty, so this plan creates the app from a clean project rather than adapting existing code.
- The current workspace is not a Git repository; implementation work is isolated in the new clone on branch `codex/flight-scheduling-demo`.
- The direct-write workflow depends on File System Access API support. MDN marks `showOpenFilePicker()` as limited availability and secure-context-only: https://developer.mozilla.org/en-US/docs/Web/API/Window/showOpenFilePicker
- SheetJS documents BIFF8 `.xls` read/write support: https://docs.sheetjs.com/docs/miscellany/formats/
- The UI UX Pro Max design-system generator produced a landing-page pattern for the broad query; the plan instead uses its verified data-dense dashboard style, high-contrast government palette, and dashboard typography search results. Do not use the off-topic landing-page pattern or its unsuitable font pairing.
