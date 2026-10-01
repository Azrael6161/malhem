import React, { useState } from 'react';
import { CARD_NAMES, CARD_TEXT, LEVEL_LABEL } from '../constants.js';

/**
 * Рука игрока. Пассивные способности просто отображаются,
 * активные можно активировать — часть требует выбрать цель на поле.
 */
const TARGETED = { backdoor: 'ownNode', ransomware: 'enemyMarker', logic_bomb: 'anyNode', spoofing: 'adjacentBasic' };
const INSTANT = ['sniffer', 'ddos'];

export default function Hand({ me, state, send, myTurn, targetMode, setTargetMode }) {
  const [polyOwn, setPolyOwn] = useState('');
  const [polyMarket, setPolyMarket] = useState('');

  if (!me) return null;
  const busy = !myTurn || !!state.pending;

  const ownBasic = me.cards.filter((c) => c.level === 'basic');
  const marketBasic = state.market.basic ?? [];

  const activate = (cardId) => {
    if (TARGETED[cardId]) {
      setTargetMode({ cardId, anchor: null });
      return;
    }
    send('ability', { cardId });
  };

  return (
    <div className="hand">
      <div className="hand-head">
        <h4>Ваш код · {me.cards.length}</h4>
        {targetMode && (
          <button className="btn small ghost" onClick={() => setTargetMode(null)}>Отменить выбор</button>
        )}
      </div>

      {targetMode && (
        <div className="target-hint">
          {targetMode.cardId === 'backdoor' && 'Выберите ваш узел для прыжка (мигающий контур).'}
          {targetMode.cardId === 'ransomware' && 'Выберите общий узел, где стоят ваш маркер и чужой.'}
          {targetMode.cardId === 'logic_bomb' && 'Выберите пустой или базовый гекс — он будет уничтожен.'}
          {targetMode.cardId === 'spoofing' && (targetMode.anchor
            ? 'Теперь выберите соседний базовый узел с чужим маркером.'
            : 'Сначала выберите базовый узел со своим маркером.')}
        </div>
      )}

      {!me.cards.length && <div className="empty">Способностей нет — купите на рынке</div>}

      {me.cards.map((c) => {
        const isActive = c.type === 'active';
        const usable = isActive && c.armed && !c.used && !busy && INSTANT.concat(Object.keys(TARGETED)).includes(c.id);
        const isZeroDay = c.id === 'zero_day';
        const isProxy = c.id === 'proxy_in' || c.id === 'adv_proxy';
        const isPoly = c.id === 'polymorph';

        return (
          <div key={c.uid} className={`mine ${c.used ? 'used' : ''} ${c.armed ? '' : 'idle'}`}>
            <div className="mine-head">
              <b>{CARD_NAMES[c.id] ?? c.id}</b>
              <span className={`tier ${c.level}`}>{LEVEL_LABEL[c.level]}</span>
            </div>
            <p className="mine-text">{CARD_TEXT[c.id]}</p>

            {!c.armed && <em className="state">включится в начале вашего след. хода</em>}
            {c.armed && c.used && <em className="state">перезарядка до конца цикла</em>}

            {isZeroDay && c.armed && !c.used && (
              <em className="state ok">Применяется кнопкой «Взломать» — включите тумблер Zero-Day</em>
            )}
            {isProxy && c.armed && !c.used && (
              <em className="state ok">Применяется кнопкой «Прокси-вход», когда стоите на чужом узле</em>
            )}

            {isPoly && c.armed && !c.used && (
              <div className="poly-box">
                <select value={polyOwn} onChange={(e) => setPolyOwn(e.target.value)}>
                  <option value="">— ваша базовая —</option>
                  {ownBasic.map((x) => <option key={x.uid} value={x.uid}>{CARD_NAMES[x.id]}</option>)}
                </select>
                <select value={polyMarket} onChange={(e) => setPolyMarket(e.target.value)}>
                  <option value="">— с рынка —</option>
                  {marketBasic.map((id) => <option key={id} value={id}>{CARD_NAMES[id]}</option>)}
                </select>
                <button
                  className="btn small"
                  disabled={!polyOwn || !polyMarket || busy}
                  onClick={() => send('ability', { cardId: 'polymorph', uid: polyOwn, newCardId: polyMarket })}
                >
                  Заменить
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
