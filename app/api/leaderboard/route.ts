import { NextResponse } from "next/server";
import { withDb } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { currentDbUser } from "@/lib/user";
import { isRankedStage } from "@/lib/stages";

export const dynamic = "force-dynamic";

/* GET /api/leaderboard?stage=w1  → top 20 for the stage, plus the caller's own rank if signed in. */
async function handleGET(req: Request) {
  const stage = new URL(req.url).searchParams.get("stage");
  if (!isRankedStage(stage)) return NextResponse.json({ error: "unknown stage" }, { status: 400 });

  const [rows, me] = await Promise.all([
    prisma.bestScore.findMany({
      where: { stageId: stage },
      orderBy: [{ score: "desc" }, { updatedAt: "asc" }],
      take: 20,
      include: { user: { select: { id: true, name: true, picture: true } } },
    }),
    currentDbUser().catch(() => null),
  ]);

  let mine = null;
  if (me) {
    const row = await prisma.bestScore.findUnique({ where: { userId_stageId: { userId: me.id, stageId: stage } } });
    if (row) {
      const rank = (await prisma.bestScore.count({ where: { stageId: stage, score: { gt: row.score } } })) + 1;
      mine = { rank, score: row.score, plays: row.plays };
    }
  }

  return NextResponse.json({
    stage,
    entries: rows.map((r, i) => ({
      rank: i + 1, name: r.user.name, picture: r.user.picture, score: r.score,
      accuracy: r.accuracy, bestStreak: r.bestStreak, won: r.won, isMe: me?.id === r.user.id,
    })),
    me: mine,
  });
}

export const GET = withDb(handleGET);
