"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { precheckUpsert } from "@/components/admin/import-precheck";
import {
  ExcelImporter,
  type ImportResult,
} from "@/components/admin/ExcelImporter";
import { PageHelp } from "@/components/admin/ui/page-help";

interface ClassImportRow {
  classCode?: string;
  name: string;
  courseSlug: string;
  centerSlug: string;
  roomCode?: string;
  teacherCode?: string;
  assistantCode?: string;
  startDate?: string | number | Date;
  endDate?: string | number | Date;
  scheduleDays?: string | number;
  startTime?: string;
  endTime?: string;
  minStudents?: number | string;
  maxStudents?: number | string;
  status?: string;
  description?: string;
  notes?: string;
}

const VALID_STATUSES = new Set([
  "PLANNED",
  "RECRUITING",
  "ACTIVE",
  "COMPLETED",
  "CANCELLED",
]);

function asString(v: unknown): string | undefined {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return undefined;
}

function looksLikeDate(v: unknown): boolean {
  if (v instanceof Date) return true;
  if (typeof v === "number" && Number.isFinite(v)) return true;
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return false;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return true;
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) return true;
    if (!Number.isNaN(Date.parse(s))) return true;
  }
  return false;
}

export default function ImportClassesPage() {
  const router = useRouter();

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <div>
        <Link
          href="/classes"
          className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" /> Quay lại danh sách
        </Link>
        <h1 className="text-2xl font-bold">Import Lớp học từ Excel</h1>
      </div>

      <PageHelp>
        <p>
          <code>classCode</code> = khoá upsert. <strong>5 references</strong>{" "}
          phải tồn tại trước: courseSlug, centerSlug, roomCode (theo center),
          teacherCode + assistantCode (Employee role TEACHER/CENTER_MANAGER + có
          User account).
        </p>
      </PageHelp>

      <ExcelImporter<ClassImportRow>
        title="Import Lớp học"
        templateUrl="/templates/mau-lop-hoc-v2.xlsx"
        templateFilename="mau-lop-hoc-v2.xlsx"
        duplicateLabel="Mã lớp"
        duplicateKey={(raw) => String(raw.classCode ?? "").trim() || null}
        checkExisting={(raws, nos) =>
          precheckUpsert(
            "classes",
            raws.map((r) => String(r.classCode ?? "").trim() || null),
            nos,
            "Mã lớp",
          )
        }
        columnHints={[
          { key: "classCode", label: "Mã lớp (upsert key)" },
          { key: "name", label: "Tên lớp", required: true },
          { key: "courseSlug", label: "Slug khoá học", required: true },
          { key: "centerSlug", label: "Slug cơ sở", required: true },
          { key: "roomCode", label: "Mã phòng" },
          { key: "teacherCode", label: "Mã GV chính" },
          { key: "assistantCode", label: "Mã GV phụ" },
          { key: "startDate", label: "Ngày khai giảng" },
          { key: "endDate", label: "Ngày kết thúc" },
          { key: "scheduleDays", label: "Thứ học (T2,T5 hoặc 1,4)" },
          { key: "startTime", label: "Giờ bắt đầu HH:mm" },
          { key: "endTime", label: "Giờ kết thúc HH:mm" },
          { key: "minStudents", label: "Min HS" },
          { key: "maxStudents", label: "Max HS" },
          { key: "status", label: "Trạng thái" },
          { key: "description", label: "Mô tả" },
          { key: "notes", label: "Ghi chú" },
        ]}
        parseRow={(row) => {
          const name = asString(row.name);
          const courseSlug = asString(row.courseSlug);
          const centerSlug = asString(row.centerSlug);

          if (!name) return { error: "Thiếu tên lớp (name)" };
          if (!courseSlug) return { error: "Thiếu courseSlug" };
          if (!centerSlug) return { error: "Thiếu centerSlug" };

          const status = asString(row.status);
          if (status && !VALID_STATUSES.has(status)) {
            return {
              error: `Trạng thái sai. Hợp lệ: ${[...VALID_STATUSES].join(" / ")}`,
            };
          }

          const startTime = asString(row.startTime);
          if (startTime && !/^\d{2}:\d{2}$/.test(startTime)) {
            return { error: "startTime phải HH:mm (pad 0, vd 08:00)" };
          }
          const endTime = asString(row.endTime);
          if (endTime && !/^\d{2}:\d{2}$/.test(endTime)) {
            return { error: "endTime phải HH:mm (pad 0)" };
          }

          if (row.startDate && !looksLikeDate(row.startDate)) {
            return { error: "startDate phải YYYY-MM-DD hoặc DD/MM/YYYY" };
          }
          if (row.endDate && !looksLikeDate(row.endDate)) {
            return { error: "endDate phải YYYY-MM-DD hoặc DD/MM/YYYY" };
          }

          for (const key of ["minStudents", "maxStudents"] as const) {
            const raw = row[key];
            if (raw !== undefined && raw !== null && raw !== "") {
              const n =
                typeof raw === "number" ? raw : parseInt(String(raw), 10);
              if (!Number.isFinite(n) || n < 1) {
                return { error: `${key} phải là số >= 1` };
              }
            }
          }

          return {
            classCode: asString(row.classCode),
            name,
            courseSlug,
            centerSlug,
            roomCode: asString(row.roomCode),
            teacherCode: asString(row.teacherCode),
            assistantCode: asString(row.assistantCode),
            startDate: row.startDate as string | number | Date | undefined,
            endDate: row.endDate as string | number | Date | undefined,
            scheduleDays: row.scheduleDays as string | number | undefined,
            startTime,
            endTime,
            minStudents: row.minStudents as number | string | undefined,
            maxStudents: row.maxStudents as number | string | undefined,
            status,
            description: asString(row.description),
            notes: asString(row.notes),
          };
        }}
        onImport={async (rows) => {
          const res = await fetch("/api/admin/import/classes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ rows }),
          });
          if (!res.ok) {
            const err = (await res
              .json()
              .catch(() => ({ error: "Unknown" }))) as {
              error?: string;
            };
            throw new Error(err.error || "Import thất bại");
          }
          const result = (await res.json()) as ImportResult;
          setTimeout(() => router.refresh(), 1000);
          return result;
        }}
      />

      <div className="text-sm text-muted-foreground mt-4 space-y-1 rounded-xl border border-border bg-muted p-4">
        <p className="font-semibold text-foreground">Lưu ý:</p>
        <ul className="list-disc list-inside space-y-0.5">
          <li>
            <code>scheduleDays</code> chấp nhận Vietnamese (vd{" "}
            <code>T2,T5</code>) hoặc numeric (vd <code>1,4</code>). Quy ước:
            CN=0, T2=1, …, T7=6. Phân tách bằng dấu phẩy.
          </li>
          <li>
            <code>roomCode</code> phải thuộc <code>centerSlug</code> đã chọn (vd{" "}
            <code>DN-A1</code> chỉ tồn tại trong cơ sở <code>danang</code>). Sai
            → row bỏ qua.
          </li>
          <li>
            <code>teacherCode</code> / <code>assistantCode</code>: phải là
            Employee có <strong>role TEACHER hoặc CENTER_MANAGER</strong> +{" "}
            <strong>status ACTIVE</strong>+ có User account active. Sai → row bỏ
            qua.
          </li>
          <li>GV phụ không được trùng GV chính → row bỏ qua.</li>
          <li>
            <code>startTime</code> / <code>endTime</code>: định dạng{" "}
            <code>HH:mm</code> (luôn pad số 0, vd <code>08:00</code> không phải{" "}
            <code>8:00</code>).
          </li>
          <li>
            Default: <code>minStudents=5</code>, <code>maxStudents=20</code>,{" "}
            <code>status=PLANNED</code>.
          </li>
          <li>
            <code>classCode</code> trùng → UPDATE; mới → CREATE; rỗng → luôn
            CREATE.
          </li>
        </ul>
      </div>
    </div>
  );
}
