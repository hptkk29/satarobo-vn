"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { ExcelImporter, type ImportResult } from "@/components/admin/ExcelImporter";
import { parseLeadImportRow, normalizePhone, LEAD_IMPORT_COLUMNS } from "@/lib/lead/import";
import { leadStatusLabel } from "@/lib/leads/status";

interface LeadImportRow {
  [key: string]: string | number | null | undefined;
}

export default function ImportLeadsPage() {
  const router = useRouter();

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <div>
        <Link href="/leads" className="mb-3 inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-700">
          <ChevronLeft className="h-4 w-4" /> Danh sách lead
        </Link>
        <h1 className="text-2xl font-bold">Import lead từ Excel</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Nhập nhiều lead thu ở sự kiện. Cột cố định, validate từng dòng, chống trùng theo SĐT.
        </p>
        <p className="mt-2 text-sm">
          Có file <b>danh sách khách ĐÃ ĐĂNG KÝ</b> của Sale (nhiều sheet theo tháng)?{" "}
          <Link href="/leads/import/registered" className="text-blue-600 hover:underline">
            Import danh sách đã đăng ký →
          </Link>
        </p>
      </div>

      <ExcelImporter<LeadImportRow>
        title="Import lead"
        templateUrl="/templates/mau-lead-v2.xlsx"
        templateFilename="mau-lead-v2.xlsx"
        duplicateLabel="SĐT"
        duplicateKey={(raw) => normalizePhone(raw["SĐT"]) || null}
        checkExisting={async (raws, excelNos) => {
          // Đối chiếu SĐT với lead ĐÃ CÓ trong CRM — báo rõ trùng với PH nào,
          // đã có con tên gì để Sale kiểm tra rồi xoá dòng / sửa SĐT.
          const res = await fetch("/api/admin/import/leads/precheck", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ phones: raws.map((r) => String(r["SĐT"] ?? "")) }),
          });
          if (!res.ok) return new Map();
          const { matches } = (await res.json()) as {
            matches: { phone: string; parentName: string; childName: string | null; status: string }[];
          };
          const byPhone = new Map(matches.map((m) => [m.phone, m]));
          const map = new Map<number, string>();
          raws.forEach((r, i) => {
            const m = byPhone.get(normalizePhone(r["SĐT"]));
            if (m) {
              map.set(
                excelNos[i],
                `SĐT ${m.phone} ĐÃ CÓ trong CRM: PH "${m.parentName}"` +
                  ` — con: ${m.childName?.trim() || "(chưa ghi tên con)"}` +
                  ` — trạng thái: ${leadStatusLabel(m.status)}. Kiểm tra rồi xoá dòng hoặc sửa SĐT.`,
              );
            }
          });
          return map;
        }}
        columnHints={LEAD_IMPORT_COLUMNS.map((c) => ({
          key: c,
          label: c,
          required: c === "Tên phụ huynh" || c === "SĐT",
        }))}
        parseRow={(row) => {
          const res = parseLeadImportRow(row as Record<string, unknown>);
          if (!res.ok) return { error: res.error };
          // Giữ nguyên ô gốc để server resolve cơ sở/khoá + chống trùng.
          return row as LeadImportRow;
        }}
        onImport={async (rows) => {
          const res = await fetch("/api/admin/import/leads", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ rows }),
          });
          if (!res.ok) {
            const err = (await res.json().catch(() => ({ error: "Unknown" }))) as { error?: string };
            throw new Error(err.error || "Import thất bại");
          }
          const result = (await res.json()) as ImportResult;
          setTimeout(() => router.refresh(), 1000);
          return result;
        }}
      />

      <div className="space-y-1 rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-500">
        <p className="font-semibold text-neutral-700">Định dạng cột (cố định):</p>
        <ol className="list-decimal list-inside space-y-0.5">
          {LEAD_IMPORT_COLUMNS.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ol>
        <ul className="mt-2 list-disc list-inside space-y-0.5">
          <li><b>SĐT</b> bắt buộc + hợp lệ (09xx / +84). Trùng SĐT → bỏ qua, không tạo mới.</li>
          <li><b>Cơ sở</b>: để trống hoặc mã cơ sở (vd CS1) — phải khớp cơ sở đang hoạt động. <b>Khoá quan tâm</b>: nếu điền phải khớp khoá có thật.</li>
          <li><b>Tuổi con</b>: 3–18 (hoặc trống).</li>
        </ul>
      </div>
    </div>
  );
}
