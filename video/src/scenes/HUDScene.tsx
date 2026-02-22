import React from "react";
import {Img, staticFile} from "remotion";
import {TEXT, TEXT2, ACCENT, FONT} from "../styles";
import {Scene, Reveal} from "../components";

export const HUDScene: React.FC = () => (
  <Scene dur={90}>
    <Reveal>
      <div style={{fontSize: 28, color: ACCENT, fontWeight: 600, fontFamily: FONT, letterSpacing: 1}}>车载 HUD</div>
    </Reveal>
    <Reveal delay={8}>
      <div style={{fontSize: 88, fontWeight: 700, color: TEXT, fontFamily: FONT, textAlign: "center", marginTop: 8}}>
        第一人称，沉浸式体验
      </div>
    </Reveal>
    <Reveal delay={6}>
      <div style={{fontSize: 28, color: TEXT2, fontFamily: FONT, textAlign: "center", marginTop: 12, maxWidth: 700}}>
        Dijkstra 自动寻路 · 实时速度与站名显示 · TTS 语音播报
      </div>
    </Reveal>
    <Reveal delay={10}>
      <Img src={staticFile("HUD.png")} style={{
        width: 1400, marginTop: 40, borderRadius: 16,
        boxShadow: "0 20px 80px rgba(0,0,0,0.6)",
      }} />
    </Reveal>
  </Scene>
);
