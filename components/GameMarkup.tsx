"use client";
import { memo } from "react";
import UserSlot, { type SessionUser } from "./UserSlot";

/* Static markup the game engine drives by id. Memoised so React never re-renders it
   after the engine has taken over the DOM inside. */
function GameMarkup({ user }: { user: SessionUser | null }) {
  return (
    <>
      <main className="app">
        <header className="top">
          <div className="title">
            <h1>DRAGON <em>LEXICON</em></h1>
            <span className="stage-name" id="stageName"></span>
          </div>
          <div className="meta">
            <span>Chuỗi đúng: <b id="streak">0</b> <b className="mul" id="streakMul"></b></span>
            <span className="accent" role="group" aria-label="Giọng đọc"><button data-accent="en-GB" aria-pressed="true">UK</button><button data-accent="en-US" aria-pressed="false">US</button></span>
            <button className="icon-btn" id="musicBtn" aria-pressed="true" aria-label="Nhạc nền" title="Nhạc nền">🎵</button>
            <button className="icon-btn" id="sfxBtn" aria-pressed="true" aria-label="Hiệu ứng âm thanh" title="Hiệu ứng âm thanh">🔔</button>
            <button className="btn ghost small" id="leaveBtn">Rời trận</button>
            <UserSlot user={user} />
          </div>
        </header>
      
        <section className="arena" id="arena" aria-label="Đấu trường">
          <div className="bars">
            <div className="hp knight-hp">
              <div className="hp-label"><span id="knightName">Hiệp sĩ</span><span id="khpText"></span></div>
              <div className="hp-track"><div className="hp-fill" id="khp"></div></div>
            </div>
            <div className="hp boss-hp">
              <div className="hp-label"><span id="bossName">Rồng</span><span id="bhpText"></span></div>
              <div className="hp-track"><div className="hp-fill" id="bhp"></div></div>
              <div className="pow" id="bossPow"></div>
            </div>
          </div>
          <div className="stage" id="stage">
            <div className="fighter knight" id="knight"></div>
            <div className="fighter dragon" id="dragon"></div>
          </div>
          <div className="banner" id="banner"></div>
        </section>
      
        <section className="items" aria-label="Vật phẩm và kỹ năng">
          <button className="item" id="itPotion"><span className="ct" id="ctPotion">0</span><span className="ic">🧪</span>Bình máu<span className="kb">+30 máu · Q</span></button>
          <button className="item" id="itShield"><span className="ct" id="ctShield">0</span><span className="ic">🛡️</span>Khiên<span className="kb">Chặn 1 đòn · W</span></button>
          <button className="item" id="itHint"><span className="ct" id="ctHint">0</span><span className="ic">✂️</span>Loại 2 đáp án<span className="kb">E</span></button>
          <button className="item special" id="itSpecial"><span className="ic">⚡</span>Trảm long<span className="meter"><span id="meterFill"></span></span><span className="kb">Gấp đôi sát thương · R</span></button>
        </section>
      
        <section className="timer" id="timer" aria-label="Thời gian">
          <div className="timer-track"><div className="timer-fill" id="tfill"></div></div>
          <span className="dmg-preview" id="dmgPreview"></span>
          <span className="timer-num" id="tnum">20</span>
        </section>
      
        <section className="question">
          <p className="q-kicker"><span id="qkicker"></span><span id="qcount"></span></p>
          <p className="q-text" id="qtext"></p>
        </section>
      
        <section className="options" id="opts"></section>
      
        <section className="feedback" id="fb" hidden aria-live="polite">
          <p className="verdict" id="verdict"></p>
          <p className="fb-word" id="fbWord"></p>
          <p className="fb-vi" id="fbVi"></p>
          <p className="fb-def" id="fbDef"></p>
          <p className="fb-ex" id="fbEx"></p>
          <a className="cam" id="camLink" target="_blank" rel="noopener noreferrer">Tra từ này trên Cambridge Dictionary</a>
          <div className="row">
            <span className="hint">Phím 1–4 để chọn, P để nghe, Enter để tiếp</span>
            <button className="btn" id="nextBtn">Câu tiếp theo</button>
          </div>
        </section>
      </main>
      
      <div className="overlay" id="hubOv">
        <div className="panel hub">
          <div className="hub-user"><UserSlot user={user} /></div>
          <h2>Hạ rồng bằng từ vựng</h2>
          <p>Chọn một chủ đề từ vựng C1–C2 để vào trận. Trả lời đúng để chém, càng nhanh càng đau, chuỗi đúng càng dài sát thương càng tăng. Trả lời sai thì Hỏa long hồi máu, và trận càng kéo dài rồng càng mạnh. Học càng nhiều càng mở khóa thêm kiếm mới.</p>
          <p className="progress-line" id="progressLine"></p>
          <h3>Chọn màn</h3>
          <div className="grid" id="stageGrid"><p className="loading-note">Đang tải dữ liệu…</p></div>
          <h3>Kho từ C1–C2</h3>
          <p className="bank-note" id="bankNote"></p>
          <div className="grid" id="bankGrid"></div>
          <h3>Chọn kiếm</h3>
          <div className="grid" id="knightGrid"></div>
          <h3>Kiểu câu hỏi</h3>
          <div className="modes" role="group" aria-label="Kiểu câu hỏi">
            <button className="mode" data-mode="def" aria-pressed="true"><b>Định nghĩa → Từ</b><span>Đọc lời giải thích, chọn từ</span></button>
            <button className="mode" data-mode="word" aria-pressed="false"><b>Từ → Định nghĩa</b><span>Nghe và đọc từ, chọn lời giải thích</span></button>
          </div>
          <div className="start-row"><button className="btn" id="startBtn">Vào trận</button></div>
        </div>
      </div>
      
      <div className="overlay" id="endOv" hidden>
        <div className="panel">
          <h2 id="endTitle"></h2>
          <p id="endSub"></p>
          <p className="score-line" id="scoreLine"></p>
          <div className="stats" id="stats"></div>
          <div id="unlockWrap"></div>
          <div id="missedWrap"></div>
          <div className="end-actions">
            <button className="btn ghost" id="hubBtn">Về sảnh</button>
            <button className="btn ghost" id="lbBtn" hidden>🏆 Xếp hạng</button>
            <button className="btn" id="againBtn">Đánh lại màn này</button>
          </div>
        </div>
      </div>
    </>
  );
}
export default memo(GameMarkup, () => true);
