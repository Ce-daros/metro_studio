import React from "react";
import {Composition} from "remotion";
import {MetroStudioIntro} from "./MetroStudioIntro";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="MetroStudioIntro"
      component={MetroStudioIntro}
      durationInFrames={1260}
      fps={30}
      width={1920}
      height={1080}
    />
  );
};
