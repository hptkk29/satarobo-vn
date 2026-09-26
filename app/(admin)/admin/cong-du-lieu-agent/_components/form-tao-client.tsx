"use client";

// Form "Tạo ứng dụng kết nối" — khuôn `taoClientSchema`. Tạo xong ở trạng thái CHỜ DUYỆT,
// CHƯA có mật khẩu (spec §4.5: người KHÁC duyệt xong mới sinh).
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { taoClientAction } from "../_actions";
import { congNgay, LOP_O_NHAP, ngayXaNhat } from "./dinh-dang";

export function FormTaoClient({
  vaiDichVu,
  homNay,
  hanToiDaNgay,
  chanMa,
}: {
  vaiDichVu: { code: string; name: string }[];
  /** YYYY-MM-DD theo giờ Việt Nam — server tính, tránh lệch khi hydrate. */
  homNay: string;
  hanToiDaNgay: number;
  chanMa: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const macDinhHan = congNgay(homNay, Math.min(90, hanToiDaNgay) - 1);
  const [ten, setTen] = useState("");
  const [ips, setIps] = useState("");
  const [vai, setVai] = useState(vaiDichVu[0]?.code ?? "");
  const [hetHan, setHetHan] = useState(macDinhHan);
  const [lyDo, setLyDo] = useState("");
  const [ma, setMa] = useState("");

  const dsIp = ips
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const duDieuKien =
    ten.trim().length >= 3 &&
    dsIp.length > 0 &&
    vai !== "" &&
    hetHan !== "" &&
    lyDo.trim().length >= 10 &&
    /^\d{6}$/.test(ma) &&
    !chanMa;

  function gui() {
    if (!duDieuKien) return;
    startTransition(async () => {
      const kq = await taoClientAction({
        ten: ten.trim(),
        ipDuocPhep: dsIp,
        vaiDichVu: vai,
        hetHan,
        lyDo: lyDo.trim(),
        maXacThuc: ma,
      });
      if (kq.ok) {
        toast.success("Đã tạo — đang chờ người khác duyệt");
        setTen("");
        setIps("");
        setVai(vaiDichVu[0]?.code ?? "");
        setHetHan(macDinhHan);
        setLyDo("");
        setMa("");
        router.refresh();
      } else {
        toast.error(kq.error);
        setMa("");
      }
    });
  }

  if (vaiDichVu.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Chưa có vai dịch vụ nào (mã bắt đầu bằng <code className="font-mono">AGENT_</code>) đang bật — cần
        seed vai trước khi tạo ứng dụng.
      </p>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        gui();
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-foreground">
            Tên ứng dụng <span className="text-state-danger-ink">*</span>
          </span>
          <Input
            value={ten}
            onChange={(e) => setTen(e.target.value)}
            maxLength={80}
            placeholder="Agent báo cáo kinh doanh"
            disabled={pending}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-foreground">
            Vai dịch vụ <span className="text-state-danger-ink">*</span>
          </span>
          <select
            value={vai}
            onChange={(e) => setVai(e.target.value)}
            disabled={pending}
            className={LOP_O_NHAP}
          >
            {vaiDichVu.map((v) => (
              <option key={v.code} value={v.code}>
                {v.name} ({v.code})
              </option>
            ))}
          </select>
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-sm font-semibold text-foreground">
            IP được phép gọi <span className="text-state-danger-ink">*</span>
          </span>
          <Textarea
            value={ips}
            onChange={(e) => setIps(e.target.value)}
            rows={3}
            disabled={pending}
            placeholder={"203.0.113.10\n198.51.100.25"}
            className="font-mono"
          />
          <span className="mt-1 block text-xs text-muted-foreground">
            Mỗi dòng một địa chỉ IP cụ thể (IPv4 hoặc IPv6) — KHÔNG nhận dải kiểu /24. Gọi từ IP
            khác sẽ bị từ chối. Đang có {dsIp.length} IP.
          </span>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-foreground">
            Hết hạn <span className="text-state-danger-ink">*</span>
          </span>
          <input
            type="date"
            value={hetHan}
            min={homNay}
            max={ngayXaNhat(homNay, hanToiDaNgay)}
            onChange={(e) => setHetHan(e.target.value)}
            disabled={pending}
            className={LOP_O_NHAP}
          />
          <span className="mt-1 block text-xs text-muted-foreground">
            Tối đa {hanToiDaNgay} ngày kể từ hôm nay.
          </span>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-foreground">
            Mã xác thực 2 lớp <span className="text-state-danger-ink">*</span>
          </span>
          <Input
            value={ma}
            onChange={(e) => setMa(e.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="6 chữ số"
            disabled={pending || !!chanMa}
            className="font-mono tracking-widest"
          />
          {chanMa && <span className="mt-1 block text-xs text-state-warning-ink">{chanMa}</span>}
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-sm font-semibold text-foreground">
            Lý do <span className="text-state-danger-ink">*</span>
          </span>
          <Textarea
            value={lyDo}
            onChange={(e) => setLyDo(e.target.value)}
            rows={2}
            maxLength={500}
            disabled={pending}
            placeholder="Agent này dùng để làm gì, ai phụ trách."
          />
          <span className="mt-1 block text-xs text-muted-foreground">
            Tối thiểu 10 ký tự · đang có {lyDo.trim().length}
          </span>
        </label>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          Tạo xong ở trạng thái <strong>Chờ duyệt</strong> — một người KHÁC phải duyệt. Duyệt xong mới sinh
          được mật khẩu.
        </p>
        <Button type="submit" disabled={pending || !duDieuKien} className="shrink-0">
          {pending && <Loader2 className="animate-spin" />}
          Tạo ứng dụng
        </Button>
      </div>
    </form>
  );
}
