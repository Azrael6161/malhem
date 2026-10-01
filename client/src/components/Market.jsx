import React, { useState } from 'react';
import { CARD_NAMES, CARD_TEXT, LEVEL_LABEL, LEVEL_COST } from '../constants.js';

const LEVELS = ['basic', 'medium', 'strong'];

export default function Market({ state, me, send, myTurn }) {
  const [open, setOpen] = useState('basic');
  if (!me) return null;
  const busy = !myTurn || !!state.pending;
  const hasOptimizer = me.cards.some((c) => c.id === 'code_optimizer');

  return (
    <div className="market">
      <p className="fine">
        Покупки идут за <b className="coins">Ко́ины</b>. Очки не тратятся никогда.
        Купленная карта включится в начале вашего следующего хода.
      </p>

      {LEVELS.map((lvl) => {
        const cost = lvl === 'strong' && hasOptimizer ? LEVEL_COST.strong - 1 : LEVEL_COST[lvl];
        const pool = state.market[lvl] ?? [];
        return (
          <div className="market-group" key={lvl}>
            <button className={`market-head ${open === lvl ? 'open' : ''}`} onClick={() => setOpen(open === lvl ? '' : lvl)}>
              <span className={`tier ${lvl}`}>{LEVEL_LABEL[lvl]}</span>
              <span className="cost">{cost} C</span>
              <span className="count">{pool.length}</span>
            </button>

            {open === lvl && pool.map((id) => (
              <div className="card-row" key={id}>
                <div>
                  <b>{CARD_NAMES[id] ?? id}</b>
                  <p>{CARD_TEXT[id] ?? ''}</p>
                </div>
                <button className="btn small" disabled={busy || me.coins < cost}
                  onClick={() => send('buy', { cardId: id })}>
                  Купить
                </button>
              </div>
            ))}
            {open === lvl && !pool.length && <div className="empty">распродано</div>}
          </div>
        );
      })}
    </div>
  );
}
