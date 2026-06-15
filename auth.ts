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
      // The redirect URI is registered as `publicClient` (Mobile and desktop
      // / Native client-type) on the Entra app — NOT `web` and NOT `spa`.
      // SPA platform requires CORS/Origin header on the token request which
      // Auth.js's server-side fetch can't supply (AADSTS90023). Native is the
      // right platform for a server-rendered Next.js app that needs MSA
      // support on a multi-tenant app. Native = PKCE without client secret,
      // so the token request must NOT include `client_secret`.
      client: { token_endpoint_auth_method: "none" },
    }),
  ],
  session: { strategy: "jwt" },
  trustHost: true,
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
