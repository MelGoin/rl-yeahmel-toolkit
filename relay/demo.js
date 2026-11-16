// Fake Rocket League match generator. Produces the same message shapes as the
// real Stats API so you can build and style overlays on any computer.

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function startDemo(emit, playerName) {
  const roster = [
    { Name: playerName, TeamNum: 0, Shortcut: 1 },
    { Name: 'Clevelander', TeamNum: 0, Shortcut: 2 },
    { Name: 'LakeEffect', TeamNum: 0, Shortcut: 3 },
    { Name: 'OrangeCrush', TeamNum: 1, Shortcut: 4 },
    { Name: 'FlipReset', TeamNum: 1, Shortcut: 5 },
    { Name: 'CeilingShot', TeamNum: 1, Shortcut: 6 },
  ];
  let players, score, clock, overtime, guid, ended = false, tick = 0;

  const newMatch = () => {
    guid = Math.random().toString(16).slice(2).toUpperCase().padEnd(32, '0');
    players = roster.map((p) => ({ ...p, Score: 0, Goals: 0, Shots: 0, Assists: 0,
      Saves: 0, Touches: 0, Demos: 0, Boost: 33, Speed: 0, bSupersonic: false }));
    score = [0, 0];
    clock = 90; // short demo match
    overtime = false;
    ended = false;
    emit({ Event: 'MatchCreated', Data: { MatchGuid: guid } });
    emit({ Event: 'MatchInitialized', Data: { MatchGuid: guid } });
    emit({ Event: 'RoundStarted', Data: { MatchGuid: guid } });
  };

  const state = () => ({
    Event: 'UpdateState',
    Data: {
      MatchGuid: guid,
      Players: players,
      Game: {
        Teams: [
          { Name: 'Blue', TeamNum: 0, Score: score[0], ColorPrimary: '1873FF', ColorSecondary: 'E5E5E5' },
          { Name: 'Orange', TeamNum: 1, Score: score[1], ColorPrimary: 'C26418', ColorSecondary: 'E5E5E5' },
        ],
        TimeSeconds: clock, bOvertime: overtime, Ball: { Speed: rand(200, 4500), TeamNum: pick([0, 1]) },
        bReplay: false, bHasWinner: false, Winner: '', Arena: 'Stadium_P', PlaylistId: 11,
        bHasTarget: true, Target: { Name: playerName, Shortcut: 1, TeamNum: 0 },
      },
    },
  });

  newMatch();
  setInterval(() => {
    if (ended) return;
    tick++;
    // wiggle boost/speed every tick so the meters move
    for (const p of players) {
      p.Boost = Math.max(0, Math.min(100, Math.round(p.Boost + rand(-12, 14))));
      p.Speed = rand(400, 2300);
      p.bSupersonic = p.Speed > 2200;
    }

    if (tick % 5 === 0) {
      // one game second per half real second
      if (!overtime) clock = Math.max(0, clock - 1); else clock++;
    }

    // random stat-feed events
    if (Math.random() < 0.04) {
      const who = pick(players);
      const kind = pick(['Shot on Goal', 'Save', 'Demolition', 'Epic Save']);
      if (kind === 'Save' || kind === 'Epic Save') { who.Saves++; who.Score += kind === 'Save' ? 50 : 75; }
      if (kind === 'Shot on Goal') { who.Shots++; who.Score += 20; }
      const victim = kind === 'Demolition' ? pick(players.filter((p) => p.TeamNum !== who.TeamNum)) : null;
      if (victim) who.Demos++;
      emit({ Event: 'StatfeedEvent', Data: { MatchGuid: guid, EventName: kind.replace(/ /g, ''),
        Type: kind, MainTarget: who, SecondaryTarget: victim } });
    }

    // goals
    if (Math.random() < 0.012 && clock > 0) {
      const scorer = pick(players);
      const mates = players.filter((p) => p.TeamNum === scorer.TeamNum && p !== scorer);
      const assister = Math.random() < 0.5 ? pick(mates) : undefined;
      scorer.Goals++; scorer.Shots++; scorer.Score += 100;
      if (assister) { assister.Assists++; assister.Score += 50; }
      score[scorer.TeamNum]++;
      emit({ Event: 'GoalScored', Data: { MatchGuid: guid, GoalSpeed: Math.round(rand(55, 140) * 10) / 10,
        GoalTime: 30, Scorer: scorer, Assister: assister,
        BallLastTouch: { Player: scorer, Speed: 120 } } });
      if (overtime) clock = 0;
    }

    // end of regulation
    if (clock === 0 && !overtime && score[0] === score[1]) overtime = true;
    if (clock === 0 && score[0] !== score[1]) {
      emit(state());
      emit({ Event: 'MatchEnded', Data: { MatchGuid: guid, WinnerTeamNum: score[0] > score[1] ? 0 : 1 } });
      emit({ Event: 'PodiumStart', Data: { MatchGuid: guid } });
      ended = true; // pause until the next match
      setTimeout(() => { emit({ Event: 'MatchDestroyed', Data: { MatchGuid: guid } }); newMatch(); }, 6000);
    }

    if (!ended) emit(state());
  }, 100); // 10 updates per second
}

module.exports = { startDemo };
