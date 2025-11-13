/* Fluffy Snake — script.js
   - カラフルでふわふわ見た目
   - スワイプ対応（モバイル）
   - localStorageでベストスコア
   - パーティクル（食べたとき）
   - No sound
*/

/* -----------------------
   Config
------------------------*/
const CONFIG = {
  GRID: 20,           // 初期グリッド（画面が小さい場合は内部で縮小）
  BASE_SPEED: 6,      // 初期ティック（ticks per second）
  SPEED_STEP: 0.25,   // 食べるごとに少し速くなる
  MAX_SPEED: 18,      // 最大速度
  CELL_PADDING: 0.12, // セル内でのパディング（丸っこさ）
  HEART_EMOJI: '🍓'   // 食べ物の絵文字（可愛い）
};

/* -----------------------
   DOM
------------------------*/
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: true });
const scoreEl = document.getElementById('score');
const bestEl = document.getElementById('best');
const overlay = document.getElementById('overlay');
const startBtn = document.getElementById('startBtn');
const retryBtn = document.getElementById('retryBtn');
const homeBtn = document.getElementById('homeBtn');
const startPanel = document.getElementById('startPanel');
const overPanel = document.getElementById('overPanel');
const finalScoreEl = document.getElementById('finalScore');
const wrapToggle = document.getElementById('wrapToggle');

/* -----------------------
   Responsive scaling
------------------------*/
function fitCanvas() {
  // CSS controls visual size; we set internal resolution to keep crispness
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const size = Math.min(680, Math.min(window.innerWidth - 80, window.innerHeight - 220));
  // ensure square
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  canvas.width = Math.floor(size * dpr);
  canvas.height = Math.floor(size * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // work in css pixels
}
window.addEventListener('resize', fitCanvas);
fitCanvas();

/* -----------------------
   Game state
------------------------*/
let grid = CONFIG.GRID;
let cellSize = 0;
let snake = [];       // array of {x,y}
let dir = { x: 1, y: 0 }; // current direction
let nextDir = null;   // buffered direction
let food = null;
let score = 0;
let best = parseInt(localStorage.getItem('fluffy_snake_best') || '0', 10) || 0;
let running = false;
let over = false;
let wrap = false;
let speed = CONFIG.BASE_SPEED; // ticks per second

let lastTick = 0;
let tickInterval = 1000 / speed; // ms
let accumulator = 0;

/* particles */
let particles = [];

/* update UI */
bestEl.textContent = best;

/* -----------------------
   Utilities
------------------------*/
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function setGridBasedOnSize() {
  // smaller screen -> fewer cells to keep playability
  const widthPx = parseFloat(getComputedStyle(canvas).width);
  if (widthPx <= 320) {
    grid = Math.max(12, CONFIG.GRID - 6);
  } else if (widthPx <= 480) {
    grid = Math.max(16, CONFIG.GRID - 4);
  } else {
    grid = CONFIG.GRID;
  }
  cellSize = (parseFloat(getComputedStyle(canvas).width)) / grid;
}

/* -----------------------
   Initialize game
------------------------*/
function resetGame() {
  setGridBasedOnSize();
  snake = [];
  const startX = Math.floor(grid / 2);
  const startY = Math.floor(grid / 2);
  // initial snake: 3 blocks
  snake.push({ x: startX - 1, y: startY });
  snake.push({ x: startX, y: startY });
  snake.push({ x: startX + 1, y: startY });
  dir = { x: 0, y: 0 }; // wait for player to move
  nextDir = null;
  score = 0;
  speed = CONFIG.BASE_SPEED;
  tickInterval = 1000 / speed;
  particles = [];
  placeFood();
  running = false;
  over = false;
  updateScore();
  overlay.style.pointerEvents = 'auto';
  startPanel.hidden = false;
  overPanel.hidden = true;
  finalScoreEl.textContent = '0';
}

/* -----------------------
   Food placement
------------------------*/
function placeFood() {
  // pick a random empty cell
  const occupied = new Set(snake.map(s => `${s.x},${s.y}`));
  const freeCells = [];
  for (let x = 0; x < grid; x++) {
    for (let y = 0; y < grid; y++) {
      const key = `${x},${y}`;
      if (!occupied.has(key)) freeCells.push({ x, y });
    }
  }
  if (freeCells.length === 0) {
    // snake filled everything — player wins (treat as game over)
    return null;
  }
  food = freeCells[randInt(0, freeCells.length - 1)];
  return food;
}

/* -----------------------
   Input (keyboard + mobile swipe)
------------------------*/
const keyDirMap = {
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  w: { x: 0, y: -1 },
  s: { x: 0, y: 1 },
  a: { x: -1, y: 0 },
  d: { x: 1, y: 0 }
};

window.addEventListener('keydown', (e) => {
  const k = e.key;
  if (keyDirMap[k]) {
    e.preventDefault();
    queueDirection(keyDirMap[k]);
    if (!running && !over) startGame();
  } else if (k === ' ' && running) {
    // space to pause/resume (optional)
    running = !running;
    if (running) lastTick = performance.now();
  }
});

function queueDirection(nd) {
  // ignore reverse direction
  const cur = dir;
  // if dir is zero (not started), accept any
  if (cur.x === 0 && cur.y === 0) {
    nextDir = nd;
    return;
  }
  if (nd.x === -cur.x && nd.y === -cur.y) {
    // reverse — ignore
    return;
  }
  nextDir = nd;
}

/* touch / swipe */
let touchStart = null;
canvas.addEventListener('touchstart', (e) => {
  const t = e.changedTouches[0];
  touchStart = { x: t.clientX, y: t.clientY };
}, { passive: true });

canvas.addEventListener('touchend', (e) => {
  const t = e.changedTouches[0];
  if (!touchStart) return;
  const dx = t.clientX - touchStart.x;
  const dy = t.clientY - touchStart.y;
  const adx = Math.abs(dx), ady = Math.abs(dy);
  if (Math.max(adx, ady) < 20) return; // small tap -> ignore
  let nd = null;
  if (adx > ady) {
    nd = dx > 0 ? { x: 1, y: 0 } : { x: -1, y: 0 };
  } else {
    nd = dy > 0 ? { x: 0, y: 1 } : { x: 0, y: -1 };
  }
  queueDirection(nd);
  if (!running && !over) startGame();
}, { passive: true });

/* -----------------------
   Main loop & tick
------------------------*/
function startGame() {
  if (over) return;
  running = true;
  overlay.style.pointerEvents = 'none';
  startPanel.hidden = true;
  lastTick = performance.now();
  requestAnimationFrame(loop);
}

function loop(now) {
  if (!running) {
    render(); // still render for subtle particles/idle
    return;
  }
  const dt = now - lastTick;
  lastTick = now;
  accumulator += dt;
  // tick based on speed
  tickInterval = 1000 / speed;
  while (accumulator >= tickInterval) {
    tick();
    accumulator -= tickInterval;
  }
  updateParticles( dt );
  render();
  if (!over) requestAnimationFrame(loop);
}

/* -----------------------
   Game tick
------------------------*/
function tick() {
  // apply buffered direction (if any)
  if (nextDir) {
    // ignore reverse if snake length > 1
    const head = snake[snake.length - 1];
    // Prevent immediate reverse:
    if (!(dir.x === -nextDir.x && dir.y === -nextDir.y && snake.length > 1)) {
      dir = nextDir;
    }
    nextDir = null;
  }

  // if dir is zero (not moved yet), don't advance
  if (dir.x === 0 && dir.y === 0) return;

  const head = snake[snake.length - 1];
  let nx = head.x + dir.x;
  let ny = head.y + dir.y;

  if (wrap) {
    // wrap around edges
    if (nx < 0) nx = grid - 1;
    if (nx >= grid) nx = 0;
    if (ny < 0) ny = grid - 1;
    if (ny >= grid) ny = 0;
  } else {
    // wall collision check
    if (nx < 0 || nx >= grid || ny < 0 || ny >= grid) {
      return doGameOver();
    }
  }

  // self collision
  if (snake.some(s => s.x === nx && s.y === ny)) {
    return doGameOver();
  }

  // move
  snake.push({ x: nx, y: ny });

  // food?
  if (food && nx === food.x && ny === food.y) {
    score++;
    spawnEatParticles(nx, ny);
    updateScore();
    placeFood();
    // speed up slightly
    speed = Math.min(CONFIG.MAX_SPEED, +(speed + CONFIG.SPEED_STEP).toFixed(3));
  } else {
    // normal move: remove tail
    snake.shift();
  }

  // if food became null (filled board) -> win / game over
  if (!food) {
    return doGameOver(true);
  }
}

/* -----------------------
   Game over
------------------------*/
function doGameOver(win = false) {
  running = false;
  over = true;
  overlay.style.pointerEvents = 'auto';
  overPanel.hidden = false;
  startPanel.hidden = true;
  finalScoreEl.textContent = score;
  // update best
  if (score > best) {
    best = score;
    localStorage.setItem('fluffy_snake_best', String(best));
    bestEl.textContent = best;
  }
}

/* -----------------------
   Score update
------------------------*/
function updateScore() {
  scoreEl.textContent = score;
  bestEl.textContent = best;
}

/* -----------------------
   Rendering
------------------------*/
function render() {
  // clear with soft background
  const w = canvas.width / (window.devicePixelRatio || 1);
  const h = canvas.height / (window.devicePixelRatio || 1);

  ctx.clearRect(0, 0, w, h);

  // draw soft grid background (subtle)
  drawBackground(w, h);

  // compute cellSize in css pixels
  setGridBasedOnSize();
  cellSize = (parseFloat(getComputedStyle(canvas).width)) / grid;

  // draw food
  if (food) {
    drawCellEmoji(food.x, food.y, CONFIG.HEART_EMOJI);
  }

  // draw snake shadow (fuzzy)
  for (let i = 0; i < snake.length; i++) {
    const t = i / Math.max(1, snake.length - 1);
    const part = snake[i];
    const px = part.x * cellSize;
    const py = part.y * cellSize;
    const pad = cellSize * CONFIG.CELL_PADDING;
    // shadow / fluff behind
    ctx.save();
    ctx.globalAlpha = 0.18 * (1 - t * 0.6);
    ctx.fillStyle = '#ffe6f0';
    roundRect(ctx, px + pad, py + pad, cellSize - pad * 2, cellSize - pad * 2, (cellSize - pad * 2) * 0.35);
    ctx.filter = 'blur(6px)';
    ctx.fill();
    ctx.restore();
  }

  // draw snake body with gradient colors
  for (let i = 0; i < snake.length; i++) {
    const t = i / Math.max(1, snake.length - 1);
    const part = snake[i];
    drawSnakeSegment(part.x, part.y, t, i === snake.length - 1);
  }

  // draw particles
  renderParticles();

  // subtle vignette
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(255,255,255,0.02)');
  g.addColorStop(1, 'rgba(8,12,20,0.02)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

function drawBackground(w, h) {
  // soft rounded rect background inside canvas
  const pad = 6;
  const r = 18;
  ctx.save();
  ctx.fillStyle = '#fefcff';
  roundRect(ctx, pad, pad, w - pad * 2, h - pad * 2, r);
  ctx.fill();

  // faint polka dots for fluff
  ctx.globalAlpha = 0.06;
  for (let i = 0; i < 50; i++) {
    const rx = Math.random() * w;
    const ry = Math.random() * h;
    const rad = Math.random() * 8 + 4;
    ctx.beginPath();
    ctx.fillStyle = '#ffd7ea';
    ctx.arc(rx, ry, rad, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawSnakeSegment(x, y, t, isHead) {
  const px = x * cellSize;
  const py = y * cellSize;
  const pad = cellSize * CONFIG.CELL_PADDING;
  const size = cellSize - pad * 2;
  // gradient color across body
  const g = ctx.createLinearGradient(px, py, px + size, py + size);
  // pick colors by t
  const colors = [
    ['#ffd6e0', '#ff8fab'],
    ['#fff1c9', '#ffd67a'],
    ['#cffff8', '#9be7ff'],
    ['#e9ffd6', '#c7ffb5']
  ];
  const pair = colors[Math.floor(t * (colors.length - 0.001))];
  g.addColorStop(0, pair[0]);
  g.addColorStop(1, pair[1]);
  ctx.save();
  // shadow & rounded
  ctx.fillStyle = g;
  ctx.shadowColor = 'rgba(16,24,40,0.12)';
  ctx.shadowBlur = isHead ? 10 : 6;
  roundRect(ctx, px + pad, py + pad, size, size, size * 0.38);
  ctx.fill();

  // little glossy highlight
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  roundRect(ctx, px + pad + size * 0.08, py + pad + size * 0.06, size * 0.36, size * 0.22, size * 0.12);
  ctx.fill();

  ctx.restore();
}

function drawCellEmoji(x, y, emoji) {
  const px = x * cellSize;
  const py = y * cellSize;
  const pad = cellSize * 0.12;
  const size = cellSize - pad * 2;
  ctx.save();
  // background round
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  roundRect(ctx, px + pad, py + pad, size, size, size * 0.28);
  ctx.fill();
  // emoji centered
  ctx.font = `${Math.floor(size * 0.8)}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, px + cellSize / 2, py + cellSize / 2 + size * 0.03);
  ctx.restore();
}

/* -----------------------
   Particles (fluffy)
------------------------*/
function spawnEatParticles(gridX, gridY) {
  const cx = gridX * cellSize + cellSize / 2;
  const cy = gridY * cellSize + cellSize / 2;
  const count = 14;
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 1.4 + 0.6;
    particles.push({
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 0.6,
      life: Math.random() * 700 + 400,
      size: Math.random() * cellSize * 0.15 + cellSize * 0.06,
      color: pickParticleColor()
    });
  }
}

function pickParticleColor() {
  const pal = ['#ffb6d0', '#ffd8a8', '#bff3ff', '#d7ffd2', '#fff1f8'];
  return pal[Math.floor(Math.random() * pal.length)];
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    p.vy += 0.002 * dt; // gravity-ish
    p.x += p.vx * dt * 0.02;
    p.y += p.vy * dt * 0.02;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

function renderParticles() {
  for (const p of particles) {
    ctx.save();
    const alpha = Math.max(0, Math.min(1, p.life / 1000));
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.ellipse(p.x - 0, p.y - 0, p.size, p.size * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

/* -----------------------
   Helpers
------------------------*/
function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/* -----------------------
   Buttons
------------------------*/
startBtn.addEventListener('click', () => {
  resetGame();
  startGame();
  overlay.style.pointerEvents = 'none';
});
retryBtn.addEventListener('click', () => {
  resetGame();
  startGame();
  overlay.style.pointerEvents = 'none';
});
homeBtn.addEventListener('click', () => {
  resetGame();
  overlay.style.pointerEvents = 'auto';
  startPanel.hidden = false;
  overPanel.hidden = true;
});
wrapToggle.addEventListener('change', (e) => {
  wrap = e.target.checked;
});

/* -----------------------
   Init
------------------------*/
resetGame();
render();

/* For playtesting convenience: expose some functions in window (optional) */
window._fluffy = {
  reset: resetGame,
  start: startGame,
  getState: () => ({ score, best, snakeLength: snake.length, running, over })
};
