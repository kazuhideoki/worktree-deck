import { basename } from "node:path";

/**
 * repository mapping の値オブジェクト
 */
type RepositoryBranchNamingFields = Partial<Record<"branchNamePattern" | "branchNamePrompt", string>>;

export type RepositoryMapping = {
  repoRoot: string;
  mapValue: string;
} & RepositoryBranchNamingFields;

/**
 * repository mapping の入力型
 */
export type RepositoryMappingInput = Record<string, unknown>;

/**
 * repository mapping の要素を正規化する
 */
function normalize(entries: RepositoryMappingInput[]): RepositoryMapping[] {
  const mappingByRoot = new Map<string, RepositoryMapping>();
  for (const entry of entries) {
    const repoRoot = typeof entry.repoRoot === "string" ? entry.repoRoot.trim() : "";
    if (!repoRoot) {
      continue;
    }
    const rawValue = typeof entry.mapValue === "string" ? entry.mapValue.trim() : "";
    const branchNamePattern = typeof entry.branchNamePattern === "string" ? entry.branchNamePattern.trim() : "";
    const branchNamePrompt = typeof entry.branchNamePrompt === "string" ? entry.branchNamePrompt.trim() : "";
    const normalized: RepositoryMapping = {
      repoRoot,
      mapValue: rawValue || basename(repoRoot),
    };
    if (branchNamePattern.length > 0) {
      normalized.branchNamePattern = branchNamePattern;
    }
    if (branchNamePrompt.length > 0) {
      normalized.branchNamePrompt = branchNamePrompt;
    }
    mappingByRoot.set(repoRoot, normalized);
  }
  return Array.from(mappingByRoot.values());
}

/**
 * branch 名正規表現が設定されていれば JavaScript RegExp として検証する
 */
function validateBranchNamePattern(pattern: string): WorktreeRepositoryMappingValidationResult {
  const trimmed = pattern.trim();
  if (!trimmed) {
    return { ok: true };
  }
  try {
    new RegExp(trimmed);
    return { ok: true };
  } catch {
    return { ok: false, error: "Branch name pattern must be a valid regular expression." };
  }
}

/**
 * repository mapping 検証結果
 */
type WorktreeRepositoryMappingValidationResult = { ok: true } | { ok: false; error: string };

/**
 * repository mapping 全体を保存前に検証する
 */
function validate(entries: RepositoryMapping[]): WorktreeRepositoryMappingValidationResult {
  for (const entry of entries) {
    const result = validateBranchNamePattern(entry.branchNamePattern ?? "");
    if (!result.ok) {
      return result;
    }
  }
  return { ok: true };
}

/**
 * repository root に一致する mapping を返す
 */
function findByRepoRoot(entries: RepositoryMapping[], repoRoot: string): RepositoryMapping | null {
  const normalizedRepoRoot = repoRoot.trim();
  if (!normalizedRepoRoot) {
    return null;
  }
  return entries.find((entry) => entry.repoRoot === normalizedRepoRoot) ?? null;
}

/**
 * repository mapping を安定ソートする
 */
function sort(entries: RepositoryMapping[]): RepositoryMapping[] {
  return [...entries].sort((left, right) => {
    const valueDiff = left.mapValue.localeCompare(right.mapValue);
    if (valueDiff !== 0) {
      return valueDiff;
    }
    return left.repoRoot.localeCompare(right.repoRoot);
  });
}

/**
 * 保存値を mapping 配列へ変換する
 */
function parseFromStorageValue(value: unknown): RepositoryMapping[] {
  if (value === null || value === undefined) {
    return [];
  }
  if (typeof value === "string") {
    try {
      return parseFromStorageValue(JSON.parse(value) as unknown);
    } catch {
      return [];
    }
  }
  if (Array.isArray(value)) {
    return normalize(value as RepositoryMappingInput[]);
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if ("repoRoot" in record) {
      return normalize([{ repoRoot: record.repoRoot, mapValue: record.mapValue }]);
    }
    const entries = Object.entries(record).map(([repoRoot, mapValue]) => ({ repoRoot, mapValue }));
    return normalize(entries);
  }
  return [];
}

/**
 * repository mapping ドメインサービス関数群
 */
export const repositoryMappingService = {
  findByRepoRoot,
  normalize,
  sort,
  parseFromStorageValue,
  validate,
  validateBranchNamePattern,
} as const;
