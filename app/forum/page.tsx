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
  isAnonymous: boolean;
  profileVisibility: string;
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
  isAnonymous: boolean;
  profileVisibility: string;
  tags: string[];
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
  const [isSearchDropdownOpen, setIsSearchDropdownOpen] = useState(false);

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

  const showSuggestions = isSearchDropdownOpen && suggestedPosts.length > 0;

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
      <div className="w-full pt-0 pb-6 animate-pulse">
        <div className="mb-6 border-b border-panel-border pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="h-9 w-64 rounded bg-input-disabled max-w-full" />
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full lg:w-auto lg:min-w-[460px] min-w-0">
            <div className="h-10 flex-1 min-w-[200px] rounded bg-input-disabled" />
            <div className="h-[42px] w-28 shrink-0 rounded-full bg-input-disabled" />
          </div>
        </div>

        <div className="mb-4 flex items-center justify-end">
          <div className="h-8 w-32 rounded bg-input-disabled" />
        </div>

        <div className="flex flex-col">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="flex flex-col">
              {i > 0 && <hr className="border-t border-panel-border m-0 p-0" />}
              <article className="p-4 mt-1 mb-1 rounded-2xl">
                <div className="flex flex-col min-w-0 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 sm:gap-3">
                    <div className="h-7 w-3/4 rounded bg-input-disabled" />
                    <div className="h-4 w-32 rounded bg-input-disabled sm:shrink-0 mt-1 sm:mt-0" />
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    <div className="h-6 w-16 rounded-full bg-input-disabled" />
                    <div className="h-6 w-20 rounded-full bg-input-disabled" />
                  </div>

                  <div className="space-y-2">
                    <div className="h-4 w-full rounded bg-input-disabled" />
                    <div className="h-4 w-5/6 rounded bg-input-disabled" />
                    <div className="h-4 w-4/5 rounded bg-input-disabled" />
                  </div>

                  <div className="flex flex-wrap-reverse items-center justify-between gap-3 pt-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="h-8 w-20 rounded-full bg-input-disabled" />
                      <div className="h-8 w-24 rounded-full bg-input-disabled" />
                    </div>
                    <div className="h-8 w-32 rounded-full bg-input-disabled" />
                  </div>
                </div>
              </article>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 pt-0">
      <div className="mb-4 border-b border-panel-border pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 min-w-0">
        <h1 className="text-3xl font-bold text-heading truncate min-w-0">Forum</h1>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full lg:w-auto lg:min-w-[460px] min-w-0">
          <div className="relative flex-1 min-w-[200px]">
            <DropdownMenu
              isOpen={showSuggestions}
              onOpenChange={setIsSearchDropdownOpen}
              trigger={
                <div className="relative">
                  <span className="sr-only">Search the forum</span>
                  <Icon
                    name="search"
                    color="currentColor"
                    width={16}
                    height={16}
                    className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary"
                  />
                  <input
                    data-tutorial-target="forum-search-input"
                    type="text"
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setIsSearchDropdownOpen(true);
                    }}
                    onClick={() => setIsSearchDropdownOpen(true)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        setAppliedSearch(search);
                        setIsSearchDropdownOpen(false);
                      }
                    }}
                    placeholder="Search the forum"
                    className="w-full h-[42px] pl-10 pr-4 border border-panel-border rounded-full bg-input-bg text-text-primary outline-none"
                  />
                </div>
              }
            >
              <DropdownMenuContent maxHeight="max-h-64">
                {suggestedPosts.map((post) => (
                  <DropdownMenuItem
                    key={post.id}
                    onClick={() => {
                      router.push(getForumPostHref(post.postNumber, post.title));
                      setIsSearchDropdownOpen(false);
                    }}
                    description={`by ${post.authorDisplayName}`}
                  >
                    {post.title}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <Link
            data-tutorial-target="forum-ask-question"
            href="/forum/questions"
            className="h-[42px] px-5 shrink-0 inline-flex items-center justify-center bg-button-bg text-button-text rounded-full hover:bg-button-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-button-bg/20 font-semibold transition-colors cursor-pointer whitespace-nowrap"
          >
            Ask Question
          </Link>
        </div>
      </div>

      <div className="mb-4 flex items-center justify-end gap-1.5">
        <span className="text-xs font-medium text-text-tertiary">Sort by:</span>
        <DropdownMenu
          isOpen={isSortDropdownOpen}
          onOpenChange={setIsSortDropdownOpen}
          align="right"
          trigger={
            <button
              data-tutorial-target="forum-sort-button"
              type="button"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-text-primary hover:bg-hover-bg rounded-full transition-colors cursor-pointer"
            >
              <span>{sortBy === 'recent' ? 'Most Recent' : 'Highest Upvoted'}</span>
              <Icon name="chevron-down" color="currentColor" width={12} height={12} className={`w-3 h-3 text-text-secondary transition-transform duration-200 ${isSortDropdownOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
            </button>
          }
        >
          <DropdownMenuContent>
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

      {error && (
        <div className="mb-4 bg-red-500/10 border border-red-500/40 text-red-500 px-4 py-2 rounded-xl text-sm font-semibold">
          {error}
        </div>
      )}

      <div className="flex flex-col min-w-0">
        {sortedPosts.map((post, index) => {
          const postHref = getForumPostHref(post.postNumber, post.title);

          return (
            <div key={post.id} className="flex flex-col min-w-0">
              {index > 0 && <hr className="border-t border-panel-border m-0 p-0" />}
              <article
                role="link"
                tabIndex={0}
                onClick={() => router.push(postHref)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    router.push(postHref);
                  }
                }}
                className="p-4 mt-1 mb-1 rounded-2xl cursor-pointer hover:bg-hover-bg/50 transition-colors min-w-0"
              >
                <div className="flex flex-col min-w-0">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-1 sm:gap-3 mb-2 min-w-0">
                    <h2 className="text-lg font-bold text-heading break-words min-w-0">
                      {post.title}
                    </h2>
                    <p className="text-xs text-text-tertiary sm:whitespace-nowrap sm:shrink-0 min-w-0 break-words sm:break-normal line-clamp-2 sm:line-clamp-none">asked {formatRelativeTime(post.createdAt)} by {post.authorDisplayName}</p>
                  </div>

                  {/* Tags display */}
                  {post.tags.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-1.5">
                      {post.tags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-1 bg-uva-orange/15 text-uva-orange px-2 py-0.5 rounded-full text-[10px] font-semibold"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  <p className="text-sm text-text-secondary break-words line-clamp-3 mb-4">{post.body}</p>

                  <div className="flex flex-wrap-reverse items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <div
                        className={`flex items-center h-8 gap-0 border rounded-full p-0.5 transition-colors ${
                          post.currentUserPostVote === 1 ? 'bg-uva-orange/10 border-uva-orange/30' :
                          post.currentUserPostVote === -1 ? 'bg-red-500/10 border-red-500/30' :
                          'bg-panel-bg border-panel-border'
                        }`}
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => event.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => handlePostVote(post.id, 1)}
                          disabled={isVoting}
                          aria-label="Like post"
                          className={`inline-flex items-center justify-center h-full aspect-square rounded-full transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                            post.currentUserPostVote === 1 ? 'text-uva-orange' : 'text-text-secondary hover:bg-hover-bg'
                          }`}
                        >
                          <Icon name="chevron-up" color="currentColor" width={14} height={14} className="w-4 h-4" aria-hidden="true" />
                        </button>

                        <span className="min-w-4 text-center text-xs font-bold text-text-primary">{post.voteScore}</span>

                        <button
                          type="button"
                          onClick={() => handlePostVote(post.id, -1)}
                          disabled={isVoting}
                          aria-label="Unlike post"
                          className={`inline-flex items-center justify-center h-full aspect-square rounded-full transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                            post.currentUserPostVote === -1 ? 'text-red-500' : 'text-text-secondary hover:bg-hover-bg'
                          }`}
                        >
                          <Icon name="chevron-down" color="currentColor" width={14} height={14} className="w-4 h-4" aria-hidden="true" />
                        </button>
                      </div>

                      <div className="flex items-center justify-center h-8 gap-1.5 px-3 bg-panel-bg border border-panel-border rounded-full transition-colors">
                        <Icon name="forum" color="currentColor" width={16} height={16} className="w-4 h-4 text-text-secondary" aria-hidden="true" />
                        <span className="text-xs font-semibold text-text-secondary">{post.answers.length}</span>
                      </div>
                    </div>

                    {post.attachedPlan && (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleOpenAttachedPlan(post.attachedPlan!.id);
                        }}
                        className="inline-flex items-center h-8 gap-1.5 px-3 rounded-full bg-panel-bg border border-panel-border text-xs font-semibold text-text-secondary cursor-pointer transition-colors max-w-full"
                      >
                        <span className="uppercase tracking-wide text-[10px] shrink-0">Attached Plan</span>
                        <span className="text-text-primary truncate max-w-[120px] sm:max-w-xs">{post.attachedPlan.title}</span>
                      </button>
                    )}
                  </div>
                </div>
              </article>
          </div>
          );
        })}
      </div>

    </div>
  );
}
