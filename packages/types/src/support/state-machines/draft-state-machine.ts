import { DRAFT_STATUS } from "../support-analysis.schema";

// ── Types ────────────────────────────────────────────────────────────

type DraftStatusValue = (typeof DRAFT_STATUS)[keyof typeof DRAFT_STATUS];

export interface DraftContext {
  draftId: string;
  status: DraftStatusValue;
  errorMessage: string | null;
}

export type DraftEvent =
  | { type: "generated" }
  | { type: "approve"; approvedBy: string }
  | { type: "dismiss"; reason?: string }
  | { type: "startSending" }
  | { type: "sendSucceeded"; slackMessageTs: string }
  | { type: "sendFailed"; error: string; retryable: boolean }
  | { type: "deliveryUnknown"; error: string }
  | { type: "reconcileFound"; slackMessageTs: string }
  | { type: "reconcileRetry" }
  | { type: "failed"; error: string }
  | { type: "retry" };

type DraftEventType = DraftEvent["type"];

export class InvalidDraftTransitionError extends Error {
  constructor(from: DraftStatusValue, event: DraftEventType) {
    super(`Invalid transition: cannot handle "${event}" in state "${from}"`);
    this.name = "InvalidDraftTransitionError";
  }
}

// ── State Interface ──────────────────────────────────────────────────

interface DraftState {
  readonly status: DraftStatusValue;
  readonly allowedEvents: readonly DraftEventType[];
  handle(event: DraftEvent, context: DraftContext): DraftContext;
}

// ── Concrete States ──────────────────────────────────────────────────

const generatingState: DraftState = {
  status: DRAFT_STATUS.generating,
  allowedEvents: ["generated", "failed"],
  handle(event, context) {
    switch (event.type) {
      case "generated":
        return { ...context, status: DRAFT_STATUS.awaitingApproval };
      case "failed":
        return {
          ...context,
          status: DRAFT_STATUS.failed,
          errorMessage: event.error,
        };
      default:
        throw new InvalidDraftTransitionError(this.status, event.type);
    }
  },
};

const awaitingApprovalState: DraftState = {
  status: DRAFT_STATUS.awaitingApproval,
  allowedEvents: ["approve", "dismiss"],
  handle(event, context) {
    switch (event.type) {
      case "approve":
        return { ...context, status: DRAFT_STATUS.approved };
      case "dismiss":
        return { ...context, status: DRAFT_STATUS.dismissed };
      default:
        throw new InvalidDraftTransitionError(this.status, event.type);
    }
  },
};

const approvedState: DraftState = {
  status: DRAFT_STATUS.approved,
  allowedEvents: ["startSending", "failed"],
  handle(event, context) {
    switch (event.type) {
      case "startSending":
        return { ...context, status: DRAFT_STATUS.sending };
      case "failed":
        return {
          ...context,
          status: DRAFT_STATUS.failed,
          errorMessage: event.error,
        };
      default:
        throw new InvalidDraftTransitionError(this.status, event.type);
    }
  },
};

// Slack delivery in progress. Three outcomes:
//  - success (200 + message ts) -> SENT
//  - transport error we can't confirm (network timeout, 5xx after local timeout)
//    -> DELIVERY_UNKNOWN so a reconciler can check Slack for our client_msg_id
//  - hard failure (permanent, non-retryable) -> SEND_FAILED
const sendingState: DraftState = {
  status: DRAFT_STATUS.sending,
  allowedEvents: ["sendSucceeded", "sendFailed", "deliveryUnknown"],
  handle(event, context) {
    switch (event.type) {
      case "sendSucceeded":
        return { ...context, status: DRAFT_STATUS.sent, errorMessage: null };
      case "sendFailed":
        return event.retryable
          ? { ...context, status: DRAFT_STATUS.deliveryUnknown, errorMessage: event.error }
          : { ...context, status: DRAFT_STATUS.sendFailed, errorMessage: event.error };
      case "deliveryUnknown":
        return {
          ...context,
          status: DRAFT_STATUS.deliveryUnknown,
          errorMessage: event.error,
        };
      default:
        throw new InvalidDraftTransitionError(this.status, event.type);
    }
  },
};

const sentState: DraftState = {
  status: DRAFT_STATUS.sent,
  allowedEvents: [],
  handle(event, context) {
    throw new InvalidDraftTransitionError(this.status, event.type);
  },
};

// Reconciler landed here because we didn't get a confirmed Slack ts.
// It queries Slack for our client_msg_id. Found -> SENT. Not found -> retry SENDING.
const deliveryUnknownState: DraftState = {
  status: DRAFT_STATUS.deliveryUnknown,
  allowedEvents: ["reconcileFound", "reconcileRetry", "failed"],
  handle(event, context) {
    switch (event.type) {
      case "reconcileFound":
        return { ...context, status: DRAFT_STATUS.sent, errorMessage: null };
      case "reconcileRetry":
        return { ...context, status: DRAFT_STATUS.sending, errorMessage: null };
      case "failed":
        return {
          ...context,
          status: DRAFT_STATUS.sendFailed,
          errorMessage: event.error,
        };
      default:
        throw new InvalidDraftTransitionError(this.status, event.type);
    }
  },
};

const sendFailedState: DraftState = {
  status: DRAFT_STATUS.sendFailed,
  allowedEvents: ["retry"],
  handle(event, context) {
    if (event.type === "retry") {
      return { ...context, status: DRAFT_STATUS.approved, errorMessage: null };
    }
    throw new InvalidDraftTransitionError(this.status, event.type);
  },
};

const dismissedState: DraftState = {
  status: DRAFT_STATUS.dismissed,
  allowedEvents: [],
  handle(event, context) {
    throw new InvalidDraftTransitionError(this.status, event.type);
  },
};

const failedState: DraftState = {
  status: DRAFT_STATUS.failed,
  allowedEvents: ["retry"],
  handle(event, context) {
    if (event.type === "retry") {
      return {
        ...context,
        status: DRAFT_STATUS.generating,
        errorMessage: null,
      };
    }
    throw new InvalidDraftTransitionError(this.status, event.type);
  },
};

// ── State Registry ───────────────────────────────────────────────────

const STATE_MAP: Record<DraftStatusValue, DraftState> = {
  [DRAFT_STATUS.generating]: generatingState,
  [DRAFT_STATUS.awaitingApproval]: awaitingApprovalState,
  [DRAFT_STATUS.approved]: approvedState,
  [DRAFT_STATUS.sending]: sendingState,
  [DRAFT_STATUS.sent]: sentState,
  [DRAFT_STATUS.sendFailed]: sendFailedState,
  [DRAFT_STATUS.deliveryUnknown]: deliveryUnknownState,
  [DRAFT_STATUS.dismissed]: dismissedState,
  [DRAFT_STATUS.failed]: failedState,
};

// ── Public API ───────────────────────────────────────────────────────

export function createDraftContext(draftId: string): DraftContext {
  return {
    draftId,
    status: DRAFT_STATUS.generating,
    errorMessage: null,
  };
}

export function restoreDraftContext(
  draftId: string,
  status: DraftStatusValue,
  errorMessage: string | null
): DraftContext {
  return { draftId, status, errorMessage };
}

export function transitionDraft(context: DraftContext, event: DraftEvent): DraftContext {
  const state = STATE_MAP[context.status];
  if (!state) {
    throw new Error(`Unknown draft status: ${context.status}`);
  }
  return state.handle(event, context);
}

export function getAllowedDraftEvents(context: DraftContext): readonly DraftEventType[] {
  const state = STATE_MAP[context.status];
  if (!state) return [];
  return state.allowedEvents;
}
