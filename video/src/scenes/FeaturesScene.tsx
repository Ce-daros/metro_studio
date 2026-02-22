import React from "react";
import {TEXT, TEXT2, ACCENT, FONT} from "../styles";
import {Scene, Reveal} from "../components";

export const FeaturesScene: React.FC = () => (
  <Scene dur={90}>
    <Reveal>
      <div style={{fontSize: 88, fontWeight: 700, color: TEXT, fontFamily: FONT, textAlign: "center"}}>
        为专业用户打造
      </div>
    </Reveal>
    <div style={{display: "flex", gap: 120, marginTop: 60}}>
      {([
        ["40", "键盘快捷键"],
        ["23", "Composables"],
        ["18", "Action 模块"],
        ["4", "视图模式"],
      ] as const).map(([v, l], i) => (
        <Reveal key={l} delay={12 + i * 6}>
          <div style={{textAlign: "center"}}>
            <div style={{fontSize: 88, fontWeight: 700, color: ACCENT, fontFamily: FONT}}>{v}</div>
            <div style={{fontSize: 26, color: TEXT2, marginTop: 8, fontFamily: FONT}}>{l}</div>
          </div>
        </Reveal>
      ))}
    </div>
  </Scene>
);
