/**
 * scripts/bao-cao-lead-trung-sdt.ts — ĐỌC PROD, KHÔNG GHI GÌ.
 *
 * Trả lời: "trên prod còn bao nhiêu SĐT đang nằm ở TỪ HAI LEAD trở lên, và cặp nào đã dính
 * đơn hàng?" — sau sự cố 26/09/2026 (0368829724 · 0985779965: cùng một gia đình, hai hồ sơ,
 * có cặp còn hai đơn). Bản vá cùng đợt (`lib/lead/dedup.ts` + `lib/lead/intake/ingest.ts`)
 * chặn cặp MỚI; báo cáo này tìm những cặp ĐÃ sinh ra trước đó để gộp TAY từng cặp.
 *
 * ⚠️ KHÔNG gộp tự động: một cặp có thể dính đơn, tiền, lớp học thử ở cả hai phía — mỗi cặp
 * cần người xem. Báo cáo chỉ xếp hạng: cặp có ĐƠN ở CẢ HAI lead lên đầu (nguy cơ đòi tiền
 * trùng), rồi tới cặp có đơn ở một phía, rồi phần còn lại.
 *
 * ── BỐN LỚP KHOÁ (cùng khuôn `bao-cao-rbac-prod.ts`) ────────────────────────────────
 * 1. KHÔNG CÓ CHẾ ĐỘ GHI — tệp này không chứa lời gọi ghi nào. Ca `[LTS-CD-01]` quét tệp.
 * 2. `SET TRANSACTION READ ONLY` + ROLLBACK canh sẵn.
 * 3. Chạy bằng USER CHỈ-ĐỌC (`PROD_DATABASE_URL_RO`).
 * 4. Script TỰ KHAI ai đang kết nối, và hỏi thẳng quyền SELECT trên đúng bảng nó đọc
 *    (`kiemQuyen` dùng chung hỏi `ClassSession` — không phải bảng ta đọc).
 *
 * ── CHE DỮ LIỆU CÁ NHÂN ─────────────────────────────────────────────────────────────
 * Báo cáo rời khỏi DB (job summary + artifact) ⇒ KHÔNG in họ tên; SĐT che còn 4 số đầu +
 * 3 số cuối (`cheSdt`). Mã lead (cuid) không phải dữ liệu cá nhân — nó là thứ người gộp
 * cần để mở `admin.satarobo.vn/leads/<id>`.
 */
import { writeFileSync } from "node:fs";
import { scriptDb } from "./_script-db";
import { kiemQuyen } from "./_kiem-quyen";

const db = scriptDb();
const TEP_RA = "bao-cao-lead-trung-sdt.md";

const ra: string[] = [];
const in_ = (s = ""): void => {
  ra.push(s);
  console.log(s);
};

/** `84368829724` → `0368…724`. Đủ để đối chiếu với màn hình, không đủ để thành danh bạ. */
function cheSdt(p: string): string {
  const so = p.replace(/\D/g, "");
  const noiDia = so.startsWith("84") ? `0${so.slice(2)}` : so;
  if (noiDia.length < 8) return "(số lạ)";
  return `${noiDia.slice(0, 4)}…${noiDia.slice(-3)}`;
}

/** Khoá gộp: 9 số cuối — gom được cả `0…`, `84…`, `+84…` của cùng một số. */
function khoaSdt(p: string): string | null {
  const so = p.replace(/\D/g, "");
  return so.length >= 9 ? so.slice(-9) : null;
}

const BANG_CAN_DOC = ["Lead", "Order", "LeadChild"] as const;

async function kiemBangDocDuoc(): Promise<string[]> {
  const thieu: string[] = [];
  for (const b of BANG_CAN_DOC) {
    try {
      const ten = `public."${b}"`;
      const r = await db.$queryRaw<{ doc: boolean | null }[]>`
        SELECT has_table_privilege(current_user, ${ten}, 'SELECT') AS doc
      `;
      if (r[0]?.doc !== true) thieu.push(b);
    } catch {
      thieu.push(b);
    }
  }
  return thieu;
}

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

type DongLead = {
  id: string;
  phone: string;
  status: string;
  source: string | null;
  createdAt: Date;
  centerId: string | null;
  _count: { orders: number; children: number };
};

async function doc(tx: Tx): Promise<void> {
  const leads: DongLead[] = await tx.lead.findMany({
    where: { deletedAt: null, NOT: { phone: "" } },
    select: {
      id: true,
      phone: true,
      status: true,
      source: true,
      createdAt: true,
      centerId: true,
      _count: { select: { orders: true, children: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const nhom = new Map<string, DongLead[]>();
  for (const l of leads) {
    const k = khoaSdt(l.phone);
    if (!k) continue;
    const ds = nhom.get(k) ?? [];
    ds.push(l);
    nhom.set(k, ds);
  }
  const trung = [...nhom.values()].filter((ds) => ds.length >= 2);

  const soCoDon = (ds: DongLead[]) => ds.filter((l) => l._count.orders > 0).length;
  trung.sort((a, b) => soCoDon(b) - soCoDon(a) || b.length - a.length);

  const haiPhiaCoDon = trung.filter((ds) => soCoDon(ds) >= 2).length;
  const motPhiaCoDon = trung.filter((ds) => soCoDon(ds) === 1).length;

  in_(`## Tổng`);
  in_();
  in_(`| | số |`);
  in_(`|---|---:|`);
  in_(`| lead chưa xoá có SĐT | ${leads.length} |`);
  in_(`| SĐT nằm ở ≥ 2 lead | **${trung.length}** |`);
  in_(`| — trong đó ĐƠN ở ≥ 2 lead (nguy cơ đòi tiền trùng, xem TRƯỚC) | **${haiPhiaCoDon}** |`);
  in_(`| — trong đó đơn ở 1 lead | ${motPhiaCoDon} |`);
  in_(`| — không lead nào có đơn | ${trung.length - haiPhiaCoDon - motPhiaCoDon} |`);
  in_();
  in_(`Phép tính: gom lead chưa xoá theo **9 số cuối** của SĐT (gộp được \`0…\`/\`84…\`),`);
  in_(`giữ nhóm có từ 2 lead. "Có đơn" = \`Order.leadId\` trỏ về lead đó.`);
  in_();

  if (trung.length === 0) return;

  in_(`## Danh sách (xếp theo nguy cơ)`);
  in_();
  in_(`| SĐT | lead | trạng thái | nguồn | tạo lúc | số con | số đơn |`);
  in_(`|---|---|---|---|---|---:|---:|`);
  for (const ds of trung) {
    for (const [i, l] of ds.entries()) {
      in_(
        `| ${i === 0 ? cheSdt(l.phone) : ""} | [${l.id}](https://admin.satarobo.vn/leads/${l.id}) | ` +
          `${l.status} | ${l.source ?? "—"} | ${l.createdAt.toISOString().slice(0, 10)} | ` +
          `${l._count.children} | ${l._count.orders} |`,
      );
    }
  }
}

async function main(): Promise<void> {
  const quyen = await kiemQuyen(db);
  in_(`# Lead trùng SĐT trên PROD — báo cáo CHỈ ĐỌC`);
  in_();
  in_(
    `**Kết nối:** user \`${quyen.nguoiDung}\` · ghi được: ` +
      `**${quyen.ghiDuoc === null ? "không kiểm được" : quyen.ghiDuoc ? "CÓ QUYỀN GHI ⚠️" : "KHÔNG (chỉ đọc)"}**`,
  );
  in_();

  const thieu = await kiemBangDocDuoc();
  if (thieu.length > 0) {
    in_(`🔴 **DỪNG — user này KHÔNG đọc được: ${thieu.join(", ")}.** Mọi con số sẽ là 0, và`);
    in_(`số 0 đó không phải sự thật. Cấp SELECT rồi chạy lại (\`docs/cham-cong/USER-CHI-DOC-PROD.md\`).`);
    writeFileSync(TEP_RA, ra.join("\n"), "utf8");
    process.exitCode = 1;
    return;
  }

  const KET = "__BAO_CAO_XONG__";
  try {
    await db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        await doc(tx);
        throw new Error(KET);
      },
      { timeout: 120_000, maxWait: 15_000 },
    );
  } catch (e) {
    if (!(e instanceof Error && e.message === KET)) throw e;
  }
  writeFileSync(TEP_RA, ra.join("\n"), "utf8");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
