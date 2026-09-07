import {readMarkdownFrontmatter} from "./io.js";
import {assertAbsoluteRunRoot} from "./paths.js";
import {readRenderManifest} from "./render-manifest.js";
import {RenderPlanSchema} from "./schema.js";
import {loadState, recordReview, saveState} from "./state.js";
import {verifyRunOrInvalidateReview} from "./verify.js";

export async function recordRunReview(
  runRootValue: string,
  reviewedOutputs: string[],
  rendererRoot?: string,
): Promise<void> {
  const runRoot = assertAbsoluteRunRoot(runRootValue);
  await verifyRunOrInvalidateReview({
    runRoot,
    ...(rendererRoot === undefined ? {} : {rendererRoot}),
    requireReview: false,
  });
  const [manifest, plan, state] = await Promise.all([
    readRenderManifest(runRoot),
    readMarkdownFrontmatter(runRoot, "render-plan.md").then((value) => RenderPlanSchema.parse(value)),
    loadState(runRoot),
  ]);
  const available = new Set(manifest.outputs.map((output) => output.path));
  for (const output of reviewedOutputs) {
    if (!available.has(output)) throw new Error(`Reviewed output is not in the render manifest: ${output}`);
  }
  const required = [
    "renders/final.png",
    "renders/contact-sheet.png",
    ...plan.formats.filter((format) => format !== "png").map((format) => `renders/final.${format}`),
  ];
  for (const output of required) {
    if (!reviewedOutputs.includes(output)) {
      throw new Error(`Pixel review must include ${output}`);
    }
  }
  await saveState(runRoot, recordReview(state, reviewedOutputs));
}
