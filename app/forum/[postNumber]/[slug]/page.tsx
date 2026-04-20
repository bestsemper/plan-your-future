"use client";

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { use, useEffect, useState, useTransition } from 'react';
import { Icon } from '@/app/components/Icon';
import { default as ConfirmModal } from '../../../components/ConfirmModal';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem } from '../../../components/DropdownMenu';
import { useAttachedPlanModal } from '../../../components/AttachedPlan';
import {
  addForumReply,
  deleteForumReply,
  deleteForumPost,
  getForumPostPageData,
  voteOnForumPost,
  voteOnForumReply,
} from '../../../actions';

type ForumAnswerItem = {
  id: string;
  parentId: string | null;
  body: string;
  attachedPlan: { id: string; title: string } | null;
  isDeleted: boolean;
  canDelete: boolean;
  createdAt: string;
  authorDisplayName: string;
  authorId: string | null;
  authorComputingId: string;
  isAnonymous: boolean;
  profileVisibility: string;
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
  authorId: string | null;
  authorComputingId: string;
  isAnonymous: boolean;
  profileVisibility: string;
  tags: string[];
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
  const { openPlanModal } = useAttachedPlanModal();
  const [isPending, startTransition] = useTransition();
  const [postData, setPostData] = useState<ForumPostPageData | null>(null);
  const [replyDraft, setReplyDraft] = useState('');
  const [attachedPlanId, setAttachedPlanId] = useState('');
  const [inlineAttachedPlanId, setInlineAttachedPlanId] = useState('');
  const [isPlanDropdownOpen, setIsPlanDropdownOpen] = useState(false);
  const [isInlinePlanDropdownOpen, setIsInlinePlanDropdownOpen] = useState(false);
  const [replySort, setReplySort] = useState<'newest' | 'oldest' | 'popular'>('newest');
  const [isSortDropdownOpen, setIsSortDropdownOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [activeReplyEditorId, setActiveReplyEditorId] = useState<string | null>(null);
  const [inlineReplyDraft, setInlineReplyDraft] = useState('');
  const [isReplyAnonymous, setIsReplyAnonymous] = useState(true);
  const [isInlineReplyAnonymous, setIsInlineReplyAnonymous] = useState(true);
  const [isComposerExpanded, setIsComposerExpanded] = useState(false);
  const [collapsedReplies, setCollapsedReplies] = useState<Set<string>>(new Set());

  const toggleCollapse = (id: string) => {
    setCollapsedReplies((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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

  const getOptimisticVoteUpdate = (currentVote: 1 | -1 | 0, clickedValue: 1 | -1) => {
    const nextVote: 1 | -1 | 0 = currentVote === clickedValue ? 0 : clickedValue;
    const scoreDelta = nextVote - currentVote;
    return { nextVote, scoreDelta };
  };

  const createOptimisticReply = (body: string, parentId: string | null): ForumAnswerItem => ({
    id: `temp-reply-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    parentId,
    body,
    attachedPlan: null,
    isDeleted: false,
    canDelete: true,
    createdAt: new Date().toISOString(),
    authorDisplayName: 'You',
    authorId: 'temp-user-id',
    authorComputingId: '',
    isAnonymous: true,
    profileVisibility: 'hidden',
    voteScore: 1,
    currentUserVote: 1,
  });

  const handleReply = () => {
    if (!postData) return;
    const trimmed = replyDraft.trim();
    if (!trimmed) {
      setError('Reply cannot be empty.');
      return;
    }

    setError(null);
    const optimisticReply = createOptimisticReply(trimmed, null);

    setPostData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        post: {
          ...prev.post,
          answers: [...prev.post.answers, optimisticReply],
        },
      };
    });
    setReplyDraft('');
    setAttachedPlanId('');

    startTransition(async () => {
      const res = await addForumReply(postData.post.id, trimmed, undefined, attachedPlanId || undefined, isReplyAnonymous);
      if (res?.error) {
        setPostData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            post: {
              ...prev.post,
              answers: prev.post.answers.filter((answer) => answer.id !== optimisticReply.id),
            },
          };
        });
        setError(res.error);
        return;
      }

      void loadData();
    });
  };

  const handleReplyToReply = (parentReplyId: string) => {
    if (!postData) return;
    const trimmed = inlineReplyDraft.trim();
    if (!trimmed) {
      setError('Reply cannot be empty.');
      return;
    }

    setError(null);
    const optimisticReply = createOptimisticReply(trimmed, parentReplyId);

    setPostData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        post: {
          ...prev.post,
          answers: [...prev.post.answers, optimisticReply],
        },
      };
    });
    setInlineReplyDraft('');
    setInlineAttachedPlanId('');
    setActiveReplyEditorId(null);

    (async () => {
      const res = await addForumReply(postData.post.id, trimmed, parentReplyId, inlineAttachedPlanId || undefined, isInlineReplyAnonymous);
      if (res?.error) {
        setPostData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            post: {
              ...prev.post,
              answers: prev.post.answers.filter((answer) => answer.id !== optimisticReply.id),
            },
          };
        });
        setError(res.error);
        return;
      }

      void loadData();
    })();
  };

  const handleVote = (answerId: string, value: 1 | -1) => {
    if (!postData) return;
    setError(null);

    const targetAnswer = postData.post.answers.find((answer) => answer.id === answerId);
    if (!targetAnswer) return;

    const previousVote = targetAnswer.currentUserVote;
    const { nextVote, scoreDelta } = getOptimisticVoteUpdate(previousVote, value);

    setPostData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        post: {
          ...prev.post,
          answers: prev.post.answers.map((answer) =>
            answer.id === answerId
              ? { ...answer, currentUserVote: nextVote, voteScore: answer.voteScore + scoreDelta }
              : answer
          ),
        },
      };
    });

    (async () => {
      const res = await voteOnForumReply(answerId, value);
      if (res?.error) {
        setPostData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            post: {
              ...prev.post,
              answers: prev.post.answers.map((answer) =>
                answer.id === answerId
                  ? { ...answer, currentUserVote: previousVote, voteScore: answer.voteScore - scoreDelta }
                  : answer
              ),
            },
          };
        });
        setError(res.error);
        return;
      }
    })();
  };

  const handlePostVote = (value: 1 | -1) => {
    if (!postData) return;
    setError(null);

    const previousVote = postData.post.currentUserVote;
    const { nextVote, scoreDelta } = getOptimisticVoteUpdate(previousVote, value);

    setPostData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        post: {
          ...prev.post,
          currentUserVote: nextVote,
          voteScore: prev.post.voteScore + scoreDelta,
        },
      };
    });

    (async () => {
      const res = await voteOnForumPost(postData.post.id, value);
      if (res?.error) {
        setPostData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            post: {
              ...prev.post,
              currentUserVote: previousVote,
              voteScore: prev.post.voteScore - scoreDelta,
            },
          };
        });
        setError(res.error);
        return;
      }
    })();
  };

  const handleDeleteReply = (answerId: string) => {
    if (!postData) return;
    setError(null);

    const targetAnswer = postData.post.answers.find((answer) => answer.id === answerId);
    if (!targetAnswer || targetAnswer.isDeleted) return;

    setPostData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        post: {
          ...prev.post,
          answers: prev.post.answers.map((answer) =>
            answer.id === answerId
              ? { ...answer, body: '', isDeleted: true, canDelete: false }
              : answer
          ),
        },
      };
    });

    (async () => {
      const res = await deleteForumReply(answerId);
      if (res?.error) {
        setPostData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            post: {
              ...prev.post,
              answers: prev.post.answers.map((answer) =>
                answer.id === answerId
                  ? { ...answer, body: targetAnswer.body, isDeleted: false, canDelete: targetAnswer.canDelete }
                  : answer
              ),
            },
          };
        });
        setError(res.error);
      }
    })();
  };

  const handleDeletePost = () => {
    if (!postData) return;

    (async () => {
      const res = await deleteForumPost(postData.post.id);
      if (res?.error) {
        setError(res.error);
        return;
      }
      router.push('/forum');
    })();
  };

  const handleOpenAttachedPlan = () => {
    if (!postData?.post.attachedPlan?.id) return;

    setError(null);
    openPlanModal(postData.post.attachedPlan.id, (message) => setError(message));
  };

  const handleOpenReplyAttachedPlan = (planId: string) => {
    setError(null);
    openPlanModal(planId, (message) => setError(message));
  };

  if (!postData) {
    return (
      <div className="w-full pt-0 pb-6 animate-pulse">
        <div className="h-5 w-24 rounded bg-input-disabled mb-6" />
        
        <div className="bg-panel-bg rounded-3xl border border-panel-border p-4 pb-5">
          
          <div className="space-y-3">
            <div className="h-9 w-3/4 rounded bg-input-disabled" />
            <div className="h-4 w-48 rounded bg-input-disabled" />
            <div className="h-4 w-full rounded bg-input-disabled" />
            <div className="h-4 w-5/6 rounded bg-input-disabled" />
            <div className="flex gap-2 pt-1">
              <div className="h-8 w-20 rounded-full bg-input-disabled" />
              <div className="h-8 w-20 rounded-full bg-input-disabled" />
            </div>
          </div>
          
          <hr className="border-t border-panel-border my-6" />
          
          <div className="h-10 rounded-[20px] bg-input-disabled mb-4 mt-4" />
          
          <div className="h-4 w-28 rounded bg-input-disabled mb-4" />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="mt-4 space-y-2">
              <div className="h-3.5 w-36 rounded bg-input-disabled" />
              <div className="h-4 w-full rounded bg-input-disabled" />
              <div className="h-4 w-2/3 rounded bg-input-disabled" />
              <div className="h-6 w-24 rounded bg-input-disabled" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const { post, canPost } = postData;
  const sortedAnswers = [...post.answers].sort((a, b) => {
    if (replySort === 'newest') {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
    if (replySort === 'popular') {
      return b.voteScore - a.voteScore || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  const replySortLabel =
    replySort === 'newest' ? 'Newest first' : replySort === 'oldest' ? 'Oldest first' : 'Most votes';

  const repliesByParent = new Map<string | null, ForumAnswerItem[]>();
  for (const answer of sortedAnswers) {
    const key = answer.parentId;
    const existing = repliesByParent.get(key) ?? [];
    existing.push(answer);
    repliesByParent.set(key, existing);
  }

  const rootAnswers = repliesByParent.get(null) ?? [];

  const renderReplyTree = (answers: ForumAnswerItem[], depth = 0) => {
    return answers.map((answer) => {
      const children = repliesByParent.get(answer.id) ?? [];
      const indentPx = Math.min(depth * 24, 96);

      const isCollapsed = collapsedReplies.has(answer.id);

      return (
        <div key={answer.id} className="mt-4" style={{ marginLeft: indentPx }}>
          <article>
            {/* Author row with collapse toggle */}
            <div className="flex items-center gap-1.5 mb-2">
              <button
                type="button"
                onClick={() => toggleCollapse(answer.id)}
                className="shrink-0 text-text-tertiary hover:text-text-primary transition-colors cursor-pointer"
                aria-label={isCollapsed ? 'Expand reply' : 'Collapse reply'}
              >
                <Icon name={isCollapsed ? 'chevron-down' : 'chevron-up'} color="currentColor" width={12} height={12} className="w-3 h-3" aria-hidden="true" />
              </button>
              <p className="text-xs text-text-tertiary flex-1">
                {answer.isDeleted ? (
                  <>deleted {formatRelativeTime(answer.createdAt)}</>
                ) : answer.authorComputingId && answer.authorDisplayName !== 'Anonymous User' ? (
                  <><Link href={`/profile/${answer.authorComputingId}`} className="text-text-primary font-semibold hover:underline">{answer.authorDisplayName}</Link> replied {formatRelativeTime(answer.createdAt)}</>
                ) : (
                  <><span className="text-text-primary font-semibold">{answer.authorDisplayName}</span> replied {formatRelativeTime(answer.createdAt)}</>
                )}
              </p>
            </div>

            {!isCollapsed && (
              <div className="min-w-0 pl-[18px]">
                {answer.isDeleted ? (
                  <p className="text-sm italic text-text-tertiary mb-2">[deleted]</p>
                ) : (
                  <p className="text-text-primary whitespace-pre-wrap leading-relaxed mb-2">{answer.body}</p>
                )}
                {!answer.isDeleted && answer.attachedPlan && (
                  <div className="mb-2">
                    <button
                      type="button"
                      onClick={() => { if (answer.attachedPlan) handleOpenReplyAttachedPlan(answer.attachedPlan.id); }}
                      disabled={isPending}
                      className="inline-flex items-center h-7 gap-1.5 px-3 rounded-full bg-panel-bg border border-panel-border text-xs font-semibold text-text-secondary hover:bg-hover-bg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <span className="uppercase tracking-wide text-[10px]">Attached Plan</span>
                      <span className="text-text-primary">{answer.attachedPlan.title}</span>
                    </button>
                  </div>
                )}
                <div className="flex items-center gap-1 mt-2">
                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => handleVote(answer.id, 1)}
                      disabled={!canPost || isPending || answer.isDeleted}
                      aria-label="Like reply"
                      className={`inline-flex items-center justify-center w-6 h-6 rounded-full transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                        answer.currentUserVote === 1 ? 'text-uva-orange' : 'text-text-secondary hover:bg-hover-bg'
                      }`}
                    >
                      <Icon name="chevron-up" color="currentColor" width={13} height={13} className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                    <span className="min-w-4 text-center text-xs font-bold text-text-primary">{answer.voteScore}</span>
                    <button
                      type="button"
                      onClick={() => handleVote(answer.id, -1)}
                      disabled={!canPost || isPending || answer.isDeleted}
                      aria-label="Unlike reply"
                      className={`inline-flex items-center justify-center w-6 h-6 rounded-full transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                        answer.currentUserVote === -1 ? 'text-red-500' : 'text-text-secondary hover:bg-hover-bg'
                      }`}
                    >
                      <Icon name="chevron-down" color="currentColor" width={13} height={13} className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setActiveReplyEditorId(answer.id); setInlineReplyDraft(''); setInlineAttachedPlanId(''); }}
                    disabled={!canPost || isPending || answer.isDeleted}
                    className="inline-flex items-center gap-1 h-7 px-2.5 text-xs font-semibold text-text-secondary hover:text-text-primary hover:bg-hover-bg rounded-full transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Icon name="forum" color="currentColor" width={13} height={13} className="w-3.5 h-3.5" aria-hidden="true" />
                    Reply
                  </button>
                  {answer.canDelete && (
                    <button
                      type="button"
                      onClick={() => handleDeleteReply(answer.id)}
                      disabled={isPending}
                      className="inline-flex items-center gap-1 h-7 px-2.5 text-xs font-semibold text-red-500/60 hover:text-red-500 hover:bg-red-500/10 rounded-full transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Icon name="trash" color="currentColor" width={13} height={13} className="w-3.5 h-3.5" aria-hidden="true" />
                      Delete
                    </button>
                  )}
                </div>

                {activeReplyEditorId === answer.id && (
                  <div className="mt-3 border border-panel-border rounded-[20px] bg-input-bg">
                    <textarea
                      value={inlineReplyDraft}
                      onChange={(e) => setInlineReplyDraft(e.target.value)}
                      rows={2}
                      placeholder={answer.isDeleted ? 'Reply to this comment...' : `Reply to ${answer.authorDisplayName}...`}
                      className="w-full px-4 pt-3 pb-1 bg-transparent text-text-primary outline-none resize-none"
                      disabled={!canPost || isPending}
                    />
                    <div className="px-4 pb-3 pt-1 flex flex-col gap-2">
                      <label htmlFor={`inline-reply-anonymous-${answer.id}`} className={`flex items-center gap-2 select-none ${(!canPost || isPending) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
                        <input type="checkbox" id={`inline-reply-anonymous-${answer.id}`} checked={isInlineReplyAnonymous} onChange={(e) => setIsInlineReplyAnonymous(e.target.checked)} disabled={!canPost || isPending} className="sr-only" />
                        <div className={`w-4 h-4 shrink-0 rounded border flex items-center justify-center transition-colors ${isInlineReplyAnonymous ? 'bg-button-bg border-button-bg' : 'border-panel-border-strong'}`}>
                          <Icon name="check" color="currentColor" width={10} height={10} className={`text-button-text transition-opacity ${isInlineReplyAnonymous ? 'opacity-100' : 'opacity-0'}`} />
                        </div>
                        <span className="text-sm font-medium text-text-primary">Reply anonymously</span>
                      </label>
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <DropdownMenu
                          isOpen={isInlinePlanDropdownOpen}
                          onOpenChange={setIsInlinePlanDropdownOpen}
                          trigger={
                            <button
                              type="button"
                              className="w-full sm:w-48 h-8 px-3 border border-panel-border rounded-xl bg-panel-bg text-text-primary text-left cursor-pointer flex items-center justify-between focus:outline-none hover:border-panel-border-strong transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                              disabled={!canPost || isPending}
                            >
                              <span className="truncate text-xs font-semibold min-w-0">{inlineAttachedPlanId ? postData.plans.find(p => p.id === inlineAttachedPlanId)?.title || 'Plan attached' : 'Attach plan'}</span>
                              <Icon name="chevron-down" color="currentColor" width={13} height={13} className={`w-3.5 h-3.5 shrink-0 text-text-secondary transition-transform duration-200 ${isInlinePlanDropdownOpen ? 'rotate-180' : ''}`} />
                            </button>
                          }
                        >
                          <DropdownMenuContent className="w-48 max-h-64 overflow-y-auto">
                            <DropdownMenuItem selected={!inlineAttachedPlanId} onClick={() => { setInlineAttachedPlanId(''); setIsInlinePlanDropdownOpen(false); }}>
                              No plan attached
                            </DropdownMenuItem>
                            {postData.plans.map((plan) => (
                              <DropdownMenuItem
                                key={plan.id}
                                selected={inlineAttachedPlanId === plan.id}
                                onClick={() => { setInlineAttachedPlanId(plan.id); setIsInlinePlanDropdownOpen(false); }}
                              >
                                {plan.title}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => { setActiveReplyEditorId(null); setInlineReplyDraft(''); setInlineAttachedPlanId(''); }}
                            disabled={isPending}
                            className="h-8 px-4 border border-panel-border rounded-full text-xs font-semibold text-text-primary hover:bg-hover-bg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => handleReplyToReply(answer.id)}
                            disabled={!canPost || isPending || answer.isDeleted}
                            className="h-8 px-4 bg-button-bg text-button-text rounded-full text-xs font-semibold hover:bg-button-hover transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isPending ? 'Posting...' : 'Reply'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </article>

          {!isCollapsed && children.length > 0 && renderReplyTree(children, depth + 1)}
        </div>
      );
    });
  };

  return (
    <div className="w-full pt-0 pb-6">
      <Link href="/forum" className="inline-flex items-center gap-1.5 text-sm font-semibold text-text-secondary hover:text-uva-orange transition-colors mb-6">
        <Icon name="arrow-left" color="currentColor" width={16} height={16} className="w-4 h-4" aria-hidden="true" />
        <span>Back to Forum</span>
      </Link>

      {error && (
        <div className="mb-4 bg-red-500/10 border border-red-500/40 text-red-500 px-4 py-2 rounded-xl text-sm font-semibold">
          {error}
        </div>
      )}

      <div className="bg-panel-bg rounded-3xl border border-panel-border p-4 pb-5">
        <article>
          <div className="flex items-start justify-between gap-3 mb-1">
            <h1 className="text-3xl font-bold text-heading leading-tight">{post.title}</h1>
            {post.canDelete && (
              <button
                type="button"
                onClick={() => setIsDeleteConfirmOpen(true)}
                disabled={isPending}
                className="shrink-0 px-3 py-1.5 rounded-xl border border-red-400 text-red-500 hover:bg-red-500/10 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Delete
              </button>
            )}
          </div>

          <p className="text-xs text-text-tertiary mb-4">
            {post.authorDisplayName !== 'Anonymous User' ? (
              <>
                <Link href={`/profile/${post.authorComputingId}`} className="text-text-primary font-semibold hover:underline">{post.authorDisplayName}</Link> asked {formatRelativeTime(post.createdAt)} | {post.viewCount} views
              </>
            ) : (
              <>
                <span className="text-text-primary font-semibold">{post.authorDisplayName}</span> asked {formatRelativeTime(post.createdAt)} | {post.viewCount} views
              </>
            )}
          </p>

          {/* Tags display */}
          {post.tags.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {post.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 bg-uva-orange/15 text-uva-orange px-2.5 py-1 rounded-full text-[11px] font-semibold"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          <p className="text-text-primary whitespace-pre-wrap leading-relaxed mb-4">{post.body}</p>

          <div className="flex flex-wrap items-center gap-2">
            <div className={`flex items-center h-8 gap-0 border rounded-full p-0.5 transition-colors ${
              post.currentUserVote === 1
                ? 'bg-uva-orange/10 border-uva-orange/30'
                : post.currentUserVote === -1
                ? 'bg-red-500/10 border-red-500/30'
                : 'bg-panel-bg border-panel-border'
            }`}>
              <button
                type="button"
                onClick={() => handlePostVote(1)}
                disabled={!canPost || isPending}
                aria-label="Like post"
                className={`inline-flex items-center justify-center h-full aspect-square rounded-full transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                  post.currentUserVote === 1
                    ? 'text-uva-orange'
                    : 'text-text-secondary hover:bg-hover-bg'
                }`}
              >
                <Icon name="chevron-up" color="currentColor" width={14} height={14} className="w-4 h-4" aria-hidden="true" />
              </button>
              <span className="min-w-4 text-center text-xs font-bold text-text-primary">{post.voteScore}</span>
              <button
                type="button"
                onClick={() => handlePostVote(-1)}
                disabled={!canPost || isPending}
                aria-label="Unlike post"
                className={`inline-flex items-center justify-center h-full aspect-square rounded-full transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                  post.currentUserVote === -1
                    ? 'text-red-500'
                    : 'text-text-secondary hover:bg-hover-bg'
                }`}
              >
                <Icon name="chevron-down" color="currentColor" width={14} height={14} className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => { if (canPost) setIsComposerExpanded(true); }}
              disabled={!canPost}
              className="flex items-center justify-center h-8 gap-1.5 px-3 bg-panel-bg border border-panel-border rounded-full hover:bg-hover-bg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Icon name="forum" color="currentColor" width={16} height={16} className="w-4 h-4 text-text-secondary" aria-hidden="true" />
              <span className="text-xs font-semibold text-text-secondary">{post.answers.length}</span>
            </button>

            {post.attachedPlan && (
              <button
                type="button"
                onClick={handleOpenAttachedPlan}
                disabled={isPending}
                className="inline-flex items-center h-8 gap-1.5 px-3 rounded-full bg-panel-bg border border-panel-border text-xs font-semibold text-text-secondary hover:bg-hover-bg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="uppercase tracking-wide text-[10px]">Attached Plan</span>
                <span className="text-text-primary">{post.attachedPlan.title}</span>
              </button>
            )}
          </div>
        </article>

        <hr className="border-t border-panel-border my-4" />

        <section className="mt-4">
          <div className="mb-4">
            {!isComposerExpanded ? (
              <button
                type="button"
                onClick={() => { if (canPost) setIsComposerExpanded(true); }}
                disabled={!canPost}
                className="w-full h-10 px-4 border border-panel-border rounded-[20px] bg-input-bg text-text-tertiary text-sm text-left hover:border-panel-border-strong transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Join the conversation...
              </button>
            ) : (
              <div className="border border-panel-border rounded-[20px] bg-input-bg">
                <textarea
                  value={replyDraft}
                  onChange={(e) => setReplyDraft(e.target.value)}
                  rows={4}
                  placeholder="Join the conversation..."
                  autoFocus
                  className="w-full px-4 pt-3 pb-1 bg-transparent text-text-primary outline-none resize-none"
                  disabled={!canPost || isPending}
                />
                <div className="px-4 pb-3 pt-1 flex flex-col gap-2">
                  <label htmlFor="main-reply-anonymous-checkbox" className={`flex items-center gap-2 select-none ${(!canPost || isPending) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
                    <input type="checkbox" id="main-reply-anonymous-checkbox" checked={isReplyAnonymous} onChange={(e) => setIsReplyAnonymous(e.target.checked)} disabled={!canPost || isPending} className="sr-only" />
                    <div className={`w-4 h-4 shrink-0 rounded border flex items-center justify-center transition-colors ${isReplyAnonymous ? 'bg-button-bg border-button-bg' : 'border-panel-border-strong'}`}>
                      <Icon name="check" color="currentColor" width={10} height={10} className={`text-button-text transition-opacity ${isReplyAnonymous ? 'opacity-100' : 'opacity-0'}`} />
                    </div>
                    <span className="text-sm font-medium text-text-primary">Reply anonymously</span>
                  </label>
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <DropdownMenu
                      isOpen={isPlanDropdownOpen}
                      onOpenChange={setIsPlanDropdownOpen}
                      trigger={
                        <button
                          type="button"
                          className="w-full sm:w-56 h-9 px-3 border border-panel-border rounded-xl bg-panel-bg text-text-primary text-left cursor-pointer flex items-center justify-between focus:outline-none hover:border-panel-border-strong transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                          disabled={!canPost || isPending}
                        >
                          <span className="truncate text-sm font-medium min-w-0">{attachedPlanId ? postData.plans.find((p) => p.id === attachedPlanId)?.title || 'Attach plan' : 'No plan attached'}</span>
                          <Icon name="chevron-down" color="currentColor" width={14} height={14} className={`w-3.5 h-3.5 shrink-0 text-text-secondary transition-transform duration-200 ${isPlanDropdownOpen ? 'rotate-180' : ''}`} />
                        </button>
                      }
                    >
                      <DropdownMenuContent className="w-64 max-h-64 overflow-y-auto">
                        <DropdownMenuItem
                          selected={!attachedPlanId}
                          onClick={() => {
                            setAttachedPlanId('');
                            setIsPlanDropdownOpen(false);
                          }}
                        >
                          No plan attached
                        </DropdownMenuItem>
                        {postData.plans.map((plan) => (
                          <DropdownMenuItem
                            key={plan.id}
                            selected={attachedPlanId === plan.id}
                            onClick={() => {
                              setAttachedPlanId(plan.id);
                              setIsPlanDropdownOpen(false);
                            }}
                          >
                            Attach: {plan.title}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => { setIsComposerExpanded(false); setReplyDraft(''); setAttachedPlanId(''); }}
                        disabled={isPending}
                        className="h-8 px-4 border border-panel-border rounded-full text-xs font-semibold text-text-primary hover:bg-hover-bg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleReply}
                        disabled={!canPost || isPending}
                        className="h-8 px-4 bg-button-bg text-button-text rounded-full hover:bg-button-hover text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isPending ? 'Submitting...' : 'Reply'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1.5 mb-4">
            <span className="text-xs font-medium text-text-tertiary">Sort by:</span>
            <DropdownMenu
              isOpen={isSortDropdownOpen}
              onOpenChange={setIsSortDropdownOpen}
              align="center"
              contentClassName="w-[200%]"
              trigger={
                <button
                  type="button"
                  className="inline-flex items-center h-8 gap-1.5 px-3 text-xs font-semibold text-text-primary hover:bg-hover-bg rounded-full transition-colors cursor-pointer"
                >
                  <span>{replySortLabel}</span>
                  <Icon name="chevron-down" color="currentColor" width={14} height={14} className={`w-3.5 h-3.5 text-text-secondary transition-transform duration-200 ${isSortDropdownOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
                </button>
              }
            >
                <DropdownMenuContent>
                  <DropdownMenuItem
                    selected={replySort === 'newest'}
                    onClick={() => {
                      setReplySort('newest');
                      setIsSortDropdownOpen(false);
                    }}
                  >
                    Newest first
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    selected={replySort === 'oldest'}
                    onClick={() => {
                      setReplySort('oldest');
                      setIsSortDropdownOpen(false);
                    }}
                  >
                    Oldest first
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    selected={replySort === 'popular'}
                    onClick={() => {
                      setReplySort('popular');
                      setIsSortDropdownOpen(false);
                    }}
                  >
                    Most votes
                  </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {sortedAnswers.length === 0 && (
            <p className="py-6 text-sm text-text-secondary text-center">No replies yet.</p>
          )}

          {renderReplyTree(rootAnswers)}
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
