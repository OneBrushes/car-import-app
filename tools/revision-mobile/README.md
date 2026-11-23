# Revisión de mobile.de desde el PC de casa

> **Estado (23/11/2026): no instalar todavía.** En la prueba desde la conexión de casa (Telefónica, sin VPN),
> mobile.de devolvió 403 ya en la portada, tanto con Chromium como con Google Chrome manejados por Playwright: bloquea
> el navegador automatizado, no la IP. No se usan trucos para ocultar la automatización. Mientras tanto, los anuncios
> de mobile.de se revisan con Claude en Chrome: `revisar_anuncios_pendientes` + `marcar_anuncio`. El script y los
> endpoints quedan listos por si mobile.de deja de bloquear o hay acceso oficial (la Search-API de mobile.de para
> concesionarios).

mobile.de bloquea al servidor (Cloudflare) con un error 403, pero no a tu conexión de casa. Por eso los anuncios de
mobile.de de «Guardados por Claude» los revisa este script en tu PC con Windows, **una vez al día**:

- comprueba si cada anuncio sigue publicado y su precio;
- si sale **retirado dos veces seguidas**, el coche pasa a «🏷️ Vendido / retirado»;
- si **cambia el precio** (baja o sube), la app recalcula el coste y el beneficio, y guarda el precio inicial en
  «precio original».

El resto de portales (AutoScout24…) los sigue revisando el servidor entre las 06:00 y las 06:55.

## Instalación (una sola vez)

1. **Crea el archivo `.env`.** Copia `tools\revision-mobile\.env.example` como `tools\revision-mobile\.env` y pon tu
   `LOCAL_REVIEW_TOKEN`, el mismo que tiene el Worker.
2. **Prueba el script a mano** desde la carpeta del proyecto:
   ```
   npx tsx tools/revision-mobile/revisar.ts --simular --max 5
   ```
   Abre una ventana de Chromium, revisa 5 anuncios y lo apunta todo en `tools\revision-mobile\logs\AAAA-MM-DD.log`
   sin guardar nada. Si sale bien, prueba sin `--simular`.
3. **Instala la tarea** en PowerShell:
   ```
   powershell -ExecutionPolicy Bypass -File tools\revision-mobile\instalar-tarea.ps1
   ```
   Esto crea la tarea «NorDrive - revision mobile.de» con tres disparadores:
   - cada día a las **06:00**, con «Activar el equipo para ejecutar esta tarea»;
   - **al iniciar sesión**;
   - **al iniciar el sistema**, 2 minutos después para esperar a la red.

   Además deja activado «Ejecutar la tarea lo antes posible si se omitió un inicio programado» y los temporizadores
   de reactivación del plan de energía.

## Lo importante

- **Deja el PC en SUSPENSIÓN, no apagado.** Desde la suspensión, Windows lo despierta a las 06:00. Si está apagado,
  la revisión se hace en cuanto lo enciendas e inicies sesión.
- **Sin VPN.** Con VPN, mobile.de bloquea. Antes de empezar, el script mira:
  - si hay un adaptador de VPN activo (NordVPN, WireGuard, OpenVPN…);
  - si la IP es de un servidor o de VPN, o sale por un país que no es España (lo consulta en ipinfo.io).

  Si hay VPN o no hay internet, reintenta cada 5 minutos durante 1 hora. Después avisa con una notificación de
  Windows y lo apunta en el log.
- **Una sola revisión al día.** El script guarda la fecha de la última revisión completada, en `estado.json` y en la
  tabla `revisiones`. Si ya se hizo hoy, sale sin hacer nada. Así da igual cuántas veces salte la tarea.
- **Si mobile.de bloquea a mitad de la revisión** (403 o captcha):
  - no marca nada;
  - espera 5 minutos y sigue más despacio;
  - al tercer bloqueo seguido, para y avisa.

  Si ya bloquea la **primera** consulta, no sigue: casi seguro hay una VPN.
- **Ritmo:** de 0,9 a 1,6 segundos entre anuncios, unos 2,5 minutos para 90 coches.
- **Volver a suspender:** con `SUSPENDER_AL_TERMINAR=1` en `.env`, el PC se vuelve a suspender al terminar, pero solo
  si nadie lo está usando (más de 5 minutos sin tocar el teclado ni el ratón).

## Archivos

| Archivo | Qué es |
|---|---|
| `revisar.ts` | El script |
| `comun.ts` | Detección de VPN y comprobación de «ya hecho hoy» (con tests) |
| `instalar-tarea.ps1` | Instala o quita la tarea (`-Quitar`) |
| `.env` | Configuración. **No se sube a git** |
| `logs\AAAA-MM-DD.log` | Log de cada día. `tarea.log` guarda la salida de la tarea |
| `estado.json` | Fecha de la última revisión completada |
| `perfil\` | Perfil del navegador (cookies de mobile.de) |

## Comprobar que funciona

- **En claude.ai**, pídele a Claude «resumen de la revisión»: usa la herramienta `resumen_revision` y te da por día lo
  que revisó el servidor y lo que revisó el PC de casa.
- **En el PC:**
  - `Get-ScheduledTask -TaskName "NorDrive - revision mobile.de" | Get-ScheduledTaskInfo` muestra la última ejecución
    y su resultado.
  - Los códigos de salida son: 0 = bien, 2 = no había red o había VPN, 3 = revisión incompleta, 1 = error.
