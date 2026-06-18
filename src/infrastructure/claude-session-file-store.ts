import { createReadStream, existsSync, promises as fs } from "node:fs";
import { basename, join } from "node:path";
import { createInterface } from "node:readline";

import { LocalStorage } from "@raycast/api";

import {
  claudeSessionLogParserService,
  type ParsedClaudeSessionLog,
} from "../domain/claude-session-log-parser.service";
import { sessionLogParserService, type SessionStatus } from "../domain/session-log-parser.service";
import { expandHomePath, normalizePathValue } from "../domain/path-utils";
import { loadEnvValue } from "./env/env-store";
import type { WorktreeTitle } from "./worktree-types";

type EnvValueContext = {
  env: NodeJS.ProcessEnv;
  homeDir: string | null;
};

type ClaudeTitlesCacheFileEntry = {
  mtimeMs: number;
  size: number;
  updatedAt: number;
  startedAt: number | null;
  title: string | null;
  latestMessage: string | null;
  status: SessionStatus | null;
  cwds: string[];
  isWaitingForUser: boolean;
};

type ClaudeTitlesCacheStorage = {
  cachedAt: number;
  files: Record<string, ClaudeTitlesCacheFileEntry>;
};

const ENV_CLAUDE_CONFIG_DIR = "CLAUDE_CONFIG_DIR";
const ENV_DONE_THRESHOLD_DAYS = "WORKTREE_DECK_DONE_THRESHOLD_DAYS";
const DEFAULT_CLAUDE_DIR_NAME = ".claude";
const PROJECTS_DIR_NAME = "projects";
const SESSIONS_DIR_NAME = "sessions";
const SESSION_FILE_EXTENSION = ".jsonl";
const LIVE_SESSION_FILE_EXTENSION = ".json";
/**
 * Claude タイトルキャッシュのキー接頭辞
 */
const TITLES_CACHE_KEY_PREFIX = "worktree-deck.claude-titles-cache.v1";

/**
 * working を done 扱いにする経過日数を取得する
 */
async function loadDoneThresholdDays(args: EnvValueContext): Promise<number | null> {
  const raw = await loadEnvValue(args, ENV_DONE_THRESHOLD_DAYS);
  if (!raw) {
    return null;
  }
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

/**
 * ~/.claude/projects 相当の探索ルートを解決する
 */
async function loadClaudeProjectsRoot(args: EnvValueContext): Promise<string | null> {
  const configDir = await loadEnvValue(args, ENV_CLAUDE_CONFIG_DIR);
  if (configDir) {
    const expanded = expandHomePath(configDir.trim(), args.homeDir);
    return normalizePathValue(join(expanded, PROJECTS_DIR_NAME));
  }
  if (!args.homeDir) {
    return null;
  }
  return normalizePathValue(join(args.homeDir, DEFAULT_CLAUDE_DIR_NAME, PROJECTS_DIR_NAME));
}

/**
 * ~/.claude/sessions 相当の探索ルートを解決する
 */
async function loadClaudeSessionsRoot(args: EnvValueContext): Promise<string | null> {
  const configDir = await loadEnvValue(args, ENV_CLAUDE_CONFIG_DIR);
  if (configDir) {
    const expanded = expandHomePath(configDir.trim(), args.homeDir);
    return normalizePathValue(join(expanded, SESSIONS_DIR_NAME));
  }
  if (!args.homeDir) {
    return null;
  }
  return normalizePathValue(join(args.homeDir, DEFAULT_CLAUDE_DIR_NAME, SESSIONS_DIR_NAME));
}

/**
 * cwd / worktree パスを projects フォルダ名へ変換する
 */
export function toProjectFolderName(path: string): string {
  return normalizePathValue(path).replace(/[^A-Za-z0-9]/g, "-");
}

/**
 * worktree パス群に対応する projects フォルダを特定する
 */
async function collectMatchingFolders(projectsRoot: string, paths: string[]): Promise<string[]> {
  if (!existsSync(projectsRoot)) {
    return [];
  }
  let entries;
  try {
    entries = await fs.readdir(projectsRoot, { withFileTypes: true });
  } catch {
    return [];
  }
  const expectedNames = paths.map((path) => toProjectFolderName(path));
  const matched = new Set<string>();
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const name = entry.name;
    const isMatch = expectedNames.some(
      (expected) => expected.length > 0 && (name === expected || name.startsWith(`${expected}-`)),
    );
    if (isMatch) {
      matched.add(join(projectsRoot, name));
    }
  }
  return Array.from(matched);
}

/**
 * フォルダ配下のセッションファイルを集める
 */
async function collectSessionFiles(folder: string): Promise<{ path: string; updatedAt: number; size: number }[]> {
  let entries;
  try {
    entries = await fs.readdir(folder, { withFileTypes: true });
  } catch {
    return [];
  }
  const results: { path: string; updatedAt: number; size: number }[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(SESSION_FILE_EXTENSION)) {
      continue;
    }
    const filePath = join(folder, entry.name);
    try {
      const stat = await fs.stat(filePath);
      results.push({ path: filePath, updatedAt: stat.mtimeMs, size: stat.size });
    } catch {
      continue;
    }
  }
  return results;
}

type ClaudeLiveSession = {
  sessionId: string;
  cwd: string;
  status: "idle" | "busy" | "waiting";
};

/**
 * 生存中プロセスだけをライブセッションとして扱う
 */
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/**
 * Claude Code のライブセッション状態を正規化する
 */
function normalizeLiveSession(value: unknown): ClaudeLiveSession | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const pid = typeof raw.pid === "number" ? raw.pid : null;
  const sessionId = typeof raw.sessionId === "string" ? raw.sessionId : null;
  const cwd = typeof raw.cwd === "string" ? raw.cwd : null;
  const status = raw.status === "idle" || raw.status === "busy" || raw.status === "waiting" ? raw.status : null;
  if (pid == null || sessionId == null || cwd == null || status == null || !isProcessAlive(pid)) {
    return null;
  }
  return { sessionId, cwd, status };
}

/**
 * sessions/*.json からライブの waiting セッションを読む
 */
async function loadWaitingLiveSessions(sessionsRoot: string | null): Promise<ClaudeLiveSession[]> {
  if (!sessionsRoot || !existsSync(sessionsRoot)) {
    return [];
  }
  let entries;
  try {
    entries = await fs.readdir(sessionsRoot, { withFileTypes: true });
  } catch {
    return [];
  }
  const sessions: ClaudeLiveSession[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(LIVE_SESSION_FILE_EXTENSION)) {
      continue;
    }
    try {
      const raw = await fs.readFile(join(sessionsRoot, entry.name), "utf8");
      const session = normalizeLiveSession(JSON.parse(raw) as unknown);
      if (session?.status === "waiting") {
        sessions.push(session);
      }
    } catch {
      continue;
    }
  }
  return sessions;
}

/**
 * セッションファイルを全行解析する
 */
async function parseClaudeSessionFile(filePath: string): Promise<ParsedClaudeSessionLog> {
  const state = claudeSessionLogParserService.createParseState();
  const stream = createReadStream(filePath, { encoding: "utf8" });
  const reader = createInterface({ input: stream, crlfDelay: Infinity });
  try {
    for await (const line of reader) {
      claudeSessionLogParserService.updateParseState({ line, state });
    }
  } finally {
    reader.close();
    stream.destroy();
  }
  return claudeSessionLogParserService.finalizeParseState(state);
}

/**
 * Claude タイトルキャッシュ用のキーを生成する
 */
function buildTitlesCacheKey(projectsRoot: string): string {
  const encoded = Buffer.from(projectsRoot).toString("base64");
  return `${TITLES_CACHE_KEY_PREFIX}:${encoded}`;
}

/**
 * キャッシュ保存値を正規化する
 */
function normalizeTitlesCacheStorage(value: unknown): ClaudeTitlesCacheStorage | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const cachedAt = typeof raw.cachedAt === "number" ? raw.cachedAt : null;
  const filesRaw = raw.files;
  if (cachedAt == null || !filesRaw || typeof filesRaw !== "object") {
    return null;
  }
  const files: Record<string, ClaudeTitlesCacheFileEntry> = {};
  for (const [filePath, entry] of Object.entries(filesRaw as Record<string, unknown>)) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const rawEntry = entry as Record<string, unknown>;
    const mtimeMs = typeof rawEntry.mtimeMs === "number" ? rawEntry.mtimeMs : null;
    const size = typeof rawEntry.size === "number" ? rawEntry.size : null;
    const updatedAt = typeof rawEntry.updatedAt === "number" ? rawEntry.updatedAt : null;
    const startedAt = typeof rawEntry.startedAt === "number" ? rawEntry.startedAt : null;
    const title = typeof rawEntry.title === "string" ? rawEntry.title : null;
    const latestMessage = typeof rawEntry.latestMessage === "string" ? rawEntry.latestMessage : null;
    const status = rawEntry.status === "working" || rawEntry.status === "done" ? rawEntry.status : null;
    const isWaitingForUser = typeof rawEntry.isWaitingForUser === "boolean" ? rawEntry.isWaitingForUser : false;
    const cwdsRaw = rawEntry.cwds;
    if (mtimeMs == null || size == null || updatedAt == null || !Array.isArray(cwdsRaw)) {
      continue;
    }
    const cwds = cwdsRaw.filter((item): item is string => typeof item === "string");
    files[filePath] = { mtimeMs, size, updatedAt, startedAt, title, latestMessage, status, cwds, isWaitingForUser };
  }
  return { cachedAt, files };
}

/**
 * キャッシュを読み込む
 */
async function loadTitlesCacheStorage(key: string): Promise<ClaudeTitlesCacheStorage | null> {
  try {
    const raw = await LocalStorage.getItem<string>(key);
    if (!raw) {
      return null;
    }
    return normalizeTitlesCacheStorage(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

/**
 * キャッシュを保存する
 */
async function saveTitlesCacheStorage(key: string, value: ClaudeTitlesCacheStorage): Promise<void> {
  try {
    await LocalStorage.setItem(key, JSON.stringify(value));
  } catch {
    // キャッシュ保存失敗は一覧取得を止めない
  }
}

/**
 * working を経過日数しきい値で done に倒す
 */
function resolveStatusWithThreshold(args: {
  status: SessionStatus | null;
  updatedAt: number;
  nowMs: number;
  doneThresholdMs: number | null;
}): SessionStatus | null {
  if (
    args.status === "working" &&
    args.doneThresholdMs != null &&
    args.updatedAt <= args.nowMs - args.doneThresholdMs
  ) {
    return "done";
  }
  return args.status;
}

/**
 * セッションファイルパスから Claude の sessionId を取り出す
 */
function resolveSessionIdFromLogPath(sessionPath: string): string {
  return basename(sessionPath, SESSION_FILE_EXTENSION);
}

/**
 * ライブの waiting 状態をログ由来タイトルへ反映する
 */
function applyWaitingLiveSessions(args: {
  titlesByPath: Map<string, Map<string, WorktreeTitle>>;
  waitingSessions: ClaudeLiveSession[];
  pathEntries: ReturnType<typeof sessionLogParserService.buildPathEntries>;
}): void {
  for (const session of args.waitingSessions) {
    const matchedPath = sessionLogParserService.matchPath(session.cwd, args.pathEntries);
    if (!matchedPath) {
      continue;
    }
    const entries = args.titlesByPath.get(matchedPath);
    if (!entries) {
      continue;
    }
    // sessionId が一致するエントリのみ待ち扱いにする（不一致で無関係セッションを誤表示しない）
    const matchedEntry = Array.from(entries.entries()).find(
      ([sessionPath]) => resolveSessionIdFromLogPath(sessionPath) === session.sessionId,
    );
    if (matchedEntry) {
      matchedEntry[1].isWaitingForUser = true;
    }
  }
}

/**
 * Claude Code セッションログからパス別タイトルを収集する
 */
export async function loadClaudeTitlesForPaths(args: {
  paths: string[];
  env: NodeJS.ProcessEnv;
  homeDir: string | null;
}): Promise<Map<string, WorktreeTitle[]>> {
  if (args.paths.length === 0) {
    return new Map();
  }
  const nowMs = Date.now();
  const [projectsRoot, sessionsRoot, doneThresholdDays] = await Promise.all([
    loadClaudeProjectsRoot(args),
    loadClaudeSessionsRoot(args),
    loadDoneThresholdDays(args),
  ]);
  if (!projectsRoot) {
    return new Map();
  }
  const doneThresholdMs = doneThresholdDays != null ? doneThresholdDays * 24 * 60 * 60 * 1000 : null;

  const folders = await collectMatchingFolders(projectsRoot, args.paths);
  if (folders.length === 0) {
    return new Map();
  }

  const pathEntries = sessionLogParserService.buildPathEntries(args.paths);
  const cacheKey = buildTitlesCacheKey(projectsRoot);
  const cachedStorage = await loadTitlesCacheStorage(cacheKey);
  const cachedFiles = cachedStorage?.files ?? {};
  const nextCacheFiles: Record<string, ClaudeTitlesCacheFileEntry> = {};
  let cacheMissCount = 0;

  // path -> (titleKey -> WorktreeTitle)
  const titlesByPath = new Map<string, Map<string, WorktreeTitle>>();

  for (const folder of folders) {
    const sessionFiles = await collectSessionFiles(folder);
    for (const sessionFile of sessionFiles) {
      try {
        const cachedEntry = cachedFiles[sessionFile.path];
        const isCachedSame =
          cachedEntry != null && cachedEntry.mtimeMs === sessionFile.updatedAt && cachedEntry.size === sessionFile.size;
        let entry: ClaudeTitlesCacheFileEntry;
        if (isCachedSame) {
          entry = cachedEntry;
        } else {
          cacheMissCount += 1;
          const parsed = await parseClaudeSessionFile(sessionFile.path);
          entry = {
            mtimeMs: sessionFile.updatedAt,
            size: sessionFile.size,
            updatedAt: sessionFile.updatedAt,
            startedAt: parsed.startedAt,
            title: parsed.title,
            latestMessage: parsed.latestMessage,
            status: parsed.status,
            cwds: parsed.cwds,
            isWaitingForUser: parsed.isWaitingForUser,
          };
        }
        nextCacheFiles[sessionFile.path] = entry;

        if (!entry.title || entry.cwds.length === 0) {
          continue;
        }
        const resolvedStatus = resolveStatusWithThreshold({
          status: entry.status,
          updatedAt: entry.updatedAt,
          nowMs,
          doneThresholdMs,
        });
        const matchedPaths = new Set<string>();
        for (const cwd of entry.cwds) {
          const matched = sessionLogParserService.matchPath(cwd, pathEntries);
          if (matched) {
            matchedPaths.add(matched);
          }
        }
        for (const matched of matchedPaths) {
          const titleEntry: WorktreeTitle = {
            title: entry.title,
            status: resolvedStatus,
            latestMessage: entry.latestMessage,
            updatedAt: entry.updatedAt,
            startedAt: entry.startedAt,
            sessionPath: sessionFile.path,
            sessionKind: "main",
            isWaitingForUser: entry.isWaitingForUser,
            skillUsages: [],
            provider: "cc",
          };
          const existing = titlesByPath.get(matched);
          if (existing) {
            existing.set(sessionFile.path, titleEntry);
          } else {
            titlesByPath.set(matched, new Map([[sessionFile.path, titleEntry]]));
          }
        }
      } catch {
        continue;
      }
    }
  }

  if (cacheMissCount > 0 || cachedStorage == null) {
    void saveTitlesCacheStorage(cacheKey, { cachedAt: nowMs, files: nextCacheFiles });
  }

  applyWaitingLiveSessions({
    titlesByPath,
    waitingSessions: await loadWaitingLiveSessions(sessionsRoot),
    pathEntries,
  });

  const result = new Map<string, WorktreeTitle[]>();
  for (const [path, entries] of titlesByPath) {
    result.set(
      path,
      Array.from(entries.values()).sort((left, right) => {
        if (right.updatedAt !== left.updatedAt) {
          return right.updatedAt - left.updatedAt;
        }
        return right.title.localeCompare(left.title);
      }),
    );
  }
  return result;
}
