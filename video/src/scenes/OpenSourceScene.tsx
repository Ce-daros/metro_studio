import React from "react";
import {TEXT, TEXT2, ACCENT, FONT} from "../styles";
import {Scene, Reveal} from "../components";

export const OpenSourceScene: React.FC = () => (
  <Scene dur={90}>
    <Reveal>
      <div style={{fontSize: 88, fontWeight: 700, color: TEXT, fontFamily: FONT, textAlign: "center"}}>
        ¥49，终身买断
      </div>
    </Reveal>
    <Reveal delay={4}>
      <div style={{fontSize: 32, color: TEXT2, fontFamily: FONT, textAlign: "center", marginTop: 32, lineHeight: 2.2}}>
        一次付费，永久使用，免费更新<br/>
        零安装，浏览器直接使用<br/>
        数据本地存储，安全可控
      </div>
    </Reveal>
  </Scene>
);
