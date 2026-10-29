-- Reviewed schema proposal; apply separately from the existing product metrics.
-- No visitor/session IDs, raw events, IPs, URLs or search text are stored.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '15s';

create table public.refri_blog_daily (
  day date not null,
  event_type text not null check (event_type in ('page_view', 'whatsapp_click')),
  article_slug text not null check (article_slug in (
    'ferramentas-para-refrigerista-kit-iniciante',
    'bomba-de-vacuo-3-cfm-ou-6-cfm',
    'bomba-de-vacuo-simples-ou-duplo-estagio',
    'vacuometro-digital-como-escolher',
    'manifold-analogico-ou-digital',
    'manifold-r32-r410a-compatibilidade',
    'mangueiras-para-manifold-como-escolher',
    'bomba-de-limpeza-ar-condicionado',
    'bolsa-coletora-limpeza-split',
    'flangeador-excentrico-como-escolher',
    'cortador-de-tubo-de-cobre',
    'curvador-de-tubo-de-cobre',
    'torquimetro-para-refrigeracao',
    'serra-copo-para-ar-condicionado',
    'furadeira-ou-martelete-ar-condicionado',
    'alicate-amperimetro-para-refrigeracao',
    'termometro-infravermelho-ou-contato',
    'detector-de-vazamento-refrigerante',
    'balanca-digital-para-refrigeracao',
    'bomba-de-dreno-ar-condicionado'
  )),
  placement text not null check (placement in ('page_load', 'article_mid', 'article_end')),
  clicks bigint not null default 1 check (clicks between 1 and 100000),
  last_clicked_at timestamptz,
  primary key (day, event_type, article_slug, placement),
  constraint refri_blog_coherent_dimensions check (
    (event_type = 'page_view' and placement = 'page_load' and last_clicked_at is null)
    or (event_type = 'whatsapp_click' and placement in ('article_mid', 'article_end') and last_clicked_at is not null)
  )
);

comment on table public.refri_blog_daily is 'Anonymous blog aggregates by America/Cuiaba calendar day, approved article, event and placement. Page views and WhatsApp CTA clicks only; not unique people or confirmed group joins. Isolated from product metrics.';
comment on column public.refri_blog_daily.clicks is 'Aggregate count for event_type, including page views. Bounded to 100000 per day/article/event/placement.';
comment on column public.refri_blog_daily.last_clicked_at is 'Latest server-observed WhatsApp CTA click for this aggregate. Null for page views; no raw event or visitor history.';

alter table public.refri_blog_daily enable row level security;
revoke all on table public.refri_blog_daily from public, anon, authenticated;
grant select on table public.refri_blog_daily to authenticated;
grant select, insert, update on table public.refri_blog_daily to service_role;
create policy refri_blog_admin_select on public.refri_blog_daily
  for select to authenticated using ((select public.acbot_is_admin()));

create function public.refri_record_blog_click(p_event_type text, p_article_slug text, p_placement text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  v_received_at timestamptz := pg_catalog.clock_timestamp();
  v_day date := (v_received_at at time zone 'America/Cuiaba')::date;
  v_clicked_at timestamptz := case when p_event_type = 'whatsapp_click' then v_received_at else null end;
begin
  if p_event_type is null or p_article_slug is null or p_placement is null then
    return false;
  end if;
  -- Table constraints recheck the complete allowlist and coherent dimensions.
  -- One atomic UPSERT caps the row and advances the latest click together.
  insert into public.refri_blog_daily(day, event_type, article_slug, placement, clicks, last_clicked_at)
    values (v_day, p_event_type, p_article_slug, p_placement, 1, v_clicked_at)
  on conflict (day, event_type, article_slug, placement)
  do update set clicks = public.refri_blog_daily.clicks + 1,
    last_clicked_at = greatest(public.refri_blog_daily.last_clicked_at, excluded.last_clicked_at)
    where public.refri_blog_daily.clicks < 100000;
  return found;
end;
$$;
revoke all on function public.refri_record_blog_click(text,text,text) from public, anon, authenticated;
grant execute on function public.refri_record_blog_click(text,text,text) to service_role;

commit;
