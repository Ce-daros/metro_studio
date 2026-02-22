import React from "react";
import {TEXT, TEXT2, ACCENT, FONT} from "../styles";
import {Scene, Reveal} from "../components";

export const PainPointScene: React.FC = () => (
  <Scene dur={90}>
    <Reveal>
      <div style={{fontSize: 80, fontWeight: 700, color: TEXT, textAlign: "center", fontFamily: FONT, lineHeight: 1.3}}>
        设计一张专业的地铁线路图
      </div>
    </Reveal>
    <Reveal delay={6}>
      <div style={{fontSize: 80, fontWeight: 700, color: ACCENT, textAlign: "center", fontFamily: FONT, marginTop: 8}}>
        不该这么难。
      </div>
    </Reveal>
    <Reveal delay={12}>
      <div style={{fontSize: 32, color: TEXT2, textAlign: "center", marginTop: 40, fontFamily: FONT, lineHeight: 1.8, maxWidth: 800}}>
        AutoCAD → Illustrator → PowerPoint → 导出 PDF<br/>
        多工具切换，无法交互，修改成本高
      </div>
    </Reveal>
  </Scene>
);
