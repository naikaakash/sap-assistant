import NextAuth, { type DefaultSession } from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";

/**
 * Auth.js v5 (next-auth@beta) wiring for the sap-assistant Container App.
 *
 * Required env vars (Auth.js reads `AUTH_*` automatically):
 *   - AUTH_SECRET                       — random 32-byte secret for JWT signing
 *   - AUTH_MICROSOFT_ENTRA_ID_ID        — Entra app registration (client) id
 *   - AUTH_MICROSOFT_ENTRA_ID_SECRET    — client secret
 *   - AUTH_MICROSOFT_ENTRA_ID_ISSUER    — https://login.microsoftonline.com/<tenant-id>/v2.0
 *   - AUTH_TRUST_HOST=true              — needed behind Azure Container Apps' reverse proxy
 *
 * Callback URL registered on the Entra app:
 *   https://<fqdn>/api/auth/callback/microsoft-entra-id
 */

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      tenantId?: string;
    } & DefaultSession["user"];
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    MicrosoftEntraID({
      // Override the provider scope to drop `User.Read` (Microsoft Graph
      // delegated permission). MSA / personal Microsoft accounts struggle to
      // consent to Graph scopes on a multi-tenant app and that has been
      // observed to make MS's token endpoint return `invalid_request`. We
      // only need openid/profile/email for sign-in.
      authorization: { params: { scope: "openid profile email" } },
      // Since we no longer hold a `User.Read` access token, override
      // `profile()` so it doesn't try to fetch the photo from Graph.
      profile(profile) {
        return {
          id: profile.sub,
          name: profile.name,
          email: profile.email,
          image: null,
        };
      },
      clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
      clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
      issuer: process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER,
      // We've registered the redirect URI as both web AND spa on the Entra
      // app (required to get past MSA's login.live.com authorize check).
      // SPA-registered URIs are treated as public clients by MS, so the token
      // request must NOT include `client_secret` — force PKCE-only auth.
      client: { token_endpoint_auth_method: "none" },
      // Auth.js v5 beta throws `OAuthCallbackError: invalid_request` and
      // SILENTLY DROPS the cause/`error_description` from Microsoft (passes
      // the cause object as Error options, but the options reader only
      // honours `{cause: ...}`). Intercept the token response here so we
      // can log MS's full error JSON (error_description / trace_id /
      // error_uri / timestamp) to container logs.
      token: {
        conform: async (response: Response) => {
          try {
            const cloned = response.clone();
            const text = await cloned.text();
            const status = response.status;
            console.log(
              "[auth][token-response]",
              JSON.stringify({ status, body: text.slice(0, 4000) }),
            );
          } catch (e) {
            console.error("[auth][token-response-log-failed]", e);
          }
          return response;
        },
      },
    }),
  ],
  session: { strategy: "jwt" },
  trustHost: true,
  debug: true,
  logger: {
    error(error) {
      // Auth.js v5's default logger swallows the `cause` field — which is
      // exactly where Microsoft puts `error_description` / `error_uri` /
      // `trace_id`. Dump them explicitly so we can diagnose token-endpoint
      // failures from container logs.
      const anyErr = error as unknown as { message?: string; cause?: unknown; stack?: string };
      console.error(
        "[auth][error-detail]",
        JSON.stringify(
          {
            name: error?.name,
            message: anyErr?.message,
            cause: anyErr?.cause,
          },
          null,
          2,
        ),
      );
      if (anyErr?.stack) console.error("[auth][error-stack]", anyErr.stack);
    },
    warn(code) {
      console.warn("[auth][warn]", code);
    },
    debug(code, metadata) {
      console.log("[auth][debug]", code, metadata ? JSON.stringify(metadata) : "");
    },
  },
  callbacks: {
    async jwt({ token, profile }) {
      if (profile) {
        token.oid = (profile as { oid?: string }).oid;
        token.tid = (profile as { tid?: string }).tid;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        const id = (token.oid as string | undefined) ?? token.sub ?? "";
        session.user.id = id;
        session.user.tenantId = token.tid as string | undefined;
      }
      return session;
    },
  },
});
