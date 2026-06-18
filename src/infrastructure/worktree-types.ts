import type {
  SessionKind as ParserSessionKind,
  SessionMessage as ParserSessionMessage,
  SessionMessageRole as ParserSessionMessageRole,
  SessionSkillUsage as ParserSessionSkillUsage,
  SessionStatus as ParserSessionStatus,
} from "../domain/session-log-parser.service";
import type { SessionProvider } from "../domain/session-provider";

export type SessionKind = ParserSessionKind;
type SessionStatus = ParserSessionStatus;
export type SessionSkillUsage = ParserSessionSkillUsage;

export type WorktreeTitle = {
  title: string;
  status: SessionStatus | null;
  latestMessage: string | null;
  updatedAt: number;
  startedAt?: number | null;
  sessionPath?: string;
  sessionKind: SessionKind;
  isWaitingForUser?: boolean;
  skillUsages?: SessionSkillUsage[];
  /**
   * セッション供給元（未指定は ca 相当として扱う）
   */
  provider?: SessionProvider;
};

/**
 * セッションメッセージのロール
 */
export type SessionMessageRole = ParserSessionMessageRole;

/**
 * セッション詳細表示用のメッセージ
 */
export type SessionMessage = ParserSessionMessage;

export type Worktree = {
  repo: string;
  path: string;
  branch?: string;
  titleEntries?: WorktreeTitle[];
  originPath?: string;
  mergeStatus?: WorktreeMergeStatus;
  mergeStatusError?: string | null;
  lastCommitAt?: string | null;
  baseRef?: string | null;
  aheadCount?: number | null;
  behindCount?: number | null;
};

export type WorktreeSection = {
  repo: string;
  items: Worktree[];
};

export type WorktreeMergeStatus = "synced" | "unmerged" | "dirty" | "no-commit" | "unknown";
