#!/usr/bin/env bash
# Запуск Malhem в один клик: сервер + клиент.
# Использование:  ./start.sh
set -e
cd "$(dirname "$0")"

echo "→ Проверяю зависимости…"
[ -d server/node_modules ] || (echo "  ставлю зависимости сервера" && cd server && npm install -q && cd ..)
[ -d client/node_modules ] || (echo "  ставлю зависимости клиента" && cd client && npm install -q && cd ..)

echo "→ Поднимаю сервер на :8080"
(cd server && node index.js) &
SERVER_PID=$!
sleep 1.5

echo "→ Поднимаю клиент на :5173"
(cd client && npm run dev) &
CLIENT_PID=$!

cleanup() {
  echo
  echo "→ Останавливаю…"
  kill $SERVER_PID $CLIENT_PID 2>/dev/null || true
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

cat <<'EOF'

  ┌──────────────────────────────────────────────┐
  │  MALHEM запущен                              │
  │                                              │
  │  Открой в браузере  http://localhost:5173    │
  │  Создай партию → получишь 6-значный код      │
  │  Друзья открывают ту же ссылку и вводят код  │
  │                                              │
  │  Ctrl+C — остановить                         │
  └──────────────────────────────────────────────┘

EOF

wait
