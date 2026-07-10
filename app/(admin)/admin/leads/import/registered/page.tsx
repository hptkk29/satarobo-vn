"use client";

// Task #07 Việc 1 — UI import danh sách "khách ĐÃ ĐĂNG KÝ" (Excel nhiều sheet
// theo tháng) → Lead REGISTERED + LeadChild. Bắt buộc dry-run trước, confirm sau.
// File gửi NGUYÊN VẸN lên server parse (multi-sheet + header lệch dòng —
// không parse client như ExcelImporter 1-sheet).

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, FileSpreadsheet, Loader2, Upload, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface DryRunData {
  mode: string;
  tongDongDoc: number;
  boQua: number;
  hopLe: number;
  gopTrongFile: number;
  loi: { sheet: string; dong: number; lyDo: string }[];
  phuHuynh: number;
  hocVien: number;
  seTao: { sdt: string; tenPH: string; soCon: number }[];
  seGop: { sdt: string; tenPH: string; soConMoi: number; coThayDoi: boolean }[];
  salesKhongKhop: string[];
  khoaKhongKhop: string[];
  coSoKhongKhop: string[];
  // Dòng gắn cơ sở NGOÀI phạm vi quyền của bạn → hệ thống KHÔNG tạo (cách ly cơ sở).
  ngoaiPhamVi?: { sdt: string; tenPH: string; coSo: string }[];
  // Câu 34 — SĐT đã thuộc lead của cơ sở khác → KHÔNG gộp, KHÔNG tạo. Chỉ hiện SĐT.
  trungCoSoKhac?: { sdt: string }[];
  daTaoLead?: number;
  daTaoHocVien?: number;
  daGopLead?: number;
  khongDoi?: number;
}

async function postImport(file: File, mode: "dry-run" | "confirm"): Promise<DryRunData> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("mode", mode);
  const res = await fetch("/api/admin/import/leads/registered", { method: "POST", body: fd });
  const json = (await res.json().catch(() => null)) as
    | { ok: true; data: DryRunData }
    | { ok: false; error?: { message?: string } }
    | null;
  if (!res.ok || !json || !("ok" in json) || !json.ok) {
    throw new Error(
      (json && "error" in json && json.error?.message) || `Lỗi server (${res.status})`,
    );
  }
  return json.data;
}

export default function ImportRegisteredLeadsPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<"dry-run" | "confirm" | null>(null);
  const [preview, setPreview] = useState<DryRunData | null>(null);
  const [result, setResult] = useState<DryRunData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (mode: "dry-run" | "confirm") => {
    if (!file) return;
    setBusy(mode);
    setError(null);
    try {
      const data = await postImport(file, mode);
      if (mode === "dry-run") {
        setPreview(data);
        setResult(null);
      } else {
        setResult(data);
        setTimeout(() => router.refresh(), 1000);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi không xác định");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <div>
        <Link
          href="/leads/import"
          className="mb-3 inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-700"
        >
          <ChevronLeft className="h-4 w-4" /> Import lead (sự kiện)
        </Link>
        <h1 className="text-2xl font-bold">Import danh sách ĐÃ ĐĂNG KÝ</h1>
        <p className="mt-1 text-sm text-neutral-500">
          File Excel của Sale (nhiều sheet theo tháng). Mỗi SĐT = 1 lead trạng thái{" "}
          <b>Đã đăng ký</b>, mỗi dòng học viên = 1 con. Trùng SĐT (trong file hoặc với CRM) →{" "}
          <b>gộp</b>: giữ record cũ, bổ sung field trống, thêm ghi chú. Phải <b>xem thử</b> trước
          khi ghi.
        </p>
      </div>

      <div className="rounded-xl border border-neutral-200 p-4 space-y-3">
        <label className="flex cursor-pointer items-center gap-3 rounded-lg border-2 border-dashed border-neutral-300 p-6 hover:border-neutral-400">
          <FileSpreadsheet className="h-8 w-8 text-neutral-400" />
          <div>
            <p className="font-medium">{file ? file.name : "Chọn file Excel (.xlsx)"}</p>
            <p className="text-xs text-neutral-500">Tối đa 15MB — giữ nguyên file gốc của Sale</p>
          </div>
          <input
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setPreview(null);
              setResult(null);
              setError(null);
            }}
          />
        </label>
        <div className="flex gap-2">
          <Button onClick={() => run("dry-run")} disabled={!file || busy !== null} variant="outline">
            {busy === "dry-run" ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Eye className="mr-1 h-4 w-4" />
            )}
            Xem thử (không ghi)
          </Button>
          <Button
            onClick={() => run("confirm")}
            disabled={!file || busy !== null || !preview || result !== null}
          >
            {busy === "confirm" ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-1 h-4 w-4" />
            )}
            Xác nhận ghi vào hệ thống
          </Button>
        </div>
        {error && (
          <Alert className="border-red-500">
            <AlertDescription className="text-red-600">{error}</AlertDescription>
          </Alert>
        )}
      </div>

      {result && (
        <Alert className="border-green-500">
          <AlertDescription>
            ✅ Đã ghi: <b>{result.daTaoLead}</b> lead mới · <b>{result.daTaoHocVien}</b> học viên ·
            gộp <b>{result.daGopLead}</b> lead có sẵn · <b>{result.khongDoi}</b> không đổi (đã
            import trước đó).
          </AlertDescription>
        </Alert>
      )}

      {preview && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Dòng đã đọc" value={preview.tongDongDoc} />
            <Stat label="Hợp lệ" value={preview.hopLe} />
            <Stat label="Bỏ qua (trống)" value={preview.boQua} />
            <Stat label="Lỗi" value={preview.loi.length} tone={preview.loi.length > 0 ? "red" : undefined} />
            <Stat label="Lặp giữa sheet (đã gộp)" value={preview.gopTrongFile} />
            <Stat label="Phụ huynh (lead)" value={preview.phuHuynh} />
            <Stat label="Học viên (con)" value={preview.hocVien} />
            <Stat label="Tạo mới / Gộp CRM" value={`${preview.seTao.length} / ${preview.seGop.length}`} />
          </div>

          {(preview.salesKhongKhop.length > 0 ||
            preview.khoaKhongKhop.length > 0 ||
            preview.coSoKhongKhop.length > 0 ||
            (preview.trungCoSoKhac?.length ?? 0) > 0 ||
            (preview.ngoaiPhamVi?.length ?? 0) > 0) && (
            <Alert className="border-yellow-500">
              <AlertDescription className="space-y-1">
                {(preview.ngoaiPhamVi?.length ?? 0) > 0 && (
                  <p>
                    Ngoài phạm vi cơ sở của bạn — KHÔNG tạo (<b>{preview.ngoaiPhamVi!.length}</b> dòng):{" "}
                    <b>{preview.ngoaiPhamVi!.map((r) => r.sdt).join(", ")}</b>
                  </p>
                )}
                {(preview.trungCoSoKhac?.length ?? 0) > 0 && (
                  <p>
                    SĐT đang được cơ sở khác chăm sóc — KHÔNG gộp, KHÔNG tạo (
                    <b>{preview.trungCoSoKhac!.length}</b> dòng):{" "}
                    <b>{preview.trungCoSoKhac!.map((r) => r.sdt).join(", ")}</b>. Báo quản lý cơ sở kiểm tra.
                  </p>
                )}
                {preview.salesKhongKhop.length > 0 && (
                  <p>
                    Sales không khớp user (giữ tên trong ghi chú):{" "}
                    <b>{preview.salesKhongKhop.join(", ")}</b>
                  </p>
                )}
                {preview.khoaKhongKhop.length > 0 && (
                  <p>
                    Khoá không khớp (giữ tên trong ghi chú): <b>{preview.khoaKhongKhop.join(", ")}</b>
                  </p>
                )}
                {preview.coSoKhongKhop.length > 0 && (
                  <p>
                    Cơ sở không khớp: <b>{preview.coSoKhongKhop.join(", ")}</b>
                  </p>
                )}
              </AlertDescription>
            </Alert>
          )}

          {preview.loi.length > 0 && (
            <PreviewTable
              title={`Dòng lỗi (${preview.loi.length}) — sẽ KHÔNG import`}
              head={["Sheet", "Dòng", "Lý do"]}
              rows={preview.loi.map((e) => [e.sheet, String(e.dong), e.lyDo])}
            />
          )}

          {preview.seGop.length > 0 && (
            <PreviewTable
              title={`Sẽ gộp vào lead có sẵn (${preview.seGop.length})`}
              head={["SĐT", "Tên PH (record cũ)", "Con mới", "Thay đổi?"]}
              rows={preview.seGop.map((m) => [
                m.sdt,
                m.tenPH,
                String(m.soConMoi),
                m.coThayDoi ? "Có" : "Không (đã import)",
              ])}
            />
          )}

          {preview.seTao.length > 0 && (
            <PreviewTable
              title={`Sẽ tạo lead mới (${preview.seTao.length})`}
              head={["SĐT", "Tên PH", "Số con"]}
              rows={preview.seTao.map((c) => [c.sdt, c.tenPH, String(c.soCon)])}
            />
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: "red" }) {
  return (
    <div className="rounded-lg border border-neutral-200 p-3">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className={`text-xl font-bold ${tone === "red" ? "text-red-600" : ""}`}>{value}</p>
    </div>
  );
}

function PreviewTable({ title, head, rows }: { title: string; head: string[]; rows: string[][] }) {
  return (
    <div className="space-y-1">
      <p className="text-sm font-semibold">{title}</p>
      <div className="max-h-[320px] overflow-auto rounded-lg border border-neutral-200">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-neutral-50">
            <tr>
              {head.map((h) => (
                <th key={h} className="px-2 py-1 text-left font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 200).map((r, i) => (
              <tr key={i} className="border-t">
                {r.map((c, j) => (
                  <td key={j} className="px-2 py-1">
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length > 200 && (
          <p className="bg-neutral-50 p-2 text-center text-xs text-neutral-500">
            Hiển thị 200/{rows.length} dòng.
          </p>
        )}
      </div>
    </div>
  );
}
