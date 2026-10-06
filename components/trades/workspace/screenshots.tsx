"use client";

import { LaterPhase, Section } from "./section";

export function ScreenshotsSection({ number }: { number: number }) {
  return (
    <Section number={number} title="Screenshots / chart analysis">
      <LaterPhase phase={2}>Screenshot upload, viewer and annotations.</LaterPhase>
    </Section>
  );
}
