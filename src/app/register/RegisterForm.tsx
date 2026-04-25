"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

export default function RegisterForm({ redirect }: { redirect: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name, email, password }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "Не удалось зарегистрироваться.");
        return;
      }

      router.push(redirect);
      router.refresh();
    } catch {
      setError("Не удалось зарегистрироваться.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="flex flex-col gap-3" onSubmit={onSubmit}>
      <Input
        type="text"
        placeholder="Имя"
        value={name}
        onChange={(event) => setName(event.target.value)}
        autoComplete="name"
      />
      <Input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        required
        autoComplete="email"
      />
      <Input
        type="password"
        placeholder="Пароль (минимум 8 символов)"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        required
        minLength={8}
        autoComplete="new-password"
      />
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      <Button variant="primary" className="w-full" type="submit" disabled={loading}>
        {loading ? "Создаем..." : "Создать аккаунт"}
      </Button>
    </form>
  );
}
