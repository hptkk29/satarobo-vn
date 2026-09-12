# VÉ — lượt CI định kỳ trên `main` (thiết kế ĐÃ DUYỆT, chưa làm)

> **Trạng thái:** ĐÃ DUYỆT 13/09/2026. Làm **SAU mục 6** — mục 6 có thể đè dữ liệu thật, còn
> lưới này chỉ phát hiện chậm hơn một ngày.
> **Ước lượng:** ~2–3 giờ, ba phần.

---

## Vấn đề nó giải

**Required check gác lúc MERGE. Không gì gác `main` VỀ SAU.**

Đo được 13/09: `main` đỏ ba ngày mà **không ai đẩy gì cả**.

| | |
|---|---|
| run trên `main`, tạo | 10/09 05:52 (ngay sau merge) — **XANH thật** |
| cùng run, chạy lại | 12/09 17:32 — **ĐỎ** |
| diff giữa hai lượt | **không có** |

Lớp lỗi đi đúng đường ấy, không chỉ mỗi đồng hồ (luật 19 bịt được vế đó):

- API bên ngoài đổi hành vi;
- chứng chỉ hết hạn;
- gói phụ thuộc tự cập nhật (lockfile không đổi nhưng thứ giải ra khác);
- dữ liệu prod đổi dưới chân một ca.

⚠️ **Đặt lại danh sách required KHÔNG chữa được lớp này.** Đó là kết luận sai đầu tiên của
lượt 13/09 — xem luật 19, mục "hai chẩn đoán SAI".

---

## Phần 1 — workflow `ci-dinh-ky.yml` (~45′)

- **KHÔNG sửa `ci.yml`.** File mới, độc lập.
- `schedule: cron "0 18 * * *"` = **01:00 giờ VN**, thấp điểm.
- Kèm `workflow_dispatch` để bấm tay khi cần kiểm.
- Chạy đúng **5 job đang required**. Đo trên một lượt `main` xanh:

| job | thời lượng |
|---|---|
| Quality (typecheck + lint + build) | 5,3′ |
| Unit tests (Vitest) | 4,1′ |
| Chat DB invariants | 2,1′ |
| E2E Phase R7 1/2 | 5,1′ |
| E2E Phase R7 2/2 | 5,5′ |

⇒ tường đồng hồ **~6 phút** (song song), tổng máy ~22 phút.
Repo **public** ⇒ Actions minutes **miễn phí**; chi phí là thời gian và tiếng ồn, không phải tiền.

Cách dùng lại job: cân giữa `workflow_call` (tách job ra file dùng chung) và gọi
`gh workflow run`. **Đo trước cái nào ít trùng lặp hơn**, đừng chọn theo cảm giác.

---

## Phần 2 — kênh báo: tự mở / cập nhật MỘT GitHub Issue mốc (~45′)

Chọn vì **không cần secret mới** (`GITHUB_TOKEN` là đủ) và GitHub tự gửi thông báo cho người
theo dõi repo — việc "có người biết" do hệ thống sẵn có lo, không phải do ai nhớ mở tab Actions.

Hành vi:

| tình huống | việc |
|---|---|
| lượt ĐỎ, chưa có issue mốc mở | **mở** issue, nhãn `ci-dinh-ky` |
| lượt ĐỎ, đã có issue mốc mở | **comment vào issue cũ** — KHÔNG mở issue mới |
| lượt XANH, đang có issue mốc mở | **tự đóng** |

Nội dung issue: job nào đỏ · SHA · link run · **`main` đã im bao nhiêu ngày** (chính là dấu
hiệu của luật 19).

### 🔴 DẤU NHỊP — bắt buộc, không phải tuỳ chọn

> **Im lặng vì ổn và im lặng vì chết trông giống hệt nhau.**

Ba cảnh báo đã biết đều dẫn tới đúng chỗ đó: bị GitHub tắt sau 60 ngày · file nằm sai nhánh ·
cron không chạy. Không có vế này thì ta vừa dựng thêm **một thứ nói dối bằng cách im lặng**.

- **Mỗi lượt chạy, kể cả XANH**, cập nhật vào issue mốc một dòng:
  `lần chạy gần nhất: <ngày giờ> · <SHA>`
- Ghi **ngay trong issue**, chữ to:
  > **Nếu dòng trên quá 48 GIỜ không đổi thì LƯỚI ĐÃ CHẾT, không phải hệ thống đang khoẻ.**

⇒ Issue mốc **luôn tồn tại** (không đóng hẳn), trạng thái đỏ/xanh thể hiện bằng nhãn hoặc
phần thân; "đóng" ở bảng trên nghĩa là đóng **mục báo lỗi**, dấu nhịp vẫn phải sống. Chốt
hình dạng cụ thể lúc làm, nhưng **dấu nhịp không được biến mất theo lượt xanh**.

### Ba lựa chọn đã cân và LOẠI

| | vì sao loại |
|---|---|
| **Zalo ZNS** | creds chỉ ở scope Production, và cấm nhân bản `ZALO_OA_REFRESH_TOKEN` sang môi trường hai — sai chỗ |
| **Slack / Discord webhook** | cần secret mới; chỉ nên làm nếu chủ dự án đã có kênh dùng hằng ngày |
| **Email mặc định của GitHub** | chỉ báo cho chủ token của lượt schedule, và im nếu cài đặt thông báo tắt — đúng cái bẫy luật 10 |

---

## Phần 3 — chú thích đầu file (~30′)

Viết hoa, ngay đầu `ci-dinh-ky.yml`:

1. **NÓ KHÔNG CHẶN AI, NÓ CHỈ BÁO.** Đỏ ở đây không ngăn merge — muốn chặn thì vào
   Settings → Branch protection.
2. **`schedule` chỉ chạy file ở NHÁNH MẶC ĐỊNH.** Sửa file này trên nhánh feature là **không
   có hiệu lực** cho tới khi merge.
3. **GitHub tự TẮT scheduled workflow sau 60 ngày repo không hoạt động.** Repo này hoạt động
   hằng ngày nên chưa chạm, nhưng một kỳ nghỉ dài là lúc cái lưới tự biến mất mà không báo ai
   — và đó là lý do dấu nhịp ở phần 2 tồn tại.

---

## 🔴 Kiểm chính cái lưới — luật 14 + 16, phải CHẠY THẬT

> **Đừng tin nó vì nó chạy xanh.** Ba ca dưới đây phải chạy thật **một lần**, không phải chỉ
> viết vào tài liệu.

| ca | phải xảy ra |
|---|---|
| **cấy cho KÊNH BÁO**: cố tình làm một job đỏ trên `main` (nhánh rác, revert ngay) | issue **mở ra** VÀ **chủ dự án NHẬN ĐƯỢC thông báo thật**. Không nhận được ⇒ **kênh sai, làm lại** |
| đỏ **lần hai** | **comment vào issue cũ**, KHÔNG mở issue mới |
| **xanh lại** | **tự đóng** |

⚠️ Ca thứ nhất là phép cấy **cho kênh báo**, không phải cho workflow. Workflow chạy đúng mà
thông báo không tới người thì lưới vẫn bằng không — đúng luật 10 ở dạng khác.

---

## Việc CỐ Ý không làm bây giờ — lượt chạy script chỉ-đọc trên prod

**Chốt của chủ dự án: KHÔNG làm bây giờ.**

Lý do: nó chạm DB thật **mỗi ngày** và **mục tiêu chưa rõ** — ta chưa biết muốn canh số nào.

> Khi nào có **một con số cụ thể đáng canh** (ví dụ: *số ngày công bị gán sai cơ sở > 0*) thì
> mới dựng, và lúc đó nó là **cảnh báo có nghĩa** chứ không phải một lượt đọc cho yên tâm.

Ứng viên đầu tiên khi tới lúc: `scripts/do-noi-chiu-cong-lech.ts` (đã có, chỉ đọc) — nhưng
chỉ sau khi lượt đo tay đầu tiên cho biết ngưỡng bình thường là bao nhiêu.

---

## Liên quan

- `docs/luat-doc-so-va-ket-luan.md` — **luật 19** (test không đọc đồng hồ thật), **luật 10**
  (ca đỏ mà không ai bị chặn), và đính chính danh sách required đo ngày 13/09.
- `docs/cham-cong/VE-BOM-HEN-GIO-TRONG-TEST.md` — lớp lỗi mà lượt định kỳ sẽ bắt được nhiều nhất.
