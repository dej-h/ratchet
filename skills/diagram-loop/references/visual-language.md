# Visual language

## Labels and hierarchy

- Give architecture boxes one to four words and at most two lines. Put an
  optional one-line technical subtitle below a plain role when the audience is
  mixed, for example `Task Queue` with `Azure Service Bus` below it.
- Visual weight follows conceptual importance. Primary concepts receive more
  area and contrast than supporting context.
- Keep the starting point and main direction obvious without narration. Use
  captions to explain causality, not to compensate for an unreadable graph.
- Prefer a restrained palette, one type family, one generic line-icon family,
  and recognizable marks only for specific technologies.

## Component grammar

Supported visual components are process, service, client, data-store, queue,
external-system, and actor nodes; group boundaries and swimlanes; edges,
packets, callouts, and badges; group and lane boundaries; and
frames for authentic visual assets.

Every component declares an inner content-safe area. At 1920 by 1080:

- ordinary nodes use at least 18 pixels per side;
- intentionally compact supporting nodes use at least 14 pixels;
- larger primary nodes normally use 22 to 26 pixels.

Scale these insets with the output profile. Text, icons, badges, charts, and
decorative marks may not enter the space between the safe area and the border.
The compiler calculates text width after subtracting both insets, icon width,
and the icon-to-text gap. One pixel outside the contract is a compile failure.

## Edges and routes

- Layout targets explicit source and destination ports.
- The visible path stops at a small configured gap before each node border.
- The quiet scaffold has no arrow marker. A separate restrained arrowhead
  appears only during the final 10 to 15 percent of a trace and only after the
  destination exists.
- Edges render below nodes, but layering never excuses an invalid route.
- The first and last raw route points belong to their declared endpoint ports.
- Every segment clears the expanded bounds of every non-endpoint node. The
  default protected clearance is 12 pixels at 1920 by 1080.
- Edge-label capsules have their own safe insets and are checked independently
  against node bounds.

## Camera and pacing

The active concept remains fully inside the configured viewport inset.
Completed context may dim or leave the frame deliberately, but a high-contrast
card may not remain partially clipped. Restore the complete diagram before the
final hold.

For a silent explainer, use the deliberate profile:

```text
caption hold = max(4.8 seconds, 1.25 seconds + 0.32 seconds * word count)
```

Use roughly 0.9 to 1.4 seconds for a reveal or trace near the start of that
hold, then leave the composition stable. Do not start the next semantic beat
while the current caption is still being processed. Hold the complete final
overview for five seconds. A compact profile requires an explicit request.

Dashed and return paths use an explicit animated mask. Repeating dash patterns
must not expose future path fragments before their owning action begins.
