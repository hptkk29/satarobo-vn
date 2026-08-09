"use client";

// US-03 — grant của nhóm (ALLOW + DENY, SUPER_ADMIN only qua user-groups:manage).
// Luật P0 (validator chặn cứng, UI chỉ dẫn đường):
//   - dataScope chỉ ALL | OWN (UNIT_* chưa có mapping nhóm→đơn vị tới P1);
//   - fieldMask CHỈ khi DENY (DENY + mask = che trường, DENY không mask = chặn action);
//   - ALLOW ⇒ fieldMask rỗng; reason bắt buộc (RbacAuditLog).
// KHÔNG sửa grant tại chỗ — đổi = xoá (2-click) rồi tạo lại, giữ vết audit trọn vẹn.
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { GROUP_GRANT_DATA_SCOPES } from "@/lib/validators/user-group";
import { createGroupGrantAction, deleteGroupGrantAction } from "../_actions";

type GrantRow = {
  id: string;
  permissionKey: string;
  module: string;
  keyInactive: boolean;
  effect: string;
  dataScope: string;
  fieldMask: string[];
  reason: string;
  createdAt: string;
};

type Descriptor = { key: string; module: string; sensitiveFields: string[] };

const SCOPE_LABEL: Record<string, string> = {
  ALL: "ALL — toàn hệ thống",
  OWN: "OWN — bản ghi của chính mình",
};

export function GroupGrants({
  groupId,
  grants,
  descriptors,
}: {
  groupId: string;
  grants: GrantRow[];
  descriptors: Descriptor[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [permissionKey, setPermissionKey] = useState("");
  const [effect, setEffect] = useState<"ALLOW" | "DENY">("DENY");
  const [dataScope, setDataScope] = useState<"ALL" | "OWN">("ALL");
  const [fieldMaskText, setFieldMaskText] = useState("");
  const [reason, setReason] = useState("");
  // 2-click xoá grant.
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const selectedDescriptor = useMemo(
    () => descriptors.find((d) => d.key === permissionKey) ?? null,
    [descriptors, permissionKey],
  );

  const fieldMask = useMemo(
    () =>
      [...new Set(fieldMaskText.split(",").map((s) => s.trim()).filter(Boolean))],
    [fieldMaskText],
  );

  function toggleSuggestedField(field: string) {
    if (fieldMask.includes(field)) {
      setFieldMaskText(fieldMask.filter((f) => f !== field).join(", "));
    } else {
      setFieldMaskText([...fieldMask, field].join(", "));
    }
  }

  function switchEffect(next: "ALLOW" | "DENY") {
    setEffect(next);
    // ALLOW ⇒ fieldMask rỗng (chặn cứng ở validator — UI dọn trước cho đỡ vấp).
    if (next === "ALLOW") setFieldMaskText("");
  }

  function submit() {
    startTransition(async () => {
      const res = await createGroupGrantAction(groupId, {
        permissionKey,
        effect,
        dataScope,
        fieldMask: effect === "DENY" ? fieldMask : [],
        reason,
      });
      if (res.ok) {
        toast.success("Đã tạo grant — hiệu lực từ request kế tiếp");
        setPermissionKey("");
        setFieldMaskText("");
        setReason("");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  function removeGrant(id: string) {
    if (confirmId !== id) {
      setConfirmId(id);
      return;
    }
    startTransition(async () => {
      const res = await deleteGroupGrantAction(id);
      if (res.ok) {
        toast.success("Đã xoá grant");
        setConfirmId(null);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <section className="rounded-lg border bg-white p-5">
      <h2 className="mb-1 flex items-center gap-2 text-lg font-bold text-neutral-900">
        <ShieldCheck className="h-5 w-5 text-neutral-400" /> Grant của nhóm ({grants.length})
      </h2>
      <p className="mb-4 text-sm text-neutral-500">
        DENY thắng ALLOW của mọi vai trò. DENY <em>không</em> fieldMask = chặn cả action;
        DENY <em>có</em> fieldMask = vẫn cho làm nhưng che các trường liệt kê. Không sửa tại
        chỗ — xoá rồi tạo lại để giữ vết audit.
      </p>

      {/* ── Form tạo grant ── */}
      <div className="mb-6 rounded-lg border bg-neutral-50 p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <Label htmlFor="grant-key">Permission key (registry — key đang hoạt động)</Label>
            {/* Native select — base-ui SelectValue hiện value thô nên không dùng cho key dài. */}
            <select
              id="grant-key"
              value={permissionKey}
              onChange={(e) => setPermissionKey(e.target.value)}
              disabled={pending}
              className="mt-1 h-9 w-full rounded-md border border-neutral-300 bg-white px-2 text-sm focus:border-orange-400 focus:outline-none"
            >
              <option value="">— Chọn quyền —</option>
              {descriptors.map((d) => (
                <option key={d.key} value={d.key}>
                  {d.module} · {d.key}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="grant-effect">Effect</Label>
            <select
              id="grant-effect"
              value={effect}
              onChange={(e) => switchEffect(e.target.value as "ALLOW" | "DENY")}
              disabled={pending}
              className="mt-1 h-9 w-full rounded-md border border-neutral-300 bg-white px-2 text-sm focus:border-orange-400 focus:outline-none"
            >
              <option value="DENY">DENY — chặn / che trường</option>
              <option value="ALLOW">ALLOW — cấp thêm quyền</option>
            </select>
          </div>
          <div>
            <Label htmlFor="grant-scope">Phạm vi dữ liệu (P0: ALL | OWN)</Label>
            <select
              id="grant-scope"
              value={dataScope}
              onChange={(e) => setDataScope(e.target.value as "ALL" | "OWN")}
              disabled={pending}
              className="mt-1 h-9 w-full rounded-md border border-neutral-300 bg-white px-2 text-sm focus:border-orange-400 focus:outline-none"
            >
              {GROUP_GRANT_DATA_SCOPES.map((s) => (
                <option key={s} value={s}>
                  {SCOPE_LABEL[s] ?? s}
                </option>
              ))}
            </select>
          </div>

          {effect === "DENY" && (
            <div className="sm:col-span-2">
              <Label htmlFor="grant-fieldmask">
                fieldMask — để trống = chặn toàn action; điền = chỉ che trường
              </Label>
              <Input
                id="grant-fieldmask"
                value={fieldMaskText}
                onChange={(e) => setFieldMaskText(e.target.value)}
                placeholder="parentPhone, parentEmail (phân cách bằng dấu phẩy)"
                disabled={pending}
                className="mt-1"
              />
              {selectedDescriptor && selectedDescriptor.sensitiveFields.length > 0 && (
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-neutral-500">
                  <span>Trường nhạy cảm của quyền này:</span>
                  {selectedDescriptor.sensitiveFields.map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => toggleSuggestedField(f)}
                      className={
                        fieldMask.includes(f)
                          ? "rounded-full bg-orange-500 px-2 py-0.5 font-mono text-white"
                          : "rounded-full border border-neutral-300 bg-white px-2 py-0.5 font-mono hover:border-orange-400"
                      }
                    >
                      {f}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="sm:col-span-3">
            <Label htmlFor="grant-reason">Lý do (bắt buộc — ghi RbacAuditLog)</Label>
            <Textarea
              id="grant-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Vd: che SĐT phụ huynh cho nhóm CSKH thời vụ hè 2026"
              rows={2}
              maxLength={500}
              disabled={pending}
              className="mt-1"
            />
          </div>
        </div>
        <div className="mt-3">
          <Button
            onClick={submit}
            disabled={pending || !permissionKey || reason.trim().length < 5}
          >
            {pending ? "Đang lưu..." : "Tạo grant"}
          </Button>
        </div>
      </div>

      {/* ── Bảng grant hiện có ── */}
      {grants.length === 0 ? (
        <p className="text-sm text-neutral-400">Nhóm chưa có grant nào.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quyền</TableHead>
                <TableHead>Effect</TableHead>
                <TableHead>Phạm vi</TableHead>
                <TableHead>fieldMask</TableHead>
                <TableHead>Lý do</TableHead>
                <TableHead>Tạo lúc</TableHead>
                <TableHead className="text-right">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {grants.map((g) => (
                <TableRow key={g.id}>
                  <TableCell>
                    <span className="font-mono text-sm font-semibold">{g.permissionKey}</span>
                    <span className="ml-1.5 text-xs text-neutral-400">{g.module}</span>
                    {g.keyInactive && (
                      <Badge variant="outline" className="ml-1.5 text-amber-600">
                        key đã tắt
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {g.effect === "DENY" ? (
                      <Badge variant="destructive">DENY</Badge>
                    ) : (
                      <Badge>ALLOW</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{g.dataScope}</TableCell>
                  <TableCell className="max-w-48 text-sm">
                    {g.fieldMask.length > 0 ? (
                      <span className="font-mono text-xs">{g.fieldMask.join(", ")}</span>
                    ) : g.effect === "DENY" ? (
                      <span className="text-xs text-neutral-400">— chặn toàn action —</span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="max-w-56 truncate text-sm text-neutral-500" title={g.reason}>
                    {g.reason || "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-neutral-400">
                    {g.createdAt}
                  </TableCell>
                  <TableCell className="text-right">
                    <button
                      onClick={() => removeGrant(g.id)}
                      disabled={pending}
                      className={
                        confirmId === g.id
                          ? "inline-flex items-center gap-1 rounded-md bg-rose-600 px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50"
                          : "inline-flex items-center gap-1 text-xs text-rose-600 hover:underline disabled:opacity-50"
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {confirmId === g.id ? "Bấm lần nữa để xoá" : "Xoá"}
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
