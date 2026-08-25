// app/(admin)/admin/trial-classes/[id]/page.tsx — GĐ6.
//
// Chuyển hướng GIỮ NGUYÊN id sang màn mới. Thông báo cũ trong DB trỏ thẳng tới
// "/trial-classes/{id}"; đưa về danh sách là bắt người ta tự dò lại đúng lớp.
import { redirect } from "next/navigation";

export default async function TrialClassDetailRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/lop-trial/${id}`);
}
