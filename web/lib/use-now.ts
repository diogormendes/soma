"use client";

import { useSyncExternalStore } from "react";

/**
 * The current time as an external store that ticks every `intervalMs`, for client components
 * that compare a timestamp with "now" while rendering (soma#958: Date.now() during render is an
 * impure read; a store subscription is the React way to read a clock).
 */
export function useNow(intervalMs = 30_000): number {
  return useSyncExternalStore(
    (onChange) => {
      const id = window.setInterval(onChange, intervalMs);
      return () => window.clearInterval(id);
    },
    () => Math.floor(Date.now() / intervalMs) * intervalMs,
    () => 0,
  );
}
