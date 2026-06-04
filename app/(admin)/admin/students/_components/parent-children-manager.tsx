"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { UserPlus, X, Search, Users } from "lucide-react";
import { toast } from "sonner";
import { searchLinkableStudents, addChildToParent, unlinkChildFromParent } from "../_actions";

type Child = { id: string; name: string; studentCode: string | null };

// Commit 3 — quản lý ĐA CON: hiển thị các con đang gắn với phụ huynh + thêm/bỏ con.
export function ParentChildrenManager({
  parentUserId,
  currentStudentId,
  children,
}: {
  parentUserId: string;
  currentStudentId: string;
  children: Child[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Child[]>([]);
  const [searching, setSearching] = useState(false);

  function search() {
    if (!q.trim()) return;
    setSearching(true);
    start(async () => {
      const res = await searchLinkableStudents(q);
      setSearching(false);
      if (res.ok) setResults(res.items ?? []);
      else toast.error(res.error ?? "Lỗi tìm kiếm");
    });
  }

  function add(childId: string) {
    start(async () => {
      const res = await addChildToParent({ parentUserId, childStudentId: childId });
      if (res.ok) {
        toast.success("Đã thêm con vào phụ huynh");
        setResults((r) => r.filter((x) => x.id !== childId));
        setQ("");
        router.refresh();
      } else {
        toast.error(res.error ?? "Lỗi thêm con");
      }
    });
  }

  function unlink(childId: string) {
    start(async () => {
      const res = await unlinkChildFromParent(childId);
      if (res.ok) {
        toast.success("Đã gỡ liên kết con");
        router.refresh();
      } else {
        toast.error(res.error ?? "Lỗi gỡ liên kết");
      }
    });
  }

  return (
    <div className="mt-3 rounded-xl border border-neutral-200 bg-white p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-neutral-700">
        <Users className="h-4 w-4 text-[#7C3AED]" />
        Con của phụ huynh ({children.length})
      </div>
      <ul className="mb-3 space-y-1.5">
        {children.map((c) => (
          <li key={c.id} className="flex items-center justify-between rounded-lg bg-neutral-50 px-3 py-2 text-sm">
            <span>
              <Link href={`/students/${c.id}/edit`} className="font-medium text-neutral-800 hover:underline">
                {c.name}
              </Link>
              {c.studentCode ? <span className="ml-1 text-xs text-neutral-400">({c.studentCode})</span> : null}
              {c.id === currentStudentId ? <span className="ml-2 text-[10px] font-bold text-orange-600">đang xem</span> : null}
            </span>
            {c.id !== currentStudentId && (
              <button
                type="button"
                onClick={() => unlink(c.id)}
                disabled={pending}
                className="inline-flex items-center gap-1 text-xs text-rose-600 hover:underline disabled:opacity-50"
              >
                <X className="h-3.5 w-3.5" /> Gỡ
              </button>
            )}
          </li>
        ))}
      </ul>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), search())}
            placeholder="Tìm HV chưa có phụ huynh (tên/mã/SĐT)…"
            className="w-full rounded-lg border border-neutral-300 py-2 pl-8 pr-3 text-sm focus:border-purple-400 focus:outline-none"
          />
        </div>
        <button
          type="button"
          onClick={search}
          disabled={pending}
          className="rounded-lg bg-neutral-800 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Tìm
        </button>
      </div>

      {searching && <p className="mt-2 text-xs text-neutral-400">Đang tìm…</p>}
      {results.length > 0 && (
        <ul className="mt-2 space-y-1">
          {results.map((r) => (
            <li key={r.id} className="flex items-center justify-between rounded-lg border border-neutral-100 px-3 py-2 text-sm">
              <span>
                {r.name}
                {r.studentCode ? <span className="ml-1 text-xs text-neutral-400">({r.studentCode})</span> : null}
              </span>
              <button
                type="button"
                onClick={() => add(r.id)}
                disabled={pending}
                className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50"
              >
                <UserPlus className="h-3.5 w-3.5" /> Thêm con
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
