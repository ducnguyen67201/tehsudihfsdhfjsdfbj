import { cn } from "@/lib/utils";
import { SUPPORT_CONVERSATION_EVENT_SOURCE } from "@shared/types";
import type { SupportConversationTimelineEvent } from "@shared/types";

function formatThreadTime(value: string): string {
  const date = new Date(value);
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
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

const AVATAR_COLORS = [
  "bg-amber-100 text-amber-700",
  "bg-blue-100 text-blue-700",
  "bg-emerald-100 text-emerald-700",
  "bg-violet-100 text-violet-700",
  "bg-rose-100 text-rose-700",
  "bg-cyan-100 text-cyan-700",
];

function threadInitials(name: string): string {
  const parts = name.trim().split(/[\s_-]+/);
  if (parts.length >= 2) {
    return `${(parts[0]?.[0] ?? "").toUpperCase()}${(parts[1]?.[0] ?? "").toUpperCase()}`;
  }
  return name.slice(0, 2).toUpperCase();
}

function threadAvatarColor(name: string, isOperator: boolean): string {
  if (isOperator) return "bg-primary/15 text-primary";
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  const idx = Math.abs(hash) % AVATAR_COLORS.length;
  return AVATAR_COLORS[idx] ?? AVATAR_COLORS[0]!;
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
                threadAvatarColor(name, isOperator)
              )}
            >
              {threadInitials(name)}
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
