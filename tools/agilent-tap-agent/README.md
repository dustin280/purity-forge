# Agilent 1290 live-feed agent

Runs on the OpenLab CDS workstation and streams what the instrument stack is
doing — chromatogram signals, pump pressure / flow / solvent ratios, module
temperatures, run and sequence state — into the Lab Manager
(`/lab-logs/live-instruments`) while runs are in progress. It is strictly
passive: a read-only packet capture of the instrument LAN. It never opens a
connection to, or sends a byte to, the instrument.

Full protocol/data-model notes: `docs/instrument-live-feed.md`.

## Requirements

- Windows PC with the instrument LAN NIC (the one on `192.168.254.x`).
- Wireshark with **Npcap** installed (`tshark.exe` is used for capture).
- Python 3.10+ (standard library only).
- Network access to the Lab Manager (`https://syxlab.org`).

## Setup

1. In the Lab Manager, **Admin → Instruments → Feed keys**: create a key for
   the instrument. Copy the generated `config.json` snippet (the secret is shown
   once).
2. Copy this folder to the OpenLab PC, e.g. `C:\SyxLab\agilent-tap-agent\`.
3. Create `config.json` from `config.example.json` and paste the snippet; set
   `interface` to the NIC name shown by `tshark -D` (e.g. `Ethernet 3`) and
   `ip` to the instrument stack's address (see `arp -a` or the module's LAN
   display).
4. Test in the foreground:

   ```bash
   python agilent_tap_agent.py --config config.json --verbose
   ```

   The instrument should appear as **Idle** on the Live Instruments page
   within ~15 s (heartbeat) and stream while a run is in progress.

5. Run unattended — either a Scheduled Task ("At startup", run whether user
   is logged on or not, restart on failure) or a service via
   [NSSM](https://nssm.cc):

   ```bat
   nssm install SyxLabInstrumentAgent "C:\Python313\python.exe" "C:\SyxLab\agilent-tap-agent\agilent_tap_agent.py --config C:\SyxLab\agilent-tap-agent\config.json"
   nssm set SyxLabInstrumentAgent AppStdout C:\SyxLab\agilent-tap-agent\agent.log
   nssm set SyxLabInstrumentAgent AppStderr C:\SyxLab\agilent-tap-agent\agent.log
   nssm start SyxLabInstrumentAgent
   ```

Multiple instruments on the same LAN are handled by one agent — add one entry
per instrument (each with its own key) to `instruments`.

## Verify without an instrument (replay)

```bash
python agilent_tap_agent.py --config config.json --replay "C:\Lab Working docs\scan agilent 0945 start acquisition.pcapng" --speed 20
```

Replays a saved capture through the identical pipeline at 20× speed: the Live
page should show the run, and when it finishes a Daily Backpressure row
(`source = live`) and a replayable run appear.

## What gets sent

- `/api/instrument/feed` every second: the newest samples of the monitor
  streams (1 Hz-ish, ~2 KB) and instrument status. Best effort.
- `/api/instrument/event`: `sequence_started`, `run_started`,
  `run_completed` (exact acquisition traces: DAD A–H at 2.5 Hz, pressure /
  flow / solvents / temperatures at 1 Hz, plus the initiation summary the
  Daily Backpressure log uses), `sequence_completed`, and `heartbeat` while
  idle. Queued, retried with backoff and spooled to `spool/` while the app is
  unreachable, so nothing is lost across outages.
- `pressure_log` events, one per minute (`pressure_log_interval_s`, 0
  disables) whenever the instrument is on — idle or running: the window's
  mean / min / max pump pressure, mean flow and column temperature, plus the
  sequence/run it fell in. This is the continuous log behind the *Instrument
  Pressure Log* page and the dashboard's daily first/last pressure chart. Same
  reliable queue as the other events.
- Run information: ~2 min before each injection OpenLab invokes
  `SetRunInformation` on its port-80 WebSocket (masked client frames — the agent
  unmasks them): sample name, sample type, method name, sequence name, vial,
  operator, project. Attached to the next run (`run_info` on run events and
  batches, `sample_position` = vial, method into the run summary).
- The installed column: the column compartment answers OpenLab's `COL:DATAX?`
  query before and after every run with a JSON record (description, part
  number, dimensions, particle size, pressure limit, injection count, first /
  last use). The agent keeps the latest record (also on disk,
  `spool/column_<instrument>.state`, so a restart between runs still knows it)
  and sends it with every run event, `pressure_log` entry and feed batch; the
  app matches it to its HPLC Columns list, marks it installed, and stamps
  Daily Backpressure rows and the continuous log with it.

## Notes

- Sequence and run boundaries come from OpenLab's own status pushes
  (`AnalysisState` / `RunState`); if those are not visible on the wire the
  agent falls back to inferring runs from the acquisition streams.
- Daily Backpressure rows are one per sequence, and `backpressure` / flow /
  column temperature are the mean over the first 15 s of the first injection —
  the same definition the Drive `.dx` importer used, so the trend chart is
  continuous.
- The acquisition method name is not available on the wire; that column stays
  empty for live rows.
