---
name: qfaith-iglesia
description: >-
  Módulo Iglesia y comunidad de QFaith: los seis roles, qué puede y qué nunca
  podrá ver una iglesia, compartición voluntaria y revocable de peticiones,
  relación con un mentor y sus permisos limitados, grupos, eventos e
  inscripciones, sermones publicados frente a notas privadas, cursos,
  biblioteca, estadísticas permitidas, donaciones y ausencia de chat grupal
  público. Úsala SIEMPRE que trabajes en el módulo de iglesia, en membresías,
  roles, mentores, grupos, eventos, sermones institucionales, o en cualquier
  función que comparta información de un usuario con otra persona u
  organización. Actívala si se menciona iglesia, pastor, líder, mentor,
  discipulado, grupo, ministerio, evento, membresía, compartir una petición o
  permisos de terceros en QFaith.
---

# Módulo Iglesia y Comunidad

Fuente: [Documento 8](../../../docs/master-prompt/08-modulo-iglesia-comunidad.md).

> La iglesia acompaña. La aplicación facilita. **El usuario decide.** La
> privacidad siempre prevalece.

## Roles

`visitor` · `member` · `mentor` · `leader` · `pastor` · `administrator`

Cada rol recibe **únicamente los permisos necesarios**. Un rol nunca concede
acceso a contenido espiritual privado — ni siquiera `administrator`.

## Lo que la iglesia NUNCA podrá ver

Diario · oraciones privadas · notas personales · memorial · conversaciones con
IA · reflexiones · Biblioteca de Vida.

Esto no es configurable. No existe un ajuste, un rol ni una política que lo
habilite.

> Al escribir RLS: **nunca una política general que permita a líderes,
> pastores o administradores leer contenido privado.**

## Lo que el usuario SÍ puede compartir — siempre opcional

Solicitud de oración · participación en grupos · inscripción a eventos ·
asistencia · cursos · objetivos compartidos · notas voluntarias.

## Compartición de peticiones

Niveles (`visibility_level`): `private` · `trusted_person` · `group` ·
`church`. El usuario elige el nivel **en cada petición**.

`prayer_shares` implementa la compartición:

- Un único destino válido por registro (`recipient_user_id`, `group_id` o
  `church_id`).
- `encrypted_shared_payload` + `encrypted_content_key`: el contenido se cifra
  **específicamente para los destinatarios**.
- `expires_at` y `revoked_at`: el propietario puede revocar cuando quiera.
- Compartir una petición **no concede acceso al diario ni a ningún otro
  contenido**.

## Mentores

`mentor_relationships` con `permissions JSONB`.

El mentor ve solo: información autorizada, solicitudes compartidas y objetivos
compartidos. **Nunca acceso completo.** El usuario puede revocar los permisos
en cualquier momento.

## Unión a una iglesia

Buscar iglesia · código de acceso · aceptar invitación · escanear QR. El
usuario puede **abandonar la iglesia cuando quiera**.

`church_memberships` es `UNIQUE(church_id, user_id)`.

## Panel de la iglesia

Administra: eventos, cursos, escuela bíblica, grupos, ministerios, noticias,
calendario, biblioteca, materiales.

**Eventos:** crear, editar, cancelar, inscripciones, recordatorios, control de
asistencia (`church_events`, `event_registrations`).

**Grupos:** grupos pequeños, mentorías, discipulados, escuelas, ministerios
(`church_groups`, `group_memberships`).

## Sermones

La iglesia publica: título, predicador, pasajes, resumen, audio, video, PDF,
presentaciones (`sermons`).

Las **notas del sermón del usuario** (`sermon_notes`) y sus acciones prácticas
(`sermon_actions`) son **privadas y cifradas**, aunque el sermón sea
institucional. Puede escribir, dibujar, grabar audio, añadir fotos y crear
tareas.

## Estadísticas

La iglesia puede conocer: número de miembros, participación en eventos,
asistencia, inscripciones.

**Nunca estadísticas espirituales privadas.** Nada de "cuántos miembros están
ansiosos" o "quién no ha orado esta semana".

## Notificaciones

Eventos, sermones, cursos, cambios de horario, recordatorios.

Las iglesias deben respetar consentimiento, frecuencia, horario de silencio y
preferencias del usuario. El usuario puede desactivarlas por iglesia, grupo o
evento. **Sin anuncios masivos sin límite.**

## Chat

**No existe chat grupal público.** Las conversaciones privadas usarán QChat
cuando esté disponible; hasta entonces, solo mensajes básicos relacionados con
la iglesia.

## Donaciones

Opcional, mediante pasarelas de pago, con historial y comprobantes. **La
aplicación nunca retiene fondos.** No bloquea el lanzamiento del MVP.

## Calendario y servicio

Sincronización opcional con Google Calendar y Apple Calendar. Los usuarios
pueden inscribirse como voluntarios; cada ministerio gestiona sus equipos.

## Regla al implementar

Toda información compartida usa **permisos específicos**. Nunca asumas permisos
por defecto: si no hay un registro de permiso activo y no revocado, el acceso
se deniega.

## Pruebas de aislamiento obligatorias

- Una iglesia no puede acceder al diario de un miembro.
- Un mentor no puede leer datos no compartidos.
- Un administrador técnico no puede descifrar contenido privado.
- Un identificador adivinado no concede acceso.
