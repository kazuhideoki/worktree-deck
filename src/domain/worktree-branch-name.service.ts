/**
 * branch 名生成で Codex に渡す最小プロンプト
 */
const BRANCH_NAME_GENERATION_PROMPT_HEADER =
  "Generate a concise Git branch name for this task. Output only the branch name.";

/**
 * Git branch 名として明らかに使えない文字列を検出する条件
 */
const INVALID_BRANCH_NAME_PATTERN = /[\s~^:?*[\]\\]/;

/**
 * domain 処理の成功/失敗を表す結果値
 */
type WorktreeBranchNameResult<TValue> = { ok: true; value: TValue } | { ok: false; error: string };

/**
 * repository ごとの branch 名生成設定
 */
export type WorktreeBranchNamingRule = {
  pattern: string;
  prompt: string;
};

/**
 * 初期プロンプトから branch 名生成用のプロンプトを組み立てる
 */
function buildGenerationPrompt(
  initialPrompt: string,
  rule: WorktreeBranchNamingRule,
  retry: { branch: string; error: string } | null,
): WorktreeBranchNameResult<string> {
  const trimmed = initialPrompt.trim();
  if (!trimmed) {
    return { ok: false, error: "Initial prompt is required." };
  }
  const sections = [BRANCH_NAME_GENERATION_PROMPT_HEADER];
  const pattern = rule.pattern.trim();
  if (pattern.length > 0) {
    sections.push(`Branch naming regular expression:\n${pattern}`);
  }
  const prompt = rule.prompt.trim();
  if (prompt.length > 0) {
    sections.push(`Additional branch naming instruction:\n${prompt}`);
  }
  if (retry !== null) {
    sections.push(`Previous generated branch name was rejected:\n${retry.branch}\nReason:\n${retry.error}`);
  }
  sections.push(`Task:\n${trimmed}`);
  return { ok: true, value: sections.join("\n\n") };
}

/**
 * 生成結果から branch 名候補だけを抽出する
 */
function extractBranchNameCandidate(value: string): string {
  const withoutFence = value
    .trim()
    .replace(/^```(?:[a-zA-Z0-9_-]+)?\s*/, "")
    .replace(/\s*```$/, "")
    .trim();
  const firstLine = withoutFence
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  return (firstLine ?? "")
    .replace(/^git\s+checkout\s+-b\s+/i, "")
    .replace(/^["'`]+|["'`]+$/g, "")
    .trim();
}

/**
 * 制御文字を含むか判定する
 */
function hasControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });
}

/**
 * Git branch 名として扱える形か検証する
 */
function validateBranchName(branch: string): WorktreeBranchNameResult<string> {
  if (!branch) {
    return { ok: false, error: "Generated branch name is empty." };
  }
  if (
    branch === "@" ||
    branch.startsWith("/") ||
    branch.startsWith("-") ||
    branch.endsWith("/") ||
    branch.endsWith(".") ||
    branch.includes("..") ||
    branch.includes("//") ||
    branch.includes("@{") ||
    branch.split("/").some((segment) => !segment || segment.startsWith(".") || segment.endsWith(".lock")) ||
    INVALID_BRANCH_NAME_PATTERN.test(branch) ||
    hasControlCharacter(branch)
  ) {
    return { ok: false, error: "Generated branch name is invalid." };
  }
  return { ok: true, value: branch };
}

/**
 * Codex の出力を branch 名として正規化する
 */
function normalizeGeneratedBranchName(value: string): WorktreeBranchNameResult<string> {
  const candidate = extractBranchNameCandidate(value);
  return validateBranchName(candidate);
}

/**
 * 設定された repository 別正規表現に branch 名が一致するか検証する
 */
function validateBranchNameRule(branch: string, rule: WorktreeBranchNamingRule): WorktreeBranchNameResult<string> {
  const pattern = rule.pattern.trim();
  if (pattern.length === 0) {
    return { ok: true, value: branch };
  }
  let regex: RegExp;
  try {
    regex = new RegExp(pattern);
  } catch {
    return { ok: false, error: "Branch name pattern must be a valid regular expression." };
  }
  if (!regex.test(branch)) {
    return { ok: false, error: `Generated branch name does not match pattern: ${pattern}` };
  }
  return { ok: true, value: branch };
}

/**
 * worktree branch 名生成のドメインサービス関数群
 */
export const worktreeBranchNameService = {
  buildGenerationPrompt,
  normalizeGeneratedBranchName,
  validateBranchNameRule,
} as const;
