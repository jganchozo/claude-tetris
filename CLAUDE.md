# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Vanilla JavaScript Tetris rendered on HTML5 Canvas. No dependencies, no build step, no `package.json`, no tests. Three files: `index.html` (DOM + two canvases), `style.css` (dark arcade theme), `game.js` (all logic).

## Running

Just open `index.html` in a browser, or serve statically:

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

There is nothing to build, lint, or test.

## Architecture (`game.js`)

All state lives in module-scope `let` variables (`board`, `current`, `next`, `score`, `lines`, `level`, `dropInterval`, etc.). There is no class or module structure — functions read and mutate these globals directly.

Key conventions to know before editing:

- **Board model**: `ROWS × COLS` matrix; each cell is `0` (empty) or a color index `1–7`. The same index identifies the piece type and indexes into `COLORS` and `PIECES` (both are 1-based, with `null` at index 0).
- **Pieces** are square matrices; cells store the piece's own color index, not `1`. Rotation (`rotateCW`) builds a transposed/reversed copy; `tryRotate` applies SRS-style wall kicks by trying offsets `[0, -1, 1, -2, 2]`.
- **`collide(shape, x, y)`** is the single source of truth for legality — used for movement, rotation kicks, ghost projection (`ghostY`), drops, and spawn-time game-over detection. Negative `y` (above board) is allowed so pieces can spawn/rotate at the top.
- **Game loop** (`loop`) is `requestAnimationFrame`-driven, accumulating `dt` into `dropAccum` and stepping the piece down once per `dropInterval` ms. Pause cancels the rAF and restarts it via `togglePause`; `animId` holds the handle.
- **Locking flow**: `lockPiece` → `merge` (write piece into board) → `clearLines` → `spawn`. `spawn` promotes `next` to `current` and calls `endGame()` if the new piece already collides.
- **Scoring**: `LINE_SCORES[cleared] * level`; hard drop +2/cell, soft drop +1/row. Level rises every 10 lines and speed is `max(100, 1000 - (level-1)*90)`.

## Gotchas

- The board canvas size is hardcoded in `index.html` as `width="300" height="600"`. It must equal `COLS*BLOCK × ROWS*BLOCK` (10×30 × 20×30). If you change `COLS`, `ROWS`, or `BLOCK` in `game.js`, update the canvas attributes too.
- UI text and the README are in Spanish; match that language for user-facing strings.
- HUD is updated imperatively via `updateHUD()` — any code path that changes `score`/`lines`/`level` must call it (the keydown handler calls it after every keypress as a catch-all).
