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
  if not public.refri_record_site_click('page_view',0,'page_load','home')
     or not public.refri_record_site_click('page_view',0,'page_load','category')
     or not public.refri_record_site_click('page_view',0,'page_load','catalogue')
     or not public.refri_record_site_click('page_view',v_id,'page_load','product') then
    raise exception 'Valid page views should be counted independently';
  end if;
  begin
    perform public.refri_record_site_click('page_view',0,'page_load','product');
    raise exception 'Product view without product ID was accepted';
  exception when check_violation then null;
  end;
  begin
    perform public.refri_record_site_click('page_view',v_id,'page_load','home');
    raise exception 'Home view with product ID was accepted';
  exception when check_violation then null;
  end;
  if not public.refri_record_site_click('filter_use',0,'search_filter','home')
     or not public.refri_record_site_click('filter_use',0,'category_filter','home')
     or not public.refri_record_site_click('affiliate_click',v_id,'home_card_filtered','home') then
    raise exception 'Valid filter use and filtered-product clicks should be counted';
  end if;
  begin
    perform public.refri_record_site_click('filter_use',v_id,'search_filter','home');
    raise exception 'Filter use with product ID was accepted';
  exception when check_violation then null;
  end;
  begin
    perform public.refri_record_site_click('affiliate_click',0,'home_card_filtered','home');
    raise exception 'Filtered-product click without a product ID was accepted';
  exception when check_violation then null;
  end;
end;
$$;

-- Timestamp checks remain in the same rollback-only transaction. The marker
-- simulates an older captured timestamp arriving after a newer transaction.
do $$
declare
  v_id bigint;
  v_day date := (clock_timestamp() at time zone 'America/Cuiaba')::date;
  v_history_day date;
  v_before bigint;
  v_after bigint;
  v_first timestamptz;
  v_second timestamptz;
  v_marker timestamptz;
  v_start timestamptz;
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='refri_site_click_daily'
      and column_name='last_clicked_at' and data_type='timestamp with time zone'
      and is_nullable='YES' and column_default is null
  ) then raise exception 'Click timestamp must be nullable without fabricated default'; end if;

  select id into v_id from public.produtos where link_morto=false order by id limit 1;
  if v_id is null then raise exception 'No live product for timestamp verification'; end if;
  select coalesce(min(day),v_day)-1 into v_history_day from public.refri_site_click_daily;
  insert into public.refri_site_click_daily(day,event_type,product_id,placement,page_type,clicks)
    values (v_history_day,'affiliate_click',v_id,'product_offer','product',7);

  select coalesce(sum(clicks),0) into v_before from public.refri_site_click_daily
    where day=v_day and event_type='affiliate_click' and product_id=v_id and placement='product_offer' and page_type='product';
  v_start := clock_timestamp();
  perform public.refri_record_site_click('affiliate_click',v_id,'product_offer','product');
  select last_clicked_at into v_first from public.refri_site_click_daily
    where day=v_day and event_type='affiliate_click' and product_id=v_id and placement='product_offer' and page_type='product';
  if v_first is null or v_first < v_start or v_first > clock_timestamp()
     or (v_first at time zone 'America/Cuiaba')::date <> v_day then
    raise exception 'Click timestamp must use the server clock and its matching calendar day';
  end if;
  perform pg_sleep(0.002);
  perform public.refri_record_site_click('affiliate_click',v_id,'product_offer','product');
  select clicks,last_clicked_at into v_after,v_second from public.refri_site_click_daily
    where day=v_day and event_type='affiliate_click' and product_id=v_id and placement='product_offer' and page_type='product';
  if v_after <> v_before+2 or v_second <= v_first then
    raise exception 'Repeated clicks must increment the aggregate and advance the server time within one transaction';
  end if;

  if not exists (select 1 from public.refri_site_click_daily
    where day=v_history_day and event_type='affiliate_click' and product_id=v_id
      and placement='product_offer' and page_type='product' and clicks=7 and last_clicked_at is null)
  then raise exception 'Historical unknown timestamps and counters must remain unchanged'; end if;

  perform public.refri_record_site_click('product_view_click',v_id,'collection_card','catalogue');
  perform public.refri_record_site_click('whatsapp_click',v_id,'product_whatsapp','product');
  if exists (select 1 from public.refri_site_click_daily
    where day=v_day and product_id=v_id
      and ((event_type='product_view_click' and placement='collection_card' and page_type='catalogue')
        or (event_type='whatsapp_click' and placement='product_whatsapp' and page_type='product'))
      and last_clicked_at is null)
  then raise exception 'Product-detail and WhatsApp clicks must also have timestamps'; end if;

  perform public.refri_record_site_click('page_view',v_id,'page_load','product');
  perform public.refri_record_site_click('filter_use',0,'search_filter','home');
  if exists (select 1 from public.refri_site_click_daily
    where event_type in ('page_view','filter_use') and last_clicked_at is not null)
  then raise exception 'Views and filter use must never receive click timestamps'; end if;

  v_marker := clock_timestamp()+interval '1 minute';
  update public.refri_site_click_daily set last_clicked_at=v_marker
    where day=v_day and event_type='affiliate_click' and product_id=v_id and placement='product_offer' and page_type='product';
  perform public.refri_record_site_click('affiliate_click',v_id,'product_offer','product');
  select clicks,last_clicked_at into v_after,v_second from public.refri_site_click_daily
    where day=v_day and event_type='affiliate_click' and product_id=v_id and placement='product_offer' and page_type='product';
  if v_after <> v_before+3 or v_second <> v_marker then
    raise exception 'An older received click must increment count without regressing latest timestamp';
  end if;
  update public.refri_site_click_daily set clicks=100000
    where day=v_day and event_type='affiliate_click' and product_id=v_id and placement='product_offer' and page_type='product';
  if public.refri_record_site_click('affiliate_click',v_id,'product_offer','product') then
    raise exception 'Existing aggregate count cap must stay effective';
  end if;
  if not exists (select 1 from public.refri_site_click_daily
    where day=v_day and event_type='affiliate_click' and product_id=v_id and placement='product_offer' and page_type='product'
      and clicks=100000 and last_clicked_at=v_marker)
  then raise exception 'Rejected over-cap click must not alter count or timestamp'; end if;
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
