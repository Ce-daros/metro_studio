import React from "react";
import {useCurrentFrame, spring, useVideoConfig} from "remotion";
import {TEXT, TEXT2, FONT} from "../styles";
import {Scene, Reveal} from "../components";

export const CoverScene: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const s = spring({frame, fps, config: {damping: 30, mass: 0.6, stiffness: 200}});

  return (
    <Scene dur={120}>
      <div style={{transform: `scale(${0.92 + s * 0.08})`, opacity: s, textAlign: "center"}}>
        <div style={{fontSize: 140, fontWeight: 700, color: TEXT, letterSpacing: -3, fontFamily: FONT}}>
          Metro Studio
        </div>
      </div>
      <Reveal delay={8}>
        <div style={{fontSize: 40, color: TEXT2, marginTop: 24, fontFamily: FONT, fontWeight: 400}}>
          轨道交通线网规划可视化平台
        </div>
      </Reveal>
    </Scene>
  );
};
