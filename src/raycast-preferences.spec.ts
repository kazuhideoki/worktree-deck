import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { buildPreferenceEnv } from "./raycast-preferences";

type RaycastManifestPreference = {
  name: string;
  title?: string;
  required?: boolean;
  default?: string;
  type?: string;
};

type RaycastManifestCommand = {
  name: string;
  interval?: string;
};

type RaycastManifest = {
  commands: RaycastManifestCommand[];
  preferences: RaycastManifestPreference[];
};

/**
 * package.json の Raycast manifest を読み込む
 */
async function loadManifest(): Promise<RaycastManifest> {
  return JSON.parse(await readFile(join(process.cwd(), "package.json"), "utf8")) as RaycastManifest;
}

describe("raycast-preferences", () => {
  it("Raycast Preferences の空値を除外して env 互換値へ変換する", () => {
    const result = buildPreferenceEnv({
      GIT_WORKTREE_PATH: " ~/.worktree-deck/worktrees ",
      CODEX_HOME: "  ",
      WORKTREE_DECK_SEARCH_DAYS: "30",
      WORKTREE_DECK_DONE_THRESHOLD_DAYS: "",
    });

    expect(result).toEqual({
      GIT_WORKTREE_PATH: "~/.worktree-deck/worktrees",
      WORKTREE_DECK_SEARCH_DAYS: "30",
    });
  });

  it("manifest の Preferences は公開用の 5 項目だけを持つ", async () => {
    const manifest = await loadManifest();
    const names = manifest.preferences.map((preference) => preference.name);

    expect(names).toEqual([
      "GIT_WORKTREE_PATH",
      "CODEX_HOME",
      "WORKTREE_DECK_SEARCH_DAYS",
      "WORKTREE_DECK_DONE_THRESHOLD_DAYS",
      "CLAUDE_CODE_OAUTH_TOKEN",
    ]);
    expect(names).not.toContain("WORKTREE_DECK_STORAGE_DIR");
    expect(names).not.toContain("WORKTREE_NAME_DELIMITER");
  });

  it("Claude Auto Start 用トークンは任意の password preference として持つ", async () => {
    const manifest = await loadManifest();
    const preferencesByName = new Map(manifest.preferences.map((preference) => [preference.name, preference]));

    expect(preferencesByName.get("CLAUDE_CODE_OAUTH_TOKEN")).toMatchObject({
      type: "password",
      required: false,
    });
  });

  it("manifest の必須 path Preferences は home-relative default を表示する", async () => {
    const manifest = await loadManifest();
    const preferencesByName = new Map(manifest.preferences.map((preference) => [preference.name, preference]));

    expect(preferencesByName.get("GIT_WORKTREE_PATH")).toMatchObject({
      title: "Worktree Directory (~/.worktree-deck/worktrees)",
      required: false,
      default: "~/.worktree-deck/worktrees",
    });
    expect(preferencesByName.get("CODEX_HOME")).toMatchObject({
      title: "Codex Home (~/.codex)",
      required: true,
      default: "~/.codex",
    });
  });

  it("manifest の menu-bar interval はセッション状態を素早く反映する", async () => {
    const manifest = await loadManifest();
    const command = manifest.commands.find((entry) => entry.name === "worktree-status-menu-bar");

    expect(command?.interval).toBe("10s");
  });
});
