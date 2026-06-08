# Phase R1 — CRM Messenger + Marketing + Commission (SR.QD.217)

> **Mục tiêu:** số hóa toàn bộ phễu tuyển sinh SR217: Messenger → L1→L2→L3 + SLA + hoa hồng 4 tầng + CPL/CPA + dashboard. **~5 tuần.**
> **Nền:** chạy TRÊN A0 (scopedDb, can() v2, DomainEvent, AuditLog đã có).
> **Chặn:** Meta App Review + page token (OI-22) cho realtime; 3 file Excel hoa hồng (OI-23) cho R1.7/R1.8. Webhook replay UI (OI-20) bắt buộc trước khi Messenger live.
> **Quy trình:** theo `00-quy-trinh-thuc-hien.md`.

---

## 0. Bảng task tổng

| Task ID | Mô tả | Phụ thuộc | Test bắt buộc | Trạng thái |
|---|---|---|---|---|
| R1-01 | FacebookPageMapping + MessengerConversation/Message | A0 | C1.1–C1.4 | ✅ DONE (2026-06-08) — models+service+5 e2e PASS local; MessengerConversation ∈ scopedDb |
| R1-02 | Webhook `/api/webhooks/meta/messenger` (verify sig, idempotent) | R1-01 | C2.1–C2.5 | TODO |
| R1-03 | Inbox CRM `/admin/crm/messenger` | R1-02 | C3.1–C3.3 | TODO |
| R1-04 | L1→L2 conversion + timestamps phễu trên Lead | R1-03 | C4.1–C4.4 | TODO |
| R1-05 | Handover HO→CS1/CS2 + xác nhận tiếp nhận | R1-04 | C5.1–C5.4 | TODO |
| R1-06 | SLA engine (cron 15' + alert) | R1-05 | C6.1–C6.6 | TODO |
| R1-07 | Ads Insights sync (Meta API) + AdsInsightDaily | A0 | C7.1–C7.3 | TODO |
| R1-08 | Marketing dashboard (funnel + CPL/CPA/ROAS) | R1-04,07 | C8.1–C8.4 | TODO |
| R1-09 | Cost allocation (CPL/CPA/CP_TT, DRAFT→CONFIRMED→REOPENED) | R1-07 | C9.1–C9.5 | TODO |
| R1-10 | Commission engine 4 tầng + duyệt + export | R1-04 | C10.1–C10.7 | TODO |
| R1-11 | WebhookDelivery log + UI replay (OI-20) | R1-02 | C11.1–C11.3 | TODO |
| R1-12 | Export Excel 3 biểu mẫu + báo cáo tuần/tháng | R1-08,09,10 | C12.1–C12.3 | TODO |

---

## Chi tiết task + test case bắt buộc (Playwright `P` / Vitest `V`)

### R1-01 — Messenger models
Model `FacebookPageMapping(pageId, scopeType HO|CENTER, centerId?)`, `MessengerConversation(pageId, psid, parentName?, phone?, status, firstMessageAt, respondedAt, leadId?)`, `MessengerMessage(conversationId, direction, text, attachments, sentAt)`.
| ID | T | Case |
|---|---|---|
| C1.1 | V | Map Page HO → scopeType=HO; Page CS1 → CENTER+centerId |
| C1.2 | V | Tạo conversation + message, đọc lại đúng thứ tự thời gian |
| C1.3 | V | `firstMessageAt` set khi message IN đầu; `respondedAt` set khi OUT đầu |
| C1.4 | P | scopedDb: conversation Page CS1 không lọt sang user CS2 |

### R1-02 — Webhook Messenger
| ID | T | Case |
|---|---|---|
| C2.1 | P | GET verify challenge (hub.verify_token) trả đúng |
| C2.2 | P | POST chữ ký sai → 401, không tạo dữ liệu |
| C2.3 | P | POST hợp lệ → tạo MessengerConversation + L1 |
| C2.4 | P | Gửi lại cùng `externalEventId` → **không tạo trùng** (idempotent) |
| C2.5 | P | Luôn trả 200 cho payload hợp lệ (Meta không retry bão) |

### R1-03 — Inbox CRM
| ID | T | Case |
|---|---|---|
| C3.1 | P | HO_SALE thấy inbox, mở hội thoại, gửi reply (ghi message OUT) |
| C3.2 | P | Quick-reply kịch bản xin SĐT hoạt động |
| C3.3 | P | Role không có quyền CRM → không vào được inbox |

### R1-04 — L1→L2 + timestamps
Lead thêm: `qualifiedAt, handedAt, receivedConfirmedAt, assignedAt, firstContactAt, commissionSource, adminId`.
| ID | T | Case |
|---|---|---|
| C4.1 | P | Có SĐT + note → tạo Lead, set `qualifiedAt`, nối conversation.leadId |
| C4.2 | V | Thiếu SĐT → không đạt L2 |
| C4.3 | P | Dedup phone 90 ngày → không tạo lead trùng |
| C4.4 | V | `commissionSource` set đúng (MARKETING_ADMIN/SALE_SELF/REFERRAL) |

### R1-05 — Handover
| ID | T | Case |
|---|---|---|
| C5.1 | P | HO_SALE bàn giao lead về CS1 → set `handedAt` |
| C5.2 | P | CENTER_MANAGER@CS1 bấm "Tiếp nhận" → `receivedConfirmedAt` |
| C5.3 | P | Phân Sale → `assignedAt`; activity đầu → `firstContactAt` |
| C5.4 | P | CENTER_MANAGER@CS2 KHÔNG thấy lead bàn giao cho CS1 |

### R1-06 — SLA engine (Doc 15 §5.4 — 7 rule)
| ID | T | Case |
|---|---|---|
| C6.1 | V | SLA-0 chưa respond > **5'** → vi phạm |
| C6.2 | V | SLA-1 chưa bàn giao > 4h → vi phạm |
| C6.3 | V | SLA-2 chưa phân công > 30' → vi phạm |
| C6.4 | V | SLA-3 chưa liên hệ > 3h → vi phạm |
| C6.5 | V | SLA-4 lead im > 2 ngày → vi phạm; đã xử lý → không alert |
| C6.6 | P | Cron sinh StaffNotification (dedupeKey) + alert đúng người |

### R1-07 — Ads Insights sync
| ID | T | Case |
|---|---|---|
| C7.1 | V | Sync ghi AdsInsightDaily (spend/impressions/clicks) theo ngày/kênh, unique (date,channel) |
| C7.2 | V | Nhập tay đè kênh chưa có API |
| C7.3 | P | Chỉ HO_MARKETING/SUPER_ADMIN sửa được số liệu ads |

### R1-08 — Marketing dashboard
| ID | T | Case |
|---|---|---|
| C8.1 | P | Funnel L1→L2→L3 hiển thị đúng số seed |
| C8.2 | V | CPL = spend/L2; CPA = spend/L3; ROAS = revenue/spend |
| C8.3 | P | QL TT chỉ thấy TT mình; SUPER_ADMIN thấy tất cả (drill HO/CS1/CS2) |
| C8.4 | V | CR L1→L2, L2→L3 tính đúng |

### R1-09 — Cost allocation
| ID | T | Case |
|---|---|---|
| C9.1 | V | CP_TT = CPL × L2 của TT |
| C9.2 | V | Chia 0 khi L2=0 → xử lý an toàn, không crash |
| C9.3 | P | Kế toán HO nhập đè totalQcCost khi DRAFT |
| C9.4 | P | CONFIRMED → khóa; chỉ SUPER_ADMIN/HO_ACCOUNTANT REOPEN |
| C9.5 | P | Ngày 05 chưa CONFIRMED → alert |

### R1-10 — Commission engine ⚠️ (tiền — coverage cao)
| ID | T | Case |
|---|---|---|
| C10.1 | V | 4 tầng đúng %: QC 1% · Sale Admin 1% · Sale 4% · QL TT 2% |
| C10.2 | V | Σ rate config > 8% → từ chối lưu |
| C10.3 | V | Loại tái tục khỏi 4 tầng (theo OI-26/B2) |
| C10.4 | V | Refund → clawback dòng âm kỳ sau (B4) |
| C10.5 | V | Đổi sale giữa chừng → người chốt cuối hưởng tầng Sale (B5) |
| C10.6 | P | DRAFT→APPROVED khóa; mở lại cần SUPER_ADMIN + audit |
| C10.7 | P | "Hoa hồng của tôi" — staff chỉ thấy của mình |

### R1-11 — Webhook replay
| ID | T | Case |
|---|---|---|
| C11.1 | V | WebhookDelivery lưu mọi payload (kể cả FAILED) |
| C11.2 | P | UI replay 1 event FAILED → xử lý lại, không tạo trùng |
| C11.3 | P | Trùng externalEventId khi replay → an toàn |

### R1-12 — Export + báo cáo
| ID | T | Case |
|---|---|---|
| C12.1 | P | Export Excel khớp 3 biểu mẫu QC/Admin/TT |
| C12.2 | P | QL TT nộp báo cáo tuần/tháng (snapshot) |
| C12.3 | P | Trễ hạn → alert TGĐ/SUPER_ADMIN |

---

## EXIT CRITERIA — Phase R1

```
[ ] 12 task DONE · pnpm test:phase + test:e2e:r1 xanh
[ ] Mọi case C1.1..C12.3 có trong code (đối chiếu traceability)
[ ] Webhook replay UI (R1-11) hoàn tất TRƯỚC khi bật Messenger production
[ ] CHẠY SONG SONG 1 THÁNG với 3 file Excel — số liệu funnel/CPL/CPA khớp 100%
[ ] Kế toán xác nhận bảng hoa hồng tháng đầu khớp từng người (chênh 0đ)
[ ] Mọi APPROVE/CONFIRM/REOPEN có AuditLog
```
