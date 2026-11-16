// YeahMel Rocket League Toolkit - relay server
//
// Rocket League (Stats API, TCP :49123)  ──►  this server  ──►  OBS browser sources
//                                              (HTTP + WebSocket on :8080)
//
//   npm start                       connect to the real game
//   npm run demo                    fake match data, no game needed (works on a Mac)
//   node relay/server.js --player "YeahMel"   tell it which player is you (for W/L tracking)

const http = require('http');
const net = require('net');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const { JsonStreamParser } = require('./parser');
const { startDemo } = require('./demo');

// ---------- settings ----------
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};
const DEMO = args.includes('--demo');
const RL_HOST = flag('rl-host', '127.0.0.1');
const RL_PORT = Number(flag('rl-port', 49123));
const WEB_PORT = Number(flag('port', 8080));
// Safer default: only this computer can open the overlays. Use --lan to allow
// a phone / second PC on your home network.
const BIND = args.includes('--lan') ? '0.0.0.0' : '127.0.0.1';
const PLAYER_NAME = flag('player', process.env.RL_PLAYER || 'YeahMel');

const ROOT = path.join(__dirname, '..');
const OVERLAY_DIR = path.join(ROOT, 'overlay');
const DATA_DIR = path.join(ROOT, 'data');
const SESSION_FILE = path.join(DATA_DIR, 'session.json');

// ---------- state ----------
const blankSession = () => ({
  started: new Date().toISOString(),
  wins: 0, losses: 0, noContests: 0, streak: 0, bestStreak: 0,
  goals: 0, assists: 0, saves: 0, shots: 0, demos: 0,
  fastestGoalKph: 0, matches: [],
});

let session = loadSession();
let live = {
  connected: false,
  demo: DEMO,
  player: PLAYER_NAME,
  game: null,       // latest UpdateState.Game
  players: [],      // latest UpdateState.Players
  lastGoal: null,
  feed: [],         // recent stat-feed items
  matchGuid: null,
  matchCounted: false,
};

function loadSession() {
  try { return { ...blankSession(), ...JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8')) }; }
  catch { return blankSession(); }
}
function saveSession() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(SESSION_FILE, JSON.stringify(session, null, 2));
}

// Goal speed: the docs say Unreal Units/sec, but sample data looks like km/h.
// 1 UU = 1 cm, so UU/s * 0.036 = km/h. Anything over 300 must be UU/s.
const toKph = (v) => (v > 300 ? v * 0.036 : v);

const me = () => live.players.find((p) => p.Name === PLAYER_NAME);

// ---------- handle one Stats API message ----------
function handle(msg) {
  const { Event, Data = {} } = msg;
  let extra = null;

  switch (Event) {
    case 'UpdateState':
      live.game = Data.Game || live.game;
      live.players = Data.Players || live.players;
      if (Data.MatchGuid) live.matchGuid = Data.MatchGuid;
      break;

    case 'MatchCreated':
    case 'MatchInitialized':
      if (live.matchGuid !== Data.MatchGuid || Event === 'MatchCreated') {
        live.matchCounted = false;
        live.feed = [];
        live.lastGoal = null;
      }
      live.matchGuid = Data.MatchGuid || live.matchGuid;
      break;

    case 'GoalScored': {
      const kph = Math.round(toKph(Data.GoalSpeed || 0));
      live.lastGoal = {
        scorer: Data.Scorer?.Name || 'Unknown',
        assister: Data.Assister?.Name || null,
        team: Data.Scorer?.TeamNum ?? 0,
        kph,
        at: Date.now(),
      };
      if (Data.Scorer?.Name === PLAYER_NAME && kph > session.fastestGoalKph) {
        session.fastestGoalKph = kph;
      }
      extra = live.lastGoal;
      break;
    }

    case 'StatfeedEvent':
      live.feed.unshift({
        type: Data.Type || Data.EventName,
        who: Data.MainTarget?.Name,
        team: Data.MainTarget?.TeamNum ?? 0,
        victim: Data.SecondaryTarget?.Name || null,
        at: Date.now(),
      });
      live.feed = live.feed.slice(0, 6);
      break;

    case 'MatchEnded':
      if (!live.matchCounted) {
        countMatch(Data.WinnerTeamNum);
        live.matchCounted = true;
      }
      break;
  }

  broadcast({ type: 'event', event: Event, data: Data, extra });
}

function countMatch(winnerTeam) {
  const mine = me();
  if (!mine) return; // you weren't in this match (or the name doesn't match)
  const result = winnerTeam === -1 ? 'nc' : winnerTeam === mine.TeamNum ? 'win' : 'loss';
  if (result === 'win') {
    session.wins++;
    session.streak = session.streak >= 0 ? session.streak + 1 : 1;
  } else if (result === 'loss') {
    session.losses++;
    session.streak = session.streak <= 0 ? session.streak - 1 : -1;
  } else session.noContests++;
  session.bestStreak = Math.max(session.bestStreak, session.streak);
  for (const k of ['goals', 'assists', 'saves', 'shots', 'demos']) {
    session[k] += mine[k[0].toUpperCase() + k.slice(1)] || 0;
  }
  const teams = live.game?.Teams || [];
  session.matches.unshift({
    result,
    score: `${teams[0]?.Score ?? 0}-${teams[1]?.Score ?? 0}`,
    goals: mine.Goals || 0,
    at: new Date().toISOString(),
  });
  session.matches = session.matches.slice(0, 20);
  saveSession();
}

// ---------- HTTP (serves the overlay files) ----------
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/state') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ live, session }));
  }
  if (url.pathname === '/api/session/reset' && req.method === 'POST') {
    session = blankSession();
    saveSession();
    broadcast({ type: 'session', session });
    res.writeHead(200);
    return res.end('ok');
  }
  const file = path.normalize(path.join(OVERLAY_DIR, url.pathname === '/' ? 'index.html' : url.pathname));
  if (!file.startsWith(OVERLAY_DIR)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
});

// ---------- WebSocket (pushes live data to overlays) ----------
const wss = new WebSocketServer({ server, path: '/ws' });
function broadcast(obj) {
  // Always include fresh state so a late-joining overlay is never out of sync.
  const payload = JSON.stringify({ ...obj, live: slimLive(), session });
  for (const c of wss.clients) if (c.readyState === 1) c.send(payload);
}
const slimLive = () => ({ ...live, players: live.players.map(slimPlayer) });
const slimPlayer = (p) => ({
  Name: p.Name, TeamNum: p.TeamNum, Score: p.Score, Goals: p.Goals, Assists: p.Assists,
  Saves: p.Saves, Shots: p.Shots, Demos: p.Demos, Boost: p.Boost, bSupersonic: p.bSupersonic,
  Speed: p.Speed, Shortcut: p.Shortcut,
});
wss.on('connection', (ws) => ws.send(JSON.stringify({ type: 'hello', live: slimLive(), session })));

// ---------- connect to Rocket League ----------
function connectToGame() {
  const parser = new JsonStreamParser();
  const sock = net.createConnection({ host: RL_HOST, port: RL_PORT });
  sock.setEncoding('utf8');
  sock.on('connect', () => {
    live.connected = true;
    console.log(`Connected to Rocket League Stats API at ${RL_HOST}:${RL_PORT}`);
    broadcast({ type: 'status' });
  });
  sock.on('data', (chunk) => parser.push(chunk).forEach(handle));
  sock.on('error', () => {}); // handled by 'close'
  sock.on('close', () => {
    if (live.connected) console.log('Lost connection to Rocket League. Retrying...');
    live.connected = false;
    broadcast({ type: 'status' });
    setTimeout(connectToGame, 3000);
  });
}

server.listen(WEB_PORT, BIND, () => {
  console.log('\n  YeahMel RL Toolkit is running');
  console.log(`  Control panel:   http://localhost:${WEB_PORT}/`);
  console.log(`  Scoreboard (OBS): http://localhost:${WEB_PORT}/scoreboard.html`);
  console.log(`  Session card:     http://localhost:${WEB_PORT}/session.html`);
  console.log(`  Tracking player:  ${PLAYER_NAME}\n`);
  if (DEMO) {
    console.log('  DEMO MODE: sending fake match data (no game needed)\n');
    live.connected = true;
    startDemo(handle, PLAYER_NAME);
  } else {
    console.log(`  Waiting for Rocket League on ${RL_HOST}:${RL_PORT} ...`);
    console.log('  (Make sure TAStatsAPI.ini has PacketSendRate above 0 - see config/)\n');
    connectToGame();
  }
});
