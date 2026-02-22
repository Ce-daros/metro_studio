import React from "react";
import {Img, staticFile} from "remotion";
import {TEXT, TEXT2, ACCENT, FONT} from "../styles";
import {Scene, Reveal} from "../components";

export const TimelineScene: React.FC = () => (
  <Scene dur={60}>
    <Reveal>
      <div style={{fontSize: 22, color: ACCENT, fontWeight: 600, fontFamily: FONT, letterSpacing: 1}}>时间线</div>
    </Reveal>
    <Reveal delay={8}>
      <div style={{fontSize: 56, fontWeight: 700, color: TEXT, fontFamily: FONT, textAlign: "center", marginTop: 8}}>
        线网发展，一目了然
      </div>
    </Reveal>
    <Reveal delay={6}>
      <div style={{fontSize: 22, color: TEXT2, fontFamily: FONT, textAlign: "center", marginTop: 12, maxWidth: 700}}>
        按年份动态展示建设历程 · 支持播放暂停 · 可导出视频用于汇报
      </div>
    </Reveal>
    <Reveal delay={10}>
      <Img src={staticFile("发展史.png")} style={{
        width: 1400, marginTop: 40, borderRadius: 16,
        boxShadow: "0 20px 80px rgba(0,0,0,0.6)",
      }} />
    </Reveal>
  </Scene>
);
