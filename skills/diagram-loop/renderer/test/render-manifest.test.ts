import assert from "node:assert/strict";
import test from "node:test";

import {calculateManifestDigest, RenderManifestSchema, type RenderOutput} from "../src/render-manifest.js";

function output(path: string, digest: string): RenderOutput {
  return {
    path,
    kind: path.includes("contact") ? "contact-sheet" : "final",
    format: "png",
    sha256: digest,
    bytes: 100,
    width: 1920,
    height: 1080,
    duration_seconds: null,
    codec: "png",
  };
}

test("render digests are order-independent and change with output bytes", () => {
  const inputDigest = "a".repeat(64);
  const final = output("renders/final.png", "b".repeat(64));
  const contact = output("renders/contact-sheet.png", "c".repeat(64));
  const baseline = calculateManifestDigest(inputDigest, [final, contact]);
  assert.equal(calculateManifestDigest(inputDigest, [contact, final]), baseline);
  assert.notEqual(
    calculateManifestDigest(inputDigest, [{...final, sha256: "d".repeat(64)}, contact]),
    baseline,
  );
  assert.notEqual(calculateManifestDigest("e".repeat(64), [final, contact]), baseline);
});

test("render manifests require complete typed output metadata", () => {
  const inputDigest = "a".repeat(64);
  const outputs = [
    output("renders/final.png", "b".repeat(64)),
    output("renders/contact-sheet.png", "c".repeat(64)),
  ];
  const renderDigest = calculateManifestDigest(inputDigest, outputs);
  assert.equal(RenderManifestSchema.parse({
    version: 1,
    input_digest: inputDigest,
    render_digest: renderDigest,
    composition: {width: 1920, height: 1080, fps: 30, duration_in_frames: 300},
    outputs,
  }).render_digest, renderDigest);
  assert.equal(RenderManifestSchema.safeParse({
    version: 1,
    input_digest: inputDigest,
    render_digest: renderDigest,
    composition: {width: 1920, height: 1080, fps: 30, duration_in_frames: 300},
    outputs: [outputs[0]],
  }).success, false);
});
