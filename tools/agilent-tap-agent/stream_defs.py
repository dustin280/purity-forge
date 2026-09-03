"""
Module-keyed stream definitions and a runtime channel classifier.

The `channel_id` byte in the port-9100 header is NOT a fixed identifier: it is
a handle the instrument allocates per TCP connection. When OpenLab connects it
gets one channel per module for the per-second monitor copies (header handle
field = 0); when a run starts, each module's acquisition streams get a further,
separate channel (handle field = a per-message counter, so it cannot serve as
an id either), and those come and go per run. A new connection reuses the same
small numbers for different modules (observed the same day: 0x1f = thermostat
monitor on one connection, pump acquisition on the next; pump monitor 0x22 vs
0x24; sampler 0x1e vs 0x1d). What stays fixed per module is:

  - the sub_id of each trace (pump: 0x02 pressure, 0x04 flow, 0x07/0x08
    solvent A/B, 0x2c/0x2d tuning; DAD: 0x00-0x07 signals A-H, 0x0a/0x0b
    temperatures, 0x0c lamp voltage; thermostat: 0x01 left, 0x06 right;
    sampler: one temperature stream),
  - how many module clock ticks one sample spans (DAD signals 96, DAD
    housekeeping 24, pressure 5, flow/solvent ratios 10, pump tuning 20,
    sampler temperature 20, thermostat 10) -- derivable from two consecutive
    messages of a stream as tick_delta / values_per_message, using only the
    instrument's own counters, so it is immune to network delivery jitter and
    to replay speed, and
  - acquisition batches carrying a non-zero stream handle while the
    per-second monitor copies carry handle 0.

So a channel is identified at runtime from (ticks per sample, sub_id), after
which (module, sub_id) picks the stream definition -- with one classifier per
TCP connection, and a channel that starts voting for another module is
re-identified (a freed channel number can be handed to another module).
Spectrum records are recognised by msg_type and text channels by content,
independent of channel_id.
"""

from __future__ import annotations

from typing import Optional

DAD, PMP, WPS, THM = "DAD", "PMP", "WPS", "THM"

MAU_PER_COUNT = 0.000476837158203125  # 1000 / 2**21

CLOCK_HZ = {DAD: 240.0, PMP: 200.24, WPS: 200.0, THM: 10.0}


def _d(name: str, units: str, scale: float, ticks_per_sample: int, t0_ms: float) -> dict:
    return dict(name=name, units=units, scale=scale, ticks_per_sample=ticks_per_sample, t0_ms=t0_ms)


STREAM_DEFS: dict[tuple[str, Optional[int]], dict] = {}
for _i, _L in enumerate("ABCDEFGH"):
    STREAM_DEFS[(DAD, _i)] = _d(f"DAD1{_L}", "mAU", MAU_PER_COUNT, 96, 200)
STREAM_DEFS[(DAD, 0x0A)] = _d("DAD1T_BoardTemp", "degC", 0.01, 24, 100)
STREAM_DEFS[(DAD, 0x0B)] = _d("DAD1U_OpticalUnitTemp", "degC", 0.01, 24, 100)
STREAM_DEFS[(DAD, 0x0C)] = _d("DAD1V_LampAnodeVoltage", "V", 1e-6, 24, 25)
STREAM_DEFS[(PMP, 0x02)] = _d("PMP1B_Pressure", "bar", 0.005, 5, 15)
STREAM_DEFS[(PMP, 0x04)] = _d("PMP1C_Flow", "mL/min", 1e-6, 10, 5)
STREAM_DEFS[(PMP, 0x07)] = _d("PMP1D_SolventRatioA", "%", 0.001, 10, 5)
STREAM_DEFS[(PMP, 0x08)] = _d("PMP1E_SolventRatioB", "%", 0.001, 10, 5)
STREAM_DEFS[(PMP, 0x2C)] = _d("PMP1P_TuningA", "", 1e-5, 20, 5)
STREAM_DEFS[(PMP, 0x2D)] = _d("PMP1Q_TuningB", "", 1e-5, 20, 5)
STREAM_DEFS[(WPS, None)] = _d("WPS1A_Temperature", "degC", 0.001, 20, 30)
STREAM_DEFS[(THM, 0x01)] = _d("THM1A_LeftTemp", "degC", 0.001, 10, 700)
STREAM_DEFS[(THM, 0x06)] = _d("THM1B_RightTemp", "degC", 0.001, 10, 700)

KNOWN_TICKS_PER_SAMPLE = {5, 10, 20, 24, 96}
PUMP_TEN_SUBS = {0x04, 0x07, 0x08}
PUMP_TUNING_SUBS = {0x2C, 0x2D}
THM_SUBS = {0x01, 0x06}


def lookup_stream(module: str, sub_id: int) -> Optional[dict]:
    return STREAM_DEFS.get((module, sub_id)) or STREAM_DEFS.get((module, None))


def looks_like_text(values: tuple) -> bool:
    """True when the int32 payload is really packed ASCII (status/config dumps)."""
    if not values:
        return False
    raw = b"".join(int(v).to_bytes(4, "big", signed=True) for v in values)
    printable = sum(1 for b in raw if 32 <= b < 127 or b in (9, 10, 13))
    return printable >= 0.9 * len(raw)


def module_for(ticks_per_sample: int, sub_id: int) -> Optional[str]:
    if ticks_per_sample in (96, 24):
        return DAD
    if ticks_per_sample == 5:
        return PMP
    if ticks_per_sample == 10:
        if sub_id in PUMP_TEN_SUBS:
            return PMP
        if sub_id in THM_SUBS:
            return THM
        return None
    if ticks_per_sample == 20:
        return PMP if sub_id in PUMP_TUNING_SUBS else WPS
    return None


class ChannelClassifier:
    """Learns which module each channel_id of ONE TCP connection belongs to.

    Feed every telemetry message of the connection through `observe`; it
    returns the module to route the message to, or None when the message has
    to wait: the first message of a (channel, sub) pair, or one whose tick
    delta does not fit -- callers buffer the channel's messages meanwhile and
    replay them on the next non-None result, so nothing is lost at start-up,
    at run start, or when a channel number is re-allocated.

    A channel is identified once two messages of one of its streams agree on
    a known ticks-per-sample value. An identified channel keeps being checked:
    two agreeing votes for a *different* module re-identify it (the instrument
    hands freed channel numbers to other modules), and until then the
    dissenting messages wait rather than being routed to the wrong module.
    """

    VOTES_NEEDED = 2

    def __init__(self) -> None:
        self.module: dict[int, str] = {}
        self._last: dict[tuple[int, int], tuple[int, int]] = {}  # (ch, sub) -> (tick, n_values)
        self._votes: dict[int, dict[str, int]] = {}

    @staticmethod
    def _implied_module(prev: tuple[int, int], tick: int, n_values: int, sub_id: int) -> Optional[str]:
        delta = (tick - prev[0]) % (1 << 32)
        if delta == 0 or delta >= (1 << 31):
            return None
        # The message tick may mark the start or the end of its batch; either
        # way one of the two neighbouring batch sizes divides the delta exactly.
        for n in (prev[1], n_values):
            if n > 0 and delta % n == 0 and (delta // n) in KNOWN_TICKS_PER_SAMPLE:
                return module_for(delta // n, sub_id)
        return None

    def observe(self, channel_id: int, sub_id: int, tick: int, n_values: int) -> Optional[str]:
        key = (channel_id, sub_id)
        prev = self._last.get(key)
        self._last[key] = (tick, n_values)
        if prev is None or n_values <= 0:
            return None
        module = self._implied_module(prev, tick, n_values, sub_id)
        known = self.module.get(channel_id)
        if module is None:
            # Gap, wrap or unknown rate: cannot confirm anything from this one.
            return None
        if module == known:
            self._votes.pop(channel_id, None)
            return known
        votes = self._votes.setdefault(channel_id, {})
        votes[module] = votes.get(module, 0) + 1
        if votes[module] >= self.VOTES_NEEDED:
            self.module[channel_id] = module
            self._votes.pop(channel_id, None)
            return module
        return None
