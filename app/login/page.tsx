"use client"

import { useState, useEffect, useRef } from "react"
import { signIn, useSession } from "next-auth/react"
import Image from "next/image"
import { Eye, EyeOff, Loader2, LogIn, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const DB_RETRY_SECONDS = 10

export default function LoginPage() {
  const { data: session, status } = useSession()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isDbError, setIsDbError] = useState(false)
  const [retryCountdown, setRetryCountdown] = useState(0)
  const [showPassword, setShowPassword] = useState(false)

  // Armed when a DB error countdown should trigger an automatic retry at 0
  const autoRetryArmedRef = useRef(false)

  // If already authenticated, send to correct dashboard immediately
  useEffect(() => {
    if (status === "authenticated" && session?.user) {
      const dest = session.user.role === "admin" ? "/admin" : "/"
      window.location.replace(dest)
    }
  }, [status, session])

  // Tick the countdown down by 1 each second (pure — no side effects)
  useEffect(() => {
    if (retryCountdown <= 0) return
    const timer = setTimeout(() => {
      setRetryCountdown((prev) => Math.max(0, prev - 1))
    }, 1000)
    return () => clearTimeout(timer)
  }, [retryCountdown])

  // When countdown reaches 0 and an auto-retry is armed, fire the login
  useEffect(() => {
    if (retryCountdown !== 0 || !autoRetryArmedRef.current) return
    autoRetryArmedRef.current = false
    attemptLogin()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryCountdown])

  const attemptLogin = async () => {
    if (isLoading) return
    autoRetryArmedRef.current = false
    setError("")
    setIsDbError(false)
    setRetryCountdown(0)
    setIsLoading(true)

    const result = await signIn("credentials", {
      username,
      password,
      redirect: false,
    })

    if (result?.error) {
      setIsLoading(false)
      if (result.error === "DatabaseUnavailable") {
        setIsDbError(true)
        setError("Unable to reach the database. Please try again later.")
        autoRetryArmedRef.current = true
        setRetryCountdown(DB_RETRY_SECONDS)
      } else if (result.error === "RateLimited") {
        setError("Too many login attempts. Please wait a minute and try again.")
      } else {
        setError("Invalid username or password. Please try again.")
      }
    } else {
      // Hard redirect to root — middleware reads the session token and routes
      // admin → /admin, cashier → / (POS register)
      window.location.href = "/"
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    // Cancel any pending auto-retry before a manual submit
    autoRetryArmedRef.current = false
    setRetryCountdown(0)
    await attemptLogin()
  }

  const handleRetry = () => {
    autoRetryArmedRef.current = false
    setRetryCountdown(0)
    attemptLogin()
  }

  if (status === "loading" || status === "authenticated") {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-100">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4">
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-2xl shadow-lg p-8">
          <div className="flex flex-col items-center mb-8">
            <Image
              src="/corongrilldiners-logo.jpeg"
              alt="Coron Grill Diners"
              width={80}
              height={80}
              className="object-contain rounded-full mb-3"
              priority
            />
            <h1 className="text-xl font-bold text-center">Coron Grill Diners</h1>
            <p className="text-sm text-muted-foreground text-center mt-1">
              POS System — Staff Login
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username"
                autoComplete="username"
                required
                disabled={isLoading}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  required
                  disabled={isLoading}
                  className="pr-10"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md space-y-2">
                <p>{error}</p>
                {isDbError && (
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleRetry}
                      disabled={isLoading}
                      className="border-red-300 text-red-700 hover:bg-red-100"
                    >
                      <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                      Try again
                    </Button>
                    {retryCountdown > 0 && (
                      <span className="text-xs text-red-500">
                        Retrying automatically in {retryCountdown}s…
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}

            <Button type="submit" className="w-full" size="lg" disabled={isLoading}>
              {isLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <LogIn className="mr-2 h-4 w-4" />
              )}
              {isLoading ? "Signing in..." : "Sign In"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
