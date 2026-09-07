# Diagram archetypes

Choose the archetype from the question the viewer needs answered. Do not reuse
one graph layout for five different questions.

## Architecture

Use for deployable or system relationships. ELK layered layout owns node
positions, explicit ports, stable ordering, and orthogonal routes.

## Flow

Use for directional end-to-end behavior. Ordinary node-link flows use ELK.
Flows with explicit stages or a fan-out/fan-in funnel use the deterministic
stage layout, with ELK allowed only inside a local stage when needed.

## Feedback

Use when an output affects a later iteration. Use ELK for the forward path and
make the feedback relationship semantically and visually distinct.

## Sequence

Use when actor messages and order are the explanation. Use fixed participant
columns and vertical time. Message ports belong to the participant lifelines;
do not use generic graph layout.

## Concurrency

Use for overlapping work, wait states, and synchronization. Use deterministic
lanes and a time axis. Parallel work must be visible in geometry, not only in
an edge label.

## Scene budget and contract

The initial scene contract is semantic: version, kind, title, audience,
direction, nodes, edges, groups or lanes, explicit stages when needed, and
narrative actions. Concurrency scenes also declare one `{node, start, duration,
state}` span per node, where state is `work` or `wait`; the compiler maps every
lane onto the same time axis. The contract contains no coordinates, SVG paths,
CSS, or arbitrary code.

Default maximums are eight primary concepts, four secondary concepts, and two
grouping levels. Split a larger explanation before reducing type or spacing.
Add a primitive only after a grounded diagram cannot be expressed with the
existing contract.
