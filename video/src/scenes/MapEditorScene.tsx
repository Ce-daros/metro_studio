import React from "react";
import {Img, staticFile} from "remotion";
import {TEXT, TEXT2, ACCENT, FONT} from "../styles";
import {Scene, Reveal} from "../components";

export const MapEditorScene: React.FC = () => (
  <Scene dur={90}>
    <Reveal>
      <div style={{fontSize: 28, color: ACCENT, fontWeight: 600, fontFamily: FONT, letterSpacing: 1}}>地图编辑器</div>
    </Reveal>
    <Reveal delay={8}>
      <div style={{fontSize: 88, fontWeight: 700, color: TEXT, fontFamily: FONT, textAlign: "center", marginTop: 8}}>
        在真实地图上绘制线网
      </div>
    </Reveal>
    <Reveal delay={6}>
      <div style={{fontSize: 28, color: TEXT2, fontFamily: FONT, textAlign: "center", marginTop: 12, maxWidth: 700}}>
        基于 OpenStreetMap 真实底图，支持站点拖拽、线路绘制、批量编辑、OSM 数据导入
      </div>
    </Reveal>
    <Reveal delay={10}>
      <Img src={staticFile("北京地铁线网.png")} style={{
        width: 1400, marginTop: 40, borderRadius: 16,
        boxShadow: "0 20px 80px rgba(0,0,0,0.6)",
      }} />
    </Reveal>
  </Scene>
);
