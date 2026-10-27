/* Shared by the game (shown on the end screen) and the API (stored on the leaderboard).
   The server always recomputes the score from the raw stats it receives. */
export type RunStats = {
  won: boolean;
  correct: number;
  answered: number;
  bestStreak: number;
  dealt: number; // damage actually dealt to the dragon
};

export function computeScore(r: RunStats): number {
  const acc = r.answered ? Math.round((r.correct / r.answered) * 100) : 0;
  const winBonus = r.won ? 1000 + Math.max(0, 300 - r.answered * 10) : 0; // faster wins score more
  return Math.max(0, Math.round(r.dealt + winBonus + acc * 5 + r.bestStreak * 25));
}
