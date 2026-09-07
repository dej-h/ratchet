import {readFile} from "node:fs/promises";

import {createCanvas, loadImage} from "@napi-rs/canvas";

import {atomicWriteFile} from "./io.js";
import {resolveExistingWithin} from "./paths.js";

export async function createContactSheet(options: {
  runRoot: string;
  width: number;
  height: number;
  frames: Array<{frame: number; path: string}>;
  outputPath: string;
}): Promise<void> {
  if (options.frames.length === 0) throw new Error("A contact sheet needs at least one frame");
  const columns = Math.min(4, options.frames.length);
  const cellWidth = Math.floor(options.width / columns);
  const imageHeight = Math.round(cellWidth * options.height / options.width);
  const labelHeight = 34;
  const rows = Math.ceil(options.frames.length / columns);
  const canvas = createCanvas(cellWidth * columns, (imageHeight + labelHeight) * rows);
  const context = canvas.getContext("2d");
  context.fillStyle = "#070b14";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.font = "18px sans-serif";
  context.textBaseline = "middle";
  for (const [index, frame] of options.frames.entries()) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = column * cellWidth;
    const y = row * (imageHeight + labelHeight);
    const image = await loadImage(await readFile(await resolveExistingWithin(options.runRoot, frame.path)));
    context.drawImage(image, x, y, cellWidth, imageHeight);
    context.fillStyle = "#111a2e";
    context.fillRect(x, y + imageHeight, cellWidth, labelHeight);
    context.fillStyle = "#d8e2f3";
    context.fillText(`Frame ${frame.frame}`, x + 12, y + imageHeight + labelHeight / 2);
  }
  await atomicWriteFile(
    options.runRoot,
    options.outputPath,
    canvas.toBuffer("image/png"),
  );
}
