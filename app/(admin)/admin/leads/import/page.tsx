"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { ExcelImporter, type ImportResult } from "@/components/admin/ExcelImporter";
import { parseLeadImportRow, normalizePhone, LEAD_IMPORT_COLUMNS } from "@/lib/lead/import";
import { leadStatusLabel } from "@/lib/leads/status";
import { formatPhoneVN } from "@/lib/phone";

interface LeadImportRow {
  [key: string]: string | number | null | undefined;
}

export default function ImportLeadsPage() {
  const router = useRouter();

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <div>
        <Link href="/leads" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" /> Danh sách lead
        </Link>
        <h1 className="text-2xl font-bold">Import lead từ Excel</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Nhập nhiều lead thu ở sự kiện. Cột cố định, validate từng dòng, chống trùng theo SĐT.
        </p>
        <p className="mt-2 text-sm">
          Có file <b>danh sách khách ĐÃ ĐĂNG KÝ</b> của Sale (nhiều sheet theo tháng)?{" "}
          <Link href="/leads/import/registered" className="text-state-info-ink hover:underline">
            Import danh sách đã đăng ký →
          </Link>
        </p>
      </div>

      <ExcelImporter<LeadImportRow>
        title="Import lead"
        /* Mẫu SINH ĐỘNG: dropdown khoá đúng tên khoá đang có, SĐT kiểu text,
           tuổi con kiểu số — xem app/api/admin/templates/leads/route.ts. */
        templateUrl="/api/admin/templates/leads"
        templateFilename="mau-lead.xlsx"
        duplicateLabel="SĐT"
        duplicateKey={(raw) => normalizePhone(raw["SĐT"]) || null}
        mergeDuplicates={{ label: "Cùng SĐT — con sẽ gộp vào 1 lead" }}
        checkExisting={async (raws, excelNos) => {
          // Đối chiếu SĐT với lead ĐÃ CÓ trong CRM — báo rõ trùng với PH nào,
          // đã có con tên gì để Sale biết dòng này sẽ gộp vào lead nào.
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
                `SĐT ${formatPhoneVN(m.phone)} ĐÃ CÓ trong CRM: PH "${m.parentName}"` +
                  ` — con: ${m.childName?.trim() || "(chưa ghi tên con)"}` +
                  ` — trạng thái: ${leadStatusLabel(m.status)}.` +
                  ` Con ở dòng này sẽ được THÊM vào lead đó (không tạo lead trùng số).` +
                  ` Nếu đúng là người khác → sửa SĐT hoặc xoá dòng.`,
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
          // Trùng SĐT (trong file hoặc với lead có sẵn) → server tự gộp con vào 1 lead,
          // không cần cờ xác nhận nữa.
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

      <div className="space-y-1 rounded-xl border border-border bg-muted p-4 text-sm text-muted-foreground">
        <p className="font-semibold text-foreground">Định dạng cột (cố định):</p>
        <ol className="list-decimal list-inside space-y-0.5">
          {LEAD_IMPORT_COLUMNS.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ol>
        <ul className="mt-2 list-disc list-inside space-y-0.5">
          <li><b>SĐT</b> bắt buộc + hợp lệ (09xx / +84), ô kiểu <b>text</b> nên giữ số 0 đầu.</li>
          <li>
            <b>Trùng SĐT = cùng một nhà</b>: các dòng cùng số (trong file hoặc trùng lead
            có sẵn) được gộp thành <b>1 lead nhiều con</b> — không tạo lead trùng số. Tên
            phụ huynh ghi khác nhau vẫn gộp; tên đang có được giữ nguyên, tên khác chỉ ghi
            vào lịch sử lead.
          </li>
          <li>
            <b>Cơ sở</b>: quản lý cơ sở <b>để trống</b> → lead tự về cơ sở của mình. Điền mã
            (vd CS1) khi cần nhập hộ cơ sở khác — cần quyền HO/Super Admin.
          </li>
          <li><b>Khoá quan tâm</b>: chọn trong danh sách của file mẫu (đúng tên khoá trong hệ thống).</li>
          <li><b>Tuổi con</b>: số nguyên 3–18 (hoặc trống).</li>
        </ul>
      </div>
    </div>
  );
}
