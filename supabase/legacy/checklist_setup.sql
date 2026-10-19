create table if not exists car_checklists (
  id uuid primary key default gen_random_uuid(),
  car_id uuid references imported_cars(id) on delete cascade,
  data jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table car_checklists enable row level security;

create policy "Enable read access for all users" on car_checklists for select using (true);
create policy "Enable insert for authenticated users" on car_checklists for insert with check (auth.role() = 'authenticated');
create policy "Enable update for authenticated users" on car_checklists for update using (auth.role() = 'authenticated');
