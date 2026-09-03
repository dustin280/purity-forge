"""
Agilent 1290 live-feed agent for the Synthesyx Lab Manager.

Runs on the OpenLab CDS workstation. Passively captures the instrument LAN
with tshark (read-only: it never sends a byte to the instrument), decodes the
proprietary port-9100 telemetry with agilent1290_parser.py, reads the run /
sequence state from the port-80 SignalR status pushes, and reports to the Lab
Manager:

  POST <app_url>/api/instrument/feed   once a second: newest samples + status
  POST <app_url>/api/instrument/event  sequence_started / run_started /
                                       run_completed (+ per-run traces and the
                                       Daily-Backpressure summary) /
                                       sequence_completed / heartbeat

Every request is signed: x-instrument-id + x-signature (hex HMAC-SHA256 of
the raw body under that instrument's feed key, created under Admin ->
Instruments -> Feed keys).

    python agilent_tap_agent.py --config config.json            # live
    python agilent_tap_agent.py --config config.json --replay capture.pcapng [--speed 10]

Replay mode feeds a saved capture through the identical pipeline at (scaled)
real-time pace — use it to verify the app end-to-end without an instrument.

Python 3.10+, standard library only; needs Wireshark's tshark.
"""

from __future__ import annotations

import argparse
import hashlib
import hmac
import json
import logging
import os
import queue
import re
import socket
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Optional

sys.path.insert(0, str(Path(__file__).resolve().parent))
import agilent1290_parser as proto  # noqa: E402

AGENT_VERSION = "1.0.0"
LOG = logging.getLogger("agilent-tap-agent")

DEFAULT_TSHARK = r"C:\Program Files\Wireshark\tshark.exe"
TELEMETRY_PORT = 9100
STATUS_PORT = 80

# OpenLab RunState / AnalysisState values observed on the wire (SignalR StatusData).
RUN_STATE_ACQUIRING = 1
RUN_STATE_POSTRUN = 2
ANALYSIS_ACTIVE = 1
ANALYSIS_IDLE = 2

# Daily Backpressure "at initiation of a run" window, identical to the Drive
# importer (pressure-watcher.functions.ts: INITIATION_WINDOW_MINUTES = 0.25).
INITIATION_WINDOW_S = 15.0

# Streams broadcast live (monitor copies, 1 message/s, low latency).
LIVE_STREAMS = {
    "DAD1A", "DAD1B", "DAD1C", "DAD1D", "DAD1E", "DAD1F", "DAD1G", "DAD1H",
    "PMP1B_Pressure", "PMP1C_Flow", "PMP1D_SolventRatioA", "PMP1E_SolventRatioB",
    "THM1A_LeftTemp", "THM1B_RightTemp", "WPS1A_Temperature",
    "DAD1T_BoardTemp", "DAD1U_OpticalUnitTemp",
}
# Streams stored per run (acquisition copies — the exact samples OpenLab keeps).
TRACE_STREAMS = {
    "DAD1A": None, "DAD1B": None, "DAD1C": None, "DAD1D": None,
    "DAD1E": None, "DAD1F": None, "DAD1G": None, "DAD1H": None,
    "PMP1B_Pressure": 1.0, "PMP1C_Flow": 1.0, "PMP1D_SolventRatioA": 1.0,
    "PMP1E_SolventRatioB": 1.0, "THM1A_LeftTemp": None, "THM1B_RightTemp": None,
    "WPS1A_Temperature": 1.0,
}  # value = decimation interval in seconds (None = keep native rate)


def utc_iso(epoch: float) -> str:
    return datetime.fromtimestamp(epoch, tz=timezone.utc).isoformat(timespec="milliseconds")


# ----------------------------------------------------------------------------
# HTTP client with signing + spooling
# ----------------------------------------------------------------------------

class AppClient:
    def __init__(self, app_url: str, spool_dir: Path):
        self.app_url = app_url.rstrip("/")
        self.spool_dir = spool_dir
        self.spool_dir.mkdir(parents=True, exist_ok=True)
        self.events: "queue.Queue[tuple[str, str, dict]]" = queue.Queue()
        self.host = socket.gethostname()
        threading.Thread(target=self._event_worker, name="events", daemon=True).start()

    def _post(self, path: str, instrument_id: str, secret: str, body: dict, timeout: float) -> tuple[int, str]:
        raw = json.dumps(body, separators=(",", ":")).encode("utf-8")
        sig = hmac.new(secret.encode("utf-8"), raw, hashlib.sha256).hexdigest()
        req = urllib.request.Request(
            self.app_url + path, data=raw, method="POST",
            headers={"Content-Type": "application/json", "x-instrument-id": instrument_id, "x-signature": sig,
                     "User-Agent": f"agilent-tap-agent/{AGENT_VERSION}"},
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.status, r.read().decode("utf-8", "replace")[:300]
        except urllib.error.HTTPError as e:
            return e.code, e.read().decode("utf-8", "replace")[:300]

    def send_batch(self, instrument_id: str, secret: str, body: dict) -> None:
        """Best effort: a lost live batch is just a one-second gap on screen."""
        try:
            status, text = self._post("/api/instrument/feed", instrument_id, secret, body, timeout=8)
            if status != 200:
                LOG.warning("feed batch rejected (%s): %s", status, text)
        except Exception as e:  # noqa: BLE001
            LOG.warning("feed batch failed: %s", e)

    def send_event(self, instrument_id: str, secret: str, body: dict) -> None:
        """Reliable: queued, retried with backoff, spooled to disk while the app is unreachable."""
        self.events.put((instrument_id, secret, body))

    def _spool_path(self, instrument_id: str, body: dict) -> Path:
        stamp = body.get("sent_at", utc_iso(time.time())).replace(":", "").replace("-", "")
        return self.spool_dir / f"{instrument_id}_{stamp}_{body.get('type', 'event')}.json"

    def _event_worker(self) -> None:
        # Drain anything spooled by an earlier crash first.
        for p in sorted(self.spool_dir.glob("*.json")):
            try:
                rec = json.loads(p.read_text("utf-8"))
                self.events.put((rec["instrument_id"], rec["secret"], rec["body"]))
                p.unlink()
            except Exception as e:  # noqa: BLE001
                LOG.error("bad spool file %s: %s", p, e)
        while True:
            instrument_id, secret, body = self.events.get()
            delay = 2.0
            spooled: Optional[Path] = None
            while True:
                try:
                    status, text = self._post("/api/instrument/event", instrument_id, secret, body, timeout=60)
                    if status == 200:
                        LOG.info("event %s ok: %s", body.get("type"), text[:120])
                        if spooled and spooled.exists():
                            spooled.unlink()
                        break
                    if status in (400, 401, 422):
                        # Bad payload or bad key: retrying can't help.
                        LOG.error("event %s rejected (%s): %s — dropping", body.get("type"), status, text[:200])
                        if spooled and spooled.exists():
                            spooled.unlink()
                        break
                    # 404/403 (routes not deployed yet, gateway), 5xx, etc.: keep retrying.
                    LOG.warning("event %s not accepted (%s): %s", body.get("type"), status, text[:120])
                except Exception as e:  # noqa: BLE001
                    LOG.warning("event %s send failed: %s", body.get("type"), e)
                if spooled is None:
                    spooled = self._spool_path(instrument_id, body)
                    spooled.write_text(json.dumps({"instrument_id": instrument_id, "secret": secret, "body": body}), "utf-8")
                time.sleep(delay)
                delay = min(delay * 2, 300.0)


# ----------------------------------------------------------------------------
# TCP reassembly (per direction) with a small reorder buffer
# ----------------------------------------------------------------------------

class Reassembler:
    def __init__(self, on_bytes: Callable[[bytes], None]):
        self.on_bytes = on_bytes
        self.expected: Optional[int] = None
        self.pending: dict[int, bytes] = {}
        self.pending_since: Optional[float] = None

    def feed(self, seq: int, payload: bytes, now: float) -> None:
        if self.expected is None:
            self.expected = seq
        if seq == self.expected:
            self.on_bytes(payload)
            self.expected = seq + len(payload)
            self._flush()
        elif seq > self.expected:
            self.pending[seq] = payload
            self.pending_since = self.pending_since or now
            if now - self.pending_since > 3.0 or len(self.pending) > 200:
                # Gave up on the missing segment: jump ahead. The consumer resyncs.
                LOG.warning("tcp gap at %d, skipping ahead", self.expected)
                nxt = min(self.pending)
                self.expected = nxt
                self.on_bytes(b"")  # signal loss
                self._flush()
        else:
            overlap = self.expected - seq
            if overlap < len(payload):
                self.on_bytes(payload[overlap:])
                self.expected = seq + len(payload)
                self._flush()

    def _flush(self) -> None:
        while self.expected in self.pending:
            payload = self.pending.pop(self.expected)
            self.on_bytes(payload)
            self.expected += len(payload)
        if not self.pending:
            self.pending_since = None


class TelemetryDecoder:
    """Incremental length-prefixed message walker for the port-9100 stream."""

    def __init__(self, on_message: Callable[[dict], None]):
        self.buf = bytearray()
        self.on_message = on_message
        self.need_resync = False

    def feed(self, data: bytes) -> None:
        if data == b"":
            self.buf.clear()
            self.need_resync = True
            return
        self.buf.extend(data)
        if self.need_resync:
            self._resync()
        while len(self.buf) >= 2:
            total_len = int.from_bytes(self.buf[0:2], "big")
            if total_len < 2 or total_len > 4096:
                self.need_resync = True
                self._resync()
                if self.need_resync:
                    return
                continue
            if len(self.buf) < total_len:
                return
            body = bytes(self.buf[:total_len])
            del self.buf[:total_len]
            m = proto.decode_message(body)
            if m is not None and m["values"]:
                self.on_message(m)

    def _resync(self) -> None:
        # Find two consecutive plausible headers (marker 0xF8, sane lengths).
        for p in range(0, max(0, len(self.buf) - 40)):
            L = int.from_bytes(self.buf[p:p + 2], "big")
            if 34 <= L <= 4096 and self.buf[p + 2] == 0xF8 and p + L + 3 <= len(self.buf):
                L2 = int.from_bytes(self.buf[p + L:p + L + 2], "big")
                if 7 <= L2 <= 4096 and (L2 < 34 or self.buf[p + L + 2] == 0xF8):
                    del self.buf[:p]
                    self.need_resync = False
                    return
        if len(self.buf) > 8192:
            del self.buf[:-4096]


class StatusDecoder:
    """Pulls SignalR StatusData JSON records out of the port-80 stream."""

    RECORD = re.compile(rb'\{"type".*?\}\x1e', re.S)

    def __init__(self, on_status: Callable[[dict], None]):
        self.buf = bytearray()
        self.on_status = on_status

    def feed(self, data: bytes) -> None:
        if data == b"":
            self.buf.clear()
            return
        self.buf.extend(data)
        last_end = 0
        for m in self.RECORD.finditer(self.buf):
            last_end = m.end()
            try:
                msg = json.loads(m.group(0)[:-1].decode("utf-8", "replace"))
            except ValueError:
                continue
            args = msg.get("arguments") or []
            if msg.get("target") == "ObservableValueChanged" and len(args) >= 3 and args[0] == "StatusData":
                try:
                    self.on_status(json.loads(args[2]))
                except ValueError:
                    pass
        if last_end:
            del self.buf[:last_end]
        elif len(self.buf) > 65536:
            del self.buf[:-8192]


# ----------------------------------------------------------------------------
# Per-instrument state machine
# ----------------------------------------------------------------------------

@dataclass
class StreamState:
    name: str
    units: str
    dt: float
    unwrap: proto._TickUnwrapper
    anchor_tick: Optional[int] = None
    t0: float = 0.0
    pending: list[tuple[float, float]] = field(default_factory=list)   # (t, value) not yet sent live
    run_values: list[tuple[float, float]] = field(default_factory=list)  # acquisition samples for the run


@dataclass
class RunState:
    key: str
    injection_index: int
    started_at: float
    # True when the agent joined this run mid-way (started up, or reconnected,
    # while acquisition was already in progress). Its first samples are not
    # the run's initiation, so it must not produce a Daily Backpressure value.
    partial: bool = False
    acq: dict[str, StreamState] = field(default_factory=dict)


@dataclass
class SequenceState:
    key: str
    started_at: float
    injections: int = 0


class Instrument:
    def __init__(self, cfg: dict, client: AppClient, batch_interval: float, heartbeat_interval: float):
        self.id: str = cfg["instrument_id"]
        self.name: str = cfg.get("name", self.id)
        self.ip: str = cfg["ip"]
        self.secret: str = cfg["secret"]
        self.client = client
        self.batch_interval = batch_interval
        self.heartbeat_interval = heartbeat_interval

        self.telemetry = TelemetryDecoder(self.on_message)
        self.status = StatusDecoder(self.on_status)
        self.reasm: dict[tuple[int, int], Reassembler] = {}

        self.run_state: Optional[int] = None
        self.analysis_state: Optional[int] = None
        self.ready_state: Optional[int] = None
        self.error_state: Optional[int] = None
        self.not_ready_text: Optional[str] = None
        self.last_status_at: float = 0.0
        self.modules: dict[str, dict] = {}
        self.wavelengths: dict[str, float] = {}

        self.sequence: Optional[SequenceState] = None
        self.run: Optional[RunState] = None
        # A run whose RunState has ended but whose last acquisition batches may
        # still be in flight (the instrument flushes its final partial batch a
        # couple of seconds after OpenLab flips RunState).
        self.ending: Optional[tuple[RunState, float]] = None
        self.monitor: dict[str, StreamState] = {}
        self.last_acq_at: float = 0.0
        self.idle_anchor: float = time.time()
        self.batch_seq = 0
        self.last_batch_at = 0.0
        self.last_heartbeat_at = 0.0
        self.now = time.time()

    # ---- packet input ----
    def on_segment(self, ts: float, src_port: int, dst_port: int, seq: int, payload: bytes) -> None:
        self.now = ts
        key = (src_port, dst_port)
        r = self.reasm.get(key)
        if r is None:
            sink = self.telemetry.feed if src_port == TELEMETRY_PORT else self.status.feed if src_port == STATUS_PORT else None
            if sink is None:
                return
            r = self.reasm[key] = Reassembler(sink)
        r.feed(seq, payload, ts)

    # ---- SignalR status ----
    def on_status(self, sd: dict) -> None:
        self.last_status_at = self.now
        run_state = sd.get("RunState")
        analysis_state = sd.get("AnalysisState")
        self.ready_state = sd.get("ReadyState")
        self.error_state = sd.get("ErrorState")
        texts = []
        for item in sd.get("NotReadyTextList") or []:
            d = item.get("CultureCodeToLocalizedStringDictionary") or {}
            mod = item.get("ModuleIdentifier") or {}
            if mod.get("SerialNumber"):
                self.modules[mod["SerialNumber"]] = {"type": mod.get("ModuleType", ""), "serial": mod["SerialNumber"], "name": mod.get("DisplayName", "")}
            txt = d.get("en-US") or d.get("default")
            if txt:
                texts.append(f"{mod.get('DisplayName', '')}: {txt}".strip(": "))
        self.not_ready_text = "; ".join(texts) or None

        if analysis_state != self.analysis_state:
            prev = self.analysis_state
            self.analysis_state = analysis_state
            if analysis_state == ANALYSIS_ACTIVE:
                self.start_sequence(self.now)
            elif prev == ANALYSIS_ACTIVE and analysis_state == ANALYSIS_IDLE:
                self.end_sequence(self.now)
        if run_state != self.run_state:
            prev = self.run_state
            self.run_state = run_state
            if run_state == RUN_STATE_ACQUIRING:
                self.start_run(self.now)
            elif prev == RUN_STATE_ACQUIRING:
                self.begin_run_end(self.now)

    # ---- telemetry ----
    def on_message(self, m: dict) -> None:
        ch = m["channel_id"]
        if ch in proto.TEXT_CHANNELS:
            if ch == 0x25:
                txt = proto.values_as_text(m["values"])
                for n, wl in re.findall(r"ACT:SIG(\d) ([\d.]+),", txt):
                    self.wavelengths["ABCDEFGH"[int(n) - 1]] = float(wl)
            return
        if ch not in proto.CLOCK_HZ or m["msg_type"] == proto.SPECTRUM_MSG_TYPE:
            return
        st = proto.STREAMS.get((ch, m["sub_id"])) or proto.STREAMS.get((ch, None))
        if st is None:
            return
        clock = proto.CLOCK_HZ[ch]
        dt = st["ticks_per_sample"] / clock
        name = st["name"]
        if st["monitor"]:
            base = name[: -len("_monitor")]
            if base not in LIVE_STREAMS:
                return
            s = self.monitor.get(base)
            if s is None:
                s = self.monitor[base] = StreamState(base, st["units"], dt, proto._TickUnwrapper(32))
            tick = s.unwrap(m["tick"])
            if s.anchor_tick is None:
                s.anchor_tick, s.t0 = tick, (st["t0_ms"] / 1000.0 if self.run else 0.0)
            t_batch = s.t0 + (tick - s.anchor_tick) / clock
            for i, v in enumerate(m["values"]):
                s.pending.append((t_batch + i * dt, v * st["scale"]))
        else:
            # Acquisition batches: exact samples, only during a run (or its tail).
            self.last_acq_at = self.now
            target = self.run or (self.ending[0] if self.ending else None)
            if target is None:
                self.start_run(self.now, inferred=True)
                target = self.run
            assert target is not None
            if name not in TRACE_STREAMS:
                return
            s = target.acq.get(name)
            if s is None:
                s = target.acq[name] = StreamState(name, st["units"], dt, proto._TickUnwrapper(32))
            tick = s.unwrap(m["tick"])
            if s.anchor_tick is None:
                s.anchor_tick, s.t0 = tick, st["t0_ms"] / 1000.0
            t_batch = s.t0 + (tick - s.anchor_tick) / clock
            for i, v in enumerate(m["values"]):
                s.run_values.append((t_batch + i * dt, v * st["scale"]))

    # ---- lifecycle ----
    def state_dict(self) -> dict:
        return {
            "state": "running" if self.run else "idle",
            "run_state": self.run_state, "analysis_state": self.analysis_state,
            "ready_state": self.ready_state, "error_state": self.error_state,
            "not_ready_text": self.not_ready_text,
        }

    def agent_dict(self) -> dict:
        return {"host": self.client.host, "version": AGENT_VERSION}

    def start_sequence(self, ts: float) -> None:
        if self.sequence:
            return
        key = f"seq-{utc_iso(ts).replace(':', '').replace('-', '')}"
        self.sequence = SequenceState(key, ts)
        LOG.info("[%s] sequence started %s", self.name, key)
        self.client.send_event(self.id, self.secret, {
            "type": "sequence_started", "sent_at": utc_iso(ts), "agent": self.agent_dict(),
            "sequence": {"key": key, "started_at": utc_iso(ts)},
            "modules": list(self.modules.values()),
        })

    def end_sequence(self, ts: float) -> None:
        if not self.sequence:
            return
        if self.run:
            self.begin_run_end(ts)
        self.finalize_ending()
        LOG.info("[%s] sequence completed %s (%d injections)", self.name, self.sequence.key, self.sequence.injections)
        self.client.send_event(self.id, self.secret, {
            "type": "sequence_completed", "sent_at": utc_iso(ts), "agent": self.agent_dict(),
            "sequence": {"key": self.sequence.key, "started_at": utc_iso(self.sequence.started_at)},
            "ended_at": utc_iso(ts),
        })
        self.sequence = None

    def start_run(self, ts: float, inferred: bool = False) -> None:
        if self.run:
            return
        self.finalize_ending()  # a new run supersedes any tail we were still waiting on
        if self.sequence is None and inferred:
            self.start_sequence(ts)  # no SignalR seen: treat the burst of runs as one sequence
        idx = (self.sequence.injections + 1) if self.sequence else 1
        if self.sequence:
            self.sequence.injections = idx
        key = f"run-{utc_iso(ts).replace(':', '').replace('-', '')}"
        # An inferred start with no RunState transition behind it means we are
        # seeing a run that was already under way (agent just started, or the
        # capture restarted): treat it as partial.
        partial = inferred and self.run_state != RUN_STATE_ACQUIRING
        self.run = RunState(key, idx, ts, partial=partial)
        for s in self.monitor.values():  # re-anchor the live streams on run time zero
            s.anchor_tick, s.pending = None, []
        LOG.info("[%s] run started %s (injection %d%s)", self.name, key, idx,
                 ", inferred, partial" if partial else ", inferred" if inferred else "")
        self.client.send_event(self.id, self.secret, {
            "type": "run_started", "sent_at": utc_iso(ts), "agent": self.agent_dict(),
            "sequence": self._sequence_ref(),
            "run": {"key": key, "injection_index": idx, "started_at": utc_iso(ts)},
        })

    def _sequence_ref(self) -> Optional[dict]:
        return {"key": self.sequence.key, "started_at": utc_iso(self.sequence.started_at)} if self.sequence else None

    def begin_run_end(self, ts: float) -> None:
        """RunState left 'acquiring': stop treating the instrument as running,
        but hold the run open briefly so its final acquisition batch lands in it."""
        run = self.run
        if run is None:
            return
        self.run = None
        self.ending = (run, ts)
        for s in self.monitor.values():
            s.anchor_tick, s.pending = None, []

    def finalize_ending(self, force: bool = False) -> None:
        if not self.ending:
            return
        run, ts = self.ending
        self.ending = None
        self._finish_run(run, ts)

    def _finish_run(self, run: RunState, ts: float) -> None:
        summary, trace = self._summarize(run)
        LOG.info("[%s] run completed %s: start %s bar, min/max %s/%s", self.name, run.key,
                 summary.get("initiation", {}).get("pressure_bar"), summary.get("pressure_min_bar"), summary.get("pressure_max_bar"))
        self.client.send_event(self.id, self.secret, {
            "type": "run_completed", "sent_at": utc_iso(ts), "agent": self.agent_dict(),
            "sequence": self._sequence_ref(),
            "run": {"key": run.key, "injection_index": run.injection_index, "started_at": utc_iso(run.started_at)},
            "ended_at": utc_iso(ts), "duration_s": round(ts - run.started_at, 3),
            "summary": summary, "trace": trace,
        })

    def _summarize(self, run: RunState) -> tuple[dict, dict]:
        def mean_window(name: str) -> Optional[float]:
            s = run.acq.get(name)
            if not s or not s.run_values:
                return None
            vals = [v for t, v in s.run_values if t <= INITIATION_WINDOW_S]
            return (sum(vals) / len(vals)) if vals else s.run_values[0][1]

        pressure = run.acq.get("PMP1B_Pressure")
        pvals = [v for _, v in pressure.run_values] if pressure else []
        temps = [x for x in (mean_window("THM1A_LeftTemp"), mean_window("THM1B_RightTemp")) if x is not None]
        summary = {
            # A partial run has no trustworthy initiation window; nulls make the
            # server skip the Daily Backpressure row (min/max are still real).
            "initiation": {
                "pressure_bar": None if run.partial else mean_window("PMP1B_Pressure"),
                "flow_ml_min": None if run.partial else mean_window("PMP1C_Flow"),
                "column_temp_c": None if run.partial else ((sum(temps) / len(temps)) if temps else None),
            },
            "pressure_min_bar": min(pvals) if pvals else None,
            "pressure_max_bar": max(pvals) if pvals else None,
            "wavelengths_nm": dict(self.wavelengths),
            "method": None,
        }
        streams: dict[str, dict] = {}
        for name, decimate in TRACE_STREAMS.items():
            s = run.acq.get(name)
            if not s or not s.run_values:
                continue
            if decimate is None:
                streams[name] = {"units": s.units, "t0": round(s.run_values[0][0], 4), "dt": round(s.dt, 6),
                                 "values": [round(v, 4) for _, v in s.run_values]}
            else:
                t0 = s.run_values[0][0]
                buckets: dict[int, list[float]] = defaultdict(list)
                for t, v in s.run_values:
                    buckets[int((t - t0) / decimate)].append(v)
                n = max(buckets) + 1
                values = [round(sum(buckets[i]) / len(buckets[i]), 4) if buckets.get(i) else None for i in range(n)]
                # fill the rare empty bucket with its predecessor so the array stays numeric
                for i in range(n):
                    if values[i] is None:
                        values[i] = values[i - 1] if i else 0.0
                streams[name] = {"units": s.units, "t0": round(t0, 4), "dt": decimate, "values": values}
        return summary, {"version": 1, "streams": streams, "wavelengths_nm": dict(self.wavelengths)}

    # ---- periodic ----
    def tick(self, now: float) -> None:
        self.now = max(self.now, now)
        # No SignalR for a while but acquisition data flowing: infer run end when it stops.
        if self.run and self.last_status_at < self.run.started_at and self.last_acq_at and now - self.last_acq_at > 25:
            LOG.info("[%s] acquisition stream stopped; inferring run end", self.name)
            self.begin_run_end(self.last_acq_at)
        # Close out an ended run once its trailing batches have stopped (or after 30 s regardless).
        if self.ending and ((now - self.last_acq_at > 3.0 and now - self.ending[1] >= 3.0) or now - self.ending[1] > 30.0):
            self.finalize_ending()
        if now - self.last_batch_at >= self.batch_interval:
            self.last_batch_at = now
            self._send_batch(now)
        if not self.run and now - self.last_heartbeat_at >= self.heartbeat_interval:
            self.last_heartbeat_at = now
            self.client.send_event(self.id, self.secret, {
                "type": "heartbeat", "sent_at": utc_iso(now), "agent": self.agent_dict(),
                "status": self.state_dict(), "modules": list(self.modules.values()),
            })

    def _send_batch(self, now: float) -> None:
        streams = {}
        for name, s in self.monitor.items():
            if not s.pending:
                continue
            streams[name] = {"units": s.units, "t0": round(s.pending[0][0], 4), "dt": round(s.dt, 6),
                             "values": [round(v, 4) for _, v in s.pending]}
            s.pending = []
        if not streams and not self.run:
            return  # nothing new (instrument silent) — heartbeat covers presence
        self.batch_seq += 1
        body = {
            "agent": self.agent_dict(), "sent_at": utc_iso(now), "batch_seq": self.batch_seq,
            "status": self.state_dict(), "sequence": self._sequence_ref(),
            "run": {"key": self.run.key, "injection_index": self.run.injection_index, "started_at": utc_iso(self.run.started_at)} if self.run else None,
            "streams": streams,
            "labels": {f"DAD1{k}": f"{v:g} nm" for k, v in self.wavelengths.items()},
        }
        if self.modules:
            body["modules"] = list(self.modules.values())
        threading.Thread(target=self.client.send_batch, args=(self.id, self.secret, body), daemon=True).start()


# ----------------------------------------------------------------------------
# Capture
# ----------------------------------------------------------------------------

TSHARK_FIELDS = ["frame.time_epoch", "ip.src", "ip.dst", "tcp.srcport", "tcp.dstport", "tcp.seq", "tcp.len", "tcp.payload"]


def tshark_command(tshark: str, instruments: list[Instrument], interface: Optional[str], pcap: Optional[str]) -> list[str]:
    hosts = " or ".join(f"host {i.ip}" for i in instruments)
    ports = f"(tcp port {TELEMETRY_PORT} or tcp port {STATUS_PORT})"
    cmd = [tshark]
    if pcap:
        cmd += ["-r", pcap, "-Y", f"tcp.len>0 and ({' or '.join(f'ip.addr=={i.ip}' for i in instruments)}) and ({' or '.join(f'tcp.port=={p}' for p in (TELEMETRY_PORT, STATUS_PORT))})"]
    else:
        cmd += ["-i", interface or "1", "-l", "-f", f"({hosts}) and {ports}", "-Y", "tcp.len>0"]
    cmd += ["-o", "tcp.analyze_sequence_numbers:FALSE", "-T", "fields", "-E", "separator=\t"]
    for f in TSHARK_FIELDS:
        cmd += ["-e", f]
    return cmd


def run_capture(cmd: list[str], out: "queue.Queue[Optional[str]]") -> subprocess.Popen:
    LOG.info("starting capture: %s", " ".join(cmd))
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, bufsize=1)

    def pump() -> None:
        assert proc.stdout is not None
        for line in proc.stdout:
            out.put(line)
        out.put(None)

    def errs() -> None:
        assert proc.stderr is not None
        for line in proc.stderr:
            if line.strip():
                LOG.info("tshark: %s", line.rstrip())

    threading.Thread(target=pump, daemon=True).start()
    threading.Thread(target=errs, daemon=True).start()
    return proc


def main() -> int:
    ap = argparse.ArgumentParser(description="Agilent 1290 live-feed agent")
    ap.add_argument("--config", required=True)
    ap.add_argument("--replay", help="replay a .pcapng through the pipeline instead of capturing live")
    ap.add_argument("--speed", type=float, default=1.0, help="replay speed factor (default 1 = real time)")
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()

    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO,
                        format="%(asctime)s %(levelname)s %(message)s")
    cfg = json.loads(Path(args.config).read_text("utf-8"))
    tshark = cfg.get("tshark_path") or (DEFAULT_TSHARK if os.path.exists(DEFAULT_TSHARK) else "tshark")
    client = AppClient(cfg["app_url"], Path(cfg.get("spool_dir") or Path(args.config).resolve().parent / "spool"))
    instruments = [Instrument(c, client, float(cfg.get("batch_interval_s", 1.0)), float(cfg.get("heartbeat_interval_s", 15.0)))
                   for c in cfg["instruments"]]
    by_ip = {i.ip: i for i in instruments}
    LOG.info("agent %s host=%s app=%s instruments=%s", AGENT_VERSION, client.host, client.app_url,
             ", ".join(f"{i.name}@{i.ip}" for i in instruments))

    lines: "queue.Queue[Optional[str]]" = queue.Queue(maxsize=200000)
    cmd = tshark_command(tshark, instruments, cfg.get("interface"), args.replay)
    proc = run_capture(cmd, lines)

    replay_origin: Optional[tuple[float, float]] = None  # (capture epoch, wall epoch)
    last_tick = 0.0
    try:
        while True:
            try:
                line = lines.get(timeout=0.5)
            except queue.Empty:
                line = ""
            if line is None:
                if args.replay:
                    LOG.info("replay finished")
                    for inst in instruments:
                        if inst.run:
                            inst.begin_run_end(inst.now)
                        inst.finalize_ending()
                    time.sleep(3)
                    return 0
                LOG.error("tshark exited (%s); restarting in 5 s", proc.poll())
                time.sleep(5)
                proc = run_capture(cmd, lines)
                continue
            if line:
                parts = line.rstrip("\n").split("\t")
                if len(parts) != len(TSHARK_FIELDS) or not parts[7]:
                    continue
                ts = float(parts[0])
                if args.replay:
                    if replay_origin is None:
                        replay_origin = (ts, time.time())
                    due = replay_origin[1] + (ts - replay_origin[0]) / args.speed
                    delay = due - time.time()
                    if delay > 0:
                        time.sleep(delay)
                    wall = time.time()
                else:
                    wall = ts
                src, dst = parts[1], parts[2]
                inst = by_ip.get(src)
                if inst is None or dst in by_ip:
                    continue  # only instrument -> workstation carries data we decode
                try:
                    inst.on_segment(wall, int(parts[3]), int(parts[4]), int(parts[5]), bytes.fromhex(parts[7].replace(":", "")))
                except Exception as e:  # noqa: BLE001
                    LOG.exception("decode error: %s", e)
            now = time.time()
            if now - last_tick >= 0.25:
                last_tick = now
                for inst in instruments:
                    inst.tick(now)
    except KeyboardInterrupt:
        LOG.info("stopping")
        return 0
    finally:
        if proc.poll() is None:
            proc.terminate()


if __name__ == "__main__":
    sys.exit(main())
