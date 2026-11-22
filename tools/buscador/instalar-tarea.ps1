# Instala (o actualiza) la tarea "NorDrive - búsqueda de coches" del Programador de tareas de Windows:
# cada noche a las 02:00 ejecuta tools/buscador/run.ts con tu usuario (la IA usa tu sesión de Claude Code).
#
#   powershell -ExecutionPolicy Bypass -File tools\buscador\instalar-tarea.ps1
#   powershell -ExecutionPolicy Bypass -File tools\buscador\instalar-tarea.ps1 -Quitar
param([switch]$Quitar, [string]$Hora = "02:00")

$nombre = "NorDrive - busqueda de coches"
if ($Quitar) {
    Unregister-ScheduledTask -TaskName $nombre -Confirm:$false -ErrorAction SilentlyContinue
    Write-Host "Tarea quitada."
    return
}

$repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$logs = Join-Path $PSScriptRoot "informes"
New-Item -ItemType Directory -Force $logs | Out-Null
$npx = (Get-Command npx.cmd -ErrorAction Stop).Source

# cmd /c para poder redirigir la salida a un log por noche
$cmd = "cd /d `"$repo`" && `"$npx`" tsx tools\buscador\run.ts >> `"$logs\noche-%date:~-4%%date:~3,2%%date:~0,2%.log`" 2>&1"
$accion = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c $cmd" -WorkingDirectory $repo
$disparador = New-ScheduledTaskTrigger -Daily -At $Hora
# Despierta el PC si está en suspensión; si a las 02:00 estaba apagado, la lanza al encenderlo; máximo 4 h
$ajustes = New-ScheduledTaskSettingsSet -WakeToRun -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 4) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $nombre -Action $accion -Trigger $disparador -Settings $ajustes -Principal $principal -Force | Out-Null
Write-Host "Tarea '$nombre' instalada: cada día a las $Hora. Logs en $logs"
Write-Host "Probar ahora:  Start-ScheduledTask -TaskName '$nombre'"
