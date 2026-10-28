-- Preserve every existing aggregate: no default, backfill or counter rewrite.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '15s';

alter table public.refri_site_click_daily add column last_clicked_at timestamptz;
comment on column public.refri_site_click_daily.last_clicked_at is 'Latest server-observed click for this aggregate row. Null for historical rows until a new click, and for page views/filter use. Not a visitor or event history.';

create or replace function public.refri_record_site_click(p_event_type text, p_product_id bigint, p_placement text, p_page_type text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  v_received_at timestamptz := clock_timestamp();
  v_day date := (v_received_at at time zone 'America/Cuiaba')::date;
  v_clicked_at timestamptz := case when p_event_type in ('affiliate_click','product_view_click','whatsapp_click') then v_received_at else null end;
begin
  -- One server timestamp governs both the calendar day and latest click.
  if p_product_id is null or p_product_id < 0 or p_product_id > 2147483647 then
    return false;
  end if;
  if p_product_id > 0 and not exists (
    select 1 from public.produtos where id = p_product_id and link_morto = false
  ) then
    return false;
  end if;
  insert into public.refri_site_click_daily(day, event_type, product_id, placement, page_type, clicks, last_clicked_at)
    values (v_day, p_event_type, p_product_id, p_placement, p_page_type, 1, v_clicked_at)
  on conflict (day, event_type, product_id, placement, page_type)
  do update set clicks = public.refri_site_click_daily.clicks + 1,
    last_clicked_at = greatest(public.refri_site_click_daily.last_clicked_at, excluded.last_clicked_at)
    where public.refri_site_click_daily.clicks < 100000;
  return found;
end;
$$;

-- Preserve the existing caller boundary and SECURITY INVOKER behavior.
revoke all on function public.refri_record_site_click(text,bigint,text,text) from public, anon, authenticated;
grant execute on function public.refri_record_site_click(text,bigint,text,text) to service_role;
commit;
