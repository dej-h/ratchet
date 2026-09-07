import {readFile} from "node:fs/promises";
import path from "node:path";

import {createCanvas, GlobalFonts} from "@napi-rs/canvas";

import {sha256} from "./canonical.js";

const FONT_FAMILY = "Ratchet Diagram Inter";
const registeredPaths = new Set<string>();

export interface LoadedFont {
  family: string;
  bytes: Uint8Array;
  dataUri: string;
  sha256: string;
  path: string;
}

export async function loadBundledFont(rendererRoot: string): Promise<LoadedFont> {
  const fontPath = path.join(
    rendererRoot,
    "node_modules",
    "@fontsource",
    "inter",
    "files",
    "inter-latin-400-normal.woff2",
  );
  const bytes = await readFile(fontPath);
  if (!registeredPaths.has(fontPath)) {
    const registered = GlobalFonts.registerFromPath(fontPath, FONT_FAMILY);
    if (registered === null) {
      throw new Error(`Could not register bundled font: ${fontPath}`);
    }
    registeredPaths.add(fontPath);
  }
  return {
    family: FONT_FAMILY,
    bytes,
    dataUri: `data:font/woff2;base64,${bytes.toString("base64")}`,
    sha256: sha256(bytes),
    path: fontPath,
  };
}

export interface TextMeasurement {
  width: number;
  height: number;
  ascent: number;
  descent: number;
}

export function measureText(
  font: LoadedFont,
  text: string,
  size: number,
  lineHeight = 1.2,
): TextMeasurement {
  const lines = text.split("\n");
  const canvas = createCanvas(1, 1);
  const context = canvas.getContext("2d");
  context.font = `400 ${size}px "${font.family}"`;
  let width = 0;
  let ascent = 0;
  let descent = 0;
  for (const line of lines) {
    const metrics = context.measureText(line);
    width = Math.max(width, metrics.width);
    ascent = Math.max(ascent, metrics.actualBoundingBoxAscent);
    descent = Math.max(descent, metrics.actualBoundingBoxDescent);
  }
  return {
    width,
    height: Math.max(size * lineHeight * lines.length, ascent + descent),
    ascent,
    descent,
  };
}
