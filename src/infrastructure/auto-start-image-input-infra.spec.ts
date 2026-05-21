import { describe, expect, it } from "vitest";
import { isSupportedAutoStartImagePath } from "./auto-start-image-input-infra";

describe("isSupportedAutoStartImagePath", () => {
  it("画像拡張子なら true を返す", () => {
    expect(isSupportedAutoStartImagePath("/tmp/design.PNG")).toBe(true);
  });

  it("画像以外の拡張子なら false を返す", () => {
    expect(isSupportedAutoStartImagePath("/tmp/design.txt")).toBe(false);
  });
});
