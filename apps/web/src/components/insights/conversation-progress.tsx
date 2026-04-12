"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { trpcQuery } from "@/lib/trpc-http";
import type {
  SupportConversation,
  SupportConversationListResponse,
  SupportConversationStatus,
} from "@shared/types";
import { useEffect, useMemo, useState } from "react";

type ConversationProgressProps = {
  workspaceId: string;
};

const STATUS_CONFIG: Record<
  SupportConversationStatus,
  { label: string; color: string; bgColor: string; barColor: string }
> = {
  UNREAD: {
    label: "Unread",
    color: "text-blue-400",
    bgColor: "bg-blue-500/10",
    barColor: "bg-blue-500",
  },
  IN_PROGRESS: {
    label: "In Progress",
    color: "text-yellow-400",
    bgColor: "bg-yellow-500/10",
    barColor: "bg-yellow-500",
  },
  STALE: {
    label: "Stale",
    color: "text-orange-400",
    bgColor: "bg-orange-500/10",
    barColor: "bg-orange-500",
  },
  DONE: {
    label: "Done",
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/10",
    barColor: "bg-emerald-500",
  },
};

function formatDurationMs(ms: number): string {
  const totalMinutes = Math.floor(ms / 60_000);
  if (totalMinutes < 1) return "<1m";
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours < 24) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
}

function formatShortDate(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatFullDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function computeTimelineRange(conversations: SupportConversation[]): {
  start: Date;
  end: Date;
} {
  const now = new Date();
  if (conversations.length === 0) {
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return { start: weekAgo, end: now };
  }

  let earliest = now.getTime();
  let latest = now.getTime();

  for (const c of conversations) {
    const created = new Date(c.createdAt).getTime();
    const updated = new Date(c.updatedAt).getTime();
    if (created < earliest) earliest = created;
    if (updated > latest) latest = updated;
  }

  // Add 5% padding on each side
  const range = latest - earliest;
  const padding = Math.max(range * 0.05, 12 * 60 * 60 * 1000); // min 12h padding
  return {
    start: new Date(earliest - padding),
    end: new Date(Math.max(latest + padding, now.getTime() + padding)),
  };
}

function generateDateMarkers(start: Date, end: Date): Date[] {
  const rangeMs = end.getTime() - start.getTime();
  const rangeDays = rangeMs / (24 * 60 * 60 * 1000);

  let intervalMs: number;
  if (rangeDays <= 3) intervalMs = 12 * 60 * 60 * 1000; // 12h
  else if (rangeDays <= 14) intervalMs = 24 * 60 * 60 * 1000; // 1d
  else if (rangeDays <= 60) intervalMs = 7 * 24 * 60 * 60 * 1000; // 1w
  else intervalMs = 30 * 24 * 60 * 60 * 1000; // 1mo

  const markers: Date[] = [];
  let current = new Date(start);
  // Align to start of day
  current.setHours(0, 0, 0, 0);

  while (current.getTime() <= end.getTime()) {
    if (current.getTime() >= start.getTime()) {
      markers.push(new Date(current));
    }
    current = new Date(current.getTime() + intervalMs);
  }

  return markers;
}

function SummaryCards({ conversations }: { conversations: SupportConversation[] }) {
  const now = Date.now();

  const statusCounts = useMemo(() => {
    const counts: Record<SupportConversationStatus, number> = {
      UNREAD: 0,
      IN_PROGRESS: 0,
      STALE: 0,
      DONE: 0,
    };
    for (const c of conversations) counts[c.status]++;
    return counts;
  }, [conversations]);

  const avgProcessingTime = useMemo(() => {
    const active = conversations.filter((c) => c.status !== "DONE");
    if (active.length === 0) return null;
    const totalMs = active.reduce((sum, c) => sum + (now - new Date(c.createdAt).getTime()), 0);
    return totalMs / active.length;
  }, [conversations, now]);

  const avgResolutionTime = useMemo(() => {
    const done = conversations.filter((c) => c.status === "DONE");
    if (done.length === 0) return null;
    const totalMs = done.reduce(
      (sum, c) => sum + (new Date(c.updatedAt).getTime() - new Date(c.createdAt).getTime()),
      0
    );
    return totalMs / done.length;
  }, [conversations]);

  const longestWaiting = useMemo(() => {
    const active = conversations.filter((c) => c.status !== "DONE");
    if (active.length === 0) return null;
    let longestMs = 0;
    for (const c of active) {
      const waitMs = now - new Date(c.createdAt).getTime();
      if (waitMs > longestMs) longestMs = waitMs;
    }
    return longestMs;
  }, [conversations, now]);

  return (
    <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-muted-foreground text-xs font-medium">Open Threads</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {statusCounts.UNREAD + statusCounts.IN_PROGRESS + statusCounts.STALE}
          </div>
          <div className="mt-1 flex gap-2 text-xs">
            <span className={STATUS_CONFIG.UNREAD.color}>{statusCounts.UNREAD} unread</span>
            <span className={STATUS_CONFIG.IN_PROGRESS.color}>
              {statusCounts.IN_PROGRESS} active
            </span>
            <span className={STATUS_CONFIG.STALE.color}>{statusCounts.STALE} stale</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-muted-foreground text-xs font-medium">Resolved</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{statusCounts.DONE}</div>
          <p className="text-muted-foreground mt-1 text-xs">
            {avgResolutionTime ? `Avg ${formatDurationMs(avgResolutionTime)}` : "No data yet"}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-muted-foreground text-xs font-medium">
            Avg Active Duration
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {avgProcessingTime ? formatDurationMs(avgProcessingTime) : "—"}
          </div>
          <p className="text-muted-foreground mt-1 text-xs">Across open threads</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-muted-foreground text-xs font-medium">Longest Wait</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {longestWaiting ? formatDurationMs(longestWaiting) : "—"}
          </div>
          <p className="text-muted-foreground mt-1 text-xs">Oldest open thread</p>
        </CardContent>
      </Card>
    </div>
  );
}

function TimelineRow({
  conversation,
  timelineStart,
  timelineEnd,
}: {
  conversation: SupportConversation;
  timelineStart: number;
  timelineEnd: number;
}) {
  const now = Date.now();
  const created = new Date(conversation.createdAt).getTime();
  const lastActive = new Date(conversation.updatedAt).getTime();
  const isOpen = conversation.status !== "DONE";
  const barEnd = isOpen ? now : lastActive;

  const totalRange = timelineEnd - timelineStart;
  const leftPct = ((created - timelineStart) / totalRange) * 100;
  const widthPct = ((barEnd - created) / totalRange) * 100;

  const config = STATUS_CONFIG[conversation.status];
  const durationMs = barEnd - created;

  // Truncate the conversation key for display
  const displayKey =
    conversation.canonicalConversationKey.length > 28
      ? `${conversation.canonicalConversationKey.slice(0, 28)}…`
      : conversation.canonicalConversationKey;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="group flex min-h-[36px] items-center border-b border-border/50 hover:bg-muted/40">
          {/* Label column */}
          <div className="flex w-[200px] shrink-0 items-center gap-2 px-3 md:w-[280px]">
            <span className={`size-2 shrink-0 rounded-full ${config.barColor}`} />
            <span className="min-w-0 truncate font-mono text-xs">{displayKey}</span>
          </div>

          {/* Timeline bar column */}
          <div className="relative h-full min-h-[36px] flex-1">
            <div
              className={`absolute top-1/2 h-5 -translate-y-1/2 rounded-sm ${config.barColor} transition-opacity group-hover:opacity-90`}
              style={{
                left: `${Math.max(0, leftPct)}%`,
                width: `${Math.max(0.5, Math.min(widthPct, 100 - leftPct))}%`,
              }}
            >
              <span className="absolute inset-0 flex items-center justify-center text-[10px] font-medium text-white opacity-0 group-hover:opacity-100">
                {formatDurationMs(durationMs)}
              </span>
            </div>
            {/* Pulse indicator for active conversations */}
            {isOpen ? (
              <div
                className={`absolute top-1/2 size-2 -translate-y-1/2 rounded-full ${config.barColor} animate-pulse`}
                style={{
                  left: `${Math.min(leftPct + widthPct, 99.5)}%`,
                }}
              />
            ) : null}
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        <div className="space-y-1">
          <div className="font-mono text-xs">{conversation.canonicalConversationKey}</div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={`${config.bgColor} ${config.color} text-[10px]`}>
              {config.label}
            </Badge>
            <span className="text-[10px] opacity-70">{formatDurationMs(durationMs)}</span>
          </div>
          <div className="text-[10px] opacity-70">
            Started: {formatFullDate(new Date(conversation.createdAt))}
          </div>
          <div className="text-[10px] opacity-70">
            Last activity: {formatFullDate(new Date(conversation.updatedAt))}
          </div>
          {conversation.customerWaitingSince ? (
            <div className="text-[10px] text-orange-300">
              Customer waiting since:{" "}
              {formatFullDate(new Date(conversation.customerWaitingSince))}
            </div>
          ) : null}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

function TimelineChart({ conversations }: { conversations: SupportConversation[] }) {
  const { start, end } = useMemo(() => computeTimelineRange(conversations), [conversations]);
  const markers = useMemo(() => generateDateMarkers(start, end), [start, end]);
  const timelineStart = start.getTime();
  const timelineEnd = end.getTime();
  const totalRange = timelineEnd - timelineStart;

  // Sort: open threads first (by createdAt asc), then done (by updatedAt desc)
  const sorted = useMemo(() => {
    const open = conversations
      .filter((c) => c.status !== "DONE")
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const done = conversations
      .filter((c) => c.status === "DONE")
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return [...open, ...done];
  }, [conversations]);

  // "Now" marker position
  const nowPct = ((Date.now() - timelineStart) / totalRange) * 100;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Conversation Timeline</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <div className="min-w-[700px]">
            {/* Date header */}
            <div className="flex border-b">
              <div className="w-[200px] shrink-0 px-3 py-2 md:w-[280px]">
                <span className="text-muted-foreground text-xs font-medium">Thread</span>
              </div>
              <div className="relative flex-1 py-2">
                {markers.map((marker) => {
                  const pct = ((marker.getTime() - timelineStart) / totalRange) * 100;
                  return (
                    <span
                      key={marker.toISOString()}
                      className="text-muted-foreground absolute top-2 -translate-x-1/2 text-[10px]"
                      style={{ left: `${pct}%` }}
                    >
                      {formatShortDate(marker)}
                    </span>
                  );
                })}
              </div>
            </div>

            {/* Grid lines + "now" marker */}
            <div className="relative">
              {/* Vertical grid lines */}
              {markers.map((marker) => {
                const pct = ((marker.getTime() - timelineStart) / totalRange) * 100;
                return (
                  <div
                    key={`grid-${marker.toISOString()}`}
                    className="pointer-events-none absolute top-0 bottom-0 w-px bg-border/30"
                    style={{ left: `calc(200px + (100% - 200px) * ${pct / 100})` }}
                  />
                );
              })}

              {/* "Now" line */}
              {nowPct >= 0 && nowPct <= 100 ? (
                <div
                  className="pointer-events-none absolute top-0 bottom-0 z-10 w-px bg-primary/60"
                  style={{ left: `calc(200px + (100% - 200px) * ${nowPct / 100})` }}
                >
                  <span className="bg-primary absolute -top-5 left-1/2 -translate-x-1/2 rounded-sm px-1.5 py-0.5 text-[9px] font-medium text-primary-foreground">
                    Now
                  </span>
                </div>
              ) : null}

              {/* Conversation rows */}
              <TooltipProvider>
                {sorted.map((conversation) => (
                  <TimelineRow
                    key={conversation.id}
                    conversation={conversation}
                    timelineStart={timelineStart}
                    timelineEnd={timelineEnd}
                  />
                ))}
              </TooltipProvider>

              {sorted.length === 0 ? (
                <div className="flex h-32 items-center justify-center">
                  <p className="text-muted-foreground text-sm">
                    No conversation threads yet.
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusLegend() {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-4">
      {(Object.entries(STATUS_CONFIG) as [SupportConversationStatus, (typeof STATUS_CONFIG)[SupportConversationStatus]][]).map(
        ([status, config]) => (
          <div key={status} className="flex items-center gap-1.5">
            <span className={`size-2.5 rounded-sm ${config.barColor}`} />
            <span className="text-muted-foreground text-xs">{config.label}</span>
          </div>
        )
      )}
      <div className="flex items-center gap-1.5">
        <span className="h-3 w-px bg-primary/60" />
        <span className="text-muted-foreground text-xs">Now</span>
      </div>
    </div>
  );
}

export function ConversationProgress({ workspaceId }: ConversationProgressProps) {
  const [conversations, setConversations] = useState<SupportConversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await trpcQuery<SupportConversationListResponse, { limit: number }>(
          "supportInbox.listConversations",
          { limit: 200 }
        );
        if (!cancelled) setConversations(result.conversations);
      } catch (err) {
        if (!cancelled)
          setLoadError(err instanceof Error ? err.message : "Failed to load conversations");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-3 w-20" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16" />
                <Skeleton className="mt-2 h-3 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-4 w-40" />
          </CardHeader>
          <CardContent>
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="mb-2 h-9 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loadError) {
    return <p className="text-destructive p-6 text-sm">{loadError}</p>;
  }

  return (
    <div className="space-y-4">
      <SummaryCards conversations={conversations} />
      <StatusLegend />
      <TimelineChart conversations={conversations} />
    </div>
  );
}
