import { RequestAccessForm } from "@/components/workspace/request-access-form";
import { Logo } from "@shared/brand";

/**
 * Landing for authenticated users with no workspace membership.
 *
 * Google sign-in lands brand-new users here when their email domain doesn't
 * match an existing workspace (TrustLoop provisions workspaces manually
 * during onboarding for now). This is a prospect's first impression after
 * clicking "Continue with Google", so the page doubles as a marketing
 * surface: left side restricts access, right side sells the product.
 */
export function NoWorkspaceState() {
  return (
    <div className="grid w-full max-w-5xl gap-12 md:grid-cols-[1.1fr_1fr] md:items-center md:gap-16">
      <AccessPanel />
      <MarketingPanel />
    </div>
  );
}

function AccessPanel() {
  return (
    <div className="flex flex-col items-center text-center md:items-start md:text-left">
      <Logo
        title="TrustLoop AI"
        className="mb-6 size-16 rounded-full bg-foreground/5 p-3.5"
      />
      <h1 className="text-3xl font-semibold tracking-tight text-balance md:text-4xl">
        Access Restricted
      </h1>
      <p className="mt-3 text-base text-muted-foreground text-balance">
        Sign-in worked, but you don't have access to a workspace yet. Contact your admin, or
        request access below and we'll find someone who can help.
      </p>

      <div className="mt-8 w-full">
        <RequestAccessForm />
      </div>
    </div>
  );
}

/**
 * Right-side marketing panel. Copy and metrics mirror the marketing site
 * (apps/marketing) so this page doubles as a sales surface for prospects
 * who just signed in. Update the "Hackathon winner" pill with the actual
 * award name once confirmed.
 */
function MarketingPanel() {
  return (
    <aside className="relative rounded-lg border bg-card/60 p-8 md:p-10">
      <div className="inline-flex items-center gap-2 rounded-full bg-primary px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary-foreground shadow-sm">
        <span className="relative flex size-1.5">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary-foreground opacity-75" />
          <span className="relative inline-flex size-1.5 rounded-full bg-primary-foreground" />
        </span>
        Hackathon Winner · Early Access
      </div>

      <h2 className="mt-6 text-2xl font-semibold tracking-tight text-balance md:text-3xl">
        Slack support that reads your code.
        <br />
        <span className="text-muted-foreground">Then drafts the fix.</span>
      </h2>

      <p className="mt-4 text-sm text-muted-foreground text-pretty">
        Built for engineering teams drowning in customer support threads. Reads your repo, replays
        the customer's session, drafts the Slack reply, and preps the fix PR. Every answer
        grounded in real code.
      </p>

      <dl className="mt-8 grid grid-cols-3 gap-4 border-t pt-6">
        <Metric value="<30s" label="To first draft" />
        <Metric value="90%+" label="Code accuracy" />
        <Metric value="Hours" label="Saved per eng/wk" />
      </dl>
    </aside>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <dt className="text-xl font-semibold tracking-tight text-foreground md:text-2xl">{value}</dt>
      <dd className="mt-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </dd>
    </div>
  );
}
