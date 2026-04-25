"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type UseDebouncedQueryParamOptions = {
  key: string;
  debounceMs?: number;
  scroll?: boolean;
  trim?: boolean;
  basePath?: string;
};

export function useDebouncedQueryParam({
  key,
  debounceMs = 300,
  scroll = false,
  trim = true,
  basePath,
}: UseDebouncedQueryParamOptions) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  // актуальное значение из URL
  const urlValue = useMemo(() => searchParams.get(key) ?? "", [searchParams, key]);

  // локальный draft — нужен только во время редактирования
  const [draft, setDraft] = useState<string>(urlValue);
  const [isEditing, setIsEditing] = useState<boolean>(false);

  // таймер для debounce
  const tRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const getLatestParams = useCallback(() => {
    // берём самый актуальный search (чтобы не затирать чужие параметры из замыканий)
    if (typeof window !== "undefined") return new URLSearchParams(window.location.search);
    // на всякий — fallback, хотя хук client-only
    return new URLSearchParams(searchParams.toString());
  }, [searchParams]);

  const commit = useCallback(
    (nextRaw: string) => {
      const next = trim ? nextRaw.trim() : nextRaw;

      const params = getLatestParams();
      const current = params.get(key) ?? "";

      if (current === next) {
        // уже в URL — просто выходим из режима редактирования
        setIsEditing(false);
        return;
      }

      if (next) params.set(key, next);
      else params.delete(key);

      const query = params.toString();
      const targetPath = basePath ?? pathname;
      const href = query ? `${targetPath}?${query}` : targetPath;

      startTransition(() => {
        router.replace(href, { scroll });
      });

      setIsEditing(false);
    },
    [basePath, getLatestParams, key, pathname, router, scroll, startTransition, trim]
  );

  // local draft -> URL (debounced)
  useEffect(() => {
    if (!isEditing) return;

    if (tRef.current) clearTimeout(tRef.current);

    tRef.current = setTimeout(() => {
      commit(draft);
    }, debounceMs);

    return () => {
      if (tRef.current) clearTimeout(tRef.current);
    };
  }, [debounceMs, draft, commit, isEditing]);

  const setValue = useCallback((next: string) => {
    if (!isEditing) setIsEditing(true);
    setDraft(next);
  }, [isEditing]);

  const flush = useCallback(() => {
    if (tRef.current) clearTimeout(tRef.current);
    commit(draft);
  }, [commit, draft]);

  const resetToUrl = useCallback(() => {
    if (tRef.current) clearTimeout(tRef.current);
    setIsEditing(false);
    setDraft(urlValue);
  }, [urlValue]);

  // что показываем в UI:
  // - если редактируем → draft
  // - если нет → urlValue (без “URL -> setState” эффекта)
  const value = isEditing ? draft : urlValue;

  return {
    value,
    setValue,
    flush,
    resetToUrl,
    urlValue,
    isEditing,
  };
}
