# Documento 12 — Modelo de Datos y Relaciones

> Versión 1.0. **Este documento prevalece sobre el Documento 4** en todo lo
> relativo al esquema.

## Objetivo

Definir el modelo de datos oficial de QFaith: tablas, campos, relaciones,
restricciones, índices, propiedad de los datos, reglas de privacidad, reglas de
sincronización, eliminación y restauración.

La implementación deberá respetar este modelo. No crear tablas o campos
duplicados. No almacenar contenido privado sin cifrado.

## Principios generales

1. PostgreSQL será la base de datos principal.
2. Supabase Auth administrará las identidades.
3. Todos los identificadores serán UUID.
4. Todas las fechas se almacenarán en UTC.
5. Todo registro perteneciente a un usuario incluirá `user_id`.
6. Todas las tablas expuestas tendrán Row Level Security.
7. Los contenidos privados se cifrarán en el dispositivo.
8. El servidor almacenará solamente contenido cifrado y metadatos mínimos.
9. La eliminación normal será lógica mediante `deleted_at`.
10. La eliminación permanente se realizará después del periodo de papelera.
11. Los registros sincronizables incluirán información de versión.
12. No se almacenarán claves maestras ni claves privadas abiertas.

## Campos comunes

Las tablas sincronizables deberán incluir, cuando corresponda:

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

Las tablas con contenido cifrado incluirán:

```sql
encrypted_payload   TEXT NOT NULL
encryption_version  SMALLINT NOT NULL
key_id              UUID NOT NULL
nonce               TEXT NOT NULL
content_hash        TEXT NULL
```

**El servidor no interpretará `encrypted_payload`.**

## Enumeraciones principales

| Enum | Valores |
| --- | --- |
| `account_status` | active · suspended · pending_deletion · deleted |
| `device_status` | active · revoked · lost · inactive |
| `visibility_level` | private · trusted_person · group · church |
| `sync_operation` | create · update · delete |
| `sync_status` | pending · processing · synced · failed · conflict |
| `prayer_status` | active · answered · archived |
| `habit_frequency` | daily · weekly · monthly · custom |
| `journal_type` | reflection · testimony · learning · gratitude · dream · private_confession · general |
| `church_role` | visitor · member · mentor · leader · pastor · administrator |
| `notification_channel` | push · email · local |

---

## 1. `auth.users`

Administrada por Supabase Auth. Responsabilidad: identidad, correo, proveedores
de acceso, verificación, recuperación de contraseña, sesiones de autenticación.

No duplicar contraseñas en tablas propias.

`auth.users.id` será la referencia principal de `user_id`.

## 2. `profiles`

```sql
id                   UUID PRIMARY KEY REFERENCES auth.users(id)
display_name         TEXT
avatar_path          TEXT NULL
language_code        VARCHAR(10) NOT NULL DEFAULT 'es'
timezone             TEXT NOT NULL
country_code         VARCHAR(2) NULL
birth_year           SMALLINT NULL
account_status       account_status NOT NULL DEFAULT 'active'
onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE
created_at           TIMESTAMPTZ NOT NULL
updated_at           TIMESTAMPTZ NOT NULL
deleted_at           TIMESTAMPTZ NULL
```

**Reglas:** un usuario tendrá un solo perfil. No almacenar fecha de nacimiento
completa si no es necesaria. El correo se obtendrá desde Auth. El perfil no
contendrá información espiritual privada.

**Índices:** `account_status`, `created_at`

## 3. `user_settings`

```sql
id                     UUID PRIMARY KEY
user_id                UUID UNIQUE NOT NULL
theme                  VARCHAR(20) NOT NULL DEFAULT 'system'
accent_preference      VARCHAR(30) NULL
font_scale             NUMERIC(3,2) NOT NULL DEFAULT 1.00
bible_translation_id   UUID NULL
notifications_enabled  BOOLEAN NOT NULL DEFAULT TRUE
analytics_enabled      BOOLEAN NOT NULL DEFAULT FALSE
biometric_lock_enabled BOOLEAN NOT NULL DEFAULT FALSE
auto_lock_seconds      INTEGER NOT NULL DEFAULT 60
cloud_backup_enabled   BOOLEAN NOT NULL DEFAULT TRUE
wifi_only_downloads    BOOLEAN NOT NULL DEFAULT FALSE
created_at             TIMESTAMPTZ NOT NULL
updated_at             TIMESTAMPTZ NOT NULL
```

**Reglas:** solo el propietario puede leer o modificar. Los ajustes sensibles
no deben contener PIN, claves ni secretos.

## 4. `devices`

```sql
id               UUID PRIMARY KEY
user_id          UUID NOT NULL
device_public_id TEXT NOT NULL
device_name      TEXT
platform         VARCHAR(20) NOT NULL
os_version       TEXT NULL
app_version      TEXT NULL
public_key       TEXT NULL
status           device_status NOT NULL DEFAULT 'active'
last_seen_at     TIMESTAMPTZ
revoked_at       TIMESTAMPTZ NULL
created_at       TIMESTAMPTZ NOT NULL
updated_at       TIMESTAMPTZ NOT NULL
```

**Restricciones:** `UNIQUE(user_id, device_public_id)`

**Reglas:** nunca almacenar identificadores publicitarios. `public_key` podrá
utilizarse para compartir claves cifradas entre dispositivos. Un dispositivo
revocado no podrá sincronizar.

**Índices:** `user_id`, `status`, `last_seen_at`

## 5. `user_key_envelopes`

Contenedores cifrados de claves.

```sql
id                UUID PRIMARY KEY
user_id           UUID NOT NULL
device_id         UUID NULL
key_id            UUID NOT NULL
key_type          VARCHAR(30) NOT NULL
encrypted_key     TEXT NOT NULL
encryption_method VARCHAR(50) NOT NULL
key_version       SMALLINT NOT NULL
created_at        TIMESTAMPTZ NOT NULL
revoked_at        TIMESTAMPTZ NULL
```

**Reglas:** `encrypted_key` siempre contendrá una clave envuelta o cifrada.
Nunca almacenar la clave maestra abierta. La empresa no deberá poder descifrar
este contenido. Cada nuevo dispositivo recibirá únicamente las claves
autorizadas.

**Índices:** `user_id`, `device_id`, `key_id`

## 6. `recovery_configurations`

```sql
id                          UUID PRIMARY KEY
user_id                     UUID UNIQUE NOT NULL
recovery_method             VARCHAR(30) NOT NULL
encrypted_recovery_envelope TEXT NOT NULL
kdf_algorithm               VARCHAR(30) NOT NULL
kdf_parameters              JSONB NOT NULL
recovery_version            SMALLINT NOT NULL
configured_at               TIMESTAMPTZ NOT NULL
updated_at                  TIMESTAMPTZ NOT NULL
```

**Reglas:** no almacenar la frase o clave de recuperación. El servidor
conservará únicamente el contenedor cifrado. Los parámetros de derivación no
son secretos, pero deben validarse.

## 7. `habits`

```sql
id                      UUID PRIMARY KEY
user_id                 UUID NOT NULL
title_encrypted         TEXT NOT NULL
description_encrypted   TEXT NULL
category_code           VARCHAR(40) NULL
frequency               habit_frequency NOT NULL
schedule_config         JSONB NOT NULL
start_date              DATE NOT NULL
end_date                DATE NULL
reminder_enabled        BOOLEAN NOT NULL DEFAULT FALSE
reminder_time           TIME NULL
is_active               BOOLEAN NOT NULL DEFAULT TRUE
sort_order              INTEGER NOT NULL DEFAULT 0
created_at              TIMESTAMPTZ NOT NULL
updated_at              TIMESTAMPTZ NOT NULL
deleted_at              TIMESTAMPTZ NULL
version                 BIGINT NOT NULL DEFAULT 1
last_modified_device_id UUID NULL
```

**Reglas:** el título personalizado deberá cifrarse. `category_code` podrá usar
categorías generales no sensibles. `schedule_config` definirá días y reglas de
repetición. **No usar rachas punitivas.**

**Índices:** `user_id` · `user_id, is_active` · `user_id, updated_at`

## 8. `habit_logs`

```sql
id                      UUID PRIMARY KEY
user_id                 UUID NOT NULL
habit_id                UUID NOT NULL REFERENCES habits(id)
completion_date         DATE NOT NULL
completed               BOOLEAN NOT NULL DEFAULT TRUE
completed_at            TIMESTAMPTZ NULL
encrypted_note          TEXT NULL
created_at              TIMESTAMPTZ NOT NULL
updated_at              TIMESTAMPTZ NOT NULL
deleted_at              TIMESTAMPTZ NULL
version                 BIGINT NOT NULL DEFAULT 1
last_modified_device_id UUID NULL
```

**Restricciones:** `UNIQUE(habit_id, completion_date)`

**Índices:** `user_id, completion_date` · `habit_id, completion_date`

## 9. `spiritual_pulses`

Registro opcional del estado espiritual diario.

```sql
id             UUID PRIMARY KEY
user_id        UUID NOT NULL
pulse_date     DATE NOT NULL
mood_code      VARCHAR(40) NOT NULL
intensity      SMALLINT NULL
encrypted_note TEXT NULL
created_at     TIMESTAMPTZ NOT NULL
updated_at     TIMESTAMPTZ NOT NULL
deleted_at     TIMESTAMPTZ NULL
```

**Restricciones:** `UNIQUE(user_id, pulse_date)`

**Reglas:** `mood_code` usará valores generales. Las explicaciones personales
deberán cifrarse. No utilizar estos datos para publicidad. No convertirlos
automáticamente en diagnósticos médicos.

## 10. `prayers`

```sql
id                      UUID PRIMARY KEY
user_id                 UUID NOT NULL
status                  prayer_status NOT NULL DEFAULT 'active'
visibility              visibility_level NOT NULL DEFAULT 'private'
category_code           VARCHAR(40) NULL
encrypted_payload       TEXT NOT NULL
encryption_version      SMALLINT NOT NULL
key_id                  UUID NOT NULL
nonce                   TEXT NOT NULL
reminder_enabled        BOOLEAN NOT NULL DEFAULT FALSE
next_reminder_at        TIMESTAMPTZ NULL
answered_at             TIMESTAMPTZ NULL
archived_at             TIMESTAMPTZ NULL
created_at              TIMESTAMPTZ NOT NULL
updated_at              TIMESTAMPTZ NOT NULL
deleted_at              TIMESTAMPTZ NULL
version                 BIGINT NOT NULL DEFAULT 1
last_modified_device_id UUID NULL
```

**Reglas:** título, descripción, personas y detalles estarán dentro de
`encrypted_payload`. Cambiar a `answered` no elimina la petición. Una oración
respondida puede generar un memorial.

**Índices:** `user_id, status` · `user_id, next_reminder_at` ·
`user_id, updated_at`

## 11. `prayer_updates`

```sql
id                 UUID PRIMARY KEY
user_id            UUID NOT NULL
prayer_id          UUID NOT NULL REFERENCES prayers(id)
encrypted_payload  TEXT NOT NULL
encryption_version SMALLINT NOT NULL
key_id             UUID NOT NULL
nonce              TEXT NOT NULL
created_at         TIMESTAMPTZ NOT NULL
updated_at         TIMESTAMPTZ NOT NULL
deleted_at         TIMESTAMPTZ NULL
version            BIGINT NOT NULL DEFAULT 1
```

**Índices:** `prayer_id, created_at` · `user_id, updated_at`

## 12. `prayer_shares`

Compartición voluntaria de peticiones.

```sql
id                       UUID PRIMARY KEY
prayer_id                UUID NOT NULL
owner_user_id            UUID NOT NULL
recipient_user_id        UUID NULL
group_id                 UUID NULL
church_id                UUID NULL
encrypted_shared_payload TEXT NOT NULL
encrypted_content_key    TEXT NOT NULL
permission_level         VARCHAR(30) NOT NULL
expires_at               TIMESTAMPTZ NULL
revoked_at               TIMESTAMPTZ NULL
created_at               TIMESTAMPTZ NOT NULL
```

**Reglas:** debe existir un único destino válido. El propietario puede revocar
el acceso. Compartir no concede acceso al diario ni a otros contenidos. El
contenido se cifrará específicamente para los destinatarios.

## 13. `memorials`

```sql
id                 UUID PRIMARY KEY
user_id            UUID NOT NULL
prayer_id          UUID NULL REFERENCES prayers(id)
occurred_on        DATE NULL
encrypted_payload  TEXT NOT NULL
encryption_version SMALLINT NOT NULL
key_id             UUID NOT NULL
nonce              TEXT NOT NULL
is_favorite        BOOLEAN NOT NULL DEFAULT FALSE
created_at         TIMESTAMPTZ NOT NULL
updated_at         TIMESTAMPTZ NOT NULL
deleted_at         TIMESTAMPTZ NULL
version            BIGINT NOT NULL DEFAULT 1
```

**Índices:** `user_id, occurred_on` · `user_id, is_favorite`

## 14. `journal_entries`

```sql
id                      UUID PRIMARY KEY
user_id                 UUID NOT NULL
entry_type              journal_type NOT NULL
entry_date              DATE NOT NULL
encrypted_payload       TEXT NOT NULL
encryption_version      SMALLINT NOT NULL
key_id                  UUID NOT NULL
nonce                   TEXT NOT NULL
is_favorite             BOOLEAN NOT NULL DEFAULT FALSE
is_ark_protected        BOOLEAN NOT NULL DEFAULT FALSE
created_at              TIMESTAMPTZ NOT NULL
updated_at              TIMESTAMPTZ NOT NULL
deleted_at              TIMESTAMPTZ NULL
version                 BIGINT NOT NULL DEFAULT 1
last_modified_device_id UUID NULL
```

**Reglas:** título, contenido y etiquetas privadas estarán cifrados.
`is_ark_protected` exigirá autenticación adicional en el cliente (Modo Arca).
El servidor no podrá distinguir el contenido de una confesión privada.

**Índices:** `user_id, entry_date` · `user_id, entry_type` ·
`user_id, updated_at`

## 15. `private_media`

Metadatos de imágenes, audios y documentos cifrados.

```sql
id                     UUID PRIMARY KEY
user_id                UUID NOT NULL
owner_type             VARCHAR(30) NOT NULL
owner_id               UUID NOT NULL
storage_path           TEXT NOT NULL
encrypted_file_key     TEXT NOT NULL
file_nonce             TEXT NOT NULL
mime_type              TEXT NOT NULL
encrypted_original_name TEXT NULL
file_size_bytes        BIGINT NOT NULL
content_hash           TEXT NOT NULL
upload_status          VARCHAR(20) NOT NULL
created_at             TIMESTAMPTZ NOT NULL
updated_at             TIMESTAMPTZ NOT NULL
deleted_at             TIMESTAMPTZ NULL
```

**Reglas:** el archivo se cifra antes de subirse. Storage nunca recibirá el
archivo original abierto. No usar URLs públicas. Acceso mediante rutas privadas
y autorización temporal. `owner_type` podrá ser `journal`, `prayer`, `memorial`
o `sermon_note`.

**Índices:** `user_id` · `owner_type, owner_id` · `content_hash`

## 16. `bible_translations`

```sql
id                UUID PRIMARY KEY
code              VARCHAR(20) UNIQUE NOT NULL
name              TEXT NOT NULL
language_code     VARCHAR(10) NOT NULL
publisher         TEXT NULL
license_type      VARCHAR(40) NOT NULL
license_reference TEXT NULL
offline_available BOOLEAN NOT NULL DEFAULT FALSE
audio_available   BOOLEAN NOT NULL DEFAULT FALSE
is_active         BOOLEAN NOT NULL DEFAULT TRUE
created_at        TIMESTAMPTZ NOT NULL
updated_at        TIMESTAMPTZ NOT NULL
```

**Reglas:** no publicar traducciones sin licencia válida. Las restricciones de
cada traducción deberán respetarse.

## 17. `bible_books`

```sql
id             UUID PRIMARY KEY
translation_id UUID NOT NULL
book_code      VARCHAR(20) NOT NULL
book_name      TEXT NOT NULL
testament      VARCHAR(20) NOT NULL
book_order     SMALLINT NOT NULL
chapter_count  SMALLINT NOT NULL
```

**Restricciones:** `UNIQUE(translation_id, book_code)`

## 18. `bible_verses`

```sql
id             UUID PRIMARY KEY
translation_id UUID NOT NULL
book_code      VARCHAR(20) NOT NULL
chapter_number SMALLINT NOT NULL
verse_number   SMALLINT NOT NULL
verse_text     TEXT NOT NULL
search_vector  TSVECTOR NULL
```

**Restricciones:**
`UNIQUE(translation_id, book_code, chapter_number, verse_number)`

**Índices:** `translation_id, book_code, chapter_number` · `search_vector`
mediante GIN

**Reglas:** solo almacenar texto conforme a la licencia. El contenido bíblico
no pertenece al usuario. Las descargas offline respetarán términos
editoriales.

## 19. `bible_highlights`

```sql
id              UUID PRIMARY KEY
user_id         UUID NOT NULL
translation_id  UUID NOT NULL
book_code       VARCHAR(20) NOT NULL
chapter_number  SMALLINT NOT NULL
verse_start     SMALLINT NOT NULL
verse_end       SMALLINT NOT NULL
highlight_style VARCHAR(30) NOT NULL
encrypted_note  TEXT NULL
created_at      TIMESTAMPTZ NOT NULL
updated_at      TIMESTAMPTZ NOT NULL
deleted_at      TIMESTAMPTZ NULL
version         BIGINT NOT NULL DEFAULT 1
```

**Índices:** `user_id, translation_id, book_code, chapter_number`

## 20. `bible_notes`

```sql
id                 UUID PRIMARY KEY
user_id            UUID NOT NULL
translation_id     UUID NULL
book_code          VARCHAR(20) NOT NULL
chapter_number     SMALLINT NOT NULL
verse_start        SMALLINT NULL
verse_end          SMALLINT NULL
encrypted_payload  TEXT NOT NULL
encryption_version SMALLINT NOT NULL
key_id             UUID NOT NULL
nonce              TEXT NOT NULL
created_at         TIMESTAMPTZ NOT NULL
updated_at         TIMESTAMPTZ NOT NULL
deleted_at         TIMESTAMPTZ NULL
version            BIGINT NOT NULL DEFAULT 1
```

**Índices:** `user_id, book_code, chapter_number` · `user_id, updated_at`

## 21. `bible_bookmarks`

```sql
id             UUID PRIMARY KEY
user_id        UUID NOT NULL
translation_id UUID NOT NULL
book_code      VARCHAR(20) NOT NULL
chapter_number SMALLINT NOT NULL
verse_number   SMALLINT NULL
created_at     TIMESTAMPTZ NOT NULL
deleted_at     TIMESTAMPTZ NULL
```

**Restricciones:** evitar marcadores duplicados para la misma ubicación.

## 22. `reading_plans`

```sql
id            UUID PRIMARY KEY
creator_type  VARCHAR(20) NOT NULL
creator_id    UUID NULL
title         TEXT NOT NULL
description   TEXT NULL
language_code VARCHAR(10) NOT NULL
duration_days INTEGER NOT NULL
is_premium    BOOLEAN NOT NULL DEFAULT FALSE
is_published  BOOLEAN NOT NULL DEFAULT FALSE
created_at    TIMESTAMPTZ NOT NULL
updated_at    TIMESTAMPTZ NOT NULL
```

## 23. `reading_plan_days`

```sql
id                   UUID PRIMARY KEY
plan_id              UUID NOT NULL REFERENCES reading_plans(id)
day_number           INTEGER NOT NULL
title                TEXT NULL
content              TEXT NULL
bible_references     JSONB NOT NULL
reflection_questions JSONB NULL
```

**Restricciones:** `UNIQUE(plan_id, day_number)`

## 24. `user_reading_plans`

```sql
id           UUID PRIMARY KEY
user_id      UUID NOT NULL
plan_id      UUID NOT NULL
started_at   DATE NOT NULL
current_day  INTEGER NOT NULL DEFAULT 1
completed_at DATE NULL
status       VARCHAR(20) NOT NULL
created_at   TIMESTAMPTZ NOT NULL
updated_at   TIMESTAMPTZ NOT NULL
```

**Restricciones:** evitar inscripciones activas duplicadas al mismo plan.

## 25. `reading_progress`

```sql
id                   UUID PRIMARY KEY
user_id              UUID NOT NULL
user_plan_id         UUID NOT NULL
day_number           INTEGER NOT NULL
completed_at         TIMESTAMPTZ NULL
encrypted_reflection TEXT NULL
created_at           TIMESTAMPTZ NOT NULL
updated_at           TIMESTAMPTZ NOT NULL
```

**Restricciones:** `UNIQUE(user_plan_id, day_number)`

## 26. `sermons`

Contenido publicado por iglesias o guardado personalmente.

```sql
id                 UUID PRIMARY KEY
church_id          UUID NULL
owner_user_id      UUID NULL
title              TEXT NULL
speaker_name       TEXT NULL
sermon_date        DATE NULL
public_summary     TEXT NULL
bible_references   JSONB NULL
audio_path         TEXT NULL
video_url          TEXT NULL
publication_status VARCHAR(20) NOT NULL
created_at         TIMESTAMPTZ NOT NULL
updated_at         TIMESTAMPTZ NOT NULL
deleted_at         TIMESTAMPTZ NULL
```

**Reglas:** los sermones institucionales pueden ser públicos para miembros. Los
sermones personales deberán protegerse según su privacidad.

## 27. `sermon_notes`

```sql
id                 UUID PRIMARY KEY
user_id            UUID NOT NULL
sermon_id          UUID NULL
encrypted_payload  TEXT NOT NULL
encryption_version SMALLINT NOT NULL
key_id             UUID NOT NULL
nonce              TEXT NOT NULL
created_at         TIMESTAMPTZ NOT NULL
updated_at         TIMESTAMPTZ NOT NULL
deleted_at         TIMESTAMPTZ NULL
version            BIGINT NOT NULL DEFAULT 1
```

## 28. `sermon_actions`

Aplicaciones prácticas derivadas del sermón.

```sql
id               UUID PRIMARY KEY
user_id          UUID NOT NULL
sermon_note_id   UUID NULL
encrypted_title  TEXT NOT NULL
due_date         DATE NULL
completed_at     TIMESTAMPTZ NULL
reminder_enabled BOOLEAN NOT NULL DEFAULT FALSE
created_at       TIMESTAMPTZ NOT NULL
updated_at       TIMESTAMPTZ NOT NULL
deleted_at       TIMESTAMPTZ NULL
```

## 29. `ai_conversations`

```sql
id                      UUID PRIMARY KEY
user_id                 UUID NOT NULL
encrypted_title         TEXT NULL
conversation_type       VARCHAR(30) NOT NULL
provider_reference_hash TEXT NULL
created_at              TIMESTAMPTZ NOT NULL
updated_at              TIMESTAMPTZ NOT NULL
deleted_at              TIMESTAMPTZ NULL
version                 BIGINT NOT NULL DEFAULT 1
```

**Reglas:** no almacenar contenido abierto. No usar conversaciones privadas
para entrenamiento. `provider_reference_hash` no revelará información del
usuario.

## 30. `ai_messages`

```sql
id                 UUID PRIMARY KEY
user_id            UUID NOT NULL
conversation_id    UUID NOT NULL
role               VARCHAR(20) NOT NULL
encrypted_payload  TEXT NOT NULL
encryption_version SMALLINT NOT NULL
key_id             UUID NOT NULL
nonce              TEXT NOT NULL
safety_category    VARCHAR(30) NULL
created_at         TIMESTAMPTZ NOT NULL
deleted_at         TIMESTAMPTZ NULL
```

**Reglas:** el contenido deberá cifrarse en reposo. Para enviar contexto al
proveedor será necesaria autorización y procesamiento temporal. Aplicar
política especial al modo crisis.

## 31. `life_library_items`

Referencias organizadas de la Biblioteca de Vida.

```sql
id                UUID PRIMARY KEY
user_id           UUID NOT NULL
source_type       VARCHAR(30) NOT NULL
source_id         UUID NOT NULL
encrypted_title   TEXT NULL
encrypted_summary TEXT NULL
encrypted_tags    TEXT NULL
occurred_at       TIMESTAMPTZ NULL
is_favorite       BOOLEAN NOT NULL DEFAULT FALSE
created_at        TIMESTAMPTZ NOT NULL
updated_at        TIMESTAMPTZ NOT NULL
deleted_at        TIMESTAMPTZ NULL
version           BIGINT NOT NULL DEFAULT 1
```

**Restricciones:** `UNIQUE(user_id, source_type, source_id)`

**Reglas:** no duplicar el contenido original. Guardar una referencia y
clasificación. Las etiquetas espirituales personales estarán cifradas.

## 32. `churches`

```sql
id            UUID PRIMARY KEY
name          TEXT NOT NULL
slug          TEXT UNIQUE NOT NULL
description   TEXT NULL
logo_path     TEXT NULL
country_code  VARCHAR(2) NULL
city          TEXT NULL
address       TEXT NULL
timezone      TEXT NOT NULL
contact_email TEXT NULL
website_url   TEXT NULL
status        VARCHAR(20) NOT NULL
created_at    TIMESTAMPTZ NOT NULL
updated_at    TIMESTAMPTZ NOT NULL
```

## 33. `church_memberships`

```sql
id                UUID PRIMARY KEY
church_id         UUID NOT NULL
user_id           UUID NOT NULL
role              church_role NOT NULL DEFAULT 'member'
membership_status VARCHAR(20) NOT NULL
joined_at         TIMESTAMPTZ NULL
invited_by        UUID NULL
created_at        TIMESTAMPTZ NOT NULL
updated_at        TIMESTAMPTZ NOT NULL
```

**Restricciones:** `UNIQUE(church_id, user_id)`

**Reglas:** un rol no concede acceso a contenido espiritual privado. Los
permisos institucionales se definirán por separado.

## 34. `church_groups`

```sql
id               UUID PRIMARY KEY
church_id        UUID NOT NULL
name             TEXT NOT NULL
description      TEXT NULL
group_type       VARCHAR(30) NOT NULL
leader_user_id   UUID NULL
meeting_schedule JSONB NULL
status           VARCHAR(20) NOT NULL
created_at       TIMESTAMPTZ NOT NULL
updated_at       TIMESTAMPTZ NOT NULL
```

## 35. `group_memberships`

```sql
id         UUID PRIMARY KEY
group_id   UUID NOT NULL
user_id    UUID NOT NULL
role       VARCHAR(20) NOT NULL
status     VARCHAR(20) NOT NULL
joined_at  TIMESTAMPTZ NULL
created_at TIMESTAMPTZ NOT NULL
updated_at TIMESTAMPTZ NOT NULL
```

**Restricciones:** `UNIQUE(group_id, user_id)`

## 36. `church_events`

```sql
id                    UUID PRIMARY KEY
church_id             UUID NOT NULL
group_id              UUID NULL
title                 TEXT NOT NULL
description           TEXT NULL
location              TEXT NULL
starts_at             TIMESTAMPTZ NOT NULL
ends_at               TIMESTAMPTZ NULL
capacity              INTEGER NULL
registration_required BOOLEAN NOT NULL DEFAULT FALSE
status                VARCHAR(20) NOT NULL
created_at            TIMESTAMPTZ NOT NULL
updated_at            TIMESTAMPTZ NOT NULL
deleted_at            TIMESTAMPTZ NULL
```

## 37. `event_registrations`

```sql
id            UUID PRIMARY KEY
event_id      UUID NOT NULL
user_id       UUID NOT NULL
status        VARCHAR(20) NOT NULL
registered_at TIMESTAMPTZ NOT NULL
checked_in_at TIMESTAMPTZ NULL
```

**Restricciones:** `UNIQUE(event_id, user_id)`

## 38. `mentor_relationships`

```sql
id             UUID PRIMARY KEY
church_id      UUID NULL
mentor_user_id UUID NOT NULL
mentee_user_id UUID NOT NULL
status         VARCHAR(20) NOT NULL
permissions    JSONB NOT NULL DEFAULT '{}'
started_at     TIMESTAMPTZ NULL
ended_at       TIMESTAMPTZ NULL
created_at     TIMESTAMPTZ NOT NULL
updated_at     TIMESTAMPTZ NOT NULL
```

**Reglas:** `permissions` solo concede acceso a información compartida. Nunca
concede acceso general al diario, IA o memorial. El usuario puede revocar
permisos.

## 39. `notifications`

```sql
id                  UUID PRIMARY KEY
user_id             UUID NOT NULL
notification_type   VARCHAR(40) NOT NULL
generic_title       TEXT NOT NULL
generic_body        TEXT NULL
action_route        TEXT NULL
action_reference_id UUID NULL
scheduled_at        TIMESTAMPTZ NULL
sent_at             TIMESTAMPTZ NULL
read_at             TIMESTAMPTZ NULL
created_at          TIMESTAMPTZ NOT NULL
```

**Reglas:** no incluir contenido espiritual sensible. Las notificaciones
locales privadas se construirán en el dispositivo.

**Índices:** `user_id, read_at` · `user_id, scheduled_at`

## 40. `subscriptions`

```sql
id                              UUID PRIMARY KEY
user_id                         UUID NOT NULL
provider                        VARCHAR(20) NOT NULL
provider_customer_reference     TEXT NULL
provider_subscription_reference TEXT NULL
plan_code                       VARCHAR(30) NOT NULL
status                          VARCHAR(20) NOT NULL
current_period_start            TIMESTAMPTZ NULL
current_period_end              TIMESTAMPTZ NULL
cancel_at_period_end            BOOLEAN NOT NULL DEFAULT FALSE
created_at                      TIMESTAMPTZ NOT NULL
updated_at                      TIMESTAMPTZ NOT NULL
```

**Reglas:** no almacenar datos completos de tarjetas. Verificar suscripciones
mediante servidor. Mantener historial mínimo para auditoría financiera.

## 41. `sync_change_log`

```sql
id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY
user_id     UUID NOT NULL
entity_type VARCHAR(40) NOT NULL
entity_id   UUID NOT NULL
operation   sync_operation NOT NULL
revision    BIGINT NOT NULL
device_id   UUID NULL
changed_at  TIMESTAMPTZ NOT NULL
```

**Reglas:** no incluir contenido privado. Solo registrar identificadores,
operación y revisión. Servirá para sincronización incremental.

**Índices:** `user_id, revision` · `user_id, changed_at`

## 42. `sync_conflicts`

```sql
id                        UUID PRIMARY KEY
user_id                   UUID NOT NULL
entity_type               VARCHAR(40) NOT NULL
entity_id                 UUID NOT NULL
local_version             BIGINT NOT NULL
remote_version            BIGINT NOT NULL
encrypted_local_snapshot  TEXT NULL
encrypted_remote_snapshot TEXT NULL
status                    VARCHAR(20) NOT NULL
resolved_at               TIMESTAMPTZ NULL
created_at                TIMESTAMPTZ NOT NULL
```

**Reglas:** los snapshots deberán permanecer cifrados. El usuario decidirá
cuando no sea posible una fusión segura.

## 43. `audit_events`

```sql
id         UUID PRIMARY KEY
user_id    UUID NULL
device_id  UUID NULL
event_type VARCHAR(50) NOT NULL
severity   VARCHAR(20) NOT NULL
metadata   JSONB NOT NULL DEFAULT '{}'
ip_hash    TEXT NULL
created_at TIMESTAMPTZ NOT NULL
```

**Nunca registrar:** textos de oración, diario, notas, mensajes de IA, claves,
tokens, contraseñas, nombres de archivos privados.

Aplicar retención limitada.

## 44. `account_deletion_requests`

```sql
id            UUID PRIMARY KEY
user_id       UUID NOT NULL
requested_at  TIMESTAMPTZ NOT NULL
scheduled_for TIMESTAMPTZ NOT NULL
cancelled_at  TIMESTAMPTZ NULL
completed_at  TIMESTAMPTZ NULL
status        VARCHAR(20) NOT NULL
```

**Reglas:** permitir periodo de cancelación. Al completarse, eliminar o
anonimizar los datos según obligaciones legales. El contenido privado deberá
eliminarse permanentemente.

---

## Relaciones principales

**Un usuario tiene:** un perfil, una configuración, muchos dispositivos, muchos
hábitos, muchos registros de hábitos, muchas oraciones, muchas entradas del
diario, muchos memoriales, muchas notas bíblicas, muchas conversaciones con IA,
muchas pertenencias a iglesias o grupos.

**Una oración puede tener:** muchas actualizaciones, muchos archivos, varios
destinatarios autorizados, un memorial opcional.

**Una entrada del diario puede tener:** muchos archivos, etiquetas cifradas,
una referencia en Biblioteca de Vida.

**Un sermón puede tener:** muchas notas personales, muchas acciones prácticas.

**Una iglesia puede tener:** muchos miembros, muchos grupos, muchos eventos,
muchos sermones.

## Row Level Security

**Datos personales:** el usuario solo podrá seleccionar, crear, modificar o
eliminar registros cuyo `user_id` coincida con `auth.uid()`.

**Datos compartidos:** el usuario podrá acceder únicamente cuando exista un
permiso activo y no revocado.

**Iglesias:** los permisos se calcularán según membresía activa, rol, propiedad
del recurso y permiso específico.

> **Nunca utilizar una política general que permita a líderes o administradores
> leer contenido privado.**

## Reglas de validación

1. Ningún `user_id` podrá ser nulo en contenido personal.
2. Las referencias deberán usar claves foráneas.
3. Los valores enumerados deberán validarse.
4. Las fechas finales no podrán ser anteriores a las iniciales.
5. Los límites de caracteres deberán aplicarse antes del cifrado.
6. Los archivos deberán validar tamaño y tipo.
7. Los identificadores enviados por el cliente nunca serán confiables sin
   verificar propiedad.
8. Las operaciones sensibles deberán ejecutarse en transacciones.

## Índices

Crear índices para: claves foráneas, `user_id`, `updated_at`, `deleted_at`,
estados utilizados frecuentemente, fechas de recordatorio, revisiones de
sincronización, relaciones entre contenidos.

No crear índices innecesarios sobre contenido cifrado.

## Búsqueda

El servidor no realizará búsquedas semánticas sobre contenido privado cifrado.

La búsqueda del diario, oraciones, memorial y Biblioteca de Vida se realizará
**localmente** mediante un índice cifrado o protegido.

La búsqueda bíblica y de contenidos públicos podrá realizarse en PostgreSQL.

No enviar el contenido privado completo al servidor para buscarlo.

## Retención de datos

| Elemento | Retención |
| --- | --- |
| Papelera personal | 30 días por defecto |
| Logs técnicos | Periodo limitado definido por la política de privacidad |
| Copias de seguridad | Rotación programada |
| Datos de cuenta eliminada | Eliminar o anonimizar según obligaciones legales |
| Contenido privado | Eliminar permanentemente tras finalizar el periodo de recuperación |

## Migraciones

Toda modificación del esquema deberá realizarse mediante migraciones
versionadas. Cada migración deberá incluir: cambio hacia adelante, estrategia
de reversión cuando sea posible, validación, compatibilidad con aplicaciones
antiguas, prueba en desarrollo, prueba en staging.

**Nunca modificar manualmente producción sin migración.**

## Entornos

Separar completamente: Desarrollo · Pruebas · Staging · Producción

Nunca utilizar datos reales de producción en desarrollo. Nunca copiar contenido
privado de usuarios a entornos de prueba.

## Datos de prueba

Utilizar únicamente información ficticia. Nunca utilizar diarios reales,
oraciones reales, conversaciones reales ni correos personales sin autorización.

## Criterios de aceptación

El modelo de datos se considerará aprobado cuando:

1. Todas las tablas tengan propósito definido.
2. Todas las relaciones estén documentadas.
3. Todas las tablas personales tengan RLS.
4. Ningún contenido privado quede abierto en el servidor.
5. Las claves de cifrado no estén almacenadas en texto plano.
6. La sincronización entre dispositivos pueda realizarse mediante revisiones.
7. La eliminación y restauración estén definidas.
8. Los índices críticos estén creados.
9. Las migraciones se ejecuten correctamente.
10. Las pruebas de aislamiento entre usuarios sean satisfactorias.
11. Un usuario no pueda acceder a registros de otro usuario.
12. Una iglesia no pueda leer el contenido espiritual privado de sus miembros.
13. Los archivos privados no tengan acceso público.
14. El cambio de dispositivo permita restaurar los datos cifrados.
15. La eliminación de cuenta borre correctamente el contenido correspondiente.
