# ĐẶC TẢ CHỐT — Thiết kế lại module Chấm công (admin)

- **Ngày:** 06/09/2026 · **Luận đề:** "Sổ kỳ công" (roll concept-seed `826f95b6`, chủ dự án chọn) · Mode Operate.
- **Bản gốc:** B. **Từ C:** `loadModuleScope` · `DropdownMenu` thay popover · sổ sách MIEN_TRU · `PeriodStatusPill` Link + OPEN info · `?id=` · Enter=Lưu · Check-in `bg-state-success-ink` · token `:root` cho atom chung. **Từ A:** LockDialog "N ngày chưa tính" · `scope-href.test` · `aria-live` vé · `ASK_WHO`. **Sửa B:** DayTypePill `text-xs`; bỏ Hoàn tác; giữ `WorkRequestReview` (+`effectCode?`); không sửa API qr-token; bỏ thanh vé co dần.
- "GIỮ" = behavior contract `phase1-constraints.md`; xung đột ⇒ contract thắng.

# 0. Tóm tắt 10 dòng

1. **QLCS** mở `/cham-cong` thấy dải ngày có số cờ của tháng, hôm nay viền tím; bấm ngày là khoan sâu, giữ khối.
2. Bảng công ngày là **hàng chờ rà cờ**: cờ danger lên đầu, lọc + tìm tên, dòng 44px; bấm tên mở Sheet lượt quét, ghi đè tại chỗ (Enter = Lưu).
3. Lưới phân ca: ô là **nút mở menu chọn mã**, "Xoá ca", "Chọn kèm lý do…"; nguồn ô có CHỮ T/Đ/N/L; ô khối khác chỉ đọc.
4. Đơn từ: **bảng có cột "Thay đổi" tính trước** (`S → CG`), tuổi đơn, Sheet quyết định hai luồng; `?id=` mở thẳng.
5. **Chốt sổ là nghi thức**: trạng thái kỳ ở ScopeBar mọi màn; "Việc còn dang dở" + hộp xác nhận nêu hệ quả bằng số.
6. **Kế toán** chỉ có `view` thấy `<dl>` chỉ đọc + "Chốt cần `hr_attendance:close-period` tại CS1".
7. Sidebar 15 → **5 mục**; 10 màn còn lại vào qua ModuleNav / ConfigTabs / nút màn cha. **Route không đổi.**
8. **Nhân viên** có cụm "Của tôi" (Lịch ca · Đơn của tôi + Chấm công), lịch 31 ngày một trang, cờ tiếng Việt, nút 56px.
9. QR quầy hai chế độ: điều khiển + trình chiếu TV, giữ QR cuối khi rớt mạng.
10. Mọi màn đủ 4 trạng thái; `NoPermission` nêu key + hỏi ai thay 13 `redirect` câm.

# 1. IA & điều hướng

## 1.1 Sidebar (`components/admin/sidebar.tsx`, nhóm "Nhân sự & Giáo viên"; object phẳng, nháy kép, thứ tự label→href→icon→perm)

```ts
{ label: "Chấm công", href: "/cham-cong", icon: Clock, perm: ["hr_attendance:view"] },
{ label: "Lịch phân ca", href: "/cham-cong/phan-ca", icon: CalendarDays, perm: ["hr_attendance:assign", "hr_attendance:view"] },
{ label: "Kỳ công", href: "/cham-cong/ky-cong", icon: CalendarCheck, perm: ["hr_attendance:view"] },
{ label: "Duyệt đơn từ", href: "/don-tu", icon: ClipboardList, perm: ["hr_attendance:approve"] },
{ label: "Của tôi", href: "/cham-cong/lich-ca", icon: UserRound, perm: ["hr_attendance:checkin"] },
```
Gỡ 10 dòng cũ; không viết `href: "` trong comment; không sửa hàm active; `/cham-cong/man-hinh` vẫn ở ALLOWLIST nav-coverage.

## 1.2 Nguồn quyền duy nhất — `lib/cham-cong/module-scope.ts` (module server thường, KHÔNG `'use server'`)

```ts
export const MODULE_ACTIONS = ["hr_attendance:view","hr_attendance:assign","hr_attendance:config","hr_attendance:approve","hr_attendance:adjust","hr_attendance:close-period","hr_attendance:export"] as const;
export type ModuleAction = (typeof MODULE_ACTIONS)[number];
export type ScopeBlock = { id: string; code: string; label: string; perms: Record<ModuleAction, boolean> };
export type ModuleScope = { blocks: ScopeBlock[]; has(a, centerId): boolean; blocksWith(a): ScopeBlock[]; any(a): boolean; pick(coSo, a): ScopeBlock | null };
export async function loadModuleScope(userId: string): Promise<ModuleScope>;
export async function periodStatusOf(sdb, coSo, ky): Promise<{ status: PeriodStatus | null; standardUnits: number | null }>; // findUnique thuần
export const ASK_WHO: Record<ModuleAction | "hr_attendance:checkin", string>;
```
Thân: `loadCenterMap()` → `scopedDb(actor).center.findMany({ isActive, code ∈ byCode })` theo `displayOrder` + `{ id: HO_CENTER_ID, code: "HO", label: "Hội sở" }` → `perms[a] = await checkPermission(a, { centerId: b.id })` cho mọi `a ∈ MODULE_ACTIONS` (action là BIẾN, target luôn thật; actor đã `React.cache`). `ASK_WHO`: view/adjust/assign → "Quản lý cơ sở hoặc HR Hội sở" · approve → "Quản lý cơ sở" · close-period/export → "Kế toán cơ sở hoặc Kế toán Hội sở" · config → "HR Hội sở hoặc Quản lý cơ sở" · checkin → "HR".

## 1.3 ModuleNav — `components/admin/cham-cong/module-nav.tsx` (RSC, tab gạch chân mẫu /students)

| key | Tab | href literal | Hiện khi |
|---|---|---|---|
| `ngay` | Bảng công ngày | `"/cham-cong"` | `any(view)` |
| `luoi` | Lưới phân ca | `"/cham-cong/phan-ca"` | `any(assign ∨ view)` |
| `ky` | Kỳ công & chốt | `"/cham-cong/ky-cong"` | `any(view)` |
| `don` | Đơn từ | `"/don-tu"` | `any(approve)` |
| `doisoat` | Đối soát | `"/cham-cong/doi-soat"` | `any(view)` |
| `cauhinh` | Cấu hình | `"/cham-cong/danh-muc-ca"` nếu `any(config)`, không thì `"/cham-cong/loai-nghi"` | ≥1 mục ConfigTabs |

Props `{ active; scope; ctx }`; tham số theo `scopeHref()` (§2.1); không `usePathname`; mỗi page tự render.

**ConfigTabs** (`config-tabs.tsx`, RSC, hàng 2 `text-xs`, CHỈ ở 6 màn cấu hình; href literal = lối vào duy nhất của 4 route rời sidebar): Mã ca `"/cham-cong/danh-muc-ca"` [config@HO ∨ config@CS] · Khung ca tuần `"/cham-cong/khung-ca"` [assign ∨ view] · Loại nghỉ `"/cham-cong/loai-nghi"` [view ∨ config@HO] · Điểm chấm công `"/cham-cong/diem-cham"` [config@CS, không HO] · Ghi chú lịch `"/cham-cong/ghi-chu"` [assign ∨ view] · Ngày lễ `"/holidays"` [`checkPermission("holidays:view", { centerId: coSo })`].

## 1.4 ScopeBar — thứ tự cố định **PageHeader → ModuleNav → ScopeBar** → (PageHelp) → nội dung. Đủ 3 khối ở `/cham-cong` (tháng đổi `date`), `/phan-ca`, `/ky-cong`, `/doi-soat`; không tháng ở `/don-tu` (+ "Tất cả"), `/khung-ca`, `/ghi-chu`, `/man-hinh` (param `centerId`). Chip khối = `scope.blocksWith(actionCủaMàn)` · ‹ Tháng 09/2026 › · `PeriodStatusPill` (Link → `/cham-cong/ky-cong?ky&coSo`) · "Công chuẩn 22" (`periodStatusOf`; null ⇒ ẩn).

## 1.5 "Của tôi" — `me-nav.tsx` (RSC, admin-only): tab Lịch ca `"/cham-cong/lich-ca"` · Đơn của tôi `"/don-tu/cua-toi"` + nút BTN_OUTLINE "Chấm công" `"/cham-cong/checkin"`. Không ScopeBar; lich-ca giữ `?month=`. **Kiosk** `/cham-cong/man-hinh?centerId=`: hai chế độ một URL — §4.

# 2. Thư viện thành phần module

**Viết tắt**: `W` = `bg-state-warning-soft text-state-warning-ink` · `D`/`I`/`S` = danger/info/success-soft + -ink · `M` = `bg-muted text-muted-foreground`. `NP(key, what)` = `<NoPermission permission={key} what={what} askWho={ASK_WHO[key]}/>` (`view/assign/config/approve/checkin` = `hr_attendance:*`).

**`components/cham-cong/ui/*`** = dùng chung admin + GV ⇒ chỉ shadcn/Tailwind/lucide, KHÔNG import `components/admin/**`, **CHỈ token `:root`** (`state-*`, `primary`, `primary-foreground`, `muted*`, `card`, `border`, `foreground`, `ring`) — **CẤM `primary-soft`/`primary-ink`/`primary-dark`** (`:root` không có / là cam). **`components/admin/cham-cong/*`** = vỏ admin. Cấm hex rời, `amber/orange/violet/sky/rose-*`, `text-white`; chỉ `transition-colors/shadow`; skeleton `animate-pulse`.

**`classes.ts`** (`components/admin/cham-cong/`):
- `BTN_PRIMARY = "inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary-dark disabled:pointer-events-none disabled:opacity-50"` · `BTN_OUTLINE` = cùng vỏ + `border border-border bg-card text-foreground hover:bg-muted` · `BTN_DANGER` = cùng vỏ + `border border-state-danger-soft bg-card text-state-danger-ink hover:bg-state-danger-soft`
- `FIELD = "h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-soft aria-[invalid=true]:border-state-danger"`
- `CHIP = "inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-xl border px-3 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring"` · `CHIP_ACTIVE = "border-primary bg-primary-soft text-primary-ink"` · `CHIP_IDLE = "border-border bg-card text-muted-foreground hover:bg-muted"`
- `TAB = "whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring"` · `TAB_ACTIVE = "border-primary text-primary-ink"` · `TAB_IDLE = "border-transparent text-muted-foreground hover:border-border hover:text-foreground"`
- `PILL = "inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold"`

**2.1 `lib/cham-cong/scope-href.ts`** (thuần, test): `hrefWith(base, q)` bỏ rỗng, thứ tự ky, coSo, date · `scopeHref(tabHref, ctx, canCoSo)`: `/cham-cong` → `?date=<date ?? (ky===currentPeriodKey()? vnYmd(now) : ky+"-01")>&coSo`; phan-ca/ky-cong → `?ky=<ky ?? date.slice(0,7)>&coSo`; `/don-tu` → `?coSo` chỉ khi canCoSo; doi-soat → `?ky`; cấu hình → `?ky&coSo` · `monthStepDate(date, ±1, now)` (tháng hiện tại ⇒ `vnYmd(now)`, khác ⇒ `"<ky>-01"`) · `shiftKy(ky, delta)`.

**2.2 `lib/cham-cong/flag-labels.ts`** (thuần, test) + **`FlagChip`** `components/cham-cong/ui/flag-chip.tsx`: `FLAG_LABEL` hoist 20 mã + tone từ `cham-cong/page.tsx:24-44`; `flagInfo(code)` fallback `{ text: code, tone: "info" }`; `countsAsIssue = tone !== "info"`. `FlagChip { code }` → `PILL` + D/W/M(info), `title={code}`, mã lạ in nguyên `max-w-[10rem] truncate`. `FlagList { codes; max?: 2 }` + chip `+N` M có `title`.

**2.3 `ShiftCodeChip` + `SourceLegend`** `components/cham-cong/ui/shift-code-chip.tsx`: `{ code: string | null; source?: "PATTERN"|"IMPORT"|"MANUAL"|"SWAP"|"LEAVE"|"HOLIDAY"; foreignUnit?: string; size?: "sm"|"md"; className? }`. Vỏ `inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-1.5 font-mono font-semibold tabular-nums` (sm `h-6 text-xs`, md `h-7 text-sm`). Nguồn = ký hiệu 1 chữ `text-[10px] font-sans` + nền: PATTERN/IMPORT `border-border bg-card text-foreground` · MANUAL W + `T` · SWAP I + `Đ` · LEAVE S + `N` · HOLIDAY D + `L`; `aria-label="Ca S, sửa tay"`. `foreignUnit` ⇒ `border-dashed` + M + `ArrowRight h-3` + `→CS2`. `SourceLegend()` 7 chip mẫu.

**2.4 `DayTypePill`** `components/cham-cong/ui/day-type-pill.tsx`: `{ type: "WORK"|"WEEKLY_OFF"|"LEAVE"|"HOLIDAY"|"UNSCHEDULED"|null }` → WORK/null không render; WEEKLY_OFF "Nghỉ tuần" M; LEAVE "Phép" S; HOLIDAY "Lễ" D; UNSCHEDULED "Ngoài lịch" W. Vỏ `PILL`.

**2.5 `SheetFilePicker`** `components/cham-cong/ui/sheet-file-picker.tsx` ('use client'): `{ id; file: File | null; onChange(f): void; accept?: ".xlsx"; maxMb?: 2; disabled?; label?; hint? }`. `<label htmlFor={id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-border bg-card p-4 text-sm hover:bg-muted focus-within:ring-2 focus-within:ring-ring">` + `<input id type="file" className="sr-only">` (KHÔNG `hidden`) + `FileSpreadsheet h-5 w-5` + tên `max-w-[18rem] truncate` + "Đổi file"/"Bỏ chọn". Lỗi "Chỉ nhận file .xlsx" / "File quá 2MB" `role="alert"` danger-ink + `onChange(null)`.

**2.6 `ScopeBar`** (RSC) `scope-bar.tsx`: `{ basePath; blocks: { id; label }[]; coSo: string | null; allLabel?; month?: { ky; prevHref; nextHref }; period?: { status; standardUnits; href }; keep?: Record<string,string>; paramName?: "coSo" | "centerId"; right?: ReactNode }`. Vỏ `mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-3 py-2`; chip `cn(CHIP, active ? CHIP_ACTIVE : CHIP_IDLE)` + `aria-current`; nút tháng `<Link aria-label="Tháng trước" className="h-9 w-9 rounded-lg border border-border bg-card hover:bg-muted">` + `ChevronLeft h-4 w-4` · nhãn `min-w-[9rem] text-sm font-semibold tabular-nums`; phải `ml-auto`: `PeriodStatusPill` + "Công chuẩn <b>22</b>" `text-xs`.

**2.7 `ModuleNav` / `ConfigTabs` / `MeNav`** (RSC): vỏ `mb-4 border-b border-border` › `<nav aria-label="Điều hướng chấm công" className="-mb-px flex gap-1 overflow-x-auto">` › `<Link className={cn(TAB, active ? TAB_ACTIVE : TAB_IDLE)} aria-current="page">`. ConfigTabs `mb-4 flex flex-wrap gap-1`, chip `rounded-lg px-3 py-1.5 text-xs font-medium` active `bg-primary-soft text-primary-ink font-semibold` idle `text-muted-foreground hover:bg-muted`.

**2.8 `DayStrip`** (RSC) `day-strip.tsx`: `{ days: { ymd; day; wd; flagCount; type: "WORK"|"WEEKLY_OFF"|"HOLIDAY"; href }[]; selected; today }`. `<nav aria-label="Ngày trong tháng" className="mb-4 grid grid-cols-7 gap-1 sm:flex sm:flex-wrap">` (KHÔNG grid 31 cột cứng); ô `<Link aria-label="T3 09/09, 3 người có cờ" className="flex h-11 w-11 flex-col items-center justify-center rounded-lg border text-xs tabular-nums">`: mặc định `border-border bg-card hover:bg-muted`; nghỉ/lễ M; hôm nay `border-primary`; đang xem `border-primary bg-primary-soft text-primary-ink font-semibold` + `aria-current="date"`; số cờ `rounded-full bg-state-danger-soft px-1 text-[11px] font-semibold text-state-danger-ink`. Nguồn: 1 query `staffAttendanceDay` tháng × coSo + `getSetting("shift.weeklyOffDays")` + Holiday.

**2.9 `PeriodStatusPill`** (RSC): `{ status; href?; className? }` → `<StatusPill tone className="text-state-*-ink">`: null "Chưa mở kỳ" M · OPEN "Đang mở" **info** · CLOSING "Đang chốt" warning · LOCKED "Đã chốt" success + `Lock h-3 w-3` · REOPENED "Đã mở lại" warning + `Unlock`; có `href` ⇒ bọc Link `hover:underline`.

**2.10 `KpiStrip` · `SectionCard`** (RSC): `KpiStrip { items: { icon?; value; label; tone?: StatTone; hint?; href? }[]; cols?: 4 | 5 }` → `mb-4 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-{cols}`, ô `<StatCard>` (số format ở page), `href` bọc Link `block rounded-xl`. `SectionCard { title; icon?; actions?; tone?: "default"|"warning"|"success"; children }` → `<section className="rounded-xl border border-border bg-card p-5">` (tone đổi `border-state-*-soft`) + `<h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">` icon `h-4 w-4 text-primary`.

**2.11 Skeleton · RouteError** `skeletons.tsx`, `route-error.tsx`: `ScopeBarSkeleton()` h-12 · `KpiSkeleton({ n })` ô `h-[72px]` · `DayStripSkeleton()` 31 ô `h-11 w-11` · `TableSkeleton({ cols, rows = 8 })` vỏ `overflow-hidden rounded-xl border border-border bg-card`, th `h-11 bg-muted/40`, hàng `flex h-11 items-center gap-4 border-b border-border/60 px-5` + `<Skeleton className="h-4">` · `GridSkeleton` · `FormSkeleton`; tất cả `aria-busy aria-label="Đang tải…"`. `RouteError({ error, reset, what, backHref, backLabel })` ('use client'): `console.error`; `<ErrorState title={`Không tải được ${what}`}>` + Thử lại `BTN_PRIMARY` + Link về `BTN_OUTLINE` + `digest`.

**2.12 `ShiftCellPicker`** ('use client') `shift-cell-picker.tsx` — `components/ui/dropdown-menu.tsx` sẵn có (KHÔNG có `popover.tsx`): `{ value: string | null; source?; codes: { code; name; timeLabel; place }[]; disabled?; busy?; triggerLabel: string; onPick(code: string | null, note?: string): void }`. Trigger `<button className="flex h-8 w-12 items-center justify-center rounded-md border border-transparent hover:border-border" aria-label={triggerLabel}>` chứa `ShiftCodeChip size="sm"`. Menu `w-72`: tiêu đề "Nguyễn A · T4 09/09"; nhóm Làm việc/Nghỉ; item `h-9 text-sm` = mã mono + tên + giờ · nơi `text-xs text-muted-foreground`; mã hiện tại `bg-primary-soft` + `Check`; "Xoá ca" `text-state-danger-ink`; "Chọn kèm lý do…" mở `Dialog sm:max-w-sm` (native `<select>` + Lý do `maxLength 200`) — ô nhập KHÔNG trong Menu. `busy` ⇒ `opacity-50 aria-busy`; `disabled` ⇒ span + `title="Chỉ xem — cần hr_attendance:assign tại CS1"`. **Không Hoàn tác**.

**2.13 `DayDetailSheet`** ('use client') `app/(admin)/admin/cham-cong/_components/day-detail-sheet.tsx` — thay `override-cell.tsx`: `{ row: DayRow; canAdjust; locked; kyHref }`, `DayRow = { userId; name; code; source; dayType; taps: { time; dir: "IN"|"OUT"; flags }[]; worked; expected; credit; engineCredit; override; overrideNote; computed; flags; workDate; dateLabel }` (format ở RSC). Sheet phải `sm:max-w-md`; trigger `<button className="font-medium hover:underline" aria-label="Chi tiết Nguyễn A">` ở ô Nhân sự (mọi dòng). Nội dung: tên + chip ca + ngày; "Lượt quét" `<ol>` mono (giờ · Vào/Ra · `FlagList`); "Công" `<dl>`; form khi `canAdjust && !locked && credit != null`: ô Công `<input type="number" step="0.5" min="0" max="3" className={cn(FIELD,"w-24")} autoFocus>` (Enter = Lưu), Lý do `FIELD required maxLength 300`, Lưu `BTN_PRIMARY disabled={pending || !reason.trim() || units === ""}`, "Bỏ ghi đè" khi `override`, Huỷ; thay form: `locked` ⇒ dải M "Kỳ đã chốt — chỉ đổi qua đơn chỉnh công hoặc mở lại kỳ" + link `kyHref`; `!canAdjust` ⇒ "Ghi đè cần `hr_attendance:adjust` tại {khối}"; `!computed` ⇒ "Máy chưa tính ngày này". Gọi `setDayOverrideAction({ userId, workDate, units, note })`; toast + đóng + refresh.

# 3. Bản thiết kế từng màn

Chung: page `<div className="max-w-6xl">` (lưới `max-w-[1400px]`, checkin `mx-auto max-w-sm`) — **bỏ `p-6`**. Thứ tự PageHeader → ModuleNav/MeNav → (ConfigTabs) → ScopeBar → `<PageHelp guideSlug="08-nhan-su-giao-vien">` → nội dung. Bảng `adminTh/adminTd/adminTr`, `<th scope="col">`, số `tabular-nums`, ô dài `truncate` + `title`, trong `<PhanTrangBang cuonNgang tenDonVi khoaGhiNho>` đúng một `<table>`/`<tbody>`, không bọc thêm `overflow-x-auto`. Không quyền = `return` sớm `<PageHeader/><ModuleNav/>{NP(…)}`, không truy vấn dưới, không `redirect`. "GIỮ" = cả cụm contract; chỉ nhắc điểm dễ vỡ.

## 3.1 `/cham-cong` — Bảng công ngày: hàng chờ rà cờ của QLCS trong một ngày của kỳ

```
PageHeader "Bảng công ngày"   [Màn hình QR ▢] [Import lịch ▢ (assign@coSo)]
ModuleNav · ScopeBar [CS1 · Trụ sở] [CS2] [Hội sở] ‹ Tháng 09/2026 › (Đang mở→ky-cong) Công chuẩn 22
DayStrip  1 2 3 … [9•3] … 30 · KpiStrip Có ca · Đã quét · Cờ cần rà (D, ?loc=co) · Chờ tính · Đã ghi đè
Toolbar   (Tất cả)(Chỉ có cờ)(Chưa quét)(Đã ghi đè) · <form GET> [tìm tên] [ngày]
Bảng 44px NHÂN SỰ | CA | QUÉT | GIỜ / KH | CÔNG | CỜ | ›   → DayDetailSheet khi bấm tên
```
- Cột: Nhân sự = nút mở Sheet `font-medium max-w-[15rem] truncate`; Ca `ShiftCodeChip size="sm"` + `DayTypePill`; Quét `font-mono tabular-nums` "08:02 → 17:31 ·3"; Giờ/KH "7h29 / 8h00"; Công `font-semibold` + chip "ghi đè" W + pill M "Chờ tính" khi `!computed` + `Lock h-3.5`; Cờ `FlagList max=2`. Sắp: danger → warn → còn lại, rồi tên vi-VN.
- Lọc `?loc=co|chuaquet|ghide`, `?q=` (THÊM); mọi link giữ `date`+`coSo`. Toolbar `<form method="GET">` hidden `date/coSo/loc`, ô tìm + `<input type="date" name="date">` `FIELD` + label sr-only (thay `DateNavInput` — sửa bug rơi `coSo`). LOCKED: dải M + `Lock h-4` "Kỳ 09/2026 đã chốt — công ngày chỉ đổi qua đơn chỉnh công" + Link Kỳ công.
- Rỗng `EmptyState title="Chưa có ca hay lượt chấm ngày 09/09 ở CS1" description="Chưa import lịch tháng này, hoặc cả khối nghỉ."` + Import lịch (assign) / "Xem lưới phân ca"; rỗng theo lọc "Không ai khớp bộ lọc" + "Bỏ lọc"; `NP("view","bảng công")`. GIỮ: `?date/?coSo` + fallback; gate loop view; `canAdjust`@coSo; công thức dòng; `setDayOverrideAction`; giờ +07; 4 href ra (`phan-ca/import`, `ky-cong?ky&coSo`, `phan-ca?ky&coSo`, `man-hinh?centerId=`).

## 3.2 `/cham-cong/phan-ca` — Lưới phân ca tháng: xếp/sửa ca người × ngày một khối trong kỳ

```
PageHeader "Lưới phân ca"   [Khung ca tuần ▢] [Import Sheet ▢ (assign)] [Sinh lưới từ khung ● (assign)]
ModuleNav / ScopeBar · KpiStrip Người 19 · Ô đã xếp 402/430 · Sửa tay 6 (W) · Từ đơn 4 (I) · 7 ngày không nghỉ 1 (D) · SourceLegend
Lưới  NHÂN SỰ (sticky) | 1 T3 | 2 T4 | … | 30 | CÔNG | NGHỈ ;  tfoot "Có ca"
```
- `<table className="min-w-[1200px]">`; nghỉ tuần từ `getSetting("shift.weeklyOffDays",{orgUnitId})` (bỏ `wd === 1` cứng) `bg-muted`; lễ `text-state-danger-ink`; hôm nay `border-x border-primary`. Nhân sự sticky trái `max-w-[13rem] truncate`. Ô `px-0.5 py-1.5 text-center` = `ShiftCellPicker` (canEdit và `a.centerId === coSo`) / `ShiftCodeChip` (`foreignUnit` chỉ đọc) ⇒ 44px. Chọn ⇒ `setCellAction({ userId, workDate, code, homeUnit, note })` ⇒ toast ⇒ refresh. "Công" = ô ∉ {X,P} (K-01), "Nghỉ" = X/P; `PhanTrangBang khoaGhiNho="phan-ca" soDongMacDinh={50}`.
- `generate-dialog.tsx` `Dialog sm:max-w-lg` (kỳ `input type=month` mặc định tháng SAU VN, checkbox khối canAssign) → `generateMonthAction`; kết quả `<dl>` 7 số + `restWarnings`. Rỗng `EmptyState "Chưa có ai trong CS1 kỳ 09/2026"` + Khung ca / Import / Sinh lưới (assign); chỉ xem: dải M "Bạn chỉ xem — sửa ô cần `hr_attendance:assign` tại CS1"; `NP("view","lưới phân ca")`.
- GIỮ: `?ky/?coSo`; gate assign‖view; thành viên hàng; mã ô (`sourceCells` → `→unit`); `setCellAction` (+notify `shift.changed`); `generateMonthAction`; `Date.UTC`.

## 3.3 `/cham-cong/phan-ca/import` — Import lịch từ Sheet: 3 bước có đối chiếu

```
PageHeader "Import lịch phân ca" · ModuleNav(luoi) — không ScopeBar
Stepper ● 1 Đọc file ── ○ 2 Ánh xạ & phạm vi ── ○ 3 Kết quả (xong: Check + tóm tắt 1 dòng)
B1 SheetFilePicker · [Đọc file ●] · SectionCard "Lần import gần đây" (5 AuditLog IMPORT)
B2 cảnh báo (ul W) · mapping-table nhóm CS1/CS2/HO · kỳ + checkbox khung ca · [Áp vào hệ thống ●]
B3 StatusPill ("khớp toàn bộ" S / "N mã lệch" D) · result-diff-table MÃ | SHEET | HỆ THỐNG | LỆCH · <dl> 7 số · [Mở lưới] [Đối soát] [Import file khác]
```
- Stepper 3 ô `flex-1 border-b-2 px-3 py-2 text-sm` (hiện tại `border-primary font-semibold text-primary-ink`, xong `border-state-success` + `Check`). `mapping-table.tsx` (MIEN_TRU): hàng nhóm `bg-muted/40 text-xs font-semibold uppercase`; khối ngoài quyền pill M "sẽ bỏ qua"; TÊN TRONG SHEET | VAI | TRẠNG THÁI ("Đã nhớ" S · "Gợi ý ≥90" I · "Chưa ánh xạ" W) | native `<select aria-invalid>`. `result-diff-table.tsx` (MIEN_TRU, ≤21 dòng), dòng lệch danger-ink.
- Áp: `<fieldset disabled={pending} aria-busy>`; `try/catch` ⇒ `ErrorState` inline "Áp không hoàn tất — kiểm tra lưới rồi chạy lại file (idempotent)" + Thử lại. `months=[]` ⇒ EmptyState "File chỉ có tab KHUNG CA"; `NP("assign","import lịch")`. GIỮ: gate loop assign; 2 action + FormData (gửi lại file gốc); luật client (chặn chưa ánh xạ, mapping/kỳ mặc định, `setResult(null)`); apply→dirty→audit→revalidate; `ApplyResult`.

## 3.4 `/cham-cong/khung-ca` — Khung ca tuần: mẫu tuần từng khối

`PageHeader [Sinh lưới tháng ▢] · ModuleNav(cauhinh) · ConfigTabs · ScopeBar không tháng + "Tất cả" (?coSo MỚI; thiếu = mọi khối) · mỗi khối SectionCard (pill "chỉ xem" khi !canAssign) [Thêm người: <select> + BTN_OUTLINE] bảng NHÂN SỰ | T2 … CN | CÔNG/TUẦN`. Ô = `ShiftCellPicker` không nhánh lý do; thứ nghỉ `bg-muted` từ setting; `PhanTrangBang khoaGhiNho={"khung-ca:"+centerId}`. Rỗng EmptyState "Khối CS2 chưa có ai trong khung ca" + "Thêm người" (assign); `NP("view","khung ca tuần")`. Sinh lưới = `generate-dialog` của WU-05. GIỮ: 3 action + cột `[1..6,0]` + khối hiện = canAssign ∨ có pattern.

## 3.5 `/cham-cong/ky-cong` — Kỳ công & chốt sổ: đích của mọi việc rà

```
PageHeader "Kỳ công tháng 09/2026 — CS1 · Trụ sở"   [Xuất Excel ▢] [Tính lại ▢] [Chốt kỳ ●] | [Mở lại ▢]
ModuleNav / ScopeBar · KpiStrip Công chuẩn K-04 22 (hint "30 − 8 nghỉ tuần − 0 lễ") · Tổng công 402 · Ngày có cờ 7 (W) · Buổi dạy 118 · Người 19
SectionCard(warning) "Việc còn dang dở trước khi chốt" (unfinished-list.tsx, ≤4 Link): 7 ngày có cờ → /cham-cong?date=<ngày đầu có cờ>&coSo&loc=co · 3 ngày không lượt → …&loc=chuaquet
   · 2 người chưa có ca → /cham-cong/phan-ca?ky&coSo · 4 đơn chờ duyệt → /don-tu?status=PENDING&coSo · sạch ⇒ success "Không còn việc dang dở — có thể chốt"
SectionCard "Công chuẩn & trạng thái" (period-panel.tsx) · Bảng 2 hàng: NHÂN SỰ | CÔNG (Công · KH · Nghỉ CL · Lễ) | GIỜ (HC · Làm/KH) | HẬU KIỂM (Muộn · Sớm · Không lượt · Ghi đè · Cờ) | DẠY + tfoot
Chân "Số đã chốt lúc 01/10 09:12 — lý do — đã xuất 2 lần" / "Bản tạm dựng 10:31 · cập nhật vài phút sau mỗi lượt quét"
```
- `period-table.tsx`: `<colgroup>` + `<thead>` 2 `<tr>` (nhóm `colSpan scope="colgroup"` `text-[11px] uppercase`); Nhân sự sticky 1 dòng (tên truncate + mã NV mono nhỏ); Công & Buổi dạy `font-semibold`; ô Cờ/Ghi đè = `<Link>` `/cham-cong?date=<ngày đầu có cờ>&coSo&q=<tên>`; `expectedUnits === 0` ⇒ pill M "Chưa có ca". `PhanTrangBang khoaGhiNho="ky-cong" soDongMacDinh={50}`.
- **LockDialog** (`lock-dialog.tsx`): "Chốt kỳ 09/2026 — CS1"; `<ul className="space-y-1 text-sm">`: "Đóng băng công của **19 người** · **402 công**" · "**7 ngày còn cờ** giữ số hiện tại" · (khi >0, `text-state-warning-ink`) "**3 ngày chưa tính** sẽ chốt ở 0 — nên Tính lại trước" · "Mở lại cần `hr_attendance:close-period` tại Hội sở"; "Lý do (tuỳ chọn, ≤300)"; [Huỷ `BTN_OUTLINE`] [Chốt kỳ 09/2026 `BTN_PRIMARY` + `Lock`]. `!periodEnded` ⇒ disabled + `HelpHint` "Chỉ chốt sau 30/09". Mở lại: Dialog lý do 5–300, chỉ `canReopen && locked`.
- `!canClose`: `<dl>` chỉ đọc + "Chốt cần `hr_attendance:close-period` tại CS1 — liên hệ Kế toán cơ sở". Xuất = `<a href="/api/admin/cham-cong/export?centerId&ky">` + "(bản tạm)". Rỗng "Chưa có ca hay ngày công nào trong kỳ" + "Xem lưới phân ca"; `NP("view","kỳ công")`. GIỮ: `?ky/?coSo`; canClose/canReopen(HO)/canExport target; `getOrCreatePeriod` CHỈ khi canClose; `summaryJson` khi LOCKED; 4 action; export GET thuần.

## 3.6 `/cham-cong/doi-soat` — Đối soát Sheet ↔ hệ thống: cổng ra 10 ngày sạch

`PageHeader "Đối soát Sheet" · ModuleNav · ScopeBar (khối + tháng → periodKey; ?ky, ?coSo tuỳ chọn)` · trái 1/3: SectionCard "File Sheet đang chạy song song" — SheetFilePicker · "So tới hôm qua" · [Đối soát ●] + StatCard "Cổng ra L6: 7/10 ngày sạch" + vạch `grid h-2 grid-cols-10 gap-0.5` ô `bg-state-success`/`bg-muted`; phải 2/3: mỗi kỳ = SectionCard "Kỳ 09/2026 — 19 người · so 8 ngày": `week-calendar.tsx` 7 cột (ô = số lệch, `<button aria-pressed>`) · Kpi 4 (Ô lệch D · Lệch tổng · Chưa ánh xạ W + tên + link Import · Miễn chấm công M) · `diff-table.tsx` NGƯỜI | NGÀY | SHEET | HỆ THỐNG | CÔNG SHEET | CÔNG HT | LOẠI (MISSING_* D · CODE W · UNITS I) | → `/cham-cong?date&coSo`. Đang so: bảng cũ `opacity-60 aria-busy`; lỗi `ErrorState` tại chỗ; 0 lệch EmptyState "Không lệch ô nào tới hôm qua — chuỗi sạch 8/10"; chưa chạy EmptyState "Chọn file Sheet rồi bấm Đối soát"; `NP("view","đối soát")`. GIỮ: gate view ≥1; `reconcileAction` chỉ đọc, `periodKey` tuỳ chọn; 4 loại lệch; unmapped/exempt liệt kê tên; cleanStreak/10.

## 3.7 `/cham-cong/danh-muc-ca` — Mã ca

`PageHeader [Thêm mã ca ●] · ModuleNav(cauhinh) · ConfigTabs · chip (Tất cả)(Đang dùng)(Đã ngưng) · template-table.tsx: MÃ | TÊN | LOẠI | GIỜ | GIỜ KH | CÔNG | NƠI LÀM | PHẠM VI | TRẠNG THÁI | HÀNH ĐỘNG`. Giờ = timeline `grid h-3 w-48 grid-cols-[repeat(32,minmax(0,1fr))]` 06–22h (WORK `bg-primary-soft`, PAID_BREAK `bg-muted`); Nơi làm nhãn VI từ `PLACES`; Phạm vi pill "Dùng chung" I / "CS1" M; Sửa `aria-label` · Ngưng/Bật 2-click. "Dùng chung" với `!canGlobal`: ẩn Sửa/Ngưng + `title="Cần config tại Hội sở"`. Editor `template-sheet.tsx` (Sheet `sm:max-w-lg`) bọc `template-editor.tsx` (giữ tên — MIEN_TRU), 3 nhóm. Rỗng "Chưa có mã ca — thêm S/C/T/CG theo Sheet"; `NP("config","danh mục mã ca")`.

## 3.8 `/cham-cong/loai-nghi` — Loại nghỉ

`PageHeader [Thêm loại nghỉ ● (canEdit)] · ModuleNav · ConfigTabs · leave-type-list.tsx: MÃ | TÊN | TỶ LỆ LƯƠNG | TRẦN NGÀY/NĂM | TÍNH NHƯ ĐI LÀM | TRẠNG THÁI | HÀNH ĐỘNG`. Tỷ lệ nhập %, pill 100% S · 0% M "→ X" · giữa W "→ P"; trần "Không giới hạn" mờ. Sửa inline theo hàng (ô `FIELD h-8`, Lưu/Huỷ trên hàng, mã khoá khi sửa). Chỉ xem: chân "Sửa danh mục dùng chung cần `hr_attendance:config` tại Hội sở". Rỗng "Chưa có loại nghỉ — chạy seed K-06"; `NP("view","loại nghỉ")`.

## 3.9 `/cham-cong/diem-cham` — Điểm chấm công

`PageHeader [Thêm điểm ●] · ModuleNav · ConfigTabs · location-table.tsx (MỚI, PhanTrangBang): CƠ SỞ | MÃ | TÊN | TOẠ ĐỘ | BÁN KÍNH | ĐỊNH VỊ | TRẠNG THÁI | HÀNH ĐỘNG`. Toạ độ `tabular-nums` hoặc pill W "Chưa toạ độ — đo thực địa"; Định vị Bật S / Tắt M; Sửa · "Mở màn hình QR" → `/cham-cong/man-hinh?centerId=<id>`. `location-form.tsx` (giữ tên, CHỈ form trong Sheet — hết `<table` ⇒ GỠ MIEN_TRU). Rỗng "CS1 chưa có điểm chấm công — màn hình QR chưa mở được"; `NP("config","điểm chấm công")`.

## 3.10 `/cham-cong/ghi-chu` — Ghi chú lịch

`PageHeader · ModuleNav · ConfigTabs · ScopeBar khối + "Tất cả" (?coSo MỚI; thiếu = mọi khối) · lg:grid-cols-[3fr_2fr]: SectionCard "Việc cố định theo thứ" KHỐI | T2 … CN ‖ SectionCard "Ghi đè theo ngày" NGÀY | KHỐI | CHẾ ĐỘ | ĐỐI TƯỢNG | NỘI DUNG | HÀNH ĐỘNG`. Ô thứ = ghi chú truncate + pill KD/GV; ô trống nút "+" `h-8 w-8` `aria-label="Thêm việc T3 CS1"` khi canAssign. Chế độ: Gửi kèm I · Không gửi tin D · Thay toàn bộ W; Xoá 2-click `BTN_DANGER h-8`. `note-form.tsx` Sheet phải: radio "Theo thứ / Theo ngày" (XOR), textarea ≤500. Giờ gửi từ setting `shift.briefNoteHourVN` (link `/cau-hinh-van-hanh`). Rỗng "Chưa có ghi chú — tin nhắc 19:00 chỉ gồm lịch ca"; `NP("view","ghi chú lịch")`.

## 3.11 `/cham-cong/lich-ca` — Lịch ca của tôi

`PageHeader "Lịch ca của tôi" [Nộp đơn ●] [Chấm công ▢] · MeNav(lich-ca) · ‹ Tháng 09/2026 › · "Tổng công tạm tính 18 · 20 ca" · bảng NGÀY | CA | GIỜ | NƠI | GIỜ LÀM | CÔNG | CỜ | HÀNH ĐỘNG`. Hàng tách tuần CÙNG tbody `<tr><td colSpan={8} className="bg-muted/40 px-5 py-1 text-xs font-semibold uppercase text-muted-foreground">Tuần 08–14/09</td></tr>`; hôm nay `bg-primary-soft`; ngày mai pill I "Ngày mai"; công có chip "ghi đè" + `Lock h-3` sr-only; `FlagList` (ẩn KHONG_CO_LUOT khi không ca); hành động: cờ thiếu lượt chưa khoá → "Nộp đơn chỉnh công" `/don-tu/cua-toi?type=TIMESHEET_FIX&date=<ymd>`; ca tương lai → "Xin đổi ca" `?type=SHIFT_SWAP&date=` (`date` MỚI). `PhanTrangBang cuonNgang khoaGhiNho="lich-ca" soDongMacDinh={50}`. Rỗng "Tháng này chưa có ca xếp cho bạn — người Hội sở / miễn chấm công không có lịch, không phải lỗi". Không gate.
GIỮ (3.7–3.11, contract §Cấu hình + §Cá nhân): gate từng màn y nguyên (mã ca canGlobal‖config@CS · loại nghỉ view‖config@HO · điểm chấm config@CS không HO · ghi chú assign‖view · lịch ca chỉ session); chữ ký action; paidRatio 0–1; geofence chỉ gắn cờ; weekday 0=CN; `?month=`; `WD[getUTCDay]`; route lich-ca là href trong DB.

## 3.12 `/cham-cong/checkin` — Chấm công: ca mobile thật, 375px

```
mx-auto max-w-sm: "Chấm công" text-xl · thẻ rounded-2xl border bg-card p-6: "Hôm nay" (tên điểm · ca S 08:00–17:00) · pill Định vị
  <p aria-live="polite" class="text-3xl font-bold tabular-nums">Vé còn 87 giây</p> · [Check-in] h-14 w-full · [Check-out] h-14 w-full · copy geofence
```
Check-in `bg-state-success-ink text-primary-foreground hover:bg-state-success-ink-hover`; Check-out `bg-primary text-primary-foreground hover:bg-primary/90` (token `:root`); disabled `opacity-60`; thành công `CircleCheck` + giờ + `res.warning` W + link "Lịch ca của tôi". Ca hôm nay: RSC đọc `getMyAssignments` → prop MỚI `todayShift?`. Không `w/t` ⇒ KHÔNG gọi `prepareCheckin`, `EmptyState "Cần quét mã QR tại quầy" description="Mã đổi mỗi phút — mở từ menu không chấm được."`; `?c=` cũ + 4 lỗi gate ⇒ `ErrorState` chuỗi server + "Về lịch ca"; hết vé ⇒ disabled + dải D "Vé hết hạn — quét lại mã trên màn hình quầy"; `NP("checkin","chấm công")`. GIỮ: `w/t` + callbackUrl; gate `{centerId:null}`; `prepareCheckin` một lần; props `CheckinClient` chỉ thêm; GPS không chặn; vé một lần.

## 3.13 `/cham-cong/man-hinh` — §4.

## 3.14 `/don-tu` — Duyệt đơn từ: hàng chờ quyết định, thấy hệ quả trước khi bấm

```
PageHeader "Duyệt đơn từ"  [Đơn của tôi ▢] · ModuleNav(don) · ScopeBar (Tất cả | CS1 | CS2 | Hội sở — không tháng, keep status)
KpiStrip  Chờ duyệt (W) · Nộp muộn · Chờ > 2 ngày (D, `cfg.staleMs`) · Áp thất bại (D) · Tab ?status= (giữ coSo)
Bảng 44px NGƯỜI NỘP | LOẠI | ÁP DỤNG | THAY ĐỔI | CƠ SỞ | TUỔI ĐƠN | TRẠNG THÁI | ›  → request-sheet.tsx
```
- **Thay đổi** — `lib/cham-cong/request-effect.ts`: `effectHint(r)` hoist 5 nhánh y nguyên; `effectSummaries(rows, sdb)` batch `shiftAssignment` ACTIVE ngày `fromDate` + `staffTimeLog` đầu/cuối ⇒ `Map<id, { text; code? }>`: SHIFT_SWAP `S → CG` (+ `Trần B: CG → S`); LEAVE `S → P · 3 ngày`; TIMESHEET_FIX `07:52→? ⇒ 07:30→17:30`; CLASS_OFF/SUB_TEACH tên lớp/người; khác "Chỉ đổi trạng thái" M.
- Cột khác: Người nộp `font-medium max-w-[12rem] truncate`; Loại `WR_KIND_LABEL` + chip "Nộp muộn" W; Áp dụng `dd/MM[ → dd/MM]` + giờ mono; Cơ sở chỉ mã; Tuổi đơn "2 ngày" (quá `staleMs` ⇒ danger-ink); Trạng thái pill + chip D "Áp thất bại". `take: 200`; đủ 200 ⇒ "Đang hiện 200 đơn mới nhất — lọc để thu hẹp".
- `request-sheet.tsx` ('use client', `Sheet side="right" className="sm:max-w-xl"`, mở khi bấm dòng hoặc `?id=` MỚI): đủ trường bắt buộc của contract (`<dl>` 2 cột, lý do `whitespace-pre-wrap`, `applyError` khối D, lịch sử duyệt); cuối = **`WorkRequestReview`** (giữ tên + props `{ requestId; effectHint }`, THÊM `effectCode?`) chỉ khi PENDING: "Duyệt đơn này sẽ: {effectHint}" `text-state-warning-ink`; [Duyệt `BTN_PRIMARY`] → khối inline "Ghi {effectCode ?? 'thay đổi'} cho Nguyễn A ngày 09/09" + "Ghi chú (tuỳ chọn)" + [Xác nhận duyệt][Huỷ]; [Từ chối `BTN_OUTLINE`] → `FieldLabel required` "Lý do từ chối" `<textarea aria-invalid maxLength 1000>` + [Xác nhận từ chối `BTN_DANGER`][Huỷ]. Hai state riêng; toast `note`/error + refresh.
- Rỗng theo tab "Không có đơn chờ duyệt ở CS1" + "Xem đơn đã duyệt"; `NP("approve","duyệt đơn từ")` (không render danh sách). GIỮ: `allowed` = `scope.blocksWith("hr_attendance:approve")` (= `approvableCenters()`; action server vẫn dùng hàm cũ); `?status/?coSo` + `qs()`; `decideRequestAction({ id, decision, note })`; chặn từ chối thiếu lý do ở client; href trần `/don-tu`.

## 3.15 `/don-tu/cua-toi` — Đơn của tôi + `RequestForm` dùng chung

`PageHeader [Tạo đơn ●] · MeNav(cua-toi) · tab Tất cả · Chờ duyệt 2 · Đã duyệt 14 · Từ chối 1 (?status= MỚI, lọc client) · my-requests.tsx: LOẠI | NGÀY/GIỜ | CƠ SỞ | LÝ DO | TRẠNG THÁI | PHẢN HỒI | GỬI LÚC`. Trạng thái pill + "Nộp muộn" + chip D "không áp được" khi PENDING; `PhanTrangBang khoaGhiNho="cua-toi"`. Form trong Sheet phải `sm:max-w-xl` (admin; GV vẫn inline); `?type=` mở sẵn; `?date=` (MỚI) → `presetDate?`.
`RequestForm` (dùng chung, token `:root`): `grid sm:grid-cols-[14rem_1fr] gap-6`; trái `<div role="radiogroup" aria-label="Loại đơn">` nút `<button role="radio" aria-checked className="h-11 w-full rounded-lg border px-3 text-left text-sm font-semibold">` active `border-primary ring-1 ring-primary bg-card` idle `border-border text-muted-foreground hover:bg-muted`; nhóm "Lớp học" chỉ khi `myClasses.length`; phải = ô của loại đang chọn, nhãn cục bộ `mb-1 block text-sm font-semibold` + `*` `text-state-danger-ink`, `required`, `aria-invalid` + lỗi `text-xs text-state-danger-ink`, `Đến min={fromDate}`; banner miễn chấm công W; nút gửi `h-11 bg-primary text-primary-foreground`. Rỗng "Bạn chưa nộp đơn nào — đổi ca, nghỉ phép, chỉnh công đều nộp ở đây". Không gate. GIỮ: `?type=` validate; `loadRequestFormOptions`; `detail` công thức; payload `submitRequestAction`; lỗi server nguyên văn; GV mount chung.

# 4. Kiosk (TV) — `/cham-cong/man-hinh`

- **Điều khiển** (`max-w-3xl`): PageHeader "Màn hình QR" subtitle "Mở trên TV tại quầy — mã đổi mỗi phút" [Trình chiếu ● `Monitor`] · ScopeBar `paramName="centerId"` chip = cơ sở `code ∈ byCode` (loại HO) có `view`; `centerId=hoi-so` ⇒ EmptyState "Hội sở không có điểm chấm công (Q-04)" · `lg:grid-cols-2 gap-5`: trái `QrScreen` 240px; phải SectionCard "Điểm chấm công" `<dl>` (tên điểm · Định vị · "Mã mới sau 60s" · link "Sửa điểm chấm công" khi config) · dưới SectionCard "Lượt chấm hôm nay" (`today-taps.tsx`: gate view, `staffTimeLog` ACCEPTED hôm nay qua sdb, NHÂN SỰ | GIỜ | VÀO/RA | CỜ, PhanTrangBang) — **chỉ chế độ này**.
- **Trình chiếu** (`kiosk-stage.tsx`, 'use client'): `fixed inset-0 z-50 bg-background text-foreground` + `requestFullscreen?.().catch(() => {})`; Esc/nút "Thoát" (`absolute right-6 top-6` `BTN_OUTLINE h-11` `aria-label`). `grid h-full grid-cols-[3fr_2fr] gap-12 p-12`: trái `<img alt="QR chấm công" className="aspect-square w-full max-w-[min(70vh,720px)] rounded-2xl border-8 border-card bg-card p-4">`; phải `flex flex-col justify-center gap-6`: cơ sở `text-5xl font-bold`, điểm `text-3xl text-muted-foreground`, đồng hồ VN `text-6xl font-bold tabular-nums`, "Mã mới sau 42s" `text-3xl tabular-nums`, pill Định vị `text-2xl`, "Quét mã bằng điện thoại để chấm công" `text-4xl font-semibold text-primary-ink`. Thang 24–60px. **Không tên người, không in/tải.**
- **Chống chết lặng**: `validUntil = fetchedAt + windowSeconds × 3` (`KIOSK_VALID_WINDOWS = 3` khai trong `qr-screen.tsx`, không import `kiosk-token.ts`; **KHÔNG sửa API**); poll 30s `cache:"no-store"`; lỗi khi còn hạn ⇒ giữ QR + dải W `text-2xl` "Mất kết nối 14:03 — mã còn dùng tới 14:06"; quá hạn ⇒ `ErrorState` cỡ TV + Thử lại h-11 + tự thử 30s. **401** ⇒ "Phiên đăng nhập trên TV đã hết" + `/login?callbackUrl=…`; **403** ⇒ `NP("view","màn hình QR")`; **404** ⇒ EmptyState "CS1 chưa có điểm chấm công" + "Tạo điểm chấm công" (`/cham-cong/diem-cham` khi config, không thì "Báo Quản lý cơ sở"); **500** ⇒ "Máy chủ chưa cấu hình khoá ký mã". Tải đầu `Skeleton` vuông.
- **Rỗng 3 ca**: chưa chọn cơ sở; không cơ sở nào ⇒ NoPermission; chưa có điểm ⇒ như 404. GIỮ: `centerId`; gate view target; API shape + URL QR bất biến; poll <60s; `<img>` data URL; ALLOWLIST nav-coverage.

# 5. Trạng thái tải/lỗi theo route

| Thư mục | `loading.tsx` | `error.tsx` what / backHref |
|---|---|---|
| `cham-cong/` | ScopeBar + DayStrip + Kpi(5) + Table(7) | "bảng công ngày" / `/cham-cong/ky-cong` |
| `phan-ca/` | ScopeBar + Kpi(5) + GridSkeleton | "lưới phân ca" / `/cham-cong` |
| `phan-ca/import/` | stepper + FormSkeleton(3) | "màn import — file chưa được áp" / `/cham-cong/phan-ca` |
| `khung-ca/` | ConfigTabs + 2 TableSkeleton(8,5) | "khung ca tuần" / `/cham-cong` |
| `ky-cong/` | ScopeBar + Kpi(5) + 2 card + Table(13) | "kỳ công — số đã chốt không mất" / `/cham-cong` |
| `doi-soat/` | card `h-48` + card `h-24` + Table(7) | "đối soát" / `/cham-cong/ky-cong` |
| `danh-muc-ca/ loai-nghi/ diem-cham/ ghi-chu/` | ConfigTabs + TableSkeleton(10/7/8/6) | "danh mục" / `/cham-cong` |
| `lich-ca/` | MeNav + bar + TableSkeleton(8, 12) | "lịch ca của bạn" / `/dashboard` |
| `checkin/` | thẻ `max-w-sm` + 2 nút `h-14` | "trang chấm công — quét lại mã" / `/cham-cong/lich-ca` (KHÔNG nút Dashboard) |
| `man-hinh/` | ScopeBar + `aspect-square w-60` | "màn hình QR" / `/cham-cong` |
| `don-tu/` | ScopeBar + Kpi(4) + tab + Table(8) | "danh sách đơn" / `/dashboard` |
| `don-tu/cua-toi/` | MeNav + tab + Table(7) | "đơn của bạn" / `/cham-cong/lich-ca` |

# 6. Kiểm thử & lint

- **nav-coverage**: sidebar 5 href không lặp; 10 route rời sidebar được trỏ literal `href: "/…"` trong `module-nav.tsx`/`config-tabs.tsx`/`me-nav.tsx` + nút màn cha; ALLOWLIST giữ `/cham-cong/man-hinh`.
- **bang-coverage MIEN_TRU** (chỉ WU-07 sửa): GỠ `diem-cham/_components/location-form.tsx` (hết `<table`); GIỮ `danh-muc-ca/_components/template-editor.tsx`; GỠ `phan-ca/import/_components/import-wizard.tsx`; THÊM `…/import/_components/mapping-table.tsx` lý do "bảng ánh xạ phải nhìn HẾT 19–20 người để xác nhận một lượt, cắt trang là bỏ sót" + `…/import/_components/result-diff-table.tsx` lý do "đối chiếu ≤21 mã ca chuyển vị, phải thấy trọn để kết luận khớp/lệch". Mọi file mới có `<table` bọc `<PhanTrangBang cuonNgang>` CÙNG file.
- **page-gates**: PAGE_GATES không đổi; `GATE_MISMATCH_ALLOWLIST` rỗng; `redirect(` câm ⇒ `return <NoPermission/>`; không đưa `hr_attendance:*` (trừ checkin) vào PAGE_GATES. **menu-permissions**: giữ shape 5 mục. **rbac-scope R1**: `loadModuleScope` action biến + target; literal có target ở kiosk API, checkin `{centerId:null}`, holidays; không in mẫu gọi vào JSX. **no-inline-authz**: không thêm/sửa `_actions.ts`; không action mới; so `centerId` UI ở page/`module-scope.ts`; không xin allowlist.
- **Test mới**: `lib/cham-cong/{flag-labels,scope-href,request-effect}.test.ts` · `components/admin/cham-cong/module-nav.test.tsx` · `components/cham-cong/ui/{shift-code-chip,sheet-file-picker}.test.tsx`.
- **Thứ tự lệnh**: `pnpm exec prisma generate` → `pnpm typecheck` → `pnpm lint` → `pnpm vitest run components/admin/nav-coverage components/ui/bang-coverage lib/auth/page-gates lib/auth/menu-permissions lib/auth/rbac-scope lib/eslint lib/cham-cong components/admin/cham-cong components/cham-cong "app/(admin)/admin/cham-cong" "app/(admin)/admin/don-tu"` → `node .claude/skills/impeccable/scripts/detect.mjs --json` 4 thư mục module (một lần, cuối) → grep `amber-|sky-|violet-|rose-|orange-|text-white` = 0; grep `primary-soft|primary-ink|primary-dark` trong `components/cham-cong` = 0 → `pnpm build` ở REPO CHÍNH → smoke 1280px × 2 vai + 375px (checkin, cua-toi) + 1920px (man-hinh) + 2 màn GV → test.satarobo.vn.

# 7. Kế hoạch thi công song song

Luật: một file **đúng một** chủ; dùng chung xong trước; không WU nào sửa `_actions.ts`, `lib/cham-cong/*` (ngoài WU-00), `lib/auth/*`, `proxy.ts`, `route-policy.ts`, API route. Mỗi WU màn hình sở hữu page/loading/error của thư mục mình (từ `app/(admin)/admin/`) + `_components/*` liệt kê. Ước = giờ agent.

| WU | Tên | File SỞ HỮU (rời nhau) | Phụ thuộc | Ước |
|---|---|---|---|---|
| WU-00 | Lib thuần | `lib/cham-cong/{module-scope,scope-href,flag-labels,request-effect}.ts` + 3 test | — | 4h |
| WU-01 | Atom dùng chung | `components/cham-cong/ui/{flag-chip,shift-code-chip,day-type-pill,sheet-file-picker}.tsx` + 2 test | WU-00 | 4h |
| WU-02 | Vỏ admin | `components/admin/cham-cong/{classes.ts,scope-bar,module-nav,config-tabs,me-nav,day-strip,period-status-pill,kpi-strip,section-card,skeletons,route-error,shift-cell-picker}.tsx` + `module-nav.test.tsx` | WU-00, WU-01 | 8h |
| WU-03 | Sidebar 5 mục | `components/admin/sidebar.tsx` | merge SAU WU-02 | 1h |
| WU-04 | Bảng công ngày | `cham-cong/` + `_components/day-detail-sheet.tsx` (xoá `override-cell`, `date-nav-input`) | WU-01, WU-02 | 8h |
| WU-05 | Lưới tháng | `cham-cong/phan-ca/` + `_components/{month-grid,generate-dialog}.tsx` | WU-01, WU-02 | 8h |
| WU-06 | Khung ca + Ghi chú | `cham-cong/khung-ca/` + `pattern-grid.tsx`; `cham-cong/ghi-chu/` + `{note-manager,note-form}.tsx` | WU-02, WU-05 (generate-dialog) | 8h |
| WU-07 | Import + sổ sách | `cham-cong/phan-ca/import/` + `{import-wizard,stepper,mapping-table,result-diff-table,import-log}.tsx`; **`components/ui/bang-coverage.test.ts`** (MIEN_TRU §6) | WU-01, WU-02; **merge SAU WU-10** | 8h |
| WU-08 | Kỳ công & chốt | `cham-cong/ky-cong/` + `{period-panel,lock-dialog,unfinished-list,period-table}.tsx` | WU-01, WU-02 | 8h |
| WU-09 | Đối soát | `cham-cong/doi-soat/` + `{reconcile-panel,diff-table,week-calendar}.tsx` | WU-01, WU-02 | 6h |
| WU-10 | 3 màn danh mục | `cham-cong/danh-muc-ca/` + `{template-table,template-sheet,template-editor}.tsx`; `cham-cong/loai-nghi/` + `leave-type-list.tsx`; `cham-cong/diem-cham/` + `{location-form,location-table}.tsx` | WU-01, WU-02 | 10h |
| WU-11 | Cụm cá nhân + form chung | `cham-cong/lich-ca/`, `cham-cong/checkin/`, `don-tu/cua-toi/`; `components/cham-cong/{checkin-client,my-requests,request-form}.tsx`; smoke 2 màn GV | WU-01, WU-02 | 10h |
| WU-12 | Duyệt đơn | `don-tu/` + `{work-request-review,request-queue-table,request-sheet}.tsx` | WU-00, WU-01, WU-02 | 8h |
| WU-13 | Kiosk | `cham-cong/man-hinh/` + `{qr-screen,kiosk-stage,today-taps}.tsx` | WU-01, WU-02 | 6h |
| WU-14 | Nghiệm thu & tài liệu | `docs/cham-cong/KE-HOACH-CHAM-CONG-v3.md` (Pha B), `guides.generated.ts` bài 08, `CLAUDE.md` mục sidebar; chạy §6 | tất cả | 4h |

Sóng: WU-00 → WU-01 ∥ WU-02 → WU-03 + WU-04…13 song song (WU-06 sau WU-05; WU-07 merge sau WU-10) → WU-14. ≈ 101h; 5 người ≈ 3 ngày.

# 8. Điều KHÔNG làm & rủi ro

**Anti-goal**
- Không đổi/gộp route, không segment cấp 1 mới, không stub redirect; tham số `date/coSo/ky/month/centerId/status/type/w/t` giữ nguyên nghĩa — chỉ THÊM (`loc`, `q`, `id`, `date`@cua-toi, `ky`@doi-soat, `coSo`@khung-ca/ghi-chu).
- Không Server Action mới (kể cả "Rút đơn"), không đổi chữ ký action/lib, không `dryRun` import, không sửa API `qr-token`; không `hr_attendance:*` vào PAGE_GATES; không grant DENY; không đọc `session.user.centerId`; không sửa hàm active sidebar.
- Không thư viện mới (kể cả `shadcn add popover`); không Framer/Magic; không gradient/hex rời; không emoji thay icon; không `Button variant="outline"` trần; không card lồng card/spinner/animate bảng; không duyệt lạc quan; không Hoàn tác; không tên người/in QR trên TV; không đường ghi ở đối soát; atom `components/cham-cong/**` KHÔNG dùng `primary-soft/ink/dark`, KHÔNG import `components/admin/**`.

**Rủi ro & cách đỡ**
- `loadModuleScope` 21 `checkPermission`/request — WU-04 đo TTFB `/cham-cong`; >100ms thêm `only`.
- Hai WU chạm `bang-coverage.test.ts` — WU-07 merge sau WU-10.
- `request-form`/`checkin-client` mount ở site GV: `.teacher-root` không có `--primary-soft`, `:root --primary-ink` cam — WU-11 smoke 2 màn GV.
- Prod RBAC v2 ≠ local v1 — smoke test.satarobo.vn với CENTER_ACCOUNTANT và HO_HR; DB test ≠ DB máy.
- `SelectValue` base-ui in giá trị thô — dùng native `<select>`; `text-destructive-foreground` không tồn tại — dùng `BTN_DANGER`.
- Worktree tên có dấu có thể làm `next build` panic — build ở repo chính; RSC → client chỉ dữ liệu phẳng (giờ VN format ở server), không truyền hàm.
