-- Migración 0020 — Ajustes de notificación (Documento 13).
--
-- El interruptor general ya estaba; faltaba lo demás: qué se ve en la
-- pantalla bloqueada, el horario de silencio y los techos de frecuencia. La
-- política que los usa vive en el cliente desde hace tiempo y hasta ahora
-- corría siempre con los valores por defecto porque no había dónde guardar la
-- elección de nadie.
--
-- ── Decisiones ────────────────────────────────────────────────────────────
--
-- 1. **Van aquí y no solo en el teléfono.** Son preferencias, no contenido, y
--    quien las ajusta espera encontrárselas al cambiar de dispositivo. La
--    alternativa —guardarlas en local— obligaría a reconfigurarlas en cada
--    teléfono y a que dos dispositivos de la misma persona avisaran distinto.
--
-- 2. **Qué revelan, dicho claramente.** El horario de silencio dice a qué
--    hora duerme una persona. Es un dato y conviene no fingir lo contrario.
--    Se acepta porque las horas de recordatorio de cada hábito ya viajan en
--    claro —hacen falta en claro para poder programar sin descifrar la base
--    entera en cada arranque— y esto no añade nada que no se dedujera de
--    ellas. Lo que **no** está aquí es de qué son los avisos: eso sigue
--    viniendo del catálogo cerrado del cliente.
--
-- 3. **Los techos se guardan, pero el máximo lo pone el cliente.** La columna
--    admite números y la restricción de rango los acota, pero quien impide
--    subirlos por encima de lo que permite el Documento 13 es
--    `limitesValidos` en el cliente. Guardar aquí un tres no significa que se
--    puedan enviar tres: significa que la persona no ha pedido menos.
--
-- 4. **Nada de esto abre una puerta nueva.** La tabla ya tiene su RLS desde
--    la migración 0002 y estas columnas la heredan. No hay política nueva
--    porque no hace falta ninguna.

alter table public.user_settings
  -- Cuánto se nombra en la pantalla bloqueada. `generico` no dice ni de qué
  -- módulo es; `area` dice «tu momento de oración» y nada más. Por defecto el
  -- discreto: la vista previa la enciende quien quiere (Documento 13).
  add column notification_detail varchar(10) not null default 'generico',

  -- Minutos desde medianoche, hora local. 22:00 a 07:00 por defecto: nadie
  -- quiere un devocional de madrugada.
  add column quiet_from_minute integer not null default 1320,
  add column quiet_to_minute integer not null default 420,

  -- Techos de frecuencia. Los del Documento 13 como valor de partida; la
  -- persona puede bajarlos.
  add column max_spiritual_per_day integer not null default 3,
  add column max_summaries_per_day integer not null default 1,
  add column max_promotional_per_week integer not null default 1,

  -- Los promocionales exigen consentimiento explícito, así que empiezan en
  -- «no» aunque el interruptor general esté encendido.
  add column promotional_consent boolean not null default false;

alter table public.user_settings
  add constraint user_settings_detalle_valido
    check (notification_detail in ('generico', 'area')),
  -- 1440 es el día entero. Un minuto fuera de rango dejaría el horario de
  -- silencio en un estado que el cliente no sabe interpretar.
  add constraint user_settings_silencio_valido
    check (quiet_from_minute between 0 and 1439 and quiet_to_minute between 0 and 1439),
  -- Cero es una elección válida: «no quiero ninguno». El tope de arriba es el
  -- del documento, y existe para que una fila manipulada no pueda pedir más.
  add constraint user_settings_limites_validos
    check (
      max_spiritual_per_day between 0 and 3
      and max_summaries_per_day between 0 and 1
      and max_promotional_per_week between 0 and 1
    );

comment on column public.user_settings.notification_detail is
  'Cuánto se nombra en la pantalla bloqueada. Nunca contenido: el texto sale de un catálogo cerrado.';
comment on column public.user_settings.quiet_from_minute is
  'Inicio del horario de silencio, en minutos locales. Solo lo atraviesan los avisos críticos de seguridad.';
