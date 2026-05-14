import type { Honor, Employee } from "@prisma/client";

// Honor với employee được include (luôn dùng cho public reads sau Phase 4.7)
export type HonorWithEmployee = Honor & {
  employee:
    | Pick<Employee, "id" | "fullName" | "jobTitle" | "avatarUrl" | "joinedAt">
    | null;
};

// Compute số năm gắn bó từ joinedAt (làm tròn xuống).
function computeYears(joinedAt: Date | null | undefined): number | null {
  if (!joinedAt) return null;
  const months =
    (Date.now() - new Date(joinedAt).getTime()) / (1000 * 60 * 60 * 24 * 30);
  if (months < 0) return null;
  return Math.floor(months / 12);
}

// View data normalized — luôn ưu tiên: snapshot (Honor.*AtTime) → Employee → old Honor field.
// Khi drop old fields ở Phase 4.7.1, fallback cuối tự nhiên rơi.
export function getHonorView(honor: HonorWithEmployee) {
  const fullName =
    honor.employee?.fullName ?? honor.fullName ?? "Nhân sự ẩn danh";
  const jobTitle =
    honor.jobTitleAtTime ??
    honor.employee?.jobTitle ??
    honor.jobTitle ??
    "";
  const avatarUrl = honor.employee?.avatarUrl ?? honor.avatarUrl ?? null;
  const years =
    honor.yearsAtTime ??
    computeYears(honor.employee?.joinedAt) ??
    honor.yearsAtCompany ??
    null;

  return { fullName, jobTitle, avatarUrl, years };
}
