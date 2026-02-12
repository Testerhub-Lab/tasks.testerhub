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
    <html lang="ru" data-theme="dark" data-main-app-base-url={process.env.MAIN_APP_BASE_URL ?? ""}>
      <body className="antialiased min-h-screen overflow-x-hidden">
        <div className="min-h-screen overflow-x-hidden">
          <div className="app-shell flex min-h-screen overflow-x-hidden">
            <div className="flex-none w-[240px] overflow-x-hidden">
              <Sidebar />
            </div>
            <div className="app-main flex-1 min-w-0 overflow-x-hidden">
              <TopBar />
              <ToastViewport />
              <main className="px-6 pb-10 pt-6">{children}</main>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
};

export default RootLayout;
