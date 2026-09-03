"""
Module-keyed stream definitions and a runtime channel classifier.

The `channel_id` byte in the port-9100 header is NOT a fixed identifier: it is
a per-session handle that OpenLab assigns when it subscribes to each module's
streams, and it changes between OpenLab sessions (observed: pump monitor on
0x22 in one session, 0x24 in the next; sampler 0x1e -> 0x1d; thermostat
0x23 -> 0x21). What stays fixed per module is:

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
which (module, sub_id) picks the stream definition. Spectrum records are
recognised by msg_type and text channels by content, independent of channel_id.
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
    """Learns which module each channel_id belongs to.

    Feed every telemetry message through `observe`; it returns the module once
    two consecutive messages of one of the channel's streams agree on a known
    ticks-per-sample value (None before that -- callers should buffer the
    channel's messages meanwhile and replay them once classified, so nothing
    is lost at start-up or at run start).
    """

    def __init__(self) -> None:
        self.module: dict[int, str] = {}
        self._last: dict[tuple[int, int], tuple[int, int]] = {}  # (ch, sub) -> (tick, n_values)
        self._votes: dict[int, dict[str, int]] = {}

    def observe(self, channel_id: int, sub_id: int, tick: int, n_values: int) -> Optional[str]:
        known = self.module.get(channel_id)
        if known:
            return known
        key = (channel_id, sub_id)
        prev = self._last.get(key)
        self._last[key] = (tick, n_values)
        if prev is None or n_values <= 0:
            return None
        delta = (tick - prev[0]) % (1 << 32)
        if delta == 0 or delta >= (1 << 31):
            return None
        # The message tick may mark the start or the end of its batch; either
        # way one of the two neighbouring batch sizes divides the delta exactly.
        for n in (prev[1], n_values):
            if n > 0 and delta % n == 0 and (delta // n) in KNOWN_TICKS_PER_SAMPLE:
                module = module_for(delta // n, sub_id)
                if module is None:
                    continue
                votes = self._votes.setdefault(channel_id, {})
                votes[module] = votes.get(module, 0) + 1
                if votes[module] >= 2:
                    self.module[channel_id] = module
                    return module
                break
        return None
