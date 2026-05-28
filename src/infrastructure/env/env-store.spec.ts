import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildEnvLookupArgs, loadEnvValue, type EnvLookupArgs } from "./env-store";

/**
 * テスト用の EnvLookupArgs を作成する
 */
function buildArgs(overrides?: Partial<EnvLookupArgs>): EnvLookupArgs {
  return {
    env: {},
    homeDir: "/Users/tester",
    ...overrides,
  };
}

describe("infrastructure/env/env-store", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("buildEnvLookupArgs は process から実行コンテキストを組み立てる", () => {
    process.env.HOME = "/Users/tester";

    const result = buildEnvLookupArgs();

    expect(result).toEqual({
      env: process.env,
      homeDir: "/Users/tester",
    });
  });

  it("buildEnvLookupArgs は HOME が空文字のとき null を返す", () => {
    process.env.HOME = "   ";
    process.env.USERPROFILE = "";

    const result = buildEnvLookupArgs();

    expect(result.homeDir).toBeNull();
  });

  it("loadEnvValue は process.env 互換の env から値を返す", async () => {
    const args = buildArgs({
      env: {
        TARGET_KEY: "from-env",
      },
    });

    await expect(loadEnvValue(args, "TARGET_KEY")).resolves.toBe("from-env");
  });

  it("loadEnvValue は空文字の値を未設定として扱う", async () => {
    const args = buildArgs({
      env: {
        TARGET_KEY: "   ",
      },
    });

    await expect(loadEnvValue(args, "TARGET_KEY")).resolves.toBeNull();
  });
});
