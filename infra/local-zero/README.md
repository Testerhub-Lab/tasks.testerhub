# Локальная проверка дизайна с Zero

Изолированный контур с production-сборкой Next.js: Node 24.18.0,
PostgreSQL 18.4, Zero 1.8.0, `PULSAR_AUTH_STORE=zero`.
Рабочие данные и секреты прода сюда не копируются. Для S3 используется
LocalStack 4.14.0; проверка подписи presigned URL включена.

Все команды выполняются из корня репозитория в PowerShell с запущенным Docker Desktop.

1. Скопировать `.env.example` в `.env.local` в этой папке. Задать три разных
   случайных hex-пароля и подставить пароли ролей в два PostgreSQL URL.
   Секрет S3 оставить `test`: его ожидает LocalStack для presigned URL.
   `.env.local` исключён из Git и Docker build context.
2. Запустить:

   ```powershell
   docker compose --env-file infra/local-zero/.env.local -f infra/local-zero/compose.yml up -d --build
   ```

3. После healthy у zero-cache выдать приложению ограниченные права на
   подтверждения мутаций Zero. Его служебная схема создаётся при первом запуске
   zero-cache, поэтому этот шаг выполняется после запуска, а не при init БД:

   ```powershell
   Get-Content infra/local-zero/zero-mutator-grants.sql -Raw | docker compose --env-file infra/local-zero/.env.local -f infra/local-zero/compose.yml exec -T postgres psql -v ON_ERROR_STOP=1 -U pulsar_zero -d pulsar
   ```

4. Создать тестовые данные и проверить границы доступа:

   ```powershell
   node --env-file=infra/local-zero/.env.local --import tsx scripts/local-zero-seed.ts
   node --env-file=infra/local-zero/.env.local --import tsx scripts/zero-stage2-permissions-check.ts
   ```

Адрес приложения: <http://127.0.0.1:3014/pulsar/board>.
Диагностический live-клиент: <http://127.0.0.1:3014/zero>.
Zero cache: `127.0.0.1:4849`; PostgreSQL: `127.0.0.1:55433`;
S3: `127.0.0.1:9010`. Порты опубликованы только на loopback.

Тестовые учётные записи, пароль у всех `Pulsar-local-zero-2026`:

| Email | Роль в TesterHub |
| --- | --- |
| qa-zero@pulsar.local | OWNER |
| maria-zero@pulsar.local | MEMBER |
| viewer-zero@pulsar.local | VIEWER |

Seed ограничен адресом `127.0.0.1:55433/pulsar` и флагом `LOCAL_ZERO_QA=true`.
Повторный запуск сохраняет существующие задачи и тексты Wiki.
Пользователь MEMBER также имеет своё личное пространство; для проверки общего
пространства требуется выбрать TesterHub.

Остановить с сохранением тестовых данных:

```powershell
docker compose --env-file infra/local-zero/.env.local -f infra/local-zero/compose.yml down
```

Отличия от прода и результаты проверки описаны в `docs/zero-design-verification.md`.
