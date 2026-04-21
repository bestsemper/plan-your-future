"use client";

import { useState } from "react";
import { Icon } from "./Icon";
import { useTutorial } from "./TutorialProvider";

export default function TutorialButton() {
  const { canStartTutorial, startTutorial } = useTutorial();
  const [showMobileMsg, setShowMobileMsg] = useState(false);

  if (!canStartTutorial) {
    return null;
  }

  const handleClick = () => {
    if (window.matchMedia("(hover: none)").matches) {
      setShowMobileMsg(true);
      setTimeout(() => setShowMobileMsg(false), 3000);
    } else {
      startTutorial();
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className="fixed bottom-6 right-6 h-12 pl-3 pr-3 hover:pr-4 rounded-full bg-uva-orange text-white hover:bg-uva-orange/90 transition-all duration-300 ease-in-out shadow-lg flex items-center cursor-pointer z-50 group overflow-hidden max-w-12 hover:max-w-36"
        aria-label="Tutorial"
      >
        <Icon
          name="help-circle"
          color="currentColor"
          width={24}
          height={24}
          className="shrink-0"
        />
        <span className="whitespace-nowrap font-semibold text-sm overflow-hidden max-w-0 group-hover:max-w-24 transition-all duration-300 ease-in-out pl-0 group-hover:pl-2">
          Tutorial
        </span>
      </button>
      {showMobileMsg && (
        <div className="fixed bottom-22 right-4 z-50 bg-gray-900 text-white text-sm font-medium px-4 py-2.5 rounded-xl shadow-lg max-w-56 text-center animate-fade-in">
          The tutorial is only available on desktop.
        </div>
      )}
    </>
  );
}
