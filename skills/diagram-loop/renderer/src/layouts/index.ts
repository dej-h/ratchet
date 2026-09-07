import type {LayoutInput, LayoutResult} from "./types.js";
import {layoutConcurrency} from "./concurrency.js";
import {layoutLayered} from "./layered.js";
import {layoutSequence} from "./sequence.js";
import {layoutStaged} from "./staged.js";

export async function layoutScene(input: LayoutInput): Promise<LayoutResult> {
  if (input.scene.kind === "sequence") return layoutSequence(input);
  if (input.scene.kind === "concurrency") return layoutConcurrency(input);
  if (input.scene.kind === "flow" && input.scene.stages !== undefined) {
    return layoutStaged(input);
  }
  return layoutLayered(input);
}
