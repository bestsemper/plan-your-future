"use client";

import Link from 'next/link';
import { useEffect, useMemo, useState, useTransition } from 'react';
import {
  createForumPost,
  getForumPageData,
} from '../actions';
import { getForumPostHref } from './url';

type ForumAnswerItem = {
  id: string;
  body: string;
  createdAt: string;
  authorDisplayName: string;
  voteScore: number;
  currentUserVote: 1 | -1 | 0;
};

type ForumPostItem = {
  id: string;
  postNumber: number;
  title: string;
  body: string;
  voteScore: number;
  viewCount: number;
  createdAt: string;
  authorDisplayName: string;
  attachedPlan: { id: string; title: string } | null;
  answers: ForumAnswerItem[];
};

function formatRelativeTime(isoTimestamp: string): string {
  const created = new Date(isoTimestamp).getTime();
  const now = Date.now();
  const diffMs = Math.max(0, now - created);

  const minutes = Math.floor(diffMs / (1000 * 60));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min${minutes === 1 ? '' : 's'} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;

  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

export default function ForumPage() {
  const [isPending, startTransition] = useTransition();

  const [posts, setPosts] = useState<ForumPostItem[]>([]);
  const [plans, setPlans] = useState<Array<{ id: string; title: string }>>([]);
  const [canPost, setCanPost] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);

  const [search, setSearch] = useState('');
  const [newPostTitle, setNewPostTitle] = useState('');
  const [newPostBody, setNewPostBody] = useState('');
  const [attachedPlanId, setAttachedPlanId] = useState('');
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [isPlanDropdownOpen, setIsPlanDropdownOpen] = useState(false);
  const [hoveredPlanId, setHoveredPlanId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    const res = await getForumPageData();
    setPosts(res.posts);
    setPlans(res.plans);
    setCanPost(res.canPost);
    setDataLoaded(true);
  };

  useEffect(() => {
    void loadData();
  }, []);

  const selectedPlanLabel = attachedPlanId
    ? plans.find((plan) => plan.id === attachedPlanId)?.title || 'Attach plan'
    : 'No plan attached';

  const filteredPosts = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return posts;

    return posts.filter((post) => {
      const inPost = `${post.title} ${post.body} ${post.authorDisplayName}`.toLowerCase().includes(term);
      const inReplies = post.answers.some((answer) =>
        `${answer.body} ${answer.authorDisplayName}`.toLowerCase().includes(term)
      );
      return inPost || inReplies;
    });
  }, [posts, search]);

  const handleCreatePost = () => {
    setError(null);

    startTransition(async () => {
      const res = await createForumPost(newPostTitle, newPostBody, attachedPlanId || undefined);
      if (res?.error) {
        setError(res.error);
        return;
      }
      setNewPostTitle('');
      setNewPostBody('');
      setAttachedPlanId('');
      setIsComposerOpen(false);
      await loadData();
    });
  };

  if (!dataLoaded) {
    return (
      <div className="max-w-5xl mx-auto py-8 animate-pulse">
        <div className="mb-6 border-b border-panel-border pb-4 flex items-center justify-between gap-3">
          <div className="h-9 w-64 rounded bg-input-disabled" />
          <div className="h-10 w-28 rounded bg-input-disabled" />
        </div>

        <div className="mb-6">
          <div className="h-12 w-full rounded-md bg-input-disabled" />
        </div>

        <div className="space-y-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="bg-panel-bg border border-panel-border p-5 rounded-md flex gap-4">
              <div className="w-24 shrink-0 space-y-2">
                <div className="h-4 w-full rounded bg-input-disabled" />
                <div className="h-4 w-full rounded bg-input-disabled" />
                <div className="h-4 w-full rounded bg-input-disabled" />
              </div>
              <div className="flex-1 space-y-3">
                <div className="h-7 w-4/5 rounded bg-input-disabled" />
                <div className="h-4 w-1/2 rounded bg-input-disabled" />
                <div className="h-4 w-full rounded bg-input-disabled" />
                <div className="h-4 w-3/4 rounded bg-input-disabled" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto py-8">
      <div className="flex justify-between items-center mb-6 border-b border-panel-border pb-4">
        <h1 className="text-3xl font-bold text-heading">Community Forum</h1>
        <button
          type="button"
          onClick={() => setIsComposerOpen((prev) => !prev)}
          className="px-4 py-2 bg-uva-orange text-white rounded hover:bg-[#cc6600] font-semibold transition-colors cursor-pointer"
        >
          {isComposerOpen ? 'Close' : 'New Post'}
        </button>
      </div>

      <div className="mb-6">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search posts and replies..."
          className="w-full p-3 border border-panel-border rounded-md bg-input-bg text-text-primary outline-none"
        />
      </div>

      {isComposerOpen && (
        <div className="bg-panel-bg border border-panel-border rounded-md p-4 mb-6">
          <h2 className="text-lg font-bold text-heading mb-3">Create New Post</h2>
          {!canPost && (
            <p className="text-sm text-text-secondary mb-3">Log in to create posts, reply, and vote.</p>
          )}
          <div className="space-y-3">
            <input
              type="text"
              value={newPostTitle}
              onChange={(e) => setNewPostTitle(e.target.value)}
              placeholder="Post title"
              className="w-full p-3 border border-panel-border rounded-md bg-input-bg text-text-primary outline-none"
              disabled={!canPost || isPending}
            />
            <textarea
              value={newPostBody}
              onChange={(e) => setNewPostBody(e.target.value)}
              placeholder="Ask your question or share your advice"
              rows={4}
              className="w-full p-3 border border-panel-border rounded-md bg-input-bg text-text-primary outline-none"
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
                className="w-full p-3 border border-panel-border rounded-md bg-input-bg text-text-primary outline-none text-left cursor-pointer flex items-center justify-between disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!canPost || isPending}
              >
                <span>{selectedPlanLabel}</span>
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
                  className={`w-4 h-4 ml-2 transition-transform ${isPlanDropdownOpen ? 'rotate-180' : ''}`}
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>

              {isPlanDropdownOpen && canPost && !isPending && (
                <div className="absolute z-10 w-full mt-1 bg-panel-bg border border-panel-border-strong rounded-md max-h-48 overflow-y-auto">
                  <div
                    onMouseEnter={() => setHoveredPlanId('__none__')}
                    onMouseLeave={() => setHoveredPlanId(null)}
                    className={`px-3 py-2 text-sm cursor-pointer transition-colors ${attachedPlanId === '' && hoveredPlanId === null ? 'bg-uva-blue text-white' : 'text-text-primary hover:bg-uva-blue hover:text-white'}`}
                    onClick={() => {
                      setAttachedPlanId('');
                      setHoveredPlanId(null);
                      setIsPlanDropdownOpen(false);
                    }}
                  >
                    No plan attached
                  </div>
                  {plans.map((plan) => (
                    <div
                      key={plan.id}
                      onMouseEnter={() => setHoveredPlanId(plan.id)}
                      onMouseLeave={() => setHoveredPlanId(null)}
                      className={`px-3 py-2 text-sm cursor-pointer transition-colors ${attachedPlanId === plan.id && (hoveredPlanId === null || hoveredPlanId === plan.id) ? 'bg-uva-blue text-white' : 'text-text-primary hover:bg-uva-blue hover:text-white'}`}
                      onClick={() => {
                        setAttachedPlanId(plan.id);
                        setHoveredPlanId(null);
                        setIsPlanDropdownOpen(false);
                      }}
                    >
                      Attach: {plan.title}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={handleCreatePost}
              disabled={!canPost || isPending}
              className="px-4 py-2 bg-uva-orange text-white rounded hover:bg-[#cc6600] font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPending ? 'Posting...' : 'Post'}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4 bg-red-500/10 border border-red-500/40 text-red-500 px-4 py-2 rounded-md text-sm font-semibold">
          {error}
        </div>
      )}

      <div className="bg-panel-bg border border-panel-border rounded-md overflow-hidden">
        {filteredPosts.map((post) => {
          return (
            <article key={post.id} className="px-4 py-4 border-b border-panel-border last:border-b-0">
              <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-4 items-start">
                <div className="text-right text-sm text-text-secondary space-y-1 pt-0.5">
                  <p><span className="font-semibold text-text-primary mr-1">{post.voteScore}</span> votes</p>
                  <p><span className="font-semibold text-text-primary mr-1">{post.answers.length}</span> replies</p>
                  <p><span className="font-semibold text-text-primary mr-1">{post.viewCount}</span> views</p>
                </div>
                <div className="min-w-0">
                  <Link
                    href={getForumPostHref(post.postNumber, post.title)}
                    className="min-w-0 block text-left cursor-pointer"
                  >
                    <h2 className="text-lg font-semibold mb-1 text-uva-blue hover:underline break-words leading-snug">
                      {post.title}
                    </h2>
                    <p className="text-sm text-text-secondary mb-2 break-words line-clamp-2 leading-snug">
                      {post.body}
                    </p>
                  </Link>
                  <div className="flex items-center justify-between gap-3 mt-1">
                    <div>
                      {post.attachedPlan && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded bg-input-disabled text-xs font-semibold text-text-secondary">
                          {post.attachedPlan.title}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-text-tertiary whitespace-nowrap">
                      <span className="text-uva-blue font-semibold">{post.authorDisplayName}</span> asked {formatRelativeTime(post.createdAt)}
                    </p>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
