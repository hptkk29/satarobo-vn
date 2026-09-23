<#
.SYNOPSIS
  Kiểm tra Postgres local (scoop) có THẬT SỰ nhận kết nối không, và dựng lại nếu không.

.DESCRIPTION
  Vì sao cần script này thay vì `pg_ctl status`:
  `pg_ctl status` chỉ đọc `postmaster.pid` rồi hỏi Windows "PID này còn sống không".
  Khi máy chủ chết giữa chừng, file pid NẰM LẠI; Windows lại cấp phát PID vòng lại rất
  nhanh, nên một tiến trình khác trùng PID là `pg_ctl status` báo "server is running"
  trong khi không có gì nghe ở cổng 5432. Đó là lý do bộ test "SKIP sạch" mà không ai
  thấy đỏ. Script này hỏi bằng `pg_isready` — tức là thật sự bắt tay ở cổng.

.NOTES
  KHÔNG tự chạy nền, KHÔNG cài dịch vụ, KHÔNG sửa postgresql.conf.
  Chạy tay khi nghi Postgres chết:  pwsh -File scripts\pg-local-hoi-phuc.ps1
  Chỉ xem, không sửa:               pwsh -File scripts\pg-local-hoi-phuc.ps1 -ChiKiemTra

  Nền: docs/runbook-postgres-local-windows.md
#>
[CmdletBinding()]
param(
  # Chỉ chẩn đoán rồi in ra, không đụng vào gì.
  [switch]$ChiKiemTra,
  [string]$ThuMucGoc = "$env:USERPROFILE\scoop\apps\postgresql\current",
  [int]$Cong = 5432,
  # Số giây chờ máy chủ nhận kết nối sau khi khởi động. Phục hồi sau khi chết bẩn phải
  # đọc lại WAL — lần lâu nhất đo được trong nhật ký là ~5 phút (06/09), nên đừng hạ
  # xuống 30 giây rồi kết luận là "khởi động thất bại".
  [int]$ChoGiay = 360
)

$ErrorActionPreference = 'Stop'
$bin  = Join-Path $ThuMucGoc 'bin'
$data = Join-Path $ThuMucGoc 'data'
$log  = Join-Path $ThuMucGoc 'pg.log'
$tepPid  = Join-Path $data 'postmaster.pid'

function Ghi($muc, $chu, $mau = 'Gray') { Write-Host ("  {0,-16}" -f $muc) -NoNewline; Write-Host $chu -ForegroundColor $mau }

if (-not (Test-Path $bin)) { Write-Host "Không thấy Postgres ở $ThuMucGoc" -ForegroundColor Red; exit 2 }

Write-Host "`n=== Postgres local — kiểm tra ===" -ForegroundColor Cyan

# ── 1. Câu hỏi DUY NHẤT đáng tin: cổng có nhận kết nối không ──────────────────
& "$bin\pg_isready.exe" -h 127.0.0.1 -p $Cong -q 2>$null
$song = ($LASTEXITCODE -eq 0)
Ghi 'pg_isready' $(if ($song) { 'đang nhận kết nối' } else { 'KHÔNG nhận kết nối' }) $(if ($song) { 'Green' } else { 'Red' })

# ── 2. Đối chiếu với thứ hay nói dối, để thấy rõ khi chúng lệch nhau ──────────
$coPid = Test-Path $tepPid
$soPid = if ($coPid) { (Get-Content $tepPid -TotalCount 1).Trim() } else { $null }
$tienTrinh = @(Get-Process postgres -ErrorAction SilentlyContinue)
Ghi 'postmaster.pid' $(if ($coPid) { "có (PID $soPid)" } else { 'không có' })
Ghi 'postgres.exe'   "$($tienTrinh.Count) tiến trình"

if ($song) {
  Ghi 'Kết luận' 'Bình thường — không cần làm gì.' 'Green'
  exit 0
}

# ── 3. Đã chết. Nói rõ chết KIỂU GÌ trước khi dựng lại ───────────────────────
if ($coPid) {
  Ghi 'CHẨN ĐOÁN' 'File pid còn nhưng cổng câm ⇒ đúng ca `pg_ctl status` nói dối.' 'Yellow'
}
if (Test-Path $log) {
  $dau = Get-Content $log -Tail 40 |
    Select-String -Pattern 'error code 1455|error code 487|0xC000012D|0xC0000142|0x40010004|could not fork|FATAL' |
    Select-Object -Last 3
  if ($dau) {
    Write-Host "  Dấu vết cuối trong pg.log:" -ForegroundColor Yellow
    $dau | ForEach-Object { Write-Host "    $($_.Line.Trim())" -ForegroundColor DarkYellow }
    if ($dau -match '1455|0xC000012D|0xC0000142') {
      Ghi 'NGHĨA LÀ' 'Hết hạn mức commit của Windows — KHÔNG phải lỗi Postgres.' 'Red'
      Ghi '' 'Dựng lại được, nhưng sẽ chết lại. Xem mục 3 của runbook (pagefile).' 'Red'
    }
    if ($dau -match '0x40010004') {
      Ghi 'NGHĨA LÀ' 'Ctrl+Break dội vào nhóm tiến trình — máy chủ bị khai tử theo' 'Red'
      Ghi '' 'cửa sổ đã khởi động nó. Xem mục 4 của runbook (chạy tách console).' 'Red'
    }
  }
}

if ($ChiKiemTra) { Ghi 'Chế độ' '-ChiKiemTra: dừng ở đây, không sửa.' 'Cyan'; exit 1 }

# ── 4. Dựng lại ──────────────────────────────────────────────────────────────
Write-Host "`n=== Dựng lại ===" -ForegroundColor Cyan

# 4a. Hạ hẳn. `-m immediate` vì máy chủ đã không phản hồi — `fast` sẽ ngồi chờ
#     những tiến trình con vốn đã chết.
try { & "$bin\pg_ctl.exe" -D $data -m immediate stop 2>&1 | Out-Null } catch { }
Ghi 'stop -m immediate' 'đã gọi'

# 4b. Tiến trình mồ côi còn sót thì phải đi, không thì bước sau đụng khoá file.
$conLai = @(Get-Process postgres -ErrorAction SilentlyContinue)
if ($conLai.Count -gt 0) {
  $conLai | Stop-Process -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 2
  Ghi 'dọn tiến trình' "$($conLai.Count) tiến trình mồ côi"
}

# 4c. Giờ mới được xoá file pid — sau khi chắc không còn ai chạy. Xoá lúc máy chủ
#     còn sống là mở đường cho instance thứ hai ghi đè lên cùng thư mục data.
if (Test-Path $tepPid) {
  if (@(Get-Process postgres -ErrorAction SilentlyContinue).Count -gt 0) {
    Ghi 'postmaster.pid' 'VẪN CÒN tiến trình postgres — KHÔNG xoá. Dừng lại.' 'Red'
    exit 3
  }
  Remove-Item $tepPid -Force
  Ghi 'postmaster.pid' 'đã xoá (chắc chắn không còn tiến trình nào)'
}

# 4d. Khởi động TÁCH khỏi console đang gọi. Đây là điểm khác biệt với việc gõ
#     `pg_ctl start` thẳng trong terminal: cửa sổ này đóng/bị giết thì Windows dội
#     CTRL_BREAK vào cả nhóm tiến trình, và máy chủ chết theo (dấu 0x40010004).
Start-Process -FilePath "$bin\pg_ctl.exe" `
  -ArgumentList @('-D', "`"$data`"", '-l', "`"$log`"", '-o', "`"-p $Cong`"", 'start') `
  -WindowStyle Hidden
Ghi 'start' 'đã gọi (tách khỏi cửa sổ này)'

# 4e. Chờ tới khi THẬT SỰ nhận kết nối.
$het = (Get-Date).AddSeconds($ChoGiay)
$xong = $false
while ((Get-Date) -lt $het) {
  Start-Sleep -Seconds 3
  & "$bin\pg_isready.exe" -h 127.0.0.1 -p $Cong -q 2>$null
  if ($LASTEXITCODE -eq 0) { $xong = $true; break }
}

Write-Host ''
if ($xong) {
  Ghi 'KẾT QUẢ' 'Postgres đã nhận kết nối trở lại.' 'Green'
  exit 0
}
Ghi 'KẾT QUẢ' "Quá $ChoGiay giây vẫn chưa nhận kết nối." 'Red'
Ghi '' "Đọc đuôi nhật ký: Get-Content '$log' -Tail 40" 'Red'
exit 1
