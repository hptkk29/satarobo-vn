"use client";

// #13 (câu 11) — nút "Chuyển vai trò". CHỈ đổi menu + dashboard mặc định, KHÔNG đổi quyền.
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserCog, Check } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { roleCodeLabel } from "@/lib/labels";
import { setActiveRoleAction } from "@/app/(admin)/admin/_actions/active-role";

export function RoleSwitcher({ roles, activeRole }: { roles: string[]; activeRole: string | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (roles.length <= 1) return null;

  const choose = (role: string) => {
    startTransition(async () => {
      const res = await setActiveRoleAction(role);
      if (!res.ok) {
        toast.error(res.error ?? "Không đổi được vai trò");
        return;
      }
      router.refresh();
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={pending}
        className="flex items-center gap-1.5 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-50 disabled:opacity-50"
      >
        <UserCog className="h-4 w-4 text-neutral-500" />
        <span className="hidden sm:inline">{activeRole ? roleCodeLabel(activeRole) : "Mọi vai trò"}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {/* Group BẮT BUỘC: DropdownMenuLabel = Menu.GroupLabel của base-ui, nó gọi
            useMenuGroupRootContext() và THROW nếu không có <Menu.Group> bọc ngoài.
            Thiếu Group ⇒ mở dropdown là crash cả tab (prod chỉ hiện "This page couldn't
            load" vì lỗi đã minify). Gặp thật khi smoke prod 10/07 trên tài khoản Toại. */}
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-xs font-normal text-neutral-500">
            Chuyển vai trò — chỉ đổi menu hiển thị, không đổi quyền của bạn.
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => choose("")}>
            {activeRole === null ? <Check className="mr-2 h-4 w-4" /> : <span className="mr-6" />}
            Mọi vai trò (gộp)
          </DropdownMenuItem>
          {roles.map((r) => (
            <DropdownMenuItem key={r} onClick={() => choose(r)}>
              {activeRole === r ? <Check className="mr-2 h-4 w-4" /> : <span className="mr-6" />}
              {roleCodeLabel(r)}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
