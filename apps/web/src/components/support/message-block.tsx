import { avatarColor, senderInitials } from "@/components/support/avatar-utils";
import { cn } from "@/lib/utils";
import { RiReplyLine } from "@remixicon/react";
import { SUPPORT_CONVERSATION_EVENT_SOURCE } from "@shared/types";
import type { SupportConversationTimelineEvent } from "@shared/types";

function formatTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function extractSenderKey(event: SupportConversationTimelineEvent): string {
  const slackUserId =
    typeof event.detailsJson?.slackUserId === "string" ? event.detailsJson.slackUserId : null;
  return slackUserId ?? event.eventSource;
}

export function senderDisplayName(event: SupportConversationTimelineEvent): string {
  const slackUserId =
    typeof event.detailsJson?.slackUserId === "string" ? event.detailsJson.slackUserId : null;
  switch (event.eventSource) {
    case SUPPORT_CONVERSATION_EVENT_SOURCE.customer:
      return slackUserId ?? "Customer";
    case SUPPORT_CONVERSATION_EVENT_SOURCE.operator:
      return "You";
    default:
      return event.eventSource;
  }
}

function extractMessageText(event: SupportConversationTimelineEvent): string | null {
  if (typeof event.detailsJson?.messageText === "string") return event.detailsJson.messageText;
  if (typeof event.detailsJson?.rawText === "string") return event.detailsJson.rawText;
  return null;
}

interface MessageBlockProps {
  event: SupportConversationTimelineEvent;
  showHeader: boolean;
  onReplyToThread: () => void;
  children?: React.ReactNode;
}

/**
 * Message row: avatar + name/time header, bubble below, thread replies as children.
 */
export function MessageBlock({ event, showHeader, onReplyToThread, children }: MessageBlockProps) {
  const messageText = extractMessageText(event);
  const isOperator = event.eventSource === SUPPORT_CONVERSATION_EVENT_SOURCE.operator;
  const name = senderDisplayName(event);
  const hasThread = Boolean(children);

  return (
    <article className="group/msg" aria-label={`${name} at ${formatTime(event.createdAt)}`}>
      <div className="flex gap-2.5">
        {/* Avatar column — shows avatar on header rows, tree line when thread follows */}
        <div className="flex w-8 shrink-0 flex-col items-center">
          {showHeader ? (
            <div
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold",
                avatarColor(name, isOperator)
              )}
            >
              {senderInitials(name)}
            </div>
          ) : (
            <div className="h-8 w-8" />
          )}
          {/* Tree connector line down to thread */}
          {hasThread ? <div className="w-px flex-1 bg-border" /> : null}
        </div>

        {/* Content column */}
        <div className="min-w-0 flex-1 pb-0.5">
          {showHeader ? (
            <div className="flex items-baseline gap-2 pb-0.5">
              <span className="text-sm font-semibold">{name}</span>
              <span className="text-xs text-muted-foreground">{formatTime(event.createdAt)}</span>
            </div>
          ) : null}
          <div
            className={cn(
              "w-fit rounded-lg px-3 py-1.5 text-sm",
              isOperator ? "bg-primary/10" : "bg-muted/60"
            )}
          >
            {messageText ? <p className="whitespace-pre-wrap">{messageText}</p> : null}
          </div>
          {/* Show reply action only for messages without existing threads */}
          {!hasThread ? (
            <button
              type="button"
              onClick={onReplyToThread}
              className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground/60 opacity-0 transition-opacity hover:text-foreground group-hover/msg:opacity-100"
            >
              <RiReplyLine className="h-3 w-3" />
              Reply in thread
            </button>
          ) : null}
        </div>
      </div>

      {/* Thread replies — indented with tree connector */}
      {hasThread ? (
        <div className="flex gap-2.5">
          <div className="flex w-8 shrink-0 justify-center">
            <div className="h-3 w-px bg-border" />
          </div>
          <div className="min-w-0 flex-1">{children}</div>
        </div>
      ) : null}
    </article>
  );
}
