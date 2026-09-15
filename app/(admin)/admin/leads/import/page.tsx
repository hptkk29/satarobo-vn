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
    // Khung nở theo BẬC, không nở tự do: màn 8K mà để nội dung kéo ngang 7000px thì mắt phải
    // quét cả mét để nối cột đầu với cột cuối.
    //
    // Trần cuối 2000px KHÔNG phải số đẹp bịa ra: đo 15/09, bảng 10 cột + hai cột ghim rộng
    // 1930px, nên từ bậc này trở lên người dùng thấy TRỌN bảng mà không phải kéo ngang lần
    // nào. Nở thêm nữa chỉ là khoảng trắng.
    //
    // ⚠️ Cả ba bậc đều dùng `min-[...]`, KHÔNG trộn với `2xl:`. Đo bản trước: `2xl:max-w-
    // [1440px]` và `min-[2200px]:max-w-[1760px]` cùng độ ưu tiên, và `2xl` đứng SAU trong
    // tệp CSS sinh ra ⇒ trên màn 3840 lẫn 7680 khung vẫn kẹt ở đúng 1440px. Lỗi này im lặng
    // tuyệt đối: không cảnh báo, không lệch layout, chỉ là màn 8K dùng như màn 2K.
    <div className="mx-auto w-full max-w-[1180px] space-y-6 px-4 py-6 sm:px-6 min-[1536px]:max-w-[1440px] min-[2200px]:max-w-[2000px]">
      <div className="space-y-2">
        <Link
          href="/leads"
          className="inline-flex min-h-9 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" /> Danh sách lead
        </Link>
        <h1 className="text-xl font-bold sm:text-2xl">Nhập lead từ Excel</h1>
        <p className="max-w-[70ch] text-sm text-muted-foreground">
          Nhập nhiều lead cùng lúc. File được kiểm từng dòng và chia làm ba nhóm trước khi ghi
          — bạn xem và sửa ngay tại đây, không cần mở lại Excel.
        </p>
        <p className="text-sm">
          Có file <b>danh sách khách ĐÃ ĐĂNG KÝ</b> của Sale (nhiều sheet theo tháng)?{" "}
          <Link href="/leads/import/registered" className="text-state-info-ink hover:underline">
            Nhập danh sách đã đăng ký →
          </Link>
        </p>
      </div>

      <ExcelImporter<LeadImportRow>
        title="Nhập lead"
        /* Mẫu SINH ĐỘNG: dropdown khoá đúng tên khoá đang có, SĐT kiểu text,
           tuổi con kiểu số — xem app/api/admin/templates/leads/route.ts. */
        templateUrl="/api/admin/templates/leads"
        templateFilename="mau-lead.xlsx"
        duplicateLabel="SĐT"
        duplicateKey={(raw) => normalizePhone(raw["SĐT"]) || null}
        mergeDuplicates={{ label: "Sẽ cập nhật lead đang có" }}
        checkExisting={async (raws, excelNos) => {
          // Đối chiếu SĐT với lead ĐÃ CÓ trong CRM — nói rõ dòng này sẽ ghi đè lên ai, để
          // Sale nhận ra ngay nếu đó thật sự là người khác cùng số.
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
                `SĐT ${formatPhoneVN(m.phone)} đã có trong CRM — PH "${m.parentName}"` +
                  `, con: ${m.childName?.trim() || "(chưa ghi tên con)"}` +
                  `, trạng thái: ${leadStatusLabel(m.status)}.` +
                  ` Dòng này sẽ CẬP NHẬT lead đó và chia lại cho tư vấn viên mới.` +
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
          // Giữ nguyên ô gốc để server resolve cơ sở/khoá + đối chiếu trùng.
          return row as LeadImportRow;
        }}
        onImport={async (rows) => {
          const res = await fetch("/api/admin/import/leads", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ rows }),
          });
          if (!res.ok) {
            const err = (await res.json().catch(() => ({ error: "Unknown" }))) as { error?: string };
            throw new Error(err.error || "Nhập thất bại");
          }
          const result = (await res.json()) as ImportResult;
          setTimeout(() => router.refresh(), 1000);
          return result;
        }}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        <section className="rounded-xl border border-border bg-muted/40 p-4">
          <h2 className="text-sm font-semibold">Cột trong file (cố định)</h2>
          <ol className="mt-2 list-inside list-decimal space-y-0.5 text-sm text-muted-foreground">
            {LEAD_IMPORT_COLUMNS.map((c) => (
              <li key={c} className="break-words">
                {c}
              </li>
            ))}
          </ol>
        </section>

        <section className="rounded-xl border border-border bg-muted/40 p-4">
          <h2 className="text-sm font-semibold">Những điều dễ nhầm</h2>
          <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
            <li>
              <b className="text-foreground">SĐT</b> bắt buộc và phải hợp lệ (09xx / +84). Để ô
              kiểu <b>text</b> trong Excel, nếu không số 0 đầu bị nuốt mất.
            </li>
            <li>
              {/* Đây là phần đổi nghĩa 15/09/2026 — viết dài hơn các mục khác có chủ đích, vì
                  nó là thứ duy nhất trên màn này GHI ĐÈ dữ liệu người dùng đã nhập tay. */}
              <b className="text-foreground">Trùng SĐT</b> không còn bị bỏ qua: hệ thống{" "}
              <b className="text-foreground">cập nhật lead đang có</b> bằng thông tin trong
              file, ô nào file để trống thì giữ nguyên giá trị cũ, và con mới được thêm vào
              cùng lead (không tạo lead trùng số).
              <ul className="mt-1 list-inside list-disc space-y-0.5 pl-1">
                <li>
                  <b className="text-foreground">Ghi chú</b> của Sale không bị mất — ghi chú
                  trong file được nối thêm xuống dưới.
                </li>
                <li>
                  <b className="text-foreground">Trạng thái phễu</b> giữ nguyên, lead đang ở L3
                  không bị kéo về &quot;Mới&quot;.
                </li>
                <li>
                  Lead <b className="text-foreground">chưa chốt</b> sẽ được chia lại cho tư vấn
                  viên mới. Lead <b className="text-foreground">đã chốt / đã ghi danh</b> giữ
                  nguyên người phụ trách.
                </li>
              </ul>
            </li>
            <li>
              <b className="text-foreground">Cơ sở</b>: quản lý cơ sở để trống → lead về cơ sở
              của mình. Điền mã (vd CS1) khi nhập hộ cơ sở khác — cần quyền HO/Super Admin.
            </li>
            <li>
              <b className="text-foreground">Khoá quan tâm</b> chọn trong danh sách của file
              mẫu. <b className="text-foreground">Tuổi con</b> là số nguyên 3–18 hoặc để trống.
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}
