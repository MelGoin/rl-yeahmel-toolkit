# YeahMel Rocket League Toolkit

Live match stats and OBS stream overlays built on Rocket League's **official Stats API**, plus a **BakkesMod practice plugin**. Nothing here modifies the game or gives a gameplay advantage.

| Part | What it does | Where it runs |
|---|---|---|
| `relay/` | Reads live data from Rocket League and sends it to your overlays | Any computer with Node.js (demo mode works on a Mac) |
| `overlay/` | Scoreboard, goal pop-up, stat feed, session W/L card for OBS | OBS Browser Source |
| `bakkesmod-plugin/` | "YeahMel Coach" shot-speed HUD for Free Play | Windows, BakkesMod, Easy Anti-Cheat **off** |

## Rules this follows

- The **Stats API** is built into Rocket League by Psyonix and works in online matches with Easy Anti-Cheat on. It only reads data the game chooses to share.
- **BakkesMod** only runs when you launch the game **without** Easy Anti-Cheat, which means offline only (Free Play, Custom Training, LAN, replays). This plugin also checks for Free Play / Custom Training and does nothing anywhere else.

---

## 1. Try it right now (no game needed)

Install [Node.js](https://nodejs.org) (the LTS version), then in Terminal:

```bash
cd rl-yeahmel-toolkit
npm install
npm run demo
```

Open http://localhost:8080 and you'll see a fake match playing out on the scoreboard. Use this to restyle the overlays on your MacBook.

## 2. Hook it up to the real game

The game must be running on Windows (a PC, or Linux/Steam Deck). GeForce NOW **can't** be used, because the API only talks to programs on the same computer as the game.

1. Close Rocket League.
2. Open `<Rocket League install>\TAGame\Config\` and edit `TAStatsAPI.ini` (or `DefaultStatsAPI.ini` if that's the only one). Paste in the contents of `config/DefaultStatsAPI.ini`:
   ```ini
   [TAGame.MatchStatsExporter_TA]
   PacketSendRate=30
   Port=49123
   WebPort=49124
   ```
   Epic default path: `C:\Program Files\Epic Games\rocketleague\TAGame\Config\`
3. Start Rocket League, then run:
   ```bash
   npm start -- --player "YourExactInGameName"
   ```
   `--player` tells it which player is you, so the wins/losses card counts your games.

## 3. Add the overlays to OBS

In OBS: **Sources → + → Browser**.

| Overlay | URL | Width × Height |
|---|---|---|
| Scoreboard + goal pop-up + stat feed | `http://localhost:8080/scoreboard.html` | 1920 × 1080 |
| Session stats card | `http://localhost:8080/session.html` | 520 × 300 |

Customize with URL options:
- `?brand=YEAHMEL` changes the label text
- `?blue=00C2FF&orange=FF3B6B` sets custom team colors
- `?preview` adds a dark background so you can see it in a normal browser

Session stats save to `data/session.json` and survive restarts. Reset them from the control panel.

### Good to know
- Boost bars only show while **spectating** or watching replays, because the game only shares other players' boost then. Scores, goals, saves and the clock work in every match.
- Overlays only accept connections from your own computer. Add `--lan` to open them from a phone or a second PC on your home Wi-Fi.

## 4. BakkesMod plugin: YeahMel Coach

**Quickest way (no Visual Studio):** every push builds the plugin automatically on GitHub. Open the repo's **Actions** tab → latest "Build YeahMel Coach plugin" run → download **YeahMelCoach-plugin**. Then in PowerShell:

```powershell
Copy-Item "$env:USERPROFILE\Downloads\YeahMelCoach.dll" "$env:APPDATA\bakkesmod\bakkesmod\plugins\"
Unblock-File "$env:APPDATA\bakkesmod\bakkesmod\plugins\YeahMelCoach.dll"
Add-Content "$env:APPDATA\bakkesmod\bakkesmod\cfg\plugins.cfg" "plugin load yeahmelcoach"
```

**Build it yourself instead:**

A Free Play HUD that shows your last shot speed and your best shot of the session, plus touches and goals, with a pop-up whenever you set a new best.

**Needs:** Windows, [Visual Studio 2022](https://visualstudio.microsoft.com/) with "Desktop development with C++", and [BakkesMod](https://bakkesmod.com) installed and run at least once (that installs the SDK).

1. Open `bakkesmod-plugin/YeahMelCoach/YeahMelCoach.vcxproj` in Visual Studio.
2. Set the build to **Release | x64** and press **Build** (Ctrl+Shift+B).
3. The DLL is built into `bakkesmod-plugin/YeahMelCoach/plugins/YeahMelCoach.dll`. BakkesMod's build helper usually copies it into BakkesMod for you. If `plugin load` says it can't find it, copy the DLL into `%appdata%\bakkesmod\bakkesmod\plugins\` yourself.
4. Launch Rocket League **without anti-cheat** (Epic Library → right-click Rocket League → Launch without Anti-Cheat), and start BakkesMod.
5. Press **F6** to open the console, then type `plugin load yeahmelcoach`.
6. Go to Free Play and hit the ball.

Console commands:
- `yeahmel_hud 0` / `1` turns the HUD off/on
- `yeahmel_reset` clears session stats
- Or press **F2 → Plugins → YeahMel Coach** for sliders

To load it automatically every time, add `plugin load yeahmelcoach` to `bakkesmod/cfg/plugins.cfg`.

## Project layout

```
relay/server.js      relay + web server
relay/parser.js      splits the game's data stream into messages (tested: npm test)
relay/demo.js        fake match generator
overlay/*.html       OBS overlays + control panel
bakkesmod-plugin/    Visual Studio project for YeahMel Coach
config/              Stats API settings to paste into the game
```

## Ideas for next steps

- Add your logo: drop `logo.png` into `overlay/` and add `<img src="logo.png">` to `scoreboard.html`
- Play a sound on goals (`new Audio('goal.mp3').play()` in `showGoal`)
- A "fastest goal" leaderboard across sessions
- Show mph instead of km/h: change `0.036` to `0.02237`

## Sources

- Psyonix Stats API docs: https://www.rocketleague.com/developer/stats-api
- Easy Anti-Cheat and mods policy: https://www.rocketleague.com/news/easy-anti-cheat-comes-to-rocket-league-on-pc-today
- BakkesMod SDK: https://github.com/bakkesmodorg/BakkesModSDK
- Plugin template: https://github.com/Martinii89/BakkesmodPluginTemplate
