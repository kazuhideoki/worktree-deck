import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { loadClaudeTitlesForPaths, toProjectFolderName } from "./claude-session-file-store";

let root: string;
let projectsRoot: string;
let sessionsRoot: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "cc-store-"));
  projectsRoot = join(root, ".claude", "projects");
  sessionsRoot = join(root, ".claude", "sessions");
  await mkdir(projectsRoot, { recursive: true });
  await mkdir(sessionsRoot, { recursive: true });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

/**
 * JSONL 行群をファイルとして書き出す
 */
async function writeSession(folderName: string, fileName: string, lines: unknown[]): Promise<void> {
  const folder = join(projectsRoot, folderName);
  await mkdir(folder, { recursive: true });
  const text = lines.map((line) => JSON.stringify(line)).join("\n");
  await writeFile(join(folder, fileName), text, "utf8");
}

/**
 * ライブセッション状態をファイルとして書き出す
 */
async function writeLiveSession(fileName: string, content: unknown): Promise<void> {
  await writeFile(join(sessionsRoot, fileName), JSON.stringify(content), "utf8");
}

describe("toProjectFolderName", () => {
  it("英数字以外を - に変換する", () => {
    expect(toProjectFolderName("/Users/me/.worktree-deck/worktrees/wt/cc_list_all")).toBe(
      "-Users-me--worktree-deck-worktrees-wt-cc-list-all",
    );
  });
});

describe("loadClaudeTitlesForPaths", () => {
  it("worktree パスに対応するフォルダの cc セッションを provider:cc で返す", async () => {
    const worktreePath = "/Users/me/work/repo";
    const cwd = worktreePath;
    await writeSession(toProjectFolderName(worktreePath), "s1.jsonl", [
      { type: "user", cwd, message: { role: "user", content: "やって" }, timestamp: "2026-06-17T00:00:00.000Z" },
      { type: "ai-title", aiTitle: "セッションのタイトル" },
      {
        type: "assistant",
        cwd,
        message: { role: "assistant", content: [{ type: "text", text: "完了" }], stop_reason: "end_turn" },
      },
    ]);

    const result = await loadClaudeTitlesForPaths({
      paths: [worktreePath],
      env: {},
      homeDir: root,
    });

    const titles = result.get(worktreePath);
    expect(titles).toHaveLength(1);
    expect(titles?.[0]).toMatchObject({
      title: "セッションのタイトル",
      status: "done",
      provider: "cc",
      sessionKind: "main",
    });
  });

  it("サブディレクトリ起動のフォルダも前方一致で拾い行内 cwd で紐付ける", async () => {
    const worktreePath = "/Users/me/work/repo";
    const subCwd = "/Users/me/work/repo/packages/app";
    await writeSession(toProjectFolderName(subCwd), "s1.jsonl", [
      { type: "user", cwd: subCwd, message: { role: "user", content: "sub" }, timestamp: "2026-06-17T00:00:00.000Z" },
      {
        type: "assistant",
        cwd: subCwd,
        message: { role: "assistant", content: [{ type: "tool_use", id: "x", name: "Read" }], stop_reason: "tool_use" },
      },
    ]);

    const result = await loadClaudeTitlesForPaths({ paths: [worktreePath], env: {}, homeDir: root });
    const titles = result.get(worktreePath);
    expect(titles).toHaveLength(1);
    expect(titles?.[0]?.status).toBe("working");
  });

  it("CLAUDE_CONFIG_DIR の指定を尊重する", async () => {
    const worktreePath = "/Users/me/work/repo";
    await writeSession(toProjectFolderName(worktreePath), "s1.jsonl", [
      {
        type: "user",
        cwd: worktreePath,
        message: { role: "user", content: "hi" },
        timestamp: "2026-06-17T00:00:00.000Z",
      },
      {
        type: "assistant",
        cwd: worktreePath,
        message: { role: "assistant", content: [{ type: "text", text: "ok" }], stop_reason: "end_turn" },
      },
    ]);

    const result = await loadClaudeTitlesForPaths({
      paths: [worktreePath],
      env: { CLAUDE_CONFIG_DIR: join(root, ".claude") },
      homeDir: null,
    });
    expect(result.get(worktreePath)).toHaveLength(1);
  });

  it("生存中の Claude Code ライブセッションが waiting ならユーザー待ちとして返す", async () => {
    const worktreePath = "/Users/me/work/repo";
    const sessionId = "f803f9cd-42dd-41e7-ab10-002f1787aa84";
    await writeSession(toProjectFolderName(worktreePath), `${sessionId}.jsonl`, [
      { type: "user", cwd: worktreePath, message: { role: "user", content: "質問して" } },
      { type: "ai-title", aiTitle: "質問待ち" },
      {
        type: "assistant",
        cwd: worktreePath,
        message: { role: "assistant", content: [{ type: "tool_use", id: "x", name: "Read" }], stop_reason: "tool_use" },
      },
    ]);
    await writeLiveSession(`${process.pid}.json`, {
      pid: process.pid,
      sessionId,
      cwd: worktreePath,
      status: "waiting",
      updatedAt: Date.now(),
    });

    const result = await loadClaudeTitlesForPaths({ paths: [worktreePath], env: {}, homeDir: root });

    expect(result.get(worktreePath)?.[0]).toMatchObject({
      title: "質問待ち",
      isWaitingForUser: true,
      provider: "cc",
    });
  });

  it("終了済み pid の waiting ライブセッションはユーザー待ちとして返さない", async () => {
    const worktreePath = "/Users/me/work/repo";
    const sessionId = "f803f9cd-42dd-41e7-ab10-002f1787aa84";
    await writeSession(toProjectFolderName(worktreePath), `${sessionId}.jsonl`, [
      { type: "user", cwd: worktreePath, message: { role: "user", content: "質問して" } },
      { type: "ai-title", aiTitle: "古い質問待ち" },
      {
        type: "assistant",
        cwd: worktreePath,
        message: { role: "assistant", content: [{ type: "tool_use", id: "x", name: "Read" }], stop_reason: "tool_use" },
      },
    ]);
    await writeLiveSession("999999.json", {
      pid: 999999,
      sessionId,
      cwd: worktreePath,
      status: "waiting",
      updatedAt: Date.now(),
    });

    const result = await loadClaudeTitlesForPaths({ paths: [worktreePath], env: {}, homeDir: root });

    expect(result.get(worktreePath)?.[0]?.isWaitingForUser).toBe(false);
  });

  it("sessionId が一致しない waiting ライブセッションでは別エントリを待ち扱いにしない", async () => {
    const worktreePath = "/Users/me/work/repo";
    // ログのセッション（done）とは別 sessionId の waiting ライブセッション
    await writeSession(toProjectFolderName(worktreePath), "11111111-1111-1111-1111-111111111111.jsonl", [
      { type: "user", cwd: worktreePath, message: { role: "user", content: "やって" } },
      { type: "ai-title", aiTitle: "別セッション" },
      {
        type: "assistant",
        cwd: worktreePath,
        message: { role: "assistant", content: [{ type: "text", text: "完了" }], stop_reason: "end_turn" },
      },
    ]);
    await writeLiveSession(`${process.pid}.json`, {
      pid: process.pid,
      sessionId: "99999999-9999-9999-9999-999999999999", // ログに存在しない別 id
      cwd: worktreePath,
      status: "waiting",
      updatedAt: Date.now(),
    });

    const result = await loadClaudeTitlesForPaths({ paths: [worktreePath], env: {}, homeDir: root });

    expect(result.get(worktreePath)?.[0]?.isWaitingForUser).toBe(false);
  });

  it("status が busy / idle のライブセッションは待ち扱いにしない", async () => {
    const worktreePath = "/Users/me/work/repo";
    const sessionId = "f803f9cd-42dd-41e7-ab10-002f1787aa84";
    await writeSession(toProjectFolderName(worktreePath), `${sessionId}.jsonl`, [
      { type: "user", cwd: worktreePath, message: { role: "user", content: "やって" } },
      { type: "ai-title", aiTitle: "作業中" },
      {
        type: "assistant",
        cwd: worktreePath,
        message: { role: "assistant", content: [{ type: "tool_use", id: "x", name: "Read" }], stop_reason: "tool_use" },
      },
    ]);
    await writeLiveSession(`${process.pid}.json`, {
      pid: process.pid,
      sessionId,
      cwd: worktreePath,
      status: "busy",
      updatedAt: Date.now(),
    });

    const result = await loadClaudeTitlesForPaths({ paths: [worktreePath], env: {}, homeDir: root });

    expect(result.get(worktreePath)?.[0]?.isWaitingForUser).toBe(false);
  });

  it("対応フォルダが無ければ空を返す", async () => {
    const result = await loadClaudeTitlesForPaths({
      paths: ["/Users/me/no/match"],
      env: {},
      homeDir: root,
    });
    expect(result.size).toBe(0);
  });
});
