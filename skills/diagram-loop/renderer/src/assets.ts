import {readFile} from "node:fs/promises";
import path from "node:path";

import {loadImage} from "@napi-rs/canvas";
import {getIconData, iconToSVG} from "@iconify/utils";
import type {IconifyJSON} from "@iconify/types";

import {sha256, stableStringify} from "./canonical.js";
import {resolveExistingWithin} from "./paths.js";
import type {AssetEntry, AssetManifest, Scene} from "./schema.js";

const APPROVED_ICON_PACKS = new Set(["logos", "lucide"]);

export interface ResolvedAsset {
  id: string;
  type: AssetEntry["type"];
  digestBytes: Uint8Array;
  dataUri?: string;
  svgBody?: string;
  viewBox?: string;
  pixelWidth?: number;
  pixelHeight?: number;
}

function mimeTypeFor(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case ".png": return "image/png";
    case ".jpg":
    case ".jpeg": return "image/jpeg";
    case ".webp": return "image/webp";
    case ".svg": return "image/svg+xml";
    default: throw new Error(`Unsupported asset extension: ${filePath}`);
  }
}

async function resolveIcon(rendererRoot: string, asset: AssetEntry): Promise<ResolvedAsset> {
  if (asset.ref === undefined) {
    throw new Error(`Icon asset ${asset.id} has no ref`);
  }
  const [prefix, name] = asset.ref.split(":", 2) as [string, string];
  if (!APPROVED_ICON_PACKS.has(prefix)) {
    throw new Error(`Icon asset ${asset.id} uses unapproved pack: ${prefix}`);
  }
  const packPath = path.join(
    rendererRoot,
    "node_modules",
    "@iconify-json",
    prefix,
    "icons.json",
  );
  const pack = JSON.parse(await readFile(packPath, "utf8")) as IconifyJSON;
  const icon = getIconData(pack, name);
  if (icon === null) {
    throw new Error(`Icon asset ${asset.id} does not exist: ${asset.ref}`);
  }
  const svg = iconToSVG(icon, {height: "1em", width: "1em"});
  const digestBytes = Buffer.from(stableStringify({
    body: svg.body,
    viewBox: svg.attributes.viewBox,
  }));
  const actualHash = sha256(digestBytes);
  if (actualHash !== asset.sha256) {
    throw new Error(
      `Icon asset ${asset.id} hash mismatch: expected ${asset.sha256}, got ${actualHash}`,
    );
  }
  return {
    id: asset.id,
    type: asset.type,
    digestBytes,
    svgBody: svg.body,
    viewBox: svg.attributes.viewBox,
  };
}

async function resolveFile(runRoot: string, asset: AssetEntry): Promise<ResolvedAsset> {
  if (asset.path === undefined) {
    throw new Error(`Selected asset ${asset.id} has no materialized path`);
  }
  const filePath = await resolveExistingWithin(runRoot, asset.path);
  const bytes = await readFile(filePath);
  const actualHash = sha256(bytes);
  if (actualHash !== asset.sha256) {
    throw new Error(
      `Asset ${asset.id} hash mismatch: expected ${asset.sha256}, got ${actualHash}`,
    );
  }
  const image = await loadImage(bytes);
  return {
    id: asset.id,
    type: asset.type,
    digestBytes: bytes,
    dataUri: `data:${mimeTypeFor(filePath)};base64,${bytes.toString("base64")}`,
    pixelWidth: image.width,
    pixelHeight: image.height,
  };
}

export async function resolveAssets(options: {
  rendererRoot: string;
  runRoot: string;
  scene: Scene;
  manifest: AssetManifest;
}): Promise<Map<string, ResolvedAsset>> {
  const manifestById = new Map(options.manifest.assets.map((asset) => [asset.id, asset]));
  const referencedIds = new Set(
    options.scene.nodes.flatMap((node) => node.asset === undefined ? [] : [node.asset]),
  );
  for (const assetId of referencedIds) {
    const asset = manifestById.get(assetId);
    if (asset === undefined) {
      throw new Error(`Scene references missing asset: ${assetId}`);
    }
    if (asset.status !== "selected") {
      throw new Error(`Scene references ${asset.status} asset: ${assetId}`);
    }
  }
  const resolved = new Map<string, ResolvedAsset>();
  for (const asset of options.manifest.assets) {
    if (asset.status !== "selected") continue;
    const value = asset.type === "icon"
      ? await resolveIcon(options.rendererRoot, asset)
      : await resolveFile(options.runRoot, asset);
    resolved.set(asset.id, value);
  }
  return resolved;
}

export async function calculateIconHash(
  rendererRoot: string,
  ref: string,
): Promise<string> {
  const placeholder: AssetEntry = {
    id: "hash-probe",
    type: "icon",
    status: "selected",
    source_url: "https://github.com/iconify/icon-sets",
    source_revision: "hash-probe",
    license_name: "hash-probe",
    license_url: "https://github.com/iconify/icon-sets/blob/master/LICENSE",
    trademark_url: "https://github.com/iconify/icon-sets",
    sha256: "0".repeat(64),
    transformations: [],
    ref,
  };
  try {
    await resolveIcon(rendererRoot, placeholder);
  } catch (error) {
    const match = error instanceof Error
      ? /got ([a-f0-9]{64})$/u.exec(error.message)
      : null;
    if (match?.[1] !== undefined) return match[1];
    throw error;
  }
  throw new Error("Hash probe unexpectedly matched the placeholder hash");
}
