'use client'

import { useTransition, useState } from 'react'
import { Loader2, Eye, EyeOff } from 'lucide-react'
import { changePassword } from '../actions'

export function ChangePasswordForm() {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setSuccess(false)
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await changePassword(formData)
      if (result.error) {
        setError(result.error)
      } else {
        setSuccess(true)
        ;(e.target as HTMLFormElement).reset()
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-sm">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}
      {success && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          Mật khẩu đã được cập nhật
        </div>
      )}

      <div>
        <label className="mb-1.5 block text-sm font-semibold text-gray-700">Mật khẩu hiện tại</label>
        <div className="relative">
          <input
            name="currentPassword"
            type={showCurrent ? 'text' : 'password'}
            required
            className="w-full rounded-lg border border-gray-200 px-3 py-2.5 pr-10 text-sm focus:border-[#7C3AED] focus:outline-none focus:ring-2 focus:ring-[#7C3AED]/20"
          />
          <button type="button" onClick={() => setShowCurrent(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-semibold text-gray-700">Mật khẩu mới</label>
        <div className="relative">
          <input
            name="newPassword"
            type={showNew ? 'text' : 'password'}
            required
            minLength={8}
            className="w-full rounded-lg border border-gray-200 px-3 py-2.5 pr-10 text-sm focus:border-[#7C3AED] focus:outline-none focus:ring-2 focus:ring-[#7C3AED]/20"
          />
          <button type="button" onClick={() => setShowNew(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-semibold text-gray-700">Xác nhận mật khẩu mới</label>
        <input
          name="confirmPassword"
          type="password"
          required
          className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:border-[#7C3AED] focus:outline-none focus:ring-2 focus:ring-[#7C3AED]/20"
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="flex items-center gap-2 rounded-lg bg-[#7C3AED] px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
      >
        {pending && <Loader2 className="h-4 w-4 animate-spin" />}
        {pending ? 'Đang lưu...' : 'Cập nhật mật khẩu'}
      </button>
    </form>
  )
}
