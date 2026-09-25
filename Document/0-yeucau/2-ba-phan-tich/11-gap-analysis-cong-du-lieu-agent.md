# Gap-analysis — Cổng dữ liệu cho Agent Sata Robo (API + MCP)

> **Input:** tài liệu CEO "Hướng dẫn tích hợp: Cổng dữ liệu cho Agent Sata Robo (API + MCP)" v1.0 · 25/09/2026
> (`E:\WebSataRobo\KET_NOI\KET_NOI\HUONG-DAN-TICH-HOP-API-MCP.md` + `schema/` + `mau/` + `cong-cu/kiem-khuon.mjs`) ·
> repo `satarobo-vn` nhánh `main` (= prod) ngày 25/09/2026. `origin/test` đi trước 62 commit
> (phần lớn ở `lib/elearning`, `lib/finance`, orders, `lib/settings`, `content/legal`), và các phát hiện
> dưới đây đã được kiểm lại trên `origin/test` khi kết luận "chưa có".
> Nguồn đo: 7 mảng khảo sát, mỗi mảng có một lượt phản biện độc lập. Chỗ phản biện kết luận SAI hoặc MỘT PHẦN
> thì tài liệu này dùng bản đính chính (xem Phụ lục).
>
> **Output:** trả lời hai câu của CEO: (1) bộ tài liệu yêu cầu làm những gì, (2) có làm được trên hệ thống
> satarobo không. Sau đó là chi tiết: epic, hiện trạng, từng công cụ, bảo mật, xung đột luật repo, trả lời nháp
> 11 câu mục 15, câu hỏi cần chốt thêm, rủi ro, user story Đợt 0, những việc cố ý không làm, bước tiếp theo.
>
> **Nguyên tắc:** Doc 15 thắng doc cũ. Code thắng doc khi mô tả hiện trạng (mọi câu "hiện tại hệ thống…" đều
> dẫn `file:line`). Quyết định ký sau thắng quyết định ký trước. Tài liệu này KHÔNG tự quyết quyền, tiền hay
> chính sách: chỗ nào chưa chốt thì là câu hỏi có mặc định đề xuất và có người chịu trách nhiệm.
> Sửa BE thì sửa kèm FE + DB trong cùng PR.
>
> **Trạng thái:** 🟡 chờ trả lời câu hỏi. **Đợt 0 ĐÃ CODE 25/09/2026** theo chỉ đạo "bắt đầu thực hiện luôn" của chủ dự án, dùng các MẶC ĐỊNH ĐỀ XUẤT trong §7 — xem "Ghi chú thực thi" cuối tài liệu.
>
> Nơi lưu: `Document/0-yeucau/2-ba-phan-tich/11-gap-analysis-cong-du-lieu-agent.md` (chuẩn BA của repo). Bản gốc CEO: `E:\WebSataRobo\KET_NOI\KET_NOI\` (ngoài repo).

---

## §0. Trả lời nhanh

### (a) Bộ tài liệu yêu cầu làm gì

- **Mở một "cổng" cho phần mềm AI (agent) đọc dữ liệu nghiệp vụ của Sata Robo**: danh mục cơ sở, khoá học,
  nhân sự, lead tuyển sinh, hội thoại Zalo/Messenger, cuộc gọi, đăng ký học, chỉ tiêu tháng, chi phí quảng cáo,
  trần ngân sách, bài marketing chờ duyệt, văn bản khuyến mãi. Có 14 "công cụ đọc", mỗi công cụ trả dữ liệu theo
  một khuôn JSON cố định mà xưởng skill (AGENT_ADMIN) đã viết sẵn.
- **Làm một lần, dùng ba nơi:** agent chạy bên trong satarobo, agent chạy ngoài (máy chủ riêng, gọi qua REST),
  và Claude Code / app Claude của CEO (gọi qua giao thức MCP).
- **Khoá nhiều lớp:** mỗi agent có mã + mật khẩu riêng. Mật khẩu chỉ hiện một lần. Token sống 15 phút. Agent ngoài
  phải khai IP. Công cụ ghi phải ký từng yêu cầu.
- **Cấp quyền cần hai người:** kỹ thuật tạo, CEO duyệt, người duyệt khác người tạo, cả hai đăng nhập bằng
  xác thực 2 lớp (2FA). Mỗi quyền ghi rõ: công cụ nào × đọc hay ghi × cơ sở nào × hết hạn ngày nào.
- **Che dữ liệu cá nhân ở server** (tên phụ huynh, tên con, SĐT, email, CCCD, ảnh, tệp), bật mặc định,
  agent không tự tắt được.
- **Nhật ký mọi lượt gọi, công tắc tắt toàn cổng hoặc từng agent ngay lập tức** (không cần deploy), tự khoá
  agent khi có dấu hiệu bất thường, báo cáo tuần cho CEO.
- **Sau khi phần đọc ổn định:** agent được ghi **bản nháp** (người duyệt thì hệ thống mới áp dụng) và ghi vào
  bảng riêng của agent. Cấm tuyệt đối: xoá dữ liệu, chi tiền, nhắn phụ huynh, sửa quảng cáo, đổi quyền,
  sửa công/lương/điểm, xuất hàng loạt dữ liệu cá nhân.
- **Giao theo 7 đợt (0→6)**, làm trên `test.satarobo.vn` trước, lên production khi CEO nghiệm thu.
  CEO ước tổng 8–11 tuần.

### (b) Kết luận khả thi theo đợt

| Đợt | Nội dung | Làm được? | Điều kiện / đang chặn | CEO ước | BA ước lại (thô, tuần-người) |
|---|---|---|---|---|---|
| **0** Nền cổng + `danh_muc.lay_co_so` | 5 bảng mới, sổ công cụ, 13 bước kiểm, token, che dữ liệu lõi, màn quản trị tối thiểu, nhật ký | **Được, sau tiền đề** | **2FA chưa có (0%)** · chưa có phiếu mở phạm vi AI · chưa có vai "Giám đốc"/"Kỹ thuật" · 2 luật repo cần chốt cách đọc (#8, #9) | 1–2 tuần | 2FA ~1–1,5 + nền cổng 3–4 = **4–5,5** |
| **1** Danh mục + số liệu ít nhạy cảm (2,3,4,5,9,10,14) + client `xuong` | 7 công cụ | **Một phần** | 2 công cụ chặn vì quyết định nghiệp vụ (kênh, chức danh) · giá niêm yết có 3 nguồn xung đột · tỷ lệ chỉ tiêu chưa có chỗ lưu · công cụ 9 gộp 3 nguồn dữ liệu | 1 tuần | **2,5–4** (chưa tính thời gian chờ quyết định) |
| **2** MCP + OAuth 2.1/PKCE/2FA | Cổng MCP + máy chủ cấp quyền OAuth | **Được, khối mới lớn** | Chưa có OAuth Authorization Server nào · chọn tự viết hay dịch vụ ngoài · thêm thư viện mới · phải vá định tuyến nếu không đặt ở host public | 1 tuần | **4–6** nếu tự viết · ~1–2 nếu dùng dịch vụ ngoài (phá lệ monolith, xem §5 X8) |
| **3** Tuyển sinh CAO (6, 7) | Lead + hội thoại | **Được về kỹ thuật, chặn về pháp lý và nghiệp vụ** | Quy chế dữ liệu cá nhân nội bộ chưa có · phễu "G1–G8" không tồn tại trong hệ thống · lead có nhiều con nhưng khuôn chỉ 1 con · đo lại dữ liệu ZaloCRM trên test | 1–2 tuần | **3–4** |
| **4** Marketing (11, 12, 13) | Chi phí ads, trần ngân sách, bài chờ duyệt | **Phải xây lại tầng dữ liệu; công cụ 13 là module mới 100%** | Đồng bộ Meta viết rồi nhưng không cron nào gọi · Google Ads 0% · trần ngân sách chỉ là 1 con số · "bài chờ duyệt" không tồn tại | 1–2 tuần | **4–6** |
| **5** Cuộc gọi (8) | Cuộc gọi + bản ghi đã chuyển thành chữ | **Chặn** | Hợp đồng OmiCall + dịch vụ chuyển giọng nói (0%) · OmiCall đang TẮT mặc định · kết quả cuộc gọi chưa ai ghi · chưa có cron xoá ghi âm | 1 tuần | **2–3** sau khi có nhà cung cấp |
| **6** Ghi nháp (W1–W4) | Bản nháp, hộp duyệt, ký yêu cầu | **Được, sau khi chốt** | Cách lưu khoá ký đụng luật "secret chỉ ở env" · CEO chưa chốt danh sách ghi · W4 gửi cảnh báo tự động gần với "AI tự hành động" vẫn bị loại | 2 tuần | **3–4** |
| **Tổng** | | | | **8–11 tuần** | **~22–33 tuần-người** (nếu tự viết máy chủ OAuth) |

Ước lượng BA suy từ khối lượng đã đo được, **chưa phải cam kết của đội kỹ thuật**. Sai số lớn, chưa gồm thời
gian chờ quyết định nghiệp vụ và pháp lý. Đơn vị của BA là **tuần-người** (một người làm một tuần). Tài liệu CEO
không ghi đơn vị (xem "Kết luận thẳng" ngay dưới).

**Kết luận thẳng.** Về kiến trúc thì **làm được trên satarobo**. Không phải đổi stack. Cách spec muốn agent đi
qua `can()` + `scopedDb` như con người khớp đúng luật cứng số 1 của repo, và repo có sẵn nhiều khối tái dùng
(hạn mức, lấy IP an toàn, mẫu chữ ký HMAC, nhật ký bất biến, cấu hình đổi không cần deploy, mẫu "người duyệt khác
người đề nghị"). Nhưng có ba điều CEO cần biết. **Một**, không bắt đầu được ngay: 2FA chưa có, phạm vi AI chưa
có phiếu mở, và quy chế dữ liệu cá nhân nội bộ chưa có (chặn Đợt 3). **Hai**, lịch 8–11 tuần không đạt trong
điều kiện hiện nay. BA đo được khoảng 22–33 tuần-người. Nếu "8–11 tuần" của CEO là tuần lịch cho cả đội (khoảng
3 người theo tài liệu 03/08, chưa xác nhận lại) dồn toàn lực thì hai con số gần nhau. Nhưng đội không dồn toàn
lực được vì đang giữ nhiều việc đang chặn khác (điểm 5 dưới), nên thực tế sẽ dài hơn. **Ba**, 8/14 công cụ không
phải "mở cổng cho dữ liệu có sẵn" mà phải xây nguồn dữ liệu hoặc nghiệp vụ mới (xem §3).

### (c) Những điều quan trọng nhất CEO phải biết

1. **Chặn cứng số 1 — 2FA chưa tồn tại.** Không có TOTP/2FA cho vai nào. Bằng chứng: tài liệu bảo mật của repo tự
   ghi "chưa 2FA" (`Document/6-quality-security/11-security-design.md:110`); `git grep -w -i -E 'totp|otplib|speakeasy|otpauth'`
   trên `lib app prisma package.json` ở cả `main` lẫn `origin/test` ra 0 dòng (phải dùng `-w`: không có `-w` thì
   "requestOtp" khớp giả). Spec đặt 2FA làm điều kiện trước Đợt 0. Cần một hạng mục riêng, có ước lượng riêng.
2. **Phạm vi AI chưa được mở cho việc này.** Doc 15 §0 loại "AI (toàn bộ)". Ngày 21/08 mới đảo **hẹp** cho đúng
   một việc là AI chấm điểm chất lượng tư vấn, và vẫn loại "AI CRM assistant tự hành động"
   (`Document/2-architecture-design/15-final-architecture-blueprint.md:36`, `:1081`;
   `docs/sale-hub/bien-ban-chot-4-cong-2108.md:26-27`). Việc hẹp đó cũng chưa có dòng code nào. Yêu cầu 25/09
   rộng hơn nhiều, nên cần CEO ký một phiếu bổ sung ghi vào Doc 15 §0 + §11, như đã làm với site giáo viên.
   Ngay cả việc hẹp đã ký cũng kèm 4 ràng buộc (`bien-ban-chot-4-cong-2108.md:29-34`): kết quả phải **chờ người
   phúc tra**, không gắn lương/kỷ luật, mọi mục trừ điểm phải trích nguyên văn, có cờ tắt + trần chi phí. Công cụ
   ghi W1 của spec ("lưu điểm chấm, không cần người duyệt") chưa khớp ràng buộc thứ nhất (§5 X15).
3. **Pháp lý chưa sẵn sàng cho dữ liệu nhạy cảm.** Chưa có quy chế dữ liệu cá nhân nội bộ. Vai "Pháp chế" không
   tồn tại trong hệ thống. Chính spec trích NĐ 13/2023 (spec dòng 310), trong khi chính sách bảo mật công khai của
   repo đã chuyển sang Luật 91/2025/QH15 + NĐ 356/2025 (`content/legal/chinh-sach-bao-mat.md:5`). Ngoài ra dữ liệu
   (kể cả đã che) sẽ đi tới Claude, tức ra ngoài Việt Nam. Pháp chế cần xác nhận nghĩa vụ.
4. **Dữ liệu mẫu của xưởng lệch hệ thống thật ở nhiều chỗ.** Ví dụ: mẫu ghi CS1 và CS2 là hai pháp nhân, trong khi
   quyết định BLĐ 22/09 đã gộp cả hai về SATA ROBO (`lib/finance/hoa-don/phap-nhan.ts:132-138`), và tên
   "STEM Robotics & AI" không có ở đâu trong repo. "G1–G8" không phải trạng thái lead lưu trong hệ thống
   (`prisma/schema.prisma:50-61` có 10 trạng thái lead; mốc SR.QD.217 là L1→L2→L3). G1–G8 chỉ có trong **thẻ điểm
   chấm tư vấn bản giả định** ngày 21/08 (8 giai đoạn: Chat lấy số → Cuộc gọi vàng → … → Chia tay thiện cảm), nằm
   ngoài repo (`satarobo-sale/plan/23-THE-DIEM-MAU-G1-G8-GIA-DINH.md`), và chính tài liệu đó ghi "không ban hành".
   Mã chức danh TGD/GDTT/TVV không tồn tại. "Kênh" của lead và "kênh" của hội thoại là hai danh mục khác nhau.
   Mỗi chỗ cần CEO hoặc xưởng chốt, kỹ thuật không tự chọn.
5. **Lịch và năng lực.** Đội đang giữ nhiều việc đang chặn khác: thanh toán GĐ5–7, hoá đơn điện tử (lập kế hoạch
   cùng ngày 25/09), hồ sơ Bộ Công Thương (82 việc, 29 chặn hồ sơ — `docs/ho-so-bo-cong-thuong/VIEC-CAN-LAM.md:7`),
   và cuộc đại tu phân quyền đang giữa chừng (`lib/permissions/can.ts` chạy song song `lib/auth/can.ts`). Chen việc
   này vào thì phải nói rõ việc nào bị hoãn.
6. **Ba lỗi dễ mắc nhất nếu làm vội, cả ba đều mở toang dữ liệu:**
   (a) Agent có thể vô tình được **quyền cao nhất hệ thống, thấy mọi cơ sở**. Repo có sẵn một "danh tính hệ thống"
   dùng cho tác vụ tự động, và danh tính này bỏ qua toàn bộ phân quyền. Lấy nó cho agent là cách nhanh nhất để chạy
   được, nên phải cấm bằng văn bản và bằng test (`SYSTEM_ACTOR`, `lib/auth/system-actor.ts:15-25`).
   (b) **Danh sách IP được phép có thể bị vượt bằng cách khai IP giả.** Ít nhất 7 chỗ cũ trong mã đọc IP theo cách
   tin lời người gửi (phần tử đầu của header `x-forwarded-for`). Chép lại cách đó cho cổng thì kẻ ngoài chỉ cần tự
   khai IP được phép.
   (c) **Agent chỉ được đọc nhưng thực tế có thể sửa.** Màn ngân sách quảng cáo và chỉ tiêu không có quyền "chỉ xem"
   riêng, chỉ có quyền "quản lý" (`*:manage`). Cấp quyền đó để agent đọc được thì agent cũng giữ quyền sửa.

---

## §1. Bảng ánh xạ yêu cầu → epic

| Epic | Mục spec | Bản chất | Thứ tự |
|---|---|---|---|
| **E0 — Tiền đề** (không phải code cổng) | §0 nguyên tắc 2, §4.3, §4.5, §6, §13 điều kiện Đợt 0/3 | 2FA TOTP cho vai duyệt; phiếu mở phạm vi AI (addendum Doc 15); quy chế dữ liệu cá nhân nội bộ + người giữ vai Pháp chế; tạo vai "Giám đốc"/"Kỹ thuật" | 1 |
| **E1 — Nền cổng (AG0)** | §2, §3, §4.1, §4.2, §4.5, §4.6, §5.2–5.6, §7, §11, §12 | 5 bảng mới (+ `AgentDraft` ở E9), sổ công cụ, 13 bước kiểm, token client_credentials, user dịch vụ, màn quản trị 5 thẻ, công tắc, nhật ký, tự khoá | 2 |
| **E2 — Thư viện che dữ liệu (PII)** | §6, §14.1 việc 4–5 | `lib/agents/pii.ts`: gắn nhãn toàn phần, HMAC SĐT với pepper riêng, che tên của đúng lead trong văn bản tự do, che ảnh/tệp | 2 (lõi) → 5 (đủ) |
| **E3 — Công cụ danh mục (DM)** | §9 công cụ 1–5 | Bọc OrgUnit/Center, Course, Employee, kênh, chức danh | 2 (công cụ 1) → 4 |
| **E4 — Công cụ kinh doanh ít nhạy cảm (KD)** | §9 công cụ 9, 10, 14 | Gộp đăng ký/học thử/hoàn tiền; chỉ tiêu tháng + tỷ lệ; văn bản khuyến mãi | 4 |
| **E5 — MCP + OAuth 2.1 (MCP)** | §4.3, §8 | Máy chủ cấp quyền OAuth (PKCE, DCR, màn đồng ý, RFC 9728/8707), cổng MCP Streamable HTTP | 3 |
| **E6 — Công cụ tuyển sinh CAO (TS)** | §9 công cụ 6, 7 | Lead + hội thoại: ánh xạ phễu, xử lý nhiều con, gộp Zalo + Messenger | 5 |
| **E7 — Dữ liệu marketing (MK)** | §9 công cụ 11–13 | Bảng chi phí theo chiến dịch + cron đồng bộ đêm; cấu trúc trần + ngưỡng + duyệt; module bài chờ duyệt mới | 6 |
| **E8 — Cuộc gọi (CG)** | §9 công cụ 8, §6 quy tắc ghi âm | Bật OmiCall, màn nhập kết quả cuộc gọi, chuyển giọng nói thành chữ, cron xoá ghi âm, hàm liệt kê | 7 |
| **E9 — Ghi nháp (GH)** | §4.4, §5.1, §10, `AgentDraft` | Ký HMAC, nonce, Idempotency-Key, hộp duyệt nháp, W1–W4, hoàn tác một nút | 8 |
| **E10 — Vận hành (VH)** | §4.1 gitleaks, §12 | Luật gitleaks, lọc Sentry theo tiền tố, báo cáo tuần, nhắc hết hạn khoá | rải theo E1 |

⚠️ **Phụ thuộc giữa epic**

- E0 (2FA) → E1 (màn duyệt 2 người) → mọi epic công cụ. E0 (2FA) → E5 (màn đăng nhập MCP bắt buộc TOTP).
- E0 (quy chế PII) → E6, E8 trên production. Spec dòng 311–312: quy chế phải ban hành **trước** khi mở công cụ CAO.
- E2 lõi (nhãn + HMAC SĐT) trước E6. E2 phần "che tên trong văn bản tự do" trước E6 (hội thoại) và E8 (bản ghi).
- E3 công cụ 5 (chức danh) và công cụ 3 (nhân sự) dùng chung một bộ mã chức danh: chốt công cụ 5 là chốt luôn
  trường `chuc_danh` của công cụ 3.
- E7 công cụ 11 cần token Meta chỉ-đọc **mới**. Token hiện tại dùng chung cho Messenger và Ads (`.env.example:96`).
- E8 cần hợp đồng OmiCall + nhà cung cấp chuyển giọng nói.
- E9 cần chốt luật #9 (khoá ký lưu ở đâu) trước khi thiết kế `AgentClientSecret`.
- Tất cả epic chạm phân quyền đi song song với cutover "Nền Hệ thống" P3/P4. Cần người giữ Nền Hệ thống xác nhận
  actor loại agent đi qua nhánh nào của `can()`, kẻo phải làm lại khi cutover xong.

---

## §2. Hiện trạng: tái dùng được vs phải xây mới

| Thành phần spec | Repo đã có gì (file:line) | Thiếu gì | Phức tạp |
|---|---|---|---|
| Sổ công cụ `lib/agents/tools` | Không có. `ls lib/agents` báo không tồn tại; grep `lib/agents\|@anthropic-ai\|openai\|mcp` trên `main` và `origin/test` ra 0 | Toàn bộ | TB |
| Route `/api/agent/v1/*` qua proxy | `/api/*` được cho qua trên mọi host: `lib/auth/route-policy.ts:267-282` (`isInfraPath`), nhánh public rơi `next` mặc định `:436-481`; `proxy.ts:128-148` | Không thiếu cho REST | Thấp |
| `/.well-known/oauth-protected-resource` (MCP) | `isInfraPath` KHÔNG có `/.well-known/` (`route-policy.ts:267-282`) ⇒ host admin 308 đi (`:786-803`), portal/teacher/elearning đòi đăng nhập (`:502-509`); host public an toàn | Vá `isInfraPath` + test nếu đặt MCP ở host khác public | Thấp |
| `test.satarobo.vn` | `detectHost()` trả `unknown` (`proxy.ts:26-34`), mã tự ghi "Nhánh này chạy cho localhost VÀ test.satarobo.vn" (`proxy.ts:259-260`) | Hành vi host khác prod ⇒ phải test riêng trên test | Thấp |
| Xác thực máy-với-máy | Chỉ có 1 secret toàn hệ thống cho cron: `lib/cron/auth.ts:8-16`; webhook dùng khoá riêng từng bên | Bảng client, token, client_credentials: mới 100% | Cao |
| Băm secret HMAC + pepper | Mẫu HMAC-SHA256 fail-closed 7 bước: `lib/integrations/zalocrm/webhook.ts:6-13`, `:75-85` | Pepper riêng cho agent, bảng lưu bản băm | TB |
| So sánh thời-gian-hằng | `lib/security/safe-equal.ts:8`, nhưng đang bị định nghĩa lại 5 lần (`lib/lead/webhook.ts:26`, `lib/otp/service.ts:41`, `lib/payments/payos.ts:118`, `lib/payments/sepay.ts:188`) | Không thiếu; cấm viết bản thứ 6 | Thấp |
| Mã hoá AES-256-GCM (khoá ký `srs_`) | Không có: grep `createCipheriv\|aes-256-gcm` toàn repo = 0; không cột nào trong schema là dữ liệu mã hoá hai chiều | Mới hoàn toàn, và là tiền lệ đầu tiên lưu secret trong DB (xem §5) | Cao |
| 2FA / TOTP | Không có. `lib/otp/service.ts` là OTP gửi qua Zalo ZNS/email cho kích hoạt, quên mật khẩu — khác bản chất TOTP | Thư viện, bảng secret + mã dự phòng, màn cài đặt, bắt buộc lúc đăng nhập | Cao |
| OAuth 2.1 Authorization Server (MCP) | Auth.js chỉ có `Credentials` provider (`lib/auth.ts:117-119`), phiên JWT (`:87`); có `jose` (`package.json:96`) | `/authorize`, `/token` PKCE S256, DCR, màn đồng ý, resource indicator, refresh xoay vòng | Rất cao |
| Thư viện MCP / JSON Schema | Không có `@modelcontextprotocol/sdk`, `ajv`, `zod-to-json-schema`, `otplib` (`package.json`, cả `origin/test`); `zod` ^4.4.3 (`package.json:126`) có `z.toJSONSchema()` theo tài liệu Zod v4, chưa chạy thử | Xin phép thêm dependency | TB |
| MCP Streamable HTTP trên Vercel | Route handler trả `ReadableStream` có 1 tiền lệ (`app/api/elearning/media/[...khoa]/route.ts`), không phải SSE; `vercel.json` không khai `functions` | Spike thực nghiệm; gói Vercel không đo được từ repo | TB |
| Danh tính "user dịch vụ" | `User` không có trường người/máy (`prisma/schema.prisma:1203-1283`); `email`, `password` cho phép rỗng (`:1208`, `:1215`) ⇒ tạo được user không có thông tin đăng nhập | Cờ phân biệt để chặn đăng nhập `/login`; quy trình tạo | TB |
| Dựng Actor không cần session | `resolveActorUncached(userId)` chỉ truy DB, không gọi `auth()` (`lib/auth/actor.ts:432-467`); cache theo request (`:544`) | Chưa từng có caller nào ngoài session người dùng thật ⇒ cổng là caller đầu tiên | TB |
| `can()` + `scopedDb` | Có; 25 route `app/api/**` dùng `scopedDb` qua session | Lớp "Actor ∩ Grant" (công cụ × cơ sở × hạn): mới 100% | Cao |
| `SYSTEM_ACTOR` | `lib/auth/system-actor.ts:15-25` — `isSuperAdmin: true`, `isHoLevel: true` | **KHÔNG dùng cho agent** | — |
| Vai "Giám đốc", "Kỹ thuật" | Enum `Role` 9 giá trị không có (`prisma/schema.prisma:18-28`); 15 RoleDef không có; `Employee.isCEO` là cờ vinh danh, cấm tái dùng (`:2893-2896`). `RoleDef.code` là chuỗi tự do (`:470-481`) ⇒ tạo vai mới không cần migration enum | Seed RoleDef + gán `UserOrgRole` + chạy `seed-prod-roles.yml` | Thấp |
| Người duyệt ≠ người tạo | **Có tiền lệ**: `lib/elearning/training-need.ts:116-124` và `lib/elearning/equivalence.ts:74-80` ném `SELF_APPROVAL`; có test `lib/elearning/program-create.test.ts:213-220` | Chép khuôn cho client/grant | Thấp |
| Hạn mức tần suất / số bản ghi/ngày | `rateLimit({key, max, windowMs})` Upstash + dự phòng bộ nhớ (`lib/rate-limit.ts:181-191`), đang dùng thật (`lib/auth.ts:144-146`) | Chỉ cần đặt key theo client | Thấp |
| Tự khoá sau N lần sai | Khuôn đếm-sai-rồi-khoá: `lib/otp/service.ts:311`, `:348` (`attempts >= maxAttempts`, đọc ngưỡng từ setting `:128-133`) | Áp cho client + chuyển `tam_khoa` + báo CEO | Thấp |
| IP allowlist | `ipChoRateLimit()` lấy IP không giả được (`lib/security/client-ip.ts:83-101`); có tiền lệ cột `ipAllowlist String[]` (`prisma/schema.prisma:10961`) | ≥7 chỗ cũ vẫn lấy phần tử đầu XFF (vd `lib/audit/headers.ts:17`, `lib/lead/webhook.ts:269`) ⇒ bắt buộc gọi đúng hàm | Thấp |
| Tách môi trường test/live | Khuôn `VERCEL_TARGET_ENV ?? VERCEL_ENV` phân biệt được "test" (`lib/auth.ts:38-49`); `laProductionThat()` chỉ trả lời nhị phân (`lib/security/client-ip.ts:64-67`) | Kiểm tiền tố `srk_test_`/`srk_live_` theo đúng khuôn `lib/auth.ts:46` | Thấp |
| Công tắc toàn cổng không cần deploy | `SystemSetting` sửa được trên màn, không deploy; khoá phải khai trong `lib/settings/registry.ts:219-298` (deploy 1 lần). Đã kiểm: `git grep -i "agentGateway\|agent_gateway"` trên `main` + `origin/test` = 0 ⇒ không trùng khoá. **Nhưng đọc qua bộ nhớ đệm thì không "ngay"**: `getSetting` đệm 300 giây (`lib/settings/service.ts:32-51`); ghi thì xoá đệm (`:135`), song chú thích mới hơn ở `lib/settings/read-global.ts:32-34` ghi việc xoá chỉ có tác dụng trong tiến trình đang chạy, các lambda khác còn đọc giá trị cũ tới hết nhịp. `lib/flags.ts` 100% đọc env, cần redeploy (`:172-186` tự cảnh báo) | Khai khoá `agentGateway.*`; công tắc đọc **thẳng DB, không đệm** (Q-N11); KHÔNG đặt trong `lib/flags.ts` | Thấp |
| Nhật ký | `AuditLog` bất biến, không có cron xoá (`lib/audit/audit-log.ts:1-3`; `prisma/schema.prisma:629-648`) | Bảng `AgentToolCall` riêng (cần `thamSoBam`, `soBanGhi`, `thoiGianMs`…) | TB |
| Idempotency | Khuôn `dedupeKey @unique` + bắt P2002 (`prisma/schema.prisma:663`; `lib/events/publish.ts:9-30`) | Áp cho `Idempotency-Key`; kho nonce 10 phút (Upstash có sẵn) | TB |
| Lọc Sentry | `beforeSend` chỉ xoá cookie + header auth (`sentry.server.config.ts:22-32`), phía client chỉ che 4 tham số URL (`instrumentation-client.ts:39-53`) | Luật chặn chuỗi `sr[kasm]_…` | Thấp |
| gitleaks | Không có cấu hình hay bước CI nào | File cấu hình + bước CI | Thấp |
| Che PII | `lib/lead/pii.ts` che MỘT PHẦN (`:17-23`; `lib/utils.ts:16-27` giữ vài ký tự); `redactContactsInText` + 2 regex tái dùng được (`lib/lead/pii.ts:43-60`) | Nhãn toàn phần, HMAC SĐT, che tên theo lead, che ảnh/tệp: mới | Cao |
| Migration + RLS | SQL tay, `ENABLE ROW LEVEL SECURITY` (khuôn `20260825120000_lead_status_history`); mốc mới nhất `20260924180000` trên cả `main` và `origin/test` | 5–6 migration tay, tên mốc > `20260924180000` | TB |
| Quy ước tên trường | 280/281 model dùng tên tiếng Anh; chỉ có `lyDo` (`prisma/schema.prisma:1028`) là tiếng Việt | Chốt: tên Prisma tiếng Anh hay theo mẫu spec (xem §7) | Thấp |
| Lưới ESLint cho code mới | `no-inline-authz` chỉ phủ `app/**/_actions*.ts`… (`eslint.config.mjs:109-122`); chặn `@/lib/db` trần chỉ phủ route group admin/portal/teacher/elearning (`:159-260`), chính chú thích `:358-361` cảnh báo route group mới không tự thừa hưởng | Thêm khối phủ `app/api/agent/**` + `lib/agents/**` | Thấp |
| Máy kiểm khuôn | Chạy thật `node cong-cu/kiem-khuon.mjs --mau` → ĐẠT 14/14, chỉ dùng `node:` builtin (`kiem-khuon.mjs:15-17`) | Nối vào Vitest/CI | Thấp |
| Hạ tầng test + CI | 4 cấu hình vitest, 16 cấu hình playwright; `ci.yml` 11 job; required check trên `main` đo sống 25/09: Quality · Unit tests · Chat DB invariants · E2E R7 1/2 · 2/2 · Nguồn phải là nhánh test; `enforce_admins=true` | Script `test:agent-gateway-db` + job CI mới; thêm vào required cần quyền admin repo | TB |
| Cron | `vercel.json` có 30 cron, region `hnd1`; `cron-pump-test.yml:14-15` cảnh báo cron mới quên khai ở đây thì chạy thật lần đầu trên PROD | Cron mới phải khai cả hai nơi | Thấp |
| Màn quản trị mới | Đòi: segment trong `ADMIN_ROUTE_SEGMENTS` (`lib/auth/route-policy.ts:96-100`), lối vào sidebar (`components/admin/nav-coverage.test.ts`), nối cờ (`sidebar-flag-wiring.test.ts`), `PAGE_GATES` phải GLOBAL (`lib/auth/page-gates.ts:214-217`) | Tuân 4 lưới có sẵn | TB |

---

## §3. Từng công cụ trong 14 công cụ

### 3.1 Bảng tổng

| # | Công cụ | Nguồn thật trong repo | Trường thiếu / lệch | Mã quyền hiện có / đề xuất | Khả thi | Đợt |
|---|---|---|---|---|---|---|
| 1 | `danh_muc.lay_co_so` | OrgUnit `code/name/address` (`prisma/schema.prisma:379-384`), loại `:351-360`, Center `:275-343` | `phap_nhan`: mọi OrgUnit cùng 1 `legalEntityId` (`prisma/seed-orgunit.ts:123,152`); mẫu lệch quyết định 22/09. `gio_lam` có nguồn `getWorkingHourWeek` (`lib/working-hours/service.ts:46-72`) nhưng khác hình dạng. `nguoi_nhan_canh_bao` không có nguồn. Hai trường sau là **tuỳ chọn** (spec dòng 447, khuôn không khai) | `centers:view` — có, enforcement thật (`app/(admin)/admin/centers/page.tsx:19`) | **Làm được** (chờ chốt pháp nhân) | 0 |
| 2 | `danh_muc.lay_khoa_hoc` | `Course` | 3 nguồn giá xung đột: `courses-pricing.ts:75` (niêm yết đúng), `prisma/seed-courses.ts:18-19` (ghi giá **ưu đãi** vào `Course.price`), `scripts/nhap-gia-khoa-cong-van.ts:74-79` (đúng giá SR.QD.219 nhưng slug `sata-3` khác `sata3`, chỉ chạy được ở localhost, dry-run mặc định). `lib/gia-cong-khai.ts:13-19` (22/09) tự ghi "BA NGUỒN GIÁ", prod slug `sata1` vs local `sata-1`. `lop` phải parse `ageRange` chuỗi tự do (`:1347`). `diem_nhan`, `noi_lo_ph` không có | `courses:view` — có | **Cần bổ sung + dọn dữ liệu** | 1 |
| 3 | `danh_muc.lay_nhan_su` | `Employee` id/fullName/jobTitle/centerId (`prisma/schema.prisma:2845-2886`) | `chuc_danh` mẫu dùng mã TGD/GDTT (trùng bộ mã công cụ 5), `jobTitle` là chuỗi tự do | `employees:view-public` — có trong seed nhưng **0 lời gọi enforcement** trong app/lib | **Cần bổ sung nhỏ** | 1 |
| 4 | `danh_muc.lay_kenh` | Hai danh mục không tương thích: `Lead.source` dùng `NGUON_LEAD` id "1".."13" (`lib/lead/intake/nguon-lead.ts:10-23`); `InboxChannel` ZALO_OA/ZALO_CA_NHAN/MESSENGER… (`prisma/schema.prisma:9968-9982`) khớp mẫu nhưng là kênh hội thoại | Spec dòng 457 đòi một mã dùng chung cho lead và hội thoại: không tồn tại | Chưa có — đề xuất `catalog:channels:view` | **Bị chặn** (quyết định) | 1 |
| 5 | `danh_muc.lay_chuc_danh` | `RoleDef` (mã quyền SUPER_ADMIN…), `Position.title` (PROD 0 dòng theo chú thích `prisma/schema.prisma:715-716`), `Employee.jobTitle` tự do | Không nguồn nào có TGD/GDTT/TVV | Chưa có — chỉ `roles:manage` (SUPER_ADMIN, quyền sửa RBAC). Đề xuất `roles:view` | **Bị chặn** (quyết định) | 1 |
| 6 | `kinh_doanh.lay_leads` | `Lead` (`:1483`) + `LeadChild` (`:1796-1860`) | `giai_doan_hien_tai` G1–G8 không có trong dữ liệu (G1–G8 chỉ là 8 giai đoạn của thẻ điểm tư vấn bản giả định, ngoài repo); nhiều con/lead vs khuôn 1 con (`schema/lead.schema.json:12-13`); `gioi_thieu_boi` trỏ `Affiliate` không phải lead (`:1599-1600`); `sdt_ma_hoa` không có; `sdt` DB dùng `""` thay vì null; `kenh` là text tự do | `leads:view-all` + `leads:view-pii` | **Cần xây mới** (ánh xạ + PII) | 3 |
| 7 | `kinh_doanh.lay_hoi_thoai` | Zalo: `InboxConversation/InboxMessage/InboxIdentity` (`:10032-10176`); Messenger: bảng riêng `MessengerConversation/Message` (`:842-893`) có cột `phone` thô | Gộp 2 nguồn khác khuôn; che ảnh/tệp chưa có (`lib/inbox/view.ts:28-38` không có attachments); che tên theo lead trong tin; `co_so` phải suy từ `orgUnitId` | `inbox:view` + `leads:view-pii` | **Cần xây mới** | 3 |
| 8 | `kinh_doanh.lay_cuoc_goi` | `CallLog` (`:10462-10552`) | `outcome` 0 chỗ ghi, mà khuôn `ket_qua` là string **không cho null** (`schema/cuoc_goi.schema.json:46-48`) ⇒ trượt máy kiểm; `lead_id` bắt buộc nhưng `CallLog.leadId` cho phép rỗng; hướng `INTERNAL` không có chỗ; không có chuyển giọng nói; không có hàm liệt kê; chưa có che PII cho CallLog; OmiCall TẮT mặc định (`lib/flags.ts:299-301`) | `calls:view-all` (có, nhưng mồ côi) + `calls:listen-recording` (thật, `lib/calls/nghe-ghi-am.ts:102`) | **Cần xây mới phần lớn** | 5 |
| 9 | `kinh_doanh.lay_dang_ky` | `TrialEnrollment/LeadTrialHistory` (`:7189-7214`), `Enrollment`, `RefundRequest` (`:6860-6910`), `Voucher` | Gộp 3 enum khác nhau (`EnrollmentStatus` 9 giá trị `:92-105`); `TRIAL_1_1` không tồn tại (grep `main` + `origin/test` = 0); `Enrollment.leadChildId` rỗng với ghi danh tạo trực tiếp (`:2210-2212`); `RefundRequest` không tự lọc cơ sở (`lib/db-scope.ts:269-271`) | `trials:view` + `enrollments:view-all` + quyền hoàn tiền (khảo sát đề xuất `payments:manage`, là quyền ghi ⇒ cần quyền đọc riêng) | **Cần xây mới** | 1 (đề xuất cân nhắc dời) |
| 10 | `kinh_doanh.lay_chi_tieu` | `LeadTarget` (`:6987-7006`), `RevenueTarget` (`:6954`) | 2 trường tỷ lệ chuyển đổi không có chỗ lưu; "SR.QD.215" không xuất hiện ở đâu (`main` + `origin/test`) | Chỉ `lead_targets:manage` (ghi). Đề xuất `lead_targets:view` | **Cần xây mới** (bảng tỷ lệ) | 1 |
| 11 | `marketing.lay_chi_phi_ads` | `AdsInsightDaily` (`:1104-1117`) | Khuôn có 11 trường bắt buộc, bảng phủ 5 (thiếu chiến dịch, tên, khoá, cơ sở, lead, tần suất); không có `centerId`; `syncMetaAds` (`lib/crm/ads-insights.ts:78-100`) không cron nào gọi; Google Ads 0% | Chưa có — trang duy nhất gác bằng `leads:view-all` (quyền PII). Đề xuất `marketing_ads:view` | **Cần xây mới** | 4 |
| 12 | `marketing.lay_tran_ngan_sach` | `AdsBudgetTarget` (`:7029-7048`) | Chỉ 1 số/tháng/cơ sở; không ngưỡng cảnh báo (4 trường), không theo chiến dịch, không trạng thái CEO duyệt (`app/(admin)/admin/bao-cao/ngan-sach-quang-cao/_actions.ts:32-99` ghi thẳng) | Chỉ `ads_budget_targets:manage` dùng chung xem+sửa (`lib/auth/page-gates.ts:217`). Đề xuất `ads_budget_targets:view` | **Cần xây mới** | 4 |
| 13 | `marketing.lay_bai_cho_duyet` | **Không tồn tại** dưới tên nào (grep `MarketingPost\|content-review\|bai-cho-duyet` `main` + `origin/test` = 0). Dễ nhầm với `Promotion` và màn duyệt ảnh lớp `duyet-media` | Toàn bộ module | Đề xuất mới `marketing:content:view` (+ `:approve` cho người) | **Cần xây mới 100%** | 4 |
| 14 | `van_ban.lay_khuyen_mai_hieu_luc` | `Voucher` code/name/validFrom/validUntil/isActive (`prisma/schema.prisma:4630-4665`); `Promotion` isActive/startsAt/endsAt (`:6319-6345`) | Không có "mã văn bản quyết định" kiểu SR.QD.xxx; `Voucher.description` cho phép rỗng trong khi `noi_dung_uu_dai` bắt buộc | Chưa có — đề xuất `promotions:view` | **Cần bổ sung** nếu "văn bản" = Voucher; **xây mới** nếu phải là Sổ văn bản SR.QD | 1 |

**Tổng kết:** làm được gần ngay 1/14 (công cụ 1). Cần bổ sung nhỏ hoặc vừa 3/14 (2, 3, 14 nếu dùng Voucher).
Bị chặn vì quyết định nghiệp vụ 2/14 (4, 5). Cần xây mới 8/14 (6, 7, 8, 9, 10, 11, 12, 13).

Con số "202 quyền hiện có" (spec dòng 423, 691) không khớp nguồn nào:

| Nguồn | `main` | `origin/test` | Lệnh đếm |
|---|---|---|---|
| v1 — khối `export type Action` (`lib/auth/permissions.ts:36-429`) | **214** | 215 | `sed -n '36,429p' lib/auth/permissions.ts \| grep -oE '^\s*\|\s*"[^"]+"' \| sort -u \| wc -l` (chỉ đếm dòng thành viên union; đếm mọi chuỗi có dấu `:` ra 215 vì lẫn 1 câu chú thích) |
| v2 — `prisma/seed-roles.ts` | **196** | 197 | `grep -oE 'action: *"[^"]+"' prisma/seed-roles.ts \| sort -u \| wc -l` |

Nguồn đúng để tra là seed v2, vì prod đang enforce `can()` v2.

### 3.2 Ghi chú công cụ bị chặn hoặc cần xây nguồn mới

- **Công cụ 2 — giá niêm yết.** Rủi ro trả sai học phí cho agent tư vấn. `Course.price` trên prod nhiều khả năng là
  giá ưu đãi. Trước khi mở phải: xác nhận giá thật trên DB đích bằng workflow chỉ-đọc, xin duyệt chạy script ghi giá
  (thao tác dữ liệu, Dev chạy tay theo luật cứng #4), và dọn xung đột slug. `diem_nhan`/`noi_lo_ph` là nội dung
  marketing mới.
- **Công cụ 3 — quyền mồ côi.** `employees:view-public` được seed cho 7 tổ hợp vai nhưng chưa từng được kiểm ở đâu.
  Cổng sẽ là nơi đầu tiên dùng nó, nên phải tự kiểm hành vi scope lần đầu. Ước lượng không phải "0 ngày".
- **Công cụ 4, 5 — bị chặn vì quyết định.** Không tự chọn: chọn sai thì agent đọc nhầm nghĩa.
- **Công cụ 6 — ba lệch cấu trúc** (phễu, nhiều con, người giới thiệu) đều là quyết định nghiệp vụ. Thêm: lead ở G1
  (còn ở hội sở, `centerId` rỗng — `prisma/schema.prisma:1520`) **vô hình** với actor chỉ có một cơ sở, vì `Lead`
  không nằm trong `NULL_IS_GLOBAL_MODELS` (`lib/db-scope.ts:165-268`, cơ chế `:540-554`). Muốn agent thấy G1 thì
  grant phải có "HO", tức cấp nhìn toàn hệ thống.
- **Công cụ 7 — Messenger.** Chú thích schema ghi "0 dòng trên prod, đo 12/08" (`prisma/schema.prisma:9938-9949`).
  Đây là chú thích 6 tuần tuổi, chưa đo lại. Cần đo bằng workflow chỉ-đọc trước khi xếp lịch nghiệm thu nhánh
  Messenger.
- **Công cụ 8 — gần như toàn bộ phụ thuộc bên ngoài.** Trục gọi điện mới có 1 commit (`1be9c0a2`, 27/08/2026), cờ tắt
  mặc định, và repo không cho biết cờ trên Production đang bật hay tắt ⇒ `CallLog` có thể gần như rỗng. Ghi âm
  không tự xoá dù có ô cấu hình: `recordingPurgeAfterAt` không ai ghi, không cron nào đọc; hạn giữ "CHỜ CHỐT"
  (`lib/settings/registry.ts:1584-1594`). Nên đóng việc xoá ghi âm trước khi cho agent ngoài đọc.
- **Công cụ 9 — nặng nhất Đợt 1.** Nhánh hoàn tiền phải tự ép phạm vi cơ sở, quên là lộ dữ liệu hoàn tiền giữa các
  cơ sở. Ghi danh không có lead thì bị bỏ khỏi kết quả, nên phải nói rõ giới hạn này trong báo cáo.
- **Công cụ 11 — bước 9 của cổng không thực thi được.** `AdsInsightDaily` không có `centerId`, nên grant giới hạn một
  cơ sở không lọc được. `AdsBudgetTarget` cũng không tự lọc (`lib/db-scope.ts:261-266`).
- **Công cụ 12.** Có khuôn tái dùng một phần: `MarketingCostPeriod` (DRAFT→CONFIRMED→REOPENED + người xác nhận) và cron
  `marketing-alerts` + `notifyStaff` đã có hạ tầng cảnh báo.
- **Công cụ 13.** Module mới hoàn toàn. Chỉ tái dùng được link ảnh ký sẵn (`lib/storage/signed-url.ts:37`, nhận
  `ttlSeconds` tuỳ ý, gọi 900 là đạt ≤15 phút). Độ lớn phụ thuộc: chỉ lưu nháp hay đăng thật lên Facebook/TikTok.
- **Công cụ 14.** Phản biện tìm ra `Voucher` mà khảo sát ban đầu bỏ sót. Nếu CEO xác nhận "văn bản khuyến mãi" =
  voucher giảm giá áp trên đơn thì chỉ cần nối dây. Nếu phải là quyết định SR.QD.xxx thì phải xây "Sổ văn bản".
  Lưu ý: mã SR.QD.223 đang mang hai nghĩa khác nhau trong repo (đóng học phí theo đợt ở `lib/payments/ke-hoach-dot.ts:17`
  vs thẻ điểm chấm tư vấn ở `docs/sale-hub/bien-ban-chot-4-cong-2108.md:15`).

---

## §4. Bảo mật & phân quyền: spec đòi gì, repo có gì

### 4.1 Bảy nguyên tắc (spec §0)

| # | Nguyên tắc | Repo có sẵn | Thiếu |
|---|---|---|---|
| 1 | Mặc định cấm; quyền = công cụ × chế độ × cơ sở × hạn | `can()` v2 động từ DB; `scopedDb` cách ly cơ sở | Model `AgentGrant` mới (`UserPermissionGrant` chỉ có `userId, action, grant` — `prisma/schema.prisma:1298-1314`); lớp giao Actor ∩ Grant |
| 2 | Hai người cấp quyền, cả hai 2FA | Khuôn `SELF_APPROVAL` (`lib/elearning/training-need.ts:116-124`) | 2FA (0%); vai Giám đốc/Kỹ thuật; xác nhận có đủ hai người thật khác nhau đủ thẩm quyền (xem §7) |
| 3 | Khoá nhiều lớp, token 15 phút, ký yêu cầu ghi, IP | HMAC mẫu, safeEqual, rate-limit, `ipChoRateLimit` | Bảng client/secret/token; CSPRNG helper; AES-GCM; kho nonce |
| 4 | Che PII ở server, mặc định bật | Mask một phần + regex văn bản tự do (`lib/lead/pii.ts`) | Thư viện nhãn toàn phần mới cho agent (`lib/agents/pii.ts`) |
| 5 | Agent không ghi thẳng dữ liệu nghiệp vụ | Luật repo đã đòi ghi qua Server Action có `can()` | `AgentDraft`, hộp duyệt, áp dụng với danh tính người duyệt |
| 6 | Nhật ký mọi lượt, công tắc không cần deploy | `AuditLog` bất biến; `setGlobalSetting` xoá cache ngay | `AgentToolCall`; khoá setting mới; công tắc từng client |
| 7 | Fail closed | Khuôn webhook fail-closed (`lib/integrations/zalocrm/webhook.ts:75-85`) | Áp cho 13 bước; bước 9 trả 403 không trả rỗng |

### 4.2 Xác thực và vòng đời khoá (spec §4)

| Yêu cầu | Repo | Nhận xét |
|---|---|---|
| 4.1 Secret băm HMAC + pepper, hiển thị 1 lần, ≥256 bit | Không có bảng; `jose` + `crypto` sẵn | Pepper tách test/prod ở env Vercel Sensitive |
| 4.1 Khoá ký `srs_` mã hoá AES-GCM trong DB | Không có tiền lệ nào | Đụng luật cứng #9 — xem §5 |
| 4.1 Không in khoá ra log/Sentry | Sentry lọc hẹp | Thêm luật theo tiền tố; B16 |
| 4.2 client_credentials, scope chỉ thu hẹp, `invalid_scope` | Không có | Mới |
| 4.3 OAuth 2.1 + PKCE + DCR + 2FA | Không có | Mới, Rất cao |
| 4.4 Chữ ký, nonce 10 phút, Idempotency-Key | Khuôn dedupeKey | Kho nonce qua Upstash có sẵn |
| 4.5 Xoay khoá chồng 24h, thu hồi ngay, nhắc trước 14 ngày | Không có | "Hết hạn" phải là thuộc tính tính lúc đọc, không cron ghi (luật cứng #8) |
| 4.6 `srk_test_` chỉ trên test | Khuôn `VERCEL_TARGET_ENV` (`lib/auth.ts:46`) | Đúng khuôn; `VERCEL_ENV` không đủ |

### 4.3 Phân quyền (spec §5)

| Yêu cầu | Repo | Nhận xét |
|---|---|---|
| 5.2 Grant theo cơ sở, "HO phải khai rõ" | `visibleCenterIds` là `Center.id`, không phải mã (`lib/auth/actor.ts:277-283`); Center "hoi-so" là bản ghi mồ côi, không OrgUnit nào trỏ tới (`lib/org/center-bridge.ts`) | "HO" không phải một cơ sở trong danh sách mà là hiệu ứng `isHoLevel` = nhìn mọi cơ sở. Cần chốt nghĩa (§7) |
| 5.4 Quyền `agent_gateway:*` | Thêm vào cả `lib/auth/permissions.ts` và `prisma/seed-roles.ts`, không thì UI `/roles` từ chối gán (`lib/auth/rbac-service.ts:149`) và shadow-diff báo lệch mãi (`lib/auth/permission-eval.ts:23-26`) | Sau merge `main` phải bấm tay `seed-prod-roles.yml`. `deploy.yml:66-77` chỉ tự đồng bộ `PermissionDescriptor`, không đồng bộ RoleDef |
| 5.4 "DENY bị bỏ qua im lặng" | Đúng với `lib/auth/can.ts` (`:48-58`; `lib/auth/actor.ts:367` lọc chỉ ALLOW). Tầng mới `lib/permissions/can.ts:97-138` **có xử lý DENY thật** qua `PermissionGrant` | Spec và CLAUDE.md cùng dặn không dùng DENY ⇒ khớp. Nếu sau này muốn DENY tức thì qua `PermissionGrant` thì phải đăng ký key trong `lib/permissions/registry` trước (FK Restrict, `prisma/schema.prisma:533-539`) |
| 5.5 Màn quản trị 5 thẻ | Không có | Tuân 4 lưới màn admin (§2) |
| 5.6 Bước 10 `can()` với user dịch vụ | `resolveActor(userId)` không cần session | Gọi thẳng `can()` v2 thì agent luôn chạy v2, bỏ qua cơ chế so v1×v2 của `checkPermission` (`lib/auth/check-permission.ts:1-8`), kể cả ở local nơi cờ v2 tắt. Cần xác nhận là có chủ đích |

### 4.4 Nhật ký, giám sát, tự khoá (spec §12)

Giữ ≥12 tháng: đạt, không có cron xoá nhật ký. Tự khoá khi sai nhiều lần: khuôn `lib/otp/service.ts:348`. Gọi từ IP
lạ, vượt hạn mức CAO, nhiều lỗi ngoài phạm vi cơ sở: dựng trên `rateLimit` + `AgentToolCall`. Báo cáo tuần: mới.
Chỉ cho SUPER_ADMIN xem nhật ký toàn hệ thống: repo đang có sẵn tình trạng `audit-logs:view` không vai nào giữ.
Màn "Nhật ký gọi" của cổng dùng quyền `agent_gateway:view`, **không nới** `audit-logs:view`.

### 4.5 Bộ kiểm thử bảo mật B1–B18

| Ca | Nền có sẵn | Tầng test đề xuất |
|---|---|---|
| B1 không/sai/hết hạn token → 401 | — | DB suite (Vitest + Postgres) |
| B2 thu hồi 1 giây trước → 401 | Token lưu băm, tra mỗi lượt | DB suite |
| B3 `srk_test_` trên production → 401 | Khuôn `VERCEL_TARGET_ENV` | Vitest thuần (hàm môi trường nhận `env` tham số) |
| B4 công cụ không được cấp → 404 | — | DB suite |
| B5 cấp CS1 gọi CS2 → 403, không trả rỗng | Hàm thuần kiểm tập cơ sở | Vitest thuần + DB suite |
| B6 cấp CS1, không truyền `co_so` → chỉ CS1 | `scopedDb` cho model trong `SCOPED_MODELS`; model ngoại lệ phải lọc tay | DB suite, **mỗi công cụ một ca** |
| B7 tham số lạ → 422 | zod `.strict()` | Vitest thuần |
| B8 CAO + `che_du_lieu=false` không có `xem_du_lieu_goc` → 403 | — | DB suite |
| B9 gỡ vai → 403 lượt kế | `resolveActor` cache theo request, không giữ qua request | DB suite; bước 10 phải tra lại grant, không tin `token.scope` |
| B10 tự duyệt → từ chối | Khuôn `SELF_APPROVAL` | DB suite |
| B11 IP ngoài danh sách → 403 + đánh dấu nhật ký | `ipChoRateLimit` | Vitest thuần (header giả `x-forwarded-for` phần tử đầu phải bị bỏ) + DB suite |
| B12 21 lần sai / 5 phút → `tam_khoa` + báo CEO | Khuôn đếm-sai-khoá | DB suite |
| B13 tắt công tắc → 503 ngay | `SystemSetting` sửa không deploy; bộ đệm 300 giây KHÔNG đảm bảo "ngay" giữa các lambda | DB suite; đọc công tắc thẳng DB, không đệm (§7 Q-N11) |
| B14 phát lại nonce → 401 | Upstash | Đợt 6 |
| B15 trùng Idempotency-Key → 1 bản nháp | Khuôn dedupeKey | Đợt 6 |
| B16 grep log/Sentry không thấy khoá, SĐT, tên | Sentry `beforeSend` có sẵn chỗ cắm | Vitest thuần cho hàm lọc + bước grep log trong job CI |
| B17 hàm nghiệp vụ thiếu trường → 500 `LECH_KHUON` | zod v4 | Vitest thuần |
| B18 có ghi âm nhưng chưa báo khách → `ban_ghi=null` | `CallLog.recordingNotice` (enum, phải suy ra boolean) | Đợt 5 |

Ghi chú: máy kiểm `kiem-khuon.mjs` chỉ kiểm `type/enum/required/properties/items` (`kiem-khuon.mjs:25-36`), không kiểm
`additionalProperties`. Điều này khớp quy tắc "trường thêm được phép" của spec, nhưng máy kiểm không bắt được lệch
nghĩa (ví dụ đổ `jobTitle` tự do vào `chuc_danh` vẫn ĐẠT).

### 4.6 Mười ba bước kiểm của cổng (spec §5.6), đối chiếu từng bước

| # | Bước | Repo có sẵn | Phải làm mới |
|---|---|---|---|
| 1 | Công tắc toàn cổng → 503 | `SystemSetting` + màn cấu hình vận hành | Đọc thẳng DB không đệm (xem §2 dòng công tắc) |
| 2 | HTTPS, `POST`, `Content-Type`, body ≤ 256 KB | Có tiền lệ chặn cỡ body 2 lớp (khai báo `content-length` rồi đo chuỗi thật): `app/api/public/lead-intake/sale-form/route.ts:53`, `:128-138`; `app/api/webhooks/meta/messenger/route.ts:34`. HTTPS do Vercel ép | Chép khuôn 2 lớp, đổi trần 256 KB; kiểm `Content-Type` → 415 |
| 3 | Token tồn tại, còn hạn, chưa thu hồi, đúng môi trường, đúng `aud` | Khuôn phân biệt môi trường `lib/auth.ts:38-49` | Bảng `AgentAccessToken`, tra theo bản băm |
| 4 | Client `hoat_dong`, IP trong danh sách | `ipChoRateLimit` (`lib/security/client-ip.ts:83-101`) | Bảng `AgentClient`; trạng thái "hết hạn" tính lúc đọc (X3) |
| 5 | Hạn mức tần suất + số bản ghi/ngày → 429 + `Retry-After` | `rateLimit({key,max,windowMs})` (`lib/rate-limit.ts:181-191`) | Bộ đếm số bản ghi/ngày theo client (Upstash) |
| 6 | Token có scope `<công cụ>:<chế độ>` | — | Hàm thuần kiểm grant (X6) |
| 7 | Chữ ký, nonce, Idempotency-Key (công cụ ghi) | Khuôn `dedupeKey` + bắt P2002 (`lib/events/publish.ts:9-30`) | Đợt 6; cách lưu khoá ký (X2) |
| 8 | zod `.strict()` + khoảng ngày ≤ 93 ngày | zod v4 (`package.json:126`). **Không có** tiền lệ refine giới hạn khoảng ngày trong `lib/`, `app/` (chỉ có các mốc 90 ngày cố định, vd `lib/crm/convert-lead.ts:38`) | Một refine dùng chung đọc `agentGateway.maxRangeDays` |
| 9 | Cơ sở trong tham số ⊆ cơ sở grant → 403, không trả rỗng | — | Hàm thuần kiểm grant (X6); "HO" phải chốt nghĩa (Q-N9) |
| 10 | Hàm nghiệp vụ qua `scopedDb` với danh tính user dịch vụ, `can()` kiểm lại | `resolveActorUncached(userId)` (`lib/auth/actor.ts:432-467`), `scopedDb` | User dịch vụ; ca B6 cho từng bảng không tự lọc (§8) |
| 11 | Che dữ liệu; công cụ CAO không có hàm che thì không đăng ký được | `lib/lead/pii.ts` (che một phần) | `lib/agents/pii.ts`; kiểm lúc đăng ký sổ công cụ |
| 12 | Kiểm đầu RA bằng zod → 500 `LECH_KHUON` | zod v4 | Zod đầu ra cho 14 khuôn |
| 13 | Ghi `AgentToolCall`, `Cache-Control: no-store` | `AuditLog` (khuôn bất biến) | Bảng `AgentToolCall`; header |

Hạn mức §7.4 (`agentGateway.enabled`, `tokenTtlSec`, `rateLimitPerMin`, `maxRowsPerCall`, `maxRowsPerDay.cao`,
`maxRangeDays`, `lockAfterAuthFailures`): cả 7 khoá đều mới, khai vào `lib/settings/registry.ts`, không trùng khoá nào
đang có (đã grep, xem §2).

---

## §5. Xung đột với luật cứng của repo

| # | Luật repo + nguồn | Spec đòi | Xung đột | Phương án | Đề xuất |
|---|---|---|---|---|---|
| X1 | Doc 15 §0: loại "AI (toàn bộ)"; đảo hẹp 21/08 chỉ cho chấm điểm hội thoại; vẫn loại "AI CRM assistant tự hành động" (`15-final-architecture-blueprint.md:36`, `:1081`) | §1, §9 (14 công cụ), §10 (ghi nháp, W4 gửi cảnh báo tự động) | Phạm vi 25/09 rộng hơn phiếu đã ký. Thiết kế "chỉ đọc + nháp chờ người duyệt" gần với tinh thần "không tự hành động", nhưng W1/W4 `ghi_that` là agent tự làm | (A) CEO ký addendum Doc 15 §0 + §11 cho Cổng dữ liệu Agent (khuôn như site GV, G-B), ghi rõ W4 có nằm trong hay không · (B) coi tài liệu 25/09 là quyết định mới hơn, không sửa Doc 15 | **(A)**: không sửa Doc 15 thì lần sau người đọc hoặc agent code sẽ bác việc này là "ngoài scope". Chờ CEO |
| X2 | Luật cứng Nền Hệ thống #9: "Secret chỉ trong env". Tiền lệ áp chặt: `lib/integrations/zalocrm/config.ts:4-13` cố ý không lưu secret vào `IntegrationConfig.settings` | §4.1, §11 `AgentClientSecret.khoaKyMaHoa`: lưu khoá ký đã mã hoá AES-GCM trong DB | Sẽ là tiền lệ đầu tiên lưu secret mã hoá hai chiều trong DB | (A) chấp nhận: bản mã hoá bằng khoá-chỉ-ở-env không còn là secret lộ được · (B) ký bất đối xứng: agent giữ khoá riêng (Ed25519), server chỉ lưu khoá công khai, không có secret nào trong DB · (C) chỉ dùng mTLS/IP + token, bỏ ký HMAC | Nghiêng **(B)** vì xoá hẳn xung đột, nhưng đổi thiết kế §4.4 của xưởng. Việc thuộc Đợt 6, chưa gấp. Chờ CEO + tech lead |
| X3 | Luật cứng #8: "Không cron nào GHI thay đổi quyền. Hết hạn là thuộc tính resolver" | §4.5, §11 `trangThai = het_han` | Làm bằng cron quét hạn rồi ghi trạng thái = cron ghi thay đổi quyền | (A) cổng luôn so `hetHan < now()` mỗi lượt; cột trạng thái chỉ để hiển thị, cập nhật lười khi có người mở màn · (B) cron ghi trạng thái | **(A)** — đúng luật, không cần ngoại lệ |
| X4 | Luật cứng #6: không nhúng role/scope vào JWT; nguồn quyền là DB | §4.2 token mang `scope`; §11 `AgentAccessToken.scope String[]` đóng băng lúc cấp | Token không phải JWT nhưng vẫn là ảnh chụp quyền; thu hẹp grant thì token cũ còn sống ≤15 phút | (A) `token.scope` chỉ là trần trên; bước 10 luôn tra lại grant còn `hoat_dong` · (B) giữ nguyên, chấp nhận trễ ≤15 phút | **(A)** — B9 và "thu hồi ngay" của chính spec đòi thế |
| X5 | Luật cứng #3: bảng dữ liệu theo cơ sở giữ cả `centerId` + `orgUnitId`, khai đủ 3 chỗ | §11 `AgentGrant.coSo String[]`, `AgentToolCall.coSo String[]` | Mảng nhiều cơ sở không khớp khuôn một cột FK của `scopedDb` | (A) coi hai bảng này là bảng cấu hình/nhật ký nhiều-nhiều, đứng ngoài `SCOPED_MODELS` như `UserOrgRole`, và lọc tay ở bước 9 · (B) tách mỗi cơ sở một dòng grant | **(A)**; luật #3 vẫn áp cho bảng nghiệp vụ mới (bảng tỷ lệ chỉ tiêu, bài chờ duyệt, chi phí theo chiến dịch). Chờ tech lead |
| X6 | Luật cứng #1: mọi kiểm tra quyền qua `can()`, cấm so role/centerId tại chỗ | §5.6 bước 6 (scope token) và bước 9 (cơ sở ⊆ grant) là phép so viết tay | Đọc theo chữ thì vi phạm; về bản chất đây là tầng kiểm soát riêng của cổng, không phải RBAC nghiệp vụ | (A) gói bước 6 + 9 vào **một** hàm thuần duy nhất (vd `lib/agents/gateway/kiem-grant.ts`), có unit test, gọi từ một chỗ · (B) mở rộng `can()`/Target để hiểu grant agent | **(A)** — không đụng `can()` đang giữa cutover. Cần người giữ Nền Hệ thống xác nhận cách đọc luật |
| X7 | Lưới ESLint: `no-inline-authz` chỉ quét `app/**/_actions*.ts`… (`eslint.config.mjs:109-122`); chặn `@/lib/db` trần chỉ phủ các route group (`:159-260`) | §2, §3 đặt cổng ở `lib/agents/**` + `app/api/agent/**` | Không xung đột chữ, nhưng code cổng **không có lưới** mà mọi khu khác đều có. (Khảo sát ban đầu nói "build sẽ fail" — sai, `route.ts` không khớp glob nào) | (A) thêm khối ESLint cho `lib/agents/**` + `app/api/agent/**` trước khi viết dòng đầu · (B) dựa vào review | **(A)** — việc nhỏ, làm ở mảnh code đầu tiên |
| X8 | CLAUDE.md: tech stack FROZEN; "KHÔNG microservice — modular monolith" | §4.3 + câu 9: AS có thể là dịch vụ ngoài; §8 gợi ý `@modelcontextprotocol/sdk`; TOTP cần thư viện | Thêm dịch vụ auth ngoài = phá lệ monolith; thêm dependency cần hỏi | (A) tự viết AS trong satarobo (Rất cao) · (B) dùng dịch vụ ngoài chỉ cho khâu auth MCP | Chờ CEO + tech lead; xin phép danh sách dependency trước khi cài |
| X9 | CLAUDE.md #6 + `.claude/rules/prisma-db.md`: cấm `prisma migrate dev`; SQL tay + RLS | §11: 6 model Prisma | Không xung đột nếu làm đúng. Chạy `migrate dev` sẽ sinh luôn migration sửa 14 bảng đang lệch kiểu cột trên dữ liệu PROD | Tuân quy trình SQL tay, mốc > `20260924180000`, kiểm drift bằng `--from-url` | Không cần quyết |
| X10 | Quy ước repo: tên trường Prisma tiếng Anh (280/281 model) | §11 dùng tên tiếng Việt (`ten`, `coSo`, `hetHan`…) | Lệch quy ước | (A) Prisma tiếng Anh, khoá JSON API tiếng Việt · (B) theo mẫu spec | **(A)**. Chờ tech lead |
| X11 | Luật 12 CLAUDE.md: giả định môi trường phải đo bằng lệnh tại thời điểm dùng | §4.6: dữ liệu test phải giả hoặc đã che | ZaloCRM từng lẫn dữ liệu thật giữa org test và prod; vá 23/09 (commit `9c3fbcac`, `docs/tich-hop-zalocrm/07-runbook-bat-co-tren-prod.md:35`), mới 2 ngày | Đo lại org test bằng workflow chỉ-đọc trước khi cấp `srk_test_*` đọc công cụ CAO | Bắt buộc, người giữ ZaloCRM làm |
| X12 | Nền Hệ thống luật #2 + cutover P3/P4 đang dở (`lib/permissions/can.ts:1-14`) | §2: agent đi qua `can()` như người | Thêm một loại actor mới vào tầng quyền đang chạy song song hai bản | Người giữ Nền Hệ thống chốt actor agent neo nhánh nào hôm nay và sau cutover | Chờ người giữ Nền Hệ thống |
| X13 | Căn cứ pháp lý repo đã theo Luật 91/2025/QH15 + NĐ 356/2025 (`content/legal/chinh-sach-bao-mat.md:5`) | §6 trích NĐ 13/2023 | Spec dẫn căn cứ cũ | Xưởng sửa spec v1.1; Pháp chế xác nhận | Chờ CEO chỉ định người giữ vai Pháp chế |
| X14 | Mâu thuẫn trong chính spec: dòng 51–53 xếp Pháp chế vào "phiên bản sau", dòng 310–312 lại đòi Pháp chế xác nhận trước khi mở công cụ CAO | — | Điều kiện Đợt 3 không có người thực hiện | CEO chỉ định người, không phụ thuộc phiên bản spec | Chờ CEO |
| X15 | Phiếu đảo G-B 21/08 kèm 4 ràng buộc không tách rời (`docs/sale-hub/bien-ban-chot-4-cong-2108.md:29-34`): kết quả chấm **chờ phúc tra**, không tự công bố; không gắn lương/kỷ luật; trừ điểm phải trích nguyên văn; cờ tắt + trần chi phí | §10 W1 `kinh_doanh.ghi_ket_qua_cham_hoi_thoai`: `ghi_that` vào `AgentResult`, "Người duyệt: Không cần… hiện cho GĐTT xem" | GĐTT xem ngay kết quả chưa ai phúc tra = điểm tự công bố | (A) `AgentResult` của W1 có trạng thái `cho_phuc_tra`; GĐTT chỉ thấy sau khi người phúc tra; cổng từ chối mục trừ điểm không có trích dẫn khớp nguyên văn · (B) CEO ký đảo lại ràng buộc 1 cho W1 | **(A)** giữ nguyên chữ ký 21/08, không cần phiếu mới. Chờ CEO |

---

## §6. Trả lời nháp 11 câu hỏi mục 15

| Câu | Trả lời nháp | Bằng chứng | Độ chắc | Còn phải hỏi ai |
|---|---|---|---|---|
| **1** Zalo CRM đọc Messenger chung hay tách? | Trong satarobo là **hai nguồn tách riêng**: Zalo qua `InboxConversation/InboxMessage` (không có cột liên hệ), Messenger qua `MessengerConversation/MessengerMessage` (có cột `phone` thô), khác khuôn. Webhook Messenger ghi bảng Messenger, không ghi Inbox. Fork ZaloCRM có API đọc Messenger hay không thì nằm ngoài repo | `prisma/schema.prisma:842-863`, `:10075-10176`, chú thích `:9938-9949`; `app/api/webhooks/meta/messenger/route.ts` | Cao (phần repo) | Người vận hành fork ZaloCRM; đo lại số dòng Messenger trên prod |
| **2** Lead G1 chưa có SĐT: khoá ghép kênh? | `InboxIdentity` khoá duy nhất `[channel, accountId, externalUserId]` (oa_id + user_id Zalo, hoặc pageId + psid Messenger). Nối Lead qua 4 nguồn: WEBHOOK_PROFILE (khách chia sẻ SĐT trên OA), PHONE_MATCH, MANUAL, EXTERNAL_TAG (`sata:lead:<id>`). Chưa có SĐT thì chỉ còn EXTERNAL_TAG hoặc MANUAL; không có thì hội thoại "mồ côi" (trạng thái bình thường) | `prisma/schema.prisma:10012-10028`, `:10069`; `lib/inbox/view.ts:133` | Cao | — |
| **3** OmiCall: ghi âm ở đâu, bao lâu, STT nào, ra nước ngoài không? | Lưu bucket R2 **riêng** (`R2_CALL_BUCKET_NAME`), chỉ lưu khoá tệp, nghe qua link ký có ghi AuditLog trước. Hạn giữ: ô cấu hình đề xuất 12 tháng nhưng "CHỜ CHỐT", và **chưa thực thi** (cột `recordingPurgeAfterAt` không ai ghi, không cron xoá). **Chưa có** dịch vụ chuyển giọng nói. Ra khỏi VN hay không: không đọc được từ mã; chính mã ghi "TQ-4 chưa có lời đáp" | `lib/calls/kho-ghi-am.ts:9-72`; `lib/calls/nghe-ghi-am.ts:121-147`; `lib/settings/registry.ts:1584-1594`; `lib/integrations/omicall/provider.ts:61-67` | Cao | OmiCall (hợp đồng), CEO chốt hạn giữ, Pháp chế |
| **4** Trần ngân sách đã có bảng chưa? | **Có một phần, không đúng nghĩa "trần"**: `AdsBudgetTarget` chỉ 1 số theo (cơ sở, tháng), không ngưỡng cảnh báo, không theo chiến dịch, không bước CEO duyệt; quyền xem và sửa gộp một. Cần tạo mới phần lớn | `prisma/schema.prisma:7029-7048`; `app/(admin)/admin/bao-cao/ngan-sach-quang-cao/_actions.ts:32-99`; `lib/auth/page-gates.ts:217` | Cao | CEO chốt công thức gộp nhiều cơ sở |
| **5** Đã có 2FA (TOTP) cho Giám đốc, Kỹ thuật? | **Chưa**, cho vai nào cũng chưa. Chỉ có OTP gửi qua kênh cho kích hoạt/quên mật khẩu. **Đợt 0 chưa đủ điều kiện** | `Document/6-quality-security/11-security-design.md:110,120`; `lib/otp/service.ts`; `git grep -w -i -E 'totp\|otplib\|speakeasy\|otpauth'` trên `lib app prisma package.json`, cả `main` + `origin/test` = 0 dòng | Cao | CEO chốt lịch làm 2FA |
| **6** Token Meta/Google ai giữ, đồng bộ chạy ở đâu? | Meta: `META_PAGE_ACCESS_TOKEN` + `META_AD_ACCOUNT_ID` ở env Vercel, dùng **chung** cho trả lời Messenger và Ads Insights, không phải token chỉ-đọc riêng. Không có dòng Meta/Google nào trong `IntegrationConfig`. Google Ads: 0%. Đồng bộ đêm: **không chạy ở đâu**; `syncMetaAds` viết xong nhưng không cron nào gọi (30 cron trong `vercel.json` không có cái nào về ads) | `.env.example:96,103`; `lib/crm/ads-insights.ts:78-100` | Cao | Người quản lý Meta App (tách token có làm hỏng Messenger không); CEO chọn Vercel Cron hay máy local |
| **7** Tin hệ thống, bot, có tệp: giữ hay bỏ? | Repo **chưa từng có** tin bot/hệ thống tự động: `InboxMessage` chỉ có IN/OUT + `sentByUserId` + `sentOutsideSystem`. Đề xuất: IN→PH, OUT→TVV, giữ tất cả. Tệp: cột `attachments` được lưu nhưng tầng hiển thị chưa đọc tới, chưa có quy tắc che ⇒ phải viết mới `[ẢNH]`/`[TỆP]` | `prisma/schema.prisma:10133`, `:10141`, `:10143-10148`; `lib/inbox/view.ts:28-38` | Cao | Xưởng xác nhận cách gán |
| **8** Điền mã quyền theo 202 quyền | Không có nguồn nào ra 202: trên `main`, v1 = 214 action, seed v2 = 196 (trên `origin/test`: 215 và 197; lệnh đếm ở §3.1). Dùng seed v2. Mã theo từng công cụ ở §3.1: 7 công cụ có quyền dùng được, 2 là quyền "mồ côi" chưa từng enforce (`employees:view-public`, `calls:view-all`), 3 chỉ có quyền ghi (`*:manage`) ⇒ đề xuất `:view` riêng, 4–5 cần mã mới | `lib/auth/permissions.ts:36-429`; `prisma/seed-roles.ts` | Cao | Tech lead chốt tên mã mới trước khi seed |
| **9** Authorization Server MCP: tự viết hay dịch vụ? | Repo **không có AS nào**. Tự viết khả thi (có `jose`, Postgres, Actor) nhưng là khối mới hoàn toàn và phụ thuộc 2FA. Dịch vụ ngoài nhanh hơn nhưng thêm dịch vụ ngoài app, lệch "modular monolith". Không tự chọn — xem bảng §7 Q-N6 | `lib/auth.ts:87`, `:117-119`; `package.json:73,96,103` | Cao | CEO + tech lead |
| **10** `lead_id`, `call_id` không suy ra SĐT/tên? | **Xác nhận đúng**: `Lead.id`, `CallLog.id`, `InboxConversation.id`, `InboxMessage.id` đều `cuid()` ngẫu nhiên | `prisma/schema.prisma:1484`, `:10463`, `:10076`, `:10129` | Cao | — |
| **11** Chỉ tiêu tháng (SR.QD.215) đã số hoá chưa? | **Một phần**: số học sinh mục tiêu (`LeadTarget`, đếm theo con), doanh thu (`RevenueTarget`), ngân sách ads (`AdsBudgetTarget`) theo tháng × cơ sở, có màn quản trị. **Không có** tỷ lệ chuyển đổi mục tiêu mà công cụ 10 đòi. "SR.QD.215" không xuất hiện ở đâu; chú thích schema ghi "quyết định 24/08/2026 (B4)" | `prisma/schema.prisma:6954-7043`; git grep `SR.QD.215` `main` + `origin/test` = 0 | Cao | Xưởng/CEO xác nhận văn bản gốc |

---

## §7. Câu hỏi đội kỹ thuật cần CEO chốt thêm

### 7.1 Quyết định nền (chặn Đợt 0–2)

| # | Câu hỏi | Mặc định đề xuất (chờ xác nhận) | Owner |
|---|---|---|---|
| Q-N1 | Ký addendum Doc 15 §0 + §11 mở phạm vi "Cổng dữ liệu Agent"? W4 (agent tự gửi cảnh báo nội bộ) có nằm trong phạm vi không? | Ký addendum; W4 để ngoài bản đầu, xét lại ở Đợt 6 | CEO |
| Q-N2 | Xếp việc này vào cửa nào, và hoãn việc gì? | Xem bảng phương án ở §11 | CEO |
| Q-N3 | Hai người cấp quyền là ai? Có đúng hai người khác nhau, cùng đủ thẩm quyền, sẵn sàng thao tác không? (git log 30 ngày chỉ có 2 nhãn tác giả, trong đó "Sata Robo" là danh tính chung của các phiên AI, nên không suy ra được số người) | Kỹ thuật = tech lead; duyệt = CEO | CEO |
| Q-N4 | Vai "Giám đốc" (duyệt) và "Kỹ thuật" (tạo) là RoleDef mới neo ở HO? Giai đoạn đầu có tạm dùng SUPER_ADMIN cho "Kỹ thuật" không? | Tạo 2 RoleDef mới neo HO, không dùng SUPER_ADMIN (đúng spec §5.4) | CEO + tech lead |
| Q-N5 | 2FA bắt buộc cho vai nào? Có mã dự phòng không? Mất điện thoại thì ai reset? | Bắt buộc cho người giữ `agent_gateway:*` và `mcp_connect`; 10 mã dự phòng; reset cần CEO + ghi audit có lý do | CEO + tech lead |
| Q-N6 | Máy chủ cấp quyền OAuth cho MCP: (A) tự viết · (B) dịch vụ ngoài | Hoãn quyết định tới sau Đợt 1: xưởng dùng REST client `xuong` trước (spec §4.3 dòng 168 cho phép) | CEO + tech lead |
| Q-N7 | Lưu khoá ký `srs_` thế nào (§5 X2)? | Chốt ở Đợt 6; nghiêng khoá bất đối xứng | CEO + tech lead |
| Q-N8 | Đặt cổng ở host nào trên prod? | REST + MCP ở `satarobo.vn/api/agent/v1/*` (host public không cần sửa định tuyến). Nếu chọn host admin thì vá `isInfraPath` + test trong `decideRoute()` | Tech lead |
| Q-N9 | Nghĩa của "HO" trong `AgentGrant.coSo`? | "HO" = nhìn toàn hệ thống (`isHoLevel`) kể cả lead chưa bàn giao; chỉ cấp khi CEO duyệt riêng, hạn ngắn | CEO |
| Q-N10 | `AgentGrant` là bảng riêng hay phủ trên `PermissionGrant`/`UserGroup` (có DENY thật)? | Bảng riêng như spec; chặn agent bằng thu hồi grant hoặc gỡ vai | Tech lead + người giữ Nền Hệ thống |
| Q-N11 | Công tắc toàn cổng đọc thế nào để "ngay"? | Đọc thẳng DB không đệm (1 truy vấn nhỏ mỗi lượt). Đường đọc setting có đệm 300 giây (`lib/settings/service.ts:51`), và `lib/settings/read-global.ts:32-34` ghi việc xoá đệm khi lưu chỉ có tác dụng trong tiến trình đang chạy ⇒ không đảm bảo B13 | Tech lead |
| Q-N12 | Tên trường Prisma tiếng Anh hay tiếng Việt? | Prisma tiếng Anh; JSON API tiếng Việt đúng khuôn | Tech lead |
| Q-N13 | Runtime agent **nội bộ** (`lib/agents/`) gọi LLM từ satarobo: nhà cung cấp, khoá API, ngân sách, thiết kế `AgentResult`/`AgentMessage` ("giai đoạn 0 của kế hoạch kiến trúc", spec dòng 603) nằm ở đâu? | Bản này chỉ làm lối vào REST + MCP; lối vào nội bộ chờ CEO giao tài liệu thiết kế lõi agent | CEO |
| Q-N14 | Dữ liệu (kể cả đã che, có `sdt_ma_hoa`) gửi tới Claude, máy chủ ngoài Việt Nam: có thuộc diện chuyển dữ liệu cá nhân ra nước ngoài không, cần hồ sơ gì? | Chưa mở công cụ CAO trên production cho tới khi có ý kiến bằng văn bản | Người giữ vai Pháp chế (CEO chỉ định) |
| Q-N15 | Ai soạn quy chế dữ liệu cá nhân nội bộ, hạn nào? | CEO chỉ định trong tuần; hạn trước Đợt 3 | CEO |
| Q-N16 | Bộ B1–B18 khi xanh ổn định có đưa vào required check của `main` không? | Có, sau 2 tuần xanh liên tục | Tech lead (cần quyền admin repo) |
| Q-N17 | Xưởng sửa khuôn v1.1: `ket_qua` và `lead_id` cho phép null (công cụ 8), bỏ "202 quyền", cập nhật căn cứ pháp lý, bỏ tên pháp nhân không tồn tại, định nghĩa lại `giai_doan` | Xưởng sửa trước Đợt 1 | Xưởng (AGENT_ADMIN) |

### 7.2 Quyết định dữ liệu theo công cụ

| # | Công cụ | Câu hỏi | Mặc định đề xuất (chờ xác nhận) | Owner |
|---|---|---|---|---|
| Q-D1 | 1 | `phap_nhan` theo quyết định BLĐ 22/09 (CS1 = CS2 = SATA ROBO) hay tách như mẫu? | Theo quyết định 22/09; xưởng sửa mẫu | CEO |
| Q-D2 | 2 | Nguồn giá niêm yết đúng? Ai xác nhận `Course.price` trên prod đang mang giá gì? Chạy script ghi giá SR.QD.219 lên prod không? | Nguồn = SR.QD.219/233; đo prod bằng workflow chỉ-đọc rồi mới quyết chạy script | CEO + Kế toán |
| Q-D3 | 2 | `diem_nhan`, `noi_lo_ph` ai viết? | Marketing soạn mới, lưu thành trường của Course | Trưởng Marketing |
| Q-D4 | 3, 5 | "Chức danh" = mã vai RBAC (có dữ liệu, khác bộ mã TGD/GDTT/TVV) hay chức danh tổ chức `Position` (đúng nghĩa, PROD 0 dòng)? | `Position`; HR nhập liệu trước | CEO + HR |
| Q-D5 | 4 | "Kênh" = nguồn lead (`NGUON_LEAD`) hay kênh liên lạc (`InboxChannel`)? | Hai công cụ riêng, hoặc hai trường riêng; xưởng sửa khuôn | CEO + xưởng |
| Q-D6 | 6 | "G1–G8" hiện chỉ là 8 giai đoạn của thẻ điểm tư vấn **bản giả định** 21/08 (G1 Chat lấy số · G2 Cuộc gọi vàng · G3 Theo đuổi · G4 Chống vắng buổi 1 · G5 Chăm khoá trải nghiệm & chốt · G6 Đồng hành tái tục · G7 Nhân lead & nuôi lại · G8 Chia tay thiện cảm — `satarobo-sale/plan/23-THE-DIEM-MAU-G1-G8-GIA-DINH.md`, ngoài repo, ghi "không ban hành"). Lấy bộ này làm chuẩn chính thức không? Nếu có thì ánh xạ thế nào từ 10 trạng thái lead + 6 trạng thái con + mốc L1–L3? | Chờ SR.QD.223 bản thật; tới lúc đó CEO ký bảng ánh xạ tạm và `giai_doan_hien_tai` ghi rõ là suy ra | CEO |
| Q-D7 | 6 | Lead nhiều con: 1 dòng/lead hay 1 dòng/con? | 1 dòng/con, thêm `lead_child_id`; xưởng sửa khuôn | Xưởng |
| Q-D8 | 6 | `gioi_thieu_boi` hiện trỏ đối tác/CTV (`Affiliate`), không phải lead | Đổi thành `affiliate_id`; không có lead-giới-thiệu-lead | Xưởng |
| Q-D9 | 7 | Nhánh Messenger có bắt buộc nghiệm thu ở Đợt 3 không? | Nghiệm thu Zalo trước; Messenger khi có dữ liệu thật | CEO |
| Q-D10 | 8 | Cuộc gọi nội bộ (`INTERNAL`): bỏ hay thêm giá trị thứ 3? Ai nhập kết quả cuộc gọi? | Bỏ `INTERNAL`; xây màn cho Sale chọn kết quả sau cuộc gọi | CEO |
| Q-D11 | 8 | Có đóng việc xoá ghi âm theo hạn trước khi mở công cụ 8 không? Hạn giữ bao nhiêu tháng? | Có; 12 tháng | CEO + Pháp chế |
| Q-D12 | 9 | `TRIAL_1_1` là gì trong dữ liệu? Trạng thái ghi danh nào tính là `da_dang_ky`? Ghi danh không có lead thì sao? | Hỏi lại xưởng; `da_dang_ky` = CONFIRMED/STUDYING/COMPLETED; bỏ ghi danh không có lead và ghi rõ trong `meta` | CEO + xưởng |
| Q-D13 | 9, 14 | "Văn bản khuyến mãi" = voucher giảm giá (`Voucher`) hay quyết định SR.QD.xxx (cần xây Sổ văn bản)? SR.QD.223 nghĩa nào đúng? | Dùng `Voucher` cho bản đầu; Sổ văn bản là dự án riêng | CEO |
| Q-D14 | 10 | Tỷ lệ chuyển đổi mục tiêu lưu ở đâu, ai nhập? | Thêm cột vào `LeadTarget` + màn nhập sẵn có | CEO |
| Q-D15 | 11 | Chiến dịch → khoá/cơ sở: quy ước đặt tên hay bảng ánh xạ? Chưa có cơ sở thì grant một cơ sở có được dùng công cụ 11 không? | Bảng ánh xạ; tạm chỉ cấp cho grant "HO" | Trưởng Marketing |
| Q-D16 | 12 | Gộp trần nhiều cơ sở thế nào (cộng hay dòng toàn hệ thống)? | Dòng toàn hệ thống do CEO duyệt | CEO |
| Q-D17 | 13 | Bài chờ duyệt: chỉ lưu nháp nội bộ hay đăng thật qua API? | Chỉ lưu nháp; người tự đăng | CEO + Trưởng Marketing |

---

## §8. Rủi ro

| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| Dùng `SYSTEM_ACTOR` cho agent (ví dụ duy nhất có sẵn về actor không phải người) ⇒ agent lộ ra internet có quyền cao nhất | Rất cao | Luật "không dùng `SYSTEM_ACTOR` cho agent" ghi vào CLAUDE.md + test ghim mã nguồn |
| Chép cách lấy IP sai ở ≥7 chỗ cũ ⇒ vượt allowlist bằng header giả | Cao | Bắt buộc `ipChoRateLimit`; ca B11 dùng header giả |
| Cấp `*:manage` cho agent chỉ đọc ⇒ user dịch vụ có năng lực ghi thật | Cao | Tách quyền `:view` trước khi mở công cụ 10, 12 |
| Lộ dữ liệu giữa cơ sở ở bảng không tự lọc (`RefundRequest`, `AdsBudgetTarget`, `WorkingHourRule`, `Inbox*` theo `orgUnitId`) | Cao | Mỗi công cụ một ca B6 riêng; hàm thuần lọc cơ sở dùng chung |
| Trả sai học phí niêm yết (`Course.price` = giá ưu đãi) cho agent tư vấn | Cao | Đo prod trước; chưa đo thì chưa mở công cụ 2 |
| Mở công cụ CAO trước khi có quy chế PII, khi dữ liệu đi ra nước ngoài | Cao | Chặn cứng Đợt 3 trên production bằng điều kiện nghiệm thu |
| Dữ liệu thật lẫn vào môi trường test (ZaloCRM vừa vá 23/09) | Cao | Đo lại org test trước khi cấp `srk_test_*` đọc CAO |
| Lịch 8–11 tuần không đạt, kéo trễ thanh toán/hoá đơn/hồ sơ BCT | Cao | CEO chọn cửa xếp lịch ở §11 và ghi rõ việc bị hoãn |
| Thêm actor agent giữa cutover RBAC ⇒ làm hai lần hoặc lệch nhánh | TB | Người giữ Nền Hệ thống duyệt thiết kế Actor ∩ Grant |
| Code cổng nằm ngoài lưới ESLint ⇒ import `@/lib/db` trần hoặc so quyền tay mà không ai báo | TB | Mở rộng ESLint trước dòng code đầu |
| Quyền mới merge nhưng quên bấm `seed-prod-roles.yml` ⇒ prod chạy quyền cũ, không báo lỗi | TB | Ghi vào checklist lên `main`; ca nghiệm thu có đối chứng dương (vai kia THẤY) |
| Cron mới (đồng bộ ads, nhắc hết hạn khoá) quên khai `cron-pump-test.yml` ⇒ chạy thật lần đầu trên PROD | TB | Khai cả hai nơi; dùng lưới `dang-ky-cron` sẵn có |
| MCP Streamable HTTP không chạy ổn trên Vercel serverless (giới hạn gói không đo được từ repo) | TB | Spike 1–2 ngày trước khi cam kết Đợt 2 |
| Máy kiểm khuôn lỏng ⇒ dữ liệu sai nghĩa vẫn ĐẠT | TB | Test ngữ nghĩa riêng cho từng công cụ, không chỉ dựa `kiem-khuon.mjs` |
| `prisma migrate dev` chạy nhầm ⇒ ALTER 14 bảng có dữ liệu PROD | TB | Hook + quy trình SQL tay; review migration |

---

## §9. User story + AC mẫu cho Đợt 0

Epic: **MF** (2FA, tiền đề) · **AG0** (nền cổng). Tầng test:
- **Vitest thuần** — co-located, chạy trong job `Unit tests` (đã có CI, required).
- **DB suite** — script mới `test:agent-gateway-db` dùng `vitest.db.config.ts` + `tests/_helpers/db-gate.ts`
  (cờ `ALLOW_DB_RESET` chỉ bật ở đó). **Chưa có job CI** ⇒ phải thêm job mới; đề xuất đưa vào required check (Q-N16).
- **Playwright** — cho màn quản trị. **Chưa có cấu hình/job** ⇒ đề xuất gắn vào một bộ e2e admin có sẵn hoặc tạo cấu hình mới + job.

**US-MF-1** · Là **CEO**, tôi muốn **bật xác thực 2 lớp bằng ứng dụng TOTP cho tài khoản của mình** để **không ai
duyệt quyền cho agent thay tôi khi chỉ lộ mật khẩu**.
- Ưu tiên: Must · Loại: NFR(security) · Phức tạp: Cao
- AC1: Given người giữ `agent_gateway:approve` chưa bật 2FA, When mở màn "Cổng dữ liệu agent", Then bị chuyển tới màn
  cài 2FA, không thấy nút Duyệt.
- AC2: Given đã bật 2FA, When đăng nhập nhập sai mã 6 số, Then từ chối và đếm lần sai (khuôn `lib/otp/service.ts:348`).
- AC3: Given secret TOTP lưu trong DB, When đọc bảng bằng SQL, Then không thấy secret dạng rõ.
- Truy vết: spec §0 nguyên tắc 2, §13 điều kiện Đợt 0, câu 5 · DB suite `[MF1-C1..C3]` + Playwright `[MF1-E1]`
- TBD: Q-N5 (vai bắt buộc, mã dự phòng, reset) · owner CEO + tech lead · hạn trước khi mở Đợt 0

**US-AG0-1** · Là **Kỹ thuật**, tôi muốn **tạo một ứng dụng kết nối cho agent ở trạng thái chờ duyệt** để **CEO xem
lý do và phạm vi trước khi có bất kỳ khoá nào được sinh**.
- Ưu tiên: Must · Loại: FR · Phức tạp: TB
- AC1: Given người có `agent_gateway:manage` + đã 2FA, When tạo client loại `ngoai` không khai IP, Then từ chối
  `IP bắt buộc`.
- AC2: Given tạo hợp lệ, When xem DB, Then client ở `cho_duyet`, **chưa có dòng secret nào**, và có 1 dòng AuditLog
  kèm lý do.
- AC3: Given người không có quyền, When gọi Server Action tạo client, Then `PERMISSION_DENIED` (kiểm ở action, không chỉ ở layout).
- Truy vết: spec §4.5, §5.3 · DB suite `[AG0-C1..C3]`

**US-AG0-2** · Là **CEO**, tôi muốn **duyệt client/grant mà hệ thống chặn nếu tôi cũng là người tạo** để **không ai
tự cấp quyền cho mình**.
- Ưu tiên: Must · Loại: BR · Phức tạp: Thấp (chép khuôn `SELF_APPROVAL`)
- AC1: Given client do A tạo, When A (dù có cả `approve`) bấm Duyệt, Then từ chối mã `SELF_APPROVAL` (B10).
- AC2: Given B ≠ A đã 2FA, When B duyệt, Then client `hoat_dong`, secret `srk_test_…` hiện **một lần** cho người tạo,
  DB chỉ lưu bản băm HMAC-SHA256(pepper, secret).
- AC3: Given đã hiện một lần, When tải lại màn, Then không xem lại được secret (kể cả SUPER_ADMIN).
- Đối chứng dương: AC2 phải chứng minh luồng duyệt THÀNH CÔNG, không chỉ luồng bị chặn.
- Truy vết: spec §4.5, §5.3, B10 · DB suite `[AG0-C4..C6]` + Playwright `[AG0-E1]`

**US-AG0-3** · Là **agent ngoài**, tôi muốn **đổi mã + mật khẩu client lấy token 15 phút** để **gọi công cụ mà không
phải gửi mật khẩu mỗi lượt**.
- Ưu tiên: Must · Loại: FR · Phức tạp: Cao
- AC1: Given client `hoat_dong`, When `POST /api/agent/v1/oauth/token` đúng Basic auth từ IP được phép, Then trả
  `sra_…`, `expires_in: 900`, DB lưu bản băm token.
- AC2: Given xin `scope` rộng hơn grant, When gọi, Then `invalid_scope`, không âm thầm cắt bớt.
- AC3: Given khoá `srk_test_` gọi trên production (giả lập `VERCEL_TARGET_ENV=production`), Then `401` (B3).
- AC4: Given IP ngoài danh sách với `x-forwarded-for` giả ở phần tử đầu, Then `403 IP_KHONG_DUOC_PHEP` (B11).
- Truy vết: spec §4.2, §4.6 · Vitest thuần `[AG0-U1]` (hàm môi trường, hàm IP) + DB suite `[AG0-C7..C9]`

**US-AG0-4** · Là **CEO**, tôi muốn **mỗi yêu cầu đi qua đủ 13 bước kiểm và từ chối ngay ở bước lỗi đầu tiên** để
**không có đường nào trả dữ liệu khi một lớp kiểm hỏng**.
- Ưu tiên: Must · Loại: NFR(security) · Phức tạp: Cao
- AC1: Given token hợp lệ nhưng grant chỉ CS1, When gọi `co_so = "CS2"`, Then `403 NGOAI_PHAM_VI_CO_SO`, không trả mảng rỗng (B5).
- AC2: Given như trên, When không truyền `co_so`, Then chỉ dữ liệu CS1 (B6).
- AC3: Given body có `{ "xoa": true }`, Then `422 THAM_SO_SAI`, không lặp lại giá trị đã gửi (B7).
- AC4: Given hàm nghiệp vụ bị cấy thiếu một trường khuôn, Then `500 LECH_KHUON`, không trả dữ liệu (B17).
- AC5: Given gọi công cụ không được cấp (có tồn tại), Then `404 CONG_CU_KHONG_TON_TAI` (B4).
- Truy vết: spec §5.6, §7.3 · Vitest thuần `[AG0-U2..U4]` (hàm kiểm grant, zod strict, zod đầu ra) + DB suite `[AG0-C10..C12]`

**US-AG0-5** · Là **CEO**, tôi muốn **thu hồi một client hoặc tắt toàn cổng mà có hiệu lực ngay** để **chặn kịp khi
nghi lộ khoá**.
- Ưu tiên: Must · Loại: FR · Phức tạp: TB
- AC1: Given token đang sống, When thu hồi client, Then lượt gọi kế tiếp (1 giây sau) trả `401` (B2).
- AC2: Given đổi `agentGateway.enabled = false` qua màn quản trị, When gọi bất kỳ công cụ nào, Then `503 CONG_DANG_TAT`
  ngay, không deploy (B13).
- AC3: Given gỡ vai của user dịch vụ (không tạo DENY), When gọi lượt kế, Then `403` (B9).
- AC4: Given grant hết hạn 1 giây trước, When gọi, Then từ chối — **không cần cron nào chạy trước** (luật cứng #8).
- Truy vết: spec §4.5, §5.5, §12, Phụ lục C · DB suite `[AG0-C13..C16]`

**US-AG0-6** · Là **CEO**, tôi muốn **mỗi lượt gọi có đúng một dòng nhật ký không chứa dữ liệu trả về** để **điều
tra được mà không tạo thêm kho dữ liệu cá nhân**.
- Ưu tiên: Must · Loại: NFR(security) · Phức tạp: TB
- AC1: Given 1 lượt thành công và 1 lượt bị từ chối, When đếm `AgentToolCall`, Then đúng 2 dòng, dòng từ chối có mã lỗi.
- AC2: Given chạy cả bộ test, When grep log ứng dụng + payload Sentry giả lập, Then không thấy `srk_`, `sra_`, `srs_`,
  SĐT, tên phụ huynh (B16).
- AC3: Given dòng nhật ký, Then chỉ có tham số dạng băm (`thamSoBam`), không có tham số rõ.
- Truy vết: spec §12 · DB suite `[AG0-C17..C18]` + Vitest thuần cho bộ lọc Sentry `[AG0-U5]`

**US-AG0-7** · Là **Kỹ thuật**, tôi muốn **client tự khoá sau 20 lần sai mật khẩu trong 5 phút** để **dò mật khẩu
không có kết quả**.
- Ưu tiên: Should · Loại: NFR(security) · Phức tạp: Thấp
- AC1: Given 21 lần sai trong 5 phút, Then client `tam_khoa`, CEO nhận thông báo, lượt đúng mật khẩu sau đó vẫn `401 CLIENT_BI_KHOA` (B12).
- AC2: Given ngưỡng đổi trong `SystemSetting`, Then áp dụng không cần deploy.
- Truy vết: spec §7.4, §12 · DB suite `[AG0-C19]`

**US-AG0-8** · Là **xưởng skill**, tôi muốn **gọi `danh_muc.lay_co_so` trên test và nhận đúng khuôn** để **chạy skill
trên dữ liệu thật mà không sửa skill**.
- Ưu tiên: Must · Loại: FR · Phức tạp: Thấp
- AC1: Given client `xuong` được cấp `danh_muc.lay_co_so:doc` cơ sở `["HO","CS1","CS2"]`, When gọi, Then
  `node cong-cu/kiem-khuon.mjs danh_muc.lay_co_so phan-hoi.json` ĐẠT.
- AC2: Given grant chỉ CS1, Then chỉ trả CS1 (và không trả hội sở trừ khi grant có "HO").
- AC3: `phap_nhan` trả đúng dữ liệu hệ thống sau khi chốt Q-D1, không trả tên trong mẫu nếu mẫu sai.
- Quyền: `centers:view` · Truy vết: spec §9 công cụ 1, §14.1 · Vitest bọc máy kiểm `[AG0-U6]` + DB suite `[AG0-C20]`
- TBD: Q-D1 · owner CEO

**US-AG0-9** · Là **tech lead**, tôi muốn **lưới ESLint phủ `lib/agents/**` và `app/api/agent/**`** để **code cổng
không import `@/lib/db` trần và không so quyền tay ngoài hàm kiểm grant**.
- Ưu tiên: Must · Loại: NFR(maintainability) · Phức tạp: Thấp
- AC1: Given file mẫu trong `lib/agents/` import `@/lib/db`, When `pnpm lint`, Then lỗi.
- AC2: Cấy lại lỗi, thấy đỏ, khôi phục byte-exact (luật 14).
- Truy vết: §5 X7 · `lib/eslint/*.test.ts` `[AG0-U7]` · job Quality (đã có CI)

Khung chung cho mọi story: **Flag** — cổng đi sau `agentGateway.enabled` (SystemSetting), không dùng `lib/flags.ts`.
**Rollback** — tắt công tắc toàn cổng (hiệu lực ngay); bảng mới additive, không drop cột. **Người duyệt** — CEO
(🟡 chờ ký).

---

## §10. Inverse — cố ý KHÔNG làm

- Không có công cụ nào xoá dữ liệu, chi tiền, xác nhận thanh toán, nhắn phụ huynh/khách, sửa/bật/tắt quảng cáo,
  đổi quyền, tạo tài khoản, đổi mật khẩu, sửa công/lương/điểm, sửa văn bản đã ký, xuất hàng loạt dữ liệu cá nhân (spec §5.1).
- Không dùng `SYSTEM_ACTOR` làm danh tính agent. Không cho user dịch vụ đăng nhập `/login`.
- Không tạo grant DENY để chặn agent. Chặn bằng thu hồi grant hoặc gỡ vai (khớp CLAUDE.md và spec §5.4).
- Không cấp `*:manage` cho agent chỉ để đọc. Không cấp `agent_gateway:*`, `*:approve` cho user dịch vụ.
- Không đặt công tắc trong `lib/flags.ts` (phải redeploy).
- Không sửa `lib/lead/pii.ts`, `checkPermission`, `canViewLeadPii` (màn admin đang dùng). Agent dùng module riêng.
- Không gọi Meta/Google mỗi lượt agent. Không mở MCP resources/prompts. Không chuyển tiếp token MCP (no passthrough).
- Không trả file hay link ghi âm.
- Không chạy `prisma migrate dev`. Không sửa migration đã apply.
- Không tự chọn thay CEO: nguồn kênh, bộ chức danh, bảng G1–G8, nguồn giá niêm yết, nghĩa "văn bản khuyến mãi".
  Không tự đảo quyết định pháp nhân 22/09 để khớp mẫu.
- Không làm "AI CRM assistant tự hành động" (vẫn loại theo Doc 15). Bản đầu không làm W4 cho tới khi Q-N1 chốt.
- Không làm công cụ cho Vận hành/CSKH, Đào tạo, Nhân sự, Kế toán, Pháp chế (spec dòng 51–53).
- Không nới `audit-logs:view`. Nhật ký cổng là bảng riêng, xem bằng `agent_gateway:view`.
- Không mở công cụ CAO trên production trước quy chế PII, trước ý kiến về chuyển dữ liệu ra nước ngoài, và trước
  khi đo lại dữ liệu ZaloCRM trên test.
- Không lên production trước khi CEO nghiệm thu từng đợt trên `test.satarobo.vn`.

---

## §11. Bước tiếp theo

### 11.1 Chọn cửa xếp lịch (CEO quyết)

| | (A) Chen P1 ngay | (B) P2 cuốn chiếu | (C) Thu hẹp rồi mở rộng |
|---|---|---|---|
| Cách làm | Làm Đợt 0→6 liền mạch từ tuần tới | Chờ đóng bớt việc đang chặn (thanh toán, hoá đơn điện tử, hồ sơ BCT, cutover RBAC) rồi mới bắt đầu | Làm 2FA + Đợt 0 + công cụ 1, 2, 3 qua REST cho client `xuong`; chưa MCP, chưa công cụ CAO; đánh giá lại sau |
| Ưu | Xưởng có dữ liệu thật sớm nhất | Không ảnh hưởng việc đang chặn | Xưởng có dữ liệu thật ít nhạy cảm trong ~5–7 tuần-người; rủi ro PII và pháp lý gần như 0; giữ đủ khung để thêm công cụ sau |
| Nhược | Phải hoãn ít nhất một việc đang chặn; rủi ro cao nhất khi đội quá tải | Xưởng chờ lâu, tiếp tục làm trên dữ liệu giả | Chưa phục vụ chấm điểm hội thoại (cần công cụ 7) |
| Est | ~22–33 tuần-người | như (A), bắt đầu muộn | ~5–7 tuần-người cho bước đầu |
| **Đề xuất (CHỜ CEO CHỌN)** | | | → BA đề xuất **(C)**, xếp cửa change-control (yêu cầu bổ sung có dấu trên phiếu); các đợt sau xếp P2 cuốn chiếu |

### 11.2 Thứ tự đề xuất

1. **CEO đọc §0, chốt Q-N1 → Q-N5** (phạm vi, cửa lịch, người duyệt, vai, 2FA) và chỉ định người giữ vai Pháp chế (Q-N15).
2. **Xưởng sửa khuôn v1.1** theo Q-N17 và các Q-D liên quan tới khuôn (Q-D5, Q-D7, Q-D8, câu 8 về khuôn cuộc gọi).
3. **Mảnh code an toàn đầu tiên**: thuần, không chạm DB, không chạm định tuyến, **chưa được import ở đâu** (theo
   khuôn "spec việc bị chặn" của repo). **Điều kiện bắt đầu:** CEO xác nhận bằng văn bản là **có ý định làm tiếp**
   dự án này (chưa cần trả lời đủ Q-N1…Q-N5), và tech lead đồng ý bỏ công trong lúc đội đang quá tải. Chưa có xác
   nhận đó thì không viết dòng nào, vì Q-N1 (mở phạm vi AI) chính là câu "có làm hay không".
   - `lib/agents/pii.ts` thuần: gắn nhãn toàn phần `[TÊN_PH]/[TÊN_CON]/[SĐT]/[EMAIL]/[CCCD]/[ĐỊA_CHỈ]/[SỐ_TK]`,
     HMAC SĐT nhận pepper qua **tham số bắt buộc** (không mặc định, không đọc env trong hàm), che tên đã biết trong văn
     bản tự do, che ảnh/tệp. Tái dùng `redactContactsInText` + 2 regex của `lib/lead/pii.ts:43-60`. Kèm Vitest.
   - `lib/agents/gateway/kiem-grant.ts` thuần: bước 6 + bước 9 (scope token, cơ sở ⊆ grant, hết hạn tính lúc đọc).
     Kèm Vitest gồm ca B5, B6, "hết hạn 1 giây trước".
   - Hàm đổi tên `a.b` → `a__b` + kiểm `[a-zA-Z0-9_-]{1,64}`, và test Vitest bọc `kiem-khuon.mjs --mau`.
   - Mở rộng ESLint phủ `lib/agents/**` + `app/api/agent/**` (US-AG0-9), cấy lại lỗi để chứng minh lưới cắn.
4. **Sau chữ ký Q-N1…Q-N5:** US-MF-1 (2FA) như ticket riêng, rồi Đợt 0 theo §9. Migration SQL tay mốc > `20260924180000`,
   bật RLS. Sau merge `main`: bấm `seed-prod-roles.yml` cho quyền `agent_gateway:*`.
5. **Đợt 1** chỉ mở công cụ nào đã có quyết định dữ liệu (Q-D1…Q-D5, Q-D12…Q-D14).
6. **Trước Đợt 3:** quy chế PII ban hành, ý kiến Q-N14, đo lại org ZaloCRM test, đo số dòng Messenger trên prod.
7. **Đầu ra tiếp theo:** khi các câu chốt, chuyển `/prepare-prompt` sinh ticket theo epic. Thứ tự wave:
   W1 = E0 + E1 + E2 lõi + công cụ 1 · W2 = E3/E4 phần đã chốt · W3 = E5 · W4 = E6 · W5 = E7 · W6 = E8 · W7 = E9.

---

## Phụ lục — Phát hiện đã được phản biện đính chính

| Mảng | Khảo sát ban đầu nói | Phản biện đính chính |
|---|---|---|
| Xác thực | "Người duyệt ≠ người tạo" không có ở đâu, phải xây mới hoàn toàn | **SAI.** Đã có `SELF_APPROVAL` ở `lib/elearning/training-need.ts:116-124`, `lib/elearning/equivalence.ts:74-80`, có test `program-create.test.ts:213-220`. Grep ban đầu chỉ tìm tên biến tiếng Anh |
| Hạ tầng (bổ sung) | Mô hình duyệt phải có "người tạo ≠ người duyệt thứ nhất ≠ người duyệt thứ hai" | Đọc quá chữ spec: spec §5.3 chỉ cần **hai** người (tạo ≠ duyệt). Tài liệu này theo spec |
| Xác thực | Tự khoá chỉ có rate-limit làm tiền lệ | Bổ sung: khuôn đếm-sai-rồi-khoá đã có ở `lib/otp/service.ts:311,348` |
| Xác thực | Vai "Giám đốc" là câu hỏi mở chưa kiểm được | Một phần: `RoleDef.code` là chuỗi tự do (`prisma/schema.prisma:470-481`), tạo vai mới không cần migration enum |
| Xác thực | Lưu secret mã hoá trong DB đụng luật #9 | Nặng hơn: toàn schema **không có cột mã hoá nào**, đây là tiền lệ đầu tiên |
| Phân quyền | Header `seed-prod-roles.yml`: "deploy.yml chỉ migrate schema" | Lỗi thời: `deploy.yml:66-77` có bước tự đồng bộ `PermissionDescriptor`; nhưng RoleDef/RolePermission vẫn phải bấm tay `seed-prod-roles.yml` |
| Phân quyền | `lay_nhan_su` làm ngay, 0 ngày | Hạ bậc: `employees:view-public` là quyền mồ côi (0 lời gọi enforcement); `chuc_danh` dùng chung bộ mã với công cụ 5 |
| Phân quyền | `calls:view-all` sẵn dùng | Mồ côi như trên; chỉ `calls:listen-recording` có enforcement thật (`lib/calls/nghe-ghi-am.ts:102`) |
| Phân quyền | Đi đường DENY chỉ cần thêm seed | Bổ sung: `PermissionGrant.permissionKey` có FK Restrict (`prisma/schema.prisma:533-539`) ⇒ phải đăng ký key trong registry trước |
| Danh mục | `gio_lam`, `nguoi_nhan_canh_bao` là thiếu chặn | Hạ mức: spec dòng 447 ghi "nếu đã cấu hình", khuôn không khai ⇒ máy kiểm vẫn ĐẠT |
| Danh mục | Giá khoá học: 3 nguồn, 2–3 ngày | Nặng hơn: slug `sata3` vs `sata-3` có thể sinh hai dòng Course; `lib/gia-cong-khai.ts:13-19` (22/09) xác nhận prod slug `sata1` vs local `sata-1`; script giá đúng nhiều khả năng chưa chạy trên prod |
| Danh mục | Hội thoại nối lead qua `Conversation.leadId` | Sai tên model: là `InboxIdentity.leadId`; `Conversation` (chat) không có `leadId` |
| Danh mục | Tên pháp nhân "khác mẫu" | Nặng hơn: "STEM Robotics & AI" không xuất hiện ở đâu trong repo (cả `main` lẫn `origin/test`) |
| Danh mục (bổ sung) | — | Máy kiểm chỉ kiểm `required` + `properties`, không bắt lệch nghĩa |
| Tuyển sinh | `van_ban_khuyen_mai` và công cụ 14 không có nguồn nào | **SAI.** Model `Voucher` (`prisma/schema.prisma:4630-4665`) có mã, tên, hiệu lực từ/đến, trạng thái; `VoucherRedemption` nối đơn hàng. Grep ban đầu không thử từ "Voucher" |
| Tuyển sinh | Che PII chỉ cần đổi mask sang nhãn | Nặng hơn: spec dòng 321 đòi che **tên đã biết của lead** trong văn bản tự do, chưa có hàm nào làm việc này |
| Tuyển sinh | Messenger "0 dòng trên prod" | Chỉ là chú thích đo 12/08, chưa đo lại |
| Tuyển sinh (bổ sung) | — | Gọi thẳng `can()` v2 thì agent bỏ qua cơ chế so v1×v2 của `checkPermission`; 6 bảng mới phải migration tay + RLS |
| Gọi điện | "Không có trang admin cuộc gọi nào" (find ra 0) | Find ra 1: `app/(admin)/admin/_spike/omicall` — trang thử SDK, không ghi DB (`page.tsx:36-45`); kết luận giữ nguyên |
| Gọi điện | Khuôn chi phí ads 7 trường, bảng phủ 5/7; trích `ads-budget-target.ts:88-103` | Khuôn có **11** trường bắt buộc, phủ 5/11; trích dẫn kia không nói gì về chiến dịch, đã gỡ |
| Gọi điện | `IntegrationConfig` chỉ có MISA | Dùng cho Zalo OA, MISA, VietQR, ZaloCRM; chỉ đúng vế "không có Meta/Google" |
| Gọi điện | Công cụ 8 "cần bổ sung nhỏ" | Hạ bậc: `ket_qua` khuôn không cho null trong khi `outcome` luôn rỗng ⇒ trượt máy kiểm; `lead_id` bắt buộc nhưng cho phép rỗng ở DB; thiếu màn nhập kết quả; chưa che PII CallLog; cờ OmiCall prod chưa rõ |
| Gọi điện | ESLint `no-inline-authz` sẽ làm build fail nếu so grant trong route | **SAI.** Glob chỉ khớp file action (`eslint.config.mjs:116-122`), `route.ts` không khớp. Vấn đề thật là ngược lại: code cổng **không có lưới** |
| Gọi điện (bổ sung) | — | Quyền cuộc gọi đã tách 6 action rõ ràng (`prisma/seed-roles.ts:19-24`); `MarketingCostPeriod` + cron cảnh báo tái dùng được cho công cụ 12 |
| Hạ tầng | `safeEqual` trùng 2 bản | Trùng **5** bản |
| Hạ tầng | 15 cấu hình Playwright | 16 |
| Hạ tầng (bổ sung) | — | ≥7 chỗ gọi vẫn lấy IP sai phần tử đầu XFF; schema một tệp 11.469 dòng dễ xung đột khi nhiều worktree cùng sửa |
| Bối cảnh | Promotion không có khái niệm hiệu lực | Sai một phần: `Promotion` có `isActive`, `startsAt`, `endsAt` (`prisma/schema.prisma:6335-6338`); chỉ thiếu mã văn bản |
| Bối cảnh | Đội ~3 người, quá tải | Số liệu từ tài liệu 03/08 (53 ngày tuổi). git log không cho biết số người (nhãn tác giả dùng chung). Phải hỏi trực tiếp CEO (Q-N3) |
| Bối cảnh | 196 action trong seed v2 | Đếm lại ra 197 tuỳ cách đếm; kết luận "không phải 202" giữ nguyên |
| Bối cảnh (bổ sung) | — | Spec tự mâu thuẫn về Pháp chế (dòng 51–53 vs 310–312) |
| Soát cuối (bản viết) | v1 có 225 action | **SAI.** Đếm đúng dòng thành viên union ra **214** trên `main` (215 trên `origin/test`); 225 là số mọi chuỗi trong ngoặc kép, lẫn cả chú thích |
| Soát cuối (bản viết) | Bằng chứng "chưa có TOTP": grep `totp\|otplib\|speakeasy` ra 0 | Lệnh như ghi **không** ra 0 (khớp giả "requestOtp"). Kết luận đúng; bằng chứng đổi thành `git grep -w` = 0 dòng + tài liệu bảo mật dòng 110 |
| Soát cuối (bản viết) | Đợt 2 ước 2–3 tuần công, trong khi máy chủ OAuth xếp "Rất cao" | Mâu thuẫn nội bộ. Ước lại 4–6 tuần-người nếu tự viết; tổng thành 22–33 |
| Soát cuối (bản viết) | "Không kịp lịch, khối lượng gấp 2–3 lần" | Thiếu đơn vị. CEO không ghi tuần lịch hay tuần-người; với đội ~3 người dồn toàn lực thì hai con số gần nhau. Đã viết lại kết luận |
| Soát cuối (bản viết) | "Phễu G1–G8 không có trong hệ thống" | Đúng về dữ liệu, nhưng thiếu: G1–G8 là 8 giai đoạn của thẻ điểm tư vấn **giả định** 21/08 (ngoài repo). Đã thêm vào §0, §3.1, Q-D6 |
| Soát cuối (bản viết) | — (bỏ sót) | W1 lệch ràng buộc "chờ phúc tra" của phiếu G-B 21/08. Thêm X15 |
| Soát cuối (bản viết) | `setGlobalSetting` xoá cache ngay ⇒ công tắc có hiệu lực ngay | Không đảm bảo: đọc có đệm 300 giây, xoá đệm chỉ tác dụng trong tiến trình đang chạy (`lib/settings/read-global.ts:32-34`). Công tắc phải đọc thẳng DB |

---

## Ghi chú thực thi (25/09/2026) — viết ngược sau khi code Đợt 0

Chủ dự án chỉ đạo "bắt đầu thực hiện luôn" ⇒ làm **Đợt 0** (nền cổng + 2FA + công cụ `danh_muc.lay_co_so`),
đúng thứ tự §11.2, với các mặc định đề xuất ở §7. Runbook + danh sách mặc định: `docs/cong-du-lieu-agent/README.md`.

| Hạng mục | Đã làm | Cố ý CHƯA làm (vì sao) |
|---|---|---|
| E0 2FA | TOTP RFC 6238 tự viết (không thêm thư viện), bí mật mã hoá AES-256-GCM, chống phát lại, khoá 15 phút sau 5 lần sai — làm **bước nâng** cho thao tác nhạy cảm | Không đổi luồng đăng nhập chung (dự án riêng; chỉ người giữ quyền cổng cần) |
| E0 vai | `GIAM_DOC`, `KY_THUAT`, `AGENT_CHI_DOC` (Q-N4 mặc định) | Chưa gán cho ai — việc tay sau `seed` |
| E1 nền cổng | 5 bảng + `UserTotp` + `User.isServiceAccount` (additive, RLS); sổ công cụ; pipeline 13 bước; token `client_credentials`; tự khoá + báo người duyệt; công tắc đọc thẳng DB; nhật ký | `AgentDraft` + ký yêu cầu (Đợt 6 — X2 chưa chốt) |
| E1 màn quản trị | 5 thẻ: ứng dụng, quyền cấp, chờ duyệt, nhật ký, cài đặt | Sửa IP của client (thu hồi + tạo mới) |
| E2 PII | `lib/agents/pii.ts` (nhãn toàn phần, băm SĐT, che tên đã biết, tệp đính kèm) | Chưa công cụ CAO nào dùng (Đợt 3) |
| E3 công cụ 1 | `danh_muc.lay_co_so` — pháp nhân lấy từ dữ liệu hệ thống (Q-D1) | `gio_lam`, `nguoi_nhan_canh_bao` (tuỳ chọn trong spec) |
| E10 | Lưới ESLint cho `lib/agents/**` + `app/api/agent/**` (X7) | gitleaks, lọc Sentry theo tiền tố, báo cáo tuần |

**Kiểm thử:** bộ DB `tests/agents/cong-du-lieu.spec.ts` phủ B1–B4, B6, B7, B9–B13, B17 (mã ca giữ nguyên spec §14.2) + ca
khoá chéo, xoay khoá, 2FA; thêm bước `pnpm test:agent-db` vào job CI `Unit tests`. Máy kiểm `kiem-khuon.mjs` của xưởng chạy
trên phản hồi THẬT trong ca `[AG-OK-01]`. B5 phủ ở tầng hàm thuần (công cụ Đợt 0 không nhận `co_so`).

**Đính chính một chỗ của bản BA:** §2 ghi "`setGlobalSetting` xoá cache ngay ⇒ công tắc có hiệu lực ngay" — không đủ; đã sửa ở
bản này (§2, B13, Q-N11) và cổng đọc công tắc thẳng DB.
