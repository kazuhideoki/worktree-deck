/**
 * Claude モデル alias の選択値
 */
export type ClaudeModelAlias = "opus" | "sonnet" | "haiku";

/**
 * Claude reasoning effort の選択値（`claude --effort` に対応）
 */
export type ClaudeReasoningEffort = "low" | "medium" | "high" | "xhigh" | "max";

/**
 * Claude permission mode の選択値（`claude --permission-mode` に対応）
 *
 * - bypassPermissions = 全許可（自律実行）
 * - acceptEdits = 編集のみ自動許可
 * - plan = プランモード
 * - default = 既定（都度確認だが -p では確認できず拒否扱い）
 */
export type ClaudePermissionMode = "default" | "acceptEdits" | "bypassPermissions" | "plan";

/**
 * 初回 Claude セッションに適用するメタ情報
 */
export type ClaudeInitialSessionMetadata = {
  model: ClaudeModelAlias;
  reasoningEffort: ClaudeReasoningEffort;
  permissionMode: ClaudePermissionMode;
};

/**
 * Claude モデル選択肢
 */
export const CLAUDE_MODEL_OPTIONS: readonly ClaudeModelAlias[] = ["opus", "sonnet", "haiku"];

/**
 * Claude reasoning effort 選択肢
 */
export const CLAUDE_REASONING_EFFORT_OPTIONS: readonly ClaudeReasoningEffort[] = [
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
];

/**
 * Claude permission mode 選択肢（自律実行を既定に並べる）
 */
export const CLAUDE_PERMISSION_MODE_OPTIONS: readonly ClaudePermissionMode[] = [
  "bypassPermissions",
  "acceptEdits",
  "plan",
  "default",
];

/**
 * Claude 初回セッションの既定メタ情報
 *
 * Auto Start はバックグラウンド自律実行なので、編集もコマンドも進められる
 * bypassPermissions を既定にする（-p では都度承認ができないため）。
 */
export const DEFAULT_CLAUDE_INITIAL_SESSION_METADATA: ClaudeInitialSessionMetadata = {
  model: "opus",
  reasoningEffort: "medium",
  permissionMode: "bypassPermissions",
};

/**
 * model alias を有効値へ正規化する
 */
export function normalizeClaudeModel(value: string): ClaudeModelAlias {
  const trimmed = value.trim();
  return CLAUDE_MODEL_OPTIONS.includes(trimmed as ClaudeModelAlias)
    ? (trimmed as ClaudeModelAlias)
    : DEFAULT_CLAUDE_INITIAL_SESSION_METADATA.model;
}

/**
 * reasoning effort を有効値へ正規化する
 */
export function normalizeClaudeReasoningEffort(value: string): ClaudeReasoningEffort {
  const trimmed = value.trim();
  return CLAUDE_REASONING_EFFORT_OPTIONS.includes(trimmed as ClaudeReasoningEffort)
    ? (trimmed as ClaudeReasoningEffort)
    : DEFAULT_CLAUDE_INITIAL_SESSION_METADATA.reasoningEffort;
}

/**
 * permission mode を有効値へ正規化する
 */
export function normalizeClaudePermissionMode(value: string): ClaudePermissionMode {
  const trimmed = value.trim();
  return CLAUDE_PERMISSION_MODE_OPTIONS.includes(trimmed as ClaudePermissionMode)
    ? (trimmed as ClaudePermissionMode)
    : DEFAULT_CLAUDE_INITIAL_SESSION_METADATA.permissionMode;
}

/**
 * UI 由来のメタ情報をセッション開始に使う値へ正規化する
 */
export function normalizeClaudeMetadata(metadata: ClaudeInitialSessionMetadata): ClaudeInitialSessionMetadata {
  return {
    model: normalizeClaudeModel(metadata.model),
    reasoningEffort: normalizeClaudeReasoningEffort(metadata.reasoningEffort),
    permissionMode: normalizeClaudePermissionMode(metadata.permissionMode),
  };
}
