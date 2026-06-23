/* eslint-disable @typescript-eslint/strict-boolean-expressions -- Claude Code JSONL の unknown 形状を1行ずつ判定する */
import { normalizePathValue } from "./path-utils";
import type { SessionKind, SessionStatus } from "./session-log-parser.service";

/**
 * Claude Code セッションログ解析の完了結果
 *
 * ca の ParsedSessionLog のうち、一覧表示に必要な共通項目だけを返す。
 */
export type ParsedClaudeSessionLog = {
  title: string | null;
  cwds: string[];
  status: SessionStatus | null;
  latestMessage: string | null;
  startedAt: number | null;
  sessionKind: SessionKind;
  isWaitingForUser: boolean;
};

/**
 * Claude Code セッション解析の途中状態
 */
export type ClaudeSessionParseState = {
  cwds: Set<string>;
  aiTitle: string | null;
  firstUserMessage: string | null;
  firstUserTimestamp: string | null;
  latestMessage: { role: "user" | "assistant"; text: string } | null;
  lastConversationRole: "user" | "assistant" | null;
  lastAssistantStopReason: string | null;
  pendingToolUseIds: Set<string>;
  resolvedToolUseIds: Set<string>;
  waitingToolUseIds: Set<string>;
};

/**
 * タイトルとして表示する最大文字数
 */
const TITLE_MAX_LENGTH_CHARS = 60;

/**
 * 一覧解析で読み飛ばす付随イベントの .type 値
 */
const NOISE_ENTRY_TYPES = new Set<string>([
  "attachment",
  "mode",
  "permission-mode",
  "pr-link",
  "system",
  "file-history-snapshot",
  "queue-operation",
  "last-prompt",
]);

/**
 * ユーザー入力待ちを発生させる tool_use 名
 */
const WAITING_TOOL_USE_NAMES = new Set<string>(["AskUserQuestion", "ExitPlanMode"]);

/**
 * Claude Code セッション解析状態を初期化する
 */
function createParseState(): ClaudeSessionParseState {
  return {
    cwds: new Set<string>(),
    aiTitle: null,
    firstUserMessage: null,
    firstUserTimestamp: null,
    latestMessage: null,
    lastConversationRole: null,
    lastAssistantStopReason: null,
    pendingToolUseIds: new Set<string>(),
    resolvedToolUseIds: new Set<string>(),
    waitingToolUseIds: new Set<string>(),
  };
}

/**
 * message.content からテキストだけを連結して取り出す
 */
function extractTextFromContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }
  const texts: string[] = [];
  for (const block of content) {
    if (!block || typeof block !== "object") {
      continue;
    }
    const entry = block as Record<string, unknown>;
    if (entry.type === "text" && typeof entry.text === "string") {
      texts.push(entry.text);
    }
  }
  return texts.join("\n");
}

/**
 * assistant の content から tool_use ブロックを取り出す
 */
function extractToolUses(content: unknown): { id: string; name: string }[] {
  if (!Array.isArray(content)) {
    return [];
  }
  const results: { id: string; name: string }[] = [];
  for (const block of content) {
    if (!block || typeof block !== "object") {
      continue;
    }
    const entry = block as Record<string, unknown>;
    if (entry.type === "tool_use" && typeof entry.id === "string" && typeof entry.name === "string") {
      results.push({ id: entry.id, name: entry.name });
    }
  }
  return results;
}

/**
 * user の content から tool_result の対象 id を取り出す
 */
function extractToolResultIds(content: unknown): string[] {
  if (!Array.isArray(content)) {
    return [];
  }
  const results: string[] = [];
  for (const block of content) {
    if (!block || typeof block !== "object") {
      continue;
    }
    const entry = block as Record<string, unknown>;
    if (entry.type === "tool_result" && typeof entry.tool_use_id === "string") {
      results.push(entry.tool_use_id);
    }
  }
  return results;
}

/**
 * 行が一覧解析の対象外（付随イベント / メタ）か判定する
 */
function isNoiseEntry(value: Record<string, unknown>): boolean {
  if (value.isMeta === true) {
    return true;
  }
  return typeof value.type === "string" && NOISE_ENTRY_TYPES.has(value.type);
}

/**
 * cwd 文字列を正規化して状態へ加える
 */
function addCwd(state: ClaudeSessionParseState, value: unknown): void {
  if (typeof value !== "string") {
    return;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return;
  }
  state.cwds.add(normalizePathValue(trimmed));
}

/**
 * message オブジェクトを取り出す
 */
function extractMessage(value: Record<string, unknown>): Record<string, unknown> | null {
  const message = value.message;
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    return null;
  }
  return message as Record<string, unknown>;
}

/**
 * ai-title 行を反映する
 */
function applyAiTitleEntry(state: ClaudeSessionParseState, value: Record<string, unknown>): void {
  const aiTitle = value.aiTitle;
  if (typeof aiTitle === "string" && aiTitle.trim()) {
    state.aiTitle = aiTitle.trim();
  }
}

/**
 * user 行を反映する
 */
function applyUserEntry(state: ClaudeSessionParseState, value: Record<string, unknown>): void {
  addCwd(state, value.cwd);
  const message = extractMessage(value);
  if (!message) {
    return;
  }
  const toolResultIds = extractToolResultIds(message.content);
  for (const id of toolResultIds) {
    state.resolvedToolUseIds.add(id);
    state.pendingToolUseIds.delete(id);
    state.waitingToolUseIds.delete(id);
  }
  const text = extractTextFromContent(message.content).trim();
  // tool_result のみの user 行は会話エントリではないが、status 判定では「最後の行」として扱う
  state.lastConversationRole = "user";
  state.lastAssistantStopReason = null;
  if (!text) {
    return;
  }
  if (!state.firstUserMessage) {
    state.firstUserMessage = text;
    const timestamp = value.timestamp;
    state.firstUserTimestamp = typeof timestamp === "string" ? timestamp : null;
  }
  state.latestMessage = { role: "user", text };
}

/**
 * assistant 行を反映する
 */
function applyAssistantEntry(state: ClaudeSessionParseState, value: Record<string, unknown>): void {
  addCwd(state, value.cwd);
  const message = extractMessage(value);
  if (!message) {
    return;
  }
  for (const toolUse of extractToolUses(message.content)) {
    // Claude Code は tool_result 行が対応する tool_use 行より先に記録されることがある。
    if (state.resolvedToolUseIds.has(toolUse.id)) {
      continue;
    }
    state.pendingToolUseIds.add(toolUse.id);
    if (WAITING_TOOL_USE_NAMES.has(toolUse.name)) {
      state.waitingToolUseIds.add(toolUse.id);
    }
  }
  state.lastConversationRole = "assistant";
  state.lastAssistantStopReason = typeof message.stop_reason === "string" ? message.stop_reason : null;
  const text = extractTextFromContent(message.content).trim();
  if (text) {
    state.latestMessage = { role: "assistant", text };
  }
}

/**
 * セッションログの1行から解析状態を更新する
 */
function updateParseState(args: { line: string; state: ClaudeSessionParseState }): void {
  const { line, state } = args;
  if (!line.trim()) {
    return;
  }
  let parsed: Record<string, unknown>;
  try {
    const value = JSON.parse(line) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return;
    }
    parsed = value as Record<string, unknown>;
  } catch {
    return;
  }
  if (isNoiseEntry(parsed)) {
    return;
  }
  const type = parsed.type;
  if (type === "ai-title") {
    applyAiTitleEntry(state, parsed);
    return;
  }
  if (type === "user") {
    applyUserEntry(state, parsed);
    return;
  }
  if (type === "assistant") {
    applyAssistantEntry(state, parsed);
  }
}

/**
 * メッセージ先頭からタイトル用文字列を作る
 */
function extractTitleFromMessage(message: string): string | null {
  const trimmed = message.trim();
  if (!trimmed) {
    return null;
  }
  const newlineIndex = trimmed.search(/\r?\n/);
  const cutoff =
    newlineIndex === -1
      ? Math.min(trimmed.length, TITLE_MAX_LENGTH_CHARS)
      : Math.min(newlineIndex, TITLE_MAX_LENGTH_CHARS);
  const preview = trimmed.slice(0, cutoff).trim();
  return preview || null;
}

/**
 * メッセージ先頭からプレビュー用文字列を作る
 */
function extractPreviewFromMessage(message: string): string | null {
  const normalized = message
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
  return normalized || null;
}

/**
 * ログの時刻文字列をミリ秒に変換する
 */
function parseLogTimestampToMs(timestamp: string | null): number | null {
  if (!timestamp) {
    return null;
  }
  const parsed = Date.parse(timestamp);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * 解析状態から status を決定する
 */
function resolveStatus(state: ClaudeSessionParseState): SessionStatus | null {
  if (state.lastConversationRole == null) {
    return null;
  }
  if (state.waitingToolUseIds.size > 0) {
    return "working";
  }
  if (
    state.lastConversationRole === "assistant" &&
    state.lastAssistantStopReason === "end_turn" &&
    state.pendingToolUseIds.size === 0
  ) {
    return "done";
  }
  return "working";
}

/**
 * セッション解析状態を完了結果へ変換する
 */
function finalizeParseState(state: ClaudeSessionParseState): ParsedClaudeSessionLog {
  const titleSource = state.aiTitle ?? state.firstUserMessage;
  const title = titleSource ? extractTitleFromMessage(titleSource) : null;
  let latestMessage: string | null = null;
  if (state.latestMessage) {
    const preview = extractPreviewFromMessage(state.latestMessage.text);
    if (preview) {
      latestMessage = `${state.latestMessage.role === "assistant" ? "🤖" : "🙂"} ${preview}`;
    }
  }
  return {
    title,
    cwds: Array.from(state.cwds),
    status: title ? resolveStatus(state) : null,
    latestMessage,
    startedAt: parseLogTimestampToMs(state.firstUserTimestamp),
    sessionKind: "main",
    isWaitingForUser: state.waitingToolUseIds.size > 0,
  };
}

/**
 * Claude Code セッションログ解析の純粋関数群
 */
export const claudeSessionLogParserService = {
  createParseState,
  updateParseState,
  finalizeParseState,
} as const;
