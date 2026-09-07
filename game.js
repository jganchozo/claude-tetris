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
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const HS_KEY = 'tetris-highscores';
const BEST_COMBO_KEY = 'tetris-best-combo';
const BEST_LINES_KEY = 'tetris-best-lines';

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const comboEl = document.getElementById('combo');
const highscoreListEl = document.getElementById('highscore-list');
const bestComboEl = document.getElementById('best-combo');
const bestLinesEl = document.getElementById('best-lines');
const clearScoresBtn = document.getElementById('clear-scores-btn');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const overlayHighscoresEl = document.getElementById('overlay-highscores');
const saveScoreForm = document.getElementById('save-score-form');
const playerNameInput = document.getElementById('player-name-input');
const saveScoreBtn = document.getElementById('save-score-btn');
const restartBtn = document.getElementById('restart-btn');
const themeToggleBtn = document.getElementById('theme-toggle');

let board, current, next, score, lines, level, combo, maxCombo, pendingScore, paused, gameOver, lastTime, dropAccum, dropInterval, animId;

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

function sortHighscores(list) {
  // Score desc; ties broken by most recent date first, so a new entry that
  // ties the current last-place score can actually claim the slot instead
  // of always losing a stable sort to the older entry.
  return list.slice().sort((a, b) => b.score - a.score || (b.date || '').localeCompare(a.date || ''));
}

function normalizeHighscoreEntry(e) {
  if (!e || typeof e !== 'object' || !Number.isFinite(e.score)) return null;
  return {
    name: typeof e.name === 'string' && e.name ? e.name : 'Anónimo',
    score: e.score,
    lines: Number.isFinite(e.lines) ? e.lines : 0,
    combo: Number.isFinite(e.combo) ? e.combo : 0,
    date: typeof e.date === 'string' ? e.date : '',
  };
}

function loadHighscores() {
  try {
    const raw = localStorage.getItem(HS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Defensively drop/normalize malformed entries (manual edits, schema
    // drift) so a bad record can't crash rendering elsewhere.
    return sortHighscores(parsed.map(normalizeHighscoreEntry).filter(Boolean));
  } catch (e) {
    return [];
  }
}

function saveHighscoresList(list) {
  try {
    localStorage.setItem(HS_KEY, JSON.stringify(list));
  } catch (e) {
    // localStorage no disponible o llena: ignorar
  }
}

function loadBestStat(key) {
  try {
    const value = parseInt(localStorage.getItem(key), 10);
    return Number.isFinite(value) ? value : 0;
  } catch (e) {
    return 0;
  }
}

function updateBestStat(key, value) {
  try {
    if (value > loadBestStat(key)) {
      localStorage.setItem(key, String(value));
    }
  } catch (e) {
    // ignorar
  }
}

function sanitizeName(name) {
  const trimmed = String(name || '').trim().slice(0, 12);
  return trimmed || 'Anónimo';
}

function renderHighscoreListEl(el, list, highlightIndex) {
  el.innerHTML = '';
  if (!list.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'Sin récords';
    el.appendChild(li);
    return;
  }
  list.forEach((entry, i) => {
    const li = document.createElement('li');
    if (i === highlightIndex) li.classList.add('highlight');
    const nameSpan = document.createElement('span');
    nameSpan.className = 'hs-name';
    const label = entry.pending ? '···' : (entry.name || 'Anónimo');
    nameSpan.textContent = `${i + 1}. ${label}`;
    const scoreSpan = document.createElement('span');
    scoreSpan.textContent = entry.score.toLocaleString();
    li.appendChild(nameSpan);
    li.appendChild(scoreSpan);
    el.appendChild(li);
  });
}

function refreshHighscorePanel(list) {
  // Accepts an already-loaded list to avoid a redundant localStorage
  // read + JSON.parse when the caller just computed it; falls back to a
  // fresh load otherwise (e.g. on init()).
  renderHighscoreListEl(highscoreListEl, list || loadHighscores(), -1);
  bestComboEl.textContent = loadBestStat(BEST_COMBO_KEY);
  bestLinesEl.textContent = loadBestStat(BEST_LINES_KEY);
}

function saveCurrentScore() {
  if (!pendingScore) return;
  const entry = {
    name: sanitizeName(playerNameInput.value),
    score: pendingScore.score,
    lines: pendingScore.lines,
    combo: pendingScore.combo,
    date: new Date().toISOString(),
  };
  const list = sortHighscores(loadHighscores().concat(entry)).slice(0, 5);
  saveHighscoresList(list);
  renderHighscoreListEl(overlayHighscoresEl, list, list.indexOf(entry));
  refreshHighscorePanel(list);
  saveScoreForm.classList.add('hidden');
  pendingScore = null;
}

clearScoresBtn.addEventListener('click', () => {
  const ok = confirm('¿Borrar todos los récords?');
  // confirm() blocks the JS thread; resync the drop clock so the game
  // doesn't take a giant unrequested step once the dialog closes.
  lastTime = performance.now();
  if (!ok) return;
  localStorage.removeItem(HS_KEY);
  localStorage.removeItem(BEST_COMBO_KEY);
  localStorage.removeItem(BEST_LINES_KEY);
  refreshHighscorePanel([]);
});

saveScoreBtn.addEventListener('click', saveCurrentScore);
playerNameInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') saveCurrentScore();
});

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 7) + 1;
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
    if (combo > maxCombo) maxCombo = combo;
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
  } else {
    combo = 0;
  }
  updateHUD();
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
  comboEl.textContent = combo;
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

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  updateBestStat(BEST_COMBO_KEY, maxCombo);
  updateBestStat(BEST_LINES_KEY, lines);

  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;

  const list = loadHighscores();
  const minScore = list.length ? list[list.length - 1].score : -Infinity;
  // >= so a score tying the current last place still gets a shot at the
  // slot (sortHighscores breaks the tie in favor of the newer entry).
  const qualifies = list.length < 5 || score >= minScore;

  if (qualifies) {
    pendingScore = { score, lines, combo: maxCombo };
    const candidate = { name: '', score, lines, combo: maxCombo, pending: true, date: new Date().toISOString() };
    const preview = sortHighscores(list.concat(candidate)).slice(0, 5);
    renderHighscoreListEl(overlayHighscoresEl, preview, preview.indexOf(candidate));
    saveScoreForm.classList.remove('hidden');
    playerNameInput.value = '';
  } else {
    pendingScore = null;
    renderHighscoreListEl(overlayHighscoresEl, list, -1);
    saveScoreForm.classList.add('hidden');
  }

  refreshHighscorePanel(list);
  overlay.classList.remove('hidden');
  if (qualifies) playerNameInput.focus();
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
  combo = 0;
  maxCombo = 0;
  pendingScore = null;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  refreshHighscorePanel();
  saveScoreForm.classList.add('hidden');
  overlayHighscoresEl.innerHTML = '';
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
