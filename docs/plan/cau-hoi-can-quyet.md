# Câu hỏi cần chủ dự án quyết

Trích tự động từ mục Open Questions của các PRD. Mỗi câu có **khuyến nghị** sẵn —
nếu đồng ý thì ghi `OK` vào dòng Quyết định, nếu khác thì ghi rõ.

> 12 câu **chặn khởi công** đã tách riêng ở cuối file.
>
> 📍 **Câu nào còn treo thì chặn bước nào, và gỡ thế nào** — xem `docs/plan/ket-va-cach-go.md`
> (bảng kẹt Sprint 3→18, mỗi mục có: kẹt vì gì · ai gỡ · gỡ từng bước · gỡ xong mở được gì).

---

## Khu vực A — Nền phạm vi & phân quyền  ·  `docs/prd/A-nen-tang.md`

### 1. [A/OQ-3] Multi-select cơ sở dựng bằng `<select multiple>` native hay component tự viết trên Base UI?

*Vì sao chặn:* Repo **chưa có** multi-select và **cấm** thêm thư viện UI mới.

**Quyết định:** ⚙️ **Chốt kỹ thuật 24/08/2026 (Dev đề xuất, chờ phản đối):** dropdown **checkbox** dựng bằng `Popover` + `Checkbox` của shadcn đã có — không thêm thư viện. Không dùng `<select multiple>` native: khó bấm ở 375px và không hiện được mục "Tất cả cơ sở".

### 2. [A/OQ-4] Khi QLCS chọn nhiều cơ sở, các con số của 4 tab hiển thị **gộp** hay **tách theo cơ sở**?

*Vì sao chặn:* Ảnh hưởng hình dạng dữ liệu trả về của cả B/C/D/E.

**Quyết định:** ✅ **24/08/2026 (bản chốt) — MẶC ĐỊNH GỘP, CÓ CÔNG TẮC "Tách theo cơ sở".** Mở tab ra là số gộp của phạm vi đang chọn; bật công tắc thì mỗi cơ sở một dòng/cột kèm dòng **Tổng**. ⇒ mọi hàm số liệu của B/C/D/E **nhận `groupByCenter: boolean` ngay từ bản đầu**, trả được cả hai dạng; công tắc dùng chung `searchParams` (`?split=1`) để đổi tab không mất trạng thái, và **chỉ hiện khi chọn ≥ 2 cơ sở**.
*(Bản ghi lúc sớm hơn trong ngày là "không tách" — chủ dự án đã chỉnh lại, dòng này thắng.)*

### 3. [A/OQ-5] Có QLCS đa cơ sở nào **thật** trên prod chưa, hay A-01 là chuẩn bị trước?

*Vì sao chặn:* Quyết định có cần script backfill `UserOrgRole` hay không.

**Quyết định:** 🔴 **24/08/2026 — CÓ RỒI, đang xử lý tạm bằng tay. Người đó là anh Phúc, VỪA QLCS VỪA `SUPER_ADMIN`.** Hai hệ quả (chi tiết + truy vấn Đ4 ở `A-nen-tang.md` §6.9.1):
**(a)** Tài khoản anh Phúc **không nghiệm thu A-01 được** — `SUPER_ADMIN` đi nhánh `isHoLevel`, thấy mọi cơ sở kể cả khi A-01 hỏng hoàn toàn ⇒ UAT/e2e phải dùng **tài khoản QLCS thuần** giữ 2 cơ sở khác vùng.
**(b)** Hỏng do SL-01 trên tài khoản này là **âm thầm**: thành viên nhóm chat lớp của QLCS dẫn xuất từ `CHAT_CENTER_MANAGER_ROLE_CODES = ["CENTER_MANAGER","CENTER_CLASS_MANAGER"]` (`lib/chat/sync-membership.ts:155-158`) — **`SUPER_ADMIN` không nằm trong đó**, và đường v1 dự phòng chỉ khớp đúng `User.centerId` ⇒ với **cơ sở thứ hai**, dòng `UserOrgRole` là chỗ **duy nhất** giữ anh ấy trong nhóm lớp. Mất dòng đó = **rời nhóm chat lớp cơ sở thứ hai trong im lặng**, dashboard vẫn hiện đủ.
⇒ **Giữ đủ V-1 → V-2 → V-3**, không có nhánh "bỏ backfill". "Đang chạy được" chỉ chứng minh `SUPER_ADMIN` che được phần nhìn thấy: cấu hình gán tay hiện có thể bị `reconcileUserOrgRoles` thu hồi im lặng khi ai đó sửa ô "Đơn vị" (`users/_actions.ts:363-380`, `nhan-su/actions.ts:377`). Thứ tự bắt buộc: **đo prod → SL-01 → backfill**, không làm ngược.

### 4. [A/OQ-7] Có mở `roles:assign` cho `HO_HR` không, hay giữ **chỉ SUPER_ADMIN** gán đa cơ sở?

*Vì sao chặn:* Hôm nay chỉ SUPER_ADMIN gán được (`prisma/seed-roles.ts:36`). Giữ nguyên = mọi lần thêm/bớt cơ sở phải qua một người.

**Quyết định:** ✅ **24/08/2026 (bản chốt) — MỞ `roles:assign` cho `HO_HR`.** Seed thêm quyền trong `prisma/seed-roles.ts`, **kèm 3 rào bắt buộc** (`A-nen-tang.md` §6.10): **R1** không gán được vai chứa `roles:*`/`users:manage` nếu actor không phải SUPER_ADMIN · **R2** không tự gán cho chính mình · **R3** `reason` bắt buộc + `logRbacAudit`.
⚠️ Rào đã có sẵn: không ai ngoài SUPER_ADMIN gán được vai `SUPER_ADMIN` (SEC-M13 — `lib/auth/rbac-service.ts:184-193`). Nó chỉ chặn **một** vai, không chặn việc HR tự cấp các vai còn lại — R1/R2 là để bịt chỗ đó.
⚠️ **Sau merge `test` → `main` phải chạy `seed-prod-roles.yml`**, quên là HR trên prod vẫn không gán được và không có lỗi nào giải thích.
*(Bản ghi lúc sớm hơn trong ngày là "giữ chỉ SUPER_ADMIN" — chủ dự án đã chỉnh lại, dòng này thắng.)*

### 5. [A/OQ-8] Cơ sở thứ hai của QLCS có thuộc REGION khác thật không, hay chỉ khác cơ sở trong cùng Đà Nẵng?

*Vì sao chặn:* Nếu thật sự khác vùng thì phải tạo REGION thứ hai trong dữ liệu (hiện chỉ có `DANANG`).

**Quyết định:** ✅ **24/08/2026 — CÓ, cơ sở khác vùng là ca thật phải đỡ được.** ⇒ dữ liệu test A-01 bắt buộc có **REGION thứ hai**; e2e phủ ca "một QLCS giữ 2 cơ sở **khác vùng**"; không chỗ nào suy phạm vi từ vùng — vẫn đi qua `getSubtreeCenterIds`.

---

## Khu vực F — Kho media & duyệt ảnh/video  ·  `docs/prd/F-media.md`

### 6. [F/OQ-F2] Giữ **nguyên câu chữ F-10** (chỉ hiện ngày có media chưa duyệt — cách đọc A) hay mở rộng để folder trống cũng hiện (cách đọc B)?

*Vì sao chặn:* Đọc chặt thì **F-14 không bao giờ render được** và F-31 mất 2 trạng thái (`Chưa duyệt`, `Không có ảnh`). Đây là mâu thuẫn trong chính spec, không suy ra được từ mã.

**Quyết định:** 

### 7. [F/OQ-F3] F-02 (H.264/720p) thực thi bằng gì?

*Vì sao chặn:* Repo **không có** ffmpeg/sharp/transcode ở bất kỳ đâu; Vercel function không phải chỗ chạy ffmpeg cho file 500MB. Ba hướng: dịch vụ ngoài (Cloudflare Stream…), worker riêng, hoặc **hoãn F-02** và chỉ nhận video đã đúng chuẩn (chặn ở validate). Chọn hướng nào quyết định `transcodeStatus` có ý nghĩa gì.

**Quyết định:** 

### 8. [F/OQ-F4] Trần dung lượng/thời lượng video một lần up?

*Vì sao chặn:* `UPLOAD_CONFIG.video` đang **500MB** (`lib/storage/upload-config.ts`) trong khi ảnh là 10MB. QLCS phải **xem hết** mọi video (F-18) ⇒ 10 video × 10 phút = 100 phút mỗi ngày mỗi lớp. Không có trần thời lượng thì F-18 biến trang duyệt thành việc bất khả thi.

**Quyết định:** 

### 9. [F/OQ-F5] Media prod đang có `classSessionId = null` xử lý sao khi bật điều kiện F-04?

*Vì sao chặn:* Thêm `classSessionId: { not: null }` vào đường đọc PH (§6.1.4) làm chúng **biến mất khỏi portal ngay lập tức**. Cần chọn: backfill theo `takenAt` khớp `ClassSession.date`, hay miễn trừ media trước một mốc. Số lượng thực tế chưa đo (cần truy vấn prod).

**Quyết định:** 

### 10. [F/OQ-F6] Dọn object R2 **mồ côi lịch sử** (do `deleteMedia`/`deleteDraftMedia` cũ và các row `REJECTED`) — làm trong F hay tách?

*Vì sao chặn:* Bucket công khai ⇒ mỗi object mồ côi là một ảnh học viên tải được vô danh. Nhưng đây là việc **rà kho**, không phải vòng đời, và cần dry-run + người vận hành chạy tay (luật cứng #4).

**Quyết định:** ⚙️ **Chốt kỹ thuật 24/08/2026 (Dev) — TÁCH khỏi đợt F, làm story riêng.** Lý do: đây là **rà kho lịch sử**, khác bản chất với vòng đời media mà F đặc tả; nhét vào F là trộn hai loại rủi ro trong một lần chạy. Story riêng: liệt kê → đối chiếu DB → báo cáo → xoá, **dry-run mặc định**, người vận hành chạy tay (luật cứng #4), giữ log từng object đã xoá. Ưu tiên: ngay sau khi F đóng, **không** để sang quý sau — mỗi ngày trôi là thêm object mồ côi mới.

### 11. [F/OQ-F8] Cảnh báo F-21 gộp vào `/api/cron/parent-request-reminder` (23 cron) hay thêm entry thứ 24?

*Vì sao chặn:* Hồ sơ repo lo ngại giới hạn số cron nhưng **đánh dấu CHƯA KIỂM CHỨNG**. Cần một câu trả lời dứt khoát về giới hạn của gói Vercel đang dùng.

**Quyết định:** ⚙️ **Chốt kỹ thuật 24/08/2026 (Dev) — THÊM entry cron RIÊNG (thứ 24).** Nỗi lo về trần cron đã **đo xong, không có thật**: `vercel.json` đang khai **23** cron, gói Pro cho **40**. Chọn tách riêng vì: gộp hai job khác mục đích vào một khe làm chúng **chết chung** (một lỗi là mất cả hai), không tắt riêng được khi cần, và log lẫn lộn. ⚠️ Nếu dự án không ở gói Pro thì con số trần khác — kiểm bằng cách deploy thử, Vercel từ chối build khi vượt.

---

## Khu vực G — Module lead  ·  `docs/prd/G-lead.md`

### 12. [G/OQ-G2] 🔴 "Doanh số theo học sinh" lấy từ **`Payment` thực thu** hay **`Order.totalAmount`**?

*Vì sao chặn:* Khu vực B đã chốt *thực thu*. Nếu C-03 dùng `Order.totalAmount` thì hai tab cùng màn hình cho hai con số khác nhau. PRD khuyến nghị `Payment`

**Quyết định:** ✅ **24/08/2026 — `Payment` đã xác nhận (CONFIRMED)**, theo quyết định B3. Không dùng `Order.totalAmount`, không dùng `LeadChild.contractValue`.

### 13. [G/OQ-G4] Khi **mọi** con đã `LOST`, `Lead.status` có tự chuyển `LOST` không?

*Vì sao chặn:* PRD đề xuất **không** tự động (§6.5). Nếu chủ dự án muốn tự động thì phải quyết nơi chạy (resolver lúc đọc vs job ghi) và ai chịu trách nhiệm số liệu

**Quyết định:** 

### 14. [G/OQ-G5] Một lead có bao nhiêu con là **thực tế tối đa**? Có cần trần không?

*Vì sao chặn:* Ảnh hưởng UI bảng con và cách hiển thị doanh số gộp trên dòng lead

**Quyết định:** 

### 15. [G/OQ-G6] Danh mục **lý do rớt** ban đầu gồm những giá trị nào? Danh mục **nguồn lead** gồm những gì?

*Vì sao chặn:* Spec ghi rõ hai giá trị này *"đang để trống trong Cấu hình vận hành"*. Không có danh sách thì G-06-1 không nghiệm thu được, và migrate `Lead.source` (String tự do) không có đích để map

**Quyết định:** ⚠️ **Trả lời một nửa 24/08/2026.** *Lý do rớt:* **KHÔNG có danh mục** — dùng **ô ghi chú tự do** (quyết định 12(b)) ⇒ bỏ nửa `LeadLostReason` của SL-11, G-06-2 chỉ còn phần nguồn lead. *Nguồn lead:* **VẪN CHỜ** — chưa có danh sách thì `Lead.source` không có đích để map, và không migrate được.

### 16. [G/OQ-G7] 🔴 **Người nhập lead** hiển thị theo dạng `mãNV_tên` (spec G-01). Lưu 2 cột (`createdById` + `createdByCode`) hay 1 chuỗi ghép?

*Vì sao chặn:* PRD đề xuất 2 cột (`createdById` để nối `User`, `createdByCode` để giữ mã kể cả khi người đó nghỉ). Chuỗi ghép thì không join được

**Quyết định:** ⚙️ **Chốt kỹ thuật 24/08/2026 (Dev đề xuất, chờ phản đối): 2 cột.** Chuỗi `mãNV_tên` chỉ là cách **hiển thị**, dựng lúc đọc.

### 17. [G/OQ-G8] `LeadChild.gender` (`String?` tự do) có chuẩn hoá về enum `Gender` không?

*Vì sao chặn:* Đổi kiểu cột đang có dữ liệu PROD ⇒ luật cứng #4 ⇒ phải 2-phase (thêm cột enum, backfill "Nam"→`MALE`, đọc song song, drop sau). Có đáng làm trong G không, hay để nợ?

**Quyết định:** ⚙️ **Chốt kỹ thuật 24/08/2026 (Dev) — ĐỂ NỢ, không chuẩn hoá trong G.** `LeadChild.gender` giữ `String?`. Lý do: đổi kiểu cột đang có dữ liệu prod là 2-phase (thêm cột → backfill → đọc song song → drop), tốn một chu kỳ migration mà **không phục vụ yêu cầu nào của G-01…G-07**. Ghi vào nợ kỹ thuật kèm **điều kiện kích hoạt**: làm khi xuất hiện báo cáo cần **nhóm/lọc theo giới tính** — lúc đó dữ liệu bẩn mới thành vấn đề thật. Trong lúc chờ: validator chuẩn hoá **đầu vào mới** về `"Nam"`/`"Nữ"`/`"Khác"` để không đẻ thêm biến thể.

### 18. [G/OQ-G9] Học thử **không** đi qua `TrialClassV2` (xếp tay, buổi lẻ) có cần chỗ lưu riêng không?

*Vì sao chặn:* Hôm nay "ngày học thử + kết quả" chỉ có ở `LeadTrialHistory` (`:6117`), mà bảng đó gắn cứng `trialClassId` (`:6119`). Không có ca ad-hoc thì bỏ qua; có thì cần 2 cột denormalize trên `LeadChild`

**Quyết định:** 

### 19. [G/OQ-G10] 🔴 Bảng nào là **nguồn sự thật** cho lịch sử chuyển sale trong 3 bảng đang có?

*Vì sao chặn:* §2.4 — 3 bảng, 3 đường ghi, không bảng nào phủ hết; đường tự chia (`assign.ts`/`auto-assign.ts`) không ghi vào bảng nào. PRD đề xuất `LeadAssignmentHistory`. Chốt sai = tranh chấp hoa hồng vẫn không giải được

**Quyết định:** 

### 20. [G/OQ-G11] Bộ cột **mặc định** của danh sách lead sau G có giữ đúng 7 cột hiện tại không?

*Vì sao chặn:* PRD đề xuất **giữ nguyên** (§7.4) để bật G-04 không làm giao diện của ai nhảy. Nếu chủ dự án muốn đổi mặc định thì phải chốt **trước** khi user bắt đầu lưu cấu hình

**Quyết định:** ⚙️ **Chốt kỹ thuật 24/08/2026 (Dev) — GIỮ NGUYÊN đúng 7 cột hiện tại.** Bật G-04 không được làm giao diện của ai nhảy; người dùng tự thêm cột nếu muốn. Ràng buộc đi kèm: **danh sách cột phải khoá xong (SL-09b + SL-12) TRƯỚC khi ai đó lưu cấu hình đầu tiên** — đổi tên/bỏ cột sau đó biến cấu hình đã lưu thành mồ côi.

### 21. [G/OQ-G12] File **xuất Excel** có theo cấu hình cột của người xuất không, hay luôn xuất bộ cột cố định?

*Vì sao chặn:* Spec không nói. Theo cấu hình thì hai người xuất ra hai file khác nhau — khó đối chiếu. PRD nghiêng về **bộ cột cố định**, tách khỏi G-04

**Quyết định:** ⚙️ **Chốt kỹ thuật 24/08/2026 (Dev) — BỘ CỘT CỐ ĐỊNH**, tách hẳn khỏi G-04. Lý do: file xuất là thứ người ta **đối chiếu với nhau** và gửi ra ngoài; nếu nó chạy theo tuỳ chọn cột của người xuất thì hai người xuất cùng một bộ lọc ra hai file khác cấu trúc, và mọi công thức Excel dựng sẵn trên file đó gãy. Tuỳ chọn cột (G-04) chỉ đổi **màn hình**. Định dạng đã chốt `.xlsx` (B12).

---

## Khu vực C/D/B — Dashboard số liệu  ·  `docs/prd/CDB-dashboard.md`

### 22. [CDB/OQ-C2] Lead `status = 'DUPLICATE'` có bị loại khỏi mẫu số C3 không?

*Vì sao chặn:* §C.6.1 bẫy B5 chọn **không loại**. `app/(admin)/admin/crm/page.tsx:96` đang loại ⇒ hai màn cho hai số

**Quyết định:** 

### 23. [CDB/OQ-C4] "Lần tiếp cận gần nhất" tính những loại hoạt động nào?

*Vì sao chặn:* §C.6.5 chọn `CALL/MESSAGE/NOTE/EMAIL` **và** `actorId IS NOT NULL`. Nếu tính cả `STATUS_CHANGE` thì Sale reset được đồng hồ mà không gọi khách

**Quyết định:** 

### 24. [CDB/OQ-C5] Quyền đặt chỉ tiêu lead dùng key nào?

*Vì sao chặn:* Đề nghị dùng lại `leads:assign-config` (`lib/permissions/registry/crm.ts:22`). Nếu đẻ key mới thì phải seed `RolePermission` trên prod (`seed-prod-roles.yml`) — quên là QLCS trắng màn

**Quyết định:** 🔴 ⚙️ **Chốt kỹ thuật 24/08/2026 (Dev) — KHÔNG dùng lại `leads:assign-config`; khai key MỚI `lead_targets:manage`.** Khuyến nghị cũ của PRD dựa trên một tiền đề **sai**, đã kiểm trong mã:
1. **"Dùng lại thì khỏi seed" là sai.** `leads:assign-config` **chưa được seed cho vai nào** trong RBAC v2 (grep `prisma/seed-roles.ts` = 0 hit) và v1 chỉ cho `SUPER_ADMIN` (`lib/auth/permissions.ts:360`, test khẳng định `CENTER_MANAGER` → `false` — `permissions.test.ts:164`). ⇒ dù dùng lại hay đẻ mới, **vẫn phải seed prod**. Không tiết kiệm được gì.
2. **Dùng lại thì cấp nhầm quyền.** Key đó đang gác màn `/admin/leads/cau-hinh-chia` (`page.tsx:19`) ⇒ cấp cho QLCS để đặt chỉ tiêu là **mở luôn màn cấu hình chia lead tự động** — một năng lực khác hẳn, không ai định trao.
⇒ Khai `lead_targets:manage` trong `lib/permissions/registry/crm.ts`. Gate scope theo đúng tiền lệ `setRevenueTargetAction` (`app/(admin)/admin/bao-cao/doanh-thu/_actions.ts:43, 62-69`): `centerId = null` chỉ HO-level/SUPER_ADMIN; `centerId` cụ thể phải nằm trong `actor.visibleCenterIds`. ⚠️ **Phải chạy `seed-prod-roles.yml` sau khi merge lên `main`.`

### 25. [CDB/OQ-C8] Tỷ lệ thành công tính theo **lứa** (PRD chọn) hay theo **kỳ chốt**?

*Vì sao chặn:* §C.6.3 chọn lứa vì hai vế phải cùng tập người. Kỳ chốt dễ hiểu hơn với BGĐ nhưng **có thể vượt 100%**

**Quyết định:** 

### 26. [CDB/OQ-C9] 5 màn hình cũ (§C.2.2) có được sửa về công thức chuẩn không, hay để nguyên?

*Vì sao chặn:* Non-Goal 1 nói **để nguyên**. Nhưng để nguyên thì cùng lúc có 6 con số "tỷ lệ chốt" trên cùng hệ thống. Nếu sửa: phải thông báo trước cho người dùng, vì số của họ sẽ nhảy

**Quyết định:** 

### 27. [CDB/OQ-D3] Có bao nhiêu ad account? Một hay nhiều?

*Vì sao chặn:* `syncMetaAds` hiện đọc **một** `META_AD_ACCOUNT_ID` (`ads-insights.ts:85`). Nhiều tài khoản thì job phải lặp

**Quyết định:** 

### 28. [CDB/OQ-D4] 🔴 Token Meta là loại gì (Page / System User / long-lived User) và hết hạn bao lâu?

*Vì sao chặn:* Quyết định có cần `meta-token-refresh` không, và refresh kiểu gì. **Không** có cơ chế nào hôm nay (`vercel.json` chỉ có `zalo-token-refresh` `:40-43`) ⇒ token hết hạn là job chết im

**Quyết định:** 

### 29. [CDB/OQ-D5] Vai `MARKETING` cấp cơ sở có được sửa mapping D-07 không?

*Vì sao chặn:* `canEditAds` (`lib/crm/ads-insights.ts:44-49`) hiện chỉ `isSuperAdmin` **hoặc** `HO_MARKETING`. Gán campaign cho CS1 là **lấy tiền khỏi** CS2 ⇒ PRD nghiêng về **giữ nguyên** (chỉ HO)

**Quyết định:** 

### 30. [CDB/OQ-D6] Đơn vị chi tiết nhất là **campaign** hay **ad set**?

*Vì sao chặn:* Ảnh hưởng `level` khi gọi Meta và dung lượng bảng. PRD đề xuất `level=adset` (chi tiết hơn, gộp lên campaign lúc đọc luôn được; ngược lại thì không)

**Quyết định:** ⚙️ **Chốt kỹ thuật 24/08/2026 (Dev) — `level=adset`.** Lấy chi tiết hơn rồi gộp lên campaign lúc đọc thì luôn làm được; lấy ở mức campaign rồi muốn bóc xuống ad set thì **phải gọi lại toàn bộ lịch sử**. Dung lượng bảng lớn hơn nhưng vẫn nhỏ so với mức đáng lo. Lưu `campaignId` **và** `adsetId` trên cùng dòng để gộp không cần join.

### 31. [CDB/OQ-D7] Có cần "chốt sổ" chi phí quảng cáo theo tháng không?

*Vì sao chặn:* Nếu có, sửa mapping sau khi chốt **không** được đổi số quá khứ ⇒ cần bảng `AdsSpendLocked` (§D.6.1). Additive, làm sau được

**Quyết định:** 

### 32. [CDB/OQ-D8] Chi phí marketing **ngoài Meta** (tờ rơi, sự kiện, KOL) đi đường nào?

*Vì sao chặn:* PRD đề xuất: đi qua **bảng chi phí của B** (§B.6.2), **không** nhét vào bảng ads — nếu không B3 trừ hai lần

**Quyết định:** 

### 33. [CDB/OQ-D9] `/admin/marketing/funnel` cũ: sửa hay bỏ?

*Vì sao chặn:* Non-Goal 5 chọn **không sửa, treo banner**. Nhưng để lâu thì có hai trang nói hai số

**Quyết định:** 

### 34. [CDB/OQ-B2] 🔴 Một khoản bị điều chỉnh **nhiều lần** thì tính bản nào?

*Vì sao chặn:* §B.6.1 giả định G2 + bẫy B2. `adjustPayment` **không chặn** điều chỉnh chồng (`payment.ts:521-557`). Đề xuất: **bản `ADJUSTED` mới nhất thắng**. Chạy truy vấn rà ở §B.6.8 để biết prod có ca này chưa

**Quyết định:** 

### 35. [CDB/OQ-B3] 🔴 "Dòng tiền" nghĩa là gì với BGĐ: **thu ghi nhận** hay **tiền vật lý về ngân hàng**?

*Vì sao chặn:* §B.6.4. Chọn tiền ngân hàng ⇒ bỏ sót toàn bộ thu tiền mặt và cần bảng giao dịch chi (chưa có). PRD chọn thu ghi nhận + bảng đối soát 3 lớp

**Quyết định:** 

### 36. [CDB/OQ-B4] 🔴 Danh mục **đầu phí** gồm những nhóm nào?

*Vì sao chặn:* §B.6.2 đề xuất `ADS · RENT · SALARY · UTILITY · MARKETING_OFFLINE · OTHER`. Không có danh sách thì B-05 không có template và B2 không nghiệm thu được

**Quyết định:** 

### 37. [CDB/OQ-B5] Permission key cho chi phí?

*Vì sao chặn:* Đề xuất `costs:view` / `costs:manage` / `costs:approve` trong `lib/permissions/registry/finance.ts`. ⚠️ Key mới **phải** seed `RolePermission` trên prod qua `seed-prod-roles.yml` **sau** khi merge — quên là kế toán trắng màn (tiền lệ đã ghi trong `MEMORY.md`)

**Quyết định:** ⚙️ **Chốt kỹ thuật 24/08/2026 (Dev) — `costs:view` / `costs:manage` / `costs:approve`** trong `lib/permissions/registry/finance.ts`. Ba key tách rời vì ba việc khác nhau: xem báo cáo · nhập/sửa phiếu chi · **duyệt** (thứ quyết định con số lợi nhuận). Seed đề nghị: `view` cho QLCS + kế toán; `manage` cho kế toán; `approve` cho `HO_ACCOUNTANT` + `SUPER_ADMIN` — người nhập **không** tự duyệt được. ⚠️ **Phải chạy `seed-prod-roles.yml` sau khi merge lên `main`**, quên là kế toán trắng màn (tiền lệ đã ghi trong `MEMORY.md`).

### 38. [CDB/OQ-B6] Chi phí **cấp công ty** (`centerId = null`) có phân bổ về cơ sở không?

*Vì sao chặn:* §B.6.2 giả định: **không** ở v1, hiện dòng riêng. Phân bổ ⇒ lợi nhuận từng cơ sở đổi, và cần chốt tiêu chí chia (doanh thu? sĩ số?)

**Quyết định:** 

### 39. [CDB/OQ-B7] Chi phí cần **duyệt** mới vào báo cáo, hay nhập là tính?

*Vì sao chặn:* §B.6.2 chọn phải duyệt (`status = APPROVED`). Nếu bỏ duyệt thì nhanh hơn nhưng ai cũng đổi được lợi nhuận

**Quyết định:** 

### 40. [CDB/OQ-B8] Có cần **đóng sổ theo tháng** (khoá không cho sửa) không?

*Vì sao chặn:* Trùng OQ-D7. Không đóng sổ thì báo cáo tháng trước có thể đổi bất kỳ lúc nào

**Quyết định:** 

### 41. [CDB/OQ-B9] Range mặc định của tab B là gì?

*Vì sao chặn:* A-02 chốt mặc định *"01 → hôm nay"* (`A-nen-tang.md` §6.2). Với tài chính, người dùng thường muốn **tháng trước trọn vẹn**. Đổi mặc định riêng cho tab B thì 4 tab không còn dùng chung một bộ lọc

**Quyết định:** ✅ **24/08/2026 — "01 → hôm nay", giống 3 tab kia.** Không có ngoại lệ cho tab B. Hệ quả chấp nhận: mặc định là tháng đang chạy (số dở dang), người xem tự đổi khi cần chốt sổ.

---

## Khu vực E — Tương tác khách hàng  ·  `docs/prd/E-tuong-tac.md`

### 42. [E/OQ-1] **Chốt định nghĩa "PH đã tương tác".** Ba phương án ở §6.2: **(A)** PH đã **gửi ≥1 tin** trong range · **(B)** PH có `lastReadAt ≥ dateFrom` · **(C)** A **hoặc** đọc thông báo trong range. **Khuyến nghị: (A)**, vì chỉ (A) đo đúng *khoảng thời gian* — `lastReadAt` (`prisma/schema.prisma:6539`) và `lastLoginAt` (`:1066`) là **vô hướng, bị ghi đè**, nên "đã tương tác trong tháng 7" không tính được từ

*Vì sao chặn:* Không có định nghĩa thì E-02 (tử số), E-03 (dòng nào lên bảng) và E-04 (kênh nào hiện trong dropdown) đều không code được. **Kèm câu hỏi con:** có tính kênh **1-1** vào không? Nếu có thì không được lọc phạm vi qua `Conversation.centerId` (§6.2 bẫy chung).

**Quyết định:** 

### 43. [E/OQ-2] **E-02 lọc `Enrollment.status` nào?** Enum có 9 giá trị (`prisma/schema.prisma:71-84`). Hằng sẵn có `ENROLLMENT_ACTIVE_STATUS_LIST = [ACTIVE, CONFIRMED, STUDYING, PAUSED]` (`lib/enrollment-status.ts:17`). Hai câu phải trả lời riêng: **(a)** `PAUSED` (tạm dừng, vẫn thuộc lớp — `lib/enrollment-status.ts:5`) có tính là "đang có con học"? **(b)** `COMPLETED` (học xong khoá, chưa nghỉ hẳn) có tính? **K

*Vì sao chặn:* Đây **chính là** mẫu số. Chọn khác đi thì tỉ lệ đổi mà không ai đối chiếu được.

**Quyết định:** 

### 44. [E/OQ-3] **E-04: QLCS bấm vào kênh 1-1 thì xảy ra gì?** Đo được: QLCS **không** là participant của DM, **không** mở được DM mới (`DmKind` chỉ có 2 giá trị — `lib/chat/dm.ts:67`; `openDmTargetOf` ép `centerId: null` để QLCS tự deny — `:135, 139`), và `assertActiveParticipant` chặn cứng (`lib/chat/queries.ts:434`). Ba lựa chọn: **(a)** dropdown chỉ liệt kê kênh người xem là participant (QLCS → chỉ nhóm lớp),

*Vì sao chặn:* Spec E-04 viết "dropdown kênh (1-1 / nhóm lớp)" như thể cả hai đều mở được. Không chốt thì hoặc code ra nút chết, hoặc ai đó "vá" bằng cách nới `assertActiveParticipant`.

**Quyết định:** 

### 45. [E/OQ-4] **Quyền cấp trang cho tab E là gì?** Không mượn `chat:read` được: dưới RBAC v2 nó seed scope CENTER/ASSIGNED nên gọi **không target** luôn trả `false` — xanh ở local, khoá cửa trên prod (`app/(admin)/admin/bao-cao/chat-pilot/page.tsx:10-14`; `app/(admin)/admin/tin-nhan/page.tsx:16-19`). Cần một action khai mới hoặc mượn quyền dashboard sẵn có.

*Vì sao chặn:* Chọn sai = QLCS mất cửa trên prod, không tái hiện được ở dev.

**Quyết định:** ⚙️ **Chốt kỹ thuật 24/08/2026 (Dev) — khai key MỚI `dashboard:view` (scope `GLOBAL`) gác trang dashboard 4 tab; TỪNG TAB gate thêm bằng key lĩnh vực sẵn có.** Cụ thể: **B** → `payments:view` · **C** → `leads:view-all` · **D** → `dashboard:view` (chưa có key ads trong registry — quyền **sửa** mapping vẫn là `canEditAds`, xem nợ dưới) · **E** → `dashboard:view` là đủ, cột SĐT phụ huynh vẫn đi qua `canViewParentContact`.
❌ **Không mượn `chat:read`**: dưới RBAC v2 nó seed scope `CENTER`/`ASSIGNED` nên gọi **không target** luôn trả `false` ⇒ xanh ở local (v1), **khoá cửa trên prod** (v2). Đây đúng là loại lỗi không tái hiện được ở dev.
📌 **Nợ ghi kèm:** `canEditAds` (`lib/crm/ads-insights.ts:44-49`) đang so `roleCode` bằng tay — vi phạm luật Nền Hệ thống #1 ("mọi kiểm tra quyền đi qua `can()`"). Đưa quyền ads vào registry là việc của khu vực D (OQ-D5), không nhét vào E. ⚠️ `dashboard:view` là key mới ⇒ **chạy `seed-prod-roles.yml` sau merge**.

### 46. [E/OQ-5] **E-01: thứ tự suy "giáo viên phụ trách" của một buổi?** Repo đang có 4 thứ tự khác nhau (§2.3). **Khuyến nghị: `substituteTeacherId ?? actualTeacherId ?? class.teacherId`** (bản của `lib/lms/schedule-conflict.ts:109`) vì nó tôn trọng dạy thay.

*Vì sao chặn:* Chọn khác báo cáo hiệu suất GV (`hieu-suat-gv/page.tsx:285`) thì hai màn báo hai tên GV cho cùng một buổi.

**Quyết định:** ⚙️ **Chốt kỹ thuật 24/08/2026 (Dev) — `substituteTeacherId ?? actualTeacherId ?? class.teacherId`** (bản của `lib/lms/schedule-conflict.ts:109`), vì nó tôn trọng dạy thay: người **thật sự đứng lớp** mới là người chịu trách nhiệm buổi đó.
Bắt buộc đi kèm: đưa thứ tự này vào **một helper dùng chung** (vd `lib/lms/session-teacher.ts`), E-01 gọi helper chứ không tự viết lại — nếu không repo có **thứ tự thứ năm**. Chuyển 4 chỗ cũ (trong đó có `hieu-suat-gv/page.tsx:285`) sang helper là **ticket riêng**, không gánh trong E: đổi chúng làm số báo cáo hiệu suất GV nhảy, phải báo trước.

### 47. [E/OQ-6] **E-01 trang đích: mở rộng `/admin/attendance` hay dựng trang mới?** Mở rộng phải thêm `dateFrom`/`dateTo` vào `searchParams` hiện chỉ có `{sessionId, classId, centerId}` (`app/(admin)/admin/attendance/page.tsx:67`). Trang mới thì trùng chức năng. **Khuyến nghị: mở rộng** — trang đó là đích của thông báo, đổi đường dẫn gãy link cũ (`:9-11`).

*Vì sao chặn:* Ảnh hưởng ước lượng và ảnh hưởng link trong hộp thông báo người dùng.

**Quyết định:** ⚙️ **Chốt kỹ thuật 24/08/2026 (Dev) — MỞ RỘNG `/admin/attendance`**, thêm `dateFrom`/`dateTo` vào `searchParams` (hiện chỉ có `{sessionId, classId, centerId}` — `page.tsx:67`). Không dựng trang mới: trang đó đang là **đích của link trong hộp thông báo người dùng** (`:9-11`), đổi đường dẫn là gãy link cũ, và hai trang cùng chức năng thì sớm muộn lệch nhau. Ràng buộc: thiếu `dateFrom`/`dateTo` ⇒ hành vi **y hệt hôm nay** (tương thích ngược tuyệt đối).

### 48. [E/OQ-7] **E-03 có xuất hiện trên site giáo viên không?** Nếu có thì cột SĐT phải rỗng với TEACHER (`canViewParentContact` loại TEACHER có chủ đích — `lib/auth/permissions.ts:947`).

*Vì sao chặn:* Quyết định phạm vi test PII.

**Quyết định:** 

### 49. [E/OQ-8] **Có chấp nhận thêm index cho `Message(senderId, createdAt)` không?** Phương án (A) của OQ-1 cần nó; hiện `Message` không có index nào bắt đầu bằng `senderId`/`createdAt` (`prisma/schema.prisma:6569-6571`). Đây là migration **thêm index**, không đụng cột đang có dữ liệu ⇒ không vi phạm luật Nền Hệ thống #4, nhưng vẫn phải nằm trong story được giao.

*Vì sao chặn:* Chọn (A) mà không thêm index ⇒ tab E quét bảng `Message` mỗi lần mở dashboard.

**Quyết định:** ⚙️ **Chốt kỹ thuật 24/08/2026 (Dev) — CÓ, thêm `@@index([senderId, createdAt])` trên `Message`.** Đây là migration **thêm index**, không đụng cột đang có dữ liệu ⇒ không vi phạm luật cứng #4, nhưng vẫn nằm trong story E-02 chứ không tách lẻ. Không có nó thì mỗi lần mở dashboard là một lần **quét toàn bảng `Message`** — bảng lớn nhanh nhất hệ thống. ⚠️ Tạo index trên bảng đang chạy nên dùng `CREATE INDEX CONCURRENTLY` (viết tay trong file migration), tránh khoá ghi.

---

## PHẦN CUỐI — 12 câu CHẶN KHỞI CÔNG (quyết trước, đã trình bày trong chat)

| # | Câu | Khuyến nghị |
|---|---|---|
| B1 | Bảng mới mang `centerId` + `orgUnitId` hay chỉ `orgUnitId`? (SL-00) | **Cả hai** — chỉ `orgUnitId` thì `injectScope` không lọc được |
| B2 | "Đã chốt" = gì? (OQ-C1) | Chỉ `ENROLLED` — **chạy §C.6.9 đo trước** |
| B3 | Thống nhất "thực thu" hay chỉ đổi nhãn? (OQ-B1) | Thống nhất về `Payment CONFIRMED` — **chạy §B.6.8 đo trước** |
| B4 | Nối doanh số theo học sinh kiểu gì? (OQ-G1) | Thêm `Order.leadChildId` |
| B5 | **Lý do rớt đặt ở `Lead` hay `lead_student`?** (OQ-C3 / OQ-G3) | `lead_student` — ⚠️ hai tài liệu của tôi đang **mâu thuẫn**, cần bạn phân xử |
| B6 | "Học bạ đã xuất" nghĩa là gì? (OQ-F1) | "Đã phát hành" (`status = PUBLISHED`) — nghĩa còn lại hiện không trả lời được |
| B7 | Ảnh trẻ em: chấp nhận rủi ro hay sửa trước? | Quyết định **pháp lý**, không phải kỹ thuật |
| B8 | Tách bucket riêng cho ảnh lớp trong đợt F? (OQ-F7) | Có — không tách thì mọi biện pháp khác chỉ là hình thức |
| B9 | Đã ban hành `SR.QD.232` chưa? Ngày áp dụng? (OQ-D1) | Việc **ngoài code**, phải xong trước khi bật D-01 |
| B10 | Ad account Meta: tiền tệ + múi giờ? (OQ-D2) | Câu **tra cứu**, không phải lựa chọn |
| B11 | "Từ cấp quản lý trở lên" gồm vai nào? (OQ-2 của A) | — |
| B12 | Xuất lead giữ CSV hay đổi `.xlsx`? (OQ-6 của A) | — |

### Quyết định của chủ dự án — chốt 24/08/2026

> Nguồn: trả lời trực tiếp trong chat 24/08/2026 (12 câu đúng thứ tự đã trình bày).
> Phần này **thắng** phần thân bài của mọi PRD nếu có xung đột.

**Quyết định B1 — cột phạm vi của bảng mới:** mang **CẢ HAI** `centerId` + `orgUnitId`, để còn lọc được.
*Hệ quả:* 5 bảng mới của F/G khai `SCOPED_MODELS` + `BACKFILL_SPECS` + `getModelPrefixes` **cùng lúc** với
cột (thiếu `BACKFILL_SPECS` → test `[US-07-IT-08b]` đỏ). `lib/org/dual-write.ts` tự lấp `orgUnitId` — code
mới không tự gọi `orgUnitIdForCenter()`.

**Quyết định B2 — "đã chốt":** lead **đã đến bước đăng ký thành công và trở thành học viên của trung tâm**
⇒ `LeadChild.status = ENROLLED`. **Không** tính "đã trả tiền nhưng chưa ghi danh" ⇒ `LeadChildStatus` giữ
đúng 6 giá trị của SL-09, không thêm giá trị enum trên bảng đã có dữ liệu prod.
*Vẫn phải làm:* chạy §C.6.9 (chỉ đọc) trên prod **trước** khi bật C3 — để biết số nhảy bao nhiêu và báo
trước cho người dùng, không phải để đổi định nghĩa.

**Quyết định B3 — thực thu:** thống nhất toàn hệ thống về **`Payment` đã xác nhận (CONFIRMED)**.
*Hệ quả:* đây là **Đường 1** của OQ-B1, không phải "chỉ đổi nhãn" — `accountant-dashboard.tsx:26-31` và
`funnel-query.ts:17-20` phải sửa **logic**. Số doanh thu của kế toán và ROAS sẽ **tụt ngay** khi lên prod
⇒ chạy §B.6.8 đo mức tụt + thông báo trước cho kế toán và marketing. Kéo theo **OQ-G2 đóng luôn**:
"doanh số theo học sinh" lấy từ `Payment`, **không** `Order.totalAmount`, **không** `LeadChild.contractValue`.

**Quyết định B4 — nối doanh số về từng con:** theo khuyến nghị ⇒ phương án **(a)** của OQ-G1:
`Order.leadChildId String?` + relation + `@@index([leadChildId])`, quy tắc **một đơn – một con**.
*Hệ quả:* đơn cũ chỉ backfill tự động được khi lead có **đúng 1** con; phần còn lại để `null` và báo cáo
phải hiện một dòng "chưa quy được về con" thay vì âm thầm bỏ.

**Quyết định B5 — lý do rớt đặt ở `Lead` hay `lead_student`:** ✅ **`Lead` (cấp phụ huynh)** — chốt
24/08/2026, ngược với khuyến nghị của tôi. ⇒ `Lead.lostNote Text?` + `Lead.lostAt DateTime?` (đúng SL-10
của `A-nen-tang.md` §10.3); `docs/prd/G-lead.md` §6.3.b đã sửa cho khớp.
*Ranh giới phải giữ:* **trạng thái** rớt vẫn ở `LeadChild.status = LOST` (theo từng con), chỉ **lý do** là
của cả phụ huynh.
*Hai hệ quả đã biết và chấp nhận:* (1) một PH hai con rớt vì hai lý do khác nhau ⇒ lần ghi sau **đè** lần
trước, muốn tra lý do từng con phải đọc `AuditLog`/`LeadActivity`; (2) khi gỡ một con khỏi `LOST`, **chỉ
được xoá** `Lead.lostNote`/`lostAt` nếu **không còn con nào** `LOST` — xoá vô điều kiện là mất lý do của
đứa còn lại.

**Quyết định B6 — "học bạ đã xuất":** nghĩa là **đã gửi đến được cho phụ huynh**; thêm trạng thái
**"Đã gửi đến PH"**.
*Cách làm bắt buộc (nếu không PH mất học bạ):* thêm cột **additive** `ReportCard.sentToParentAt` và
**giữ nguyên** `status = PUBLISHED`; "Đã gửi đến PH" là **nhãn suy ra** từ `sentToParentAt != null`, không
phải giá trị enum mới. Lý do đo được: hai đường đọc của PH lọc cứng `status = "PUBLISHED"`
(`lib/lms/report-card.ts:220`, `:239`) và route PDF `app/api/portal/report-card/[id]/route.ts` cũng vậy —
thêm giá trị enum rồi chuyển trạng thái sang đó là **PH mất học bạ ngay lúc bấm gửi**.
*Mốc "đã gửi" lấy từ đường đã có:* handler `reportcard.published` đang tạo `Notification` cho PH
(`lib/_handlers/report-card.ts:33-44`) ⇒ set `sentToParentAt` trong **cùng** handler, sau khi upsert thông báo.
*Kéo theo:* F-05 (`decideMediaRetention`) đổi điều kiện từ `status = PUBLISHED` sang
`sentToParentAt IS NOT NULL` — media chỉ được xoá sau khi học bạ **thực sự đến** PH.

**Quyết định B7 — ảnh trẻ em:** **chấp nhận rủi ro**. Quyết định của chủ dự án, ghi lại nguyên văn ở đây
để sau này còn truy được ai chốt và chốt ngày nào. Không chặn khởi công F.

**Quyết định B8 — bucket riêng cho media lớp:** **tách luôn trong đợt F** (OQ-F7 = làm sớm).
*Hệ quả:* khoá **trước SL-02** vì ảnh hưởng object key; `isOwnStorageUrl` (`actions.ts:150-156`) phải nới để
nhận **2** bucket; media cũ vẫn nằm ở bucket công khai — đó là di sản, dọn theo OQ-F6.

**Quyết định B9 — `SR.QD.232`:** **đã ban hành**, ngày áp dụng **23/08/2026**.
*Hệ quả:* job D-01 chỉ cưỡng chế quy ước đặt tên từ 23/08/2026; dữ liệu trước mốc đó mặc định rơi vào
`CHƯA PHÂN BỔ` và sửa bằng gán tay (D-07) — đây là chuyện đã biết trước, không phải lỗi.

**Quyết định B10 — ad account Meta:** tiền **VND**, múi giờ **GMT+7 (Asia/Ho_Chi_Minh)**.
*Hệ quả:* không cần lớp quy đổi tiền tệ; `statDate` khớp trục ngày của B5. Vẫn giữ bước xác nhận
`account_currency` + `timezone_name` trong lần chạy job đầu tiên (chốt bằng dữ liệu trả về, không bằng niềm tin).

**Quyết định B11 — "từ cấp quản lý trở lên":** **quản lý từng cơ sở → quản lý khu vực (tỉnh/TP hoặc vùng)
→ giám đốc**.
⚠️ *Hệ quả phải biết trước khi code A-03:* hệ thống hôm nay **chỉ có 2 trong 3 tầng đó**.
`CENTER_MANAGER` có; tầng giám đốc hiện chỉ có `SUPER_ADMIN` đại diện; **không có vai quản lý khu vực**
(15 RoleDef trong `prisma/seed-roles.ts`, không vai nào ở REGION) và picker đơn vị **cố ý** không cho chọn
node REGION (`lib/org/org-tree.ts:172-178`). ⇒ **A-03 v1 mở cho `CENTER_MANAGER` + `SUPER_ADMIN`**; tầng
khu vực là việc thêm RoleDef mới + mở neo vai tại REGION (P2, không nhét vào đợt này).
Các vai **chức năng** Hội sở (`HO_HR`, `HO_ACCOUNTANT`, `HO_MARKETING`, `HO_SALE`) **không** nằm trong nhóm
này — họ là chuyên môn, không phải cấp quản lý. Muốn thêm thì nói.

**Quyết định B12 — xuất lead:** đổi sang **`.xlsx`**. Dùng `xlsx` (SheetJS) **đã có** trong
`package.json:112` — không thêm thư viện. OQ-G12 (bộ cột cố định vs theo cấu hình
người xuất) **chưa có chỉ đạo khác** ⇒ giữ khuyến nghị PRD: **bộ cột cố định**.

**Quyết định 12(a) — ngưỡng cảnh báo lead treo:** **vàng ≥ 2 ngày · đỏ ≥ 7 ngày** (chốt 24/08/2026).
Vào registry `crm.staleLeadWarnDays = 2` và `crm.staleLeadDangerDays = 7`, cả hai `centerOverridable` —
không hardcode.

**Quyết định 12(b) — lý do rớt:** **ô ghi chú tự do**, **không** danh mục.
*Hệ quả:* bỏ **nửa `LeadLostReason`** của SL-11 (giữ `LeadSource` — danh mục nguồn lead **vẫn chờ**, xem
câu 15); G-06-1 và C-06-1 đổi từ "bắt buộc **chọn** lý do" thành "bắt buộc **nhập ghi chú**"; **C-06-3
(admin thêm/sửa/ẩn danh mục lý do rớt) bỏ khỏi phạm vi**.
*Đánh đổi đã biết:* không nhóm được văn bản tự do ⇒ **không có báo cáo "top lý do rớt"**. Thêm danh mục về
sau là việc additive (bảng danh mục + cột `lostReasonId`, ghi chú cũ giữ nguyên).

---

### Còn treo sau đợt trả lời 24/08 (đã rút xuống 1 câu)

| # | Câu | Trạng thái |
|---|---|---|
| ~~**B5**~~ | ~~Lý do rớt (ô ghi chú) đặt ở `Lead` hay `lead_student`?~~ | ✅ **Đóng 24/08/2026: `Lead`** |
| ~~**12(a) số đỏ**~~ | ~~Ngưỡng đỏ của lead treo~~ | ✅ **Đóng 24/08/2026: 7 ngày** |
| **Câu 15 (nửa sau)** | Danh mục **nguồn lead** gồm những gì? | ⏳ Chờ vận hành + marketing. Không có danh sách thì `Lead.source` (String tự do) không có đích để map, và `LeadSource` không seed được |
| ~~**Câu 5 (A/OQ-8)**~~ | ~~Cơ sở thứ hai của QLCS có thuộc **REGION khác thật** không?~~ | ✅ **Đóng 24/08/2026: CÓ** — tạo REGION thứ hai trong dữ liệu test |


### 🔴 Hệ quả gộp của 12 quyết định kỹ thuật: **5 permission key MỚI phải seed prod**

Ba quyết định (OQ-C5, OQ-B5, E/OQ-4) đẻ ra key mới. Chúng **không tự có** trên prod — `RolePermission`
chỉ được nạp qua workflow `seed-prod-roles.yml`, và triệu chứng khi quên là **màn trắng không kèm lỗi**,
không tái hiện được ở local (local chạy v1).

| Key mới | Cho vai nào | Nếu quên seed |
|---|---|---|
| `lead_targets:manage` | `SUPER_ADMIN` + `CENTER_MANAGER` | Không ai đặt được chỉ tiêu lead ⇒ C-01 vô dụng |
| `costs:view` | QLCS + kế toán | Không ai xem được chi phí ⇒ tab B thiếu vế chi |
| `costs:manage` | Kế toán | Không ai nhập được phiếu chi |
| `costs:approve` | `HO_ACCOUNTANT` + `SUPER_ADMIN` | Chi phí nhập xong **nằm mãi ở `PENDING`**, không vào báo cáo |
| `dashboard:view` | `SUPER_ADMIN` + `CENTER_MANAGER` + vai HO | **Không ai vào được dashboard 4 tab** — hỏng nặng nhất trong 5 cái |

**Luật vận hành:** merge `test` → `main` **xong** thì chạy `seed-prod-roles.yml` **ngay trong cùng phiên
làm việc**, rồi mở prod kiểm bằng mắt đúng 1 tài khoản QLCS. Tiền lệ đã ghi trong `MEMORY.md`: quên bước
này thì vai liên quan thấy màn trắng dù mã đã lên, và không ai đoán ra vì sao.

### Việc MỚI sinh ra từ câu trả lời đợt 2 (24/08)

| # | Việc | Vì sao |
|---|---|---|
| **V-1** | **Đo prod:** 4 truy vấn Đ1–Đ4 (`A-nen-tang.md` §6.9) — trong đó **Đ4** dò xem anh Phúc có đang bị rớt khỏi nhóm chat lớp của cơ sở thứ hai không | Không đo thì không biết backfill bao nhiêu dòng, và **không biết SL-01 đã nổ chưa** — vì trên tài khoản `SUPER_ADMIN` nó không lộ ra ở dashboard |
| **V-7** | **Tạo tài khoản QLCS thuần** (không `SUPER_ADMIN`, không vai HO) giữ **2 cơ sở khác vùng** cho UAT + e2e A-01 | Nghiệm thu bằng tài khoản anh Phúc sẽ **luôn xanh** kể cả khi A-01 hỏng — `SUPER_ADMIN` che toàn bộ lỗi phạm vi |
| **V-2** | **SL-01 trước mọi thứ khác của A** | Cấu hình gán tay đang sống trên prod **không có cột `source`** ⇒ `reconcileUserOrgRoles` có thể `EXPIRED` nó ở lần sửa ô "Đơn vị" tiếp theo. Đây là rủi ro **đang mở**, không phải rủi ro tương lai. **Làm kể cả khi V-1 cho thấy anh Phúc là SUPER_ADMIN** — nó bảo vệ cấu hình A-01 sắp tạo |
| **V-4** | **3 rào R1/R2/R3 cho `roles:assign` của `HO_HR`** (`A-nen-tang.md` §6.10) + **chạy `seed-prod-roles.yml` sau merge lên `main`** | Mở quyền cấp-quyền mà không có R1/R2 thì HR tự cấp được mọi vai trừ `SUPER_ADMIN` |
| **V-5** | **REGION thứ hai** trong dữ liệu test + e2e "QLCS giữ 2 cơ sở khác vùng" | OQ-8 chốt cơ sở khác vùng là ca thật |
| **V-6** | Mọi hàm số liệu B/C/D/E nhận **`groupByCenter`** ngay từ bản đầu | OQ-4 bản chốt có công tắc tách; thêm sau = viết lại tầng truy vấn của 4 tab |
| **V-3** | **Script backfill `UserOrgRole`** cho cấu hình tay hiện có, dry-run trước, người vận hành chạy tay | Luật cứng #4 |
