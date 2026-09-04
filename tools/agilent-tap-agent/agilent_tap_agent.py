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
                                       sequence_completed / heartbeat /
                                       pressure_log (one continuous-log entry
                                       per minute: mean/min/max pressure, flow,
                                       column temperature — idle or running)
  Every run / pressure_log event and every feed batch also carries the column
  record the column compartment reports (COL:DATAX reply to OpenLab's query
  before and after each run: description, part number, geometry, injection
  count, first/last use), so rows can be labelled with the installed column.

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
from stream_defs import CLOCK_HZ, ChannelClassifier, looks_like_text, lookup_stream  # noqa: E402

AGENT_VERSION = "1.2.0"
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
# Monitor streams folded into the continuous pressure log (one entry per
# pressure_log_interval_s, default 60 s, whenever the instrument is on).
PRESSURE_LOG_STREAMS = ("PMP1B_Pressure", "PMP1C_Flow", "THM1A_LeftTemp", "THM1B_RightTemp")


def utc_iso(epoch: float) -> str:
    return datetime.fromtimestamp(epoch, tz=timezone.utc).isoformat(timespec="milliseconds")


# Column record the column compartment returns to OpenLab's `COL:DATAX? <slot>`
# query (sent ~10 s before each run and again after it), e.g.
#   RA 32113 COL:DATAX 7,'{"BAT":"","CMNT":"","DESC":"Agilent SBAq","DIA":2.1,
#   "FUSD":1786728517,"INJ":389,"LEN":150,"LUSD":1788421609,"MFGD":0,"MPH":[0,0],
#   "MPRS":1200,"MTMP":0,"PROD":"683675-914","PTMP":0,"PTSZ":1.9,"SEAL":0,
#   "SER":"","TAG":0,"VVOL":0}'
COL_DATAX_RE = re.compile(r"COL:DATAX\s+(\d+),'(\{.*?\})'", re.S)


def column_record(slot: int, d: dict) -> dict:
    """Normalise the instrument's column JSON (keys as observed on the wire; the
    less certain ones are kept under `raw` untouched)."""
    def num(v):
        return v if isinstance(v, (int, float)) and not isinstance(v, bool) else None

    def text(v):
        v = (v or "").strip() if isinstance(v, str) else ""
        return v or None

    def when(v):
        v = num(v)
        return utc_iso(v) if v and v > 0 else None

    return {
        "slot": slot,
        "description": text(d.get("DESC")),
        "part_number": text(d.get("PROD")),
        "serial": text(d.get("SER")),
        "batch": text(d.get("BAT")),
        "comment": text(d.get("CMNT")),
        "diameter_mm": num(d.get("DIA")),
        "length_mm": num(d.get("LEN")),
        "particle_um": num(d.get("PTSZ")),
        "max_pressure_bar": num(d.get("MPRS")) or None,
        "max_temp_c": num(d.get("MTMP")) or None,
        "injections": int(d["INJ"]) if num(d.get("INJ")) is not None else None,
        "first_used_at": when(d.get("FUSD")),
        "last_used_at": when(d.get("LUSD")),
        "tagged": bool(d.get("TAG")),
        "raw": d,
    }


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

    # Events the deployed app does not understand yet (agent newer than the
    # app) are parked as *.deferred and re-queued every DEFERRED_RETRY_S, so
    # they are neither lost nor hold up the events queued behind them.
    DEFERRED_RETRY_S = 300.0

    def _requeue(self, pattern: str) -> int:
        n = 0
        for p in sorted(self.spool_dir.glob(pattern)):
            try:
                rec = json.loads(p.read_text("utf-8"))
                p.unlink()
                self.events.put((rec["instrument_id"], rec["secret"], rec["body"]))
                n += 1
            except Exception as e:  # noqa: BLE001
                LOG.error("bad spool file %s: %s", p, e)
        return n

    def _event_worker(self) -> None:
        # Drain anything spooled by an earlier crash first, then anything parked.
        self._requeue("*.json")
        self._requeue("*.deferred")
        last_deferred_check = time.time()
        while True:
            try:
                instrument_id, secret, body = self.events.get(timeout=self.DEFERRED_RETRY_S)
            except queue.Empty:
                instrument_id = ""
            if time.time() - last_deferred_check >= self.DEFERRED_RETRY_S:
                last_deferred_check = time.time()
                n = self._requeue("*.deferred")
                if n:
                    LOG.info("re-queued %d deferred event(s)", n)
            if not instrument_id:
                continue
            delay = 2.0
            spooled: Optional[Path] = None
            while True:
                try:
                    status, text = self._post("/api/instrument/event", instrument_id, secret, body, timeout=60)
                    if status == 200:
                        # pressure_log goes out every minute; keep it out of the INFO log.
                        LOG.log(logging.DEBUG if body.get("type") == "pressure_log" else logging.INFO,
                                "event %s ok: %s", body.get("type"), text[:120])
                        if spooled and spooled.exists():
                            spooled.unlink()
                        break
                    if status == 400 and "invalid_union_discriminator" in text:
                        # The app does not know this event type yet: park it and move on.
                        LOG.warning("event %s unknown to the app yet (400) - parked, retry in %d s",
                                    body.get("type"), int(self.DEFERRED_RETRY_S))
                        parked = self._spool_path(instrument_id, body).with_suffix(".deferred")
                        parked.write_text(json.dumps({"instrument_id": instrument_id, "secret": secret, "body": body}), "utf-8")
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
    """Incremental length-prefixed message walker for the port-9100 stream.

    Two kinds of frame share the [len:2][0xF8][channel] prefix: binary sample
    messages (34-byte header + int32 values, see agilent1290_parser) and text
    frames — module status ("MO nnnn ..."), replies to OpenLab's queries
    ("RA nnnnn ..."), lists — whose text starts right at byte 4. Text frames
    rarely fit the binary template, so they get their own callback.
    """

    def __init__(self, on_message: Callable[[dict], None], on_text: Optional[Callable[[int, str], None]] = None):
        self.buf = bytearray()
        self.on_message = on_message
        self.on_text = on_text
        self.need_resync = False

    @staticmethod
    def text_of(body: bytes) -> Optional[str]:
        tail = body[4:].rstrip(b"\x00")
        if len(tail) < 4 or not all(32 <= c < 127 for c in body[4:8]):
            return None
        printable = sum(1 for c in tail if 32 <= c < 127 or c in (9, 10, 13))
        if printable < 0.95 * len(tail):
            return None
        return tail.decode("latin-1")

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
            text = self.text_of(body) if self.on_text is not None and total_len > 8 else None
            if text is not None:
                self.on_text(body[3], text)
                continue
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


@dataclass
class ConnState:
    """One TCP connection from the instrument. Channel ids are handles scoped
    to the connection (see stream_defs.py), so classification lives here."""
    key: tuple[int, int]
    reasm: Reassembler
    telemetry: bool
    last_seen: float
    classifier: ChannelClassifier = field(default_factory=ChannelClassifier)
    # messages on a not-yet-identified channel wait here and are replayed
    unclassified: dict[int, list[dict]] = field(default_factory=dict)
    identified: dict[int, str] = field(default_factory=dict)


class Instrument:
    def __init__(self, cfg: dict, client: AppClient, batch_interval: float, heartbeat_interval: float,
                 pressure_log_interval: float = 60.0):
        self.id: str = cfg["instrument_id"]
        self.name: str = cfg.get("name", self.id)
        self.ip: str = cfg["ip"]
        self.secret: str = cfg["secret"]
        self.client = client
        self.batch_interval = batch_interval
        self.heartbeat_interval = heartbeat_interval

        # One decoder + channel classifier per TCP connection (src, dst port).
        self.conns: dict[tuple[int, int], ConnState] = {}
        self.capture_now: float = time.time()

        self.run_state: Optional[int] = None
        self.analysis_state: Optional[int] = None
        self.ready_state: Optional[int] = None
        self.error_state: Optional[int] = None
        self.not_ready_text: Optional[str] = None
        self.last_status_at: float = 0.0
        self.modules: dict[str, dict] = {}
        self.wavelengths: dict[str, float] = {}

        # Column record from the column compartment (see column_record); kept
        # on disk so a restart between runs still knows the installed column.
        self.column_path = client.spool_dir / f"column_{self.id}.json"
        self.column: Optional[dict] = self._load_column()

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
        # Continuous pressure log: samples of PRESSURE_LOG_STREAMS accumulate
        # per wall-clock-aligned window (capture clock, so replay logs the
        # capture's own times) and go out as one pressure_log event per window.
        self.plog_interval = pressure_log_interval
        self.plog_window: Optional[int] = None
        self.plog_acc: dict[str, list[float]] = defaultdict(list)

    # ---- packet input ----
    def on_segment(self, ts: float, capture_ts: float, src_port: int, dst_port: int, seq: int, payload: bytes) -> None:
        """`ts` is wall-clock time (what timestamps go to the app); `capture_ts` is
        the packet's own timestamp — identical live, but in replay it is the
        original capture clock, which is what tick-rate estimation must use."""
        self.now = ts
        self.capture_now = capture_ts
        key = (src_port, dst_port)
        c = self.conns.get(key)
        if c is None:
            if src_port == TELEMETRY_PORT:
                sink = TelemetryDecoder(lambda m, k=key: self.on_message(k, m),
                                        lambda ch, t, k=key: self.on_text(k, ch, t)).feed
            elif src_port == STATUS_PORT:
                sink = StatusDecoder(self.on_status).feed
            else:
                return
            c = self.conns[key] = ConnState(key, Reassembler(sink), src_port == TELEMETRY_PORT, ts)
            LOG.info("[%s] new %s connection: port %d -> workstation port %d", self.name,
                     "telemetry" if c.telemetry else "status", src_port, dst_port)
            self._prune_conns(ts)
        c.last_seen = ts
        c.reasm.feed(seq, payload, ts)

    def _prune_conns(self, now: float) -> None:
        # OpenLab reconnects now and then; forget connections silent for a while.
        for key, c in list(self.conns.items()):
            if now - c.last_seen > 300 and len(self.conns) > 2:
                del self.conns[key]

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

    # ---- text frames (module status, query replies) ----
    def on_text(self, conn_key: tuple[int, int], channel: int, text: str) -> None:
        for n, wl in re.findall(r"ACT:SIG(\d) ([\d.]+),", text):
            self.wavelengths["ABCDEFGH"[int(n) - 1]] = float(wl)
        m = COL_DATAX_RE.search(text)
        if m:
            try:
                rec = column_record(int(m.group(1)), json.loads(m.group(2)))
            except (ValueError, TypeError) as e:
                LOG.warning("[%s] unreadable column record on channel %#04x: %s", self.name, channel, e)
                return
            rec["seen_at"] = utc_iso(self.now)
            if self._same_column(self.column, rec):
                self.column["seen_at"] = rec["seen_at"]
                return
            self.column = rec
            self._save_column()
            LOG.info("[%s] column record: %s (%s) %sx%s mm %s um, %s injections, slot %s", self.name,
                     rec["description"], rec["part_number"], rec["diameter_mm"], rec["length_mm"],
                     rec["particle_um"], rec["injections"], rec["slot"])

    @staticmethod
    def _same_column(a: Optional[dict], b: Optional[dict]) -> bool:
        if a is None or b is None:
            return a is b
        return {k: v for k, v in a.items() if k != "seen_at"} == {k: v for k, v in b.items() if k != "seen_at"}

    def _load_column(self) -> Optional[dict]:
        try:
            if self.column_path.exists():
                return json.loads(self.column_path.read_text("utf-8"))
        except Exception as e:  # noqa: BLE001
            LOG.warning("[%s] could not read %s: %s", self.name, self.column_path, e)
        return None

    def _save_column(self) -> None:
        try:
            self.column_path.write_text(json.dumps(self.column, indent=1), "utf-8")
        except Exception as e:  # noqa: BLE001
            LOG.warning("[%s] could not write %s: %s", self.name, self.column_path, e)

    # ---- telemetry ----
    def on_message(self, conn_key: tuple[int, int], m: dict) -> None:
        if m["msg_type"] == proto.SPECTRUM_MSG_TYPE:
            return
        if looks_like_text(m["values"]):
            # A text frame that happens to fit the binary template (rare).
            self.on_text(conn_key, m["channel_id"], proto.values_as_text(m["values"]))
            return
        c = self.conns[conn_key]
        ch = m["channel_id"]
        module = c.classifier.observe(ch, m["sub_id"], m["tick"], len(m["values"]))
        if module is None:
            pending = c.unclassified.setdefault(ch, [])
            pending.append(m)
            del pending[:-400]
            return
        pending = c.unclassified.pop(ch, None)
        if c.identified.get(ch) != module:
            was = c.identified.get(ch)
            c.identified[ch] = module
            LOG.info("[%s] channel %#04x %s %s (%d buffered messages replayed)", self.name, ch,
                     f"re-identified {was} ->" if was else "identified as", module, len(pending or []))
        for pm in pending or []:
            self._handle_telemetry(module, pm)
        self._handle_telemetry(module, m)

    def _handle_telemetry(self, module: str, m: dict) -> None:
        st = lookup_stream(module, m["sub_id"])
        if st is None:
            return
        clock = CLOCK_HZ[module]
        dt = st["ticks_per_sample"] / clock
        name = st["name"]
        if m["handle"] == 0:
            # Monitor copy (one message per second, also while idle).
            base = name
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
            if self.plog_interval > 0 and base in PRESSURE_LOG_STREAMS:
                self._accumulate_pressure_log(base, m["values"], st["scale"])
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

    # ---- continuous pressure log ----
    def _accumulate_pressure_log(self, name: str, values: list, scale: float) -> None:
        window = int(self.capture_now // self.plog_interval)
        if self.plog_window is None:
            self.plog_window = window
        elif window != self.plog_window:
            self.flush_pressure_log()
            self.plog_window = window
        self.plog_acc[name].extend(v * scale for v in values)

    def flush_pressure_log(self) -> None:
        """Send the accumulated window as one pressure_log event (no-op without pressure samples)."""
        if self.plog_window is None:
            return
        acc, self.plog_acc = self.plog_acc, defaultdict(list)
        pvals = acc.get("PMP1B_Pressure") or []
        if not pvals:
            return

        def mean(vals: Optional[list[float]]) -> Optional[float]:
            return (sum(vals) / len(vals)) if vals else None

        flow = mean(acc.get("PMP1C_Flow"))
        temps = [x for x in (mean(acc.get("THM1A_LeftTemp")), mean(acc.get("THM1B_RightTemp"))) if x is not None]
        start = self.plog_window * self.plog_interval
        self.client.send_event(self.id, self.secret, {
            "type": "pressure_log", "sent_at": utc_iso(self.now), "agent": self.agent_dict(),
            "at": utc_iso(start), "window_s": int(round(self.plog_interval)),
            "pressure": {"mean": round(sum(pvals) / len(pvals), 3), "min": round(min(pvals), 3),
                         "max": round(max(pvals), 3), "n": len(pvals)},
            "flow_ml_min": round(flow, 4) if flow is not None else None,
            "column_temp_c": round(sum(temps) / len(temps), 2) if temps else None,
            "state": "running" if self.run else "idle",
            "sequence": self._sequence_ref(),
            "run": {"key": self.run.key, "injection_index": self.run.injection_index,
                    "started_at": utc_iso(self.run.started_at)} if self.run else None,
            "column": self.column,
        })

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
            "column": self.column,
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
            "column": self.column,
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

    # The feed route accepts at most 2000 values per stream per batch (live
    # batches carry ~40); only the newest samples matter for a live display.
    MAX_BATCH_VALUES = 2000

    def _send_batch(self, now: float) -> None:
        streams = {}
        for name, s in self.monitor.items():
            if not s.pending:
                continue
            pending = s.pending[-self.MAX_BATCH_VALUES:]
            streams[name] = {"units": s.units, "t0": round(pending[0][0], 4), "dt": round(s.dt, 6),
                             "values": [round(v, 4) for _, v in pending]}
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
            "column": self.column,
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
    # Own process group so a Ctrl+C aimed at some console we happen to share
    # doesn't take the capture down with it, and no console window at all so
    # an unattended agent (pythonw.exe) never flashes a window or steals focus.
    flags = 0
    if os.name == "nt":
        flags = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0) | getattr(subprocess, "CREATE_NO_WINDOW", 0)
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, bufsize=1,
                            creationflags=flags)

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
    ap.add_argument("--service", action="store_true",
                    help="unattended mode: ignore console Ctrl+C/Break so only an explicit kill stops the agent")
    ap.add_argument("--log-file", help="write the log here (rotating, 5 MB x 3) instead of stderr; "
                                       "required when running under pythonw.exe, which has no console")
    args = ap.parse_args()

    level = logging.DEBUG if args.verbose else logging.INFO
    fmt = logging.Formatter("%(asctime)s %(levelname)s %(message)s")
    if args.log_file:
        from logging.handlers import RotatingFileHandler
        handler: logging.Handler = RotatingFileHandler(args.log_file, maxBytes=5_000_000, backupCount=3, encoding="utf-8")
    elif sys.stderr is not None:
        handler = logging.StreamHandler(sys.stderr)
    else:
        handler = logging.NullHandler()
    handler.setFormatter(fmt)
    logging.basicConfig(level=level, handlers=[handler])
    if args.service:
        import signal
        signal.signal(signal.SIGINT, signal.SIG_IGN)
        if hasattr(signal, "SIGBREAK"):
            signal.signal(signal.SIGBREAK, signal.SIG_IGN)
    cfg = json.loads(Path(args.config).read_text("utf-8"))
    tshark = cfg.get("tshark_path") or (DEFAULT_TSHARK if os.path.exists(DEFAULT_TSHARK) else "tshark")
    client = AppClient(cfg["app_url"], Path(cfg.get("spool_dir") or Path(args.config).resolve().parent / "spool"))
    instruments = [Instrument(c, client, float(cfg.get("batch_interval_s", 1.0)), float(cfg.get("heartbeat_interval_s", 15.0)),
                              float(cfg.get("pressure_log_interval_s", 60.0)))
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
                        inst.flush_pressure_log()
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
                    inst.on_segment(wall, ts, int(parts[3]), int(parts[4]), int(parts[5]), bytes.fromhex(parts[7].replace(":", "")))
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
    try:
        sys.exit(main())
    except SystemExit:
        raise
    except Exception:  # noqa: BLE001 - under pythonw there is no stderr to print a traceback to
        LOG.exception("agent crashed")
        sys.exit(1)
