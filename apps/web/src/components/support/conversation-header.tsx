"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { RiCheckLine, RiFileCopyLine, RiHashtag } from "@remixicon/react";
import {
  SUPPORT_CONVERSATION_STATUS,
  type SupportConversation,
  type SupportConversationStatus,
} from "@shared/types";
import { useCallback, useMemo, useState } from "react";

interface ConversationHeaderProps {
  conversation: SupportConversation;
  isMutating: boolean;
  onBack: () => void;
  onMarkDoneWithOverride: (conversationId: string, overrideReason: string) => Promise<unknown>;
  onUpdateStatus: (conversationId: string, status: SupportConversationStatus) => Promise<unknown>;
}

/**
 * Full-width header bar matching the reference layout.
 * Left: # icon + thread title. Right: thread ID badge, copy link, mark resolved.
 */
export function ConversationHeader({
  conversation,
  isMutating,
  onBack,
  onMarkDoneWithOverride,
  onUpdateStatus,
}: ConversationHeaderProps) {
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [copied, setCopied] = useState(false);

  const isDone = conversation.status === SUPPORT_CONVERSATION_STATUS.done;

  const threadDate = useMemo(() => {
    const epochSeconds = Number.parseFloat(conversation.thread.threadTs);
    if (Number.isNaN(epochSeconds)) return conversation.thread.threadTs;
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(epochSeconds * 1000));
  }, [conversation.thread.threadTs]);

  const handleCopyLink = useCallback(() => {
    const url = `${window.location.origin}${window.location.pathname}?thread=${conversation.id}`;
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [conversation.id]);

  function handleMarkResolved() {
    if (isDone) return;
    void onUpdateStatus(conversation.id, SUPPORT_CONVERSATION_STATUS.done);
  }

  async function handleOverrideSubmit() {
    if (overrideReason.trim().length < 10) return;
    await onMarkDoneWithOverride(conversation.id, overrideReason.trim());
    setOverrideReason("");
    setOverrideOpen(false);
  }

  return (
    <>
      <div className="flex items-center justify-between border-b px-5 py-3">
        {/* Left: thread title */}
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="flex shrink-0 items-center justify-center rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            aria-label="Close conversation"
          >
            <RiHashtag className="h-4 w-4" />
          </button>
          <h1 className="truncate text-sm font-semibold">{conversation.thread.channelId}</h1>
          <span className="shrink-0 text-xs text-muted-foreground">{threadDate}</span>
        </div>

        {/* Right: copy link + mark resolved */}
        <div className="flex shrink-0 items-center gap-2">
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" onClick={handleCopyLink}>
                  {copied ? (
                    <RiCheckLine className="h-3.5 w-3.5 text-emerald-600" />
                  ) : (
                    <RiFileCopyLine className="h-3.5 w-3.5" />
                  )}
                  <span className="hidden sm:inline">{copied ? "Copied" : "Copy Link"}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Copy thread link</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <Button size="sm" disabled={isMutating || isDone} onClick={handleMarkResolved}>
            <RiCheckLine className="h-3.5 w-3.5" />
            <span>{isDone ? "Resolved" : "Mark Resolved"}</span>
          </Button>
        </div>
      </div>

      <Dialog open={overrideOpen} onOpenChange={setOverrideOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark done with override</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground text-sm">
            Explain why this thread can be closed without Slack delivery evidence.
          </p>
          <Textarea
            value={overrideReason}
            onChange={(e) => setOverrideReason(e.target.value)}
            placeholder="Minimum 10 characters..."
            className="min-h-24"
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOverrideOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={isMutating || overrideReason.trim().length < 10}
              onClick={() => void handleOverrideSubmit()}
            >
              Mark done
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
