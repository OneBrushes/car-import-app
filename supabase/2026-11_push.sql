-- Notificaciones push de la app (PWA): una fila por dispositivo suscrito (iPhone, ordenador…).
-- Solo la usa el Worker nordrive-mcp con la clave de servicio: RLS activado y sin políticas = nadie más puede leerla.
create table if not exists public.push_suscripciones (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    endpoint text not null unique,
    p256dh text not null,
    auth text not null,
    dispositivo text,
    creado_en timestamptz not null default now(),
    ultimo_envio timestamptz,
    fallos int not null default 0
);

create index if not exists push_suscripciones_user_idx on public.push_suscripciones (user_id);

alter table public.push_suscripciones enable row level security;
