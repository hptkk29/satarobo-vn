# SataCoin — điểm thưởng nội bộ (Cụm C4)

## Nguyên tắc

- **KHÔNG blockchain.** Đây là điểm thưởng nội bộ lưu trong DB.
- **Sổ cái BẤT BIẾN** (`SataCoinTransaction`): không sửa/xoá giao dịch. Muốn điều chỉnh →
  ghi **giao dịch đảo** (REVERSAL) với `amount` đối dấu + `reversedTxId` trỏ giao dịch gốc.
- **Số dư = SUM(amount)** mọi giao dịch của học viên (không lưu trường balance riêng).

## Model (additive, migration `20260601100000_satacoin`)

- `SataCoinTransaction` (studentId, amount Int, type `SataCoinTxType` EARN/SPEND/ADJUST/REVERSAL,
  reason, note, centerId, ruleCode, reversedTxId @unique, createdById).
- `SataCoinRule` (code @unique, label, amount, isActive, centerId?) — cấu hình quy tắc thưởng.

## Service (`lib/satacoin/service.ts`)

- `getBalance(studentId)` = aggregate sum.
- `recordTransaction(...)` append-only; chặn số dư âm khi trừ.
- `grantByRule(studentId, ruleCode)` cộng theo rule đang bật.
- `reverseTransaction(txId)` tạo REVERSAL; chặn đảo-của-đảo và đảo trùng (reversedTxId unique).

## UI

- Admin `/admin/satacoin` (gate `satacoin:manage` = SUPER_ADMIN/CENTER_MANAGER/TEACHER, center scope):
  cấu hình rule (tạo/bật-tắt), cấp/điều chỉnh coin cho HV, sổ cái + nút **Đảo**. Ghi `logStudentAudit`.
- Portal `/portal/satacoin`: số dư + lịch sử giao dịch của **con đang chọn** (`requireActiveStudent`).

## Test (ZZTEST_)

1. Tạo rule `ATTENDANCE +5`. Cấp 10 coin cho HV `ZZTEST_*` → số dư 10.
2. Trừ 3 coin → số dư 7. Trừ 100 → bị chặn (số dư không đủ).
3. Đảo giao dịch +10 → REVERSAL −10 ghi, số dư giảm; đảo lại lần nữa → bị chặn (đã đảo).
4. Portal hiển thị đúng số dư + lịch sử.
