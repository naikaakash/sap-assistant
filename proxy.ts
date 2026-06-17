import { auth } from "./auth";

/**
 * Gate every page + API call behind Microsoft Entra sign-in, except:
 *   - the auth flow itself (/api/auth/*)
 *   - the dedicated public sign-in page (/signin)
 *   - liveness/readiness probes (/api/health, /api/hello)
 *   - Next.js internals + static assets
 *
 * Unauthenticated users get redirected to /signin (which renders a single
 * "Sign in with Microsoft" button → MicrosoftEntraID provider).
 */
export default auth((req) => {
  const { pathname } = req.nextUrl;

  const isPublic =
    pathname.startsWith("/api/auth") ||
    pathname === "/signin" ||
    pathname === "/api/health" ||
    pathname === "/api/hello";

  if (!req.auth && !isPublic) {
    const signInUrl = new URL("/signin", req.nextUrl.origin);
    signInUrl.searchParams.set("callbackUrl", pathname);
    return Response.redirect(signInUrl);
  }
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
