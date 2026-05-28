import { expandHomePath, normalizePathValue } from "../domain/path-utils";

/**
 * 初期起動時に使う worktree 作成・スキャン先
 */
const DEFAULT_WORKTREE_BASE_PATH = "~/.worktree-deck/worktrees";

/**
 * GIT_WORKTREE_PATH の値を実行環境の絶対パスへ正規化する
 */
function normalizeWorktreeBasePath(value: string, homeDir: string | null): string {
  return normalizePathValue(expandHomePath(value, homeDir));
}

export async function loadBasePath(args: { env: NodeJS.ProcessEnv; homeDir: string | null }): Promise<string> {
  const fromEnv = args.env.GIT_WORKTREE_PATH?.trim();
  if (fromEnv) {
    return normalizeWorktreeBasePath(fromEnv, args.homeDir);
  }

  return normalizeWorktreeBasePath(DEFAULT_WORKTREE_BASE_PATH, args.homeDir);
}
