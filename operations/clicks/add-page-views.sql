-- Incremental change only. Existing counters, keys, RPC and privileges are preserved.
-- Constraint names were inspected from pg_constraint on the target project.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '15s';

alter table public.refri_site_click_daily
  drop constraint refri_site_click_daily_event_type_check,
  add constraint refri_site_click_daily_event_type_check
    check (event_type in ('affiliate_click','product_view_click','whatsapp_click','page_view','filter_use')),
  drop constraint refri_site_click_daily_placement_check,
  add constraint refri_site_click_daily_placement_check
    check (placement in ('home_card','home_card_filtered','home_carousel','home_hero','home_footer','home_floating','home_direct','product_offer','product_whatsapp','collection_card','related_card','page_load','search_filter','category_filter')),
  drop constraint refri_click_coherent_dimensions,
  add constraint refri_click_coherent_dimensions check (
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
  );

comment on table public.refri_site_click_daily is 'Aggregate page views, filter use and clicks by Cuiaba calendar day and product; not unique people, purchases or WhatsApp joins. No visitor identifiers or search terms. Legacy column clicks stores the count for each event_type.';
commit;

