/**
 * scripts/do-cong-ngay-khong-quet.ts — NGÀY ĐÃ QUA mà KHÔNG quét lần nào thì có ăn công
 * không, và nếu có thì bao nhiêu tiền đang treo ở đó. CHỈ ĐỌC.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * VÌ SAO — hai câu hỏi của chủ dự án 16/09/2026
 *
 * ① *"Cho tôi tên 2 người [thiếu loại hợp đồng], tôi đi hỏi Nhân sự."* — mục 4 chốt khoá
 *    `department × contractType`, và 2/19 người không khai `contractType` nên không xếp
 *    nhóm được. Chủ dự án chọn phương án (a): hệ thống TỪ CHỐI xếp nhóm khi thiếu.
 *
 * ② *"Việc của bạn bây giờ chỉ là ĐO cho đủ: 29 dòng đó thuộc bao nhiêu người, kỳ nào, đã
 *    chốt kỳ chưa, và trong số đó bao nhiêu là ngày có cờ KHONG_CO_LUOT. Số ấy quyết định
 *    nó là 'nhãn sai' hay 'tiền sai'."*
 *
 * ⚠️ TÔI CỐ Ý ĐO RỘNG HƠN CÂU HỎI, và nói rõ vì sao. Con số 29 hôm qua là "ngày đã qua
 * MANG CỜ `KHONG_CO_LUOT`" — nên hỏi "bao nhiêu trong 29 có cờ" thì câu trả lời là 29, tức
 * không biết thêm gì. Tập cần nhìn là **ngày đã qua có CÔNG mà KHÔNG có phút làm nào**, rồi
 * mới tách theo cờ. Tập ấy rộng hơn và nó mới là tập chạm tiền.
 *
 * ⚠️ VÀ PHẢI TÁCH `dayType`. Ngày NGHỈ PHÉP và ngày LỄ đương nhiên 0 phút làm mà vẫn có
 * công — đó là đúng, không phải lỗi. Gộp chúng vào là báo động giả và sẽ làm người đọc mất
 * niềm tin vào cả phép đo. Chỉ ngày `WORK` có kế hoạch công mới đáng ngờ.
 *
 * ⚠️ CHỈ ĐỌC. Không tham số nào bật ghi.
 * ⚠️ KHÔNG in họ tên/email (repo PUBLIC — log Actions ai cũng đọc được). Mục ① in `employeeCode`
 *    + phòng ban: đủ để Nhân sự tra ra người, mà không phải là tên thật trên một log mở.
 *
 * CHẠY: pnpm tsx scripts/do-cong-ngay-khong-quet.ts
 */
// `_load-env` phải chạy TRƯỚC mọi import chạm Prisma.
import { currentDbHost } from "./_load-env";
import { scriptDb } from "./_script-db";
import { inQuyen, kiemQuyen } from "./_kiem-quyen";
import { db } from "../lib/db";
import { vnYmd } from "../lib/time/vn";

const kiemDb = scriptDb();

function tieu(s: string) {
  console.log("");
  console.log("═".repeat(96));
  console.log(s);
  console.log("═".repeat(96));
}
function dong(nhan: string, n: number | string) {
  console.log(`  ${nhan.padEnd(62)} ${String(n).padStart(10)}`);
}

async function main() {
  console.log(`DB host: ${currentDbHost() ?? "(không đọc được)"}`);
  inQuyen(await kiemQuyen(kiemDb), false);
  const homNayYmd = vnYmd(new Date());
  const homNay = new Date(`${homNayYmd}T00:00:00.000Z`);
  console.log(`Hôm nay (giờ VN): ${homNayYmd}`);

  // ══ ① AI THIẾU LOẠI HỢP ĐỒNG ══════════════════════════════════════════════
  //
  // Đúng tập người mục 4 cần xếp nhóm: có ngày công HOẶC có ca trong kỳ gần nhất.
  const kyMoiNhat = (
    await db.attendancePeriod.findFirst({
      select: { periodKey: true },
      orderBy: { periodKey: "desc" },
    })
  )?.periodKey;

  tieu(`① NGƯỜI KHÔNG XẾP NHÓM ĐƯỢC (thiếu contractType) — kỳ ${kyMoiNhat ?? "?"}`);
  if (kyMoiNhat) {
    const [y, m] = kyMoiNhat.split("-").map(Number);
    const from = new Date(Date.UTC(y!, m! - 1, 1));
    const to = new Date(Date.UTC(y!, m!, 0));
    const [ngay, ca] = await Promise.all([
      db.staffAttendanceDay.findMany({
        where: { workDate: { gte: from, lte: to } },
        select: { userId: true },
      }),
      db.shiftAssignment.findMany({
        where: { workDate: { gte: from, lte: to }, status: "ACTIVE" },
        select: { userId: true },
      }),
    ]);
    const userIds = [...new Set([...ngay.map((r) => r.userId), ...ca.map((r) => r.userId)])];

    const thieu = await db.employee.findMany({
      where: { userAccount: { id: { in: userIds } }, contractType: null },
      // KHÔNG `select` name/email — xem chú thích đầu file.
      select: { employeeCode: true, department: true, status: true },
      orderBy: { employeeCode: "asc" },
    });
    dong("Số người trong kỳ", userIds.length);
    dong("Trong đó THIẾU contractType", thieu.length);
    console.log("");
    for (const e of thieu) {
      console.log(
        `  mã NV = ${e.employeeCode.padEnd(14)} phòng ban = ${String(e.department).padEnd(20)} trạng thái = ${e.status}`,
      );
    }
    if (thieu.length === 0) console.log("  (không ai — mọi người đều đã khai loại hợp đồng)");
    console.log("");
    console.log("  ⓘ In MÃ NV chứ không in họ tên: log Actions của repo PUBLIC ai cũng đọc được.");
    console.log("    Nhân sự tra mã này ra người ngay trên màn /admin/nhan-su.");
  }

  // ══ ② NGÀY ĐÃ QUA, KHÔNG QUÉT, VẪN ĂN CÔNG ════════════════════════════════
  const daQua = await db.staffAttendanceDay.findMany({
    where: { workDate: { lte: homNay } },
    select: {
      userId: true,
      workDate: true,
      dayType: true,
      status: true,
      templateCode: true,
      dayCreditExpected: true,
      dayCreditEarned: true,
      overrideUnits: true,
      workedMinutes: true,
      flags: true,
    },
  });

  const cong = (d: (typeof daQua)[number]) => d.overrideUnits ?? d.dayCreditEarned;
  // Tập đáng ngờ: ngày LÀM VIỆC, có kế hoạch công, ăn công, mà KHÔNG phút làm nào.
  const dangNgo = daQua.filter(
    (d) => d.dayType === "WORK" && d.dayCreditExpected > 0 && cong(d) > 0 && d.workedMinutes === 0,
  );
  // Vế đối chứng: nghỉ/lễ cũng 0 phút và có công — nhưng đó là ĐÚNG.
  const nghiLe = daQua.filter((d) => d.dayType !== "WORK" && cong(d) > 0 && d.workedMinutes === 0);

  tieu("② NGÀY ĐÃ QUA · dayType = WORK · có công · KHÔNG phút làm nào");
  dong("Tổng dòng ngày đã qua", daQua.length);
  dong("⇒ ĐÁNG NGỜ (work · có công · 0 phút)", dangNgo.length);
  dong("   — số NGƯỜI dính", new Set(dangNgo.map((d) => d.userId)).size);
  dong("   — Σ CÔNG đang treo ở đó", Math.round(dangNgo.reduce((s, d) => s + cong(d), 0) * 100) / 100);
  console.log("");
  dong("Đối chứng: ngày nghỉ/lễ (0 phút + có công là ĐÚNG)", nghiLe.length);

  tieu("②a TÁCH THEO CỜ — 'nhãn sai' hay 'tiền sai'");
  const coLuot = dangNgo.filter((d) => d.flags.includes("KHONG_CO_LUOT"));
  const khongCo = dangNgo.filter((d) => d.flags.length === 0);
  const coKhac = dangNgo.filter((d) => d.flags.length > 0 && !d.flags.includes("KHONG_CO_LUOT"));
  dong("Mang cờ KHONG_CO_LUOT (Quản lý NHÌN THẤY)", coLuot.length);
  dong("KHÔNG cờ nào (Quản lý KHÔNG thấy gì)", khongCo.length);
  dong("Cờ khác, không có KHONG_CO_LUOT", coKhac.length);
  console.log("");
  console.log("  ⓘ Dòng KHÔNG CỜ là dòng nguy hiểm nhất: ăn công, không ai quét, và trên màn");
  console.log("    không có gì báo. Dòng CÓ CỜ ít nhất còn hiện ra để Quản lý xử lý.");

  // Tổ hợp cờ THẬT của 54 dòng — đây mới là chỗ quyết định "nhãn sai" hay "tiền sai".
  //
  // `THIEU_LUOT_RA` / `RA_KHONG_CO_VAO` nghĩa là người ta CÓ quét, chỉ thiếu một đầu ⇒ họ có
  // mặt, chỉ là hệ không ghép được cặp nên `workedMinutes = 0`. Công đủ cho ngày đó không
  // sai về bản chất, cái sai là hệ không biết họ làm mấy giờ.
  // `KHONG_CO_LUOT` mới là "không có dấu vết nào" — và đó là ca phải hỏi Kế toán.
  tieu("②a2 TỔ HỢP CỜ THẬT — đếm theo từng cờ (một dòng có thể mang nhiều cờ)");
  const demCo = new Map<string, number>();
  for (const d of dangNgo) for (const f of d.flags) demCo.set(f, (demCo.get(f) ?? 0) + 1);
  for (const [f, n] of [...demCo.entries()].sort((a, b) => b[1] - a[1])) dong(`  ${f}`, n);
  console.log("");
  const coDauVet = dangNgo.filter((d) =>
    d.flags.some((f) => f === "THIEU_LUOT_RA" || f === "RA_KHONG_CO_VAO"),
  );
  dong("Dòng CÓ dấu vết quét (thiếu một đầu) ⇒ người ta CÓ mặt", coDauVet.length);
  dong("Dòng KHÔNG dấu vết nào (KHONG_CO_LUOT)", coLuot.length);
  console.log("");
  console.log("  ⓘ Hai nhóm này khác nhau về BẢN CHẤT:");
  console.log("    · thiếu một đầu  ⇒ có mặt, hệ không ghép được cặp nên không biết mấy giờ;");
  console.log("    · không lượt nào ⇒ không có dấu vết gì cả. Đây mới là ca phải hỏi Kế toán.");

  // Mã ca KHÔNG yêu cầu quét thì 0 phút + đủ công là ĐÚNG THIẾT KẾ, không phải lỗ hổng.
  // Đo 16/09 trên `lib/cham-cong/catalog.ts`: `LD` · `D1` · `D2` mang `attendanceMode:
  // "OPTIONAL"`. Nhóm "KHÔNG cờ nào" ở trên gần như chắc chắn là chúng — in ra để khỏi ai
  // phải đoán.
  tieu("②a3 NHÓM 'KHÔNG CỜ NÀO' là mã ca gì");
  const maKhongCo = new Map<string, number>();
  for (const d of khongCo) maKhongCo.set(d.templateCode ?? "(không mã)", (maKhongCo.get(d.templateCode ?? "(không mã)") ?? 0) + 1);
  if (khongCo.length === 0) console.log("  (không dòng nào)");
  for (const [k, n] of [...maKhongCo.entries()].sort((a, b) => b[1] - a[1])) dong(`  ${k}`, n);
  console.log("");
  console.log("  ⓘ `LD` · `D1` · `D2` khai `attendanceMode: OPTIONAL` trong danh mục — với chúng,");
  console.log("    0 phút mà vẫn đủ công là ĐÚNG THIẾT KẾ. Mã nào KHÁC ba mã đó xuất hiện ở đây");
  console.log("    mới là chuyện phải truy.");

  // BẢNG KẾT — ba nhóm, mỗi nhóm kèm SỐ NGƯỜI và SỐ CÔNG. Đây là bảng mang đi hỏi Kế toán,
  // nên tiền phải gắn vào từng nhóm chứ không gộp một cục: 50,5 công cho cả 54 dòng không
  // trả lời được câu "bao nhiêu tiền đang treo ở những ngày KHÔNG AI BIẾT người đó có đến
  // hay không" — mà đó mới là câu phải hỏi.
  const bang = (nhan: string, ds: typeof dangNgo) => {
    const c = Math.round(ds.reduce((s2, d) => s2 + cong(d), 0) * 100) / 100;
    console.log(
      `  ${nhan.padEnd(46)} dòng=${String(ds.length).padStart(4)}  người=${String(new Set(ds.map((d) => d.userId)).size).padStart(3)}  công=${String(c).padStart(7)}`,
    );
  };
  const conLai = dangNgo.filter(
    (d) =>
      !d.flags.includes("KHONG_CO_LUOT") &&
      d.flags.length > 0 &&
      !d.flags.some((f) => f === "THIEU_LUOT_RA" || f === "RA_KHONG_CO_VAO"),
  );
  tieu("②a4 BẢNG KẾT — ba nhóm, kèm người và CÔNG của riêng từng nhóm");
  bang("① KHÔNG dấu vết nào (KHONG_CO_LUOT)", coLuot);
  bang("② CÓ mặt, thiếu một đầu quét", coDauVet);
  bang("③ Mã ca OPTIONAL (đúng thiết kế)", khongCo);
  bang("④ Còn lại, chưa xếp được vào ba nhóm trên", conLai);
  console.log("");
  console.log("  ⓘ Nhóm ① là con số mang đi hỏi Kế toán: công đang ghi cho những ngày KHÔNG");
  console.log("    AI BIẾT người đó có đến hay không. Nhóm ② thì người ta có đến thật.");
  if (conLai.length > 0) {
    console.log("");
    console.log("  Nhóm ④ — in cờ ra để không ai phải đoán:");
    for (const d of conLai.slice(0, 10)) {
      console.log(`    ${d.workDate.toISOString().slice(0, 10)}  mã=${d.templateCode ?? "—"}  cờ=[${d.flags.join(",")}]`);
    }
  }

  // ══ ③ NHÓM ① CÓ THẬT SỰ DÙNG HỆ THỐNG KHÔNG ══════════════════════════════
  //
  // Chủ dự án 16/09: *"13/19 người là gần hết công ty. Nếu phần lớn là '0 lượt cả kỳ' thì
  // câu hỏi cho chị Huệ đổi hẳn — từ 'chị có tính lương theo số này không' thành 'hệ thống
  // quét đã chạy thật chưa, hay mọi người vẫn chấm bằng cách cũ'."*
  //
  // Đây là phép phân biệt quan trọng nhất trong cả file:
  //   · 0 lượt CẢ KỲ      ⇒ người này CHƯA DÙNG hệ. Không phải nghỉ không phép, và số công
  //                          của họ không nói lên điều gì về việc họ có đi làm hay không.
  //   · có quét nhiều ngày, thiếu vài ngày ⇒ hệ ĐANG chạy với người này, và những ngày
  //                          thiếu mới thật sự đáng hỏi.
  //
  // Đếm `result = ACCEPTED`: lượt `REJECTED` là lượt bị hệ từ chối (sai điểm chấm, ngoài
  // vùng…) — nó chứng minh người ta CÓ thử quét, nhưng không phải dấu chấm công hợp lệ.
  // Tách riêng để không lẫn "chưa từng dùng" với "dùng mà bị từ chối".
  const kyDo = kyMoiNhat ?? homNayYmd.slice(0, 7);
  const [yy, mm] = kyDo.split("-").map(Number);
  const kyFrom = new Date(Date.UTC(yy!, mm! - 1, 1));
  const kyTo = new Date(Date.UTC(yy!, mm!, 0));

  const luot = await db.staffTimeLog.findMany({
    where: { workDate: { gte: kyFrom, lte: kyTo } },
    select: { userId: true, workDate: true, result: true },
  });
  const luotOk = luot.filter((l) => l.result === "ACCEPTED");

  tieu(`③ TOÀN KỲ ${kyDo} — hệ thống quét đã chạy tới đâu`);
  dong("Tổng lượt quét (mọi kết quả)", luot.length);
  dong("  — ACCEPTED", luotOk.length);
  dong("  — REJECTED", luot.length - luotOk.length);
  dong("Số NGƯỜI có ít nhất 1 lượt ACCEPTED", new Set(luotOk.map((l) => l.userId)).size);
  dong("Số người trong kỳ (mẫu số)", new Set(daQua.map((d) => d.userId)).size);

  // Tra mã NV cho 13 người của nhóm ① — KHÔNG in tên (repo PUBLIC).
  const idNhom1 = [...new Set(coLuot.map((d) => d.userId))];
  const maNV = new Map(
    (
      await db.employee.findMany({
        where: { userAccount: { id: { in: idNhom1 } } },
        select: { employeeCode: true, department: true, userAccount: { select: { id: true } } },
      })
    ).map((e) => [e.userAccount!.id, { ma: e.employeeCode, pb: String(e.department) }]),
  );

  tieu("③a NHÓM ① TÁCH THEO NGƯỜI — ai chưa từng dùng hệ, ai dùng mà thiếu ngày");
  const hang = idNhom1
    .map((uid) => {
      const cua = luotOk.filter((l) => l.userId === uid);
      return {
        uid,
        ma: maNV.get(uid)?.ma ?? "(không có hồ sơ NV)",
        pb: maNV.get(uid)?.pb ?? "—",
        luot: cua.length,
        ngayCoQuet: new Set(cua.map((l) => l.workDate.toISOString().slice(0, 10))).size,
        ngayThieu: coLuot.filter((d) => d.userId === uid).length,
        congTreo: Math.round(coLuot.filter((d) => d.userId === uid).reduce((s2, d) => s2 + cong(d), 0) * 100) / 100,
      };
    })
    .sort((a, b) => a.luot - b.luot || a.ma.localeCompare(b.ma));

  console.log(`  ${"MÃ NV".padEnd(14)} ${"PHÒNG BAN".padEnd(20)} ${"LƯỢT OK".padStart(8)} ${"NGÀY CÓ QUÉT".padStart(13)} ${"NGÀY THIẾU".padStart(11)} ${"CÔNG TREO".padStart(10)}`);
  for (const h of hang) {
    console.log(
      `  ${h.ma.padEnd(14)} ${h.pb.padEnd(20)} ${String(h.luot).padStart(8)} ${String(h.ngayCoQuet).padStart(13)} ${String(h.ngayThieu).padStart(11)} ${String(h.congTreo).padStart(10)}`,
    );
  }

  const chuaDung = hang.filter((h) => h.luot === 0);
  const dangDung = hang.filter((h) => h.luot > 0);
  console.log("");
  dong("⇒ CHƯA DÙNG hệ (0 lượt cả kỳ)", `${chuaDung.length} người`);
  dong("   công treo của nhóm này", chuaDung.reduce((s2, h) => s2 + h.congTreo, 0));
  dong("⇒ ĐANG DÙNG mà thiếu vài ngày", `${dangDung.length} người`);
  dong("   công treo của nhóm này", Math.round(dangDung.reduce((s2, h) => s2 + h.congTreo, 0) * 100) / 100);
  console.log("");
  console.log("  ⓘ Hai nhóm này dẫn tới HAI câu hỏi khác nhau:");
  console.log("    · CHƯA DÙNG  ⇒ hỏi 'hệ quét đã chạy thật chưa, hay còn chấm bằng cách cũ'.");
  console.log("                   Công của họ không chứng minh được gì — đây không phải bug tiền.");
  console.log("    · ĐANG DÙNG mà thiếu ngày ⇒ đây mới là ca hỏi Kế toán về cách tính lương.");

  tieu("②b ĐÃ CHỐT KỲ CHƯA — chốt rồi thì số đã đóng băng vào bảng lương");
  dong("Dòng thuộc ngày đã CHỐT (status = LOCKED)", dangNgo.filter((d) => d.status === "LOCKED").length);
  dong("Dòng CHƯA chốt", dangNgo.filter((d) => d.status !== "LOCKED").length);

  tieu("②c RẢI THEO KỲ");
  const theoKy = new Map<string, { dong: number; nguoi: Set<string>; cong: number }>();
  for (const d of dangNgo) {
    const k = d.workDate.toISOString().slice(0, 7);
    const v = theoKy.get(k) ?? { dong: 0, nguoi: new Set<string>(), cong: 0 };
    v.dong += 1;
    v.nguoi.add(d.userId);
    v.cong += cong(d);
    theoKy.set(k, v);
  }
  for (const [k, v] of [...theoKy.entries()].sort())
    console.log(
      `  ${k}   dòng=${String(v.dong).padStart(4)}   người=${String(v.nguoi.size).padStart(3)}   công=${String(Math.round(v.cong * 100) / 100).padStart(7)}`,
    );

  tieu("②d RẢI THEO MÃ CA — mã nào hay rơi vào tình trạng này");
  const theoMa = new Map<string, number>();
  for (const d of dangNgo) theoMa.set(d.templateCode ?? "(không mã)", (theoMa.get(d.templateCode ?? "(không mã)") ?? 0) + 1);
  for (const [k, n] of [...theoMa.entries()].sort((a, b) => b[1] - a[1])) dong(`  ${k}`, n);

  // ══ ④ 26,5 CÔNG KIA LÀ "NGHỈ KHÔNG PHÉP" HAY "BỊ MÁY CHỦ TỪ CHỐI" ═════════
  //
  // Câu quan trọng nhất của cả file. Chủ dự án 16/09:
  //
  //   *"Nếu trùng nhiều thì 26,5 công kia không phải 'nghỉ không phép' — họ CÓ đến, máy chủ
  //   từ chối họ. Lúc đó tôi không hỏi chị Huệ về tiền nữa, mà đi xin lỗi 13 người."*
  //
  // Đo được vì `recordRejectedLog` VẪN ghi dòng cho lượt bị từ chối: `result = REJECTED`,
  // `rejectReason = NO_GPS`. Tức dấu vết "người này CÓ bấm quét hôm ấy" còn nguyên trên DB —
  // chỉ là nó không nằm ở chỗ ta vẫn nhìn.
  //
  // ⚠️ Ghép theo (người × NGÀY), không theo ngày suông: một người bị từ chối hôm 13/09 không
  // nói được gì về ngày thiếu quét của người khác.
  const tuChoiNoGps = await db.staffTimeLog.findMany({
    where: { result: "REJECTED", rejectReason: "NO_GPS" },
    select: { userId: true, workDate: true },
  });
  const khoa = (u: string, d: Date) => `${u}|${d.toISOString().slice(0, 10)}`;
  const coBamQuet = new Set(tuChoiNoGps.map((l) => khoa(l.userId, l.workDate)));

  tieu("④ NGÀY THIẾU QUÉT CỦA NHÓM ① — có phải họ ĐÃ BẤM mà bị từ chối không");
  const trung = coLuot.filter((d) => coBamQuet.has(khoa(d.userId, d.workDate)));
  const khongTrung = coLuot.filter((d) => !coBamQuet.has(khoa(d.userId, d.workDate)));
  dong("Tổng lượt bị từ chối vì NO_GPS (mọi ngày)", tuChoiNoGps.length);
  dong("Ngày của nhóm ① (có công, 0 phút, cờ KHONG_CO_LUOT)", coLuot.length);
  console.log("");
  dong("⇒ CÓ bấm quét hôm ấy nhưng BỊ TỪ CHỐI", trung.length);
  dong("   — số người", new Set(trung.map((d) => d.userId)).size);
  dong("   — CÔNG đang treo ở những ngày này", Math.round(trung.reduce((s2, d) => s2 + cong(d), 0) * 100) / 100);
  console.log("");
  dong("⇒ KHÔNG thấy dấu vết bấm quét nào hôm ấy", khongTrung.length);
  dong("   — số người", new Set(khongTrung.map((d) => d.userId)).size);
  dong("   — CÔNG đang treo ở những ngày này", Math.round(khongTrung.reduce((s2, d) => s2 + cong(d), 0) * 100) / 100);
  console.log("");
  console.log("  ⓘ Nhóm TRÊN: người ta CÓ ĐẾN và CÓ BẤM — máy chủ từ chối vì không lấy được");
  console.log("    toạ độ. Đây KHÔNG phải câu hỏi tiền cho Kế toán, đây là lỗi của hệ thống.");
  console.log("    Nhóm DƯỚI: không có dấu vết nào, mới là ca còn phải hỏi.");

  // In theo người để biết ai bị oan — MÃ NV, không tên.
  if (trung.length > 0) {
    const idTrung = [...new Set(trung.map((d) => d.userId))];
    const ma = new Map(
      (
        await db.employee.findMany({
          where: { userAccount: { id: { in: idTrung } } },
          select: { employeeCode: true, userAccount: { select: { id: true } } },
        })
      ).map((e) => [e.userAccount!.id, e.employeeCode]),
    );
    tieu("④a AI BỊ OAN — mã NV, số ngày, và công đang treo");
    for (const uid of idTrung) {
      const cua = trung.filter((d) => d.userId === uid);
      console.log(
        `  ${(ma.get(uid) ?? "(không có hồ sơ NV)").padEnd(14)} ${String(cua.length).padStart(2)} ngày   ` +
          `công=${Math.round(cua.reduce((s2, d) => s2 + cong(d), 0) * 100) / 100}   ` +
          `ngày: ${cua.map((d) => d.workDate.toISOString().slice(5, 10)).sort().join(" ")}`,
      );
    }
  }

  console.log("");
  console.log("Xong. Không dòng nào bị ghi.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await kiemDb.$disconnect();
    await db.$disconnect();
  });
