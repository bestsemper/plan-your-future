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
  const [userMajor, setUserMajor] = useState<string | null>(null);

  const [questionTitle, setQuestionTitle] = useState('');
  const [questionBody, setQuestionBody] = useState('');
  const [attachedPlanId, setAttachedPlanId] = useState('');
  const [isPlanDropdownOpen, setIsPlanDropdownOpen] = useState(false);
  const [hoveredPlanId, setHoveredPlanId] = useState<string | null>(null);
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
      setUserMajor(user?.major ?? null);
      // Auto-add user's major to tags if they have one
      if (user?.major && !selectedTags.includes(user.major)) {
        setSelectedTags([user.major]);
      }
      setDataLoaded(true);
    })();
  }, []);

  const selectedPlanLabel = attachedPlanId
    ? plans.find((plan) => plan.id === attachedPlanId)?.title || 'Attach plan'
    : 'No plan attached';

  // Filter available tags (exclude already selected ones)
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

      // Navigate to the newly created post
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
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-text-secondary hover:text-uva-orange transition-colors"
        >
          <Icon name="arrow-right" color="currentColor" width={16} height={16} className="w-4 h-4 rotate-180" aria-hidden="true" />
          Back to Forum
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

          {/* Anonymity Checkbox */}
          <div className="flex items-center gap-2.5 pt-2">
            <input
              type="checkbox"
              id="anonymous-checkbox"
              checked={isAnonymous}
              onChange={(e) => setIsAnonymous(e.target.checked)}
              disabled={!canPost || isPending}
              className="w-4 h-4 rounded cursor-pointer"
            />
            <label htmlFor="anonymous-checkbox" className="text-sm font-medium text-text-primary cursor-pointer">
              Post anonymously
            </label>
          </div>

          {/* Tags Section */}
          <div className="pt-1">
            <label className="block text-sm font-medium text-text-primary mb-2">Tags</label>
            
            {/* Selected tags */}
            {selectedTags.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {selectedTags.map((tag) => (
                  <div
                    key={tag}
                    className="inline-flex items-center gap-2 bg-uva-orange/15 text-uva-orange px-3 py-1.5 rounded-lg text-sm font-medium"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      className="ml-1 hover:opacity-70 transition-opacity"
                      disabled={!canPost || isPending}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Tag search and dropdown */}
            <div className="relative">
              <input
                type="text"
                value={tagSearchQuery}
                onChange={(e) => {
                  setTagSearchQuery(e.target.value);
                  setIsTagDropdownOpen(true);
                }}
                onFocus={() => setIsTagDropdownOpen(true)}
                placeholder="Search majors, minors, and topic tags"
                className="w-full p-3 border border-panel-border rounded-xl bg-input-bg text-text-primary outline-none text-sm"
                disabled={!canPost || isPending}
              />
              
              {/* Tag suggestions dropdown */}
              {isTagDropdownOpen && filteredTags.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-panel-bg border border-panel-border rounded-xl shadow-lg z-50 max-h-48 overflow-y-auto">
                  {filteredTags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => handleAddTag(tag)}
                      className="w-full text-left px-4 py-2.5 hover:bg-input-bg text-sm text-text-primary transition-colors"
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DropdownMenu
            isOpen={isPlanDropdownOpen}
            onOpenChange={(open) => {
              setIsPlanDropdownOpen(open);
              if (!open) setHoveredPlanId(null);
            }}
            disabled={!canPost || isPending}
            trigger={
              <button
                type="button"
                disabled={!canPost || isPending}
                className="w-full px-4 py-2.5 border border-panel-border rounded-xl bg-input-bg text-text-primary text-left cursor-pointer flex items-center justify-between focus:outline-none hover:border-panel-border-strong transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="truncate text-sm font-medium min-w-0">{selectedPlanLabel}</span>
                <Icon name="chevron-down" color="currentColor" width={16} height={16} className={`w-4 h-4 ml-2 shrink-0 text-text-secondary transition-transform duration-200 ${isPlanDropdownOpen ? 'rotate-180' : ''}`} />
              </button>
            }
          >
            <DropdownMenuContent>
              <DropdownMenuItem
                selected={attachedPlanId === ''}
                onClick={() => {
                  setAttachedPlanId('');
                  setHoveredPlanId(null);
                  setIsPlanDropdownOpen(false);
                }}
              >
                No plan attached
              </DropdownMenuItem>
              {plans.map((plan) => (
                <DropdownMenuItem
                  key={plan.id}
                  selected={attachedPlanId === plan.id}
                  onClick={() => {
                    setAttachedPlanId(plan.id);
                    setHoveredPlanId(null);
                    setIsPlanDropdownOpen(false);
                  }}
                >
                  Attach: {plan.title}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
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