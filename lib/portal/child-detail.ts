import "server-only";
import { db } from "@/lib/db";
import { getStudentClasses, type StudentClass } from "@/lib/portal/learning";
import { hasMediaConsent } from "@/lib/lms/media-consent";
import type { Gender, RoboticsSkill, SkillLevel } from "@prisma/client";

// Portal v2 — hồ sơ chi tiết 1 con (con đang chọn). Gồm phần chỉ-xem (mã HV/lớp/GV)
// + phần phụ huynh sửa được (ngày sinh/khối/trường/sức khoẻ/dị ứng/ghi chú) + kỹ năng.

export type ChildSkill = { skill: RoboticsSkill; level: SkillLevel };

export type ChildDetail = {
  id: string;
  name: string;
  studentCode: string | null;
  dateOfBirth: string | null;
  gender: Gender | null;
  currentGrade: number | null;
  school: string | null;
  healthNotes: string | null;
  allergies: string[];
  notes: string | null;
  classes: StudentClass[];
  skills: ChildSkill[];
  mediaConsent: boolean;
};

// Trường phụ huynh sửa được (đã validate ở action). Ghi trong lib (được phép db trần).
export type ChildProfileEdit = {
  dateOfBirth: Date | null;
  gender: Gender | null;
  currentGrade: number | null;
  school: string | null;
  healthNotes: string | null;
  allergies: string[];
  notes: string | null;
};

export async function updateChildDetail(studentId: string, d: ChildProfileEdit): Promise<void> {
  await db.student.update({
    where: { id: studentId },
    data: {
      dateOfBirth: d.dateOfBirth,
      gender: d.gender,
      currentGrade: d.currentGrade,
      school: d.school,
      healthNotes: d.healthNotes,
      allergies: d.allergies,
      notes: d.notes,
    },
  });
}

export async function getChildDetail(studentId: string): Promise<ChildDetail | null> {
  const [student, classes, skillRows, mediaConsent] = await Promise.all([
    db.student.findUnique({
      where: { id: studentId },
      select: {
        id: true, name: true, studentCode: true, dateOfBirth: true, gender: true,
        currentGrade: true, school: true, healthNotes: true, allergies: true, notes: true,
      },
    }),
    getStudentClasses(studentId),
    db.studentSkillAssessment.findMany({
      where: { studentId },
      orderBy: { assessedAt: "desc" },
      select: { skill: true, level: true },
    }),
    hasMediaConsent(studentId).catch(() => false),
  ]);
  if (!student) return null;

  // Mức mới nhất mỗi kỹ năng.
  const seen = new Set<string>();
  const skills: ChildSkill[] = [];
  for (const r of skillRows) {
    if (seen.has(r.skill)) continue;
    seen.add(r.skill);
    skills.push({ skill: r.skill, level: r.level });
  }

  return {
    id: student.id,
    name: student.name,
    studentCode: student.studentCode,
    dateOfBirth: student.dateOfBirth?.toISOString() ?? null,
    gender: student.gender,
    currentGrade: student.currentGrade,
    school: student.school,
    healthNotes: student.healthNotes,
    allergies: student.allergies,
    notes: student.notes,
    classes,
    skills,
    mediaConsent,
  };
}
