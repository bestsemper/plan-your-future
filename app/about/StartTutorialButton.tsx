"use client";

import { useState, useEffect } from "react";
import { useTutorial } from "../components/TutorialProvider";

export default function StartTutorialButton() {
  const { canStartTutorial, startTutorial } = useTutorial();
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  useEffect(() => {
    setIsTouchDevice(window.matchMedia("(hover: none)").matches);
  }, []);

  return (
    <div className="bg-uva-blue rounded-2xl px-7 py-6 flex items-center justify-between gap-5">
      <div>
        <h3 className="text-base font-bold text-white mb-1">Take the interactive tour</h3>
        <p className="text-sm text-white/65 leading-relaxed max-w-sm">
          A quick walkthrough of Plan Builder, Course Search, and the Forum. Takes about 2 minutes.
        </p>
      </div>
      {isTouchDevice ? (
        <span className="shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold bg-white/15 text-white/80 whitespace-nowrap">
          Desktop only
        </span>
      ) : (
        <button
          type="button"
          onClick={startTutorial}
          disabled={!canStartTutorial}
          className="shrink-0 px-4 py-2 rounded-full text-sm font-semibold bg-white text-uva-blue hover:bg-white/90 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
        >
          Start Tutorial →
        </button>
      )}
    </div>
  );
}
