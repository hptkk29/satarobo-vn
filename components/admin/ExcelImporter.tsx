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

export interface ImportResult {
  success: number;
  errors: { row: number; error: string }[];
}

export interface ExcelImporterProps<T> {
  templateUrl: string;
  templateFilename: string;
  parseRow: (row: Record<string, unknown>, rowIndex: number) => T | { error: string };
  onImport: (rows: T[]) => Promise<ImportResult>;
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
   * Trả về Map<số dòng Excel, thông báo lỗi> cho các dòng trùng dữ liệu cũ.
   * Lỗi network → trả Map rỗng (server import vẫn tự chặn — đây chỉ là UX).
   */
  checkExisting?: (
    raws: Record<string, unknown>[],
    excelRows: number[],
  ) => Promise<Map<number, string>>;
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
        setStep("preview");
        if (checkExisting) {
          setCheckingDb(true);
          checkExisting(rows, excelNos)
            .then((m) => setDbDup(m))
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

  const validRows = parsedRows.filter(
    (r, i): r is T =>
      !isErrorRow(r) && !dupErrors.has(i) && !dbDup.has(excelRows[i] ?? -1),
  );
  const errorCount = parsedRows.length - validRows.length;

  const handleImport = async () => {
    setStep("importing");
    try {
      const res = await onImport(validRows);
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
            isErrorRow(row) || dupErrors.has(i) || dbDup.has(excelRows[i] ?? -1)
              ? i
              : -1,
          )
          .filter((i) => i >= 0),
      ),
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">{title}</h3>
        <a
          href={templateUrl}
          download={templateFilename}
          className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
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
              : "border-gray-300 hover:border-gray-400",
          )}
        >
          <input {...getInputProps()} />
          <FileSpreadsheet className="h-12 w-12 mx-auto text-gray-400 mb-3" />
          <p className="font-medium">Kéo thả file Excel hoặc click để chọn</p>
          <p className="text-xs text-gray-500 mt-1">
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
              <strong className="text-green-600">{validRows.length}</strong> | ❌ Lỗi:{" "}
              <strong className="text-red-600">{errorCount}</strong>
              {checkingDb && (
                <span className="ml-2 inline-flex items-center gap-1 text-xs text-gray-500">
                  <Loader2 className="h-3 w-3 animate-spin" /> đang đối chiếu dữ liệu có sẵn…
                </span>
              )}
            </AlertDescription>
          </Alert>
          <div className="border rounded-lg overflow-x-auto max-h-[400px]">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-2 py-1 text-left">#</th>
                  {columnHints.map((c) => (
                    <th key={c.key} className="px-2 py-1 text-left">
                      {c.label}
                      {c.required && <span className="text-red-500">*</span>}
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
                  const errored = isErrorRow(row) || dupError !== undefined;
                  return (
                    <tr key={`${excelRows[idx] ?? idx}`} className={cn("border-t", errored && "bg-red-50")}>
                      <td className="px-2 py-1">{excelRows[idx] ?? idx + 2}</td>
                      {columnHints.map((c) => (
                        <td key={c.key} className="px-2 py-1 truncate max-w-[200px]">
                          {String(rawRows[idx]?.[c.key] ?? "—")}
                        </td>
                      ))}
                      <td className="px-2 py-1">
                        {isErrorRow(row) ? (
                          <span className="text-red-600 text-xs">{row.error}</span>
                        ) : dupError ? (
                          <span className="text-red-600 text-xs">{dupError}</span>
                        ) : (
                          <span className="text-green-600">✓</span>
                        )}
                      </td>
                      <td className="px-2 py-1 text-center">
                        <button
                          type="button"
                          title={`Xoá dòng ${excelRows[idx] ?? idx + 2} khỏi danh sách import`}
                          onClick={() => removeRows(new Set([idx]))}
                          className="inline-flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:bg-red-100 hover:text-red-600"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {parsedRows.length > 100 && (
              <p className="p-2 text-xs text-center text-gray-500 bg-gray-50">
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
                className="border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700"
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

      {step === "done" && result && (
        <div className="space-y-3">
          <Alert className={result.errors.length === 0 ? "border-green-500" : "border-yellow-500"}>
            {result.errors.length === 0 ? (
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            ) : (
              <AlertCircle className="h-4 w-4 text-yellow-600" />
            )}
            <AlertDescription>
              ✅ Thành công: <strong>{result.success}</strong>
              {result.errors.length > 0 && (
                <>
                  {" "}
                  | ❌ Lỗi: <strong>{result.errors.length}</strong>
                </>
              )}
            </AlertDescription>
          </Alert>
          {result.errors.length > 0 && (
            <div className="border rounded-lg max-h-[300px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-2 py-1 text-left">Row</th>
                    <th className="px-2 py-1 text-left">Lỗi</th>
                  </tr>
                </thead>
                <tbody>
                  {result.errors.map((e, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-2 py-1">{e.row}</td>
                      <td className="px-2 py-1 text-red-600">{e.error}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Button onClick={reset}>Import file khác</Button>
        </div>
      )}
    </div>
  );
}
