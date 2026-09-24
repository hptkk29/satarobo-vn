// lib/integrations/zalocrm/pham-vi-nick.ts — AI ĐƯỢC DÙNG MỘT NICK, VÀ Ở MỨC NÀO.
//
// ── CHÍNH SÁCH (chủ dự án chốt 24/09/2026) ─────────────────────────────────
//   Quản lý cơ sở  → `admin` TỰ ĐỘNG trên mọi nick của cơ sở mình. Không ai phải nhớ
//                    giao; thêm nick mới hay đổi người quản lý đều tự khớp.
//   Tư vấn viên    → GIAO TAY, chọn mức `read` / `chat` / `admin`.
//   Nick CHƯA giao ai → cả cơ sở thấy ở mức `chat` (giữ nguyên hành vi trước 24/09).
//
// Ba mức là mô hình CÓ SẴN của ZaloCRM, không phải ta bịa:
//   `read` xem tin · `chat` gửi tin · `admin` quản lý nick
//   (`backend/src/modules/zalo/zalo-access-routes.ts` — `VALID_PERMISSIONS`).
//
// ── 🔴 VÌ SAO NHÁNH "CHƯA GIAO" PHẢI GIỮ ───────────────────────────────────
// Bỏ nó đi thì một nick mới quét QR xong là KHÔNG AI đọc được cho tới khi có người nhớ
// vào giao — hộp thư khách nằm im, không lỗi nào báo. Đó đúng là kiểu hỏng câm mà cả
// đợt này sinh ra để tránh. "Chưa giao" là trạng thái BÌNH THƯỜNG của mọi nick mới.
//
// ── VÌ SAO TÁCH RA FILE THUẦN ──────────────────────────────────────────────
// `capQuyenMotOrg` chạm DB + gọi mạng. Luật "ai thấy nick nào, mức nào" thì không cần
// gì cả — nó là một phép trên bốn danh sách. Tách ra là cấy lỗi được.

/** Ba mức ZaloCRM hiểu. Thứ tự từ HẸP đến RỘNG — `xepHang` dựa vào chính thứ tự này. */
export const MUC_QUYEN = ["read", "chat", "admin"] as const;
export type MucQuyen = (typeof MUC_QUYEN)[number];

/** Vai được `admin` TỰ ĐỘNG trên mọi nick của cơ sở mình. */
export const VAI_THAY_MOI_NICK: readonly string[] = ["CENTER_MANAGER"];

/** Mức cho người của cơ sở khi nick CHƯA giao cho ai. */
export const MUC_MAC_DINH_CHUA_GIAO: MucQuyen = "chat";

export type GiaoTay = { sataUserId: string; mucQuyen: MucQuyen };
export type QuyenTrenNick = { sataUserId: string; mucQuyen: MucQuyen };

/**
 * Nhãn tiếng Việt của từng mức — NÓI BẰNG VIỆC LÀM ĐƯỢC, không bằng từ kỹ thuật.
 *
 * Người vận hành không biết `read`/`chat`/`admin` nghĩa là gì, và đoán sai thì hậu quả
 * là phân quyền sai trên chat khách thật. `Record` ĐỦ nên thêm mức thứ tư mà quên đặt
 * nhãn là lỗi biên dịch, không phải một ô trống trên màn.
 */
export const NHAN_MUC: Record<MucQuyen, string> = {
  read: "Chỉ xem",
  chat: "Xem và nhắn tin",
  admin: "Quản lý nick",
};

/**
 * Câu tóm tắt "nick này đang giao cho ai" để in trên bảng.
 *
 * 🔴 Rỗng ra "Cả cơ sở dùng chung", KHÔNG phải "chưa gán" hay một ô trống. Đó là SỰ
 * THẬT về hành vi (xem nhánh ③ của `nguoiDuocDungMotNick`), và hai cách nói kia đọc như
 * một việc còn bỏ dở — người vận hành sẽ đi "sửa" một thứ đang đúng.
 */
export function tomTatGiao(
  giao: readonly { ten: string; mucQuyen: string }[],
): string {
  if (giao.length === 0) return "Cả cơ sở dùng chung";
  return giao.map((g) => `${g.ten} (${NHAN_MUC[docMucQuyen(g.mucQuyen)]})`).join(", ");
}

export type ThamSoPhamViNick = {
  /** Các dòng GIAO TAY của nick này (`ZaloCrmNickGiao`). Rỗng = chưa giao ai. */
  giaoTay: readonly GiaoTay[];
  /**
   * MỌI NHÂN SỰ còn hiệu lực của cơ sở — tập GIAO TAY hợp lệ (24/09/2026).
   *
   * Dòng giao cho người NGOÀI tập này sẽ rụng (xem `nguoiDuocDungMotNick`). Đó là vế
   * GỠ: nghỉ việc, chuyển cơ sở, hết nhiệm kỳ.
   */
  nguoiCuaCoSo: readonly string[];
  /**
   * Tập CON của `nguoiCuaCoSo` dùng nick MẶC ĐỊNH khi nick CHƯA giao ai.
   *
   * 🔴 BẮT BUỘC, KHÔNG có mặc định (luật 7). Để nó rơi về `nguoiCuaCoSo` là cấp quyền
   * mặc định cho MỌI nhân sự của cơ sở trên MỌI nick chưa giao — một lượt nới quyền
   * không ai bấm nút nào, và không triệu chứng nào báo.
   */
  macDinhDungDuoc: readonly string[];
  /** Tập con của `nguoiCuaCoSo` đang giữ vai quản lý cơ sở. */
  quanLyCoSo: readonly string[];
};

/** Mức rộng hơn thắng. Dùng khi một người vừa là quản lý vừa được giao tay. */
function rongHon(a: MucQuyen, b: MucQuyen): MucQuyen {
  return MUC_QUYEN.indexOf(a) >= MUC_QUYEN.indexOf(b) ? a : b;
}

/**
 * Đọc mức từ một chuỗi (cột `ZaloCrmNickGiao.mucQuyen`, hoặc giá trị từ trình duyệt).
 *
 * 🔴 KHÔNG DÙNG `as MucQuyen`. Cột là `String` (ràng bằng CHECK ở DB, không phải enum),
 * và giá trị trên form đến từ trình duyệt — cả hai đường đều có thể mang chuỗi lạ.
 * Ép kiểu là nói với `tsc` một điều không kiểm được, rồi chuỗi lạ ấy đi thẳng sang
 * ZaloCRM.
 *
 * Mức lạ rơi về `read` (HẸP NHẤT), không phải mặc định `chat`: một lỗi gõ hay một cột
 * hỏng phải làm người ta thấy ÍT đi, không phải nhiều hơn. Cùng luật với endpoint bên
 * ZaloCRM — hai đầu lệch nhau ở điểm này là mỗi lượt đối soát đặt một mức khác nhau.
 */
export function docMucQuyen(raw: string | null | undefined): MucQuyen {
  return (MUC_QUYEN as readonly string[]).includes(raw ?? "") ? (raw as MucQuyen) : "read";
}

/**
 * Ai được dùng MỘT nick, và ở mức nào — để đẩy sang ZaloCRM.
 *
 * THUẦN: không DB, không mạng, không đồng hồ. Thứ tự trả về ỔN ĐỊNH (theo
 * `nguoiCuaCoSo`) để hai lượt liên tiếp sinh cùng một payload — lượt đối soát so danh
 * sách chứ không so tập hợp, và payload xáo thứ tự làm nhật ký đầy tiếng ồn.
 *
 * 🔴 GIAO NHAU với `nguoiCuaCoSo`, KHÔNG phải hợp. Dòng giao tay là con trỏ ĐƯỢC LƯU —
 * người được giao có thể đã nghỉ việc hoặc đổi cơ sở. Cộng vào là vô hiệu hoá vế GỠ của
 * hệ thống: người không còn phận sự vẫn đọc chat khách, và không triệu chứng nào báo.
 */
export function nguoiDuocDungMotNick(t: ThamSoPhamViNick): QuyenTrenNick[] {
  const hopLe = new Set(t.nguoiCuaCoSo);
  const muc = new Map<string, MucQuyen>();

  // ① Quản lý cơ sở — `admin`, TỰ ĐỘNG, không cần dòng giao nào.
  for (const ql of t.quanLyCoSo) {
    if (hopLe.has(ql)) muc.set(ql, "admin");
  }

  // ② Giao tay. Lọc theo `hopLe` nên dòng giao cho người đã rời cơ sở tự rụng.
  const giaoConHieuLuc = t.giaoTay.filter((g) => hopLe.has(g.sataUserId));
  for (const g of giaoConHieuLuc) {
    const cu = muc.get(g.sataUserId);
    muc.set(g.sataUserId, cu ? rongHon(cu, g.mucQuyen) : g.mucQuyen);
  }

  // ③ CHƯA GIAO AI (sau khi lọc) ⇒ mức mặc định cho `macDinhDungDuoc`. Quản lý vẫn giữ
  //    `admin` của họ nhờ `rongHon`. Xem khối chú thích đầu file về vì sao nhánh này
  //    phải tồn tại.
  //
  //    🔴 Lặp trên `macDinhDungDuoc`, KHÔNG phải `nguoiCuaCoSo`. Từ 24/09 hai tập đã
  //    KHÁC NHAU: tập sau gồm mọi nhân sự của cơ sở (để giao tay được), tập trước chỉ
  //    gồm vai được dùng nick mặc định. Đổi sang `nguoiCuaCoSo` là cho cả Giáo viên,
  //    Kế toán… đọc mọi nick chưa giao — `[PVN-07]` canh đúng chỗ này.
  if (giaoConHieuLuc.length === 0) {
    for (const id of t.macDinhDungDuoc) {
      if (!hopLe.has(id)) continue;
      const cu = muc.get(id);
      muc.set(id, cu ? rongHon(cu, MUC_MAC_DINH_CHUA_GIAO) : MUC_MAC_DINH_CHUA_GIAO);
    }
  }

  return t.nguoiCuaCoSo
    .filter((id) => muc.has(id))
    .map((id) => ({ sataUserId: id, mucQuyen: muc.get(id)! }));
}
