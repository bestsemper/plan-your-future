"use client";

import { useTutorial } from "../components/TutorialProvider";

export default function StartTutorialButton() {
  const { canStartTutorial, startTutorial } = useTutorial();

  const handleClick = () => {
    if (window.matchMedia("(hover: none)").matches) return;
    startTutorial();
  };

  return (
    <div className="bg-uva-blue rounded-2xl px-7 py-6 flex items-center justify-between gap-5">
      <div>
        <h3 className="text-base font-bold text-white mb-1">Take the interactive tour</h3>
        <p className="text-sm text-white/65 leading-relaxed max-w-sm">
          A quick walkthrough of Plan Builder, Course Search, and the Forum — takes about 2 minutes.
        </p>
      </div>
      <button
        type="button"
        onClick={handleClick}
        disabled={!canStartTutorial}
        className="shrink-0 px-4 py-2 rounded-full text-sm font-semibold bg-white text-uva-blue hover:bg-white/90 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
      >
        Start Tutorial →
      </button>
    </div>
  );
}
