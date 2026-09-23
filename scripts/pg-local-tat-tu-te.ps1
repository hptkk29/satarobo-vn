# Tắt Postgres local (scoop) TỬ TẾ — chạy TRƯỚC khi tắt/khởi động lại máy.
#
# VÌ SAO CÓ SCRIPT NÀY — con số, không phải cảm giác:
# đo trên nhật ký 25/08 → 18/09/2026: **9 lần khởi động, 8 lần chết bẩn**
# (`database system was not properly shut down`). Tức là chưa lần nào máy chủ được tắt
# đúng cách. Cái đắt KHÔNG phải lần chết — mà là **hồi phục sau đó**: đo 18/09, pha
# `syncing data directory` mất ~12 phút, cộng pha `redo in progress` vài phút nữa. Trong
# quãng đó `pnpm build` và mọi bộ test chạm DB đều ĐỎ, và nó **trông y hệt mã hỏng**
# (`PrismaClientInitializationError`), nên còn tốn thêm thời gian đi truy nhầm chỗ.
#
# ⚠️ Script này KHÔNG chữa nguyên nhân gốc (hết hạn mức commit của Windows — xem mục 3
# của runbook). Nó cắt phần lớn CHI PHÍ: chết bẩn vì crash thì không tránh được bằng
# script, nhưng chết bẩn vì "tắt máy lúc Postgres đang chạy" thì tránh được hoàn toàn.
#
# .NOTES
#   Chạy tay:        pwsh -File scripts\pg-local-tat-tu-te.ps1
#   Từ repo:         pnpm pg:stop
#   Chỉ xem:         pwsh -File scripts\pg-local-tat-tu-te.ps1 -ChiKiemTra
#   KHÔNG cần quyền admin. KHÔNG cài dịch vụ, KHÔNG sửa postgresql.conf.
#   Nền: docs/runbook-postgres-local-windows.md
[CmdletBinding()]
param(
  # Chỉ nói đang ở trạng thái nào, không đụng vào gì.
  [switch]$ChiKiemTra,
  [string]$ThuMucGoc = "$env:USERPROFILE\scoop\apps\postgresql\current",
  [int]$Cong = 5432,
  # Chờ tối đa bao lâu cho lượt tắt. `-m fast` phải ghi xong checkpoint cuối; DB này
  # ~80 MB nên vài giây là đủ, để 60 cho máy đang bận.
  [int]$ChoGiay = 60
)

# Ép đầu ra UTF-8. Không có dòng này thì console Windows (codepage 437/1258) in mọi
# chữ tiếng Việt thành `?`, kể cả dòng cảnh báo "ĐỪNG tắt máy lúc này" — và một cảnh báo
# đọc không nổi là một cảnh báo bị bỏ qua.
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

$ErrorActionPreference = 'Stop'
$bin = Join-Path $ThuMucGoc 'bin'
$data = Join-Path $ThuMucGoc 'data'

function Ghi($muc, $chu, $mau = 'Gray') {
  Write-Host ("  {0,-16}" -f $muc) -NoNewline
  Write-Host $chu -ForegroundColor $mau
}

if (-not (Test-Path $bin)) {
  Write-Host "Không thấy Postgres ở $ThuMucGoc" -ForegroundColor Red
  exit 2
}

Write-Host "`n=== Postgres local — tắt tử tế ===" -ForegroundColor Cyan

# ── 1. Câu hỏi DUY NHẤT đáng tin ────────────────────────────────────────────────
# `pg_ctl status` chỉ đọc `postmaster.pid` rồi hỏi Windows "PID này còn sống không" —
# và Windows cấp phát PID vòng lại rất nhanh, nên nó nói dối được cả hai chiều. Hỏi
# bằng `pg_isready` là thật sự bắt tay ở cổng. (Bẫy thứ ba trong runbook.)
& "$bin\pg_isready.exe" -h 127.0.0.1 -p $Cong -q 2>$null
$dangSong = ($LASTEXITCODE -eq 0)

if (-not $dangSong) {
  Ghi 'cổng 5432' 'không nhận kết nối' 'Yellow'
  # Phân biệt "đã tắt rồi" với "đang hồi phục" — tắt máy giữa lúc hồi phục là quay lại
  # vạch xuất phát, và lần sau còn lâu hơn.
  & "$bin\pg_isready.exe" -h 127.0.0.1 -p $Cong 2>$null | Out-Null
  $ma = $LASTEXITCODE
  if ($ma -eq 1) {
    Ghi 'trạng thái' 'ĐANG KHỞI ĐỘNG / HỒI PHỤC — ĐỪNG tắt máy lúc này' 'Red'
    Write-Host ""
    Write-Host "  Máy chủ đang chạy crash recovery. Tắt máy bây giờ là bỏ dở và lần sau" -ForegroundColor Yellow
    Write-Host "  phải làm lại từ đầu. Xem nó còn TIẾN không:" -ForegroundColor Yellow
    Write-Host "    Get-Content '$ThuMucGoc\pg.log' -Tail 3" -ForegroundColor DarkGray
    # Nháy ĐƠN: trong chuỗi nháy kép của PowerShell, dấu huyền là ký tự THOÁT —
    # viết `current path` trong nháy kép là lỗi cú pháp, không phải chữ.
    Write-Host '  "current path" (pha 1) hoặc "current LSN" (pha 2) còn đổi = còn tiến, cứ chờ.' -ForegroundColor DarkGray
    exit 3
  }
  Ghi 'trạng thái' 'đã tắt sẵn — không cần làm gì' 'Green'
  exit 0
}

Ghi 'cổng 5432' 'đang nhận kết nối' 'Green'

# ── 2. Ai đang nối vào? Chỉ để NÓI, không để chặn ──────────────────────────────
# `-m fast` sẽ ngắt các phiên này và cuộn ngược giao dịch đang dở — đó là hành vi ĐÚNG
# khi sắp tắt máy. Nhưng người chạy có quyền biết mình sắp ngắt cái gì: một `pnpm dev`
# đang mở hay một lượt test đang chạy thì nên để nó xong trước.
try {
  $env:PGPASSWORD = 'postgres'
  $soPhien = & "$bin\psql.exe" -w -h 127.0.0.1 -p $Cong -U postgres -d postgres -Atc `
    "SELECT count(*) FROM pg_stat_activity WHERE pid <> pg_backend_pid() AND backend_type = 'client backend';" 2>$null
  if ($LASTEXITCODE -eq 0 -and $soPhien) {
    $n = [int]$soPhien
    if ($n -gt 0) {
      Ghi 'phiên đang mở' "$n — sẽ bị ngắt (fast: cuộn ngược giao dịch dở)" 'Yellow'
    } else {
      Ghi 'phiên đang mở' '0' 'Gray'
    }
  }
} catch {
  Ghi 'phiên đang mở' 'không đếm được (bỏ qua)' 'DarkGray'
} finally {
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}

if ($ChiKiemTra) {
  Write-Host "`n  -ChiKiemTra: dừng ở đây, chưa tắt gì.`n" -ForegroundColor Cyan
  exit 0
}

# ── 3. Tắt — `fast`, không phải `smart`, không phải `immediate` ────────────────
#   smart      chờ MỌI phiên tự đóng ⇒ một tab `psql` quên đóng là treo mãi ⇒ người ta
#              sốt ruột tắt máy ⇒ đúng thứ script này sinh ra để tránh.
#   fast       ngắt phiên, cuộn ngược giao dịch dở, GHI CHECKPOINT rồi thoát sạch. ĐÚNG.
#   immediate  không checkpoint — lần sau khởi động là CHẾT BẨN. Tức là tự tay tạo ra
#              đúng cái ta đang tránh. Đừng bao giờ dùng ở đây.
Write-Host ""
Ghi 'đang tắt' 'pg_ctl stop -m fast …' 'Cyan'
& "$bin\pg_ctl.exe" -D $data -m fast -w -t $ChoGiay stop 2>&1 | ForEach-Object {
  Write-Host "    $_" -ForegroundColor DarkGray
}
$maThoat = $LASTEXITCODE

# ── 4. KIỂM LẠI bằng cổng, đừng tin mã thoát ──────────────────────────────────
# Cùng lý do với bước 1: `pg_ctl` báo cáo theo file pid. Thứ chứng minh đã tắt là
# KHÔNG CÒN AI NGHE ở cổng.
Start-Sleep -Milliseconds 500
& "$bin\pg_isready.exe" -h 127.0.0.1 -p $Cong -q 2>$null
$conSong = ($LASTEXITCODE -eq 0)

Write-Host ""
if (-not $conSong) {
  Ghi 'kết quả' 'ĐÃ TẮT SẠCH — tắt máy được rồi' 'Green'
  # Dấu vết để lần sau đối chiếu: lần khởi động kế tiếp PHẢI KHÔNG có dòng
  # "database system was not properly shut down" trong pg.log.
  Write-Host "  Lần khởi động sau, pg.log KHÔNG được có dòng 'was not properly shut down'." -ForegroundColor DarkGray
  exit 0
}

Ghi 'kết quả' "VẪN CÒN NGHE Ở CỔNG (pg_ctl thoát $maThoat)" 'Red'
Write-Host ""
Write-Host "  Chưa tắt được. Thường là còn phiên giữ khoá lâu. Xem ai đang nối:" -ForegroundColor Yellow
Write-Host ('    $env:PGPASSWORD=''postgres''; & "' + $bin + '\psql.exe" -w -h 127.0.0.1 -U postgres -d postgres -c "SELECT pid, state, left(query,60) FROM pg_stat_activity WHERE backend_type=''client backend'';"') -ForegroundColor DarkGray
Write-Host ""
Write-Host "  ⚠️ ĐỪNG dùng -m immediate để ép: nó bỏ checkpoint, và lần khởi động sau" -ForegroundColor Yellow
Write-Host "     sẽ CHẾT BẨN — đúng thứ script này sinh ra để tránh." -ForegroundColor Yellow
exit 1
