import React from 'react';
import { CARD_NAMES } from '../constants.js';

/** Шаги, требующие выбора от игрока: расширение сети, сброс карты (IDS), стыковка Маршрутизатора. */
export default function PendingOverlay({ state, send }) {
  const p = state.pending;
  if (!p) return null;

  if (p.waitingFor) {
    return <div className="pending-bar">Ожидание хода игрока <b>{p.waitingForName ?? '—'}</b>…</div>;
  }

  if (p.type === 'choose_drop') {
    return (
      <div className="modal">
        <div className="card-box">
          <h3>IDS-ловушка</h3>
          <p className="hint">Выберите способность, которую сбрасываете на рынок (сильные карты не теряются).</p>
          {(p.options ?? []).map((o) => (
            <button key={o.uid} className="btn" onClick={() => send('chooseDrop', { uid: o.uid })}>
              {CARD_NAMES[o.id] ?? o.name}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (p.type === 'choose_expansion') {
    return (
      <div className="modal">
        <div className="card-box">
          <h3>Ботнет-сканер</h3>
          <p className="hint">Вы видите верхние тайлы резерва. Один берёте, второй вернётся в колоду.</p>
          {(p.options ?? []).map((o, i) => (
            <button key={i} className="btn" onClick={() => send('placeTile', { reserveIndex: i })}>
              {o.type === 'basic' ? 'Базовый узел' :
               o.type === 'medium' ? 'Средний узел' :
               o.type === 'hard' ? 'Сложный узел' :
               o.type === 'antivirus' ? 'Антивирус' :
               o.type === 'quarantine' ? 'Карантин-зона' :
               o.type === 'ids' ? 'IDS-ловушка' : 'Пустой гекс'}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (p.type === 'place_router') {
    return <div className="pending-bar gold">Выберите гекс с золотой обводкой, чтобы пристыковать Маршрутизатор</div>;
  }

  if (p.type === 'place_tile') {
    return <div className="pending-bar">Обязательное расширение сети: выберите подсвеченный гекс</div>;
  }

  return null;
}
