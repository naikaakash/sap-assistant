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
      // Public-client / PKCE-only flow. The redirect URI for this app is
      // registered as a SPA redirect (required to make personal Microsoft
      // accounts work via login.live.com); SPA registrations force public-
      // client semantics, so we must NOT send the client_secret to the token
      // endpoint. Auth.js still lets us optionally provide one for the
      // confidential branch, but we override `token_endpoint_auth_method` to
      // `none` so PKCE is the only proof of possession we send.
      clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
      clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
      issuer: process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER,
      client: {
        token_endpoint_auth_method: "none",
      },
    }),
  ],
  session: { strategy: "jwt" },
  trustHost: true,
  debug: true,
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
