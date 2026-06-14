-- ============================================================================
-- SOUTRA-PAIYA — Migration 0050 : notifications d'abonnement
-- ============================================================================
-- Met en place le tracking et le déclenchement des notifications push/email
-- pour le cycle de vie des abonnements :
--   • subscribe_success    → confirmation de souscription
--   • subscribe_failed     → échec de paiement
--   • expiring_7d          → rappel à J-7 (cron daily)
--   • expiring_1d          → rappel à J-1 (cron daily)
--   • cancelled            → confirmation de résiliation
--
-- Architecture :
--   1. Table subscription_notifications : log anti-spam (un user ne reçoit
--      pas 2× le même rappel pour la même subscription).
--   2. RPC enqueue_subscription_notification : appelée par les triggers
--      ou par l'Edge Function subscription-reminders. Log la notif et
--      invoque send-push (via pg_net si disponible, sinon laisse le job
--      cron faire le dispatch).
--   3. Trigger après INSERT subscriptions (status='active', plan != free)
--      → enqueue subscribe_success.
--   4. Trigger après UPDATE subscriptions (status passe à 'cancelled' OU
--      cancel_at_period_end devient true) → enqueue cancelled.
--   5. pg_cron job daily (si extension dispo) qui scan les expirations
--      et invoque l'Edge Function subscription-reminders.
--
-- Non-cassant. pg_cron optionnel — si absent, le user devra appeler
-- l'Edge Function via un autre cron (GitHub Actions, etc.).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Enum + table de log
-- ----------------------------------------------------------------------------

do $$ begin
  create type subscription_notification_kind as enum (
    'subscribe_success',
    'subscribe_failed',
    'expiring_7d',
    'expiring_1d',
    'cancelled',
    'reactivated'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.subscription_notifications (
  id              bigserial primary key,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id) on delete cascade,
  kind            subscription_notification_kind not null,
  channel         text,                             -- 'push' | 'email' | 'log'
  sent_at         timestamptz not null default now(),
  -- Pour le contenu envoyé (titre/body), debug, et le statut détaillé
  payload         jsonb not null default '{}'::jsonb,
  delivery_status text                              -- 'ok' | 'no_tokens' | 'error:...'
);

-- Anti-spam : un seul (user, subscription, kind) — empêche d'envoyer 2× le
-- même rappel J-7 pour la même subscription.
create unique index if not exists uq_sub_notifs_dedupe
  on public.subscription_notifications(user_id, subscription_id, kind)
  where subscription_id is not null;

create index if not exists idx_sub_notifs_user_date
  on public.subscription_notifications(user_id, sent_at desc);

create index if not exists idx_sub_notifs_kind_date
  on public.subscription_notifications(kind, sent_at desc);

alter table public.subscription_notifications enable row level security;

-- Admin uniquement (debug / monitoring), comme subscription_events.
drop policy if exists "sub_notifs_select_admin" on public.subscription_notifications;
create policy "sub_notifs_select_admin" on public.subscription_notifications
  for select to authenticated using (public.is_admin());

-- L'écriture passe par service_role uniquement (Edge Functions + triggers
-- DEFINER). Aucune policy pour authenticated → bloqué par RLS.

-- ----------------------------------------------------------------------------
-- 2) RPC : enqueue (insert dédupliqué + retourne ok/already_sent)
--    Appelée par les triggers et par subscription-reminders.
-- ----------------------------------------------------------------------------

create or replace function public.enqueue_subscription_notification(
  p_user_id         uuid,
  p_subscription_id uuid,
  p_kind            text,
  p_payload         jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind subscription_notification_kind;
  v_id   bigint;
begin
  begin
    v_kind := p_kind::subscription_notification_kind;
  exception when others then
    raise exception 'INVALID_KIND';
  end;

  -- Tentative d'insert. ON CONFLICT pour bénéficier de l'anti-spam.
  insert into public.subscription_notifications (
    user_id, subscription_id, kind, channel, payload
  )
  values (
    p_user_id, p_subscription_id, v_kind, 'log',
    coalesce(p_payload, '{}'::jsonb)
  )
  on conflict (user_id, subscription_id, kind)
    where subscription_id is not null
  do nothing
  returning id into v_id;

  if v_id is null then
    return jsonb_build_object('ok', false, 'reason', 'ALREADY_SENT');
  end if;
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

revoke execute on function public.enqueue_subscription_notification(uuid, uuid, text, jsonb) from public;
grant execute on function public.enqueue_subscription_notification(uuid, uuid, text, jsonb) to service_role;

-- ----------------------------------------------------------------------------
-- 3) Trigger sur INSERT subscriptions → enqueue subscribe_success
--    Filtre : seulement si status='active' (pas les inserts de migration ou
--    les inserts de status cancelled), plan_code != free (pas de notif pour
--    le plan gratuit), et payment_provider IS NOT NULL (pour distinguer un
--    insert venant d'un paiement Paystack vs un insert manuel admin).
-- ----------------------------------------------------------------------------

create or replace function public.tg_subscriptions_notify_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'active'
     and new.plan_code <> 'free'
  then
    perform public.enqueue_subscription_notification(
      new.user_id,
      new.id,
      'subscribe_success',
      jsonb_build_object(
        'plan_code', new.plan_code::text,
        'billing_period', new.billing_period::text,
        'current_period_end', new.current_period_end,
        'payment_provider', new.payment_provider
      )
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_subscriptions_notify_insert on public.subscriptions;
create trigger trg_subscriptions_notify_insert
  after insert on public.subscriptions
  for each row execute function public.tg_subscriptions_notify_insert();

-- ----------------------------------------------------------------------------
-- 4) Trigger sur UPDATE subscriptions → cancelled / reactivated
--    Filtre : transition vers status='cancelled' OU cancel_at_period_end
--    passe à true (résiliation programmée), OU réactivation.
-- ----------------------------------------------------------------------------

create or replace function public.tg_subscriptions_notify_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Résiliation effective (status devient cancelled)
  if new.status = 'cancelled' and old.status <> 'cancelled' then
    perform public.enqueue_subscription_notification(
      new.user_id, new.id, 'cancelled',
      jsonb_build_object(
        'plan_code', new.plan_code::text,
        'current_period_end', new.current_period_end
      )
    );
    return new;
  end if;

  -- Résiliation programmée (cancel_at_period_end passe à true)
  if new.cancel_at_period_end = true
     and (old.cancel_at_period_end is null or old.cancel_at_period_end = false)
     and new.status in ('active', 'trialing', 'past_due')
  then
    perform public.enqueue_subscription_notification(
      new.user_id, new.id, 'cancelled',
      jsonb_build_object(
        'plan_code', new.plan_code::text,
        'current_period_end', new.current_period_end,
        'scheduled', true
      )
    );
    return new;
  end if;

  -- Réactivation (cancel_at_period_end repasse à false)
  if new.cancel_at_period_end = false
     and old.cancel_at_period_end = true
     and new.status in ('active', 'trialing')
  then
    perform public.enqueue_subscription_notification(
      new.user_id, new.id, 'reactivated',
      jsonb_build_object(
        'plan_code', new.plan_code::text,
        'current_period_end', new.current_period_end
      )
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_subscriptions_notify_update on public.subscriptions;
create trigger trg_subscriptions_notify_update
  after update on public.subscriptions
  for each row execute function public.tg_subscriptions_notify_update();

-- ----------------------------------------------------------------------------
-- 5) Fonction utilitaire : scan des expirations à venir
--    Appelée par l'Edge Function subscription-reminders (cron daily).
--    Retourne la liste des subscriptions qui expirent dans 7 jours ou 1 jour
--    et qui n'ont pas encore reçu le rappel correspondant.
-- ----------------------------------------------------------------------------

create or replace function public.list_expiring_subscriptions()
returns table (
  subscription_id uuid,
  user_id         uuid,
  plan_code       subscription_plan_code,
  current_period_end timestamptz,
  days_until      integer,
  reminder_kind   text
)
language sql
stable
security definer
set search_path = public
as $$
  with candidates as (
    select
      s.id as subscription_id,
      s.user_id,
      s.plan_code,
      s.current_period_end,
      extract(day from s.current_period_end - now())::integer as days_until
    from public.subscriptions s
    where s.status in ('active', 'trialing')
      and s.plan_code <> 'free'
      and s.cancel_at_period_end = false
  )
  select
    c.subscription_id,
    c.user_id,
    c.plan_code,
    c.current_period_end,
    c.days_until,
    case
      when c.days_until between 0 and 1 then 'expiring_1d'
      when c.days_until between 6 and 7 then 'expiring_7d'
    end as reminder_kind
  from candidates c
  where c.days_until between 0 and 7
    and (
      (c.days_until between 0 and 1 and not exists (
        select 1 from public.subscription_notifications n
         where n.subscription_id = c.subscription_id
           and n.kind = 'expiring_1d'
      ))
      or
      (c.days_until between 6 and 7 and not exists (
        select 1 from public.subscription_notifications n
         where n.subscription_id = c.subscription_id
           and n.kind = 'expiring_7d'
      ))
    );
$$;

grant execute on function public.list_expiring_subscriptions() to service_role;

comment on function public.list_expiring_subscriptions is
  'Retourne les subscriptions qui expirent dans 7 ou 1 jour et n''ont pas encore reçu le rappel. Appelée par l''Edge Function subscription-reminders (cron daily).';

-- ----------------------------------------------------------------------------
-- 6) pg_cron — optionnel : schedule daily de subscription-reminders
--    Si l'extension est disponible (la plupart des projets Supabase Pro),
--    on schedule un job daily à 09:00 UTC qui invoque l'Edge Function via
--    pg_net.
--
--    Si pg_cron OU pg_net ne sont pas dispos, ce bloc DO échoue silencieusement
--    et le user devra configurer un cron externe (GitHub Actions, etc.).
-- ----------------------------------------------------------------------------

do $$
declare
  v_cron_available boolean := false;
  v_net_available  boolean := false;
begin
  -- Détection des extensions
  begin
    create extension if not exists pg_cron;
    v_cron_available := true;
  exception when others then
    raise notice 'pg_cron non disponible : %', sqlerrm;
  end;

  begin
    create extension if not exists pg_net;
    v_net_available := true;
  exception when others then
    raise notice 'pg_net non disponible : %', sqlerrm;
  end;

  -- Schedule du cron quotidien (09:00 UTC = 09:00 Abidjan).
  -- Le cron pgère son propre dédoublonnage : si on rejoue cette migration,
  -- on supprime l'ancien job avant d'en créer un nouveau.
  if v_cron_available and v_net_available then
    -- Supprime l'ancien si existant (idempotence)
    begin
      perform cron.unschedule('soutra_subscription_reminders_daily');
    exception when others then null;
    end;

    perform cron.schedule(
      'soutra_subscription_reminders_daily',
      '0 9 * * *',
      $cmd$
      select net.http_post(
        url := 'https://pjtmmzxcitbcwbbgtpdj.supabase.co/functions/v1/subscription-reminders',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
        ),
        body := '{}'::jsonb
      ) as request_id;
      $cmd$
    );
    raise notice 'Cron job soutra_subscription_reminders_daily programmé à 09:00 UTC';
  else
    raise notice 'pg_cron ou pg_net manquant : configurer un cron externe pour appeler subscription-reminders quotidiennement';
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 7) Commentaires
-- ----------------------------------------------------------------------------

comment on table public.subscription_notifications is
  'Log des notifications envoyées (push/email). Anti-spam via uq_sub_notifs_dedupe : 1 seule notif (user, sub, kind).';
comment on function public.enqueue_subscription_notification is
  'Insert dédupliqué dans subscription_notifications. Appelée par les triggers et par subscription-reminders.';
