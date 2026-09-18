# CLAUDE.md — Sata Robo VN

Brand hub + admin CMS + portal phụ huynh + site giáo viên cho Sata Robo (Đà Nẵng). 4 site / 4 domain (public `satarobo.vn`, admin `admin.satarobo.vn`, portal `hocvien.satarobo.vn`, teacher `giaovien.satarobo.vn` — BGĐ duyệt 04/07/2026, 2-phase flag `TEACHER_SITE_ENABLED`) chạy chung 1 app Next.js, chia route group `app/(public)/`, `app/(legacy)/`, `app/(admin)/admin/`, `app/(portal)/portal/`, `app/(teacher)/teacher/`, `app/(auth)/`.

> ⭐ **BLUEPRINT CHỐT:** [`Document/2-architecture-design/15-final-architecture-blueprint.md`](Document/2-architecture-design/15-final-architecture-blueprint.md) là nguồn kiến trúc đúng nhất. Khi xung đột giữa "hiện trạng" trong file này và Doc 15 → **Doc 15 thắng cho việc xây MỚI**. File CLAUDE.md mô tả hiện trạng repo + hướng chuyển dịch (mục "Kiến trúc đích" cuối file). Kế hoạch thực thi theo phase: [`Document/0-yeucau/3-ke-hoach-trien-khai/phases/`](Document/0-yeucau/3-ke-hoach-trien-khai/phases/README.md) (A0 → R5).

## Tech stack (FROZEN — đừng đổi nếu không hỏi)

- Next.js 16 App Router · React 19 · TypeScript strict
- Tailwind v4 · shadcn/ui · Magic UI (client only) · Framer Motion / Motion (client only) · Recharts (admin only)
- PostgreSQL (Supabase) · Prisma 5 · Auth.js v5 · Cloudflare R2 storage
- Resend (email) · Upstash Redis (rate limit) · Sentry (server+edge) · pnpm 11 · Vercel (region hnd1) + Cron
- **KHÔNG microservice** — modular monolith (Doc 15 Q1). KHÔNG message broker — dùng DB-backed queue + Vercel Cron.

## Critical conventions

1. **Server-first** — default Server Component. `'use client'` chỉ khi cần state/effect/handler. Data fetch trong RSC (`async`), mutations qua Server Actions (`'use server'`).
2. **Strict TS** — không `any` (dùng `unknown` + narrow). Zod schema là source of truth → suy ra type qua `z.infer`.
3. **Route groups** — public: `app/(public)/...`, legacy: `app/(legacy)/...`, admin: `app/(admin)/admin/...`, portal: `app/(portal)/portal/...`, teacher: `app/(teacher)/teacher/...` (L5 — site GV **ĐÃ LIVE**: flag `TEACHER_SITE_ENABLED` mặc định **ON** từ 10/07/2026 (`lib/flags.ts:86`), host `giaovien.satarobo.vn` **đã wire** trong `proxy.ts:18`; rollback = set env `TEACHER_SITE_ENABLED="false"`), auth: `app/(auth)/login/...`, **nhập khách: `app/(admin)/admin/nhap-khach-hang/`** (23/08/2026 — DỜI VÀO ADMIN, đảo chốt 22/08 vốn để nó ở host public: mục sidebar bấm vào là văng khỏi khung admin. Địa chỉ `admin.satarobo.vn/nhap-khach-hang`; đường public cũ đá 307 về đây. Giao diện + action + loader dùng chung ở `components/lead-intake/` + `lib/lead/intake/` để site Sale sau này mount lại). Không tạo `/admin/*` ngoài route group. Host-based routing qua `proxy.ts` + `lib/auth/route-policy.ts` (sửa rule host×role CHỈ ở `decideRoute()` + test, không sửa proxy.ts).
4. **Imports** — `@/lib/auth` (Auth.js), `@/lib/utils` (cn helper), `@/components/blog/markdown-renderer` (NOT `<Markdown>`). ⚠️ **Cổng DB ĐÃ ĐÓNG** (không còn là "target"): import `@/lib/db` trần trong `app/(admin|portal|teacher|sale)/** + components/lead-intake/**` = ESLint **error**. Đi qua `scopedDb(actor)` (admin/teacher) hoặc `portalDb` (portal). Allowlist exception ở `lib/eslint/db-import-allowlist.mjs` — mở file để biết còn những file nào; code mới KHÔNG xin thêm vào.
5. **Auth gate** — admin/portal layout đã redirect `/login`. Server Actions/API route VẪN phải `auth()` + `assertCan(...)` ngay đầu function (layout gate là chưa đủ). Portal actions thêm ownership check `assertOwnsStudent`. **RBAC 2 tầng:** quyền action = `can()` v2 động từ DB (`@/lib/auth/can`) — **đang enforce trên prod** vì `RBAC_V2_ENABLED="true"` trên Vercel Production (xác minh 29/07/2026); v1 matrix tĩnh (`@/lib/auth/permissions`) chỉ còn chạy song song để so lệch, và là thứ chạy ở local/dev (mặc định trong code vẫn OFF — `lib/flags.ts:8`).
   ⚠️ **`scopedDb` KHÔNG che write** — chỉ auto-scope các method ĐỌC (danh sách ở `lib/db-scope.ts`). Mọi `update/delete` phải tự `passesScope()`; mọi `create` trên model thuộc `SCOPED_MODELS` phải set `centerId` (quên = record vô hình với actor cấp cơ sở).
6. **Prisma migrations** — ⛔ **CẤM `prisma migrate dev` (= `pnpm db:migrate`) trên repo này cho tới khi drift được đóng [08/09/2026].** Viết SQL tay vào `prisma/migrations/<yyyyMMddHHmmss>_<ten_snake_case>/migration.sql` + sửa `schema.prisma` cho khớp + `prisma migrate deploy`. Sau migration: `prisma generate` và restart dev server (Prisma Client cache stale trong memory).
   **Vì sao cấm:** đo 08/09/2026 — repo đang **lệch sẵn giữa `prisma/migrations` và `schema.prisma` ở 14 bảng** (`Timestamptz` vs `Timestamp(3)` trên ClassSessionMedia · CoinRuleConfig · EvalForm · EvalResponse · EvaluationRound · HomeworkAssignment · Lesson · LessonChangeRequest · ReportCard · ReportCardCriterion · ScormAccessLog · ScormPackage; `ScopeShadowDiff.dataScope` thừa; thiếu `OrgUnit_path_idx`). `migrate dev` sẽ **tự sinh một migration "sửa kiểu cột"** cho 14 bảng đó và nó trông vô hại trong diff — merge vào là ALTER hàng loạt trên bảng có dữ liệu PROD, vi phạm luật cứng #4. **Không cổng nào canh**: không workflow nào so schema với migrations (`prod-db-status.yml:50` chỉ hạ xuống `::warning`).
   **Kiểm drift AN TOÀN** (không reset gì — chỉ `--from-url`, TUYỆT ĐỐI không `--from-migrations --shadow-database-url` vì lệnh đó RESET DB đích, đã xoá sạch DB dev/test 26/08):
   ```bash
   DB=drift_check; createdb -U postgres -h 127.0.0.1 "$DB"
   URL="postgresql://postgres:postgres@127.0.0.1:5432/$DB"
   DATABASE_URL="$URL" DIRECT_URL="$URL" pnpm exec prisma migrate deploy
   DATABASE_URL="$URL" DIRECT_URL="$URL" pnpm exec prisma migrate diff \
     --from-url "$URL" --to-schema-datamodel prisma/schema.prisma --script
   dropdb -U postgres -h 127.0.0.1 "$DB"
   ```
   Diff **rỗng là không thể** cho tới khi drift đóng — điều cần đạt là **0 dòng nhắc bảng mình vừa thêm**. Đóng drift phải quyết **từng bảng một** là schema đúng hay migration đúng ⇒ ticket riêng, đừng nhét vào việc đang làm.
7. **UI library split** (Phase 4.X.1): admin = shadcn/ui + Recharts; client = shadcn/ui + Magic UI + Framer Motion. ESLint chặn cross-import — đừng workaround.
8. **Security — hook `PreToolUse` ĐANG SỐNG (đo lại 09/09/2026, có test).**
   Danh sách cắm thật ở `.claude/settings.json`, khoá `hooks.PreToolUse`:

   > ⚠️ **Dòng "ENFORCED by hooks" ở đây đã NÓI DỐI nhiều tháng.** `block-env-add.sh` và
   > `block-destructive.sh` cùng chết vì HAI lỗi: (1) đọc `cmd="${CLAUDE_COMMAND:-}"` —
   > biến đó **không tồn tại**; PreToolUse đưa JSON qua **STDIN**, chuỗi lệnh nằm ở
   > `.tool_input.command`; (2) chặn bằng `exit 1`, mà Claude Code chỉ coi **`exit 2`** là
   > CHẶN. Hai lỗi che nhau: sửa lỗi (1) mà quên (2) thì hook in ra `BLOCKED` rất thuyết
   > phục rồi vẫn cho lệnh chạy — **chỉ mã thoát mới là bằng chứng.**
   > **Vá 09/09/2026**, kèm `.claude/hooks/hooks.test.ts` — chạy hook THẬT với JSON thật
   > trên stdin và đọc MÃ THOÁT (số ca: `pnpm exec vitest run .claude/hooks`), và đã cấy
   > lại cả hai lỗi gốc để thấy nó đỏ. Luật 14 —
   > `docs/luat-doc-so-va-ket-luan.md`.

   | Hook | Chặn gì | Tình trạng |
   |---|---|---|
   | `block-env-add.sh` | `git add .env*` (chỉ `.env.example` được qua) | **vừa cứu 09/09/2026** |
   | `block-destructive.sh` | mẫu lệnh phá dữ liệu (liệt kê dưới; nguồn: mảng `patterns` trong chính file) | **vừa cứu 09/09/2026** |
   | `chan-commit-khi-do.sh` | `git commit` khi `typecheck` hoặc `vitest related` ĐỎ | mới, sống từ 09/09/2026 |

   **`block-destructive.sh` chặn** (nguồn: mảng `patterns` + ba khối `prisma` trong chính file): `rm -rf` vào `/` · `rm -rf` vào `~` ·
   `git push --force` nhắm `main` · nhắm `master` · `git reset --hard` · `git clean -fd` · `DROP TABLE` ·
   `DROP DATABASE` · `TRUNCATE TABLE` · `prisma migrate diff --shadow-database-url` trỏ DB **không**
   local · `prisma db push --force-reset` thiếu marker local · `prisma migrate reset`
   thiếu marker local. (Marker local = chuỗi lệnh có `localhost` / `127.0.0.1` /
   `.env.test` / `satarobo_test` / `ci_test`.)

   ⚠️ **Hai giới hạn phải biết, đừng tin quá:**
   · Hook chỉ soi **chuỗi lệnh ở tầng trên** — `bash mot-file.sh` thì nội dung file
     KHÔNG đi qua hook.
   · Nó khớp cả **văn xuôi**: một câu `echo` mô tả mẫu chặn cũng bị chặn dù chẳng phá gì.
     Gặp thì đưa kịch bản ra file rồi chạy file, đừng gỡ mẫu.

   - NEVER `git add .env*` files (only `.env.example` allowed) — hook chặn (**đã kiểm**).
   - NEVER commit `*.bak`, `*.backup`, `*.key`, `*.pem` — `.gitignore` block.
     ⚠️ `.gitignore` **KHÔNG** chặn `vapid-keys.txt` / `vapid.json` — đừng `git add -A`.
   - NEVER hardcode credentials — luôn `process.env.X`.
   - NEVER paste real secrets vào chat — mask `abc1...xyz9`.
   - **KHÔNG `git commit --no-verify`.** Nó bỏ qua git hook. Hook Claude Code thì không
     thoát được, nhưng thói quen gõ nó là thói quen đi vòng qua cổng — bỏ hẳn.
   - File nghi ngờ nhạy cảm → ASK user, don't commit.
9. **Verify trước khi báo PASS** — `pnpm typecheck && pnpm lint && pnpm build` PASS. UI changes: smoke test localhost + mobile viewport 375px.
10. ⚠️ **PR có BẤT KỲ tệp `.ts`/`.tsx` nào ⇒ chạy ĐỦ BỐN CỔNG** (`typecheck` · `lint` ·
    `test:unit` · bộ e2e liên quan). **KHÔNG xét PR "thuộc loại gì".** Nhãn "chỉ tài liệu"
    chỉ đúng khi `git diff --name-only` ra **toàn `.md`** — kiểm bằng lệnh đó, đừng kiểm
    bằng trí nhớ về việc mình vừa làm gì.
    **Vì sao (17/09/2026):** PR #282 mở ra với nhãn "chỉ tài liệu" nhưng kèm một script
    `.ts` chỉ-đọc; tôi bỏ `test:unit`. Lưới `lib/finance/truc-a.test.ts` quét **toàn cây
    mã nguồn** nên bắt ngay, và CI đỏ — phát hiện muộn hơn nửa tiếng. Các lưới quét cây
    (`truc-a`, `nav-coverage`, `affordance-coverage`, `bang-coverage`, `dang-ky-cron`)
    **không quan tâm bạn sửa file nào**; chúng đỏ vì một tệp MỚI xuất hiện.
11. ⚠️ **Prop cờ tính năng có mặc định `false` mà KHÔNG AI TRUYỀN = lỗi CÂM.** Không lỗi
    biên dịch (prop tuỳ chọn), không ca test nào đỏ, và triệu chứng là "mục menu biến mất"
    — trông y hệt lỗi phân quyền vì cổng `perm` nằm ngay cạnh trong cùng khai báo mục.
    **Thêm một mục sidebar gắn `flag:` thì PHẢI kèm ĐỦ DÂY NỐI**
    `app/(admin)/admin/layout.tsx` → `components/admin/admin-shell.tsx` →
    `components/admin/sidebar.tsx`, **và một lưới ghim cho chính dây nối đó**.
    Lưới đang có: `components/admin/sidebar-flag-wiring.test.ts` (`[SB-FLAG]`) — nó soi
    **mọi** cờ, nên thêm cờ mới mà quên nối là đỏ ngay; đừng gỡ nó.
    **Vì sao (17/09/2026):** mục "Zalo CRM" khai `flag: "zalocrm"` từ 06/09 và **chưa từng
    hiện được với bất kỳ ai** — `layout.tsx` truyền ba cờ, bỏ sót cờ thứ tư. Nó còn làm ca
    nghiệm thu "Giáo vụ KHÔNG thấy mục Zalo CRM" **ĐẠT vì lý do sai**.
    ⇒ Hệ quả rộng hơn: **ca nghiệm thu chỉ khẳng định SỰ VẮNG MẶT luôn ĐẠT khi tính năng
    hỏng hoàn toàn.** Mọi ca "KHÔNG thấy X" phải kèm **đối chứng dương** ("vai kia THẤY X").

12. ⚠️ **GIẢ ĐỊNH VỀ MÔI TRƯỜNG PHẢI KIỂM BẰNG LỆNH, TẠI THỜI ĐIỂM DÙNG — KHÔNG đọc từ
    tài liệu.** DB nào · env nào · chạy ở đâu · cờ bật hay tắt: hỏi hệ thống, đừng hỏi
    trang wiki. Tài liệu hạ tầng cũ đi mà **không ai biết nó đã cũ**, và một câu sai ở đó
    không chỉ vô ích — nó **lái cuộc điều tra sang hướng sai và giữ ở đó**.
    **Sự cố 17/09/2026:** câu "DB của env `test` CHÍNH LÀ DB dev" (chốt 01/08, nằm ngay
    trong file này) làm tôi đo `getZaloScope` ba lượt trên **sai database**, rồi đi tìm
    "`User.id` bị đổi" trong khi thứ thật sự xảy ra là **ba database khác nhau**. Mất
    nhiều lượt mới quay lại được.
    **Cách kiểm rẻ, dùng ngay:**
    · DB nào đang được đọc → in ra chính nó: `select current_database()`, hoặc một
      giá trị đặc trưng (`User.id` của một tài khoản seed) rồi so hai bên.
    · Cờ tính năng trên một môi trường → gọi một đường có thật và đọc **mã trạng thái**
      (bảng đo ở `docs/tich-hop-zalocrm/04-danh-sach-cho-nick-zalo.md`: `401`+JSON = route
      có + cờ BẬT · `404`+JSON = cờ TẮT · `200`+HTML = sai đường dẫn).
    · Commit nào đang chạy → đọc **bản ghi deploy thật** (`gh api …/deployments`), đừng
      suy từ "vừa merge xong".
    · Cron nào thật sự chạy → `gh run list` + đọc **nhánh** của lượt chạy (`schedule` luôn
      dùng bản ở nhánh MẶC ĐỊNH — xem `NỢ-5`).
    Đo xong mà lệch với tài liệu thì **sửa tài liệu ngay trong lượt đó**, đừng để lại cho
    người sau vấp đúng chỗ mình vừa vấp.

13. ⚠️ **VÁ GẤP CŨNG ĐI QUA `test` — rồi CHERRY-PICK lên `main`. KHÔNG vá thẳng `main`.**
    (Chủ dự án chốt 17/09/2026, phương án A.)
    Luồng: `hotfix → PR vào test → CI xanh → merge test → cherry-pick commit ấy lên main`.
    Chậm hơn ~20 phút CI, và đổi lại `test` **luôn là tập cha** của `main`, nên PR
    `test → main` không bao giờ phải gộp hai chiều.
    **Vì sao — giá đo được, và nó KHÔNG tuyến tính:**
    · 16/09/2026 — để phân kỳ tích lại **463 commit / 215 file xung đột**. Lượt hợp nhất
      suýt làm mất **BẢY tính năng**, ba trong số đó là bảo mật (S-9 đồng hồ SLA, S-1 che
      PII ở 6 màn, `canSearchPhone`). Không cái nào bị phát hiện bằng mắt — **chỉ test bắt
      được**, và chỉ vì có test.
    · 17/09/2026 — bốn PR vá thẳng `main` trong MỘT ngày ⇒ lại **94 commit** phân kỳ,
      phần lớn đụng đúng vùng vừa gỡ xung đột (Lớp trial, lead).
    Hai lượt cách nhau một ngày. Mỗi lần vá thẳng `main` là mua thêm một lượt hợp nhất
    hai chiều, và chi phí của nó tăng theo độ lệch chứ không theo số lần vá.
    **Nếu buộc phải vá thẳng `main`** (prod đang hỏng, không chờ được CI): mở PR
    `main → test` **ngay trong ngày**, đừng để sang hôm sau.

14. ⚠️ **LƯỚI PHẢI ĐƯỢC CẤY LẠI ĐỊNH KỲ, KHÔNG CHỈ LÚC VIẾT RA. Một lưới chưa bao
    giờ đỏ là một lưới CHƯA ĐƯỢC CHỨNG MINH.** (Chốt 18/09/2026.)
    Lưới xanh có hai nghĩa — "mã đúng" và "lưới không chạm tới mã" — và chúng trông
    **y hệt nhau** trong log CI. Khác biệt chỉ lộ ra khi cấy lỗi vào.
    **Sự cố sinh ra luật này** — lượt rà sau hợp nhất 18/09 cấy 8 phép, tìm ra **HAI
    lưới đã chết mà vẫn xanh, cả hai là cổng PII**:
    · **S-1** (`lib/lead/lead-pii-callsites.test.ts`) hỏi
      `toContain("maskLeadPiiFields")` — chuỗi đó có mặt trong **dòng `import`**, nên
      gỡ HẲN lời gọi mà quên gỡ import thì lưới VẪN XANH. Đo được: cấy
      `const piiLead = lead;` ⇒ **42/42 ca xanh** trên mã đã hỏng. Vá: neo theo **lời
      gọi** `maskLeadPiiFields(`.
    · **`canSearchPhone`** (`app/(admin)/admin/lop-trial/_lib/filters.test.ts`) chỉ
      thử nhánh `true`. Cổng `opts.canSearchPhone === true ? … : []` có trong mã nhưng
      **không có khoá**: cấy `true ?` (ai cũng tìm được theo SĐT) không làm ca nào đỏ.
      Vá: thêm `[LOC-PII]` đo CẢ hai đầu vào (không khai, và `false`).
    Cả hai đã sống nhiều tuần trong một repo có kỷ luật "cấy thử trước khi tin", vì
    kỷ luật ấy chỉ áp **lúc viết lưới**. Lưới không mục theo thời gian — **mã quanh nó
    đổi**, và lượt đổi làm lưới mất răng thường không đụng vào tệp lưới.
    **Cách làm định kỳ — chọn một, đừng bỏ trống cả hai:**
    · **Mỗi lượt GỘP NHÁNH** (`main` ↔ `test`) chạy một lượt cấy cho các cổng bảo
      mật/tiền: S-1 · S-9 · `canSearchPhone` · cổng PII khác · đường tiền ra. Đây là
      lúc rẻ nhất, vì đang phải rà rồi — và cũng là lúc mã quanh lưới vừa đổi nhiều
      nhất. Khuôn kịch bản: đọc tệp → cấy → chạy → **khôi phục byte-exact** → so TẬP
      MÃ CA đỏ với tập mong đợi.
    · **Hoặc một job riêng chạy hằng tuần** trên `test`, đỏ thì mở issue. Đắt hơn để
      dựng, nhưng không phụ thuộc vào việc có ai nhớ hay không.
    ⚠️ **Ba điều kiện để phép cấy nói thật** (cả ba đều đã trả giá):
    (a) **khôi phục byte-exact** — đọc/ghi `newline=""`, rồi `assert` nội dung bằng
        bản gốc; python mặc định dịch CRLF và "khôi phục" thành SỬA TỆP;
    (b) **đòi ≥1 dòng đỏ THẬT**, đừng tin mã thoát — chạy sai cwd cũng exit 1 và
        trông y hệt đỏ thật;
    (c) **so ĐÚNG TẬP MÃ CA** đỏ với tập mong đợi. "Đỏ cả bộ" không chứng minh lưới
        nào đang làm việc. Và nếu bộ so khớp của bạn sai thì nó báo "lưới đã chết"
        cho một lưới đang khoẻ — đã xảy ra hai lần trong ngày 18/09, nên **đọc kỹ
        danh sách ca đỏ in ra trước khi kết luận**.

## Project structure (FROZEN)

```
app/
├── (public)/          # /, /khoa-hoc, /vinh-danh, /tin-tuc, /tuyen-dung, /lien-he, ...
├── (legacy)/          # landing khóa học cũ
├── (admin)/admin/     # /admin/dashboard, /admin/leads, /admin/honors, /admin/nhan-su, ...
├── (portal)/portal/   # cổng phụ huynh: /portal/ho-so, /portal/bai-thi, /portal/yeu-cau, ...
├── (teacher)/teacher/ # site giáo viên (L5): /teacher (việc chưa xong), /teacher/lich, /teacher/lop — flag TEACHER_SITE_ENABLED
├── (auth)/login/      # cổng login (target: chung satarobo.vn/login → redirect theo role)
└── api/               # /api/leads, /api/admin/upload-url, /api/cron/*, /api/public/webhook/*, /api/auth/...

components/
├── ui/                # shadcn base (shared)
├── magic/             # Magic UI — CLIENT only (ESLint enforced)
├── motion/            # Framer Motion wrappers — CLIENT only
├── charts/            # Recharts wrappers — ADMIN only
├── admin/             # admin-specific
├── public/            # header, footer, ga4, meta-pixel
├── honors/            # vinh-danh page sections
├── blog/              # blog cards, markdown renderer, share
├── jobs/              # tuyển dụng cards
└── seo/               # JSON-LD schemas

lib/
├── db.ts              # Prisma singleton — KHÔNG import trần trong app/(admin|portal|teacher) (ESLint error)
├── db-scope.ts        # scopedDb(actor) + passesScope() — ⚠️ chỉ auto-scope READ, write phải tự guard
├── org/               # OrgUnit tree
├── auth.ts            # Auth.js config
├── auth/permissions.ts # can() v1 matrix TĨNH — đang enforce trên prod
├── auth/actor.ts · can.ts # can() v2 động (DB) — cờ RBAC_V2_ENABLED: code mặc định OFF, PROD đang ON
├── auth/route-policy.ts # decideRoute() host×role (unit-tested)
├── events/            # DomainEvent outbox + dispatcher — publishEvent(type, payload, {tx, dedupeKey})
├── actions/factory.ts # ActionResult + ActionError + pipeline auth→actor→zod→can→scopedDb→audit
├── audit/             # log helpers (target: AuditLog hợp nhất 1 bảng)
├── email/             # Resend client, queue, triggers
├── storage/           # R2 client + upload-config
├── pdf/               # certificate / transcript / progress-report (@react-pdf)
├── honors/ · validators/ · seo/ · utils.ts
# ❌ `modules/*` (modular monolith boundary) CHƯA TỒN TẠI — đừng import `modules/integration`.

prisma/
├── schema.prisma      # (target: tách multi-file prisma/schema/*.prisma — Doc 15 Q5)
├── migrations/        # NEVER edit applied migrations
└── seed*.ts
```

## Permission & tổ chức

**Hiện trạng (`lib/auth/permissions.ts`):**
- **Vai** — enum `Role`, nguồn ở `prisma/schema.prisma`: `SUPER_ADMIN`, `CENTER_MANAGER`, `HR`, `SALES_CSM`, `TEACHER`, `TRAINING`, `MARKETING`, `ACCOUNTANT`, `PARENT`. (Đã rename `MANAGER→CENTER_MANAGER`, `SALES→SALES_CSM` — legacy shim trong JWT callback. `TRAINING` thêm ở FL W0 (QĐ-T1) — Đào tạo: quản lý TOÀN BỘ LMS, KHÁC `TEACHER` chỉ lớp được giao.)
- ⚠️ **RBAC v2 ĐÃ BẬT TRÊN PROD** — `RBAC_V2_ENABLED="true"` trên Vercel Production (xác minh 29/07/2026 bằng `vercel env pull --environment=production`). Prod enforce **v2 động** (`lib/auth/can.ts`); `lib/auth/shadow-compare.ts:27` trả `flagOn ? v2 : v1`. **Mặc định trong code vẫn OFF** (`lib/flags.ts:8`) ⇒ local/dev/CI chạy **v1**, khác prod — đừng kết luận hành vi quyền từ máy local. Rollback: set env `false` + redeploy.
- ⚠️ **Nợ đi kèm việc flip: `can()` v2 KHÔNG có nhánh DENY.** `lib/auth/can.ts:36-44` là ALLOW-wins thuần, `grantsDeny` không tồn tại ⇒ `UserPermissionGrant` có `grant=DENY` sẽ **bị bỏ qua im lặng**. Đây là 1 trong 3 việc chặn cứng của QĐ-B (`docs/taicautruc/QUYET-DINH.md:52-58`) mà cờ đã bật trước khi làm xong. **Chưa gây thiệt hại:** đo prod 29/07/2026 → bảng `UserPermissionGrant` **rỗng** (0 ALLOW, 0 DENY). **Luật tạm cho tới khi vá:** KHÔNG tạo grant `DENY` — nó không có tác dụng và không báo lỗi. Cần chặn quyền thì gỡ `UserOrgRole` tương ứng.
- Multi-role: `User.roles[]` (quyền = union). Per-user grant ALLOW/DENY: `UserPermissionGrant` (Sprint 5.3). `User.centerId` scope theo cơ sở.
- ⚠️ **VAI QUAN HỆ — ngoại lệ có chủ đích của luật "quyền chỉ từ `UserOrgRole`"** (`RELATIONSHIP_ROLE_CODES` trong `lib/auth/actor.ts`, hiện chỉ có `PARENT`). Phụ huynh **không đứng ở đâu trong cây OrgUnit**, nên quyền của họ nạp thẳng từ `RoleDef` theo `User.role`/`User.roles`, KHÔNG cần dòng `UserOrgRole` nào. Các permission này **cố ý không** đóng góp vào `isHoLevel`/`visibleCenterIds`/`visibleOrgUnitIds` và mang `centerScope: null` (scope CENTER không bao giờ khớp — fail-closed).
  **Vì sao có luật này** (sự cố 10/08/2026, đo trên test lẫn prod): phụ huynh không gửi được tin nào — `PERMISSION_DENIED` — vì **114 tài khoản PARENT / 0 dòng `UserOrgRole`**; `reconcileUserOrgRoles` chỉ được gọi từ 3 màn quản trị nhân sự, luồng cấp tài khoản PH không gọi. Lỗi ẩn kỹ vì đường ĐỌC chat kiểm theo tư cách thành viên hội thoại chứ không qua `can()` ⇒ PH vào đọc bình thường, chỉ không gửi được. Vá bằng cách gắn `UserOrgRole` cho từng PH đã bị LOẠI: phải backfill 114 tài khoản cũ + nhớ mãi cho tài khoản mới, và gắn ở ROOT còn biến PH thành HO-level thấy mọi cơ sở.
  **RoleDef vẫn là nơi duy nhất định nghĩa PH được làm gì** — sửa quyền PH = sửa `prisma/seed-roles.ts` rồi chạy seed, y hệt mọi vai khác. Muốn thêm một vai quan hệ mới thì thêm code vào `RELATIONSHIP_ROLE_CODES`, đừng chế cơ chế thứ hai.
- Field-level visibility (Employee): `basic` (all), `contact` (SUPER_ADMIN/CENTER_MANAGER/HR), `salary` (SUPER_ADMIN/HR/ACCOUNTANT), `personal` (SUPER_ADMIN/HR). `canViewParentContact` chặn TEACHER.
- Pattern: `can(session.user, 'employees:edit')` → boolean; `assertCan(...)` throw trong Server Actions/API.

**Target (Doc 15 §2 — A0, đã chốt §11 Open Items) — dùng cho việc xây MỚI:**
- ⚠️ **HÌNH CÂY ĐÃ ĐỔI 11/08/2026 (Nền Hệ thống P1 · US-05).** Chủ dự án chốt lấy **BA 08/08 §1.1** làm chuẩn (README bàn giao §1: "xung đột ở đâu → BA thắng"):
  ```
  HO (gốc, depth 0)  →  REGION (khối tỉnh/TP)  →  CENTER (cơ sở)
  path: "/ho/danang/cs1/"
  ```
  ~~ROOT(SataRobo) → HO, CS1, CS2 độc lập ngang hàng~~ **[ĐẢO — chốt 11/08]** Doc 15 OI-1 và QĐ-A 28/07 đều bị bản BA thắng. Hệ quả: `getSubtreeCenterIds(HO)` nay trả **đủ danh sách cơ sở** (trước là `[]` — hành vi cố ý cũ). Đây KHÔNG phải nới quyền: `buildActor()` vốn đã cấp cross-center cho role tại HO/ROOT qua nhánh `isHoLevel` riêng.
  Cây mặc định không còn node `ROOT`; node SATAROBO trên DB đang chạy được đóng bằng `scripts/nen-p1-reshape-org-tree.ts` (dry-run mặc định, **người vận hành chạy tay** — luật cứng #4). Runbook: `docs/nen-he-thong/RUNBOOK-P1.md`.
- ⚠️ **`Center("hoi-so")` là bản ghi MỒ CÔI đã biết** — không OrgUnit nào trỏ tới, vì V7 cấm đơn vị HO mang `centerId`. **ĐỪNG nới V7 để "vá" nó**: đã thử ở US-05 và phải gỡ — màn nhân sự suy đơn vị neo RBAC v2 từ Center của nhân sự, nên nới ra là người Hội sở được neo vai TẠI HO ⇒ `isHoLevel` ⇒ **thấy mọi cơ sở** (trước đó đường này bị chặn cứng bằng `OrgRoleSyncError`). Ánh xạ đúng nằm ở `lib/org/center-bridge.ts`: khớp theo `OrgUnit.code = Center.code`.
- **Mở CS mới = thêm data, không sửa code.** KHÔNG dùng `address` để suy quan hệ quản lý.
- **Ghi kép `centerId` → `orgUnitId`** (P1 · US-07) làm ở **một chỗ**: `lib/org/dual-write.ts`, cắm trong `lib/db.ts`. Code mới **không** phải tự gọi `orgUnitIdForCenter()`. Cơ chế cố ý không đè giá trị bạn tự set, không đoán khi `centerId: null`, và không hook `updateMany`. Đường ghi bằng SQL thô không qua nó — đó là việc của cron đối soát đêm `/api/cron/orgunit-drift`.
- **Ý nghĩa `centerId = NULL` KHÁC NHAU theo bảng** — bảng phân loại là `lib/org/center-bridge.ts` (`BACKFILL_SPECS`). Thêm cột `orgUnitId` cho bảng mới mà quên khai vào đó → test `[US-07-IT-08b]` đỏ.
- **RBAC động trong DB:** `RoleDef` + `RolePermission(action, scopeType GLOBAL/CENTER/CLASS/OWN/CHILDREN/ASSIGNED)` + `UserOrgRole(user × orgUnit × role, có effectiveFrom/To/status)`. Chỉ SUPER_ADMIN tạo/sửa role + **audit + reason bắt buộc**. **KHÔNG có role `HO_MANAGER`.** Role HO = cross-center theo chức năng (HO_ACCOUNTANT/HO_HR/HO_MARKETING xem+sửa toàn hệ thống theo module; HO_SALE xem lead scope A&B, **không sửa**).
- **Conflict: ALLOW thắng nếu ≥1 role cho phép — KHÔNG dùng DENY override** ở giai đoạn này.
- **`EmployeeOrgAssignment`** (nhân sự/kiêm nhiệm/lương — 5 assignmentType + allocationPercent) **KHÔNG tự sinh quyền**; quyền chỉ từ `UserOrgRole`.
- **scopedDb(actor)** ép cách ly cơ sở: CS1 không xem CS2 (test CI bắt buộc).

## Nền Hệ thống — luật cứng cho agent

> Nguồn: bàn giao Nền Hệ thống 08/08/2026 (`docs/nen-he-thong/` trên nhánh `feat/nen-he-thong-p0`; gốc `E:\websatarobo data\taicautruc-module-hethong`). Áp dụng cho MỌI module từ nay — kể cả module chat đang xây (điều khoản adapter `can()`, Tiger T3).

1. MỌI kiểm tra quyền đi qua duy nhất hàm `can(actor, permissionKey, target)`.
   Cấm viết điều kiện quyền (so role, so centerId/orgUnitId) trong Server Action,
   component, hay query. Vi phạm lint `no-inline-authz` = build fail.
2. Trước P4, `can()` fallback về logic centerId hiện hành. Không được xoá
   đường cũ, không được đổi hành vi đường cũ.
3. Mọi bảng mới có dữ liệu theo đơn vị BẮT BUỘC có cột `orgUnitId`.
   **ĐÍNH CHÍNH 27/08/2026 — bỏ vế "không thêm `centerId` mới":** vế đó nói ngược
   với hệ thống đang chạy. Cách ly cơ sở (`scopedDb` + `SCOPED_MODELS`) **vẫn đo
   bằng `centerId`** cho tới P4, nên bảng chỉ có `orgUnitId` **không được cách ly
   tự động** — người viết phải tự bịt bằng tay ở từng nơi gọi, và quên một chỗ là
   rò dữ liệu giữa các cơ sở. Ba đợt trong ba ngày đã vấp đúng chỗ này và mỗi đợt
   gỡ một kiểu (bảng kho ảnh 26/08 giữ cả hai cột; trục gọi điện 27/08 dùng cột
   cho phép trống + hàng đợi chờ gán; hộp thư đa kênh 27/08 bịt ba lớp bằng tay).
   **Luật nay:** bảng mới mang dữ liệu theo cơ sở thì **giữ CẢ HAI cột** —
   `centerId` là cột cơ chế cách ly đang thật sự đọc, `orgUnitId` là hướng đích —
   và phải khai đủ **ba** chỗ: `SCOPED_MODELS`, `getModelPrefixes()`
   (`lib/db-scope.ts`), và `BACKFILL_SPECS` (`lib/org/center-bridge.ts`). Khai
   thiếu `getModelPrefixes()` là tầm nhìn rơi về diện rộng — đúng lỗi từng mắc với
   bảng điểm danh. Bảng KHÔNG mang dữ liệu theo cơ sở thì chỉ `orgUnitId`, không
   cần gì thêm.
   Chuyển cơ chế cách ly sang đọc `orgUnitId` là **một đợt riêng**, chưa lên lịch.
   Chừng nào chưa làm xong đợt đó thì luật này giữ nguyên.
4. Không tự ý sinh migration đổi/bỏ cột trên bảng đang có dữ liệu PROD.
   Migration chỉ nằm trong story được giao, có dry-run, và Dev chạy tay trên PROD.
5. Test AUTO-CI của story (xem 04-TestScenarios) viết TRƯỚC phần hiện thực.
   Story chưa có test đỏ thì chưa được viết Server Action.
6. Không nhúng role/scope vào JWT. Nguồn quyền là DB, cache theo request.
7. Nội dung chương trình dạy: mọi endpoint trả nội dung phải qua chuỗi
   4 điều kiện ở server (BA §3.2). Không có ngoại lệ cho môi trường dev.
8. Không cron nào GHI thay đổi quyền. Hết hạn là thuộc tính resolver.
9. Secret chỉ trong env; không hardcode, không log giá trị secret.
10. Kết thúc phiên: cập nhật documentation/ tương ứng phần đã làm,
    liệt kê file đổi, và DỪNG — không tự chuyển sang story kế.

## Performance budget

- Client public pages: Lighthouse ≥ 85 mobile · LCP < 2.5s · CLS < 0.1.
- Admin pages: ≥ 90 mobile (admin tối giản animation).
- Animation: client = strategic (Hero, key CTAs) max 600ms; admin = CSS transition only.

## Don'ts (lý do đã từng burn)

- ❌ KHÔNG add UI library mới mà không hỏi (đã chọn shadcn + Magic UI + Recharts).
- ❌ KHÔNG dùng `useEffect` cho data fetching (dùng RSC + Suspense).
- ❌ KHÔNG dùng `dangerouslySetInnerHTML` ngoài JSON-LD scripts.
- ❌ KHÔNG drop Honor old columns (`fullName`, `jobTitle`, `avatarUrl`, `yearsAtCompany`) — 2-phase migration, sẽ làm ở 4.7.1.
- ❌ KHÔNG `gc --prune=now` ngay sau filter-branch khi có stash (mất WIP).
- ❌ KHÔNG comment `// eslint-disable-next-line @next/next/no-img-element` — project không có plugin Next ESLint.
- ❌ KHÔNG thiết kế `HO = CS2` / HO nằm dưới CS2 (Doc 15 OI-1) — HO là OrgUnit độc lập dưới ROOT.
- ❌ KHÔNG hardcode danh sách center / "HO + CS2" — đi qua OrgUnit tree (CS3/CS4... thêm không sửa code).
- ❌ KHÔNG để side-effect "dính chùm" inline trong action (target: side-effect không-atomic đi qua DomainEvent; tiền/enrollment đi transaction).
- ❌ KHÔNG đưa lại scope đã LOẠI (Doc 15 §0): AI camera/sinh trắc/định vị học sinh · Web3/NFT/blockchain · marketplace · student login riêng · online video LMS · AI learning path/prediction. Nhu cầu "dự báo/khuyến nghị" làm **rule-based**. (Riêng "teacher domain riêng": **ĐÃ ĐẢO 04/07/2026** — phiếu BGĐ câu 7 duyệt site GV riêng `giaovien.satarobo.vn` → route group `app/(teacher)/teacher/`, 2-phase flag `TEACHER_SITE_ENABLED`.)
- ❌ KHÔNG lưu giấy tờ tùy thân học viên; media phải tag + tôn trọng `StudentConsent`; KHÔNG lộ `studentId` trên URL portal.
- ⚠️ **`COMMISSION_TIERS` — trần nay là CẤU HÌNH, không phải hằng số [CẬP NHẬT 27/08/2026].** ~~KHÔNG thêm tier nào vào `COMMISSION_TIERS`; `MAX_TOTAL_RATE = 0.08` đã bão hoà~~ **[ĐẢO]** chủ dự án chốt **nới 8% → 9%** và đưa trần vào tham số vận hành `crm.commissionMaxTotalRate` (quản trị hệ thống sửa ở màn Cấu hình vận hành). Hằng `MAX_TOTAL_RATE = 0.09` trong `lib/crm/commission.ts` chỉ còn là mặc định cho code THUẦN; **đường nào chạm DB được thì phải `getSetting("crm.commissionMaxTotalRate")` rồi truyền vào `validateRates`/`computeCommission`** — không thì người vận hành sửa trần mà đường ghi vẫn chặn theo số cũ. Tầng `TRIAL_TEACHER` (+1% GV dạy Trial) **vẫn tính riêng** (`lib/crm/trial-teacher-commission.ts`: tính trên từng ghi danh, không phải doanh thu kỳ) nhưng **nay ĐƯỢC CỘNG vào khi kiểm trần** ở `setCommissionRate` — 8% Sale + 1% GV = đúng 9%. Thêm tier vào pool vẫn phải cân lại trần trước, và hạ trần KHÔNG xoá dòng hoa hồng đã sinh.
- ⚠️ **"Kế hoạch trả góp còn hiệu lực không" hỏi ở MỘT chỗ: `lib/payments/installment-plan.ts` [ĐẢO 13/09/2026].** ~~Chỉ `null`/`APPROVED` mới có hiệu lực; `PENDING_APPROVAL` bị loại vì "chưa duyệt mà cho quét QR đợt 1 là lách duyệt trả góp"~~ **[ĐẢO]** luật đó là tàn dư của QĐ-1 bản đầu, mà QĐ-1 **đã bị đảo từ 03/08/2026** (`lib/payments/payment-request.ts:184-192` gỡ hẳn cái chặn "chưa APPROVED thì ném lỗi": lưu kế hoạch là có phiếu thu + QR theo đợt NGAY, duyệt chỉ còn nghĩa **KHOÁ**). Hai chỗ gọi không đảo theo nên sinh bug tiền thật: `PaymentRequest` đã có phiếu đợt 1 3.000.000đ mà `computeDueNow` in QR **cả 5.000.000đ học phí**. Nay **chỉ `REJECTED`** làm kế hoạch mất hiệu lực — và đó không phải ngoại lệ tuỳ ý: `rejectInstallmentPlan` → `revertInstallmentRequests` VOID phiếu theo đợt + dựng lại phiếu "thu toàn đơn", nên số phải thu cũng phải quay về cả đơn.
  · **Hai chỗ gọi phải SỬA CÙNG NHAU** — `computeDueNow` (số tiền in QR + ngưỡng đối khớp SePay) và `markInstallmentPaid` (có ghi Ledger-A `Payment` không). Sửa một bên là **nhận tiền một đằng, ghi sổ một nẻo**: vá QR mà giữ cổng cũ ở `markInstallmentPaid` thì khách quét QR đóng đợt 1 → Ledger-B PAID, Ledger-A bỏ qua → **công nợ hiển thị KHÔNG GIẢM dù tiền đã vào tài khoản**. Đó là lý do hàm dùng chung tồn tại; đừng viết lại điều kiện tại chỗ.
  · Cổng chống lách duyệt **vẫn còn**, nằm ở đường TỰ CHỐT đơn chứ không ở đường nhận tiền: `confirmSettledOrder` + `lib/payments/payos-ingest.ts:1169-1181` vẫn từ chối đẩy đơn sang `CONFIRMED` khi **giảm giá** chưa duyệt. Phần "ghi bù Payment khi APPROVED" ở `approveInstallmentPlan` **giữ lại** (phục vụ ca REJECTED→APPROVED + dữ liệu cũ; idempotent theo marker nên không cộng đôi).
- ⚠️ **Cờ `PAYMENT_LEDGER_V2` là cờ CHẾT — đừng lấy nó làm cổng quyết định [đo 13/09/2026].** `isPaymentLedgerV2Enabled()` có **0 đường gọi** trong mã chạy thật (`lib/flags.ts:168` là định nghĩa duy nhất, còn lại chỉ `lib/flags.test.ts`), và biến env **không tồn tại** trong 40 biến Production. Bật nó KHÔNG đổi hành vi gì — muốn cutover thì phải viết phần "nối cờ" (chuyển `lib/finance/debt.ts` + `lib/portal/billing-student.ts` + `lib/portal/dashboard.ts` + màn `/orders/[id]`, `/cong-no` sang đọc `PaymentRequest`) trước, đó là dự án riêng. Đo prod bằng workflow chỉ-đọc `shadow-compare-cong-no.yml` (`payments:shadow-compare` chạy ở máy dev là đo DB DEV, **không nói gì về prod**).
- ❌ KHÔNG gõ tay tên bài vào `Lesson` để "sửa tên dự án". Nguồn tên buổi/dự án là 2 file marketing (`components/legacy-laptrinhrobot/_data/roadmap-5-years.ts` + `exam-roadmap.ts`) → `lib/lms/curriculum-sata.ts` → `prisma/seed-curriculum-sata.ts`; lần seed sau ghi đè. Nhãn buổi/tên gửi PH đi qua `deriveSessionLabel`/`deriveSessionProjectName`, đừng tự ghép chuỗi.
- ⚠️ **`PaymentMethod` KHÔNG còn là danh mục toàn cục [30/08/2026].** Model có `centerId` (+`orgUnitId` ghi kép) và nằm trong **CẢ HAI** `SCOPED_MODELS` và `NULL_IS_GLOBAL_MODELS`, và có prefix `["payments:"]` ở `getModelPrefixes` (`lib/db-scope.ts`): `centerId = NULL` nghĩa là **DÙNG CHUNG mọi cơ sở**, KHÔNG phải "chưa gán" — quên khai ở `NULL_IS_GLOBAL_MODELS` là tiền mặt/cổng online tàng hình với người cấp cơ sở và form tạo đơn hiện danh sách RỖNG. Luật "phương thức nào dùng được" ở **một chỗ**: `lib/payments/method-scope.ts` (thuần, test không cần DB) — đừng chép lại switch `canBuy*` như 4 bản cũ. Mọi đường GHI phải tự gác (`scopedDb` không che write): `createOrderManualAction`, `updateOrderPaymentMethodAction`, `recordPaymentAction`, và 3 action của `/payment-methods`.
  · **`code` VẪN `@unique` TOÀN CỤC** (cố ý không hạ thành `@@unique([code, centerId])`: ALTER trên bảng có dữ liệu prod + Postgres coi NULL là khác nhau nên khoá ghép không chặn được đúng ca cần chặn). Phương thức riêng của cơ sở đặt mã có hậu tố: `BANK_CS1`, `BANK_CS2`.
  · **`centerScope: "ALL"` đến từ NƠI NEO VAI (HO/ROOT), KHÔNG phải từ `scopeType: GLOBAL`** (`lib/auth/actor.ts:50-56`) — đo thật: CENTER_MANAGER/CENTER_ACCOUNTANT/CENTER_SALES_CSM neo tại CS1 đều ra `centerScope: [CS1]` dù `payments:*` seed GLOBAL. Đừng bỏ prefix vì sợ nới quyền; bỏ prefix mới là nới (rơi về `isHoLevel ? ALL : …`, `lib/db-scope-function.test.ts` chặn sẵn).
  · **Câu tra để CHẶN phải KHÔNG-SCOPE** — `lib/payments/method-lookup.ts`. Tra qua `scopedDb` thì đúng mã cần chặn bị lọc mất, trả null, và cổng đọc null thành "mã lạ, cho qua" ⇒ mở toang đúng lúc phải đóng.
  · **Tài khoản ngân hàng nằm TRÊN CHÍNH phương thức [ĐẢO 31/08/2026].** ~~4 cột `bank*` là dữ liệu chết; tài khoản THẬT ở `IntegrationConfig VIETQR:<centerId>`, khai ở `/centers/<id>/edit` hoặc `/admin/tich-hop`~~ **[ĐẢO]** chủ dự án chốt gộp về MỘT màn: `PaymentMethod.bankBin` (cột mới) + `bankAccountNumber` + `bankAccountName` là **nguồn dựng mã QR**, khai ngay trong form phương thức khi `type = BANK_TRANSFER`, bắt buộc (validator chặn). Khối VietQR ở `/admin/tich-hop` **đã gỡ** cùng `setVietQrConfig`.
  · **Thứ tự tìm tài khoản cho một đơn** — `resolveOrderPaymentConfig` (`lib/payments/vietqr.ts`): phương thức ĐÃ CHỌN trên đơn → phương thức chuyển khoản đang bật của CƠ SỞ đơn → phương thức chuyển khoản dùng chung → kho cũ `IntegrationConfig VIETQR:*` (chỉ còn là **đường lùi**). Bước 2 bắt buộc phải có: đơn từ `convert-lead` **không set `paymentMethodId`**, thiếu bước đó là phần lớn đơn thật báo "chưa cấu hình". Dọn nốt đuôi cũ: `scripts/pttt-chuyen-tai-khoan-vietqr.ts` (dry-run mặc định, chạy tay).
  · Trang cơ sở `/centers/<id>/edit` → mục **Thanh toán** (nằm TRƯỚC mục Hình ảnh, BÊN TRONG form vì chỉ hiển thị + link) liệt kê phương thức riêng của cơ sở + nút tạo `?centerId=<id>`. Nó **không còn ô khai tài khoản** — khai ở form phương thức.
- ⚠️ **"Kế hoạch trả góp còn hiệu lực không" hỏi ở MỘT chỗ: `lib/payments/installment-plan.ts` [ĐẢO 13/09/2026].** ~~Chỉ `null`/`APPROVED` mới có hiệu lực; `PENDING_APPROVAL` bị loại vì "chưa duyệt mà cho quét QR đợt 1 là lách duyệt trả góp"~~ **[ĐẢO]** luật đó là tàn dư của QĐ-1 bản đầu, mà QĐ-1 **đã bị đảo từ 03/08/2026** (`lib/payments/payment-request.ts:184-192` gỡ hẳn cái chặn "chưa APPROVED thì ném lỗi": lưu kế hoạch là có phiếu thu + QR theo đợt NGAY, duyệt chỉ còn nghĩa **KHOÁ**). Hai chỗ gọi không đảo theo nên sinh bug tiền thật: `PaymentRequest` đã có phiếu đợt 1 3.000.000đ mà `computeDueNow` in QR **cả 5.000.000đ học phí**. Nay **chỉ `REJECTED`** làm kế hoạch mất hiệu lực — và đó không phải ngoại lệ tuỳ ý: `rejectInstallmentPlan` → `revertInstallmentRequests` VOID phiếu theo đợt + dựng lại phiếu "thu toàn đơn", nên số phải thu cũng phải quay về cả đơn.
  · **Hai chỗ gọi phải SỬA CÙNG NHAU** — `computeDueNow` (số tiền in QR + ngưỡng đối khớp SePay) và `markInstallmentPaid` (có ghi Ledger-A `Payment` không). Sửa một bên là **nhận tiền một đằng, ghi sổ một nẻo**: vá QR mà giữ cổng cũ ở `markInstallmentPaid` thì khách quét QR đóng đợt 1 → Ledger-B PAID, Ledger-A bỏ qua → **công nợ hiển thị KHÔNG GIẢM dù tiền đã vào tài khoản**. Đó là lý do hàm dùng chung tồn tại; đừng viết lại điều kiện tại chỗ.
  · Cổng chống lách duyệt **vẫn còn**, nằm ở đường TỰ CHỐT đơn chứ không ở đường nhận tiền: `confirmSettledOrder` + `lib/payments/payos-ingest.ts:1169-1181` vẫn từ chối đẩy đơn sang `CONFIRMED` khi **giảm giá** chưa duyệt. Phần "ghi bù Payment khi APPROVED" ở `approveInstallmentPlan` **giữ lại** (phục vụ ca REJECTED→APPROVED + dữ liệu cũ; idempotent theo marker nên không cộng đôi).
- ⚠️ **`audit-logs:view` KHÔNG vai nào được cấp — đây là quyền ĐÃ MẤT, không phải quyết định [đo 13/09/2026].** `prisma/seed-roles.ts:601-607` còn nguyên chú thích *"#05 (câu 13 BGĐ): QL cơ sở xem audit log + break-glass xem đầy đủ PII"* nhưng **các dòng `{ action: "audit-logs:view*" }` đã biến mất** — `grep audit-logs prisma/seed-roles.ts` chỉ ra đúng 1 dòng, và nó là chú thích. Trang `/admin/audit-log` gác `audit-logs:view` (`page.tsx:21`) và mọi action của nó cũng vậy (`_actions.ts:30`), còn `can()` v2 trả true cho SUPER_ADMIN (`lib/auth/can.ts:46-47`) ⇒ **trên prod chỉ Quản trị tối cao mở được trang đó.**
  · **Đừng "vá" bằng cách nới `audit-logs:view` cho thêm vai.** Trang đó là log TOÀN HỆ THỐNG có PII; nới quyền ở đó là chữa một vấn đề bằng cách mở một vấn đề lớn hơn. Ai cần trang tổng thì phải **khai lại có chủ đích** (sửa seed + bấm chạy `seed-prod-roles.yml` — RBAC v2 động từ DB, merge file seed KHÔNG đổi gì trên prod).
  · **Log của một đơn thì đọc trên TRANG ĐƠN, không qua trang tổng.** `AuditLog` đã ghi `entityType: "Order"` + `entityId: <orderId>`, nên lọc theo cặp đó rồi hiển thị ngay ở `/orders/<id>` dưới cổng `orders:view` là đủ — **không cần bảng mới** (A5 không phát sinh) và không cần nới quyền nào. 4 vai có `orders:view`: HO_ACCOUNTANT · CENTER_MANAGER · CENTER_SALES_CSM · CENTER_ACCOUNTANT. `OrderStatusHistory` (có `reason` + `metadata Json?`) đã được đọc ở `orders/[id]/page.tsx:96` dưới đúng cổng đó — dùng làm chỗ tham chiếu.
  · Bài học chung: **chú thích trong seed không phải bằng chứng quyền tồn tại.** Hỏi "vai X có quyền Y không" thì `grep` dòng khai, đừng đọc chú thích (cùng họ với bài học memory *"Giáo vụ đã có người giữ vai"*).
- ⚠️ **Cờ `PAYMENT_LEDGER_V2` là cờ CHẾT — đừng lấy nó làm cổng quyết định [đo 13/09/2026].** `isPaymentLedgerV2Enabled()` có **0 đường gọi** trong mã chạy thật (`lib/flags.ts:168` là định nghĩa duy nhất, còn lại chỉ `lib/flags.test.ts`), và biến env **không tồn tại** trong 40 biến Production. Bật nó KHÔNG đổi hành vi gì — muốn cutover thì phải viết phần "nối cờ" (chuyển `lib/finance/debt.ts` + `lib/portal/billing-student.ts` + `lib/portal/dashboard.ts` + màn `/orders/[id]`, `/cong-no` sang đọc `PaymentRequest`) trước, đó là dự án riêng. Đo prod bằng workflow chỉ-đọc `shadow-compare-cong-no.yml` (`payments:shadow-compare` chạy ở máy dev là đo DB DEV, **không nói gì về prod**).
- ❌ KHÔNG gõ tay tên bài vào `Lesson` để "sửa tên dự án". Nguồn tên buổi/dự án là 2 file marketing (`components/legacy-laptrinhrobot/_data/roadmap-5-years.ts` + `exam-roadmap.ts`) → `lib/lms/curriculum-sata.ts` → `prisma/seed-curriculum-sata.ts`; lần seed sau ghi đè. Nhãn buổi/tên gửi PH đi qua `deriveSessionLabel`/`deriveSessionProjectName`, đừng tự ghép chuỗi.

- ⚠️ **MỤC "chuẩn hoá SĐT `84…`/`+84…`" — ĐÃ HUỶ khỏi kế hoạch [chốt 18/09/2026].**
  Làm lại **khi nào đo được dòng `84…` THẬT**, không làm trước.
  · **Vì sao huỷ:** đo prod 17/09 — trong 22 giao dịch UNMATCHED, số nội dung CK chứa SĐT dạng
    `84…`/`+84…` là **0**. Giả định "hoãn chuẩn hoá SĐT đang chặn phần A" (của chính tôi) **SAI**,
    và bảng đối soát chứng minh điều đó. Nút thắt thật nằm chỗ khác: SĐT người chuyển ≠ SĐT đăng
    ký, hoặc đơn không còn phiếu `PENDING/PARTIAL` — xem mục **A2** của
    `scripts/bao-cao-doi-soat-tien.ts`.
  · **Cách biết đã tới lúc làm:** mục A2 của báo cáo in dòng *"nội dung CK chứa SĐT dạng `84…`"*.
    Số đó > 0 thì mới mở lại ticket.
  · Bài học chung: **một tối ưu cho tập rỗng là một tối ưu không đo được** — nó không sai, nó chỉ
    không chứng minh được là đúng, và mọi bug nó gây ra sẽ không có ca test nào bắt.

- ⚠️ **CỔNG TẠO ĐỢT có HAI VẾ, và vế thứ hai là vế dễ bị gỡ [chốt 18/09/2026].**
  ```
  số tiền đợt ≤ min( còn nợ con − Σ đợt mở của con ,
                     còn nợ ĐƠN − Σ đợt mở của cả đơn )
  ```
  với *còn nợ đơn* = Σ học phí thực các con − Σ **mọi** `Payment` đã thu, **kể cả khoản chưa
  gắn con** (`orderItemId IS NULL`). Một chỗ duy nhất: `kiemTaoDot` trong
  `lib/finance/no-theo-con.ts`; hai số vào cổng là `conNoDon` + `tongDotDangMoDon`, do
  `tinhNoTheoCon` tính, **BẮT BUỘC** truyền (luật 7 — `tsc` liệt kê chỗ gọi).
  · **Vì sao có vế hai:** `chuaGanCon` tồn tại từ PHIÊN A nhưng **chỉ để hiển thị** — đo
    `git grep chuaGanCon ed5a884c^` ra 9 dòng, **0 dòng là điều kiện chặn**. Trên đơn 2 con đã
    có 6.000.000đ vào mà chưa gắn bé nào, sale tạo được các đợt cộng lại bằng **trọn** học phí
    đơn, hệ thống phát QR đòi đủ số, và **phụ huynh trả lần thứ hai phần đã trả**.
  · `tongDotDangMoDon` phải cộng **cả đợt `orderItemId` NULL**. Đơn trước 16/09 thì đợt nào
    cũng NULL, nên dùng `Σ con[].tongDotDangMo` làm cổng là **mở toang đúng tập đơn cũ** — tập
    đang giữ tiền thật.
  · `tongConNo` (Σ còn nợ từng con) **cố ý KHÁC** `conNoDon`: số đầu trả lời *"bé này còn nợ
    bao nhiêu"*, số sau trả lời *"đơn còn được thu thêm bao nhiêu"*. Gộp hai câu hỏi thành một
    con số là chỗ bug tiền nằm.
  · Câu lỗi vế ĐƠN nói bằng **ngôn ngữ của nguyên nhân** ("đơn đang có tiền đã thu chưa gắn cho
    bé nào"), không chỉ "tối đa X đồng": sale đọc số nợ của bé trên màn rồi gõ đúng số đó, nên
    một câu "tối đa 2.976.000đ" trong khi màn in "còn nợ 8.976.000đ" đọc như hệ thống bị lỗi —
    rồi người ta học cách bỏ qua cổng.
  · **Hệ quả phải biết:** đơn có bé ĐÓNG THỪA nay bị vế đơn siết (`conNoDon` âm ⇒ chặn mọi đợt
    mới). Đúng luật, không phải hệ quả phụ vô hình — ca `[NTC-02b]` ghim.
  · Cổng: `tests/finance/cong-tao-dot.test.ts` (`[CTD-01..07]`, bộ `test:finance-db`) +
    `lib/finance/no-theo-con.test.ts` (`[NTC-02b]`, `[NTC-02c]`). Ca `[CTD-01]` kiểm chính
    FIXTURE — thiếu nó thì mọi ca dưới xanh vì cổng không thấy tiền, và bộ test vô dụng mà
    trông vẫn xanh.

- ⚠️ **NỢ ĐANG GHIM: `goiYDon` trong `bao-cao-doi-soat-tien.ts` là N+1, và nó CHẠY ĐƯỢC [đo 17/09/2026].**
  Nó tra một câu `order.findMany` cho **từng** giao dịch UNMATCHED. Hôm nay 22 dòng ⇒ 22
  round-trip sang Supabase, vẫn chạy xong. **Đó chính là chỗ nguy hiểm:** một lỗi chỉ lộ ra
  khi dữ liệu lớn hơn thì không ai đi tìm.
  · Bản sao cùng hình dạng ở `scripts/backfill-orderitem-dry.ts` **đã chết thật** với
    `P2028 — Transaction … open for longer than the timeout` ngay lượt chạy prod đầu tiên
    (trần transaction tương tác của Prisma là **5 giây**), và đã được gộp thành MỘT câu.
  · **Chưa sửa `bao-cao-doi-soat-tien.ts` là có chủ đích:** nó đang là **nguồn của con số 146 /
    887.313.000đ** mà chủ dự án đã duyệt cho lệnh backfill. Đổi nó là đổi cái thước ngay lúc
    đang đo. Sửa SAU khi backfill xong, và khi sửa thì phải đo lại số trước/sau.
  · Cách gộp: bóc SĐT cả lô → gom mọi biến thể → **một** `findMany` → đếm theo `customerPhone`.
    Cho ra đúng phân loại 0 / 1 / >1 vì mỗi đơn chỉ có một `customerPhone`.
  · ⚠️ **Nâng `timeout` KHÔNG phải bản vá** — N+1 còn thì nó chết lại khi số giao dịch tăng.
    Trần chỉ để một transaction ĐỌC quét vài trăm dòng qua WAN không bị cắt giữa đường.

- ⚠️ **NỢ ĐANG GHIM: `scripts/_kiem-quyen.ts` hỏi quyền trên SAI BẢNG [đo 17/09/2026].**
  Nó hỏi `has_table_privilege(current_user, 'public."ClassSession"', 'UPDATE')` — tên bảng
  **đóng cứng** từ đợt chấm công. Chính chú thích của nó nói *"quyền trên chính bảng mình sắp
  đọc mới là quyền có ý nghĩa"*, nhưng báo cáo đối soát tiền đọc `BankTransaction` · `Payment`
  · `Order` · `PaymentRequest`, không đọc `ClassSession`.
  · **Chưa vá vì nó vẫn bắt đúng ca cần bắt:** thứ phải phát hiện là *secret bị đặt nhầm sang
    chuỗi đầy quyền*, mà vai đầy quyền có `UPDATE` trên MỌI bảng ⇒ `ClassSession` đủ để lộ ra.
    Ngược lại, một vai chỉ-đọc có `UPDATE` trên `BankTransaction` mà không có trên
    `ClassSession` là cấu hình không tồn tại thật.
  · Vá đúng = thêm tham số bảng cho `kiemQuyen(db, bang)`, **không đặt mặc định** (luật 7: để
    `tsc` liệt kê cả hai chỗ gọi). Chạm file dùng chung ⇒ phải chạy lại CẢ workflow chấm công.

- ⚠️ **Tên vai chỉ-đọc của prod là `satarobo_readonly`, KHÔNG phải `doisoat_ro` [đo 17/09/2026].**
  Đã một lần sửa `docs/cham-cong/USER-CHI-DOC-PROD.md` theo **lời kể** rồi phải hoàn lại: lượt
  chạy báo cáo đầu tiên in ra `user satarobo_readonly`. **Tên vai là thứ ĐỌC ĐƯỢC từ dòng tự
  khai của báo cáo** (`scripts/_kiem-quyen.ts` in `[quyen] user=… · …`) — đừng ghi vào tài liệu
  theo trí nhớ của ai, kể cả của người tạo ra nó.

- ⚠️ **NỢ ĐANG GHIM: `amountDue` của phiếu thu ĐÃ CÓ TIỀN vẫn bị ghi đè [đo 14/09/2026].**
  `materializeInstallmentRequests` THA VOID cho phiếu đang có phân bổ
  (`lib/payments/payment-request.ts:309` — `allocated > 0 → continue`) nhưng vòng UPSERT ở
  `:284` thì **không** kiểm điều đó: `if (cur.amountDue !== dot.amount) patch.amountDue = …`.
  Đo thật: phiếu đợt 1 đang giữ **6.000.000đ đã rót**, lưu lại kế hoạch với đợt 1 =
  1.000.000đ ⇒ `amountDue` thành 1.000.000đ, phiếu hoá **"thu vượt 5.000.000đ"** và số
  còn-phải-thu của đơn sai theo. Tiền KHÔNG mất (dòng `PaymentAllocation` còn nguyên, phiếu
  không VOID) — nhưng mọi con số đọc từ phiếu đều lệch.
  · Vi phạm đúng chốt của chủ dự án: **"KHÔNG sửa `amountDue` của phiếu đã có allocation —
    VOID + tạo phiếu mới."**
  · Cổng R-02 (`keHoachLamMatTien`) **cố ý không** che ca này: nó canh tiền nằm ở phiếu
    **THU TOÀN ĐƠN** (phiếu bị VOID vô điều kiện), không canh phiếu theo đợt vốn đã được
    tha. Đừng "vá" R-02 — nó không hở.
  · Ghim ở `tests/e2e/r7/payment-request-lifecycle.spec.ts` ca **`[PR-02d]`** bằng
    `test.fail()` **đặt TRONG thân ca** (đặt ở cấp file thì nó đánh dấu mọi ca phía sau —
    đã thử, 6 ca lập tức báo "expected to fail"). Vá xong ca đó chuyển sang XANH và
    Playwright báo lỗi, buộc gỡ ghim.
  · Vá là đợt RIÊNG: phải đo cả **3 đường gọi** `materializeInstallmentRequests`
    (`lib/orders/installments.ts:332`, `:500`, `lib/crm/backfill-order.ts:153`) — lỗ có sẵn
    từ trước đợt gỡ duyệt, không do nó sinh ra.

- ⚠️ **NỢ ĐANG GHIM: bán Coach 1-1/1-2/1-4 thì TRỤC GHI DANH vẫn giữ GIÁ NHÓM [đo 14/09/2026].**
  Hình thức lớp (SR.QD.219 Điều 5) nay khai được trên dòng đơn
  (`OrderItem.metadata.coachFormat`, xem `lib/orders/hinh-thuc-lop.ts`), nhưng số tiền mà
  **công nợ · cổng phụ huynh · hoàn tiền · hoa hồng GV Trial** đọc là
  `Enrollment.finalPrice`, và cột đó do các đường convert ghi bằng
  `computeEnrollmentPrice({ listPrice: Course.price })` — tức **giá LỚP NHÓM**.
  Đo với Coach 1-1 Sata3 (đơn 10.400.000đ, ghi danh 5.200.000đ):
  · ZNS học phí gửi `order.totalAmount` ⇒ phụ huynh nhận tin **~10,4tr**
    (`lib/notify/order.ts`);
  · `/portal/hoc-phi` in **5,2tr** (`lib/portal/billing-student.ts`);
  · `/cong-no` ra **−5.200.000đ** ("đóng thừa") — `lib/finance/debt.ts`;
  · hoàn tiền học 6/12 buổi chi **dư ~2.600.002đ** (`lib/finance/refund.ts`).
  · **Ghim** ở `lib/orders/hinh-thuc-lop.test.ts` ca **`[HTL-09]`** bằng `it.fails`.
  · **Vá là đợt RIÊNG**: `/orders/new` KHÔNG tạo `Enrollment`, nên phải chạm cả **4 đường
    tạo đơn** (`orders/_actions.ts`, `lib/crm/convert-lead.ts`, `lib/crm/backfill-order.ts`,
    `lib/finance/ghi-giao-dich-cu.ts`) **lẫn đường tạo ghi danh**. Sửa nửa sổ là sửa đúng
    nửa KHÔNG giữ tiền ra.
  · ⛔ **ĐỪNG "vá" bằng cách đưa hình thức lớp vào `giaNiemYet` của `soatGiaDon`.**
    Hôm nay `giaNiemYet` là `Course.price` tra từ DB nên client không chạm được; còn
    `coachFormat`/`soBuoi` nằm trong `items[].metadata` tức PAYLOAD CLIENT — làm vậy là
    để client cầm **cả hai vế** của phép so, khai `soBuoi` nhỏ là mọi đơn bán rẻ thành
    "khớp". Lý do đầy đủ + 5 lỗ tiền khác ở đầu `lib/orders/hinh-thuc-lop.ts`.

## Mẫu test: LƯỚI GHIM MÃ NGUỒN [13/09/2026]

Dùng khi luật cần khoá có dạng **"lời gọi này phải truyền tham số kia"** — loại luật mà
test thuần KHÔNG chứng minh được, vì thứ cần kiểm là một lời gọi Prisma/hàm nội bộ chứ
không phải giá trị trả về.

Ca sinh ra mẫu này (`[DS-01b]`, `lib/payments/dung-sai-lam-tron.test.ts`): `deriveStatus`
là hàm thuần và test nó bao nhiêu cũng xanh, trong khi con bug nằm ở chỗ
`recomputeRequestStatuses` gọi nó với **hằng `0`** cho tham số `waived`. Test thuần viết
kiểu nào cũng thành tautology.

**Cách làm — bốn bước, đừng bỏ bước 3:**
1. `readFileSync(resolve(process.cwd(), "<đường dẫn file>"))` — đọc chính mã nguồn.
   (⚠️ `import.meta.url` trong cấu hình vitest của repo này **không** phải URL `file://`
   nên `fileURLToPath` ném — dùng `process.cwd()`.)
2. Assert bằng regex/parse trên chuỗi đó, kèm chú thích ghi rõ **mã TRƯỚC bản vá** trông
   thế nào, để người đọc sau biết lưới đang chặn cái gì.
3. **HOÀN NGUYÊN mã về bản cũ, chạy lại, chứng minh lưới ĐỎ** — rồi mới khôi phục bản vá.
   Bỏ bước này thì không biết lưới có bắt được gì không; một regex viết sai vẫn xanh vĩnh
   viễn và trông y hệt một lưới đang làm việc.
4. Dán output đỏ vào commit message.

Repo đã dùng lối "test đọc mã/chạy lint thật" ở `lib/eslint/*.test.ts` — đây là cùng họ,
chỉ khác là không cần viết hẳn một ESLint rule cho một luật dùng đúng một chỗ.

**Kèm mẫu GHIM BUG bằng `it.fails`:** bug đã đo được nhưng chưa tới lượt vá thì viết test
mô tả hành vi ĐÚNG rồi đánh `it.fails`. Hôm nay nó xanh (thân test ném ⇒ CI không đỏ,
không chặn merge của người khác); vá xong nó **đỏ**, buộc người vá gỡ ghim. `pnpm test:unit`
đếm chúng ở dòng "expected fail". Đừng dùng `it.skip` — skip là quên, `it.fails` là hẹn.

## Workflow

1. **Hiểu trước, code sau** — đọc CLAUDE.md + file liên quan; nếu unclear, ASK trước khi code.
2. **Plan** — TodoWrite cho task ≥ 3 steps.
3. **Chunk** — commit từng feature rời, không big-bang.
4. **Verify mỗi 3-5 files** — `pnpm typecheck` để bắt lỗi sớm.
5. **Report** — liệt kê file thay đổi + cách test.
6. ⛔ **CHẠM TIỀN THÌ PHẢI CHẠY R7 — bắt buộc, chốt 17/09/2026.**
7. ⛔ **Trong callback `$transaction`, TỪ CHỐI = `throw`; mọi cổng đứng TRƯỚC phép ghi đầu tiên.**

### Luật rollback — `return` KHÔNG rollback, chỉ `throw` mới rollback

```ts
// ❌ SAI — phép ghi ĐÃ COMMIT, người dùng nhận thông báo từ chối
await db.$transaction(async (tx) => {
  await tx.paymentAllocation.deleteMany({ where: { bankTransactionId } });
  if (coPhieuThu) return { ok: false, error: "đã xuất phiếu thu" };   // ← xoá rồi!
});

// ✅ ĐÚNG — cổng đứng trước phép ghi đầu tiên
await db.$transaction(async (tx) => {
  if (coPhieuThu) return { ok: false, error: "đã xuất phiếu thu" };
  await tx.paymentAllocation.deleteMany({ where: { bankTransactionId } });
});

// ✅ ĐÚNG — buộc phải từ chối sau khi đã ghi thì `throw`, đường gọi bắt và dịch
if (khongDu) throw new StockError("PRODUCT_STOCK_INSUFFICIENT_RACE");
```

**Đo được, không phải phòng xa (17/09/2026).** Cổng *"đã xuất phiếu thu"* trong `goGanTheoCon`
nằm SAU `deleteMany`, nên nó trả `{ ok: false }` cho người dùng TRONG KHI phân bổ đã bị xoá và
commit — **chính cái cổng sinh ra để chặn gỡ nửa vời lại tạo ra một lượt gỡ nửa vời.** Ca
`[GDC-c2]` bắt được, nhưng chỉ vì ca ấy tình cờ đếm số dòng phân bổ còn lại.

**MỘT NGOẠI LỆ HỢP LỆ** — mẫu chống-đua của repo (FIX-H9):

```ts
const upd = await tx.payment.updateMany({ where: { id, updatedAt: expectedAt }, data: {…} });
if (upd.count === 0) return { stale: true };   // ← ghi đổi 0 DÒNG, commit vô hại
```

Phép ghi ở đây là `updateMany` CÓ ĐIỀU KIỆN và nó đổi 0 dòng, nên commit không đổi gì. Đổi nó
thành `update` (ném khi không thấy) hoặc bỏ điều kiện trong `where` là ngoại lệ hoá ra tha một
phép ghi THẬT.

**Cổng tự động:** `lib/finance/cong-truoc-phep-ghi.test.ts` quét mọi callback `$transaction` /
`ghiTienChoDon` trong `lib/finance/**` · `lib/payments/**` · `app/(admin)/admin/{orders,payments,bien-dong-so-du}/**`
· `app/api/public/webhook/**`, và đỏ khi thấy hình dạng từ chối (`return { ok: false`,
`return fail(`, `return { loi:`) đứng sau phép ghi. Đã cấy thử 3 ca.

### Luật R7 — bộ test duy nhất giữ các luật ĐỐI KHỚP TIỀN

**Diff chạm bất kỳ đường nào dưới đây ⇒ PHẢI chạy bộ R7 TRƯỚC khi báo xong phiên, và DÁN
KẾT QUẢ vào báo cáo:**

- `lib/payments/**`
- `lib/finance/**`
- `app/api/public/webhook/**`
- `prisma/migrations/**` có nhắc `Payment` / `Order` / `BankTransaction`

```bash
# Hai shard, HAI database khác nhau — CI chia đôi mỗi shard một container Postgres riêng,
# chạy chung một DB là cấu hình CI KHÔNG dùng (spec này `resetDb()` xoá dữ liệu spec kia).
# `assertTestDb` chỉ cho reset `satarobo_test` và `ci_test`, nên đúng hai cái đó.
R7_SKIP_WEBSERVER=1 DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/satarobo_test'   DIRECT_URL="$DATABASE_URL" pnpm exec playwright test -c playwright.r7.config.ts --shard=1/2
R7_SKIP_WEBSERVER=1 DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/ci_test'   DIRECT_URL="$DATABASE_URL" pnpm exec playwright test -c playwright.r7.config.ts --shard=2/2
```

**VÌ SAO LUẬT NÀY TỒN TẠI — đo 17/09/2026, không phải phòng xa.** Một nhánh duy nhất chứa
**BỐN** ca R7 đỏ, cả bốn cùng một lớp: *test còn ghim luật đã bị ĐẢO, sống sót vì lượt đảo luật
không chạy bộ R7.*

| ca | luật đã bị đảo | đảo ở |
|---|---|---|
| `[PAY-BF-00]` | kế hoạch `PENDING_APPROVAL` VẪN có hiệu lực | `00131d18` (13/09) |
| `[PAYOS-13b/13c]` | SĐT trong nội dung CK về dạng nội địa `0…` | `c95c6c25` (14/09) |
| `[PR-02c]` | sửa `amountDue` của đợt ĐÃ THU ⇒ **từ chối** | vá A6 (15/09) |
| `[QR-01/01b]` | nội dung CK mang `matchKey`, mỗi đợt một chuỗi | `361ea7d4` |

Bốn lần đảo luật tiền trong bốn ngày, không lần nào chạy R7. `Quality` + `Unit tests` KHÔNG
phủ nổi lớp này: luật đối khớp sống ở tầng tích hợp (webhook → resolve → allocate → recompute),
và test thuần của nó xanh vĩnh viễn vì nó không chạm tầng đó.

⚠️ **Ca nguy hiểm nhất không phải ca sai số, mà là ca mang LỜI DẶN CẤM SỬA cho một luật đã
chết** — `[QR-01b]` dặn *"người sau đừng sửa nó thành mỗi đợt một chuỗi (sẽ vỡ đường đối khớp
theo SĐT)"*, trong khi chính chủ dự án đã đảo luật ấy. Ai đọc nó như đặc tả sẽ gỡ khoá khỏi nội
dung CK và xoá sổ cả bản vá, không lỗi nào báo.

⚠️ **R7 KHÔNG nằm trong required check của `main`** (đo `gh api …/branches/main/protection`:
chỉ `Quality` · `Unit tests` · `Chat DB invariants` · `E2E Phase R7 1/2` · `2/2` — hai shard R7
CÓ trong đó). Nhưng required check chỉ gác lúc MERGE; luật này gác lúc BÁO XONG PHIÊN, sớm hơn
một nhịp, và đó là chỗ rẻ nhất để sửa.

⚠️ Chạy cả shard trên MỘT database ở local sẽ ra ca đỏ giả kèm `Unique constraint failed on
(dedupeKey)`. Đã một lần chẩn đoán nhầm đúng triệu chứng đó và kết luận "nhiễu local" cho hai ca
ĐỎ THẬT. **Đọc danh sách ca đỏ của CI, đừng đọc dòng lỗi nổi bật nhất ở máy.**

### Nhánh & môi trường (chốt 01/08/2026) — `main` KHÔNG còn là nơi nhận code mới

```
feature → PR → merge `test`  → test.satarobo.vn tự deploy → nghiệm thu
                             → PR `test` → `main` → PROD đổi
```

- **`test`** = nhánh tiền-prod thường trực. Vercel environment `test` bám nhánh này **vĩnh viễn** — KHÔNG trỏ tay sang nhánh feature nữa.
- **`main`** = prod. Push/merge vào `main` là **prod đổi ngay** (Vercel Git integration) + `deploy.yml` chạy `prisma migrate deploy` lên Supabase prod. Chỉ merge từ `test` sau khi nghiệm thu xong.
- **Migration**: `migrate-test.yml` chạy khi push `test` (secrets `TEST_DATABASE_URL`/`TEST_DIRECT_URL`, có bước chặn trỏ nhầm vào DB prod). 🔴 **ĐÍNH CHÍNH 17/09/2026 — DB của env `test` là MỘT PROJECT RIÊNG, KHÔNG phải DB dev.**
~~DB của env `test` CHÍNH LÀ DB dev — chủ dự án xác nhận 01/08 là cố ý~~ **[SAI]**. Đo
17/09: vé SSO do `test.satarobo.vn` ký mang `User.id` thế hệ `cmtcd2…d755…`, trong khi
Supabase DEV (`mqvojw…`) giữ thế hệ `cmtaew…x6d5…` và máy dev (`satarobo_local`) giữ
`cmtorab…10l4…` — **ba database khác nhau**, xác nhận thêm bằng project-ref trên Vercel.
Câu cũ đã làm lệch hướng một cuộc điều tra cả buổi (xem `NỢ-8`,
`docs/hop-nhat-main-test-1609.md`).

**Hệ quả phải nhớ — ĐẢO so với bản cũ:**
· Data nghịch ở máy local **KHÔNG** hiện trên `test.satarobo.vn`, và ngược lại.
· Migration DROP/RENAME chạy ở local **KHÔNG** đụng dữ liệu của `test` — nhưng vẫn đụng
  `satarobo_local`, nơi dev server đang phục vụ.
· Muốn xem dữ liệu mà `test.satarobo.vn` thật sự đọc thì phải nối bằng
  `TEST_DATABASE_URL` (Vercel env `test`), **không** phải `.env` của máy.
· Ba database, ba tập `User.id` khác nhau cho cùng một email — đó là gốc của `NỢ-8`.

(Chỉ chắc chắn 1 điều: test ≠ prod — bước "Chặn trỏ nhầm vào DB PROD" trong workflow đã xanh.)
- **Cron trên test**: Vercel Cron không chạy trên custom environment → `cron-pump-test.yml` bơm `dispatch-events` + `email-queue` mỗi 5 phút. Đỏ 401 = lệch `TEST_CRON_SECRET` với `CRON_SECRET` của env `test`.
- ⚠️ **Điểm mù cố hữu: ZNS thật KHÔNG test được trên `test`.** Creds Zalo chỉ ở scope Production và **cấm nhân bản `ZALO_OA_REFRESH_TOKEN`** sang môi trường 2 (token xoay vòng mỗi lần refresh → hai môi trường giết token của nhau, OA chết phải OAuth lại tay). Trên test ZNS luôn `SIMULATED`; khâu gửi tin thật chỉ smoke được trên prod sau merge.
- Preview `*.vercel.app` vô dụng: `proxy.ts:113` canonical-hoá về domain thật bằng 308.

## Business context

- Công ty Cổ phần Công nghệ Giáo dục Sata Robo (Đà Nẵng), CEO Hồ Đắc Phúc.
- 2 khoá học chủ lực: **Lập trình Robot** (offline K-9, slug `laptrinhrobot`) và **Luyện thi RoboSim** (slug `luyenthirobosim`).
- **Scope core (Doc 15):** vận hành đào tạo **offline Sata 1–8 + Combo 1&2**; online course trỏ Sataworld (không build video LMS cho HV tự học). Lead **Messenger-first** (Page HO) theo phễu SR.QD.217 L1→L2→L3.
- **SCORM ≠ "video LMS"** — SCORM là courseware giảng dạy, **TRONG core** (SRS LMS v3.1, TGĐ chốt 12/06/2026) và **đã live prod từ 03/07**. Ràng buộc: học viên **KHÔNG** xem SCORM; GV không tải được file nguồn; blur khi quay/chụp màn hình + watermark động.
- Tổ chức thật: HO (Hội sở) + CS1 (211 Nguyễn Hữu Thọ) + CS2 (114 Hoàng Diệu).
- B2C: phụ huynh con lớp 1-8.
- 2 domain cũ redirect qua middleware (`proxy.ts`): `laptrinhrobot.vn` → `/khoa-hoc/laptrinhrobot`; `luyenthirobosim.vn` → `/khoa-hoc/luyenthirobosim`.

## Kiến trúc đích (Doc 15) — A0→R5 đã đóng (10/06/2026), nay là R6/R7/FL + sprint go-live 26/07

> Khi xây tính năng MỚI, theo blueprint Doc 15 — **nhưng đọc kèm phần ~~gạch ngang~~ + `[ĐẢO ...]`** (Doc 15 đã bị sửa tại chỗ; vd site giáo viên từ "đã loại" → **in-scope** 04/07/2026). Quyết định ký SAU (phiếu BGĐ · biên bản chốt · SRS bản mới) **thắng** Doc 15.
> Hệ thống nâng cấp **dần, additive trước — drop sau khi ổn định** (2-phase); hệ thống không dừng.
> ⚠️ **Đã tồn tại** (đừng coi là "sắp có"): `scopedDb` · `can()` v2 · OrgUnit · `lib/events`. **Chưa tồn tại:** `modules/*`.
> ⚠️ **Yêu cầu MỚI không gán vào "Phase A0–R5"** — khung đang lập lịch là GĐ0→GĐ4 (deadline **26/07/2026**) + ticket K\*/L\*/V\* + lane #NN. Chi tiết: `docs/ke-hoach-go-live-2607/`.

- **6 trụ kiến trúc:** OrgUnit tree · RBAC động (DB) · scopedDb (cách ly cơ sở) · DomainEvent outbox (tách side-effect) · modular monolith (`modules/*` + ESLint boundary) · login chung + portal.
- **Quy tắc atomic vs event:** tiền/invoice/enrollment/kho → trong **transaction**; thông báo/stats/đồng bộ ngoài → **DomainEvent** (handler idempotent). External call (Resend/Zalo/MISA/Meta/CAPI/GA4) CHỈ qua `modules/integration`.
- **API contract (target):** success `{ ok, data, meta }` · error `{ ok:false, error:{ code(EN), message(VI), field?, requestId } }`. Idempotency bắt buộc cho webhook + confirm payment.
- **AuditLog hợp nhất** + mask PII theo quyền; export nhạy cảm có watermark + audit lại. Backup Supabase (RPO 24h/RTO 4–8h).
- **Lộ trình & test:** mỗi phase có ticket + test (Playwright + Vitest) phủ **12 nhóm** (T1–T12), quy trình Task→Test→Check. Xem `Document/0-yeucau/3-ke-hoach-trien-khai/phases/`.

## Tài liệu kiến trúc (đọc khi cần)

- ⭐ [Document/2-architecture-design/15-final-architecture-blueprint.md](Document/2-architecture-design/15-final-architecture-blueprint.md) — BLUEPRINT CHỐT (nguồn đúng nhất).
- [Document/0-yeucau/3-ke-hoach-trien-khai/phases/](Document/0-yeucau/3-ke-hoach-trien-khai/phases/README.md) — kế hoạch + test theo phase A0→R5 (A0 có ticket chi tiết).
- [Document/README.md](Document/README.md) — bộ tài liệu PRD→DB→API→Flow→Security→Test (mô tả hiện trạng).

## Detailed rules (load on-demand)

- [docs/luat-doc-so-va-ket-luan.md](docs/luat-doc-so-va-ket-luan.md) — **Luật đọc số + luật kết luận (07/09/2026).**
  "0 dòng trên prod" KHÔNG hạ được mức nghiêm trọng — phân loại theo đường ghi còn sống hay chết;
  mọi con số báo ra phải kèm PHÉP TÍNH sinh ra nó (đo ≠ suy). Kết luận "hệ thống không có cơ chế X"
  phải kiểm trên `origin/main`, KHÔNG phải nhánh đang đứng — nhánh tụt 87 commit đã làm hỏng một
  chẩn đoán 07/09. Chú thích không phải bằng chứng: hình dạng dữ liệu xác minh bằng schema + `psql`.
  **Fixture phải mang hình dạng dữ liệu thật** — dữ liệu tròn trịa trong test là dữ liệu không kiểm
  được gì. Bẫy sẵn của repo: 9 model có `date` là `@db.Date` (nửa đêm ĐÚNG) nhưng `ClassSession.date`
  là `@db.Timestamptz(6)` MANG GIỜ THẬT — khớp theo tên cột là sai.
  **Tập dựng cho mục đích A không dùng cho mục đích B khi chưa kiểm lại định nghĩa** —
  `assignedClassIds` đúng cho QUYỀN, sai cho THƯỚC ĐO CÔNG (76 buổi của trợ giảng, prod 08/09).
  **Không đặt lệnh kiểm sau dấu ống** — `pnpm test | grep` trả mã thoát của `grep`, nên hạ tầng
  chết cũng thành "xanh"; cổng im lặng khi hạ tầng hỏng tệ hơn không có cổng. CI mặc định là
  `bash -e`, KHÔNG có `-o pipefail`.
  **Tham số có mặc định NGUY HIỂM thì bỏ mặc định** (gửi tin · ghi tiền · giao bài · xoá ·
  mở rộng phạm vi nhìn) — để `tsc` liệt kê call site: mắt thấy 2, trình biên dịch thấy 6.
  Mặc định của SCOPE phải fail-closed, không bao giờ là `"ALL"`.
  **Test canh lỗi chỉ được tin sau khi CẤY LẠI lỗi và thấy nó ĐỎ** — test xanh có thể nghĩa
  là "lỗi không còn" hoặc "test không chạm tới lỗi"; ghi cả bốn bước vào commit.
  **Cổng phải được cho ăn bằng thứ đường THẬT cho nó ăn** (luật 9, sự cố nhập nhân sự
  08/09): ca test gõ tay đầu vào của cổng thì nó kiểm cổng, không kiểm hệ thống — nếu đầu
  vào ấy do tầng khác tính ra thì **tầng đó là chỗ bug nằm**.
  **Test grep mã nguồn là loại MONG MANH NHẤT** (luật 11): ưu tiên khẳng định HÀNH VI;
  buộc phải canh bằng văn bản mã thì neo chuỗi hẹp nhất, **không dùng cờ `/s`**, khẳng
  định cả SỐ LẦN khớp (chú thích giải thích bản vá thường chứa đúng chuỗi đang cấm), và
  **chưa cấy thử thì coi như vô dụng**. Ba ca soi nhầm chỗ trong một ngày 08/09.
  Luật 7 có điểm cộng ngoài dự kiến: trường BẮT BUỘC không chỉ liệt kê call site, nó còn
  biến **"quên `select` cột nguồn"** từ lỗi câm thành lỗi biên dịch.
  **Affordance phải NÓI THẬT** (luật 12): con trỏ · mũi tên · nhãn trạng thái · nút đều là
  LỜI HỨA, và lời hứa suông không ném lỗi, không làm test đỏ, console vẫn sạch — chỉ người
  dùng bấm mới biết. Ba ca một tuần: nhãn "Hoàn tất" suy ra · `photoDone` không bao giờ
  true · chevron `/cham-cong` chưa từng được nối. Vá bằng cách **mở rộng vùng bấm**
  (`<tr relative cursor-pointer>` + trigger `after:inset-0`), đừng gỡ mũi tên. Cổng canh:
  `components/ui/affordance-coverage.test.ts` — nó phải viết lại BA lần mới bite, cả ba
  lần vì chú thích giải thích bản vá chứa đúng chuỗi bộ so khớp đang tìm. Sổ sự cố cùng file; điều
  đáng nhớ nhất: **quy trình chụp trước/sau là thứ duy nhất hoạt động** — bộ test xanh,
  bản vá vừa merge, và 9 hồ sơ prod vẫn bị xoá trắng ba cột ngày. Đừng bỏ nó kể cả khi
  test đã xanh.
  **Site GV đọc số của admin, KHÔNG dựng lại** (luật 12b): ba lần trong hai tuần site GV
  in một con số/nhãn khác admin cho cùng một ô — và lần thứ ba, hàm đúng
  (`getMyAttendanceDays`) ĐÃ được gọi sẵn trong trang, chỉ dùng để cộng một con tổng còn
  từng dòng vẫn tự suy từ ngày. Trước khi thêm bất kỳ cột SỐ nào lên site GV: tìm hàm admin
  đang dùng và gọi nó; nếu không gọi được thì NÓI RÕ ranh giới trước khi vòng. Phép nối
  dữ liệu×hiển thị không để inline trong trang RSC (không có chỗ cấy lỗi) — đưa ra hàm
  thuần: `lib/cham-cong/nhan-ca.ts` (nhãn) + `lib/cham-cong/bang-cong-gv.ts` (dòng bảng).
  ⚠️ `isLeave` KHÔNG phân biệt được ngày nghỉ: mã `X` mang `kind: OFF` nhưng
  `isLeave: false`. Thứ phân biệt là `kind`.
  **Mỗi ca test phải XANH khi chạy MỘT MÌNH** (luật 18): bộ xanh khi chạy đủ chỉ chứng minh
  thứ tự hiện tại đang cứu nhau. Chữ ký của lớp lỗi này là **cấy vào thì "chạy 1 ca ĐỎ, cả
  bộ XANH"** — ca đó đang mượn trạng thái ca trước, và nó sẽ nổ vào ngày runner chậm với
  triệu chứng chỉ vào ca vô tội đứng sau (10/09: một ca timeout → `applyImport` của nó vẫn
  chạy tiếp vì vitest KHÔNG huỷ được promise → hai lượt chồng nhau → `P2002`). Đo 2 file
  đầu tiên ra 2 lỗ, cả hai CÓ SẴN không cần runner chậm; danh sách còn phải rà ở
  `docs/cham-cong/VE-RA-CACH-LY-BO-TEST.md`. Trần thời gian đặt ở config riêng cho từng bộ
  (`vitest.cham-cong.config.ts`) — phép tính ghi ngay trong file, và nâng trần là vá TRIỆU
  CHỨNG chứ không phải vá cách ly.
  **Test KHÔNG được đọc đồng hồ thật** (luật 19): ngày TUYỆT ĐỐI trong fixture + một hàm rơi
  về `new Date()` = ca hẹn giờ nổ — mã không đổi, tờ lịch đổi. Đo dứt điểm 13/09: CÙNG commit
  `507ff13b`, CI ngày 10/09 XANH, chạy lại ngày 12/09 ĐỎ, không diff nào ở giữa. Hình dạng
  nhận biết: **ca đỏ mà `git log` của file liên quan im nhiều ngày ⇒ nghi ĐỒNG HỒ trước khi
  nghi MÃ**; và lỗi hay báo ở dòng SỚM HƠN dòng mà tên ca gợi ý. Hàm đã có sẵn `now?: Date`
  thì test phải TRUYỀN, đóng băng ở mức khối, và cấy lại bằng cách dời mốc sang phía sai.
  Danh sách còn phải rà: `docs/cham-cong/VE-BOM-HEN-GIO-TRONG-TEST.md`.
  ⚠️ **Đính chính luật 10 cho ca này:** required check trên `main` nay có `Quality` ·
  `Unit tests` · `Chat DB invariants` · `E2E Phase R7 1/2` · `2/2`, và `enforce_admins` ĐÃ
  BẬT (đo `gh api …/branches/main/protection` ngày 13/09). Cổng KHÔNG thủng — nhưng required
  check chỉ gác lúc MERGE, **không gác trạng thái `main` về sau**, nên một ca phụ thuộc đồng
  hồ vẫn đỏ lên mà không ai đẩy gì cả.
  **Một ca đỏ mà không ai bị chặn thì bằng không có ca** (luật 10). ~~Đo 08/09: required
  check CHỈ có `Quality` + `Unit tests`, `enforce_admins=false`~~ **[ĐÃ SỬA — đo lại 13/09]**
  danh sách required nay gồm `Quality` · `Unit tests` · `Chat DB invariants` ·
  `E2E Phase R7 1/2` · `2/2`, và `enforce_admins` ĐÃ BẬT. Bài học của luật 10 vẫn nguyên,
  chỉ con số là cũ — và đó đúng là luật 17 đang tự chứng minh. **Luôn đọc cấu hình THẬT bằng
  `gh api repos/<o>/<r>/branches/main/protection`**, đừng trích lại con số trong tài liệu
  (tài liệu từng ghi "không đọc được từ repo", câu sai đó đã hoãn một phép đo 5 giây suốt
  một ngày). ⚠️ Giới hạn còn lại, KHÔNG vá được bằng danh sách required: nó gác lúc **MERGE**,
  không gác trạng thái `main` **về sau** — xem luật 19.

- [docs/cham-cong/DESIGN-CHAM-CONG-ADMIN.md](docs/cham-cong/DESIGN-CHAM-CONG-ADMIN.md) — **Giao diện module chấm công (admin), chốt 06/09/2026.** Đọc TRƯỚC khi sửa bất kỳ màn nào dưới `app/(admin)/admin/cham-cong/**` hoặc `/don-tu**`. Luận đề "Sổ kỳ công": mọi màn vận hành chia sẻ khung KỲ (tháng × khối) — `PageHeader → ModuleNav → ScopeBar → nội dung`. **Sidebar chỉ còn 5 mục**; 9 màn còn lại vào bằng `components/admin/cham-cong/{module-nav,config-tabs,me-nav}.tsx` — 3 file này là LỐI VÀO DUY NHẤT nên `href` phải là chuỗi literal (test `nav-coverage` quét literal, xoá là màn thành mồ côi). Quyền hỏi MỘT lần bằng `loadModuleScope(userId)` (`lib/cham-cong/module-scope.ts`) — đừng rải `checkPermission` (action là biến nên rbac-scope R1 không đếm, nhưng target thì luôn phải thật). `components/cham-cong/ui/**` dùng chung với site GV ⇒ CHỈ token `:root`, **cấm `primary-soft`/`primary-ink`/`primary-dark`** (site GV không có `.admin-scope`, `--primary-ink` ở `:root` là CAM).

- [docs/site-giao-vien-2508.md](docs/site-giao-vien-2508.md) — **Site GV đợt 25/08**: giáo trình Sata thật (`Lesson.moduleCode` + seed) · gộp cột "Buổi học" · ảnh lớp bỏ kho nháp (up → PENDING) · bảng Trial 2 bảng phẳng + dời lịch + `LeadTrialHistory.outcome` + hoa hồng `TRIAL_TEACHER` · bài tập quá hạn tự đóng + gia hạn · `PhanTrangBang cuonNgang`. **Có việc phải chạy TAY sau merge** (migrate + seed giáo trình).
- [docs/chat-realtime/00-dieu-chinh-cho-repo.md](docs/chat-realtime/00-dieu-chinh-cho-repo.md) — **Module Chat Realtime (đang xây)**: đọc file này + `docs/chat-realtime/architecture.md` trước MỌI task chat. Backlog: `docs/chat-realtime/backlog/`. Luật cứng không thương lượng: (1) client CHỈ ĐỌC realtime, mọi ghi qua Server Action, không bao giờ tạo policy INSERT trên `realtime.messages`; (2) Postgres là nguồn sự thật — broadcast fail → log, không rollback; (3) mọi xoá là SOFT DELETE; (4) không hard-code classId vào Message; (5) đổi phân công/học viên phải gọi `syncConversationMembership` TRONG CÙNG transaction; (6) SĐT/email PH không bao giờ vào payload trả cho PH khác; (7) test ma trận quyền phải xanh trước khi coi story xong; (8) `permissions.md` là nguồn sự thật — code lệch ma trận là bug.
- [.claude/rules/client-site.md](.claude/rules/client-site.md) — animations, SEO, performance
- [.claude/rules/admin-site.md](.claude/rules/admin-site.md) — server actions, RBAC patterns
- [.claude/rules/ui-libraries.md](.claude/rules/ui-libraries.md) — Magic UI / Motion / Recharts allowed scope
- [.claude/rules/prisma-db.md](.claude/rules/prisma-db.md) — migrations, seed, Supabase IPv6 quirk
