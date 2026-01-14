"use client";

import React, { useMemo } from "react";

type HourlyEntry = {
  timestamp: string; // ISO
  message: string;
};

type Props = {
  entries: HourlyEntry[];
  timeZone?: string; // default Asia/Kathmandu
  bubbleText?: "latest" | "combined"; // latest = show last log only, combined = join all messages
  maxCombinedChars?: number; // only for combined
};

function formatTimeHM(ts: string, timeZone: string) {
  const d = new Date(ts);
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(d);
}

export default function AdminHourlyLogsRangeBubble({
  entries,
  timeZone = "Asia/Kathmandu",
  bubbleText = "latest",
  maxCombinedChars = 240,
}: Props) {
  const sorted = useMemo(() => {
    return [...(entries || [])].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }, [entries]);

  const range = useMemo(() => {
    if (!sorted.length) return null;
    const start = formatTimeHM(sorted[0].timestamp, timeZone);
    const end = formatTimeHM(sorted[sorted.length - 1].timestamp, timeZone);
    return { start, end };
  }, [sorted, timeZone]);

  const bubbleMessage = useMemo(() => {
    if (!sorted.length) return "";
    if (bubbleText === "latest") return sorted[sorted.length - 1].message || "";

    // combined
    const combined = sorted
      .map((e) => (e.message || "").trim())
      .filter(Boolean)
      .join(" • ");

    if (combined.length <= maxCombinedChars) return combined;
    return combined.slice(0, maxCombinedChars).trimEnd() + "…";
  }, [sorted, bubbleText, maxCombinedChars]);

  if (!sorted.length) {
    return (
      <div className="text-sm text-muted-foreground">
        No hourly logs
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[120px_1fr] gap-4 items-start">
      {/* Left: start/end pills */}
      <div className="flex flex-col gap-2">
        <div className="w-full rounded-2xl border bg-muted px-3 py-2 text-sm font-semibold">
          {range?.start}
        </div>
        <div className="w-full rounded-2xl border bg-muted px-3 py-2 text-sm font-semibold">
          {range?.end}
        </div>
      </div>

      {/* Right: bubble */}
      <div className="rounded-2xl border bg-background px-4 py-3 text-base leading-6">
        {bubbleMessage || <span className="text-muted-foreground">—</span>}
      </div>
    </div>
  );
}
