"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Building2, Info, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { assignUserOrgRoleAction, revokeUserOrgRoleAction } from "../actions";
import { roleCodeLabel } from "@/lib/labels";
import { PhanTrangBang } from "@/components/ui/phan-trang-bang";

/** Đơn vị. `laHoRoot` do server suy ra bằng `isHoRootOrgType` — client không tự đoán. */
type OrgOpt = { id: string; code: string; name: string; laHoRoot: boolean };
/**
 * Vai. `capQuyen` (R1) + `chanTaiHoRoot` (A-01-3) cũng do server suy ra bằng đúng hàm mà
 * `assertAssignGuards` dùng. Hai cờ này CHỈ để giải thích/khoá nút — chúng đi qua mạng nên
 * không được coi là rào; rào thật nằm ở `lib/auth/rbac-service.ts`.
 */
type RoleOpt = { id: string; code: string; name: string; capQuyen: boolean; chanTaiHoRoot: boolean };

/** Lý do BẮT BUỘC ≥3 ký tự — khớp Zod `lib/validators/role.ts:16`. */
const REASON_MIN = 3;

// BGĐ 31/07 — Việt hoá trạng thái phân quyền (enum AssignStatus).
const ASSIGN_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Hiệu lực",
  SUSPENDED: "Tạm ngưng",
  EXPIRED: "Hết hạn",
};
type Assignment = {
  orgUnitId: string;
  roleId: string;
  orgCode: string;
  roleCode: string;
  status: string;
  effectiveFrom: string;
  effectiveTo: string | null;
};

export function OrgRolesManager({
  userId,
  viewerUserId,
  viewerIsSuperAdmin,
  soCoSoDangGiu,
  targetIsHoLevel,
  roles,
  orgUnits,
  assignments,
}: {
  userId: string;
  viewerUserId: string;
  viewerIsSuperAdmin: boolean;
  soCoSoDangGiu: number;
  targetIsHoLevel: boolean;
  roles: RoleOpt[];
  orgUnits: OrgOpt[];
  assignments: Assignment[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [orgUnitId, setOrgUnitId] = useState(orgUnits[0]?.id ?? "");
  const [roleId, setRoleId] = useState(roles[0]?.id ?? "");
  const [reason, setReason] = useState("");
  const [revokeTarget, setRevokeTarget] = useState<Assignment | null>(null);
  const [revokeReason, setRevokeReason] = useState("");

  const org = orgUnits.find((o) => o.id === orgUnitId);
  const role = roles.find((r) => r.id === roleId);

  // A-01-3 — cặp (vai bị cấm ở HO/ROOT) × (đơn vị là HO/ROOT).
  const viPhamHoRoot = Boolean(role?.chanTaiHoRoot && org?.laHoRoot);
  // R1 — vai mang quyền cấp quyền, actor không phải SUPER_ADMIN.
  const viPhamR1 = Boolean(role?.capQuyen && !viewerIsSuperAdmin);
  // R2 — tự gán cho chính mình.
  const viPhamR2 = userId === viewerUserId && !viewerIsSuperAdmin;
  const thieuLyDo = reason.trim().length < REASON_MIN;
  const chanGan = pending || !orgUnitId || !roleId || thieuLyDo || viPhamHoRoot || viPhamR1 || viPhamR2;

  function assign() {
    startTransition(async () => {
      const res = await assignUserOrgRoleAction({ userId, orgUnitId, roleId, reason });
      if (res.ok) {
        toast.success("Đã gán vai trò");
        setReason("");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  function revoke() {
    const a = revokeTarget;
    if (!a) return;
    startTransition(async () => {
      const res = await revokeUserOrgRoleAction({
        userId,
        orgUnitId: a.orgUnitId,
        roleId: a.roleId,
        reason: revokeReason,
      });
      if (res.ok) {
        toast.success("Đã thu hồi");
        setRevokeTarget(null);
        setRevokeReason("");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* A-01-4 — người này đang giữ mấy cơ sở (suy ra từ chính resolveActor, không đếm tay). */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-4">
        <Building2 className="h-5 w-5 text-primary" />
        <span className="text-sm font-semibold text-foreground">
          Đang giữ {soCoSoDangGiu} cơ sở
        </span>
        <span className="text-sm text-muted-foreground">
          (tầm nhìn dữ liệu suy ra từ các vai bên dưới)
        </span>
        {targetIsHoLevel && (
          <Badge variant="outline" className="border-destructive text-destructive">
            Cấp Hội sở — thấy MỌI cơ sở
          </Badge>
        )}
      </div>

      {/* A-01-7 — quyền mới chỉ vào phiên sau khi đăng nhập lại. */}
      <Alert>
        <Info />
        <AlertTitle>Thay đổi vai chưa có hiệu lực ngay với người đang đăng nhập</AlertTitle>
        <AlertDescription>
          Cơ sở gắn với phiên đăng nhập là ảnh chụp lúc người đó đăng nhập. Sau khi gán hoặc
          thu hồi, hãy báo họ <strong>đăng xuất rồi đăng nhập lại</strong>, nếu không họ sẽ
          không thấy cơ sở mới và tưởng là hệ thống hỏng.
        </AlertDescription>
      </Alert>

      <div className="rounded-lg border bg-muted p-4">
        <h2 className="mb-3 text-sm font-semibold text-foreground">Gán vai trò</h2>
        <div className="grid gap-3 sm:grid-cols-4">
          <div>
            <Label htmlFor="org">Đơn vị</Label>
            <select
              id="org"
              value={orgUnitId}
              onChange={(e) => setOrgUnitId(e.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {orgUnits.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.code} — {o.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="role">Vai trò</Label>
            <select
              id="role"
              value={roleId}
              onChange={(e) => setRoleId(e.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name || roleCodeLabel(r.code)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="assign-reason">Lý do</Label>
            <Input
              id="assign-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Vì sao gán"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Bắt buộc, tối thiểu {REASON_MIN} ký tự — ghi vào nhật ký phân quyền.
            </p>
          </div>
          <div className="flex items-start pt-6">
            <Button onClick={assign} disabled={chanGan} className="w-full">
              {pending ? "Đang lưu..." : "Gán"}
            </Button>
          </div>
        </div>

        {viPhamHoRoot && (
          <Alert variant="destructive" className="mt-3">
            <ShieldAlert />
            <AlertTitle>Không neo được vai này tại đơn vị cấp Hội sở / gốc</AlertTitle>
            <AlertDescription>
              Chỉ cần MỘT dòng vai ở HO/ROOT là tài khoản trở thành cấp Hội sở và thấy dữ liệu
              của <strong>mọi</strong> cơ sở — đúng thứ cần tránh khi lập một quản lý cơ sở.
              Hãy neo vai này tại từng đơn vị cấp CENTER; nếu các cơ sở cùng một vùng thì neo
              một dòng ở REGION.
            </AlertDescription>
          </Alert>
        )}

        {viPhamR1 && (
          <Alert variant="destructive" className="mt-3">
            <ShieldAlert />
            <AlertTitle>Vai này mang quyền cấp quyền</AlertTitle>
            <AlertDescription>
              Vai được chọn có <code>roles:*</code> hoặc <code>users:manage</code>. Chỉ
              SUPER_ADMIN mới gán được, để quyền cấp quyền không tự nhân bản.
            </AlertDescription>
          </Alert>
        )}

        {viPhamR2 && (
          <Alert variant="destructive" className="mt-3">
            <ShieldAlert />
            <AlertTitle>Không tự gán vai cho chính mình</AlertTitle>
            <AlertDescription>
              Đây là hồ sơ của chính bạn. Hãy nhờ SUPER_ADMIN gán giúp — việc nhạy cảm cần
              hai người.
            </AlertDescription>
          </Alert>
        )}
      </div>

      <div className="rounded-lg border">
        <PhanTrangBang>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Đơn vị</TableHead>
                <TableHead>Vai trò</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead>Hiệu lực</TableHead>
                <TableHead className="text-right">Hành động</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assignments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                    Chưa có phân quyền nào.
                  </TableCell>
                </TableRow>
              ) : (
                assignments.map((a) => (
                  <TableRow key={`${a.orgUnitId}:${a.roleId}`}>
                    <TableCell>
                      {orgUnits.find((o) => o.id === a.orgUnitId)?.name ?? a.orgCode}
                    </TableCell>
                    <TableCell>
                      {roles.find((r) => r.id === a.roleId)?.name ?? roleCodeLabel(a.roleCode)}
                    </TableCell>
                    <TableCell>
                      {a.status === "ACTIVE" ? (
                        <Badge>Hiệu lực</Badge>
                      ) : (
                        <Badge variant="outline">{ASSIGN_STATUS_LABELS[a.status] ?? a.status}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {a.effectiveFrom.slice(0, 10)}
                      {a.effectiveTo ? ` → ${a.effectiveTo.slice(0, 10)}` : ""}
                    </TableCell>
                    <TableCell className="text-right">
                      {a.status === "ACTIVE" && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={pending}
                          onClick={() => {
                            setRevokeTarget(a);
                            setRevokeReason("");
                          }}
                        >
                          Thu hồi
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </PhanTrangBang>
      </div>

      {/* R3 trên đường THU HỒI — trước đây chỗ này gửi chuỗi cứng "Thu hồi qua UI", nên mọi
          lần thu hồi để lại cùng một dòng nhật ký vô nghĩa: rào có mà bằng chứng thì không. */}
      <Dialog
        open={revokeTarget !== null}
        onOpenChange={(o) => {
          if (!o) setRevokeTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Thu hồi vai trò</DialogTitle>
            <DialogDescription>
              {revokeTarget
                ? `${roles.find((r) => r.id === revokeTarget.roleId)?.name ?? roleCodeLabel(revokeTarget.roleCode)} tại ${
                    orgUnits.find((o) => o.id === revokeTarget.orgUnitId)?.name ??
                    revokeTarget.orgCode
                  }`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor="revoke-reason">Lý do thu hồi</Label>
            <Input
              id="revoke-reason"
              value={revokeReason}
              onChange={(e) => setRevokeReason(e.target.value)}
              placeholder="Vd: nghỉ việc từ 01/09, chuyển cơ sở..."
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Bắt buộc, tối thiểu {REASON_MIN} ký tự — ghi vào nhật ký phân quyền.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevokeTarget(null)} disabled={pending}>
              Huỷ
            </Button>
            <Button
              variant="destructive"
              onClick={revoke}
              disabled={pending || revokeReason.trim().length < REASON_MIN}
            >
              {pending ? "Đang thu hồi..." : "Thu hồi"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
