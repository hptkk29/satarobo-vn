'use client'

import { useState, useMemo } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, CheckCircle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { formatVnd } from '@/lib/utils'
import {
  PRODUCTS,
  CATEGORY_LABELS,
  AGE_FILTER_LABELS,
  type Product,
  type ProductCategory,
  type AgeFilter,
} from '@/lib/data/products'
import { cn } from '@/lib/utils'

type CategoryFilter = ProductCategory | 'all'
type SortKey = 'newest' | 'price-asc' | 'price-desc'

const CATEGORY_FILTERS: CategoryFilter[] = ['all', 'co-ban', 'nang-cao', 'phu-kien']
const AGE_FILTERS = ['all', '5-7', '8-10', '11+'] as const

function ProductCard({
  product,
  onOpen,
}: {
  product: Product
  onOpen: (p: Product) => void
}) {
  return (
    <div className="card-base overflow-hidden flex flex-col group">
      {/* Image */}
      <div className="relative h-48 bg-gradient-to-br from-orange-50 to-purple-50 overflow-hidden">
        <Image
          src={product.image}
          alt={product.name}
          fill
          className="object-cover transition-transform duration-300 group-hover:scale-105"
        />
        {/* Age badge */}
        <div className="absolute top-3 right-3">
          <Badge className="bg-white/90 text-text-dark border-0 text-xs font-semibold shadow-sm">
            {product.ageRange}
          </Badge>
        </div>
        {/* Category badge */}
        <div className="absolute top-3 left-3">
          <Badge
            className={cn(
              'border-0 text-xs font-bold text-white',
              product.category === 'co-ban'
                ? 'bg-primary-orange'
                : product.category === 'nang-cao'
                  ? 'bg-primary-purple'
                  : 'bg-gray-600'
            )}
          >
            {CATEGORY_LABELS[product.category]}
          </Badge>
        </div>
      </div>

      {/* Content */}
      <div className="p-5 flex flex-col gap-3 flex-1">
        <h3 className="font-extrabold text-text-dark leading-snug">{product.name}</h3>
        <p className="text-sm text-text-muted line-clamp-2">{product.description}</p>

        <div className="flex items-center justify-between mt-auto pt-3 border-t border-border">
          <div className="font-extrabold text-primary-orange">{formatVnd(product.price)}</div>
          <button
            onClick={() => onOpen(product)}
            className="inline-flex items-center gap-1.5 text-sm font-bold text-primary-purple hover:text-primary-purple-dark transition"
          >
            Xem chi tiết
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}

function ProductDialog({
  product,
  onClose,
}: {
  product: Product | null
  onClose: () => void
}) {
  return (
    <Dialog open={product !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        {product && (
          <>
            <DialogHeader>
              <DialogTitle className="text-xl font-extrabold text-text-dark pr-8">
                {product.name}
              </DialogTitle>
            </DialogHeader>

            {/* Product image */}
            <div className="relative h-64 rounded-2xl overflow-hidden bg-gradient-to-br from-orange-50 to-purple-50 mt-2">
              <Image
                src={product.image}
                alt={product.name}
                fill
                className="object-cover"
              />
              {/* ANH CẦN CUNG CẤP ẢNH THẬT — placeholder */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="text-gray-400 text-xs text-center select-none opacity-40">
                  ANH CẦN CUNG CẤP ẢNH THẬT<br />
                  /public{product.image}
                </div>
              </div>
            </div>

            {/* Badges */}
            <div className="flex gap-2 flex-wrap">
              <Badge className="bg-soft-cream text-primary-orange border border-primary-orange/30 font-semibold">
                {product.ageRange}
              </Badge>
              <Badge
                className={cn(
                  'border-0 text-white font-semibold',
                  product.category === 'co-ban'
                    ? 'bg-primary-orange'
                    : product.category === 'nang-cao'
                      ? 'bg-primary-purple'
                      : 'bg-gray-600'
                )}
              >
                {CATEGORY_LABELS[product.category]}
              </Badge>
              <Badge className="bg-soft-purple text-primary-purple border border-primary-purple/30 font-extrabold text-base px-4 py-1">
                {formatVnd(product.price)}
              </Badge>
            </div>

            {/* Description */}
            <p className="text-text-muted leading-relaxed">{product.description}</p>

            {/* Specs */}
            <div>
              <h4 className="font-extrabold text-text-dark mb-3">Thông số kỹ thuật</h4>
              <ul className="space-y-2">
                {product.specs.map((spec) => (
                  <li key={spec} className="flex items-start gap-2 text-sm text-text-muted">
                    <CheckCircle className="w-4 h-4 text-primary-orange flex-shrink-0 mt-0.5" />
                    {spec}
                  </li>
                ))}
              </ul>
            </div>

            {/* CTA */}
            <Link
              href={`/lien-he?product=${product.slug}`}
              className="btn-primary w-full justify-center text-base mt-2"
            >
              Liên hệ đặt hàng
              <ArrowRight className="w-4 h-4" />
            </Link>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

export function ProductsSection() {
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all')
  const [ageFilter, setAgeFilter] = useState<string>('all')
  const [sort, setSort] = useState<SortKey>('newest')
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)

  const filtered = useMemo(() => {
    let list = [...PRODUCTS]

    if (categoryFilter !== 'all') {
      list = list.filter((p) => p.category === categoryFilter)
    }

    if (ageFilter !== 'all') {
      list = list.filter(
        (p) => p.ageFilter === (ageFilter as AgeFilter) || p.ageFilter === null
      )
    }

    if (sort === 'price-asc') {
      list.sort((a, b) => a.price - b.price)
    } else if (sort === 'price-desc') {
      list.sort((a, b) => b.price - a.price)
    }
    // 'newest' = keep original order (insertion order in PRODUCTS array)

    return list
  }, [categoryFilter, ageFilter, sort])

  return (
    <section className="section-padding bg-white">
      <div className="container-site">
        {/* Filter bar */}
        <div className="flex flex-col sm:flex-row gap-4 mb-10 items-start sm:items-center flex-wrap">
          {/* Category chips */}
          <div className="flex gap-2 flex-wrap">
            {CATEGORY_FILTERS.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={cn(
                  'px-4 py-2 rounded-full text-sm font-bold transition border',
                  categoryFilter === cat
                    ? 'bg-primary-orange text-white border-primary-orange'
                    : 'bg-white text-text-dark border-border hover:border-primary-orange hover:text-primary-orange'
                )}
              >
                {CATEGORY_LABELS[cat]}
              </button>
            ))}
          </div>

          <div className="flex gap-3 sm:ml-auto flex-wrap">
            {/* Age filter */}
            <Select value={ageFilter} onValueChange={(v) => setAgeFilter(v ?? 'all')}>
              <SelectTrigger className="w-[148px]">
                <SelectValue placeholder="Độ tuổi" />
              </SelectTrigger>
              <SelectContent>
                {AGE_FILTERS.map((a) => (
                  <SelectItem key={a} value={a}>
                    {AGE_FILTER_LABELS[a]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Sort */}
            <Select value={sort} onValueChange={(v) => setSort((v ?? 'newest') as SortKey)}>
              <SelectTrigger className="w-[168px]">
                <SelectValue placeholder="Sắp xếp" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Mới nhất</SelectItem>
                <SelectItem value="price-asc">Giá thấp → cao</SelectItem>
                <SelectItem value="price-desc">Giá cao → thấp</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Product grid */}
        {filtered.length === 0 ? (
          <div className="text-center py-20 text-text-muted">
            <div className="text-4xl mb-3">&#9679;</div>
            <p className="font-semibold">Không tìm thấy sản phẩm phù hợp</p>
            <button
              onClick={() => { setCategoryFilter('all'); setAgeFilter('all') }}
              className="mt-4 text-primary-orange font-bold hover:underline"
            >
              Xóa bộ lọc
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                onOpen={setSelectedProduct}
              />
            ))}
          </div>
        )}
      </div>

      {/* Product detail dialog */}
      <ProductDialog
        product={selectedProduct}
        onClose={() => setSelectedProduct(null)}
      />
    </section>
  )
}
