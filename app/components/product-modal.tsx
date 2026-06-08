"use client"

import { useState, useEffect, useRef } from "react"
import { X, Loader2, Upload, ImagePlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useProducts } from "../context/product-context"
import type { Product } from "../context/cart-context"

interface ProductModalProps {
  isOpen: boolean
  onClose: () => void
  product?: Product | null
  mode: "add" | "edit"
}

export default function ProductModal({ isOpen, onClose, product, mode }: ProductModalProps) {
  const { categories, addProduct, updateProduct } = useProducts()
  const [name, setName] = useState("")
  const [price, setPrice] = useState("")
  const [category, setCategory] = useState("")
  const [image, setImage] = useState("")
  const [description, setDescription] = useState("")
  const [available, setAvailable] = useState(true)
  const [stock, setStock] = useState("")
  const [saving, setSaving] = useState(false)
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

  useEffect(() => {
    if (product && mode === "edit") {
      setName(product.name)
      setPrice(product.price.toString())
      setCategory(product.category)
      setImage(product.image || "")
      setDescription(product.description || "")
      setAvailable(product.available ?? true)
      setStock(product.stock === null || product.stock === undefined ? "" : String(product.stock))
    } else {
      setName("")
      setPrice("")
      setCategory("")
      setImage("")
      setDescription("")
      setAvailable(true)
      setStock("")
    }
  }, [product, mode, isOpen])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const productData = {
        name,
        price: parseFloat(price),
        category,
        image: image || null,
        description: description || null,
        available,
        stock: stock.trim() === "" ? null : Math.max(0, Math.floor(Number(stock))),
      }
      if (mode === "edit" && product) {
        await updateProduct(product.id, productData)
      } else {
        await addProduct(productData)
      }
      onClose()
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md bg-background rounded-lg shadow-lg p-6 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">
            {mode === "add" ? "Add New Product" : "Edit Product"}
          </h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Product Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter product name"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="price">Price (₱)</Label>
            <Input
              id="price"
              type="number"
              step="0.01"
              min="0"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0.00"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">Category</Label>
            <Select value={category} onValueChange={setCategory} required>
              <SelectTrigger>
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="image">Image</Label>
            <Input
              id="image"
              value={image}
              onChange={(e) => setImage(e.target.value)}
              placeholder="https://... (or upload below)"
            />
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
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
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

          <div className="space-y-2">
            <Label htmlFor="description">Description (optional)</Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g., Includes Rice, Soup & Drinks"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="stock">Stock / Quantity</Label>
            <Input
              id="stock"
              type="number"
              min="0"
              step="1"
              value={stock}
              onChange={(e) => setStock(e.target.value)}
              placeholder="Leave blank for unlimited"
            />
            <p className="text-[11px] text-muted-foreground leading-tight">
              Leave blank for unlimited. Set a number to track inventory — it decreases
              automatically with each sale. When it reaches 0 the item shows as
              &quot;Out of Stock&quot; in the cashier POS.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="available"
              checked={available}
              onChange={(e) => setAvailable(e.target.checked)}
              className="h-4 w-4"
            />
            <Label htmlFor="available" className="cursor-pointer">Available for sale</Label>
          </div>

          <div className="flex gap-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" disabled={saving} className="flex-1 gap-2">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {mode === "add" ? "Add Product" : "Save Changes"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
