import type {CompiledAction} from "./compiled-schema.js";
import {DESIGN_TOKENS} from "./design-tokens.js";
import type {NarrativeAction, RenderPlan, Scene} from "./schema.js";
import type {LoadedFont} from "./font.js";
import {measureCaption} from "./measurement.js";
import {wordCount} from "./text.js";

export function deliberateCaptionSeconds(caption: string): number {
  return Math.max(
    DESIGN_TOKENS.timing.minimumCaptionSeconds,
    DESIGN_TOKENS.timing.captionBaseSeconds
      + DESIGN_TOKENS.timing.secondsPerWord * wordCount(caption),
  );
}

function actionTargets(action: NarrativeAction): string[] {
  if ("targets" in action) return [...action.targets];
  if ("target" in action) return [action.target];
  if ("edge" in action) return [action.edge];
  return [];
}

function actionSeconds(action: NarrativeAction, plan: RenderPlan): number {
  if (action.action === "finalOverview") return plan.final_hold_seconds;
  if (action.action === "wait") return action.seconds;
  if (action.caption === undefined) return DESIGN_TOKENS.timing.revealSeconds;
  if (plan.pacing === "compact") {
    return Math.max(2.4, 0.8 + 0.2 * wordCount(action.caption));
  }
  return deliberateCaptionSeconds(action.caption);
}

export interface TimelineResult {
  actions: CompiledAction[];
  durationInFrames: number;
  finalHoldFrames: number;
  boundaryFrames: number[];
}

export function buildTimeline(scene: Scene, plan: RenderPlan, font: LoadedFont): TimelineResult {
  let cursor = 0;
  const actions: CompiledAction[] = scene.narrative.map((action, index) => {
    const duration = Math.max(1, Math.ceil(actionSeconds(action, plan) * plan.fps));
    const activeDuration = action.action === "finalOverview" || action.action === "wait"
      ? duration
      : Math.min(duration, Math.ceil(DESIGN_TOKENS.timing.revealSeconds * plan.fps));
    const start = cursor;
    const end = start + duration;
    const captionLayout = action.action !== "finalOverview" && action.caption !== undefined
      ? measureCaption(font, action.caption, plan)
      : undefined;
    const compiled: CompiledAction = {
      index,
      action: action.action,
      targets: actionTargets(action),
      ...(captionLayout === undefined
        ? {}
        : {caption: captionLayout.text, caption_bounds: captionLayout.bounds}
      ),
      start_frame: start,
      active_end_frame: start + activeDuration,
      end_frame: end,
      boundary_frames: {
        before: Math.max(0, start - 1),
        active: Math.min(end - 1, start + Math.floor(activeDuration / 2)),
        settled: end - 1,
      },
    };
    cursor = end;
    return compiled;
  });
  const finalAction = actions.at(-1);
  if (finalAction?.action !== "finalOverview") {
    throw new Error("Timeline must end with finalOverview");
  }
  const boundaryFrames = [...new Set(actions.flatMap((action) => [
    action.boundary_frames.before,
    action.boundary_frames.active,
    action.boundary_frames.settled,
  ]))].sort((left, right) => left - right);
  return {
    actions,
    durationInFrames: cursor,
    finalHoldFrames: Math.ceil(plan.final_hold_seconds * plan.fps),
    boundaryFrames,
  };
}
