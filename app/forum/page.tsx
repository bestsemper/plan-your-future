"use client";

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { getForumPageData } from '../actions';
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
  voteCount: number;
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
  const [posts, setPosts] = useState<ForumPostItem[]>([]);
  const [dataLoaded, setDataLoaded] = useState(false);

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

  if (!dataLoaded) {
    return (
      <div className="w-full pt-0 pb-6 animate-pulse">
        <div className="mb-6 border-b border-panel-border pb-4 flex items-center justify-between gap-3">
          <div className="h-9 w-64 rounded bg-input-disabled" />
          <div className="h-[42px] w-28 rounded bg-input-disabled" />
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
    <div className="w-full pt-0 pb-6">
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
            <svg
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M8.5 3a5.5 5.5 0 014.396 8.804l3.65 3.65a.75.75 0 11-1.06 1.06l-3.65-3.65A5.5 5.5 0 118.5 3zm0 1.5a4 4 0 100 8 4 4 0 000-8z"
                clipRule="evenodd"
              />
            </svg>
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
              className="w-full h-[42px] pl-10 pr-4 border border-panel-border rounded-full bg-input-bg text-text-primary outline-none focus:border-uva-blue/40 focus:ring-2 focus:ring-uva-blue/15"
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
            className="h-[42px] px-5 inline-flex items-center justify-center bg-uva-blue text-white rounded-full hover:bg-uva-blue-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-uva-blue/30 font-semibold transition-colors cursor-pointer whitespace-nowrap"
          >
            Ask Question
          </Link>
        </div>
      </div>

      <div className="bg-panel-bg border border-panel-border rounded-xl overflow-hidden">
        {filteredPosts.map((post) => {
          return (
            <article key={post.id} className="px-4 py-4 border-b border-panel-border last:border-b-0">
              <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-4 items-start">
                <div className="text-right text-sm text-text-secondary space-y-1 pt-0.5">
                  <p><span className="font-semibold text-text-primary mr-1">{post.voteCount}</span> votes</p>
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
                        <Link
                          href={`/plan/${post.attachedPlan.id}`}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-input-disabled text-xs font-semibold text-text-secondary hover:bg-hover-bg transition-colors"
                        >
                          <span className="uppercase tracking-wide text-[10px]">Attached Plan</span>
                          <span className="text-text-primary">{post.attachedPlan.title}</span>
                        </Link>
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
