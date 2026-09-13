# VÉ — CodeGraph: ba việc chờ chủ dự án quyết

> **Trạng thái:** MỞ, **CỐ Ý chưa làm**. Chốt 13/09/2026: *"CodeGraph: dừng ở đây, không cấu
> hình thêm. Ba việc bạn nêu — ghi vé, tôi quyết sau."*
> Vé này chỉ ghi lại **số đo** và **đánh đổi** của từng việc, không đề xuất làm ngay.

## Hiện trạng đã đo (13/09/2026)

| | |
|---|---|
| cài + `init` + index | **xong**, chạy được |
| kích thước chỉ mục | `.codegraph/` = **134 MB** (`du -sh`) |
| lối vào đang dùng | hook `UserPromptSubmit` — tự gợi ý symbol khớp trước mỗi lượt |

---

## Việc 1 — `.gitignore` cho chỉ mục 134 MB

### ⚠️ Đính chính: rủi ro NHỎ HƠN tôi nêu lần đầu

Lần đầu tôi nêu việc này như *"134 MB có nguy cơ bị commit"*. **Đo lại thì không đúng** —
CodeGraph tự sinh `.codegraph/.gitignore` với nội dung `*` + `!.gitignore`, và

```
$ git check-ignore -v .codegraph/codegraph.db
.codegraph/.gitignore:4:*    .codegraph/codegraph.db
```

⇒ file DB **đã bị chặn sẵn**. Không có 134 MB nào chờ vào repo.

### Cái còn lại — thật, nhưng là chuyện khác

`.codegraph/` vẫn hiện `??` trong `git status` vì chính `.codegraph/.gitignore` chưa được
theo dõi. Hai hướng, chọn một:

| | việc | đánh đổi |
|---|---|---|
| **A** | commit `.codegraph/.gitignore` | mọi máy cùng được chặn tự động; đổi lại repo mang một file của công cụ mà không phải ai cũng dùng |
| **B** | thêm `.codegraph/` vào `.gitignore` gốc | repo sạch hơn; nhưng máy nào xoá nhầm file `.gitignore` con thì mất lưới chặn — mà lưới đó đang là thứ duy nhất chặn 134 MB |

Nghiêng về **A** vì nó giữ lưới chặn ở nơi không phụ thuộc trí nhớ. Chờ chủ dự án chốt.

---

## Việc 2 — nối CodeGraph vào các agent của repo

**Hiện trạng đo được:** repo **không có** thư mục `.claude/agents/` — chưa có định nghĩa
subagent nào. Con số "7 agent" tôi nêu lần trước là **của cấu hình mẫu CodeGraph**, không phải
của repo này. Nên việc này không phải "nối nốt", nó là **tạo mới** — phạm vi lớn hơn hẳn.

Câu hỏi cần chủ dự án trả lời trước khi ước lượng: có muốn repo này có agent chuyên trách
không, hay giữ nguyên lối vào duy nhất là hook `UserPromptSubmit` đang chạy?

⚠️ Nếu giữ nguyên: nói rõ trong vé rằng **đó là lựa chọn**, đừng để nó thành "chưa làm xong".

---

## Việc 3 — telemetry

CodeGraph có đường gửi số liệu sử dụng. Chưa đo xem mặc định của bản đang cài là **bật hay
tắt** — và chừng nào chưa đo thì **không được viết vào đâu rằng nó đã tắt** (luật 17: chẩn
đoán chưa đo thì đừng viết vào chú thích).

Việc phải làm khi tới lượt, theo thứ tự:
1. **ĐO** trạng thái mặc định thật (đọc cấu hình, không đọc tài liệu của công cụ).
2. Chủ dự án quyết bật/tắt.
3. Chỉ khi quyết TẮT mới sửa — và ghi lại lệnh đã chạy.

⚠️ Ràng buộc còn hiệu lực từ lượt cài: *"không chạy `codegraph uninstall`/`uninit`, không sửa
file nguồn nào của dự án, không commit. Nếu lệnh nào cần quyền sudo hoặc ghi vào config global
thì dừng lại hỏi tôi trước."*

---

## Liên quan

- `docs/luat-doc-so-va-ket-luan.md` — luật 17 (đọc cấu hình THẬT, đừng trích tài liệu), và hệ
  quả "chẩn đoán chưa đo thì đừng viết vào chú thích".
