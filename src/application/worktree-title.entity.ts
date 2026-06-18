import type { SessionKind, SessionSkillUsage } from "../domain/session-log-parser.service";
import type { SessionProvider } from "../domain/session-provider";

/**
 * worktree に紐づくセッションタイトル表示情報
 */
export type WorktreeTitle = {
  title: string;
  status: "working" | "done" | null;
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
