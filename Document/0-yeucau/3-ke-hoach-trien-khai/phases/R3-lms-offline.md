# Phase R3 — LMS offline

> **Mục tiêu:** vận hành đào tạo offline: giáo trình version → lớp/buổi → điểm danh → checklist GV → media tag+consent → bài tập/quiz. **~3 tuần.**
> **Nền:** A0 + R2. Privacy-first (Doc 15 §8.3). **Không build video LMS** (online trỏ Sataworld).
> **Quy trình:** theo `00-quy-trinh-thuc-hien.md`.

---

## 0. Bảng task

| Task ID | Mô tả | Phụ thuộc | Test bắt buộc | Trạng thái |
|---|---|---|---|---|
| R3-01 | Curriculum version + Lesson (lớp gắn 1 version) | A0 | C1.1–C1.3 | TODO |
| R3-02 | Class/ClassSession (plannedLesson/actualLesson) | R3-01 | C2.1–C2.3 | TODO |
| R3-03 | Cảnh báo trùng lịch phòng/GV + sức chứa | R3-02 | C3.1–C3.4 | TODO |
| R3-04 | Attendance (4 trạng thái) + summary là source-of-truth | R3-02 | C4.1–C4.4 | TODO |
| R3-05 | Teacher checklist sau buổi (7 bước → hoàn tất) | R3-04 | C5.1–C5.2 | TODO |
| R3-06 | Media + tag bắt buộc + StudentConsent | R3-02 | C6.1–C6.5 | TODO |
| R3-07 | Học bù (MakeupNeed, không vượt tiến độ) | R3-04 | C7.1–C7.3 | TODO |
| R3-08 | Assignment/Quiz/Submission (6 loại) | R3-02 | C8.1–C8.4 | TODO |

---

## Chi tiết + test case (P/V)

### R3-03 — Cảnh báo trùng lịch (M1)
| ID | T | Case |
|---|---|---|
| C3.1 | V | Trùng phòng (giao giờ + giao ngày) → phát hiện đúng |
| C3.2 | V | Trùng GV → phát hiện đúng |
| C3.3 | P | Tạo lớp trùng phòng → dialog cảnh báo, cho override 2-click (ghi log) |
| C3.4 | P | Ghi danh vượt maxStudents → **chặn cứng** + gợi ý lớp còn chỗ |

### R3-04 — Attendance source-of-truth
AttendanceStatus: PRESENT/LATE/ABSENT_EXCUSED/ABSENT_UNEXCUSED (2-phase migration từ enum cũ).
| ID | T | Case |
|---|---|---|
| C4.1 | P | Điểm danh lưu đúng trạng thái |
| C4.2 | V | attendanceRate = (PRESENT+LATE)/totalSessions COMPLETED |
| C4.3 | V | ABSENT → tạo MakeupNeed |
| C4.4 | P | Sửa điểm danh → ghi AuditLog |

### R3-06 — Media + consent (privacy-first)
| ID | T | Case |
|---|---|---|
| C6.1 | P | Upload media **bắt buộc tag** ≥1 học sinh |
| C6.2 | P | Không tag → không hiển thị cho phụ huynh |
| C6.3 | P | HS chưa GRANTED consent CLASS_MEDIA → không tag được / không public |
| C6.4 | P | PH thu hồi consent → media có tag con ẩn ngay |
| C6.5 | V | Object key R2 không chứa tên học sinh; signed URL hết hạn 15' |

### R3-01/02/05/07/08 (rút gọn)
| ID | T | Case |
|---|---|---|
| C1.1 | V | Lớp gắn 1 curriculum version; đổi giáo trình không ảnh hưởng lớp cũ |
| C1.2 | V | Lesson thuộc đúng curriculum, có order |
| C1.3 | P | scopedDb: curriculum/lesson theo quyền |
| C2.1 | V | Session có plannedLessonId + actualLessonId |
| C2.2 | P | Sinh buổi theo lịch, né Holiday |
| C2.3 | P | GV chỉ thấy lớp mình dạy (scope ASSIGNED) |
| C5.1 | P | Checklist 7 bước: điểm danh→bài dạy→nhận xét→media→bài tập→sự cố→hoàn tất |
| C5.2 | P | Chưa đủ checklist → không "Hoàn tất buổi" |
| C7.1 | V | MakeupNeed PENDING→SCHEDULED→COMPLETED |
| C7.2 | V | Không cho học bù vượt tiến độ (lesson order) |
| C7.3 | P | PH gửi yêu cầu học bù → staff xếp |
| C8.1 | V | 6 loại assignment (IMAGE/VIDEO/FILE/QUIZ/TEXT/PROJECT) |
| C8.2 | P | Giao bài cho cả lớp/nhóm/cá nhân |
| C8.3 | P | Nộp bài (text/file) → LATE nếu quá hạn |
| C8.4 | P | Chấm + rubric → ghi học bạ |

---

## EXIT CRITERIA — Phase R3

```
[ ] 8 task DONE · test:phase + test:e2e:r3 xanh
[ ] Privacy: C6.1–C6.4 PASS (không media nào public sai consent)
[ ] Trùng lịch/sức chứa C3.1–C3.4 PASS
[ ] Đổi giáo trình KHÔNG vỡ lớp đang học (C1.1)
[ ] Attendance là source-of-truth cho học bạ/tiến độ
```
