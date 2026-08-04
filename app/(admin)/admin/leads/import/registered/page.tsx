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
  /** 04/08 — dòng VẪN import được nhưng thiếu/mờ thông tin, cần soi trước khi ghi. */
  canKiemTra?: {
    sdt: string;
    hocVien: string;
    sheet: string;
    dong: number;
    thieu: string[];
    daDong: number | null;
    cachDong: "FULL" | "HALF";
    tuoi: number | null;
    giaNiemYet: number;
    giamTinhRa: number;
    tongPhaiNop: number;
    conLai: number;
    tra2Dot: boolean;
    hanDot2: string | null;
    giamKieu: "AMOUNT" | "PERCENT" | null;
    giamGiaTri: number | null;
    giamLyDo: string | null;
    /** Máy chia phần chênh niêm yết ↔ đã thu thành gì. */
    xuLy: FeeTreatment;
    /** Vì sao máy kết luận vậy — để người nhập đối chiếu, khỏi mở lại Excel. */
    canCu: string;
    /** true → máy không đủ căn cứ, người phải quyết. */
    phaiXem: boolean;
    giaTri: Record<EditableCol, string>;
  }[];
  /** Bảng đối chứng — con số DUY NHẤT người nhập kiểm được với sao kê. */
  doiChung?: { daThu: number; giam: number; no: number; boQuaHoanPhi: number };
  /** Cùng PH + cùng khoá tách nhiều dòng: 1 em trả 2 đợt hay 2 em thật? */
  nghiTrung?: {
    sdt: string;
    tenPH: string | null;
    hocVien: string[];
    khoa: string | null;
    ketLuan: "SAME_STUDENT" | "UNSURE";
    canCu: string;
  }[];
  // Dòng gắn cơ sở NGOÀI phạm vi quyền của bạn → hệ thống KHÔNG tạo (cách ly cơ sở).
  ngoaiPhamVi?: { sdt: string; tenPH: string; coSo: string }[];
  // Câu 34 — SĐT đã thuộc lead của cơ sở khác → KHÔNG gộp, KHÔNG tạo. Chỉ hiện SĐT.
  trungCoSoKhac?: { sdt: string }[];
  daTaoLead?: number;
  daTaoHocVien?: number;
  daGopLead?: number;
  khongDoi?: number;
}

/** Cột cho sửa tay ngay trên màn — KHÔNG có SĐT/tên học viên (định danh gộp trùng). */
type EditableCol =
  | "grade"
  | "course"
  | "tuition"
  | "center"
  | "parentName"
  | "parentCccd"
  | "address"
  | "note"
  | "payIn2"
  | "discountKind"
  | "discountValue"
  | "discountReason"
  | "dueDate2";

type Overrides = Record<string, Partial<Record<EditableCol, string>>>;

/** Cách máy chia phần chênh giữa giá niêm yết và tiền đã thu (lib/lead/import-fee-plan.ts). */
type FeeTreatment =
  | "PAID_FULL"
  | "DISCOUNT_NOTED"
  | "DISCOUNT_INFERRED"
  | "DEBT"
  | "REFUND"
  | "REVIEW";

/** Nhãn + màu cho từng cách xử lý. Đọc nhãn là biết máy làm gì với dòng đó. */
const TREATMENT: Record<FeeTreatment, { label: string; cls: string }> = {
  PAID_FULL: { label: "Đã thu đủ", cls: "bg-emerald-100 text-emerald-800" },
  DISCOUNT_NOTED: { label: "Giảm giá (ghi chú nêu rõ)", cls: "bg-sky-100 text-sky-800" },
  DISCOUNT_INFERRED: { label: "Giảm giá (máy suy)", cls: "bg-indigo-100 text-indigo-800" },
  DEBT: { label: "Còn nợ", cls: "bg-amber-100 text-amber-900" },
  REFUND: { label: "Hoàn phí — KHÔNG nhập", cls: "bg-neutral-200 text-neutral-700" },
  REVIEW: { label: "Bạn quyết", cls: "bg-red-100 text-red-800" },
};

const vnd = (n: number) => `${n.toLocaleString("vi-VN")}đ`;

const rowKey = (sheet: string, dong: number) => `${sheet}|${dong}`;

/** 8 cột lấy từ Excel — hiện thành lưới ô nhập. 4 quyết định tiền có UI riêng bên dưới. */
const EXCEL_COLS = [
  "grade", "course", "tuition", "center", "parentName", "parentCccd", "address", "note",
] as const;

const COL_LABEL: Record<EditableCol, string> = {
  grade: "Lớp",
  course: "Khoá",
  tuition: "Học phí",
  center: "Cơ sở",
  parentName: "Tên PH",
  parentCccd: "CCCD PH",
  address: "Địa chỉ",
  note: "Ghi chú",
  payIn2: "Trả 2 đợt",
  discountKind: "Kiểu giảm",
  discountValue: "Mức giảm",
  discountReason: "Giải trình giảm",
  dueDate2: "Hạn đợt 2",
};

async function postImport(
  file: File,
  mode: "dry-run" | "confirm",
  overrides: Overrides = {},
): Promise<DryRunData> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("mode", mode);
  const list = Object.entries(overrides)
    .map(([k, values]) => {
      const [sheet, dong] = k.split("|");
      return { sheet, row: Number(dong), values };
    })
    .filter((o) => Number.isInteger(o.row) && Object.keys(o.values).length > 0);
  if (list.length > 0) fd.append("overrides", JSON.stringify(list));
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
  // Ô người nhập sửa tay ở màn xem thử; gửi kèm mỗi lần xem lại / ghi thật.
  const [overrides, setOverrides] = useState<Overrides>({});

  const setCell = (sheet: string, dong: number, col: EditableCol, value: string) => {
    setOverrides((prev) => {
      const k = rowKey(sheet, dong);
      return { ...prev, [k]: { ...(prev[k] ?? {}), [col]: value } };
    });
  };

  const editedCount = Object.values(overrides).reduce((n, v) => n + Object.keys(v).length, 0);

  const run = async (mode: "dry-run" | "confirm") => {
    if (!file) return;
    setBusy(mode);
    setError(null);
    try {
      const data = await postImport(file, mode, overrides);
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
            import trước đó).{" "}
            <Link href="/leads/bulk-convert" className="font-semibold text-green-700 underline">
              Bước tiếp theo: chốt hàng loạt →
            </Link>
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
            <Stat
              label="Cần kiểm tra"
              value={preview.canKiemTra?.length ?? 0}
              tone={(preview.canKiemTra?.length ?? 0) > 0 ? "amber" : undefined}
            />
            {(() => {
              const phaiQuyet = preview.canKiemTra?.filter((w) => w.phaiXem).length ?? 0;
              const tuDong = Math.max(0, preview.hocVien - phaiQuyet);
              return (
                <>
                  <Stat label="Máy tự lo" value={tuDong} />
                  <Stat
                    label="Bạn phải quyết"
                    value={phaiQuyet}
                    tone={phaiQuyet > 0 ? "red" : undefined}
                  />
                </>
              );
            })()}
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

          {preview.doiChung && (
            <div className="rounded-lg border-2 border-neutral-800 bg-white p-3">
              <p className="text-sm font-semibold text-neutral-900">
                Đối chứng trước khi ghi
              </p>
              <p className="mb-2 text-xs text-neutral-600">
                Bạn không kiểm nổi từng dòng, nhưng kiểm được <b>một con số</b>: đối chiếu
                “Tổng đã thu” với sao kê / sổ quỹ. Khớp thì phần tiền đã đúng — phần chia
                giảm giá ↔ công nợ nếu sai thì sẽ lộ ra khi Sale đi đòi, không mất im lặng.
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="rounded-md border-2 border-neutral-900 bg-neutral-50 p-2">
                  <p className="text-xs text-neutral-600">Tổng đã thu ← đối chiếu sao kê</p>
                  <p className="text-lg font-bold text-neutral-900">{vnd(preview.doiChung.daThu)}</p>
                </div>
                <div className="rounded-md border border-sky-300 bg-sky-50 p-2">
                  <p className="text-xs text-neutral-600">Tổng giảm giá</p>
                  <p className="text-lg font-bold text-sky-800">{vnd(preview.doiChung.giam)}</p>
                </div>
                <div className="rounded-md border border-amber-300 bg-amber-50 p-2">
                  <p className="text-xs text-neutral-600">Tổng còn nợ</p>
                  <p className="text-lg font-bold text-amber-800">{vnd(preview.doiChung.no)}</p>
                </div>
                <div className="rounded-md border border-neutral-300 bg-neutral-50 p-2">
                  <p className="text-xs text-neutral-600">Bỏ qua (hoàn phí)</p>
                  <p className="text-lg font-bold text-neutral-700">
                    {preview.doiChung.boQuaHoanPhi} dòng
                  </p>
                </div>
              </div>
            </div>
          )}

          {(preview.nghiTrung?.length ?? 0) > 0 && (
            <Alert className="border-red-500 bg-red-50/50">
              <AlertDescription className="space-y-2">
                <p className="text-sm font-semibold text-red-900">
                  Nghi một học viên bị tách thành nhiều dòng ({preview.nghiTrung!.length})
                </p>
                <p className="text-xs text-neutral-700">
                  Cùng phụ huynh + cùng khoá mà có nhiều dòng. Nếu là <b>một em trả nhiều đợt</b>{" "}
                  mà cứ để nguyên thì hệ thống tạo <b>2 học viên và 2 đơn hàng</b>. Muốn gộp thì
                  sửa trong Excel cho hai dòng <b>trùng tên học viên</b>, rồi tải lại.
                </p>
                {preview.nghiTrung!.map((r, i) => (
                  <div key={`${r.sdt}-${i}`} className="rounded-md border border-red-200 bg-white p-2 text-xs">
                    <span
                      className={`mr-2 rounded-full px-2 py-0.5 font-semibold ${
                        r.ketLuan === "SAME_STUDENT"
                          ? "bg-red-100 text-red-800"
                          : "bg-amber-100 text-amber-900"
                      }`}
                    >
                      {r.ketLuan === "SAME_STUDENT" ? "Gần chắc MỘT em" : "Chưa chắc"}
                    </span>
                    <b>{r.hocVien.join("  +  ")}</b>
                    <span className="ml-2 text-neutral-500">
                      {r.tenPH ?? "?"} · {r.sdt} · {r.khoa ?? "—"}
                    </span>
                    <p className="mt-0.5 text-neutral-600">{r.canCu}</p>
                  </div>
                ))}
              </AlertDescription>
            </Alert>
          )}

          {(preview.canKiemTra?.length ?? 0) > 0 && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold">
                  Cần kiểm tra ({preview.canKiemTra!.length}) — sửa thẳng ở đây rồi bấm{" "}
                  <b>Xem thử lại</b>
                </p>
                {editedCount > 0 && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                    đã sửa {editedCount} ô (chưa ghi)
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => run("dry-run")}
                  disabled={busy !== null || editedCount === 0}
                  className="rounded-md border border-neutral-300 px-2.5 py-1 text-sm hover:bg-neutral-50 disabled:opacity-50"
                >
                  {busy === "dry-run" ? "Đang tính lại…" : "Xem thử lại"}
                </button>
                {editedCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setOverrides({})}
                    disabled={busy !== null}
                    className="rounded-md border border-neutral-300 px-2.5 py-1 text-sm hover:bg-neutral-50 disabled:opacity-50"
                  >
                    Bỏ hết sửa
                  </button>
                )}
              </div>
              <p className="text-xs text-neutral-500">
                Sửa ở đây chỉ áp cho lượt import này, KHÔNG đụng file Excel gốc. Tuổi và số
                tiền được tính lại theo giá trị mới sau khi bấm Xem thử lại. Muốn đổi SĐT hoặc
                tên học viên thì sửa trong Excel rồi tải lại — hai trường đó quyết định gộp
                trùng nên không cho sửa ở đây.
              </p>
              <div className="space-y-2">
                {[...preview.canKiemTra!]
                  // Dòng máy không đủ căn cứ lên ĐẦU — đó là chỗ tốn thời gian của bạn.
                  .sort((a, b) => Number(b.phaiXem) - Number(a.phaiXem))
                  .slice(0, 200)
                  .map((w) => {
                  const k = rowKey(w.sheet, w.dong);
                  const edited = overrides[k] ?? {};
                  const val = (c: EditableCol) => edited[c] ?? w.giaTri[c];
                  const tt = TREATMENT[w.xuLy] ?? TREATMENT.REVIEW;
                  return (
                    <div
                      key={k}
                      className={`rounded-lg border p-3 ${
                        w.phaiXem ? "border-red-300 bg-red-50/40" : "border-amber-200 bg-amber-50/40"
                      }`}
                    >
                      <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
                        <b className="text-neutral-900">{w.hocVien}</b>
                        <span className="text-neutral-500">{w.sdt}</span>
                        <span className="text-xs text-neutral-400">
                          {w.sheet} · dòng {w.dong}
                        </span>
                        <span className="text-xs text-neutral-600">
                          tuổi: <b>{w.tuoi ?? "—"}</b> · đã đóng:{" "}
                          <b>
                            {w.daDong === null ? "—" : `${w.daDong.toLocaleString("vi-VN")}đ`}
                          </b>
                          {w.cachDong === "HALF" && " (50% — còn nợ)"}
                        </span>
                      </div>
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${tt.cls}`}>
                          {tt.label}
                        </span>
                        <span className="text-xs text-neutral-600">{w.canCu}</span>
                      </div>
                      {w.thieu.length > 0 && (
                        <p className="mb-2 text-xs text-amber-800">{w.thieu.join(" · ")}</p>
                      )}
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {EXCEL_COLS.map((c) => (
                          <label key={c} className="text-xs text-neutral-600">
                            {COL_LABEL[c]}
                            <input
                              value={val(c)}
                              onChange={(e) => setCell(w.sheet, w.dong, c, e.target.value)}
                              className={`mt-0.5 w-full rounded border px-2 py-1 text-sm ${
                                edited[c] !== undefined
                                  ? "border-amber-400 bg-amber-50"
                                  : "border-neutral-300"
                              }`}
                            />
                          </label>
                        ))}
                      </div>

                      {/* Dòng hoàn phí KHÔNG được nhập → đừng hiện công nợ/ô giảm giá của nó:
                          nhãn nói "không nhập" mà bên dưới vẫn có "còn lại X đồng" thì đọc như
                          một khoản phải đòi có thật. */}
                      {w.xuLy === "REFUND" ? (
                        <div className="mt-3 rounded-md border border-neutral-300 bg-neutral-100 p-2 text-xs text-neutral-600">
                          Dòng này <b>sẽ không được nhập</b> — ghi chú cho thấy đây là ca hoàn phí.
                          Không tạo đơn hàng, không ghi công nợ. Nếu vẫn muốn nhập, sửa ô{" "}
                          <b>Ghi chú</b> ở trên rồi bấm <b>Xem thử lại</b>.
                        </div>
                      ) : (
                      /* Khối TIỀN — giá niêm yết lấy theo khoá đang chọn ở ô "Khoá" trên. */
                      <div className="mt-3 rounded-md border border-neutral-200 bg-white p-2">
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                          <label className="inline-flex items-center gap-1.5 font-medium text-neutral-800">
                            <input
                              type="checkbox"
                              checked={
                                edited.payIn2 !== undefined ? edited.payIn2 === "1" : w.tra2Dot
                              }
                              onChange={(e) =>
                                setCell(w.sheet, w.dong, "payIn2", e.target.checked ? "1" : "0")
                              }
                              className="h-4 w-4 rounded border-neutral-300"
                            />
                            Đóng 2 đợt
                          </label>
                          {(edited.payIn2 !== undefined
                            ? edited.payIn2 === "1"
                            : w.tra2Dot) && (
                            <label className="inline-flex items-center gap-1.5 text-neutral-700">
                              {COL_LABEL.dueDate2}
                              <input
                                type="date"
                                value={edited.dueDate2 ?? (w.hanDot2 ?? "")}
                                onChange={(e) =>
                                  setCell(w.sheet, w.dong, "dueDate2", e.target.value)
                                }
                                className={`rounded border px-2 py-0.5 text-xs ${
                                  (edited.dueDate2 ?? w.hanDot2)
                                    ? "border-neutral-300"
                                    : "border-red-400 bg-red-50"
                                }`}
                              />
                            </label>
                          )}
                          <span className="text-neutral-600">
                            Giá niêm yết: <b>{w.giaNiemYet.toLocaleString("vi-VN")}đ</b>
                            {w.giaNiemYet === 0 && (
                              <span className="ml-1 text-red-600">(chưa khớp khoá)</span>
                            )}
                          </span>
                          <span className="text-neutral-600">
                            Tổng phải nộp: <b>{w.tongPhaiNop.toLocaleString("vi-VN")}đ</b>
                            {w.giamTinhRa > 0 && ` (giảm ${w.giamTinhRa.toLocaleString("vi-VN")}đ)`}
                          </span>
                          <span className="text-neutral-600">
                            Đã nộp: <b>{(w.daDong ?? 0).toLocaleString("vi-VN")}đ</b>
                          </span>
                          <span className={w.conLai > 0 ? "font-semibold text-amber-700" : "text-emerald-700"}>
                            Còn lại: <b>{w.conLai.toLocaleString("vi-VN")}đ</b>
                          </span>
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                          <label className="text-xs text-neutral-600">
                            {COL_LABEL.discountKind}
                            <select
                              value={edited.discountKind ?? w.giamKieu ?? ""}
                              onChange={(e) =>
                                setCell(w.sheet, w.dong, "discountKind", e.target.value)
                              }
                              className="mt-0.5 w-full rounded border border-neutral-300 px-2 py-1 text-sm"
                            >
                              <option value="">— không giảm —</option>
                              <option value="AMOUNT">Theo số tiền</option>
                              <option value="PERCENT">Theo %</option>
                            </select>
                          </label>
                          <label className="text-xs text-neutral-600">
                            {COL_LABEL.discountValue}
                            <input
                              value={edited.discountValue ?? (w.giamGiaTri?.toString() ?? "")}
                              onChange={(e) =>
                                setCell(w.sheet, w.dong, "discountValue", e.target.value)
                              }
                              placeholder="vd 500000 hoặc 10"
                              className="mt-0.5 w-full rounded border border-neutral-300 px-2 py-1 text-sm"
                            />
                          </label>
                          <label className="col-span-2 text-xs text-neutral-600">
                            {COL_LABEL.discountReason}
                            <input
                              value={edited.discountReason ?? (w.giamLyDo ?? "")}
                              onChange={(e) =>
                                setCell(w.sheet, w.dong, "discountReason", e.target.value)
                              }
                              placeholder="bắt buộc khi có giảm giá"
                              className="mt-0.5 w-full rounded border border-neutral-300 px-2 py-1 text-sm"
                            />
                          </label>
                        </div>
                      </div>
                      )}
                    </div>
                  );
                })}
                {preview.canKiemTra!.length > 200 && (
                  <p className="text-xs text-neutral-500">
                    Hiển thị 200/{preview.canKiemTra!.length} dòng.
                  </p>
                )}
              </div>
            </div>
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

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  // "amber" = cần soi nhưng KHÔNG chặn import (khác "red" = dòng bị loại).
  tone?: "red" | "amber";
}) {
  return (
    <div className="rounded-lg border border-neutral-200 p-3">
      <p className="text-xs text-neutral-500">{label}</p>
      <p
        className={`text-xl font-bold ${
          tone === "red" ? "text-red-600" : tone === "amber" ? "text-amber-600" : ""
        }`}
      >
        {value}
      </p>
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
