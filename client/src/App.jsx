import React, { useEffect, useState } from 'react';
import { useGameSocket } from './useGameSocket.js';
import HexBoard from './board/HexBoard.jsx';
import HUD from './components/HUD.jsx';
import Market from './components/Market.jsx';
import LogPanel from './components/LogPanel.jsx';
import Scoreboard from './components/Scoreboard.jsx';
import Hand from './components/Hand.jsx';
import RansomPanel from './components/RansomPanel.jsx';
import PendingOverlay from './components/PendingOverlay.jsx';
import { PHASE_INFO, COLOR_HEX } from './constants.js';

export default function App() {
  const [creds, setCreds] = useState(() => {
    try { return JSON.parse(localStorage.getItem('malhem') || 'null'); } catch { return null; }
  });
  const [name, setName] = useState('');
  const [code, setCode] = useState(new URLSearchParams(location.search).get('room') || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => { if (creds) localStorage.setItem('malhem', JSON.stringify(creds)); }, [creds]);

  const post = (path, body) =>
    fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      .then((r) => r.json());

  const createRoom = async () => {
    if (!name.trim()) return setErr('Введите никнейм');
    setBusy(true); setErr(null);
    const r = await post('/api/rooms', { name });
    setBusy(false);
    if (r.error) return setErr(r.error);
    setCreds({ roomId: r.roomId, playerId: r.playerId, name: r.name });
  };

  const joinRoom = async () => {
    if (!name.trim()) return setErr('Введите никнейм');
    if (!code.trim()) return setErr('Введите код комнаты');
    setBusy(true); setErr(null);
    const r = await post(`/api/rooms/${code.trim().toUpperCase()}/join`, { name });
    setBusy(false);
    if (r.error) return setErr(r.error);
    setCreds({ roomId: r.roomId, playerId: r.playerId, name: r.name });
  };

  if (!creds) {
    return (
      <div className="lobby-screen">
        <h1 className="logo">MALHEM</h1>
        <p className="tagline">тактический киберпанк · контроль территорий · 2–4 вируса</p>
        <div className="card-box">
          <label>Никнейм</label>
          <input value={name} maxLength={16} onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && createRoom()} placeholder="ZeroCool" autoFocus />
          <button className="btn primary" disabled={busy} onClick={createRoom}>Создать партию</button>
          <div className="divider">или</div>
          <input value={code} maxLength={6} className="code-input"
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && joinRoom()} placeholder="КОД" />
          <button className="btn" disabled={busy} onClick={joinRoom}>Войти по коду</button>
          {err && <div className="err">{err}</div>}
        </div>
      </div>
    );
  }

  return <GameTable creds={creds} onLeave={() => { localStorage.removeItem('malhem'); setCreds(null); }} />;
}

function GameTable({ creds, onLeave }) {
  const { state, send, error, notice, connected } = useGameSocket(creds);
  const [tab, setTab] = useState('market');
  const [targetMode, setTargetMode] = useState(null);

  useEffect(() => { if (!state?.pending) setTargetMode(null); }, [state?.pending]);
  if (!state) return <div className="lobby-screen"><h2>Подключаемся к сети…</h2></div>;

  if (state.status === 'lobby') {
    const link = `${location.origin}?room=${state.roomId}`;
    return (
      <div className="lobby-screen">
        <h1 className="logo">MALHEM</h1>
        <div className="card-box">
          <div className="room-code">{state.roomId}</div>
          <p className="hint">Передайте код или ссылку друзьям</p>
          <button className="btn" onClick={() => navigator.clipboard.writeText(link)}>Скопировать ссылку</button>
          <ul className="player-list">
            {state.players.map((p) => (
              <li key={p.id}><span className="dot" style={{ background: `var(--${p.color})`, backgroundColor: p.color }} />
                {p.name}{p.id === creds.playerId && ' (вы)'}</li>
            ))}
            {state.players.length < 2 && <li className="waiting">ждём второго игрока…</li>}
          </ul>
          <button className="btn primary" disabled={state.players.length < 2} onClick={() => send('start')}>
            Начать игру ({state.players.length}/{4})
          </button>
          <button className="btn ghost" onClick={onLeave}>Выйти</button>
        </div>
      </div>
    );
  }

  const me = state.players.find((p) => p.id === creds.playerId);
  const myTurn = state.currentPlayerId === creds.playerId;
  const phase = PHASE_INFO[state.phase];

  /** Клик по гексу в режиме выбора цели: первый клик для Spoofing — «якорь». */
  const handleSelect = (tile) => {
    if (!targetMode) return;
    const { cardId, anchor } = targetMode;

    if (cardId === 'spoofing' && !anchor) {
      setTargetMode({ cardId, anchor: { q: tile.q, r: tile.r } });
      return;
    }
    const payload = { cardId, q: tile.q, r: tile.r };
    if (cardId === 'ransomware') {
      const enemy = tile.markers?.find((m) => m.playerId !== creds.playerId);
      payload.targetPlayerId = enemy?.playerId;
    }
    if (cardId === 'spoofing') {
      payload.a = anchor;
      payload.b = { q: tile.q, r: tile.r };
    }
    send('ability', payload);
    setTargetMode(null);
  };

  return (
    <div className="game">
      <header className="topbar">
        <div className="brand">MALHEM</div>
        <div className="round">
          Круг <b>{state.round}</b>
          <span className="phase-chip" data-phase={state.phase}>Фаза {state.phase}: {phase.name}</span>
        </div>
        <div className="reserve" title="Сколько тайлов осталось в Резерве Сети">
          Резерв: <b>{state.reserveCount}</b>
        </div>
        <div className={`conn ${connected ? 'on' : 'off'}`}>
          {connected ? '● синхронизировано' : '○ переподключение'}
        </div>
      </header>

      {state.finalRoundsLeft !== null && state.finalRoundsLeft > 0 && (
        <div className="final-banner">
          ⚡ МАРШРУТИЗАТОР В СЕТИ — осталось кругов: {state.finalRoundsLeft}
        </div>
      )}

      <main>
        <aside className="left">
          <HUD state={state} me={me} myTurn={myTurn} send={send} phase={phase} />
          <Hand me={me} state={state} send={send} myTurn={myTurn}
            targetMode={targetMode} setTargetMode={setTargetMode} />
        </aside>

        <section className="center">
          <HexBoard
            tiles={state.tiles}
            players={state.players}
            you={creds.playerId}
            currentPlayerId={state.currentPlayerId}
            pending={state.pending?.options ? state.pending : null}
            targetMode={targetMode}
            onSelect={handleSelect}
            send={send}
            ransomCost={state.ransomCost}
          />
          <div className="legend">
            <span><i className="lg basic" /> базовый · 1 очк.</span>
            <span><i className="lg medium" /> средний · 2 очк.</span>
            <span><i className="lg hard" /> сложный · 4 очк.</span>
            <span><i className="lg router" /> маршрутизатор · 6 очк.</span>
            <span><i className="lg trap" /> ловушка</span>
            <span>🖱 зум — колесо, сдвиг — перетаскивание</span>
          </div>
        </section>

        <aside className="right">
          <RansomPanel state={state} send={send} myTurn={myTurn} />
          <div className="tabs">
            <button className={tab === 'market' ? 'on' : ''} onClick={() => setTab('market')}>Рынок</button>
            <button className={tab === 'log' ? 'on' : ''} onClick={() => setTab('log')}>Журнал</button>
            <button className={tab === 'scores' ? 'on' : ''} onClick={() => setTab('scores')}>Очки</button>
          </div>
          {tab === 'market' && <Market state={state} me={me} send={send} myTurn={myTurn} />}
          {tab === 'log' && <LogPanel log={state.log} players={state.players} />}
          {tab === 'scores' && <Scoreboard state={state} />}
        </aside>
      </main>

      {state.pending?.type && <PendingOverlay state={state} send={send} />}

      {state.status === 'finished' && (
        <div className="win-overlay">
          <div className="card-box">
            <h2>Партия окончена</h2>
            <p className="winner">
              Главный Архитектор Сети: <b>{state.players.find((p) => p.id === state.winnerId)?.name}</b>
            </p>
            <Scoreboard state={state} detailed />
            <button className="btn primary" onClick={onLeave}>Вернуться в лобби</button>
          </div>
        </div>
      )}

      {error && <div className="toast err-toast">{error}</div>}
      {notice && <div className="toast">{notice}</div>}
    </div>
  );
}
