"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import GameMarkup from "./GameMarkup";
import Leaderboard from "./Leaderboard";
import type { SessionUser } from "./UserSlot";

type FinishResult = { stageId: string; won: boolean; correct: number; answered: number; bestStreak: number; dealt: number; durationMs: number; score: number };

export default function GameClient({ user }: { user: SessionUser }) {
  const [board, setBoard] = useState<{ id: string; name: string } | null>(null);
  const [loadError, setLoadError] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<unknown>(null);

  // Debounced cloud save; flushes with keepalive so it survives closing the tab.
  const flush = useCallback(() => {
    if (!pending.current) return;
    const body = JSON.stringify(pending.current); pending.current = null;
    fetch("/api/progress", { method: "PUT", body, keepalive: true, headers: { "Content-Type": "application/json" } }).catch(() => {});
  }, []);
  const queueProgress = useCallback((p: unknown) => {
    if (!user) return;
    pending.current = JSON.parse(JSON.stringify(p));
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flush, 1500);
  }, [user, flush]);

  const submitScore = useCallback(async (r: FinishResult) => {
    if (!user) return null;
    const res = await fetch("/api/scores", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(r) });
    return res.ok ? res.json() : null;
  }, [user]);

  useEffect(() => {
    let destroy: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      try {
        const [data, progress] = await Promise.all([
          fetch("/data/words.json").then(r => r.json()),
          user
            ? fetch("/api/progress", { cache: "no-store" }).then(r => (r.ok ? r.json() : null)).then(j => j?.progress ?? null).catch(() => null)
            : Promise.resolve(null),
        ]);
        if (cancelled) return;
        const { initGame } = await import("@/lib/game/engine");
        if (cancelled) return;
        destroy = initGame(data, {
          user,
          initialProgress: progress,
          onProgress: queueProgress,
          onFinish: submitScore,
          openLeaderboard: (id: string, name: string) => setBoard({ id, name }),
        });
      } catch {
        if (!cancelled) setLoadError(true);
      }
    })();
    window.addEventListener("pagehide", flush);
    return () => { cancelled = true; destroy?.(); flush(); window.removeEventListener("pagehide", flush); };
  }, [user, queueProgress, submitScore, flush]);

  const closeBoard = useCallback(() => setBoard(null), []);

  return (
    <>
      <GameMarkup user={user} />
      {board && <Leaderboard stageId={board.id} stageName={board.name} user={user} onClose={closeBoard} />}
      {loadError && (
        <div className="overlay" style={{ zIndex: 50 }}>
          <div className="panel"><h2>Lỗi tải game</h2><p>Không tải được dữ liệu từ vựng. Tải lại trang thử nhé.</p></div>
        </div>
      )}
    </>
  );
}
