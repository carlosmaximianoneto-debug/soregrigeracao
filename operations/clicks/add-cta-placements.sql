-- Novos CTAs do grupo (05/11/2026): home_steps, product_floating,
-- collection_whatsapp, collection_floating. Superset dos valores anteriores:
-- aplicar ANTES da Edge refri-site-click e do site.
begin;
alter table public.refri_site_click_daily drop constraint refri_site_click_daily_placement_check;
alter table public.refri_site_click_daily add constraint refri_site_click_daily_placement_check
  check (placement = any (array['home_card','home_card_filtered','home_carousel','home_hero','home_footer','home_floating','home_direct','home_steps','product_offer','product_whatsapp','product_floating','collection_whatsapp','collection_floating','collection_card','related_card','page_load','search_filter','category_filter']));
alter table public.refri_site_click_daily drop constraint refri_click_coherent_dimensions;
alter table public.refri_site_click_daily add constraint refri_click_coherent_dimensions check (
  (event_type = 'affiliate_click' and product_id > 0 and (
     (page_type = 'home' and placement = any (array['home_card','home_card_filtered','home_carousel']))
     or (page_type = 'product' and placement = 'product_offer')))
  or (event_type = 'product_view_click' and product_id > 0 and (
     (page_type = any (array['category','catalogue']) and placement = 'collection_card')
     or (page_type = 'product' and placement = 'related_card')))
  or (event_type = 'whatsapp_click' and (
     (page_type = 'home' and product_id = 0 and placement = any (array['home_hero','home_footer','home_floating','home_direct','home_steps']))
     or (page_type = 'product' and product_id > 0 and placement = any (array['product_whatsapp','product_floating']))
     or (page_type = any (array['category','catalogue']) and product_id = 0 and placement = any (array['collection_whatsapp','collection_floating']))))
  or (event_type = 'page_view' and placement = 'page_load' and (
     (page_type = 'product' and product_id > 0)
     or (page_type = any (array['home','category','catalogue']) and product_id = 0)))
  or (event_type = 'filter_use' and product_id = 0 and page_type = 'home' and placement = any (array['search_filter','category_filter']))
);
commit;
