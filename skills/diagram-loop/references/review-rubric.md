# Pixel review rubric

Review pixels, not source alone. The reviewer receives only approved
`intent.md`, `renders/final.png`, `renders/contact-sheet.png`, the full
animation when needed, and `assets.yaml`.

## Mechanical checks first

- no text overflow or unreadably small type;
- every child content bound stays inside its node safe area;
- no unintended node or label overlap;
- no edge crosses an expanded non-endpoint node bound;
- every edge endpoint belongs to its declared source and destination port;
- no arrowhead appears before trace completion or before the destination;
- visible endpoints preserve their configured gap from node content;
- no important content or high-contrast card is partially clipped;
- no distorted, missing, unresolved, or fabricated asset;
- final frame contains the complete approved overview;
- dimensions, duration, formats, and codecs match `render-plan.md`.

The contact sheet is boundary-driven. For every action that can create
clipping, overlap, premature arrows, dashed-path leakage, or camera defects,
include a frame immediately before the action, one active frame, and the
settled frame. Uniform time sampling is insufficient.

## Editorial review

- the starting point and primary direction are obvious;
- visual weight matches conceptual importance;
- abstraction and terminology fit the approved audience;
- concurrency, feedback, retry, and boundaries are visible where relevant;
- every element deserves pixels;
- animation explains causality instead of decorating it;
- icons and screenshots are authentic;
- the final frame works without the animation.

Record each finding in `review.md`. Fix scene or assets first, layout settings
second, and renderer code only for a reusable defect. A change invalidates the
reviewed input and output digests and requires the full review again.
