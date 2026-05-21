import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const readFileMock = vi.hoisted(() => vi.fn<(path: string, encoding: string) => Promise<string>>());
const mkdirMock = vi.hoisted(() => vi.fn<(path: string, options: { recursive: boolean }) => Promise<void>>());
const writeFileMock = vi.hoisted(() => vi.fn<(path: string, value: string, encoding: string) => Promise<void>>());

const loadEnvValueMock = vi.hoisted(() => vi.fn());
const resolveRootEnvPathMock = vi.hoisted(() => vi.fn());

vi.mock("node:fs", () => {
  return {
    promises: {
      readFile: readFileMock,
      mkdir: mkdirMock,
      writeFile: writeFileMock,
    },
  };
});

vi.mock("../env/env-store", () => {
  return {
    loadEnvValue: loadEnvValueMock,
    resolveRootEnvPath: resolveRootEnvPathMock,
  };
});

import { readWorktreeDeckFileStorageJson, writeWorktreeDeckFileStorageJson } from "./json-file-storage";

/**
 * file storage 解決用の最小入力を返す
 */
function buildArgs() {
  return {
    env: {},
    cwd: "/tmp/dev-flow/current",
    homeDir: "/Users/tester",
    packageDir: "/tmp/dev-flow",
    packageName: "worktree-deck",
  };
}

describe("infrastructure/storage/json-file-storage", () => {
  beforeEach(() => {
    readFileMock.mockReset();
    mkdirMock.mockReset();
    writeFileMock.mockReset();
    loadEnvValueMock.mockReset();
    resolveRootEnvPathMock.mockReset();

    loadEnvValueMock.mockImplementation(async (_args, key: string) => {
      if (key === "WORKTREE_DECK_STORAGE_DIR") {
        return "/tmp/dev-flow/storage";
      }
      return null;
    });
    resolveRootEnvPathMock.mockResolvedValue("/tmp/dev-flow/.env");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("readWorktreeDeckFileStorageJson はファイル不在時に null を返す", async () => {
    const error = new Error("not found") as Error & { code?: string };
    error.code = "ENOENT";
    readFileMock.mockRejectedValue(error);

    await expect(readWorktreeDeckFileStorageJson(buildArgs(), "sample.json")).resolves.toBeNull();
  });

  it("readWorktreeDeckFileStorageJson は JSON をオブジェクトとして返す", async () => {
    readFileMock.mockResolvedValue('{"value":1}');

    await expect(readWorktreeDeckFileStorageJson(buildArgs(), "sample.json")).resolves.toEqual({ value: 1 });
  });

  it("writeWorktreeDeckFileStorageJson はディレクトリを作成して保存する", async () => {
    mkdirMock.mockResolvedValue(undefined);
    writeFileMock.mockResolvedValue(undefined);

    await writeWorktreeDeckFileStorageJson(buildArgs(), "sample.json", { value: 2 });

    expect(mkdirMock).toHaveBeenCalledWith("/tmp/dev-flow/storage", { recursive: true });
    expect(writeFileMock).toHaveBeenCalledWith("/tmp/dev-flow/storage/sample.json", '{"value":2}', "utf8");
  });

  it("WORKTREE_DECK_STORAGE_DIR を優先して使う", async () => {
    mkdirMock.mockResolvedValue(undefined);
    writeFileMock.mockResolvedValue(undefined);
    loadEnvValueMock.mockImplementation(async (_args, key: string) => {
      if (key === "WORKTREE_DECK_STORAGE_DIR") {
        return "/tmp/dev-flow/primary-storage";
      }
      return null;
    });

    await writeWorktreeDeckFileStorageJson(buildArgs(), "sample.json", { value: 3 });

    expect(mkdirMock).toHaveBeenCalledWith("/tmp/dev-flow/primary-storage", { recursive: true });
  });

  it("環境変数未設定時は ~/.worktree-deck/storage を既定値に使う", async () => {
    mkdirMock.mockResolvedValue(undefined);
    writeFileMock.mockResolvedValue(undefined);
    loadEnvValueMock.mockResolvedValue(null);

    await writeWorktreeDeckFileStorageJson(buildArgs(), "sample.json", { value: 4 });

    expect(mkdirMock).toHaveBeenCalledWith("/Users/tester/.worktree-deck/storage", { recursive: true });
  });
});
