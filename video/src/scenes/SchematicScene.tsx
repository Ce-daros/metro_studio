import React from "react";
import {Img, staticFile} from "remotion";
import {TEXT, TEXT2, ACCENT, FONT} from "../styles";
import {Scene, Reveal} from "../components";

export const SchematicScene: React.FC = () => (
  <Scene dur={90}>
    <Reveal>
      <div style={{fontSize: 28, color: ACCENT, fontWeight: 600, fontFamily: FONT, letterSpacing: 1}}>自动示意图</div>
    </Reveal>
    <Reveal delay={8}>
      <div style={{fontSize: 88, fontWeight: 700, color: TEXT, fontFamily: FONT, textAlign: "center", marginTop: 8}}>
        一键生成，媲美官方出版物
      </div>
    </Reveal>
    <Reveal delay={6}>
      <div style={{fontSize: 28, color: TEXT2, fontFamily: FONT, textAlign: "center", marginTop: 12, maxWidth: 700}}>
        力导向算法 · 8 方向标准布局 · 智能标签避让 · PNG / SVG 导出
      </div>
    </Reveal>
    <Reveal delay={10}>
      <Img src={staticFile("北京地铁官方示意图.png")} style={{
        width: 1400, marginTop: 40, borderRadius: 16,
        boxShadow: "0 20px 80px rgba(0,0,0,0.6)",
      }} />
    </Reveal>
  </Scene>
);
