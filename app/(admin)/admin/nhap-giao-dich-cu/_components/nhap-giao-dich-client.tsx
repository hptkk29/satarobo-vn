"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { AlertTriangle, CheckCheck, FileUp, Loader2, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PhanTrangBang } from "@/components/ui/phan-trang-bang";
import {
  docDongGiaoDich,
  gopTheoHocVien,
  sheetChuaTronSheet,
  type GiaoDichSheet,
  type HocVienGop,
} from "@/lib/finance/nhap-giao-dich-sheet";
import { MUC_KHOP, NHAN_MUC_KHOP } from "@/lib/finance/doi-chieu-hoc-vien";

import {
  ghiNhapGiaoDichAction,
  xemThuNhapGiaoDichAction,
  type DongDoiChieu,
} from "../_actions";

/**
 * ⚠️ FILE ĐƯỢC ĐỌC Ở ĐÂY, TRONG TRÌNH DUYỆT — không upload lên máy chủ.
 *
 * File "Danh sách đăng ký" có CCCD học viên, CCCD phụ huynh và địa chỉ nhà. Chỉ những
 * trường cần để khớp và ghi tiền mới rời máy: tên, SĐT, số tiền, ngày, ghi chú.
 * `docDongGiaoDich` vốn cũng không đọc ba cột kia.
 */

/** Sheet "Thuê Robot" cố ý KHÔNG có: cột khác hẳn (gói thuê, đặt cọc), và chủ dự án chốt chưa đụng. */
const SHEET_HOC_PHI = [
  "Tháng 52026",
  "Tháng 62026",
  "Tháng 72026 CS1",
  "Tháng 72026 CS2",
  "Tháng 82026 CS1",
  "Tháng 82026 CS2",
  "Tháng 92026 CS1",
  "Tháng 92026 CS2",
];

const vnd = (n: number) => `${n.toLocaleString("vi-VN")}đ`;

type DocFileKetQua = {
  gop: HocVienGop[];
  theoSheet: Array<{ ten: string; so: number; tien: number; boQua: boolean }>;
  sheetLong: Array<{ nho: string; lon: string; so: number; tien: number }>;
};

/** Header không cùng dòng giữa các sheet ("Tháng 52026" ở dòng 2) — dò, đừng đoán. */
function dongHeader(ws: XLSX.WorkSheet): number {
  const tho = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null });
  for (let i = 0; i < Math.min(4, tho.length); i++) {
    const hang = tho[i];
    if (
      Array.isArray(hang) &&
      hang.some((v) => String(v ?? "").toLowerCase().includes("họ và tên học viên"))
    ) {
      return i;
    }
  }
  return 0;
}

function docFile(buf: ArrayBuffer): DocFileKetQua {
  const wb = XLSX.read(buf, { cellDates: true });
  const theo = new Map<string, GiaoDichSheet[]>();

  for (const n of SHEET_HOC_PHI) {
    const ws = wb.Sheets[n];
    if (!ws) continue;
    const hr = dongHeader(ws);
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { range: hr, defval: null });
    const gd: GiaoDichSheet[] = [];
    rows.forEach((r, i) => {
      const g = docDongGiaoDich(r, n, hr + 2 + i);
      if (g) gd.push(g);
    });
    theo.set(n, gd);
  }

  // Sheet lồng nhau: "Tháng 62026" chứa TRỌN "Tháng 52026" — nhập cả hai là cộng đôi
  // 30.322.000đ tiền thật. Bỏ sheet NHỎ, và nói ra đã bỏ cái nào.
  const ten = [...theo.keys()];
  const boQua = new Set<string>();
  const sheetLong: DocFileKetQua["sheetLong"] = [];
  for (const a of ten) {
    for (const b of ten) {
      if (a === b || boQua.has(a) || boQua.has(b)) continue;
      const r = sheetChuaTronSheet(theo.get(a)!, theo.get(b)!);
      if (r.chuaTron && (theo.get(a)?.length ?? 0) > 0) {
        boQua.add(a);
        sheetLong.push({ nho: a, lon: b, so: r.soDongTrung, tien: r.tienCongDoi });
      }
    }
  }

  const dung = ten.filter((n) => !boQua.has(n));
  return {
    gop: gopTheoHocVien(dung.flatMap((n) => theo.get(n)!)),
    theoSheet: ten.map((n) => ({
      ten: n,
      so: theo.get(n)!.length,
      tien: theo.get(n)!.reduce((s, g) => s + g.hocPhi, 0),
      boQua: boQua.has(n),
    })),
    sheetLong,
  };
}

function O({ nhan, giaTri, tone = "neutral", chu }: {
  nhan: string;
  giaTri: string;
  tone?: "neutral" | "ok" | "warn" | "danger";
  chu?: string;
}) {
  const mau =
    tone === "ok"
      ? "text-state-success-ink"
      : tone === "warn"
        ? "text-state-warning-ink"
        : tone === "danger"
          ? "text-state-danger-ink"
          : "text-foreground";
  return (
    <div className="min-w-0 rounded-xl border border-border bg-background px-4 py-3">
      <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">{nhan}</p>
      <p className={`mt-1 truncate text-xl font-bold tabular-nums ${mau}`}>{giaTri}</p>
      {chu && <p className="mt-0.5 truncate text-xs text-muted-foreground">{chu}</p>}
    </div>
  );
}

export function NhapGiaoDichClient() {
  const [doc, setDoc] = useState<DocFileKetQua | null>(null);
  const [tenFile, setTenFile] = useState<string | null>(null);
  const [rows, setRows] = useState<DongDoiChieu[] | null>(null);
  const [tomTat, setTomTat] = useState<{
    tongEm: number; khop: number; canChon: number; khongThay: number;
    tienKhop: number; daNhapTruoc: number;
  } | null>(null);
  /** Người chọn tay cho dòng lệch tên: khoá `sdt|hoTen` → hocVienId. */
  const [chonTay, setChonTay] = useState<Record<string, string>>({});
  const [loi, setLoi] = useState<string | null>(null);
  const [dangChay, start] = useTransition();

  const khoaEm = (r: { sdt: string | null; hoTen: string | null }) => `${r.sdt ?? ""}|${r.hoTen ?? ""}`;

  const sanSangGhi = useMemo(() => {
    if (!rows || !doc) return [];
    return rows
      .map((r) => {
        const id = r.hocVienId ?? chonTay[khoaEm(r)] ?? null;
        if (!id) return null;
        const em = doc.gop.find((g) => khoaEm(g) === khoaEm(r));
        if (!em) return null;
        return { hocVienId: id, giaoDich: em.giaoDich };
      })
      .filter((x): x is { hocVienId: string; giaoDich: GiaoDichSheet[] } => x != null);
  }, [rows, doc, chonTay]);

  function chonFile(f: File) {
    setLoi(null);
    setRows(null);
    setTomTat(null);
    setChonTay({});
    setTenFile(f.name);
    f.arrayBuffer()
      .then((buf) => {
        const kq = docFile(buf);
        if (kq.gop.length === 0) {
          setLoi(
            "Không đọc được giao dịch nào. Kiểm lại: file phải có các sheet theo tháng, " +
              'và cột "Họ và Tên học viên", "Học phí", "Tình trạng", "Số điện thoại".',
          );
          setDoc(null);
          return;
        }
        setDoc(kq);
      })
      .catch(() => setLoi("Không mở được file. File có phải .xlsx không?"));
  }

  function xemThu() {
    if (!doc) return;
    setLoi(null);
    start(async () => {
      const r = await xemThuNhapGiaoDichAction({
        ds: doc.gop.map((g) => ({
          sdt: g.sdt,
          hoTen: g.hoTen,
          tongTien: g.tongTien,
          soDot: g.soDot,
          // Date không qua được ranh giới Server Action một cách đáng tin → ISO string.
          giaoDich: g.giaoDich.map((x) => ({ ...x, ngay: x.ngay ? x.ngay.toISOString() : null })),
        })),
      });
      if (!r.ok) {
        setLoi(r.error);
        return;
      }
      setRows(r.rows);
      setTomTat(r.tomTat);
    });
  }

  function ghi() {
    if (sanSangGhi.length === 0) return;
    setLoi(null);
    start(async () => {
      const r = await ghiNhapGiaoDichAction({
        ds: sanSangGhi.map((x) => ({
          hocVienId: x.hocVienId,
          giaoDich: x.giaoDich.map((g) => ({ ...g, ngay: g.ngay ? g.ngay.toISOString() : null })),
        })),
      });
      if (!r.ok) {
        setLoi(r.error);
        return;
      }
      toast.success(`Đã ghi cho ${r.thanhCong} em · ${vnd(r.tongTien)}`);
      if (r.boQuaDaCo > 0) toast.info(`${r.boQuaDaCo} dòng đã nhập từ lượt trước — bỏ qua`);
      if (r.chuaGanGhiDanh > 0) {
        toast.warning(`${r.chuaGanGhiDanh} em chưa gắn được ghi danh — công nợ chưa trừ`);
      }
      if (r.loi.length > 0) toast.error(`${r.loi.length} em lỗi: ${r.loi[0]}`);
      xemThu();
    });
  }

  return (
    <div className="space-y-6">
      {/* ── Bước 1: chọn file ─────────────────────────────────────────────── */}
      <section className="rounded-xl border border-border bg-muted/30 p-5">
        <h2 className="text-sm font-semibold text-foreground">1 · Chọn file Excel</h2>
        <p className="mt-1 max-w-prose text-xs leading-relaxed text-muted-foreground">
          File được đọc <b className="font-semibold text-foreground">ngay trong trình duyệt</b>;
          chỉ tên, số điện thoại, số tiền, ngày và ghi chú được gửi lên máy chủ. CCCD và
          địa chỉ trong file không rời máy bạn.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-semibold transition-colors duration-150 hover:bg-muted">
            <FileUp className="h-4 w-4" aria-hidden />
            Chọn file .xlsx
            <input
              type="file"
              accept=".xlsx,.xls"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) chonFile(f);
              }}
            />
          </label>
          {tenFile && <span className="truncate text-xs text-muted-foreground">{tenFile}</span>}
        </div>
      </section>

      {loi && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-state-danger bg-state-danger-soft px-4 py-3">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-state-danger-ink" aria-hidden />
          <p className="text-xs leading-relaxed text-state-danger-ink">{loi}</p>
        </div>
      )}

      {/* ── Bước 2: đọc được gì ───────────────────────────────────────────── */}
      {doc && (
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground">2 · Đọc được gì trong file</h2>

          <div className="mt-3 overflow-hidden rounded-xl border border-border">
            <PhanTrangBang tenDonVi="sheet" khoaGhiNho="nhap-gd-sheet" cuonNgang>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap text-xs font-semibold uppercase">Sheet</TableHead>
                    <TableHead className="whitespace-nowrap text-right text-xs font-semibold uppercase">Giao dịch</TableHead>
                    <TableHead className="whitespace-nowrap text-right text-xs font-semibold uppercase">Tiền</TableHead>
                    <TableHead className="whitespace-nowrap text-xs font-semibold uppercase">Dùng?</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {doc.theoSheet.map((s) => (
                    <TableRow key={s.ten}>
                      <TableCell className="whitespace-nowrap px-5 py-3.5 text-sm">{s.ten}</TableCell>
                      <TableCell className="whitespace-nowrap px-5 py-3.5 text-right text-sm tabular-nums">{s.so}</TableCell>
                      <TableCell className="whitespace-nowrap px-5 py-3.5 text-right text-sm tabular-nums">{vnd(s.tien)}</TableCell>
                      <TableCell className="whitespace-nowrap px-5 py-3.5 text-sm">
                        {s.boQua ? (
                          <span className="rounded-md bg-state-warning-soft px-2 py-0.5 text-xs font-semibold text-state-warning-ink">
                            Bỏ — trùng sheet khác
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">Dùng</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </PhanTrangBang>
          </div>

          {doc.sheetLong.map((x) => (
            <p
              key={x.nho}
              className="mt-3 rounded-xl border border-state-warning bg-state-warning-soft px-4 py-2.5 text-xs leading-relaxed text-state-warning-ink"
            >
              <b className="font-semibold">&quot;{x.nho}&quot;</b> nằm trọn trong{" "}
              <b className="font-semibold">&quot;{x.lon}&quot;</b> ({x.so} dòng). Đã bỏ sheet
              nhỏ — nhập cả hai sẽ cộng đôi <b className="font-semibold">{vnd(x.tien)}</b>.
            </p>
          ))}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button onClick={xemThu} disabled={dangChay} className="min-h-11 transition-colors duration-150">
              {dangChay ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <CheckCheck className="h-4 w-4" aria-hidden />}
              Đối chiếu với hệ thống
            </Button>
            <span className="text-xs text-muted-foreground">
              {doc.gop.length} học viên · {vnd(doc.gop.reduce((s, g) => s + g.tongTien, 0))}
            </span>
          </div>
        </section>
      )}

      {/* ── Bước 3: đối chiếu ─────────────────────────────────────────────── */}
      {rows && tomTat && (
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground">3 · Đối chiếu với hệ thống</h2>

          <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <O nhan="Khớp — ghi được" giaTri={`${tomTat.khop} em`} tone={tomTat.khop > 0 ? "ok" : "neutral"} chu={vnd(tomTat.tienKhop)} />
            <O nhan="Cần chọn" giaTri={`${tomTat.canChon} em`} tone={tomTat.canChon > 0 ? "warn" : "neutral"} />
            <O nhan="Không tìm thấy" giaTri={`${tomTat.khongThay} em`} tone={tomTat.khongThay > 0 ? "danger" : "neutral"} />
            <O nhan="Đã nhập lượt trước" giaTri={`${tomTat.daNhapTruoc} dòng`} chu={tomTat.daNhapTruoc > 0 ? "Sẽ bỏ qua, không cộng đôi" : undefined} />
          </div>

          <div className="mt-4 overflow-hidden rounded-xl border border-border">
            <PhanTrangBang tenDonVi="học viên" khoaGhiNho="nhap-gd-doi-chieu" cuonNgang>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap text-xs font-semibold uppercase">Trong file</TableHead>
                    <TableHead className="whitespace-nowrap text-right text-xs font-semibold uppercase">Tiền</TableHead>
                    <TableHead className="whitespace-nowrap text-xs font-semibold uppercase">Kết quả</TableHead>
                    <TableHead className="whitespace-nowrap text-xs font-semibold uppercase">Hồ sơ hệ thống</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => {
                    const k = khoaEm(r);
                    const daChon = chonTay[k];
                    return (
                      <TableRow key={k}>
                        <TableCell className="px-5 py-3.5 text-sm">
                          <div className="flex flex-col gap-0.5">
                            <span className="whitespace-nowrap font-medium text-foreground">{r.hoTen ?? "—"}</span>
                            <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                              {r.sdt ?? "thiếu SĐT"} · {r.soDot} đợt
                              {r.daNhapTruoc > 0 && ` · ${r.daNhapTruoc} dòng đã nhập`}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap px-5 py-3.5 text-right text-sm font-semibold tabular-nums">
                          {vnd(r.tongTien)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap px-5 py-3.5">
                          <span
                            className={`inline-flex whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-semibold ${
                              r.muc === MUC_KHOP.KHOP || daChon
                                ? "bg-state-success-soft text-state-success-ink"
                                : r.muc === MUC_KHOP.KHONG_THAY
                                  ? "bg-state-danger-soft text-state-danger-ink"
                                  : "bg-state-warning-soft text-state-warning-ink"
                            }`}
                          >
                            {daChon ? "Đã chọn tay" : NHAN_MUC_KHOP[r.muc]}
                          </span>
                        </TableCell>
                        <TableCell className="px-5 py-3.5 text-sm">
                          {r.muc === MUC_KHOP.KHOP ? (
                            <span className="whitespace-nowrap text-xs text-muted-foreground">
                              {r.ungVien.find((u) => u.id === r.hocVienId)?.name}
                            </span>
                          ) : r.ungVien.length > 0 ? (
                            // Người chọn — KHÔNG tự đoán, kể cả khi chỉ có một ứng viên.
                            <div className="flex flex-wrap gap-1.5">
                              {r.ungVien.map((u) => (
                                <button
                                  key={u.id}
                                  type="button"
                                  onClick={() =>
                                    setChonTay((c) =>
                                      c[k] === u.id ? { ...c, [k]: "" } : { ...c, [k]: u.id },
                                    )
                                  }
                                  aria-pressed={daChon === u.id}
                                  className={`min-h-9 whitespace-nowrap rounded-md border px-2.5 text-xs font-medium transition-colors duration-150 ${
                                    daChon === u.id
                                      ? "border-primary bg-primary text-white"
                                      : "border-border bg-background hover:bg-muted"
                                  }`}
                                >
                                  {u.name}
                                  {u.centerName ? ` · ${u.centerName}` : ""}
                                </button>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              Không có hồ sơ nào cùng số điện thoại
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </PhanTrangBang>
          </div>

          {tomTat.khongThay > 0 && (
            <p className="mt-3 flex items-start gap-2 rounded-xl border border-state-danger bg-state-danger-soft px-4 py-2.5 text-xs leading-relaxed text-state-danger-ink">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>
                {tomTat.khongThay} em không tìm thấy hồ sơ nào cùng số điện thoại. Hệ thống cố
                ý <b className="font-semibold">không dò theo mỗi họ tên</b> — hai em trùng tên
                ở hai cơ sở là chuyện thường, dò tên là mời gán nhầm. Sửa số điện thoại trong
                file rồi nhập lại, hoặc tạo hồ sơ cho em trước.
              </span>
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-4">
            <Button onClick={ghi} disabled={dangChay || sanSangGhi.length === 0} className="min-h-11 transition-colors duration-150">
              {dangChay && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              <span className="whitespace-nowrap">Ghi cho {sanSangGhi.length} em</span>
            </Button>
            <p className="max-w-prose text-xs leading-relaxed text-muted-foreground">
              Mỗi em một đơn &quot;nhập liệu ban đầu&quot; + một khoản cho mỗi đợt (giữ đúng
              ngày đóng). Khoản ở trạng thái{" "}
              <b className="font-semibold text-foreground">chờ kế toán</b> — muốn vào doanh
              thu thì xác nhận hàng loạt ở màn Thanh toán. Bấm lại lượt nữa{" "}
              <b className="font-semibold text-foreground">không cộng đôi</b>: mỗi dòng sheet
              chỉ ghi được một lần.
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
