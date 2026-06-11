import type { WorktreeTitle } from "./worktree-title.entity";

/**
 * worktree ブランチに紐づく GitHub Pull Request 情報
 */
export type WorktreePullRequestInfo = {
  number: number;
  title: string;
  url: string;
  state: string;
  isDraft: boolean;
  reviewDecision: string | null;
  headRefName: string | null;
  baseRefName: string | null;
};

/**
 * worktree 一覧表示で扱うエンティティ
 */
export type Worktree = {
  repo: string;
  path: string;
  branch?: string;
  titleEntries?: WorktreeTitle[];
  originPath?: string;
  mergeStatus?: "synced" | "unmerged" | "dirty" | "no-commit" | "unknown";
  mergeStatusError?: string | null;
  lastCommitAt?: string | null;
  baseRef?: string | null;
  aheadCount?: number | null;
  behindCount?: number | null;
  pullRequest?: WorktreePullRequestInfo | null;
};
