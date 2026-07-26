import { Color } from "@raycast/api";
import { useEffect, useState } from "react";

/**
 * 作業中ステータスの明暗を切り替える間隔
 */
export const SESSION_STATUS_PULSE_INTERVAL_MS = 800;

/**
 * パルスの暗い側で使う青
 */
export const DIMMED_WORKING_STATUS_COLOR: Color.Dynamic = {
  light: "rgba(0, 122, 255, 0.35)",
  dark: "rgba(10, 132, 255, 0.35)",
  adjustContrast: false,
};

/**
 * 作業中の青だけを現在のパルス位相へ変換する
 */
export function resolvePulsingSessionStatusTint(
  tintColor: Color.ColorLike | undefined,
  isBright: boolean,
): Color.ColorLike | undefined {
  if (tintColor !== Color.Blue) {
    return tintColor;
  }
  return isBright ? Color.Blue : DIMMED_WORKING_STATUS_COLOR;
}

/**
 * 作業中ステータスが存在する間だけパルス位相を更新する
 */
export function useSessionStatusPulse(enabled: boolean): boolean {
  const [isBright, setIsBright] = useState(true);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const intervalId = setInterval(() => {
      setIsBright((current) => !current);
    }, SESSION_STATUS_PULSE_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [enabled]);

  return enabled ? isBright : true;
}
