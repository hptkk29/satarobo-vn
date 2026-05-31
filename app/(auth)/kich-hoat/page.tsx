import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ActivateForm } from "./activate-form";

export const metadata: Metadata = { title: "Kích hoạt tài khoản" };

export default function ActivatePage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link href="/" aria-label="Sata Robo — Trang chủ" className="inline-flex items-center justify-center">
            <Image
              src="/brand/logo-satarobo.jpg"
              alt="Sata Robo"
              width={200}
              height={60}
              priority
              className="h-14 w-auto object-contain"
            />
          </Link>
          <p className="mt-3 text-sm text-gray-500">Kích hoạt tài khoản phụ huynh</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
          <ActivateForm />
          <p className="mt-4 text-center text-xs text-gray-400">
            Đã có mật khẩu?{" "}
            <Link href="/login" className="text-orange-600 hover:underline">
              Đăng nhập
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
