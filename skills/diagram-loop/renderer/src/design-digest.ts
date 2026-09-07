import {readFile} from "node:fs/promises";

import {sha256, stableStringify} from "./canonical.js";
import {assertAbsoluteRunRoot, resolveExistingWithin} from "./paths.js";
import {readMarkdownFrontmatter, readYamlFile} from "./io.js";
import {AssetManifestSchema, RenderPlanSchema} from "./schema.js";

const DESIGN_INPUTS = [
  "intent.md",
  "storyboard.md",
  "assets.yaml",
  "render-plan.md",
  "renders/style-frame.png",
] as const;

export async function designDigest(runRootValue: string): Promise<string> {
  const runRoot = assertAbsoluteRunRoot(runRootValue);
  const assets = AssetManifestSchema.parse(await readYamlFile(runRoot, "assets.yaml"));
  const unresolved = assets.assets.filter((asset) => asset.status !== "selected");
  if (unresolved.length > 0) {
    throw new Error(`Gate A requires every declared asset to be selected: ${unresolved.map((asset) => asset.id).join(", ")}`);
  }
  RenderPlanSchema.parse(await readMarkdownFrontmatter(runRoot, "render-plan.md"));
  const entries = await Promise.all(DESIGN_INPUTS.map(async (relativePath) => ({
    path: relativePath,
    sha256: sha256(await readFile(await resolveExistingWithin(runRoot, relativePath))),
  })));
  return sha256(stableStringify(entries));
}
