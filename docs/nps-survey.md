# Khảo sát / NPS (Cụm B3)

## Model

- `Survey` (title, milestone AFTER_TRIAL/AFTER_3_SESSIONS/MID_COURSE/END_COURSE/AFTER_COMPLAINT/GENERAL, isActive, centerId?).
- `SurveyQuestion` (text, type NPS/RATING/TEXT, order).
- `SurveyResponse` (studentId, parentUserId, centerId/classId/teacherId/csmId, npsScore 0-10, comment, answers).

## NPS (`lib/survey/nps.ts`, có test)

Promoter 9-10 · Passive 7-8 · Detractor 0-6. **NPS = %promoter − %detractor** (−100..100). `computeNps`, `classifyNps`.

## Luồng

- Admin `/khao-sat` (gate `parent-feedback:view`, center scope): tạo khảo sát NPS + bật/tắt; **dashboard NPS**
  tổng + theo cơ sở.
- Phụ huynh `/portal/khao-sat`: trả lời NPS 0-10 + góp ý cho con đang chọn (chống trả lời trùng).
- Response tự gắn **center/class/teacher/csm** (từ enrollment active + care task) → **cơ sở KPI CSKH**.

## Test (ZZTEST_)

1. Admin tạo survey → bật.
2. Phụ huynh /portal/khao-sat trả lời NPS → SurveyResponse gắn đúng center/class/teacher/csm.
3. Dashboard NPS tổng + theo cơ sở hiển thị đúng phân loại.
