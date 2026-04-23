"use client";

import { useState } from "react";

const faqs = [
  {
    q: "Is Hoos\u2019 Plan free?",
    a: "Yes, completely free. No account required to browse, but you\u2019ll need to sign up to save plans and post on the forum.",
  },
  {
    q: "How do I save a plan?",
    a: "Plans are saved automatically as you build them. Just make sure you\u2019re signed in.",
  },
  {
    q: "Can I share my plan publicly?",
    a: "Yes \u2014 when creating or editing a plan, you can attach it to a forum post so other students can view and comment on it.",
  },
  {
    q: "What does Anonymous Mode do?",
    a: 'When enabled in Settings, your name is hidden on all your forum posts and they appear as \u201cAnonymous User.\u201d You can also post anonymously on a per-post basis even without enabling this.',
  },
  {
    q: "Who built this?",
    a: "Hoos\u2019 Plan was built by Avery Li, John Kim, Joshua Yoo, Kazuo Shinozaki, and Nehal Elango \u2014 a group of UVA students.",
  },
];

export default function FaqAccordion() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <div className="flex flex-col gap-2">
      {faqs.map((item, i) => {
        const isOpen = openIndex === i;
        return (
          <div key={item.q} className="bg-panel-bg border border-panel-border rounded-2xl overflow-hidden">
            <button
              type="button"
              onClick={() => setOpenIndex(isOpen ? null : i)}
              className="w-full flex items-center justify-between px-5 py-4 text-left cursor-pointer"
            >
              <span className="text-sm font-semibold text-text-primary">{item.q}</span>
              <svg
                width="16" height="16" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                className={`shrink-0 text-text-tertiary transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
            {isOpen && (
              <div className="px-5 pb-4 text-sm text-text-secondary leading-relaxed">
                {item.a}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
