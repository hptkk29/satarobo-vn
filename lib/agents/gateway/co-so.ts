// lib/agents/gateway/co-so.ts — hai tiện ích nhỏ dùng chung giữa cổng và tầng quản trị.
//
// Tách khỏi `pipeline.ts` có chủ đích: pipeline kéo theo `tu-khoa → notifications/notify →
// server-only`, nên tầng quản trị import nó thì không script nào chạy ngoài Next dùng được
// tầng quản trị (vấp khi dựng dữ liệu smoke 25/09).
import type { AgentEnvironment } from "@prisma/client";
import type { MoiTruongCong } from "../khoa";
import { khoCong } from "../kho";

export function moiTruongDb(mt: MoiTruongCong): AgentEnvironment {
  return mt === "live" ? "LIVE" : "TEST";
}

/** Mã mọi đơn vị HO + CENTER còn hoạt động — để nở "HO" thành toàn hệ thống. */
export async function tatCaMaCoSo(): Promise<string[]> {
  const rows = await khoCong.orgUnit.findMany({
    where: { deletedAt: null, isActive: true, type: { in: ["HO", "CENTER"] } },
    select: { code: true },
  });
  return rows.map((r) => r.code);
}
