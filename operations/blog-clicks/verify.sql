-- Run after applying schema.sql, as a database administrator.
-- All aggregate changes, including cap checks, roll back at the end.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '15s';

do $$
declare
  v_rpc regprocedure := 'public.refri_record_blog_click(text,text,text)'::regprocedure;
begin
  if not exists (select 1 from pg_class where oid = 'public.refri_blog_daily'::regclass and relrowsecurity) then
    raise exception 'Blog RLS must be enabled';
  end if;
  if has_table_privilege('anon', 'public.refri_blog_daily', 'SELECT')
    or has_table_privilege('anon', 'public.refri_blog_daily', 'INSERT')
    or has_table_privilege('authenticated', 'public.refri_blog_daily', 'INSERT')
    or has_table_privilege('authenticated', 'public.refri_blog_daily', 'UPDATE')
    or has_table_privilege('authenticated', 'public.refri_blog_daily', 'DELETE')
    or has_function_privilege('anon', v_rpc, 'EXECUTE')
    or has_function_privilege('authenticated', v_rpc, 'EXECUTE') then
    raise exception 'Public clients must not write or bypass admin RLS';
  end if;
  if not has_table_privilege('service_role', 'public.refri_blog_daily', 'SELECT')
    or not has_table_privilege('service_role', 'public.refri_blog_daily', 'INSERT')
    or not has_table_privilege('service_role', 'public.refri_blog_daily', 'UPDATE')
    or not has_function_privilege('service_role', v_rpc, 'EXECUTE') then
    raise exception 'Service collector requires aggregate and RPC permissions';
  end if;
  if not exists (select 1 from pg_proc p where p.oid = v_rpc and not p.prosecdef
    and exists (select 1 from unnest(p.proconfig) c where c in ('search_path=', 'search_path=""'))) then
    raise exception 'RPC must be SECURITY INVOKER with an empty search_path';
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='refri_blog_daily'
    and policyname='refri_blog_admin_select' and cmd='SELECT' and roles=array['authenticated']::name[]
    and qual like '%acbot_is_admin()%') then
    raise exception 'Read policy must require the existing admin authorization helper';
  end if;
end;
$$;

-- Authenticate as the actual writer role to exercise invoker grants.
set local role service_role;
do $$
declare
  v_slug text := 'ferramentas-para-refrigerista-kit-iniciante';
  v_day date := (clock_timestamp() at time zone 'America/Cuiaba')::date;
  v_before bigint;
  v_after bigint;
  v_first timestamptz;
  v_second timestamptz;
  v_marker timestamptz;
  v_start timestamptz := clock_timestamp();
begin
  select coalesce(sum(clicks),0) into v_before from public.refri_blog_daily
    where day=v_day and article_slug=v_slug and event_type='whatsapp_click' and placement='article_mid';
  if v_before > 99997 then raise exception 'Use a fresh test day/article before the daily cap is reached'; end if;
  perform public.refri_record_blog_click('whatsapp_click',v_slug,'article_mid');
  select last_clicked_at into v_first from public.refri_blog_daily
    where day=v_day and article_slug=v_slug and event_type='whatsapp_click' and placement='article_mid';
  if v_first is null or v_first < v_start or v_first > clock_timestamp()
    or (v_first at time zone 'America/Cuiaba')::date <> v_day then
    raise exception 'Latest click must use the server clock and its calendar day';
  end if;
  perform pg_sleep(0.002);
  perform public.refri_record_blog_click('whatsapp_click',v_slug,'article_mid');
  select clicks,last_clicked_at into v_after,v_second from public.refri_blog_daily
    where day=v_day and article_slug=v_slug and event_type='whatsapp_click' and placement='article_mid';
  if v_after <> v_before+2 or v_second <= v_first then raise exception 'Atomic aggregate increment failed'; end if;

  if not public.refri_record_blog_click('page_view',v_slug,'page_load')
    or not public.refri_record_blog_click('whatsapp_click',v_slug,'article_end') then
    raise exception 'Page views and both CTA placements must remain independent';
  end if;
  if exists (select 1 from public.refri_blog_daily where event_type='page_view' and last_clicked_at is not null) then
    raise exception 'Views must not get a click timestamp';
  end if;
  begin
    perform public.refri_record_blog_click('page_view',v_slug,'article_mid');
    raise exception 'Incoherent event placement was accepted';
  exception when check_violation then null;
  end;
  begin
    perform public.refri_record_blog_click('whatsapp_click','unknown?email=private','article_mid');
    raise exception 'Unapproved article was accepted';
  exception when check_violation then null;
  end;
  if public.refri_record_blog_click(null,v_slug,'article_mid') then raise exception 'Null event was accepted'; end if;

  v_marker := clock_timestamp()+interval '1 minute';
  update public.refri_blog_daily set last_clicked_at=v_marker
    where day=v_day and article_slug=v_slug and event_type='whatsapp_click' and placement='article_mid';
  perform public.refri_record_blog_click('whatsapp_click',v_slug,'article_mid');
  select clicks,last_clicked_at into v_after,v_second from public.refri_blog_daily
    where day=v_day and article_slug=v_slug and event_type='whatsapp_click' and placement='article_mid';
  if v_after <> v_before+3 or v_second <> v_marker then raise exception 'Latest timestamp regressed'; end if;
  update public.refri_blog_daily set clicks=100000
    where day=v_day and article_slug=v_slug and event_type='whatsapp_click' and placement='article_mid';
  if public.refri_record_blog_click('whatsapp_click',v_slug,'article_mid') then raise exception 'Daily cap was bypassed'; end if;
  if not exists (select 1 from public.refri_blog_daily where day=v_day and article_slug=v_slug
    and event_type='whatsapp_click' and placement='article_mid' and clicks=100000 and last_clicked_at=v_marker) then
    raise exception 'Over-cap event changed its aggregate';
  end if;
end;
$$;
reset role;

set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","aal":"aal1"}';
do $$
begin
  if exists (select 1 from public.refri_blog_daily) then raise exception 'Non-admin must not read blog aggregates'; end if;
end;
$$;
reset role;
rollback;
