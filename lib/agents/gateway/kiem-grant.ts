// lib/agents/gateway/kiem-grant.ts — bước 6 + bước 9 của cổng (spec §5.6). THUẦN.
//
// ── VÌ SAO GOM VÀO MỘT HÀM ──────────────────────────────────────────────────────────
// Luật cứng Nền Hệ thống #1 cấm so quyền/cơ sở tại chỗ. Hai bước này KHÔNG phải RBAC
// nghiệp vụ (cái đó vẫn đi qua `can()` ở bước 10) mà là tầng kiểm soát riêng của cổng:
// "client này được CẤP công cụ nào, ở cơ sở nào, tới ngày nào". Gom vào đúng MỘT hàm
// thuần có test để có một chỗ duy nhất đọc được luật và cấy lỗi được (BA §5 X6).
//
// ── BA LUẬT KHÔNG THƯƠNG LƯỢNG ──────────────────────────────────────────────────────
// 1. HẾT HẠN LÀ THUỘC TÍNH TÍNH LÚC ĐỌC (luật cứng #8: không cron nào ghi thay đổi quyền).
//    Grant còn hiệu lực ⇔ trạng thái ACTIVE **và** `hetHan > now`. Cột trạng thái trong DB
//    không bao giờ cần một cron "chuyển sang hết hạn" để cổng từ chối đúng.
// 2. SCOPE TRÊN TOKEN CHỈ LÀ TRẦN TRÊN (luật cứng #6, BA §5 X4). Token cấp lúc 9:00 mang
//    scope `kinh_doanh.lay_leads:doc`; grant bị thu hồi lúc 9:05 thì lượt gọi 9:06 PHẢI bị
//    từ chối dù token còn sống. Vì vậy hàm đòi CẢ scope token LẪN grant còn hiệu lực.
// 3. NGOÀI PHẠM VI THÌ TỪ CHỐI, KHÔNG TRẢ RỖNG (spec bước 9, ca B5). Trả mảng rỗng cho một
//    cơ sở không được cấp là nói dối agent "cơ sở đó không có dữ liệu".

export type CheDo = "doc" | "ghi_nhap" | "ghi_that";
export const CHE_DO: readonly CheDo[] = ["doc", "ghi_nhap", "ghi_that"];

/** Mã cơ sở đặc biệt: "Hội sở" trong grant nghĩa là NHÌN TOÀN HỆ THỐNG (BA §7 Q-N9). */
export const MA_HOI_SO = "HO";

export type GrantVao = {
  congCu: string;
  cheDo: CheDo;
  /** Mã cơ sở (OrgUnit.code): "HO", "CS1", "CS2"… */
  coSo: readonly string[];
  xemDuLieuGoc: boolean;
  hanMucNgay: number | null;
  trangThai: string;
  hetHan: Date;
};

export function grantConHieuLuc(g: Pick<GrantVao, "trangThai" | "hetHan">, now: Date): boolean {
  return g.trangThai === "ACTIVE" && g.hetHan.getTime() > now.getTime();
}

export function chuoiScope(congCu: string, cheDo: CheDo): string {
  return `${congCu}:${cheDo}`;
}

/** "a.b:doc c.d:doc" → ["a.b:doc","c.d:doc"]. Phần tử sai khuôn → null (từ chối cả chuỗi). */
export function tachChuoiScope(chuoi: string | null | undefined): string[] | null {
  if (chuoi == null) return [];
  const phan = chuoi.trim().split(/\s+/).filter(Boolean);
  for (const p of phan) {
    const m = /^([a-z][a-z0-9_]*\.[a-z][a-z0-9_]*):([a-z_]+)$/.exec(p);
    if (!m || !CHE_DO.includes(m[2] as CheDo)) return null;
  }
  return [...new Set(phan)];
}

/**
 * Chọn scope cho một token mới (spec §4.2): scope xin vào CHỈ ĐƯỢC THU HẸP. Xin một scope
 * không nằm trong grant còn hiệu lực ⇒ từ chối CẢ yêu cầu (`invalid_scope`), không âm thầm
 * cắt bớt. Không xin gì ⇒ nhận mọi scope đang được cấp. Không được cấp gì ⇒ từ chối.
 */
export function chonScopeChoToken(
  scopeXin: readonly string[],
  grants: readonly GrantVao[],
  now: Date,
): { ok: true; scopes: string[] } | { ok: false; thua: string[] } {
  const duocCap = new Set(
    grants.filter((g) => grantConHieuLuc(g, now)).map((g) => chuoiScope(g.congCu, g.cheDo)),
  );
  if (scopeXin.length === 0) {
    return duocCap.size > 0 ? { ok: true, scopes: [...duocCap].sort() } : { ok: false, thua: [] };
  }
  const thua = scopeXin.filter((s) => !duocCap.has(s));
  return thua.length > 0 ? { ok: false, thua } : { ok: true, scopes: [...new Set(scopeXin)].sort() };
}

export type QuyetDinhGoi =
  | { ok: true; phamViCoSo: string[]; xemDuLieuGoc: boolean; hanMucNgay: number | null }
  | { ok: false; ma: "CONG_CU_KHONG_TON_TAI" | "KHONG_DU_QUYEN" | "NGOAI_PHAM_VI_CO_SO" };

/**
 * Lượt gọi `congCu` ở `cheDo`, xin cơ sở `coSoYeuCau` (null = không chỉ định) — được không,
 * và phạm vi cơ sở hiệu lực là gì.
 *
 * `tatCaMaCoSo`: mọi mã cơ sở đang tồn tại (để nở "HO" ra toàn hệ thống).
 */
export function quyetDinhGoi(input: {
  scopesToken: readonly string[];
  grants: readonly GrantVao[];
  congCu: string;
  cheDo: CheDo;
  coSoYeuCau: readonly string[] | null;
  tatCaMaCoSo: readonly string[];
  now: Date;
}): QuyetDinhGoi {
  const { scopesToken, grants, congCu, cheDo, coSoYeuCau, tatCaMaCoSo, now } = input;
  const hieuLucCuaCongCu = grants.filter((g) => g.congCu === congCu && grantConHieuLuc(g, now));
  const dungCheDo = hieuLucCuaCongCu.filter((g) => g.cheDo === cheDo);

  // Bước 6 — token phải mang đúng scope, VÀ grant tương ứng phải còn hiệu lực lúc này.
  if (!scopesToken.includes(chuoiScope(congCu, cheDo)) || dungCheDo.length === 0) {
    // Biết công cụ (có scope/grant chế độ khác) nhưng sai chế độ ⇒ 403. Không biết gì ⇒
    // 404 như công cụ không tồn tại, để không lộ danh sách (ca B4).
    const biet =
      scopesToken.some((s) => s.startsWith(`${congCu}:`)) && hieuLucCuaCongCu.length > 0;
    return { ok: false, ma: biet ? "KHONG_DU_QUYEN" : "CONG_CU_KHONG_TON_TAI" };
  }

  // Bước 9 — phạm vi cơ sở của grant (hợp các grant cùng công cụ + chế độ).
  const tuGrant = new Set(dungCheDo.flatMap((g) => g.coSo));
  const phamViGrant = tuGrant.has(MA_HOI_SO)
    ? [...new Set([MA_HOI_SO, ...tatCaMaCoSo])]
    : [...tuGrant];
  if (phamViGrant.length === 0) return { ok: false, ma: "NGOAI_PHAM_VI_CO_SO" };

  let phamVi: string[];
  if (coSoYeuCau == null || coSoYeuCau.length === 0) {
    phamVi = phamViGrant;
  } else {
    const choPhep = new Set(phamViGrant);
    if (coSoYeuCau.some((c) => !choPhep.has(c))) return { ok: false, ma: "NGOAI_PHAM_VI_CO_SO" };
    phamVi = [...new Set(coSoYeuCau)];
  }

  const hanMuc = dungCheDo.map((g) => g.hanMucNgay).filter((n): n is number => n != null);
  return {
    ok: true,
    phamViCoSo: phamVi.sort(),
    xemDuLieuGoc: dungCheDo.some((g) => g.xemDuLieuGoc),
    hanMucNgay: hanMuc.length > 0 ? Math.min(...hanMuc) : null,
  };
}
