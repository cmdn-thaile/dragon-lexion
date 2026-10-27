import { NextResponse } from "next/server";
import { withDb } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { currentDbUser } from "@/lib/user";
import { computeScore } from "@/lib/score";
import { STAGES, isRankedStage } from "@/lib/stages";

export const dynamic = "force-dynamic";

const int = (v: unknown, min: number, max: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
};

/* POST a finished run. Stats are clamped to what the stage allows and the score is
   recomputed here, so a client can't simply send score: 999999. */
async function handlePOST(req: Request) {
  const user = await currentDbUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  if (!isRankedStage(body.stageId)) return NextResponse.json({ error: "unknown stage" }, { status: 400 });

  const stageId = body.stageId;
  const hp = STAGES[stageId].hp;
  const answered = int(body.answered, 0, 600);
  const correct = int(body.correct, 0, answered);
  const bestStreak = int(body.bestStreak, 0, correct);
  const dealt = int(body.dealt, 0, hp * 4);           // the dragon heals, so damage can exceed its HP
  const won = Boolean(body.won) && dealt >= hp;
  const durationMs = int(body.durationMs, 0, 6 * 60 * 60 * 1000);
  const accuracy = answered ? Math.round((correct / answered) * 100) : 0;
  const score = computeScore({ won, correct, answered, bestStreak, dealt });
  const run = { score, won, correct, answered, accuracy, bestStreak, durationMs };

  const key = { userId_stageId: { userId: user.id, stageId } };
  const prev = await prisma.bestScore.findUnique({ where: key });
  const isBest = !prev || score > prev.score;
  if (!prev) await prisma.bestScore.create({ data: { userId: user.id, stageId, ...run } });
  else await prisma.bestScore.update({ where: key, data: { plays: { increment: 1 }, ...(isBest ? run : {}) } });

  const best = isBest ? score : prev!.score;
  const rank = (await prisma.bestScore.count({ where: { stageId, score: { gt: best } } })) + 1;
  return NextResponse.json({ score, best, isBest, rank });
}

export const POST = withDb(handlePOST);
