import { z } from "zod";
import { Role } from "@prisma/client";

export const userCreateSchema = z.object({
  name: z.string().min(1, "Tên không được rỗng").max(100),
  email: z.string().email("Email không hợp lệ").toLowerCase().trim(),
  password: z
    .string()
    .min(8, "Mật khẩu tối thiểu 8 ký tự")
    .max(72, "Mật khẩu tối đa 72 ký tự"),
  role: z.nativeEnum(Role),
  centerId: z.string().cuid().nullable().optional(),
  employeeId: z.string().cuid().nullable().optional(),
});

export const userUpdateSchema = userCreateSchema.omit({ password: true });

export const passwordResetSchema = z
  .object({
    newPassword: z.string().min(8, "Mật khẩu tối thiểu 8 ký tự").max(72),
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Mật khẩu xác nhận không khớp",
    path: ["confirmPassword"],
  });

export type UserCreateInput = z.infer<typeof userCreateSchema>;
export type UserUpdateInput = z.infer<typeof userUpdateSchema>;
