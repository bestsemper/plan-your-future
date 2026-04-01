"use client";

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/app/components/Icon';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem } from '@/app/components/DropdownMenu';
import { getForumPageData, voteOnForumPost } from '../actions';
import { useAttachedPlanModal } from '../components/AttachedPlan';
import { getForumPostHref } from './url';

type ForumAnswerItem = {
  id: string;
  body: string;
  createdAt: string;
  authorDisplayName: string;
  authorId: string;
  authorComputingId: string;
  voteScore: number;
  currentUserVote: 1 | -1 | 0;
};

type ForumPostItem = {
  id: string;
  currentUserPostVote: 1 | -1 | 0;
  postNumber: number;
  title: string;
  body: string;
  voteScore: number;
  voteCount: number;
  viewCount: number;
  createdAt: string;
  authorDisplayName: string;
  authorId: string;
  authorComputingId: string;
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
  const router = useRouter();
  const { openPlanModal } = useAttachedPlanModal();
  const [posts, setPosts] = useState<ForumPostItem[]>([]);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [isVoting, setIsVoting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'recent' | 'upvoted'>('recent');
  const [isSortDropdownOpen, setIsSortDropdownOpen] = useState(false);

  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement | null>(null);

  const loadData = async () => {
    const res = await getForumPageData();
    setPosts(res.posts);
    setDataLoaded(true);
  };

  useEffect(() => {
    void loadData();
  }, []);

  const filteredPosts = useMemo(() => {
    const term = appliedSearch.trim().toLowerCase();
    if (!term) return posts;

    return posts.filter((post) => {
      const inPost = `${post.title} ${post.body} ${post.authorDisplayName}`.toLowerCase().includes(term);
      const inReplies = post.answers.some((answer) =>
        `${answer.body} ${answer.authorDisplayName}`.toLowerCase().includes(term)
      );
      return inPost || inReplies;
    });
  }, [posts, appliedSearch]);

  const sortedPosts = useMemo(() => {
    const postsToSort = [...filteredPosts];

    if (sortBy === 'upvoted') {
      return postsToSort.sort(
        (a, b) => b.voteScore - a.voteScore || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    }

    return postsToSort.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [filteredPosts, sortBy]);

  const suggestedPosts = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return [];

    return posts
      .filter((post) => {
        const haystack = `${post.title} ${post.body} ${post.authorDisplayName}`.toLowerCase();
        return haystack.includes(term);
      })
      .slice(0, 6);
  }, [posts, search]);

  const showSuggestions = isSearchFocused && suggestedPosts.length > 0;

  const getOptimisticVoteUpdate = (currentVote: 1 | -1 | 0, clickedValue: 1 | -1) => {
    const nextVote: 1 | -1 | 0 = currentVote === clickedValue ? 0 : clickedValue;
    const scoreDelta = nextVote - currentVote;
    return { nextVote, scoreDelta };
  };

  const handlePostVote = (postId: string, value: 1 | -1) => {
    const targetPost = posts.find((post) => post.id === postId);
    if (!targetPost) return;

    setError(null);
    const previousVote = targetPost.currentUserPostVote;
    const { nextVote, scoreDelta } = getOptimisticVoteUpdate(previousVote, value);

    setPosts((prev) =>
      prev.map((post) =>
        post.id === postId
          ? {
              ...post,
              currentUserPostVote: nextVote,
              voteScore: post.voteScore + scoreDelta,
              voteCount: Math.max(0, post.voteCount + (previousVote === 0 && nextVote !== 0 ? 1 : previousVote !== 0 && nextVote === 0 ? -1 : 0)),
            }
          : post
      )
    );

    setIsVoting(true);
    (async () => {
      const res = await voteOnForumPost(postId, value);
      setIsVoting(false);

      if (res?.error) {
        setPosts((prev) =>
          prev.map((post) =>
            post.id === postId
              ? {
                  ...post,
                  currentUserPostVote: previousVote,
                  voteScore: post.voteScore - scoreDelta,
                  voteCount: Math.max(0, post.voteCount + (previousVote === 0 && nextVote !== 0 ? -1 : previousVote !== 0 && nextVote === 0 ? 1 : 0)),
                }
              : post
          )
        );
        setError(res.error);
      }
    })();
  };

  const handleOpenAttachedPlan = (planId: string) => {
    setError(null);
    openPlanModal(planId, (message) => setError(message));
  };

  if (!dataLoaded) {
    return (
      <div className="w-full pt-0 pb-6 animate-pulse overflow-x-hidden">
        <div className="mb-6 border-b border-panel-border pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="h-9 w-64 rounded bg-input-disabled" />
          <div className="flex items-center gap-3 w-full lg:w-auto lg:min-w-[460px]">
            <div className="h-10 flex-1 rounded bg-input-disabled" />
            <div className="h-[42px] w-28 shrink-0 rounded bg-input-disabled" />
          </div>
        </div>

        <div className="mb-6">
          <div className="h-12 w-full rounded-xl bg-input-disabled" />
        </div>

        <div className="space-y-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="bg-panel-bg border border-panel-border p-5 rounded-xl flex gap-4">
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
    <div className="w-full pt-0 pb-6 overflow-x-hidden">
      <div className="mb-6 border-b border-panel-border pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-3xl font-bold text-heading">Forum</h1>
        <div className="flex items-center gap-3 w-full lg:w-auto lg:min-w-[460px]">
          <div
            ref={searchContainerRef}
            className="relative flex-1"
            onBlur={(e) => {
              if (!searchContainerRef.current?.contains(e.relatedTarget as Node | null)) {
                setIsSearchFocused(false);
              }
            }}
          >
            <span className="sr-only">Search the forum</span>
            <Icon
              name="search"
              color="currentColor"
              width={16}
              height={16}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onFocus={() => setIsSearchFocused(true)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setAppliedSearch(search);
                  setIsSearchFocused(false);
                }
              }}
              placeholder="Search the forum"
              className="w-full h-[42px] pl-10 pr-4 border border-panel-border rounded-full bg-input-bg text-text-primary outline-none"
            />

            {showSuggestions && (
              <div className="absolute left-0 right-0 mt-2 z-30 rounded-xl border border-panel-border bg-panel-bg shadow-lg overflow-hidden">
                {suggestedPosts.map((post) => (
                  <Link
                    key={post.id}
                    href={getForumPostHref(post.postNumber, post.title)}
                    className="block px-4 py-3 border-b border-panel-border last:border-b-0 hover:bg-hover-bg transition-colors"
                  >
                    <p className="text-sm font-semibold text-heading line-clamp-1">{post.title}</p>
                    <p className="text-xs text-text-secondary mt-0.5 line-clamp-1">
                      by {post.authorDisplayName}
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <Link
            href="/forum/questions"
            className="h-[42px] px-5 inline-flex items-center justify-center bg-button-bg text-button-text rounded-full hover:bg-button-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-button-bg/20 font-semibold transition-colors cursor-pointer whitespace-nowrap"
          >
            Ask Question
          </Link>
        </div>
      </div>

      <div className="mb-4 flex items-center justify-end">
        <div className="text-sm">
          <DropdownMenu
            isOpen={isSortDropdownOpen}
            onOpenChange={setIsSortDropdownOpen}
            align="right"
            trigger={
              <button
                type="button"
                className="inline-flex items-center gap-2 px-3 py-2 border border-panel-border rounded-xl bg-input-bg text-text-primary cursor-pointer hover:border-panel-border-strong transition-colors"
              >
                <span>Sort: {sortBy === 'recent' ? 'Most Recent' : 'Highest Upvoted'}</span>
                <Icon name="chevron-down" color="currentColor" width={16} height={16} className={`w-4 h-4 text-text-secondary transition-transform duration-200 ${isSortDropdownOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
              </button>
            }
          >
            <DropdownMenuContent className="w-48">
              <DropdownMenuItem
                selected={sortBy === 'recent'}
                onClick={() => {
                  setSortBy('recent');
                  setIsSortDropdownOpen(false);
                }}
              >
                Most Recent
              </DropdownMenuItem>
              <DropdownMenuItem
                selected={sortBy === 'upvoted'}
                onClick={() => {
                  setSortBy('upvoted');
                  setIsSortDropdownOpen(false);
                }}
              >
                Highest Upvoted
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {error && (
        <div className="mb-4 bg-red-500/10 border border-red-500/40 text-red-500 px-4 py-2 rounded-xl text-sm font-semibold">
          {error}
        </div>
      )}

      <div className="space-y-4">
        {sortedPosts.map((post) => {
          const postHref = getForumPostHref(post.postNumber, post.title);

          return (
            <article
              key={post.id}
              role="link"
              tabIndex={0}
              onClick={() => router.push(postHref)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  router.push(postHref);
                }
              }}
              className="bg-panel-bg border border-panel-border p-5 rounded-xl cursor-pointer hover:border-panel-border-strong transition-colors"
            >
              <div className="grid grid-cols-[40px_minmax(0,1fr)] gap-4 items-start">
                <div
                  className="inline-flex flex-col items-center gap-1 pt-0.5"
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => event.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={() => handlePostVote(post.id, 1)}
                    disabled={isVoting}
                    aria-label="Like post"
                    className={`inline-flex items-center justify-center w-8 h-8 rounded-full border transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                      post.currentUserPostVote === 1
                        ? 'border-uva-orange text-uva-orange bg-badge-orange-bg'
                        : 'border-panel-border text-text-secondary hover:bg-hover-bg'
                    }`}
                  >
                    <Icon name="chevron-up" color="currentColor" width={16} height={16} className="w-4 h-4" aria-hidden="true" />
                  </button>

                  <span className="min-w-8 text-center text-sm font-bold text-text-primary">{post.voteScore}</span>

                  <button
                    type="button"
                    onClick={() => handlePostVote(post.id, -1)}
                    disabled={isVoting}
                    aria-label="Unlike post"
                    className={`inline-flex items-center justify-center w-8 h-8 rounded-full border transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                      post.currentUserPostVote === -1
                        ? 'border-red-400 text-red-500 bg-red-500/10'
                        : 'border-panel-border text-text-secondary hover:bg-hover-bg'
                    }`}
                  >
                    <Icon name="chevron-down" color="currentColor" width={16} height={16} className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>

                <div className="min-w-0">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <h2 className="text-base font-semibold text-heading break-words">
                      {post.title}
                      <span className="ml-2 font-medium text-text-secondary">by {post.authorDisplayName}</span>
                    </h2>
                    <p className="text-xs text-text-tertiary whitespace-nowrap shrink-0">asked {formatRelativeTime(post.createdAt)}</p>
                  </div>

                  <p className="text-sm text-text-secondary break-words line-clamp-2">{post.body}</p>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-3 text-sm text-text-secondary">
                      <span><span className="font-semibold text-text-primary">{post.viewCount}</span> views</span>
                      <span><span className="font-semibold text-text-primary">{post.answers.length}</span> replies</span>
                    </div>

                    {post.attachedPlan && (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleOpenAttachedPlan(post.attachedPlan!.id);
                        }}
                        className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-input-disabled text-xs font-semibold text-text-secondary hover:bg-hover-bg transition-colors cursor-pointer"
                      >
                        <span className="uppercase tracking-wide text-[10px]">Attached Plan</span>
                        <span className="text-text-primary">{post.attachedPlan.title}</span>
                      </button>
                    )}
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
