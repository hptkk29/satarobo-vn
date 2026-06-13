# R7-01 — LeadChild + trạng thái lead mới + SLA 24h

**ID** R7-01 · **PR** 2 (PR1 schema+service, PR2 UI+SLA) · **Ưu tiên** P1 · **Ước lượng** L · **Phụ thuộc** R7-00; SystemSetting (R6) cho ngưỡng SLA · **Trạng thái** TODO · **US** US-LEAD-1..3 · **SRS** §5, §7

## 1. Mục tiêu & bối cảnh
Lead hiện chỉ chứa 1 con dạng field phẳng (`childName/childAge` — schema:861–862). SRS v3.1 yêu cầu 1 Lead có N con (LeadChild) làm nền cho lớp trải nghiệm; thêm 2 trạng thái lead (Đang học thử, Đã đăng ký = đã có tiền ghi nhận — QĐ-O9); SLA 24h không-hoạt-động cấu hình được.

## 2. Phạm vi
- **In:** model `LeadChild`; form "Thêm con" inline; 2 enum LeadStatus mới + transition guard; rule SLA 24h đọc SystemSetting; `Lead.lastActivityAt` cập nhật theo LeadActivity; regression phễu SR217.
- **Out:** migrate lead cũ (QĐ-O8 — không làm); xếp lớp trải nghiệm (R7-02); form convert (R7-05).

## 3. Thiết kế kỹ thuật
- `LeadChild{id, leadId FK, fullName, dob?, ageYears?, gender?, schoolName?, gradeLevel?, interestedCourseId?, interestedCenterId?, note?, trialStatus enum(NONE/SCHEDULED/IN_PROGRESS/ATTENDED), createdAt/updatedAt}`; index leadId. Lead cũ: field phẳng đọc-only trên UI (2-phase, không drop).
- `LeadStatus` thêm `TRIAL_IN_PROGRESS`, `REGISTERED` (additive). Transition: AWAITING_DECISION→REGISTERED chỉ khi tồn tại ≥1 khoản Sale ghi nhận gắn hồ sơ đăng ký (đọc từ R7-04; trước đó chặn). REGISTERED→ENROLLED do convert (R7-05). Mapping nhãn VI trong registry label hiện có.
- SLA: thêm rule `lead_idle_24h` vào `lib/crm/sla.ts` — điều kiện: status ∈ {NEW, ASSIGNED} và `lastActivityAt` (mới) quá ngưỡng (SystemSetting `sla.leadIdleHours`, default 24); StaffNotification dedupeKey `sla:idle24:{leadId}`.
- Mọi đọc qua `scopedDb`; action `can(actor,'leads:edit')`.

## 4. Acceptance Criteria
- AC1: Tạo/sửa lead thêm được N con inline, không giới hạn; mỗi con đủ field SRS §5.2.
- AC2: Lead cũ hiển thị childName/childAge đọc-only + nút "tạo LeadChild mới" thủ công.
- AC3: 2 trạng thái mới hoạt động đúng transition + ghi LeadAuditLog; transition không hợp lệ bị chặn.
- AC4: Lead NEW im lặng quá ngưỡng setting → highlight + StaffNotification (không lặp); có hoạt động → reset.
- AC5: Báo cáo phễu/hoa hồng SR217 số liệu không đổi với dữ liệu hiện hữu (T12).

## 5. Files dự kiến
`prisma/schema.prisma` (+migration `add_lead_child_and_statuses`) · `lib/crm/lead-children.ts` · `lib/crm/sla.ts` · `lib/leads/status.ts` (transitions+labels) · `app/(admin)/admin/leads/*` (form, detail, actions) · `tests/e2e/r7/lead-child.spec.ts` · Vitest `lib/crm/sla.test.ts`.

## 6. Edge cases & xử lý lỗi
Xóa LeadChild đang gắn lớp trải nghiệm active → chặn (sẽ có FK từ R7-02) · 2 con trùng tên trong 1 lead → cho phép (cảnh báo nhẹ) · DOB tương lai → Zod reject · lead LOST vẫn xem được con (đọc-only).

## 7. Rollback / Feature flag
Additive thuần — rollback = ngừng dùng UI mới; enum mới không gán cho record nào thì không ảnh hưởng. Không cần flag.

## 8. Test plan
| Case ID | Nhóm | B/E | Bước | Kết quả | Tool |
|---|---|---|---|---|---|
| R7-01-C1 | T1 | B | tạo lead + 3 con | 3 LeadChild lưu đúng field | Playwright |
| R7-01-C2 | T1/T7 | B | chuyển AWAITING_DECISION→REGISTERED khi chưa có tiền | bị chặn; có tiền → OK + audit | Playwright |
| R7-01-C3 | T1 | B | set setting 24→12h, seed lead im 13h, chạy SLA | notification sinh 1 lần (dedupe) | Vitest |
| R7-01-C4 | T7 | B | NEW→REGISTERED trực tiếp | reject | Vitest |
| R7-01-C5 | T12 | B | chạy báo cáo funnel SR217 trên seed cũ | số liệu như trước | Playwright |
| R7-01-C6 | T5 | B | Sale@CS1 xem lead CS2 (list/get) | không thấy | Playwright |
| R7-01-C7 | T2/T3 | E | thiếu fullName, DOB tương lai, age=0/19 | Zod reject đúng field | Vitest |

## 9. Test data
Seed: lead cũ kiểu phẳng (1 con) + lead mới 3 con; SystemSetting `sla.leadIdleHours`; user Sale@CS1/CS2.

## 10. RTM
AC1↔C1,C7 · AC2↔C1 · AC3↔C2,C4 · AC4↔C3 · AC5↔C5 · cách ly↔C6.

## 11. DoD
DoD chuẩn + label registry cập nhật + không drop field cũ.
