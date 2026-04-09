"use client";

import { ConversationHeader } from "@/components/support/conversation-header";
import { ConversationPropertiesSidebar } from "@/components/support/conversation-properties-sidebar";
import { MessageList } from "@/components/support/message-list";
import { ReplyComposer } from "@/components/support/reply-composer";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { useAnalysis } from "@/hooks/use-analysis";
import { useConversationPolling } from "@/hooks/use-conversation-polling";
import { useSessionReplay } from "@/hooks/use-session-replay";
import { useSupportInbox } from "@/hooks/use-support-inbox";
import { useCallback, useState } from "react";

interface ConversationViewProps {
  conversationId: string;
  workspaceId: string;
  onBack: () => void;
}

/**
 * Two-panel conversation layout: messages on left, properties sidebar on right.
 * Full-width header spans both panels.
 */
export function ConversationView({ conversationId, workspaceId, onBack }: ConversationViewProps) {
  const inbox = useSupportInbox();
  const polling = useConversationPolling(conversationId);
  const analysisHook = useAnalysis(conversationId, workspaceId);
  const sessionReplay = useSessionReplay(conversationId, workspaceId);
  const [replyToEventId, setReplyToEventId] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  const conversation = polling.timelineData?.conversation ?? null;
  const events = polling.timelineData?.events ?? [];

  const handleSendReply = useCallback(
    async (messageText: string, replyToId?: string) => {
      setSendError(null);
      try {
        await inbox.sendReply(conversationId, messageText, replyToId);
        setReplyToEventId(null);
        await polling.refresh();
      } catch (err) {
        setSendError(err instanceof Error ? err.message : "Failed to send. Try again.");
      }
    },
    [conversationId, inbox, polling]
  );

  const handleRetryDelivery = useCallback(
    (deliveryAttemptId: string) => {
      void inbox.retryDelivery(deliveryAttemptId).then(() => polling.refresh());
    },
    [inbox, polling]
  );

  if (polling.error && !conversation) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
        <Alert variant="destructive" className="max-w-md">
          <AlertTitle>Conversation not found</AlertTitle>
          <AlertDescription>{polling.error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!conversation && polling.isLoading) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-3 border-b px-5 py-3">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
        <div className="flex flex-1">
          <div className="flex-1 space-y-4 p-4">
            <Skeleton className="h-16 w-3/4" />
            <Skeleton className="ml-auto h-16 w-3/4" />
            <Skeleton className="h-16 w-3/4" />
          </div>
          <div className="w-[340px] space-y-4 border-l p-5">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-8 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (!conversation) {
    return null;
  }

  return (
    <div className="flex h-full flex-col">
      {/* Full-width header */}
      <ConversationHeader
        conversation={conversation}
        isMutating={inbox.isMutating}
        onBack={onBack}
        onMarkDoneWithOverride={inbox.markDoneWithOverrideReason}
        onUpdateStatus={inbox.updateConversationStatus}
      />

      {/* Two-panel body */}
      <div className="flex min-h-0 flex-1">
        {/* Left: messages + composer */}
        <div className="flex min-w-0 flex-1 flex-col">
          <MessageList
            events={events}
            isLoading={polling.isLoading}
            isMutating={inbox.isMutating}
            onRetryDelivery={handleRetryDelivery}
            onSetReplyToEventId={setReplyToEventId}
          />

          <ReplyComposer
            isMutating={inbox.isMutating}
            onSendReply={handleSendReply}
            replyToEventId={replyToEventId}
            onCancelThreadReply={() => setReplyToEventId(null)}
            sendError={sendError}
          />
        </div>

        {/* Right: properties sidebar */}
        <ConversationPropertiesSidebar
          conversation={conversation}
          events={events}
          isMutating={inbox.isMutating}
          onAssign={inbox.assignConversation}
          onUpdateStatus={inbox.updateConversationStatus}
          analysis={analysisHook.analysis}
          isAnalyzing={analysisHook.isAnalyzing}
          isAnalysisMutating={analysisHook.isMutating}
          analysisError={analysisHook.error}
          onTriggerAnalysis={() => void analysisHook.triggerAnalysis()}
          onApproveDraft={(draftId, editedBody) =>
            void analysisHook.approveDraft(draftId, editedBody)
          }
          onDismissDraft={(draftId, reason) => void analysisHook.dismissDraft(draftId, reason)}
          workspaceId={workspaceId}
          sessionReplay={sessionReplay}
        />
      </div>
    </div>
  );
}
