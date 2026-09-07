'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#64b5f6', // J - pale blue
  '#ffb74d', // L - orange
  '#f06292', // O-ring - pink
  '#4db6ac', // + pentomino - teal
  '#a1887f', // U pentomino - brown
  '#9575cd', // Y pentomino - lavender
  '#ffd700', // single 1x1 bonus - gold
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[8,8,8],[8,0,8],[8,8,8]],                  // hollow 3x3 ring
  [[0,9,0],[9,9,9],[0,9,0]],                  // + pentomino
  [[10,0,10],[10,10,10],[0,0,0]],             // U pentomino
  [[0,11,0,0],[11,11,0,0],[0,11,0,0],[0,11,0,0]], // Y pentomino
  [[12]],                                     // single 1x1 (bonus tras un Tetris)
];

const LINE_SCORES = [0, 100, 300, 500, 800];

// Las 7 clásicas salen el 90% de las veces; el 10% restante se reparte
// entre las especiales. El 1x1 no entra en el sorteo: solo llega como
// recompensa tras un Tetris.
const STANDARD_TYPES = [1, 2, 3, 4, 5, 6, 7];
const SPECIAL_TYPES = [8, 9, 10, 11]; // 3x3 hueca, +, U, Y
const SINGLE_TYPE = 12;
const SPECIAL_CHANCE = 0.1;
const TOAST_MS = 1500;

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggleBtn = document.getElementById('theme-toggle');
const toastEl = document.getElementById('toast');
const skinSelect = document.getElementById('skin-select');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId, bonusPending, toastTimer;
let currentSkin = 'retro';

function getThemeColor(name) {
  return getComputedStyle(document.body).getPropertyValue(name).trim();
}

function applyTheme(theme) {
  document.body.classList.toggle('light', theme === 'light');
  themeToggleBtn.textContent = theme === 'light' ? '☀️' : '🌙';
  localStorage.setItem('tetris-theme', theme);
  if (current) {
    draw();
    drawNext();
  }
}

function toggleTheme() {
  const isLight = document.body.classList.contains('light');
  applyTheme(isLight ? 'dark' : 'light');
}

themeToggleBtn.addEventListener('click', toggleTheme);
applyTheme(localStorage.getItem('tetris-theme') === 'light' ? 'light' : 'dark');

// ---- Skins visuales ----
// Cada skin trae su propia paleta (paralela a COLORS, 1-based, 12 piezas)
// y su propio render de bloque, con la misma firma que drawBlock().

function drawBlockRetro(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = SKINS.retro.palette[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = getThemeColor('--block-highlight');
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawBlockNeon(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = SKINS.neon.palette[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.shadowColor = color;
  context.shadowBlur = size * 0.6 * (alpha ?? 1);
  context.fillStyle = color;
  context.fillRect(x * size + 2, y * size + 2, size - 4, size - 4);
  // el resplandor no debe filtrarse a la rejilla ni al resto del canvas
  context.shadowBlur = 0;
  context.shadowColor = 'transparent';
  context.fillStyle = getThemeColor('--block-highlight');
  context.fillRect(x * size + 2, y * size + 2, size - 4, 3);
  context.globalAlpha = 1;
}

function drawBlockPastel(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = SKINS.pastel.palette[colorIndex];
  const px = x * size + 2;
  const py = y * size + 2;
  const s = size - 4;
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  if (typeof context.roundRect === 'function') {
    context.beginPath();
    context.roundRect(px, py, s, s, size * 0.2);
    context.fill();
  } else {
    context.fillRect(px, py, s, s);
  }
  context.fillStyle = getThemeColor('--block-highlight');
  context.fillRect(px + 2, py + 2, s - 4, 4);
  context.globalAlpha = 1;
}

function drawBlockPixel(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = SKINS.pixel.palette[colorIndex];
  const px = x * size + 1;
  const py = y * size + 1;
  const s = size - 2;
  const p = Math.max(2, Math.floor(size / 8));
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(px, py, s, s);
  // textura de píxeles claros/oscuros en las esquinas
  context.fillStyle = 'rgba(255, 255, 255, 0.35)';
  context.fillRect(px, py, p, p);
  context.fillRect(px + s - p, py, p, p);
  context.fillStyle = 'rgba(0, 0, 0, 0.35)';
  context.fillRect(px, py + s - p, p, p);
  context.fillRect(px + s - p, py + s - p, p, p);
  context.globalAlpha = 1;
}

const SKINS = {
  retro: {
    palette: COLORS,
    render: drawBlockRetro,
  },
  neon: {
    palette: [null, '#00e5ff', '#ffea00', '#e040fb', '#00e676', '#ff1744', '#2979ff', '#ff9100', '#f50057', '#1de9b6', '#d500f9', '#651fff', '#ffd600'],
    render: drawBlockNeon,
  },
  pastel: {
    palette: [null, '#a8dadc', '#ffe8a3', '#d8b4e2', '#b5e5b8', '#f4a9a8', '#a9c6ed', '#f9c894', '#f6b8d0', '#b0e0d3', '#d8c3a5', '#c9b8e8', '#fff2a8'],
    render: drawBlockPastel,
  },
  pixel: {
    palette: [null, '#00fbff', '#f8d800', '#d800f8', '#00f800', '#f80000', '#0058f8', '#f87800', '#f800a0', '#00f8d8', '#a05800', '#7800f8', '#f8f800'],
    render: drawBlockPixel,
  },
};

function applySkin(name) {
  const skinName = SKINS[name] ? name : 'retro';
  currentSkin = skinName;
  Object.keys(SKINS).forEach(k => document.body.classList.toggle(`skin-${k}`, k === skinName));
  localStorage.setItem('tetris-skin', skinName);
  if (skinSelect) skinSelect.value = skinName;
  if (current) {
    draw();
    drawNext();
  }
}

if (skinSelect) {
  skinSelect.addEventListener('change', () => {
    applySkin(skinSelect.value);
    skinSelect.blur();
  });
  // Evita que las flechas usadas para navegar el <select> lleguen al
  // manejador global de teclado y muevan la pieza en juego.
  skinSelect.addEventListener('keydown', e => e.stopPropagation());
}
applySkin(localStorage.getItem('tetris-skin'));

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function makePiece(type) {
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function pick(types) {
  return types[Math.floor(Math.random() * types.length)];
}

function randomPiece() {
  if (bonusPending) {
    bonusPending = false;
    return makePiece(SINGLE_TYPE);
  }
  const pool = Math.random() < SPECIAL_CHANCE ? SPECIAL_TYPES : STANDARD_TYPES;
  return makePiece(pick(pool));
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
    if (cleared === 4) {
      bonusPending = true;
      showToast('¡TETRIS! Pieza bonus');
    }
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function showToast(text) {
  toastEl.textContent = text;
  toastEl.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.add('hidden'), TOAST_MS);
}

function hideToast() {
  clearTimeout(toastTimer);
  toastEl.classList.add('hidden');
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  (SKINS[currentSkin] || SKINS.retro).render(context, x, y, colorIndex, size, alpha);
}

function drawGrid() {
  ctx.strokeStyle = getThemeColor('--grid-line');
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  if (!gameOver && !paused) {
    animId = requestAnimationFrame(loop);
  }
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  bonusPending = false;
  lastTime = performance.now();
  hideToast();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

init();
