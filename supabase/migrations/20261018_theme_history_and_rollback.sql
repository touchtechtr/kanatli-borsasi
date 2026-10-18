begin;

alter table public.platform_theme_settings
  add column if not exists published_by uuid references auth.users(id) on delete set null,
  add column if not exists published_at timestamptz;

update public.platform_theme_settings
set published_at=coalesce(published_at,updated_at),
    published_by=coalesce(published_by,updated_by)
where published_at is null;

create table if not exists public.platform_theme_history (
 id uuid primary key default gen_random_uuid(),
 scope text not null check(scope in ('admin','marketplace')),
 settings jsonb not null,
 published_by uuid references auth.users(id) on delete set null,
 published_at timestamptz not null default timezone('utc',now())
);

alter table public.platform_theme_history enable row level security;
drop policy if exists platform_theme_history_admin_select on public.platform_theme_history;
create policy platform_theme_history_admin_select on public.platform_theme_history
 for select to authenticated using(public.is_platform_admin());
grant select on public.platform_theme_history to authenticated;

create or replace function public.log_platform_theme_publish()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
 if new.published_settings is distinct from old.published_settings then
  new.published_at:=timezone('utc',now());
  new.published_by:=auth.uid();
  insert into public.platform_theme_history(scope,settings,published_by,published_at)
  values(new.scope,new.published_settings,auth.uid(),new.published_at);
 end if;
 return new;
end $$;

drop trigger if exists platform_theme_publish_history on public.platform_theme_settings;
create trigger platform_theme_publish_history
before update on public.platform_theme_settings
for each row execute function public.log_platform_theme_publish();

insert into public.platform_theme_history(scope,settings,published_by,published_at)
select s.scope,s.published_settings,s.published_by,coalesce(s.published_at,s.updated_at)
from public.platform_theme_settings s
where not exists(select 1 from public.platform_theme_history h where h.scope=s.scope);

create or replace function public.admin_get_theme_editor_state(p_scope text)
returns jsonb language plpgsql stable security definer set search_path=public
as $$
declare result jsonb;
begin
 if not public.is_platform_admin() then raise exception 'Yönetici yetkisi gerekiyor.'; end if;
 if p_scope not in ('admin','marketplace') then raise exception 'Geçersiz tema kapsamı.'; end if;
 select jsonb_build_object(
  'scope',s.scope,'settings',s.settings,'published_settings',s.published_settings,
  'updated_at',s.updated_at,'published_at',s.published_at,
  'updated_by',s.updated_by,'published_by',s.published_by,
  'published_by_email',pu.email,
  'history',coalesce((select jsonb_agg(jsonb_build_object(
    'id',h.id,'settings',h.settings,'published_at',h.published_at,
    'published_by',h.published_by,'published_by_email',u.email
   ) order by h.published_at desc)
   from (select * from public.platform_theme_history where scope=p_scope order by published_at desc limit 12) h
   left join auth.users u on u.id=h.published_by),'[]'::jsonb)
 ) into result
 from public.platform_theme_settings s
 left join auth.users pu on pu.id=s.published_by
 where s.scope=p_scope;
 return coalesce(result,'{}'::jsonb);
end $$;

create or replace function public.admin_restore_platform_theme(p_scope text,p_history_id uuid)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare selected jsonb; result jsonb;
begin
 if not public.is_platform_admin() then raise exception 'Yönetici yetkisi gerekiyor.'; end if;
 select settings into selected from public.platform_theme_history
 where id=p_history_id and scope=p_scope;
 if selected is null then raise exception 'Tema geçmişi bulunamadı.'; end if;
 update public.platform_theme_settings set settings=selected,published_settings=selected,
  updated_by=auth.uid(),updated_at=timezone('utc',now())
 where scope=p_scope
 returning jsonb_build_object('scope',scope,'settings',settings,'published_settings',published_settings,
  'published_at',published_at) into result;
 return result;
end $$;

grant execute on function public.admin_get_theme_editor_state(text) to authenticated;
grant execute on function public.admin_restore_platform_theme(text,uuid) to authenticated;

commit;