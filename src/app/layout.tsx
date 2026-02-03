import type { Metadata } from "next";
import "./globals.css";
import React from "react";
import TopBar from "../components/layout/TopBar";
import ToastViewport from "@/components/ui/ToastViewport";

export const metadata: Metadata = {
  title: "Tasks Tracker",
  description: "Управляйте задачами легко и быстро",
};

const RootLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <html lang="ru" data-main-app-base-url={process.env.MAIN_APP_BASE_URL ?? ""}>
      <body className="antialiased">
        <TopBar />
        <ToastViewport />
        <main className="px-6 pb-10 pt-6">{children}</main>
      </body>
    </html>
  );
};

export default RootLayout;
