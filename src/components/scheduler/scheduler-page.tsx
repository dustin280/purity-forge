import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group";
import { ChevronLeft, ChevronRight, Plus, CalendarDays } from "lucide-react";
import { useAuth, profileDisplayName } from "@/hooks/use-auth";
import {
  useInstruments,
  useBookings,
  instrumentHue,
  type InstrumentBooking,
} from "./use-scheduler";
import { BookingDialog } from "./booking-dialog";

type ViewMode = "week" | "day" | "month";

const HOUR_START = 6;
const HOUR_END = 22;
const HOUR_PX = 44;

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function startOfWeek(d: Date) {
  const x = startOfDay(d);
  const day = x.getDay(); // 0 Sun
  x.setDate(x.getDate() - day);
  return x;
}
function startOfMonth(d: Date) {
  const x = startOfDay(d);
  x.setDate(1);
  return x;
}
function endOfMonth(d: Date) {
  const x = startOfMonth(d);
  x.setMonth(x.getMonth() + 1);
  return x;
}
function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
function fmtTime(d: Date) {
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
function fmtDateShort(d: Date) {
  return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

export function SchedulerPage() {
  const { user, profile, role } = useAuth();
  const userName = profileDisplayName(profile, user?.email) || user?.email || "Unknown";
  const isAdmin = role === "admin";

  const [view, setView] = useState<ViewMode>("week");
  const [cursor, setCursor] = useState<Date>(() => startOfDay(new Date()));
  const [instrumentFilter, setInstrumentFilter] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<InstrumentBooking | null>(null);
  const [initialRange, setInitialRange] = useState<{ starts_at: string; ends_at: string }>(() => {
    const now = new Date();
    now.setMinutes(0, 0, 0);
    const later = new Date(now);
    later.setHours(later.getHours() + 1);
    return { starts_at: now.toISOString(), ends_at: later.toISOString() };
  });

  const { query: instrumentsQ } = useInstruments();
  const instruments = instrumentsQ.data ?? [];

  const { rangeFrom, rangeTo, days } = useMemo(() => {
    if (view === "day") {
      const f = startOfDay(cursor);
      const t = addDays(f, 1);
      return { rangeFrom: f, rangeTo: t, days: [f] };
    }
    if (view === "week") {
      const f = startOfWeek(cursor);
      const t = addDays(f, 7);
      return { rangeFrom: f, rangeTo: t, days: Array.from({ length: 7 }, (_, i) => addDays(f, i)) };
    }
    // month
    const monthStart = startOfMonth(cursor);
    const f = startOfWeek(monthStart);
    const monthEnd = endOfMonth(cursor);
    const lastWeekStart = startOfWeek(addDays(monthEnd, -1));
    const t = addDays(lastWeekStart, 7);
    const dayCount = Math.round((t.getTime() - f.getTime()) / 86400000);
    return { rangeFrom: f, rangeTo: t, days: Array.from({ length: dayCount }, (_, i) => addDays(f, i)) };
  }, [view, cursor]);

  const fromISO = rangeFrom.toISOString();
  const toISO = rangeTo.toISOString();
  const filterId = instrumentFilter === "all" ? null : instrumentFilter;
  const { query: bookingsQ, createMut, updateMut, deleteMut } = useBookings(fromISO, toISO, filterId);
  const bookings = bookingsQ.data ?? [];

  const instrumentName = (id: string) =>
    instruments.find((i) => i.id === id)?.name ?? "Unknown";

  const openNewAt = (slotStart: Date) => {
    const end = new Date(slotStart);
    end.setHours(end.getHours() + 1);
    setInitialRange({ starts_at: slotStart.toISOString(), ends_at: end.toISOString() });
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (b: InstrumentBooking) => {
    setEditing(b);
    setDialogOpen(true);
  };

  const handleSubmit = async (v: {
    instrument_id: string;
    starts_at: string;
    ends_at: string;
    purpose: string;
    notes: string;
  }) => {
    if (editing) {
      await updateMut.mutateAsync({
        id: editing.id,
        instrument_id: v.instrument_id,
        starts_at: v.starts_at,
        ends_at: v.ends_at,
        purpose: v.purpose,
        notes: v.notes || null,
      });
    } else {
      await createMut.mutateAsync({
        instrument_id: v.instrument_id,
        user_name: userName,
        starts_at: v.starts_at,
        ends_at: v.ends_at,
        purpose: v.purpose,
        notes: v.notes || null,
      });
    }
    setDialogOpen(false);
    setEditing(null);
  };

  const handleDelete = () => {
    if (!editing) return;
    deleteMut.mutate(editing.id, {
      onSuccess: () => {
        setDialogOpen(false);
        setEditing(null);
      },
    });
  };

  const goPrev = () => {
    if (view === "day") setCursor(addDays(cursor, -1));
    else if (view === "week") setCursor(addDays(cursor, -7));
    else {
      const x = new Date(cursor); x.setMonth(x.getMonth() - 1); setCursor(x);
    }
  };
  const goNext = () => {
    if (view === "day") setCursor(addDays(cursor, 1));
    else if (view === "week") setCursor(addDays(cursor, 7));
    else {
      const x = new Date(cursor); x.setMonth(x.getMonth() + 1); setCursor(x);
    }
  };

  const headerLabel = useMemo(() => {
    if (view === "day") return cursor.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: "numeric" });
    if (view === "week") {
      const end = addDays(rangeFrom, 6);
      return `${rangeFrom.toLocaleDateString([], { month: "short", day: "numeric" })} – ${end.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}`;
    }
    return cursor.toLocaleDateString([], { month: "long", year: "numeric" });
  }, [view, cursor, rangeFrom]);

  return (
    <div className="p-6 md:p-8 max-w-7xl">
      <div className="mb-6">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Operations</div>
        <h1 className="text-3xl font-bold tracking-tight mt-1">Instrument Scheduler</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Reserve instrument time. Bookings cannot overlap on the same instrument.
        </p>
      </div>

      <Card className="p-3 mb-4 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={goPrev}><ChevronLeft className="size-4" /></Button>
        <Button size="sm" variant="outline" onClick={() => setCursor(startOfDay(new Date()))}>Today</Button>
        <Button size="sm" variant="outline" onClick={goNext}><ChevronRight className="size-4" /></Button>
        <div className="font-semibold ml-2 min-w-[10rem]">{headerLabel}</div>
        <div className="flex-1" />
        <Select value={instrumentFilter} onValueChange={setInstrumentFilter}>
          <SelectTrigger className="w-[14rem]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All instruments</SelectItem>
            {instruments.filter(i => i.is_active).map(i => (
              <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <ToggleGroup type="single" value={view} onValueChange={(v) => v && setView(v as ViewMode)}>
          <ToggleGroupItem value="day">Day</ToggleGroupItem>
          <ToggleGroupItem value="week">Week</ToggleGroupItem>
          <ToggleGroupItem value="month">Month</ToggleGroupItem>
        </ToggleGroup>
        <Button size="sm" onClick={() => openNewAt(new Date())} disabled={instruments.filter(i => i.is_active).length === 0}>
          <Plus className="size-4 mr-1" /> New booking
        </Button>
      </Card>

      {instruments.filter(i => i.is_active).length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          <CalendarDays className="size-8 mx-auto mb-2 opacity-50" />
          No active instruments yet. {isAdmin ? "Add one from Admin → Instruments." : "Ask an admin to add one."}
        </Card>
      ) : view === "month" ? (
        <MonthGrid
          days={days}
          cursor={cursor}
          bookings={bookings}
          onPickDay={(d) => { setCursor(d); setView("day"); }}
          onPickBooking={openEdit}
          instrumentName={instrumentName}
        />
      ) : (
        <TimelineGrid
          days={days}
          bookings={bookings}
          currentUserId={user?.id ?? null}
          onSlotClick={openNewAt}
          onBookingClick={openEdit}
          instrumentName={instrumentName}
        />
      )}

      <BookingDialog
        open={dialogOpen}
        onOpenChange={(v) => { setDialogOpen(v); if (!v) setEditing(null); }}
        instruments={instruments}
        defaultInstrumentId={filterId}
        initial={initialRange}
        editing={editing}
        saving={createMut.isPending || updateMut.isPending}
        deleting={deleteMut.isPending}
        canDelete={isAdmin || editing?.user_id === user?.id}
        onSubmit={handleSubmit}
        onDelete={handleDelete}
      />
    </div>
  );
}

// =========== Timeline (day/week) ===========

function TimelineGrid({
  days,
  bookings,
  currentUserId,
  onSlotClick,
  onBookingClick,
  instrumentName,
}: {
  days: Date[];
  bookings: InstrumentBooking[];
  currentUserId: string | null;
  onSlotClick: (d: Date) => void;
  onBookingClick: (b: InstrumentBooking) => void;
  instrumentName: (id: string) => string;
}) {
  const hours = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i);
  const totalHeight = hours.length * HOUR_PX;

  return (
    <Card className="overflow-hidden">
      <div className="grid" style={{ gridTemplateColumns: `4rem repeat(${days.length}, minmax(0,1fr))` }}>
        <div />
        {days.map((d) => (
          <div key={d.toISOString()} className="px-2 py-2 text-xs font-medium text-center border-b border-l border-border">
            {fmtDateShort(d)}
          </div>
        ))}
      </div>
      <div className="relative grid" style={{ gridTemplateColumns: `4rem repeat(${days.length}, minmax(0,1fr))`, height: totalHeight }}>
        {/* Hour rail */}
        <div className="relative">
          {hours.map((h, idx) => (
            <div key={h} className="absolute left-0 right-0 text-[10px] text-muted-foreground pr-1 text-right" style={{ top: idx * HOUR_PX - 6 }}>
              {h === 12 ? "12p" : h > 12 ? `${h - 12}p` : `${h}a`}
            </div>
          ))}
        </div>
        {days.map((day) => {
          const dayStart = startOfDay(day);
          const dayEnd = addDays(dayStart, 1);
          const dayBookings = bookings.filter((b) => {
            const s = new Date(b.starts_at);
            const e = new Date(b.ends_at);
            return e > dayStart && s < dayEnd;
          });
          return (
            <div key={day.toISOString()} className="relative border-l border-border">
              {hours.map((h, idx) => (
                <div
                  key={h}
                  className="absolute left-0 right-0 border-t border-border hover:bg-accent/30 cursor-pointer"
                  style={{ top: idx * HOUR_PX, height: HOUR_PX }}
                  onClick={() => {
                    const slot = new Date(dayStart);
                    slot.setHours(h, 0, 0, 0);
                    onSlotClick(slot);
                  }}
                />
              ))}
              {sameDay(day, new Date()) && <NowLine />}
              {dayBookings.map((b) => {
                const s = new Date(b.starts_at);
                const e = new Date(b.ends_at);
                const startMin = Math.max(0, (s.getTime() - dayStart.getTime()) / 60000);
                const endMin = Math.min(24 * 60, (e.getTime() - dayStart.getTime()) / 60000);
                const top = ((startMin / 60) - HOUR_START) * HOUR_PX;
                const height = ((endMin - startMin) / 60) * HOUR_PX;
                if (top + height < 0 || top > totalHeight) return null;
                const hue = instrumentHue(b.instrument_id);
                const isOwn = b.user_id === currentUserId;
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={(ev) => { ev.stopPropagation(); onBookingClick(b); }}
                    className={`absolute left-1 right-1 rounded-md px-2 py-1 text-left text-[11px] leading-tight shadow-sm hover:brightness-110 ${isOwn ? "ring-2 ring-primary" : ""}`}
                    style={{
                      top: Math.max(0, top),
                      height: Math.max(20, height - (top < 0 ? -top : 0)),
                      background: `hsl(${hue} 70% 35% / 0.85)`,
                      color: "white",
                    }}
                    title={`${instrumentName(b.instrument_id)} · ${b.user_name}\n${fmtTime(s)} – ${fmtTime(e)}\n${b.purpose}`}
                  >
                    <div className="font-semibold truncate">{b.purpose}</div>
                    <div className="opacity-90 truncate">{b.user_name}</div>
                    <div className="opacity-75 truncate">{fmtTime(s)}–{fmtTime(e)}</div>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function NowLine() {
  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();
  const top = (minutes / 60 - HOUR_START) * HOUR_PX;
  if (top < 0 || top > (HOUR_END - HOUR_START) * HOUR_PX) return null;
  return (
    <div className="absolute left-0 right-0 z-10 pointer-events-none" style={{ top }}>
      <div className="h-px bg-destructive" />
    </div>
  );
}

// =========== Month grid ===========

function MonthGrid({
  days,
  cursor,
  bookings,
  onPickDay,
  onPickBooking,
  instrumentName,
}: {
  days: Date[];
  cursor: Date;
  bookings: InstrumentBooking[];
  onPickDay: (d: Date) => void;
  onPickBooking: (b: InstrumentBooking) => void;
  instrumentName: (id: string) => string;
}) {
  const month = cursor.getMonth();
  return (
    <Card className="overflow-hidden">
      <div className="grid grid-cols-7 text-[10px] uppercase tracking-wider text-muted-foreground bg-muted/40">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="px-2 py-2 text-center">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d) => {
          const inMonth = d.getMonth() === month;
          const dayStart = startOfDay(d);
          const dayEnd = addDays(dayStart, 1);
          const dayBookings = bookings.filter((b) => {
            const s = new Date(b.starts_at);
            const e = new Date(b.ends_at);
            return e > dayStart && s < dayEnd;
          });
          const isToday = sameDay(d, new Date());
          return (
            <div
              key={d.toISOString()}
              className={`min-h-[6rem] border-t border-l border-border p-1 ${inMonth ? "" : "bg-muted/30 text-muted-foreground"}`}
            >
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => onPickDay(d)}
                  className={`text-xs font-medium px-1 rounded hover:bg-accent ${isToday ? "bg-primary text-primary-foreground" : ""}`}
                >
                  {d.getDate()}
                </button>
              </div>
              <div className="mt-1 space-y-0.5">
                {dayBookings.slice(0, 3).map((b) => {
                  const hue = instrumentHue(b.instrument_id);
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => onPickBooking(b)}
                      className="block w-full truncate text-left text-[10px] rounded px-1 py-0.5 text-white"
                      style={{ background: `hsl(${hue} 70% 35% / 0.85)` }}
                      title={`${instrumentName(b.instrument_id)} · ${b.user_name} · ${b.purpose}`}
                    >
                      {b.purpose}
                    </button>
                  );
                })}
                {dayBookings.length > 3 && (
                  <button type="button" onClick={() => onPickDay(d)} className="text-[10px] text-muted-foreground hover:underline">
                    +{dayBookings.length - 3} more
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}