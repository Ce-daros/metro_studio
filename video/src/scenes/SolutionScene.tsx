import React from "react";
import {TEXT, TEXT2, ACCENT, FONT} from "../styles";
import {Scene, Reveal} from "../components";

export const SolutionScene: React.FC = () => (
  <Scene dur={90}>
    <Reveal>
      <div style={{fontSize: 32, color: ACCENT, fontWeight: 600, fontFamily: FONT, letterSpacing: 2}}>
        一个平台，全流程覆盖
      </div>
    </Reveal>
    <Reveal delay={4}>
      <div style={{fontSize: 88, fontWeight: 700, color: TEXT, textAlign: "center", fontFamily: FONT, marginTop: 16}}>
        四种视角
      </div>
    </Reveal>
    <div style={{display: "flex", gap: 100, marginTop: 60}}>
      {(["地图编辑", "示意图", "时间线", "车载 HUD"] as const).map((t, i) => (
        <Reveal key={t} delay={8 + i * 3}>
          <div style={{textAlign: "center"}}>
            <div style={{fontSize: 64, fontWeight: 700, color: TEXT, fontFamily: FONT}}>{`0${i + 1}`}</div>
            <div style={{fontSize: 28, color: TEXT2, marginTop: 8, fontFamily: FONT}}>{t}</div>
          </div>
        </Reveal>
      ))}
    </div>
  </Scene>
);
