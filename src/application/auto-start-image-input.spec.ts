import { describe, expect, it } from "vitest";
import {
  appendUniqueImagePaths,
  autoStartImageInputUsecase,
  formatAutoStartImagePathsText,
  normalizeAutoStartImagePaths,
  parseAutoStartImagePathsText,
} from "./auto-start-image-input.usecase";

describe("normalizeAutoStartImagePaths", () => {
  it("空白と重複を取り除く", () => {
    expect(normalizeAutoStartImagePaths([" /tmp/a.png ", "", "/tmp/a.png", "/tmp/b.jpg"])).toEqual([
      "/tmp/a.png",
      "/tmp/b.jpg",
    ]);
  });
});

describe("parseAutoStartImagePathsText", () => {
  it("改行区切りの画像パスを配列へ変換する", () => {
    expect(parseAutoStartImagePathsText(" /tmp/a.png\n\n/tmp/b.jpg\r\n/tmp/a.png ")).toEqual([
      "/tmp/a.png",
      "/tmp/b.jpg",
    ]);
  });
});

describe("formatAutoStartImagePathsText", () => {
  it("画像パス配列を改行区切りのテキストへ変換する", () => {
    expect(formatAutoStartImagePathsText([" /tmp/a.png ", "/tmp/b.jpg"])).toBe("/tmp/a.png\n/tmp/b.jpg");
  });
});

describe("appendUniqueImagePaths", () => {
  it("既存の順序を保って新しい画像だけ追加する", () => {
    expect(appendUniqueImagePaths(["/tmp/a.png"], ["/tmp/a.png", "/tmp/b.jpg"])).toEqual(["/tmp/a.png", "/tmp/b.jpg"]);
  });
});

describe("autoStartImageInputUsecase.findInvalidImagePath", () => {
  it("読めない画像パスを返す", () => {
    const result = autoStartImageInputUsecase.findInvalidImagePath({
      imagePaths: ["/tmp/a.png", "/tmp/missing.png"],
      dependencies: {
        isReadableImagePath: (path) => path !== "/tmp/missing.png",
        resolveClipboardImagePath: async () => null,
        resolveSelectedFinderImagePaths: async () => [],
      },
    });

    expect(result).toBe("/tmp/missing.png");
  });
});

describe("autoStartImageInputUsecase.resolveClipboardImagePath", () => {
  it("依存ポートで解決したクリップボード画像パスを返す", async () => {
    const result = await autoStartImageInputUsecase.resolveClipboardImagePath({
      dependencies: {
        isReadableImagePath: () => false,
        resolveClipboardImagePath: async () => "/tmp/clipboard.png",
        resolveSelectedFinderImagePaths: async () => [],
      },
    });

    expect(result).toBe("/tmp/clipboard.png");
  });
});
