# Pulsar MCP

Локальный STDIO MCP-адаптер для Pulsar. Он не обращается к базе данных и
использует только защищённый HTTPS API.

## Переменные окружения

- `PULSAR_API_TOKEN` — обязательный персональный токен;
- `PULSAR_BASE_URL` — необязательный URL, по умолчанию
  `https://pulsar.testerhub.ru`.

## Команды

```bash
npm run mcp:build
npm run mcp:start
```

Для локальной разработки:

```bash
npm run mcp:dev
```

Не выводите диагностические сообщения в stdout: этот поток зарезервирован
протоколом MCP. Для диагностики используйте stderr.

## Инструменты

Адаптер позволяет:

- читать доступные workspaces и проекты;
- искать, читать, создавать и обновлять задачи;
- добавлять комментарии;
- получать временную ссылку на вложение через `get_attachment_download_url`
  (`key`, `attachmentId` из ответа `get_issue`);
- читать, искать, создавать и версионировать Wiki-страницы;
- связывать задачи с Wiki.

Все права вычисляет Pulsar API от имени владельца персонального токена. MCP не
может увидеть проект или Wiki, к которым у пользователя нет доступа.

### Релизы

- `list_releases` (`projectKey`) возвращает релизы проекта и их ID.
- `create_release` (`projectKey`, `title`, необязательные `goal` и `plannedDate`)
  создаёт черновик.
- `add_issues_to_release` (`projectKey`, `releaseId`, `issueKeys`) добавляет
  существующие задачи того же проекта в открытый релиз.
- `close_release` (`projectKey`, `releaseId`) переводит релиз в статус `released`.
- `update_release_date` (`projectKey`, `releaseId`, `plannedDate`) меняет плановую
  дату в формате `YYYY-MM-DD`. Значение `null` очищает дату.

Для ссылки на вложение нужен scope `issues:read`, для просмотра релизов —
`projects:read`, для изменения релизов — `projects:write`. Добавление задач
также требует `issues:write`.
