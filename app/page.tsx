import GameClient from "@/components/GameClient";
import { getSessionUser } from "@/lib/auth0";
import { displayName } from "@/lib/names";

export const dynamic = "force-dynamic";

export default async function Page() {
  const u = await getSessionUser();
  const user = u ? { name: displayName(u), picture: (u.picture as string | undefined) ?? null } : null;
  return <GameClient user={user} />;
}
