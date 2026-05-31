"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createRule, toggleRule, grantCoins, reverseCoinTx } from "../_actions";

type Rule = { id: string; code: string; label: string; amount: number; isActive: boolean };
type Student = { id: string; name: string; studentCode: string | null };
type Txn = {
  id: string;
  amount: number;
  type: string;
  reason: string;
  createdAt: string;
  studentId: string;
  studentName: string;
  isReversal: boolean;
  alreadyReversed: boolean;
};

export function SataCoinAdmin({
  rules,
  students,
  recentTxns,
}: {
  rules: Rule[];
  students: Student[];
  recentTxns: Txn[];
}) {
  const [pending, start] = useTransition();

  // Rule form
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [ruleAmount, setRuleAmount] = useState("5");

  // Grant form
  const [studentId, setStudentId] = useState("");
  const [grantAmount, setGrantAmount] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");

  function addRule() {
    start(async () => {
      const res = await createRule({ code, label, amount: ruleAmount });
      if (res.ok) {
        toast.success("Đã tạo rule");
        setCode("");
        setLabel("");
        setRuleAmount("5");
      } else toast.error(res.error ?? "Lỗi");
    });
  }

  function grant() {
    if (!studentId || !grantAmount || !reason.trim()) {
      toast.error("Nhập học viên, số coin và lý do");
      return;
    }
    start(async () => {
      const res = await grantCoins({ studentId, amount: grantAmount, reason, note });
      if (res.ok) {
        toast.success("Đã ghi giao dịch");
        setGrantAmount("");
        setReason("");
        setNote("");
      } else toast.error(res.error ?? "Lỗi");
    });
  }

  function reverse(t: Txn) {
    start(async () => {
      const res = await reverseCoinTx(t.id, t.studentId);
      if (res.ok) toast.success("Đã đảo giao dịch");
      else toast.error(res.error ?? "Lỗi");
    });
  }

  return (
    <div className="space-y-6">
      {/* Rules */}
      <section className="rounded-xl border border-neutral-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-neutral-700">Quy tắc thưởng</h2>
        <div className="grid gap-2 sm:grid-cols-4">
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="MÃ (ATTENDANCE)" className="rounded-md border border-neutral-300 px-3 py-2 text-sm" />
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Tên rule" className="rounded-md border border-neutral-300 px-3 py-2 text-sm" />
          <input value={ruleAmount} onChange={(e) => setRuleAmount(e.target.value)} type="number" placeholder="Số coin" className="rounded-md border border-neutral-300 px-3 py-2 text-sm" />
          <button onClick={addRule} disabled={pending} className="rounded-md bg-neutral-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            Thêm rule
          </button>
        </div>
        <ul className="mt-3 divide-y text-sm">
          {rules.length === 0 ? (
            <li className="py-2 text-neutral-400">Chưa có rule.</li>
          ) : (
            rules.map((r) => (
              <li key={r.id} className="flex items-center justify-between py-2">
                <span>
                  <span className="font-mono text-xs text-neutral-500">{r.code}</span> · {r.label} ·{" "}
                  <span className="font-semibold text-emerald-700">+{r.amount}</span>
                </span>
                <button onClick={() => start(async () => void (await toggleRule(r.id)))} className={`rounded px-2 py-0.5 text-xs ${r.isActive ? "bg-emerald-100 text-emerald-700" : "bg-neutral-200 text-neutral-500"}`}>
                  {r.isActive ? "Đang bật" : "Đã tắt"}
                </button>
              </li>
            ))
          )}
        </ul>
      </section>

      {/* Grant */}
      <section className="rounded-xl border border-neutral-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-neutral-700">Cấp / điều chỉnh coin</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          <select value={studentId} onChange={(e) => setStudentId(e.target.value)} className="rounded-md border border-neutral-300 px-3 py-2 text-sm">
            <option value="">— Học viên —</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.studentCode ? ` (${s.studentCode})` : ""}
              </option>
            ))}
          </select>
          <input value={grantAmount} onChange={(e) => setGrantAmount(e.target.value)} type="number" placeholder="Số coin (âm = trừ)" className="rounded-md border border-neutral-300 px-3 py-2 text-sm" />
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Lý do (mã/ghi chú ngắn)" className="rounded-md border border-neutral-300 px-3 py-2 text-sm" />
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ghi chú (tuỳ chọn)" className="rounded-md border border-neutral-300 px-3 py-2 text-sm" />
        </div>
        <button onClick={grant} disabled={pending} className="mt-3 rounded-md bg-purple-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          Ghi giao dịch
        </button>
      </section>

      {/* Ledger */}
      <section className="rounded-xl border border-neutral-200 bg-white">
        <div className="border-b px-4 py-2 text-sm font-semibold text-neutral-700">Sổ cái gần đây</div>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-neutral-400">
            <tr>
              <th className="px-4 py-2">Học viên</th>
              <th className="px-4 py-2">Loại</th>
              <th className="px-4 py-2">Lý do</th>
              <th className="px-4 py-2 text-right">Coin</th>
              <th className="px-4 py-2">Ngày</th>
              <th className="px-4 py-2">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {recentTxns.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-neutral-400">
                  Chưa có giao dịch.
                </td>
              </tr>
            ) : (
              recentTxns.map((t) => (
                <tr key={t.id} className="border-t">
                  <td className="px-4 py-2 font-medium">{t.studentName}</td>
                  <td className="px-4 py-2 text-xs text-neutral-500">{t.type}</td>
                  <td className="px-4 py-2 text-neutral-500">{t.reason}</td>
                  <td className={`px-4 py-2 text-right font-semibold ${t.amount >= 0 ? "text-emerald-700" : "text-rose-600"}`}>
                    {t.amount >= 0 ? "+" : ""}
                    {t.amount}
                  </td>
                  <td className="px-4 py-2 text-neutral-500">{t.createdAt}</td>
                  <td className="px-4 py-2">
                    {!t.isReversal && !t.alreadyReversed ? (
                      <button onClick={() => reverse(t)} disabled={pending} className="rounded bg-rose-50 px-2 py-0.5 text-xs text-rose-600 disabled:opacity-50">
                        Đảo
                      </button>
                    ) : (
                      <span className="text-xs text-neutral-300">{t.alreadyReversed ? "đã đảo" : "—"}</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
