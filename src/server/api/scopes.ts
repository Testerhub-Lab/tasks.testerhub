export const API_SCOPES = [
  "projects:read",
  "projects:write",
  "issues:read",
  "issues:write",
  "wiki:read",
  "wiki:write",
] as const;

export type ApiScope = (typeof API_SCOPES)[number];

export const API_SCOPE_LABELS: Record<ApiScope, string> = {
  "projects:read": "Просмотр проектов",
  "projects:write": "Создание проектов",
  "issues:read": "Чтение задач и комментариев",
  "issues:write": "Создание и изменение задач",
  "wiki:read": "Чтение Wiki",
  "wiki:write": "Создание и изменение Wiki",
};

const API_SCOPE_SET = new Set<string>(API_SCOPES);

export function isApiScope(value: string): value is ApiScope {
  return API_SCOPE_SET.has(value);
}

export function normalizeApiScopes(scopes: readonly string[]): ApiScope[] {
  return [...new Set(scopes.filter(isApiScope))];
}

export function hasApiScopes(
  grantedScopes: readonly string[],
  requiredScopes: readonly ApiScope[]
): boolean {
  const granted = new Set(grantedScopes);
  return requiredScopes.every((scope) => granted.has(scope));
}
