"use client"

import type React from "react"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { useSession, signOut } from "next-auth/react"

import {
  LayoutGrid,
  Utensils,
  Soup,
  ChefHat,
  Flame,
  Egg,
  UtensilsCrossed,
  Package,
  Sandwich,
  Coffee,
  Croissant,
  SaladIcon,
  CookingPot,
  LeafyGreen,
  IceCream,
  CupSoda,
  Beer,
  GlassWater,
  PartyPopper,
  Settings,
  Plus,
  Pencil,
  Trash2,
  X,
  Check,
  BarChart2,
  LogOut,
  User,
  Clock,
  DoorOpen,
  KeyRound,
  Printer,
  ClipboardList,
} from "lucide-react"
import ChangePasswordDialog from "./change-password-dialog"
import PrinterSetupDialog from "./printer-setup-dialog"
import CashierSummaryDialog from "./cashier-summary-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { useProducts } from "../context/product-context"
import type { Shift } from "@/hooks/use-shift"

interface CategorySidebarProps {
  selectedCategory: string
  onSelectCategory: (category: string) => void
  shift?: Shift | null
  onCloseShift?: () => void
}

const categoryIcons: Record<string, React.ElementType> = {
  "all": LayoutGrid,
  "main-course": Utensils,
  "appetizer": Soup,
  "pasta-noodles": ChefHat,
  "grill-diners-budget": Flame,
  "all-day-breakfast-silog": Egg,
  "combo-meals": UtensilsCrossed,
  "special-set": Package,
  "snacks-burger-sub": Sandwich,
  "american-breakfast": Coffee,
  "continental-breakfast": Croissant,
  "side-order": SaladIcon,
  "sizzlers": CookingPot,
  "salads": LeafyGreen,
  "desserts": IceCream,
  "shakes": CupSoda,
  "beers": Beer,
  "drinks": GlassWater,
  "beer-buckets": PartyPopper,
}

export default function CategorySidebar({
  selectedCategory,
  onSelectCategory,
  shift,
  onCloseShift,
}: CategorySidebarProps) {
  const router = useRouter()
  const { data: session } = useSession()
  const { categories, isEditMode, toggleEditMode, addCategory, updateCategory, deleteCategory, products } = useProducts()
  const [isAddingCategory, setIsAddingCategory] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState("")
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null)
  const [editingCategoryName, setEditingCategoryName] = useState("")

  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false)
  const [isPrinterSetupOpen, setIsPrinterSetupOpen] = useState(false)
  const [isSummaryOpen, setIsSummaryOpen] = useState(false)

  const isAdmin = session?.user?.role === "admin"
  const userName = session?.user?.name ?? "Staff"

  const shiftStartTime = shift
    ? new Date(shift.start_time).toLocaleTimeString("en-PH", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      })
    : null

  const handleAddCategory = () => {
    if (newCategoryName.trim()) {
      const id = newCategoryName.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")
      addCategory({ id, name: newCategoryName.trim() })
      setNewCategoryName("")
      setIsAddingCategory(false)
    }
  }

  const handleEditCategory = (id: string) => {
    if (editingCategoryName.trim()) {
      updateCategory(id, editingCategoryName.trim())
      setEditingCategoryId(null)
      setEditingCategoryName("")
    }
  }

  const handleDeleteCategory = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm("Are you sure you want to delete this category?")) return
    const result = await deleteCategory(id)
    if (result?.error) {
      alert(result.error)
    } else {
      if (selectedCategory === id) onSelectCategory("all")
    }
  }

  const getProductCount = (categoryId: string) => {
    if (categoryId === "all") return products.length
    return products.filter(p => p.category === categoryId).length
  }

  const isPromoCategory = (categoryId: string) => {
    return categoryId === "beer-buckets" || categoryId === "grill-diners-budget"
  }

  return (
    <div className="w-56 border-r bg-background flex flex-col h-full">
      {/* User Info */}
      <div className="px-4 py-3 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            <User className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{userName}</p>
            <Badge
              variant={isAdmin ? "default" : "secondary"}
              className="text-[10px] px-1.5 py-0 h-4"
            >
              {isAdmin ? "Admin" : "Cashier"}
            </Badge>
          </div>
        </div>

        {/* Shift info */}
        {shift && shiftStartTime && (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-green-600 font-medium">
            <Clock className="h-3 w-3" />
            <span>Shift since {shiftStartTime}</span>
          </div>
        )}
      </div>

      {/* Header */}
      <div className="p-4 pb-2 border-b">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Categories</h2>
          {isAdmin && (
            <Button
              variant={isEditMode ? "default" : "ghost"}
              size="icon"
              className="h-8 w-8"
              onClick={toggleEditMode}
              title={isEditMode ? "Exit Edit Mode" : "Manage Menu"}
            >
              <Settings className={cn("h-4 w-4", isEditMode && "animate-spin")} />
            </Button>
          )}
        </div>
        {isEditMode && isAdmin && (
          <Badge variant="secondary" className="mt-2 w-full justify-center text-xs">
            Edit Mode Active
          </Badge>
        )}
      </div>

      {/* Admin Dashboard + Close Shift buttons */}
      <div className="px-3 pt-2 space-y-1.5">
        {isAdmin && (
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start text-xs gap-2 h-8"
            onClick={() => router.push("/admin")}
          >
            <BarChart2 className="h-3.5 w-3.5" />
            Admin Dashboard
          </Button>
        )}
        {shift && onCloseShift && (
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start text-xs gap-2 h-8 text-orange-700 border-orange-300 hover:bg-orange-50 hover:text-orange-800"
            onClick={onCloseShift}
          >
            <DoorOpen className="h-3.5 w-3.5" />
            Close Shift
          </Button>
        )}
      </div>

      {/* Categories list */}
      <div className="flex-1 overflow-y-auto scrollbar-hide p-3">
        <div className="grid gap-2">
          <Button
            variant="ghost"
            className={cn(
              "flex h-auto flex-col items-center justify-center py-2 px-2 border bg-transparent min-h-[60px] font-semibold",
              selectedCategory === "all"
                ? "border-2 border-primary bg-primary/10 text-primary font-medium"
                : "border-muted text-muted-foreground hover:border-muted-foreground hover:text-foreground",
              "hover:bg-primary/5 transition-colors",
            )}
            onClick={() => onSelectCategory("all")}
          >
            <LayoutGrid className="mb-1 h-6 w-6" />
            <span className="text-sm font-semibold text-center leading-tight">All Products</span>
            <span className="text-[10px] text-muted-foreground">({getProductCount("all")})</span>
          </Button>

          {categories.map((category) => {
            const Icon = categoryIcons[category.id] || Package
            const isActive = selectedCategory === category.id
            const isEditing = editingCategoryId === category.id
            const isPromo = isPromoCategory(category.id)

            return (
              <div key={category.id} className="relative">
                {isEditing ? (
                  <div className="flex items-center gap-1 p-2 border rounded-md bg-background">
                    <Input
                      value={editingCategoryName}
                      onChange={(e) => setEditingCategoryName(e.target.value)}
                      className="h-7 text-xs"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleEditCategory(category.id)
                        if (e.key === "Escape") setEditingCategoryId(null)
                      }}
                    />
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => handleEditCategory(category.id)}>
                      <Check className="h-3 w-3" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditingCategoryId(null)}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="ghost"
                    className={cn(
                      "w-full flex h-auto flex-col items-center justify-center py-2 px-2 border bg-transparent min-h-[60px]",
                      isActive
                        ? "border-2 border-primary bg-primary/10 text-primary font-medium"
                        : "border-muted text-muted-foreground hover:border-muted-foreground hover:text-foreground",
                      isPromo && !isActive && "border-orange-500/50",
                      "hover:bg-primary/5 transition-colors",
                    )}
                    onClick={() => onSelectCategory(category.id)}
                  >
                    {isPromo && (
                      <Badge className="absolute -top-1 -right-1 bg-orange-500 text-[8px] px-1 py-0 h-4">
                        PROMO
                      </Badge>
                    )}
                    <Icon className="mb-1 h-5 w-5" />
                    <span className={cn(
                      "text-xs text-center leading-tight",
                      category.id === "beer-buckets" && "text-[10px]"
                    )}>
                      {category.name}
                    </span>
                    <span className="text-[10px] text-muted-foreground">({getProductCount(category.id)})</span>
                  </Button>
                )}

                {isEditMode && isAdmin && !isEditing && (
                  <div className="absolute -top-1 -right-1 flex gap-0.5">
                    <Button
                      size="icon"
                      variant="secondary"
                      className="h-5 w-5 rounded-full"
                      onClick={(e) => {
                        e.stopPropagation()
                        setEditingCategoryId(category.id)
                        setEditingCategoryName(category.name)
                      }}
                    >
                      <Pencil className="h-2.5 w-2.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="destructive"
                      className="h-5 w-5 rounded-full"
                      onClick={(e) => handleDeleteCategory(category.id, e)}
                    >
                      <Trash2 className="h-2.5 w-2.5" />
                    </Button>
                  </div>
                )}
              </div>
            )
          })}

          {isEditMode && isAdmin && (
            <>
              {isAddingCategory ? (
                <div className="flex items-center gap-1 p-2 border border-dashed rounded-md">
                  <Input
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder="Category name"
                    className="h-7 text-xs"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAddCategory()
                      if (e.key === "Escape") setIsAddingCategory(false)
                    }}
                  />
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={handleAddCategory}>
                    <Check className="h-3 w-3" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setIsAddingCategory(false)}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <Button
                  variant="ghost"
                  className="flex h-auto flex-col items-center justify-center py-2 px-2 border-2 border-dashed border-muted-foreground/30 bg-transparent min-h-[60px] hover:bg-primary/5 hover:border-primary/50 transition-colors"
                  onClick={() => setIsAddingCategory(true)}
                >
                  <Plus className="mb-1 h-5 w-5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Add Category</span>
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Bottom actions */}
      <div className="p-3 border-t space-y-1">
        {!isAdmin && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-xs gap-2 h-8 text-muted-foreground hover:text-foreground hover:bg-muted"
            onClick={() => setIsSummaryOpen(true)}
          >
            <ClipboardList className="h-3.5 w-3.5" />
            Order History
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-xs gap-2 h-8 text-muted-foreground hover:text-foreground hover:bg-muted"
          onClick={() => setIsPrinterSetupOpen(true)}
        >
          <Printer className="h-3.5 w-3.5" />
          Printer Setup
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-xs gap-2 h-8 text-muted-foreground hover:text-foreground hover:bg-muted"
          onClick={() => setIsChangePasswordOpen(true)}
        >
          <KeyRound className="h-3.5 w-3.5" />
          Change Password
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-xs gap-2 h-8 text-muted-foreground hover:text-red-600 hover:bg-red-50"
          onClick={async () => { localStorage.removeItem("cart"); await signOut({ redirect: false }); window.location.href = "/login" }}
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign Out
        </Button>
      </div>

      <ChangePasswordDialog
        open={isChangePasswordOpen}
        onOpenChange={setIsChangePasswordOpen}
      />
      <PrinterSetupDialog
        open={isPrinterSetupOpen}
        onOpenChange={setIsPrinterSetupOpen}
      />
      <CashierSummaryDialog
        open={isSummaryOpen}
        onOpenChange={setIsSummaryOpen}
        cashierName={userName}
      />
    </div>
  )
}
