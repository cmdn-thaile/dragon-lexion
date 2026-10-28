// @ts-nocheck
/* Dragon Lexicon game engine (ported from the single-file HTML version).
   initGame(DATA, HOOKS) wires the game to the markup rendered by <GameMarkup/> and returns a destroy() function.
   DATA  = { stages, bank }  from /public/data/words.json
   HOOKS = { user, initialProgress, onProgress(P), onFinish(result) => Promise<{best,isBest,rank}|null>, openLeaderboard(stageId, name) } */
import { computeScore } from "../score";
import {
  getCustomLists,
  createCustomList,
  deleteCustomList,
  addWordToList,
  removeWordFromList,
  migrateLegacyReview
} from "../custom-lists";

export function initGame(DATA, HOOKS = {}) {
let alive = true;
const _listeners = [];
const _doc = { addEventListener(t, f, o){ document.addEventListener(t, f, o); _listeners.push([t, f, o]); } };

/* =====================================================================
   DATA — [word, level, part of speech, IPA (UK), definition, tiếng Việt, example]
   ===================================================================== */
const STAGES = DATA.stages.map(s => ({ ...s, dragon:{ ...s.dragon } }));
STAGES.forEach(st => { st.words = st.raw.map(([w,lvl,pos,ipa,def,vi,ex]) => ({w,lvl,pos,ipa,def,vi,ex,stage:st.id})); });
const BANK_RAW = DATA.bank;
const BANK_POOLS = { bankC1:[], bankC2:[] };
BANK_RAW.forEach(([w,lvl,pos,ipa,def,vi,ex]) => { const id = lvl === "C2" ? "bankC2" : "bankC1"; BANK_POOLS[id].push({ w, lvl, pos, ipa, def, vi, ex, stage:id }); });
const ALL = STAGES.flatMap(s => s.words).concat(BANK_POOLS.bankC1, BANK_POOLS.bankC2);
const isBank = id => id === "bankC1" || id === "bankC2";
// distractors come from the same stage (or the same level of the word bank)
const poolFor = q => {
  if (isBank(q.stage)) return BANK_POOLS[q.stage];
  if (q.stage && q.stage.startsWith("custom_")) {
    const listId = q.stage.slice(7);
    const list = getCustomLists().find(l => l.id === listId || l.id === q.stage);
    const listWords = list ? list.words : (S && S.stage ? S.stage.words : []);
    return listWords.length >= 10 ? listWords : listWords.concat(ALL);
  }
  const st = STAGES.find(s => s.id === q.stage);
  return st ? st.words : ALL;
};
const REVIEW_DRAGON = { name:"Hỏa long Ember", body:"#5d6675", dark:"#3b424d", belly:"#c9d0da", wing:"#4a525e", wingBack:"#313740", horn:"#e5e9ef", eye:"#9fe3ff", accent:"#9fe3ff", horns:"swept", feat:"whiskers", breath:["#fff6b0","#ffb02e","#ff4d1a"] };

/* Knights — look + perk + unlock rule */
const KNIGHTS = [
  { id:"k1", name:"Kiếm Thép", perkText:"Cân bằng, không có kỹ năng riêng", perk:{},
    sword:"steel", look:{armor:"#c9d1db",dark:"#55606e",cape:"#7a1f2b",plume:"#c0392b",shield:"#2b4c8c",emblem:"cross",trim:"#e0b440",weapon:"sword",helm:"plume"} },
  { id:"k2", name:"Kiếm Ngọc Lục", perkText:"+3 giây mỗi câu hỏi", perk:{time:3},
    unlock:{text:"Trả lời đúng 25 câu", need:25, cur:()=>P.totalCorrect},
    sword:"emerald", look:{armor:"#a9b48f",dark:"#4d5a3a",cape:"#2f5d3a",plume:"#c8a55a",shield:"#6b4a2a",emblem:"leaf",trim:"#c8a55a",weapon:"sword",helm:"hood"} },
  { id:"k3", name:"Kiếm Thánh Quang", perkText:"+30 máu tối đa", perk:{hp:30},
    unlock:{text:"Hạ 2 con rồng", need:2, cur:()=>P.cleared.length},
    sword:"holy", look:{armor:"#eef1f5",dark:"#8a93a3",cape:"#2b4c8c",plume:"#f4f4f4",shield:"#f4f4f4",emblem:"sun",trim:"#e0b440",weapon:"sword",helm:"plume"} },
  { id:"k4", name:"Kiếm Hắc Ảnh", perkText:"+15% sát thương", perk:{dmg:1.15},
    unlock:{text:"Trả lời đúng 80 câu", need:80, cur:()=>P.totalCorrect},
    sword:"shadow", look:{armor:"#3a3f4a",dark:"#15181e",cape:"#1b1d24",plume:"#8a8f99",shield:"#2a2d35",emblem:"chevron",trim:"#b3261e",weapon:"axe",helm:"horns"} },
  { id:"k5", name:"Kiếm Diệt Long", perkText:"Trảm long nạp đầy sau 2 câu đúng", perk:{need:2},
    unlock:{text:"Đạt chuỗi 8 câu đúng liên tiếp", need:8, cur:()=>P.bestStreak},
    sword:"fire", look:{armor:"#9e3b30",dark:"#4e1a14",cape:"#1f1f1f",plume:"#ffb02e",shield:"#9e3b30",emblem:"star",trim:"#f2c14e",weapon:"spear",helm:"plume"} },
  { id:"k6", name:"Kiếm Hoàng Kim", perkText:"+1 mỗi loại vật phẩm", perk:{items:1},
    unlock:{text:"Hạ cả 6 con rồng", need:6, cur:()=>P.cleared.length},
    sword:"gold", look:{armor:"#e9c46a",dark:"#8e6a17",cape:"#6b1d8f",plume:"#fff3c4",shield:"#e9c46a",emblem:"sun",trim:"#fff3c4",weapon:"great",helm:"crown"} }
];

/* =====================================================================
   SPRITES
   ===================================================================== */
STAGES.forEach(s => { s.dragon.sprite = s.id; });
REVIEW_DRAGON.sprite = "review";

function mix(a, b, t){
  const p = c => [1,3,5].map(i => parseInt(c.slice(i, i+2), 16));
  const A = p(a), B = p(b);
  return "#" + A.map((v,i) => Math.round(v + (B[i]-v)*t).toString(16).padStart(2,"0")).join("");
}
const DRAGON_IMG = "/sprites/dragon.png";
/* Dragon: one illustrated boss, animated in code by cutting it into parts
   (wing, body, head, lower jaw) and moving each part around its joint. */
const DragonSprite = (() => {
  const W = 564, H = 442, PAD = 130, CW = W + PAD;   // PAD = room on the left for the flame
  const POLY = {
    wing:    [[235,55],[300,22],[425,8],[447,28],[464,200],[440,254],[330,254],[305,212],[262,206],[238,172]],
    wingCut: [[235,55],[300,22],[425,8],[447,28],[464,200],[440,250],[400,240],[332,238],[302,210],[262,204],[240,172]],
    head:    [[50,176],[68,150],[110,126],[150,92],[205,66],[228,84],[238,130],[234,166],[217,197],[192,216],[150,218],[105,232],[66,228],[52,210]],
    headCut: [[50,176],[68,150],[110,126],[150,92],[205,66],[228,84],[232,128],[222,152],[202,176],[180,200],[150,218],[105,232],[66,228],[52,210]],
    jaw:     [[60,199],[95,197],[130,191],[166,185],[180,196],[172,213],[122,224],[90,230],[68,224],[60,210]]
  };
  const PIV = { wing:[285,214], head:[206,186], jaw:[168,190], feet:[262,432] };
  const MOUTH = [60,203];
  const img = new Image(); img.src = DRAGON_IMG;
  let parts = null;
  function path(ctx, pts){ ctx.beginPath(); pts.forEach(([x,y],i) => i ? ctx.lineTo(x,y) : ctx.moveTo(x,y)); ctx.closePath(); }
  function layer(fn){ const c = document.createElement("canvas"); c.width = W; c.height = H; const x = c.getContext("2d"); x.imageSmoothingEnabled = false; fn(x); return c; }
  function only(pts){ return layer(x => { path(x, pts); x.clip(); x.drawImage(img, 0, 0); }); }
  function build(){
    if(parts) return;
    const body = layer(x => {
      x.drawImage(img, 0, 0);
      x.globalCompositeOperation = "destination-out";
      path(x, POLY.wingCut); x.fill(); path(x, POLY.headCut); x.fill();
    });
    const head = layer(x => {
      path(x, POLY.head); x.clip(); x.drawImage(img, 0, 0);
      x.globalCompositeOperation = "destination-out"; path(x, POLY.jaw); x.fill();
    });
    parts = { body, head, wing: only(POLY.wing), jaw: only(POLY.jaw) };
  }
  const ease = t => t < 0 ? 0 : t > 1 ? 1 : t*t*(3-2*t);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rad = d => d * Math.PI / 180;
  const REST = { bx:0, by:0, sy:1, head:0, hx:0, hy:0, jaw:0, wing:0, fire:0, gray:0, alpha:1 };

  // pose for animation `name` at time `t` (seconds)
  const ANIMS = {
    idle:{ dur:2.0, loop:true, pose:t => { const p = Math.sin(t / 2 * Math.PI * 2);
      return { ...REST, sy:1 + .012*p, hy:-2*Math.sin(t/2*Math.PI*2 + .6), head:-1.2*p, wing:-2.5*p, jaw:.8 + .8*Math.max(0,p) }; } },
    attack:{ dur:1.25, pose:t => {
      if(t < .38){ const e = ease(t/.38); return { ...REST, bx:6*e, head:-13*e, hy:-6*e, wing:-7*e, jaw:3*e }; }
      if(t < .5){ const e = ease((t-.38)/.12); return { ...REST, bx:lerp(6,-8,e), head:lerp(-13,9,e), hy:lerp(-6,3,e), wing:lerp(-7,4,e), jaw:lerp(3,20,e) }; }
      if(t < 1.0){ const k = Math.sin(t*40); return { ...REST, bx:-8, head:9 + k*.6, hy:3, wing:4, jaw:19 + k*1.2, fire:1 }; }
      const e = ease((t-1.0)/.25); return { ...REST, bx:lerp(-8,0,e), head:lerp(9,0,e), hy:lerp(3,0,e), wing:lerp(4,0,e), jaw:lerp(19,1,e), fire:Math.max(0,1-e*3) }; } },
    hurt:{ dur:.5, pose:t => { const e = Math.sin(Math.min(1, t/.5) * Math.PI);
      return { ...REST, bx:10*e, head:-10*e, hy:-3*e, jaw:12*e, wing:-4*e }; } },
    roar:{ dur:1.1, pose:t => { const e = Math.sin(Math.min(1, t/1.1) * Math.PI); const f = Math.sin(t*22);
      return { ...REST, head:-20*e, hy:-8*e, jaw:21*e, wing:-9*e + 2.5*f*e, sy:1 + .02*e }; } },
    death:{ dur:1.7, pose:t => {
      if(t < .35){ const e = Math.sin(t/.35 * Math.PI/2); return { ...REST, bx:8*e, head:-16*e, hy:-6*e, jaw:17*e, wing:-6*e }; }
      const e = ease((t-.35)/1.35);
      return { ...REST, bx:8 - 4*e, by:30*e, sy:1 - .2*e, head:lerp(-16,34,e), hy:lerp(-6,40,e), jaw:lerp(17,5,e), wing:lerp(-6,32,e), gray:.75*e, alpha:1 - .25*e }; } }
  };

  function drawFlame(x, cx, cy, t){
    const cols = ["#ff4d1a","#ffb02e","#fff6b0"], B = 6;
    for(let i = 14; i > 0; i--){
      const d = i * 11, wob = Math.sin(t*30 + i*1.7) * 5, r = 6 + i*2.4;
      cols.forEach((c, k) => {
        const rr = r * (1 - k*.32); if(k === 2 && i > 10) return;
        x.fillStyle = c;
        for(let yy = -rr; yy <= rr; yy += B) for(let xx = -rr; xx <= rr; xx += B)
          if(xx*xx + yy*yy <= rr*rr) x.fillRect(Math.round((cx - d + xx)/B)*B, Math.round((cy + i*1.5 + wob + yy)/B)*B, B, B);
      });
    }
  }
  // open mouth: pixel-block interior that hugs both jaws, with tongue, throat shadow and fangs
  function pip(x, y, pts){ let ins = false; for(let i = 0, j = pts.length - 1; i < pts.length; j = i++){ const [xi,yi] = pts[i], [xj,yj] = pts[j]; if((yi > y) !== (yj > y) && x < (xj-xi)*(y-yi)/(yj-yi) + xi) ins = !ins; } return ins; }
  function rotP([x, y], a, [cx, cy]){ const c = Math.cos(a), s = Math.sin(a); return [cx + (x-cx)*c - (y-cy)*s, cy + (x-cx)*s + (y-cy)*c]; }
  function drawMouth(ctx, jawDeg){
    const a = rad(-jawDeg), J = PIV.jaw, B = 3;
    const upper = [[176,183],[150,187],[124,191],[98,194],[74,196],[60,197]];
    const lowerL = [[58,206],[74,204],[98,201],[124,197],[150,192],[172,187]];
    const lower = lowerL.map(q => rotP(q, a, J));
    const mouth = upper.concat(lower);
    const band = lower.concat(lowerL.map(([x,y]) => rotP([x, y-8], a, J)).reverse());
    const xs = mouth.map(q => q[0]), ys = mouth.map(q => q[1]);
    for(let y = Math.floor(Math.min(...ys)/B)*B; y <= Math.max(...ys); y += B)
      for(let x = Math.floor(Math.min(...xs)/B)*B; x <= Math.max(...xs); x += B){
        const cx = x + B/2, cy = y + B/2;
        if(!pip(cx, cy, mouth)) continue;
        ctx.fillStyle = pip(cx, cy, band) ? (cx > 140 ? "#6e1824" : "#a3303c") : (cx > 132 ? "#16030a" : "#300810");
        ctx.fillRect(x - .3, y - .3, B + .6, B + .6);   // overlap a hair so rotated blocks leave no seams
      }
    if(jawDeg < 7) return;
    ctx.fillStyle = "#f4ead8";
    const fang = (pts) => { const xs = pts.map(q=>q[0]), ys = pts.map(q=>q[1]);
      for(let y = Math.floor(Math.min(...ys)/B)*B; y <= Math.max(...ys); y += B)
        for(let x = Math.floor(Math.min(...xs)/B)*B; x <= Math.max(...xs); x += B)
          if(pip(x + B/2, y + B/2, pts)) ctx.fillRect(x - .3, y - .3, B + .6, B + .6); };
    [[80,196],[104,193],[128,190]].forEach(([x,y]) => fang([[x-4,y-1],[x+4,y-1],[x,y+9]]));
    [[86,203],[112,199]].forEach(([x,y]) => fang([[x-4,y+1],[x+4,y+1],[x,y-8]].map(q => rotP(q, a, J))));
  }
  // eye: the cut-out left the eye socket see-through, so paint a proper pixel eye in it
  let rage = false;
  function drawEye(ctx, p, t){
    const B = 2, px = (x, y, w, hh, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, hh); };
    px(113, 161, 16, 12, "#1a0508");                               // socket
    const blink = (t % 4) > 3.86 && !p.fire;
    if(p.gray > .5 || blink){ px(114, 166, 14, B, "#7a2a18"); px(114, 168, 14, B, "#3a0a0e"); return; }
    const glow = rage || p.fire > 0 || p.jaw > 15;
    ctx.save();
    if(glow){ ctx.shadowColor = rage ? "#ff2a10" : "#ffb02e"; ctx.shadowBlur = 10; }
    const iris = rage ? "#ff3b1f" : "#ffd34d", rim = rage ? "#b3150f" : "#e08a1e";
    px(117, 163, 10, B, rim); px(115, 165, 14, B, iris); px(115, 167, 14, B, iris); px(117, 169, 10, B, rim);
    ctx.restore();
    px(121, 163, B, 8, "#120203");                                 // slit pupil
    px(124, 165, B, B, "#fff6d8");                                 // glint
  }
  function setRage(on){ rage = on; }
  function render(ctx, p, t){
    ctx.clearRect(0, 0, CW, H);
    if(!parts) return;
    ctx.save();
    ctx.translate(PAD, 0);
    ctx.globalAlpha = p.alpha;
    const [fx, fy] = PIV.feet;
    ctx.translate(fx + p.bx, fy + p.by); ctx.scale(1, p.sy); ctx.translate(-fx, -fy);
    // wing (behind body)
    ctx.save(); const [wx, wy] = PIV.wing; ctx.translate(wx, wy); ctx.rotate(rad(p.wing)); ctx.translate(-wx, -wy); ctx.drawImage(parts.wing, 0, 0); ctx.restore();
    ctx.drawImage(parts.body, 0, 0);
    // head + jaw
    ctx.save();
    const [hx, hy] = PIV.head; ctx.translate(hx + p.hx, hy + p.hy); ctx.rotate(rad(p.head)); ctx.translate(-hx, -hy);
    if(p.jaw > 2) drawMouth(ctx, p.jaw);
    ctx.save(); const [jx, jy] = PIV.jaw; ctx.translate(jx, jy); ctx.rotate(rad(-p.jaw)); ctx.translate(-jx, -jy); ctx.drawImage(parts.jaw, 0, 0); ctx.restore();
    ctx.drawImage(parts.head, 0, 0);
    drawEye(ctx, p, t);
    if(p.fire > 0){ ctx.globalAlpha = p.fire; drawFlame(ctx, MOUTH[0], MOUTH[1], t); }
    ctx.restore();
    ctx.restore();
  }

  let canvas = null, ctx = null, cur = "idle", t0 = 0, onDone = null, done = false;
  function mount(host){
    canvas = document.createElement("canvas"); canvas.width = CW; canvas.height = H;
    ctx = canvas.getContext("2d"); ctx.imageSmoothingEnabled = false;
    host.innerHTML = ""; host.append(canvas);
    rage = false;
    play("idle");
  }
  function play(name, cb){ cur = name; t0 = performance.now(); onDone = cb || null; done = false; }
  function loop(now){
    if(ctx && img.complete && img.naturalWidth){
      build();
      const A = ANIMS[cur]; let t = (now - t0) / 1000;
      if(A.loop) t = t % (A.dur * 4);  // longer loop so the blink timer can run
      else if(t >= A.dur){ t = A.dur; if(!done){ done = true; if(onDone){ const fn = onDone; onDone = null; fn(); } } }
      const p = ANIMS[cur].pose(t);
      canvas.style.filter = p.gray ? `grayscale(${p.gray})` : "";
      render(ctx, p, t);
    }
    (alive && requestAnimationFrame(loop));
  }
  (alive && requestAnimationFrame(loop));
  function thumb(){
    const c = document.createElement("canvas"); c.width = 440; c.height = 430;
    const x = c.getContext("2d"); x.imageSmoothingEnabled = false;
    const paint = () => x.drawImage(img, 50, 8, 440, 430, 0, 0, 440, 430);
    (img.complete && img.naturalWidth) ? paint() : img.addEventListener("load", paint, { once:true });
    return c;
  }
  // export helper: render an animation as a horizontal sprite strip
  function strip(name, frames){
    build(); const A = ANIMS[name];
    const out = layer(() => {}); out.width = CW * frames; out.height = H;
    const x = out.getContext("2d"); x.imageSmoothingEnabled = false;
    const tmp = layer(() => {}); tmp.width = CW; const tx = tmp.getContext("2d"); tx.imageSmoothingEnabled = false;
    for(let i = 0; i < frames; i++){
      const t = A.loop ? A.dur * i / frames : A.dur * i / (frames - 1);
      const p = ANIMS[name].pose(t); render(tx, p, t);
      if(p.gray){ x.filter = `grayscale(${p.gray})`; } else x.filter = "none";
      x.drawImage(tmp, i*CW, 0);
    }
    return out.toDataURL("image/png");
  }
  const fireDelay = () => 500;
  return { mount, play, thumb, fireDelay, strip, setRage };
})();

/* Knight: frame-by-frame sprite sheets (112x96 per frame), drawn on a canvas */
const KnightSprite = (() => {
  const FW = 112, FH = 96, CW = 224;   // canvas is 2 frames wide so slashes/beams have room
  const SHEETS = {
    idle:{ src:"/sprites/knight/IDLE.png", n:14, fps:10, loop:true },
    run:{ src:"/sprites/knight/RUN.png", n:8, fps:18, loop:true },
    attack1:{ src:"/sprites/knight/ATTACK_1.png", n:8, fps:18, loop:false },
    attack2:{ src:"/sprites/knight/ATTACK_2.png", n:9, fps:18, loop:false },
    attack3:{ src:"/sprites/knight/ATTACK_3.png", n:11, fps:18, loop:false },
    block:{ src:"/sprites/knight/BLOCK.png", n:6, fps:14, loop:false },
    hurt:{ src:"/sprites/knight/HURT.png", n:8, fps:16, loop:false },
    death:{ src:"/sprites/knight/DEATH.png", n:15, fps:12, loop:false },
    charge:{ src:"/sprites/knight/CHARGE.png", n:15, fps:14, loop:false, w:224 },
    cidle:{ src:"/sprites/knight/CIDLE.png", n:14, fps:12, loop:true, w:224 },
    special:{ src:"/sprites/knight/SPECIAL.png", n:6, fps:12, loop:false, w:224 },
    healPlain:{ src:"/sprites/knight/HEAL_PLAIN.png", n:26, fps:15, loop:false, w:224 },
    heal:{ src:"/sprites/knight/HEAL.png", n:26, fps:15, loop:false, w:224 }
  };
  const imgs = {};
  Object.entries(SHEETS).forEach(([k, s]) => { const im = new Image(); im.src = s.src; imgs[k] = im; });
  // ---- sword variants: same armour, only the blade/hilt (and its glow) is recoloured ----
  const SWORDS = {
    steel:null,
    emerald:{ blade:["#eafff0","#86e6a6","#2e8b57"], hilt:["#d9f2ff","#8fb0c8"], glow:["#dbffe6","#45e08f","#178a4a"] },
    holy:{ blade:["#ffffff","#fff1b8","#d9b44a"], hilt:["#ffffff","#bfc8d6"], glow:["#ffffff","#ffe680","#e0a21a"] },
    shadow:{ blade:["#e6d9ff","#9a72e0","#4b2f8f"], hilt:["#7a5ab8","#3a2766"], glow:["#efe6ff","#b085ff","#5a2ea6"] },
    fire:{ blade:["#fff1d6","#ff9a4d","#c0391b"], hilt:["#3a3a3a","#1a1a1a"], glow:["#fff6b0","#ffb02e","#ff4d1a"] },
    gold:{ blade:["#fffbe0","#ffd84d","#c8901a"], hilt:["#e33b2c","#8e1a12"], glow:["#fffbe0","#ffd84d","#e0a21a"] }
  };
  const rgb = c => [1,3,5].map(i => parseInt(c.slice(i, i+2), 16));
  const K = (r,g,b) => (r<<16)|(g<<8)|b;
  const LIGHT = new Set([K(255,255,255), K(238,242,246)]);           // blade core (also slash trails)
  const MID = K(199,207,221), DARK = K(146,161,185), PMID = K(201,209,219), PDARK = K(143,154,168);
  const HILT = new Map([[K(255,162,20),1],[K(246,163,28),1],[K(255,200,37),0]]);
  const KEEP = new Set([K(0,105,170), K(0,57,109), K(0,152,220)]);   // shield + eyes stay blue
  const swCache = {};
  function recolor(im, V){
    const c = document.createElement("canvas"); c.width = im.width; c.height = im.height;
    const x = c.getContext("2d"); x.drawImage(im, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height), a = d.data, w = c.width, n = w * c.height;
    const B = V.blade.map(rgb), Hc = V.hilt.map(rgb), Gl = V.glow.map(rgb), dim = rgb(mix(V.glow[2], "#3d3d3d", .45));
    const key = i => K(a[i*4], a[i*4+1], a[i*4+2]);
    // blade = white core plus the grey edge pixels touching it (≤2 px away)
    const dist = new Int8Array(n).fill(-1), q = new Int32Array(n); let qh = 0, qt = 0;
    for(let i = 0; i < n; i++) if(a[i*4+3] && LIGHT.has(key(i))){ dist[i] = 0; q[qt++] = i; }
    while(qh < qt){
      const i = q[qh++]; if(dist[i] >= 2) continue;
      const nb = [i-1, i+1, i-w, i+w];
      for(const j of nb){
        if(j < 0 || j >= n || dist[j] !== -1 || !a[j*4+3]) continue;
        const k = key(j); if(k === MID || k === DARK){ dist[j] = dist[i] + 1; q[qt++] = j; }
      }
    }
    const put = (i, c) => { a[i*4] = c[0]; a[i*4+1] = c[1]; a[i*4+2] = c[2]; };
    for(let i = 0; i < n; i++){
      if(!a[i*4+3]) continue;
      const k = key(i), r = a[i*4], g = a[i*4+1], b = a[i*4+2];
      if(dist[i] >= 0){ put(i, dist[i] === 0 ? B[0] : (k === MID ? B[1] : B[2])); continue; }
      if(k === PMID){ put(i, B[1]); continue; }
      if(k === PDARK){ put(i, B[2]); continue; }
      if(HILT.has(k)){ put(i, Hc[HILT.get(k)]); continue; }
      if(!KEEP.has(k) && g > r + 18 && b > r + 18){           // blue glow, aura, beam
        const lum = (r + g + b) / 3;
        put(i, lum > 200 ? Gl[0] : lum > 140 ? Gl[1] : lum > 95 ? Gl[2] : dim);
      }
    }
    x.putImageData(d, 0, 0);
    return c;
  }
  function sheetOf(name, sw){
    const im = imgs[name], V = SWORDS[sw];
    if(!im.complete || !im.naturalWidth) return null;
    if(!V) return im;
    const k = sw + "|" + name;
    return swCache[k] || (swCache[k] = recolor(im, V));
  }
  let canvas = null, ctx = null, cur = "idle", frame = 0, acc = 0, last = 0, onDone = null, charged = false, sword = "steel";
  function draw(){
    if(!ctx) return;
    const im = sheetOf(cur, sword);
    if(!im) return;
    const w = SHEETS[cur].w || FW;
    ctx.clearRect(0, 0, CW, FH);
    ctx.drawImage(im, frame*w, 0, w, FH, 0, 0, w, FH);
  }
  function mount(host, sw){
    canvas = document.createElement("canvas");
    canvas.width = CW; canvas.height = FH;
    sword = SWORDS[sw] !== undefined ? sw : "steel";
    charged = false;
    ctx = canvas.getContext("2d"); ctx.imageSmoothingEnabled = false;
    host.innerHTML = ""; host.append(canvas);
    play("idle");
  }
  function play(name, done){ if(name === "idle" && charged) name = "cidle"; if(name === "heal" && !charged) name = "healPlain"; cur = name; frame = 0; acc = 0; onDone = done || null; draw(); }
  function setCharged(on){ charged = on; }
  function loop(t){
    const dt = last ? Math.min(.1, (t - last) / 1000) : 0; last = t;
    acc += dt;
    let s = SHEETS[cur];
    while(acc >= 1 / s.fps){
      acc -= 1 / s.fps;
      if(frame < s.n - 1) frame++;
      else if(s.loop) frame = 0;
      else if(onDone){ const fn = onDone; onDone = null; fn(); s = SHEETS[cur]; if(frame === 0) break; }
      else { acc = 0; break; }
    }
    draw();
    (alive && requestAnimationFrame(loop));
  }
  (alive && requestAnimationFrame(loop));
  function thumb(sw){
    const c = document.createElement("canvas"); c.width = 50; c.height = 42;
    const x = c.getContext("2d"); x.imageSmoothingEnabled = false;
    const paint = () => { const s = sheetOf("idle", sw); if(s) x.drawImage(s, 26, 45, 50, 42, 0, 0, 50, 42); };
    (imgs.idle.complete && imgs.idle.naturalWidth) ? paint() : imgs.idle.addEventListener("load", paint, { once:true });
    return c;
  }
  // hit lands on this frame of each attack sheet
  const HIT_FRAME = { attack1:4, attack2:5, attack3:5, special:1 };
  const hitDelay = name => HIT_FRAME[name] / SHEETS[name].fps * 1000;
  const healDelay = () => 16 / SHEETS.heal.fps * 1000;   // sparkles burst on this frame
  return { mount, play, thumb, hitDelay, healDelay, setCharged };
})();

/* =====================================================================
   PROGRESS (localStorage)
   ===================================================================== */
function loadProgress(){
  const base = { totalCorrect:0, cleared:[], bestStreak:0, knight:"k1", review:{}, mode:"def", music:true, sfx:true, accent:"en-GB" };
  try{
    const r = JSON.parse(localStorage.getItem("dl-progress") || "null");
    if(r) return Object.assign(base, r, { cleared: Array.isArray(r.cleared) ? r.cleared : [], review: r.review || {} });
    const old = parseInt(localStorage.getItem("dl-best-streak") || "0", 10);
    if(old) base.bestStreak = old;
  }catch(e){}
  return base;
}
let P = loadProgress();
if(HOOKS.initialProgress && typeof HOOKS.initialProgress === "object"){
  const sp = HOOKS.initialProgress;
  P = Object.assign(P, sp, { cleared: Array.isArray(sp.cleared) ? sp.cleared : P.cleared, review: sp.review || P.review });
  try{ localStorage.setItem("dl-progress", JSON.stringify(P)); }catch(e){}
} else if(HOOKS.user && HOOKS.onProgress) HOOKS.onProgress(P);   // first login: upload the local save
migrateLegacyReview(P.review, ALL);
function saveProgress(){ try{ localStorage.setItem("dl-progress", JSON.stringify(P)); }catch(e){} if(HOOKS.onProgress) HOOKS.onProgress(P); }
const isUnlocked = k => !k.unlock || k.unlock.cur() >= k.unlock.need;
const reviewWords = () => ALL.filter(x => P.review[x.w] > 0);

/* =====================================================================
   AUDIO — all synthesized with Web Audio, no files
   ===================================================================== */
const Sound = (() => {
  let ctx, master, musicGain, sfxGain, noiseBuf, timer = null, nextTime = 0, step = 0;
  function init(){
    if(ctx){ if(ctx.state === "suspended") ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if(!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = .8; master.connect(ctx.destination);
    musicGain = ctx.createGain(); musicGain.gain.value = P.music ? .14 : 0; musicGain.connect(master);
    sfxGain = ctx.createGain(); sfxGain.gain.value = P.sfx ? .55 : 0; sfxGain.connect(master);
  }
  function tone(freq, dur, type="sine", vol=.3, when=0, dest=sfxGain, slideTo){
    const t = ctx.currentTime + Math.max(0, when);
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if(slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + .012);
    g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + .05);
  }
  function noise(dur, vol, type, f0, f1, when=0){
    if(!noiseBuf){
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for(let i=0;i<d.length;i++) d[i] = Math.random()*2 - 1;
    }
    const t = ctx.currentTime + when;
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(f0, t);
    if(f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(sfxGain); s.start(t); s.stop(t + dur + .05);
  }
  const fx = {
    hit(crit){ noise(.18,.6,"bandpass",1800,500); tone(220,.15,"square",.14,0,sfxGain,90); if(crit){ tone(1320,.25,"triangle",.18,.05); tone(1760,.3,"triangle",.14,.1); } },
    breath(){ noise(.6,.5,"lowpass",2400,250); tone(110,.5,"sawtooth",.07,0,sfxGain,60); },
    wrong(){ tone(196,.18,"square",.1); tone(147,.28,"square",.1,.15); },
    block(){ tone(900,.25,"triangle",.24); tone(1350,.3,"triangle",.14,.02); noise(.12,.3,"highpass",3000); },
    potion(){ tone(400,.35,"sine",.2,0,sfxGain,1200); tone(800,.25,"sine",.12,.15,sfxGain,1600); },
    hint(){ tone(660,.1,"triangle",.15); tone(990,.12,"triangle",.15,.07); },
    special(){ tone(220,.5,"sawtooth",.1,0,sfxGain,880); noise(.4,.25,"bandpass",800,4000); },
    tick(){ tone(1200,.04,"square",.05); },
    roar(){ noise(.8,.45,"lowpass",700,120); tone(95,.8,"sawtooth",.12,0,sfxGain,50); },
    victory(){ [523,659,784,1047].forEach((f,i)=>tone(f,.4,"triangle",.2,i*.14)); },
    defeat(){ [392,330,262,196].forEach((f,i)=>tone(f,.45,"triangle",.18,i*.2)); },
    unlock(){ [784,988,1175,1568].forEach((f,i)=>tone(f,.25,"sine",.14,i*.08)); }
  };
  function play(name, arg){ if(!ctx || !P.sfx) return; try{ fx[name](arg); }catch(e){} }
  // Background loop: Am – F – C – G arpeggio, faster when the dragon is enraged
  const PROG = [[57,60,64],[53,57,60],[48,52,55],[55,59,62]];
  const ARP = [0,1,2,1,0,2,1,2];
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  function schedule(){
    const spb = 60 / ((S && S.enraged) ? 136 : 104) / 2;
    while(nextTime < ctx.currentTime + .25){
      const ch = PROG[Math.floor(step/8) % 4], beat = step % 8, when = nextTime - ctx.currentTime;
      tone(mtof(ch[ARP[beat]] + 12), spb*.9, "triangle", .09, when, musicGain);
      if(beat % 4 === 0) tone(mtof(ch[0] - 12), spb*3.6, "sine", .2, when, musicGain);
      if(beat === 0 && Math.floor(step/8) % 2 === 1) tone(mtof(ch[2] + 24), spb*2, "sine", .04, when + spb, musicGain);
      nextTime += spb; step++;
    }
  }
  function musicStart(){ if(!ctx || timer) return; nextTime = ctx.currentTime + .08; step = 0; timer = setInterval(schedule, 60); }
  function musicStop(){ clearInterval(timer); timer = null; }
  function setMusic(on){ P.music = on; saveProgress(); if(musicGain) musicGain.gain.value = on ? .14 : 0; }
  function setSfx(on){ P.sfx = on; saveProgress(); if(sfxGain) sfxGain.gain.value = on ? .55 : 0; }
  return { init, play, musicStart, musicStop, setMusic, setSfx };
})();

/* =====================================================================
   PRONUNCIATION — browser speech synthesis
   ===================================================================== */
const canSpeak = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
function pickVoice(lang){
  const vs = speechSynthesis.getVoices();
  return vs.find(v=>v.lang===lang && /Google|Natural|Premium|Enhanced/i.test(v.name))
      || vs.find(v=>v.lang===lang) || vs.find(v=>v.lang.replace("_","-")===lang)
      || vs.find(v=>v.lang.startsWith("en")) || null;
}
if(canSpeak){ try{ speechSynthesis.getVoices(); }catch(e){} }
function speak(text, btn){
  if(!canSpeak) return;
  try{
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = P.accent; u.rate = .85;
    const v = pickVoice(P.accent); if(v) u.voice = v;
    if(btn){ btn.classList.add("playing"); u.onend = u.onerror = () => btn.classList.remove("playing"); }
    speechSynthesis.speak(u);
  }catch(e){}
}
function sayButton(text){
  if(!canSpeak) return document.createTextNode("");
  const b = document.createElement("button");
  b.className = "say"; b.type = "button"; b.textContent = "🔊";
  b.setAttribute("aria-label", "Nghe phát âm " + text);
  b.addEventListener("click", e => { e.stopPropagation(); speak(text, b); });
  return b;
}

/* =====================================================================
   GAME
   ===================================================================== */
const $ = s => document.querySelector(s);
const el = {
  knight:$("#knight"), dragon:$("#dragon"), arena:$("#arena"), stage:$("#stage"),
  khp:$("#khp"), bhp:$("#bhp"), khpText:$("#khpText"), bhpText:$("#bhpText"), knightName:$("#knightName"), bossName:$("#bossName"),
  tfill:$("#tfill"), tnum:$("#tnum"), timer:$("#timer"), dmgPreview:$("#dmgPreview"),
  qtext:$("#qtext"), qkicker:$("#qkicker"), qcount:$("#qcount"), opts:$("#opts"),
  fb:$("#fb"), verdict:$("#verdict"), fbWord:$("#fbWord"), fbVi:$("#fbVi"), fbDef:$("#fbDef"), fbEx:$("#fbEx"), nextBtn:$("#nextBtn"),
  streak:$("#streak"), streakMul:$("#streakMul"), bossPow:$("#bossPow"), banner:$("#banner"), stageName:$("#stageName"),
  itPotion:$("#itPotion"), itShield:$("#itShield"), itHint:$("#itHint"), itSpecial:$("#itSpecial"),
  ctPotion:$("#ctPotion"), ctShield:$("#ctShield"), ctHint:$("#ctHint"), meterFill:$("#meterFill")
};
const TIMEOUT_EXTRA = 6, ENRAGE_BONUS = 6, POTION_HEAL = 30;
let S = null;
let selectedStage = STAGES[0] ? STAGES[0].id : "easy_1";
let currentHubTab = "easy";
const HUB_TABS = ["easy", "med", "hard", "spec", "custom"];

function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
function restart(node, cls){ node.classList.remove(cls); void node.offsetWidth; node.classList.add(cls); }

function buildStage(id){
  if(isBank(id)){
    const lvl = id === "bankC2" ? "C2" : "C1";
    return { id, vi:"Kho từ " + lvl, en:lvl + " word bank", lvl, hp:lvl === "C2" ? 420 : 380, atk:lvl === "C2" ? 18 : 16,
             tint:"rgba(255,215,90,.12)", dragon:{ ...STAGES[0].dragon }, words:BANK_POOLS[id] };
  }
  if(id.startsWith("custom_")){
    const listId = id.slice(7);
    const list = getCustomLists().find(l => l.id === listId || l.id === id);
    const words = list ? list.words.map(w => ({ ...w, stage: id })) : [];
    const hp = Math.max(150, Math.min(450, words.length * 35));
    return {
      id,
      listId: list ? list.id : listId,
      vi: list ? list.name : "Nhóm từ tùy chỉnh",
      en: "Custom Word List",
      lvl: "Custom",
      hp,
      atk: 15,
      tint: "rgba(100,110,130,.15)",
      dragon: { ...REVIEW_DRAGON, name: list ? "Rồng " + list.name : "Hỏa long Ember" },
      words
    };
  }
  if(id !== "review") return STAGES.find(s => s.id === id) || STAGES[0];
  const words = reviewWords();
  return { id:"review", vi:"Ôn tập từ sai", en:"Review", lvl:"Mix", hp:Math.min(420, Math.max(150, words.length*35)), atk:14,
           tint:"rgba(100,110,130,.15)", dragon:REVIEW_DRAGON, words };
}

// combo: each correct answer in a row adds +15% damage (cap x3.1 at 14 in a row)
const streakMult = s => 1 + Math.min(s, 14) * .15;
// the longer the fight, the stronger the dragon: +6% per question asked
const POWER_STEP = .06, HEAL_RATIO = .05;
function renderPower(){
  const pct = Math.round((S.power - 1) * 100);
  el.bossPow.textContent = pct > 0 ? "Sức mạnh +" + pct + "%" : "";
}
function healBoss(amount){
  if(!S || S.over || S.bossHp <= 0) return;
  const before = S.bossHp;
  S.bossHp = Math.min(S.stage.hp, S.bossHp + amount);
  if(S.bossHp > before){ floatText(el.dragon, "+" + (S.bossHp - before), "Rồng hồi máu", "heal"); renderHP(); }
  if(S.enraged && S.bossHp > S.stage.hp/2){ S.enraged = false; el.dragon.classList.remove("enraged"); el.arena.classList.remove("enraged"); DragonSprite.setRage(false); }
}
function damageFor(timeLeft){
  const ratio = timeLeft / S.time;
  const base = 10 + 40 * ratio;
  const mult = streakMult(S.streak) * S.perk.dmg * (S.armed ? 2 : 1);
  return { dmg: Math.round(base * mult), ratio };
}

function startGame(stageId){
  const st = buildStage(stageId);
  if(!st || st.words.length < 4){ showHub(); return; }
  const k = KNIGHTS.find(x => x.id === P.knight && isUnlocked(x)) || KNIGHTS[0];
  const perk = Object.assign({ time:0, hp:0, dmg:1, need:3, items:0 }, k.perk);
  S = {
    stage:st, knight:k, perk, time:20 + perk.time, maxHp:100 + perk.hp,
    bossHp:st.hp, knightHp:100 + perk.hp, queue:shuffle(st.words.slice()), q:null, options:[],
    timeLeft:0, raf:0, locked:true, streak:0, best:0, correct:0, answered:0, totalTime:0, missed:[],
    enraged:false, over:false, n:0, lastSec:null, power:1, dealt:0, startedAt:Date.now(),
    items:{ potion:1 + perk.items, shield:1 + perk.items, hint:2 + perk.items },
    shieldOn:false, meter:0, armed:false, hintUsed:false,
    unlockedBefore: KNIGHTS.filter(isUnlocked).map(x => x.id)
  };
  el.knight.className = "fighter knight"; el.dragon.className = "fighter dragon" + (st.elder ? " elder" : "");
  KnightSprite.mount(el.knight, k.sword);
  DragonSprite.mount(el.dragon, st.dragon);
  el.arena.classList.remove("enraged");
  el.arena.style.setProperty("--tint", st.tint);
  el.knightName.textContent = "Hiệp sĩ";
  el.bossName.textContent = st.dragon.name;
  el.stageName.textContent = st.vi + " (" + st.lvl + ")";
  $("#hubOv").hidden = true; $("#endOv").hidden = true;
  renderHP(); renderStreak(); renderItems();
  Sound.init(); Sound.play("roar"); Sound.musicStart();
  setTimeout(() => banner(st.dragon.name + " xuất hiện!"), 150);
  nextQuestion();
}

function nextQuestion(){
  if(!S || S.over) return;
  if(!S.queue.length) S.queue = shuffle(S.stage.words.slice());
  S.q = S.queue.pop(); S.n++;
  S.power = 1 + POWER_STEP * (S.n - 1); renderPower();
  if(S.n > 1 && (S.n - 1) % 5 === 0){
    const G = S;
    banner(S.stage.dragon.name + " mạnh lên!"); Sound.play("roar");
    DragonSprite.play("roar", () => { if(G === S && !S.over) DragonSprite.play("idle"); });
  }
  const stem = S.q.w.slice(0, 5);
  let pool = poolFor(S.q).filter(x => x !== S.q && x.w && !(x.w.startsWith(stem) || S.q.w.startsWith(x.w.slice(0, 5))));
  if (pool.length < 3) {
    const extra = ALL.filter(x => x !== S.q && x.w && !pool.some(p => p.w === x.w) && !(x.w.startsWith(stem) || S.q.w.startsWith(x.w.slice(0, 5))));
    pool = pool.concat(extra);
  }
  S.options = shuffle([S.q, ...shuffle(pool.slice()).slice(0,3)]);
  S.hintUsed = false; S.lastSec = null;
  el.fb.hidden = true;
  el.qcount.textContent = "Câu " + S.n;
  if(P.mode === "def"){
    el.qkicker.textContent = "Từ nào khớp với định nghĩa này?";
    el.qtext.className = "q-text";
    el.qtext.textContent = S.q.def;
    el.opts.className = "options";
  } else {
    el.qkicker.textContent = "Định nghĩa nào đúng với từ này?";
    el.qtext.className = "q-text word";
    el.qtext.innerHTML = "";
    const lv = document.createElement("span"); lv.className = "lvl"; lv.textContent = S.q.lvl + " · " + S.q.pos;
    const ip = document.createElement("span"); ip.className = "ipa"; ip.textContent = S.q.ipa;
    el.qtext.append(S.q.w + " ", lv, sayButton(S.q.w), ip);
    el.opts.className = "options long";
    speak(S.q.w);
  }
  el.opts.innerHTML = "";
  S.options.forEach((o,i) => {
    const b = document.createElement("button");
    b.className = "opt";
    b.innerHTML = `<span class="key">${i+1}</span><span class="txt"></span>`;
    b.querySelector(".txt").textContent = P.mode === "def" ? o.w : o.def;
    b.addEventListener("click", () => resolve(i));
    el.opts.append(b);
  });
  S.locked = false;
  renderItems();
  startTimer();
}

function startTimer(){
  const G = S, t0 = performance.now();
  S.timeLeft = S.time;
  const tick = now => {
    if(G !== S || S.locked || S.over) return;
    S.timeLeft = Math.max(0, S.time - (now - t0) / 1000);
    renderTimer();
    if(S.timeLeft <= 0){ resolve(-1); return; }
    S.raf = requestAnimationFrame(tick);
  };
  S.raf = requestAnimationFrame(tick);
}

function renderTimer(){
  const r = S.timeLeft / S.time, sec = Math.ceil(S.timeLeft);
  el.tfill.style.width = (r * 100) + "%";
  el.tnum.textContent = sec;
  el.timer.classList.toggle("warn", S.timeLeft <= 5);
  if(sec !== S.lastSec){ if(S.lastSec !== null && sec <= 5 && sec > 0) Sound.play("tick"); S.lastSec = sec; }
  el.dmgPreview.textContent = S.locked ? "" : "⚔ " + damageFor(S.timeLeft).dmg;
}
function renderHP(){
  el.khp.style.width = (S.knightHp / S.maxHp * 100) + "%";
  el.bhp.style.width = (S.bossHp / S.stage.hp * 100) + "%";
  el.khpText.textContent = S.knightHp + "/" + S.maxHp;
  el.bhpText.textContent = S.bossHp + "/" + S.stage.hp;
}
function renderStreak(){ const s = S ? S.streak : 0; el.streak.textContent = s; el.streakMul.textContent = s > 0 ? "x" + streakMult(s).toFixed(2).replace(/0$/, "") : ""; }
function renderItems(){
  if(!S) return;
  const I = S.items;
  el.ctPotion.textContent = I.potion; el.ctShield.textContent = I.shield; el.ctHint.textContent = I.hint;
  el.itPotion.disabled = S.over || I.potion <= 0 || S.knightHp >= S.maxHp;
  el.itShield.disabled = S.over || I.shield <= 0 || S.shieldOn;
  el.itHint.disabled = S.over || S.locked || I.hint <= 0 || S.hintUsed;
  const ready = S.meter >= S.perk.need;
  el.itSpecial.disabled = S.over || S.armed || !ready;
  el.itSpecial.classList.toggle("ready", ready && !S.armed);
  el.itSpecial.classList.toggle("armed", S.armed);
  el.meterFill.style.width = (S.armed ? 100 : Math.min(1, S.meter / S.perk.need) * 100) + "%";
}

function floatText(target, text, sub, cls){
  const a = el.arena.getBoundingClientRect(), t = target.getBoundingClientRect();
  const f = document.createElement("div");
  f.className = "float " + cls;
  f.style.left = (t.left - a.left + t.width*(target === el.knight ? .25 : .5)) + "px";
  f.style.top = (t.top - a.top + t.height*(target === el.knight ? .38 : .15)) + "px";
  f.textContent = text;
  if(sub){ const s = document.createElement("small"); s.textContent = sub; f.append(s); }
  el.arena.append(f);
  setTimeout(() => f.remove(), 1200);
}
function banner(text){ el.banner.textContent = text; restart(el.banner, "show"); }

/* ----- Items & skills ----- */
function usePotion(){
  if(!S || el.itPotion.disabled) return;
  S.items.potion--; renderItems();
  const G = S;
  // knight drinks the potion (same animation as the ultimate's heal); HP comes back as the sparkles burst
  KnightSprite.play("heal", () => { if(G === S && !S.over) KnightSprite.play("idle"); });
  setTimeout(() => {
    if(G !== S || S.over) return;
    const before = S.knightHp;
    S.knightHp = Math.min(S.maxHp, S.knightHp + POTION_HEAL);
    if(S.knightHp > before) floatText(el.knight, "+" + (S.knightHp - before), "Hồi máu", "heal");
    Sound.play("potion"); renderHP(); renderItems();
  }, KnightSprite.healDelay());
}
function useShield(){
  if(!S || el.itShield.disabled) return;
  S.items.shield--; S.shieldOn = true;
  el.knight.classList.add("shielded");
  Sound.play("block"); renderItems();
}
function useHint(){
  if(!S || el.itHint.disabled) return;
  S.items.hint--; S.hintUsed = true;
  const btns = [...el.opts.children];
  const wrong = shuffle(S.options.map((o,i)=>i).filter(i => S.options[i] !== S.q)).slice(0,2);
  wrong.forEach(i => { btns[i].disabled = true; btns[i].classList.add("cut"); });
  Sound.play("hint"); renderItems();
}
function useSpecial(){
  if(!S || el.itSpecial.disabled) return;
  S.meter = 0; S.armed = true;
  el.knight.classList.add("charged");
  KnightSprite.setCharged(true);
  const G = S;
  KnightSprite.play("charge", () => { if(G === S && !S.over) KnightSprite.play("idle"); });
  Sound.play("special"); banner("Trảm long sẵn sàng!"); renderItems();
}

/* ----- Combat ----- */
const ULT_HEAL = 20;
function ultimateHeal(G){
  KnightSprite.play("heal", () => { if(G !== S) return; KnightSprite.setCharged(false); KnightSprite.play("idle"); });
  setTimeout(() => {
    if(G !== S || S.knightHp <= 0) return;
    const before = S.knightHp;
    S.knightHp = Math.min(S.maxHp, S.knightHp + ULT_HEAL);
    if(S.knightHp > before) floatText(el.knight, "+" + (S.knightHp - before), "Hồi máu", "heal");
    Sound.play("potion"); renderHP(); renderItems();
  }, KnightSprite.healDelay());
}
function knightAttack(dmg, label){
  const G = S;
  const k = el.knight.getBoundingClientRect(), d = el.dragon.getBoundingClientRect();
  // move so the blade (≈78% across the frame) reaches the dragon's front
  el.knight.style.setProperty("--lunge", Math.max(16, d.left + d.width*.44 - (k.left + k.width*.39)) + "px");
  const ult = label === "Trảm long!";
  const anim = ult ? "special" : label === "Chí mạng!" ? "attack3" : label === "Đòn mạnh" ? "attack2" : "attack1";
  el.knight.classList.remove("back");
  el.knight.classList.add("dash");
  KnightSprite.play("run");
  setTimeout(() => {
    if(G !== S) return;
    KnightSprite.play(anim, () => {
      if(G !== S) return;
      el.knight.classList.add("back"); el.knight.classList.remove("dash");
      setTimeout(() => el.knight.classList.remove("back"), 320);
      if(ult && !(S.over && S.bossHp > 0)) return ultimateHeal(G);
      KnightSprite.setCharged(false);
      KnightSprite.play(S.over && S.bossHp > 0 ? "death" : "idle");
    });
  }, 220);
  setTimeout(() => {
    if(G !== S) return;
    restart(el.dragon, "hit");
    Sound.play("hit", label !== "Đòn nhẹ" && label !== "Đòn mạnh");
    S.dealt += Math.min(S.bossHp, dmg);
    S.bossHp = Math.max(0, S.bossHp - dmg);
    if(S.bossHp <= 0) DragonSprite.play("death");
    else DragonSprite.play("hurt", () => { if(G === S && !S.over) DragonSprite.play("idle"); });
    renderHP();
    floatText(el.dragon, "−" + dmg, label, "dmg-boss");
    if(!S.enraged && S.bossHp > 0 && S.bossHp <= S.stage.hp/2){
      S.enraged = true; el.dragon.classList.add("enraged"); el.arena.classList.add("enraged"); DragonSprite.setRage(true);
      setTimeout(() => { if(G === S && !S.over){ banner(S.stage.dragon.name + " nổi giận!"); Sound.play("roar"); DragonSprite.play("roar", () => { if(G === S && !S.over) DragonSprite.play("idle"); }); } }, 500);
    }
    if(S.bossHp <= 0) finish(true);
  }, 220 + KnightSprite.hitDelay(anim));
}

function dragonAttack(dmg){
  const G = S;
  DragonSprite.play("attack", () => { if(G === S && !S.over) DragonSprite.play("idle"); });
  setTimeout(() => { if(G === S) Sound.play("breath"); }, DragonSprite.fireDelay());
  const st = el.stage.getBoundingClientRect(), d = el.dragon.getBoundingClientRect(), k = el.knight.getBoundingClientRect();
  const f = document.createElement("div");
  f.className = "fire";
  const [c1,c2,c3] = S.stage.dragon.breath;
  f.style.background = `radial-gradient(circle at 70% 50%, ${c1} 0 18%, ${c2} 40%, ${c3} 65%, transparent 72%)`;
  const sx = d.left - st.left + d.width*.08, sy = d.top - st.top + d.height*.48 - 20;
  f.style.left = sx + "px"; f.style.top = sy + "px";
  f.style.setProperty("--dist", (k.left - st.left + k.width*.21 - sx) + "px");
  setTimeout(() => { if(G === S){ el.stage.append(f); setTimeout(() => f.remove(), 650); } }, DragonSprite.fireDelay() + 120);
  setTimeout(() => {
    if(G !== S) return;
    if(S.shieldOn){
      S.shieldOn = false; el.knight.classList.remove("shielded");
      floatText(el.knight, "Chặn!", "Khiên đã vỡ", "block");
      KnightSprite.play("block", () => { if(G === S && !S.over) KnightSprite.play("idle"); });
      Sound.play("block"); renderItems();
      return;
    }
    restart(el.knight, "hit");
    S.knightHp = Math.max(0, S.knightHp - dmg);
    if(S.knightHp <= 0) KnightSprite.play("death");
    else KnightSprite.play("hurt", () => { if(G === S && !S.over) KnightSprite.play("idle"); });
    renderHP(); renderItems();
    floatText(el.knight, "−" + dmg, null, "dmg-knight");
    if(S.knightHp <= 0) finish(false);
  }, DragonSprite.fireDelay() + 560);
}

function resolve(i){
  if(!S || S.locked || S.over) return;
  S.locked = true;
  cancelAnimationFrame(S.raf);
  el.dmgPreview.textContent = "";
  const t = S.timeLeft, used = S.time - t, timeout = i < 0;
  const ok = !timeout && S.options[i] === S.q;
  S.answered++;

  [...el.opts.children].forEach((b,j) => {
    b.disabled = true;
    if(S.options[j] === S.q) b.classList.add("correct");
    else if(j === i) b.classList.add("wrong");
    else b.classList.add("dim");
  });

  let verdict;
  if(ok){
    const { dmg, ratio } = damageFor(t);
    const wasArmed = S.armed;
    S.correct++; S.totalTime += used; S.streak++; S.best = Math.max(S.best, S.streak);
    const label = wasArmed ? "Trảm long!" : ratio >= .75 ? "Chí mạng!" : ratio >= .4 ? "Đòn mạnh" : "Đòn nhẹ";
    if(wasArmed){ S.armed = false; el.knight.classList.remove("charged"); }
    else S.meter = Math.min(S.perk.need, S.meter + 1);
    knightAttack(dmg, label);
    verdict = `Chính xác sau ${used.toFixed(1)} giây. ${label} gây ${dmg} sát thương` + (S.streak > 1 ? ` (chuỗi ${S.streak}).` : ".");
    P.totalCorrect++;
    if(P.review[S.q.w]){ P.review[S.q.w]--; if(P.review[S.q.w] <= 0) delete P.review[S.q.w]; }
  } else {
    S.streak = 0; S.missed.push(S.q);
    const dmg = Math.round((S.stage.atk + (timeout ? TIMEOUT_EXTRA : 0) + (S.enraged ? ENRAGE_BONUS : 0)) * S.power);
    const heal = Math.round(S.stage.hp * HEAL_RATIO * S.power);
    Sound.play("wrong");
    dragonAttack(dmg);
    const G = S; setTimeout(() => { if(G === S) healBoss(heal); }, DragonSprite.fireDelay() + 760);
    const who = S.stage.dragon.name;
    const head = timeout ? "Hết giờ!" : "Chưa đúng.";
    verdict = S.shieldOn ? `${head} Khiên đỡ được đòn, nhưng ${who} hồi ${heal} máu.`
                         : `${head} ${who} tấn công, bạn mất ${dmg} máu và rồng hồi ${heal} máu.`;
  }
  P.bestStreak = Math.max(P.bestStreak, S.best);
  saveProgress();
  renderStreak(); renderItems();

  el.fb.className = "feedback " + (ok ? "ok" : "bad");
  el.verdict.textContent = verdict;
  el.fbWord.innerHTML = "";
  const pos = document.createElement("span"); pos.className = "pos"; pos.textContent = S.q.pos + ", " + S.q.lvl;
  const ip = document.createElement("span"); ip.className = "ipa"; ip.textContent = S.q.ipa;
  el.fbWord.append(S.q.w, pos, ip, sayButton(S.q.w));
  el.fbVi.textContent = "Nghĩa: " + S.q.vi;
  el.fbDef.textContent = S.q.def.charAt(0).toUpperCase() + S.q.def.slice(1) + ".";
  el.fbEx.textContent = S.q.ex;
  $("#camLink").href = "https://dictionary.cambridge.org/dictionary/english/" + encodeURIComponent(S.q.w);
  el.fb.hidden = false;
  el.nextBtn.hidden = false;
  el.nextBtn.focus({ preventScroll:true });
  speak(S.q.w);
}

function finish(win){
  if(S.over) return;
  const G = S;
  S.over = true;
  el.nextBtn.hidden = true;
  renderItems();
  Sound.musicStop();
  (win ? el.dragon : el.knight).classList.add("dead");
  if(win && S.stage.id !== "review" && !isBank(S.stage.id) && !S.stage.id.startsWith("custom_") && !P.cleared.includes(S.stage.id)) P.cleared.push(S.stage.id);
  saveProgress();
  setTimeout(() => Sound.play(win ? "victory" : "defeat"), 300);
  setTimeout(() => {
    if(G !== S) return;
    $("#endTitle").textContent = win ? S.stage.dragon.name + " đã gục ngã" : "Hiệp sĩ đã ngã xuống";
    $("#endSub").textContent = win
      ? `Bạn hoàn thành màn ${S.stage.vi} sau ${S.answered} câu.`
      : `${S.stage.dragon.name} còn ${S.bossHp} máu. Ôn lại các từ dưới đây rồi quay lại nhé.`;
    const acc = S.answered ? Math.round(S.correct / S.answered * 100) : 0;
    const avg = S.correct ? (S.totalTime / S.correct).toFixed(1) + "s" : "—";
    const stats = $("#stats"); stats.innerHTML = "";
    [[`${S.correct}/${S.answered}`,"Câu đúng"],[acc + "%","Độ chính xác"],[avg,"Thời gian trả lời đúng trung bình"],[S.best,"Chuỗi đúng dài nhất"]]
      .forEach(([v,l]) => { const d = document.createElement("div"); d.className = "stat"; d.innerHTML = "<b></b><span></span>"; d.querySelector("b").textContent = v; d.querySelector("span").textContent = l; stats.append(d); });

    const uw = $("#unlockWrap"); uw.innerHTML = "";
    const fresh = KNIGHTS.filter(k => isUnlocked(k) && !S.unlockedBefore.includes(k.id));
    if(fresh.length){
      const p = document.createElement("p"); p.textContent = "Kiếm mới đã mở khóa:"; uw.append(p);
      const row = document.createElement("div"); row.className = "unlocks";
      fresh.forEach(k => { const c = knightCard(k, false); c.disabled = true; row.append(c); });
      uw.append(row);
      setTimeout(() => Sound.play("unlock"), 900);
    }

    const wrap = $("#missedWrap"); wrap.innerHTML = "";
    const uniq = [...new Set(S.missed)];
    if(uniq.length){
      const p = document.createElement("p"); p.textContent = "Từ trả lời chưa đúng:"; wrap.append(p);
      const ul = document.createElement("ul"); ul.className = "missed";
      uniq.forEach(m => {
        const li = document.createElement("li");
        const b = document.createElement("b"); b.textContent = m.w;
        const em = document.createElement("em"); em.textContent = m.vi;
        li.append(b, " ", em, " — " + m.def);
        ul.append(li);
      });
      wrap.append(ul);
    }
    // ---- score & leaderboard ----
    const result = { stageId:S.stage.id, won:win, correct:S.correct, answered:S.answered, bestStreak:S.best, dealt:S.dealt, durationMs:Date.now() - S.startedAt };
    result.score = computeScore(result);
    const line = $("#scoreLine"), ranked = S.stage.id !== "review" && !S.stage.id.startsWith("custom_");
    line.textContent = "Điểm: " + result.score;
    const lbBtn = $("#lbBtn"); lbBtn.hidden = !ranked;
    lbBtn.onclick = () => HOOKS.openLeaderboard && HOOKS.openLeaderboard(G.stage.id, G.stage.vi);
    if(ranked && !HOOKS.user) line.textContent += ". Đăng nhập để lưu điểm lên bảng xếp hạng.";
    else if(ranked && HOOKS.onFinish){
      line.textContent += " (đang lưu…)";
      Promise.resolve(HOOKS.onFinish(result)).then(r => {
        if(G !== S) return;
        if(!r){ line.textContent = "Điểm: " + result.score + ". Chưa lưu được điểm, thử lại sau."; return; }
        line.textContent = r.isBest ? `Điểm: ${result.score}. Kỷ lục mới! Hạng #${r.rank} ở màn này.`
                                    : `Điểm: ${result.score}. Kỷ lục của bạn: ${r.best} (hạng #${r.rank}).`;
      }).catch(() => { if(G === S) line.textContent = "Điểm: " + result.score + ". Chưa lưu được điểm."; });
    }
    $("#againBtn").disabled = (S.stage.id === "review" && reviewWords().length < 4) || (S.stage.id.startsWith("custom_") && buildStage(S.stage.id).words.length < 4);
    $("#endOv").hidden = false;
    $("#againBtn").focus();
  }, 1400);
}

function leave(){
  if(S){ S.over = true; cancelAnimationFrame(S.raf); }
  Sound.musicStop();
  if(canSpeak) speechSynthesis.cancel();
  showHub();
}

/* =====================================================================
   HUB
   ===================================================================== */
function miniWrap(content){ const m = document.createElement("span"); m.className = "mini"; if(typeof content === "string") m.innerHTML = content; else m.append(content); return m; }
function knightCard(k, interactive=true){
  const unlocked = isUnlocked(k);
  const c = document.createElement("button");
  c.className = "card knight-card" + (unlocked ? "" : " locked");
  c.setAttribute("aria-pressed", String(interactive && P.knight === k.id && unlocked));
  const body = document.createElement("span"); body.className = "card-body";
  const b = document.createElement("b"); b.textContent = k.name;
  const s = document.createElement("span"); s.textContent = k.perkText;
  body.append(b, s);
  if(!unlocked){
    const cur = Math.min(k.unlock.need, k.unlock.cur());
    const l = document.createElement("span"); l.textContent = "🔒 " + k.unlock.text + ` (${cur}/${k.unlock.need})`;
    const bar = document.createElement("span"); bar.className = "lockbar"; bar.innerHTML = `<i style="width:${cur / k.unlock.need * 100}%"></i>`;
    body.append(l, bar);
    c.setAttribute("aria-disabled", "true");
  }
  c.append(miniWrap(KnightSprite.thumb(k.sword)), body);
  if(interactive) c.addEventListener("click", () => { if(!unlocked) return; P.knight = k.id; saveProgress(); renderHub(); });
  return c;
}
function stageCard(st){
  const c = document.createElement("button");
  c.className = "card";
  c.setAttribute("aria-pressed", String(selectedStage === st.id));
  const body = document.createElement("span"); body.className = "card-body";
  const b = document.createElement("b"); b.textContent = st.vi;
  const s1 = document.createElement("span"); s1.textContent = st.en + ", " + st.lvl + ", " + st.words.length + " từ";
  const s2 = document.createElement("span"); s2.textContent = "Rồng " + st.hp + " máu";
  body.append(b, s1, s2);
  if(st.id === "review"){
    s1.textContent = st.words.length + " từ cần ôn";
    if(st.words.length < 4){ c.disabled = true; s2.textContent = "Cần ít nhất 4 từ trả lời sai để mở"; }
  } else if(P.cleared.includes(st.id)){
    const d = document.createElement("span"); d.className = "done"; d.textContent = "Đã hạ ✓"; body.append(d);
  }
  const badge = document.createElement("span"); badge.className = "badge";
  badge.textContent = st.id === "review" ? "↺" : isBank(st.id) ? st.lvl : String(STAGES.indexOf(st) + 1);
  c.append(badge, body);
  c.addEventListener("click", () => { selectedStage = st.id; renderHub(); });
  if(st.id === "review") return c;
  const wrap = document.createElement("div"); wrap.className = "card-wrap";
  const lb = document.createElement("button");
  lb.type = "button"; lb.className = "lb-btn"; lb.textContent = "🏆";
  lb.title = "Bảng xếp hạng"; lb.setAttribute("aria-label", "Bảng xếp hạng " + st.vi);
  lb.addEventListener("click", e => { e.stopPropagation(); HOOKS.openLeaderboard && HOOKS.openLeaderboard(st.id, st.vi); });
  wrap.append(c, lb);
  return wrap;
}

function customStageCard(st, list){
  const wrap = document.createElement("div");
  wrap.className = "card-wrap";
  const c = document.createElement("button");
  c.className = "card" + (st.words.length < 4 ? " disabled" : "");
  c.setAttribute("aria-pressed", String(selectedStage === st.id));
  const body = document.createElement("span"); body.className = "card-body";
  const b = document.createElement("b"); b.textContent = st.vi;
  const s1 = document.createElement("span"); s1.textContent = st.words.length + " từ cá nhân";
  const s2 = document.createElement("span");
  s2.textContent = st.words.length < 4 ? "Cần ít nhất 4 từ để vào trận" : "Rồng " + st.hp + " máu";
  body.append(b, s1, s2);

  const badge = document.createElement("span"); badge.className = "badge";
  badge.textContent = "★";
  c.append(badge, body);

  c.addEventListener("click", () => {
    if(st.words.length >= 4){
      selectedStage = st.id;
      renderHub();
    } else {
      openCustomListModal(list.id);
    }
  });

  const manageBtn = document.createElement("button");
  manageBtn.type = "button"; manageBtn.className = "lb-btn"; manageBtn.textContent = "📝";
  manageBtn.title = "Quản lý từ"; manageBtn.setAttribute("aria-label", "Quản lý nhóm " + st.vi);
  manageBtn.addEventListener("click", e => {
    e.stopPropagation();
    openCustomListModal(list.id);
  });
  wrap.append(c, manageBtn);
  return wrap;
}

let toastTimer = null;
function showToast(msg, type = "success"){
  const toast = $("#pixelToast");
  if(!toast) return;
  toast.textContent = msg;
  toast.className = "pixel-toast " + type;
  toast.hidden = false;
  if(toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 2200);
}

function renderHub(){
  const customLists = getCustomLists();
  const totalCustomWords = customLists.reduce((sum, l) => sum + l.words.length, 0);
  $("#progressLine").textContent = `Đã trả lời đúng ${P.totalCorrect} câu, hạ ${P.cleared.length}/${STAGES.length} rồng, chuỗi dài nhất ${P.bestStreak}. Có ${customLists.length} list cá nhân (${totalCustomWords} từ).`;

  if(selectedStage === "review" && reviewWords().length < 4){
    selectedStage = STAGES[0] ? STAGES[0].id : "easy_1";
  } else if(selectedStage.startsWith("custom_")){
    const listId = selectedStage.slice(7);
    const target = customLists.find(l => l.id === listId || l.id === selectedStage);
    if(!target){
      selectedStage = STAGES[0] ? STAGES[0].id : "easy_1";
    }
  }

  document.querySelectorAll("#hubTabs .hub-tab").forEach(t => {
    const active = t.dataset.tab === currentHubTab;
    t.classList.toggle("active", active);
    t.setAttribute("aria-selected", String(active));
  });

  const sg = $("#stageGrid"); sg.innerHTML = "";
  if(currentHubTab === "custom"){
    if(customLists.length === 0){
      const emptyMsg = document.createElement("div");
      emptyMsg.className = "custom-word-empty";
      emptyMsg.style.gridColumn = "1 / -1";
      emptyMsg.textContent = 'Chưa có danh sách từ cá nhân nào. Hãy bấm "💾 Lưu từ" sau mỗi câu hỏi để tạo danh sách!';
      sg.append(emptyMsg);
    } else {
      customLists.forEach(list => {
        const stageObj = buildStage("custom_" + list.id);
        sg.append(customStageCard(stageObj, list));
      });
    }
  } else {
    const filteredStages = STAGES.filter(st => st.tier === currentHubTab);
    filteredStages.forEach(st => sg.append(stageCard(st)));
  }

  const bg = $("#bankGrid"); bg.innerHTML = "";
  ["bankC1","bankC2"].forEach(id => { const st = buildStage(id); const c = stageCard(st);
    c.querySelector(".card-body span").textContent = st.words.length + " từ, hỏi ngẫu nhiên"; bg.append(c); });
  const lastL = BANK_RAW[BANK_RAW.length - 1][0][0].toUpperCase();
  $("#bankNote").textContent = `Trọn bộ ${BANK_RAW.length} từ C1–C2 từ A đến Z. Mỗi trận hỏi ngẫu nhiên, không lặp từ cho tới khi hết kho.`;
  const kg = $("#knightGrid"); kg.innerHTML = "";
  KNIGHTS.forEach(k => kg.append(knightCard(k)));
  document.querySelectorAll(".mode").forEach(x => x.setAttribute("aria-pressed", String(x.dataset.mode === P.mode)));
  const st = buildStage(selectedStage);
  if(currentHubTab === "custom" && (!selectedStage.startsWith("custom_") || st.words.length < 4)){
    $("#startBtn").textContent = "Chọn nhóm từ (cần ≥ 4 từ)";
    $("#startBtn").disabled = true;
  } else {
    $("#startBtn").textContent = "Vào trận: " + st.vi;
    $("#startBtn").disabled = (st.words.length < 4);
  }
}
function showHub(){
  $("#endOv").hidden = true;
  renderHub();
  $("#hubOv").hidden = false;
}

/* =====================================================================
   SAVE MODAL & CUSTOM LIST MODAL
   ===================================================================== */
let currentSaveWord = null;

function renderSaveChoices(selectedId = null){
  const container = $("#saveListChoices");
  if(!container) return;
  const lists = getCustomLists();
  container.innerHTML = "";
  if(lists.length === 0){
    const empty = document.createElement("p");
    empty.className = "custom-word-empty";
    empty.textContent = "Chưa có nhóm từ nào. Hãy tạo nhóm mới ở dưới!";
    container.append(empty);
    return;
  }
  lists.forEach((list, idx) => {
    const label = document.createElement("label");
    label.className = "save-choice";
    const isChecked = selectedId ? list.id === selectedId : idx === 0;
    label.setAttribute("aria-checked", String(isChecked));
    if(isChecked) label.classList.add("selected");

    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "saveTargetList";
    radio.value = list.id;
    radio.checked = isChecked;

    radio.addEventListener("change", () => {
      container.querySelectorAll(".save-choice").forEach(c => {
        c.classList.remove("selected");
        c.setAttribute("aria-checked", "false");
      });
      label.classList.add("selected");
      label.setAttribute("aria-checked", "true");
    });

    const nameSpan = document.createElement("span");
    nameSpan.className = "save-choice-name";
    nameSpan.textContent = list.name;

    const countSpan = document.createElement("span");
    countSpan.className = "save-choice-count";
    countSpan.textContent = list.words.length + " từ";

    label.append(radio, nameSpan, countSpan);
    container.append(label);
  });
}

function openSaveModal(){
  if(!S || !S.q) return;
  currentSaveWord = S.q;
  $("#saveWordText").textContent = currentSaveWord.w;
  $("#saveWordIpa").textContent = currentSaveWord.ipa ? `/${currentSaveWord.ipa}/` : "";
  $("#saveWordVi").textContent = currentSaveWord.vi || "";
  $("#saveNewGroupName").value = "";
  renderSaveChoices();
  $("#saveOv").hidden = false;
}

function handleCreateGroup(){
  const input = $("#saveNewGroupName");
  const name = input.value.trim();
  if(!name){
    showToast("Vui lòng nhập tên nhóm!", "warn");
    input.focus();
    return;
  }
  const newList = createCustomList(name);
  input.value = "";
  renderSaveChoices(newList.id);
  showToast("Đã tạo nhóm: " + newList.name, "success");
}

let activeManageListId = null;

function openCustomListModal(listId){
  activeManageListId = listId;
  renderCustomListModal();
  $("#customListOv").hidden = false;
}

function renderCustomListModal(){
  const lists = getCustomLists();
  const list = lists.find(l => l.id === activeManageListId);
  if(!list){
    $("#customListOv").hidden = true;
    return;
  }
  $("#customListTitle").textContent = list.name;
  $("#customListCount").textContent = list.words.length + " từ";
  const wordList = $("#customWordList");
  wordList.innerHTML = "";

  if(list.words.length === 0){
    const empty = document.createElement("div");
    empty.className = "custom-word-empty";
    empty.textContent = 'Chưa có từ nào trong nhóm này. Hãy bấm "💾 Lưu từ" sau mỗi câu hỏi để thêm từ!';
    wordList.append(empty);
  } else {
    list.words.forEach(w => {
      const item = document.createElement("div");
      item.className = "custom-word-item";

      const info = document.createElement("div");
      info.className = "custom-word-info";

      const title = document.createElement("b");
      title.className = "custom-word-title";
      title.textContent = w.w;

      const ipa = document.createElement("span");
      ipa.className = "custom-word-ipa";
      ipa.textContent = w.ipa ? `/${w.ipa}/` : (w.pos || "");

      const vi = document.createElement("span");
      vi.className = "custom-word-vi";
      vi.textContent = w.vi || "";

      info.append(title, ipa, vi);

      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "custom-word-del";
      delBtn.innerHTML = "✖";
      delBtn.title = "Xóa từ khỏi nhóm";
      delBtn.setAttribute("aria-label", "Xóa từ " + w.w);
      delBtn.addEventListener("click", () => {
        removeWordFromList(list.id, w.w);
        renderCustomListModal();
        renderHub();
        showToast("Đã xóa từ: " + w.w, "success");
      });

      item.append(info, delBtn);
      wordList.append(item);
    });
  }

  const playBtn = $("#customListPlayBtn");
  playBtn.disabled = list.words.length < 4;
  playBtn.title = list.words.length < 4 ? "Cần ít nhất 4 từ để vào trận" : "Vào trận";
}

/* =====================================================================
   CONTROLS
   ===================================================================== */
document.querySelectorAll(".mode").forEach(b => b.addEventListener("click", () => { P.mode = b.dataset.mode; saveProgress(); renderHub(); }));
$("#startBtn").addEventListener("click", () => startGame(selectedStage));
$("#againBtn").addEventListener("click", () => startGame(S.stage.id));
$("#hubBtn").addEventListener("click", showHub);
$("#leaveBtn").addEventListener("click", leave);
el.nextBtn.addEventListener("click", () => { if(S && S.locked && !S.over) nextQuestion(); });
el.itPotion.addEventListener("click", usePotion);
el.itShield.addEventListener("click", useShield);
el.itHint.addEventListener("click", useHint);
el.itSpecial.addEventListener("click", useSpecial);

document.querySelectorAll("#hubTabs .hub-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    currentHubTab = tab.dataset.tab || "easy";
    if(currentHubTab === "custom"){
      const firstCustom = getCustomLists().find(l => l.words.length >= 4);
      if(firstCustom) selectedStage = "custom_" + firstCustom.id;
    } else {
      const firstInTier = STAGES.find(s => s.tier === currentHubTab);
      if(firstInTier) selectedStage = firstInTier.id;
    }
    renderHub();
  });
});

$("#saveWordBtn").addEventListener("click", openSaveModal);
$("#saveCloseBtn").addEventListener("click", () => { $("#saveOv").hidden = true; });
$("#saveCreateGroupBtn").addEventListener("click", handleCreateGroup);
$("#saveNewGroupName").addEventListener("keydown", e => {
  if(e.key === "Enter"){
    e.preventDefault();
    handleCreateGroup();
  }
});
$("#saveConfirmBtn").addEventListener("click", () => {
  if(!currentSaveWord) return;
  const checked = document.querySelector('input[name="saveTargetList"]:checked');
  if(!checked){
    showToast("Vui lòng chọn hoặc tạo nhóm từ!", "warn");
    return;
  }
  const listId = checked.value;
  const res = addWordToList(listId, {
    w: currentSaveWord.w,
    lvl: currentSaveWord.lvl || "",
    pos: currentSaveWord.pos || "",
    ipa: currentSaveWord.ipa || "",
    def: currentSaveWord.def || "",
    vi: currentSaveWord.vi || "",
    ex: currentSaveWord.ex || ""
  });
  if(res.alreadyExists){
    showToast(`Từ "${currentSaveWord.w}" đã có trong nhóm!`, "warn");
  } else if(res.success){
    showToast(`Đã lưu "${currentSaveWord.w}" vào nhóm!`, "success");
    $("#saveOv").hidden = true;
    if(currentHubTab === "custom") renderHub();
  } else {
    showToast("Không thể lưu từ vào nhóm!", "error");
  }
});

$("#customListCloseBtn").addEventListener("click", () => {
  $("#customListOv").hidden = true;
});
$("#customListDeleteBtn").addEventListener("click", () => {
  if(!activeManageListId) return;
  const lists = getCustomLists();
  const list = lists.find(l => l.id === activeManageListId);
  const name = list ? list.name : "nhóm từ";
  if(confirm(`Bạn có chắc muốn xóa nhóm "${name}"?`)){
    deleteCustomList(activeManageListId);
    $("#customListOv").hidden = true;
    if(selectedStage === "custom_" + activeManageListId){
      selectedStage = STAGES[0] ? STAGES[0].id : "easy_1";
    }
    renderHub();
    showToast(`Đã xóa nhóm: ${name}`, "success");
  }
});
$("#customListPlayBtn").addEventListener("click", () => {
  if(!activeManageListId) return;
  const lists = getCustomLists();
  const list = lists.find(l => l.id === activeManageListId);
  if(!list || list.words.length < 4){
    showToast("Cần ít nhất 4 từ để vào trận!", "warn");
    return;
  }
  selectedStage = "custom_" + activeManageListId;
  $("#customListOv").hidden = true;
  startGame("custom_" + activeManageListId);
});
$("#saveOv").addEventListener("click", e => { if(e.target === $("#saveOv")) $("#saveOv").hidden = true; });
$("#customListOv").addEventListener("click", e => { if(e.target === $("#customListOv")) $("#customListOv").hidden = true; });

const musicBtn = $("#musicBtn"), sfxBtn = $("#sfxBtn");
musicBtn.setAttribute("aria-pressed", String(P.music));
sfxBtn.setAttribute("aria-pressed", String(P.sfx));
musicBtn.addEventListener("click", () => { Sound.init(); Sound.setMusic(!P.music); musicBtn.setAttribute("aria-pressed", String(P.music)); if(P.music && S && !S.over) Sound.musicStart(); });
sfxBtn.addEventListener("click", () => { Sound.init(); Sound.setSfx(!P.sfx); sfxBtn.setAttribute("aria-pressed", String(P.sfx)); });

document.querySelectorAll(".accent button").forEach(b => {
  b.setAttribute("aria-pressed", String(b.dataset.accent === P.accent));
  b.addEventListener("click", () => {
    P.accent = b.dataset.accent; saveProgress();
    document.querySelectorAll(".accent button").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
    if(S && S.q && (P.mode === "word" || S.locked)) speak(S.q.w);
  });
});
if(!canSpeak) document.querySelector(".accent").style.display = "none";

_doc.addEventListener("keydown", e => {
  const saveOv = $("#saveOv"), customListOv = $("#customListOv");
  if(e.key === "Escape"){
    if(saveOv && !saveOv.hidden){ saveOv.hidden = true; return; }
    if(customListOv && !customListOv.hidden){ customListOv.hidden = true; return; }
  }
  if((saveOv && !saveOv.hidden) || (customListOv && !customListOv.hidden)) return;
  if(!S || S.over || !$("#hubOv").hidden) return;
  const k = e.key.toLowerCase();
  if(k === "q") return usePotion();
  if(k === "w") return useShield();
  if(k === "e") return useHint();
  if(k === "r") return useSpecial();
  if(k === "p"){ if(P.mode === "word" || S.locked) speak(S.q.w); return; }
  if(!S.locked && /^[1-4]$/.test(k)){
    const btn = el.opts.children[+k - 1];
    if(btn && !btn.disabled) resolve(+k - 1);
  } else if(S.locked && !el.fb.hidden && (e.key === "Enter" || e.key === " ")){ e.preventDefault(); nextQuestion(); }
});

/* Initial scene behind the hub */
KnightSprite.mount(el.knight, (KNIGHTS.find(k => k.id === P.knight && isUnlocked(k)) || KNIGHTS[0]).sword);
DragonSprite.mount(el.dragon, STAGES[0].dragon);
el.khp.style.width = "100%"; el.bhp.style.width = "100%";
showHub();

return function destroy(){
  alive = false;
  try{ Sound.musicStop(); }catch(e){}
  if(S){ S.over = true; cancelAnimationFrame(S.raf); }
  try{ if(canSpeak) speechSynthesis.cancel(); }catch(e){}
  _listeners.forEach(([t, f, o]) => document.removeEventListener(t, f, o));
};
}
