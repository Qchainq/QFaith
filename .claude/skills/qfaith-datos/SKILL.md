---
name: qfaith-datos
description: >-
  Modelo de datos oficial de QFaith: las 44 tablas de PostgreSQL/Supabase, sus
  campos, enumeraciones, restricciones, índices, campos comunes de
  sincronización y cifrado, reglas de RLS, soft delete y papelera, retención,
  búsqueda local sobre contenido cifrado, migraciones versionadas y entornos.
  Úsala SIEMPRE que vayas a crear, modificar o consultar una tabla, escribir
  una migración SQL, definir un tipo TypeScript que refleje una fila, diseñar
  un repositorio, añadir un índice o decidir qué campos van cifrados. Actívala
  si se mencionan tablas, esquema, columnas, migración, Postgres, Supabase,
  UUID, deleted_at, encrypted_payload, RLS o cualquier nombre de tabla como
  prayers, journal_entries, habits o memorials.
---

# Modelo de datos de QFaith

Fuente: [Documento 12](../../../docs/master-prompt/12-modelo-de-datos.md), que
**prevalece sobre el Documento 4**. Consulta el documento para el listado
completo campo a campo; aquí están las reglas que se aplican a cada decisión.

## Principios innegociables

1. Todos los identificadores son **UUID**. Nunca IDs incrementales (la única
   excepción es `sync_change_log.id`, que es `BIGINT IDENTITY` por diseño).
2. Todas las fechas en **UTC** (`TIMESTAMPTZ`).
3. Todo registro de usuario lleva `user_id` no nulo.
4. **RLS en todas las tablas expuestas.**
5. El contenido privado se cifra en el dispositivo; el servidor solo guarda
   cifrado y metadatos mínimos.
6. Eliminación lógica con `deleted_at`; la permanente ocurre tras la papelera
   (30 días).
7. Nunca se almacenan claves maestras ni claves privadas abiertas.

## Campos comunes

Toda tabla sincronizable:

```sql
id                      UUID PRIMARY KEY
user_id                 UUID NOT NULL
created_at              TIMESTAMPTZ NOT NULL
updated_at              TIMESTAMPTZ NOT NULL
deleted_at              TIMESTAMPTZ NULL
version                 BIGINT NOT NULL DEFAULT 1
last_modified_device_id UUID NULL
sync_revision           BIGINT NOT NULL DEFAULT 0
```

Toda tabla con contenido cifrado añade:

```sql
encrypted_payload   TEXT NOT NULL
encryption_version  SMALLINT NOT NULL
key_id              UUID NOT NULL
nonce               TEXT NOT NULL
content_hash        TEXT NULL
```

## Enumeraciones

`account_status` · `device_status` · `visibility_level` · `sync_operation` ·
`sync_status` · `prayer_status` · `habit_frequency` · `journal_type` ·
`church_role` · `notification_channel`

Valores exactos en el Documento 12. Créalas como tipos ENUM de PostgreSQL y
valídalas también en TypeScript.

## Las 44 tablas por grupo

| Grupo | Tablas |
| --- | --- |
| Identidad | `auth.users` · `profiles` · `user_settings` · `devices` |
| Claves | `user_key_envelopes` · `recovery_configurations` |
| Hábitos | `habits` · `habit_logs` · `spiritual_pulses` |
| Oración | `prayers` · `prayer_updates` · `prayer_shares` · `memorials` |
| Diario | `journal_entries` · `private_media` |
| Biblia | `bible_translations` · `bible_books` · `bible_verses` · `bible_highlights` · `bible_notes` · `bible_bookmarks` |
| Planes | `reading_plans` · `reading_plan_days` · `user_reading_plans` · `reading_progress` |
| Sermones | `sermons` · `sermon_notes` · `sermon_actions` |
| IA | `ai_conversations` · `ai_messages` |
| Biblioteca de Vida | `life_library_items` |
| Iglesia | `churches` · `church_memberships` · `church_groups` · `group_memberships` · `church_events` · `event_registrations` · `mentor_relationships` |
| Operación | `notifications` · `subscriptions` · `sync_change_log` · `sync_conflicts` · `audit_events` · `account_deletion_requests` |

**No crees tablas ni campos que no estén aquí sin justificarlo y documentarlo.**

## Qué va dentro de `encrypted_payload`

Todo el contenido escrito por el usuario. Ejemplos:

- `prayers`: título, descripción, personas implicadas, detalles.
- `journal_entries`: título, contenido, etiquetas privadas.
- `habits`: `title_encrypted`, `description_encrypted` (campos separados, no
  payload).
- `ai_messages`: el texto completo del mensaje.

Fuera del cifrado solo quedan metadatos que el servidor necesita para
indexar y sincronizar: fechas, estados, `category_code`, `visibility`,
`mood_code`, contadores.

## Contenido bíblico

`bible_verses` es contenido público con `search_vector TSVECTOR` e índice GIN:
**es la única búsqueda de texto que se hace en el servidor.** Ese contenido no
pertenece al usuario y su almacenamiento depende de la licencia registrada en
`bible_translations`.

## Búsqueda

- Diario, oraciones, memorial y Biblioteca de Vida: **búsqueda local** sobre
  índice cifrado o protegido. Nunca enviar el contenido privado al servidor
  para buscarlo.
- Biblia y contenido público: búsqueda en PostgreSQL.

## Índices

Crear para: claves foráneas, `user_id`, `updated_at`, `deleted_at`, estados
frecuentes, fechas de recordatorio, revisiones de sincronización y relaciones
entre contenidos.

**No indexes contenido cifrado** — no aporta nada y filtra información.

## Validaciones

`user_id` nunca nulo en contenido personal · referencias con claves foráneas ·
enums validados · fecha final ≥ fecha inicial · límites de caracteres aplicados
**antes** de cifrar · archivos validados en tamaño y tipo · identificadores del
cliente nunca confiables sin verificar propiedad · operaciones sensibles en
transacciones.

## Retención

| Elemento | Retención |
| --- | --- |
| Papelera personal | 30 días |
| Logs técnicos | Según política de privacidad |
| Backups | Rotación programada |
| Cuenta eliminada | Eliminar o anonimizar según obligación legal |
| Contenido privado | Borrado permanente tras el periodo de recuperación |

## Migraciones

Versionadas siempre. Cada una incluye: cambio hacia adelante, estrategia de
reversión cuando sea posible, validación, compatibilidad con versiones antiguas
de la app, prueba en desarrollo y prueba en staging.

No elimines campos de golpe: migra → mantén compatibilidad → retira gradual.

**Nunca modifiques producción a mano.**

## Entornos

Development · Test · Staging · Production, cada uno con su propio proyecto
Supabase, claves, Storage y analítica.

Nunca datos reales de producción en desarrollo. Nunca contenido privado de
usuarios en entornos de prueba. Solo datos ficticios.
