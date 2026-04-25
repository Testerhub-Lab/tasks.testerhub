# AuthZ (MVP)

## Роли
- guest
- user
- admin

## Принцип
- Удаления задач нет: ошибочные/ненужные задачи закрываются статусом (Rejected/Done и т.п.).

## Матрица прав (MVP)

### Task
- guest: create/status/priority/comment только если project.allowGuest=true
- user: create/status/priority/comment (везде, пока нет ACL)
- admin: то же, что user + управление Project (когда появится UI)

### Project
- guest/user: read-only
- admin: create/edit project, toggle allowGuest (позже)

## Ownership
- Пока не вводим: правила завязаны на allowGuest + role.
