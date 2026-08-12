"use client";

import { useState, useCallback, useMemo } from "react";
import * as XLSX from "xlsx";
import { useDropzone } from "react-dropzone";
import {
  FileSpreadsheet,
  Download,
  Upload,
  AlertCircle,
  CheckCircle2,
  Loader2,
  X,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { PhanTrangBang } from "@/components/ui/phan-trang-bang";

export interface ImportResult {
  success: number;
  errors: { row: number; error: string }[];
}

/** Ngữ cảnh kèm theo khi Import: dòng Excel gốc của từng row + tập dòng đã "Xác nhận gộp". */
export interface ImportContext {
  /** excelRowOf[i] = số dòng Excel gốc của rows[i]. */
  excelRowOf: number[];
  /** Các số dòng Excel đã được bấm nút xác nhận (confirmDuplicates). */
  confirmed: Set<number>;
}

export interface ExcelImporterProps<T> {
  templateUrl: string;
  templateFilename: string;
  parseRow: (row: Record<string, unknown>, rowIndex: number) => T | { error: string };
  onImport: (rows: T[], ctx?: ImportContext) => Promise<ImportResult>;
  columnHints: { key: string; label: string; required?: boolean }[];
  title?: string;
  /**
   * Khoá chống trùng TRONG FILE, hiện ngay ở preview (server vẫn là chốt chặn
   * cuối). Trả về key chuẩn hoá từ dòng raw (vd SĐT bỏ ký tự lạ); null/"" = bỏ
   * qua dòng đó. Dòng TRÙNG (xuất hiện sau) bị đánh lỗi "Trùng với dòng N" —
   * xoá dòng gốc thì dòng sau tự hết lỗi (tính lại động).
   */
  duplicateKey?: (raw: Record<string, unknown>) => string | null | undefined;
  /** Nhãn cột dùng trong thông báo trùng (vd "SĐT"). */
  duplicateLabel?: string;
  /**
   * Đối chiếu với dữ liệu ĐÃ CÓ trong hệ thống (gọi API sau khi parse xong).
   * Trả về Map<số dòng Excel, msg> (coi là LỖI — vd lead trùng SĐT) hoặc
   * {errors?, warnings?}: warnings hiện VÀNG, dòng VẪN import được (màn upsert
   * — import sẽ ghi đè bản ghi cũ). Lỗi network → rỗng (server vẫn tự chặn).
   */
  checkExisting?: (
    raws: Record<string, unknown>[],
    excelRows: number[],
  ) => Promise<
    | Map<number, string>
    | { errors?: Map<number, string>; warnings?: Map<number, string> }
  >;
  /**
   * Cho phép NGƯỜI DÙNG XÁC NHẬN từng dòng trùng (trong-file + trùng DB) để vẫn
   * import theo nghĩa GỘP/GHI ĐÈ thay vì bị bỏ qua (vd lead: 1 PH 2 con — gộp con
   * vào cùng SĐT). Dòng đã xác nhận → hợp lệ (amber); trang nhận biết qua
   * ctx.confirmed trong onImport để gắn cờ cho server xử lý gộp.
   */
  confirmDuplicates?: { label: string };
  /**
   * Dòng trùng KHÔNG phải lỗi và KHÔNG cần bấm xác nhận — server tự gộp (vd lead:
   * cùng SĐT = cùng nhà → con dồn vào 1 lead). Dòng trùng hiện nhãn amber `label`
   * nhưng vẫn nằm trong danh sách import. Ưu tiên hơn `confirmDuplicates`.
   */
  mergeDuplicates?: { label: string };
}

type Step = "idle" | "preview" | "importing" | "done";

function isErrorRow<T>(row: T | { error: string }): row is { error: string } {
  return typeof row === "object" && row !== null && "error" in row;
}

export function ExcelImporter<T>({
  templateUrl,
  templateFilename,
  parseRow,
  onImport,
  columnHints,
  title = "Import từ Excel",
  duplicateKey,
  duplicateLabel = "dữ liệu",
  checkExisting,
  confirmDuplicates,
  mergeDuplicates,
}: ExcelImporterProps<T>) {
  const [step, setStep] = useState<Step>("idle");
  const [rawRows, setRawRows] = useState<Record<string, unknown>[]>([]);
  const [parsedRows, setParsedRows] = useState<(T | { error: string })[]>([]);
  // Số dòng Excel GỐC của từng row (bắt đầu 2 vì dòng 1 là header) — giữ nguyên
  // sau khi xoá bớt dòng, để người nhập tra ngược lại file của họ.
  const [excelRows, setExcelRows] = useState<number[]>([]);
  // Trùng với dữ liệu ĐÃ CÓ trong hệ thống — key theo SỐ DÒNG EXCEL (ổn định
  // khi xoá bớt dòng, không lệch index).
  const [dbDup, setDbDup] = useState<Map<number, string>>(new Map());
  // Cảnh báo GHI ĐÈ (màn upsert): vàng, dòng VẪN import được — key theo dòng Excel.
  const [dbWarn, setDbWarn] = useState<Map<number, string>>(new Map());
  // Các dòng trùng đã được bấm "Xác nhận gộp" — key theo số dòng Excel.
  const [confirmedDups, setConfirmedDups] = useState<Set<number>>(new Set());
  const [checkingDb, setCheckingDb] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [filename, setFilename] = useState("");

  const parseFile = useCallback(
    async (file: File) => {
      try {
        setFilename(file.name);
        const buffer = await file.arrayBuffer();
        const wb = XLSX.read(buffer, { type: "array" });
        const firstSheetName = wb.SheetNames[0];
        if (!firstSheetName) {
          alert("File Excel không có sheet nào");
          return;
        }
        const sheet = wb.Sheets[firstSheetName];
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
          defval: null,
        });
        if (rows.length === 0) {
          alert("File Excel rỗng hoặc sai format");
          return;
        }
        if (rows.length > 5000) {
          alert(`File quá lớn (${rows.length} rows). Tối đa 5000.`);
          return;
        }
        setRawRows(rows);
        setParsedRows(rows.map((row, idx) => parseRow(row, idx)));
        const excelNos = rows.map((_, idx) => idx + 2);
        setExcelRows(excelNos);
        setDbDup(new Map());
        setDbWarn(new Map());
        setConfirmedDups(new Set());
        setStep("preview");
        if (checkExisting) {
          setCheckingDb(true);
          checkExisting(rows, excelNos)
            .then((res) => {
              if (res instanceof Map) {
                setDbDup(res);
              } else {
                setDbDup(res.errors ?? new Map());
                setDbWarn(res.warnings ?? new Map());
              }
            })
            .catch((err) => {
              // Không chặn import — server vẫn tự dedupe; chỉ mất phần báo sớm.
              console.error("[ExcelImporter] checkExisting lỗi:", err);
            })
            .finally(() => setCheckingDb(false));
        }
      } catch (err) {
        alert(`Lỗi đọc file: ${err instanceof Error ? err.message : "Unknown"}`);
      }
    },
    [parseRow, checkExisting],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
      "application/vnd.ms-excel": [".xls"],
    },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024,
    multiple: false,
    disabled: step === "importing",
    onDrop: (files) => {
      if (files[0]) parseFile(files[0]);
    },
  });

  // Lỗi trùng-trong-file tính ĐỘNG theo trạng thái hiện tại (không lưu vào
  // parsedRows) → xoá dòng gốc là dòng sau tự hết lỗi trùng.
  const dupErrors = useMemo(() => {
    const map = new Map<number, string>();
    if (!duplicateKey) return map;
    const firstSeen = new Map<string, number>(); // key → excelRow đầu tiên
    for (let i = 0; i < parsedRows.length; i++) {
      if (isErrorRow(parsedRows[i])) continue; // dòng đã lỗi parse thì thôi
      const key = duplicateKey(rawRows[i] ?? {});
      if (!key) continue;
      const firstRow = firstSeen.get(key);
      if (firstRow === undefined) {
        firstSeen.set(key, excelRows[i] ?? i + 2);
      } else {
        map.set(i, `Trùng ${duplicateLabel} với dòng ${firstRow} trong file`);
      }
    }
    return map;
  }, [duplicateKey, duplicateLabel, parsedRows, rawRows, excelRows]);

  // Một dòng "trùng" (in-file hoặc DB) đi kèm confirmDuplicates + đã bấm xác nhận
  // → vẫn hợp lệ (server sẽ xử lý theo nghĩa gộp).
  const isDupRow = (i: number) => dupErrors.has(i) || dbDup.has(excelRows[i] ?? -1);
  const isConfirmedRow = (i: number) => confirmedDups.has(excelRows[i] ?? -1);
  const validIdx: number[] = [];
  parsedRows.forEach((r, i) => {
    if (isErrorRow(r)) return;
    if (isDupRow(i)) {
      // mergeDuplicates: trùng = hợp lệ (server gộp), không cần thao tác của người nhập.
      if (mergeDuplicates || (confirmDuplicates && isConfirmedRow(i))) validIdx.push(i);
      return;
    }
    validIdx.push(i);
  });
  const validRows = validIdx.map((i) => parsedRows[i] as T);
  const errorCount = parsedRows.length - validRows.length;
  // Số dòng bị cảnh báo ghi đè (chỉ đếm dòng còn sống + không lỗi).
  const warnCount = validIdx.filter(
    (i) => !isDupRow(i) && dbWarn.has(excelRows[i] ?? -1),
  ).length;
  const confirmedCount = validIdx.filter((i) => isDupRow(i)).length;

  const handleImport = async () => {
    setStep("importing");
    try {
      const res = await onImport(validRows, {
        excelRowOf: validIdx.map((i) => excelRows[i] ?? i + 2),
        confirmed: confirmedDups,
      });
      setResult(res);
      setStep("done");
    } catch (err) {
      alert(`Import thất bại: ${err instanceof Error ? err.message : "Unknown"}`);
      setStep("preview");
    }
  };

  const reset = () => {
    setStep("idle");
    setRawRows([]);
    setParsedRows([]);
    setExcelRows([]);
    setDbDup(new Map());
    setDbWarn(new Map());
    setConfirmedDups(new Set());
    setCheckingDb(false);
    setResult(null);
    setFilename("");
  };

  /** Xoá các dòng theo index hiện tại (3 mảng song song đi cùng nhau); hết dòng → về idle. */
  const removeRows = (indexes: Set<number>) => {
    if (parsedRows.length - indexes.size <= 0) {
      reset();
      return;
    }
    setRawRows((prev) => prev.filter((_, i) => !indexes.has(i)));
    setParsedRows((prev) => prev.filter((_, i) => !indexes.has(i)));
    setExcelRows((prev) => prev.filter((_, i) => !indexes.has(i)));
  };

  const removeErrorRows = () => {
    removeRows(
      new Set(
        parsedRows
          .map((row, i) =>
            isErrorRow(row) ||
            (isDupRow(i) &&
              !mergeDuplicates &&
              !(confirmDuplicates && isConfirmedRow(i)))
              ? i
              : -1,
          )
          .filter((i) => i >= 0),
      ),
    );
  };

  const toggleConfirm = (excelRow: number) => {
    setConfirmedDups((prev) => {
      const next = new Set(prev);
      if (next.has(excelRow)) next.delete(excelRow);
      else next.add(excelRow);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">{title}</h3>
        <a
          href={templateUrl}
          download={templateFilename}
          className="inline-flex items-center gap-1 text-sm text-state-info-ink hover:underline"
        >
          <Download className="h-4 w-4" />
          Tải Template
        </a>
      </div>

      {step === "idle" && (
        <div
          {...getRootProps()}
          className={cn(
            "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
            isDragActive
              ? "border-primary bg-primary/5"
              : "border-border hover:border-border",
          )}
        >
          <input {...getInputProps()} />
          <FileSpreadsheet className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
          <p className="font-medium">Kéo thả file Excel hoặc click để chọn</p>
          <p className="text-xs text-muted-foreground mt-1">
            .xlsx / .xls — tối đa 10MB / 5000 rows
          </p>
        </div>
      )}

      {step === "preview" && (
        <div className="space-y-3">
          <Alert>
            <CheckCircle2 className="h-4 w-4" />
            <AlertDescription>
              File: <strong>{filename}</strong> — {rawRows.length} rows | ✅ Hợp lệ:{" "}
              <strong className="text-state-success-ink">{validRows.length}</strong> | ❌ Lỗi:{" "}
              <strong className="text-state-danger-ink">{errorCount}</strong>
              {warnCount > 0 && (
                <>
                  {" "}| ⚠️ Ghi đè:{" "}
                  <strong className="text-state-warning-ink">{warnCount}</strong>
                </>
              )}
              {confirmedCount > 0 && (
                <>
                  {" "}| 🔀 {mergeDuplicates ? "Sẽ gộp" : "Đã xác nhận gộp"}:{" "}
                  <strong className="text-state-warning-ink">{confirmedCount}</strong>
                </>
              )}
              {checkingDb && (
                <span className="ml-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> đang đối chiếu dữ liệu có sẵn…
                </span>
              )}
            </AlertDescription>
          </Alert>
          <div className="border rounded-lg overflow-x-auto max-h-[400px]">
            <PhanTrangBang>
              <table className="w-full text-sm">
                <thead className="bg-muted sticky top-0">
                  <tr>
                    <th className="px-2 py-1 text-left">#</th>
                    {columnHints.map((c) => (
                      <th key={c.key} className="px-2 py-1 text-left">
                        {c.label}
                        {c.required && <span className="text-state-danger-ink">*</span>}
                      </th>
                    ))}
                    <th className="px-2 py-1 text-left">Status</th>
                    <th className="px-2 py-1 w-8" aria-label="Xoá dòng"></th>
                  </tr>
                </thead>
                <tbody>
                  {parsedRows.slice(0, 100).map((row, idx) => {
                    const dupError =
                      dupErrors.get(idx) ?? dbDup.get(excelRows[idx] ?? -1);
                    const willMerge = dupError !== undefined && mergeDuplicates !== undefined;
                    const confirmed =
                      dupError !== undefined &&
                      confirmDuplicates !== undefined &&
                      isConfirmedRow(idx);
                    const errored =
                      isErrorRow(row) ||
                      (dupError !== undefined && !confirmed && !willMerge);
                    const warn = errored ? undefined : dbWarn.get(excelRows[idx] ?? -1);
                    return (
                      <tr
                        key={`${excelRows[idx] ?? idx}`}
                        className={cn(
                          "border-t",
                          errored && "bg-state-danger-soft",
                          (warn || confirmed || willMerge) && "bg-state-warning-soft",
                        )}
                      >
                        <td className="px-2 py-1">{excelRows[idx] ?? idx + 2}</td>
                        {columnHints.map((c) => (
                          <td key={c.key} className="px-2 py-1 truncate max-w-[200px]">
                            {String(rawRows[idx]?.[c.key] ?? "—")}
                          </td>
                        ))}
                        <td className="px-2 py-1">
                          {isErrorRow(row) ? (
                            <span className="text-state-danger-ink text-xs">{row.error}</span>
                          ) : willMerge ? (
                            <span className="text-state-warning-ink text-xs">
                              🔀 {mergeDuplicates!.label} — {dupError}
                            </span>
                          ) : confirmed ? (
                            <span className="text-state-warning-ink text-xs">
                              🔀 Đã xác nhận gộp — sẽ xử lý khi Import.{" "}
                              <button
                                type="button"
                                onClick={() => toggleConfirm(excelRows[idx] ?? -1)}
                                className="underline hover:text-state-warning-ink"
                              >
                                Hoàn tác
                              </button>
                            </span>
                          ) : dupError ? (
                            <span className="text-state-danger-ink text-xs">
                              {dupError}
                              {confirmDuplicates && (
                                <button
                                  type="button"
                                  onClick={() => toggleConfirm(excelRows[idx] ?? -1)}
                                  className="ml-1.5 rounded border border-state-warning bg-state-warning-soft px-1.5 py-0.5 text-[11px] font-semibold text-state-warning-ink hover:bg-state-warning-soft-hover"
                                >
                                  {confirmDuplicates.label}
                                </button>
                              )}
                            </span>
                          ) : warn ? (
                            <span className="text-state-warning-ink text-xs">⚠️ {warn}</span>
                          ) : (
                            <span className="text-state-success-ink">✓</span>
                          )}
                        </td>
                        <td className="px-2 py-1 text-center">
                          <button
                            type="button"
                            title={`Xoá dòng ${excelRows[idx] ?? idx + 2} khỏi danh sách import`}
                            onClick={() => removeRows(new Set([idx]))}
                            className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-state-danger-soft hover:text-state-danger-ink"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </PhanTrangBang>
            {parsedRows.length > 100 && (
              <p className="p-2 text-xs text-center text-muted-foreground bg-muted">
                Hiển thị 100/{parsedRows.length} rows. Toàn bộ sẽ được import nếu hợp lệ.
                Nút ✕ chỉ hiện cho 100 dòng đầu — dùng &quot;Xoá dòng lỗi&quot; để dọn mọi dòng lỗi.
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={handleImport} disabled={validRows.length === 0 || checkingDb}>
              <Upload className="h-4 w-4 mr-1" />
              {checkingDb ? "Đang đối chiếu…" : `Import ${validRows.length} rows`}
            </Button>
            {errorCount > 0 && (
              <Button
                variant="outline"
                onClick={removeErrorRows}
                className="border-state-danger text-state-danger-ink hover:bg-state-danger-soft hover:text-state-danger-ink"
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Xoá {errorCount} dòng lỗi
              </Button>
            )}
            <Button variant="outline" onClick={reset}>
              Huỷ
            </Button>
          </div>
        </div>
      )}

      {step === "importing" && (
        <div className="border rounded-lg p-8 text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
          <p className="text-sm">Đang import {validRows.length} rows...</p>
        </div>
      )}

      {step === "done" && result && <ImportOutcome result={result} onReset={reset} />}
    </div>
  );
}

/**
 * Kết quả sau khi ghi.
 *
 * ⚠️ Các API import dùng CHUNG mảng `errors` cho hai thứ khác hẳn nhau: lỗi thật
 * (dòng KHÔNG vào được) và thông báo vô hại (dòng đã có sẵn nên bỏ qua, đã gộp con
 * vào lead cùng SĐT…). Thông báo vô hại được đánh dấu bằng tiền tố "ℹ️".
 *
 * Trước 03/08 màn này đếm tất cả là "❌ Lỗi" — nhập 37 dòng lead thật ra bảng
 * "Thành công: 6 | Lỗi: 28" trong khi KHÔNG có dòng nào hỏng. Người nhập liệu đọc
 * xong sẽ tưởng import fail và nhập lại → nhân đôi dữ liệu. Tách hai loại ra.
 */
export function ImportOutcome({
  result,
  onReset,
}: {
  result: ImportResult;
  onReset: () => void;
}) {
  const notices = result.errors.filter((e) => e.error.trimStart().startsWith("ℹ️"));
  const failures = result.errors.filter((e) => !e.error.trimStart().startsWith("ℹ️"));

  return (
    <div className="space-y-3">
      <Alert className={failures.length === 0 ? "border-state-success" : "border-state-warning"}>
        {failures.length === 0 ? (
          <CheckCircle2 className="h-4 w-4 text-state-success-ink" />
        ) : (
          <AlertCircle className="h-4 w-4 text-state-warning-ink" />
        )}
        <AlertDescription>
          ✅ Thành công: <strong>{result.success}</strong>
          {notices.length > 0 && (
            <>
              {" "}
              | ℹ️ Đã có sẵn / bỏ qua: <strong>{notices.length}</strong>
            </>
          )}
          {failures.length > 0 && (
            <>
              {" "}
              | ❌ Lỗi: <strong>{failures.length}</strong>
            </>
          )}
          {failures.length === 0 && notices.length > 0 && (
            <span className="ml-1 text-muted-foreground">— không có dòng nào lỗi.</span>
          )}
        </AlertDescription>
      </Alert>

      {failures.length > 0 && (
        <div className="max-h-[300px] overflow-y-auto rounded-lg border">
          <PhanTrangBang>
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted">
                <tr>
                  <th className="px-2 py-1 text-left">Row</th>
                  <th className="px-2 py-1 text-left">Lỗi — dòng KHÔNG được ghi</th>
                </tr>
              </thead>
              <tbody>
                {failures.map((e, i) => (
                  <tr key={i} className="border-t">
                    <td className="px-2 py-1">{e.row}</td>
                    <td className="px-2 py-1 text-state-danger-ink">{e.error}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </PhanTrangBang>
        </div>
      )}

      {notices.length > 0 && (
        <details className="rounded-lg border bg-muted">
          <summary className="cursor-pointer px-3 py-2 text-sm text-foreground">
            Ghi chú ({notices.length}) — dòng trùng đã gộp / đã có sẵn, không cần xử lý
          </summary>
          <div className="max-h-[240px] overflow-y-auto border-t bg-card">
            <PhanTrangBang>
              <table className="w-full text-sm">
                <tbody>
                  {notices.map((e, i) => (
                    <tr key={i} className="border-t first:border-t-0">
                      <td className="px-2 py-1 text-muted-foreground">{e.error}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </PhanTrangBang>
          </div>
        </details>
      )}

      <Button onClick={onReset}>Import file khác</Button>
    </div>
  );
}
