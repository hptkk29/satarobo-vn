"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { saveGlobalSettingAction } from "../actions";

export type SettingRowView = {
  key: string;
  label: string;
  group: string;
  centerOverridable: boolean;
  value: unknown;
  /** Setting kiểu bật/tắt → hiện CÔNG TẮC thay vì ô JSON (chốt 07/08). */
  isBoolean?: boolean;
};

const GROUP_LABEL: Record<string, string> = {
  student: "Học viên",
  risk: "Rủi ro / chăm sóc",
  class: "Lớp học",
  shift: "Ca làm việc",
  contact: "Liên hệ hiển thị",
  finance: "Tài chính",
  enrollment: "Ghi danh / bảo lưu",
};

function toText(v: unknown): string {
  return typeof v === "string" ? v : JSON.stringify(v, null, 2);
}

function SettingRow({ row, canEdit }: { row: SettingRowView; canEdit: boolean }) {
  const [text, setText] = useState(() => toText(row.value));
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();

  const save = () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      toast.error("Giá trị không phải JSON hợp lệ");
      return;
    }
    if (!reason.trim()) {
      toast.error("Vui lòng nhập lý do thay đổi");
      return;
    }
    start(async () => {
      const res = await saveGlobalSettingAction({ key: row.key, value: parsed, reason });
      if (res.ok) {
        toast.success(`Đã lưu ${row.label}`);
        setReason("");
      } else {
        toast.error(res.error.message);
      }
    });
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-gray-900">{row.label}</p>
          <code className="text-xs text-gray-400">{row.key}</code>
          {row.centerOverridable && (
            <span className="ml-2 rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-600">
              cho phép override theo cơ sở
            </span>
          )}
        </div>
      </div>
      {row.isBoolean ? (
        // Công tắc: bấm ĐỔI NGAY trạng thái hiển thị (kèm nhãn "chưa lưu"), nhưng vẫn
        // phải nhập lý do rồi bấm Lưu mới ghi — giữ luật "mọi thay đổi có lý do + audit",
        // không biến công tắc thành đường ghi tắt bỏ qua nhật ký.
        <div className="mt-2 flex items-center gap-3">
          <Switch
            checked={text === "true"}
            onCheckedChange={(v) => setText(v ? "true" : "false")}
            disabled={!canEdit || pending}
            aria-label={row.label}
          />
          <span
            className={`text-sm font-medium ${
              text === "true" ? "text-emerald-700" : "text-neutral-500"
            }`}
          >
            {text === "true" ? "Đang BẬT" : "Đang TẮT"}
          </span>
          {text !== toText(row.value) && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
              chưa lưu
            </span>
          )}
        </div>
      ) : (
        <Textarea
          className="mt-2 font-mono text-xs"
          rows={text.includes("\n") ? 6 : 1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={!canEdit || pending}
        />
      )}
      {canEdit && (
        <div className="mt-2 flex items-center gap-2">
          <Input
            placeholder="Lý do thay đổi (bắt buộc)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={pending}
          />
          <Button onClick={save} disabled={pending} size="sm">
            {pending ? "Đang lưu…" : "Lưu"}
          </Button>
        </div>
      )}
    </div>
  );
}

export function SettingsEditor({ rows, canEdit }: { rows: SettingRowView[]; canEdit: boolean }) {
  const groups = Array.from(new Set(rows.map((r) => r.group)));
  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <section key={g}>
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-gray-500">
            {GROUP_LABEL[g] ?? g}
          </h2>
          <div className="space-y-3">
            {rows
              .filter((r) => r.group === g)
              .map((r) => (
                <SettingRow key={r.key} row={r} canEdit={canEdit} />
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}
