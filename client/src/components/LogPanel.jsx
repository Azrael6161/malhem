import React, { useEffect, useRef } from 'react';
import { COLOR_HEX } from '../constants.js';

export default function LogPanel({ log = [], players = [] }) {
  const ref = useRef(null);
  useEffect(() => { ref.current?.scrollTo(0, ref.current.scrollHeight); }, [log.length]);

  const byId = Object.fromEntries(players.map((p) => [p.id, p]));

  return (
    <div className="log" ref={ref}>
      {log.map((l, i) => (
        <div className="log-line" key={i}>
          <span className="lr">R{l.round}.{l.phase}</span>
          {l.playerId && (
            <span className="ln" style={{ color: COLOR_HEX[byId[l.playerId]?.color] ?? '#8b9ac4' }}>
              {byId[l.playerId]?.name}
            </span>
          )}
          <span className="lt">{l.text}</span>
        </div>
      ))}
      {!log.length && <div className="empty">журнал пуст</div>}
    </div>
  );
}
