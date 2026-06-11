"use client";

import Header from "@/components/header";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      {children}
    </>
  );
}
