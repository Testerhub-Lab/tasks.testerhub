import type { Metadata } from "next";
import "./globals.css";
import React from "react";
import TopBar from "../components/layout/TopBar";

export const metadata: Metadata = {
  title: "Tasks Tracker",
  description: "Управляйте задачами легко и быстро",
};

const RootLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <html lang="ru">
      <body className="antialiased">
        <TopBar />
        <main className="px-6 pb-10 pt-6">{children}</main>
      </body>
    </html>
  );
};

export default RootLayout;
