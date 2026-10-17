-- Central visual theme settings for admin and marketplace surfaces.
create table if not exists public.platform_theme_settings (
  scope text primary key check (scope in ('admin', 'marketplace')),
  settings jsonb not null default '{}'::jsonb,
  published_settings jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.platform_theme_settings enable row level security;

insert into public.platform_theme_settings (scope, settings, published_settings)
values
  (
    'admin',
    '{"primary":"violet","accent":"emerald","cardStyle":"elevated","radius":"xl","headingFont":"inter","density":"comfortable","pageWidth":"wide","motion":"normal"}'::jsonb,
    '{"primary":"violet","accent":"emerald","cardStyle":"elevated","radius":"xl","headingFont":"inter","density":"comfortable","pageWidth":"wide","motion":"normal"}'::jsonb
  ),
  (
    'marketplace',
    '{"primary":"emerald","accent":"amber","cardStyle":"soft","radius":"xl","headingFont":"inter","density":"comfortable","pageWidth":"wide","motion":"normal"}'::jsonb,
    '{"primary":"emerald","accent":"amber","cardStyle":"soft","radius":"xl","headingFont":"inter","density":"comfortable","pageWidth":"wide","motion":"normal"}'::jsonb
  )
on conflict (scope) do nothing;

drop policy if exists platform_theme_settings_select on public.platform_theme_settings;
create policy platform_theme_settings_select
on public.platform_theme_settings
for select
to anon, authenticated
using (true);

drop policy if exists platform_theme_settings_admin_all on public.platform_theme_settings;
create policy platform_theme_settings_admin_all
on public.platform_theme_settings
for all
to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());

grant select on public.platform_theme_settings to anon, authenticated;
grant insert, update, delete on public.platform_theme_settings to authenticated;

create or replace function public.get_platform_theme(p_scope text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select published_settings
      from public.platform_theme_settings
      where scope = p_scope
    ),
    '{}'::jsonb
  );
$$;

grant execute on function public.get_platform_theme(text) to anon, authenticated;

create or replace function public.admin_save_platform_theme(
  p_scope text,
  p_settings jsonb,
  p_publish boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  allowed_keys constant text[] := array[
    'primary','accent','cardStyle','radius',
    'headingFont','density','pageWidth','motion'
  ];
  unknown_key text;
  result jsonb;
begin
  if not public.is_platform_admin() then
    raise exception 'Yönetici yetkisi gerekiyor.';
  end if;

  if p_scope not in ('admin','marketplace') then
    raise exception 'Geçersiz tema kapsamı.';
  end if;

  select key into unknown_key
  from jsonb_object_keys(coalesce(p_settings, '{}'::jsonb)) as key
  where not (key = any(allowed_keys))
  limit 1;

  if unknown_key is not null then
    raise exception 'Desteklenmeyen tema ayarı: %', unknown_key;
  end if;

  insert into public.platform_theme_settings(
    scope, settings, published_settings, updated_by, updated_at
  )
  values(
    p_scope,
    coalesce(p_settings, '{}'::jsonb),
    case when p_publish then coalesce(p_settings, '{}'::jsonb) else '{}'::jsonb end,
    auth.uid(),
    timezone('utc', now())
  )
  on conflict(scope) do update set
    settings = excluded.settings,
    published_settings = case
      when p_publish then excluded.settings
      else platform_theme_settings.published_settings
    end,
    updated_by = auth.uid(),
    updated_at = timezone('utc', now())
  returning jsonb_build_object(
    'scope', scope,
    'settings', settings,
    'published_settings', published_settings,
    'updated_at', updated_at
  ) into result;

  return result;
end;
$$;

grant execute on function public.admin_save_platform_theme(text, jsonb, boolean)
to authenticated;
