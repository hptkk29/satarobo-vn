"use client";

import { useState } from "react";
import { toast } from "sonner";
import { luuBaiVideoAction } from "../_actions";

/**
 * EL-10 — TẢI VIDEO CHO MỘT BÀI HỌC.
 *
 * Nối trọn chuỗi: mở lượt tải nhiều phần → PUT từng phần THẲNG lên R2 → hoàn tất
 * → máy chủ đọc header mp4 để lấy codec và thời lượng THẬT → lưu vào bài.
 *
 * ⚠️ Thanh tiến độ đếm theo SỐ PHẦN đã xong, không phải theo byte. Với tệp 200MB
 * qua mạng chậm thì lượt tải kéo dài nhiều phút; không có tiến độ thì người soạn
 * không biết nó còn chạy hay đã treo, và họ sẽ bấm lại — tạo ra lượt tải thứ hai.
 *
 * ⚠️ Nút HUỶ là bắt buộc, không phải tiện nghi. Bỏ lượt tải giữa chừng mà không
 * gọi `huy` để lại các phần đã tải trên R2 và R2 tính tiền chúng; cron đêm dọn
 * được, nhưng chỉ sau 24 giờ.
 */

type TrangThai = "cho" | "dang-tai" | "dang-xac-minh" | "xong";

export function VideoUploader(props: {
  lessonId: string;
  title: string;
  videoKeyHienCo: string | null;
  durationSecHienCo: number | null;
}) {
  const [trangThai, setTrangThai] = useState<TrangThai>(
    props.videoKeyHienCo ? "xong" : "cho",
  );
  const [xong, setXong] = useState(0);
  const [tong, setTong] = useState(0);
  const [dangHuy, setDangHuy] = useState<{ khoa: string; uploadId: string } | null>(null);

  const goi = async (than: Record<string, unknown>) => {
    const r = await fetch("/api/elearning/media/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(than),
    });
    const j = (await r.json()) as
      | { ok: true; data: Record<string, unknown> }
      | { ok: false; error: { message: string } };
    if (!j.ok) throw new Error(j.error.message);
    return j.data;
  };

  const huy = async () => {
    if (!dangHuy) return;
    try {
      await goi({ buoc: "huy", ...dangHuy });
      toast.success("Đã huỷ lượt tải");
    } catch {
      // Huỷ thất bại không phải việc của người soạn: cron đêm sẽ dọn.
      toast.message("Đã dừng tải — phần đã tải sẽ được dọn tự động");
    }
    setDangHuy(null);
    setTrangThai("cho");
    setXong(0);
    setTong(0);
  };

  const tai = async (f: File) => {
    // Đọc thời lượng ở client để chặn SỚM. Đây KHÔNG phải con số cuối cùng — máy
    // chủ đọc lại từ tệp sau khi tải xong.
    const thoiLuongTam = await docThoiLuong(f).catch(() => null);

    setTrangThai("dang-tai");
    setXong(0);
    try {
      const mo = (await goi({
        buoc: "tao",
        lessonId: props.lessonId,
        filename: f.name,
        mime: f.type || "video/mp4",
        sizeBytes: f.size,
        durationSec: thoiLuongTam,
      })) as { khoa: string; uploadId: string; soPhan: number; partSize: number };

      setTong(mo.soPhan);
      setDangHuy({ khoa: mo.khoa, uploadId: mo.uploadId });

      const ky = (await goi({
        buoc: "ky-phan",
        khoa: mo.khoa,
        uploadId: mo.uploadId,
        soPhan: mo.soPhan,
      })) as { links: { partNumber: number; url: string }[] };

      // Tải TUẦN TỰ, không song song: mạng của người soạn thường là mạng văn
      // phòng dùng chung, và mở 25 kết nối cùng lúc làm chậm cả phòng.
      const parts: { partNumber: number; etag: string }[] = [];
      for (const l of ky.links) {
        const tu = (l.partNumber - 1) * mo.partSize;
        const khuc = f.slice(tu, Math.min(tu + mo.partSize, f.size));
        const res = await fetch(l.url, { method: "PUT", body: khuc });
        if (!res.ok) throw new Error(`Tải phần ${l.partNumber} thất bại`);
        const etag = res.headers.get("etag");
        if (!etag) throw new Error(`Phần ${l.partNumber} không nhận được mã xác nhận`);
        parts.push({ partNumber: l.partNumber, etag });
        setXong(l.partNumber);
      }

      await goi({
        buoc: "hoan-tat",
        khoa: mo.khoa,
        uploadId: mo.uploadId,
        parts,
      });
      setDangHuy(null);

      // Xác minh THẬT: đọc header mp4 trên máy chủ. Đây là bước quyết định codec
      // và thời lượng ghi vào bài.
      setTrangThai("dang-xac-minh");
      const xm = (await fetch(
        `/api/elearning/media/xac-minh?khoa=${encodeURIComponent(mo.khoa)}&lessonId=${props.lessonId}`,
      ).then((r) => r.json())) as
        | { ok: true; data: { durationSec: number; videoCodec: string; brand: string; audioCodec: string | null } }
        | { ok: false; error: { message: string } };
      if (!xm.ok) throw new Error(xm.error.message);

      const luu = await luuBaiVideoAction({
        lessonId: props.lessonId,
        title: props.title,
        videoKey: mo.khoa,
        durationSec: Math.round(xm.data.durationSec),
        codec: {
          videoCodec: xm.data.videoCodec as "avc1" | "hev1" | "khac",
          audioCodec: xm.data.audioCodec as "mp4a" | "khac" | null,
          brand: xm.data.brand,
        },
      });
      if (!luu.ok) throw new Error(luu.error.message);

      setTrangThai("xong");
      toast.success("Đã tải và gắn video vào bài");
    } catch (e) {
      setTrangThai("cho");
      toast.error(e instanceof Error ? e.message : "Tải video thất bại");
      // Còn lượt tải dở thì huỷ ngay, đừng để nó nằm lại tính tiền.
      if (dangHuy) await huy();
    }
  };

  return (
    <section className="space-y-2 rounded-xl border border-border p-4">
      <h2 className="text-sm font-semibold">Tệp video</h2>

      {props.videoKeyHienCo && trangThai !== "dang-tai" && (
        <p className="text-sm text-muted-foreground">
          Bài đang có video
          {props.durationSecHienCo
            ? ` · ${Math.round(props.durationSecHienCo / 60)} phút`
            : ""}
          . Tải tệp mới sẽ thay tệp cũ.
        </p>
      )}

      {trangThai === "cho" && (
        <input
          type="file"
          accept="video/mp4"
          aria-label="Chọn tệp video MP4"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void tai(f);
          }}
          className="w-full rounded-lg border border-border px-3 py-2 text-sm"
        />
      )}

      {trangThai === "dang-tai" && (
        <div className="space-y-1">
          <p className="text-sm">
            Đang tải phần {xong}/{tong}
          </p>
          <div
            role="progressbar"
            aria-valuenow={xong}
            aria-valuemin={0}
            aria-valuemax={tong}
            className="h-2 w-full overflow-hidden rounded-full bg-muted"
          >
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${tong ? (xong / tong) * 100 : 0}%` }}
            />
          </div>
          <button type="button" onClick={huy} className="text-xs underline">
            Huỷ lượt tải
          </button>
        </div>
      )}

      {trangThai === "dang-xac-minh" && (
        <p className="text-sm">
          Đang kiểm tệp (đọc mã hoá và thời lượng thật)…
        </p>
      )}

      <p className="text-xs text-muted-foreground">
        MP4 mã hoá H.264, tối đa 200MB và 15 phút. Phụ đề tiếng Việt là điều kiện
        xuất bản của khoá bắt buộc.
      </p>
    </section>
  );
}

/** Đọc thời lượng bằng thẻ `<video>` — chỉ để chặn sớm, không phải bằng chứng. */
function docThoiLuong(f: File): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(f);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(v.duration) ? Math.round(v.duration) : null);
    };
    v.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("không đọc được"));
    };
    v.src = url;
  });
}
