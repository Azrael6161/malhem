import React, { useState } from 'react';

/**
 * Пульт игрока. Два счётчика показаны отдельно, потому что они играют разные роли:
 *  ОЧКИ  — сумма захватов, итог партии, никогда не тратится;
 *  КОИНЫ — доход за циклы + разовые куши, это валюта на рынке.
 */
export default function HUD({ state, me, myTurn, send, phase }) {
  const [zeroDay, setZeroDay] = useState(false);
  const [attackTarget, setAttackTarget] = useState('');
  if (!me) return null;

  const tile = state.tiles.find((t) => t.q === me.core.q && t.r === me.core.r);
  const busy = !!state.pending;
  const myMarker = tile?.markers.some((m) => m.playerId === me.id);
  const enemyMarker = tile?.markers.some((m) => m.playerId !== me.id);
  const hackable = tile && ['basic', 'medium', 'hard', 'router'].includes(tile.type) && !myMarker;

  const difficulty = { basic: 1, medium: 4, hard: 5, router: 6 }[tile?.type];
  const hasProxy = me.cards.some((c) => ['proxy_in', 'adv_proxy'].includes(c.id) && c.armed && !c.used);
  const hasZeroDay = me.cards.some((c) => c.id === 'zero_day' && c.armed && !c.used);
  const hasExploit = me.cards.some((c) => c.id === 'exploit_vbs' && c.armed);

  const canDisabled = !myTurn || busy;

  return (
    <div className="hud">
      <div className="wallet">
        <div className="cell points-cell" title="Сумма всех ваших захватов. Итог партии. Не тратится.">
          <span className="lbl">Очки</span>
          <b className="points">{me.points}</b>
        </div>
        <div className="cell coins-cell" title="Доход за циклы и разовые куши. Тратится на рынке.">
          <span className="lbl">Ко́ины</span>
          <b className="coins">{me.coins} C</b>
        </div>
        <div className="cell">
          <span className="lbl">Маркеры</span>
          <b>{me.markersLeft}</b>
        </div>
      </div>

      <div className={`turn-box ${myTurn ? 'on' : ''}`}>
        {myTurn
          ? <>Ваш ход · действий <b>{state.actionsLeft}</b></>
          : <>Ход: <b>{state.players.find((p) => p.id === state.currentPlayerId)?.name}</b></>}
      </div>

      <div className="where">
        Вы на гексе: <b>{tile?.faceUp ? (tile.type === 'router' ? 'Маршрутизатор' : tile.type) : 'закрытый'}</b>
        {difficulty && tile?.faceUp && <span> · сложность {difficulty}+</span>}
      </div>

      <div className="actions">
        <button className="btn primary" disabled={canDisabled || !hackable}
          onClick={() => send('hack', { mode: 'classic', zeroDay })}
          title="Бросок 1d6 против сложности узла">
          Взломать{difficulty ? ` (${difficulty === 1 ? 'авто' : `${difficulty}+`})` : ''}
        </button>

        {hasZeroDay && (
          <label className="toggle">
            <input type="checkbox" checked={zeroDay} onChange={(e) => setZeroDay(e.target.checked)} />
            Zero-Day: авто-успех{difficulty ? '' : ' (нужен сложный узел)'}
          </label>
        )}

        {hasProxy && enemyMarker && (
          <button className="btn" disabled={canDisabled}
            onClick={() => send('hack', { mode: 'proxy' })}>
            Прокси-вход ({tile?.type === 'hard' ? 2 : 1} C)
          </button>
        )}

        {tile?.type === 'router' && !myMarker && (
          <button className="btn danger" disabled={canDisabled}
            onClick={() => send('hack', { mode: 'classic' })}>
            Штурм Маршрутизатора — нужна ровно 6
          </button>
        )}

        {hasExploit && state.phase >= 2 && enemyMarker && (
          <div className="attack-row">
            <select value={attackTarget} onChange={(e) => setAttackTarget(e.target.value)}>
              <option value="">— цель атаки —</option>
              {tile.markers.filter((m) => m.playerId !== me.id).map((m) => {
                const p = state.players.find((x) => x.id === m.playerId);
                return <option key={m.playerId} value={m.playerId}>{p?.name}</option>;
              })}
            </select>
            <button className="btn danger" disabled={canDisabled || !attackTarget}
              onClick={() => send('attack', { targetPlayerId: attackTarget })}>
              Атака
            </button>
          </div>
        )}
      </div>

      <div className="rule-hint">{phase.hint}</div>

      <button className="btn ghost small" disabled={canDisabled} onClick={() => send('pass')}
        title="Передать ход досрочно — сервер разрешит только если полезных действий не осталось">
        Нет доступных действий →
      </button>
    </div>
  );
}
