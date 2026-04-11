"use client";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  type SessionTimelineEvent,
  sessionEventDescription,
  sessionEventTypeDisplay,
} from "@shared/types";
import { useCallback, useRef } from "react";

interface SessionEventTimelineProps {
  events: SessionTimelineEvent[];
  isLoading: boolean;
  failurePointId: string | null;
  onEventClick?: (eventId: string, timestamp: string) => void;
  selectedEventId?: string | null;
}

const skeletonRowKeys = [
  "skeleton-a",
  "skeleton-b",
  "skeleton-c",
  "skeleton-d",
  "skeleton-e",
  "skeleton-f",
  "skeleton-g",
  "skeleton-h",
] as const;

function formatTime(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

/**
 * Virtualized event timeline for the Session tab.
 * Per DESIGN.md: "Evidence should render as dense rows with clear metadata."
 * Uses monospace timestamps, minimal chrome, failure point highlighted.
 */
export function SessionEventTimeline({
  events,
  isLoading,
  failurePointId,
  onEventClick,
  selectedEventId,
}: SessionEventTimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleEventClick = useCallback(
    (eventId: string, timestamp: string) => {
      onEventClick?.(eventId, timestamp);
    },
    [onEventClick]
  );

  if (isLoading) {
    return (
      <div className="space-y-2 p-2">
        {skeletonRowKeys.map((key) => (
          <div key={key} className="flex items-center gap-3">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-3 w-40" />
          </div>
        ))}
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="p-4">
        <p className="text-muted-foreground text-sm">No events recorded in this session window.</p>
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 w-full overflow-auto" ref={scrollRef}>
      <ul className="min-w-max space-y-0.5 p-1" aria-label="Session events">
        {events.map((event) => {
          const isFailurePoint = event.id === failurePointId;
          const isSelected = event.id === selectedEventId;
          const typeInfo = sessionEventTypeDisplay(event.eventType);
          const description = sessionEventDescription(event.eventType, event.payload, event.url);

          return (
            <li key={event.id}>
              <button
                type="button"
                className={`flex min-w-max w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted/50 ${
                  isFailurePoint ? "bg-destructive/5 border-l-2 border-destructive" : ""
                } ${isSelected ? "bg-muted" : ""}`}
                onClick={() => handleEventClick(event.id, event.timestamp)}
                aria-label={`${event.eventType} at ${formatTime(event.timestamp)}: ${description}`}
              >
                <span className="text-muted-foreground w-16 shrink-0 font-mono text-xs">
                  {formatTime(event.timestamp)}
                </span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="whitespace-nowrap">{description}</span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-sm">
                    <p className="font-mono text-xs">{description}</p>
                    {event.url ? (
                      <p className="text-muted-foreground text-xs mt-1">{event.url}</p>
                    ) : null}
                  </TooltipContent>
                </Tooltip>
                <Badge variant="outline" className={`shrink-0 text-[10px] ${typeInfo.className}`}>
                  {typeInfo.label}
                </Badge>
                {isFailurePoint ? (
                  <span className="text-destructive text-xs shrink-0">failure</span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
