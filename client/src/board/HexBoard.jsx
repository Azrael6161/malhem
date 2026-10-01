import React, { useEffect, useMemo, useRef, useState } from 'react';
import { hexPath, toPixel, TILE_KEY } from './geometry.js';
import { TILE_LABEL, TRAP_TYPES, COLOR_HEX, POINT_VALUE } from '../constants.js';

const SIZE = 44;

const FILL = {
  unknown: '#131a2c', empty: '#1b2237', start: '#0f2a22',
  basic: '#173a4a', medium: '#16405e', hard: '#2a1f56', router: '#6b5200',
  antivirus: '#4a1620', quarantine: '#3d2c0a', ids: '#3a1436',
};
const STROKE = {
  unknown: '#2b3450', empty: '#2b3450', start: '#2ad39a',
  basic: '#2c7f9e', medium: '#2f8fd0', hard: '#7a5cf0', router: '#ffd24a',
  antivirus: '#c0324a', quarantine: '#c78d1e', ids: '#a83cc0',
};

/**
 * Гекс-поле: зум колесом, панорамирование перетаскиванием.
 *
 * Режимы клика (по приоритету):
 *  1. pending: place_tile / place_router — подсвечены только слоты расширения
 *  2. targetMode — идёт выбор цели для способности (подсветка по валидности)
 *  3. обычный шаг — подсвечены гексы в радиусе перемещения
 */
export default function HexBoard({
  tiles, players, you, currentPlayerId,
  pending, targetMode, onSelect, send, ransomCost,
}) {
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const drag = useRef(null);
  const [hover, setHover] = useState(null);

  const byKey = useMemo(() => new Map(tiles.map((t) => [TILE_KEY(t.q, t.r), t])), [tiles]);
  const me = players.find((p) => p.id === you);
  const myTurn = currentPlayerId === you;
  const interactive = myTurn || !!targetMode;

  const slots = pending?.options ?? null;
  const legalSlots = useMemo(
    () => new Set((slots ?? []).map((s) => TILE_KEY(s.q, s.r))),
    [slots],
  );

  /**
   * Safety-net: если сервер прислал pending на размещение тайла,
   * но доступных слотов нет — ход некуда двигать, зависаем.
   * Автоматически завершаем ход через 'pass'. Защита от повторной
   * отправки — ref, чтобы не заспамить сервер при медленном ответе.
   */
  const autoPassRef = useRef(false);
  useEffect(() => {
    const isPlacement = pending?.type === 'place_tile' || pending?.type === 'place_router';
    if (!isPlacement) {
      autoPassRef.current = false;
      return;
    }
    if (myTurn && legalSlots.size === 0 && !autoPassRef.current) {
      autoPassRef.current = true;
      send('pass', {});
    }
  }, [pending, myTurn, legalSlots, send]);

  /** Гексы, доступные для шага (радиус 1; Worm.exe расширяет — уточняется по руке). */
  const reachable = useMemo(() => {
    if (!myTurn || !me || pending || targetMode) return new Set();
    const range = 1;
    const out = new Set();
    for (let dq = -range; dq <= range; dq++) {
      for (let dr = Math.max(-range, -dq - range); dr <= Math.min(range, -dq + range); dr++) {
        if (!dq && !dr) continue;
        const k = TILE_KEY(me.core.q + dq, me.core.r + dr);
        if (byKey.has(k)) out.add(k);
      }
    }
    return out;
  }, [myTurn, me, pending, targetMode, byKey]);

  /** Валиден ли гекс как цель текущей способности. */
  const isValidTarget = (t) => {
    if (!targetMode) return false;
    const { cardId } = targetMode;
    const mine = t.markers?.some((m) => m.playerId === you);
    const enemy = t.markers?.some((m) => m.playerId !== you);

    switch (cardId) {
      case 'backdoor': return mine;
      case 'ransomware': return mine && enemy;
      case 'logic_bomb': return ['empty', 'basic'].includes(t.type);
      case 'spoofing': return t.type === 'basic' && mine;
      default: return false;
    }
  };

  // Соседи, соседние с выбранным для Spoofing
  const spoofPair = useMemo(() => {
    if (targetMode?.cardId !== 'spoofing' || !targetMode.anchor) return new Set();
    const a = targetMode.anchor;
    const dirs = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
    const out = new Set();
    for (const [dq, dr] of dirs) {
      const t = byKey.get(TILE_KEY(a.q + dq, a.r + dr));
      if (t && t.type === 'basic' && t.markers.some((m) => m.playerId !== you)) {
        out.add(TILE_KEY(t.q, t.r));
      }
    }
    return out;
  }, [targetMode, byKey, you]);

  const onClick = (t) => {
    const k = TILE_KEY(t.q, t.r);

    if (pending?.type === 'place_tile' || pending?.type === 'place_router') {
      if (legalSlots.has(k)) {
        send(pending.type === 'place_router' ? 'placeRouter' : 'placeTile', { slot: { q: t.q, r: t.r } });
      }
      return;
    }
    if (targetMode) {
      if (targetMode.cardId === 'spoofing') {
        onSelect(t);
      } else if (isValidTarget(t)) {
        onSelect(t);
      }
      return;
    }
    if (reachable.has(k)) send('move', { target: { q: t.q, r: t.r } });
  };

  const onWheel = (e) => {
    e.preventDefault();
    const k = Math.min(2.4, Math.max(0.45, view.k * (e.deltaY > 0 ? 0.92 : 1.08)));
    setView((v) => ({ ...v, k }));
  };
  const onDown = (e) => { if (!e.target.closest('[data-hex]')) drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }; };
  const onMove = (e) => {
    if (!drag.current) return;
    setView((v) => ({ ...v, x: drag.current.vx + (e.clientX - drag.current.x), y: drag.current.vy + (e.clientY - drag.current.y) }));
  };
  const onUp = () => { drag.current = null; };

  return (
    <div className="board-wrap">
      <svg className="board" onWheel={onWheel} onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}>
        <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          {tiles.map((t) => {
            const { x, y } = toPixel(t.q, t.r, SIZE);
            const k = TILE_KEY(t.q, t.r);
            const isSlot = legalSlots.has(k);
            const isReach = reachable.has(k);
            const isTarget = isValidTarget(t);
            const isSpoofPair = spoofPair.has(k);
            const markersOn = t.markers ?? [];
            const isStart = t.type === 'start';
            const highlighted = isSlot || isReach || isTarget || isSpoofPair;

            return (
              <g key={k} data-hex={k} transform={`translate(${x} ${y})`}
                 onClick={() => onClick(t)}
                 onMouseEnter={() => setHover(t)} onMouseLeave={() => setHover(null)}
                 style={{ cursor: highlighted ? 'pointer' : 'default' }}>
                <path d={hexPath(0, 0, SIZE - 2)}
                  fill={FILL[t.type] ?? '#1b2237'}
                  stroke={isTarget ? '#39d98a' : isSpoofPair ? '#c07bff' : isSlot ? '#ffd24a' : isReach ? '#3aa7ff' : STROKE[t.type] ?? '#2b3450'}
                  strokeWidth={highlighted ? 3 : 1.5}
                  strokeDasharray={isTarget || isSpoofPair ? '5 3' : undefined} />

                {isStart && <circle r={SIZE * 0.3} fill="none" stroke="#2ad39a" strokeWidth="2" strokeDasharray="4 3" />}
                {TRAP_TYPES.includes(t.type) && <text y="-4" textAnchor="middle" fontSize="17" fill="#fff" opacity="0.9">⚠</text>}
                {t.type === 'router' && <text y="4" textAnchor="middle" fontSize="15" fill="#ffd24a">★</text>}
                {(t.type === 'unknown' || !t.faceUp) && !isStart && (
                  <text y="5" textAnchor="middle" fontSize="15" fill="#41507a">?</text>
                )}

                {t.peek && (
                  <text y={SIZE - 10} textAnchor="middle" fontSize="10" fill="#ffd24a">
                    👁 {TILE_LABEL[t.peek]}
                  </text>
                )}

                {/* Заблокированный маркер (Ransomware) */}
                {(t.blockedFor ?? []).length > 0 && (
                  <g>
                    <text y={-SIZE + 12} textAnchor="middle" fontSize="13">🔒</text>
                    {(t.blockedFor ?? []).some((b) => b.canPay) && (
                      <text y={SIZE - 4} textAnchor="middle" fontSize="9" fill="#ff4d5e">дань {ransomCost}C</text>
                    )}
                  </g>
                )}

                {markersOn.map((m, i) => {
                  const ang = (Math.PI * 2 * i) / Math.max(1, markersOn.length) - Math.PI / 2;
                  const col = COLOR_HEX[players.find((p) => p.id === m.playerId)?.color] ?? '#888';
                  const locked = (t.blockedFor ?? []).some((b) => b.playerId === m.playerId);
                  return (
                    <g key={i} transform={`translate(${Math.cos(ang) * 16} ${Math.sin(ang) * 16 + 10})`}>
                      <circle r={6} fill={col} opacity={locked ? 0.35 : 1} />
                      {locked && <circle r={6} fill="none" stroke="#ff4d5e" strokeWidth="1.5" />}
                    </g>
                  );
                })}

                {(players.filter((p) => p.core.q === t.q && p.core.r === t.r)).map((p, i, arr) => {
                  const dx = (i - (arr.length - 1) / 2) * 14;
                  return (
                    <polygon key={p.id} points="0,-11 9,0 0,11 -9,0" transform={`translate(${dx} -12)`}
                      fill={COLOR_HEX[p.color]}
                      stroke={p.id === currentPlayerId ? '#fff' : 'rgba(0,0,0,.55)'}
                      strokeWidth={p.id === currentPlayerId ? 2 : 1}>
                      <title>{p.name}</title>
                    </polygon>
                  );
                })}
              </g>
            );
          })}
        </g>
      </svg>

      {hover && hover.faceUp && (
        <div className="tile-tip">
          <b>{TILE_LABEL[hover.type] ?? hover.type}</b>
          {POINT_VALUE[hover.type] && <span> · {POINT_VALUE[hover.type]} очк. за захват</span>}
          <div className="tip-coords">q{hover.q} r{hover.r}</div>
        </div>
      )}
    </div>
  );
};