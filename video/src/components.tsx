import React from "react";
import {useCurrentFrame, spring, interpolate, useVideoConfig} from "remotion";
import {fullScreen, BG, FONT} from "./styles";

export const Reveal: React.FC<{children: React.ReactNode; delay?: number}> = ({children, delay = 0}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const progress = spring({frame: Math.max(0, frame - delay), fps, config: {damping: 30, mass: 0.6, stiffness: 200}});
  return (
    <div style={{opacity: progress, transform: `translateY(${(1 - progress) * 40}px)`}}>
      {children}
    </div>
  );
};

// Apple-style scene: slides up from bottom to enter, slides up to exit
export const Scene: React.FC<{children: React.ReactNode; dur: number}> = ({children, dur}) => {
  const frame = useCurrentFrame();
  // Slide up from bottom on enter
  const enterY = interpolate(frame, [0, 10], [80, 0], {extrapolateLeft: "clamp", extrapolateRight: "clamp"});
  const enterOp = interpolate(frame, [0, 10], [0, 1], {extrapolateLeft: "clamp", extrapolateRight: "clamp"});
  // Slide up and fade on exit
  const exitY = interpolate(frame, [dur - 8, dur], [0, -60], {extrapolateLeft: "clamp", extrapolateRight: "clamp"});
  const exitOp = interpolate(frame, [dur - 8, dur], [1, 0], {extrapolateLeft: "clamp", extrapolateRight: "clamp"});

  return (
    <div style={{
      ...fullScreen, background: BG, flexDirection: "column", fontFamily: FONT,
      opacity: enterOp * exitOp,
      transform: `translateY(${enterY + exitY}px)`,
    }}>
      {children}
    </div>
  );
};
