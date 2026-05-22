import { basename } from "node:path";

import { type Worktree, type WorktreeMergeStatus, type WorktreeSection, type WorktreeTitle } from "../composition-root";
import { type RepositoryMapping } from "../domain/repository-mapping.service";
import { type WorktreeOpenApp, type WorktreeOpenAppMeta } from "../domain/worktree-open-app.service";
import { matchesSearchTerms, type SearchTerms } from "../search-utils";
import { formatLastCommitAt, formatWorktreeMetaLine } from "./worktree-ui-utils";

/**
 * origin と worktree を統合した表示エントリ
 */
export type SectionEntry =
  | { kind: "origin"; originPath: string; titles: WorktreeTitle[]; lastCommitAt: string | null; branch: string | null }
  | { kind: "worktree"; item: Worktree };

/**
 * worktree 一覧の表示モード
 */
export type WorktreeDeckDisplayMode = "show-all" | "worktrees-only";

/**
 * セクションへ mapping 由来の origin を付与した表示モデル
 */
type WorktreeSectionWithMappings = WorktreeSection & {
  mappedOrigins: string[];
};

/**
 * セクション生成時の追加オプション
 */
type BuildSectionsWithMappingsOptions = {
  titlesByPath?: Map<string, WorktreeTitle[]>;
};

/**
 * セッション状態の優先順位
 */
const SESSION_STATUS_PRIORITY: Record<NonNullable<WorktreeTitle["status"]>, number> = {
  done: 0,
  working: 1,
};

/**
 * スキル使用履歴の集計結果
 */
type SkillUsageSummary = {
  name: string;
  count: number;
};

/**
 * タイトル一覧にユーザー指示待ちが含まれるか判定する
 */
export function hasAnySessionWaitingForUser(titles: WorktreeTitle[]): boolean {
  return titles.some((entry) => entry.isWaitingForUser === true);
}

/**
 * worktree ブランチ名の表示文字列を組み立てる
 */
export function formatBranchTitle(args: { branch?: string | null; titles: WorktreeTitle[] }): string {
  const branchTitle = args.branch ?? "root";
  return hasAnySessionWaitingForUser(args.titles) ? `⚠️ ${branchTitle}` : branchTitle;
}

/**
 * 表示モード文字列を正規化する
 */
export function parseDisplayMode(value: string): WorktreeDeckDisplayMode {
  if (value === "worktrees-only") {
    return "worktrees-only";
  }
  return "show-all";
}

/**
 * 表示モードを次の状態へ切り替える
 */
export function toggleDisplayMode(currentMode: WorktreeDeckDisplayMode): WorktreeDeckDisplayMode {
  if (currentMode === "worktrees-only") {
    return "show-all";
  }
  return "worktrees-only";
}

/**
 * repo 単位にグループ化して並べ替える
 */
function groupWorktreesByRepo(worktrees: Worktree[]): WorktreeSection[] {
  const map = new Map<string, Worktree[]>();
  for (const item of worktrees) {
    const list = map.get(item.repo);
    if (list) {
      list.push(item);
    } else {
      map.set(item.repo, [item]);
    }
  }
  return Array.from(map.entries())
    .sort(([leftRepo], [rightRepo]) => leftRepo.localeCompare(rightRepo))
    .map(([repo, items]) => ({
      repo,
      items: items.sort((left, right) => (left.branch ?? "").localeCompare(right.branch ?? "")),
    }));
}

/**
 * worktree と mapping を統合したセクション一覧を作る
 */
export function buildSectionsWithMappings(
  worktrees: Worktree[],
  mappings: RepositoryMapping[],
  displayMode: WorktreeDeckDisplayMode = "show-all",
  options: BuildSectionsWithMappingsOptions = {},
): WorktreeSectionWithMappings[] {
  const sections = groupWorktreesByRepo(worktrees);
  const sectionMap = new Map<string, WorktreeSectionWithMappings>();
  for (const section of sections) {
    sectionMap.set(section.repo, { ...section, mappedOrigins: [] });
  }
  if (displayMode === "show-all") {
    for (const mapping of mappings) {
      const repoName = mapping.mapValue || basename(mapping.repoRoot);
      const entry = sectionMap.get(repoName) ?? { repo: repoName, items: [], mappedOrigins: [] };
      if (mapping.repoRoot) {
        entry.mappedOrigins.push(mapping.repoRoot);
      }
      if (!sectionMap.has(repoName)) {
        sectionMap.set(repoName, entry);
      }
    }
  }
  const titlesByPath = options.titlesByPath ?? new Map<string, WorktreeTitle[]>();
  return Array.from(sectionMap.values()).sort((left, right) => {
    const leftUpdatedAt = resolveSectionLatestSessionUpdatedAt(left, titlesByPath);
    const rightUpdatedAt = resolveSectionLatestSessionUpdatedAt(right, titlesByPath);
    if (leftUpdatedAt != null && rightUpdatedAt != null) {
      if (rightUpdatedAt !== leftUpdatedAt) {
        return rightUpdatedAt - leftUpdatedAt;
      }
    } else if (leftUpdatedAt != null && rightUpdatedAt == null) {
      return -1;
    } else if (leftUpdatedAt == null && rightUpdatedAt != null) {
      return 1;
    }
    const leftCount = left.items.length;
    const rightCount = right.items.length;
    const leftHasItems = leftCount > 0;
    const rightHasItems = rightCount > 0;
    if (leftHasItems !== rightHasItems) {
      return leftHasItems ? -1 : 1;
    }
    if (leftCount !== rightCount) {
      return rightCount - leftCount;
    }
    return left.repo.localeCompare(right.repo);
  });
}

/**
 * origin パスの一覧を構築しタイトル/最終コミットを紐付ける
 */
function buildOriginEntries(
  items: Worktree[],
  titlesByPath: Map<string, WorktreeTitle[]>,
  mappedOrigins: string[],
  originLastCommitByPath: Map<string, string | null>,
  originBranchByPath: Map<string, string | null>,
): { originPath: string; titles: WorktreeTitle[]; lastCommitAt: string | null; branch: string | null }[] {
  const originPaths = new Set<string>();
  for (const item of items) {
    if (item.originPath) {
      originPaths.add(item.originPath);
    }
  }
  for (const originPath of mappedOrigins) {
    if (originPath) {
      originPaths.add(originPath);
    }
  }
  return Array.from(originPaths).map((originPath) => ({
    originPath,
    titles: titlesByPath.get(originPath) ?? [],
    lastCommitAt: originLastCommitByPath.get(originPath) ?? null,
    branch: originBranchByPath.get(originPath) ?? null,
  }));
}

/**
 * エントリの検索用文字列を組み立てる
 */
function buildEntrySearchText(entry: SectionEntry, repo: string): string {
  if (entry.kind === "origin") {
    const keywords = buildSearchKeywords({
      repo,
      originPath: entry.originPath,
      branch: entry.branch,
    });
    return ["origin", entry.branch ?? "origin", ...keywords].join(" ").toLowerCase();
  }
  const item = entry.item;
  const branchTitle = item.branch ?? "root";
  const keywords = buildSearchKeywords({
    repo: item.repo,
    originPath: item.originPath,
    branch: item.branch,
  });
  return [branchTitle, ...keywords].join(" ").toLowerCase();
}

/**
 * 検索対象のキーワードを列挙する
 */
function buildSearchKeywords({
  repo,
  originPath,
  branch,
}: {
  repo: string;
  originPath?: string | null;
  branch?: string | null;
}): string[] {
  const keywords = [repo];
  if (branch) {
    keywords.push(branch);
  }
  if (originPath) {
    keywords.push(originPath);
  }
  return keywords;
}

/**
 * 検索トークンでエントリを絞り込む
 */
export function filterEntriesBySearchText(entries: SectionEntry[], repo: string, terms: SearchTerms): SectionEntry[] {
  return entries.filter((entry) => {
    const haystack = buildEntrySearchText(entry, repo);
    return matchesSearchTerms(haystack, terms);
  });
}

/**
 * Codex thread id が未解決の worktree パスを抽出する
 */
export function resolveUnresolvedCodexThreadPaths(metaByPath: Map<string, WorktreeOpenAppMeta>): string[] {
  return Array.from(metaByPath.entries())
    .filter(([, meta]) => meta.openApp === "codex-app" && meta.threadId === null)
    .map(([path]) => path);
}

/**
 * エントリから最新セッション更新時刻(ms)を取得する
 */
function resolveEntryLatestSessionUpdatedAt(entry: SectionEntry): number | null {
  const latestTitle = resolveEntryLatestTitle(entry);
  if (!latestTitle) {
    return null;
  }
  return latestTitle.updatedAt;
}

/**
 * エントリの最新タイトルを返す
 */
function resolveEntryLatestTitle(entry: SectionEntry): WorktreeTitle | null {
  const titles = entry.kind === "origin" ? entry.titles : entry.item.titleEntries;
  if (!titles || titles.length === 0) {
    return null;
  }
  return titles[0] ?? null;
}

/**
 * ステータスから優先順位を返す
 */
function resolveStatusPriority(status: WorktreeTitle["status"]): number {
  if (!status) {
    return Number.MAX_SAFE_INTEGER;
  }
  return SESSION_STATUS_PRIORITY[status];
}

/**
 * エントリの最新ステータス優先順位を返す
 */
function resolveEntryStatusPriority(entry: SectionEntry): number {
  const latestTitle = resolveEntryLatestTitle(entry);
  return resolveStatusPriority(latestTitle?.status ?? null);
}

/**
 * エントリの安定ソート用キーを作る
 */
function resolveEntrySortKey(entry: SectionEntry): string {
  if (entry.kind === "origin") {
    return `origin:${entry.originPath}`;
  }
  const branch = entry.item.branch ?? "";
  return `worktree:${branch}:${entry.item.path}`;
}

/**
 * 一覧アイテムの選択追跡用 ID を返す
 */
export function resolveEntryItemId(entry: SectionEntry): string {
  if (entry.kind === "origin") {
    return `origin:${entry.originPath}`;
  }
  return `worktree:${entry.item.path}`;
}

/**
 * origin と worktree を結合して並べ替えた一覧を作る
 */
export function buildSortedSectionEntries(args: {
  items: Worktree[];
  titlesByPath: Map<string, WorktreeTitle[]>;
  mappedOrigins: string[];
  originLastCommitByPath: Map<string, string | null>;
  originBranchByPath: Map<string, string | null>;
  includeOrigin?: boolean;
}): SectionEntry[] {
  const includeOrigin = args.includeOrigin ?? true;
  const originEntries = includeOrigin
    ? buildOriginEntries(
        args.items,
        args.titlesByPath,
        args.mappedOrigins,
        args.originLastCommitByPath,
        args.originBranchByPath,
      ).map((entry) => ({ kind: "origin" as const, ...entry }))
    : [];
  const worktreeEntries = args.items.map((item) => ({ kind: "worktree" as const, item }));
  return [...originEntries, ...worktreeEntries].sort((left, right) => {
    const leftStatusPriority = resolveEntryStatusPriority(left);
    const rightStatusPriority = resolveEntryStatusPriority(right);
    if (leftStatusPriority !== rightStatusPriority) {
      return leftStatusPriority - rightStatusPriority;
    }
    const leftSessionUpdatedAt = resolveEntryLatestSessionUpdatedAt(left);
    const rightSessionUpdatedAt = resolveEntryLatestSessionUpdatedAt(right);
    if (leftSessionUpdatedAt != null && rightSessionUpdatedAt != null) {
      if (rightSessionUpdatedAt !== leftSessionUpdatedAt) {
        return rightSessionUpdatedAt - leftSessionUpdatedAt;
      }
    } else if (leftSessionUpdatedAt != null && rightSessionUpdatedAt == null) {
      return -1;
    } else if (leftSessionUpdatedAt == null && rightSessionUpdatedAt != null) {
      return 1;
    }
    return resolveEntrySortKey(left).localeCompare(resolveEntrySortKey(right));
  });
}

/**
 * セッションタイトル表示用の Markdown を整形する
 */
export function formatTitleEntry(entry: WorktreeTitle): string {
  const latestMessage = entry.latestMessage ?? "最新メッセージなし";
  const singleLineMessage = latestMessage.replace(/[\r\n]+/g, " ");
  const skillUsageMarkdown = formatSkillUsageSummary(entry.skillUsages ?? []);
  const titleMarkdown = `## 「${entry.title}」\n${singleLineMessage}`;
  return skillUsageMarkdown ? `${skillUsageMarkdown}\n\n${titleMarkdown}` : titleMarkdown;
}

/**
 * スキル名の集計キーを作る
 */
function buildSkillUsageKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/**
 * スキル使用履歴を同名ごとに集計する
 */
function summarizeSkillUsages(skillUsages: NonNullable<WorktreeTitle["skillUsages"]>): SkillUsageSummary[] {
  const summaries = new Map<string, SkillUsageSummary>();
  for (const usage of skillUsages) {
    const name = usage.name.trim();
    if (!name) {
      continue;
    }
    const key = buildSkillUsageKey(name) || name;
    const existing = summaries.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      summaries.set(key, { name, count: 1 });
    }
  }
  return Array.from(summaries.values());
}

/**
 * Markdown 内のインラインコード用に文字列を整形する
 */
function formatInlineCode(value: string): string {
  return `\`${value.replace(/`/g, "")}\``;
}

/**
 * トップ画面詳細向けのスキル使用履歴 Markdown を作る
 */
function formatSkillUsageSummary(skillUsages: NonNullable<WorktreeTitle["skillUsages"]>): string | null {
  const summaries = summarizeSkillUsages(skillUsages);
  if (summaries.length === 0) {
    return null;
  }
  const items = summaries.map((summary) => {
    const count = summary.count > 1 ? ` x${summary.count}` : "";
    return `- ${formatInlineCode(summary.name)}${count}`;
  });
  return `## Skill Usage\n${items.join("\n")}`;
}

/**
 * baseRef の表示文字列を組み立てる
 */
function formatBaseRefInfo(baseRef: string, aheadCount?: number | null, behindCount?: number | null): string {
  const trimmed = baseRef.trim();
  if (!trimmed) {
    return "";
  }
  const resolvedAheadCount = aheadCount ?? 0;
  const resolvedBehindCount = behindCount ?? 0;
  return `Base: ${trimmed} (+${resolvedAheadCount} -${resolvedBehindCount})`;
}

/**
 * 1行メタ表示向けの baseRef 表示を組み立てる
 */
function formatBaseRefMetaLabel(
  baseRef?: string | null,
  aheadCount?: number | null,
  behindCount?: number | null,
): string | null {
  const trimmed = baseRef?.trim();
  if (!trimmed) {
    return null;
  }
  const resolvedAheadCount = aheadCount ?? 0;
  const resolvedBehindCount = behindCount ?? 0;
  return `${trimmed} (+${resolvedAheadCount} -${resolvedBehindCount})`;
}

/**
 * 詳細表示用の固定タイトルエントリを解決する
 */
function resolvePinnedTitleEntry(titles: WorktreeTitle[]): WorktreeTitle | null {
  const latest = titles[0];
  if (!latest) {
    return null;
  }
  const latestNonReview = titles.find(
    (entry) => entry.sessionKind !== "review" && entry.sessionKind !== "reviewSubagent",
  );
  return latestNonReview ?? latest;
}

/**
 * 詳細表示用の Markdown を組み立てる
 */
export function buildDetailMarkdown({
  title,
  titles,
  isTitlesLoading,
  mergeStatus,
  lastCommitAt,
  mergeStatusError,
  baseRef,
  aheadCount,
  behindCount,
  openApp,
  useLastCommitSeparator = true,
}: {
  title: string;
  titles: WorktreeTitle[];
  isTitlesLoading: boolean;
  mergeStatus?: WorktreeMergeStatus | null;
  lastCommitAt?: string | null;
  mergeStatusError?: string | null;
  baseRef?: string | null;
  aheadCount?: number | null;
  behindCount?: number | null;
  openApp?: WorktreeOpenApp | null;
  useLastCommitSeparator?: boolean;
}): string {
  void title;
  void openApp;
  const pinnedTitle = resolvePinnedTitleEntry(titles);
  const detailLines = pinnedTitle
    ? [formatTitleEntry(pinnedTitle)]
    : [isTitlesLoading ? "Loading session titles..." : "No session titles"];
  const lines: string[] = [];
  if (mergeStatus != null) {
    const metaLine = formatWorktreeMetaLine({
      baseRef: formatBaseRefMetaLabel(baseRef, aheadCount, behindCount),
      mergeStatus,
    });
    if (metaLine) {
      lines.push(metaLine);
    }
    if (mergeStatusError) {
      lines.push(`Merge Error: ${mergeStatusError}`);
    }
  } else {
    if (baseRef) {
      lines.push(formatBaseRefInfo(baseRef, aheadCount, behindCount));
    }
    if (lastCommitAt !== undefined) {
      lines.push(formatLastCommitAt(lastCommitAt, useLastCommitSeparator));
    }
  }
  if (lines.length > 0) {
    lines.push("");
  }
  lines.push("---", detailLines.join("\n\n"));
  return lines.join("\n");
}

/**
 * タイトル一覧から優先ステータスを決める
 */
export function resolveWorktreeStatus(entries: WorktreeTitle[]): WorktreeTitle["status"] {
  if (entries.length === 0) {
    return null;
  }
  const latest = entries[0];
  return latest?.status ?? null;
}

/**
 * セクション内の最新 session 更新時刻を返す
 */
function resolveSectionLatestSessionUpdatedAt(
  section: WorktreeSectionWithMappings,
  titlesByPath: Map<string, WorktreeTitle[]>,
): number | null {
  let latestUpdatedAt: number | null = null;
  for (const item of section.items) {
    const updatedAt = item.titleEntries?.[0]?.updatedAt ?? null;
    if (updatedAt == null) {
      continue;
    }
    if (latestUpdatedAt == null || updatedAt > latestUpdatedAt) {
      latestUpdatedAt = updatedAt;
    }
  }
  const originPaths = new Set<string>();
  for (const item of section.items) {
    if (item.originPath) {
      originPaths.add(item.originPath);
    }
  }
  for (const mappedOrigin of section.mappedOrigins) {
    if (mappedOrigin) {
      originPaths.add(mappedOrigin);
    }
  }
  for (const originPath of originPaths) {
    const updatedAt = titlesByPath.get(originPath)?.[0]?.updatedAt ?? null;
    if (updatedAt == null) {
      continue;
    }
    if (latestUpdatedAt == null || updatedAt > latestUpdatedAt) {
      latestUpdatedAt = updatedAt;
    }
  }
  return latestUpdatedAt;
}
