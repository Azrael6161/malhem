import React from 'react';
import { COLOR_HEX } from '../constants.js';

export default function Scoreboard({ state, detailed }) {
  const rows = state.finalScores?.length
    ? state.finalScores
    : [...state.players].sort((a, b) => b.points - a.points)
        .map((p) => ({ id: p.id, name: p.name, score: p.points, coins: p.coins }));

  return (
    <table className="scores">
      <thead>
        <tr><th>Вирус</th><th title="Сумма всех захватов">Очки</th><th>Ко́ины</th><th>Узлов</th></tr>
      </thead>
      <tbody>
        {rows.map((r, i) => {
          const p = state.players.find((x) => x.id === r.id);
          const held = state.tiles.filter((t) => t.markers?.some((m) => m.playerId === r.id)).length;
          return (
            <tr key={r.id} className={i === 0 ? 'lead' : ''}>
              <td>
                <span className="dot" style={{ background: COLOR_HEX[p?.color] }} />
                {r.name}
                {r.tiebreak != null && <em> ничья: d6 {r.roll} + {r.coins} C</em>}
              </td>
              <td><b>{r.score}</b></td>
              <td>{p?.coins ?? '—'}</td>
              <td>{held}</td>
            </tr>
          );
        })}
      </tbody>
      {detailed && (
        <tfoot>
          <tr>
            <td colSpan={4} className="fine">
              Очки — сумма всех захватов за партию; узел можно потерять, но очки остаются.
              Бонусы симбиотических карт (CryptoLocker) уже учтены.
            </td>
          </tr>
        </tfoot>
      )}
    </table>
  );
}
