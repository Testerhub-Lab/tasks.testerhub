import type { Metadata } from "next";
import "./globals.css";
import React from "react";
import TopBar from "../components/layout/TopBar";
import Sidebar from "../components/layout/Sidebar";
import ToastViewport from "@/components/ui/ToastViewport";

export const metadata: Metadata = {
  title: "Tasks Tracker",
  description: "Управляйте задачами легко и быстро",
};

const RootLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <html lang="ru" data-theme="dark">
      <body className="antialiased min-h-screen overflow-x-clip">
        <div className="app-shell">
          <Sidebar />
          <div className="app-main">
            <TopBar />
            <ToastViewport />
            <main className="px-6 pb-10 pt-6">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
};

export default RootLayout;
