"use client"

import Header from "@/components/header"

/** @deprecated Use Header directly — kept for backward compatibility with existing pages */
export default function DashboardNav({ user: _user }: { user?: unknown }) {
  return <Header />
}
