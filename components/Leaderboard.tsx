/* eslint-disable @next/next/no-img-element, @next/next/no-html-link-for-pages */
"use client";
import { useEffect, useState } from "react";
import type { SessionUser } from "./UserSlot";

type Entry = { rank: number; name: string; picture: string | null; score: number; accuracy: number; bestStreak: number; won: boolean; isMe: boolean };
type Board = { entries: Entry[]; me: { rank: number; score: number; plays: number } | null };

export default function Leaderboard({ stageId, stageName, user, onClose }:
  { stageId: string; stageName: string; user: SessionUser; onClose: () => void }) {
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let live = true;
    setBoard(null); setError(false);
    fetch(`/api/leaderboard?stage=${encodeURIComponent(stageId)}`, { cache: "no-store" })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(b => live && setBoard(b))
      .catch(() => live && setError(true));
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { live = false; window.removeEventListener("keydown", onKey); };
  }, [stageId, onClose]);

  return (
    <div className="overlay" style={{ zIndex: 40 }} onClick={onClose}>
      <div className="panel lb-panel" role="dialog" aria-label={`Bảng xếp hạng ${stageName}`} onClick={e => e.stopPropagation()}>
        <h2>🏆 {stageName}</h2>
        {error && <p className="lb-empty">Không tải được bảng xếp hạng.</p>}
        {!error && !board && <p className="lb-empty">Đang tải…</p>}
        {board && board.entries.length === 0 && <p className="lb-empty">Chưa có ai ghi điểm ở màn này. Hãy là người đầu tiên!</p>}
        {board && board.entries.length > 0 && (
          <table className="lb-table">
            <thead><tr><th>#</th><th>Hiệp sĩ</th><th className="num">Điểm</th><th className="num">Chính xác</th><th className="num">Chuỗi</th></tr></thead>
            <tbody>
              {board.entries.map(e => (
                <tr key={e.rank} className={e.isMe ? "me" : undefined}>
                  <td><span className="lb-rank">{e.rank}</span></td>
                  <td><span className="lb-player">{e.picture ? <img src={e.picture} alt="" referrerPolicy="no-referrer" /> : null}<span>{e.name}</span>{e.won ? " ✓" : ""}</span></td>
                  <td className="num">{e.score.toLocaleString("vi-VN")}</td>
                  <td className="num">{e.accuracy}%</td>
                  <td className="num">{e.bestStreak}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {board?.me && <p className="lb-me">Bạn đang hạng #{board.me.rank} với {board.me.score.toLocaleString("vi-VN")} điểm ({board.me.plays} lượt chơi).</p>}
        {board && !board.me && user && <p className="lb-me">Bạn chưa có điểm ở màn này.</p>}
        {!user && <p className="lb-me"><a href="/auth/login">Đăng nhập</a> để ghi tên lên bảng xếp hạng.</p>}
        <div className="end-actions" style={{ marginTop: 16 }}>
          <button className="btn" onClick={onClose}>Đóng</button>
        </div>
      </div>
    </div>
  );
}
