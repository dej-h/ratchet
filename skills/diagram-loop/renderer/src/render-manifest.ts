import {readFile, stat} from "node:fs/promises";

import {loadImage} from "@napi-rs/canvas";
import {getVideoMetadata} from "@remotion/renderer";
import {z} from "zod";

import {sha256} from "./canonical.js";
import {renderDigest, type OutputChecksum} from "./digest.js";
import {assertAbsoluteRunRoot, resolveExistingWithin} from "./paths.js";

const DigestSchema = z.string().regex(/^[a-f0-9]{64}$/u);

export const RenderOutputSchema = z.object({
  path: z.string().min(1),
  kind: z.enum(["final", "contact-sheet", "boundary-frame", "animation"]),
  format: z.enum(["png", "webm", "mp4"]),
  sha256: DigestSchema,
  bytes: z.number().int().nonnegative(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  duration_seconds: z.number().nonnegative().nullable(),
  codec: z.enum(["png", "h264", "vp8", "vp9", "av1", "unknown"]),
  frame: z.number().int().nonnegative().optional(),
}).strict();

export const RenderManifestSchema = z.object({
  version: z.literal(1),
  input_digest: DigestSchema,
  render_digest: DigestSchema,
  composition: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    fps: z.number().int().positive(),
    duration_in_frames: z.number().int().positive(),
  }).strict(),
  outputs: z.array(RenderOutputSchema).min(2),
}).strict();

export type RenderOutput = z.infer<typeof RenderOutputSchema>;
export type RenderManifest = z.infer<typeof RenderManifestSchema>;

export async function inspectOutput(options: {
  runRoot: string;
  relativePath: string;
  kind: RenderOutput["kind"];
  format: RenderOutput["format"];
  frame?: number;
}): Promise<RenderOutput> {
  const runRoot = assertAbsoluteRunRoot(options.runRoot);
  const absolutePath = await resolveExistingWithin(runRoot, options.relativePath);
  const [bytes, fileStat] = await Promise.all([readFile(absolutePath), stat(absolutePath)]);
  if (options.format === "png") {
    const image = await loadImage(bytes);
    return RenderOutputSchema.parse({
      path: options.relativePath,
      kind: options.kind,
      format: options.format,
      sha256: sha256(bytes),
      bytes: fileStat.size,
      width: image.width,
      height: image.height,
      duration_seconds: null,
      codec: "png",
      ...(options.frame === undefined ? {} : {frame: options.frame}),
    });
  }
  const metadata = await getVideoMetadata(absolutePath, {logLevel: "error"});
  return RenderOutputSchema.parse({
    path: options.relativePath,
    kind: options.kind,
    format: options.format,
    sha256: sha256(bytes),
    bytes: fileStat.size,
    width: metadata.width,
    height: metadata.height,
    duration_seconds: metadata.durationInSeconds,
    codec: metadata.codec,
  });
}

export function calculateManifestDigest(
  inputDigest: string,
  outputs: RenderOutput[],
): string {
  const checksums: OutputChecksum[] = outputs.map((output) => ({
    path: output.path,
    sha256: output.sha256,
  }));
  return renderDigest(inputDigest, checksums);
}

export async function readRenderManifest(runRootValue: string): Promise<RenderManifest> {
  const runRoot = assertAbsoluteRunRoot(runRootValue);
  return RenderManifestSchema.parse(JSON.parse(
    await readFile(await resolveExistingWithin(runRoot, "render-manifest.json"), "utf8"),
  ));
}
