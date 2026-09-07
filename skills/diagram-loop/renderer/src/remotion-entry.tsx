import React from "react";
import {Composition, registerRoot} from "remotion";
import {z} from "zod";

import {DiagramComposition, type DiagramCompositionProps} from "./composition.js";
import {CompiledSceneSchema} from "./compiled-schema.js";

const DiagramCompositionPropsSchema = z.object({scene: CompiledSceneSchema.nullable()}).strict();

const Root = (): React.ReactNode => (
  <Composition<typeof DiagramCompositionPropsSchema, DiagramCompositionProps>
    id="Diagram"
    schema={DiagramCompositionPropsSchema}
    component={DiagramComposition}
    durationInFrames={1}
    fps={30}
    width={1920}
    height={1080}
    defaultProps={{scene: null}}
    calculateMetadata={({props}) => {
      if (props.scene === null) throw new Error("Compiled scene input is required");
      return {
        durationInFrames: props.scene.duration_in_frames,
        fps: props.scene.fps,
        width: props.scene.width,
        height: props.scene.height,
      };
    }}
  />
);

registerRoot(Root);
