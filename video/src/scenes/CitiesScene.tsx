import React from "react";
import {Img, staticFile} from "remotion";
import {TEXT, TEXT2, FONT} from "../styles";
import {Scene, Reveal} from "../components";

export const CitiesScene: React.FC = () => (
  <Scene dur={90}>
    <Reveal>
      <div style={{fontSize: 88, fontWeight: 700, color: TEXT, fontFamily: FONT, textAlign: "center"}}>
        支持任意城市线网
      </div>
    </Reveal>
    <div style={{display: "flex", gap: 32, marginTop: 48}}>
      {([
        {img: "北京地铁线网.png", name: "北京"},
        {img: "武汉地铁.png", name: "武汉"},
        {img: "青岛地铁.png", name: "青岛"},
      ] as const).map((c, i) => (
        <Reveal key={c.name} delay={12 + i * 8}>
          <div style={{textAlign: "center"}}>
            <Img src={staticFile(c.img)} style={{
              width: 460, height: 300, objectFit: "cover",
              borderRadius: 16, boxShadow: "0 16px 60px rgba(0,0,0,0.5)",
            }} />
            <div style={{fontSize: 26, color: TEXT2, marginTop: 16, fontFamily: FONT}}>{c.name}</div>
          </div>
        </Reveal>
      ))}
    </div>
  </Scene>
);
