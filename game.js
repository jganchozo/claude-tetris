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
const menuBtn = document.getElementById('menu-btn');
const themeToggleBtn = document.getElementById('theme-toggle');
const startScreen = document.getElementById('start-screen');
const startBtn = document.getElementById('start-btn');
const resetRecordsBtn = document.getElementById('reset-records-btn');
const startRecordsEl = document.getElementById('start-records');
const overlayRecordsEl = document.getElementById('overlay-records');
const nameForm = document.getElementById('name-form');
const nameInput = document.getElementById('name-input');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let combo = 0, bestCombo = 0;
let highlightIndex = -1;
let inMenu = true;

function getThemeColor(name) {
  return getComputedStyle(document.body).getPropertyValue(name).trim();
}

// localStorage puede lanzar (navegación privada, cookies bloqueadas, iframe
// restringido). Nunca debe abortar la carga del script.
function readStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch (e) {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    /* almacenamiento lleno o deshabilitado: el juego sigue funcionando */
  }
}

function applyTheme(theme) {
  document.body.classList.toggle('light', theme === 'light');
  themeToggleBtn.textContent = theme === 'light' ? '☀️' : '🌙';
  writeStorage('tetris-theme', theme);
  redrawAll();
}

function toggleTheme() {
  const isLight = document.body.classList.contains('light');
  applyTheme(isLight ? 'dark' : 'light');
}

themeToggleBtn.addEventListener('click', toggleTheme);
applyTheme(readStorage('tetris-theme') === 'light' ? 'light' : 'dark');

/* ---------- Tabla de récords (localStorage) ---------- */

const RECORDS_KEY = 'tetris-highscores';
const MAX_RECORDS = 5;
const MAX_NAME_LENGTH = 12;
const DEFAULT_NAME = 'Anónimo';

function emptyRecords() {
  return { scores: [], bestCombo: 0, maxLines: 0 };
}

function toSafeInt(value, max) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(Math.floor(n), max);
}

function sanitizeName(value) {
  const name = typeof value === 'string' ? value.trim().slice(0, MAX_NAME_LENGTH) : '';
  return name || DEFAULT_NAME;
}

// Nunca confiar en localStorage: puede estar corrupto o editado a mano.
function loadRecords() {
  const raw = readStorage(RECORDS_KEY);
  if (!raw) return emptyRecords();

  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    return emptyRecords();
  }
  if (!data || typeof data !== 'object') return emptyRecords();

  const scores = Array.isArray(data.scores) ? data.scores : [];
  const clean = scores
    .filter(entry => entry && typeof entry === 'object')
    .map(entry => ({
      name: sanitizeName(entry.name),
      score: toSafeInt(entry.score, Number.MAX_SAFE_INTEGER),
      lines: toSafeInt(entry.lines, 999999),
      level: Math.max(1, toSafeInt(entry.level, 9999)),
      combo: toSafeInt(entry.combo, 999999),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_RECORDS);

  return {
    scores: clean,
    bestCombo: toSafeInt(data.bestCombo, 999999),
    maxLines: toSafeInt(data.maxLines, 999999),
  };
}

function saveRecords(data) {
  writeStorage(RECORDS_KEY, JSON.stringify(data));
}

function qualifies(value) {
  const data = loadRecords();
  if (value <= 0) return false;
  if (data.scores.length < MAX_RECORDS) return true;
  return value > data.scores[data.scores.length - 1].score;
}

// Devuelve la posición (0-based) de la entrada recién insertada, o -1.
function addRecord(name, value, linesValue, levelValue, comboValue) {
  const data = loadRecords();
  const entry = {
    name: sanitizeName(name),
    score: toSafeInt(value, Number.MAX_SAFE_INTEGER),
    lines: toSafeInt(linesValue, 999999),
    level: Math.max(1, toSafeInt(levelValue, 9999)),
    combo: toSafeInt(comboValue, 999999),
  };
  data.scores.push(entry);
  data.scores.sort((a, b) => b.score - a.score);
  data.scores = data.scores.slice(0, MAX_RECORDS);
  saveRecords(data);
  return data.scores.indexOf(entry);
}

function updateStats(linesValue, comboValue) {
  const data = loadRecords();
  data.maxLines = Math.max(data.maxLines, toSafeInt(linesValue, 999999));
  data.bestCombo = Math.max(data.bestCombo, toSafeInt(comboValue, 999999));
  saveRecords(data);
}

function resetRecords() {
  try {
    localStorage.removeItem(RECORDS_KEY);
  } catch (e) {
    /* ignorar */
  }
  highlightIndex = -1;
  renderRecords();
}

// Construcción 100% con textContent: un nombre con HTML nunca se interpreta.
function buildRecordsTable(data, highlight) {
  const box = document.createDocumentFragment();

  const title = document.createElement('div');
  title.className = 'records-title';
  title.textContent = 'RÉCORDS';
  box.appendChild(title);

  if (data.scores.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'records-empty';
    empty.textContent = 'Todavía no hay récords. ¡Sé el primero!';
    box.appendChild(empty);
  } else {
    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    ['#', 'NOMBRE', 'PUNTOS', 'LÍNEAS'].forEach(text => {
      const th = document.createElement('th');
      th.textContent = text;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    data.scores.forEach((entry, i) => {
      const tr = document.createElement('tr');
      if (i === highlight) {
        tr.className = 'record-new';
        tr.title = 'Tu puntuación de esta partida';
      }
      const cells = [String(i + 1), entry.name, entry.score.toLocaleString(), String(entry.lines)];
      cells.forEach(text => {
        const td = document.createElement('td');
        td.textContent = text;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    box.appendChild(table);
  }

  const stats = document.createElement('div');
  stats.className = 'records-stats';
  const comboEl = document.createElement('span');
  comboEl.textContent = 'Mejor combo: ';
  const comboVal = document.createElement('b');
  comboVal.textContent = String(data.bestCombo);
  comboEl.appendChild(comboVal);
  const linesEl2 = document.createElement('span');
  linesEl2.textContent = 'Máx. líneas: ';
  const linesVal = document.createElement('b');
  linesVal.textContent = String(data.maxLines);
  linesEl2.appendChild(linesVal);
  stats.appendChild(comboEl);
  stats.appendChild(linesEl2);
  box.appendChild(stats);

  return box;
}

function renderRecords() {
  const data = loadRecords();
  startRecordsEl.textContent = '';
  startRecordsEl.appendChild(buildRecordsTable(data, highlightIndex));
  overlayRecordsEl.textContent = '';
  overlayRecordsEl.appendChild(buildRecordsTable(data, highlightIndex));
}

/* ---------- Juego ---------- */

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
    combo++;
    if (combo > bestCombo) bestCombo = combo;
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  } else {
    combo = 0;
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
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = getThemeColor('--block-highlight');
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
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

// Redibuja tablero y vista previa; también sirve en el menú (sin pieza activa).
function redrawAll() {
  if (!board) return;
  if (current) {
    draw();
  } else {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawGrid();
  }
  if (next) {
    drawNext();
  } else {
    nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  }
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);

  updateStats(lines, bestCombo);
  highlightIndex = -1;

  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent =
    `Puntuación: ${score.toLocaleString()} · Líneas: ${lines} · Combo máx.: ${bestCombo}`;

  const canSave = qualifies(score);
  nameInput.value = '';
  nameForm.classList.toggle('hidden', !canSave);
  overlayRecordsEl.classList.remove('hidden');
  menuBtn.classList.remove('hidden');
  renderRecords();
  overlay.classList.remove('hidden');
  if (canSave) nameInput.focus();
}

function showStartScreen() {
  cancelAnimationFrame(animId);
  inMenu = true;
  paused = false;
  gameOver = false;
  current = null;
  next = null;
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  combo = 0;
  bestCombo = 0;
  updateHUD();
  overlay.classList.add('hidden');
  startScreen.classList.remove('hidden');
  renderRecords();
  redrawAll();
}

function togglePause() {
  if (inMenu || gameOver) return;
  paused = !paused;
  if (!paused) {
    overlay.classList.add('hidden');
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    nameForm.classList.add('hidden');
    overlayRecordsEl.classList.add('hidden');
    menuBtn.classList.add('hidden');
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
  combo = 0;
  bestCombo = 0;
  highlightIndex = -1;
  paused = false;
  gameOver = false;
  inMenu = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  startScreen.classList.add('hidden');
  nameForm.classList.add('hidden');
  overlayRecordsEl.classList.add('hidden');
  menuBtn.classList.add('hidden');
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  // Mientras se escribe el nombre, el teclado no debe controlar la pieza.
  const el = document.activeElement;
  if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
  if (inMenu) return;
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

// Si la partida clasificó y el jugador sale sin pulsar «Guardar», la
// puntuación se guarda igualmente con el nombre escrito (o «Anónimo»).
// Devuelve la posición en la tabla, -1 si al final no entró en el top 5,
// o null si no había nada pendiente de guardar.
function commitPendingScore() {
  if (nameForm.classList.contains('hidden')) return null;
  nameForm.classList.add('hidden');
  // La tabla puede haber cambiado desde endGame() (por ejemplo, otra pestaña).
  if (!qualifies(score)) return -1;
  return addRecord(nameInput.value, score, lines, level, bestCombo);
}

function commitAndHighlight() {
  const index = commitPendingScore();
  if (index !== null) highlightIndex = index;
}

// Envoltorio: init() no debe recibir el Event del click como argumento.
restartBtn.addEventListener('click', () => {
  // init() reinicia el resaltado, así que aquí solo interesa persistir.
  commitPendingScore();
  init();
});
startBtn.addEventListener('click', () => init());
menuBtn.addEventListener('click', () => {
  commitAndHighlight();
  showStartScreen();
});

resetRecordsBtn.addEventListener('click', () => {
  if (window.confirm('¿Borrar todos los récords guardados?')) resetRecords();
});

nameForm.addEventListener('submit', e => {
  e.preventDefault();
  commitAndHighlight();
  renderRecords();
  restartBtn.focus();
});

showStartScreen();
