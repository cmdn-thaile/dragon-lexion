import { prisma } from "./prisma";
import { getSessionUser } from "./auth0";
import { displayName } from "./names";

type Auth0User = { sub: string; name?: string; nickname?: string; email?: string; picture?: string };


/* Returns the database user for the current Auth0 session, creating it on first visit. */
export async function currentDbUser() {
  const u = (await getSessionUser()) as Auth0User | null;
  if (!u?.sub) return null;
  const data = { name: displayName(u), picture: u.picture ?? null };
  return prisma.user.upsert({ where: { auth0Id: u.sub }, update: data, create: { auth0Id: u.sub, ...data } });
}
