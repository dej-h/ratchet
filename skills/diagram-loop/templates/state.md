# Diagram loop state. This file is YAML despite its Markdown extension.
run: <slug>
repo_key: <repo-or-host>
status: active
phase: 0
archetype: null
medium: null

gate_a:
  approved: false
  wording: null
  approved_design_digest: null

gate_b:
  approved: false
  wording: null
  approved_render_digest: null

current:
  owner_artifact: intent.md
  next_boundary: frame the visual objective

phases:
  0: active
  1: pending
  2: pending
  3: pending
  4: pending
  5: pending
  6: pending
  7: pending

render:
  input_digest: null
  reviewed_input_digest: null
  render_digest: null
  reviewed_render_digest: null
  reviewed_outputs: []

active_blockers: []
evidence_references: []
