"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { getStoredUser } from "@/lib/api";

export default function CTA() {
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
    <section id="contact" className="bg-primary py-16 text-primary-foreground md:py-24">
      <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
        <h2 className="mb-6 text-3xl font-bold md:text-4xl">Ready to Transform Your Career Path?</h2>
        <p className="mx-auto mb-8 max-w-2xl text-lg text-primary-foreground/80">
          Join thousands of job seekers who have successfully landed their dream jobs with CV Master AI.
          Start your journey today!
        </p>
        {!isLoggedIn ? (
          <Link href="/login">
            <Button size="lg" className="bg-accent px-8 py-6 text-lg text-accent-foreground hover:bg-accent/90">
              Get Started Free
            </Button>
          </Link>
        ) : (
          <Link href="/create-cv">
            <Button size="lg" variant="secondary" className="px-8 py-6 text-lg">
              Build Your CV
            </Button>
          </Link>
        )}
      </div>
    </section>
  );
}
