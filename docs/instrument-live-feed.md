# Instrument live feed

Live chromatogram / pump / module data from the Agilent 1290 Infinity II/III
stacks, plus automatic Daily Backpressure logging, sourced from a read-only
packet capture of the instrument LAN. Replaced the hourly Drive `.dx`
importer for pressure on 2026-09-03 (archived under
`archive/drive-pressure-importer/`).

## Pieces

| Piece | Where |
|---|---|
| On-prem agent (Python, runs on the OpenLab PC) | `tools/agilent-tap-agent/` |
| Wire-protocol decoder (verified against OpenLab `.rslt` data) | `tools/agilent-tap-agent/agilent1290_parser.py` |
| Ingest routes (HMAC per instrument) | `src/routes/api/instrument/feed.ts`, `src/routes/api/instrument/event.ts` |
| Processing, Realtime fan-out, Daily Backpressure writes | `src/lib/instrument-feed.server.ts` |
| Server functions for the UI / admin keys | `src/lib/instrument-feed.functions.ts` |
| Live page + replay | `src/routes/_authenticated/lab-logs/live-instruments/` |
| Dashboard card | `src/components/dashboard/live-instruments-card.tsx` |
| Continuous pressure log page (review / filter / print / CSV) | `src/routes/_authenticated/lab-logs/pressure-log/`, `src/components/pressure-log/` |
| Dashboard daily first/last pressure chart | `src/components/dashboard/pressure-bookends-chart.tsx` |
| Feed-key admin | Admin → Instruments → *Feed keys* (`src/components/live-instruments/feed-keys-panel.tsx`) |
| Schema | `supabase/migrations/20260903170000_instrument_live_feed.sql`, `supabase/migrations/20260903230000_instrument_pressure_log.sql` |

## Data flow

```
Agilent stack ──(instrument LAN, passive tshark capture)──▶ agent on OpenLab PC
     │  TCP 9100: proprietary telemetry (decoded per channel/sub-id)
     │  TCP 80:   SignalR StatusData (RunState / AnalysisState / module ids)
     ▼
POST /api/instrument/feed  (1/s)  ──▶ instrument_live_status upsert
                                   ──▶ Realtime broadcast  topic instrument:<id>, event "batch"
POST /api/instrument/event        ──▶ instrument_sequences / instrument_runs
                                   ──▶ storage instrument-traces/<instrument>/<run>.json
                                   ──▶ daily_backpressure_logs (source = 'live')
                                   ──▶ hplc_columns.total_injections (+1 per injection)
                                   ──▶ Realtime broadcast event "lifecycle"
                                   ──▶ instrument_pressure_log (pressure_log, once a minute)
Browser (Live Instruments page) ◀── supabase.channel("instrument:<id>") broadcast
```

Time axes are run-relative seconds (`t0` per stream) for stored traces; the
agent derives them from each module's own tick clock (DAD 240 Hz, pump
200.24 Hz, sampler 200 Hz, thermostat 10 Hz), which is what OpenLab's stored
timestamps are based on too. Live batches additionally carry `w0`, the
wall-clock epoch of each chunk's first value (the same tick clock anchored on
arrival), which the Live page uses as its axis.

## Live page history and window

`/api/instrument/feed` keeps every batch for `LIVE_HISTORY_MINUTES` (60) in
`instrument_live_batches`, decimated to <= 5 Hz for pump streams and 1 Hz
for temperatures (DAD signals stay at 2.5 Hz), pruned by the route every
~2 min and by pg_cron (`instrument-live-batches-prune`) as a backstop.
`getInstrumentLiveHistory()` returns the requested streams for the last hour
as contiguous segments plus the runs seen in that window; the Live page loads
it per selected stream when it opens and prepends it to the Realtime stream,
so the charts show the recent past immediately. All live charts share one
window (5 / 15 / 30 / 60 min, default 15) and one slider that pans it across
the cached hour; "Live" snaps back to following the newest data. Run starts
are drawn as markers, a second axis under each chart counts minutes into the
injection (restarting at every run start, blank between runs) so retention
times can be read directly, and the tooltip shows the time into the injection.

The `channel_id` byte in the port-9100 protocol is a handle the instrument
allocates **per TCP connection**, not a fixed identifier: OpenLab gets one
channel per module for the per-second monitor copies when it connects, each
run's acquisition streams arrive on further, separate channels that exist only
for that run (their header "handle" field is a per-message counter), and a new
connection reuses the same small numbers for different modules (observed the
same day: 0x1f was the thermostat monitor on one connection and the pump's
acquisition channel on the next). The agent therefore keeps one classifier per
connection and identifies each channel's module at runtime from its tick clock
and sub-ID set (`tools/agilent-tap-agent/stream_defs.py`), buffering a
channel's messages until it is identified (a few seconds for monitor channels,
one or two acquisition batches at run start), re-identifying a channel whose
messages start voting for another module, and recognising text/status channels
by content and spectra by message type. Agent 1.0.x kept a single classifier
for its whole lifetime, so after OpenLab's first reconnect the acquisition
channels of later runs hit stale mappings and those runs got no pressure
summary — fixed in 1.1.1.

## Authentication

`x-instrument-id: <instruments.id>` and `x-signature: hex(HMAC-SHA256(secret,
raw body))`. Secrets live in `instrument_feed_keys` (one or more per
instrument, revocable, shown once at creation). Same pattern as the partner
order webhook, scoped per instrument.

## Streams

| Stream name | Units | Rate | Source |
|---|---|---|---|
| `DAD1A` … `DAD1H` | mAU | 2.5 Hz | DAD wavelength signals A–H (wavelengths in `labels`, e.g. `214 nm`) |
| `PMP1B_Pressure` | bar | 40 Hz live / 1 Hz stored | Binary pump |
| `PMP1C_Flow` | mL/min | 20 Hz / 1 Hz | Binary pump |
| `PMP1D_SolventRatioA`, `PMP1E_SolventRatioB` | % | 20 Hz / 1 Hz | Binary pump |
| `THM1A_LeftTemp`, `THM1B_RightTemp` | °C | 1 Hz | Column compartment |
| `WPS1A_Temperature` | °C | 10 Hz / 1 Hz | Multisampler |
| `DAD1T_BoardTemp`, `DAD1U_OpticalUnitTemp` | °C | 10 Hz (live only) | DAD housekeeping |

Live batches carry the instrument's *monitor* copies of these streams (sent
by the instrument once a second); stored run traces use the *acquisition*
copies, which are sample-for-sample identical to what OpenLab writes into the
`.dx` files (verified for every stream above).

## Daily Backpressure semantics (unchanged from the Drive importer)

- One row per **sequence** (`AnalysisState` active period in OpenLab).
- `backpressure`, `flow_rate`, `column_temp` = mean over the first 15 s of the
  sequence's **first injection**.
- `pressure_run_min/max` widened as further injections complete;
  `injections_count` incremented per injection; the column installed on the
  instrument (`hplc_columns.installed_on_instrument_id`) gets `+1` per injection.
- `source = 'live'`, `user_name = 'Live Instrument Feed'`,
  `instrument_id` / `instrument_sequence_id` set.
- `acquisition_method` comes from OpenLab's SetRunInformation (agent 1.3.0+).
- The log keeps growing at one row per sequence (the audit record). The
  Daily Backpressure page charts the continuous per-minute log instead, one
  point per local day and column (`instrument_pressure_daily_by_column()`:
  the day's peak with its time, first/last and entry count, pump-delivering
  entries only, like the dashboard's daily peak chart), with injections per
  day from the rows (`daily_backpressure_daily_summary()`) on the right axis,
  and lists the rows for the chosen date range, paged. At hundreds of
  sequences a day the rows remain the record while the views stay readable.

## Continuous pressure log

Independently of runs, the agent folds the pump's monitor stream into one
`pressure_log` event per minute (`pressure_log_interval_s` in the agent
config; windows are aligned to the clock, so entries land at :00 seconds)
whenever the instrument is on, idle or running: mean / min / max pressure,
mean flow, mean column temperature, sample count, and the sequence/run the
window fell in. The server upserts it into `instrument_pressure_log`
(unique per instrument and window start, so retries and replays are
idempotent). About 1,440 rows per instrument-day.

- **Instrument Pressure Log** page (Lab Logs): filter by instrument, date
  range, running/idle and "pump delivering only"; chart with the per-minute
  min–max band and flow; paginated table with a *Replay* link into the stored
  run; Print (full filtered table) and CSV.
- **Dashboard chart**: each local day's highest logged pressure (the peak
  inside the per-minute entries, with its time and the minute mean in the
  tooltip, plus first/last for reference) over the last 14/30/60/90 days,
  counting only entries logged while the pump was delivering (`flow > 0`),
  via the SQL function `instrument_pressure_daily_bookends`. A static daily
  sample, not live.

Replaying a capture also writes log entries, stamped with the capture's own
times (the windows follow the packet clock), so a replay of an old capture
fills in that day rather than today.

## Run information (sample, method)

The workstation side of the port-80 connection is a WebSocket whose frames
the client masks, which is why nothing readable shows up in a plain capture.
Unmasked, it is a keep-alive ping every 15 s plus, about two minutes before
each injection, a SignalR invocation `SetRunInformation` with the sample
name, sample type, method (name and path), sequence name, vial, operator and
project — the same values the `.rslt` manifest ends up with. The agent keeps
the latest call and attaches it to the next run: `run_info` on `run_started`
/ `run_completed` and on live batches, `sample_position` = vial, and the
method name in the run summary. The server stores it on `instrument_runs`
(`sample_name`, `sample_type`, `method_name`, `sequence_name`, `run_info`) and
uses the method name for the live Daily Backpressure row's
`acquisition_method`. The Live page shows sample · type · method in bold
above the chromatogram (the current injection while running, otherwise the
last run's).

## Public viewer (/live)

A read-only page outside the login for people who should see a run as it
happens: the sample name and the chromatogram (primary detector signal),
with the same window/slider and run markers as the private page, nothing
else. Access is by one-time passcode:

- An admin generates a passcode on Live Instruments → *Public viewer
  passcodes* (`createPublicLiveCode`; optional label and instrument). It is
  shown once; only its hash is stored (`public_live_access_codes`).
- The viewer opens `/live`, enters the code; `POST /api/public/live/redeem`
  turns it into a 64-hex session token (the code is spent) valid for 12 h,
  kept in that browser's localStorage. Unredeemed codes lapse after 24 h.
- The page polls `GET /api/public/live/snapshot` (bearer token, every 2 s:
  the cached hour first, then only rows newer than its cursor). The route
  verifies the token, reads `instrument_live_batches` with the service
  role, and serves detector signals only — no pressure, method, column or
  anything beyond instrument name, state and sample name. Guests never touch
  Supabase auth or the Realtime channel, and the token opens no other route.
- Admins see each code's state (unused / viewing until / used / lapsed /
  revoked) and can revoke one at any time, which ends its session at the
  next poll.

## The installed column

OpenLab asks the column compartment for its column record (`COL:DATAX? 7`)
about 10 s before each run and again after it; the reply is a JSON record —
description, part number, diameter / length / particle size, pressure limit,
injection count, first and last use (see the parser docstring). The agent
forwards the latest record on every run event, `pressure_log` entry and feed
batch (`column`), and the server:

- matches it to `hplc_columns` by part number, then by name
  (case-insensitive), and **creates** the row when the column is new to the
  app (name = description + geometry, injection count seeded from the
  instrument's counter, rated max from its pressure limit);
- marks that column as installed on the instrument (`installed_on_instrument_id`),
  un-installing any other column marked for it;
- stamps `instrument_runs.column_name` / `column_info`,
  `instrument_pressure_log.column_name` and the live Daily Backpressure row's
  `column_name` with the app's column name, and counts each completed injection
  on that column.

Both the dashboard's daily peak chart and the Instrument Pressure Log
page can then be filtered per column (`instrument_pressure_log_columns()`
lists the columns seen in a window). Entries logged before the agent has seen
a column record (e.g. right after an install, before the first run) have no
column.

## The Drive importer is retired

Done 2026-09-03 after the first live row was checked against a real sequence:
migration `20260903235000_retire_drive_pressure_importer.sql` unscheduled the
hourly pg_cron job and dropped its trigger function, the importer's code and
cron route moved to `archive/drive-pressure-importer/` (with restore notes),
and the *Run watcher now* button was removed from the Daily Backpressure page.
Rows it wrote (`source = 'auto'`) remain; new rows are `source = 'live'`.

## Realtime payloads

`batch`:

```jsonc
{
  "sent_at": "2026-09-03T14:46:52.100+00:00",
  "batch_seq": 812,
  "status": { "state": "running", "run_state": 1, "analysis_state": 1, "ready_state": 1, "error_state": 2, "not_ready_text": null },
  "sequence": { "key": "seq-20260903T144504", "started_at": "…" },
  "run": { "key": "run-20260903T144649", "injection_index": 1, "started_at": "…" },
  "streams": { "PMP1B_Pressure": { "units": "bar", "t0": 12.015, "dt": 0.025, "values": [611.2, …] }, "DAD1A": { … } },
  "labels": { "DAD1A": "214 nm", … }
}
```

`lifecycle`: `{ "type": "run_started" | "run_completed" | "sequence_started" | "sequence_completed", "run": …, "run_id": …, "sequence_id": … }`.

## Verifying end to end

`python tools/agilent-tap-agent/agilent_tap_agent.py --config config.json
--replay <capture.pcapng> --speed 20` replays a real capture through the whole
pipeline; the Live page should stream the run and a `source = 'live'` Daily
Backpressure row plus a replayable run should appear when it ends. The
reference capture from 2026-09-03 07:45 produces `backpressure ≈ 594.6 bar`,
`min/max 432.85 / 669.52`, matching the row the Drive importer had written for
the same run.
