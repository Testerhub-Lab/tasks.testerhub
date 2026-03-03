# Авторизация через Authentik (OIDC)

Если Authentik развёрнут на `auth.testerhub.ru`, приложение можно использовать как OIDC Relying Party: кнопка «Sign in» будет перенаправлять в Authentik, после входа пользователь возвращается в Tasks с созданной сессией.

## 1. Настройка в Authentik

У тебя уже есть провайдер **testerhub-oidc-pulsar** с Issuer  
`https://auth.testerhub.ru/application/o/pulsar/` и Redirect URI  
`https://pulsar.testerhub.ru/api/auth/callback/authentik` — этого достаточно.

Дополнительно в Authentik ничего настраивать не нужно. URL авторизации, токена и userinfo приложение получает сам через OpenID Discovery по Issuer.

Если создаёшь провайдер с нуля:
- **Redirect URI**: `https://pulsar.testerhub.ru/api/auth/callback/authentik`
- Сохрани **Client ID** и **Client Secret** (понадобятся в `.env`).
- **Application** с slug, например `pulsar` — тогда Issuer будет  
  `https://auth.testerhub.ru/application/o/pulsar/`

## 2. Переменные окружения

В `.env` на сервере (или в окружении контейнера) задайте:

```env
AUTHENTIK_ISSUER=https://auth.testerhub.ru/application/o/pulsar
AUTHENTIK_CLIENT_ID=<Client ID из Provider, например DamqSdfg...>
AUTHENTIK_CLIENT_SECRET=<Client Secret из Authentik — в интерфейсе провайдера, кнопка «Редактировать»>
```

После этого **не нужно** задавать `MAIN_APP_BASE_URL` для входа: приложение будет использовать только Authentik для кнопки «Sign in» и создания сессии.

## 3. Scopes и атрибуты пользователя

Используются scope: `openid email profile`. В пользователе ожидаются:

- **sub** (обязательно) — уникальный идентификатор пользователя в Authentik  
- **email** (рекомендуется) — для отображения и привязки пользователя в Tasks  

Если в userinfo нет `email`, вход завершится ошибкой. В Provider в Authentik можно настроить *Scope mapping* и убедиться, что в ответ уходит `email` (и при необходимости `name`).

## 4. Проверка

1. Перезапустить приложение (чтобы подхватить env).  
2. Открыть https://pulsar.testerhub.ru, нажать «Sign in».  
3. Должен открыться Authentik, после входа — редирект обратно в Tasks с созданной сессией.

Ошибки обмена кода или userinfo пишутся в логи сервера (и при неуспехе редирект на `/sso/error`).
