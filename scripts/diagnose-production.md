# Диагностика продакшена (pulsar.testerhub.ru)

Выполнять **на сервере**, где развёрнуто приложение. При необходимости подставить свои имена контейнеров/образов.

---

## 1. Проверить, что вообще запущено

```bash
# Docker установлен и демон работает?
docker info

# Все контейнеры (в т.ч. остановленные)
docker ps -a

# Контейнеры по образу/имени приложения
docker ps -a --filter "ancestor=ghcr.io/testerhub-lab/tasks.testerhub:latest"
docker ps -a --filter "name=web"
# или по имени проекта (если запускали docker compose -p ...)
docker ps -a
```

---

## 2. Логи приложения (главное для ошибки)

```bash
# Имя контейнера смотри в выводе docker ps -a (столбец NAMES или последняя колонка)
CONTAINER_NAME="tasks-testerhub-web-1"   # или как у тебя

# Последние 100 строк логов
docker logs --tail 100 "$CONTAINER_NAME"

# Логи в реальном времени (запусти и открой сайт в браузере)
docker logs -f "$CONTAINER_NAME"

# С таймстампами
docker logs -t --tail 200 "$CONTAINER_NAME"
```

В логах ищи: `DATABASE_URL is not set`, `Error:`, `ECONNREFUSED`, `relation "..." does not exist`, стек Next.js.

---

## 3. Переменные окружения внутри контейнера

```bash
CONTAINER_NAME="tasks-testerhub-web-1"   # подставь своё

# Все env
docker exec "$CONTAINER_NAME" env

# Только важные (без значений, чтобы не светить секреты в логах)
docker exec "$CONTAINER_NAME" env | grep -E '^DATABASE_URL=|^MAIN_APP_BASE_URL=|^NODE_ENV='

# Проверить, что переменные заданы (вывод только имена)
docker exec "$CONTAINER_NAME" sh -c 'echo DATABASE_URL is ${DATABASE_URL:+set}; echo MAIN_APP_BASE_URL is ${MAIN_APP_BASE_URL:+set}'
```

Если `DATABASE_URL` или `MAIN_APP_BASE_URL` пустые — в контейнер не попали (проверь `env_file: .env` и путь к `.env` при `docker compose up`).

---

## 4. Доступность базы из контейнера

Если БД на хосте или в другом контейнере, из контейнера `web` хост `localhost` — это сам контейнер, а не сервер.

```bash
CONTAINER_NAME="tasks-testerhub-web-1"

# Из контейнера пинг до хоста (если БД на хосте, часто используют host.docker.internal)
docker exec "$CONTAINER_NAME" sh -c 'nc -zv "${DATABASE_URL#*@}" 5432 2>&1 || true'

# Или вручную: подставь хост из DATABASE_URL (например postgres или host.docker.internal)
docker exec "$CONTAINER_NAME" sh -c 'apk add --no-cache postgresql-client 2>/dev/null; psql "$DATABASE_URL" -c "SELECT 1" 2>&1'
```

Если `DATABASE_URL` вида `postgresql://...@localhost:5432/...` — заменить в проде на хост, доступный из контейнера (отдельный контейнер postgres — имя сервиса, БД на хосте — `host.docker.internal` на Linux может потребовать `extra_hosts` в compose).

---

## 5. Сеть и порты

```bash
# Слушает ли что-то на 3000 внутри контейнера
docker exec "$CONTAINER_NAME" sh -c 'wget -qO- http://127.0.0.1:3000 2>&1 | head -5'

# Проброс портов (должен быть 3000:3000 или APP_PORT:3000)
docker port "$CONTAINER_NAME"
```

---

## 6. Если приложение без Docker (systemd / node напрямую)

```bash
# Процесс Next/Node
ps aux | grep -E 'node|next'

# Переменные окружения процесса (подставь PID из предыдущей команды)
sudo cat /proc/<PID>/environ | tr '\0' '\n' | grep -E 'DATABASE_URL|MAIN_APP_BASE_URL'

# Логи (если через systemd)
journalctl -u tasks-testerhub -n 100 --no-pager
# или как называется сервис
journalctl -u your-app-service -n 100 --no-pager
```

---

## 7. Краткий чеклист одной копипастой

```bash
echo "=== Docker containers ==="
docker ps -a --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

echo ""
echo "=== Env in container (keys only) ==="
C=$(docker ps -q --filter "ancestor=ghcr.io/testerhub-lab/tasks.testerhub:latest" | head -1)
if [ -n "$C" ]; then
  docker exec "$C" env | grep -E '^DATABASE_URL=|^MAIN_APP_BASE_URL=|^NODE_ENV=' | sed 's/=.*/=***/'
else
  echo "No container found for tasks.testerhub image"
fi

echo ""
echo "=== Last 30 log lines ==="
[ -n "$C" ] && docker logs --tail 30 "$C" 2>&1
```

---

## 8. После правок

```bash
# Перезапуск контейнера (подхватит новый .env при следующем старте)
docker compose restart web

# Или полный пересоздание с новым образом
docker compose pull
docker compose up -d --force-recreate web
```

Самый быстрый способ найти причину — посмотреть **логи в момент запроса** к pulsar.testerhub.ru (п. 2) и проверить **env в контейнере** (п. 3).
