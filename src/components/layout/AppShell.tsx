"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

export default function AppShell({ children, sidebar, topbar, toast }: {
  children: ReactNode; sidebar: ReactNode; topbar: ReactNode; toast: ReactNode;
}) {
  const pathname = usePathname();
  const [navigationOpen, setNavigationOpen] = useState(false);
  useEffect(() => {
    if (!navigationOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setNavigationOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [navigationOpen]);
  if (pathname === "/feedback" || pathname.startsWith("/feedback/") || pathname === "/welcome") return <main>{children}</main>;
  const isAuthPage = pathname === "/signin" || pathname === "/register";
  return (
    <div className={`app-shell${isAuthPage ? " app-shell--auth" : ""}`}>
      {!isAuthPage ? <>
        <button type="button" className="app-navigation-toggle" aria-label="Навигация" aria-expanded={navigationOpen} aria-controls="app-navigation" onClick={() => setNavigationOpen((open) => !open)}>
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
        {navigationOpen ? <button className="app-navigation-backdrop" aria-label="Закрыть навигацию" onClick={() => setNavigationOpen(false)} /> : null}
      </> : null}
      <div id="app-navigation" className={`app-navigation${navigationOpen ? " is-open" : ""}`} onClick={(event) => { if ((event.target as HTMLElement).closest("a")) setNavigationOpen(false); }}>{sidebar}</div>
      <div className="app-main">{topbar}{toast}<main className="app-content">{children}</main></div>
    </div>
  );
}
