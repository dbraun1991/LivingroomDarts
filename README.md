# 🎯 Livingroom Darts

A lightweight darts scoring web app for living room tournaments.  
One phone scores, one laptop/TV displays the live burndown chart.

---

## What it does

- Up to 10 players, configurable starting score (301 / 501 / 701)
- Single Out or Double Out finish rule, selectable on the setup screen
- Dartboard-style numpad — numbers 1–20, Bull, Double, Triple, Miss
- Auto-advances to the next player after 3 darts (no confirm button needed)
- Unlimited undo — ⌫ on empty slots walks back through the entire game history
- Per-player colour coding: picked in setup, shown everywhere in both views
- Live burndown chart on the TV — updates within ~100ms over the same Wi-Fi
- Last 3 individual dart scores and running average shown per player in both views
- Live score countdown as each dart is entered

---

## Preview

<img src="docs/GameSetup_view.png" width="300" alt="Game Setup">
<img src="docs/InGame_view.png" width="300" alt="In Game">
<img src="docs/TV_preview.png" width="300" alt="TV Preview">
<img src="docs/TV_ingame.png" width="300" alt="TV In Game">

---

## Files

```
.
├── AGENTS.md
├── darts.css
├── darts.html
├── darts.js
├── docs
│   ├── GameSetup_view.png
│   ├── InGame_view.png
│   ├── TV_ingame.png
│   └── TV_preview.png
├── LICENSE
└── README.md
```

All three code files (`darts.html`, `darts.css`, `darts.js`) must sit in the same folder.

---

## Running locally

```bash
cd /path/to/LivingroomDarts
python3 -m http.server 8000
```

Then open in your browser:

| Device | URL |
|--------|-----|
| Phone (scoring) | `http://localhost:8000/darts.html` |
| TV / laptop (display) | `http://localhost:8000/darts.html?view=display` |

> The app cannot be opened as a plain `file://` URL — ES modules require HTTP.  
> The Python server above is all you need for local single-device play.

**Hard-reload after updating files:** `Cmd+Shift+R` (Mac) · `Ctrl+Shift+R` (Windows)

---

## Setup screen

1. Choose **Starting Score**: 301 / 501 / 701
2. Choose **Finish Rule**: Single Out or Double Out
3. Add players — each gets a randomly picked unique colour
4. Tap the **colour swatch** to open the 6×6 colour picker grid:
   - 6 columns: Red · Orange · Green · Cyan · Blue · Purple
   - 5 rows: Pastel → Light → Vivid → Dark → Very Dark
   - Bottom row: neutral greys + bright yellow
   - **?** tile picks a random unused colour automatically
5. Use **🔀 Randomize Order** to shuffle the throwing order
6. Tap **START GAME**

Players, colours, starting score, and finish rule are all remembered when returning from End Game.

---

## Scoring (phone view)

### Numpad layout

```
┌────┬────┬────┬────┬────┐
│  1 │  2 │  3 │  4 │  5 │
├────┼────┼────┼────┼────┤
│  6 │  7 │  8 │  9 │ 10 │
├────┼────┼────┼────┼────┤
│ 11 │ 12 │ 13 │ 14 │ 15 │
├────┼────┼────┼────┼────┤
│ 16 │ 17 │ 18 │ 19 │ 20 │
├────┼────┼────┼────┼────┤
│  O │ 25 │  D │  T │  ⌫ │
└────┴────┴────┴────┴────┘
```

| Button | Meaning |
|--------|---------|
| 1–20 | Single segment |
| O | Miss — 0 points, dart used |
| 25 | Single Bull (25 pts) |
| D | Double modifier — tap D, then a number (D+20 = 40) |
| T | Triple modifier — tap T, then a number (T+20 = 60) |
| D + 25 | Bullseye (50 pts) |
| ⌫ | Delete last entered dart |
| ⌫ on empty | Undo last visit, return to previous player |

D and T act as toggles — tap again to deactivate without entering a dart.

### Turn flow

1. Enter darts one at a time — the preview bar shows each dart and a running visit total
2. The score in the player strip and TV sidebar **counts down live** as each dart is entered
3. After the **3rd dart**, the visit commits automatically (~0.9s delay to show the result)
4. On a **bust**, a red banner flashes and the turn ends without subtracting (~1.5s delay)
5. A player reaching exactly **0** wins immediately — even on dart 1 or 2

### Bust rules

| Rule | Bust condition |
|------|---------------|
| Single Out | Visit total exceeds remaining score |
| Double Out | Visit total exceeds remaining score, **or** leaves exactly 1 remaining |

### Player strip

Below the numpad, all players are shown in throwing order. The active player's row is highlighted in their colour. Each row shows: name · last 3 individual dart scores (— if not yet thrown) · average · remaining score.

### End Game

The **⏹ End Game** button at the bottom returns to the setup screen. Player names and colours are remembered for the next game. The winner overlay is cleared on both devices.

---

## TV display (`?view=display`)

| Element | Description |
|---------|-------------|
| **Burndown chart** | One coloured line per player, score descending toward 0 as rounds progress. |
| **Standings sidebar** | Ranked by current score. Each row: position · name · last 3 individual dart scores · average (⌀) · remaining score (counts down live). Left border and score in player colour. Active player highlighted. |
| **Now Throwing** | Top-right header. Player name shown in their chosen colour. |
| **Round / Finish Rule** | Centre header. Shows current round number and Single/Double Out badge. |
| **Waiting overlay** | Shown when no game is active — animated dart icon. Disappears when a game starts. Returns on End Game. |
| **Winner overlay** | Appears automatically when a player reaches 0. Name shown in player's colour. Dismiss with "Continue watching". Cleared on new game start. |

The TV view is **read-only** — it never writes to storage.

---

## Going live (Firebase)

For phone + TV on different devices over Wi-Fi, Firebase Realtime Database provides ~100ms sync with no server required.

1. Create a project at [console.firebase.google.com](https://console.firebase.google.com)
2. Enable **Realtime Database** → start in test mode, choose the EU region
3. Open `darts.js` and paste your config into the `firebaseConfig` block at the top
4. Push all three files to a **GitHub Pages** repository

```
your-repo/
  ├── darts.html
  ├── darts.css
  └── darts.js
```

The app detects the placeholder config and falls back to `localStorage` automatically — so local play always works without any changes.

**On the night:** open the TV display tab *before* starting the game to pre-warm the Firebase connection (first connect after idle can take 2–5 seconds).

---

## Quick reference

| Action | Shortcut / method |
|--------|------------------|
| Hard reload (clear cache) | `Cmd+Shift+R` / `Ctrl+Shift+R` |
| Open DevTools | `Cmd+Option+I` / `F12` |
| Keep cache disabled | DevTools → Network → ☑ Disable cache |
| Undo last visit | ⌫ on empty numpad |
| End game, keep players | ⏹ End Game button |
| Start local server | `python3 -m http.server 8000` |
