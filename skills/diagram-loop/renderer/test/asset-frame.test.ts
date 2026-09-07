import assert from "node:assert/strict";
import test from "node:test";

import {spriteFrameAt} from "../src/composition.js";
import {SceneNodeSchema} from "../src/schema.js";

test("sprite playback advances deterministically and holds the final frame", () => {
  const options = {
    startFrame: 30,
    compositionFps: 30,
    sequenceFps: 3,
    frameCount: 24,
  };
  assert.equal(spriteFrameAt({...options, frame: 0}), 0);
  assert.equal(spriteFrameAt({...options, frame: 30}), 0);
  assert.equal(spriteFrameAt({...options, frame: 39}), 0);
  assert.equal(spriteFrameAt({...options, frame: 40}), 1);
  assert.equal(spriteFrameAt({...options, frame: 260}), 23);
  assert.equal(spriteFrameAt({...options, frame: 900}), 23);
});

test("asset sequences are limited to frame-presented assets and valid sprite grids", () => {
  const base = {
    id: "preview",
    label: "Live Preview",
    role: "client",
    importance: "primary",
    asset: "preview-sprite",
    asset_presentation: "frame",
    asset_sequence: {
      columns: 6,
      rows: 4,
      frame_count: 24,
      frames_per_second: 3,
    },
  };
  assert.equal(SceneNodeSchema.safeParse(base).success, true);
  assert.equal(SceneNodeSchema.safeParse({...base, asset_presentation: "icon"}).success, false);
  assert.equal(SceneNodeSchema.safeParse({
    ...base,
    asset_sequence: {...base.asset_sequence, frame_count: 25},
  }).success, false);
});
