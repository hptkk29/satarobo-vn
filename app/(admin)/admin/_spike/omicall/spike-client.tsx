"use client";

import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// 🧪 TRANG THỬ (SPIKE) — XOÁ cùng với `page.tsx` sau khi có kết luận CH-4.
//
// Vì sao nạp SDK bằng `document.createElement("script")` chứ không `next/script`
// hay `<script>` trong JSX: tiêu chí KHÔNG ĐẠT của spec ghi rõ *"phải nhúng
// `<script>` chặn render"* là trượt. Nạp động + `async` cho phép đo đúng thứ cần
// đo — SDK có khởi tạo được trong môi trường React 19 hay không — mà không đánh đổi
// hiệu năng trang, và cho phép bấm nạp lại nhiều lần trong một phiên.
//
// Trang này KHÔNG gọi Server Action nào và KHÔNG chạm bảng nào.

type SuKien = { luc: string; nhan: string; chiTiet: string };

export function SpikeOmicallClient({ sdkUrl }: { sdkUrl: string }) {
  const [suKien, setSuKien] = useState<SuKien[]>([]);
  const [dangNap, setDangNap] = useState(false);
  const [soGoi, setSoGoi] = useState("");
  const daNap = useRef(false);

  const ghi = useCallback((nhan: string, chiTiet: unknown) => {
    setSuKien((cu) => [
      {
        luc: new Date().toISOString(),
        nhan,
        chiTiet: typeof chiTiet === "string" ? chiTiet : safeJson(chiTiet),
      },
      ...cu,
    ]);
  }, []);

  const napSdk = useCallback(() => {
    if (!sdkUrl) {
      ghi("LỖI", "Chưa đặt NEXT_PUBLIC_OMICALL_SDK_URL — chờ văn bản nhà cung cấp (TQ-1).");
      return;
    }
    if (daNap.current) {
      ghi("BỎ QUA", "SDK đã nạp trong phiên này.");
      return;
    }
    setDangNap(true);
    ghi("NẠP", sdkUrl);

    const el = document.createElement("script");
    el.src = sdkUrl;
    el.async = true;
    el.crossOrigin = "anonymous";
    el.onload = () => {
      daNap.current = true;
      setDangNap(false);
      // ⑥ — đếm host ngoài phải mở CSP. Ghi ra để người chạy spike chép vào kết luận.
      ghi("NẠP XONG", `host: ${hostCua(sdkUrl)}`);
      ghi("KIỂM", `đối tượng toàn cục: ${Object.keys(window).filter(laCuaOmi).join(", ") || "(không thấy)"}`);
    };
    el.onerror = () => {
      setDangNap(false);
      // Lỗi nạp thường là CSP hoặc CORS. Cả hai đều là dữ liệu của spike, không
      // phải sự cố cần vá vội — ghi lại rồi đưa vào kết luận.
      ghi("LỖI NẠP", "script không tải được (kiểm CSP + CORS + địa chỉ).");
    };
    document.head.appendChild(el);
  }, [sdkUrl, ghi]);

  return (
    <section className="space-y-4 rounded border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={napSdk} disabled={dangNap}>
          {dangNap ? "Đang nạp…" : "Nạp SDK"}
        </Button>
        <Input
          value={soGoi}
          onChange={(e) => setSoGoi(e.target.value)}
          placeholder="Số nội bộ để gọi thử"
          className="max-w-48"
        />
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            ghi(
              "GỌI THỬ",
              `Chưa nối API gọi: chờ endpoint production (TQ-1). Số nhập: ${soGoi || "(trống)"}`,
            )
          }
        >
          Gọi thử
        </Button>
        <Button type="button" variant="ghost" onClick={() => setSuKien([])}>
          Xoá bảng
        </Button>
      </div>

      <div className="max-h-96 overflow-auto rounded bg-muted/40 p-3 font-mono text-xs">
        {suKien.length === 0 ? (
          <p className="text-muted-foreground">Chưa có sự kiện nào.</p>
        ) : (
          <ul className="space-y-1">
            {suKien.map((s, i) => (
              <li key={`${s.luc}-${i}`}>
                <span className="text-muted-foreground">{s.luc}</span>{" "}
                <span className="font-semibold">{s.nhan}</span> — {s.chiTiet}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function hostCua(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "(không đọc được)";
  }
}

function laCuaOmi(k: string): boolean {
  return /omi/i.test(k);
}
