import path from "node:path";

import {bundle} from "@remotion/bundler";
import {
  openBrowser,
  renderMedia,
  renderStill,
  selectComposition,
  type HeadlessBrowser,
} from "@remotion/renderer";

import {stableStringify} from "./canonical.js";
import {compileRun} from "./compile.js";
import {createContactSheet} from "./contact-sheet.js";
import {atomicWriteFile, rendererRootFromModule} from "./io.js";
import {assertAbsoluteRunRoot, ensureDirectoryWithin, resolveWritableWithin} from "./paths.js";
import {
  calculateManifestDigest,
  inspectOutput,
  RenderManifestSchema,
  type RenderManifest,
  type RenderOutput,
} from "./render-manifest.js";
import {RenderPlanSchema} from "./schema.js";
import {readMarkdownFrontmatter} from "./io.js";
import {beginRender, loadState, recordRenderDigest, saveState} from "./state.js";

export interface RenderRunOptions {
  runRoot: string;
  rendererRoot?: string;
  browserExecutable?: string;
}

async function renderFrame(options: {
  browser: HeadlessBrowser;
  serveUrl: string;
  composition: Awaited<ReturnType<typeof selectComposition>>;
  inputProps: Record<string, unknown>;
  frame: number;
  output: string;
}): Promise<void> {
  await renderStill({
    serveUrl: options.serveUrl,
    composition: options.composition,
    inputProps: options.inputProps,
    frame: options.frame,
    output: options.output,
    imageFormat: "png",
    overwrite: true,
    puppeteerInstance: options.browser,
    logLevel: "error",
  });
}

async function renderAnimation(options: {
  browser: HeadlessBrowser;
  serveUrl: string;
  composition: Awaited<ReturnType<typeof selectComposition>>;
  inputProps: Record<string, unknown>;
  format: "mp4" | "webm";
  output: string;
}): Promise<void> {
  await renderMedia({
    serveUrl: options.serveUrl,
    composition: options.composition,
    inputProps: options.inputProps,
    outputLocation: options.output,
    codec: options.format === "mp4" ? "h264" : "vp8",
    imageFormat: "png",
    muted: true,
    overwrite: true,
    puppeteerInstance: options.browser,
    logLevel: "error",
  });
}

export async function renderRun(options: RenderRunOptions): Promise<RenderManifest> {
  const runRoot = assertAbsoluteRunRoot(options.runRoot);
  const rendererRoot = path.resolve(options.rendererRoot ?? rendererRootFromModule(import.meta.url));
  await saveState(runRoot, beginRender(await loadState(runRoot)));
  const {scene} = await compileRun(runRoot, rendererRoot);
  const plan = RenderPlanSchema.parse(await readMarkdownFrontmatter(runRoot, "render-plan.md"));
  await ensureDirectoryWithin(runRoot, "renders");
  await ensureDirectoryWithin(runRoot, "renders/review");
  const bundleRoot = await ensureDirectoryWithin(runRoot, "renders/.renderer-bundle");

  const serveUrl = await bundle({
    entryPoint: path.join(rendererRoot, "src", "remotion-entry.tsx"),
    outDir: bundleRoot,
    rootDir: rendererRoot,
    publicDir: null,
    enableCaching: true,
    onProgress: () => undefined,
    webpackOverride: (configuration) => ({
      ...configuration,
      resolve: {
        ...configuration.resolve,
        extensionAlias: {
          ...configuration.resolve?.extensionAlias,
          ".js": [".ts", ".tsx", ".js"],
        },
      },
    }),
  });
  const browser = await openBrowser("chrome", {
    ...(options.browserExecutable === undefined
      ? {}
      : {browserExecutable: options.browserExecutable}),
    chromiumOptions: {headless: true},
    logLevel: "error",
  });
  try {
    const inputProps: Record<string, unknown> = {scene};
    const composition = await selectComposition({
      serveUrl,
      id: "Diagram",
      inputProps,
      puppeteerInstance: browser,
      logLevel: "error",
    });
    const finalFrame = scene.duration_in_frames - 1;
    await renderFrame({
      browser,
      serveUrl,
      composition,
      inputProps,
      frame: finalFrame,
      output: await resolveWritableWithin(runRoot, "renders/final.png"),
    });

    const boundaryFrames = [...new Set(scene.boundary_frames)]
      .map((frame) => Math.max(0, Math.min(finalFrame, frame)))
      .sort((left, right) => left - right);
    const reviewFrames: Array<{frame: number; path: string}> = [];
    for (const frame of boundaryFrames) {
      const relativePath = `renders/review/frame-${String(frame).padStart(6, "0")}.png`;
      await renderFrame({
        browser,
        serveUrl,
        composition,
        inputProps,
        frame,
        output: await resolveWritableWithin(runRoot, relativePath),
      });
      reviewFrames.push({frame, path: relativePath});
    }
    await createContactSheet({
      runRoot,
      width: scene.width,
      height: scene.height,
      frames: reviewFrames,
      outputPath: "renders/contact-sheet.png",
    });

    for (const format of plan.formats) {
      if (format === "png") continue;
      await renderAnimation({
        browser,
        serveUrl,
        composition,
        inputProps,
        format,
        output: await resolveWritableWithin(runRoot, `renders/final.${format}`),
      });
    }

    const outputs: RenderOutput[] = [];
    outputs.push(await inspectOutput({
      runRoot,
      relativePath: "renders/final.png",
      kind: "final",
      format: "png",
      frame: finalFrame,
    }));
    outputs.push(await inspectOutput({
      runRoot,
      relativePath: "renders/contact-sheet.png",
      kind: "contact-sheet",
      format: "png",
    }));
    for (const reviewFrame of reviewFrames) {
      outputs.push(await inspectOutput({
        runRoot,
        relativePath: reviewFrame.path,
        kind: "boundary-frame",
        format: "png",
        frame: reviewFrame.frame,
      }));
    }
    for (const format of plan.formats) {
      if (format === "png") continue;
      outputs.push(await inspectOutput({
        runRoot,
        relativePath: `renders/final.${format}`,
        kind: "animation",
        format,
      }));
    }
    outputs.sort((left, right) => left.path.localeCompare(right.path));
    const digest = calculateManifestDigest(scene.input_digest, outputs);
    const manifest = RenderManifestSchema.parse({
      version: 1,
      input_digest: scene.input_digest,
      render_digest: digest,
      composition: {
        width: scene.width,
        height: scene.height,
        fps: scene.fps,
        duration_in_frames: scene.duration_in_frames,
      },
      outputs,
    });
    await atomicWriteFile(runRoot, "render-manifest.json", stableStringify(manifest));
    const state = await loadState(runRoot);
    await saveState(runRoot, recordRenderDigest(state, digest));
    return manifest;
  } finally {
    await browser.close({silent: false});
  }
}
