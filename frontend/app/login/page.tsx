"use client"

import type React from "react"
import { useState, Suspense } from "react"
import Image from "next/image"
import { Eye, EyeOff, Loader2 } from "lucide-react"
import { authService } from "@/lib/authService"

function LoginPageContent() {
  const [loading, setLoading] = useState(false)
  const [socialLoading, setSocialLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      if (!email || !password) {
        setError("Please fill in all fields")
        return
      }

      const response = await authService.login({ email, password })

      if (response?.user) {
        window.dispatchEvent(new CustomEvent("userLogin"))
        window.location.href = "/"
      } else {
        setError("Invalid credentials. Please check your email and password.")
      }
    } catch {
      setError("Authentication failed. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const handleSocialAuth = async (provider: string) => {
    setSocialLoading(true)
    try {
      const user = {
        id: Math.random().toString(36).substr(2, 9),
        email: `user@${provider}.com`,
        name: `${provider} User`,
        provider,
        createdAt: new Date().toISOString(),
      }
      localStorage.setItem("cvmaster_user", JSON.stringify(user))
      window.dispatchEvent(new CustomEvent("userLogin"))
      window.location.href = "/"
    } catch {
      setError(`${provider} authentication failed. Please try again.`)
    } finally {
      setSocialLoading(false)
    }
  }

  return (
    <div className="relative flex min-h-screen w-full flex-col overflow-x-hidden bg-background">
      <div className="flex flex-1">
        <div className="flex w-full flex-col md:flex-row">
          <div className="relative hidden min-h-[calc(100vh-4rem)] w-full overflow-hidden md:flex md:w-1/2">
            <Image
              src="/auth-career-hero.png"
              alt="Team reviewing a professional resume together"
              fill
              className="object-cover"
              priority
            />
            <div className="absolute inset-0 bg-gradient-to-t from-primary/90 via-primary/40 to-primary/20" />
            <div className="relative z-10 flex flex-col justify-end p-10 lg:p-14 text-white">
              <h1 className="text-3xl font-bold leading-tight tracking-tight lg:text-4xl">
                Your Career, Supercharged.
              </h1>
              <p className="mt-3 max-w-md text-lg text-white/85">
                Build the future of your career with AI-powered tools and insights.
              </p>
            </div>
          </div>

          <div className="flex w-full flex-col items-center justify-center bg-background p-8 dark:bg-gray-900 md:w-1/2 lg:p-16">
            <div className="flex flex-col max-w-[480px] flex-1 w-full">
              <h1 className="text-foreground dark:text-slate-50 tracking-light text-[32px] font-bold leading-tight px-4 text-left pb-3 pt-6">
                Welcome Back
              </h1>

              {error && (
                <div className="mx-4 mb-4 bg-red-500/20 border border-red-500/50 text-red-700 dark:text-red-200 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="flex max-w-[480px] flex-col gap-4 px-4 py-3">
                <label className="flex flex-col min-w-40 flex-1">
                  <p className="text-foreground dark:text-slate-300 text-base font-medium leading-normal pb-2">Email</p>
                  <div className="flex w-full flex-1 items-stretch rounded-lg border border-border dark:border-gray-600 bg-input dark:bg-gray-800 form-input-container">
                    <input
                      className="form-input flex w-full min-w-0 flex-1 resize-none overflow-hidden rounded-lg text-foreground dark:text-slate-50 focus:outline-0 focus:ring-0 border-0 bg-transparent h-14 placeholder:text-muted-foreground dark:placeholder-gray-500 p-[15px] text-base font-normal leading-normal"
                      placeholder="Enter your email"
                      type="email"
                      name="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                </label>

                <label className="flex flex-col min-w-40 flex-1">
                  <p className="text-foreground dark:text-slate-300 text-base font-medium leading-normal pb-2">
                    Password
                  </p>
                  <div className="flex w-full flex-1 items-stretch rounded-lg border border-border dark:border-gray-600 bg-input dark:bg-gray-800 form-input-container">
                    <input
                      className="form-input flex w-full min-w-0 flex-1 resize-none overflow-hidden rounded-lg text-foreground dark:text-slate-50 focus:outline-0 focus:ring-0 border-0 bg-transparent h-14 placeholder:text-muted-foreground dark:placeholder-gray-500 p-[15px] pr-2 text-base font-normal leading-normal"
                      placeholder="Enter your password"
                      type={showPassword ? "text" : "password"}
                      name="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="text-muted-foreground dark:text-gray-400 flex items-center justify-center pr-[15px] cursor-pointer hover:text-foreground transition"
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </label>

                <a className="text-primary text-sm font-medium text-right hover:underline" href="/forget-password">
                  Forgot Password?
                </a>

                <button
                  type="submit"
                  disabled={loading || socialLoading}
                  className="primary-button flex min-w-[84px] w-full cursor-pointer items-center justify-center overflow-hidden rounded-lg h-12 px-5 bg-primary text-white text-base font-bold leading-normal tracking-[0.015em] disabled:opacity-50 disabled:cursor-not-allowed mt-4"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Signing in...
                    </>
                  ) : (
                    "Login"
                  )}
                </button>
              </form>

              <div className="flex items-center px-4 py-3">
                <hr className="flex-grow border-t border-border dark:border-gray-600" />
                <span className="px-3 text-sm text-muted-foreground dark:text-gray-400">Or continue with</span>
                <hr className="flex-grow border-t border-border dark:border-gray-600" />
              </div>

              <div className="flex flex-col sm:flex-row gap-4 px-4 py-3">
                <button
                  onClick={() => handleSocialAuth("google")}
                  disabled={loading || socialLoading}
                  className="social-button flex-1 flex items-center justify-center gap-2 h-12 px-5 rounded-lg border border-border dark:border-gray-600 bg-white dark:bg-gray-800 text-foreground dark:text-slate-50 font-medium transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {socialLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <svg className="h-5 w-5" viewBox="0 0 24 24">
                        <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                        <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                        <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                        <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                      </svg>
                      <span>Google</span>
                    </>
                  )}
                </button>
                <button
                  onClick={() => handleSocialAuth("linkedin")}
                  disabled={loading || socialLoading}
                  className="social-button flex-1 flex items-center justify-center gap-2 h-12 px-5 rounded-lg border border-border dark:border-gray-600 bg-white dark:bg-gray-800 text-foreground dark:text-slate-50 font-medium transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {socialLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <svg className="h-5 w-5" viewBox="0 0 24 24">
                        <path fill="currentColor" d="M20.447 20.452h-3.554v-5.569c0-1.328-.475-2.236-1.986-2.236-1.081 0-1.722.722-2.004 1.418-.103.249-.129.597-.129.946v5.441h-3.554s.05-8.736 0-9.646h3.554v1.348c.42-.648 1.36-1.573 3.322-1.573 2.429 0 4.251 1.574 4.251 4.963v5.908zM5.337 8.855c-1.144 0-1.915-.762-1.915-1.715 0-.957.77-1.715 1.958-1.715 1.187 0 1.927.758 1.927 1.715 0 .953-.74 1.715-1.97 1.715zm1.946 11.597H3.392V9.806h3.891v10.646zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.225 0z" />
                      </svg>
                      <span>LinkedIn</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function AuthPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      }
    >
      <LoginPageContent />
    </Suspense>
  )
}
