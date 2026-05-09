import { z } from "zod";

const roleEnum = z.enum([
  "SUPER_ADMIN",
  "MANAGER",
  "SALES",
  "TEACHER",
  "MARKETING",
  "ACCOUNTANT",
]);

export const userCreateSchema = z.object({
  name: z.string().min(2, "Họ tên tối thiểu 2 ký tự").max(100),
  email: z.string().email("Email không hợp lệ"),
  password: z.string().min(8, "Mật khẩu tối thiểu 8 ký tự"),
  role: roleEnum,
  centerId: z.string().cuid().optional(),
});

export const userUpdateSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  email: z.string().email().optional(),
  role: roleEnum.optional(),
  centerId: z.string().cuid().nullable().optional(),
  isActive: z.boolean().optional(),
});

export type UserCreateInput = z.infer<typeof userCreateSchema>;
export type UserUpdateInput = z.infer<typeof userUpdateSchema>;
