"use client"

import { useState } from "react"
import Image from "next/image"
import { PlusCircle, Plus, Pencil, Trash2, Loader2, AlertTriangle, RefreshCw } from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useCart } from "../context/cart-context"
import { useProducts } from "../context/product-context"
import ProductModal from "./product-modal"
import type { Product } from "../context/cart-context"

interface ProductGridProps {
  category: string
  searchQuery: string
}

export default function ProductGrid({ category, searchQuery }: ProductGridProps) {
  const { addToCart } = useCart()
  const { products, isLoading, loadError, retryLoad, isEditMode, deleteProduct } = useProducts()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [modalMode, setModalMode] = useState<"add" | "edit">("add")
  const [isRetrying, setIsRetrying] = useState(false)

  const visibleProducts = isEditMode
    ? products
    : products.filter((p) => p.available !== false)

  const filteredProducts = visibleProducts.filter((product) => {
    const matchesCategory = category === "all" || product.category === category
    const matchesSearch = product.name.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesCategory && matchesSearch
  })

  const handleAddProduct = () => {
    setEditingProduct(null)
    setModalMode("add")
    setIsModalOpen(true)
  }

  const handleEditProduct = (product: Product, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingProduct(product)
    setModalMode("edit")
    setIsModalOpen(true)
  }

  const handleDeleteProduct = async (productId: number, e: React.MouseEvent) => {
    e.stopPropagation()
    if (confirm("Are you sure you want to delete this product?")) {
      await deleteProduct(productId)
    }
  }

  const handleRetry = async () => {
    setIsRetrying(true)
    await retryLoad()
    setIsRetrying(false)
  }

  const isPromoCategory = (cat: string) => {
    return cat === "beer-buckets" || cat === "grill-diners-budget"
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Loading menu...</p>
        </div>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center max-w-sm">
          <AlertTriangle className="h-10 w-10 text-amber-500 mx-auto mb-3" />
          <h3 className="font-semibold text-base mb-1">Unable to load menu</h3>
          <p className="text-sm text-muted-foreground mb-4">
            The server could not be reached. Please check your connection and try again.
          </p>
          <Button onClick={handleRetry} disabled={isRetrying} variant="outline" size="sm">
            {isRetrying ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Retrying…
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Try Again
              </>
            )}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {isEditMode && (
          <Card
            className="overflow-hidden transition-all duration-200 hover:scale-105 hover:shadow-md cursor-pointer border-2 border-dashed border-primary/50 bg-primary/5 min-h-[200px] flex items-center justify-center"
            onClick={handleAddProduct}
          >
            <CardContent className="p-4 flex flex-col items-center justify-center text-center">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                <Plus className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-medium text-primary">Add New Product</h3>
              <p className="text-xs text-muted-foreground mt-1">Click to add item</p>
            </CardContent>
          </Card>
        )}

        {filteredProducts.map((product) => {
          const isOutOfStock = product.stock !== null && product.stock !== undefined && product.stock <= 0
          const isLowStock = product.stock !== null && product.stock !== undefined && product.stock > 0 && product.stock <= 5
          const canAddToCart = !isEditMode && product.available !== false && !isOutOfStock
          return (
          <Card
            key={product.id}
            className={`overflow-hidden transition-all duration-200 hover:shadow-md group relative ${
              canAddToCart ? "cursor-pointer hover:scale-105" : "cursor-not-allowed"
            } ${
              isPromoCategory(product.category) ? "ring-2 ring-orange-500 ring-offset-2" : ""
            } ${(!product.available && isEditMode) || (isOutOfStock && !isEditMode) ? "opacity-60" : ""}`}
            onClick={() => canAddToCart && addToCart(product)}
          >
            {isPromoCategory(product.category) && !isOutOfStock && (
              <Badge className="absolute top-2 left-2 z-20 bg-orange-500 hover:bg-orange-600 text-white text-[10px] px-1.5 py-0.5">
                PROMO
              </Badge>
            )}

            {isEditMode && !product.available && (
              <Badge className="absolute top-2 left-2 z-20 bg-red-500 text-white text-[10px] px-1.5 py-0.5">
                Unavailable
              </Badge>
            )}

            {!isEditMode && isLowStock && (
              <Badge className="absolute top-2 left-2 z-20 bg-amber-500 hover:bg-amber-600 text-white text-[10px] px-1.5 py-0.5">
                Only {product.stock} left
              </Badge>
            )}

            {isEditMode && product.stock !== null && product.stock !== undefined && (
              <Badge className="absolute bottom-2 left-2 z-20 bg-slate-700 text-white text-[10px] px-1.5 py-0.5">
                Stock: {product.stock}
              </Badge>
            )}

            {isEditMode && (
              <div className="absolute top-2 right-2 z-20 flex gap-1">
                <Button
                  size="icon"
                  variant="secondary"
                  className="h-7 w-7 bg-background/90 hover:bg-background"
                  onClick={(e) => handleEditProduct(product, e)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="destructive"
                  className="h-7 w-7"
                  onClick={(e) => handleDeleteProduct(product.id, e)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}

            <div className="relative aspect-square">
              {!isEditMode && !isOutOfStock && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100 z-10">
                  <PlusCircle className="h-10 w-10 text-white" />
                </div>
              )}
              <Image
                src={product.image || "/placeholder.svg"}
                alt={product.name}
                fill
                className={`object-cover ${isOutOfStock ? "grayscale" : ""}`}
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                quality={80}
                priority={false}
              />
              {isOutOfStock && (
                <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/55 backdrop-blur-[1px] pointer-events-none">
                  <div className="-rotate-12 border-[3px] border-red-600 bg-red-600/10 px-3 py-1 rounded-md shadow-lg">
                    <span className="font-extrabold text-red-700 text-sm tracking-wider uppercase whitespace-nowrap">
                      Not Available
                    </span>
                  </div>
                </div>
              )}
            </div>
            <CardContent className="p-3">
              <div>
                <h3 className="font-medium line-clamp-1">{product.name}</h3>
                {product.description && (
                  <p className="text-xs text-muted-foreground/70 line-clamp-1">{product.description}</p>
                )}
                <p className="text-sm text-primary font-semibold">₱{product.price.toFixed(2)}</p>
              </div>
            </CardContent>
          </Card>
          )
        })}

        {filteredProducts.length === 0 && !isEditMode && (
          <div className="col-span-full py-12 text-center">
            <p className="text-muted-foreground">No items found in this category</p>
          </div>
        )}
      </div>

      <ProductModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        product={editingProduct}
        mode={modalMode}
      />
    </>
  )
}
