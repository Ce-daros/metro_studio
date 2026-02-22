import React from "react";
import {TEXT, TEXT2, ACCENT, FONT} from "../styles";
import {Scene, Reveal} from "../components";

export const IndustryScene: React.FC = () => (
  <Scene dur={90}>
    <Reveal>
      <div style={{fontSize: 28, color: ACCENT, fontWeight: 600, fontFamily: FONT, letterSpacing: 1}}>应用场景</div>
    </Reveal>
    <Reveal delay={3}>
      <div style={{fontSize: 88, fontWeight: 700, color: TEXT, fontFamily: FONT, textAlign: "center", marginTop: 8}}>
        从规划到展示，一站式完成
      </div>
    </Reveal>
    <Reveal delay={18}>
      <div style={{fontSize: 32, color: TEXT2, fontFamily: FONT, textAlign: "center", marginTop: 40, lineHeight: 2.2}}>
        线路方案评审 · 多方案快速切换对比<br/>
        领导汇报展示 · 时间线动画导出视频<br/>
        公众沟通宣传 · 标准示意图与展厅互动
      </div>
    </Reveal>
  </Scene>
);
