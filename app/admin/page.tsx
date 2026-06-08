"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { signOut, useSession } from "next-auth/react"
import { toast } from "sonner"
import {
  LayoutDashboard, Clock, UtensilsCrossed, Users, ShoppingCart,
  LogOut, RefreshCw, TrendingUp, ShoppingBag, Wallet, CreditCard,
  CheckCircle, AlertTriangle, Lock, Plus, Pencil, Trash2,
  Eye, EyeOff, X, Save, KeyRound, History, UserPlus, KeySquare, UserX, UserCog,
  Archive, ArchiveRestore, ChevronDown, ChevronUp, FileText, Loader2, Ban, ShieldCheck,
  BarChart3, LogIn, Package, Tag, Filter, Receipt, Upload, ImagePlus,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import Image from "next/image"
import { useProducts } from "../context/product-context"
import ChangePasswordDialog from "../components/change-password-dialog"
import ShiftSummaryModal from "../components/shift-summary-modal"
import SalesSection from "../components/sales-section"

// ─── Types ────────────────────────────────────────────────────────────────────

interface DailyStats {
  total_orders: number
  completed_orders?: number
  total_sales: number
  total_subtotal: number
  total_service_charge: number
}
interface PaymentBreakdown { payment_method: string; count: number; total: number }

interface SalesData { date: string; stats: DailyStats; paymentBreakdown: PaymentBreakdown[]; recentOrders: ManagedOrder[] }
interface WeeklyDataPoint { date: string; total_orders: number; total_sales: number }
interface TopItem { name: string; total_qty: number; total_revenue: number }
interface AnalyticsData { weeklyTrend: WeeklyDataPoint[]; topItems: TopItem[] }
interface ManagedOrder {
  id: string; order_number: string
  items: Array<{ name: string; quantity: number; price: number }>
  subtotal: number; service_charge: number; grand_total: number
  discount_percent?: number
  payment_method: string; server_name: string; created_by: string
  created_at: string; status: string; void_reason: string | null
}
interface ShiftRecord {
  id: number; cashier_name: string; cashier_username: string
  start_time: string; end_time: string | null; status: "open" | "closed"
  archived: boolean; notes: string | null
  start_balance: number; end_balance: number | null
  total_cash_sales: number; total_sales: number
  expected_cash: number | null; discrepancy: number | null
}
interface SaleRecord {
  id: string; order_number: string
  items: Array<{ name: string; quantity: number; price: number }>
  subtotal: number; service_charge: number; grand_total: number
  discount_percent?: number
  payment_method: string; server_name: string; created_by: string
  status: string; void_reason: string | null; created_at: string
}
interface TrashOrder extends SaleRecord {
  deleted_at: string | null
  deleted_by: string | null
}
interface Product {
  id: number; name: string; price: number; category: string
  image: string | null; description?: string | null; available?: boolean
  stock?: number | null
}
interface StaffUser {
  id: number; username: string; name: string; role: string; created_at: string
}
interface AuditEntry {
  id: number
  action: string
  actor_id: number
  actor_username: string
  target_user_id: number | null
  target_username: string | null
  details: string
  created_at: string
}
interface VoidCodeRow {
  id: number
  code: string
  used_by: string | null
  used_at: string | null
  sale_id: string | null
  created_at: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return `₱${(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", hour12: true })
}
function PaymentIcon({ method }: { method: string }) {
  if (method === "cash") return <Wallet className="h-3 w-3 inline mr-1" />
  if (method === "card") return <CreditCard className="h-3 w-3 inline mr-1" />
  return <span className="mr-1 text-[10px] font-bold">G</span>
}

// ─── Sidebar nav items ────────────────────────────────────────────────────────

type Section = "dashboard" | "shifts" | "sales" | "trash" | "menu" | "staff" | "activity" | "security" | "void-codes"
const NAV_ITEMS: { id: Section; label: string; icon: React.ElementType }[] = [
  { id: "dashboard", label: "Dashboard",        icon: LayoutDashboard  },
  { id: "shifts",    label: "Shift Reports",    icon: Clock            },
  { id: "sales",     label: "Sales Summary",    icon: Receipt          },
  { id: "trash",     label: "Trash",            icon: Trash2           },
  { id: "menu",      label: "Menu Management",  icon: UtensilsCrossed  },
  { id: "staff",     label: "Staff Accounts",   icon: Users            },
  { id: "activity",  label: "Activity Log",     icon: History          },
  { id: "security",  label: "Security History", icon: ShieldCheck      },
  { id: "void-codes",label: "Void Codes",       icon: KeySquare        },
]

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AdminPage() {
  const router = useRouter()
  const { data: session, status } = useSession()
  const [activeSection, setActiveSection] = useState<Section>("dashboard")
  const [selectedDate, setSelectedDate] = useState(new Date().toLocaleDateString("en-CA"))
  const [salesData, setSalesData] = useState<SalesData | null>(null)
  const [availableShifts, setAvailableShifts] = useState<ShiftRecord[]>([])
  const [selectedShiftId, setSelectedShiftId] = useState<string | null>(null)
  const [isMounted, setIsMounted] = useState(false)
  const [trashOrders, setTrashOrders] = useState<TrashOrder[]>([])
  const [staff, setStaff] = useState<StaffUser[]>([])
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([])
  const [securityLog, setSecurityLog] = useState<AuditEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [sectionError, setSectionError] = useState(false)
  const [voidCodes, setVoidCodes] = useState<VoidCodeRow[]>([])
  const [changePasswordOpen, setChangePasswordOpen] = useState(false)
  const [shiftsKey, setShiftsKey] = useState(0)
  const [salesKey, setSalesKey]   = useState(0)
  // Tracks which sections have been fetched at least once so we skip the
  // full-screen spinner on repeat visits and only block on the first load.
  const loadedRef = useRef<Set<string>>(new Set())

  const isAdmin = session?.user?.role === "admin"

  // ── Data fetchers ──────────────────────────────────────────────────────────

  const fetchSales = useCallback(async (date: string, shiftId?: string | null) => {
    try {
      const params = new URLSearchParams()
      params.set("date", date)
      if (shiftId) params.set("shiftId", shiftId)
      const res = await fetch(`/api/sales?${params.toString()}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setSalesData(await res.json())
      setSectionError(false)
    } catch (error) {
      console.error("Failed to fetch sales:", error)
      setSalesData(null)
      setSectionError(true)
    }
  }, [])

  const fetchShiftsForDate = useCallback(async (date: string) => {
    try {
      const res = await fetch(`/api/sales/shifts?from=${encodeURIComponent(date)}&to=${encodeURIComponent(date)}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const j = await res.json()
      setAvailableShifts(j.shifts ?? [])
      setSectionError(false)
    } catch (e) {
      console.error("Failed to fetch shifts:", e)
      setAvailableShifts([])
      setSectionError(true)
    }
  }, [])

  const fetchStaff = useCallback(async () => {
    const res = await fetch("/api/users")
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const j = await res.json(); setStaff(j.users ?? [])
  }, [])

  const fetchAuditLog = useCallback(async () => {
    const res = await fetch("/api/audit-log")
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const j = await res.json(); setAuditLog(j.entries ?? [])
  }, [])

  const fetchVoidCodes = useCallback(async () => {
    const res = await fetch("/api/void-codes")
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const j = await res.json(); setVoidCodes(j.codes ?? [])
  }, [])

  const fetchTrash = useCallback(async (date: string) => {
    const res = await fetch(`/api/sales?deleted=true&date=${date}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const j = await res.json(); setTrashOrders(j.recentOrders ?? [])
  }, [])

  const sessionUserId = session?.user?.id
  const fetchSecurityLog = useCallback(async () => {
    const userId = Number(sessionUserId)
    if (!Number.isFinite(userId) || userId <= 0) return
    const res = await fetch(`/api/audit-log?actor_id=${userId}&action=change_own_password`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const j = await res.json(); setSecurityLog(j.entries ?? [])
  }, [sessionUserId])

  const refreshCurrent = useCallback(async (forceSpinner = false) => {
    const key = activeSection === "dashboard" ? `dashboard:${selectedDate}` : activeSection
    const firstLoad = !loadedRef.current.has(key)
    // Only show the blocking full-screen spinner on the very first load of a
    // section (or when explicitly forced by the refresh / retry button).
    if (firstLoad || forceSpinner) setIsLoading(true)
    setSectionError(false)
    try {
      if (activeSection === "dashboard") await fetchSales(selectedDate, selectedShiftId)
      else if (activeSection === "shifts") setShiftsKey(k => k + 1)
      else if (activeSection === "sales") setSalesKey(k => k + 1)
      else if (activeSection === "trash") await fetchTrash(selectedDate)
      else if (activeSection === "staff") await fetchStaff()
      else if (activeSection === "activity") await fetchAuditLog()
      else if (activeSection === "security") await fetchSecurityLog()
      else if (activeSection === "void-codes") await fetchVoidCodes()
      loadedRef.current.add(key)
    } catch {
      setSectionError(true)
    } finally {
      setIsLoading(false)
    }
  }, [activeSection, selectedDate, fetchSales, fetchStaff, fetchAuditLog, fetchSecurityLog, fetchVoidCodes])

  useEffect(() => {
    if (status === "authenticated" && isAdmin && activeSection !== "menu" && activeSection !== "sales") {
      refreshCurrent()
      if (activeSection === "dashboard") fetchShiftsForDate(selectedDate)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection, selectedDate, status, isAdmin])

  useEffect(() => {
    setIsMounted(true)
  }, [])

  // Prefetch the POS route so navigation is instant
  useEffect(() => {
    router.prefetch("/pos")
  }, [router])

  // ── New-order notifications (poll every 15 s while admin is signed in) ────
  // Tracks the latest order id we've already notified the admin about so we
  // don't re-toast the same order on every poll. Uses localStorage to persist
  // across page refreshes and depends on selectedDate to avoid cross-date issues.
  const lastSeenOrderIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (status !== "authenticated" || !isAdmin) return
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" })
    const storageKey = `admin_lastSeenOrderId_${today}`
    
    // Initialize from localStorage on first load
    if (lastSeenOrderIdRef.current === null) {
      lastSeenOrderIdRef.current = localStorage.getItem(storageKey)
    }
    
    let cancelled = false

    const poll = async () => {
      try {
        const res = await fetch(`/api/sales?date=${today}`)
        if (!res.ok || cancelled) return
        const data: SalesData = await res.json()
        const orders = data.recentOrders ?? []
        if (orders.length === 0) return
        const newest = orders[0]
        
        // First poll: set to newest without toasting
        if (lastSeenOrderIdRef.current === null) {
          lastSeenOrderIdRef.current = newest.id
          localStorage.setItem(storageKey, newest.id)
          return
        }
        
        // Check if the last seen order still exists (wasn't deleted)
        const lastSeenExists = orders.some(o => o.id === lastSeenOrderIdRef.current)
        
        // If last seen order was deleted, reset to newest without toasting
        if (!lastSeenExists) {
          lastSeenOrderIdRef.current = newest.id
          localStorage.setItem(storageKey, newest.id)
          return
        }
        
        // Check for new orders (only if last seen still exists)
        if (newest.id !== lastSeenOrderIdRef.current && newest.status === "completed") {
          const lastSeen = lastSeenOrderIdRef.current
          lastSeenOrderIdRef.current = newest.id
          localStorage.setItem(storageKey, newest.id)
          const newOnes: typeof orders = []
          for (const o of orders) {
            if (o.id === lastSeen) break
            if (o.status === "completed") newOnes.push(o)
          }
          for (const o of newOnes) {
            toast.success(`New order ${o.order_number}`, {
              description: `${fmt(o.grand_total)} · ${o.payment_method.toUpperCase()} · by ${o.created_by || o.server_name}`,
            })
          }
        }
      } catch {
        /* ignore network errors during polling */
      }
    }

    poll()
    const interval = setInterval(poll, 15000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [status, isAdmin, selectedDate])

  // ── Auth guards ────────────────────────────────────────────────────────────

  if (status === "loading") {
    return (
      <div className="flex h-screen items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }
  // Unauthenticated means sign-out completed — redirect silently to login
  if (status === "unauthenticated") {
    if (typeof window !== "undefined") window.location.replace("/login")
    return (
      <div className="flex h-screen items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }
  // Authenticated but wrong role — show access denied
  if (!isAdmin) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <Lock className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
          <h1 className="text-2xl font-bold">Access Denied</h1>
          <p className="mt-2 text-muted-foreground">Admin access required.</p>
          <Button className="mt-4" onClick={() => router.push("/")}>Back to POS</Button>
        </div>
      </div>
    )
  }

  if (!isMounted) {
    return (
      <div className="flex h-screen items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const showDatePicker = activeSection === "dashboard" || activeSection === "shifts"
  const showRefresh = activeSection !== "menu" && activeSection !== "sales"

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">

      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      <aside className="w-56 flex-shrink-0 bg-white border-r flex flex-col h-full">
        {/* Logo */}
        <div className="p-4 border-b flex items-center gap-3">
          <Image
            src="/corongrilldiners-logo.jpeg"
            alt="Coron Grill Diners"
            width={36}
            height={36}
            className="rounded-full object-cover flex-shrink-0"
          />
          <div className="min-w-0">
            <p className="text-sm font-bold leading-tight truncate">Coron Grill</p>
            <p className="text-[10px] text-muted-foreground">Admin Panel</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveSection(id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left ${
                activeSection === id
                  ? "bg-primary text-primary-foreground"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              {label}
            </button>
          ))}

          <div className="pt-3 mt-3 border-t">
            <button
              onClick={() => router.push("/pos")}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold bg-green-600 text-white hover:bg-green-700 transition-colors"
            >
              <ShoppingCart className="h-4 w-4 flex-shrink-0" />
              Open POS Register
            </button>
          </div>
        </nav>

        {/* User + Sign out */}
        <div className="p-3 border-t">
          <div className="px-3 py-2 mb-1">
            <p className="text-xs font-semibold truncate">{session?.user?.name}</p>
            <p className="text-[10px] text-muted-foreground">Administrator</p>
          </div>
          <button
            onClick={() => setChangePasswordOpen(true)}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <KeyRound className="h-4 w-4" />
            Change Password
          </button>
          <button
            onClick={async () => { localStorage.removeItem("cart"); await signOut({ redirect: false }); window.location.href = "/login" }}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-red-600 hover:bg-red-50 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="bg-white border-b px-6 py-4 flex items-center justify-between gap-4 flex-shrink-0">
          <div>
            <h1 className="text-xl font-bold">
              {NAV_ITEMS.find((n) => n.id === activeSection)?.label}
            </h1>
            <p className="text-xs text-muted-foreground">Coron Grill Diners POS</p>
          </div>
          <div className="flex items-center gap-2">
            {showDatePicker && (
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="border rounded-md px-3 py-1.5 text-sm bg-white"
              />
            )}
            {/* Shift selector for dashboard: lets admin pick a specific shift to report on */}
            {activeSection === "dashboard" && (
              <div className="flex items-center gap-2">
                <Select
                  onValueChange={(v) => {
                    const nextShift = v === "all" ? null : v
                    setSelectedShiftId(nextShift)
                    fetchSales(selectedDate, nextShift)
                  }}
                  value={selectedShiftId ?? "all"}
                >
                  <SelectTrigger className="w-56 h-8 text-sm">
                    <SelectValue placeholder="Select shift (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All day</SelectItem>
                    {(availableShifts || []).map((s, index) => {
                      const shiftValue = String(s.id ?? (s as any).shift_id ?? index)
                      if (!shiftValue || shiftValue === "undefined" || shiftValue === "null") return null
                      return (
                        <SelectItem key={shiftValue} value={shiftValue}>
                          {`${new Date(s.start_time).toLocaleTimeString("en-PH", { hour: '2-digit', minute: '2-digit' })} - ${s.end_time ? new Date(s.end_time).toLocaleTimeString("en-PH", { hour: '2-digit', minute: '2-digit' }) : 'now'} · ${s.cashier_name}`}
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>

                {/* Selected shift label */}
                {selectedShiftId && (
                  (() => {
                    const s = (availableShifts || []).find(sh => String(sh.id ?? (sh as any).shift_id ?? "") === selectedShiftId)
                    if (!s) return null
                    const start = new Date(s.start_time).toLocaleString("en-PH", { hour: '2-digit', minute: '2-digit', hour12: true })
                    const end = s.end_time ? new Date(s.end_time).toLocaleString("en-PH", { hour: '2-digit', minute: '2-digit', hour12: true }) : 'now'
                    return (
                      <div className="text-sm text-muted-foreground bg-gray-50 border rounded px-2 py-1">
                        {start} → {end} · {s.cashier_name}
                      </div>
                    )
                  })()
                )}
              </div>
            )}
            {showRefresh && (
              <Button variant="outline" size="icon" onClick={() => refreshCurrent(true)} disabled={isLoading}>
                <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
              </Button>
            )}
          </div>
        </header>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeSection === "menu" ? (
            <MenuSection />
          ) : isLoading ? (
            <div className="flex items-center justify-center py-32">
              <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : sectionError && activeSection !== "shifts" ? (
            <div className="flex items-center justify-center py-32">
              <div className="text-center max-w-sm">
                <AlertTriangle className="h-10 w-10 text-amber-500 mx-auto mb-3" />
                <h3 className="font-semibold text-base mb-1">Unable to load data</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  The server could not be reached. Please check your connection and try again.
                </p>
                <Button variant="outline" size="sm" onClick={() => refreshCurrent(true)}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Try Again
                </Button>
              </div>
            </div>
          ) : activeSection === "dashboard" ? (
            <DashboardSection data={salesData} selectedDate={selectedDate} onRefresh={() => fetchSales(selectedDate)} />
          ) : activeSection === "shifts" ? (
            <ShiftsSection key={`${selectedDate}-${shiftsKey}`} selectedDate={selectedDate} />
          ) : activeSection === "sales" ? (
            <SalesSection key={`sales-${salesKey}`} />
          ) : activeSection === "trash" ? (
            <TrashSection orders={trashOrders} onRefresh={() => fetchTrash(selectedDate)} />
          ) : activeSection === "activity" ? (
            <AuditLogSection entries={auditLog} onRefresh={fetchAuditLog} />
          ) : activeSection === "security" ? (
            <SecurityHistorySection
              entries={securityLog}
              adminName={session?.user?.name ?? ""}
              onChangePassword={() => setChangePasswordOpen(true)}
            />
          ) : activeSection === "void-codes" ? (
            <VoidCodesSection codes={voidCodes} onRefresh={fetchVoidCodes} />
          ) : (
            <StaffSection staff={staff} onRefresh={fetchStaff} />
          )}
        </div>
      </div>

      <ChangePasswordDialog open={changePasswordOpen} onOpenChange={setChangePasswordOpen} />
    </div>
  )
}

// ─── Dashboard Section ────────────────────────────────────────────────────────

function DashboardSection({ data, selectedDate, onRefresh }: { data: SalesData | null; selectedDate: string; onRefresh: () => Promise<void> }) {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null)
  const [orders, setOrders] = useState<ManagedOrder[]>([])
  const [actionBusy, setActionBusy] = useState<string | null>(null)
  const [voidTarget, setVoidTarget] = useState<ManagedOrder | null>(null)
  const [voidReason, setVoidReason] = useState("")

  useEffect(() => {
    setOrders(data?.recentOrders ?? [])
  }, [data])

  useEffect(() => {
    setAnalytics(null)
    fetch(`/api/sales/analytics?date=${selectedDate}`)
      .then(r => r.ok ? r.json() : null)
      .then(j => { if (j) setAnalytics(j) })
      .catch(() => {})
  }, [selectedDate])

  if (!data) return (
    <div className="flex items-center justify-center py-32">
      <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  )

  const isToday = selectedDate === new Date().toLocaleDateString("en-CA")
  const completedOrders = orders.filter(o => o.status === "completed")
  const voidedOrders = orders.filter(o => o.status === "void")
  const cancelledOrders = orders.filter(o => o.status === "cancelled")
  const maxSales = Math.max(...(analytics?.weeklyTrend.map(d => d.total_sales) ?? [1]), 1)

  const handleVoid = async (order: ManagedOrder) => {
    if (!voidReason.trim()) return
    setActionBusy(order.id)
    const res = await fetch(`/api/sales/${order.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "void", voidReason }),
    })
    if (res.ok) {
      const j = await res.json()
      const stored = j.sale?.void_reason ?? voidReason
      setOrders(prev => prev.map(o => o.id === order.id ? { ...o, status: "void", void_reason: stored } : o))
      onRefresh().catch(() => {})
    }
    setVoidTarget(null)
    setVoidReason("")
    setActionBusy(null)
  }

  const handleRestore = async (order: ManagedOrder) => {
    if (!confirm(`Restore order ${order.order_number} to completed?`)) return
    setActionBusy(order.id)
    const res = await fetch(`/api/sales/${order.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "completed", voidReason: null }),
    })
    if (res.ok) {
      setOrders(prev => prev.map(o => o.id === order.id ? { ...o, status: "completed", void_reason: null } : o))
      onRefresh().catch(() => {})
    }
    setActionBusy(null)
  }

  const handleDelete = async (order: ManagedOrder) => {
    setActionBusy(order.id)
    const res = await fetch(`/api/sales/${order.id}`, { method: "DELETE" })
    if (res.ok) {
      setOrders(prev => prev.filter(o => o.id !== order.id))
      onRefresh().catch(() => {})
    }
    setActionBusy(null)
  }

  return (
    <div className="space-y-5">
      {/* ── Stat cards ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard icon={TrendingUp} label="Daily Revenue" value={fmt(data.stats.total_sales)}
          sub={isToday ? "Today" : selectedDate} valueClass="text-green-600" />
        <StatCard icon={ShoppingBag} label="Total Orders" value={String(data.stats.total_orders)}
          sub={`${data.stats.completed_orders ?? completedOrders.length} completed · ${voidedOrders.length} void · ${cancelledOrders.length} cancelled`} />
        <StatCard icon={Wallet} label="Avg. Order"
          value={(data.stats.completed_orders ?? data.stats.total_orders) > 0
            ? fmt(data.stats.total_sales / (data.stats.completed_orders ?? data.stats.total_orders))
            : "₱0.00"}
          sub="per completed order" />
        <StatCard icon={BarChart3} label="Discounts Given" value={fmt(data.stats.total_service_charge)}
          sub="deducted today" valueClass="text-orange-500" />
      </div>

      {/* ── Weekly trend + Top items ────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Weekly trend chart */}
        <div className="lg:col-span-3 bg-white rounded-xl border p-5 shadow-sm">
          <h2 className="font-semibold mb-4 flex items-center gap-2 text-sm">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            7-Day Sales Trend
          </h2>
          {!analytics ? (
            <div className="flex items-center justify-center h-28">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : analytics.weeklyTrend.length === 0 ? (
            <div className="flex items-center justify-center h-28 text-sm text-muted-foreground">
              No data for the past 7 days.
            </div>
          ) : (
            <div className="flex items-end justify-around gap-1.5 h-28 px-1">
              {(() => {
                const days: string[] = []
                for (let i = 6; i >= 0; i--) {
                  const d = new Date(selectedDate + "T12:00:00")
                  d.setDate(d.getDate() - i)
                  days.push(d.toLocaleDateString("en-CA"))
                }
                return days.map(day => {
                  const pt = analytics.weeklyTrend.find(t => t.date === day)
                  const pct = pt ? Math.max(8, Math.round((pt.total_sales / maxSales) * 88)) : 4
                  const isSelected = day === selectedDate
                  const label = fmt(pt?.total_sales ?? 0)
                  return (
                    <div key={day} className="flex-1 flex flex-col items-center gap-0.5 group" title={`${day}: ${label}`}>
                      <span className="text-[9px] text-muted-foreground font-mono leading-tight">
                        {pt && pt.total_sales >= 1000
                          ? `₱${(pt.total_sales / 1000).toFixed(1)}k`
                          : pt ? `₱${pt.total_sales.toFixed(0)}` : ""}
                      </span>
                      <div
                        className={`w-full rounded-t-md transition-all duration-200 ${
                          isSelected 
                            ? "bg-gradient-to-t from-amber-600 to-orange-500" 
                            : pt 
                              ? "bg-gradient-to-t from-emerald-600 to-emerald-400 group-hover:from-emerald-700 group-hover:to-emerald-500" 
                              : "bg-gray-100"
                        }`}
                        style={{ height: `${pct}px` }}
                      />
                      <span className={`text-[9px] font-semibold ${isSelected ? "text-orange-600" : "text-muted-foreground group-hover:text-emerald-700"}`}>
                        {new Date(day + "T12:00:00").toLocaleDateString("en-PH", { weekday: "short" }).substring(0, 2)}
                      </span>
                      {pt && (
                        <span className="text-[8px] text-muted-foreground group-hover:text-emerald-700">{pt.total_orders}</span>
                      )}
                    </div>
                  )
                })
              })()}
            </div>
          )}
        </div>

        {/* Top selling items */}
        <div className="lg:col-span-2 bg-white rounded-xl border p-5 shadow-sm">
          <h2 className="font-semibold mb-3 flex items-center gap-2 text-sm">
            <UtensilsCrossed className="h-4 w-4 text-muted-foreground" />
            Top Items Today
          </h2>
          {!analytics ? (
            <div className="flex items-center justify-center h-28">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : analytics.topItems.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No orders for this date.</p>
          ) : (
            <div className="space-y-2.5">
              {analytics.topItems.slice(0, 6).map((item, i) => {
                const maxQty = analytics.topItems[0]?.total_qty ?? 1
                return (
                  <div key={item.name} className="flex items-center gap-2 group">
                    <span className="text-[10px] font-bold text-muted-foreground w-4 text-right flex-shrink-0 group-hover:text-emerald-700">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-xs font-medium truncate pr-2 group-hover:text-emerald-800">{item.name}</span>
                        <span className="text-xs text-muted-foreground flex-shrink-0 group-hover:text-emerald-700">{item.total_qty}×</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-1.5">
                        <div
                          className="bg-gradient-to-r from-emerald-500 to-emerald-400 h-1.5 rounded-full transition-all duration-300 group-hover:from-emerald-600 group-hover:to-emerald-500"
                          style={{ width: `${(item.total_qty / maxQty) * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Payment breakdown ───────────────────────────────────────── */}
      {data.paymentBreakdown.length > 0 && (
        <div className="bg-white rounded-xl border p-5 shadow-sm">
          <h2 className="font-semibold mb-3 text-sm flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-muted-foreground" />
            Payment Breakdown
          </h2>
          <div className="flex flex-wrap gap-3">
            {data.paymentBreakdown.map((p) => (
              <div key={p.payment_method} className="flex items-center gap-3 bg-gray-50 rounded-lg px-4 py-3 flex-1 min-w-[130px]">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <PaymentIcon method={p.payment_method} />
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground capitalize">{p.payment_method}</p>
                  <p className="font-bold text-sm">{fmt(p.total)}</p>
                  <p className="text-[10px] text-muted-foreground">{p.count} {p.count === 1 ? "order" : "orders"}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Recent Orders — fully manageable ───────────────────────── */}
      <div className="bg-white rounded-xl border shadow-sm">
        <div className="p-5 border-b flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="font-semibold">Recent Orders</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {orders.length} total — admins can void, restore, or permanently delete
            </p>
          </div>
          <div className="flex gap-2 text-xs">
            <span className="flex items-center gap-1 bg-green-50 text-green-700 px-2 py-1 rounded-full font-medium">
              <CheckCircle className="h-3 w-3" />{completedOrders.length} done
            </span>
            <span className="flex items-center gap-1 bg-red-50 text-red-700 px-2 py-1 rounded-full font-medium">
              <Ban className="h-3 w-3" />{voidedOrders.length} void
            </span>
            {cancelledOrders.length > 0 && (
              <span className="flex items-center gap-1 bg-amber-50 text-amber-700 px-2 py-1 rounded-full font-medium">
                <Ban className="h-3 w-3" />{cancelledOrders.length} cancelled
              </span>
            )}
          </div>
        </div>

        {orders.length === 0 ? (
          <EmptyState icon={ShoppingBag} message="No orders recorded for this date." />
        ) : (
          <div className="divide-y">
            {orders.map((order) => {
              const isBusy = actionBusy === order.id
              const isVoiding = voidTarget?.id === order.id
              return (
                <div key={order.id} className={`px-5 py-4 transition-colors hover:bg-gray-50/80 ${order.status !== "completed" ? "opacity-60" : ""}`}>
                  <div className="flex items-start justify-between gap-4">
                    {/* Left: order info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <span className="font-mono font-bold text-sm">{order.order_number}</span>
                        <OrderStatusBadge status={order.status} />
                        <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full capitalize flex items-center gap-0.5">
                          <PaymentIcon method={order.payment_method} />{order.payment_method}
                        </span>
                        {(order.discount_percent ?? 0) > 0 && (
                          <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-medium">
                            {order.discount_percent}% Senior Discount
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {fmtTime(order.created_at)} · <span className="font-medium">{order.created_by || order.server_name}</span>
                      </p>
                      <p className="text-xs text-gray-500 mt-1 truncate max-w-sm">
                        {order.items?.map((it, i) => `${it.quantity}× ${it.name}`).join(", ")}
                      </p>
                      {order.void_reason && (
                        <p className="text-[10px] text-red-500 italic mt-0.5">Reason: {order.void_reason}</p>
                      )}
                    </div>

                    {/* Right: amount + action buttons */}
                    <div className="flex-shrink-0 text-right">
                      <p className={`font-bold text-base ${order.status === "completed" ? "text-green-600" : "text-gray-400"}`}>
                        {fmt(order.grand_total)}
                      </p>
                      {order.service_charge > 0 && (
                        <p className="text-[10px] text-orange-500">
                          {(order.discount_percent ?? 0) > 0 ? `-${fmt(order.service_charge)} disc` : `+${fmt(order.service_charge)} svc`}
                        </p>
                      )}
                      <div className="flex gap-1 mt-2 justify-end">
                        {order.status === "completed" && (
                          <Button
                            variant="outline" size="sm"
                            className="h-7 text-[11px] gap-1 text-amber-600 border-amber-200 hover:bg-amber-50"
                            onClick={() => { setVoidTarget(order); setVoidReason("") }}
                            disabled={isBusy}
                          >
                            <Ban className="h-3 w-3" />Void
                          </Button>
                        )}
                        {(order.status === "void" || order.status === "cancelled") && (
                          <Button
                            variant="outline" size="sm"
                            className="h-7 text-[11px] gap-1 text-green-600 border-green-200 hover:bg-green-50"
                            onClick={() => handleRestore(order)}
                            disabled={isBusy}
                          >
                            {isBusy
                              ? <Loader2 className="h-3 w-3 animate-spin" />
                              : <ArchiveRestore className="h-3 w-3" />}
                            Restore
                          </Button>
                        )}
                        <Button
                          variant="outline" size="sm"
                          className="h-7 text-[11px] gap-1 text-red-600 border-red-200 hover:bg-red-50"
                          onClick={() => handleDelete(order)}
                          disabled={isBusy}
                        >
                          {isBusy && order.status !== "completed"
                            ? <Loader2 className="h-3 w-3 animate-spin" />
                            : <Trash2 className="h-3 w-3" />}
                          Delete
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Inline void reason form */}
                  {isVoiding && (
                    <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-2">
                      <p className="text-xs font-semibold text-amber-800">Void reason for {order.order_number}</p>
                      <textarea
                        value={voidReason}
                        onChange={e => setVoidReason(e.target.value)}
                        placeholder="Enter reason for voiding this order..."
                        rows={2}
                        className="w-full text-xs rounded border border-amber-300 bg-white px-2 py-1.5 placeholder:text-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 resize-none"
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="h-7 text-[11px] gap-1 bg-amber-600 hover:bg-amber-700 text-white"
                          onClick={() => handleVoid(order)}
                          disabled={!voidReason.trim() || !!actionBusy}
                        >
                          {actionBusy === order.id
                            ? <Loader2 className="h-3 w-3 animate-spin" />
                            : <Ban className="h-3 w-3" />}
                          Confirm Void
                        </Button>
                        <Button
                          variant="outline" size="sm"
                          className="h-7 text-[11px] border-amber-300"
                          onClick={() => { setVoidTarget(null); setVoidReason("") }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function TrashSection({ orders, onRefresh }: { orders: TrashOrder[]; onRefresh: () => Promise<void> }) {
  const [actionBusy, setActionBusy] = useState<string | null>(null)
  const [fetchError, setFetchError] = useState(false)

  const handleRestore = async (order: TrashOrder) => {
    if (!confirm(`Restore order ${order.order_number} from Trash?`)) return
    setActionBusy(order.id)
    try {
      const res = await fetch(`/api/sales/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isDeleted: false }),
      })
      if (!res.ok) throw new Error()
      await onRefresh()
      toast.success(`Order ${order.order_number} restored.`)
    } catch {
      setFetchError(true)
      toast.error("Could not restore order. Please try again.")
    } finally {
      setActionBusy(null)
    }
  }

  const handlePermanentDelete = async (order: TrashOrder) => {
    if (!confirm(`Permanently delete order ${order.order_number}? This cannot be undone.`)) return
    setActionBusy(order.id)
    try {
      const res = await fetch(`/api/sales/${order.id}?force=true`, { method: "DELETE" })
      if (!res.ok) throw new Error()
      await onRefresh()
      toast.success(`Order ${order.order_number} permanently deleted.`)
    } catch {
      setFetchError(true)
      toast.error("Could not permanently delete order. Please try again.")
    } finally {
      setActionBusy(null)
    }
  }

  if (orders.length === 0 && fetchError) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="text-center max-w-sm">
          <AlertTriangle className="h-10 w-10 text-amber-500 mx-auto mb-3" />
          <h3 className="font-semibold text-base mb-1">Unable to load trash</h3>
          <p className="text-sm text-muted-foreground mb-4">
            The server could not be reached. Please refresh or try again later.
          </p>
          <Button variant="outline" size="sm" onClick={() => { setFetchError(false); onRefresh().catch(() => setFetchError(true)) }}>
            <RefreshCw className="h-4 w-4 mr-2" /> Refresh
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl border p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-semibold">Trash</h2>
            <p className="text-xs text-muted-foreground mt-1">Deleted orders are kept here until permanently removed.</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => onRefresh().catch(() => setFetchError(true))}>
            <RefreshCw className="h-4 w-4 mr-2" /> Refresh
          </Button>
        </div>
      </div>

      {orders.length === 0 ? (
        <EmptyState icon={Trash2} message="No deleted orders in the trash." />
      ) : (
        <div className="bg-white rounded-xl border shadow-sm divide-y">
          {orders.map((order) => {
            const isBusy = actionBusy === order.id
            return (
              <div key={order.id} className="px-5 py-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="font-mono text-sm font-semibold">{order.order_number}</span>
                    <span className="text-[10px] uppercase tracking-wide text-white bg-red-600 rounded-full px-2 py-1">Deleted</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{fmtTime(order.created_at)} · {order.created_by || order.server_name}</p>
                  <p className="text-xs text-gray-500 mt-1 truncate max-w-lg">
                    {order.items?.map((it, i) => `${it.quantity}× ${it.name}`).join(", ")}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Deleted by {order.deleted_by ?? "admin"} · {order.deleted_at ? new Date(order.deleted_at).toLocaleString("en-PH") : "unknown"}
                  </p>
                </div>
                <div className="flex gap-2 flex-wrap justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 gap-1"
                    onClick={() => handleRestore(order)}
                    disabled={isBusy}
                  >
                    {isBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArchiveRestore className="h-3 w-3" />}
                    Restore
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="h-9 gap-1"
                    onClick={() => handlePermanentDelete(order)}
                    disabled={isBusy}
                  >
                    <Trash2 className="h-3 w-3" /> Permanently Delete
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Shifts Section ───────────────────────────────────────────────────────────

function OrderStatusBadge({ status }: { status: string }) {
  if (status === "completed") return (
    <span className="flex-shrink-0 inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">
      <CheckCircle className="h-2.5 w-2.5" />Done
    </span>
  )
  if (status === "void") return (
    <span className="flex-shrink-0 inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">
      <X className="h-2.5 w-2.5" />Void
    </span>
  )
  return (
    <span className="flex-shrink-0 inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">
      <Ban className="h-2.5 w-2.5" />Cancelled
    </span>
  )
}

function ShiftsSection({ selectedDate, onRefresh }: { selectedDate: string; onRefresh?: () => Promise<void> }) {
  const isToday = selectedDate === new Date().toLocaleDateString("en-CA")
  const [shifts, setShifts] = useState<ShiftRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [showArchived, setShowArchived] = useState(false)
  const [expandedShiftId, setExpandedShiftId] = useState<number | null>(null)
  const [shiftOrders, setShiftOrders] = useState<Record<number, SaleRecord[]>>({})
  const [loadingOrdersFor, setLoadingOrdersFor] = useState<number | null>(null)
  const [orderFilter, setOrderFilter] = useState<Record<number, string>>({})
  const [editingShift, setEditingShift] = useState<ShiftRecord | null>(null)
  const [editNotes, setEditNotes] = useState("")
  const [editEndBalance, setEditEndBalance] = useState("")
  const [editSaving, setEditSaving] = useState(false)
  const [actionError, setActionError] = useState("")
  const [summaryShift, setSummaryShift] = useState<ShiftRecord | null>(null)
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [summaryLoading, setSummaryLoading] = useState<number | null>(null)

  const [fetchError, setFetchError] = useState(false)

  const fetchShifts = useCallback(async () => {
    setLoading(true)
    setFetchError(false)
    try {
      const params = new URLSearchParams({ date: selectedDate })
      if (showArchived) params.set("include_archived", "true")
      const res = await fetch(`/api/shifts?${params}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const j = await res.json(); setShifts(j.shifts ?? [])
    } catch {
      setFetchError(true)
    } finally {
      setLoading(false)
    }
  }, [selectedDate, showArchived])

  useEffect(() => { fetchShifts() }, [fetchShifts])

  const fetchShiftOrders = async (shiftId: number): Promise<SaleRecord[]> => {
    if (shiftOrders[shiftId] !== undefined) return shiftOrders[shiftId]
    setLoadingOrdersFor(shiftId)
    try {
      const res = await fetch(`/api/shifts/${shiftId}/sales`)
      if (res.ok) {
        const j = await res.json()
        const sales: SaleRecord[] = j.sales ?? []
        setShiftOrders(prev => ({ ...prev, [shiftId]: sales }))
        return sales
      }
    } finally {
      setLoadingOrdersFor(null)
    }
    return []
  }

  const handleViewOrders = async (shiftId: number) => {
    if (expandedShiftId === shiftId) { setExpandedShiftId(null); return }
    setExpandedShiftId(shiftId)
    await fetchShiftOrders(shiftId)
  }

  const handleOpenSummary = async (shift: ShiftRecord) => {
    setSummaryLoading(shift.id)
    await fetchShiftOrders(shift.id)
    setSummaryLoading(null)
    setSummaryShift(shift)
    setSummaryOpen(true)
  }

  const handleArchive = async (shift: ShiftRecord) => {
    const res = await fetch(`/api/shifts/${shift.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: !shift.archived }),
    })
    if (res.ok) fetchShifts()
    else setActionError("Failed to update shift.")
  }

  const handleDelete = async (shift: ShiftRecord) => {
    const res = await fetch(`/api/shifts/${shift.id}`, { method: "DELETE" })
    if (res.ok) {
      fetchShifts()
      if (expandedShiftId === shift.id) setExpandedShiftId(null)
      onRefresh?.().catch(() => {})
    } else {
      setActionError("Failed to delete shift.")
    }
  }

  const openEdit = (shift: ShiftRecord) => {
    setEditingShift(shift)
    setEditNotes(shift.notes ?? "")
    setEditEndBalance(shift.end_balance !== null ? String(shift.end_balance) : "")
  }

  const handleSaveEdit = async () => {
    if (!editingShift) return
    setEditSaving(true)
    const body: Record<string, unknown> = { notes: editNotes }
    if (editEndBalance !== "") body.end_balance = parseFloat(editEndBalance)
    const res = await fetch(`/api/shifts/${editingShift.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    setEditSaving(false)
    if (res.ok) { setEditingShift(null); fetchShifts() }
    else setActionError("Failed to save changes.")
  }

  const getFilter = (shiftId: number) => orderFilter[shiftId] ?? "all"
  const setFilter = (shiftId: number, f: string) =>
    setOrderFilter(prev => ({ ...prev, [shiftId]: f }))

  const getFilteredOrders = (shiftId: number) => {
    const orders = shiftOrders[shiftId] ?? []
    const f = getFilter(shiftId)
    return f === "all" ? orders : orders.filter(o => o.status === f)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (fetchError) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="text-center max-w-sm">
          <AlertTriangle className="h-10 w-10 text-amber-500 mx-auto mb-3" />
          <h3 className="font-semibold text-base mb-1">Unable to load shift records</h3>
          <p className="text-sm text-muted-foreground mb-4">
            The server could not be reached. Please check your connection and try again.
          </p>
          <Button variant="outline" size="sm" onClick={fetchShifts}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Try Again
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {actionError && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-2.5 rounded-lg text-sm">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />{actionError}
          <button className="ml-auto text-red-400 hover:text-red-600" onClick={() => setActionError("")}>
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="bg-white rounded-xl border shadow-sm">
        <div className="p-5 border-b flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="font-semibold">Shift Records — {isToday ? "Today" : selectedDate}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{shifts.length} shift{shifts.length !== 1 ? "s" : ""}</p>
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none text-muted-foreground hover:text-foreground transition-colors">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="h-4 w-4 rounded"
            />
            Show Archived
          </label>
        </div>

        {shifts.length === 0 ? (
          <EmptyState icon={Clock} message="No shifts recorded for this date." />
        ) : (
          <div className="divide-y">
            {shifts.map((shift) => {
              const disc = shift.discrepancy ?? 0
              const isOpen = shift.status === "open"
              const isOver = !isOpen && disc > 0
              const isShort = !isOpen && disc < 0
              const isExact = !isOpen && disc === 0
              const isExpanded = expandedShiftId === shift.id
              const orders = shiftOrders[shift.id]
              const filter = getFilter(shift.id)

              return (
                <div key={shift.id} className={shift.archived ? "opacity-60" : ""}>
                  {/* Shift row */}
                  <div className="p-4 hover:bg-gray-50/80">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-semibold">{shift.cashier_name}</span>
                          <span className="text-xs text-muted-foreground">@{shift.cashier_username}</span>
                          {isOpen ? (
                            <Badge className="text-[10px] h-4 px-1.5 bg-green-100 text-green-700 border-0">
                              <Clock className="h-2.5 w-2.5 mr-0.5" />Active
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[10px] h-4 px-1.5">Closed</Badge>
                          )}
                          {shift.archived && (
                            <Badge variant="secondary" className="text-[10px] h-4 px-1.5 bg-yellow-50 text-yellow-700 border-0">
                              Archived
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {fmtTime(shift.start_time)}
                          {shift.end_time ? ` → ${fmtTime(shift.end_time)}` : " (ongoing)"}
                        </p>
                        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-1 text-xs">
                          <div>
                            <span className="text-muted-foreground block">Starting Cash</span>
                            <span className="font-mono font-medium">{fmt(shift.start_balance)}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground block">Cash Sales</span>
                            <span className="font-mono font-medium text-green-600">+{fmt(shift.total_cash_sales)}</span>
                          </div>
                          {!isOpen && (
                            <>
                              <div>
                                <span className="text-muted-foreground block">Expected</span>
                                <span className="font-mono font-medium">{fmt(shift.expected_cash ?? 0)}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground block">Actual</span>
                                <span className="font-mono font-medium">{fmt(shift.end_balance ?? 0)}</span>
                              </div>
                            </>
                          )}
                        </div>
                        {shift.notes && (
                          <p className="mt-2 text-xs text-muted-foreground bg-gray-50 rounded px-2 py-1 italic flex items-center gap-1">
                            <FileText className="h-3 w-3 flex-shrink-0" />{shift.notes}
                          </p>
                        )}
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <p className="text-xs text-muted-foreground mb-1">Total Sales</p>
                        <p className="font-bold text-base">{fmt(shift.total_sales)}</p>
                        {!isOpen && (
                          <div className={`mt-2 rounded-md px-2.5 py-1 text-xs font-semibold ${isExact ? "bg-green-50 text-green-700" : isOver ? "bg-blue-50 text-blue-700" : "bg-red-50 text-red-700"}`}>
                            <div className="flex items-center gap-1 justify-end">
                              {isExact ? <CheckCircle className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                              <span>{isExact ? "Balanced" : isOver ? "Over" : "Short"}</span>
                            </div>
                            <span className="font-mono">{disc >= 0 ? "+" : ""}{fmt(disc)}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="mt-3 flex items-center gap-2 flex-wrap">
                      <Button
                        variant="outline" size="sm"
                        className="h-7 text-xs gap-1.5 bg-primary/5 border-primary/30 hover:bg-primary/10 text-primary font-semibold"
                        onClick={() => handleOpenSummary(shift)}
                        disabled={summaryLoading === shift.id}
                      >
                        {summaryLoading === shift.id
                          ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Loading…</>
                          : <><Eye className="h-3.5 w-3.5" />View</>
                        }
                      </Button>
                      <Button
                        variant="outline" size="sm" className="h-7 text-xs gap-1.5"
                        onClick={() => handleViewOrders(shift.id)}
                      >
                        {isExpanded
                          ? <><ChevronUp className="h-3.5 w-3.5" />Hide Orders</>
                          : <><ChevronDown className="h-3.5 w-3.5" />View Orders{orders !== undefined ? ` (${orders.length})` : ""}</>
                        }
                      </Button>
                      <Button
                        variant="outline" size="sm" className="h-7 text-xs gap-1.5"
                        onClick={() => openEdit(shift)}
                      >
                        <Pencil className="h-3.5 w-3.5" />Edit
                      </Button>
                      <Button
                        variant="outline" size="sm"
                        className={`h-7 text-xs gap-1.5 ${shift.archived ? "text-yellow-700 border-yellow-300 hover:bg-yellow-50" : "text-gray-600"}`}
                        onClick={() => handleArchive(shift)}
                      >
                        {shift.archived
                          ? <><ArchiveRestore className="h-3.5 w-3.5" />Unarchive</>
                          : <><Archive className="h-3.5 w-3.5" />Archive</>
                        }
                      </Button>
                      <Button
                        variant="outline" size="sm"
                        className="h-7 text-xs gap-1.5 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                        onClick={() => handleDelete(shift)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />Delete
                      </Button>
                    </div>
                  </div>

                  {/* Expanded orders panel */}
                  {isExpanded && (
                    <div className="border-t bg-gray-50/60 px-4 py-3">
                      {loadingOrdersFor === shift.id ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        </div>
                      ) : !orders || orders.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-6">
                          No orders found for this shift.
                        </p>
                      ) : (
                        <>
                          {/* Filter tabs */}
                          <div className="flex gap-2 mb-3 flex-wrap">
                            {["all", "completed", "void", "cancelled"].map((f) => {
                              const count = f === "all" ? orders.length : orders.filter(o => o.status === f).length
                              return (
                                <button
                                  key={f}
                                  onClick={() => setFilter(shift.id, f)}
                                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                                    filter === f
                                      ? "bg-primary text-primary-foreground"
                                      : "bg-white border text-gray-600 hover:bg-gray-100"
                                  }`}
                                >
                                  {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)} ({count})
                                </button>
                              )
                            })}
                          </div>

                          {/* Order rows */}
                          <div className="space-y-1.5">
                            {getFilteredOrders(shift.id).length === 0 ? (
                              <p className="text-xs text-muted-foreground text-center py-4">No {filter} orders.</p>
                            ) : getFilteredOrders(shift.id).map((order) => (
                              <div
                                key={order.id}
                                className={`flex items-center gap-3 bg-white rounded-lg px-3 py-2 border text-xs ${order.status !== "completed" ? "opacity-60" : ""}`}
                              >
                                <span className="text-muted-foreground flex-shrink-0 w-14">
                                  {new Date(order.created_at).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", hour12: true })}
                                </span>
                                <span className="font-mono font-semibold flex-shrink-0">{order.order_number}</span>
                                <span className="flex-shrink-0 capitalize text-muted-foreground">
                                  <PaymentIcon method={order.payment_method} />{order.payment_method}
                                </span>
                                <span className="flex-1 text-muted-foreground truncate">
                                  {(order.items as any[])?.map((it: any) => `${it.quantity}× ${it.name}`).join(", ")}
                                </span>
                                <span className="font-mono font-semibold flex-shrink-0">{fmt(order.grand_total)}</span>
                                <OrderStatusBadge status={order.status} />
                                {order.void_reason && (
                                  <span className="text-muted-foreground italic truncate max-w-[120px]" title={order.void_reason}>
                                    "{order.void_reason}"
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>

                          {/* Footer summary */}
                          <div className="mt-3 pt-3 border-t flex gap-4 text-xs text-muted-foreground flex-wrap">
                            <span>Completed: <strong className="text-foreground">{orders.filter(o => o.status === "completed").length}</strong></span>
                            <span>Void: <strong className="text-foreground">{orders.filter(o => o.status === "void").length}</strong></span>
                            <span>Cancelled: <strong className="text-foreground">{orders.filter(o => o.status === "cancelled").length}</strong></span>
                            <span className="ml-auto">
                              Revenue: <strong className="text-foreground font-mono">
                                {fmt(orders.filter(o => o.status === "completed").reduce((s, o) => s + o.grand_total, 0))}
                              </strong>
                            </span>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Full Summary Modal */}
      {summaryShift && (
        <ShiftSummaryModal
          open={summaryOpen}
          onOpenChange={(v) => { setSummaryOpen(v); if (!v) setSummaryShift(null) }}
          shift={summaryShift}
          sales={shiftOrders[summaryShift.id] ?? []}
        />
      )}

      {/* Edit Shift Modal */}
      {editingShift && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setEditingShift(null)} />
          <div className="relative z-10 w-full max-w-sm bg-white rounded-xl shadow-xl p-6 mx-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold">Edit Shift</h2>
                <p className="text-xs text-muted-foreground">
                  {editingShift.cashier_name} · {fmtTime(editingShift.start_time)}
                </p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setEditingShift(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-4">
              {editingShift.status === "closed" && (
                <div className="space-y-1.5">
                  <Label>Actual Cash Correction (End Balance)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={editEndBalance}
                    onChange={(e) => setEditEndBalance(e.target.value)}
                    placeholder={editingShift.end_balance !== null ? String(editingShift.end_balance) : "Enter corrected amount"}
                    className="font-mono"
                  />
                  <p className="text-xs text-muted-foreground">
                    Current: {editingShift.end_balance !== null ? fmt(editingShift.end_balance) : "not set"}. Leave blank to keep unchanged.
                  </p>
                </div>
              )}
              <div className="space-y-1.5">
                <Label>Notes</Label>
                <textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Add notes about this shift..."
                  rows={3}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <Button variant="outline" className="flex-1" onClick={() => setEditingShift(null)}>Cancel</Button>
                <Button className="flex-1 gap-2" onClick={handleSaveEdit} disabled={editSaving}>
                  {editSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save Changes
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Activity Log Section ─────────────────────────────────────────────────────

const ACTION_META: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  // Authentication
  login:                { label: "User Login",              icon: LogIn,         color: "text-sky-600 bg-sky-50"       },
  // Account management
  create_account:       { label: "Account Created",         icon: UserPlus,      color: "text-green-600 bg-green-50"   },
  reset_password:       { label: "Password Reset",          icon: KeySquare,     color: "text-amber-600 bg-amber-50"   },
  delete_account:       { label: "Account Deleted",         icon: UserX,         color: "text-red-600 bg-red-50"       },
  update_account:       { label: "Account Updated",         icon: UserCog,       color: "text-blue-600 bg-blue-50"     },
  change_own_password:  { label: "Own Password Changed",    icon: KeyRound,      color: "text-purple-600 bg-purple-50" },
  // Orders
  order_placed:         { label: "Order Placed",            icon: ShoppingCart,  color: "text-green-700 bg-green-50"   },
  order_voided:         { label: "Order Voided",            icon: Ban,           color: "text-red-600 bg-red-50"       },
  order_restored:       { label: "Order Restored",          icon: ArchiveRestore,color: "text-emerald-600 bg-emerald-50"},
  order_restored_from_trash: { label: "Order Restored",       icon: ArchiveRestore,color: "text-emerald-600 bg-emerald-50"},
  order_deleted:        { label: "Order Deleted",           icon: Trash2,        color: "text-red-700 bg-red-100"      },
  order_permanently_deleted: { label: "Order Permanently Deleted", icon: Trash2, color: "text-red-700 bg-red-100"},
  // Shifts
  shift_started:        { label: "Shift Started",           icon: Clock,         color: "text-blue-600 bg-blue-50"     },
  shift_closed:         { label: "Shift Closed",            icon: CheckCircle,   color: "text-gray-600 bg-gray-100"    },
  shift_updated:        { label: "Shift Updated",           icon: Pencil,        color: "text-blue-600 bg-blue-50"     },
  shift_deleted:        { label: "Shift Deleted",           icon: Trash2,        color: "text-red-600 bg-red-50"       },
  // Menu — products
  product_added:        { label: "Product Added",           icon: Package,       color: "text-green-600 bg-green-50"   },
  product_updated:      { label: "Product Updated",         icon: Pencil,        color: "text-blue-600 bg-blue-50"     },
  product_deleted:      { label: "Product Deleted",         icon: Trash2,        color: "text-red-600 bg-red-50"       },
  product_availability: { label: "Availability Changed",    icon: Eye,           color: "text-amber-600 bg-amber-50"   },
  void_codes_generated: { label: "Void Codes Generated",    icon: KeySquare,     color: "text-purple-600 bg-purple-50" },
  // Menu — categories
  category_added:       { label: "Category Added",          icon: Tag,           color: "text-green-600 bg-green-50"   },
  category_updated:     { label: "Category Updated",        icon: Pencil,        color: "text-blue-600 bg-blue-50"     },
  category_deleted:     { label: "Category Deleted",        icon: Trash2,        color: "text-red-600 bg-red-50"       },
}

const CATEGORY_FILTERS = [
  { key: "all",     label: "All" },
  { key: "order",   label: "Orders" },
  { key: "shift",   label: "Shifts" },
  { key: "account", label: "Accounts" },
  { key: "menu",    label: "Menu" },
] as const
type ActivityCategory = typeof CATEGORY_FILTERS[number]["key"]

const ACTION_CATEGORY: Record<string, ActivityCategory> = {
  login: "account", create_account: "account", update_account: "account",
  reset_password: "account", delete_account: "account", change_own_password: "account",
  order_placed: "order", order_voided: "order", order_restored: "order", order_restored_from_trash: "order", order_deleted: "order", order_permanently_deleted: "order",
  shift_started: "shift", shift_closed: "shift",
  shift_updated: "shift", shift_deleted: "shift",
  product_added: "menu", product_updated: "menu", product_deleted: "menu", product_availability: "menu",
  category_added: "menu", category_updated: "menu", category_deleted: "menu",
  void_codes_generated: "order",
}

function AuditLogSection({ entries, onRefresh }: { entries: AuditEntry[], onRefresh: () => Promise<void> }) {
  const [filter, setFilter] = useState<ActivityCategory>("all")
  const [archivingId, setArchivingId] = useState<number | null>(null)

  const handleArchive = async (entry: AuditEntry) => {
    if (!confirm(`Are you sure you want to archive this log entry?`)) return
    setArchivingId(entry.id)
    try {
      const res = await fetch("/api/audit-log", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: entry.id })
      })
      if (res.ok) {
        await onRefresh()
      }
    } catch (err) {
      console.error("Failed to archive audit log entry:", err)
    } finally {
      setArchivingId(null)
    }
  }

  const visible = filter === "all"
    ? entries
    : entries.filter(e => ACTION_CATEGORY[e.action] === filter)

  return (
    <div className="bg-white rounded-xl border shadow-sm">
      <div className="p-5 border-b">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-semibold">Activity Log</h2>
            <p className="text-xs text-muted-foreground mt-0.5">All system activity — logins, orders, shifts, and menu changes</p>
          </div>
          <span className="text-sm text-muted-foreground self-center">{visible.length} event{visible.length !== 1 ? "s" : ""}</span>
        </div>
        <div className="flex gap-1.5 mt-3 flex-wrap">
          {CATEGORY_FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                filter === f.key
                  ? "bg-gray-900 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      {visible.length === 0 ? (
        <EmptyState icon={History} message={filter === "all" ? "No activity recorded yet." : `No ${filter} activity recorded yet.`} />
      ) : (
        <div className="divide-y max-h-[600px] overflow-y-auto">
          {visible.map((entry) => {
            const meta = ACTION_META[entry.action] ?? { label: entry.action, icon: History, color: "text-gray-600 bg-gray-50" }
            const Icon = meta.icon
            return (
              <div key={entry.id} className="flex items-start gap-4 px-5 py-3.5 hover:bg-gray-50">
                <div className={`mt-0.5 flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center ${meta.color}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{meta.label}</span>
                    {entry.target_username && (
                      <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-mono">
                        @{entry.target_username}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 break-words">{entry.details}</p>
                </div>
                <div className="flex-shrink-0 text-right flex flex-col gap-1 items-end">
                  <div className="flex gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-[10px] text-gray-500 hover:text-gray-700"
                      onClick={() => handleArchive(entry)}
                      disabled={archivingId === entry.id}
                    >
                      {archivingId === entry.id ? (
                        <RefreshCw className="h-3 w-3 animate-spin" />
                      ) : (
                        <Archive className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    by <span className="font-medium text-foreground">@{entry.actor_username}</span>
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {new Date(entry.created_at).toLocaleString("en-PH", {
                      month: "long", day: "numeric", year: "numeric",
                      hour: "2-digit", minute: "2-digit", hour12: true,
                    })}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Security History Section ─────────────────────────────────────────────────

function SecurityHistorySection({
  entries,
  adminName,
  onChangePassword,
}: {
  entries: AuditEntry[]
  adminName: string
  onChangePassword: () => void
}) {
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border shadow-sm">
        <div className="p-5 border-b flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="font-semibold">My Security History</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Password changes for your account ({adminName})
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {entries.length} event{entries.length !== 1 ? "s" : ""}
            </span>
            <Button variant="outline" size="sm" className="gap-2" onClick={onChangePassword}>
              <KeyRound className="h-3.5 w-3.5" />
              Change Password
            </Button>
          </div>
        </div>
        {entries.length === 0 ? (
          <EmptyState icon={ShieldCheck} message="No password changes recorded for your account yet." />
        ) : (
          <div className="divide-y">
            {entries.map((entry) => (
              <div key={entry.id} className="flex items-start gap-4 px-5 py-3.5 hover:bg-gray-50">
                <div className="mt-0.5 flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center text-purple-600 bg-purple-50">
                  <KeyRound className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-sm">Password Changed</span>
                  <p className="text-xs text-muted-foreground mt-0.5">{entry.details}</p>
                </div>
                <div className="flex-shrink-0 text-right">
                  <p className="text-xs text-muted-foreground">
                    {new Date(entry.created_at).toLocaleString("en-PH", {
                      month: "short", day: "numeric", year: "numeric",
                      hour: "2-digit", minute: "2-digit", hour12: true,
                    })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Void Codes Section ───────────────────────────────────────────────────────

function VoidCodesSection({ codes, onRefresh }: { codes: VoidCodeRow[]; onRefresh: () => Promise<void> }) {
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState("")
  const [copied, setCopied] = useState<string | null>(null)

  const available = codes.filter((c) => !c.used_by)
  const used = codes.filter((c) => !!c.used_by)

  const handleGenerate = async () => {
    setGenerating(true)
    setGenError("")
    try {
      // Ensure cookies are sent and handle non-JSON responses gracefully
      const res = await fetch("/api/void-codes", {
        method: "PUT",
        headers: { "Accept": "application/json" },
        credentials: "same-origin",
      })

      let j: any = null
      try { j = await res.json() } catch (e) { /* ignore - will handle below */ }

      if (!res.ok) {
        const errMsg = j?.error ?? j?.details ?? `Failed to generate codes (HTTP ${res.status})`
        setGenError(errMsg)
        return
      }

      // Refresh the list; if server returned generated codes, prefer using them
      try {
        await onRefresh()
      } catch {
        // If refresh fails, surface generated codes so admin can copy them manually
        if (j?.generated && Array.isArray(j.generated) && j.generated.length > 0) {
          setGenError(`Generated codes: ${j.generated.join(", ")} — refresh failed to load the updated list.`)
        }
      }
    } catch {
      setGenError("Network error.")
    } finally {
      setGenerating(false)
    }
  }

  const copy = (code: string) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(code)
      setTimeout(() => setCopied(null), 2000)
    })
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border shadow-sm">
        <div className="p-5 border-b flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="font-semibold flex items-center gap-2">
              <KeySquare className="h-4 w-4" />
              Void Authorization Codes
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Share available codes with cashiers when they need to void an order. Each code is single-use.
            </p>
          </div>
          <Button onClick={handleGenerate} disabled={generating} size="sm" className="gap-2">
            {generating ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <KeySquare className="h-3.5 w-3.5" />}
            Generate 5 New Codes
          </Button>
        </div>
        {genError && (
          <div className="mx-5 mt-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">{genError}</div>
        )}

        {/* Available codes */}
        <div className="p-5">
          <h3 className="text-sm font-medium text-green-700 mb-3 flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-green-500 inline-block" />
            Available Codes ({available.length})
          </h3>
          {available.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">All codes have been used. Generate new ones above.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {available.map((c) => (
                <button
                  key={c.id}
                  onClick={() => copy(c.code)}
                  title="Click to copy"
                  className="flex items-center justify-between gap-2 border border-green-200 bg-green-50 rounded-lg px-3 py-2.5 hover:bg-green-100 transition-colors text-left group"
                >
                  <span className="font-mono font-bold text-sm tracking-widest text-green-800">{c.code}</span>
                  <span className="text-[10px] text-green-600 group-hover:text-green-800">
                    {copied === c.code ? "Copied!" : "Copy"}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Used codes */}
        {used.length > 0 && (
          <div className="px-5 pb-5 border-t pt-5">
            <h3 className="text-sm font-medium text-gray-500 mb-3 flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-gray-400 inline-block" />
              Used Codes ({used.length})
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left border-b">
                    <th className="pb-2 font-semibold text-muted-foreground uppercase tracking-wide pr-4">Code</th>
                    <th className="pb-2 font-semibold text-muted-foreground uppercase tracking-wide pr-4">Used By</th>
                    <th className="pb-2 font-semibold text-muted-foreground uppercase tracking-wide pr-4">Order</th>
                    <th className="pb-2 font-semibold text-muted-foreground uppercase tracking-wide">Date Used</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {used.map((c) => (
                    <tr key={c.id} className="text-muted-foreground">
                      <td className="py-2 pr-4 font-mono text-gray-500 line-through">{c.code}</td>
                      <td className="py-2 pr-4">{c.used_by ?? "—"}</td>
                      <td className="py-2 pr-4 font-mono">{c.sale_id?.substring(0, 8) ?? "—"}…</td>
                      <td className="py-2">
                        {c.used_at
                          ? new Date(c.used_at).toLocaleString("en-PH", {
                              month: "short", day: "numeric",
                              hour: "2-digit", minute: "2-digit", hour12: true,
                            })
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Menu Management Section (uses shared product context) ────────────────────

function MenuSection() {
  const { products, categories, isLoading, addProduct, updateProduct, deleteProduct, refreshProducts } = useProducts()
  const [showModal, setShowModal] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [filterCat, setFilterCat] = useState("all")
  const [saving, setSaving] = useState(false)

  const filtered = filterCat === "all" ? products : products.filter((p) => p.category === filterCat)
  const usedCats = Array.from(new Set(products.map((p) => p.category)))

  const getCategoryName = (id: string) =>
    categories.find((c) => c.id === id)?.name ?? id

  const handleToggleAvailability = async (product: Product) => {
    await updateProduct(product.id, { available: !product.available })
  }

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this product? This cannot be undone.")) return
    await deleteProduct(id)
  }

  const handleSave = async (data: Omit<Product, "id"> & { id?: number }) => {
    setSaving(true)
    try {
      if (data.id) {
        await updateProduct(data.id, data)
      } else {
        await addProduct(data)
      }
      setShowModal(false)
      setEditingProduct(null)
    } finally {
      setSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <select
            value={filterCat}
            onChange={(e) => setFilterCat(e.target.value)}
            className="border rounded-md px-3 py-1.5 text-sm bg-white"
          >
            <option value="all">All Categories ({products.length})</option>
            {usedCats.map((c) => (
              <option key={c} value={c}>
                {getCategoryName(c)} ({products.filter((p) => p.category === c).length})
              </option>
            ))}
          </select>
        </div>
        <Button onClick={() => { setEditingProduct(null); setShowModal(true) }} className="gap-2">
          <Plus className="h-4 w-4" /> Add Product
        </Button>
      </div>

      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState icon={UtensilsCrossed} message="No products found." />
        ) : (
          <div className="divide-y">
            {filtered.map((product) => (
              <div key={product.id} className="flex items-center gap-4 p-3 hover:bg-gray-50">
                <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-gray-100">
                  {product.image ? (
                    <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-300">
                      <UtensilsCrossed className="h-5 w-5" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-sm truncate">{product.name}</p>
                    {!product.available && (
                      <Badge variant="secondary" className="text-[10px] h-4 px-1.5 bg-red-50 text-red-600 border-0">
                        Unavailable
                      </Badge>
                    )}
                    {product.stock !== null && product.stock !== undefined && (
                      <Badge
                        variant="secondary"
                        className={`text-[10px] h-4 px-1.5 border-0 ${
                          product.stock === 0
                            ? "bg-red-100 text-red-700"
                            : product.stock <= 5
                            ? "bg-orange-50 text-orange-700"
                            : "bg-blue-50 text-blue-700"
                        }`}
                      >
                        {product.stock === 0 ? "Out of Stock" : `Stock: ${product.stock}`}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{getCategoryName(product.category)}</p>
                </div>
                <p className="font-semibold text-sm flex-shrink-0">{fmt(product.price)}</p>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Button
                    size="icon" variant="ghost" className="h-8 w-8"
                    title={product.available ? "Mark Unavailable" : "Mark Available"}
                    onClick={() => handleToggleAvailability(product)}
                  >
                    {product.available
                      ? <Eye className="h-4 w-4 text-green-600" />
                      : <EyeOff className="h-4 w-4 text-gray-400" />}
                  </Button>
                  <Button
                    size="icon" variant="ghost" className="h-8 w-8"
                    onClick={() => { setEditingProduct(product as any); setShowModal(true) }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon" variant="ghost" className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50"
                    onClick={() => handleDelete(product.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <ProductFormModal
          product={editingProduct}
          categories={categories}
          saving={saving}
          onSave={handleSave}
          onClose={() => { setShowModal(false); setEditingProduct(null) }}
        />
      )}
    </>
  )
}

// ─── Product Form Modal ───────────────────────────────────────────────────────

function ProductFormModal({
  product, categories, saving, onSave, onClose,
}: {
  product: Product | null
  categories: { id: string; name: string }[]
  saving: boolean
  onSave: (data: any) => void
  onClose: () => void
}) {
  const [name, setName] = useState(product?.name ?? "")
  const [price, setPrice] = useState(product?.price?.toString() ?? "")
  const [category, setCategory] = useState(product?.category ?? "")
  const [image, setImage] = useState(product?.image ?? "")
  const [description, setDescription] = useState(product?.description ?? "")
  const [available, setAvailable] = useState(product?.available ?? true)
  const [stock, setStock] = useState(
    product?.stock === null || product?.stock === undefined ? "" : String(product.stock)
  )
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleImageFile = (file: File) => {
    if (!file.type.startsWith("image/")) return
    setUploading(true)
    const reader = new FileReader()
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string
      const img = new window.Image()
      img.onload = () => {
        const MAX = 500
        const ratio = Math.min(MAX / img.width, MAX / img.height, 1)
        const canvas = document.createElement("canvas")
        canvas.width = Math.round(img.width * ratio)
        canvas.height = Math.round(img.height * ratio)
        const ctx = canvas.getContext("2d")!
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        setImage(canvas.toDataURL("image/jpeg", 0.82))
        setUploading(false)
      }
      img.src = dataUrl
    }
    reader.readAsDataURL(file)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave({
      id: product?.id,
      name, price: parseFloat(price), category,
      image: image || null, description: description || null, available,
      stock: stock.trim() === "" ? null : Math.max(0, Math.floor(Number(stock))),
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md bg-white rounded-xl shadow-xl p-6 mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold">{product ? "Edit Product" : "Add New Product"}</h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Product Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Grilled Chicken" required />
          </div>
          <div className="space-y-1.5">
            <Label>Price (₱)</Label>
            <Input type="number" step="0.01" min="0" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" required />
          </div>
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory} required>
              <SelectTrigger><SelectValue placeholder="Select a category" /></SelectTrigger>
              <SelectContent>
                {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Image — URL input + file upload + preview */}
          <div className="space-y-1.5">
            <Label>Image</Label>
            <Input value={image} onChange={(e) => setImage(e.target.value)} placeholder="https://... (or upload below)" />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageFile(f) }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full gap-2"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {uploading ? "Processing…" : "Upload Image from Device"}
            </Button>
            {image && (
              <div className="relative w-full aspect-video rounded-lg overflow-hidden border bg-gray-50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image} alt="preview" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => setImage("")}
                  className="absolute top-1.5 right-1.5 rounded-full bg-black/60 text-white p-0.5 hover:bg-black/80"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Description (optional)</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Includes Rice & Soup" />
          </div>

          <div className="space-y-1.5">
            <Label>Stock / Quantity</Label>
            <Input
              type="number" min="0" step="1"
              value={stock}
              onChange={(e) => setStock(e.target.value)}
              placeholder="Leave blank for unlimited"
            />
            <p className="text-[11px] text-muted-foreground leading-tight">
              Leave blank for unlimited. Set a number to track inventory — it decreases automatically with each sale. When it reaches 0 the item shows "Not Available" in the cashier POS.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <input type="checkbox" id="avail-admin" checked={available} onChange={(e) => setAvailable(e.target.checked)} className="h-4 w-4" />
            <Label htmlFor="avail-admin" className="cursor-pointer">Available for sale</Label>
          </div>
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
            <Button type="submit" disabled={saving} className="flex-1 gap-2">
              {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {product ? "Save Changes" : "Add Product"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Staff Accounts Section ───────────────────────────────────────────────────

function StaffSection({ staff, onRefresh }: { staff: StaffUser[]; onRefresh: () => Promise<void> }) {
  const [showModal, setShowModal] = useState(false)
  const [editingUser, setEditingUser] = useState<StaffUser | null>(null)
  const [resetUser, setResetUser] = useState<StaffUser | null>(null)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  const flash = (msg: string, type: "ok" | "err") => {
    if (type === "ok") { setSuccess(msg); setTimeout(() => setSuccess(""), 3000) }
    else { setError(msg); setTimeout(() => setError(""), 4000) }
  }

  const handleSave = async (data: { username: string; name: string; password: string; role: string }) => {
    setSaving(true)
    setError("")
    try {
      const isEdit = !!editingUser
      const res = await fetch("/api/users", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isEdit ? { id: editingUser.id, name: data.name, password: data.password || undefined } : data),
      })
      const json = await res.json()
      if (!res.ok) { flash(json.error ?? "Failed to save", "err"); return }
      await onRefresh()
      setShowModal(false)
      setEditingUser(null)
      flash(isEdit ? "Account updated." : `Account created. Password: ${data.password}`, "ok")
    } finally {
      setSaving(false)
    }
  }

  const handleResetPassword = async (newPassword: string) => {
    if (!resetUser) return
    setSaving(true)
    setError("")
    try {
      const res = await fetch("/api/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: resetUser.id, name: resetUser.name, password: newPassword }),
      })
      const json = await res.json()
      if (!res.ok) { flash(json.error ?? "Failed to reset password", "err"); return }
      setResetUser(null)
      flash(`Password reset for ${resetUser.name}.`, "ok")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (user: StaffUser) => {
    if (!confirm(`Delete "${user.name}" (@${user.username})? This cannot be undone.`)) return
    setDeletingId(user.id)
    setError("")
    try {
      const res = await fetch("/api/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: user.id }),
      })
      const json = await res.json()
      if (!res.ok) { flash(json.error ?? "Failed to delete", "err"); return }
      await onRefresh()
      flash(`${user.name} removed.`, "ok")
    } finally {
      setDeletingId(null)
    }
  }

  const admins = staff.filter((u) => u.role === "admin")
  const cashiers = staff.filter((u) => u.role === "cashier")
  const sorted = [...admins, ...cashiers]

  return (
    <div className="space-y-4">
      {success && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 px-4 py-2.5 rounded-lg text-sm">
          <CheckCircle className="h-4 w-4 flex-shrink-0" />{success}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-2.5 rounded-lg text-sm">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />{error}
        </div>
      )}

      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="p-5 border-b flex items-center justify-between">
          <div>
            <h2 className="font-semibold">Staff Accounts</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{staff.length} account{staff.length !== 1 ? "s" : ""}</p>
          </div>
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => { setEditingUser(null); setShowModal(true) }}
          >
            <Plus className="h-4 w-4" />Add Staff
          </Button>
        </div>

        {sorted.length === 0 ? (
          <EmptyState icon={Users} message="No staff accounts found." />
        ) : (
          <div className="divide-y">
            {sorted.map((user) => (
              <div key={user.id} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50">
                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-bold text-primary">
                    {user.name.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{user.name}</p>
                  <p className="text-xs text-muted-foreground">@{user.username}</p>
                </div>
                <Badge
                  className={`text-xs flex-shrink-0 ${
                    user.role === "admin"
                      ? "bg-primary/10 text-primary border-0"
                      : "bg-gray-100 text-gray-600 border-0"
                  }`}
                >
                  {user.role === "admin" ? "Admin" : "Cashier"}
                </Badge>
                <p className="text-xs text-muted-foreground flex-shrink-0 hidden sm:block">
                  Since {new Date(user.created_at).toLocaleDateString("en-PH", { month: "short", year: "numeric" })}
                </p>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-gray-500 hover:text-primary"
                    onClick={() => { setEditingUser(user); setShowModal(true) }}
                    title="Edit account"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-gray-500 hover:text-amber-600"
                    onClick={() => setResetUser(user)}
                    title="Reset password"
                  >
                    <KeyRound className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-gray-500 hover:text-red-600"
                    onClick={() => handleDelete(user)}
                    disabled={deletingId === user.id}
                    title="Delete account"
                  >
                    {deletingId === user.id
                      ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      : <Trash2 className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <StaffFormModal
          user={editingUser}
          saving={saving}
          onSave={handleSave}
          onClose={() => { setShowModal(false); setEditingUser(null) }}
        />
      )}
      {resetUser && (
        <ResetPasswordModal
          user={resetUser}
          saving={saving}
          onSave={handleResetPassword}
          onClose={() => setResetUser(null)}
        />
      )}
    </div>
  )
}

// ─── Password strength helpers + Reset Password Modal ─────────────────────────

interface PasswordCriteria {
  label: string
  met: boolean
}

function getPasswordCriteria(pw: string): PasswordCriteria[] {
  return [
    { label: "At least 8 characters",  met: pw.length >= 8 },
    { label: "One uppercase letter",   met: /[A-Z]/.test(pw) },
    { label: "One number",             met: /[0-9]/.test(pw) },
    { label: "One special character",  met: /[^A-Za-z0-9]/.test(pw) },
  ]
}

function getStrengthScore(pw: string): number {
  return getPasswordCriteria(pw).filter((c) => c.met).length
}

const STRENGTH_LABELS = ["", "Weak", "Fair", "Good", "Strong"]
const STRENGTH_COLORS = ["", "bg-red-500", "bg-orange-400", "bg-yellow-400", "bg-green-500"]
const STRENGTH_TEXT   = ["", "text-red-600", "text-orange-500", "text-yellow-600", "text-green-600"]

function PasswordStrengthMeter({ password }: { password: string }) {
  if (!password) return null
  const score = getStrengthScore(password)
  const criteria = getPasswordCriteria(password)
  return (
    <div className="mt-2 space-y-2">
      <div className="flex gap-1">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-colors ${i <= score ? STRENGTH_COLORS[score] : "bg-gray-200"}`}
          />
        ))}
      </div>
      <p className={`text-xs font-medium ${score === 4 ? "text-green-600" : STRENGTH_TEXT[score] || "text-gray-500"}`}>
        {score === 4 ? "Strong — all requirements met" : STRENGTH_LABELS[score] || "Very Weak"}
      </p>
      <ul className="space-y-0.5">
        {criteria.map((c) => (
          <li key={c.label} className={`flex items-center gap-1.5 text-xs ${c.met ? "text-green-600" : "text-muted-foreground"}`}>
            <CheckCircle className={`h-3 w-3 flex-shrink-0 ${c.met ? "text-green-500" : "text-gray-300"}`} />
            {c.label}
          </li>
        ))}
      </ul>
    </div>
  )
}

function ResetPasswordModal({
  user, saving, onSave, onClose,
}: {
  user: StaffUser
  saving: boolean
  onSave: (newPassword: string) => void
  onClose: () => void
}) {
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [showPw, setShowPw] = useState(false)
  const [validationError, setValidationError] = useState("")

  const score = getStrengthScore(password)
  const isStrong = score === 4

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setValidationError("")
    if (!isStrong) {
      setValidationError("Password does not meet all strength requirements.")
      return
    }
    if (password !== confirm) {
      setValidationError("Passwords do not match.")
      return
    }
    onSave(password.trim())
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm bg-white rounded-xl shadow-xl p-6 mx-4">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-bold">Reset Password</h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <p className="text-sm text-muted-foreground mb-5">
          Set a new password for <span className="font-medium text-foreground">{user.name}</span> (@{user.username}). No current password required.
        </p>
        {validationError && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm mb-4">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />{validationError}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>New Password</Label>
            <div className="relative">
              <Input
                type={showPw ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter new password"
                required
                className="pr-10"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground"
              >
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <PasswordStrengthMeter password={password} />
          </div>
          <div className="space-y-1.5">
            <Label>Confirm New Password</Label>
            <Input
              type={showPw ? "text" : "password"}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Re-enter new password"
              required
            />
          </div>
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
            <Button type="submit" disabled={saving || !isStrong} className="flex-1 gap-2">
              {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              Reset Password
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Staff Form Modal ─────────────────────────────────────────────────────────

function StaffFormModal({
  user, saving, onSave, onClose,
}: {
  user: StaffUser | null
  saving: boolean
  onSave: (data: { username: string; name: string; password: string; role: string }) => void
  onClose: () => void
}) {
  const isEdit = !!user
  const [username, setUsername] = useState(user?.username ?? "")
  const [name, setName] = useState(user?.name ?? "")
  const [password, setPassword] = useState("")
  const [role, setRole] = useState(user?.role ?? "cashier")
  const [showPw, setShowPw] = useState(false)

  const score = getStrengthScore(password)
  const isStrong = score === 4
  const passwordEntered = password.trim().length > 0
  const canSubmit = isEdit ? (!passwordEntered || isStrong) : isStrong

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    onSave({ username, name, password, role })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm bg-white rounded-xl shadow-xl p-6 mx-4">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold">{isEdit ? "Edit Account" : "Add Staff Account"}</h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Username</Label>
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. cashier5"
              required
              disabled={isEdit}
              className={isEdit ? "bg-gray-50 text-gray-500" : ""}
            />
            {isEdit && <p className="text-xs text-muted-foreground">Username cannot be changed.</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Full Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Cashier 5"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label>{isEdit ? "New Password (leave blank to keep current)" : "Password"}</Label>
            <div className="relative">
              <Input
                type={showPw ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isEdit ? "Enter new password to change" : "Set a password"}
                required={!isEdit}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground"
              >
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {passwordEntered && <PasswordStrengthMeter password={password} />}
          </div>
          {!isEdit && (
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cashier">Cashier</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
            <Button type="submit" disabled={saving || !canSubmit} className="flex-1 gap-2">
              {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {isEdit ? "Save Changes" : "Create Account"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Shared UI helpers ────────────────────────────────────────────────────────

function StatCard({
  icon: Icon, label, value, sub, valueClass,
}: {
  icon: React.ElementType; label: string; value: string; sub?: string; valueClass?: string
}) {
  return (
    <div className="bg-white rounded-xl border p-5 shadow-sm">
      <div className="flex items-center gap-3 mb-3">
        <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <p className="text-sm text-muted-foreground font-medium">{label}</p>
      </div>
      <p className={`text-2xl font-bold ${valueClass ?? ""}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  )
}

function EmptyState({ icon: Icon, message }: { icon: React.ElementType; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
      <Icon className="h-10 w-10 mb-3 opacity-30" />
      <p className="text-sm">{message}</p>
    </div>
  )
}
