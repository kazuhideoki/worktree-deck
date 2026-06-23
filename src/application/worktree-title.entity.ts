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

/**
 * セッションログのパスから session id（ファイル名から拡張子を除いた値）を取り出す
 */
function resolveSessionIdFromPath(sessionPath: string): string {
  const fileName = sessionPath.trim().split("/").pop() ?? "";
  return fileName.endsWith(".jsonl") ? fileName.slice(0, -".jsonl".length) : fileName;
}

/**
 * 並び順に依存せず「開始が最も古い」基準値を返す（startedAt 優先、無ければ updatedAt）
 */
function resolveSessionStartOrder(title: WorktreeTitle): number {
  return title.startedAt ?? title.updatedAt;
}

/**
 * 最初（最古）の cc セッションから `claude --resume <id>` コマンドを組み立てる
 *
 * Claude の headless（`claude -p`）セッションは `claude --resume` の picker や
 * `claude -c` に出ない仕様のため、session id を明示した再開コマンドを提供する。
 * 用途は「Auto Start で仕込んだセッションを後で再開する」こと。Auto Start は
 * worktree を新規作成して最初のセッションを作るため、最初（startedAt 最小）の
 * cc セッションが Auto Start セッションになる。後から resume すると updatedAt は
 * 新しくなるため、最新ではなく開始時刻で「最初」を選ぶ。cc セッションが無い場合は null。
 */
export function resolveClaudeResumeCommand(titles: WorktreeTitle[]): string | null {
  const claudeTitles = titles.filter((title) => title.provider === "cc" && (title.sessionPath ?? "").trim().length > 0);
  if (claudeTitles.length === 0) {
    return null;
  }
  const first = claudeTitles.reduce((current, candidate) =>
    resolveSessionStartOrder(candidate) < resolveSessionStartOrder(current) ? candidate : current,
  );
  const sessionId = resolveSessionIdFromPath(first.sessionPath ?? "");
  return sessionId.length > 0 ? `claude --resume ${sessionId}` : null;
}
