import { Color, Icon, MenuBarExtra, environment } from "@raycast/api";
import { useEffect, useState } from "react";

import { listWorktreesUsecase } from "./application/list-worktrees.usecase";
import { resolveWorktreeDeckCompositionRoot, type Worktree, type WorktreeTitle } from "./composition-root";
import {
  worktreeMenuBarStatusService,
  type WorktreeMenuBarItem,
  type WorktreeMenuBarStatusSummary,
} from "./domain/worktree-menu-bar-status.service";

/**
 * メニューバー表示用の初期件数
 */
const EMPTY_SUMMARY: WorktreeMenuBarStatusSummary = {
  blue: 0,
  green: 0,
  yellow: 0,
};

/**
 * worktree-status-menu-bar で利用する依存解決結果
 */
const WORKTREE_DECK_COMPOSITION_ROOT = resolveWorktreeDeckCompositionRoot();

/**
 * worktree に latest session のタイトル情報を付与する
 */
function buildMenuBarItems(args: {
  worktrees: Worktree[];
  titlesByPath: Map<string, WorktreeTitle[]>;
}): WorktreeMenuBarItem[] {
  return args.worktrees.map((item) => ({
    titleEntries: (args.titlesByPath.get(item.path) ?? []).map((entry) => ({
      status: entry.status,
      isWaitingForUser: entry.isWaitingForUser === true,
    })),
  }));
}

/**
 * メニューバーに表示する worktree 状態を取得する
 */
async function loadWorktreeMenuBarSummary(): Promise<{
  summary: WorktreeMenuBarStatusSummary;
  total: number;
}> {
  const homeDir = process.env.HOME?.trim() ?? null;
  const listed = await listWorktreesUsecase.list({
    context: {
      env: process.env,
      cwd: process.cwd(),
      homeDir,
      assetsPath: environment.assetsPath,
      packageDir: __dirname,
      packageName: "worktree-deck",
    },
    dependencies: WORKTREE_DECK_COMPOSITION_ROOT.listWorktreesDependencies,
  });
  const titlesByPath =
    await WORKTREE_DECK_COMPOSITION_ROOT.loadWorktreeDeckTitlesSnapshotDependencies.loadTitlesForPaths({
      paths: listed.worktrees.map((item) => item.path),
      env: process.env,
      cwd: process.cwd(),
      homeDir,
      assetsPath: environment.assetsPath,
      packageDir: __dirname,
      packageName: "worktree-deck",
    });
  const menuBarItems = buildMenuBarItems({
    worktrees: listed.worktrees,
    titlesByPath,
  });
  return {
    summary: worktreeMenuBarStatusService.summarize(menuBarItems),
    total: listed.worktrees.length,
  };
}

/**
 * worktree の latest session 状態をメニューバーへ表示する
 */
export default function Command() {
  const [summary, setSummary] = useState<WorktreeMenuBarStatusSummary>(EMPTY_SUMMARY);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    void loadWorktreeMenuBarSummary()
      .then((result) => {
        if (cancelled) {
          return;
        }
        setSummary(result.summary);
        setTotal(result.total);
        setErrorMessage(null);
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        const message = error instanceof Error ? error.message : "Unknown error";
        setSummary(EMPTY_SUMMARY);
        setTotal(0);
        setErrorMessage(message);
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const title = worktreeMenuBarStatusService.formatTitle(summary);
  const tooltip = errorMessage ? `Failed to load worktree status: ${errorMessage}` : `Worktrees: ${total}`;

  return (
    <MenuBarExtra title={title} tooltip={tooltip} isLoading={isLoading}>
      <MenuBarExtra.Section title="Worktree Status">
        <MenuBarExtra.Item
          title="Done"
          subtitle={`${summary.blue}`}
          icon={{ source: Icon.Circle, tintColor: Color.Blue }}
        />
        <MenuBarExtra.Item
          title="Working"
          subtitle={`${summary.green}`}
          icon={{ source: Icon.Circle, tintColor: Color.Green }}
        />
        <MenuBarExtra.Item
          title="Waiting"
          subtitle={`${summary.yellow}`}
          icon={{ source: Icon.Circle, tintColor: Color.Yellow }}
        />
        <MenuBarExtra.Item title="Total" subtitle={`${total}`} icon={Icon.List} />
      </MenuBarExtra.Section>
      {errorMessage ? (
        <MenuBarExtra.Section title="Error">
          <MenuBarExtra.Item title={errorMessage} icon={{ source: Icon.Warning, tintColor: Color.Red }} />
        </MenuBarExtra.Section>
      ) : null}
    </MenuBarExtra>
  );
}
