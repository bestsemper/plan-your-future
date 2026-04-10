"use client";

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { Icon } from '../../components/Icon';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem } from '../../components/DropdownMenu';
import { createForumPost, getForumPageData, getCurrentUser } from '../../actions';
import { getForumPostHref } from '../url';
import { FORUM_TAG_OPTIONS, filterTagsByQuery } from '@/app/utils/forumTags';

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
  const [error, setError] = useState<string | null>(null);

  // Anonymity and tags state
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagSearchQuery, setTagSearchQuery] = useState('');
  const [isTagDropdownOpen, setIsTagDropdownOpen] = useState(false);

  useEffect(() => {
    void (async () => {
      const res = await getForumPageData();
      const user = await getCurrentUser();
      setPlans(res.plans);
      setCanPost(res.canPost);
      if (user?.major && !selectedTags.includes(user.major)) {
        setSelectedTags([user.major]);
      }
      setDataLoaded(true);
    })();
  }, []);

  const selectedPlanLabel = attachedPlanId
    ? plans.find((plan) => plan.id === attachedPlanId)?.title || 'Attach plan'
    : 'No plan attached';

  const availableTags = FORUM_TAG_OPTIONS.filter(tag => !selectedTags.includes(tag));
  const filteredTags = filterTagsByQuery(availableTags, tagSearchQuery);

  const handleAddTag = (tag: string) => {
    if (!selectedTags.includes(tag)) {
      setSelectedTags([...selectedTags, tag]);
    }
    setTagSearchQuery('');
    setIsTagDropdownOpen(false);
  };

  const handleRemoveTag = (tag: string) => {
    setSelectedTags(selectedTags.filter(t => t !== tag));
  };

  const handleCreateQuestion = () => {
    setError(null);
    startTransition(async () => {
      const res = await createForumPost(
        questionTitle,
        questionBody,
        attachedPlanId || undefined,
        isAnonymous,
        selectedTags
      );
      if (res?.error) {
        setError(res.error);
        return;
      }
      if (res?.postNumber && res?.title) {
        router.push(getForumPostHref(res.postNumber, res.title));
      } else {
        router.push('/forum');
      }
      router.refresh();
    });
  };

  if (!dataLoaded) {
    return (
      <div className="w-full pt-0 pb-6 animate-pulse">
        <div className="mb-6 border-b border-panel-border pb-4 flex items-center justify-between gap-4">
          <div className="flex-1 min-w-0 space-y-2">
            <div className="h-9 w-48 rounded bg-input-disabled" />
            <div className="h-4 w-72 rounded bg-input-disabled" />
          </div>
          <div className="h-5 w-24 rounded bg-input-disabled shrink-0" />
        </div>
        <div className="space-y-3 bg-panel-bg rounded-3xl border border-panel-border p-4 pb-5 mb-4">
          <div className="h-11 w-full rounded-[20px] bg-input-disabled" />
          <div className="h-40 w-full rounded-[20px] bg-input-disabled" />
          <div className="h-5 w-36 rounded bg-input-disabled" />
          <div className="h-11 w-full rounded-[20px] bg-input-disabled" />
          <div className="h-11 w-full rounded-xl bg-input-disabled" />
          <div className="h-9 w-32 rounded-full bg-input-disabled" />
        </div>
      </div>
    );
  }

  return (
    <div className="w-full pt-0 pb-6">
      <div className="mb-6 border-b border-panel-border pb-4 flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h1 className="text-3xl font-bold text-heading">Ask a Question</h1>
          <p className="mt-1 text-sm text-text-secondary">Start a new thread for advice, planning help, or course feedback.</p>
        </div>
        <Link
          href="/forum"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-text-secondary hover:text-uva-orange transition-colors shrink-0"
        >
          <Icon name="arrow-left" color="currentColor" width={16} height={16} className="w-4 h-4" aria-hidden="true" />
          Back to Forum
        </Link>
      </div>

      <div className="bg-panel-bg rounded-3xl border border-panel-border p-4 pb-5 mb-4">
        {!canPost && (
          <p className="mb-4 text-sm text-text-secondary">Log in to ask questions, reply, and vote.</p>
        )}

        {error && (
          <div className="mb-4 bg-red-500/10 border border-red-500/40 text-red-500 px-4 py-2 rounded-xl text-sm font-semibold">
            {error}
          </div>
        )}

      <div className="space-y-4">
        {/* Title */}
        <input
          type="text"
          value={questionTitle}
          onChange={(e) => setQuestionTitle(e.target.value)}
          placeholder="Question title"
          className="w-full h-11 px-4 border border-panel-border rounded-[20px] bg-input-bg text-text-primary outline-none"
          disabled={!canPost || isPending}
        />

        {/* Body */}
        <div className="border border-panel-border rounded-[20px] bg-input-bg">
          <textarea
            value={questionBody}
            onChange={(e) => setQuestionBody(e.target.value)}
            placeholder="Ask your question or share the context people need to help"
            rows={6}
            className="w-full px-4 pt-3 pb-2 bg-transparent text-text-primary outline-none resize-none"
            disabled={!canPost || isPending}
          />
        </div>

        {/* Anonymous checkbox */}
        <label htmlFor="anonymous-checkbox" className={`flex items-center gap-2 select-none ${(!canPost || isPending) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
          <input
            type="checkbox"
            id="anonymous-checkbox"
            checked={isAnonymous}
            onChange={(e) => setIsAnonymous(e.target.checked)}
            disabled={!canPost || isPending}
            className="sr-only"
          />
          <div className={`w-4 h-4 shrink-0 rounded border flex items-center justify-center transition-colors ${isAnonymous ? 'bg-button-bg border-button-bg' : 'border-panel-border-strong'}`}>
            <Icon name="check" color="currentColor" width={10} height={10} className={`text-button-text transition-opacity ${isAnonymous ? 'opacity-100' : 'opacity-0'}`} />
          </div>
          <span className="text-sm font-medium text-text-primary">Post anonymously</span>
        </label>

        {/* Tags */}
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-2">Tags</label>

          {selectedTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {selectedTags.map((tag) => (
                <div
                  key={tag}
                  className="inline-flex items-center gap-1.5 bg-uva-orange/15 text-uva-orange px-2.5 py-1 rounded-full text-[11px] font-semibold select-none cursor-default"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(tag)}
                    disabled={!canPost || isPending}
                    className="inline-flex items-center justify-center cursor-pointer hover:opacity-70 transition-opacity disabled:cursor-not-allowed"
                    aria-label={`Remove ${tag}`}
                  >
                    <Icon name="x" color="currentColor" width={10} height={10} className="w-2.5 h-2.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <DropdownMenu
            isOpen={isTagDropdownOpen && filteredTags.length > 0}
            onOpenChange={setIsTagDropdownOpen}
            trigger={
              <input
                type="text"
                value={tagSearchQuery}
                onChange={(e) => {
                  setTagSearchQuery(e.target.value);
                  setIsTagDropdownOpen(true);
                }}
                onClick={() => setIsTagDropdownOpen(true)}
                placeholder="Search majors, minors, and topic tags"
                className="w-full h-11 px-4 border border-panel-border rounded-[20px] bg-input-bg text-text-primary outline-none text-sm"
                disabled={!canPost || isPending}
              />
            }
          >
            <DropdownMenuContent maxHeight="max-h-48">
              {filteredTags.map((tag) => (
                <DropdownMenuItem
                  key={tag}
                  onClick={() => handleAddTag(tag)}
                >
                  {tag}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Attach plan */}
        <DropdownMenu
          isOpen={isPlanDropdownOpen}
          onOpenChange={setIsPlanDropdownOpen}
          disabled={!canPost || isPending}
          trigger={
            <button
              type="button"
              disabled={!canPost || isPending}
              className="w-full sm:w-64 h-11 px-4 border border-panel-border rounded-xl bg-input-bg text-text-primary text-left cursor-pointer flex items-center justify-between focus:outline-none hover:border-panel-border-strong transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="truncate text-sm font-medium min-w-0">{selectedPlanLabel}</span>
              <Icon name="chevron-down" color="currentColor" width={16} height={16} className={`w-4 h-4 ml-2 shrink-0 text-text-secondary transition-transform duration-200 ${isPlanDropdownOpen ? 'rotate-180' : ''}`} />
            </button>
          }
        >
          <DropdownMenuContent>
            <DropdownMenuItem selected={attachedPlanId === ''} onClick={() => { setAttachedPlanId(''); setIsPlanDropdownOpen(false); }}>
              No plan attached
            </DropdownMenuItem>
            {plans.map((plan) => (
              <DropdownMenuItem
                key={plan.id}
                selected={attachedPlanId === plan.id}
                onClick={() => { setAttachedPlanId(plan.id); setIsPlanDropdownOpen(false); }}
              >
                Attach: {plan.title}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Submit */}
        <button
          type="button"
          onClick={handleCreateQuestion}
          disabled={!canPost || isPending}
          className="h-9 px-5 bg-button-bg text-button-text rounded-full hover:bg-button-hover font-semibold text-sm transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? 'Posting...' : 'Ask Question'}
        </button>
      </div>
      </div>
    </div>
  );
}
