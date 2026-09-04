"use client";

/**
 * Khung ĐĂNG / GÓP ẢNH của site Sale — bản đôi GIAO DIỆN của nửa trái
 * `app/(admin)/admin/media/_components/media-client.tsx` (chốt tách bản 04/09/2026).
 *
 * ── Giữ nguyên 100% ─────────────────────────────────────────────────────────
 * Đúng hai chế độ ("Đưa vào kho (nhiều ảnh)" / "Đăng ngay 1 ảnh"), đúng trần 40
 * ảnh một lô, đúng worker pool 3, đúng hai chốt chống-đua (`ctxReqRef` cho bối
 * cảnh lớp về trễ, `classIdRef` cho lô ảnh của lớp cũ), đúng từng chữ của mọi
 * nhãn, mọi dải cảnh báo và mọi thông báo. Chỉ đổi CÁCH BÀY.
 *
 * ── Chỉ CÁCH BÀY đổi ────────────────────────────────────────────────────────
 *   1. Không còn thẻ `rounded-xl border bg-card` bọc ngoài: khối này nay là một
 *      CỘT trong `KhungDuLieu` của trang (khung lồng khung bị cấm — xem
 *      `components/sale/ui/khung-du-lieu.tsx`).
 *   2. Tiêu đề khối `text-sm font-bold uppercase tracking-wider` → thước tiêu đề
 *      chung của site (`text-sm font-semibold`); `ky-luat-mau.test.ts` giữ luật
 *      "một thước tiêu đề cho cả site".
 *   3. `<select>` gốc của trình duyệt → `<Select>` của kho, cho khớp phần còn
 *      lại của site Sale.
 *
 * ⚠️ MỌI ĐƯỜNG GHI GỌI ĐÚNG SERVER ACTION CỦA KHU QUẢN TRỊ (`uploadClassMedia`,
 *    `uploadClassMediaBatch`, `getClassUploadContext`). Chép logic sang đây là
 *    nhân đôi một đường GHI vào kho tệp — chủ dự án chốt tách BẢN GIAO DIỆN
 *    (04/09), server action không có pixel nào để đụng.
 *
 * ⚠️ `router.refresh()` sau mỗi lần đăng là BẮT BUỘC: hai action kia gọi
 *    `revalidatePath("/media")` — đường của KHU QUẢN TRỊ. Không làm mới ở đây thì
 *    ảnh vừa đăng không xuất hiện trong thư viện cho tới khi người dùng tự tải lại.
 *
 * ⚠️ QUYỀN ĐĂNG HỎI THEO LỚP, KHÔNG HỎI TRƯỚC Ở TRANG: câu trả lời phụ thuộc lớp
 *    nào được chọn (`getClassUploadContext` trả `canUpload` + `canPublish` cho
 *    ĐÚNG lớp đó, đã qua `passesScope`). Vai chỉ-góp-ảnh mất luôn lựa chọn "Đăng
 *    ngay" và chỉ còn đường vào kho — server cũng chặn lại lần nữa.
 */
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  getClassUploadContext,
  uploadClassMedia,
  uploadClassMediaBatch,
} from "@/app/(admin)/admin/media/actions";
import { AnhCoDuPhong } from "./anh-co-du-phong";

// Trần 1 lô — khớp DRAFT_BATCH_MAX server (`lib/lms/media-publish.ts`); KHÔNG import
// từ file "use server" (chỉ async function đi qua được ranh giới đó).
const TRAN_LO = 40;

/** `<Select>` của kho không nhận giá trị rỗng làm một lựa chọn. */
const CHUA_CHON = "__chua_chon__";

type TepDaTai = { fileUrl: string; fileName: string };
type ChonLop = { id: string; label: string };
type ChonBuoi = { id: string; label: string; date: string };

const LOP_O = cn(
  "h-9 w-full rounded-lg border border-border bg-card px-3 text-sm",
  "focus-visible:border-[color:var(--primary)] focus-visible:outline-none",
  "focus-visible:ring-2 focus-visible:ring-[color:var(--primary)]/25",
);

/** Ký URL qua `/api/admin/upload-url` → PUT thẳng R2. Ném lỗi khi 1 bước hỏng. */
async function kyRoiTai(f: File): Promise<TepDaTai> {
  const ky = await fetch("/api/admin/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      category: "image",
      filename: f.name,
      mimeType: f.type,
      sizeBytes: f.size,
    }),
  });
  if (!ky.ok) throw new Error("Không ký được URL");
  const { uploadUrl, publicUrl } = (await ky.json()) as {
    uploadUrl: string;
    publicUrl: string;
  };
  const dat = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": f.type },
    body: f,
  });
  if (!dat.ok) throw new Error("Tải ảnh thất bại");
  return { fileUrl: publicUrl, fileName: f.name };
}

export function KhungDangAnh({ lop }: { lop: ChonLop[] }) {
  const router = useRouter();
  const [dang, start] = useTransition();

  const [classId, setClassId] = useState("");
  const [hocVien, setHocVien] = useState<{ id: string; name: string }[]>([]);
  const [chuaDongY, setChuaDongY] = useState<{ id: string; name: string }[]>([]);
  const [buoi, setBuoi] = useState<ChonBuoi[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [ngayChup, setNgayChup] = useState("");
  const [ganThe, setGanThe] = useState<string[]>([]);
  const [caLop, setCaLop] = useState(false);
  const [chuThich, setChuThich] = useState("");
  const [fileUrl, setFileUrl] = useState("");
  const [fileName, setFileName] = useState("");
  const [dangTai, setDangTai] = useState(false);
  const [biChan, setBiChan] = useState(false);

  // KHO ẢNH (11/08) — 2 chế độ như dialog site GV: "Đưa vào kho" (nhiều ảnh, DRAFT,
  // PH không thấy — GV chọn gửi sau) và "Đăng ngay 1 ảnh" (flow cũ, tới thẳng PH).
  // Mặc định GIỮ NGUYÊN hành vi cũ ("đăng ngay") cho người được gửi PH; `chonLop`
  // đặt lại theo `canPublish` của lớp vừa chọn (KHÔNG để kẹt ở "kho" sau khi chạm
  // một lớp mình không được gửi PH).
  const [cheDo, setCheDo] = useState<"batch" | "single">("single");
  // false tới khi server trả lời cho LỚP cụ thể — tránh hứa sai quyền lúc chưa chọn lớp.
  const [guiPHDuoc, setGuiPHDuoc] = useState(false);

  // Chống đua: (a) bối cảnh của lớp cũ về SAU lớp đang chọn rồi đè lên; (b) lô ảnh
  // đang tải dở của lớp cũ rơi vào lớp mới khi người dùng đổi lớp giữa chừng.
  const luotBoiCanh = useRef(0);
  const lopHienTai = useRef("");

  const [loAnh, setLoAnh] = useState<TepDaTai[]>([]);
  const [tienDo, setTienDo] = useState<{ xong: number; tong: number } | null>(null);

  const idChuaDongY = new Set(chuaDongY.map((s) => s.id));

  async function chonLop(id: string) {
    setClassId(id);
    lopHienTai.current = id;
    setGanThe([]);
    setCaLop(false);
    setSessionId("");
    setNgayChup("");
    setLoAnh([]);
    setFileUrl("");
    setFileName("");
    setGuiPHDuoc(false);
    const luot = ++luotBoiCanh.current;
    if (!id) {
      setHocVien([]);
      setChuaDongY([]);
      setBuoi([]);
      setBiChan(false);
      return;
    }
    let ctx;
    try {
      ctx = await getClassUploadContext(id);
    } catch {
      if (luot !== luotBoiCanh.current) return;
      setBiChan(true);
      setHocVien([]);
      setChuaDongY([]);
      setBuoi([]);
      toast.error("Không tải được thông tin lớp — thử lại");
      return;
    }
    // Lượt cũ về sau lượt mới → bỏ, nếu không `hocVien`/`guiPHDuoc` sẽ là của lớp khác.
    if (luot !== luotBoiCanh.current) return;
    setBiChan(!ctx.canUpload);
    setHocVien(ctx.students);
    setChuaDongY(ctx.nonConsent);
    setBuoi(ctx.sessions);
    setGuiPHDuoc(ctx.canPublish);
    // Không được gửi PH → chỉ còn đường đưa vào kho (server cũng chặn lại).
    setCheDo(ctx.canPublish ? "single" : "batch");
    if (!ctx.canUpload) toast.error("Bạn không đăng được ảnh cho lớp này");
  }

  function chonBuoi(id: string) {
    setSessionId(id);
    // Mặc định ngày chụp = ngày buổi đã chọn (có thể chỉnh tay).
    const b = buoi.find((s) => s.id === id);
    if (b && !ngayChup) setNgayChup(b.date.slice(0, 10));
  }

  async function chonMotAnh(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (e.target) e.target.value = "";
    if (!f) return;
    if (!f.type.startsWith("image/")) return toast.error("Chỉ chọn ảnh");
    // input nằm trong <label> nên vẫn bấm được dù nút gửi đã khoá (mirror bản GV).
    if (dangTai) return toast.error("Đang tải ảnh — chờ xong rồi chọn lại");
    setDangTai(true);
    try {
      const up = await kyRoiTai(f);
      setFileUrl(up.fileUrl);
      setFileName(up.fileName);
      toast.success("Đã tải ảnh");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lỗi tải ảnh");
    } finally {
      setDangTai(false);
    }
  }

  /**
   * Chọn NHIỀU ảnh cho lô kho: worker pool 3 (không bắn 40 PUT cùng lúc), file
   * hỏng báo tên rồi TIẾP TỤC — mirror dialog site GV (`upload-photo-dialog.tsx`).
   */
  async function chonNhieuAnh(e: React.ChangeEvent<HTMLInputElement>) {
    const ds = e.target.files ? [...e.target.files] : [];
    if (e.target) e.target.value = "";
    if (ds.length === 0) return;
    if (dangTai) return toast.error("Đang tải lô ảnh — chờ xong rồi chọn thêm");

    const anh = ds.filter((f) => f.type.startsWith("image/"));
    if (anh.length < ds.length) toast.error("Bỏ qua file không phải ảnh");
    if (anh.length === 0) return;

    const conCho = TRAN_LO - loAnh.length;
    if (conCho <= 0) {
      return toast.error(`Tối đa ${TRAN_LO} ảnh mỗi lô — đưa lô này vào kho trước`);
    }
    const hangCho = anh.slice(0, conCho);
    if (hangCho.length < anh.length) {
      toast.error(`Chỉ nhận thêm ${conCho} ảnh (tối đa ${TRAN_LO}/lô)`);
    }

    // Chốt lớp cho lô này: người dùng đổi lớp giữa chừng thì ảnh của lớp CŨ không
    // được rơi vào lô của lớp MỚI (`guiLo` gửi theo `classId` hiện tại).
    const choLop = classId;
    setDangTai(true);
    setTienDo({ xong: 0, tong: hangCho.length });
    const xong: TepDaTai[] = [];
    const hong: string[] = [];
    let ke = 0;
    const thoNe = async () => {
      while (ke < hangCho.length) {
        const f = hangCho[ke++]!;
        try {
          xong.push(await kyRoiTai(f));
        } catch {
          hong.push(f.name);
        } finally {
          setTienDo((p) => (p ? { ...p, xong: p.xong + 1 } : p));
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(3, hangCho.length) }, () => thoNe()));
    setTienDo(null);
    setDangTai(false);
    if (lopHienTai.current !== choLop) {
      toast.error("Đã đổi lớp giữa chừng — bỏ lô ảnh vừa tải");
      return;
    }
    if (xong.length > 0) {
      setLoAnh((truoc) => [...truoc, ...xong]);
      toast.success(`Đã tải ${xong.length} ảnh`);
    }
    if (hong.length > 0) {
      toast.error(`Không tải được ${hong.length} ảnh: ${hong.join(", ")}`);
    }
  }

  /** Đưa cả lô vào KHO (DRAFT): không gắn thẻ, PH không thấy — GV chọn gửi sau. */
  function guiLo() {
    if (!classId) return toast.error("Chọn lớp");
    if (loAnh.length === 0) return toast.error("Tải ảnh trước");
    start(async () => {
      const res = await uploadClassMediaBatch({
        classId,
        files: loAnh,
        classSessionId: sessionId || null,
        takenAt: ngayChup ? new Date(ngayChup).toISOString() : null,
      });
      if (!res.ok) {
        toast.error(res.error ?? "Lỗi đưa ảnh vào kho");
        return;
      }
      toast.success(
        `Đã đưa ${res.count ?? loAnh.length} ảnh vào kho — giáo viên sẽ chọn ảnh gửi phụ huynh`,
      );
      setLoAnh([]);
      setSessionId("");
      setNgayChup("");
      router.refresh();
    });
  }

  function guiMotAnh() {
    if (!classId) return toast.error("Chọn lớp");
    if (!fileUrl) return toast.error("Tải ảnh trước");
    if (!caLop && ganThe.length === 0) {
      return toast.error('Gắn thẻ học sinh hoặc chọn "Ảnh chung cả lớp"');
    }
    start(async () => {
      const res = await uploadClassMedia({
        classId,
        fileUrl,
        fileName,
        caption: chuThich,
        // Ảnh chung cả lớp = đánh dấu isClassWide (không gắn thẻ HS cụ thể).
        isClassWide: caLop,
        studentIds: caLop ? [] : ganThe,
        classSessionId: sessionId || null,
        takenAt: ngayChup ? new Date(ngayChup).toISOString() : null,
      });
      if (res.ok) {
        toast.success("Đã đăng ảnh");
        setFileUrl("");
        setFileName("");
        setChuThich("");
        setGanThe([]);
        setCaLop(false);
        setSessionId("");
        setNgayChup("");
        router.refresh();
      } else toast.error(res.error ?? "Lỗi");
    });
  }

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-foreground">
        {!classId ? "Đăng ảnh lớp" : guiPHDuoc ? "Đăng ảnh lớp" : "Góp ảnh vào kho của lớp"}
      </h2>

      {/* Khoá lúc đang tải lô: đổi lớp giữa chừng là nguồn của lỗi "ảnh lớp cũ rơi
          vào lớp mới" (`chonNhieuAnh` còn một chốt nữa bằng `lopHienTai`). */}
      <Select
        value={classId || CHUA_CHON}
        onValueChange={(v) => chonLop(v === null || v === CHUA_CHON ? "" : String(v))}
      >
        <SelectTrigger aria-label="Chọn lớp" disabled={dangTai} className={LOP_O}>
          <SelectValue>
            {(v: string | null) =>
              (v && v !== CHUA_CHON ? lop.find((c) => c.id === v)?.label : null) ??
              "— Chọn lớp —"
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={CHUA_CHON}>— Chọn lớp —</SelectItem>
          {lop.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {biChan && (
        <p className="rounded-lg border border-state-danger-soft bg-state-danger-soft p-2.5 text-xs text-state-danger-ink">
          Bạn không đăng được ảnh cho lớp này.
        </p>
      )}

      {/* Chế độ: KHO (nhiều ảnh, PH chưa thấy) vs đăng thẳng 1 ảnh tới PH.
          Vai chỉ-góp-ảnh (Marketing/Giáo vụ) không có lựa chọn — chỉ kho. */}
      {classId &&
        !biChan &&
        (guiPHDuoc ? (
          <div role="group" aria-label="Chế độ đăng" className="grid grid-cols-2 gap-1 rounded-lg bg-card p-1">
            {(
              [
                ["batch", "Đưa vào kho (nhiều ảnh)"],
                ["single", "Đăng ngay 1 ảnh"],
              ] as const
            ).map(([m, nhan]) => (
              <button
                key={m}
                type="button"
                aria-pressed={cheDo === m}
                disabled={dang || dangTai}
                onClick={() => setCheDo(m)}
                className={cn(
                  "rounded-md px-2 py-1.5 text-xs font-semibold transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2",
                  "focus-visible:ring-[color:var(--primary)]/40",
                  cheDo === m
                    ? "bg-[color:var(--primary)] text-[color:var(--primary-foreground)]"
                    : "text-muted-foreground hover:text-foreground",
                  "disabled:opacity-60",
                )}
              >
                {nhan}
              </button>
            ))}
          </div>
        ) : (
          <p className="rounded-lg border border-state-info-soft bg-state-info-soft p-2.5 text-xs text-state-info-ink">
            Ảnh bạn tải lên vào <strong>kho của lớp</strong> — phụ huynh chưa nhìn thấy.
            Giáo viên phụ trách lớp sẽ chọn ảnh, gắn thẻ học viên rồi gửi.
          </p>
        ))}

      {/* Dải cảnh báo học viên chưa đồng ý dùng hình ảnh (consent). */}
      {classId && !biChan && chuaDongY.length > 0 && (
        <div className="flex gap-2 rounded-lg border border-state-warning-soft bg-state-warning-soft p-2.5 text-xs text-state-warning-ink">
          <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-semibold">Học viên CHƯA đồng ý dùng hình ảnh:</p>
            <p className="mt-0.5">{chuaDongY.map((s) => s.name).join(", ")}</p>
            <p className="mt-1">
              Vui lòng làm mờ thủ công hoặc loại các em này khỏi khung hình. Không thể gắn
              thẻ các em này.
            </p>
          </div>
        </div>
      )}

      {classId && !biChan && buoi.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          <Select
            value={sessionId || CHUA_CHON}
            onValueChange={(v) => chonBuoi(v === null || v === CHUA_CHON ? "" : String(v))}
          >
            <SelectTrigger aria-label="Buổi học" className={LOP_O}>
              <SelectValue>
                {(v: string | null) =>
                  (v && v !== CHUA_CHON ? buoi.find((s) => s.id === v)?.label : null) ??
                  "— Buổi học (tuỳ chọn) —"
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={CHUA_CHON}>— Buổi học (tuỳ chọn) —</SelectItem>
              {buoi.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <input
            type="date"
            value={ngayChup}
            onChange={(e) => setNgayChup(e.target.value)}
            aria-label="Ngày chụp"
            className={LOP_O}
          />
        </div>
      )}

      {cheDo === "batch" ? (
        <>
          {/* Lưới ảnh của LÔ + gỡ từng ảnh (gỡ khỏi lô, file trên R2 giữ nguyên) */}
          {loAnh.length > 0 && (
            <div className="grid grid-cols-4 gap-1.5">
              {loAnh.map((f, i) => (
                <div key={`${f.fileUrl}-${i}`} className="group relative">
                  <AnhCoDuPhong
                    src={f.fileUrl}
                    alt={f.fileName}
                    className="aspect-square w-full rounded-md object-cover"
                  />
                  <button
                    type="button"
                    aria-label={`Bỏ ảnh ${f.fileName} khỏi lô`}
                    disabled={dang}
                    onClick={() => setLoAnh((truoc) => truoc.filter((_, j) => j !== i))}
                    className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-card p-6 text-sm text-muted-foreground transition-colors hover:border-[color:var(--primary)]/40 hover:text-foreground">
            {dangTai ? (
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <Upload aria-hidden="true" className="size-4" />
            )}
            {tienDo
              ? `Đang tải ${tienDo.xong}/${tienDo.tong}…`
              : loAnh.length > 0
                ? `Thêm ảnh (${loAnh.length}/${TRAN_LO})`
                : "Chọn nhiều ảnh"}
            <input
              type="file"
              accept="image/*"
              multiple
              disabled={dangTai}
              onChange={chonNhieuAnh}
              className="hidden"
            />
          </label>
        </>
      ) : (
        <>
          {fileUrl ? (
            <AnhCoDuPhong
              src={fileUrl}
              alt="Ảnh vừa tải lên"
              className="h-40 w-full rounded-lg object-cover"
            />
          ) : (
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-card p-6 text-sm text-muted-foreground transition-colors hover:border-[color:var(--primary)]/40 hover:text-foreground">
              {dangTai ? (
                <Loader2 aria-hidden="true" className="size-4 animate-spin" />
              ) : (
                <Upload aria-hidden="true" className="size-4" />
              )}
              {dangTai ? "Đang tải…" : "Chọn ảnh"}
              <input
                type="file"
                accept="image/*"
                disabled={dangTai}
                onChange={chonMotAnh}
                className="hidden"
              />
            </label>
          )}

          <textarea
            value={chuThich}
            onChange={(e) => setChuThich(e.target.value)}
            rows={2}
            placeholder="Chú thích (tuỳ chọn)"
            aria-label="Chú thích"
            className={cn(LOP_O, "h-auto py-2")}
          />
        </>
      )}

      {cheDo === "single" && hocVien.length > 0 && (
        <div className="space-y-2">
          <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-foreground">
            <input
              type="checkbox"
              checked={caLop}
              onChange={(e) => {
                setCaLop(e.target.checked);
                if (e.target.checked) setGanThe([]);
              }}
              className="size-4 rounded border-border accent-[color:var(--primary)]"
            />
            Ảnh chung cả lớp (mọi phụ huynh trong lớp đều xem được)
          </label>

          {!caLop && (
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">
                Gắn thẻ học sinh (chỉ phụ huynh được gắn thẻ mới thấy ảnh)
              </p>
              <div className="flex flex-wrap gap-1.5">
                {hocVien.map((s) => {
                  const dangChon = ganThe.includes(s.id);
                  const khongDongY = idChuaDongY.has(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      disabled={khongDongY}
                      aria-pressed={dangChon}
                      title={khongDongY ? "Chưa đồng ý dùng hình ảnh" : undefined}
                      onClick={() =>
                        setGanThe((p) =>
                          dangChon ? p.filter((x) => x !== s.id) : [...p, s.id],
                        )
                      }
                      className={cn(
                        "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                        "focus-visible:outline-none focus-visible:ring-2",
                        "focus-visible:ring-[color:var(--primary)]/40",
                        khongDongY
                          ? "cursor-not-allowed bg-muted text-muted-foreground line-through"
                          : dangChon
                            ? "bg-[color:var(--primary)] text-[color:var(--primary-foreground)]"
                            : "bg-card text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {s.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={cheDo === "batch" ? guiLo : guiMotAnh}
        disabled={
          dang || dangTai || biChan || !classId || (cheDo === "batch" && loAnh.length === 0)
        }
        className={cn(
          "h-9 rounded-lg px-4 text-sm font-medium transition-colors",
          "bg-[color:var(--primary)] text-[color:var(--primary-foreground)]",
          "hover:bg-[color:var(--primary-dark)]",
          "focus-visible:outline-none focus-visible:ring-2",
          "focus-visible:ring-[color:var(--primary)]/40 focus-visible:ring-offset-2",
          "disabled:opacity-60",
        )}
      >
        {cheDo === "batch"
          ? `Đưa vào kho${loAnh.length > 0 ? ` (${loAnh.length})` : ""}`
          : "Đăng ảnh"}
      </button>
    </div>
  );
}
