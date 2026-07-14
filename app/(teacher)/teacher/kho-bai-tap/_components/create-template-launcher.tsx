"use client";

// Nút "Tạo bài tập" (header Kho) + CreateAssignmentDialog controlled. Sau khi lưu →
// router.refresh để danh sách cập nhật. Nút onClick — KHÔNG DialogTrigger (pattern GV).
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CreateAssignmentDialog } from "./create-assignment-dialog";

export function CreateTemplateLauncher() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button className="shrink-0" onClick={() => setOpen(true)}>
        <Plus className="mr-1.5 h-4 w-4" aria-hidden /> Tạo bài tập
      </Button>
      <CreateAssignmentDialog
        open={open}
        onOpenChange={setOpen}
        onCreated={() => router.refresh()}
      />
    </>
  );
}
