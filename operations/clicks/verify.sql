-- Run after schema deployment; all test clicks roll back.
begin;
do $$
declare
  v_id bigint;
  v_day date := (now() at time zone 'America/Cuiaba')::date;
  before_count bigint;
  after_count bigint;
begin
  if not exists (select 1 from pg_class where oid = 'public.refri_site_click_daily'::regclass and relrowsecurity) then
    raise exception 'RLS must be enabled';
  end if;
  if has_table_privilege('anon', 'public.refri_site_click_daily', 'SELECT')
     or has_table_privilege('anon', 'public.refri_site_click_daily', 'INSERT')
     or has_table_privilege('authenticated', 'public.refri_site_click_daily', 'UPDATE')
     or has_function_privilege('anon', 'public.refri_record_site_click(text,bigint,text,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.refri_record_site_click(text,bigint,text,text)', 'EXECUTE') then
    raise exception 'Public clients must not read or mutate aggregate data outside admin RLS';
  end if;
  select id into v_id from public.produtos where link_morto = false order by id limit 1;
  if v_id is null then raise exception 'No live product for verification'; end if;
  select coalesce(sum(clicks),0) into before_count from public.refri_site_click_daily
    where day=v_day and event_type='affiliate_click' and product_id=v_id and placement='home_card' and page_type='home';
  perform public.refri_record_site_click('affiliate_click',v_id,'home_card','home');
  perform public.refri_record_site_click('affiliate_click',v_id,'home_card','home');
  select clicks into after_count from public.refri_site_click_daily
    where day=v_day and event_type='affiliate_click' and product_id=v_id and placement='home_card' and page_type='home';
  if after_count <> before_count + 2 then raise exception 'Atomic aggregation failed'; end if;
  begin
    perform public.refri_record_site_click('affiliate_click',v_id,'home_hero','home');
    raise exception 'Invalid placement was accepted';
  exception when check_violation then null;
  end;
  if public.refri_record_site_click('affiliate_click',2147483647,'home_card','home') then
    raise exception 'Unknown product should not be counted';
  end if;
end;
$$;
set local role anon;
select has_table_privilege(current_user, 'public.refri_site_click_daily', 'SELECT') as anon_can_read,
       has_function_privilege(current_user, 'public.refri_record_site_click(text,bigint,text,text)', 'EXECUTE') as anon_can_write;
reset role;
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","aal":"aal1"}';
select count(*) as unauthenticated_admin_visible_rows from public.refri_site_click_daily;
reset role;
rollback;
