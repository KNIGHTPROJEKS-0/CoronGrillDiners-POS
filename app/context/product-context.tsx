"use client"

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react"
import type { Product } from "./cart-context"

export interface Category {
  id: string
  name: string
  display_order?: number
}

interface ProductContextType {
  products: Product[]
  categories: Category[]
  isLoading: boolean
  loadError: boolean
  retryLoad: () => Promise<void>
  isEditMode: boolean
  toggleEditMode: () => void
  refreshProducts: () => Promise<void>
  refreshCategories: () => Promise<void>
  addProduct: (product: Omit<Product, "id">) => Promise<void>
  updateProduct: (id: number, fields: Partial<Product>) => Promise<void>
  deleteProduct: (id: number) => Promise<void>
  addCategory: (category: Category) => Promise<void>
  updateCategory: (id: string, name: string) => Promise<void>
  deleteCategory: (id: string) => Promise<{ error?: string }>
}

const ProductContext = createContext<ProductContextType | undefined>(undefined)

export function ProductProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [isEditMode, setIsEditMode] = useState(false)

  const refreshProducts = useCallback(async () => {
    try {
      const res = await fetch("/api/products")
      if (res.ok) {
        const data = await res.json()
        setProducts(data)
      } else {
        throw new Error(`HTTP ${res.status}`)
      }
    } catch (error) {
      console.error("Failed to fetch products:", error)
      throw error
    }
  }, [])

  const refreshCategories = useCallback(async () => {
    try {
      const res = await fetch("/api/categories")
      if (res.ok) {
        const data = await res.json()
        setCategories(data)
      } else {
        throw new Error(`HTTP ${res.status}`)
      }
    } catch (error) {
      console.error("Failed to fetch categories:", error)
      throw error
    }
  }, [])

  const load = useCallback(async () => {
    setIsLoading(true)
    setLoadError(false)
    try {
      await Promise.all([refreshProducts(), refreshCategories()])
    } catch {
      setLoadError(true)
    } finally {
      setIsLoading(false)
    }
  }, [refreshProducts, refreshCategories])

  const retryLoad = useCallback(async () => {
    await load()
  }, [load])

  useEffect(() => {
    load()
  }, [load])

  const toggleEditMode = () => setIsEditMode((prev) => !prev)

  const addProduct = async (product: Omit<Product, "id">) => {
    const res = await fetch("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(product),
    })
    if (res.ok) {
      const { product: newProduct } = await res.json()
      setProducts((prev) => [...prev, newProduct])
    }
  }

  const updateProduct = async (id: number, fields: Partial<Product>) => {
    const existing = products.find((p) => p.id === id)
    if (!existing) return
    const updated = { ...existing, ...fields }
    const res = await fetch("/api/products", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updated),
    })
    if (res.ok) {
      const { product: savedProduct } = await res.json()
      setProducts((prev) => prev.map((p) => (p.id === id ? savedProduct : p)))
    }
  }

  const deleteProduct = async (id: number) => {
    const res = await fetch("/api/products", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    })
    if (res.ok) {
      setProducts((prev) => prev.filter((p) => p.id !== id))
    }
  }

  const addCategory = async (category: Category) => {
    const res = await fetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(category),
    })
    if (res.ok) {
      const { category: newCat } = await res.json()
      setCategories((prev) => [...prev, newCat])
    }
  }

  const updateCategory = async (id: string, name: string) => {
    const res = await fetch("/api/categories", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, name }),
    })
    if (res.ok) {
      setCategories((prev) => prev.map((c) => (c.id === id ? { ...c, name } : c)))
    }
  }

  const deleteCategory = async (id: string): Promise<{ error?: string }> => {
    const res = await fetch("/api/categories", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    })
    if (res.ok) {
      setCategories((prev) => prev.filter((c) => c.id !== id))
      return {}
    }
    const data = await res.json()
    return { error: data.error ?? "Failed to delete category" }
  }

  return (
    <ProductContext.Provider
      value={{
        products,
        categories,
        isLoading,
        loadError,
        retryLoad,
        isEditMode,
        toggleEditMode,
        refreshProducts,
        refreshCategories,
        addProduct,
        updateProduct,
        deleteProduct,
        addCategory,
        updateCategory,
        deleteCategory,
      }}
    >
      {children}
    </ProductContext.Provider>
  )
}

export function useProducts() {
  const context = useContext(ProductContext)
  if (context === undefined) {
    throw new Error("useProducts must be used within a ProductProvider")
  }
  return context
}
