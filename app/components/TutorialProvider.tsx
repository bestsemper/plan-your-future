"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";

const TUTORIAL_VERSION = "v3";
const STORAGE_PREFIX = `hoos-plan:tutorial:${TUTORIAL_VERSION}`;
const STORAGE_SEEN_KEY = `${STORAGE_PREFIX}:seen`;
const STORAGE_COMPLETED_KEY = `${STORAGE_PREFIX}:completed`;
const STORAGE_STEP_KEY = `${STORAGE_PREFIX}:current-step`;

type FeatureId = "welcome" | "audit" | "plan" | "dashboard" | "courses" | "prereq" | "forum" | "finish";

type TutorialStep = {
  id: string;
  featureId: FeatureId;
  title: string;
  body: string;
  primaryCta: string;
  secondaryCta?: string;
  route?: string;
  targetSelector?: string;
  advanceOnTargetClick?: boolean;
  progressEvents?: string[];
  isSkipWarning?: boolean;
};

type TutorialContextValue = {
  canStartTutorial: boolean;
  startTutorial: () => void;
};

const TutorialContext = createContext<TutorialContextValue>({
  canStartTutorial: false,
  startTutorial: () => {},
});

const tutorialSteps: TutorialStep[] = [
  {
    id: "welcome",
    featureId: "welcome",
    title: "Welcome to Hoo's Plan",
    body: "You will complete setup by importing completed courses, importing your plan, then checking key app features.",
    primaryCta: "Start tutorial",
    secondaryCta: "Not now",
    route: "/",
  },

  {
    id: "audit_open_account_menu",
    featureId: "audit",
    title: "Feature: Completed Courses Import",
    body: "Click your account button in the sidebar footer.",
    primaryCta: "Waiting for click",
    secondaryCta: "Skip",
    route: "/",
    targetSelector: '[data-tutorial-target="account-menu-toggle"]',
    advanceOnTargetClick: true,
  },
  {
    id: "audit_go_profile",
    featureId: "audit",
    title: "Go to Profile",
    body: "Click the highlighted Profile option.",
    primaryCta: "Waiting for click",
    secondaryCta: "Skip",
    route: "/",
    targetSelector: '[data-tutorial-target="account-menu-profile"]',
    advanceOnTargetClick: true,
  },
  {
    id: "audit_open_completed",
    featureId: "audit",
    title: "Open Completed Courses",
    body: "Click the highlighted Completed Courses button.",
    primaryCta: "Waiting for click",
    secondaryCta: "Skip",
    route: "/profile",
    targetSelector: '[data-tutorial-target="open-completed-courses"]',
    advanceOnTargetClick: true,
  },
  {
    id: "audit_choose_file",
    featureId: "audit",
    title: "Choose audit report PDF",
    body: "Click the highlighted file picker and choose your audit report PDF.",
    primaryCta: "Waiting for click",
    secondaryCta: "Skip",
    route: "/profile",
    targetSelector: '[data-tutorial-target="audit-import-file"]',
    advanceOnTargetClick: true,
  },
  {
    id: "audit_submit",
    featureId: "audit",
    title: "Import audit report",
    body: "Click Import Audit Report. This step advances automatically after import completes.",
    primaryCta: "Waiting for import",
    secondaryCta: "Skip",
    route: "/profile",
    targetSelector: '[data-tutorial-target="audit-import-submit"]',
    progressEvents: ["auditImportCompleted"],
  },
  {
    id: "audit_skip_warning",
    featureId: "audit",
    title: "You can import this later",
    body: "You can always import completed courses later from Profile > Completed Courses.",
    primaryCta: "Continue",
    secondaryCta: "Back",
    route: "/profile",
    isSkipWarning: true,
  },

  {
    id: "plan_nav",
    featureId: "plan",
    title: "Feature: Plan Import",
    body: "Click Plan Builder in the sidebar.",
    primaryCta: "Waiting for click",
    secondaryCta: "Skip",
    route: "/profile",
    targetSelector: '[data-tutorial-target="nav-plan"]',
    advanceOnTargetClick: true,
  },
  {
    id: "plan_open_more",
    featureId: "plan",
    title: "Open More Actions",
    body: "Click the highlighted More Actions button in the top-right of Plan Builder.",
    primaryCta: "Waiting for click",
    secondaryCta: "Skip",
    route: "/plan",
    targetSelector: '[data-tutorial-target="open-plan-more-actions"]',
    advanceOnTargetClick: true,
  },
  {
    id: "plan_open_import",
    featureId: "plan",
    title: "Open Import Plan",
    body: "Click the highlighted Import Plan option.",
    primaryCta: "Waiting for click",
    secondaryCta: "Skip",
    route: "/plan",
    targetSelector: '[data-tutorial-target="open-plan-import"]',
    advanceOnTargetClick: true,
  },
  {
    id: "plan_choose_mode",
    featureId: "plan",
    title: "Choose import mode",
    body: "Click New Plan or Overwrite in the highlighted section.",
    primaryCta: "Waiting for click",
    secondaryCta: "Skip",
    route: "/plan",
    targetSelector: '[data-tutorial-target="plan-import-mode"]',
    advanceOnTargetClick: true,
  },
  {
    id: "plan_choose_file",
    featureId: "plan",
    title: "Choose Stellic PDF",
    body: "Click the highlighted file picker and choose your Stellic plan PDF.",
    primaryCta: "Waiting for click",
    secondaryCta: "Skip",
    route: "/plan",
    targetSelector: '[data-tutorial-target="plan-import-file"]',
    advanceOnTargetClick: true,
  },
  {
    id: "plan_submit",
    featureId: "plan",
    title: "Import your plan",
    body: "Click Import Plan PDF. This step advances automatically after import completes.",
    primaryCta: "Waiting for import",
    secondaryCta: "Skip",
    route: "/plan",
    targetSelector: '[data-tutorial-target="plan-import-submit"]',
    progressEvents: ["planImportCompleted"],
  },
  {
    id: "plan_skip_warning",
    featureId: "plan",
    title: "You can import this later",
    body: "You can always import more plans later from Plan Builder > Import Plan.",
    primaryCta: "Continue",
    secondaryCta: "Back",
    route: "/plan",
    isSkipWarning: true,
  },

  {
    id: "dashboard_feature",
    featureId: "dashboard",
    title: "Feature: Dashboard",
    body: "Click Dashboard in the sidebar.",
    primaryCta: "Waiting for click",
    secondaryCta: "Skip",
    route: "/plan",
    targetSelector: '[data-tutorial-target="nav-dashboard"]',
    advanceOnTargetClick: true,
  },
  {
    id: "courses_feature",
    featureId: "courses",
    title: "Feature: Course Search",
    body: "Click Course Search in the sidebar.",
    primaryCta: "Waiting for click",
    secondaryCta: "Skip",
    route: "/",
    targetSelector: '[data-tutorial-target="nav-courses"]',
    advanceOnTargetClick: true,
  },
  {
    id: "courses_search_input",
    featureId: "courses",
    title: "Find a specific class",
    body: "Click the search box and type CS 2100.",
    primaryCta: "Waiting for click",
    secondaryCta: "Skip",
    route: "/courses",
    targetSelector: '[data-tutorial-target="courses-search-input"]',
    advanceOnTargetClick: true,
  },
  {
    id: "courses_select_specific_class",
    featureId: "courses",
    title: "Open that class",
    body: "Select CS 2100 from the dropdown to open course details and requirements.",
    primaryCta: "Waiting for selection",
    secondaryCta: "Skip",
    route: "/courses",
    progressEvents: ["courseSearchSelected"],
  },
  {
    id: "courses_open_add_to_plan",
    featureId: "courses",
    title: "Start Add to Plan",
    body: "Click Add to Plan in the course details panel for CS 2100.",
    primaryCta: "Waiting for click",
    secondaryCta: "Skip",
    route: "/courses",
    targetSelector: '[data-tutorial-target="courses-add-to-plan-toggle"]',
    advanceOnTargetClick: true,
  },
  {
    id: "courses_choose_plan",
    featureId: "courses",
    title: "Choose a plan",
    body: "Click Select plan and choose where CS 2100 should go.",
    primaryCta: "Waiting for click",
    secondaryCta: "Skip",
    route: "/courses",
    targetSelector: '[data-tutorial-target="courses-plan-select"]',
    advanceOnTargetClick: true,
  },
  {
    id: "courses_choose_semester",
    featureId: "courses",
    title: "Choose a semester",
    body: "Click Select semester and pick the term for CS 2100.",
    primaryCta: "Waiting for click",
    secondaryCta: "Skip",
    route: "/courses",
    targetSelector: '[data-tutorial-target="courses-semester-select"]',
    advanceOnTargetClick: true,
  },
  {
    id: "courses_add_to_plan_submit",
    featureId: "courses",
    title: "Add class to your plan",
    body: "Click Add to place CS 2100 into your chosen semester.",
    primaryCta: "Waiting for add",
    secondaryCta: "Skip",
    route: "/courses",
    targetSelector: '[data-tutorial-target="courses-add-to-plan-submit"]',
    progressEvents: ["courseAddedToPlan"],
  },
  {
    id: "courses_after_add_note",
    featureId: "courses",
    title: "Class added",
    body: "Nice. You can repeat this flow for any class you want to plan out.",
    primaryCta: "Continue",
    secondaryCta: "Skip",
    route: "/courses",
  },
  {
    id: "prereq_feature",
    featureId: "prereq",
    title: "Feature: Prerequisites",
    body: "Click Prerequisites in the sidebar.",
    primaryCta: "Waiting for click",
    secondaryCta: "Skip",
    route: "/courses",
    targetSelector: '[data-tutorial-target="nav-prerequisites"]',
    advanceOnTargetClick: true,
  },
  {
    id: "prereq_search_department",
    featureId: "prereq",
    title: "Department defaults from your profile",
    body: "This page starts with the major from your profile by default when available. Click the department search to switch subjects.",
    primaryCta: "Waiting for click",
    secondaryCta: "Skip",
    route: "/prerequisites",
    targetSelector: '[data-tutorial-target="prereq-search-input"]',
    advanceOnTargetClick: true,
  },
  {
    id: "prereq_tree_search_course",
    featureId: "prereq",
    title: "Find a class in the tree",
    body: "Click Search courses in tree and type CS 3100.",
    primaryCta: "Waiting for click",
    secondaryCta: "Skip",
    route: "/prerequisites",
    targetSelector: '[data-tutorial-target="prereq-tree-course-search"]',
    advanceOnTargetClick: true,
  },
  {
    id: "prereq_tree_open_course_details",
    featureId: "prereq",
    title: "Open class details",
    body: "Choose CS 3100 from the search results to view prerequisites, corequisites, and what it unlocks.",
    primaryCta: "Waiting for selection",
    secondaryCta: "Skip",
    route: "/prerequisites",
    progressEvents: ["prereqTreeCourseSelected"],
  },
  {
    id: "prereq_info",
    featureId: "prereq",
    title: "Understand the tree",
    body: "Click the info icon to learn what is included in this prerequisites view.",
    primaryCta: "Waiting for click",
    secondaryCta: "Skip",
    route: "/prerequisites",
    targetSelector: '[data-tutorial-target="prereq-info-button"]',
    advanceOnTargetClick: true,
  },
  {
    id: "forum_feature",
    featureId: "forum",
    title: "Feature: Forum",
    body: "Click Forum in the sidebar.",
    primaryCta: "Waiting for click",
    secondaryCta: "Skip",
    route: "/prerequisites",
    targetSelector: '[data-tutorial-target="nav-forum"]',
    advanceOnTargetClick: true,
  },
  {
    id: "forum_search",
    featureId: "forum",
    title: "Search discussions",
    body: "Click the forum search bar to find posts by topic, title, or author.",
    primaryCta: "Waiting for click",
    secondaryCta: "Skip",
    route: "/forum",
    targetSelector: '[data-tutorial-target="forum-search-input"]',
    advanceOnTargetClick: true,
  },
  {
    id: "forum_sort",
    featureId: "forum",
    title: "Sort posts",
    body: "Click Sort by to switch between recent activity and highest-upvoted posts.",
    primaryCta: "Waiting for click",
    secondaryCta: "Skip",
    route: "/forum",
    targetSelector: '[data-tutorial-target="forum-sort-button"]',
    advanceOnTargetClick: true,
  },
  {
    id: "forum_ask_question",
    featureId: "forum",
    title: "Start a new post",
    body: "Click Ask Question when you want advice on plans, courses, or prerequisites.",
    primaryCta: "Waiting for click",
    secondaryCta: "Skip",
    route: "/forum",
    targetSelector: '[data-tutorial-target="forum-ask-question"]',
    advanceOnTargetClick: true,
  },

  {
    id: "finish",
    featureId: "finish",
    title: "Tutorial complete",
    body: "You are set. Reopen this tutorial anytime from Help in the sidebar.",
    primaryCta: "Done",
    secondaryCta: "Restart",
    route: "/forum",
    targetSelector: '[data-tutorial-target="nav-dashboard"]',
  },
];

const orderedFlowStepIds = [
  "welcome",
  "audit_open_account_menu",
  "audit_go_profile",
  "audit_open_completed",
  "audit_choose_file",
  "audit_submit",
  "plan_nav",
  "plan_open_more",
  "plan_open_import",
  "plan_choose_mode",
  "plan_choose_file",
  "plan_submit",
  "dashboard_feature",
  "courses_feature",
  "courses_search_input",
  "courses_select_specific_class",
  "courses_open_add_to_plan",
  "courses_choose_plan",
  "courses_choose_semester",
  "courses_add_to_plan_submit",
  "courses_after_add_note",
  "prereq_feature",
  "prereq_search_department",
  "prereq_tree_search_course",
  "prereq_tree_open_course_details",
  "prereq_info",
  "forum_feature",
  "forum_search",
  "forum_sort",
  "forum_ask_question",
  "finish",
] as const;

const orderedFeatureIds: FeatureId[] = ["welcome", "audit", "plan", "dashboard", "courses", "prereq", "forum", "finish"];

const stepById = tutorialSteps.reduce<Record<string, TutorialStep>>((acc, step) => {
  acc[step.id] = step;
  return acc;
}, {});

const nextFlowStepMap = orderedFlowStepIds.reduce<Record<string, string | null>>((acc, stepId, index) => {
  acc[stepId] = orderedFlowStepIds[index + 1] ?? null;
  return acc;
}, {});

function loadStorageFlag(key: string): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem(key) === "1";
}

function featureProgressLabel(featureId: FeatureId): string {
  const index = orderedFeatureIds.indexOf(featureId);
  if (index === -1) {
    return "Feature";
  }

  return `Feature ${index + 1} of ${orderedFeatureIds.length}`;
}

function emitHighlight(target: HTMLElement | null, shouldHighlight: boolean) {
  if (!target) {
    return;
  }

  if (shouldHighlight) {
    target.classList.add("tutorial-target-highlight");
    return;
  }

  target.classList.remove("tutorial-target-highlight");
}

function findVisibleTarget(selector: string): HTMLElement | null {
  const candidates = Array.from(document.querySelectorAll(selector));

  for (const candidate of candidates) {
    if (!(candidate instanceof HTMLElement)) {
      continue;
    }

    const rect = candidate.getBoundingClientRect();
    const style = window.getComputedStyle(candidate);
    const isVisible =
      rect.width > 0 &&
      rect.height > 0 &&
      style.visibility !== "hidden" &&
      style.display !== "none";

    if (isVisible) {
      return candidate;
    }
  }

  return null;
}

export function useTutorial() {
  return useContext(TutorialContext);
}

export default function TutorialProvider({
  isAuthenticated,
  children,
}: {
  isAuthenticated: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const [isOpen, setIsOpen] = useState(false);
  const [currentStepId, setCurrentStepId] = useState<string>(orderedFlowStepIds[0]);
  const [highlightRect, setHighlightRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const lastDispatchKeyRef = useRef<string>("");
  const highlightedElementRef = useRef<HTMLElement | null>(null);

  const step = stepById[currentStepId];

  useEffect(() => {
    lastDispatchKeyRef.current = "";
  }, [currentStepId]);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    const hasSeen = loadStorageFlag(STORAGE_SEEN_KEY);
    if (!hasSeen && pathname === "/") {
      setCurrentStepId(orderedFlowStepIds[0]);
      setIsOpen(true);
      window.localStorage.setItem(STORAGE_SEEN_KEY, "1");
    }
  }, [isAuthenticated, pathname]);

  useEffect(() => {
    if (!isOpen || !isAuthenticated || !step) {
      return;
    }

    const targetRoute = step.route;
    if (!targetRoute) {
      return;
    }

    if (pathname === targetRoute) {
      return;
    }

    const routeKey = `route:${currentStepId}:${targetRoute}`;
    if (lastDispatchKeyRef.current === routeKey) {
      return;
    }

    lastDispatchKeyRef.current = routeKey;
    router.push(targetRoute);
  }, [currentStepId, isAuthenticated, isOpen, pathname, router, step]);

  const applyHighlightToTarget = (selector: string, shouldScroll = false) => {
    const target = findVisibleTarget(selector);
    if (!target) {
      emitHighlight(highlightedElementRef.current, false);
      highlightedElementRef.current = null;
      setHighlightRect(null);
      return;
    }

    if (highlightedElementRef.current && highlightedElementRef.current !== target) {
      emitHighlight(highlightedElementRef.current, false);
    }

    emitHighlight(target, true);
    highlightedElementRef.current = target;

    if (shouldScroll) {
      target.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    }

    const rect = target.getBoundingClientRect();
    const padding = 10;
    setHighlightRect({
      top: Math.max(0, rect.top - padding),
      left: Math.max(0, rect.left - padding),
      width: rect.width + padding * 2,
      height: rect.height + padding * 2,
    });
  };

  // Clear highlight when step changes or tutorial closes
  useEffect(() => {
    if (!isOpen) {
      emitHighlight(highlightedElementRef.current, false);
      highlightedElementRef.current = null;
      setHighlightRect(null);
    }
  }, [isOpen]);

  // Apply highlight to target element
  useEffect(() => {
    if (!isOpen || !step?.targetSelector) {
      return;
    }

    // Clear old highlight first
    emitHighlight(highlightedElementRef.current, false);
    highlightedElementRef.current = null;
    setHighlightRect(null);

    const selector = step.targetSelector;
    applyHighlightToTarget(selector, true);

    const applyHighlight = () => {
      applyHighlightToTarget(selector);
    };

    // Keep retrying while the step is active so highlights appear after async UI renders.
    const highlightRetryInterval = window.setInterval(applyHighlight, 400);

    window.addEventListener("resize", applyHighlight);
    window.addEventListener("scroll", applyHighlight, true);
    document.addEventListener("visibilitychange", applyHighlight);
    window.addEventListener("focus", applyHighlight);

    return () => {
      window.clearInterval(highlightRetryInterval);
      window.removeEventListener("resize", applyHighlight);
      window.removeEventListener("scroll", applyHighlight, true);
      document.removeEventListener("visibilitychange", applyHighlight);
      window.removeEventListener("focus", applyHighlight);
    };
  }, [isOpen, step?.id, pathname]);

  useEffect(() => {
    if (!isOpen || !step) {
      return;
    }

    window.localStorage.setItem(STORAGE_STEP_KEY, step.id);
  }, [isOpen, step]);

  const goToStep = (stepId: string | null) => {
    if (!stepId || !stepById[stepId]) {
      setIsOpen(false);
      window.localStorage.setItem(STORAGE_COMPLETED_KEY, "1");
      window.localStorage.setItem(STORAGE_SEEN_KEY, "1");
      window.localStorage.removeItem(STORAGE_STEP_KEY);
      return;
    }

    setCurrentStepId(stepId);
  };

  const goToNextFlowStep = () => {
    const next = nextFlowStepMap[currentStepId];
    goToStep(next);
  };

  useEffect(() => {
    if (!isOpen || !step?.advanceOnTargetClick || !step.targetSelector) {
      return;
    }

    const selector = step.targetSelector;

    const onDocumentClick = (event: MouseEvent) => {
      const clickedElement = event.target as Element | null;
      if (!clickedElement) {
        return;
      }

      // Don't clear highlight if clicking on the tutorial card itself (e.g., back button)
      if (clickedElement.closest('[role="dialog"][aria-label="App tutorial"]')) {
        return;
      }

      const target = findVisibleTarget(selector);
      if (!target) {
        // Let the retry loop catch up when the target appears.
        return;
      }

      if (target.contains(clickedElement)) {
        // User clicked on the target, advance
        window.setTimeout(() => {
          goToNextFlowStep();
        }, 0);
        return;
      }

      // Ignore off-target clicks so the highlight stays stable and visible.
    };

    document.addEventListener("click", onDocumentClick, true);
    return () => {
      document.removeEventListener("click", onDocumentClick, true);
    };
  }, [currentStepId, isOpen, step]);

  useEffect(() => {
    if (!isOpen || !step?.progressEvents || step.progressEvents.length === 0) {
      return;
    }

    const events = step.progressEvents;
    const onStepEvent = (event: Event) => {
      const customEvent = event as CustomEvent<{ name?: string }>;
      const eventName = customEvent.detail?.name;
      if (!eventName || !events.includes(eventName)) {
        return;
      }

      goToNextFlowStep();
    };

    window.addEventListener("tutorial:step-event", onStepEvent as EventListener);
    return () => {
      window.removeEventListener("tutorial:step-event", onStepEvent as EventListener);
    };
  }, [currentStepId, isOpen, step]);

  const closeTutorial = () => {
    setIsOpen(false);
  };

  const goBack = () => {
    if (currentStepId === "audit_skip_warning") {
      setCurrentStepId("audit_submit");
      return;
    }

    if (currentStepId === "plan_skip_warning") {
      setCurrentStepId("plan_submit");
      return;
    }

    const flowIndex = orderedFlowStepIds.indexOf(currentStepId as (typeof orderedFlowStepIds)[number]);
    if (flowIndex <= 0) {
      return;
    }

    setCurrentStepId(orderedFlowStepIds[flowIndex - 1]);
  };

  const handlePrimary = () => {
    if (!step) {
      return;
    }

    if (step.id === "welcome") {
      goToStep("audit_open_account_menu");
      return;
    }

    if (step.id === "audit_skip_warning") {
      goToStep("plan_nav");
      return;
    }

    if (step.id === "plan_skip_warning") {
      goToStep("dashboard_feature");
      return;
    }

    if (step.id === "finish") {
      goToStep(null);
      return;
    }

    if (step.advanceOnTargetClick || (step.progressEvents && step.progressEvents.length > 0)) {
      return;
    }

    goToNextFlowStep();
  };

  const handleSecondary = () => {
    if (!step) {
      return;
    }

    if (step.id === "welcome") {
      closeTutorial();
      return;
    }

    if (step.id.startsWith("audit_") && !step.isSkipWarning) {
      goToStep("audit_skip_warning");
      return;
    }

    if (step.id.startsWith("plan_") && !step.isSkipWarning) {
      goToStep("plan_skip_warning");
      return;
    }

    if (step.id === "audit_skip_warning") {
      goToStep("audit_submit");
      return;
    }

    if (step.id === "plan_skip_warning") {
      goToStep("plan_submit");
      return;
    }

    if (step.id === "finish") {
      startTutorial();
      return;
    }

    goToNextFlowStep();
  };

  const startTutorial = () => {
    if (!isAuthenticated) {
      return;
    }

    setCurrentStepId(orderedFlowStepIds[0]);
    setIsOpen(true);

    window.localStorage.setItem(STORAGE_SEEN_KEY, "1");
    window.localStorage.setItem(STORAGE_STEP_KEY, orderedFlowStepIds[0]);
    window.localStorage.removeItem(STORAGE_COMPLETED_KEY);
  };

  const contextValue = useMemo<TutorialContextValue>(
    () => ({
      canStartTutorial: isAuthenticated,
      startTutorial,
    }),
    [isAuthenticated, startTutorial]
  );

  const progressLabel = step ? featureProgressLabel(step.featureId) : "Feature";
  const primaryDisabled = Boolean(step?.advanceOnTargetClick || (step?.progressEvents && step.progressEvents.length > 0));
  const tutorialCardPositionClass =
    step?.id.startsWith("prereq_")
      ? "bottom-4 left-4 lg:bottom-6 lg:left-6"
      : "bottom-4 right-4 lg:bottom-6 lg:right-6";

  return (
    <TutorialContext.Provider value={contextValue}>
      {children}
      {isAuthenticated && isOpen && step && (
        <div className="fixed inset-0 z-[90] pointer-events-none" role="dialog" aria-modal="false" aria-label="App tutorial">
          <div className="fixed inset-0 pointer-events-none">
            {highlightRect ? (
              <>
                <div className="fixed bg-black/58 pointer-events-none" style={{ top: 0, left: 0, right: 0, height: `${highlightRect.top}px` }} />
                <div className="fixed bg-black/58 pointer-events-none" style={{ top: `${highlightRect.top}px`, left: 0, width: `${highlightRect.left}px`, height: `${highlightRect.height}px` }} />
                <div className="fixed bg-black/58 pointer-events-none" style={{ top: `${highlightRect.top}px`, left: `${highlightRect.left + highlightRect.width}px`, right: 0, height: `${highlightRect.height}px` }} />
                <div className="fixed bg-black/58 pointer-events-none" style={{ top: `${highlightRect.top + highlightRect.height}px`, left: 0, right: 0, bottom: 0 }} />
              </>
            ) : (
              <div className="fixed inset-0 bg-black/58 pointer-events-none" />
            )}
          </div>
          <div className={`pointer-events-auto fixed ${tutorialCardPositionClass} w-full max-w-xl rounded-2xl border border-panel-border bg-panel-bg shadow-2xl`}>
            <div className="px-6 py-4 border-b border-panel-border flex items-center justify-between gap-4">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-text-tertiary">{progressLabel}</p>
              <button
                type="button"
                className="text-sm text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
                onClick={closeTutorial}
              >
                Close
              </button>
            </div>

            <div className="px-6 py-5 space-y-3">
              <h2 className="text-2xl font-bold text-heading">{step.title}</h2>
              <p className="text-sm leading-relaxed text-text-secondary">{step.body}</p>

              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  type="button"
                  onClick={goBack}
                  className="px-4 py-2 rounded-xl border border-panel-border-strong text-sm font-semibold text-text-secondary hover:text-text-primary hover:bg-hover-bg cursor-pointer"
                >
                  Back
                </button>

                {step.secondaryCta && (
                  <button
                    type="button"
                    onClick={handleSecondary}
                    className="px-4 py-2 rounded-xl border border-panel-border-strong text-sm font-semibold text-text-secondary hover:text-text-primary hover:bg-hover-bg cursor-pointer"
                  >
                    {step.secondaryCta}
                  </button>
                )}

                <button
                  type="button"
                  onClick={handlePrimary}
                  disabled={primaryDisabled}
                  className="ml-auto px-4 py-2 rounded-xl bg-button-bg text-button-text text-sm font-semibold hover:bg-button-hover transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {step.primaryCta}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </TutorialContext.Provider>
  );
}
