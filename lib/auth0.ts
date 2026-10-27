import { Auth0Client } from "@auth0/nextjs-auth0/server";

/* Reads AUTH0_DOMAIN, AUTH0_CLIENT_ID, AUTH0_CLIENT_SECRET, AUTH0_SECRET, APP_BASE_URL.
   If Auth0 is not configured the game still runs in guest mode (local save only). */
export const authConfigured = Boolean(
  process.env.AUTH0_DOMAIN && process.env.AUTH0_CLIENT_ID && process.env.AUTH0_CLIENT_SECRET &&
  process.env.AUTH0_SECRET && process.env.APP_BASE_URL
);

export const auth0 = authConfigured ? new Auth0Client() : null;

export async function getSessionUser() {
  if (!auth0) return null;
  try {
    const session = await auth0.getSession();
    return session?.user ?? null;
  } catch {
    return null;
  }
}
