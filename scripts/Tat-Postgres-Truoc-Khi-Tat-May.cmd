@echo off
rem  Bấm đúp tệp này TRƯỚC KHI TẮT MÁY.
rem
rem  Vì sao có bản .cmd riêng thay vì gọi thẳng .ps1: bấm đúp một tệp .ps1 trên Windows
rem  mặc định MỞ NOTEPAD chứ không chạy, và `ExecutionPolicy` có thể chặn. Bản này gọi
rem  PowerShell với `-ExecutionPolicy Bypass` cho ĐÚNG tiến trình này — không đổi chính
rem  sách của máy, không cần quyền admin.
rem
rem  Nền: docs/runbook-postgres-local-windows.md  (9 lần khởi động / 8 lần chết bẩn)

rem  Cua so console mac dinh dung codepage 437/1258 -> chu tieng Viet trong script
rem  PowerShell hien thanh "?". 65001 = UTF-8.
chcp 65001 >nul

setlocal
set "SCRIPT=%~dp0pg-local-tat-tu-te.ps1"

where pwsh >nul 2>&1
if %ERRORLEVEL%==0 (
  pwsh -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%"
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%"
)
set "MA=%ERRORLEVEL%"

echo.
if "%MA%"=="0" (
  echo   Xong - tat may duoc roi.
) else if "%MA%"=="3" (
  echo   *** DUNG TAT MAY *** Postgres dang hoi phuc, xem huong dan o tren.
) else (
  echo   Chua tat duoc - doc phan mau vang o tren truoc khi tat may.
)
echo.
echo   Nhan phim bat ky de dong cua so nay...
pause >nul
endlocal
exit /b %MA%
