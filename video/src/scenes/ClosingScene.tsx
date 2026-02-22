import React from "react";
import {useCurrentFrame, spring, useVideoConfig} from "remotion";
import {TEXT, TEXT2, ACCENT, FONT} from "../styles";
import {Scene, Reveal} from "../components";

export const ClosingScene: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const s = spring({frame, fps, config: {damping: 30, mass: 0.6, stiffness: 200}});

  return (
    <Scene dur={150}>
      <div style={{transform: `scale(${0.92 + s * 0.08})`, opacity: s, textAlign: "center"}}>
        <div style={{fontSize: 120, fontWeight: 700, color: TEXT, fontFamily: FONT}}>
          Metro Studio
        </div>
      </div>
      <Reveal delay={6}>
        <div style={{fontSize: 36, color: TEXT2, marginTop: 24, fontFamily: FONT}}>
          让轨道交通规划更直观
        </div>
      </Reveal>
      <Reveal delay={12}>
        <div style={{fontSize: 30, color: ACCENT, marginTop: 48, fontFamily: FONT, letterSpacing: 1}}>
          立即体验 →
        </div>
      </Reveal>
    </Scene>
  );
};
