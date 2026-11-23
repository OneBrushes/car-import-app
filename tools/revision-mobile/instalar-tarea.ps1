# Instala (o actualiza) la tarea "NorDrive - revision mobile.de" del Programador de tareas de Windows.
# Revisa una vez al día los anuncios de mobile.de desde la conexión de casa (tools/revision-mobile/revisar.ts).
#
#   powershell -ExecutionPolicy Bypass -File tools\revision-mobile\instalar-tarea.ps1
#   powershell -ExecutionPolicy Bypass -File tools\revision-mobile\instalar-tarea.ps1 -Hora 06:00
#   powershell -ExecutionPolicy Bypass -File tools\revision-mobile\instalar-tarea.ps1 -Quitar
#
# Disparadores: cada día a las 06:00 (despierta el PC de la suspensión), al iniciar sesión y al iniciar el sistema
# (2 min de retraso para esperar la red). Si se omitió la de las 06:00, se lanza en cuanto se pueda.
# El script sale sin hacer nada si la revisión de hoy ya está hecha: se hace UNA vez al día, sea cual sea el disparador.
param([switch]$Quitar, [string]$Hora = "06:00")

$nombre = "NorDrive - revision mobile.de"
if ($Quitar) {
    Unregister-ScheduledTask -TaskName $nombre -Confirm:$false -ErrorAction SilentlyContinue
    Write-Host "Tarea quitada."
    return
}

$repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$logs = Join-Path $PSScriptRoot "logs"
New-Item -ItemType Directory -Force $logs | Out-Null
$npx = (Get-Command npx.cmd -ErrorAction Stop).Source

if (-not (Test-Path (Join-Path $PSScriptRoot ".env"))) {
    Write-Warning "Falta tools\revision-mobile\.env (copia .env.example y pon LOCAL_REVIEW_TOKEN). La tarea se instala igualmente."
}

# cmd /c para guardar también la salida de npx en el log del día (el script escribe además su propio log)
$cmd = "cd /d `"$repo`" && `"$npx`" tsx tools\revision-mobile\revisar.ts >> `"$logs\tarea.log`" 2>&1"
$accion = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c $cmd" -WorkingDirectory $repo

$diario = New-ScheduledTaskTrigger -Daily -At $Hora
$sesion = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$arranque = New-ScheduledTaskTrigger -AtStartup
$arranque.Delay = "PT2M"   # 2 minutos para que haya red

# WakeToRun = "Activar el equipo para ejecutar esta tarea"; StartWhenAvailable = "Ejecutar la tarea lo antes posible si se
# omitió un inicio programado"; IgnoreNew = si ya está en marcha (p. ej. sesión + arranque a la vez), no se lanza otra.
# Máximo 2 h (el script espera hasta 1 h a tener red sin VPN y, si mobile.de bloquea, hasta 15 min más).
$ajustes = New-ScheduledTaskSettingsSet -WakeToRun -StartWhenAvailable -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit (New-TimeSpan -Hours 2) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -RestartCount 2 -RestartInterval (New-TimeSpan -Minutes 10)
# Con tu usuario y "solo si la sesión está iniciada": el navegador necesita tu escritorio. Al iniciar el sistema solo
# correrá si la sesión se abre sola; si no, la lanza el disparador "al iniciar sesión".
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $nombre -Action $accion -Trigger @($diario, $sesion, $arranque) -Settings $ajustes -Principal $principal -Force | Out-Null

# Permitir que las tareas despierten el PC ("Permitir temporizadores de reactivación" en el plan de energía actual)
$sub = "238c9fa8-0aad-41ed-83f4-97be242c8f20"   # Suspender
$rtc = "bd3b718a-0680-4d9d-8ab2-e1d2b4ac806d"   # Permitir temporizadores de reactivación
powercfg /SETACVALUEINDEX SCHEME_CURRENT $sub $rtc 1 | Out-Null
powercfg /SETDCVALUEINDEX SCHEME_CURRENT $sub $rtc 1 | Out-Null
powercfg /SETACTIVE SCHEME_CURRENT | Out-Null

Write-Host "Tarea '$nombre' instalada:"
Write-Host "  · cada día a las $Hora (despierta el PC si está en SUSPENSIÓN)"
Write-Host "  · al iniciar sesión y al iniciar el sistema (+2 min)"
Write-Host "  · solo una revisión al día; logs en $logs"
Write-Host "Temporizadores de reactivación activados en el plan de energía actual."
Write-Host "Probar ahora:  Start-ScheduledTask -TaskName '$nombre'"
