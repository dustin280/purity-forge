## Add "Open Log" button to Backpressure Trend card on Dashboard

Add a navigation button on the `BackpressureTrendChart` card header (only when shown on the dashboard) that links to the full Daily Backpressure Log page.

### Changes

**`src/components/daily-backpressure/trend-chart.tsx`**
- Add an optional `logHref` prop (or a simpler `showOpenLogLink` boolean).
- When enabled, render a small `Button` (variant `outline`, size `sm`) next to the date-range picker in the `CardHeader`, wrapped in `<Link to="/lab-logs/daily-backpressure">` with an `ExternalLink`/`ArrowRight` icon and label "Open Log".

**`src/routes/_authenticated/index.tsx`**
- Pass the new prop so the button appears on the dashboard's trend card.

**`src/routes/_authenticated/lab-logs/daily-backpressure/index.tsx`**
- Do not pass the prop, so the button doesn't appear on the log page itself (avoids self-link).

No backend, routing, or business-logic changes.
