# Scripts de Supabase

## El único script que hay que ejecutar

**`2026-10_seguridad_y_funciones.sql`** — en Supabase → SQL Editor → pegar entero → Run.

- Se puede ejecutar varias veces sin romper nada.
- Borra todas las reglas de seguridad antiguas de las tablas de la app y crea las buenas.
- Crea las tablas de clientes, recordatorios, ajustes de empresa e historial de coches.
- Pone privados los documentos y las facturas.

Si alguna vez cambias de proyecto de Supabase, **ejecútalo siempre al final**, después de cualquier otro script.

## `legacy/`

Scripts antiguos que crearon las tablas base (notificaciones, ajustes, checklist, métricas…).
Algunos traen reglas de seguridad **inseguras** (por ejemplo, lectura pública de las checklists o buckets abiertos).

- **No los ejecutes** en el proyecto actual: ya están aplicados y reabrirían agujeros.
- Solo sirven para montar una base de datos **desde cero**. En ese caso, ejecútalos primero y después
  `2026-10_seguridad_y_funciones.sql`, que corrige todas sus reglas.

La carpeta `.sql/` que había en la raíz se ha eliminado. Contenía scripts peligrosos; por ejemplo,
uno convertía en super_admin a todos los usuarios sin rol. Siguen en el historial de git si alguna vez hiciera falta consultarlos.
