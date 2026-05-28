/**
 * Worktree 作成フォームの開始モード
 */
export type WorktreeCreateStartMode = "auto-start" | "manual";

/**
 * Worktree 作成開始モードの表示定義
 */
const WORKTREE_CREATE_START_MODE_DEFINITIONS = {
  "auto-start": {
    title: "Auto Start",
  },
  manual: {
    title: "Manual",
  },
} as const satisfies Record<WorktreeCreateStartMode, { title: string }>;

/**
 * Worktree 作成開始モード値を正規化する
 */
function normalizeStartMode(value: unknown): WorktreeCreateStartMode | null {
  if (value === "auto-start" || value === "manual") {
    return value;
  }
  return null;
}

/**
 * 未保存時の Worktree 作成開始モードを解決する
 */
function resolveDefault(value: WorktreeCreateStartMode | null | undefined): WorktreeCreateStartMode {
  return value ?? "auto-start";
}

/**
 * Worktree 作成開始モードの表示名を返す
 */
function formatStartModeLabel(startMode: WorktreeCreateStartMode): string {
  return WORKTREE_CREATE_START_MODE_DEFINITIONS[startMode].title;
}

/**
 * Worktree 作成開始モードの選択肢を返す
 */
function listStartModeOptions(): { value: WorktreeCreateStartMode; title: string }[] {
  return (Object.keys(WORKTREE_CREATE_START_MODE_DEFINITIONS) as WorktreeCreateStartMode[]).map((value) => ({
    value,
    title: formatStartModeLabel(value),
  }));
}

/**
 * Worktree 作成開始モードのドメインサービス関数群
 */
export const worktreeCreateStartModeService = {
  formatStartModeLabel,
  listStartModeOptions,
  normalizeStartMode,
  resolveDefault,
} as const;
