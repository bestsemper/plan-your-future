"use client";

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { use, useEffect, useState, useTransition } from 'react';
import ConfirmModal from '../../../components/ConfirmModal';
import {
  addForumReply,
  deleteForumPost,
  getForumPostPageData,
  voteOnForumPost,
  voteOnForumReply,
} from '../../../actions';

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
  currentUserVote: 1 | -1 | 0;
  viewCount: number;
  createdAt: string;
  authorDisplayName: string;
  canDelete: boolean;
  attachedPlan: { id: string; title: string } | null;
  answers: ForumAnswerItem[];
};

type ForumPostPageData = {
  post: ForumPostItem;
  plans: Array<{ id: string; title: string }>;
  canPost: boolean;
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

export default function ForumPostPage({ params }: { params: Promise<{ postNumber: string; slug: string }> }) {
  const { postNumber } = use(params);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [postData, setPostData] = useState<ForumPostPageData | null>(null);
  const [replyDraft, setReplyDraft] = useState('');
  const [replySort, setReplySort] = useState<'newest' | 'oldest'>('newest');
  const [isSortDropdownOpen, setIsSortDropdownOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

  const loadData = async () => {
    const parsedPostNumber = Number.parseInt(postNumber, 10);
    if (Number.isNaN(parsedPostNumber)) {
      router.push('/forum');
      return;
    }

    const res = await getForumPostPageData(parsedPostNumber);
    if ('error' in res) {
      if (res.error === 'not_found') {
        router.push('/forum');
        return;
      }
      setError('Unable to load post.');
      return;
    }
    setPostData(res);
  };

  useEffect(() => {
    void loadData();
  }, [postNumber]);

  const handleReply = () => {
    if (!postData) return;
    setError(null);

    startTransition(async () => {
      const res = await addForumReply(postData.post.id, replyDraft);
      if (res?.error) {
        setError(res.error);
        return;
      }
      setReplyDraft('');
      await loadData();
    });
  };

  const handleVote = (answerId: string, value: 1 | -1) => {
    setError(null);

    startTransition(async () => {
      const res = await voteOnForumReply(answerId, value);
      if (res?.error) {
        setError(res.error);
        return;
      }
      await loadData();
    });
  };

  const handlePostVote = (value: 1 | -1) => {
    if (!postData) return;
    setError(null);

    startTransition(async () => {
      const res = await voteOnForumPost(postData.post.id, value);
      if (res?.error) {
        setError(res.error);
        return;
      }
      await loadData();
    });
  };

  const handleDeletePost = () => {
    if (!postData) return;

    startTransition(async () => {
      const res = await deleteForumPost(postData.post.id);
      if (res?.error) {
        setError(res.error);
        return;
      }
      router.push('/forum');
    });
  };

  if (!postData) {
    return (
      <div className="max-w-5xl mx-auto py-8 animate-pulse">
        <div className="h-6 w-24 rounded bg-input-disabled mb-6" />
        <div className="bg-panel-bg border border-panel-border rounded-md p-5 space-y-3 mb-6">
          <div className="h-8 w-3/4 rounded bg-input-disabled" />
          <div className="h-4 w-1/2 rounded bg-input-disabled" />
          <div className="h-4 w-full rounded bg-input-disabled" />
          <div className="h-4 w-2/3 rounded bg-input-disabled" />
        </div>
      </div>
    );
  }

  const { post, canPost } = postData;
  const sortedAnswers = [...post.answers].sort((a, b) => {
    if (replySort === 'newest') {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  return (
    <div className="max-w-5xl mx-auto py-8">
      <Link href="/forum" className="inline-flex items-center gap-1.5 text-sm font-semibold text-uva-blue hover:text-uva-orange transition-colors mb-6">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true">
          <path d="m15 18-6-6 6-6" />
        </svg>
        <span>Back to Forum</span>
      </Link>

      {error && (
        <div className="mb-4 bg-red-500/10 border border-red-500/40 text-red-500 px-4 py-2 rounded-md text-sm font-semibold">
          {error}
        </div>
      )}

      <div className="space-y-6">
          <article className="bg-panel-bg border border-panel-border rounded-md p-5">
            <div className="flex items-start justify-between gap-3 mb-2">
              <h1 className="text-4xl font-semibold text-heading leading-tight">{post.title}</h1>
              {post.canDelete && (
                <button
                  type="button"
                  onClick={() => setIsDeleteConfirmOpen(true)}
                  disabled={isPending}
                  className="shrink-0 px-3 py-1.5 rounded border border-red-400 text-red-500 hover:bg-red-500/10 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Delete
                </button>
              )}
            </div>

            <p className="text-xs text-text-tertiary mb-4">
              <span className="text-uva-blue font-semibold">{post.authorDisplayName}</span> asked {formatRelativeTime(post.createdAt)} | {post.viewCount} views
            </p>

            <div className="border-t border-panel-border pt-5">
              <div className="grid grid-cols-[56px_minmax(0,1fr)] gap-4 items-start">
                <div className="shrink-0">
                  <div className="inline-flex flex-col items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handlePostVote(1)}
                      disabled={!canPost || isPending}
                      aria-label="Like post"
                      className={`inline-flex items-center justify-center w-10 h-10 rounded-full border transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                        post.currentUserVote === 1
                          ? 'border-uva-orange text-uva-orange bg-badge-orange-bg'
                          : 'border-panel-border text-text-secondary hover:bg-hover-bg'
                      }`}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true">
                        <path d="m18 15-6-6-6 6" />
                      </svg>
                    </button>

                    <span className="min-w-8 text-center text-base font-bold text-text-primary">{post.voteScore}</span>

                    <button
                      type="button"
                      onClick={() => handlePostVote(-1)}
                      disabled={!canPost || isPending}
                      aria-label="Unlike post"
                      className={`inline-flex items-center justify-center w-10 h-10 rounded-full border transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                        post.currentUserVote === -1
                          ? 'border-red-400 text-red-500 bg-red-500/10'
                          : 'border-panel-border text-text-secondary hover:bg-hover-bg'
                      }`}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true">
                        <path d="m6 9 6 6 6-6" />
                      </svg>
                    </button>
                  </div>
                </div>

                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-4">
                    <span className="inline-flex items-center px-2 py-1 rounded border border-panel-border-strong text-xs font-semibold text-text-secondary bg-panel-bg-alt">
                      Advice
                    </span>
                    {post.attachedPlan && (
                      <span className="inline-flex items-center px-2 py-1 rounded border border-panel-border-strong text-xs font-semibold text-text-secondary bg-panel-bg-alt">
                        {post.attachedPlan.title}
                      </span>
                    )}
                  </div>

                  <p className="text-text-primary whitespace-pre-wrap leading-relaxed">{post.body}</p>
                </div>
              </div>
            </div>
          </article>

          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-semibold text-heading">{post.answers.length} Replies</h2>
              <div className="relative text-sm">
                <button
                  type="button"
                  onClick={() => setIsSortDropdownOpen((prev) => !prev)}
                  onBlur={() =>
                    setTimeout(() => {
                      setIsSortDropdownOpen(false);
                    }, 150)
                  }
                  className="inline-flex items-center gap-2 px-3 py-1.5 border border-panel-border rounded bg-input-bg text-text-primary cursor-pointer"
                >
                  <span>Sort: {replySort === 'newest' ? 'Newest first' : 'Oldest first'}</span>
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
                    className={`w-4 h-4 transition-transform ${isSortDropdownOpen ? 'rotate-180' : ''}`}
                    aria-hidden="true"
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>

                {isSortDropdownOpen && (
                  <div className="absolute right-0 mt-1 w-44 rounded-md border border-panel-border-strong bg-panel-bg shadow-lg z-10 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => {
                        setReplySort('newest');
                        setIsSortDropdownOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 text-sm cursor-pointer transition-colors ${replySort === 'newest' ? 'bg-uva-blue text-white' : 'text-text-primary hover:bg-uva-blue hover:text-white'}`}
                    >
                      Newest first
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setReplySort('oldest');
                        setIsSortDropdownOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 text-sm cursor-pointer transition-colors ${replySort === 'oldest' ? 'bg-uva-blue text-white' : 'text-text-primary hover:bg-uva-blue hover:text-white'}`}
                    >
                      Oldest first
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-panel-bg border border-panel-border rounded-md p-3">
              <textarea
                value={replyDraft}
                onChange={(e) => setReplyDraft(e.target.value)}
                rows={3}
                placeholder="Join the conversation..."
                className="w-full p-3 border border-panel-border rounded-md bg-input-bg text-text-primary outline-none"
                disabled={!canPost || isPending}
              />
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  onClick={handleReply}
                  disabled={!canPost || isPending}
                  className="px-4 py-2 bg-uva-blue text-white rounded hover:bg-uva-blue-dark font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isPending ? 'Submitting...' : 'Reply'}
                </button>
              </div>
            </div>

            {sortedAnswers.length === 0 && (
              <div className="bg-panel-bg border border-panel-border rounded-md p-4">
                <p className="text-sm text-text-secondary">No replies yet.</p>
              </div>
            )}

            {sortedAnswers.map((answer) => (
              <article key={answer.id} className="bg-panel-bg border border-panel-border rounded-md p-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded bg-input-disabled text-text-secondary text-xs font-bold flex items-center justify-center shrink-0 uppercase">
                    {answer.authorDisplayName.charAt(0)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-text-tertiary mb-2">
                      <span className="text-uva-blue font-semibold">{answer.authorDisplayName}</span> replied {formatRelativeTime(answer.createdAt)}
                    </p>
                    <p className="text-text-primary whitespace-pre-wrap leading-relaxed">{answer.body}</p>
                    <div className="mt-3 inline-flex flex-col items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleVote(answer.id, 1)}
                        disabled={!canPost || isPending}
                        aria-label="Like reply"
                        className={`inline-flex items-center justify-center w-8 h-8 rounded-full border transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                          answer.currentUserVote === 1
                            ? 'border-uva-orange text-uva-orange bg-badge-orange-bg'
                            : 'border-panel-border text-text-secondary hover:bg-hover-bg'
                        }`}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true">
                          <path d="m18 15-6-6-6 6" />
                        </svg>
                      </button>

                      <span className="min-w-8 text-center text-sm font-bold text-text-primary">{answer.voteScore}</span>

                      <button
                        type="button"
                        onClick={() => handleVote(answer.id, -1)}
                        disabled={!canPost || isPending}
                        aria-label="Unlike reply"
                        className={`inline-flex items-center justify-center w-8 h-8 rounded-full border transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                          answer.currentUserVote === -1
                            ? 'border-red-400 text-red-500 bg-red-500/10'
                            : 'border-panel-border text-text-secondary hover:bg-hover-bg'
                        }`}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true">
                          <path d="m6 9 6 6 6-6" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </section>
      </div>

      <ConfirmModal
        isOpen={isDeleteConfirmOpen}
        title="Delete Post"
        message="Delete this post? This cannot be undone."
        confirmLabel="Delete"
        isConfirming={isPending}
        onCancel={() => setIsDeleteConfirmOpen(false)}
        onConfirm={handleDeletePost}
      />
    </div>
  );
}
