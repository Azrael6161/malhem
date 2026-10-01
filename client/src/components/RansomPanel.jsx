import React, { useState } from 'react';
import { CARD_NAMES, CARD_TEXT, LEVEL_LABEL } from '../constants.js';

/** Список тайлов, за которые я должен заплатить дань — блокировка Ransomware. */
export default function RansomPanel({ state, send, myTurn }) {
  const blocked = state.tiles.filter((t) => (t.blockedFor ?? []).some((b) => b.canPay));
  const me = state.players.find((p) => p.id === state.you);
  if (!blocked.length || !me) return null;

  return (
    <div className="ransom-panel">
      <h4>🔒 Узлы под Ransomware</h4>
      <p className="fine">
        Ваши маркеры зашифрованы: очки и доход с них не идут. Снимите блок за {state.ransomCost} C.
      </p>
      {blocked.map((t) => {
        const owner = state.players.find((p) => p.id === t.blockedFor.find((b) => b.canPay)?.by);
        return (
          <div className="ransom-row" key={`${t.q},${t.r}`}>
            <span>
              гекс {t.q},{t.r}
              <em> зашифровал {owner?.name ?? '—'}</em>
            </span>
            <button
              className="btn small danger"
              disabled={!myTurn || me.coins < state.ransomCost}
              onClick={() => send('payRansom', { tileKey: `${t.q},${t.r}` })}
            >
              Заплатить {state.ransomCost} C
            </button>
          </div>
        );
      })}
    </div>
  );
}
