import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

/**
 * Next.js 16 proxy (the successor to `middleware.ts`).
 *
 * This is **UX, not a security boundary**. Its only job is to send people
 * somewhere sensible:
 *   1. anonymous users → sign-in,
 *   2. signed-in users without an active organization → workspace selection.
 *
 * Authorization itself is resource-based: every page, layout, route handler and
 * server action re-derives identity with `requireAuthContext()` /
 * `getAuthContext()` and scopes its own queries. That is deliberate — Clerk
 * deprecated `createRouteMatcher` precisely because path-pattern matching in
 * middleware can diverge from how Next.js actually routes a request and leave a
 * protected resource reachable. Nothing here is load-bearing for access control.
 */

/**
 * Reachable without a Clerk session. /api/v1 is the public REST API — it
 * performs its own authentication with per-organization API keys, and a Clerk
 * redirect would break server-to-server callers.
 */
const PUBLIC_PREFIXES = [
  "/sign-in",
  "/sign-up",
  "/api/webhooks",
  "/api/v1",
  "/monitoring",
];

/** Requires a session, but not an active organization. */
const ORGANIZATION_AGNOSTIC_PREFIXES = ["/organization-selection"];

const startsWithAny = (pathname: string, prefixes: string[]) =>
  prefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

/** Only ever redirect to an in-app path, never an attacker-supplied host. */
const isSafeInternalPath = (value: string | null): value is string =>
  Boolean(value) && value!.startsWith("/") && !value!.startsWith("//");

export default clerkMiddleware(async (auth, request) => {
  const { pathname, search } = request.nextUrl;

  if (startsWithAny(pathname, PUBLIC_PREFIXES)) {
    return NextResponse.next();
  }

  const { userId, orgId, redirectToSignIn } = await auth();

  if (!userId) {
    return redirectToSignIn({ returnBackUrl: request.url });
  }

  if (!orgId && !startsWithAny(pathname, ORGANIZATION_AGNOSTIC_PREFIXES)) {
    const target = new URL("/organization-selection", request.url);
    // Remember where they were heading so selection can send them back.
    target.searchParams.set("redirect_url", pathname + search);
    return NextResponse.redirect(target);
  }

  // Someone who already picked a workspace has no reason to sit on the picker.
  if (orgId && pathname === "/organization-selection") {
    const requested = request.nextUrl.searchParams.get("redirect_url");
    const destination = isSafeInternalPath(requested) ? requested : "/";
    return NextResponse.redirect(new URL(destination, request.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    // Everything except Next internals and static assets, unless a search param
    // is present (so `?_rsc=` navigations still run).
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
