"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { getStoredUser } from "@/lib/api";

const highlights = [
  "AI CV builder & ATS optimizer",
  "Voice mock interviews with feedback",
  "Smart job matching",
];

export default function Hero() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    const sync = () => setIsLoggedIn(!!getStoredUser());
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

  return (
    <section id="home" className="relative overflow-hidden border-b border-border/50">
      <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
        <div className="absolute -top-24 left-1/2 h-[480px] w-[800px] -translate-x-1/2 rounded-full bg-accent/15 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
      </div>

      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 md:py-24 lg:px-8">
        <div className="grid items-center gap-12 md:grid-cols-2">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-4 py-1.5 text-sm font-medium text-accent">
              <Sparkles className="h-4 w-4" />
              Powered by AI
            </div>
            <h1 className="mb-6 text-4xl font-bold leading-tight tracking-tight text-foreground md:text-5xl lg:text-[3.25rem]">
              Your career copilot — from CV to offer
            </h1>
            <p className="mb-8 max-w-lg text-lg leading-relaxed text-muted-foreground">
              Build standout resumes, practice real voice interviews, and discover
              roles matched to your skills — all in one intelligent platform.
            </p>

            <ul className="mb-8 space-y-2">
              {highlights.map((item) => (
                <li key={item} className="flex items-center gap-2 text-sm text-foreground/80">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-accent" />
                  {item}
                </li>
              ))}
            </ul>

            <div className="flex flex-col gap-3 sm:flex-row">
              {!isLoggedIn && (
                <Link href="/login?mode=signup">
                  <Button size="lg" className="w-full gap-2 px-8 shadow-md sm:w-auto">
                    Get Started Free
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              )}
              <Link href={isLoggedIn ? "/create-cv" : "#features"}>
                <Button size="lg" variant="outline" className="w-full px-8 sm:w-auto">
                  {isLoggedIn ? "Go to Dashboard" : "See Features"}
                </Button>
              </Link>
            </div>
          </div>

          <div className="relative">
            <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-xl shadow-primary/5">
              <Image
                src="/professional-team-working-on-cv.jpg"
                alt="Team collaborating on career documents"
                width={800}
                height={600}
                className="aspect-[4/3] w-full object-cover"
                priority
              />
            </div>
            <div className="absolute -bottom-4 -right-2 rounded-xl border border-border bg-card px-5 py-3 shadow-lg sm:-right-4">
              <p className="text-sm font-semibold text-foreground">4.9 / 5</p>
              <p className="text-xs text-muted-foreground">from 2,000+ users</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
