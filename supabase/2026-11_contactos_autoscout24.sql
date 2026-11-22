-- Canal "autoscout24" en el historial de contactos (registrar_contacto)

alter table public.contactos_claude drop constraint if exists contactos_claude_canal_check;
alter table public.contactos_claude add constraint contactos_claude_canal_check
  check (canal in ('mobile.de', 'autoscout24', 'email', 'whatsapp', 'telefono', 'otro'));

-- Contactos ya guardados como "otro" que fueron por el formulario de AutoScout24
update public.contactos_claude
set canal = 'autoscout24'
where canal = 'otro'
  and notas ilike '%formulario de AutoScout24%';

notify pgrst, 'reload schema';
