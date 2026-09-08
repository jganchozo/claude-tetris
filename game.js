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
];

const LINE_SCORES = [0, 100, 300, 500, 800];

/* ------------------------------------------------------------------
 * Skins (temas visuales)
 *
 * Cada skin aporta dos cosas:
 *   - colors:    su propia paleta, con la MISMA forma que COLORS
 *                (base 1, null en el indice 0, indices 1-8 cubiertos).
 *   - drawBlock: su propia funcion de dibujo de bloque.
 * Opcionalmente boardBg (fondo de los canvas) y gridLine (color de la
 * rejilla); si valen null se usa la variable CSS del tema claro/oscuro,
 * de modo que skins y tema claro/oscuro siguen siendo independientes.
 *
 * Anadir una quinta skin = anadir una entrada aqui y una <option> en
 * index.html. Nada mas.
 * ---------------------------------------------------------------- */

const DEFAULT_SKIN = 'retro';
const SKIN_STORAGE_KEY = 'tetris-skin';

function roundedRectPath(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath();
  if (typeof g.roundRect === 'function') {
    g.roundRect(x, y, w, h, r);
    return;
  }
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

// --- Retro: bloques cuadrados y colores planos (el aspecto original) ---
function drawBlockRetro(g, px, py, size, color) {
  g.fillStyle = color;
  g.fillRect(px + 1, py + 1, size - 2, size - 2);
  g.fillStyle = themeHighlightColor;
  g.fillRect(px + 1, py + 1, size - 2, 4);
}

// --- Neon: contorno brillante con glow (shadowBlur) sobre fondo negro ---
function drawBlockNeon(g, px, py, size, color) {
  const a = g.globalAlpha;
  g.shadowColor = color;
  g.shadowBlur = Math.max(3, 12 * a);
  g.globalAlpha = a * 0.22;
  g.fillStyle = color;
  g.fillRect(px + 2, py + 2, size - 4, size - 4);
  g.globalAlpha = a;
  g.strokeStyle = color;
  g.lineWidth = 2;
  g.strokeRect(px + 3, py + 3, size - 6, size - 6);
  // shadowBlur es estado pegajoso del canvas: hay que apagarlo siempre
  g.shadowBlur = 0;
  g.shadowColor = 'rgba(0, 0, 0, 0)';
  g.lineWidth = 1;
}

// --- Pastel: colores suaves y esquinas redondeadas ---
function drawBlockPastel(g, px, py, size, color) {
  const a = g.globalAlpha;
  const r = Math.max(3, size * 0.24);
  roundedRectPath(g, px + 2, py + 2, size - 4, size - 4, r);
  g.fillStyle = color;
  g.fill();
  g.globalAlpha = a * 0.55;
  roundedRectPath(g, px + 5, py + 5, size - 10, (size - 10) * 0.34, r * 0.6);
  g.fillStyle = 'rgba(255, 255, 255, 0.8)';
  g.fill();
  g.globalAlpha = a;
}

const PIXEL_LIGHT_DOTS = [[1, 2], [2, 1], [3, 3], [4, 2], [2, 4]];
const PIXEL_DARK_DOTS = [[1, 4], [3, 1], [4, 4], [1, 1]];

// --- Pixel art: bisel de 8 bits y textura de pixeles sobre el bloque ---
function drawBlockPixel(g, px, py, size, color) {
  // u = 1/6 de la celda: los puntos de textura llegan hasta 5u, nunca se salen.
  const u = Math.max(1, Math.floor(size / 6));
  g.fillStyle = color;
  g.fillRect(px, py, size, size);
  g.fillStyle = 'rgba(255, 255, 255, 0.45)';
  g.fillRect(px, py, size, u);
  g.fillRect(px, py, u, size);
  g.fillStyle = 'rgba(0, 0, 0, 0.38)';
  g.fillRect(px, py + size - u, size, u);
  g.fillRect(px + size - u, py, u, size);
  g.fillStyle = 'rgba(255, 255, 255, 0.22)';
  for (const d of PIXEL_LIGHT_DOTS) g.fillRect(px + d[0] * u, py + d[1] * u, u, u);
  g.fillStyle = 'rgba(0, 0, 0, 0.22)';
  for (const d of PIXEL_DARK_DOTS) g.fillRect(px + d[0] * u, py + d[1] * u, u, u);
}

const SKINS = {
  retro: {
    label: 'Retro',
    colors: COLORS,
    boardBg: null,
    gridLine: null,
    drawBlock: drawBlockRetro,
  },
  neon: {
    label: 'Neón',
    colors: [
      null,
      '#00f0ff', // I
      '#fff23a', // O
      '#c04dff', // T
      '#39ff14', // S
      '#ff2d55', // Z
      '#3d7bff', // J
      '#ff9d00', // L
      '#ff4fd8', // anillo 3x3
    ],
    boardBg: '#04040a',
    gridLine: 'rgba(120, 120, 200, 0.18)',
    drawBlock: drawBlockNeon,
  },
  pastel: {
    label: 'Pastel',
    colors: [
      null,
      '#a8dde0', // I
      '#ffe6a7', // O
      '#d9bdea', // T
      '#bde7c4', // S
      '#f7bcbc', // Z
      '#bacdf2', // J
      '#ffd5ab', // L
      '#f6c3de', // anillo 3x3
    ],
    boardBg: null,
    gridLine: null,
    drawBlock: drawBlockPastel,
  },
  pixel: {
    label: 'Pixel art',
    colors: [
      null,
      '#2fb6c9', // I
      '#e0bc2b', // O
      '#9b4fc4', // T
      '#48ad5e', // S
      '#cc4145', // Z
      '#3f6fce', // J
      '#d97f22', // L
      '#cf4f8c', // anillo 3x3
    ],
    boardBg: null,
    gridLine: null,
    drawBlock: drawBlockPixel,
  },
};

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
const skinSelect = document.getElementById('skin-select');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let skin = SKINS[DEFAULT_SKIN];
// Colores del tema cacheados: getComputedStyle por bloque seria demasiado
// caro, y solo cambian al cambiar de tema claro/oscuro.
let themeGridColor = '';
let themeHighlightColor = '';

function getThemeColor(name) {
  return getComputedStyle(document.body).getPropertyValue(name).trim();
}

function refreshThemeColors() {
  themeGridColor = getThemeColor('--grid-line');
  themeHighlightColor = getThemeColor('--block-highlight');
}

function applyTheme(theme) {
  document.body.classList.toggle('light', theme === 'light');
  themeToggleBtn.textContent = theme === 'light' ? '☀️' : '🌙';
  localStorage.setItem('tetris-theme', theme);
  refreshThemeColors();
  if (current) {
    draw();
    drawNext();
  }
}

function toggleTheme() {
  const isLight = document.body.classList.contains('light');
  applyTheme(isLight ? 'dark' : 'light');
}

function buildSkinOptions() {
  for (const name of Object.keys(SKINS)) {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = SKINS[name].label;
    skinSelect.appendChild(option);
  }
}

function applySkin(name) {
  if (!Object.prototype.hasOwnProperty.call(SKINS, name)) name = DEFAULT_SKIN;
  skin = SKINS[name];
  document.body.dataset.skin = name;
  // Fondo propio de la skin; cadena vacia = vuelve al color del tema (CSS).
  canvas.style.background = skin.boardBg || '';
  nextCanvas.style.background = skin.boardBg || '';
  if (skinSelect.value !== name) skinSelect.value = name;
  localStorage.setItem(SKIN_STORAGE_KEY, name);
  // Repintado inmediato: la skin cambia tambien con el juego en pausa,
  // cuando el bucle de rAF no esta corriendo.
  if (current) {
    draw();
    drawNext();
  }
}

themeToggleBtn.addEventListener('click', toggleTheme);
skinSelect.addEventListener('change', () => {
  applySkin(skinSelect.value);
  // Devuelve el foco al documento: un <select> enfocado se comeria las
  // flechas y la P del juego.
  skinSelect.blur();
});
buildSkinOptions();
applyTheme(localStorage.getItem('tetris-theme') === 'light' ? 'light' : 'dark');
applySkin(localStorage.getItem(SKIN_STORAGE_KEY) || DEFAULT_SKIN);

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * (PIECES.length - 1)) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
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

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = skin.colors[colorIndex] || COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  skin.drawBlock(context, x * size, y * size, size, color);
  // Estado del canvas siempre limpio tras cada bloque, pase lo que pase
  // dentro de la skin (el glow de Neon si no se sangraria por todas partes).
  context.globalAlpha = 1;
  context.shadowBlur = 0;
  context.shadowColor = 'rgba(0, 0, 0, 0)';
}

function drawGrid() {
  ctx.strokeStyle = skin.gridLine || themeGridColor;
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
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

const GAME_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'KeyX', 'KeyP'];

document.addEventListener('keydown', e => {
  if (e.target === skinSelect) {
    // El selector de skin no debe robar las teclas del juego (las flechas
    // cambiarian de skin); el resto de teclas (Tab, Enter...) siguen siendo suyas.
    if (!GAME_KEYS.includes(e.code)) return;
    e.preventDefault();
    skinSelect.blur();
  }
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
