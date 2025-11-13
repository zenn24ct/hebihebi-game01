/* Fluffy Snake — script.js (items + bombs版)
   - 複数アイテム（得点）と爆弾（即死）を追加
   - カラフル / ふわふわ演出のまま
   - No sound
*/

/* -----------------------
   Config
------------------------*/
const CONFIG = {
  GRID: 20,
  BASE_SPEED: 6,
  SPEED_STEP: 0.25,
  MAX_SPEED: 18,
  CELL_PADDING: 0.12,
  // アイテム定義:
  //  - emoji: 表示
  //  - score: 加点（爆弾は0）
  //  - weight: 出現確率の重み（高いほど出やすい）
  //  - isLethal: true => 衝突で即ゲームオーバー
  ITEM_TYPES: [
    { id: 'strawberry', emoji: '🍓', score: 1, weight: 40, isLethal: false, particlePalette: ['#ffb6d0','#fff1f8'] },
    { id: 'cherry',     emoji: '🍒', score: 2, weight: 25, isLethal: false, particlePalette: ['#ffd8a8','#ffb6d0'] },
    { id: 'apple',      emoji: '🍎', score: 3, weight: 12, isLethal: false, particlePalette: ['#ffd8a8','#fff1f8'] },
    { id: 'star',       emoji: '🌟', score: 5, weight: 5,  isLethal: false, particlePalette: ['#fff1a8','#ffd67a'] },
    // 爆弾
    { id: 'bomb',       emoji: '💣', score: 0, weight: 18, isLethal: true,  particlePalette: ['#ff9b9b','#ff4d4d'] }
  ],
  MAX_ITEMS: 3,       // 同時に置くアイテム数
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
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const size = Math.min(680, Math.min(window.innerWidth - 80, window.innerHeight - 220));
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  canvas.width = Math.floor(size * dpr);
  canvas.height = Math.floor(size * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', fitCanvas);
fitCanvas();

/* -----------------------
   Game state
------------------------*/
let grid = CONFIG.GRID;
let cellSize = 0;
let snake = [];
let dir = { x: 1, y: 0 };
let nextDir = null;
let items = []; // [{x,y,typeId}]
let score = 0;
let best = parseInt(localStorage.getItem('fluffy_snake_best') || '0', 10) || 0;
let running = false;
let over = false;
let wrap = false;
let speed = CONFIG.BASE_SPEED;

let lastTick = 0;
let tickInterval = 1000 / speed;
let accumulator = 0;

/* particles */
let particles = [];

bestEl.textContent = best;

/* -----------------------
   Utilities
------------------------*/
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function weightedChoice(arr) {
  const total = arr.reduce((s, a) => s + (a.weight || 0), 0);
  let r = Math.random() * total;
  for (const a of arr) {
    if (r < a.weight) return a;
    r -= a.weight;
  }
  return arr[arr.length - 1];
}
function setGridBasedOnSize() {
  const widthPx = parseFloat(getComputedStyle(canvas).width);
  if (widthPx <= 320) grid = Math.max(12, CONFIG.GRID - 6);
  else if (widthPx <= 480) grid = Math.max(16, CONFIG.GRID - 4);
  else grid = CONFIG.GRID;
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
  snake.push({ x: startX - 1, y: startY });
  snake.push({ x: startX, y: startY });
  snake.push({ x: startX + 1, y: startY });
  dir = { x: 0, y: 0 };
  nextDir = null;
  score = 0;
  speed = CONFIG.BASE_SPEED;
  tickInterval = 1000 / speed;
  particles = [];
  items = [];
  spawnInitialItems();
  running = false;
  over = false;
  updateScore();
  overlay.style.pointerEvents = 'auto';
  startPanel.hidden = false;
  overPanel.hidden = true;
  finalScoreEl.textContent = '0';
}

/* -----------------------
   Item placement / spawn
------------------------*/
function spawnInitialItems() {
  // spawn up to MAX_ITEMS
  for (let i = 0; i < CONFIG.MAX_ITEMS; i++) spawnOneItem();
}

function spawnOneItem() {
  // find free cells
  const occupied = new Set(snake.map(s => `${s.x},${s.y}`));
  for (const it of items) occupied.add(`${it.x},${it.y}`);
  const freeCells = [];
  for (let x = 0; x < grid; x++) {
    for (let y = 0; y < grid; y++) {
      const key = `${x},${y}`;
      if (!occupied.has(key)) freeCells.push({ x, y });
    }
  }
  if (freeCells.length === 0) return null;
  const pos = freeCells[randInt(0, freeCells.length - 1)];
  const type = weightedChoice(CONFIG.ITEM_TYPES);
  items.push({ x: pos.x, y: pos.y, typeId: type.id });
  return pos;
}

function respawnIfNeeded() {
  // keep items count up to MAX_ITEMS with some chance
  while (items.length < CONFIG.MAX_ITEMS) {
    spawnOneItem();
  }
}

/* get item type object from id */
function getItemTypeById(id) {
  return CONFIG.ITEM_TYPES.find(t => t.id === id) || CONFIG.ITEM_TYPES[0];
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
    running = !running;
    if (running) lastTick = performance.now();
  }
});

function queueDirection(nd) {
  const cur = dir;

  // If game hasn't started (dir is zero), reject moves that would
  // immediately collide with the snake body (prevents instant death).
  if (cur.x === 0 && cur.y === 0) {
    // compute where the head would move
    const head = snake[snake.length - 1];
    const nx = head.x + nd.x;
    const ny = head.y + nd.y;
    // if the target cell is occupied by any snake segment, ignore this input
    const wouldCollide = snake.some(s => s.x === nx && s.y === ny);
    if (wouldCollide) {
      // ignore dangerous initial move
      return;
    }
    // otherwise accept it as the buffered direction
    nextDir = nd;
    return;
  }

  // Normal gameplay: ignore immediate reverse
  if (nd.x === -cur.x && nd.y === -cur.y) return;
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
  if (Math.max(adx, ady) < 20) return;
  let nd = null;
  if (adx > ady) nd = dx > 0 ? { x: 1, y: 0 } : { x: -1, y: 0 };
  else nd = dy > 0 ? { x: 0, y: 1 } : { x: 0, y: -1 };
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
    render();
    return;
  }
  const dt = now - lastTick;
  lastTick = now;
  accumulator += dt;
  tickInterval = 1000 / speed;
  while (accumulator >= tickInterval) {
    tick();
    accumulator -= tickInterval;
  }
  updateParticles(dt);
  // occasionally respawn items (slight chance each frame)
  if (Math.random() < 0.005) respawnIfNeeded();
  render();
  if (!over) requestAnimationFrame(loop);
}

/* -----------------------
   Game tick
------------------------*/
function tick() {
  if (nextDir) {
    if (!(dir.x === -nextDir.x && dir.y === -nextDir.y && snake.length > 1)) {
      dir = nextDir;
    }
    nextDir = null;
  }
  if (dir.x === 0 && dir.y === 0) return;

  const head = snake[snake.length - 1];
  let nx = head.x + dir.x;
  let ny = head.y + dir.y;

  if (wrap) {
    if (nx < 0) nx = grid - 1;
    if (nx >= grid) nx = 0;
    if (ny < 0) ny = grid - 1;
    if (ny >= grid) ny = 0;
  } else {
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

  // check if we stepped on an item
  const idx = items.findIndex(it => it.x === nx && it.y === ny);
  if (idx !== -1) {
    const it = items[idx];
    const type = getItemTypeById(it.typeId);
    if (type.isLethal) {
      // bomb: explode particles and game over
      spawnBombParticles(nx, ny, type.particlePalette);
      // remove the bomb from map before game over
      items.splice(idx, 1);
      return doGameOver();
    } else {
      // normal food
      score += type.score;
      spawnItemParticles(nx, ny, type.particlePalette);
      items.splice(idx, 1);
      updateScore();
      // speed up slightly
      speed = Math.min(CONFIG.MAX_SPEED, +(speed + CONFIG.SPEED_STEP).toFixed(3));
      // try to spawn a replacement (maintain count)
      respawnIfNeeded();
    }
  } else {
    // normal move: remove tail
    snake.shift();
  }

  // if board full
  if (snake.length >= grid * grid) {
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
  const w = canvas.width / (window.devicePixelRatio || 1);
  const h = canvas.height / (window.devicePixelRatio || 1);
  ctx.clearRect(0, 0, w, h);

  drawBackground(w, h);

  setGridBasedOnSize();
  cellSize = (parseFloat(getComputedStyle(canvas).width)) / grid;

  // draw items
  for (const it of items) {
    const type = getItemTypeById(it.typeId);
    if (type.isLethal) {
      // draw bomb with slightly different style
      drawCellEmoji(it.x, it.y, type.emoji, true);
    } else {
      drawCellEmoji(it.x, it.y, type.emoji, false);
    }
  }

  // draw snake shadow
  for (let i = 0; i < snake.length; i++) {
    const t = i / Math.max(1, snake.length - 1);
    const part = snake[i];
    const px = part.x * cellSize;
    const py = part.y * cellSize;
    const pad = cellSize * CONFIG.CELL_PADDING;
    ctx.save();
    ctx.globalAlpha = 0.18 * (1 - t * 0.6);
    ctx.fillStyle = '#ffe6f0';
    roundRect(ctx, px + pad, py + pad, cellSize - pad * 2, cellSize - pad * 2, (cellSize - pad * 2) * 0.35);
    ctx.filter = 'blur(6px)';
    ctx.fill();
    ctx.restore();
  }

  // draw snake
  for (let i = 0; i < snake.length; i++) {
    const t = i / Math.max(1, snake.length - 1);
    const part = snake[i];
    drawSnakeSegment(part.x, part.y, t, i === snake.length - 1);
  }

  // particles
  renderParticles();

  // vignette
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
  const pad = 6;
  const r = 18;
  ctx.save();
  ctx.fillStyle = '#fefcff';
  roundRect(ctx, pad, pad, w - pad * 2, h - pad * 2, r);
  ctx.fill();
  ctx.globalAlpha = 0.06;
  // subtle repeated pattern for fluff (use seeded-ish randomness)
  for (let i = 0; i < 50; i++) {
    const rx = (i * 37) % w;
    const ry = (i * 59) % h;
    const rad = (i * 13) % 12 + 4;
    ctx.beginPath();
    ctx.fillStyle = ['#ffd7ea','#e8fff3','#fff6d9'][i % 3];
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
  const colors = [
    ['#ffd6e0', '#ff8fab'],
    ['#fff1c9', '#ffd67a'],
    ['#cffff8', '#9be7ff'],
    ['#e9ffd6', '#c7ffb5']
  ];
  const pair = colors[Math.floor(t * (colors.length - 0.001))];
  const g = ctx.createLinearGradient(px, py, px + size, py + size);
  g.addColorStop(0, pair[0]);
  g.addColorStop(1, pair[1]);
  ctx.save();
  ctx.fillStyle = g;
  ctx.shadowColor = 'rgba(16,24,40,0.12)';
  ctx.shadowBlur = isHead ? 10 : 6;
  roundRect(ctx, px + pad, py + pad, size, size, size * 0.38);
  ctx.fill();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  roundRect(ctx, px + pad + size * 0.08, py + pad + size * 0.06, size * 0.36, size * 0.22, size * 0.12);
  ctx.fill();
  ctx.restore();
}

function drawCellEmoji(x, y, emoji, isLethal = false) {
  const px = x * cellSize;
  const py = y * cellSize;
  const pad = cellSize * 0.12;
  const size = cellSize - pad * 2;
  ctx.save();
  if (isLethal) {
    // bomb: darker red-ish background
    ctx.fillStyle = 'rgba(255,245,245,0.95)';
    roundRect(ctx, px + pad, py + pad, size, size, size * 0.28);
    ctx.fill();
    // small red glow behind
    ctx.shadowColor = 'rgba(255,80,80,0.24)';
    ctx.shadowBlur = 10;
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    roundRect(ctx, px + pad, py + pad, size, size, size * 0.28);
    ctx.fill();
  }
  // emoji
  ctx.font = `${Math.floor(size * 0.78)}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, px + cellSize / 2, py + cellSize / 2 + size * 0.03);
  ctx.restore();
}

/* -----------------------
   Particles
------------------------*/
function spawnItemParticles(gridX, gridY, palette = ['#ffb6d0','#ffd8a8']) {
  const cx = gridX * cellSize + cellSize / 2;
  const cy = gridY * cellSize + cellSize / 2;
  const count = 12;
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 1.6 + 0.6;
    particles.push({
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 0.6,
      life: Math.random() * 700 + 400,
      size: Math.random() * cellSize * 0.14 + cellSize * 0.04,
      color: palette[Math.floor(Math.random()*palette.length)]
    });
  }
}

function spawnBombParticles(gridX, gridY, palette = ['#ff9b9b','#ff4d4d']) {
  const cx = gridX * cellSize + cellSize / 2;
  const cy = gridY * cellSize + cellSize / 2;
  const count = 22;
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 2.6 + 0.8;
    particles.push({
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 0.8,
      life: Math.random() * 900 + 300,
      size: Math.random() * cellSize * 0.18 + cellSize * 0.06,
      color: palette[Math.floor(Math.random()*palette.length)]
    });
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    p.vy += 0.002 * dt;
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
    ctx.ellipse(p.x, p.y, p.size, p.size * 0.8, 0, 0, Math.PI * 2);
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

window._fluffy = {
  reset: resetGame,
  start: startGame,
  getState: () => ({ score, best, snakeLength: snake.length, running, over, items })
};
