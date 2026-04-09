import { avatarColor, senderInitials } from "@/components/support/avatar-utils";
import { cn } from "@/lib/utils";
import { SUPPORT_CONVERSATION_EVENT_SOURCE } from "@shared/types";
import type { SupportConversationTimelineEvent } from "@shared/types";

function formatThreadTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function threadSourceLabel(eventSource: string): string {
  switch (eventSource) {
    case SUPPORT_CONVERSATION_EVENT_SOURCE.customer:
      return "Customer";
    case SUPPORT_CONVERSATION_EVENT_SOURCE.operator:
      return "You";
    default:
      return eventSource;
  }
}

interface MessageThreadProps {
  replies: SupportConversationTimelineEvent[];
  onReplyToThread: () => void;
}

/**
 * Inline thread expansion with small avatars per reply.
 */
export function MessageThread({ replies, onReplyToThread }: MessageThreadProps) {
  return (
    <div className="space-y-2 pt-0.5">
      {replies.map((reply) => {
        const messageText =
          typeof reply.detailsJson?.messageText === "string"
            ? reply.detailsJson.messageText
            : typeof reply.detailsJson?.rawText === "string"
              ? reply.detailsJson.rawText
              : null;

        const slackUser =
          typeof reply.detailsJson?.slackUserId === "string" ? reply.detailsJson.slackUserId : null;

        const isOperator = reply.eventSource === SUPPORT_CONVERSATION_EVENT_SOURCE.operator;
        const name = slackUser ?? threadSourceLabel(reply.eventSource);

        return (
          <div key={reply.id} className="flex gap-2">
            <div
              className={cn(
                "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
                avatarColor(name, isOperator)
              )}
            >
              {senderInitials(name)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-medium">{name}</span>
                <span className="text-xs text-muted-foreground">
                  {formatThreadTime(reply.createdAt)}
                </span>
              </div>
              {messageText ? <p className="text-sm whitespace-pre-wrap">{messageText}</p> : null}
            </div>
          </div>
        );
      })}
      <button
        type="button"
        onClick={onReplyToThread}
        className="text-xs text-muted-foreground hover:text-foreground transition"
      >
        Reply to thread...
      </button>
    </div>
  );
}
