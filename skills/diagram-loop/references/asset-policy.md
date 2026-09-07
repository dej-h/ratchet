# Asset policy

## Resolution order

Resolve each asset in this order:

1. a real artifact already present in the repository;
2. a real product output or screenshot;
3. an official vendor, company, or product asset;
4. a recognizable technology icon from an approved local Iconify pack;
5. one approved generic line-icon family;
6. a simple text or shape representation.

If a consequential asset remains unresolved, stop and ask one focused
question. Do not fabricate a logo, screenshot, segmentation mask, chart,
scientific image, or domain-specific visual.

## Manifest contract

`assets.yaml` is the provenance boundary. Every selected entry records:

- stable asset ID and type;
- local materialized path or locked Iconify reference;
- source URL or immutable repository revision and path;
- license or terms link and required attribution;
- expected SHA-256 content hash;
- selected, candidate, or unresolved status;
- any transformation applied before rendering.

The compiler accepts selected local, hash-matching assets only. Candidate
assets cannot be referenced from `scene.yaml`. A referenced unresolved asset
is a compile failure.

Specific technologies keep their recognizable mark. Abstract concepts use one
generic icon family. A package license does not replace the license or
trademark terms of an individual icon or logo, so record both when relevant.

## Determinism

Bundle fonts and approved icon packs locally through the renderer dependency
lock. Measure with the exact bundled font before layout. Include selected
asset bytes, font bytes, selected icon data, the dependency lock, and
provenance data in the renderer input digest. Do not render from network URLs.
