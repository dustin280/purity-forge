"""
Agilent 1290 Infinity II <-> OpenLab CDS wire protocol (TCP port 9100), reverse-
engineered from a Wireshark capture and VERIFIED sample-for-sample against the
OpenLab .rslt package of the same run. Every stream marked "confirmed" below matched
OpenLab's stored .CH/.IT/.UV data bit-exactly: 8 DAD wavelength signals (3300/3300
each), pump pressure (52864/52864), flow / solvent ratios / tuning, multisampler and
column-thermostat temperatures, DAD diagnostics, and 3300/3300 spectra x 106 points.

FRAMING (confirmed): every message starts with a 2-byte big-endian length that
INCLUDES itself. Walking the reassembled TCP byte stream by this field alone consumed
a 7.7 MB / 52k-message capture with zero desync. Reassemble by tcp.seq, not by packet
order in the file (captures from USB NICs are not strictly time-ordered).

MESSAGE HEADER (34 bytes, big-endian):
  off size field
  0   u16  total_len
  2   u8   marker (0xF8 on telemetry messages)
  3   u8   channel_id  -- module + stream class, see STREAMS
  4   u32  stream handle: non-zero on run "acquisition" batch streams, 0 on monitors
  8   u16  msg_type: 0x010e = scalar sample batch, 0x0110 = spectrum record
  10  4    zero
  14  u16  sub_id      -- which trace inside the channel, see STREAMS
  16  2    zero
  18  u16  run_marker  -- non-zero while a run is being acquired, 0 when idle
  20  2    zero
  22  u16  seq         -- per-stream message counter (NOT seconds)
  24  u16  value_count (normally (total_len-34)/4; 0 on spectrum records)
  26  u32  zero
  30  u32  tick        -- module clock (rates below). On spectrum records the
                          tick lives in the UPPER 16 bits (raw >> 16).
  34  i32[] values     -- raw integer samples; physical value = raw * scale

MODULE CLOCKS (least-squares fit of tick vs. capture wall clock, cross-checked against
OpenLab's per-sample timestamps): DAD 240.000 Hz, multisampler (WPS) 200.00 Hz, column
thermostat 10.000 Hz, binary pump 200.24 Hz as measured on this unit (nominal 200 --
the 0.12 % offset is real: OpenLab spaces pressure samples 24.969 ms apart, not 25 ms,
and using 200 Hz drifts the pump time axis by 1.6 s over a 22-minute run). A live
service should refit the pump clock against wall clock; the pump monitor stream's
arrival jitter is only ~7 ms, so the fit converges within a couple of minutes.

Every trace is sent twice: a MONITOR stream (channels 0x27 DAD, 0x22 pump, 0x1e WPS,
0x23 THM; one message per second during a run, one per ~3 s idle) and an ACQUISITION
stream (0x26 DAD, 0x1f pump, 0x1a WPS, 0x21 THM; batched every ~10 s, only during a
run, handle != 0). The acquisition streams are exactly what OpenLab writes to the .dx
(.CH / .IT / .UV) files. Monitor pressure samples differ slightly from acquisition
(different sampling phase); the other monitor traces are identical.

SPECTRUM RECORDS (channel 0x26 sub 0 with msg_type 0x0110; channel 0x28 while idle):
112 int32 = 6 constant header words + 106 points covering 190..400 nm in 2 nm steps,
one record per 400 ms. raw * 0.000476837 = mAU (OpenLab's .UV stores raw*2097.152).

TEXT FRAMES (confirmed 2026-09-03): the same [len:2][0xF8][channel] prefix also
carries plain text starting at byte 4 (no 34-byte header): module status pushes
"MO nnnn ACT:...;" (0x25 DAD: ACT:OUT = live mAU of signals A-H, ACT:SIGn = configured
wavelengths; 0x20 autosampler; thermostat ACT:TEMP/ACT:COL), replies to OpenLab's
queries "RA nnnnn ..." (0x14 thermostat, 0x0c), list replies "LIX...", and the method &
config dumps at run start (0x17 / 0x0e / 0x1b / 0x0c / 0x10). Only ~1 in 9 text frames
happens to fit the 34+4k binary template, so decode_message() must not be the only
path — see TelemetryDecoder.text_of in agilent_tap_agent.py. Of note: about 10 s
before each run and ~20 s after it OpenLab asks the column compartment
  COL:DATAX? 7   (also ACT:COL?, ACT:CNT? "D_ON"/"D_TI"/"V_ON"/"V_TI", LIST "HOTEL_STATE")
and it answers with the installed column's record as JSON:
  RA 32113 COL:DATAX 7,'{"BAT":"","CMNT":"","DESC":"Agilent SBAq","DIA":2.1,
  "FUSD":1786728517,"INJ":389,"LEN":150,"LUSD":1788421609,"MFGD":0,"MPH":[0,0],
  "MPRS":1200,"MTMP":0,"PROD":"683675-914","PTMP":0,"PTSZ":1.9,"SEAL":0,"SER":"",
  "TAG":0,"VVOL":0}'
DESC / PROD / DIA / LEN / PTSZ / MPRS and the FUSD / LUSD epoch dates are certain;
INJ = injection count (hypothesis: not bumped by the instrument itself — it read 389
both before and after a run), TAG 0 = no RFID column tag, ACT:COL 0,... = empty tag
positions, "7" = slot/record index (hypotheses).

PORT 80 (separate TCP connection): SignalR JSON hub messages instrument->workstation
(2-byte length + JSON + 0x1E), confirmed (RunState etc.). Workstation->instrument
(incl. the 657-byte start-acquisition call) is NOT decoded; not needed for read-only.

TIME BASE: sample_time = t0 + (tick - tick_of_first_message)/clock + i*dt, anchored on
the first message of each stream (for acquisition streams that is run start). The
sub-second t0 offsets in STREAMS are OpenLab's first-sample times from one run and are
nominal; cross-module alignment is good to well under a second.
"""

import json
import os
import shutil
import struct
import subprocess
import sys
from pathlib import Path

MAU_PER_COUNT = 0.000476837158203125  # 1000 / 2**21
SPECTRUM_MSG_TYPE = 0x0110
SPECTRUM_HEADER_WORDS = 6
SPECTRUM_POINTS = 106
SPECTRUM_WAVELENGTHS_NM = [190 + 2 * i for i in range(SPECTRUM_POINTS)]

CLOCK_HZ = {0x26: 240.0, 0x27: 240.0, 0x28: 240.0,
            0x1f: 200.24, 0x22: 200.24,  # measured on this pump; see docstring
            0x1a: 200.0, 0x1e: 200.0,
            0x21: 10.0, 0x23: 10.0}

TEXT_CHANNELS = {0x20: "WPS_status", 0x25: "DAD_status", 0x17: "method_dump",
                 0x0e: "method_dump", 0x1b: "method_dump", 0x0c: "misc", 0x10: "misc"}


def _stream(name, units, scale, ticks, t0_ms, monitor):
    return dict(name=name, units=units, scale=scale, ticks_per_sample=ticks, t0_ms=t0_ms, monitor=monitor)


STREAMS = {}
for _acq, _mon in ((0x26, 0x27),):
    for _i, _L in enumerate("ABCDEFGH"):
        STREAMS[(_acq, _i)] = _stream(f"DAD1{_L}", "mAU", MAU_PER_COUNT, 96, 200, False)
        STREAMS[(_mon, _i)] = _stream(f"DAD1{_L}_monitor", "mAU", MAU_PER_COUNT, 96, 200, True)
    for _ch, _m in ((_acq, False), (_mon, True)):
        _s = "_monitor" if _m else ""
        STREAMS[(_ch, 0x0a)] = _stream("DAD1T_BoardTemp" + _s, "degC", 0.01, 24, 100, _m)
        STREAMS[(_ch, 0x0b)] = _stream("DAD1U_OpticalUnitTemp" + _s, "degC", 0.01, 24, 100, _m)
        STREAMS[(_ch, 0x0c)] = _stream("DAD1V_LampAnodeVoltage" + _s, "V", 1e-6, 24, 25, _m)
for _ch, _m in ((0x1f, False), (0x22, True)):
    _s = "_monitor" if _m else ""
    STREAMS[(_ch, 0x02)] = _stream("PMP1B_Pressure" + _s, "bar", 0.005, 5, 15, _m)
    STREAMS[(_ch, 0x04)] = _stream("PMP1C_Flow" + _s, "mL/min", 1e-6, 10, 5, _m)
    STREAMS[(_ch, 0x07)] = _stream("PMP1D_SolventRatioA" + _s, "%", 0.001, 10, 5, _m)
    STREAMS[(_ch, 0x08)] = _stream("PMP1E_SolventRatioB" + _s, "%", 0.001, 10, 5, _m)
    STREAMS[(_ch, 0x2c)] = _stream("PMP1P_TuningA" + _s, "", 1e-5, 20, 5, _m)
    STREAMS[(_ch, 0x2d)] = _stream("PMP1Q_TuningB" + _s, "", 1e-5, 20, 5, _m)
# multisampler: sub_id is a per-module handle (0x13fb seen), so match on channel only
STREAMS[(0x1a, None)] = _stream("WPS1A_Temperature", "degC", 0.001, 20, 30, False)
STREAMS[(0x1e, None)] = _stream("WPS1A_Temperature_monitor", "degC", 0.001, 20, 30, True)
for _ch, _m in ((0x21, False), (0x23, True)):
    _s = "_monitor" if _m else ""
    STREAMS[(_ch, 0x01)] = _stream("THM1A_LeftTemp" + _s, "degC", 0.001, 10, 700, _m)
    STREAMS[(_ch, 0x06)] = _stream("THM1B_RightTemp" + _s, "degC", 0.001, 10, 700, _m)


def find_tshark():
    for c in ("tshark", r"C:\Program Files\Wireshark\tshark.exe"):
        if shutil.which(c) or Path(c).exists():
            return c
    raise FileNotFoundError("tshark not found; pass tshark_path explicitly")


def reassemble_tcp_stream(pcap_path, stream, src_ip, tshark_path=None):
    """One direction of a TCP stream, reassembled in tcp.seq order."""
    tshark = tshark_path or find_tshark()
    cmd = [tshark, "-r", pcap_path,
           "-Y", f"tcp.stream=={stream} and ip.src=={src_ip} and tcp.len>0",
           "-T", "fields", "-e", "tcp.seq", "-e", "tcp.len", "-e", "tcp.payload"]
    out = subprocess.run(cmd, capture_output=True, text=True, check=True).stdout
    rows = []
    for line in out.splitlines():
        parts = line.split("\t")
        if len(parts) != 3:
            continue
        rows.append((int(parts[0]), int(parts[1]), bytes.fromhex(parts[2].replace(":", ""))))
    rows.sort(key=lambda r: r[0])
    buf = bytearray()
    next_seq = rows[0][0]
    for seq, length, payload in rows:
        if seq < next_seq:
            overlap = next_seq - seq
            if overlap >= length:
                continue
            payload = payload[overlap:]
            seq = next_seq
        buf.extend(payload)
        next_seq = seq + length
    return bytes(buf)


def iter_raw_messages(buf):
    cursor, n = 0, len(buf)
    while cursor + 2 <= n:
        total_len = struct.unpack_from(">H", buf, cursor)[0]
        if total_len < 2 or cursor + total_len > n:
            raise ValueError(f"framing broke at offset {cursor}, total_len={total_len}")
        yield cursor, buf[cursor:cursor + total_len]
        cursor += total_len


def decode_message(body):
    """Header + raw int32 values for messages that fit the 34-byte template, else None."""
    n = len(body)
    if n < 34 or (n - 34) % 4:
        return None
    vc = (n - 34) // 4
    return dict(
        channel_id=body[3],
        handle=struct.unpack_from(">I", body, 4)[0],
        msg_type=struct.unpack_from(">H", body, 8)[0],
        sub_id=struct.unpack_from(">H", body, 14)[0],
        run_marker=struct.unpack_from(">H", body, 18)[0],
        seq=struct.unpack_from(">H", body, 22)[0],
        tick=struct.unpack_from(">I", body, 30)[0],
        values=struct.unpack_from(f">{vc}i", body, 34),
    )


def values_as_text(values):
    return b"".join(struct.pack(">i", v) for v in values).decode("latin-1")


class _TickUnwrapper:
    def __init__(self, bits):
        self.mod = 1 << bits
        self.prev = None
        self.acc = 0

    def __call__(self, tick):
        if self.prev is None:
            self.prev = tick
            return 0
        delta = tick - self.prev
        if delta < -(self.mod // 2):
            delta += self.mod
        self.prev = tick
        self.acc += delta
        return self.acc


def decode_streams(pcap_path, instrument_ip, tcp_stream=0, tshark_path=None):
    """Decode every known stream in a capture.

    Returns dict with:
      traces:  name -> {units, sample_interval_s, monitor, t (s), values, raw}
      spectra: name -> {units, wavelengths_nm, t (s), rows (list of 106 mAU)}
      text:    channel-name -> list of (capture_msg_index, text)
    Time axes are seconds relative to each stream's first message (run start for
    acquisition streams); see module docstring.
    """
    buf = reassemble_tcp_stream(pcap_path, tcp_stream, instrument_ip, tshark_path)
    traces, spectra, text = {}, {}, {}
    unwrap = {}
    idx = 0
    for _offset, body in iter_raw_messages(buf):
        idx += 1
        m = decode_message(body)
        if m is None or not m["values"]:
            continue
        ch = m["channel_id"]
        if ch in TEXT_CHANNELS:
            text.setdefault(TEXT_CHANNELS[ch], []).append((idx, values_as_text(m["values"])))
            continue
        if ch not in CLOCK_HZ:
            continue
        clock = CLOCK_HZ[ch]

        if m["msg_type"] == SPECTRUM_MSG_TYPE:
            if len(m["values"]) != SPECTRUM_HEADER_WORDS + SPECTRUM_POINTS:
                continue
            name = "DAD1I_Spectrum" if ch == 0x26 else "DAD1I_Spectrum_monitor"
            sp = spectra.setdefault(name, dict(units="mAU", wavelengths_nm=SPECTRUM_WAVELENGTHS_NM,
                                               t=[], rows=[], raw_header=list(m["values"][:SPECTRUM_HEADER_WORDS])))
            uw = unwrap.setdefault(name, _TickUnwrapper(16))
            t = 0.2 + uw(m["tick"] >> 16) / clock
            sp["t"].append(round(t, 4))
            sp["rows"].append([v * MAU_PER_COUNT for v in m["values"][SPECTRUM_HEADER_WORDS:]])
            continue

        st = STREAMS.get((ch, m["sub_id"])) or STREAMS.get((ch, None))
        if st is None:
            continue
        name = st["name"]
        tr = traces.setdefault(name, dict(units=st["units"],
                                          sample_interval_s=st["ticks_per_sample"] / clock,
                                          monitor=st["monitor"], t=[], values=[], raw=[]))
        uw = unwrap.setdefault(name, _TickUnwrapper(32))
        t_batch = st["t0_ms"] / 1000.0 + uw(m["tick"]) / clock
        dt = st["ticks_per_sample"] / clock
        for i, v in enumerate(m["values"]):
            tr["t"].append(round(t_batch + i * dt, 4))
            tr["values"].append(v * st["scale"])
            tr["raw"].append(v)
    return dict(traces=traces, spectra=spectra, text=text)


def dad_wavelengths(result):
    """Configured wavelengths per DAD signal letter, parsed from the 0x25 status text."""
    import re
    for _idx, txt in result["text"].get("DAD_status", []):
        found = re.findall(r"ACT:SIG(\d) ([\d.]+),", txt)
        if len(found) == 8:
            return {"ABCDEFGH"[int(n) - 1]: float(wl) for n, wl in found}
    return {}


def extract_chromatogram(pcap_path, instrument_ip, signal="A", tshark_path=None):
    """(t_seconds, mAU) pairs for one DAD wavelength signal (acquisition stream)."""
    res = decode_streams(pcap_path, instrument_ip, tshark_path=tshark_path)
    tr = res["traces"][f"DAD1{signal}"]
    return list(zip(tr["t"], tr["values"]))


def export_json(result, out_dir, include_raw=False):
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    written = []
    for name, tr in result["traces"].items():
        doc = dict(name=name, units=tr["units"], sample_interval_s=tr["sample_interval_s"],
                   monitor=tr["monitor"], n=len(tr["t"]), t=tr["t"],
                   values=[round(v, 6) for v in tr["values"]])
        if include_raw:
            doc["raw"] = tr["raw"]
        p = out / f"{name}.json"
        p.write_text(json.dumps(doc))
        written.append(p)
    for name, sp in result["spectra"].items():
        doc = dict(name=name, units=sp["units"], wavelengths_nm=sp["wavelengths_nm"], n=len(sp["t"]),
                   t=sp["t"], rows=[[round(v, 4) for v in row] for row in sp["rows"]])
        p = out / f"{name}.json"
        p.write_text(json.dumps(doc))
        written.append(p)
    for name, entries in result["text"].items():
        p = out / f"text_{name}.json"
        p.write_text(json.dumps(dict(name=name, entries=entries), ensure_ascii=False))
        written.append(p)
    return written


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    if len(sys.argv) != 4:
        print("usage: python agilent1290_parser.py <capture.pcapng> <instrument_ip> <out_dir>")
        sys.exit(1)
    pcap, ip, out_dir = sys.argv[1:4]
    res = decode_streams(pcap, ip)
    print(f"{'trace':34} {'units':7} {'dt s':>7} {'n':>7} {'min':>12} {'max':>12}")
    for name, tr in sorted(res["traces"].items()):
        print(f"{name:34} {tr['units']:7} {tr['sample_interval_s']:7.3f} {len(tr['t']):7d} "
              f"{min(tr['values']):12.4f} {max(tr['values']):12.4f}")
    for name, sp in res["spectra"].items():
        print(f"{name:34} {'mAU':7} {'0.400':>7} {len(sp['t']):7d}  ({len(sp['wavelengths_nm'])} wavelengths/record)")
    wl = dad_wavelengths(res)
    if wl:
        print("DAD wavelengths from status text:", wl)
    files = export_json(res, out_dir)
    print(f"wrote {len(files)} JSON files to {out_dir}")
