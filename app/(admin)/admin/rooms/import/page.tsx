"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { ExcelImporter, type ImportResult } from "@/components/admin/ExcelImporter";

interface RoomImportRow {
  name: string;
  code: string;
  centerSlug: string;
  capacity: number | string;
  equipment?: string;
  status?: string;
  notes?: string;
  displayOrder?: number | string;
}

function asString(v: unknown): string | undefined {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return undefined;
}

const VALID_STATUSES = new Set(["ACTIVE", "MAINTENANCE", "INACTIVE"]);

export default function ImportRoomsPage() {
  const router = useRouter();

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <div>
        <Link
          href="/admin/rooms"
          className="mb-3 inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-700"
        >
          <ChevronLeft className="h-4 w-4" /> Quay lại danh sách
        </Link>
        <h1 className="text-2xl font-bold">Import Phòng học từ Excel</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Cột <code>centerSlug</code> phải khớp slug cơ sở (vd: <code>danang</code>). Upsert
          theo cặp (centerId, code).
        </p>
      </div>

      <ExcelImporter<RoomImportRow>
        title="Import Phòng học"
        templateUrl="/templates/mau-phong-hoc.xlsx"
        templateFilename="mau-phong-hoc.xlsx"
        columnHints={[
          { key: "name", label: "Tên phòng", required: true },
          { key: "code", label: "Mã phòng", required: true },
          { key: "centerSlug", label: "Slug cơ sở", required: true },
          { key: "capacity", label: "Sức chứa", required: true },
          { key: "equipment", label: "Thiết bị (cách bằng dấu ,)" },
          { key: "status", label: "Trạng thái" },
          { key: "notes", label: "Ghi chú" },
          { key: "displayOrder", label: "Order" },
        ]}
        parseRow={(row) => {
          const name = asString(row.name);
          const code = asString(row.code);
          const centerSlug = asString(row.centerSlug);
          if (!name) return { error: "Thiếu tên phòng" };
          if (!code) return { error: "Thiếu mã phòng" };
          const upperCode = code.toUpperCase();
          if (!/^[A-Z0-9-]+$/.test(upperCode)) {
            return { error: "Mã chỉ A-Z, 0-9, dấu -" };
          }
          if (!centerSlug) return { error: "Thiếu centerSlug" };

          const rawCapacity = row.capacity;
          const cap =
            typeof rawCapacity === "number"
              ? rawCapacity
              : parseInt(String(rawCapacity ?? ""), 10);
          if (!Number.isFinite(cap) || cap < 1) return { error: "Sức chứa phải >= 1" };

          const status = asString(row.status) ?? "ACTIVE";
          if (!VALID_STATUSES.has(status)) {
            return { error: "Trạng thái phải là ACTIVE, MAINTENANCE hoặc INACTIVE" };
          }

          return {
            name,
            code: upperCode,
            centerSlug,
            capacity: cap,
            equipment: asString(row.equipment),
            status,
            notes: asString(row.notes),
            displayOrder: row.displayOrder as number | string | undefined,
          };
        }}
        onImport={async (rows) => {
          const res = await fetch("/api/admin/import/rooms", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ rows }),
          });
          if (!res.ok) {
            const err = (await res.json().catch(() => ({ error: "Unknown" }))) as {
              error?: string;
            };
            throw new Error(err.error || "Import thất bại");
          }
          const result = (await res.json()) as ImportResult;
          setTimeout(() => router.refresh(), 1000);
          return result;
        }}
      />

      <div className="text-sm text-neutral-500 mt-4 space-y-1 rounded-xl border border-neutral-200 bg-neutral-50 p-4">
        <p className="font-semibold text-neutral-700">Lưu ý:</p>
        <ul className="list-disc list-inside space-y-0.5">
          <li>
            Upsert key là <code>(centerId, code)</code> — trùng cặp này sẽ UPDATE.
          </li>
          <li>
            <code>equipment</code> phân tách bằng dấu phẩy. VD:{" "}
            <code>Robot SR1, Laptop, Máy chiếu</code>.
          </li>
          <li>
            <code>status</code> chỉ nhận <code>ACTIVE</code> / <code>MAINTENANCE</code> /{" "}
            <code>INACTIVE</code>. Mặc định <code>ACTIVE</code>.
          </li>
          <li>
            <code>centerSlug</code> sai sẽ bị bỏ qua row đó (highlight đỏ trong report).
          </li>
        </ul>
      </div>
    </div>
  );
}
