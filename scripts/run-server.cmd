@echo off
setlocal
cd /d "%~dp0.."
set NODE_ENV=production
"C:\Program Files\nodejs\npm.cmd" start
