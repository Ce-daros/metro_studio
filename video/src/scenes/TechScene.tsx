import React from "react";
import {TEXT, TEXT2, ACCENT, FONT} from "../styles";
import {Scene, Reveal} from "../components";

export const TechScene: React.FC = () => (
  <Scene dur={90}>
    <Reveal>
      <div style={{fontSize: 28, color: ACCENT, fontWeight: 600, fontFamily: FONT, letterSpacing: 1}}>技术架构</div>
    </Reveal>
    <Reveal delay={8}>
      <div style={{fontSize: 88, fontWeight: 700, color: TEXT, fontFamily: FONT, textAlign: "center", marginTop: 8}}>
        轻量，但强大
      </div>
    </Reveal>
    <Reveal delay={8}>
      <div style={{fontSize: 32, color: TEXT2, fontFamily: FONT, textAlign: "center", marginTop: 40, lineHeight: 2.2}}>
        Vue 3.5 + Pinia · MapLibre GL · Web Worker 异步布局<br/>
        仅 9 个生产依赖 · 25,000+ 行代码 · 44 个组件<br/>
        IndexedDB 本地持久化 · Vite 7 构建
      </div>
    </Reveal>
  </Scene>
);
