"use client";

import { useState } from "react";

const faqs = [
  {
    q: "Why was this built?",
    a: "Hoos' Plan was built to complement Stellic, UVA's official course planning tool. While Stellic handles four-year planning well, students wanted more on top of that: a forum to share and discuss schedules, a prerequisite visualizer, and a faster, more intuitive course search. You can import your existing Stellic plan directly into Hoos' Plan to get started.",
  },
  {
    q: "Is Hoos' Plan free?",
    a: "Yes, completely free. You don't need an account to browse courses or the forum, but you'll need to sign up to save plans and post.",
  },
  {
    q: "How do I save a plan?",
    a: "Your plan saves automatically as you make changes. Just make sure you're signed in.",
  },
  {
    q: "Can I share my plan?",
    a: "Yes. You can attach a plan to a forum post so other students can view and comment on it.",
  },
  {
    q: "What does Anonymous Mode do?",
    a: "When turned on in Settings, your name is hidden on all forum posts and shows up as \"Anonymous User\" instead. You can also choose to post anonymously on individual posts without enabling the setting globally.",
  },
  {
    q: "Is my data private?",
    a: "Your password is hashed before it is stored and is never saved in plain text. Your email and profile information are only visible to other users based on the privacy settings you choose. You can set your profile to private, post anonymously, or delete your account and all associated data from the Settings page.",
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
