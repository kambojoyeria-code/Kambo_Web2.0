@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo.
echo  ==============================================
echo   KAMBO Fine Jewelry - Extractor de Frames
echo  ==============================================
echo.

REM Verificar ffmpeg
ffmpeg -version >nul 2>&1
if errorlevel 1 (
    echo  ERROR: ffmpeg no esta instalado o no esta en el PATH.
    echo.
    echo  Solucion:
    echo   1. Descarga ffmpeg desde: https://www.gyan.dev/ffmpeg/builds/
    echo   2. Elige "release essentials" (el zip mas pequeno)
    echo   3. Extrae y copia "ffmpeg.exe" a esta carpeta: %~dp0
    echo   4. Vuelve a ejecutar este archivo
    echo.
    pause
    exit /b 1
)

echo  ffmpeg encontrado. Continuando...
echo.

REM Crear carpeta de frames
if not exist "assets\frames" mkdir "assets\frames"

REM Limpiar frames anteriores si existen
del /q "assets\frames\frame_*.webp" 2>nul

echo  Obteniendo informacion del video...

REM Obtener dimensiones
for /f "tokens=1 delims=," %%W in ('ffprobe -v quiet -select_streams v:0 -show_entries stream=width -of csv=p=0 video.mp4 2^>nul') do set VW=%%W
for /f "tokens=1 delims=," %%H in ('ffprobe -v quiet -select_streams v:0 -show_entries stream=height -of csv=p=0 video.mp4 2^>nul') do set VH=%%H
for /f "tokens=1 delims=/" %%R in ('ffprobe -v quiet -select_streams v:0 -show_entries stream=r_frame_rate -of csv=p=0 video.mp4 2^>nul') do set VFPS=%%R

echo  Resolucion: !VW! x !VH!  FPS: !VFPS!
echo.
echo  Extrayendo frames como WebP (calidad maxima)...
echo  Esto puede tomar 1-3 minutos dependiendo de la duracion del video.
echo.

ffmpeg -i video.mp4 -vsync 0 -frame_pts true -q:v 1 "assets/frames/frame_%%04d.webp" -y

echo.
echo  Contando frames extraidos...
set FRAMECOUNT=0
for %%f in ("assets\frames\frame_*.webp") do set /a FRAMECOUNT+=1

echo  Total de frames: !FRAMECOUNT!
echo.

if !FRAMECOUNT! EQU 0 (
    echo  ERROR: No se extrajeron frames. Verifica que video.mp4 existe y no esta corrupto.
    pause
    exit /b 1
)

echo  Generando archivo de configuracion JavaScript...

(
echo // Generado automaticamente por extract_frames.bat
echo // NO editar manualmente - ejecuta extract_frames.bat para regenerar
echo const FRAME_CONFIG = {
echo   count: !FRAMECOUNT!,
echo   width: !VW!,
echo   height: !VH!,
echo   fps: !VFPS!,
echo   folder: 'assets/frames/',
echo   prefix: 'frame_',
echo   extension: '.webp'
echo };
) > "js/frame-config.js"

echo  Archivo creado: js/frame-config.js
echo.
echo  ==============================================
echo   COMPLETADO exitosamente!
echo   !FRAMECOUNT! frames listos en assets/frames/
echo  ==============================================
echo.
echo  Abre index.html en el navegador para ver el
echo  efecto de scroll video funcionando.
echo.
pause
