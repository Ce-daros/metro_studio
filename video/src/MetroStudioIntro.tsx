import React from "react";
import {Audio, Sequence, staticFile} from "remotion";
import {CoverScene} from "./scenes/CoverScene";
import {PainPointScene} from "./scenes/PainPointScene";
import {SolutionScene} from "./scenes/SolutionScene";
import {MapEditorScene} from "./scenes/MapEditorScene";
import {SchematicScene} from "./scenes/SchematicScene";
import {HUDScene} from "./scenes/HUDScene";
import {AIScene} from "./scenes/AIScene";
import {FeaturesScene} from "./scenes/FeaturesScene";
import {TechScene} from "./scenes/TechScene";
import {CitiesScene} from "./scenes/CitiesScene";
import {IndustryScene} from "./scenes/IndustryScene";
import {OpenSourceScene} from "./scenes/OpenSourceScene";
import {ClosingScene} from "./scenes/ClosingScene";

export const MetroStudioIntro: React.FC = () => {
  const F = 30;
  let t = 0;
  const seq = (sec: number, el: React.ReactNode) => {
    const from = t;
    t += sec * F;
    return <Sequence key={from} from={from} durationInFrames={sec * F}>{el}</Sequence>;
  };

  return (
    <div style={{flex: 1, background: "#000"}}>
      <Audio src={staticFile("rockot-nft-groove-476674.mp3")} volume={0.7} />
      {seq(4, <CoverScene />)}
      {seq(3, <PainPointScene />)}
      {seq(3, <SolutionScene />)}
      {seq(3, <MapEditorScene />)}
      {seq(3, <SchematicScene />)}
      {seq(3, <HUDScene />)}
      {seq(3, <AIScene />)}
      {seq(3, <FeaturesScene />)}
      {seq(3, <TechScene />)}
      {seq(3, <CitiesScene />)}
      {seq(3, <IndustryScene />)}
      {seq(3, <OpenSourceScene />)}
      {seq(5, <ClosingScene />)}
    </div>
  );
};
