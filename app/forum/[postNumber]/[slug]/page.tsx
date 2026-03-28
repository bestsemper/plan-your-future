"use client";

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { use, useEffect, useState, useTransition } from 'react';
import { Icon } from '@/app/components/Icon';
import { default as ConfirmModal } from '../../../components/ConfirmModal';
import { CustomDropdown, CustomDropdownContent, CustomDropdownItem } from '../../../components/CustomDropdown';
import { useAttachedPlanModal } from '../../AttachedPlanModalProvider';
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
  currentUserVote: 1 | -1 | 0;
  viewCount: number;
  createdAt: string;
  authorDisplayName: string;
  authorId: string;
  authorComputingId: string;
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
      const res = await addForumReply(postData.post.id, trimmed, undefined, attachedPlanId || undefined);
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
      const res = await addForumReply(postData.post.id, trimmed, parentReplyId, inlineAttachedPlanId || undefined);
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
      <div className="max-w-5xl mx-auto py-8 animate-pulse">
        <div className="h-6 w-24 rounded bg-input-disabled mb-6" />
        <div className="bg-panel-bg border border-panel-border rounded-xl p-5 space-y-3 mb-6">
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

      return (
        <div key={answer.id} className="space-y-3" style={{ marginLeft: indentPx }}>
          <article className="border-t border-panel-border pt-4">
            <div className="grid grid-cols-[38px_minmax(0,1fr)] gap-3 items-start">
              <div className="inline-flex flex-col items-center gap-1 pt-0.5">
                <button
                  type="button"
                  onClick={() => handleVote(answer.id, 1)}
                  disabled={!canPost || isPending || answer.isDeleted}
                  aria-label="Like reply"
                  className={`inline-flex items-center justify-center w-8 h-8 rounded-full border transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                    answer.currentUserVote === 1
                      ? 'border-uva-orange text-uva-orange bg-badge-orange-bg'
                      : 'border-panel-border text-text-secondary hover:bg-hover-bg'
                  }`}
                >
                  <Icon name="chevron-up" color="currentColor" width={16} height={16} className="w-4 h-4" aria-hidden="true" />
                </button>

                <span className="min-w-8 text-center text-sm font-bold text-text-primary">{answer.voteScore}</span>

                <button
                  type="button"
                  onClick={() => handleVote(answer.id, -1)}
                  disabled={!canPost || isPending || answer.isDeleted}
                  aria-label="Unlike reply"
                  className={`inline-flex items-center justify-center w-8 h-8 rounded-full border transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                    answer.currentUserVote === -1
                      ? 'border-red-400 text-red-500 bg-red-500/10'
                      : 'border-panel-border text-text-secondary hover:bg-hover-bg'
                  }`}
                >
                  <Icon name="chevron-down" color="currentColor" width={16} height={16} className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-xs text-text-tertiary mb-2">
                  {answer.isDeleted ? (
                    <>deleted {formatRelativeTime(answer.createdAt)}</>
                  ) : answer.authorComputingId ? (
                    <><Link href={`/profile/${answer.authorComputingId}`} className="text-uva-blue font-semibold hover:underline">{answer.authorDisplayName}</Link> replied {formatRelativeTime(answer.createdAt)}</>
                  ) : (
                    <><span className="text-uva-blue font-semibold">{answer.authorDisplayName}</span> replied {formatRelativeTime(answer.createdAt)}</>
                  )}
                </p>
                {answer.isDeleted ? (
                  <p className="text-sm italic text-text-tertiary">[deleted]</p>
                ) : (
                  <p className="text-text-primary whitespace-pre-wrap leading-relaxed">{answer.body}</p>
                )}
                {!answer.isDeleted && answer.attachedPlan && (
                  <div className="mt-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (answer.attachedPlan) {
                          handleOpenReplyAttachedPlan(answer.attachedPlan.id);
                        }
                      }}
                      disabled={isPending}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-panel-border-strong text-xs font-semibold text-text-secondary bg-panel-bg-alt hover:bg-hover-bg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <span className="uppercase tracking-wide text-[10px]">Attached Plan</span>
                      <span className="text-text-primary">{answer.attachedPlan.title}</span>
                    </button>
                  </div>
                )}
                <div className="mt-3 flex items-center justify-end gap-2">
                  {answer.canDelete && (
                    <button
                      type="button"
                      onClick={() => handleDeleteReply(answer.id)}
                      disabled={isPending}
                      className="px-3 py-1.5 rounded-xl border border-red-400 text-red-500 hover:bg-red-500/10 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Delete
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setActiveReplyEditorId(answer.id);
                      setInlineReplyDraft('');
                      setInlineAttachedPlanId('');
                    }}
                    disabled={!canPost || isPending || answer.isDeleted}
                    className="px-3 py-1.5 rounded-xl border border-panel-border-strong text-text-primary hover:bg-hover-bg text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Reply
                  </button>
                </div>

                {activeReplyEditorId === answer.id && (
                  <div className="mt-3 rounded-lg border border-panel-border bg-panel-bg-alt p-3 space-y-2">
                    <textarea
                      value={inlineReplyDraft}
                      onChange={(e) => setInlineReplyDraft(e.target.value)}
                      rows={2}
                      placeholder={answer.isDeleted ? 'Reply to this comment...' : `Reply to ${answer.authorDisplayName}...`}
                      className="w-full p-2.5 border border-panel-border rounded-lg bg-input-bg text-text-primary outline-none"
                      disabled={!canPost || isPending}
                    />
                    <div className="flex items-center gap-2 flex-wrap">
                      <CustomDropdown
                        isOpen={isInlinePlanDropdownOpen}
                        onOpenChange={setIsInlinePlanDropdownOpen}
                        trigger={
                          <button
                            type="button"
                            className="w-full sm:w-56 px-3 py-2 border border-panel-border rounded-lg bg-input-bg text-text-primary text-left cursor-pointer flex items-center justify-between focus:outline-none hover:border-panel-border-strong transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            disabled={!canPost || isPending}
                          >
                            <span className="truncate text-xs font-semibold min-w-0">{inlineAttachedPlanId ? postData.plans.find(p => p.id === inlineAttachedPlanId)?.title || 'Plan attached' : 'Attach plan'}</span>
                            <Icon name="chevron-down" color="currentColor" width={14} height={14} className={`w-3.5 h-3.5 shrink-0 text-text-secondary transition-transform duration-200 ${isInlinePlanDropdownOpen ? 'rotate-180' : ''}`} />
                          </button>
                        }
                      >
                        <CustomDropdownContent className="w-48 max-h-64 overflow-y-auto">
                          <CustomDropdownItem
                            selected={!inlineAttachedPlanId}
                            onClick={() => {
                              setInlineAttachedPlanId('');
                              setIsInlinePlanDropdownOpen(false);
                            }}
                          >
                            No plan attached
                          </CustomDropdownItem>
                          {postData.plans.map((plan) => (
                            <CustomDropdownItem
                              key={plan.id}
                              selected={inlineAttachedPlanId === plan.id}
                              onClick={() => {
                                setInlineAttachedPlanId(plan.id);
                                setIsInlinePlanDropdownOpen(false);
                              }}
                            >
                              {plan.title}
                            </CustomDropdownItem>
                          ))}
                        </CustomDropdownContent>
                      </CustomDropdown>
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setActiveReplyEditorId(null);
                          setInlineReplyDraft('');
                          setInlineAttachedPlanId('');
                        }}
                        disabled={isPending}
                        className="px-3 py-1.5 border border-panel-border-strong rounded-xl text-xs font-semibold text-text-primary hover:bg-hover-bg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => handleReplyToReply(answer.id)}
                        disabled={!canPost || isPending || answer.isDeleted}
                        className="px-3 py-1.5 bg-uva-blue/90 text-white rounded-xl text-xs font-semibold hover:bg-uva-blue transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isPending ? 'Posting...' : 'Post Reply'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </article>

          {children.length > 0 && renderReplyTree(children, depth + 1)}
        </div>
      );
    });
  };

  return (
    <div className="max-w-5xl mx-auto py-8">
      <Link href="/forum" className="inline-flex items-center gap-1.5 text-sm font-semibold text-uva-blue hover:text-uva-orange transition-colors mb-6">
        <Icon name="arrow-left" color="currentColor" width={16} height={16} className="w-4 h-4" aria-hidden="true" />
        <span>Back to Forum</span>
      </Link>

      {error && (
        <div className="mb-4 bg-red-500/10 border border-red-500/40 text-red-500 px-4 py-2 rounded-xl text-sm font-semibold">
          {error}
        </div>
      )}

      <div className="space-y-6">
          <article className="bg-panel-bg border border-panel-border rounded-xl p-5">
            <div className="flex items-start justify-between gap-3 mb-2">
              <h1 className="text-4xl font-semibold text-heading leading-tight">{post.title}</h1>
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
              <Link href={`/profile/${post.authorComputingId}`} className="text-uva-blue font-semibold hover:underline">{post.authorDisplayName}</Link> asked {formatRelativeTime(post.createdAt)} | {post.viewCount} views
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
                      <Icon name="chevron-up" color="currentColor" width={16} height={16} className="w-4 h-4" aria-hidden="true" />
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
                      <Icon name="chevron-down" color="currentColor" width={16} height={16} className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>

                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-4">
                    <span className="inline-flex items-center px-2 py-1 rounded border border-panel-border-strong text-xs font-semibold text-text-secondary bg-panel-bg-alt">
                      Advice
                    </span>
                    {post.attachedPlan && (
                      <button
                        type="button"
                        onClick={handleOpenAttachedPlan}
                        disabled={isPending}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded border border-panel-border-strong text-xs font-semibold text-text-secondary bg-panel-bg-alt hover:bg-hover-bg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                          <span className="uppercase tracking-wide text-[10px]">Attached Plan</span>
                          <span className="text-text-primary">{post.attachedPlan.title}</span>
                      </button>
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
              <div className="text-sm">
                <CustomDropdown
                  isOpen={isSortDropdownOpen}
                  onOpenChange={setIsSortDropdownOpen}
                  align="right"
                  trigger={
                    <button
                      type="button"
                      className="inline-flex items-center gap-2 px-3 py-2 border border-panel-border rounded-xl bg-input-bg text-text-primary cursor-pointer hover:border-panel-border-strong transition-colors"
                    >
                      <span>Sort: {replySortLabel}</span>
                      <Icon name="chevron-down" color="currentColor" width={16} height={16} className={`w-4 h-4 text-text-secondary transition-transform duration-200 ${isSortDropdownOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
                    </button>
                  }
                >
                  <CustomDropdownContent className="w-48">
                    <CustomDropdownItem
                      selected={replySort === 'newest'}
                      onClick={() => {
                        setReplySort('newest');
                        setIsSortDropdownOpen(false);
                      }}
                    >
                      Newest first
                    </CustomDropdownItem>
                    <CustomDropdownItem
                      selected={replySort === 'oldest'}
                      onClick={() => {
                        setReplySort('oldest');
                        setIsSortDropdownOpen(false);
                      }}
                    >
                      Oldest first
                    </CustomDropdownItem>
                    <CustomDropdownItem
                      selected={replySort === 'popular'}
                      onClick={() => {
                        setReplySort('popular');
                        setIsSortDropdownOpen(false);
                      }}
                    >
                      Most votes
                    </CustomDropdownItem>
                  </CustomDropdownContent>
                </CustomDropdown>
              </div>
            </div>

            <div className="bg-panel-bg border border-panel-border rounded-xl p-3">
              <textarea
                value={replyDraft}
                onChange={(e) => setReplyDraft(e.target.value)}
                rows={3}
                placeholder="Join the conversation..."
                className="w-full p-3 border border-panel-border rounded-xl bg-input-bg text-text-primary outline-none"
                disabled={!canPost || isPending}
              />
              <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
                <CustomDropdown
                  isOpen={isPlanDropdownOpen}
                  onOpenChange={setIsPlanDropdownOpen}
                  trigger={
                    <button
                      type="button"
                      className="w-full sm:w-64 px-4 py-2 border border-panel-border rounded-xl bg-input-bg text-text-primary text-left cursor-pointer flex items-center justify-between focus:outline-none hover:border-panel-border-strong transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={!canPost || isPending}
                    >
                      <span className="truncate text-sm font-medium min-w-0">{attachedPlanId ? postData.plans.find((p) => p.id === attachedPlanId)?.title || 'Attach plan' : 'No plan attached'}</span>
                      <Icon name="chevron-down" color="currentColor" width={16} height={16} className={`w-4 h-4 shrink-0 text-text-secondary transition-transform duration-200 ${isPlanDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>
                  }
                >
                  <CustomDropdownContent className="w-64 max-h-64 overflow-y-auto">
                    <CustomDropdownItem
                      selected={!attachedPlanId}
                      onClick={() => {
                        setAttachedPlanId('');
                        setIsPlanDropdownOpen(false);
                      }}
                    >
                      No plan attached
                    </CustomDropdownItem>
                    {postData.plans.map((plan) => (
                      <CustomDropdownItem
                        key={plan.id}
                        selected={attachedPlanId === plan.id}
                        onClick={() => {
                          setAttachedPlanId(plan.id);
                          setIsPlanDropdownOpen(false);
                        }}
                      >
                        Attach: {plan.title}
                      </CustomDropdownItem>
                    ))}
                  </CustomDropdownContent>
                </CustomDropdown>
                <button
                  type="button"
                  onClick={handleReply}
                  disabled={!canPost || isPending}
                  className="px-3 py-1.5 bg-uva-blue/90 text-white rounded-xl hover:bg-uva-blue text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isPending ? 'Submitting...' : 'Reply'}
                </button>
              </div>
            </div>

            {sortedAnswers.length === 0 && (
              <div className="bg-panel-bg border border-panel-border rounded-xl p-4">
                <p className="text-sm text-text-secondary">No replies yet.</p>
              </div>
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
