"use client";

// app/(admin)/admin/lop-trial/_components/chon-gv-buoi.tsx — 17/09/2026.
//
// Ô "Giáo viên" của MỘT buổi trải nghiệm, dùng chung cho HAI cửa:
//   · khối "Thêm buổi học"  (`add-session-form.tsx`)
//   · khối "Sửa buổi"       (`attendance-board.tsx` → `SuaBuoiForm`)
//
// ⚠️ VÌ SAO PHẢI DÙNG CHUNG, không phải vì gọn: cửa thứ hai đổi được CẢ NGÀY, GIỜ lẫn
// GIÁO VIÊN và tới 17/09 nó KHÔNG có một cảnh báo nào — tức là đường DỄ tạo trùng lịch
// nhất lại là đường im lặng nhất. Chép markup sang bên kia thì hai bên sẽ trôi lệch (đã
// xảy ra ba lần trong repo: site GV in số khác admin cho cùng một ô — luật 12b). Một
// component, một nguồn.
//
// Danh sách KHÔNG bơm sẵn xuống prop: ngày/giờ do người dùng chọn TỰ DO nên muốn bơm sẵn
// thì phải bơm cả lưới ca của mọi giáo viên mọi ngày. Thay vào đó gọi Server Action mỗi
// khi đủ ba ô — cùng đường mà cửa GHI dùng để tự gác, nên hai bên không thể lệch luật.
//
// Component tách làm HAI mảnh cố ý: `<OChonGiaoVien>` phải đứng trong hàng `flex` cùng
// các ô ngày/giờ/phòng, còn `<CanhBaoGiaoVien>` là khối chữ nằm DƯỚI hàng đó. Gộp một
// mảnh thì mấy dòng cảnh báo biến thành phần tử flex và nằm lọt vào giữa hàng ô nhập.

import { useCallback, useRef, useState, useTransition } from "react";
import type { DongGv } from "@/lib/trial/gv-kha-dung";
import { layGvChoBuoiAction } from "../_actions";
import type { CheDoChonGv } from "../_lib/che-do-gv";
import type { Option } from "../_lib/types";

/** Kết quả một lượt hỏi. `ds === null` = chưa đủ ngày+giờ để hỏi (chưa biết gì). */
export type NguonGvBuoi = {
  ds: DongGv[] | null;
  lyDoRong: string | null;
  dangTai: boolean;
  /** Công tắc "Hiện tất cả giáo viên" đang BẬT hay không. Mặc định TẮT = đang lọc. */
  hienTatCa: boolean;
  /** Bật/tắt công tắc — hỏi LẠI server ngay với cùng khung giờ. */
  doiHienTatCa: (v: boolean) => void;
};

/**
 * Hỏi danh sách giáo viên cho một khung (ngày, giờ bắt đầu, giờ kết thúc).
 *
 * @param excludeSessionId buổi ĐANG SỬA — phải loại khỏi phép so trùng, nếu không sửa
 *   mỗi ô ghi chú cũng tự báo trùng với chính nó và người dùng học cách bỏ qua note đỏ.
 *   Cửa "thêm buổi" truyền `null` (chưa có buổi nào để loại).
 */
export function useGvChoBuoi(input: {
  trialClassId: string;
  excludeSessionId: string | null;
}): NguonGvBuoi & { tai: (date: string, startTime: string, endTime: string) => void } {
  const { trialClassId, excludeSessionId } = input;
  const [ds, setDs] = useState<DongGv[] | null>(null);
  const [lyDoRong, setLyDoRong] = useState<string | null>(null);
  const [dangTai, batDau] = useTransition();
  const [hienTatCa, setHienTatCa] = useState(false);
  // Chống ĐUA: người dùng gõ giờ thì mỗi phím là một lượt gọi, và lượt cũ hoàn toàn có
  // thể về SAU lượt mới. Không có bộ đếm này thì danh sách hiện ra là của khung giờ
  // người ta vừa xoá — sai mà không có dấu hiệu nào.
  const luot = useRef(0);
  // Khung giờ của lượt hỏi GẦN NHẤT — để công tắc hỏi lại đúng khung đó mà không bắt
  // người dùng gõ lại ngày/giờ.
  const khungCuoi = useRef<{ d: string; s: string; e: string }>({ d: "", s: "", e: "" });
  // Bản REF của công tắc. `tai` được gọi từ handler ngay sau `setHienTatCa`, mà state
  // React chưa đổi trong cùng lượt xử lý sự kiện — đọc state ở đó là gửi lên giá trị CŨ,
  // tức bấm công tắc một lần không có tác dụng gì và bấm lần hai mới ăn. Loại lỗi này
  // không ném, không đỏ test nào, chỉ trông như "hệ thống lag".
  const coTatCa = useRef(false);

  const taiVoi = useCallback(
    (date: string, startTime: string, endTime: string, tatCa: boolean) => {
      // Điều kiện đủ-ba-ô giữ NGUYÊN của bản cũ: thiếu một trong ba thì mọi phép so đều
      // vô nghĩa, và lọc theo giờ mặc định là nói sai về một buổi chưa đặt xong.
      if (!date || !startTime || !endTime) {
        luot.current += 1; // huỷ hiệu lực lượt đang bay
        setDs(null);
        setLyDoRong(null);
        return;
      }
      const cua = (luot.current += 1);
      batDau(async () => {
        let res: Awaited<ReturnType<typeof layGvChoBuoiAction>>;
        try {
          res = await layGvChoBuoiAction({
            trialClassId,
            date,
            startTime,
            endTime,
            excludeSessionId,
            hienTatCa: tatCa,
          });
        } catch {
          // Action NÉM (mạng rớt, lỗi 500, deploy đang đổi bản) ⇒ promise bị TỪ CHỐI, và
          // nhánh `!res.ok` ở dưới không bao giờ chạy. Không bắt ở đây thì đây là một
          // unhandled rejection trong `startTransition`: `dangTai` tắt, danh sách giữ
          // nguyên bản CŨ của khung giờ trước, không một dòng chữ nào hiện ra — màn hình
          // trông y hệt lúc chạy đúng (luật 12). Về `ds: null` là quay lại danh sách ĐẦY
          // ĐỦ, nên câu dưới đây nói đúng thứ người dùng đang nhìn thấy.
          if (cua !== luot.current) return;
          setDs(null);
          setLyDoRong(
            "Không lọc được giáo viên theo ca lúc này — đang hiện tất cả. Chọn lại ngày/giờ để thử lại.",
          );
          return;
        }
        if (cua !== luot.current) return; // đã có lượt mới hơn — bỏ kết quả này
        if (!res.ok) {
          // Lỗi cũng phải NÓI RA. Trả về `null` rồi im lặng thì ô chọn quay lại danh
          // sách đầy đủ và trông y như "không có luật nào" — người dùng không có cách
          // nào biết là hệ thống vừa không trả lời được.
          setDs(null);
          setLyDoRong(res.error);
          return;
        }
        setDs(res.ds);
        setLyDoRong(res.lyDoRong);
      });
    },
    [trialClassId, excludeSessionId],
  );

  const tai = useCallback(
    (date: string, startTime: string, endTime: string) => {
      khungCuoi.current = { d: date, s: startTime, e: endTime };
      taiVoi(date, startTime, endTime, coTatCa.current);
    },
    [taiVoi],
  );

  /**
   * Bật/tắt công tắc "Hiện tất cả giáo viên".
   *
   * Hỏi LẠI server chứ không lọc lại ở client: note đỏ trùng lịch được tính từ
   * `ClassSession`/`TrialClassSession` của người khác, thứ không có (và không được có)
   * trong bundle trình duyệt. Lọc lại tại chỗ là dựng một danh sách KHÔNG có cảnh báo —
   * đúng cái phải giữ lại nhất khi tắt bộ lọc.
   *
   * Tác dụng phụ CÓ CHỦ ĐÍCH: bật rồi tắt là một lượt HỎI LẠI với đúng khung giờ cũ, tức
   * cũng là nút "làm mới" cho trường hợp lưới ca vừa đổi trong lúc form đang mở.
   */
  const doiHienTatCa = useCallback(
    (v: boolean) => {
      coTatCa.current = v;
      setHienTatCa(v);
      const k = khungCuoi.current;
      taiVoi(k.d, k.s, k.e, v);
    },
    [taiVoi],
  );

  return { ds, lyDoRong, dangTai, hienTatCa, doiHienTatCa, tai };
}

/**
 * Hậu tố in cạnh tên trong `<option>`.
 *
 * THUẦN + export để test được: đây là chỗ một dòng chữ có thể HỨA SAI (luật 12) — nhãn
 * "TRÙNG LỊCH" mà không trùng, hoặc trùng mà không nhãn, đều không ném lỗi và console
 * vẫn sạch.
 */
export function hauToGv(d: DongGv): string {
  if (d.muc === "DO") return " · TRÙNG LỊCH";
  if (d.phu === "KHONG_GIO") return " · CA LINH ĐỘNG";
  // Người đang hiện ra vì hệ thống KHÔNG BIẾT gì về ca của họ (giáo viên mới, hoặc cả
  // tháng làm ở cơ sở ngoài tầm nhìn). Không dán nhãn thì họ nằm lẫn với người đã được
  // kiểm và thấy rảnh — hai thứ rất khác nhau đứng cạnh nhau không lời giải thích.
  if (d.phu === "CHUA_VAO_LUOI") return " · CHƯA VÀO LƯỚI CA";
  return "";
}

/** Dòng đang được chọn trong danh sách đã lọc (null = chưa chọn / không có trong danh sách). */
export function dongDangChon(ds: DongGv[] | null, teacherId: string): DongGv | null {
  if (!ds || !teacherId) return null;
  return ds.find((d) => d.id === teacherId) ?? null;
}

/**
 * Ô chọn giáo viên. Đặt TRONG hàng `flex` cùng các ô ngày/giờ/phòng.
 *
 * @param teachers danh sách ĐẦY ĐỦ (chưa lọc) — dùng khi chưa đủ ngày/giờ để hỏi, và để
 *   tra TÊN người đang được chọn nếu họ rơi khỏi danh sách đã lọc.
 * @param cheDo · @param batLoc CHỈ để biết có bộ lọc nào đang chạy hay không, tức có nên
 *   vẽ công tắc "Hiện tất cả giáo viên" hay không. **Không dùng để gác bất cứ gì** — quyền
 *   đã hỏi ở server, và server hỏi lại lần nữa mỗi lượt (luật cứng #1).
 * @param nho `true` cho khối sửa buổi (bo góc nhỏ hơn, khớp markup quanh nó).
 */
export function OChonGiaoVien({
  teachers,
  nguon,
  value,
  onChange,
  disabled,
  cheDo,
  batLoc,
  nho = false,
}: {
  teachers: Option[];
  nguon: NguonGvBuoi;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  cheDo: CheDoChonGv;
  batLoc: boolean;
  nho?: boolean;
}) {
  const { ds } = nguon;
  const doTrung = dongDangChon(ds, value)?.muc === "DO";

  // Công tắc chỉ hiện khi THẬT SỰ có bộ lọc để tắt. Vẽ nó ở tầng Đào tạo (`TAT_CA`) hoặc
  // khi cờ `trial.locGvTheoCaLamViec` đang tắt là dựng một cái nút không làm gì: bấm vào,
  // danh sách y nguyên, và người dùng học được rằng các công tắc ở màn này vô nghĩa —
  // đúng loại affordance nói dối mà luật 12 nói tới, lần này theo chiều "hứa có tác dụng".
  const dangLoc = batLoc && cheDo !== "TAT_CA";

  // Người đang được chọn mà KHÔNG có trong danh sách đã lọc thì phải chèn lại, nếu không
  // `<select>` tự nhảy sang giá trị khác và lưu đè một giáo viên người dùng chưa từng
  // chọn — mất dữ liệu câm. (Server đã giữ giáo viên đang gán trên buổi qua `luonGiu`;
  // vế này lo nốt người vừa được chọn TAY trên màn hình, server chưa biết.)
  const thieuNguoiDangChon =
    ds !== null && value !== "" && !ds.some((d) => d.id === value);
  const tenNgoaiDs = thieuNguoiDangChon
    ? (teachers.find((t) => t.id === value)?.name ?? "(không rõ tên)")
    : null;

  const bo = nho ? "rounded-md" : "rounded-lg";

  return (
    // Bọc `<div>` chứ KHÔNG nhét công tắc vào trong `<label>` của ô chọn: một `<label>`
    // gắn với phần tử nhập ĐẦU TIÊN bên trong nó, nên nhét thêm một `<input>` vào là
    // nhãn "Giáo viên" âm thầm chuyển sang trỏ ô khác — `<select>` mất nhãn, trình đọc
    // màn hình đọc sai, và `getByLabelText("Giáo viên")` bắt nhầm phần tử.
    <div className="flex flex-col gap-1">
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Giáo viên
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          // Note ĐỎ phải đến tai người dùng bàn phím / đọc màn hình nữa, không chỉ người
          // nhìn thấy khối màu.
          aria-invalid={doTrung}
          className={`${bo} border px-2 py-1.5 text-sm text-foreground disabled:opacity-50 ${
            doTrung ? "border-state-danger bg-state-danger-soft" : "border-border bg-card"
          }`}
        >
          <option value="">— chưa xếp giáo viên —</option>
          {ds === null
            ? teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))
            : ds.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                  {hauToGv(d)}
                </option>
              ))}
          {tenNgoaiDs !== null && (
            <option value={value}>{tenNgoaiDs} · NGOÀI DANH SÁCH LỌC</option>
          )}
        </select>
      </label>

      {/* ĐƯỜNG THOÁT (chốt 17/09/2026). Bộ lọc dựa vào LƯỚI CA, và lưới lạc hậu được vì
          hàng chục lý do: đơn đổi ca vừa duyệt xong, giáo viên mới chưa ai xếp ca, hai
          người đổi ca miệng với nhau, lưới tháng sau chưa bấm sinh… Người xếp lịch BIẾT
          ĐIỀU HỆ THỐNG KHÔNG BIẾT — đó đúng là câu đã ghi ở `add-session-form.tsx` từ
          28/08 và là lý do cửa GHI cố ý không chặn theo ca. Không có công tắc này thì
          cách duy nhất để vượt một bộ lọc sai là bỏ màn hình mà đi nhập tay chỗ khác.

          Nó KHÔNG phải cấu hình (không ghi xuống đâu cả, tắt lại khi đóng form) và KHÔNG
          nới quyền: server vẫn `checkPermission("trials:manage")` mỗi lượt, mọi câu đọc
          vẫn qua `scopedDb`, và cửa GHI không đọc cờ này. */}
      {dangLoc && (
        <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <input
            type="checkbox"
            checked={nguon.hienTatCa}
            onChange={(e) => nguon.doiHienTatCa(e.target.checked)}
            disabled={disabled}
            className="h-3.5 w-3.5 rounded border-border accent-primary disabled:opacity-50"
          />
          Hiện tất cả giáo viên
          {/* Ô tích tự nó chỉ nói "bật/tắt", không nói bật thì ĐANG THẤY GÌ. Câu trạng
              thái này là thứ người dùng đọc được mà không phải suy. */}
          <span className={nguon.hienTatCa ? "font-semibold text-state-danger-ink" : ""}>
            {nguon.hienTatCa ? "· đang BỎ lọc theo ca" : "· đang lọc theo ca"}
          </span>
        </label>
      )}
    </div>
  );
}

/**
 * Khối chữ dưới hàng ô nhập: note ĐỎ trùng lịch · lý do danh sách không lọc gọn · nhịp tải.
 *
 * Tách khỏi `<OChonGiaoVien>` vì vị trí trong DOM khác nhau, KHÔNG phải vì hai việc khác
 * nhau — hai mảnh luôn đi kèm nhau, cửa nào quên một mảnh là cửa đó im lặng trở lại.
 */
export function CanhBaoGiaoVien({
  nguon,
  value,
}: {
  nguon: NguonGvBuoi;
  value: string;
}) {
  const { ds, lyDoRong, dangTai } = nguon;
  const dong = dongDangChon(ds, value);

  return (
    <>
      {/* Khối cảnh báo ĐỎ (V2-b) — dùng token danger của admin, KHÔNG phải amber. Cam là
          màu "để biết"; trùng lịch dạy là thứ phải đập vào mắt. Vẫn KHÔNG chặn: người xếp
          lịch có thể biết điều mà hệ thống không biết (đã đổi buổi bên kia, dạy ghép…). */}
      {dong !== null && dong.muc === "DO" && (
        <p
          role="alert"
          className="mt-2 rounded-lg border border-state-danger bg-state-danger-soft px-3 py-2 text-xs text-state-danger-ink"
        >
          <strong>{dong.nhan}</strong>. Vẫn thêm được nếu bạn đã sắp xếp khác.
        </p>
      )}

      {/* Lý do danh sách KHÔNG được lọc gọn. Bắt buộc phải hiện thành CHỮ: một `<select>`
          lọc còn 0 dòng mà im lặng là affordance nói dối — không lỗi, không cảnh báo, và
          người dùng đọc nó thành "hệ thống hỏng" rồi đi nhập tay chỗ khác (luật 12). */}
      {lyDoRong !== null && (
        <p aria-live="polite" className="mt-2 text-[11px] text-amber-700">
          {lyDoRong}
        </p>
      )}
      {/* Chốt chặn cuối: danh sách đã hỏi xong mà RỖNG thì dù vì lý do gì cũng phải có
          chữ. Hợp đồng của `locGiaoVienChoBuoi` hứa không bao giờ trả rỗng câm — đây là
          chỗ câu hứa đó được KIỂM, không phải chỗ nó được tin. */}
      {lyDoRong === null && ds !== null && ds.length === 0 && (
        <p aria-live="polite" className="mt-2 text-[11px] text-amber-700">
          Không có giáo viên nào để chọn cho khung giờ này.
        </p>
      )}
      {dangTai && (
        <p aria-live="polite" className="mt-2 text-[11px] text-muted-foreground">
          Đang lọc giáo viên theo ngày &amp; giờ vừa chọn…
        </p>
      )}
    </>
  );
}

/**
 * Một câu nói rõ LUẬT đang chạy, hiện ngay dưới ô chọn.
 *
 * Bản cũ có một câu tương tự ("Dấu đang bận chỉ đối chiếu buổi của lớp trải nghiệm") và
 * nó là thứ duy nhất ngăn người dùng tin nhầm rằng cảnh báo đã phủ hết lịch. Giữ thói
 * quen đó: luật đổi thì CÂU CŨNG PHẢI ĐỔI.
 */
export function GiaiThichLuatGv({
  batLoc,
  cheDo,
  soGvMien,
  hienTatCa,
}: {
  batLoc: boolean;
  cheDo: CheDoChonGv;
  soGvMien: number;
  /**
   * Công tắc đang bật hay không.
   *
   * ⚠️ BẮT BUỘC, và đây là lý do: câu dưới mô tả LUẬT ĐANG CHẠY. Bật công tắc mà câu này
   * vẫn đọc "Danh sách chỉ hiện giáo viên có ca phủ TRỌN…" thì nó đang nói sai về chính
   * thứ người dùng đang nhìn — một lời hứa suông không ném lỗi, không đỏ test, console
   * sạch (luật 12). Để `tsc` bắt mọi cửa phải truyền, đừng cho nó mặc định.
   */
  hienTatCa: boolean;
}) {
  const luat = hienTatCa
    ? "Đang HIỆN TẤT CẢ giáo viên — luật ca tạm bỏ cho lượt chọn này."
    : !batLoc
      ? "Chưa bật lọc giáo viên theo ca làm — danh sách hiện mọi giáo viên."
      : cheDo === "TAT_CA"
        ? "Bạn xếp được mọi giáo viên (quyền Đào tạo) — danh sách không lọc theo ca."
        : cheDo === "THEO_CO_SO"
          ? "Danh sách lọc theo cơ sở của lớp này."
          : "Danh sách chỉ hiện giáo viên có ca phủ TRỌN khung giờ buổi.";
  return (
    <p className="mt-2 text-[11px] text-muted-foreground">
      {luat} Note đỏ đối chiếu buổi <strong>lớp trải nghiệm</strong> và buổi{" "}
      <strong>lớp chính</strong>; <strong>không</strong> tính ca làm trong bảng chấm công.
      {soGvMien > 0 ? ` ${soGvMien} giáo viên được khai luôn hiện.` : ""}
    </p>
  );
}
