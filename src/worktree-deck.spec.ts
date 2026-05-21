import { describe, expect, it, vi } from "vitest";

import type { Worktree } from "./application/worktree.entity";
import type { WorktreeTitle } from "./application/worktree-title.entity";
import {
  filterVisibleWorktrees,
  buildDetailMarkdown,
  buildSectionsWithMappings,
  buildSortedSectionEntries,
  formatTitleEntry,
  parseDisplayMode,
  toggleDisplayMode,
  resolveStatusTint,
  canRemoveWorktreeItem,
  buildOpenActionPlans,
  formatOpenActionTitle,
  OPEN_ALTERNATE_APP_ACTION_INDEX,
  resolveAlternateOpenApp,
  resolveOpenActionShortcut,
  resolveOpenActionThreadId,
  resolveInitialRepoRoot,
  SHOW_DETAILS_SHORTCUT,
  shouldSelectCodexSessionForOpenAction,
  type WorktreeDeckDisplayMode,
} from "./worktree-deck";

vi.mock("@raycast/api", () => {
  return {
    Action: {},
    ActionPanel: {},
    Color: {
      Blue: "blue",
      Green: "green",
      Red: "red",
      SecondaryText: "secondaryText",
      Yellow: "yellow",
    },
    Icon: new Proxy(
      {},
      {
        get: () => "icon",
      },
    ),
    List: {},
    Toast: {},
    confirmAlert: vi.fn(),
    environment: { assetsPath: "" },
    open: vi.fn(),
    showToast: vi.fn(),
    useNavigation: () => ({ push: vi.fn(), pop: vi.fn() }),
  };
});

vi.mock("@raycast/utils", () => {
  return {
    useCachedState: vi.fn(() => [null, vi.fn()]),
  };
});

/**
 * テスト用のセッション情報を作成する
 */
function buildTitleEntry(args: {
  title: string;
  latestMessage: string | null;
  updatedAt: number;
  status?: "working" | "done" | null;
  sessionKind?: WorktreeTitle["sessionKind"];
  isWaitingForUser?: boolean;
}): WorktreeTitle {
  return {
    title: args.title,
    latestMessage: args.latestMessage,
    updatedAt: args.updatedAt,
    status: args.status ?? null,
    sessionKind: args.sessionKind ?? "main",
    isWaitingForUser: args.isWaitingForUser,
  };
}

/**
 * テスト用の worktree を作成する
 */
function buildWorktree(args: {
  repo: string;
  path: string;
  branch: string;
  originPath?: string;
  titleEntries?: WorktreeTitle[];
}): Worktree {
  return {
    repo: args.repo,
    path: args.path,
    branch: args.branch,
    originPath: args.originPath,
    titleEntries: args.titleEntries,
  };
}

describe("buildDetailMarkdown", () => {
  it("いずれかのセッションがユーザー指示待ちならアイコン色を黄色にする", () => {
    const tint = resolveStatusTint({
      status: "working",
      titles: [buildTitleEntry({ title: "waiting", latestMessage: null, updatedAt: 100, isWaitingForUser: true })],
    });

    expect(tint).toBe("yellow");
  });

  it("レビューセッションを除いた最新セッションを表示する", () => {
    const latestReview = buildTitleEntry({
      title: "Review: tighten lint rules",
      latestMessage: "review result",
      updatedAt: 300,
      sessionKind: "review",
    });
    const middleSession = buildTitleEntry({
      title: "途中の作業タイトル",
      latestMessage: "middle progress",
      updatedAt: 200,
    });
    const firstSession = buildTitleEntry({
      title: "ESLintのルールを強化したい。",
      latestMessage: "initial request",
      updatedAt: 100,
    });

    const result = buildDetailMarkdown({
      title: "branch",
      titles: [latestReview, middleSession, firstSession],
      isTitlesLoading: false,
    });

    expect(result).toContain("## 「途中の作業タイトル」");
    expect(result).toContain("middle progress");
    expect(result).not.toContain("## 「Review: tighten lint rules」");
  });

  it("最新セッションがレビューでなければそのセッションを表示する", () => {
    const latest = buildTitleEntry({
      title: "Latest Session",
      latestMessage: "Latest message",
      updatedAt: 200,
    });
    const older = buildTitleEntry({
      title: "Older Session",
      latestMessage: "Older message",
      updatedAt: 100,
    });

    const result = buildDetailMarkdown({
      title: "branch",
      titles: [latest, older],
      isTitlesLoading: false,
    });

    expect(result).toContain("## 「Latest Session」");
    expect(result).toContain("Latest message");
    expect(result).not.toContain("## 「Older Session」");
  });

  it("レビュー以外が存在しないときは最新セッションを表示する", () => {
    const latestReview = buildTitleEntry({
      title: "Review: latest",
      latestMessage: "latest review message",
      updatedAt: 300,
      status: "working",
      sessionKind: "review",
    });
    const olderReview = buildTitleEntry({
      title: "Review: older",
      latestMessage: "older review message",
      updatedAt: 200,
      status: "done",
      sessionKind: "review",
    });

    const result = buildDetailMarkdown({
      title: "branch",
      titles: [latestReview, olderReview],
      isTitlesLoading: false,
    });

    expect(result).toContain("## 「Review: latest」");
    expect(result).toContain("latest review message");
    expect(result).not.toContain("## 「Review: older」");
  });

  it("作業フェーズのテキストは詳細に表示しない", () => {
    const result = buildDetailMarkdown({
      title: "feature/phase",
      titles: [],
      isTitlesLoading: false,
      mergeStatus: "unknown",
    });

    expect(result).not.toContain("👷");
    expect(result).not.toContain("レビュー完了");
    expect(result).not.toContain("# feature/phase");
  });

  it("詳細の先頭にブランチ名見出しを表示しない", () => {
    const result = buildDetailMarkdown({
      title: "feature/no-header",
      titles: [],
      isTitlesLoading: false,
      mergeStatus: "synced",
    });

    expect(result).not.toContain("# feature/no-header");
  });

  it("base と merge を1行で表示し、commit 時刻は表示しない", () => {
    const result = buildDetailMarkdown({
      title: "feature/meta-line",
      titles: [],
      isTitlesLoading: false,
      baseRef: "main",
      mergeStatus: "dirty",
      lastCommitAt: "2026-02-19 14:03",
    });

    expect(result).toContain("🌿 main (+0 -0)  ⚠️ dirty");
    expect(result).not.toContain("🕒");
    expect(result).not.toContain("Base:");
    expect(result).not.toContain("Merged:");
    expect(result).not.toContain("Commit:");
  });

  it("固定した起動アプリを詳細メタ情報行には表示しない", () => {
    const result = buildDetailMarkdown({
      title: "feature/open-app",
      titles: [],
      isTitlesLoading: false,
      mergeStatus: "synced",
      openApp: "codex-app",
    });

    expect(result).not.toContain("🤖 CA");
    expect(result).not.toContain("CA");
  });

  it("コミット日が当日でないときも時刻を表示しない", () => {
    const result = buildDetailMarkdown({
      title: "feature/meta-line-date",
      titles: [],
      isTitlesLoading: false,
      baseRef: "main",
      mergeStatus: "dirty",
      lastCommitAt: "2026-02-18 14:03",
    });

    expect(result).toContain("🌿 main (+0 -0)  ⚠️ dirty");
    expect(result).not.toContain("🕒");
  });

  it("ahead/behind 未取得でも base 差分を +0 -0 で表示する", () => {
    const result = buildDetailMarkdown({
      title: "feature/meta-line-default-count",
      titles: [],
      isTitlesLoading: false,
      baseRef: "main",
      mergeStatus: "dirty",
      lastCommitAt: "2026-02-19 14:03",
    });

    expect(result).toContain("🌿 main (+0 -0)  ⚠️ dirty");
    expect(result).not.toContain("🕒");
  });

  it("origin でも状態だけを1行で表示する", () => {
    const result = buildDetailMarkdown({
      title: "main",
      titles: [],
      isTitlesLoading: false,
      mergeStatus: "unknown",
      lastCommitAt: "2026-02-19 14:03",
    });

    expect(result).toContain("❔ unknown");
    expect(result).not.toContain("🕒");
  });

  it("セッション見出しはテキストではなくディバイダーで表示する", () => {
    const result = buildDetailMarkdown({
      title: "feature/divider",
      titles: [],
      isTitlesLoading: false,
    });

    expect(result).not.toContain("# Sessions");
    expect(result).toContain("---\nNo session titles");
  });
});

describe("formatTitleEntry", () => {
  it("最新メッセージを省略せず表示する", () => {
    const entry = buildTitleEntry({
      title: "Session Title",
      latestMessage: "a".repeat(210),
      updatedAt: 0,
    });

    const result = formatTitleEntry(entry);
    const messageLine = result.split("\n")[1] ?? "";
    const message = messageLine.replace(/^- /, "");

    expect(message.length).toBe(210);
  });
});

describe("parseDisplayMode", () => {
  it("worktrees-only を受け取ったら worktrees-only を返す", () => {
    expect(parseDisplayMode("worktrees-only")).toBe("worktrees-only");
  });

  it("未知の値を受け取ったら show-all にフォールバックする", () => {
    expect(parseDisplayMode("invalid-mode")).toBe("show-all");
  });
});

describe("toggleDisplayMode", () => {
  it("show-all から worktrees-only に切り替える", () => {
    expect(toggleDisplayMode("show-all")).toBe("worktrees-only");
  });

  it("worktrees-only から show-all に切り替える", () => {
    expect(toggleDisplayMode("worktrees-only")).toBe("show-all");
  });
});

describe("worktree action shortcuts", () => {
  it("詳細表示アクションは cmd+enter を使わない", () => {
    expect(SHOW_DETAILS_SHORTCUT).not.toEqual({ modifiers: ["cmd"], key: "enter" });
  });

  it("保存済みアプリが Zed のときは逆側の起動先として CA を返す", () => {
    expect(resolveAlternateOpenApp("zed")).toBe("codex-app");
  });

  it("保存済みアプリが CA のときは逆側の起動先として Zed を返す", () => {
    expect(resolveAlternateOpenApp("codex-app")).toBe("zed");
  });

  it("逆側の起動アクションは secondary action の位置を維持する", () => {
    expect(OPEN_ALTERNATE_APP_ACTION_INDEX).toBe(1);
    const plans = buildOpenActionPlans({ openApp: "zed", threadId: "11111111-2222-3333-4444-555555555555" });
    expect(plans[OPEN_ALTERNATE_APP_ACTION_INDEX]).toMatchObject({
      openApp: "codex-app",
      intent: "switch-preference",
      threadId: "11111111-2222-3333-4444-555555555555",
    });
    expect(resolveOpenActionShortcut("configured")).toBeUndefined();
    expect(resolveOpenActionShortcut("switch-preference")).toBeUndefined();
  });

  it("保存済み CA では Enter が CA、secondary action が Zed になる順序を返す", () => {
    const plans = buildOpenActionPlans({
      openApp: "codex-app",
      threadId: "11111111-2222-3333-4444-555555555555",
    });

    expect(plans).toEqual([
      {
        openApp: "codex-app",
        intent: "configured",
        threadId: "11111111-2222-3333-4444-555555555555",
      },
      {
        openApp: "zed",
        intent: "switch-preference",
        threadId: null,
      },
    ]);
  });

  it("CA 起動は intent に関係なくセッション選択を挟む", () => {
    expect(shouldSelectCodexSessionForOpenAction({ openApp: "codex-app", intent: "configured" })).toBe(true);
    expect(shouldSelectCodexSessionForOpenAction({ openApp: "codex-app", intent: "switch-preference" })).toBe(true);
    expect(shouldSelectCodexSessionForOpenAction({ openApp: "zed", intent: "configured" })).toBe(false);
  });

  it("逆側の CA 起動も保存済み thread id をセッション解決へ渡す", () => {
    expect(
      resolveOpenActionThreadId({
        openApp: "codex-app",
        intent: "switch-preference",
        threadId: "11111111-2222-3333-4444-555555555555",
      }),
    ).toBe("11111111-2222-3333-4444-555555555555");
  });

  it("保存済み CA の通常起動は保存済み thread id を使う", () => {
    expect(
      resolveOpenActionThreadId({
        openApp: "codex-app",
        intent: "configured",
        threadId: "11111111-2222-3333-4444-555555555555",
      }),
    ).toBe("11111111-2222-3333-4444-555555555555");
  });

  it("Open アクション名は一時起動を示さない", () => {
    expect(formatOpenActionTitle("zed")).toBe("Open in Zed");
    expect(formatOpenActionTitle("codex-app")).toBe("Open in CA");
  });
});

describe("buildSectionsWithMappings", () => {
  it("repository は最新 session 更新時刻の降順で並べる", () => {
    const sections = buildSectionsWithMappings(
      [
        buildWorktree({
          repo: "repo-working",
          path: "/tmp/repo-working~_~feature-a",
          branch: "feature-a",
          titleEntries: [buildTitleEntry({ title: "w", latestMessage: "w", status: "working", updatedAt: 500 })],
        }),
        buildWorktree({
          repo: "repo-done",
          path: "/tmp/repo-done~_~feature-b",
          branch: "feature-b",
          titleEntries: [buildTitleEntry({ title: "d", latestMessage: "d", status: "done", updatedAt: 100 })],
        }),
        buildWorktree({
          repo: "repo-recent-done",
          path: "/tmp/repo-recent-done~_~feature-c",
          branch: "feature-c",
          titleEntries: [buildTitleEntry({ title: "a", latestMessage: "a", status: "done", updatedAt: 900 })],
        }),
      ],
      [],
    );

    expect(sections.map((section) => section.repo)).toEqual(["repo-recent-done", "repo-working", "repo-done"]);
  });

  it("Worktrees Only モードでは repo ごとのセクションを返して origin だけの mapping は含めない", () => {
    const mode: WorktreeDeckDisplayMode = "worktrees-only";
    const sections = buildSectionsWithMappings(
      [
        buildWorktree({
          repo: "repo-a",
          path: "/tmp/repo-a~_~feature-a",
          branch: "feature-a",
        }),
        buildWorktree({
          repo: "repo-b",
          path: "/tmp/repo-b~_~feature-b",
          branch: "feature-b",
        }),
      ],
      [{ repoRoot: "/repos/repo-c", mapValue: "repo-c" }],
      mode,
    );

    expect(sections.map((section) => section.repo)).toEqual(["repo-a", "repo-b"]);
    expect(sections.flatMap((section) => section.items.map((item) => item.path))).toEqual([
      "/tmp/repo-a~_~feature-a",
      "/tmp/repo-b~_~feature-b",
    ]);
  });
});

describe("buildSortedSectionEntries", () => {
  it("status 優先で done > working > status なしの順に並べる", () => {
    const entries = buildSortedSectionEntries({
      items: [
        buildWorktree({
          repo: "repo-a",
          path: "/tmp/repo-a~_~done",
          branch: "done",
          titleEntries: [buildTitleEntry({ title: "done", latestMessage: "done", status: "done", updatedAt: 100 })],
        }),
        buildWorktree({
          repo: "repo-a",
          path: "/tmp/repo-a~_~working",
          branch: "working",
          titleEntries: [
            buildTitleEntry({ title: "working", latestMessage: "working", status: "working", updatedAt: 900 }),
          ],
        }),
        buildWorktree({
          repo: "repo-a",
          path: "/tmp/repo-a~_~unknown",
          branch: "unknown",
          titleEntries: [
            buildTitleEntry({ title: "unknown", latestMessage: "unknown", status: null, updatedAt: 1200 }),
          ],
        }),
      ],
      titlesByPath: new Map(),
      mappedOrigins: [],
      originLastCommitByPath: new Map(),
      originBranchByPath: new Map(),
    });

    expect(entries.map((entry) => (entry.kind === "worktree" ? entry.item.path : entry.originPath))).toEqual([
      "/tmp/repo-a~_~done",
      "/tmp/repo-a~_~working",
      "/tmp/repo-a~_~unknown",
    ]);
  });

  it("同一 status 内では更新時刻の降順で並べる", () => {
    const entries = buildSortedSectionEntries({
      items: [
        buildWorktree({
          repo: "repo-a",
          path: "/tmp/repo-a~_~done-old",
          branch: "done-old",
          titleEntries: [
            buildTitleEntry({ title: "done-old", latestMessage: "done-old", status: "done", updatedAt: 100 }),
          ],
        }),
        buildWorktree({
          repo: "repo-a",
          path: "/tmp/repo-a~_~done-new",
          branch: "done-new",
          titleEntries: [
            buildTitleEntry({ title: "done-new", latestMessage: "done-new", status: "done", updatedAt: 200 }),
          ],
        }),
      ],
      titlesByPath: new Map(),
      mappedOrigins: [],
      originLastCommitByPath: new Map(),
      originBranchByPath: new Map(),
    });

    expect(entries.map((entry) => (entry.kind === "worktree" ? entry.item.path : entry.originPath))).toEqual([
      "/tmp/repo-a~_~done-new",
      "/tmp/repo-a~_~done-old",
    ]);
  });

  it("includeOrigin=false のとき origin エントリを含めない", () => {
    const entries = buildSortedSectionEntries({
      items: [
        buildWorktree({
          repo: "repo-a",
          path: "/tmp/repo-a~_~feature-a",
          branch: "feature-a",
          originPath: "/repos/repo-a",
          titleEntries: [buildTitleEntry({ title: "done", latestMessage: "done", status: "done", updatedAt: 100 })],
        }),
      ],
      titlesByPath: new Map([
        [
          "/repos/repo-a",
          [buildTitleEntry({ title: "origin", latestMessage: "origin", status: "working", updatedAt: 200 })],
        ],
      ]),
      mappedOrigins: ["/repos/repo-a"],
      originLastCommitByPath: new Map(),
      originBranchByPath: new Map(),
      includeOrigin: false,
    });

    expect(entries).toHaveLength(1);
    expect(entries[0]?.kind).toBe("worktree");
    if (entries[0]?.kind === "worktree") {
      expect(entries[0].item.path).toBe("/tmp/repo-a~_~feature-a");
    }
  });
});

describe("canRemoveWorktreeItem", () => {
  it("originPath が同一のときは削除不可", () => {
    const result = canRemoveWorktreeItem(
      buildWorktree({
        repo: "repo-a",
        path: "/repos/repo-a",
        branch: "main",
        originPath: "/repos/repo-a",
      }),
    );

    expect(result).toBe(false);
  });

  it("originPath が存在しないときは削除可", () => {
    const result = canRemoveWorktreeItem(
      buildWorktree({
        repo: "repo-a",
        path: "/worktrees/repo-a~_~feature-a",
        branch: "feature-a",
      }),
    );

    expect(result).toBe(true);
  });

  it("originPath が異なるときは削除可", () => {
    const result = canRemoveWorktreeItem(
      buildWorktree({
        repo: "repo-a",
        path: "/worktrees/repo-a~_~feature-a",
        branch: "feature-a",
        originPath: "/repos/repo-a",
      }),
    );

    expect(result).toBe(true);
  });
});

describe("resolveInitialRepoRoot", () => {
  it("originPath があるときは originPath を返す", () => {
    const result = resolveInitialRepoRoot({
      item: buildWorktree({
        repo: "repo-a",
        path: "/worktrees/repo-a~_~feature-a",
        branch: "feature-a",
        originPath: "/repos/repo-a",
      }),
      mappings: [{ repoRoot: "/repos/other", mapValue: "repo-a" }],
    });

    expect(result).toBe("/repos/repo-a");
  });

  it("originPath がないときは mapValue が repo 名と一致する mapping を返す", () => {
    const result = resolveInitialRepoRoot({
      item: buildWorktree({
        repo: "gitui",
        path: "/worktrees/gitui/async_load_syntax_highlight",
        branch: "async_load_syntax_highlight",
      }),
      mappings: [{ repoRoot: "/repos/gitui", mapValue: "gitui" }],
    });

    expect(result).toBe("/repos/gitui");
  });

  it("mapValue が一致しないときは repoRoot の末尾名で mapping を返す", () => {
    const result = resolveInitialRepoRoot({
      item: buildWorktree({
        repo: "gitui",
        path: "/worktrees/gitui/async_load_syntax_highlight",
        branch: "async_load_syntax_highlight",
      }),
      mappings: [{ repoRoot: "/repos/gitui", mapValue: "custom" }],
    });

    expect(result).toBe("/repos/gitui");
  });
});

describe("filterVisibleWorktrees", () => {
  it("非表示対象のパスを一覧から除外する", () => {
    const result = filterVisibleWorktrees({
      worktrees: [
        buildWorktree({
          repo: "repo-a",
          path: "/tmp/repo-a~_~feature-a",
          branch: "feature-a",
        }),
        buildWorktree({
          repo: "repo-a",
          path: "/tmp/repo-a~_~feature-b",
          branch: "feature-b",
        }),
      ],
      hiddenPaths: new Set(["/tmp/repo-a~_~feature-a"]),
    });

    expect(result.map((item) => item.path)).toEqual(["/tmp/repo-a~_~feature-b"]);
  });

  it("非表示対象が空なら元の一覧をそのまま返す", () => {
    const worktrees = [
      buildWorktree({
        repo: "repo-a",
        path: "/tmp/repo-a~_~feature-a",
        branch: "feature-a",
      }),
    ];

    const result = filterVisibleWorktrees({
      worktrees,
      hiddenPaths: new Set(),
    });

    expect(result).toEqual(worktrees);
  });
});
