import { describe, expect, it, vi } from "vitest";

import { openCodexThreadInApp } from "./codex-app-infra";

describe("openCodexThreadInApp", () => {
  it("Codex App の thread deeplink を macOS で開く", async () => {
    const execFileMock = vi.fn(async () => ({ stdout: "", stderr: "" }));

    await openCodexThreadInApp("019dd94f-27e0-7ad1-8d17-3d628ac5d16b", execFileMock);

    expect(execFileMock).toHaveBeenCalledWith("open", ["codex://threads/019dd94f-27e0-7ad1-8d17-3d628ac5d16b"]);
  });
});
