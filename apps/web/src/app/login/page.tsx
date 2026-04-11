import { LoginForm } from "@/components/auth/login-form";
import { env } from "@shared/env";

// Server Component render path: read the provider env var directly and
// pass the gate as a prop to the client login form. This avoids a client
// round-trip to auth.providers and the brief "button flash" at mount
// that a client-side query would cause. The auth.providers tRPC query
// still exists for CLI / test clients and as a fallback.
//
// The Google callback handler redirects here with ?google=denied|error|unverified
// on failure. We translate the status into a banner message on the server
// so the LoginForm client component just renders a plain string.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ google?: string }>;
}) {
  const googleEnabled = Boolean(env.GOOGLE_OAUTH_CLIENT_ID);
  const params = await searchParams;
  const googleBanner = translateGoogleStatus(params.google);

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <LoginForm googleEnabled={googleEnabled} googleBanner={googleBanner} />
    </main>
  );
}

function translateGoogleStatus(status: string | undefined): string | null {
  switch (status) {
    case "denied":
      return "Google sign-in was cancelled. Try again, or use email and password.";
    case "unverified":
      return "Your Google account's email isn't verified yet. Verify it at myaccount.google.com and try again.";
    case "error":
      return "Something went wrong signing in with Google. Please try again.";
    default:
      return null;
  }
}
