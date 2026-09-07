import assert from "node:assert/strict";
import {mkdtemp, rm, symlink, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import test from "node:test";

import {ensureDirectoryWithin, resolveExistingWithin, resolveWritableWithin} from "../src/paths.js";

test("existing reads and write targets reject symlinks below the run root", async (context) => {
  const root = await mkdtemp(path.join(tmpdir(), "diagram-paths-"));
  const outside = await mkdtemp(path.join(tmpdir(), "diagram-outside-"));
  context.after(async () => Promise.all([
    rm(root, {recursive: true, force: true}),
    rm(outside, {recursive: true, force: true}),
  ]));
  await writeFile(path.join(outside, "asset.png"), "outside");
  await symlink(path.join(outside, "asset.png"), path.join(root, "asset.png"));
  await assert.rejects(resolveExistingWithin(root, "asset.png"), /Symlinks are not allowed/u);
  await assert.rejects(resolveWritableWithin(root, "asset.png"), /Symlink write target/u);
  await symlink(outside, path.join(root, "renders"));
  await assert.rejects(ensureDirectoryWithin(root, "renders/review"), /not a real directory/u);
});
