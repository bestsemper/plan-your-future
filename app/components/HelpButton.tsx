"use client";

import { Icon } from "./Icon";
import { useTutorial } from "./TutorialProvider";

export default function HelpButton() {
  const { canStartTutorial, startTutorial } = useTutorial();

  if (!canStartTutorial) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={startTutorial}
      className="fixed bottom-6 right-6 h-12 pl-3 pr-3 hover:pr-4 rounded-full bg-uva-orange text-white hover:bg-uva-orange/90 transition-all duration-300 ease-in-out shadow-lg flex items-center cursor-pointer z-50 group overflow-hidden max-w-12 hover:max-w-32"
      aria-label="Help and Tutorial"
    >
      <Icon
        name="help-circle"
        color="currentColor"
        width={24}
        height={24}
        className="shrink-0"
      />
      <span className="whitespace-nowrap font-semibold text-sm overflow-hidden max-w-0 group-hover:max-w-20 transition-all duration-300 ease-in-out pl-0 group-hover:pl-2">
        Help
      </span>
    </button>
  );
}
