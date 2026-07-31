-- Migración 0001 — Extensiones, enumeraciones y utilidades comunes.
--
-- Fase 1. Base sobre la que se apoyan las demás migraciones.
-- Documento 12: todos los identificadores son UUID y todas las fechas van en
-- UTC (TIMESTAMPTZ).

create extension if not exists "pgcrypto";

-- ── Enumeraciones (Documento 12) ─────────────────────────────────────────

create type public.account_status as enum ('active', 'suspended', 'pending_deletion', 'deleted');

create type public.device_status as enum ('active', 'revoked', 'lost', 'inactive');

create type public.visibility_level as enum ('private', 'trusted_person', 'group', 'church');

create type public.sync_operation as enum ('create', 'update', 'delete');

create type public.sync_status as enum ('pending', 'processing', 'synced', 'failed', 'conflict');

create type public.prayer_status as enum ('active', 'answered', 'archived');

create type public.habit_frequency as enum ('daily', 'weekly', 'monthly', 'custom');

create type public.journal_type as enum (
  'reflection',
  'testimony',
  'learning',
  'gratitude',
  'dream',
  'private_confession',
  'general'
);

create type public.church_role as enum (
  'visitor',
  'member',
  'mentor',
  'leader',
  'pastor',
  'administrator'
);

create type public.notification_channel as enum ('push', 'email', 'local');

-- ── Secuencia de revisiones de sincronización ────────────────────────────
--
-- Los clientes piden los cambios posteriores a una revisión concreta,
-- siempre filtrando por su propio usuario. Basta con que la secuencia sea
-- monótona: si lo es globalmente, también lo es dentro de cada usuario. Se
-- usa una secuencia global en lugar de un contador por usuario para evitar
-- que dos dispositivos del mismo usuario compitan por bloquear la misma
-- fila al escribir a la vez. Los huecos en la numeración de un usuario son
-- esperables y no afectan a la sincronización incremental.
create sequence public.sync_revision_seq as bigint start 1;

-- ── Utilidades ───────────────────────────────────────────────────────────

-- Mantiene updated_at y evita que el cliente lo falsee.
create or replace function public.fn_actualizar_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Incrementa `version` en cada modificación real. Es lo que permite detectar
-- conflictos entre dispositivos (Documento 7).
create or replace function public.fn_incrementar_version()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    new.version := old.version + 1;
  end if;
  return new;
end;
$$;

comment on sequence public.sync_revision_seq is
  'Revisión monótona global usada como cursor de sincronización incremental.';
