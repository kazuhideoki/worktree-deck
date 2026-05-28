import { worktreeIdeAppService, type WorktreeIdeApp } from "../domain/worktree-ide-app.service";
import {
  worktreeCreateStartModeService,
  type WorktreeCreateStartMode,
} from "../domain/worktree-create-start-mode.service";
import { buildEnvLookupArgs, type EnvLookupArgs } from "./env/env-store";
import { readWorktreeDeckFileStorageJson, writeWorktreeDeckFileStorageJson } from "./storage/json-file-storage";
import { ensureIdeAppInstalled, openPathInIdeApp } from "./worktree-ide-infra";

/**
 * General Settings の storage ファイル名
 */
const GENERAL_SETTINGS_STORAGE_FILE = "general-settings.json";

/**
 * General Settings の保存形式
 */
type GeneralSettingsStorage = {
  ideApp?: WorktreeIdeApp;
  createStartMode?: WorktreeCreateStartMode;
};

/**
 * General Settings 用の storage 引数を組み立てる
 */
function buildGeneralSettingsStorageArgs(): EnvLookupArgs {
  return buildEnvLookupArgs();
}

/**
 * 保存済み General Settings を正規化する
 */
function normalizeGeneralSettingsStorage(value: unknown): GeneralSettingsStorage {
  if (value === null || value === undefined) {
    return {};
  }
  if (typeof value === "string") {
    try {
      return normalizeGeneralSettingsStorage(JSON.parse(value) as unknown);
    } catch {
      return {};
    }
  }
  if (typeof value !== "object") {
    return {};
  }
  const ideApp = worktreeIdeAppService.normalizeIdeApp((value as Record<string, unknown>).ideApp);
  const createStartMode = worktreeCreateStartModeService.normalizeStartMode(
    (value as Record<string, unknown>).createStartMode,
  );
  return {
    ...(ideApp ? { ideApp } : {}),
    ...(createStartMode ? { createStartMode } : {}),
  };
}

/**
 * General Settings を storage から読み込む
 */
async function loadGeneralSettingsStorage(): Promise<GeneralSettingsStorage> {
  try {
    const stored = await readWorktreeDeckFileStorageJson<unknown>(
      buildGeneralSettingsStorageArgs(),
      GENERAL_SETTINGS_STORAGE_FILE,
    );
    return normalizeGeneralSettingsStorage(stored ?? "");
  } catch (error) {
    if (error instanceof SyntaxError) {
      // 壊れた保存ファイルは次回保存で上書き復旧する
      return {};
    }
    throw error;
  }
}

/**
 * General Settings を storage へ保存する
 */
async function saveGeneralSettingsStorage(storage: GeneralSettingsStorage): Promise<void> {
  await writeWorktreeDeckFileStorageJson(buildGeneralSettingsStorageArgs(), GENERAL_SETTINGS_STORAGE_FILE, storage);
}

/**
 * General Settings の現在値を部分更新する
 */
async function updateGeneralSettingsStorage(
  update: (storage: GeneralSettingsStorage) => GeneralSettingsStorage,
): Promise<GeneralSettingsStorage> {
  const currentStorage = await loadGeneralSettingsStorage();
  const nextStorage = update(currentStorage);
  await saveGeneralSettingsStorage(nextStorage);
  return nextStorage;
}

/**
 * 保存済み IDE アプリケーションを読み込む
 */
export async function loadPreferredIdeApp(): Promise<WorktreeIdeApp> {
  const storage = await loadGeneralSettingsStorage();
  return worktreeIdeAppService.resolvePreferred(storage.ideApp);
}

/**
 * Worktree 作成フォームの保存済み開始モードを読み込む
 */
export async function loadCreateStartMode(): Promise<WorktreeCreateStartMode> {
  const storage = await loadGeneralSettingsStorage();
  return worktreeCreateStartModeService.resolveDefault(storage.createStartMode);
}

/**
 * IDE アプリケーション設定を保存する
 */
export async function savePreferredIdeApp(ideApp: WorktreeIdeApp): Promise<WorktreeIdeApp> {
  const normalizedIdeApp = worktreeIdeAppService.normalizeIdeApp(ideApp);
  if (!normalizedIdeApp) {
    throw new Error("Unsupported IDE application.");
  }
  await ensureIdeAppInstalled(normalizedIdeApp);
  await updateGeneralSettingsStorage((storage) => ({ ...storage, ideApp: normalizedIdeApp }));
  return normalizedIdeApp;
}

/**
 * Worktree 作成フォームの開始モード設定を保存する
 */
export async function saveCreateStartMode(startMode: WorktreeCreateStartMode): Promise<WorktreeCreateStartMode> {
  const normalizedStartMode = worktreeCreateStartModeService.normalizeStartMode(startMode);
  if (!normalizedStartMode) {
    throw new Error("Unsupported create start mode.");
  }
  await updateGeneralSettingsStorage((storage) => ({ ...storage, createStartMode: normalizedStartMode }));
  return normalizedStartMode;
}

/**
 * 保存済み IDE アプリケーションで指定パスを開く
 */
export async function openPathInConfiguredIde(path: string): Promise<void> {
  const ideApp = await loadPreferredIdeApp();
  await openPathInIdeApp(path, ideApp);
}
