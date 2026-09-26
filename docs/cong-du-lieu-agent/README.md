# Cổng dữ liệu agent — Đợt 0 (runbook)

> Nguồn yêu cầu: tài liệu CEO "Hướng dẫn tích hợp: Cổng dữ liệu cho Agent Sata Robo (API + MCP)"
> v1.0 · 25/09/2026 (bản gốc ngoài repo: `E:\WebSataRobo\KET_NOI\KET_NOI\`).
> Phân tích khả thi: [`Document/0-yeucau/2-ba-phan-tich/11-gap-analysis-cong-du-lieu-agent.md`](../../Document/0-yeucau/2-ba-phan-tich/11-gap-analysis-cong-du-lieu-agent.md).
> Hợp đồng với xưởng skill (khuôn JSON + mẫu + máy kiểm): [`tests/agents/khuon-xuong/`](../../tests/agents/khuon-xuong/README.md).

## 1. Đợt 0 gồm gì (đã code)

| Thành phần | Nơi ở |
|---|---|
| 6 bảng mới + cột `User.isServiceAccount` (additive, RLS bật) | `prisma/migrations/20260925120000_cong_du_lieu_agent_dot0/` |
| Sổ công cụ (1 công cụ: `danh_muc.lay_co_so`) | `lib/agents/tools/` |
| Cổng kiểm soát 13 bước (spec §5.6) | `lib/agents/gateway/pipeline.ts` |
| Cấp/huỷ token OAuth `client_credentials` | `lib/agents/gateway/cap-token.ts` |
| Quyết định quyền bước 6 + 9 (MỘT hàm thuần) | `lib/agents/gateway/kiem-grant.ts` |
| Tự khoá khi bất thường + báo người duyệt | `lib/agents/gateway/tu-khoa.ts` |
| Che dữ liệu cá nhân (thư viện, chưa công cụ CAO nào dùng) | `lib/agents/pii.ts` |
| Xác thực 2 lớp TOTP (bước nâng cho thao tác nhạy cảm) | `lib/auth/totp.ts`, `lib/auth/hai-lop.ts` |
| Tầng quản trị (tạo/duyệt/khoá/thu hồi, grant, công tắc) | `lib/agents/quan-tri/` |
| Màn quản trị "Cổng dữ liệu agent" (5 thẻ) | `app/(admin)/admin/cong-du-lieu-agent/` |
| REST | `app/api/agent/v1/{oauth/token,oauth/revoke,tools,tools/[ten]}` |
| Lưới ESLint (cấm `@/lib/db` trần, cấm `SYSTEM_ACTOR`, công cụ không chạm kho) | `eslint.config.mjs` + `lib/eslint/agent-gateway-lint.test.ts` |

**Chưa làm (các đợt sau):** MCP + OAuth 2.1 (Đợt 2) · 13 công cụ còn lại · ký từng yêu cầu +
Idempotency-Key + bản nháp (Đợt 6) · báo cáo tuần · luật gitleaks · lọc Sentry theo tiền tố khoá ·
dọn bảng token hết hạn.

## 2. Việc phải làm TAY trước khi dùng trên `test.satarobo.vn`

Thứ tự bắt buộc — thiếu bước nào thì cổng TỪ CHỐI (fail closed), không mở nhầm:

1. **Env (Vercel, môi trường `test`, Sensitive)** — sinh mỗi khoá bằng `openssl rand -base64 32`:
   `AGENT_GATEWAY_PEPPER`, `TOTP_ENCRYPTION_KEY` (bắt buộc), `AGENT_PII_PEPPER` (Đợt 3).
   Production dùng **bộ khoá khác** (spec §4.6). Đổi `AGENT_GATEWAY_PEPPER` = mọi mật khẩu/token chết.
2. **Migration** chạy tự động khi merge vào `test` (`migrate-test.yml`).
3. **Seed vai** — RBAC v2 đọc từ DB, merge file seed KHÔNG đổi gì: chạy workflow seed vai của môi
   trường test (lên `main` thì bấm `seed-prod-roles.yml`). Thêm 3 vai: `GIAM_DOC`, `KY_THUAT`, `AGENT_CHI_DOC`.
4. **Gán vai** trên màn Vai trò/Tổ chức: người DUYỆT ← `GIAM_DOC` (neo HO), người TẠO ← `KY_THUAT`
   (neo HO). Hai người KHÁC NHAU (hệ thống chặn tự duyệt, kể cả SUPER_ADMIN).
5. Mỗi người vào **Cổng dữ liệu agent › Cài đặt** → cài xác thực 2 lớp (quét QR bằng ứng dụng
   xác thực bất kỳ).

## 3. Cấp khoá cho xưởng (client `xuong`)

1. Kỹ thuật: thẻ **Ứng dụng kết nối** → Tạo (tên, IP thoát của máy xưởng, vai `AGENT_CHI_DOC`, hạn,
   lý do, mã 2FA). Trạng thái: Chờ duyệt, CHƯA có mật khẩu.
2. Giám đốc: thẻ **Chờ duyệt** → Duyệt (mã 2FA).
3. Kỹ thuật: **Sinh mật khẩu** → hiện ĐÚNG MỘT LẦN. Đọc trực tiếp cho người dùng, **không gửi qua
   Zalo/email** (spec Phụ lục B). Mất thì xoay khoá mới.
4. Kỹ thuật: thẻ **Quyền cấp** → cấp `danh_muc.lay_co_so`, cơ sở, hạn, lý do → Giám đốc duyệt.
5. Xưởng thử:
   ```bash
   curl -s https://test.satarobo.vn/api/agent/v1/oauth/token -u "$SR_CLIENT_ID:$SR_CLIENT_SECRET" \
     -d grant_type=client_credentials -d scope="danh_muc.lay_co_so:doc"
   curl -s https://test.satarobo.vn/api/agent/v1/tools/danh_muc.lay_co_so \
     -H "Authorization: Bearer $SR_TOKEN" -H "Content-Type: application/json" \
     -d '{ "tham_so": {} }' > phan-hoi.json
   node tests/agents/khuon-xuong/cong-cu/kiem-khuon.mjs danh_muc.lay_co_so phan-hoi.json
   ```

⚠️ IP là CĂN CỨ CẤP QUYỀN: token/mật khẩu ĐÚNG mà gọi từ IP ngoài danh sách ⇒ client **tự khoá**
ngay và người duyệt nhận báo (spec §12). Máy xưởng đổi IP thì phải cập nhật trước (Đợt 0 chưa có
nút sửa IP — thu hồi và tạo client mới).

## 4. Khẩn cấp (spec Phụ lục C)

- Nghi lộ một khoá: **Khoá ngay** hoặc **Thu hồi** client đó — một người làm được, không cần 2FA.
- Chưa rõ khoá nào: **Tắt cổng** ở đầu màn — hiệu lực ở lượt gọi kế tiếp (cổng đọc công tắc thẳng
  DB, không qua bộ đệm 5 phút).
- Điều tra: thẻ **Nhật ký gọi** (lọc bất thường).

## 5. Quyết định MẶC ĐỊNH đang dùng — chờ CEO/tech lead xác nhận (BA §7)

| Mã BA | Mặc định đã code | Đổi thì sửa ở |
|---|---|---|
| Q-N4 | Vai `GIAM_DOC` (duyệt) + `KY_THUAT` (tạo) + `AGENT_CHI_DOC` (user dịch vụ) | `prisma/seed-roles.ts` |
| Q-N5 | 2FA bắt buộc ở thao tác tạo/duyệt/sinh khoá/mở khoá/bật cổng; sai 5 lần khoá 15 phút; mất máy thì người duyệt khác đặt lại (có lý do) | `lib/auth/hai-lop.ts`, `_actions.ts` |
| Q-N8 | REST ở `/api/agent/v1/*` — đi qua MỌI host (`isInfraPath`) | — |
| Q-N9 | `"HO"` trong grant = nhìn toàn hệ thống | `lib/agents/gateway/kiem-grant.ts` |
| Q-N11 | Công tắc đọc thẳng DB mỗi lượt | `lib/agents/gateway/cau-hinh.ts` |
| Q-N12 | Tên cột Prisma tiếng Anh, khoá JSON API tiếng Việt | — |
| Q-D1 | `phap_nhan` lấy từ dữ liệu hệ thống (pháp nhân gần nhất trên cây tổ chức), không theo mẫu của xưởng | `lib/agents/tools/danh-muc/lay-co-so.ts` |
| — | Thu hồi / khoá / TẮT cổng KHÔNG đòi 2FA (phanh khẩn cấp); BẬT cổng thì đòi người duyệt + 2FA | `_actions.ts` |

⚠️ **SUPER_ADMIN vượt mọi `can()`** (thiết kế sẵn của repo) ⇒ về quyền, SUPER_ADMIN làm được cả tạo
lẫn duyệt. Luật "người duyệt ≠ người tạo" vẫn chặn **trên từng bản ghi**, nên một SUPER_ADMIN không
tự duyệt được thứ mình tạo — nhưng hai SUPER_ADMIN duyệt chéo được. Spec muốn quyền duyệt thuộc vai
Giám đốc chứ không thuộc SUPER_ADMIN; muốn ép đúng như vậy cần một quyết định sửa `can()` (ngoài
phạm vi Đợt 0).

## 5b. Giới hạn đã biết (rà bảo mật đối kháng 25/09 — 14 phát hiện, đã vá phần nặng)

Đã vá + có ca test đã cấy lại: công tắc cổng ra khỏi registry chung (AG-01 — trước đó SUPER_ADMIN
bật được cổng ở màn Cấu hình vận hành mà không cần 2FA), thu hồi token fail-closed khi thiếu pepper,
chặn lũ theo IP trước mọi thứ, chỉ đếm sai mật khẩu từ IP được phép (biết `client_id` không đủ để
khoá agent thật), ghi-nhật-ký-rồi-mới-đếm, 2FA hết đua, PII bắt số trong ngoặc + CMND có từ khoá,
thẻ Chờ duyệt hiện quyền đang có.

Còn lại, CỐ Ý chưa vá ở Đợt 0 — phải xử lý trước khi mở công cụ CAO (Đợt 3):
- **Hạn mức bản ghi CAO/ngày là trần MỀM**: kiểm-rồi-mới-chạy, nhiều lượt song song có thể vượt tối
  đa một `maxRowsPerCall` mỗi lượt. Đợt 0 chưa có công cụ CAO nên chưa khai thác được.
- **Hạn mức tần suất cần Upstash**: thiếu `UPSTASH_REDIS_REST_URL`/`KV_REST_API_URL` thì `lib/rate-limit.ts`
  rơi về bộ nhớ từng lambda — trần thật lỏng hơn nhiều lần. Kiểm env trên Vercel trước khi cấp khoá.
- **Lượt bị chặn lũ theo IP KHÔNG ghi nhật ký** — cố ý: ghi từng request rác là biến nhật ký thành
  công cụ khuếch đại tấn công.
- **Thân yêu cầu đọc trước khi xác thực** (tối đa 256 KB; Vercel chặn ở 4,5 MB).
- **"Lớp lọc 2" (RBAC) của `lay_co_so` là no-op** với cấu hình hiện tại: user dịch vụ neo vai ở Hội sở
  ⇒ nhìn toàn hệ thống; rào thật là phạm vi grant. Muốn lớp 2 có nghĩa thì đổi nơi neo (quyết định riêng).

## 6. Kiểm thử

```bash
# Thuần (không DB) — nằm trong `pnpm test:unit`
pnpm exec vitest run lib/agents lib/auth/totp.test.ts lib/security/ma-hoa.test.ts lib/eslint/agent-gateway-lint.test.ts
# DB thật (Postgres local) — cũng chạy trong job CI `Unit tests`
DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/satarobo_test' DIRECT_URL="$DATABASE_URL" pnpm test:agent-db
```

⚠️ **`satarobo_test` dùng CHUNG cho mọi worktree trên máy.** Đo 25/09: một phiên khác `resetDb()`
đúng lúc bộ này chạy ⇒ 20 ca đỏ trong vài mili giây ("vai dịch vụ không tồn tại", "không tìm thấy
bản ghi") dù mã không đổi. Chạy trên DB riêng của worktree (tên PHẢI chứa `satarobo_test` để
`assertTestDb` cho qua): `createdb -U postgres -h 127.0.0.1 satarobo_test_ketnoi` rồi
`prisma migrate deploy` với URL đó.

Bộ DB phủ ca B1–B4, B6, B7, B9–B13, B17 của spec §14.2 (mã ca giữ nguyên). B5 phủ ở tầng hàm thuần
(`kiem-grant.test.ts`) vì công cụ Đợt 0 không nhận tham số `co_so`. B14/B15/B18 thuộc đợt sau.
