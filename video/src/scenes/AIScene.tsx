import React from "react";
import {TEXT, TEXT2, ACCENT, FONT} from "../styles";
import {Scene, Reveal} from "../components";

export const AIScene: React.FC = () => (
  <Scene dur={90}>
    <Reveal>
      <div style={{fontSize: 28, color: ACCENT, fontWeight: 600, fontFamily: FONT, letterSpacing: 1}}>AI 驱动</div>
    </Reveal>
    <Reveal delay={8}>
      <div style={{fontSize: 88, fontWeight: 700, color: TEXT, fontFamily: FONT, textAlign: "center", marginTop: 8}}>
        智能命名，自动翻译
      </div>
    </Reveal>
    <Reveal delay={8}>
      <div style={{fontSize: 32, color: TEXT2, fontFamily: FONT, textAlign: "center", marginTop: 40, lineHeight: 2}}>
        基于 OSM 地理信息自动生成站名建议<br/>
        中英文翻译遵循地铁行业规范<br/>
        支持 Ollama 本地推理，数据不出内网
      </div>
    </Reveal>
  </Scene>
);
