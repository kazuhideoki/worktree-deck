import { Color } from "@raycast/api";
import { describe, expect, it, vi } from "vitest";

import { DIMMED_WORKING_STATUS_COLOR, resolvePulsingSessionStatusTint } from "./session-status-pulse";

vi.mock("@raycast/api", () => ({
  Color: {
    Blue: "blue",
    Green: "green",
    Yellow: "yellow",
  },
}));

describe("resolvePulsingSessionStatusTint", () => {
  it("明るい位相では作業中の青を維持する", () => {
    expect(resolvePulsingSessionStatusTint(Color.Blue, true)).toBe(Color.Blue);
  });

  it("暗い位相では作業中の青を薄くする", () => {
    expect(resolvePulsingSessionStatusTint(Color.Blue, false)).toBe(DIMMED_WORKING_STATUS_COLOR);
  });

  it("完了と指示待ちの色は位相に関係なく維持する", () => {
    expect(resolvePulsingSessionStatusTint(Color.Green, false)).toBe(Color.Green);
    expect(resolvePulsingSessionStatusTint(Color.Yellow, false)).toBe(Color.Yellow);
  });
});
