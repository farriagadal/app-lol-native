@echo off
REM Lanzador (doble clic): abre PowerShell y ejecuta start.ps1, que pregunta
REM que iniciar (app de escritorio, back office, o ambos).
powershell -ExecutionPolicy Bypass -NoProfile -File "%~dp0start.ps1"
