import { Color, Icon, LocalStorage, MenuBarExtra, environment, openExtensionPreferences } from "@raycast/api";
import { useEffect, useState } from "react";

import { listWorktreesUsecase } from "./application/list-worktrees.usecase";
import type { LoadWorktreeDeckTitlesSnapshotDependencies } from "./application/worktree-deck-snapshot.usecase";
import { resolveWorktreeDeckCompositionRoot, type Worktree, type WorktreeTitle } from "./composition-root";
import { applyRaycastPreferencesToProcessEnv } from "./raycast-preferences";
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
 * メニューバーの直近正常値を保存する LocalStorage キー
 */
const LAST_SUMMARY_STORAGE_KEY = "worktree-deck.menu-bar.last-summary.v1";

/**
 * メニューバー状態の読み込み結果
 */
export type WorktreeMenuBarSummarySnapshot = {
  summary: WorktreeMenuBarStatusSummary;
  total: number;
};

/**
 * メニューバー状態読み込みに必要な依存
 */
export type WorktreeMenuBarSummaryDependencies = {
  listWorktrees: typeof listWorktreesUsecase.list;
  loadTitlesForPaths: LoadWorktreeDeckTitlesSnapshotDependencies["loadTitlesForPaths"];
  saveLastSummary(snapshot: WorktreeMenuBarSummarySnapshot): Promise<void>;
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
 * 保存済みメニューバー状態を型安全に正規化する
 */
export function normalizeStoredWorktreeMenuBarSummary(raw: unknown): WorktreeMenuBarSummarySnapshot | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const value = raw as Record<string, unknown>;
  const summary = value.summary;
  const total = value.total;
  if (!summary || typeof summary !== "object" || Array.isArray(summary) || typeof total !== "number") {
    return null;
  }
  const summaryValue = summary as Record<string, unknown>;
  const blue = summaryValue.blue;
  const green = summaryValue.green;
  const yellow = summaryValue.yellow;
  if (typeof blue !== "number" || typeof green !== "number" || typeof yellow !== "number") {
    return null;
  }
  return {
    summary: { blue, green, yellow },
    total,
  };
}

/**
 * 直近正常値を保存する
 */
export async function saveStoredWorktreeMenuBarSummary(snapshot: WorktreeMenuBarSummarySnapshot): Promise<void> {
  await LocalStorage.setItem(LAST_SUMMARY_STORAGE_KEY, JSON.stringify(snapshot));
}

/**
 * 直近正常値を読み込む
 */
export async function loadStoredWorktreeMenuBarSummary(): Promise<WorktreeMenuBarSummarySnapshot | null> {
  const raw = await LocalStorage.getItem<string>(LAST_SUMMARY_STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    return normalizeStoredWorktreeMenuBarSummary(JSON.parse(raw));
  } catch {
    return null;
  }
}

/**
 * メニューバーに表示する worktree 状態を取得する
 */
export async function loadWorktreeMenuBarSummaryWithDependencies(args: {
  dependencies: WorktreeMenuBarSummaryDependencies;
}): Promise<WorktreeMenuBarSummarySnapshot> {
  applyRaycastPreferencesToProcessEnv();

  const homeDir = process.env.HOME?.trim() ?? null;
  const listed = await args.dependencies.listWorktrees({
    context: {
      env: process.env,
      cwd: process.cwd(),
      homeDir,
      assetsPath: environment.assetsPath,
      packageDir: __dirname,
      packageName: "worktree-deck",
    },
    dependencies: WORKTREE_DECK_COMPOSITION_ROOT.listWorktreesDependencies,
    options: { preferCache: false },
  });
  const titlesByPath = await args.dependencies.loadTitlesForPaths({
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
  const snapshot = {
    summary: worktreeMenuBarStatusService.summarize(menuBarItems),
    total: listed.worktrees.length,
  };
  await args.dependencies.saveLastSummary(snapshot);
  return snapshot;
}

/**
 * 既定依存でメニューバー状態を取得する
 */
async function loadWorktreeMenuBarSummary(): Promise<WorktreeMenuBarSummarySnapshot> {
  return loadWorktreeMenuBarSummaryWithDependencies({
    dependencies: {
      listWorktrees: listWorktreesUsecase.list,
      loadTitlesForPaths: WORKTREE_DECK_COMPOSITION_ROOT.loadWorktreeDeckTitlesSnapshotDependencies.loadTitlesForPaths,
      saveLastSummary: saveStoredWorktreeMenuBarSummary,
    },
  });
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
      .catch(async (error: unknown) => {
        if (cancelled) {
          return;
        }
        const message = error instanceof Error ? error.message : "Unknown error";
        const lastLoaded = await loadStoredWorktreeMenuBarSummary();
        if (cancelled) {
          return;
        }
        if (lastLoaded) {
          setSummary(lastLoaded.summary);
          setTotal(lastLoaded.total);
        }
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
      <MenuBarExtra.Section title="Settings">
        <MenuBarExtra.Item
          title="Open Extension Preferences"
          icon={Icon.Gear}
          onAction={() => void openExtensionPreferences()}
        />
      </MenuBarExtra.Section>
    </MenuBarExtra>
  );
}
