// Tra cứu danh mục — giá khoá học, giá học cụ, lớp còn chỗ.
//
// Màn CHỈ ĐỌC. Mục đích hẹp: đang ngồi với phụ huynh thì tra được ngay, không
// phải quay về khu quản trị hay hỏi miệng đồng nghiệp. Không có nút nào ghi dữ
// liệu, và cũng không nên có — bảng giá là việc của Đào tạo/Kế toán.
//
// Ba khối lọc theo quyền: ai có quyền nào thấy khối đó. Không ai bị đá ra vì
// thiếu một quyền — trang vẫn mở với phần mình được xem.
import { redirect } from "next/navigation";
import { BookOpen, Boxes, School } from "lucide-react";
import { auth } from "@/lib/auth";
import { checkPermission, checkAnyPermission } from "@/lib/auth/check-permission";
import { PAGE_GATES } from "@/lib/auth/page-gates";
import { resolveActor } from "@/lib/auth/actor";
import { getSaleCatalog } from "@/lib/catalog/sale-catalog";
import { formatVndPlain } from "@/lib/format/money";
import { formatDateVN } from "@/lib/format/date";
import { BangTraCuu } from "./_components/bang-tra-cuu";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tra cứu | Tư vấn tuyển sinh" };

const TRANG_THAI_LOP_VI: Record<string, string> = {
  PLANNED: "Dự kiến",
  RECRUITING: "Đang tuyển",
  ACTIVE: "Đang học",
};

const NHOM_HOC_CU_VI: Record<string, string> = {
  KIT_ROBOT: "Bộ robot",
  SENSOR: "Cảm biến",
};

export default async function SaleTraCuuPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=%2Fsale%2Ftra-cuu");
  if (!(await checkAnyPermission(PAGE_GATES["/sale/tra-cuu"]))) redirect("/sale");

  // Hỏi từng quyền để nạp đúng khối được xem. Cổng trang ở trên dùng phép HOẶC:
  // vào được rồi thì phần nào thấy phần đó, không đá ai ra vì thiếu một quyền.
  const [xemHocCu, xemLop] = await Promise.all([
    checkPermission("products:view"),
    checkPermission("classes:view-all"),
  ]);
  // Giá khoá học: Sale KHÔNG có `courses:view` (quyền đó của Đào tạo/GV), nhưng
  // vẫn thấy giá khoá trong form tạo đơn — bảng giá là thứ nghề của họ. Nên gác
  // bằng chính quyền đã mở cửa đó, không khai quyền mới.
  const xemKhoaHoc =
    (await checkPermission("orders:create")) || (await checkPermission("courses:view"));

  const actor = await resolveActor(session.user.id);
  const dm = await getSaleCatalog(actor, { xemHocCu, xemLop, xemKhoaHoc });

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground">Tra cứu</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Bảng giá và lớp đang mở. Trang chỉ để xem — sửa giá hay mở lớp là việc của
        Đào tạo và Quản lý cơ sở.
      </p>

      <div className="mt-5 space-y-4">
        {xemKhoaHoc ? (
          <section className="rounded-xl border border-border bg-card p-4">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <BookOpen className="h-4 w-4 text-primary" /> Khoá học ({dm.khoaHoc.length})
            </h2>
            {dm.khoaHoc.length === 0 ? (
              <p className="text-sm text-muted-foreground">Chưa có khoá nào đang mở bán.</p>
            ) : (
              <BangTraCuu
                khoaGhiNho="sale-tra-cuu-khoa"
                tenDonVi="khoá"
                cot={["Khoá học", "Mã", "Giá"]}
                canPhai={[false, false, true]}
                dong={dm.khoaHoc.map((k) => ({
                  key: k.id,
                  o: [k.name, k.code ?? "—", k.price == null ? "—" : formatVndPlain(k.price)],
                }))}
              />
            )}
          </section>
        ) : null}

        {xemHocCu ? (
          <section className="rounded-xl border border-border bg-card p-4">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Boxes className="h-4 w-4 text-primary" /> Học cụ ({dm.hocCu.length})
            </h2>
            {/* Nói thẳng vì sao không có cột tồn kho — không thì người dùng nghĩ
                là thiếu sót rồi đi hỏi. */}
            <p className="mb-2 text-xs text-muted-foreground">
              Không hiện tồn kho: số lượng còn lại do bộ phận kho nắm, hỏi quản lý cơ
              sở trước khi hứa giao hàng với khách.
            </p>
            {dm.hocCu.length === 0 ? (
              <p className="text-sm text-muted-foreground">Chưa có học cụ nào đang bán.</p>
            ) : (
              <BangTraCuu
                khoaGhiNho="sale-tra-cuu-hoc-cu"
                tenDonVi="mặt hàng"
                cot={["Tên", "Mã", "Nhóm", "Giá bán"]}
                canPhai={[false, false, false, true]}
                dong={dm.hocCu.map((h) => ({
                  key: h.id,
                  o: [
                    h.name,
                    h.sku,
                    NHOM_HOC_CU_VI[h.category] ?? h.category,
                    formatVndPlain(h.salePrice),
                  ],
                }))}
              />
            )}
          </section>
        ) : null}

        {xemLop ? (
          <section className="rounded-xl border border-border bg-card p-4">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <School className="h-4 w-4 text-primary" /> Lớp đang mở ({dm.lop.length})
            </h2>
            {dm.lop.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Cơ sở của bạn chưa có lớp nào đang mở.
              </p>
            ) : (
              <BangTraCuu
                khoaGhiNho="sale-tra-cuu-lop"
                tenDonVi="lớp"
                cot={["Lớp", "Khoá", "Cơ sở", "Lịch", "Khai giảng", "Còn chỗ"]}
                canPhai={[false, false, false, false, false, true]}
                dong={dm.lop.map((l) => ({
                  key: l.id,
                  // Lớp hết chỗ vẫn hiện, nhưng nhạt đi: sale cần biết nó tồn tại
                  // để trả lời "lớp đó đầy rồi", chứ không phải để giấu.
                  mo: l.conTrong === 0,
                  o: [
                    l.ten,
                    l.tenKhoa,
                    l.tenCoSo ?? "—",
                    l.lich ?? "—",
                    l.batDau ? formatDateVN(l.batDau) : "chưa định",
                    l.conTrong === 0
                      ? "hết chỗ"
                      : `${l.conTrong}/${l.sucChua} · ${TRANG_THAI_LOP_VI[l.status] ?? l.status}`,
                  ],
                }))}
              />
            )}
          </section>
        ) : null}

        {!xemKhoaHoc && !xemHocCu && !xemLop ? (
          <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            Tài khoản của bạn chưa được cấp quyền xem danh mục nào.
          </p>
        ) : null}
      </div>
    </div>
  );
}
