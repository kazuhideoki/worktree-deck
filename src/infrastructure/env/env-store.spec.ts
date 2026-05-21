import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const existsSyncMock = vi.hoisted(() => vi.fn<(path: string) => boolean>());
const readFileMock = vi.hoisted(() => vi.fn<(path: string, encoding: string) => Promise<string>>());

vi.mock("node:fs", () => {
  return {
    existsSync: existsSyncMock,
    promises: {
      readFile: readFileMock,
    },
  };
});

import {
  buildEnvLookupArgs,
  loadEnvValue,
  readEnvValueFromEnv,
  resolveRootEnvPath,
  type EnvLookupArgs,
} from "./env-store";

/**
 * テスト用の EnvLookupArgs を作成する
 */
function buildArgs(overrides?: Partial<EnvLookupArgs>): EnvLookupArgs {
  return {
    env: {},
    cwd: "/tmp/dev-flow/current",
    homeDir: "/Users/tester",
    assetsPath: "/tmp/dev-flow/assets",
    packageDir: "/tmp/dev-flow",
    packageName: "worktree-deck",
    ...overrides,
  };
}

describe("infrastructure/env/env-store", () => {
  const originalEnv = process.env;
  const originalCwd = process.cwd;

  beforeEach(() => {
    existsSyncMock.mockReset();
    readFileMock.mockReset();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    process.cwd = originalCwd;
    vi.restoreAllMocks();
  });

  it("buildEnvLookupArgs は process から実行コンテキストを組み立てる", () => {
    process.env.HOME = "/Users/tester";
    vi.spyOn(process, "cwd").mockReturnValue("/tmp/dev-flow/current");

    const result = buildEnvLookupArgs("/tmp/dev-flow", "worktree-deck");

    expect(result).toEqual({
      env: process.env,
      cwd: "/tmp/dev-flow/current",
      homeDir: "/Users/tester",
      packageDir: "/tmp/dev-flow",
      packageName: "worktree-deck",
    });
  });

  it("buildEnvLookupArgs は HOME が空文字のとき null を返す", () => {
    process.env.HOME = "   ";
    process.env.USERPROFILE = "";
    vi.spyOn(process, "cwd").mockReturnValue("/tmp/dev-flow/current");

    const result = buildEnvLookupArgs("/tmp/dev-flow", "worktree-deck");

    expect(result.homeDir).toBeNull();
  });

  it("readEnvValueFromEnv は env ファイルがないとき null を返す", async () => {
    existsSyncMock.mockReturnValue(false);

    await expect(readEnvValueFromEnv("/tmp/dev-flow/.env", "TARGET_KEY")).resolves.toBeNull();
  });

  it("readEnvValueFromEnv は env ファイルからキーの値を取り出す", async () => {
    existsSyncMock.mockReturnValue(true);
    readFileMock.mockResolvedValue("export TARGET_KEY='from-file'\n");

    await expect(readEnvValueFromEnv("/tmp/dev-flow/.env", "TARGET_KEY")).resolves.toBe("from-file");
  });

  it("resolveRootEnvPath は assetsPath から assets/.env を返す", async () => {
    existsSyncMock.mockImplementation((path) => {
      return path === "/tmp/dev-flow/assets/.env";
    });

    await expect(resolveRootEnvPath(buildArgs())).resolves.toBe(join("/tmp/dev-flow/assets", ".env"));
  });

  it("resolveRootEnvPath は assets 内の env ミラーを最優先で返す", async () => {
    existsSyncMock.mockImplementation((path) => {
      return path === "/tmp/dev-flow/assets/.env";
    });

    await expect(resolveRootEnvPath(buildArgs())).resolves.toBe(join("/tmp/dev-flow/assets", ".env"));
  });

  it("resolveRootEnvPath は WORKTREE_DECK_ROOT を参照しない", async () => {
    existsSyncMock.mockImplementation((path) => {
      return path === "/tmp/dev-flow/assets/.env";
    });

    await expect(
      resolveRootEnvPath(
        buildArgs({
          env: {
            WORKTREE_DECK_ROOT: "/tmp/other-worktree-deck",
          },
        }),
      ),
    ).resolves.toBe(join("/tmp/dev-flow/assets", ".env"));
  });

  it("resolveRootEnvPath は packageDir の親にある assets/.env を返す", async () => {
    existsSyncMock.mockImplementation((path) => {
      return path === "/tmp/dev-flow/assets/.env";
    });

    await expect(
      resolveRootEnvPath(
        buildArgs({
          assetsPath: "",
          packageDir: "/tmp/dev-flow/src",
          cwd: "/tmp/other",
        }),
      ),
    ).resolves.toBe(join("/tmp/dev-flow/assets", ".env"));
  });

  it("loadEnvValue は process.env の値を優先して返す", async () => {
    const args = buildArgs({
      env: {
        TARGET_KEY: "from-env",
      },
    });

    await expect(loadEnvValue(args, "TARGET_KEY")).resolves.toBe("from-env");
  });
});
