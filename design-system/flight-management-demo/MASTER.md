# Flight Management Demo — Master design system

## Product and visual direction
- Product: local airport departure-operations simulation and playback dashboard.
- Style: data-dense operational dashboard; map-first, neutral light canvas, concise KPI cards and compact tables.
- Audience: aviation students and reviewers presenting a deterministic demo.
- Language: Vietnamese with standard terms such as stand, taxiway, holding point, CTOT, DCL and wheels-off.

## Palette
- Primary navy: #0F172A; interactive blue: #0369A1; canvas: #F8FAFC; card: #FFFFFF.
- Text: #0F172A; secondary text: #475569; border: #CBD5E1.
- Status: success #15803D, warning #B45309, error #B91C1C. Every status includes text, never color alone.

## Typography and density
- Fira Sans for interface text and Fira Code for times, callsigns, counters and tabular data.
- 8px spacing rhythm; body text 14–16px; dense tables remain readable and keyboard accessible.

## Interaction and accessibility
- Visible keyboard focus, descriptive labels, minimum 44px touch targets for primary controls.
- Respect prefers-reduced-motion. Keep map movement subtle and synchronized to simulation time.
- At narrow widths, stack controls and cards; no horizontal page overflow.

## Dashboard layout
- Header and simulation controls at top; performance KPIs directly below.
- Parking chart is the primary workspace. Queue and DCL log are secondary, coordinated panels.
- Keep source/import state and simulated/generated state visually distinct.
