import { prisma } from "@shared/database";
import { NextResponse } from "next/server";

/**
 * Stripe requires signature verification against the raw body, so this handler
 * reads text first. Full signature verification will be wired when
 * STRIPE_WEBHOOK_SECRET is configured.
 */
export async function handleStripeWebhook(request: Request): Promise<NextResponse> {
  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  // TODO: Wire Stripe signature verification when STRIPE_WEBHOOK_SECRET is configured
  // const stripe = getStripeClient();
  // const event = stripe.webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);

  try {
    const event = JSON.parse(rawBody) as { id: string; type: string; data: { object: Record<string, unknown> } };

    // Idempotency check
    try {
      await prisma.stripeWebhookEvent.create({
        data: {
          stripeEventId: event.id,
          eventType: event.type,
        },
      });
    } catch {
      // Duplicate event, already processed
      return NextResponse.json({ received: true });
    }

    switch (event.type) {
      case "checkout.session.completed":
        // TODO: Create/update WorkspacePlan from checkout session metadata
        break;
      case "customer.subscription.updated":
        // TODO: Update tier, limits, period from subscription object
        break;
      case "customer.subscription.deleted":
        // TODO: Revert workspace to FREE tier
        break;
      case "invoice.payment_failed":
        // TODO: Update subscriptionStatus to PAST_DUE
        break;
      case "invoice.paid":
        // TODO: Update currentPeriodStart/End, clear pendingTier if applicable
        break;
      default:
        break;
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("[stripe-webhook] Processing error:", error);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 400 });
  }
}
