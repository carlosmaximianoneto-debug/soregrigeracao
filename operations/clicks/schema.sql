-- Isolated aggregate counters only: no visitors, sessions or raw click events.
begin;

create table public.refri_site_click_daily (
  day date not null,
  event_type text not null check (event_type in ('affiliate_click','product_view_click','whatsapp_click','page_view','filter_use')),
  product_id bigint not null check (product_id between 0 and 2147483647),
  placement text not null check (placement in ('home_card','home_card_filtered','home_carousel','home_hero','home_footer','home_floating','home_direct','product_offer','product_whatsapp','collection_card','related_card','page_load','search_filter','category_filter')),
  page_type text not null check (page_type in ('home','product','category','catalogue')),
  clicks bigint not null default 1 check (clicks between 1 and 100000),
  last_clicked_at timestamptz,
  primary key (day, event_type, product_id, placement, page_type),
  constraint refri_click_coherent_dimensions check (
    (event_type = 'affiliate_click' and product_id > 0 and
      ((page_type = 'home' and placement in ('home_card','home_card_filtered','home_carousel')) or (page_type = 'product' and placement = 'product_offer')))
    or (event_type = 'product_view_click' and product_id > 0 and
      ((page_type in ('category','catalogue') and placement = 'collection_card') or (page_type = 'product' and placement = 'related_card')))
    or (event_type = 'whatsapp_click' and
      ((page_type = 'home' and product_id = 0 and placement in ('home_hero','home_footer','home_floating','home_direct'))
       or (page_type = 'product' and product_id > 0 and placement = 'product_whatsapp')))
    or (event_type = 'page_view' and placement = 'page_load' and
      ((page_type = 'product' and product_id > 0) or (page_type in ('home','category','catalogue') and product_id = 0)))
    or (event_type = 'filter_use' and product_id = 0 and page_type = 'home' and placement in ('search_filter','category_filter'))
  )
);
comment on table public.refri_site_click_daily is 'Aggregate page views, filter use and clicks by Cuiaba calendar day and product; not unique people, purchases or WhatsApp joins. No visitor identifiers or search terms. Legacy column clicks stores the count for each event_type.';
comment on column public.refri_site_click_daily.last_clicked_at is 'Latest server-observed click for this aggregate row. Null for historical rows until a new click, and for page views/filter use. Not a visitor or event history.';
alter table public.refri_site_click_daily enable row level security;
revoke all on table public.refri_site_click_daily from public, anon, authenticated;
grant select on table public.refri_site_click_daily to authenticated;
grant select, insert, update on table public.refri_site_click_daily to service_role;
create policy refri_site_click_admin_select on public.refri_site_click_daily
  for select to authenticated using ((select public.acbot_is_admin()));

create function public.refri_record_site_click(p_event_type text, p_product_id bigint, p_placement text, p_page_type text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  v_received_at timestamptz := clock_timestamp();
  v_day date := (v_received_at at time zone 'America/Cuiaba')::date;
  v_clicked_at timestamptz := case when p_event_type in ('affiliate_click','product_view_click','whatsapp_click') then v_received_at else null end;
begin
  -- Lock-free atomic aggregate update; never writes to the product catalogue.
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
revoke all on function public.refri_record_site_click(text,bigint,text,text) from public, anon, authenticated;
grant execute on function public.refri_record_site_click(text,bigint,text,text) to service_role;

commit;
