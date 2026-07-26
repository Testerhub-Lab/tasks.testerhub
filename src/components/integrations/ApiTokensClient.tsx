"use client";

import { useState } from "react";
import {
  createApiTokenAction,
  revokeApiTokenAction,
} from "@/server/actions/apiTokens";
import {
  API_SCOPES,
  API_SCOPE_LABELS,
  type ApiScope,
} from "@/server/api/scopes";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import { toast } from "@/components/ui/toast";

type ApiTokenRow = {
  id: string;
  name: string;
  tokenPrefix: string;
  scopes: string[];
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

type ApiTokensClientProps = {
  initialTokens: ApiTokenRow[];
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function ApiTokensClient({
  initialTokens,
}: ApiTokensClientProps) {
  const [tokens, setTokens] = useState(initialTokens);
  const [name, setName] = useState("Codex desktop");
  const [scopes, setScopes] = useState<ApiScope[]>([...API_SCOPES]);
  const [expiresInDays, setExpiresInDays] = useState<30 | 90 | 365 | null>(365);
  const [plainToken, setPlainToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const toggleScope = (scope: ApiScope) => {
    setScopes((current) =>
      current.includes(scope)
        ? current.filter((item) => item !== scope)
        : [...current, scope]
    );
  };

  const createToken = async () => {
    setBusy(true);
    const result = await createApiTokenAction({
      name,
      scopes,
      expiresInDays,
    });
    setBusy(false);

    if (!result.ok) {
      toast.error("Не удалось создать токен", result.formError);
      return;
    }

    setPlainToken(result.plainToken);
    setTokens((current) => [result.token, ...current]);
    toast.success("API-токен создан");
  };

  const revokeToken = async (tokenId: string) => {
    setBusy(true);
    const result = await revokeApiTokenAction({ tokenId });
    setBusy(false);

    if (!result.ok) {
      toast.error("Не удалось отозвать токен", result.formError);
      return;
    }

    setTokens((current) =>
      current.map((token) =>
        token.id === tokenId
          ? { ...token, revokedAt: result.revokedAt }
          : token
      )
    );
    toast.success("API-токен отозван");
  };

  const copyToken = async () => {
    if (!plainToken) return;
    await navigator.clipboard.writeText(plainToken);
    toast.success("Токен скопирован");
  };

  return (
    <div className="space-y-5">
      <Card className="space-y-4">
        <div>
          <h1 className="text-xl font-semibold text-white">
            API и интеграции
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-white/50">
            Персональные токены выполняют операции от вашего имени и не могут
            обойти права workspace или проекта.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_180px]">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Название токена"
            aria-label="Название токена"
          />
          <select
            value={expiresInDays ?? "never"}
            onChange={(event) => {
              const value = event.target.value;
              setExpiresInDays(
                value === "never"
                  ? null
                  : (Number(value) as 30 | 90 | 365)
              );
            }}
            className="h-10 rounded-md border border-white/10 bg-[#11162a] px-3 text-sm text-white"
            aria-label="Срок действия"
          >
            <option value="30">30 дней</option>
            <option value="90">90 дней</option>
            <option value="365">1 год</option>
            <option value="never">Без срока</option>
          </select>
        </div>

        <div className="grid gap-2 md:grid-cols-2">
          {API_SCOPES.map((scope) => (
            <label
              key={scope}
              className="flex cursor-pointer items-start gap-3 rounded-md border border-white/10 p-3"
            >
              <input
                type="checkbox"
                checked={scopes.includes(scope)}
                onChange={() => toggleScope(scope)}
                className="mt-0.5"
              />
              <span>
                <span className="block text-sm text-white/85">
                  {API_SCOPE_LABELS[scope]}
                </span>
                <code className="text-xs text-cyan-300/70">{scope}</code>
              </span>
            </label>
          ))}
        </div>

        <Button
          onClick={createToken}
          disabled={busy || name.trim().length < 2 || scopes.length === 0}
        >
          {busy ? "Создаём…" : "Создать токен"}
        </Button>
      </Card>

      {plainToken ? (
        <Card className="space-y-3 border border-amber-300/25">
          <div>
            <h2 className="font-semibold text-amber-100">
              Сохраните токен сейчас
            </h2>
            <p className="mt-1 text-sm text-white/50">
              После закрытия страницы полное значение больше не показывается.
            </p>
          </div>
          <div className="flex flex-col gap-2 md:flex-row">
            <code className="min-w-0 flex-1 break-all rounded-md bg-black/25 p-3 text-xs text-cyan-100">
              {plainToken}
            </code>
            <Button variant="secondary" onClick={copyToken}>
              Копировать
            </Button>
          </div>
        </Card>
      ) : null}

      <Card padding="none">
        <div className="border-b border-white/10 p-4">
          <h2 className="font-semibold text-white">Ваши токены</h2>
        </div>
        {tokens.length === 0 ? (
          <p className="p-4 text-sm text-white/50">
            Персональных API-токенов пока нет.
          </p>
        ) : (
          <div className="divide-y divide-white/10">
            {tokens.map((token) => {
              const isRevoked = Boolean(token.revokedAt);
              return (
                <div
                  key={token.id}
                  className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-white">
                        {token.name}
                      </span>
                      <code className="text-xs text-cyan-300/70">
                        {token.tokenPrefix}…
                      </code>
                      <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] uppercase text-white/45">
                        {isRevoked ? "Отозван" : "Активен"}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-white/40">
                      Создан: {formatDate(token.createdAt)} · Последнее
                      использование: {formatDate(token.lastUsedAt)} · Истекает:{" "}
                      {formatDate(token.expiresAt)}
                    </p>
                    <p className="mt-1 truncate text-xs text-white/35">
                      {token.scopes.join(", ")}
                    </p>
                  </div>
                  {!isRevoked ? (
                    <Button
                      variant="ghost"
                      onClick={() => revokeToken(token.id)}
                      disabled={busy}
                    >
                      Отозвать
                    </Button>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
