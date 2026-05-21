import { describe, expect, it, vi } from "vitest";

const readEnvValueFromEnvMock = vi.hoisted(() => vi.fn());
const resolveRootEnvPathMock = vi.hoisted(() => vi.fn());

vi.mock("./env/env-store", () => {
  return {
    loadEnvValue: vi.fn(async () => null),
    readEnvValueFromEnv: readEnvValueFromEnvMock,
    resolveRootEnvPath: resolveRootEnvPathMock,
  };
});

import { loadBasePath } from "./worktree-config-store";

/**
 * テスト用の env lookup context を返す
 */
function buildArgs(args?: { env?: NodeJS.ProcessEnv }) {
  return {
    env: args?.env ?? {},
    cwd: "/tmp/current",
    homeDir: "/Users/tester",
    assetsPath: "/tmp/app/assets",
    packageDir: "/tmp/app",
    packageName: "worktree-deck",
  };
}

describe("loadBasePath", () => {
  it("環境変数の GIT_WORKTREE_PATH は home path を展開する", async () => {
    const result = await loadBasePath(buildArgs({ env: { GIT_WORKTREE_PATH: "~/.worktree-deck/worktrees" } }));

    expect(result).toBe("/Users/tester/.worktree-deck/worktrees");
  });

  it(".env の GIT_WORKTREE_PATH は home path を展開する", async () => {
    resolveRootEnvPathMock.mockResolvedValue("/tmp/app/assets/.env");
    readEnvValueFromEnvMock.mockResolvedValue("~/.worktree-deck/worktrees");

    const result = await loadBasePath(buildArgs());

    expect(result).toBe("/Users/tester/.worktree-deck/worktrees");
  });
});
