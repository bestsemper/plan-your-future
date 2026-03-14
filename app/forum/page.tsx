"use client";

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { getForumPageData } from '../actions';
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
  const [posts, setPosts] = useState<ForumPostItem[]>([]);
  const [dataLoaded, setDataLoaded] = useState(false);

  const [search, setSearch] = useState('');

  const loadData = async () => {
    const res = await getForumPageData();
    setPosts(res.posts);
    setDataLoaded(true);
  };

  useEffect(() => {
    void loadData();
  }, []);

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

  if (!dataLoaded) {
    return (
      <div className="max-w-5xl mx-auto py-8 animate-pulse">
        <div className="mb-6 border-b border-panel-border pb-4 flex items-center justify-between gap-3">
          <div className="h-9 w-64 rounded bg-input-disabled" />
          <div className="h-10 w-28 rounded bg-input-disabled" />
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
    <div className="max-w-5xl mx-auto py-8">
      <div className="flex justify-between items-center mb-6 border-b border-panel-border pb-4">
        <h1 className="text-3xl font-bold text-heading">Community Forum</h1>
        <Link
          href="/forum/questions"
          className="px-4 py-2 bg-uva-orange/90 text-white rounded-xl hover:bg-uva-orange font-semibold transition-colors cursor-pointer"
        >
          Ask a Question
        </Link>
      </div>

      <div className="mb-6">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search posts and replies..."
          className="w-full p-3 border border-panel-border rounded-xl bg-input-bg text-text-primary outline-none"
        />
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
                      <Link href={`/profile/${post.authorComputingId}`} className="text-uva-blue font-semibold hover:underline">{post.authorDisplayName}</Link> asked {formatRelativeTime(post.createdAt)}
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
