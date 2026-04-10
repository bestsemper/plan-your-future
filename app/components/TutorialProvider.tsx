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
import { Icon } from "./Icon";

const TUTORIAL_VERSION = "v3";
const STORAGE_PREFIX = `hoos-plan:tutorial:${TUTORIAL_VERSION}`;
const STORAGE_SEEN_KEY = `${STORAGE_PREFIX}:seen`;
const STORAGE_COMPLETED_KEY = `${STORAGE_PREFIX}:completed`;
const STORAGE_STEP_KEY = `${STORAGE_PREFIX}:current-step`;

type FeatureId = "welcome" | "audit" | "plan" | "courses" | "prereq" | "forum" | "finish";

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
    targetSelector: '[data-tutorial-target="audit-import-container"]',
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
    primaryCta: "Waiting for selection",
    secondaryCta: "Skip",
    route: "/plan",
    targetSelector: '[data-tutorial-target="plan-import-container"]',
    progressEvents: ["planImportFileSelected"],
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
    title: "Find a class",
    body: "Click the search box and type any course name to search.",
    primaryCta: "Waiting for click",
    secondaryCta: "Skip",
    route: "/courses",
    targetSelector: '[data-tutorial-target="courses-search-input"]',
    advanceOnTargetClick: true,
  },
  {
    id: "courses_select_specific_class",
    featureId: "courses",
    title: "Open a class",
    body: "Select any course from the dropdown to view its details and requirements.",
    primaryCta: "Waiting for selection",
    secondaryCta: "Skip",
    route: "/courses",
    targetSelector: '[data-tutorial-target="courses-search-input"]',
    progressEvents: ["courseSearchSelected"],
  },
  {
    id: "courses_open_add_to_plan",
    featureId: "courses",
    title: "Start Add to Plan",
    body: "Click Add to Plan in the course details panel.",
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
    primaryCta: "Waiting for selection",
    secondaryCta: "Skip",
    route: "/courses",
    targetSelector: '[data-tutorial-target="courses-plan-select"]',
    progressEvents: ["coursePlanSelected"],
  },
  {
    id: "courses_choose_semester",
    featureId: "courses",
    title: "Choose a semester",
    body: "Click Select semester and pick the term for CS 2100.",
    primaryCta: "Waiting for selection",
    secondaryCta: "Skip",
    route: "/courses",
    targetSelector: '[data-tutorial-target="courses-semester-select"]',
    progressEvents: ["courseSemesterSelected"],
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
    body: "Click Search courses in tree and type any course name to search.",
    primaryCta: "Waiting for click",
    secondaryCta: "Skip",
    route: "/prerequisites",
    targetSelector: '[data-tutorial-target="prereq-tree-course-search"]',
    advanceOnTargetClick: true,
  },
  {
    id: "prereq_tree_select_course",
    featureId: "prereq",
    title: "Open class details",
    body: "Choose a course from the search results to view prerequisites, corequisites, and what it unlocks.",
    primaryCta: "Waiting for selection",
    secondaryCta: "Skip",
    route: "/prerequisites",
    targetSelector: '[data-tutorial-target="prereq-tree-course-search"]',
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
    body: "Click Sort by and select an option to switch between recent activity and highest-upvoted posts.",
    primaryCta: "Waiting for selection",
    secondaryCta: "Skip",
    route: "/forum",
    targetSelector: '[data-tutorial-target="forum-sort-button"]',
    progressEvents: ["forumSortSelected"],
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
    id: "forum_question_created",
    featureId: "forum",
    title: "Ask a Question",
    body: "You can now write a question, add tags, and attach your plan. When done, click Post.",
    primaryCta: "Done",
    route: "/forum/questions",
  },

  {
    id: "finish",
    featureId: "finish",
    title: "Tutorial complete",
    body: "You are set. Reopen this tutorial anytime from Help in the sidebar.",
    primaryCta: "Done",
    secondaryCta: "Restart",
    route: "/forum/questions",
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
  "prereq_tree_select_course",
  "prereq_info",
  "forum_feature",
  "forum_search",
  "forum_sort",
  "forum_ask_question",
  "forum_question_created",
  "finish",
] as const;

// First step of each feature — used by Back to jump to the start of the previous feature
const featureFirstStepId: Partial<Record<FeatureId, string>> = {
  welcome: "welcome",
  audit: "audit_open_account_menu",
  plan: "plan_nav",
  courses: "courses_feature",
  prereq: "prereq_feature",
  forum: "forum_feature",
  finish: "finish",
};

const featureSkipTarget: Partial<Record<FeatureId, string>> = {
  audit: "plan_nav",
  plan: "courses_feature",
  courses: "prereq_feature",
  prereq: "forum_feature",
  forum: "forum_question_created",
};

const orderedFeatureIds: FeatureId[] = ["welcome", "audit", "plan", "courses", "prereq", "forum", "finish"];

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
    target.classList.add("tutorial-target-elevated");
    return;
  }

  target.classList.remove("tutorial-target-elevated");
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
  const [highlightRect, setHighlightRect] = useState<{ top: number; left: number; width: number; height: number; borderRadius: number } | null>(null);
  const lastDispatchKeyRef = useRef<string>("");
  const highlightedElementRef = useRef<HTMLElement | null>(null);
  const isOpenRef = useRef(false);

  useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);

  const step = stepById[currentStepId];

  useEffect(() => {
    lastDispatchKeyRef.current = "";
  }, [currentStepId]);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    const hasSeen = loadStorageFlag(STORAGE_SEEN_KEY);
    if (!hasSeen && pathname === "/" && window.innerWidth >= 1024) {
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
    if (!isOpenRef.current) {
      return;
    }

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

    const targetRect = target.getBoundingClientRect();

    // Note: emitHighlight with border-radius is called later after calculating the radius
    highlightedElementRef.current = target;

    if (shouldScroll) {
      target.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    }

    // Expand highlight to include any open dropdown content inside the target
    let highlightTarget = targetRect;
    const dropdownContents = Array.from(target.querySelectorAll("[data-tutorial-dropdown-content]")) as HTMLElement[];
    for (const dropdownContent of dropdownContents) {
      const dr = dropdownContent.getBoundingClientRect();
      if (dr.width > 0 && dr.height > 0) {
        const uTop = Math.min(highlightTarget.top, dr.top);
        const uLeft = Math.min(highlightTarget.left, dr.left);
        const uRight = Math.max(highlightTarget.right, dr.right);
        const uBottom = Math.max(highlightTarget.bottom, dr.bottom);
        highlightTarget = { top: uTop, left: uLeft, right: uRight, bottom: uBottom, width: uRight - uLeft, height: uBottom - uTop } as DOMRect;
      }
    }

    // Find the effective border-radius for the element being highlighted
    const getRadius = (el: HTMLElement) => {
      const style = window.getComputedStyle(el);
      // Check all four corners and return the maximum (in case they're different)
      const topLeft = parseFloat(style.borderTopLeftRadius) || 0;
      const topRight = parseFloat(style.borderTopRightRadius) || 0;
      const bottomRight = parseFloat(style.borderBottomRightRadius) || 0;
      const bottomLeft = parseFloat(style.borderBottomLeftRadius) || 0;
      return Math.max(topLeft, topRight, bottomRight, bottomLeft);
    };
    
    let computedRadius = getRadius(target);
    if (computedRadius === 0) {
      // Try to find a child element with rounded styling
      const firstChild = target.querySelector("input[class*='rounded'], button[class*='rounded'], a[class*='rounded'], div[class*='rounded']") as HTMLElement | null;
      if (firstChild) computedRadius = getRadius(firstChild);
    }
    if (computedRadius === 0) {
      // Fallback: look for any input or button child
      const firstChild = target.querySelector("input, button, a") as HTMLElement | null;
      if (firstChild) computedRadius = getRadius(firstChild);
    }
    
    const padding = 8;
    const paddedHeight = highlightTarget.height + padding * 2;
    const paddedWidth = highlightTarget.width + padding * 2;
    const paddedHalfSize = Math.min(paddedWidth, paddedHeight) / 2;

    // Use the ORIGINAL target rect (not expanded) for roundedness detection so that
    // including a tall dropdown never inflates the half-size and creates a circle.
    const dropdownExpanded = highlightTarget !== (targetRect as DOMRect);
    const originalHalfSize = Math.min(targetRect.width, targetRect.height) / 2;
    const isFullyRounded = !dropdownExpanded && computedRadius >= originalHalfSize * 0.95;

    // Clamp radius to 32 so a rounded-full child (border-radius: 9999px) in the else
    // branch can never push svgRadius up to paddedHalfSize and create a circle.
    const clampedRadius = Math.min(computedRadius, 32);

    let svgRadius: number;
    if (isFullyRounded) {
      svgRadius = paddedHalfSize;
    } else if (dropdownExpanded) {
      // When the dropdown is included, use the element's actual radius so the combined
      // rect doesn't look over-rounded relative to the original element.
      svgRadius = clampedRadius;
    } else {
      svgRadius = clampedRadius + 8;
    }

    if (highlightedElementRef.current) {
      emitHighlight(highlightedElementRef.current, true);
    }

    setHighlightRect({
      top: Math.max(0, highlightTarget.top - padding),
      left: Math.max(0, highlightTarget.left - padding),
      width: paddedWidth,
      height: paddedHeight,
      borderRadius: svgRadius,
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
    // Always clear the old highlight when step changes
    emitHighlight(highlightedElementRef.current, false);
    highlightedElementRef.current = null;
    setHighlightRect(null);

    if (!isOpen || !step?.targetSelector) {
      return;
    }

    const selector = step.targetSelector;

    const applyHighlight = () => {
      applyHighlightToTarget(selector);
    };

    // Delay the initial highlight to let the page/modal settle before measuring position.
    const initialTimer = window.setTimeout(() => {
      applyHighlightToTarget(selector, true);
    }, 200);

    // Keep retrying while the step is active so highlights appear after async UI renders.
    const highlightRetryInterval = window.setInterval(applyHighlight, 400);

    window.addEventListener("resize", applyHighlight);
    window.addEventListener("scroll", applyHighlight, true);
    document.addEventListener("visibilitychange", applyHighlight);
    window.addEventListener("focus", applyHighlight);

    return () => {
      window.clearTimeout(initialTimer);
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

  const dispatchClosePopups = () => {
    window.dispatchEvent(new CustomEvent("tutorial:close-popups"));
  };

  const goBack = () => {
    if (!step) return;

    const currentFeature = step.featureId;
    const currentFeatureIndex = orderedFeatureIds.indexOf(currentFeature);

    // If we're at the very first feature, nothing to go back to
    if (currentFeatureIndex <= 0) return;

    // Jump to the first step of the previous feature
    const prevFeature = orderedFeatureIds[currentFeatureIndex - 1];
    const prevFirstStep = featureFirstStepId[prevFeature];
    if (!prevFirstStep) return;

    dispatchClosePopups();
    goToStep(prevFirstStep);
  };

  const handlePrimary = () => {
    if (!step) {
      return;
    }

    if (step.id === "welcome") {
      goToStep("audit_open_account_menu");
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

    if (step.id === "finish") {
      startTutorial();
      return;
    }

    // Feature-level skip: jump directly to the next feature section
    const skipTarget = featureSkipTarget[step.featureId];
    if (skipTarget) {
      dispatchClosePopups();
      goToStep(skipTarget);
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
  const tutorialCardPositionClass = "bottom-4 right-4 lg:bottom-6 lg:right-6";

  return (
    <TutorialContext.Provider value={contextValue}>
      {children}
      {isAuthenticated && isOpen && step && (
        <div className="hidden lg:block fixed inset-0 z-[90] pointer-events-none" role="dialog" aria-modal="false" aria-label="App tutorial" style={{ width: "100vw", height: "100vh" }}>
          {/* Spotlight overlay using SVG mask for rounded cutout */}
          <svg
            className="fixed inset-0 pointer-events-none"
            style={{ width: "100vw", height: "100vh" }}
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <mask id="tutorial-spotlight-mask">
                <rect width="100%" height="100%" fill="white" />
                {highlightRect && (
                  <rect
                    x={highlightRect.left}
                    y={highlightRect.top}
                    width={highlightRect.width}
                    height={highlightRect.height}
                    rx={highlightRect.borderRadius}
                    ry={highlightRect.borderRadius}
                    fill="black"
                  />
                )}
              </mask>
            </defs>
            <rect width="100%" height="100%" fill="rgba(0,0,0,0.58)" mask="url(#tutorial-spotlight-mask)" />
            {highlightRect && (
              <g className="tutorial-spotlight-ring">
                {/* Outer glow */}
                <rect
                  x={highlightRect.left}
                  y={highlightRect.top}
                  width={highlightRect.width}
                  height={highlightRect.height}
                  rx={highlightRect.borderRadius}
                  ry={highlightRect.borderRadius}
                  fill="none"
                  stroke="rgba(229,114,0,0.18)"
                  strokeWidth="12"
                />
                {/* Main orange ring */}
                <rect
                  x={highlightRect.left}
                  y={highlightRect.top}
                  width={highlightRect.width}
                  height={highlightRect.height}
                  rx={highlightRect.borderRadius}
                  ry={highlightRect.borderRadius}
                  fill="none"
                  stroke="var(--color-uva-orange)"
                  strokeWidth="4"
                />
              </g>
            )}
          </svg>
          <div className={`pointer-events-auto fixed ${tutorialCardPositionClass} w-full max-w-xl rounded-3xl border border-panel-border bg-panel-bg shadow-2xl`}>
            <div className="px-6 py-4 border-b border-panel-border flex items-center justify-between gap-4">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-text-tertiary">{progressLabel}</p>
              <button
                type="button"
                className="inline-flex items-center justify-center text-text-primary/80 hover:text-text-primary transition-colors cursor-pointer"
                onClick={closeTutorial}
                aria-label="Close tutorial"
              >
                <Icon name="x" color="currentColor" width={22} height={22} />
              </button>
            </div>

            <div className="px-6 py-5 space-y-3">
              <h2 className="text-2xl font-bold text-heading">{step.title}</h2>
              <p className="text-sm leading-relaxed text-text-secondary">{step.body}</p>

              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  type="button"
                  onClick={goBack}
                  className="px-4 py-2 rounded-full border border-panel-border-strong text-sm font-semibold text-text-secondary hover:text-text-primary hover:bg-hover-bg cursor-pointer"
                >
                  Back
                </button>

                {step.secondaryCta && (
                  <button
                    type="button"
                    onClick={handleSecondary}
                    className="px-4 py-2 rounded-full border border-panel-border-strong text-sm font-semibold text-text-secondary hover:text-text-primary hover:bg-hover-bg cursor-pointer"
                  >
                    {step.secondaryCta}
                  </button>
                )}

                <button
                  type="button"
                  onClick={handlePrimary}
                  disabled={primaryDisabled}
                  className="ml-auto px-4 py-2 rounded-full bg-button-bg text-button-text text-sm font-semibold hover:bg-button-hover transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
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
