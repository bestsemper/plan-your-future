"use client";

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { createForumPost, getForumPageData } from '../../actions';

export default function ForumQuestionsPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [plans, setPlans] = useState<Array<{ id: string; title: string }>>([]);
  const [canPost, setCanPost] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);

  const [questionTitle, setQuestionTitle] = useState('');
  const [questionBody, setQuestionBody] = useState('');
  const [attachedPlanId, setAttachedPlanId] = useState('');
  const [isPlanDropdownOpen, setIsPlanDropdownOpen] = useState(false);
  const [hoveredPlanId, setHoveredPlanId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await getForumPageData();
      setPlans(res.plans);
      setCanPost(res.canPost);
      setDataLoaded(true);
    })();
  }, []);

  const selectedPlanLabel = attachedPlanId
    ? plans.find((plan) => plan.id === attachedPlanId)?.title || 'Attach plan'
    : 'No plan attached';

  const handleCreateQuestion = () => {
    setError(null);

    startTransition(async () => {
      const res = await createForumPost(questionTitle, questionBody, attachedPlanId || undefined);
      if (res?.error) {
        setError(res.error);
        return;
      }

      router.push('/forum');
      router.refresh();
    });
  };

  if (!dataLoaded) {
    return (
      <div className="w-full pt-0 pb-6 animate-pulse">
        <div className="mb-6 flex items-center justify-between gap-3 border-b border-panel-border pb-4">
          <div className="h-10 w-48 rounded bg-input-disabled" />
          <div className="h-9 w-28 rounded bg-input-disabled" />
        </div>
        <div className="bg-panel-bg border border-panel-border rounded-xl p-5 space-y-3">
          <div className="h-11 w-full rounded-xl bg-input-disabled" />
          <div className="h-32 w-full rounded-xl bg-input-disabled" />
          <div className="h-11 w-full rounded-xl bg-input-disabled" />
          <div className="h-10 w-28 rounded-xl bg-input-disabled" />
        </div>
      </div>
    );
  }

  return (
    <div className="w-full pt-0 pb-6">
      <div className="mb-6 flex items-center justify-between gap-3 border-b border-panel-border pb-4">
        <div>
          <h1 className="text-3xl font-bold text-heading">Ask a Question</h1>
          <p className="mt-1 text-sm text-text-secondary">Start a new thread for advice, planning help, or course feedback.</p>
        </div>
        <Link
          href="/forum"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-uva-blue hover:text-uva-orange transition-colors"
        >
          Back to Forum
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-4 h-4 rotate-180"
            aria-hidden="true"
          >
            <path d="m9 18 6-6-6-6" />
          </svg>
        </Link>
      </div>

      <div className="bg-panel-bg border border-panel-border rounded-xl p-5">
        {!canPost && (
          <p className="mb-4 text-sm text-text-secondary">Log in to ask questions, reply, and vote.</p>
        )}

        {error && (
          <div className="mb-4 bg-red-500/10 border border-red-500/40 text-red-500 px-4 py-2 rounded-xl text-sm font-semibold">
            {error}
          </div>
        )}

        <div className="space-y-3">
          <input
            type="text"
            value={questionTitle}
            onChange={(e) => setQuestionTitle(e.target.value)}
            placeholder="Question title"
            className="w-full p-3 border border-panel-border rounded-xl bg-input-bg text-text-primary outline-none"
            disabled={!canPost || isPending}
          />
          <textarea
            value={questionBody}
            onChange={(e) => setQuestionBody(e.target.value)}
            placeholder="Ask your question or share the context people need to help"
            rows={6}
            className="w-full p-3 border border-panel-border rounded-xl bg-input-bg text-text-primary outline-none"
            disabled={!canPost || isPending}
          />
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setIsPlanDropdownOpen((prev) => !prev);
                setHoveredPlanId(null);
              }}
              onBlur={() =>
                setTimeout(() => {
                  setIsPlanDropdownOpen(false);
                  setHoveredPlanId(null);
                }, 150)
              }
              className="w-full px-4 py-2.5 border border-panel-border rounded-xl bg-input-bg text-text-primary text-left cursor-pointer flex items-center justify-between focus:outline-none hover:border-panel-border-strong transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={!canPost || isPending}
            >
              <span className="truncate text-sm font-medium">{selectedPlanLabel}</span>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`w-4 h-4 ml-2 shrink-0 text-text-secondary transition-transform duration-200 ${isPlanDropdownOpen ? 'rotate-180' : ''}`}
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>

            {isPlanDropdownOpen && canPost && !isPending && (
              <div className="absolute z-10 w-full mt-1.5 bg-panel-bg border border-panel-border rounded-xl shadow-lg overflow-hidden">
                <div className="max-h-48 overflow-y-auto p-1.5 space-y-0.5">
                  <div
                    onMouseEnter={() => setHoveredPlanId('__none__')}
                    onMouseLeave={() => setHoveredPlanId(null)}
                    className={`px-3 py-2 text-sm cursor-pointer rounded-lg transition-colors flex items-center justify-between gap-2 ${attachedPlanId === '' ? 'bg-uva-blue/10 text-uva-blue font-semibold' : 'text-text-primary hover:bg-hover-bg'}`}
                    onClick={() => {
                      setAttachedPlanId('');
                      setHoveredPlanId(null);
                      setIsPlanDropdownOpen(false);
                    }}
                  >
                    <span>No plan attached</span>
                    {attachedPlanId === '' && (
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 shrink-0 text-uva-blue"><polyline points="20 6 9 17 4 12" /></svg>
                    )}
                  </div>
                  {plans.map((plan) => (
                    <div
                      key={plan.id}
                      onMouseEnter={() => setHoveredPlanId(plan.id)}
                      onMouseLeave={() => setHoveredPlanId(null)}
                      className={`px-3 py-2 text-sm cursor-pointer rounded-lg transition-colors flex items-center justify-between gap-2 ${attachedPlanId === plan.id ? 'bg-uva-blue/10 text-uva-blue font-semibold' : 'text-text-primary hover:bg-hover-bg'}`}
                      onClick={() => {
                        setAttachedPlanId(plan.id);
                        setHoveredPlanId(null);
                        setIsPlanDropdownOpen(false);
                      }}
                    >
                      <span className="truncate">Attach: {plan.title}</span>
                      {attachedPlanId === plan.id && (
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 shrink-0 text-uva-blue"><polyline points="20 6 9 17 4 12" /></svg>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={handleCreateQuestion}
            disabled={!canPost || isPending}
            className="px-4 py-2 bg-uva-orange/90 text-white rounded-xl hover:bg-uva-orange font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending ? 'Posting...' : 'Ask Question'}
          </button>
        </div>
      </div>
    </div>
  );
}