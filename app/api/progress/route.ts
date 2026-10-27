import { NextResponse } from "next/server";
import { withDb } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { currentDbUser } from "@/lib/user";

export const dynamic = "force-dynamic";

/* Cloud save for signed-in players (the game keeps a localStorage copy too). */
async function handleGET() {
  const user = await currentDbUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ progress: user.progress ?? null });
}

async function handlePUT(req: Request) {
  const user = await currentDbUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const text = await req.text();
  if (text.length > 200_000) return NextResponse.json({ error: "too large" }, { status: 413 });
  let progress: unknown;
  try { progress = JSON.parse(text); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  if (!progress || typeof progress !== "object" || Array.isArray(progress)) {
    return NextResponse.json({ error: "bad progress" }, { status: 400 });
  }
  await prisma.user.update({ where: { id: user.id }, data: { progress: progress as object } });
  return NextResponse.json({ ok: true });
}

export const GET = withDb(handleGET);
export const PUT = withDb(handlePUT);
