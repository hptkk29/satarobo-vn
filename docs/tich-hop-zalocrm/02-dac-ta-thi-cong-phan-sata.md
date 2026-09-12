# BẢN ĐẶC TẢ THI CÔNG — ZaloCRM phần Sata Robo (S1…S10)

> Nhánh `feat/zalocrm` (cắt từ `origin/test`). Chỉ phần Sata; F1–F7 là repo fork, ngoài phạm vi.
> Mọi `file:line` dưới đây đã mở và xác minh trên nhánh này. **Số dòng trong kế hoạch §5 đã lệch** — dùng số ở bản này.

---

## 0. HAI ĐIỀU KIỆN TIÊN QUYẾT (làm trước mọi dòng code)

| # | Việc | Vì sao chặn cứng |
|---|---|---|
| **P1** | Người vận hành chạy tay `prisma/migrations/20260827120000_hop_thu_da_kenh` lên DB local/test | 3 bảng `Inbox*` + 5 enum **chưa tồn tại ở bất kỳ môi trường nào** (`migration.sql:3-4`). Chưa chạy thì mọi test chạm hộp thư tự SKIP và **CI vẫn xanh** — bạn code mù. |
| **P2** | Lô L0 (thêm `pnpm test:inbox-db` vào CI) merge trước | `package.json:39` có script nhưng `.github/workflows/ci.yml` chỉ gọi `test:chat-db` (:179), `test:nen-db` (:184), `test:lead-intake` (:192). 14 ca HT-01…HT-14 **chưa từng chạy trong CI**. Không mở cổng này thì mọi test ZC-* viết thêm cũng vô nghĩa. |

⚠️ Cảnh báo cho L0: lần đầu bật `test:inbox-db` trong CI là lần đầu 14 ca đó thực sự chạy. **Chạy thử ở local trước khi push**, chuẩn bị tinh thần đỏ ngay ở commit nền.

---

## 1. FILE ĐIỂM NGHẼN — mỗi file do ĐÚNG MỘT lô sửa

| File | Lô sở hữu | Ai khác muốn đụng → phải chờ |
|---|---|---|
| `prisma/schema.prisma` | **L1** | S3 (enum + 2 bảng), S4 (`EXTERNAL_TAG`) → gộp hết vào L1 |
| `lib/db-scope.ts` (`SCOPE_EXEMPT` :178) | **L1** | test `[A0-04-T12-01]` (`lib/db-scope.test.ts:221`) đỏ nếu bảng có `centerId` mà không khai |
| `lib/org/center-bridge.ts` (`BACKFILL_SPECS` :45) | **L1** | test `[US-07-IT-08b]` đỏ nếu bảng có đủ 2 cột mà không khai |
| `components/sale/hop-thu/hop-thu-workspace.tsx` | **L1** | `NHAN_KENH: Record<InboxChannel,string>` (:30) **typecheck đỏ** khi thêm enum; B1 (`outboundKey`) cùng file → gộp |
| `app/(sale)/sale/hop-thu/page.tsx` (`KENH_HOP_LE` :31) | **L1** | mảng, **typecheck KHÔNG bắt** — quên là bộ lọc kênh mới câm |
| `lib/auth/permissions.ts` · `prisma/seed-roles.ts` · `lib/permissions/registry/crm.ts` | **L2** | S6 độc quyền. L3 chỉ *đọc* key |
| `lib/auth/page-gates.ts` · `lib/auth/route-policy.ts` · `components/admin/sidebar.tsx` · `next.config.ts` | **L3** | S1 độc quyền |
| `lib/flags.ts` · `.env.example` · `lib/settings/registry.ts` · `.github/workflows/ci.yml` | **L0** | S1 (cờ), S7 (setting), S9-B4 (`INBOX_ENABLED`), S9-B5 (CI) → gộp hết |
| `lib/inbox/thao-tac.ts` · `send.ts` · `identity.ts` · `identity-rules.ts` · `queries.ts` | **L6** | S4(b,d) + S9-B2 + S9-B6 cùng đụng → gộp một lô |
| `lib/lead/activity-write.test.ts` (allowlist `duocPhep` :608) | **L8** | ai truyền `lamMoiDongHo` phải khai vào đây |
| `app/(admin)/admin/leads/[id]/page.tsx` | **L4** | S2 độc quyền |
| `app/(admin)/admin/tich-hop/{page.tsx,_actions.ts}` | **L9** | S7 độc quyền |
| `vercel.json` (đang **đúng 26** cron) · `.github/workflows/cron-pump-test.yml` | **L11** | cron thứ 27 — kiểm hạn mức gói Vercel TRƯỚC |
| `lib/lead/ingest.ts` | **L10** | S8 độc quyền |

**Quy tắc:** không lô nào được sửa file của lô khác, kể cả "một dòng cho tiện". Nếu phát hiện cần → dừng, báo, để lô sở hữu làm.

---

## 2. SƠ ĐỒ LÔ VÀ THỨ TỰ

```
ĐỢT 1 (6 lô song song, không lô nào chờ lô nào)
  L0 nền cấu hình + CI      L1 schema/enum/bảng       L2 quyền zalocrm:use
  L5 form nhập khách prefill L10 pháp lý nền (S8)     L11 cron dọn (S9-B7)

ĐỢT 2 (song song, sau đợt 1)
  L3 trang /admin/zalo-crm + SSO   [cần L0 (cờ) + L2 (quyền)]
  L6 sửa lõi hộp thư B2/B3/B6      [cần L0 (CI) — KHÔNG cần L1]
  L8 dòng thời gian lead (S5)      [không cần gì; viết trước để L7 gọi]

ĐỢT 3
  L4 nút "Nhắn Zalo"               [cần L3 để không dead-link]
  L7 webhook + dịch payload        [cần L1 (enum) + L6 (identity) + L8 (hàm ghi)]

ĐỢT 4
  L9 màn Tích hợp + đồng bộ nick   [cần L1 (bảng nick) + L7 (log)]

L12 (S10 site Sale) = KHÔNG code, chỉ biên bản. Giữ SALE_SITE_ENABLED OFF, không xoá gì.
```

---

## 3. ĐẶC TẢ TỪNG LÔ

### L0 — Nền cấu hình + mở cổng CI (S9-B4, S9-B5, hạ tầng cho S1/S7)

**TEST VIẾT TRƯỚC**
- `lib/flags.test.ts` *(tạo mới nếu chưa có; đặt trong `lib/**` để glob `vitest.config.ts:14` phủ sẵn)*
  - `it("isZalocrmEnabled mặc định OFF khi env vắng")`
  - `it("chỉ chuỗi 'true' mới bật — 'True'/'1'/'yes' vẫn OFF")`
  - `it("isInboxEnabled cùng khuôn === 'true'")`
- `lib/settings/registry.test.ts` *(bổ sung ca, nếu file chưa có thì tạo)*
  - `it("zalocrm.orgCodes có mặt trong registry — getSetting không ném Unknown setting key")`
  - `it("zalocrm.idleAlertHours default = 2")`
  - `it("inbox.zaloCaNhanLive schema là z.boolean — chuỗi 'true' KHÔNG hợp lệ")` ← chống bẫy `resolveSendMode` (`lib/integrations/fail-safe.ts:37`) trả `SETTING_UNREADABLE`

**TẠO**
- *(không tạo file nguồn mới)*

**SỬA**
| File | Chỗ | Nội dung |
|---|---|---|
| `lib/flags.ts` | cuối file, sau `isOmicallEnabled()` (dòng cuối hiện tại) | `export function isZalocrmEnabled() { return process.env.ZALOCRM_ENABLED === "true"; }` + `export function isInboxEnabled() { return process.env.INBOX_ENABLED === "true"; }`. JSDoc dài theo văn phong file: OFF nghĩa là gì cụ thể, vì sao `=== "true"` chứ không `!== "false"`, cách rollback |
| `lib/settings/registry.ts` | union `SettingGroup` (:19-41) + khối `inbox` (:677-692) | Thêm nhóm `"zalocrm"` **hoặc** tái dùng `"inbox"`; khai 3 key: `zalocrm.orgCodes` (`z.record(z.string())`, default `{}`), `zalocrm.idleAlertHours` (`z.number()`, default `2`), `inbox.zaloCaNhanLive` (`z.boolean()`, default `false`). Sửa luôn chú thích `:669` đang nhắc `INBOX_ENABLED` "trong lib/flags.ts" — nay đúng thật |
| `.env.example` | cạnh khối OmiCall (:286-298) | Khối `ZALOCRM_*`: `ZALOCRM_ENABLED`, `ZALOCRM_BASE_URL`, `ZALOCRM_APP_URL`, `ZALOCRM_SSO_SECRET`, `ZALOCRM_WEBHOOK_SECRETS` (JSON theo orgCode), `ZALOCRM_API_KEYS`, `INBOX_ENABLED`. Mỗi dòng một chú thích; **không** ghi giá trị thật |
| `.github/workflows/ci.yml` | ngay sau dòng `192` (`run: pnpm test:lead-intake`) trong job `chat-db-tests` | ```yaml\n      - name: Run inbox DB tests\n        run: pnpm test:inbox-db\n``` |

**Bẫy**
- `getSetting("zalocrm.orgCodes")` **ném** nếu quên khai registry (`lib/settings/service.ts:63`) → sập cả Server Component, không phải chỉ một khối.
- Cache setting `revalidate: 300` (5 phút), không phải 60s như JSDoc đầu `service.ts` nói. Đừng hứa "tắt gấp trong vài giây".
- Job `chat-db-tests` đã có Postgres + `prisma migrate deploy` (:169) + `seed-roles` (:175) → không cần job mới.

---

### L1 — Schema: enum `ZALO_CA_NHAN`, bảng `ZaloCrmNick`/`ZaloCrmThread`, phân loại scope (S3 phần DB) + S9-B1

**TEST VIẾT TRƯỚC**
- `lib/db-scope.test.ts` — bộ `[A0-04-T12-01]` (:221) tự bắt; thêm ca tường minh:
  - `it("[ZC-DB-01] ZaloCrmNick nằm trong SCOPE_EXEMPT, không trong SCOPED_MODELS")`
  - `it("[ZC-DB-02] hai tập SCOPED_MODELS và SCOPE_EXEMPT vẫn rời nhau")` *(đã có :232, chỉ chạy lại)*
- `lib/org/center-bridge.test.ts` *(hoặc bổ sung `tests/e2e/a0/orgunit-dual-write.spec.ts` `[US-07-IT-08b]`)*
  - `it("[ZC-DB-03] ZaloCrmNick/ZaloCrmThread đã khai BACKFILL_SPECS — findUnclassifiedTables không trả về chúng")`
- `lib/integrations/zalocrm/kenh.test.ts` *(mới, thuần)*
  - `it("[ZC-DB-04] KENH_HOP_LE chứa đủ mọi giá trị InboxChannel")` ← lưới thay cho typecheck (mảng không được kiểm)
  - `it("[ZC-DB-05] NHAN_KENH có nhãn tiếng Việt cho ZALO_CA_NHAN")`
- `tests/inbox/hop-thu.spec.ts` — bổ sung `[HT-11b] hai lượt gửi CÙNG nội dung trong cùng hội thoại vẫn tạo hai dòng` *(B1 — phải đỏ trước khi sửa client)*

**TẠO**
```
prisma/migrations/<ts>_zalocrm_enum_kenh_ca_nhan/migration.sql      ← CHỈ ALTER TYPE, không gì khác
prisma/migrations/<ts+1>_zalocrm_bang_nick_thread/migration.sql     ← CREATE TABLE + index + RLS
lib/integrations/zalocrm/kenh.ts                                     ← hằng KENH (nếu tách ra khỏi page)
lib/integrations/zalocrm/kenh.test.ts
```

Nội dung migration 1 (đúng khuôn `20260811020000_nen_p1_us05_orgunit_type_region/migration.sql:3-11`):
```sql
-- File này CHỈ được chứa ALTER TYPE. Postgres chạy mỗi migration trong MỘT transaction
-- và cấm dùng giá trị enum vừa thêm trong chính transaction đó. ADD VALUE KHÔNG đảo ngược được.
ALTER TYPE "InboxChannel" ADD VALUE IF NOT EXISTS 'ZALO_CA_NHAN';
ALTER TYPE "InboxIdentityLinkSource" ADD VALUE IF NOT EXISTS 'EXTERNAL_TAG';
```

Migration 2 — bắt buộc kết bằng:
```sql
ALTER TABLE "ZaloCrmNick"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ZaloCrmThread" ENABLE ROW LEVEL SECURITY;
```
(bảng tạo sau `20260617000000` ra đời với RLS **TẮT**; migration bật hàng loạt chỉ chạy một lần)

**SỬA**
| File | Chỗ | Nội dung |
|---|---|---|
| `prisma/schema.prisma` | `enum InboxChannel` (:9472) | thêm `ZALO_CA_NHAN` + doc-comment |
| `prisma/schema.prisma` | `enum InboxIdentityLinkSource` (:9511) | thêm `EXTERNAL_TAG` — **không** tái dùng `WEBHOOK_PROFILE` (nó là bằng chứng đồng ý `user_submit_info`, :9512) |
| `prisma/schema.prisma` | cuối cụm Inbox | `model ZaloCrmNick` + `model ZaloCrmThread`: cột trần `centerId String?` + `orgUnitId String?`, **không FK** (khuôn `FacebookPageMapping` :799, `CallExtension` :9850), `@@index([centerId])` `@@index([orgUnitId])`, timestamps `@db.Timestamptz(6)`. **Không** cột `phone`/`email` |
| `lib/db-scope.ts` | `SCOPE_EXEMPT` (:178) | thêm `"ZaloCrmNick", "ZaloCrmThread"` + comment nói rõ ai gác thay (`nick-admin.ts` tự lọc theo `actor.visibleCenterIds`). **Không** vào `SCOPED_MODELS` → không phải thêm `case` vào `getModelPrefixes` (:259) |
| `lib/org/center-bridge.ts` | `BACKFILL_SPECS` (:45) | 2 entry `{ model, nullMeaning: "BAT_BUOC", scoped: false, vi }`. `DUAL_WRITE_MODELS` suy tự động (:475) — không sửa nơi thứ hai |
| `components/sale/hop-thu/hop-thu-workspace.tsx` | `NHAN_KENH` (:30) | `ZALO_CA_NHAN: "Zalo cá nhân"` |
| `components/sale/hop-thu/hop-thu-workspace.tsx` | `outboundKey` `useMemo` (:467-470) | **B1**: bỏ `hashNhanh(noiDung)` khỏi khoá; sinh nonce khi mở ô soạn (`useRef(crypto.randomUUID())`, reset sau mỗi lượt gửi thành công). Sửa Ở CLIENT — hợp đồng server (`@@unique([conversationId,outboundKey])`, test `[HT-11]`) giữ nguyên |
| `app/(sale)/sale/hop-thu/page.tsx` | `KENH_HOP_LE` (:31) | thêm `"ZALO_CA_NHAN"` |

**Bẫy**
- Gộp `ALTER TYPE` chung file với migration *dùng* giá trị đó ⇒ `unsafe use of new value` — migration chết giữa chừng trên prod.
- **Agent KHÔNG chạy migration** (luật cứng #4). Viết khối "CHẠY THẾ NÀO" ở đầu file. DB env `test` **chính là DB dev/local** — chạy ở local là hiện ngay trên `test.satarobo.vn`.
- `ZaloCrm*` có `deletedAt` nhưng **không** ở `SOFT_DELETE_MODELS` (`lib/soft-delete.ts:12`) → mọi truy vấn tự thêm `deletedAt: null`.

---

### L2 — Quyền `zalocrm:use` (S6)

> 🔴 **ĐẢO KẾ HOẠCH:** §5 S6 ghi "seed scope **CENTER**". **SAI.** Action dùng làm cổng trang (gọi `checkPermission` không truyền target) phải seed **GLOBAL** ở MỌI RoleDef. `lib/auth/can.ts` case `CENTER`: `if (!target?.centerId) return false` ⇒ trên PROD (RBAC v2 đang bật) mọi vai trừ SUPER_ADMIN bị đá khỏi `/zalo-crm`, còn local (v1 tĩnh) vẫn xanh. Test `lib/auth/rbac-scope.test.ts:82` và `lib/auth/page-gates.test.ts:145` đều đỏ. Cách ly cơ sở **không** đến từ `scopeType` mà từ `scopedDb` / `where` theo `orgUnitId`.

**TEST VIẾT TRƯỚC** — `lib/integrations/zalocrm/quyen.test.ts` *(đặt trong `lib/**`, glob phủ sẵn; khuôn: `tests/goi-dien/bat-bien.test.ts:125-180`)*
- `it("[ZC-Q-01] ALL_ACTIONS và ACTION_REGISTRY đều chứa zalocrm:use")`
- `it("[ZC-Q-02] mọi perm zalocrm:* trong ROLE_SEED có scopeType === 'GLOBAL'")`
- `it("[ZC-Q-03] 4 vai CÓ: SUPER_ADMIN, CENTER_MANAGER, CENTER_CLASS_MANAGER, CENTER_SALES_CSM")`
- `it("[ZC-Q-04] vai KHÔNG có: HO_SALE, TEACHER, CENTER_ACCOUNTANT, HO_HR, PARENT, AUDITOR")`
- `it("[ZC-Q-05] descriptor registry có zalocrm:use với action === 'use'")`
- Chạy lại: `lib/permissions/registry.test.ts`, `lib/auth/rbac-parity.test.ts`, `lib/auth/permissions.test.ts:346`

**SỬA**
| File | Chỗ | Nội dung |
|---|---|---|
| `lib/auth/permissions.ts` | union `Action`, sau `\| "inbox:assign"` (:383) | thêm khối comment + `\| "zalocrm:use";` — **dời dấu `;`** |
| `lib/auth/permissions.ts` | `PERMISSIONS`, cạnh cụm inbox (:854-859) | `"zalocrm:use": ["SUPER_ADMIN", "CENTER_MANAGER", "SALES_CSM"],` — **bắt buộc có SUPER_ADMIN** (`permissions.test.ts:346`) |
| `prisma/seed-roles.ts` | `perms` của 4 RoleDef: SUPER_ADMIN (cạnh :48), CENTER_MANAGER (cạnh :621), CENTER_CLASS_MANAGER (:743 — vai này chưa có perm inbox nào), CENTER_SALES_CSM (cạnh :863) | `{ action: "zalocrm:use", scopeType: "GLOBAL" },` + comment nêu lý do GLOBAL (khuôn có sẵn :854-862) |
| `lib/permissions/registry/crm.ts` | cạnh khối `inbox:` (:50-70) | `{ key: "zalocrm:use", action: "use", scopable: false, description: "Mở màn Zalo CRM nhúng (SSO iframe) và nhắn khách qua nick Zalo cá nhân." }` — `action` **phải** đúng `"use"` (`registry.test.ts:107-112`) |
| `lib/auth/action-labels.ts` | `RESOURCE_LABELS` (:5), `VERB_LABELS` (:51) | `zalocrm: "Zalo CRM"`, `use: "Sử dụng"` (tuỳ chọn, không có test — thiếu thì màn cấp quyền hiện chuỗi thô) |

**Bẫy**
- Bỏ v1 vì "prod chạy v2 rồi" ⇒ local/dev/CI luôn deny (không ai test được) **và** mọi `UserPermissionGrant` mang key này bị vứt im lặng (`lib/auth/actor.ts:367-372` lọc theo `ACTION_REGISTRY`).
- `CENTER_CLASS_MANAGER` **không tồn tại** ở enum `Role` v1 (`schema.prisma:18-28`) → ở local Giáo vụ không vào được `/zalo-crm` dù prod vào được. **Không phải bug.**
- SALES_CSM bị ép **parity tuyệt đối** (`rbac-parity.test.ts:73-77`) — cấp v1 mà quên CENTER_SALES_CSM ở v2 là đỏ ngay.
- `can()` v2 **không có nhánh DENY**. Muốn chặn ai → gỡ `UserOrgRole`, đừng tạo grant DENY.

---

### L3 — Trang `/admin/zalo-crm` + SSO (S1)

**TEST VIẾT TRƯỚC**
- `lib/integrations/zalocrm/sso.test.ts` *(thuần, `jose` đã là dependency trực tiếp — `package.json:87`)*
  - `it("[ZC-SSO-01] claims đủ: sub, orgCode, role, fullName, jti, iat, exp")`
  - `it("[ZC-SSO-02] exp − iat === 60")`
  - `it("[ZC-SSO-03] jti khác nhau giữa hai lần ký")`
  - `it("[ZC-SSO-04] verify bằng secret khác ⇒ ném")`
  - `it("[ZC-SSO-05] thiếu ZALOCRM_SSO_SECRET ⇒ ZalocrmSsoError('MISSING_SECRET'), không ký token rỗng")`
  - `it("[ZC-SSO-06] token không chứa email/SĐT phụ huynh")` — assert trên `JSON.stringify(payload)`
- `lib/integrations/zalocrm/vai-tro.test.ts`
  - `it("[ZC-SSO-07] SUPER_ADMIN/CENTER_MANAGER/CENTER_CLASS_MANAGER ⇒ 'admin'; SALES_CSM ⇒ 'member'; vai khác ⇒ null (fail-closed)")`
- `lib/auth/route-policy.test.ts` — thêm `"zalo-crm"` vào mảng ở `:69-88`; hoặc `it()` riêng theo mẫu `:99-110` để ghim cả `?compose=`
- Chạy lại (bắt buộc xanh): `lib/auth/page-gates.test.ts`, `lib/auth/rbac-scope.test.ts`, `lib/auth/menu-permissions.test.ts`, `components/admin/nav-coverage.test.ts`
- `tests/e2e/a0/zalocrm-gate.spec.ts` *(đi ké job CI `e2e-a0`, ci.yml:308)*
  - `[ZC-E2E-01] SALES_CSM thấy mục "Zalo CRM" trong sidebar`
  - `[ZC-E2E-02] CENTER_ACCOUNTANT không thấy mục và vào /zalo-crm bị đá /dashboard`

**TẠO**
```
app/(admin)/admin/zalo-crm/page.tsx
app/(admin)/admin/zalo-crm/_components/zalocrm-frame.tsx      ← "use client"
lib/integrations/zalocrm/sso.ts        + sso.test.ts
lib/integrations/zalocrm/vai-tro.ts    + vai-tro.test.ts       ← ánh xạ vai, THUẦN
tests/e2e/a0/zalocrm-gate.spec.ts
```

`lib/integrations/zalocrm/sso.ts` — **copy khuôn `lib/chat/realtime-token.ts`** (cùng repo, cùng `SignJWT` HS256, cùng lớp `*Error` mã EN/message VI, cùng kiểm `tokenVersion` chống force-logout):
```ts
export const ZALOCRM_SSO_TTL_SECONDS = 60;
export class ZalocrmSsoError extends Error { code: "MISSING_SECRET"|"USER_NOT_FOUND"|"NO_ORG"|"NO_ROLE" }
export async function mintSsoToken(input: {
  userId: string; tokenVersion: number; orgCode: string;
  role: "admin"|"member"; fullName: string; email?: string|null;
}): Promise<{ token: string; expiresAt: Date }>
```
Ký bằng `ZALOCRM_SSO_SECRET`; `jti = crypto.randomUUID()`; **không** đưa SĐT phụ huynh vào claims.

**SỬA**
| File | Chỗ | Nội dung |
|---|---|---|
| `lib/auth/page-gates.ts` | object `PAGE_GATES`, trước `} as const satisfies` (:271) | `"/zalo-crm": ["zalocrm:use"],` + chú thích lý do (văn phong các ô khác) |
| `lib/auth/route-policy.ts` | `ADMIN_ROUTE_SEGMENTS` (:107) | thêm `"zalo-crm",` + chú thích *"thiếu dòng này thì admin host 308 sang public rồi 404"* |
| `components/admin/sidebar.tsx` | nhóm "CSKH & Phụ huynh" (:215-236), chèn giữa :218 và :223 | `{ label: "Zalo CRM", href: "/zalo-crm", icon: MessageSquareText, perm: [...PAGE_GATES["/zalo-crm"]], flag: "zalocrm" },` — **giữ đúng thứ tự trường** `label→href→icon→perm`, không chèn `}` xen giữa (regex test `page-gates.test.ts:73,79` cứng) |
| `components/admin/sidebar.tsx` | union `flag` (:91), props (:389-406), biểu thức lọc (:416-428) + mảng dep của `useMemo` | thêm `\| "zalocrm"`, prop `zalocrmEnabled = false`, vế `\|\| (it.flag === "zalocrm" && zalocrmEnabled)` |
| `components/admin/sidebar.tsx` | khối import `lucide-react` (:6-71) | thêm icon, giữ alphabet |
| `app/(admin)/admin/layout.tsx` | import (:18-23) + `<Sidebar …/>` (:117-124) | `zalocrmEnabled={isZalocrmEnabled()}` |
| `next.config.ts` | `frame-src` (:18) | `"frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com https://zalo.satarobo.vn"` |

`page.tsx` — khuôn `app/(admin)/admin/hoi-thoai/page.tsx`:
```ts
export const metadata = { title: "Zalo CRM | Admin" };
export const dynamic = "force-dynamic";
export default async function ZaloCrmPage({ searchParams }: {
  searchParams: Promise<{ compose?: string; lead?: string; org?: string }>;
}) {
  if (!isZalocrmEnabled()) notFound();
  const session = await auth();
  if (!session?.user?.id) redirect("/login?callbackUrl=%2Fzalo-crm");
  if (!(await checkAnyPermission(PAGE_GATES["/zalo-crm"]))) redirect("/dashboard?error=unauthorized");
  const sp = await searchParams;                   // Next 16: BẮT BUỘC await
  const actor = await resolveActor(session.user.id);
  ...
}
```
Chuỗi `PAGE_GATES["/zalo-crm"]` **phải xuất hiện nguyên văn** trong file này (`page-gates.test.ts:114`).

Khung iframe — copy đúng chuỗi lớp của `components/chat/staff/chat-workspace.tsx:113-123`:
```tsx
<div className="flex h-[calc(100vh-8rem)] min-h-[32rem] flex-col">
  <iframe src={src} className="min-h-0 flex-1 rounded-xl border border-border" />
</div>
```
`h-`, **không** `min-h-`; con trực tiếp cần `min-h-0`. 8rem = topbar 4rem + `p-6` trên/dưới của `<main>` (`layout.tsx:137`).

`zalocrm-frame.tsx` — `appOrigin` truyền **bằng prop từ server** (mẫu `_spike/omicall/page.tsx:47,63`), listener `message` kiểm `event.origin === appOrigin` trước khi làm gì.

**Bẫy**
- CSP đang là `Content-Security-Policy-Report-Only` (`next.config.ts:38`) — **không chặn gì**. Thứ chặn thật là header của chính ZaloCRM (F3, bên fork). Sửa `frame-src` là để đúng hồ sơ.
- `Permissions-Policy` (:37) **ENFORCE** và tắt camera/mic cho cả iframe con. Nếu ZaloCRM có ghi âm thoại thì phải sửa `:37` **và** đặt `allow="microphone"` trên thẻ iframe.
- Không có test nào ghim nội dung CSP — sửa nhầm không đỏ CI.
- Redirect dùng `/dashboard` (không `/admin/dashboard`) — admin host phục vụ ở ROOT.
- `import { db } from "@/lib/db"` trần trong `app/(admin)/**` = **ESLint error**. Đi qua `scopedDb(actor)`.
- Tạo `page.tsx` mà chưa gắn mục sidebar ⇒ `components/admin/nav-coverage.test.ts:110` đỏ. Đừng vá bằng ALLOWLIST.

---

### L4 — Nút "Nhắn Zalo" trên phiếu lead (S2)

> Kế hoạch ghi `[main] …page.tsx:115, :266`. **Thực tế trên nhánh này: `:134` (canViewPii) và `:316-326` (khối SĐT).** Sửa mù theo số dòng kế hoạch sẽ chèn nhầm chỗ.

**TEST VIẾT TRƯỚC** — `lib/integrations/zalocrm/compose-url.test.ts` *(thuần)*
- `it("[ZC-CU-01] SĐT '0912345678' ⇒ /zalo-crm?compose=84912345678&lead=<id>")`
- `it("[ZC-CU-02] SĐT dạng '84…' cho cùng kết quả")`
- `it("[ZC-CU-03] Lead.phone chuỗi RỖNG ⇒ null (không dựng URL)")`
- `it("[ZC-CU-04] số cố định / rác ⇒ null")`
- `lib/lead/lead-pii-callsites.test.ts` — thêm ca `[S-1b] nút Nhắn Zalo không truyền piiLead.phone`: quét file, `expect(khoiNut).not.toMatch(/piiLead/)`

**TẠO**
```
lib/integrations/zalocrm/compose-url.ts   + compose-url.test.ts
(tuỳ chọn) app/(admin)/admin/leads/[id]/_components/nhan-zalo-button.tsx
```

**SỬA** — `app/(admin)/admin/leads/[id]/page.tsx`, **hai chỗ duy nhất**:
1. Cạnh `:134` (`const canViewPii = await canViewLeadPii();`): thêm
   ```ts
   const urlNhanZalo = canViewPii ? duongDanNhanZalo(lead.phone, lead.id) : null;
   ```
2. Khối `:316-326`: bọc `<span className="inline-flex items-center gap-2">`, đặt `<Link>` **trong nhánh `canViewPii ? (...)`** và chỉ render khi `urlNhanZalo !== null`. Copy khuôn class của nút "Sửa" (:341-348).

Nếu cần gác thêm `zalocrm:use`: chấm ở **server** `await checkPermission("zalocrm:use", { centerId: lead.centerId })` rồi truyền boolean — **không** so vai/centerId trong JSX (ESLint `no-inline-authz`).

**Bẫy**
- `Lead.phone` là `String` NOT NULL nhưng **được phép rỗng** (`schema.prisma:1453-1457`) — lead Facebook chỉ có link FB. Render vô điều kiện ⇒ `?compose=` rỗng ⇒ ZaloCRM ăn một `PhoneSearchEvent` vô nghĩa tính vào hạn mức Zalo.
- Canonical là `84XXXXXXXXX` — **không** dấu `+`, **không** `0` đầu. `formatPhoneVN` (`0…`) chỉ để HIỂN THỊ.
- Trang này **không** nằm trong `MAN_ADMIN` của `lead-pii-callsites.test.ts:114-141` ⇒ không có lưới tự động. Tự kỷ luật: hiển thị lấy từ `piiLead`, gửi đi lấy từ `lead.*` nhưng chỉ trong nhánh `canViewPii`.

---

### L5 — Form nhập khách điền sẵn (S1 chiều chat → lead)

**TEST VIẾT TRƯỚC** — `components/lead-intake/quick-lead-form.test.tsx` *(hoặc `lib/lead/intake/prefill.test.ts` nếu tách hàm thuần)*
- `it("[ZC-PF-01] initial.phone điền sẵn vào ô SĐT")`
- `it("[ZC-PF-02] initial rỗng ⇒ form giống hệt EMPTY")`
- `it("[ZC-PF-03] SĐT trong query không hợp lệ ⇒ ô để trống, không đổ chuỗi rác")`

**SỬA**
| File | Chỗ | Nội dung |
|---|---|---|
| `components/lead-intake/quick-lead-form.tsx` | chữ ký (:38) + `useState` (:39) | thêm `initial?: Partial<typeof EMPTY>`; `useState({ ...EMPTY, ...initial })`. Quyết định reset (:97): giữ reset về `EMPTY` (luồng "nhập tiếp") — ghi rõ trong comment |
| `app/(admin)/admin/nhap-khach-hang/page.tsx` | chữ ký hàm (:33) | thêm `searchParams: Promise<Record<string, string \| string[] \| undefined>>`, `const sp = await searchParams`, truyền `initial={{ phone: canonicalPhone(sp.phone) ? formatPhoneVN(sp.phone) : "", parentName: typeof sp.name === "string" ? sp.name : "" }}` |
| `app/(sale)/sale/nhap-khach-hang/page.tsx` | tương tự (:24) | **bắt buộc sửa kèm** — kẻo hai biểu mẫu trôi lệch |

**Bẫy**
- `lib/lead/intake/quick-form-action.ts` là `"use server"` — **chỉ được export hàm async**. Type/hằng để ở `lib/validators/internal-lead.ts`. Thêm `export const` ở đó = ReferenceError lúc chạy, giết toàn bộ action trong module (E352, đã xảy ra thật).
- Nếu thêm ô mới (`zcrmContactId`) phải sửa **ba** chỗ: `lib/validators/internal-lead.ts` + `lib/lead/intake/map-internal-form.ts` + form.
- `/nhap-khach-hang` hiện **không nhận query param nào** → kế hoạch S1 `router.push('/nhap-khach-hang?phone=…')` sẽ im lặng không điền gì nếu bỏ lô này.

---

### L6 — Sửa lõi hộp thư: B2, B3, B6 + `ganDonViTheoNick` (S9 phần inbox + S4 b/d)

**TEST VIẾT TRƯỚC**
- `tests/inbox/zalocrm.spec.ts` *(mới; glob `tests/inbox/**` đã có trong `vitest.config.ts:33`; dòng 1 phải là `// @vitest-environment node`; tiền tố riêng `const P = "ZCRM_"` — **đừng** dùng lại `HTDK_`; cổng 2 tầng `RUN` + `CO_BANG` copy `hop-thu.spec.ts:19-47`; **không** `resetDb()`)*
  - `[ZC-17] ganNguoiPhuTrach ⇒ hội thoại hết mồ côi (orgUnitId của người phụ trách lan xuống)`  ← B2
  - `[ZC-05] QLCS CS2 không thấy hội thoại đã gán về CS1`
  - `[ZC-03] SĐT khớp đúng-một lead CÙNG cơ sở mới nối; lead cơ sở khác ⇒ KHONG_KHOP_LEAD`  ← B3
  - `[ZC-15] nối lead ⇒ orgUnitId lan đủ 3 bảng (identity, conversation, message)`
  - `[ZC-B6] echo về trước khi bước 3 chạy ⇒ KHÔNG P2002, không dòng OUT thứ hai`  ← B6
- `lib/inbox/identity-rules.test.ts` — bổ sung ca lọc theo `orgUnitId` (thuần)
- `lib/inbox/cong-truy-cap.test.ts` — chạy lại, phải xanh (file mới `don-vi.ts` nằm trong `lib/inbox/` nên hợp lệ)

**TẠO**
```
lib/inbox/don-vi.ts        ← ganDonViTheoNick(identityId|conversationId, orgUnitId) — lan 3 bảng
lib/inbox/don-vi.test.ts
```

**SỬA**
| File | Hàm/dòng | Nội dung |
|---|---|---|
| `lib/inbox/thao-tac.ts` | `ganNguoiPhuTrach` (:88), khối `data` (:93-97) | **B2**: nạp `orgUnitId` của người được gán (qua `User.centerId` → `orgUnitIdForCenter`) và ghi xuống identity/conversation/message trong cùng `$transaction`, tái dùng khuôn `noiIdentityVaoLead` (`identity.ts:77-101`). **Không viết bản thứ hai của phép lan** |
| `lib/inbox/scope.ts` | chú thích `:24` | Sửa câu *"hết mồ côi ngay khi được nối Lead **HOẶC được gán người phụ trách**"* — vế sau đang SAI với mã; sau B2 mới đúng |
| `lib/inbox/identity.ts` | `timLeadTheoSdt` (:24) | **B3**: đổi chữ ký `(sdt: unknown, orgUnitId?: string \| null)`; `where: { phone: { in: phoneVariants(sdt) }, deletedAt: null, ...(orgUnitId ? { OR: [{ orgUnitId }, { orgUnitId: null }] } : {}) }`. **GIỮ `take: 2`**, **GIỮ `db` trần** (chú thích cố ý :7-11: chạy từ webhook, không actor), **GIỮ `phoneVariants`** |
| `lib/inbox/identity.ts` | `thuNoiTheoSdt` (:42) | truyền `orgUnitId` xuống |
| `lib/inbox/send.ts` | bước 3 (:112-126) | **B6**: tách làm hai lệnh — `update` cho `deliveryStatus/providerMessageId/errorCode`, rồi `updateMany({ where: { id: tinId, channelMessageId: null }, data: { channelMessageId: so.providerMessageId } })`; bọc `try/catch` ghi log, không để ném ra action |
| `lib/inbox/queries.ts` | nếu thêm truy vấn đọc | **phải** gọi một bộ dựng where (`dungWhere`/`whereMotHoiThoai`/`whereDem`) hoặc đặt biến tên tường minh rồi khai vào `NGOAI_LE` — test `cong-truy-cap.test.ts:89-137` đếm số truy vấn khớp `where: <định danh>` |

**Bẫy**
- Đổi `timLeadTheoSdt` sang `scopedDb` ⇒ **webhook không nối được lead nào** (không có actor). Cùng bài học `lib/payments/method-lookup.ts`.
- `inboxOrgScopeWhere` trả một mảnh `OR` — gộp bằng `AND`, **cấm trải phẳng** (một `OR` khác sẽ nuốt).
- `actor.visibleOrgUnitIds` có thể thiếu ở Actor dựng tay (~35 chỗ) — luôn `?? []`; và `{ in: [] }` khớp 0 dòng, **đừng "tối ưu"** bằng cách bỏ điều kiện khi mảng rỗng.
- File ngoài `lib/inbox/` chạm `db.inbox*` ⇒ `cong-truy-cap.test.ts:63` đỏ. Vá bằng cách thêm vào `DUOC_PHEP` là **một quyết định**, không phải thủ tục.
- `danhDauDaDoc` (`thao-tac.ts:205`) hiện **không ai gọi** — huy hiệu chưa đọc không bao giờ giảm khi chỉ mở ra đọc. Quyết định mở (xem §4).

---

### L8 — Dòng thời gian lead + SLA (S5)

> Viết **trước** L7 để L7 chỉ việc gọi.

**TEST VIẾT TRƯỚC** — `lib/integrations/zalocrm/lead-timeline.test.ts` *(thuần cho phần luật) + ca DB trong `tests/inbox/zalocrm.spec.ts`*
- `it("[ZC-08a] lead có chủ, người gửi là chủ phiếu ⇒ MESSAGE, lamMoiDongHo=true")`
- `it("[ZC-08b] lead có chủ, người gửi khác, không quyền điều phối ⇒ MESSAGE, lamMoiDongHo=false")`
- `it("[ZC-08c] lead CHƯA GIAO ⇒ NOTE với metadata SYSTEM_ACTIVITY_META, KHÔNG phải MESSAGE")`
- `it("[ZC-08d] TIN ĐẾN ⇒ KHÔNG ghi LeadActivity nào")`
- `it("[ZC-08e] content = '[Zalo] <nội dung>', metadata = { platform: 'Zalo', content, via: 'zalocrm', inboxMessageId }")`
- Chạy lại: `lib/lead/activity-write.test.ts` `[N-4]` (:421) và `[S-9]` (:602)

**TẠO**
```
lib/integrations/zalocrm/lead-timeline.ts  + lead-timeline.test.ts
```
```ts
export async function ghiMocNhanTinLead(input: {
  leadId: string; inboxMessageId: string; noiDung: string;
  sentByUserId: string | null; actorName: string;
  assignedToId: string | null; coQuyenDieuPhoi: boolean;
}): Promise<void>
```
Bên trong: `db.$transaction(tx => recordLeadActivity({ tx, ... }))`. `lamMoiDongHo` tính bằng `duocLamMoiDongHoChamSoc` (`lib/lead/sla-clock.ts:67`) — **không** gõ điều kiện tại chỗ. Đường webhook không có phiên ⇒ `coQuyenDieuPhoi: false`, chỉ dựa `assignedToId === userId`.

**SỬA**
| File | Chỗ | Nội dung |
|---|---|---|
| `lib/lead/activity-write.test.ts` | `duocPhep` (:608) | thêm `path.join("lib","integrations","zalocrm","lead-timeline.ts")` — không thêm là `[S-9]` đỏ ngay lượt chạy đầu |

**Bẫy**
- Ghi `MESSAGE` **đóng vĩnh viễn** `Lead.firstContactAt` (`activity-write.ts:110-127`, `updateMany where firstContactAt: null`, **không có undo**) ⇒ tắt cảnh báo SLA-3 của phiếu chưa ai nhấc máy.
- Ghi `MESSAGE` cho lead **chưa giao** còn khoá luôn tự chia (`hasSaleInteraction`, `lib/lead/auto-assign.ts:56-68`). Đó là lý do luật S-9 bắt ca này ghi `NOTE {system:true}`.
- **Tuyệt đối không** viết `tx.leadActivity.create` ở module mới — `[N-4]` quét đệ quy `lib/` + `app/`.
- `recordLeadActivity` bắt buộc nhận `tx` và **cấm bọc `.catch()`**.

---

### L7 — Webhook receiver + dịch payload (S3, S4a)

**TEST VIẾT TRƯỚC**
- `lib/integrations/zalocrm/dich-payload.test.ts` *(thuần; khuôn `tests/goi-dien/cdr.test.ts` — kết quả `{ok:true, tin} | {ok:false, ma, thongDiep}`, **không bao giờ throw** trên dữ liệu lạ)*
  - `[ZC-DP-01] payload message.received đủ trường ⇒ TinDenNgoai đúng`
  - `[ZC-DP-02] channelMessageId có prefix org: '<orgCode>:<messageId>'`
  - `[ZC-DP-03] accountId = zaloAccountId của nick, KHÔNG phải hằng 'zalocrm'`
  - `[ZC-DP-04] thiếu messageId ⇒ {ok:false}, không bịa khoá`
  - `[ZC-DP-05] threadType = group ⇒ bỏ qua (chốt 9.6)`
- `lib/integrations/zalocrm/duc-payload.test.ts`
  - `[ZC-DU-01] content bị thay bằng { len, sha256 } — không còn nguyên văn`
  - `[ZC-DU-02] contact.phone bị đục`
  - `[ZC-DU-03] messageId/threadId/orgCode giữ nguyên để đối soát`
- `lib/integrations/zalocrm/webhook.test.ts`
  - `[ZC-WH-01] thiếu ZALOCRM_WEBHOOK_SECRETS trên NODE_ENV=production ⇒ 503, KHÔNG tạo WebhookDelivery`
  - `[ZC-WH-02] chữ ký RỖNG ⇒ 401` ← **đảo nhánh fail-open của OmiCall**
  - `[ZC-WH-03] chữ ký sai ⇒ 401`
  - `[ZC-WH-04] org lạ ⇒ 404 + console.warn + IntegrationLog FAILED`
  - `[ZC-WH-05] quá 600/phút ⇒ 429`
  - `[ZC-WH-06] content-length > 100_000 ⇒ 413`
  - `[ZC-WH-07] ingest trả duplicate ⇒ markWebhookDelivery DUPLICATE, HTTP 200`
  - `[ZC-WH-08] lỗi DB (Prisma ném) ⇒ 5xx để outbox fork retry` ← **khác OmiCall**
- `lib/integrations/zalocrm/bat-bien.test.ts` — **bản song sinh** của `tests/goi-dien/bat-bien.test.ts:253-299`: đọc mã nguồn `lib/integrations/zalocrm/webhook.ts`, assert 7 chuỗi xuất hiện theo thứ tự tăng dần (`rateLimit(` → `content-length` → tra config → `req.text()` → `kiemChuKy` → `logWebhookDelivery(` → `markWebhookDelivery(`) + `req.text()` xuất hiện **đúng một lần**. Cắt từ chỗ **định nghĩa hàm** trở đi, dùng helper lọc chú thích kiểu `chiMa`.
- `tests/inbox/zalocrm.spec.ts` — `[ZC-01] tin trùng channelMessageId không cộng unreadCount`

**TẠO**
```
lib/integrations/zalocrm/types.ts          ← hình dạng payload, kiểu thuần
lib/integrations/zalocrm/dich-payload.ts   ← THUẦN, không server-only, không db
lib/integrations/zalocrm/duc-payload.ts    ← THUẦN — hàm đục PII PHẢI VIẾT MỚI, repo chưa có
lib/integrations/zalocrm/webhook.ts        ← 7 bước, copy lib/calls/webhook.ts (161 dòng)
lib/integrations/zalocrm/config.ts         ← providerKeyForOrg, đọc IntegrationConfig
lib/integrations/zalocrm/log.ts            ← ghiNhatKyZalocrm → IntegrationLog
lib/integrations/zalocrm/client.ts         ← gọi API fork, tự AbortController 10s
app/api/webhooks/zalocrm/[org]/route.ts    ← vỏ mỏng, copy omicall/cdr/route.ts (22 dòng)
+ 4 file .test.ts nêu trên
```

`webhook.ts` — copy `lib/calls/webhook.ts` rồi sửa **đúng 6 chỗ**:
1. `const NGUON = "zalocrm"`; `source` ghi vào `WebhookDelivery` là `` `zalocrm:${org}` `` (bảng không có cột org).
2. Chữ ký `xuLyWebhookZalocrm(req: Request, org: string)`.
3. B1: `rateLimit({ key: \`webhook:zalocrm:${org}:${ip}\`, max: 600, windowMs: 60_000 })` — **kèm org**, không chỉ IP (ZaloCRM qua một Cloudflare Tunnel ⇒ CS1+CS2+TEST cùng một IP nguồn).
4. B3+B5 gộp: thay `kiemBiMatWebhook` bằng `traCauHinhOrg(org)` — kiểm `/^[a-z0-9-]{1,32}$/` **trước** khi tra DB; không thấy / `isEnabled===false` ⇒ 404 + `console.warn` + `IntegrationLog FAILED`. **BỎ nhánh `if (!secret) return { ok: true }`** (`lib/calls/webhook.ts:79`) — đó là ngoại lệ riêng của OmiCall, chép sang là mở toang cửa. Giữ `safeEqual` từ `@/lib/security/safe-equal` (đừng đẻ bản thứ tư).
5. B4: `await req.text()` **đúng một lần**.
6. B6: `logWebhookDelivery({ source, externalId: messageId, payload: ducPayload(payload) })`; B7: `duplicate ? "DUPLICATE" : "PROCESSED"`, lỗi ⇒ `"FAILED"` + `String(e).slice(0,1000)`.

`route.ts`:
```ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(req: NextRequest, { params }: { params: Promise<{ org: string }> }) {
  if (!isZalocrmEnabled()) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  const { org } = await params;                       // Next 16: params là Promise
  const kq = await xuLyWebhookZalocrm(req, org);
  return NextResponse.json(kq.body, { status: kq.httpStatus });
}
```

**Bẫy**
- Route **không được** tự query `db.inbox*` (`cong-truy-cap.test.ts:63`) — chỉ gọi hàm trong `lib/inbox/`.
- `@@unique([channel, channelMessageId])` **không kèm accountId** ⇒ nếu id tin chỉ duy nhất trong phạm vi một nick, tin của nick B mang cùng id **bị nuốt im lặng** (`duplicate:true`, không lỗi, không log). **Bắt buộc prefix `${orgCode}:${messageId}`.**
- `logWebhookDelivery` ghi payload **nguyên văn** — không có hàm đục nào trong repo. Đục **trước** khi gọi.
- `IntegrationConfig.provider` là `String @unique` **toàn cục**, `settings` là `Json` không kiểu → tự narrow bằng hàm thuần `parseConfig(settings: unknown)` trả `null` khi thiếu trường (khuôn `lib/payments/vietqr.ts:30-34`). **Secret để ở env**, không vào `settings` (luật cứng #9; `settings` lưu plaintext, vào mọi bản `pg_dump`).
- Đừng dùng `source = "zalo"` — đã bị webhook Zalo OA chiếm (`lib/lead/webhook.ts:21`), replay/báo cáo sẽ trộn nguồn.
- `WebhookDelivery` **không có @@unique nào** ⇒ không chống trùng được. Idempotency ở `InboxMessage`.
- HMAC tính trên chuỗi đã giải mã UTF-8 (`.update(rawBody,"utf8")`) — byte không hợp lệ thành U+FFFD ⇒ 401 ngẫu nhiên trên tin có emoji. Nói rõ với bên fork: ký trên **chính chuỗi JSON đã serialize**.
- Màn "Webhook lỗi — Replay" (`app/(admin)/admin/crm/webhook-replay/page.tsx:22`) hiện **mọi nguồn** cho ai có `settings:edit`, không cách ly cơ sở. **Đừng nhét mẩu payload vào `errorMessage`.**

---

### L9 — Màn Tích hợp + đồng bộ nick (S7)

**TEST VIẾT TRƯỚC**
- `lib/integrations/zalocrm/nick-admin.test.ts`
  - `[ZC-NA-01] danh sách nick lọc theo actor.visibleCenterIds (SCOPE_EXEMPT ⇒ scopedDb KHÔNG giúp)`
  - `[ZC-NA-02] QLCS CS1 không thấy nick CS2`
  - `[ZC-NA-03] mọi đường GHI tự gác (QLCS CS1 không sửa được nick CS2)`
  - `[ZC-NA-04] cảnh báo "connected mà >24h không sự kiện"`
- `lib/integrations/zalocrm/log.test.ts` — `[ZC-LG-01] contact.phone bị đục khỏi requestPayload`

**TẠO**
```
app/(admin)/admin/tich-hop/_components/zalocrm-section.tsx   ← "use client", export type row
lib/integrations/zalocrm/nick-admin.ts + .test.ts
```

**SỬA**
| File | Chỗ | Nội dung |
|---|---|---|
| `app/(admin)/admin/tich-hop/page.tsx` | `Promise.all` đầu hàm (:39-52) + JSX giữa khối Zalo OA (:160-221) và MISA (:223-281) | fetch `sdb.integrationLog.findMany({ where: { provider: { startsWith: "ZALOCRM" } }, orderBy: { createdAt: "desc" }, take: 30, select: {...} })` — **luôn có `where.provider`** để ăn index `[provider,status,createdAt]`; render `<ZalocrmSection canEdit={canEdit} … />` |
| `app/(admin)/admin/tich-hop/_actions.ts` | thêm hàm vào **file có sẵn**, không tạo file mới | khuôn 4 bước: `auth()` → `checkPermission("settings:edit")` → gate cờ `isZalocrmEnabled()` → zod `safeParse` → gọi lib + `revalidatePath("/admin/tich-hop")` |

**Bẫy**
- `IntegrationLog`/`IntegrationConfig` **không** ở `SCOPED_MODELS`/`SCOPE_EXEMPT`/`NULL_IS_GLOBAL_MODELS` ⇒ `scopedDb` cho đi qua nguyên vẹn, **không cách ly cơ sở**. Lọc tay theo `actor.visibleCenterIds`.
- Enum `IntegrationStatus` **không có `SENT`** — `SENT` trên màn Tích hợp là của `ZaloMessageLog`. Ghi `status:"SENT"` = lỗi Prisma lúc chạy.
- `revalidatePath` phải là `"/admin/tich-hop"` (CÓ tiền tố), trong khi `href`/`redirect` **không** có. Hai quy ước ngược nhau trong cùng màn.
- `sdb.integrationLog` — không được `import { db }` trần trong `app/(admin)/**`.
- Không có HTTP client dùng chung trong repo → `client.ts` tự `AbortController` 10_000ms. **Đừng** tạo helper chung trong PR này.

---

### L10 — Pháp lý nền (S8)

**TEST VIẾT TRƯỚC** — `lib/lead/ingest.test.ts` *(bổ sung)*
- `[ZC-CS-01] webhook không có ô đồng ý ⇒ consentMarketing = false`
- `[ZC-CS-02] form có ô tích ⇒ consentMarketing = true`
- `[ZC-CS-03] không đường nào ghi cứng true`

**SỬA**
| File | Chỗ | Nội dung |
|---|---|---|
| `lib/lead/ingest.ts` | `:66` | `consentMarketing: true` → giá trị thật từ nguồn; webhook không có ô ⇒ `false` |
| `app/(public)/chinh-sach-bao-mat/page.tsx` | nội dung | cập nhật theo NĐ 13/2023 |

Hoàn toàn độc lập — có thể merge trước cả L0.

---

### L11 — Cron dọn `WebhookDelivery` / `DomainEvent` (S9-B7)

**TEST VIẾT TRƯỚC** — `lib/compliance/webhook-retention.test.ts`
- `[ZC-18a] dòng > 30 ngày bị xoá, dòng mới giữ`
- `[ZC-18b] chỉ xoá DomainEvent status PROCESSED, không đụng PENDING/FAILED`
- `[ZC-18c] idempotent — chạy hai lần cho cùng kết quả`
- `[ZC-18d] trả về số dòng xoá để ghi IntegrationLog`

**TẠO**
```
lib/compliance/webhook-retention.ts + .test.ts
app/api/cron/webhook-retention/route.ts        ← withCron + CRON_SECRET
```

**SỬA**
| File | Chỗ | Nội dung |
|---|---|---|
| `vercel.json` | mảng crons (đang **đúng 26** mục `"path"`) | mục thứ **27** — kiểm hạn mức gói Vercel **trước** khi thêm |
| `.github/workflows/cron-pump-test.yml` | vòng lặp endpoint | thêm endpoint mới — Vercel Cron **không chạy** trên env `test` |

---

## 4. QUYẾT ĐỊNH KỸ THUẬT CÒN MỞ — người viết code phải chọn

| # | Câu hỏi | Lựa chọn | **Khuyến nghị** |
|---|---|---|---|
| **Q1** | `zalocrm:use` seed `GLOBAL` hay `CENTER`? | kế hoạch ghi CENTER | **GLOBAL.** Không phải lựa chọn — CENTER làm 2 test đỏ và khoá cửa prod. Sửa luôn dòng đó trong kế hoạch. |
| **Q2** | `ZaloCrmNick/Thread` mang `centerId`+`orgUnitId`, hay chỉ `orgUnitId`? | A: chỉ `orgUnitId` (luật cứng #3, tiền lệ `Inbox*`) · B: cả hai (`SCOPE_EXEMPT`) | **B.** Đây là bảng ÁNH XẠ hạ tầng, cùng loại `FacebookPageMapping`/`CallExtension`. Đường B có lưới test tự động (`[A0-04-T12-01]`, `[US-07-IT-08b]`); đường A **không có lưới nào** và bắt viết thêm một bộ scope thủ công thứ hai. Ghi comment nêu rõ ngoại lệ với luật #3. |
| **Q3** | Webhook secret ở env hay `IntegrationConfig.settings`? | | **env `ZALOCRM_WEBHOOK_SECRETS`** (JSON theo `orgCode`). `settings` lưu **plaintext**, đi vào mọi `pg_dump` và mọi bản sao DB dev/test — vi phạm luật cứng #9. `settings` chỉ giữ `isEnabled`, `orgCode → centerId`, `webhookUrl`, mốc đồng bộ. |
| **Q4** | `WebhookDelivery.source` = `"zalocrm"` hay `"zalocrm:<org>"`? | | **`"zalocrm:<org>"`.** Bảng không có cột org; đây là cách duy nhất tách được cơ sở trong báo cáo/replay. |
| **Q5** | Lỗi hạ tầng (DB ngã) trả 200 hay 5xx? | OmiCall luôn 200 | **Tách:** lỗi **nghiệp vụ** (payload sai, org lạ) ⇒ 200 + `FAILED`; lỗi **hạ tầng** ⇒ **5xx**. Fork có outbox retry 3 lần (F2) và chỉ nổ khi thấy non-2xx. Luôn 200 = tin mất vĩnh viễn mà nhà cung cấp tưởng đã giao. |
| **Q6** | `TinDenNgoai.accountId` = gì? | hằng `"zalocrm"` · `ZaloCrmNick.zcrmAccountId` | **`zcrmAccountId` của nick.** Khoá hội thoại là `[channel, accountId, externalThreadId]` — dùng hằng thì một khách nhắn hai nick bị **gộp thành một hội thoại**, sai cả lịch sử lẫn cách ly. |
| **Q7** | `channelMessageId` = `messageId` trần hay có prefix? | | **`${orgCode}:${messageId}`.** Khoá chống trùng là toàn cục theo kênh. |
| **Q8** | QLCS/SUPER_ADMIN đọc `Inbox*` ở đâu? | `/sale/hop-thu` (họ **không vào được** — `isSaleOnly`, `app/(sale)/sale/layout.tsx:44-47`) · mount `/admin/hop-thu` · chỉ qua iframe ZaloCRM | **Đợt này: chỉ iframe.** Nghiệm thu GĐ1 "QLCS thấy hội thoại của Sale" đi qua ZaloCRM, không qua hộp thư Sata. Nếu chủ dự án đòi đọc `Inbox*` trong admin thì đó là ticket riêng (route mới + `ADMIN_ROUTE_SEGMENTS` + gate) — **đừng nhét vào L3**. |
| **Q9** | Thêm Server Action gọi `danhDauDaDoc`? | | **Không đợt này.** Hàm tồn tại nhưng chưa ai gọi; huy hiệu chưa đọc là nợ có sẵn của hộp thư, không phải nợ ZaloCRM. Ghi vào backlog. |
| **Q10** | `EXTERNAL_TAG` thêm bây giờ hay GĐ3? | | **Bây giờ, trong cùng file `ALTER TYPE`.** Rẻ, và `ADD VALUE` **không đảo ngược được** — thêm sau là một migration nữa. |
| **Q11** | Ký SSO bằng gì? | `jose` · `jsonwebtoken` (chưa có) · `node:crypto` | **`jose`** — đã là dependency trực tiếp (`package.json:87`) và **đã có tiền lệ ký HS256 trong repo**: `lib/chat/realtime-token.ts` (`SignJWT`, lớp `*Error` mã EN/message VI, kiểm `tokenVersion` chống force-logout). Copy nguyên khuôn, đừng thêm thư viện. |
| **Q12** | Ánh xạ vai Sata → vai ZaloCRM ở đâu? | | File **thuần** `lib/integrations/zalocrm/vai-tro.ts`, test không cần DB. **Không** viết `if (session.user.role === "SALES_CSM")` trong action (ESLint `no-inline-authz` = build fail). Fail-closed: vai không khớp ⇒ `null` ⇒ không ký token. |
| **Q13** | Cấp `zalocrm:use` cho `HO_SALE`? | | **Không** (chốt 9.7: Hội sở không dùng). Ghi rõ trong `[ZC-Q-04]`. |
| **Q14** | Một cron retention hay hai? | | **Một** (`webhook-retention` xoá cả hai bảng). Ngân sách cron đang 26/… |

---

## 5. VIỆC KHÔNG LÀM ĐƯỢC NẾU CHƯA CÓ FORK CHẠY THẬT — và cách vẫn kiểm được

| Không kiểm được end-to-end | Vì sao | Viết code thế nào để **vẫn** có test đỏ/xanh thật |
|---|---|---|
| **SSO** (fork nhận token, upsert `User`, trả session) | `/api/v1/auth/sso` là F1, repo khác | Tách **ký** khỏi **dùng**: `mintSsoToken()` là hàm thuần + `db` chỉ để kiểm `tokenVersion`. `sso.test.ts` tự `jwtVerify` bằng chính secret ⇒ kiểm được claims/exp/jti/secret-sai **không cần fork**. Phần duy nhất mù là "fork có chấp nhận không" — smoke tay ở GĐ1. |
| **Nhúng iframe** (fork phải nới `frame-ancestors`, F3) | header của fork chặn, không phải CSP Sata | Trang `/admin/zalo-crm` render `<iframe src>` từ `process.env.ZALOCRM_APP_URL`. e2e a0 kiểm **cổng quyền + có thẻ iframe với src đúng origin**, không kiểm nội dung khung. Iframe trắng ở GĐ0 là **kết quả đúng**, không phải bug. |
| **postMessage `sata:create-lead`** (F5) | nút nằm trong `ChatView.vue` của fork | Listener trong `zalocrm-frame.tsx` là hàm **thuần** `xuLyThongDiep(event) → {loai, phone, leadId} \| null`, test bằng cách gọi trực tiếp với object giả: origin sai ⇒ `null`; payload thiếu trường ⇒ `null`; đúng ⇒ đường dẫn `router.push`. Không cần iframe thật. |
| **Payload webhook thật** (F2 thêm `zaloAccountId`, `threadId`, `sentByExternalId`) | chưa có mẫu thật | `dich-payload.ts` **thuần**, nhận `unknown`, trả `{ok:false, ma, thongDiep}` khi lạ — khuôn `tests/goi-dien/cdr.test.ts` (bảng tên trường là **phỏng đoán** khi chưa có văn bản NCC; sửa **bảng + test**, không sửa nơi khác). Fixture JSON lưu trong `lib/integrations/zalocrm/__fixtures__/`. Khi có payload thật, chỉ sửa bảng + fixture. |
| **7 bước webhook đúng thứ tự** | chỉ chạy khi có bên gửi | `bat-bien.test.ts` **đọc mã nguồn dạng chuỗi**, không chạy hàm — bản song sinh của `tests/goi-dien/bat-bien.test.ts:253-299`. Đây là thứ **duy nhất** giữ thứ tự khỏi trôi. |
| **Gửi tin thật qua nick** (GĐ3, F4) | ZaloCRM chưa có API; và **creds Zalo chỉ ở Production** — trên `test` mọi lượt gửi luôn `SIMULATED` (điểm mù cố hữu) | Adapter `ZALO_CA_NHAN` copy khuôn `lib/integrations/zalo-oa/provider.ts:49-77`: `resolveSendMode(...)` rồi **`{ status: "SKIPPED", errorCode: "ZALOCRM_LIVE_CHUA_HIEN_THUC" }`**. `provider.test.ts` khuôn `tests/goi-dien/adapter.test.ts:13-33` kiểm 4 luật AD-1…AD-4 bằng `vi.mock("@/lib/settings/service")` + `vi.resetModules()`. **TUYỆT ĐỐI không trả `SENT`** — hình dạng `{ok:true}` trần đã làm cả đội tin là đã trả lời khách trong nhiều tháng (`lib/crm/messenger-send-gate.ts`). |
| **Đối soát cron 5 phút** (GĐ3) | cần API fork | Hoãn sang GĐ3; không viết vỏ rỗng. |
| **Nghiệm thu trên `test.satarobo.vn`** | ZaloCRM chỉ cho **một webhook_url cho mỗi Organization** | Cần **org TEST** + một SIM công ty (việc 9.16, GĐ0). Không có nó thì tin thật của Sale sẽ vào DB test. Đây là việc **ngoài code**, chặn cứng nghiệm thu GĐ2. |

**Kỷ luật chung:** mọi thứ chạm mạng nằm sau một hàm thuần đã test. Ranh giới repo đang giữ: `types.ts` (kiểu) · `dich-payload.ts`/`duc-payload.ts` (thuần) · `webhook.ts` (7 bước) · `client.ts` (mạng) · `provider.ts` (adapter) · `sso.ts` · `config.ts` · `log.ts`. Adapter **không được** biết `Lead`/hội thoại/DB (`lib/integrations/types.ts:7-9`).

---

## 6. BA LƯỚI AN TOÀN DỄ QUÊN NHẤT

1. **`vitest.config.ts` include là bộ lọc CỨNG.** `tests/inbox/**` đã có (:33). Tạo `tests/zalocrm/` mà quên khai ⇒ `vitest run tests/zalocrm` in *"No test files found"* và **thoát mã 0** ⇒ CI xanh dù test viết đúng. **An toàn nhất: đặt test colocated trong `lib/**`** (glob :14 phủ sẵn) và ca chạm DB trong `tests/inbox/zalocrm.spec.ts`.
2. **`--no-file-parallelism`** bắt buộc ở mọi script test DB — `tests/inbox`, `tests/chat`, `tests/nen`, `tests/lead-intake` chạy **tuần tự trên cùng DB `ci_test`**. Bỏ cờ ⇒ `purge()` của file này xoá dữ liệu file kia. Và **không bao giờ** gọi `resetDb()` trong `tests/inbox`.
3. **Sau merge `test` → `main`: chạy tay `.github/workflows/seed-prod-roles.yml`.** Quên = prod giữ `RolePermission` cũ ⇒ người mở `/zalo-crm` bị đá ra **không kèm lỗi**, và **không tái hiện được ở local** (local chạy RBAC v1 tĩnh, prod chạy v2 động). Đây là lỗi đã dính nhiều lần. Chạy = **ghi đè toàn bộ** `RolePermission` bằng định nghĩa trong code ⇒ báo trước người trực, tránh giờ cao điểm.

**Lệnh kiểm mỗi lô trước khi báo xong:**
```
pnpm vitest run lib/auth lib/inbox lib/integrations lib/permissions components/admin/nav-coverage.test.ts
pnpm test:inbox-db          # cần .env.test trỏ satarobo_test local
pnpm typecheck && pnpm lint && pnpm build
```