## Backpressure Trending Chart

Add a line chart showing backpressure readings over time, displayed at the top of both the Lab Dashboard and the Daily Backpressure Log page.

### Component
New `src/components/daily-backpressure/trend-chart.tsx`:
- Uses Recharts (already available via `src/components/ui/chart.tsx`).
- Props: `rows: BackpressureRow[]`, `isLoading: boolean`.
- Line chart with `reading_at` (X, formatted date/time) and `backpressure` (Y).
- One line per instrument (groups rows by `instrument`, color per series).
- Tooltip shows: timestamp, instrument, backpressure + unit, user.
- Wrapped in a `Card` with title "Backpressure Trend" and a subtitle showing reading count + date range.
- Empty state when no rows; skeleton while loading.
- Sorts rows ascending by `reading_at` (server returns descending).

### Dashboard integration (`src/routes/_authenticated/index.tsx`)
- Fetch backpressure rows using the existing `listBackpressureLogs` server fn via `useQuery` (same `qk.backpressure.list()` key — shares cache with the log page).
- Render `<BackpressureTrendChart />` above `<StatTiles />`.

### Log page integration (`src/routes/_authenticated/lab-logs/daily-backpressure/index.tsx`)
- Render `<BackpressureTrendChart rows={rows} isLoading={isLoading} />` between the header and `ReadingForm`.

### Out of scope
- Date range filtering, per-instrument toggles, exporting the chart — can be added later.
- No DB or server function changes.
