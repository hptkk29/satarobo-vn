# VÉ — CodeGraph: ba việc chờ chủ dự án quyết

> **Trạng thái:** ĐÃ QUYẾT 15/09/2026. Hai việc đã làm, một việc dừng ở ĐO.
>
> | việc | chủ dự án chốt | tình trạng |
> |---|---|---|
> | `.gitignore` | *"thêm .codegraph vào .gitignore"* | **xong** — hướng B |
> | agent | *"thêm .claude/agents/ đi"* | **xong** — 3 agent, xem cuối vé |
> | telemetry | *"cho đo telemetry"* | **đã đo** — đang BẬT; tắt hay không thì chưa chốt |

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

---

# ĐÃ LÀM — 15/09/2026

## Việc 1 — `.gitignore` (hướng B)

Thêm `.codegraph/` vào `.gitignore` **GỐC**. Chọn B chứ không phải A vì lưới chặn nay nằm ở
nơi **không phụ thuộc vào một file do công cụ khác quản lý** — xoá nhầm `.codegraph/.gitignore`
thì vẫn còn dòng này.

## Việc 2 — ba agent, đều CodeGraph-first

| agent | dùng khi | quyền |
|---|---|---|
| `do-truoc-khi-ket-luan` | cần biết hiện trạng THẬT trước khi thiết kế / kết luận | chỉ đọc |
| `cay-lai-loi` | sau khi vá bug hoặc viết test mới, trước khi báo xong (luật 8) | sửa tạm, trả nguyên, không commit |
| `soi-nhan-va-nguon-so` | trước khi thêm cột số lên site GV / portal, và khi rà một màn (luật 12 + 12b) | chỉ đọc |

Ba agent này **không phải bộ mẫu của CodeGraph**. Chúng là ba nghi thức lặp lại ở repo này,
mỗi cái ứng với một lớp lỗi ĐÃ XẢY RA THẬT và đã ghi vào sổ luật — nên mỗi file mang sẵn
danh sách ca hỏng thật để agent nhận dạng, chứ không chỉ mang lời khuyên chung.

Cả ba mở màn bằng `codegraph_explore` thay vì `grep` — đó chính là vế *"wire CodeGraph vào
agent"* của vé này.

⚠️ CỐ Ý **không** dựng agent "sửa mã" hay "viết test": hai việc đó cần đúng bối cảnh của
phiên chính, tách ra là mất thứ khiến chúng đúng.

## Việc 3 — telemetry: ĐÃ ĐO, CHƯA TẮT

```
$ codegraph telemetry
Telemetry: enabled (your saved choice)
Machine ID: d642005e-...
Config:     ~/.codegraph/telemetry.json
```

**Đang BẬT**, và là *"your saved choice"* — tức có người đã chọn lúc cài, không phải mặc
định câm.

**Chưa tắt**, vì config nằm ở **global** (`~/.codegraph/`) chứ không trong repo, và ràng buộc
chủ dự án đặt từ lượt cài còn hiệu lực: *"lệnh nào cần quyền sudo hoặc ghi vào config global
thì dừng lại hỏi tôi trước"*.

Tắt bằng `codegraph telemetry off`. Nội dung thu thập: `TELEMETRY.md` của dự án CodeGraph.
