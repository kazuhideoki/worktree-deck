import type { AutoStartImageInputDependencies } from "../application/auto-start-image-input.usecase";
import {
  isReadableAutoStartImagePath,
  resolveClipboardImagePath,
  resolveSelectedFinderImagePaths,
} from "../infrastructure/auto-start-image-input-infra";

type AutoStartImageInputInfra = {
  isReadableImagePath(path: string): boolean;
  resolveClipboardImagePath(): Promise<string | null>;
  resolveSelectedFinderImagePaths(): Promise<string[]>;
};

/**
 * Auto Start 画像入力依存ポートを infra 実装へ接続する
 */
function createAutoStartImageInputDependencies(infra: AutoStartImageInputInfra): AutoStartImageInputDependencies {
  return {
    isReadableImagePath: infra.isReadableImagePath,
    resolveClipboardImagePath: infra.resolveClipboardImagePath,
    resolveSelectedFinderImagePaths: infra.resolveSelectedFinderImagePaths,
  };
}

/**
 * Auto Start 画像入力の既定依存を作成する
 */
export function createDefaultAutoStartImageInputDependencies(): AutoStartImageInputDependencies {
  return createAutoStartImageInputDependencies({
    isReadableImagePath: isReadableAutoStartImagePath,
    resolveClipboardImagePath,
    resolveSelectedFinderImagePaths,
  });
}
