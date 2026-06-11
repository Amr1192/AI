"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Menu,
  User,
  LogOut,
  FileText,
  Sparkles,
  Mic,
  Briefcase,
  BarChart3,
  LayoutDashboard,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { getStoredUser } from "@/lib/api";

interface UserData {
  id: string | number;
  name: string;
  email: string;
  role?: string;
}

const productLinks = [
  { href: "/create-cv", label: "Create CV", icon: FileText },
  { href: "/enhance-cv", label: "Enhance CV", icon: Sparkles },
  { href: "/interview-setup", label: "Interviews", icon: Mic },
  { href: "/job-search", label: "Job Search", icon: Briefcase },
  { href: "/cv-analysis-pro", label: "CV Analysis", icon: BarChart3 },
];

const marketingLinks = [
  { href: "#features", label: "Features" },
  { href: "#pricing", label: "Pricing" },
  { href: "#about", label: "About" },
  { href: "#contact", label: "Contact" },
];

export default function Header() {
  const pathname = usePathname();
  const [user, setUser] = useState<UserData | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const sync = () => setUser(getStoredUser<UserData>());
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener("userLogin", sync);
    window.addEventListener("userLogout", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("userLogin", sync);
      window.removeEventListener("userLogout", sync);
    };
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("cvmaster_user");
    localStorage.removeItem("cvmaster_token");
    window.dispatchEvent(new CustomEvent("userLogout"));
    window.location.href = "/";
  };

  const isLoggedIn = !!user;
  const isAdmin = user?.role && user.role !== "user";

  const NavLink = ({
    href,
    label,
    icon: Icon,
  }: {
    href: string;
    label: string;
    icon?: React.ComponentType<{ className?: string }>;
  }) => {
    const active = pathname === href || pathname.startsWith(href + "/");
    return (
      <Link
        href={href}
        onClick={() => setMobileOpen(false)}
        className={cn(
          "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
          active
            ? "bg-primary/10 text-primary"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        )}
      >
        {Icon && <Icon className="h-4 w-4" />}
        {label}
      </Link>
    );
  };

  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-lg supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2.5 shrink-0">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent text-sm font-bold text-primary-foreground shadow-sm">
            CV
          </div>
          <span className="hidden font-bold text-foreground sm:inline">CV Master AI</span>
        </Link>

        <nav className="hidden items-center gap-1 lg:flex">
          {isLoggedIn ? (
            <>
              {isAdmin && (
                <NavLink href="/dashboard" label="Dashboard" icon={LayoutDashboard} />
              )}
              {productLinks.map((l) => (
                <NavLink key={l.href} {...l} />
              ))}
            </>
          ) : (
            marketingLinks.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
              >
                {l.label}
              </a>
            ))
          )}
        </nav>

        <div className="flex items-center gap-2">
          {isLoggedIn ? (
            <>
              <Link href="/profile" className="hidden sm:block">
                <Button variant="ghost" size="sm" className="gap-2">
                  <User className="h-4 w-4" />
                  <span className="max-w-[120px] truncate">{user?.name}</span>
                </Button>
              </Link>
              <Button
                variant="outline"
                size="sm"
                onClick={handleLogout}
                className="hidden sm:inline-flex gap-2"
              >
                <LogOut className="h-4 w-4" />
                Logout
              </Button>
            </>
          ) : (
            <Link href="/login" className="hidden sm:block">
              <Button size="sm">Sign In</Button>
            </Link>
          )}

          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[min(100vw-2rem,320px)]">
              <SheetHeader>
                <SheetTitle>Menu</SheetTitle>
              </SheetHeader>
              <div className="mt-6 flex flex-col gap-1">
                {isLoggedIn ? (
                  <>
                    <Link
                      href="/profile"
                      onClick={() => setMobileOpen(false)}
                      className="mb-3 flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm"
                    >
                      <User className="h-4 w-4" />
                      {user?.name}
                    </Link>
                    {isAdmin && (
                      <NavLink href="/dashboard" label="Dashboard" icon={LayoutDashboard} />
                    )}
                    {productLinks.map((l) => (
                      <NavLink key={l.href} {...l} />
                    ))}
                    <Button
                      variant="outline"
                      className="mt-4 gap-2"
                      onClick={() => {
                        setMobileOpen(false);
                        handleLogout();
                      }}
                    >
                      <LogOut className="h-4 w-4" />
                      Logout
                    </Button>
                  </>
                ) : (
                  <>
                    {marketingLinks.map((l) => (
                      <a
                        key={l.href}
                        href={l.href}
                        onClick={() => setMobileOpen(false)}
                        className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
                      >
                        {l.label}
                      </a>
                    ))}
                    <Link href="/login" onClick={() => setMobileOpen(false)} className="mt-4">
                      <Button className="w-full">Sign In</Button>
                    </Link>
                    <Link href="/register" onClick={() => setMobileOpen(false)}>
                      <Button variant="outline" className="mt-2 w-full">
                        Create Account
                      </Button>
                    </Link>
                  </>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
