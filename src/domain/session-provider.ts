/**
 * セッションを供給するエージェント種別
 *
 * - ca = Codex
 * - cc = Claude Code
 */
export type SessionProvider = "ca" | "cc";

/**
 * unknown 値が SessionProvider か判定する
 */
export function isSessionProvider(value: unknown): value is SessionProvider {
  return value === "ca" || value === "cc";
}
