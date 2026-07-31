---
name: qfaith-notificaciones
description: >-
  Notificaciones, recordatorios y tareas en segundo plano de QFaith: privacidad
  en la pantalla bloqueada, tono permitido y prohibido, prioridades, locales
  frente a remotas, horario de silencio, límites de frecuencia, tokens push,
  idempotencia y widgets. Úsala SIEMPRE que programes un recordatorio, escribas
  el texto de una notificación, toques push, configures tareas en segundo
  plano, integres el calendario del sistema o construyas un widget. Actívala si
  se menciona notificación, recordatorio, push, alerta, badge, widget, tarea en
  segundo plano, zona horaria o horario de silencio en QFaith.
---

# Notificaciones y tareas en segundo plano

Fuente:
[Documento 13](docs/master-prompt/13-notificaciones-y-tareas-fondo.md).

> Las notificaciones ayudan al usuario. **Nunca controlan su comportamiento ni
> se convierten en una herramienta adictiva.**

## Quién decide qué

| | |
| --- | --- |
| **Opus aprueba** | Notificaciones de crisis y de seguridad, y la política de payload remoto |
| **Sonnet implementa** | Servicio de notificaciones, programación local, push, tareas de fondo, widgets, integración de calendario |
| **Haiku redacta** | Los textos, con `qfaith-textos`. Nunca decide cuándo ni a quién se envía |

## Privacidad en pantalla bloqueada — la regla que más se incumple

**Nunca mostrar directamente:** texto de una oración, nombre de una persona en
una petición, contenido del diario, estado espiritual, confesiones, respuestas
de IA, detalles de crisis, notas de sermón privadas.

| ✅ Permitido | ❌ Prohibido |
| --- | --- |
| «Tienes un recordatorio en QFaith.» | «Recuerda orar por la enfermedad de María.» |
| «Tu tiempo personal está listo.» | «Llevas tres días sin leer la Biblia.» |
| «Hay una actualización de seguridad.» | «Tu diario sobre ansiedad está pendiente.» |
| «Tienes un evento próximo.» | «Dios quiere hablarte hoy.» |

La vista previa del contenido está **desactivada por defecto** y solo el
usuario puede habilitarla.

## Tono

Amable, breve, respetuoso, no invasivo, esperanzador.

**Nunca:** culpa, amenazas, presión, lenguaje profético, manipulación
espiritual, urgencia falsa. **Nunca reiniciar rachas ni amenazar con perder
progreso.**

| ✅ | ❌ |
| --- | --- |
| «Tu momento de lectura está disponible.» | «Has fallado otra vez.» |
| «Puedes continuar hoy donde quedaste.» | «Dios está esperando y tú no has orado.» |
| «¿Deseas dedicar unos minutos a tu oración?» | «Perderás tu progreso si no entras ahora.» |

## Prioridades

| Nivel | Uso |
| --- | --- |
| **Crítica** | Login sospechoso, dispositivo nuevo, cambio de clave de recuperación, revocación de sesión, fallo grave de respaldo, riesgo inmediato en crisis. **Nunca para hábitos ni promoción** |
| **Alta** | Evento próximo confirmado, recordatorio pedido expresamente, plan con hora concreta, acción de seguridad pendiente |
| **Normal** | Devocional, hábito, oración, lectura, sermón |
| **Baja** | Resumen semanal, contenido nuevo, sugerencias, informativos |

## Locales frente a remotas

**Locales** (hábitos, oración, devocional, lectura, sermón, recordatorios
personales) son la opción **por defecto**: funcionan sin Internet, protegen la
privacidad y reducen coste.

Reprográmalas cuando cambie zona horaria, horario, preferencias, estado del
hábito, pausa de un plan o cierre de sesión.

**Remotas** (seguridad, iglesia, eventos, restauración, facturación): el
payload contiene únicamente tipo, identificador opaco, ruta de navegación,
marca temporal, prioridad y firma. **Nunca contenido privado.**

## Límites de frecuencia

- Máximo 3 notificaciones espirituales normales al día.
- Máximo 1 resumen diario.
- Máximo 1 promocional por semana, solo con consentimiento explícito.
- Seguridad sin límite artificial ante riesgo real.

El usuario puede reducir estos límites, nunca subirlos a un nivel abusivo.

**Detección de fatiga:** si ignora repetidamente una categoría, sugerir dentro
de la app «¿Deseas reducir estos recordatorios?». Nunca aumentar la presión
automáticamente ni usar reproche.

**Horario de silencio:** sin notificaciones normales, sin sonido, sin
vibración. Solo las críticas de seguridad pueden ser excepción.

## Navegación desde una notificación

Antes de navegar, en este orden:

1. Verificar sesión
2. Verificar dispositivo autorizado
3. Verificar permisos
4. Verificar que el recurso existe
5. **Pedir desbloqueo biométrico si el contenido es privado**
6. No mostrar nada si el usuario cerró sesión

Si el recurso ya no existe: mensaje genérico. Las acciones rápidas nunca
exponen contenido privado sin desbloquear la app.

## Tareas en segundo plano

Solo para: sincronización incremental, cola pendiente, descarga autorizada,
actualización de planes, programación de notificaciones, limpieza de
temporales, verificación de respaldo, renovación segura de sesión.

Deben ser **idempotentes** (`sync_job_id`, `notification_schedule_id`,
`backup_revision`) y no duplicar recordatorios, eventos, registros ni archivos.

Respetar batería: agrupar tareas, no despertar el dispositivo sin necesidad,
respetar modo ahorro y Wi-Fi únicamente. **Nunca ejecutar IA en segundo plano
sin acción explícita del usuario.**

## Zonas horarias

Todos los horarios se guardan con contexto de zona horaria. Evitar
notificaciones de madrugada. Manejar horario de verano, horas inexistentes y
repetidas.

> **Nunca programes recordatorios con cálculos fijos de segundos** cuando deban
> respetar la hora local.

## Tokens push

Asociados al dispositivo, protegidos en servidor, actualizados al cambiar,
eliminados al cerrar sesión, revocados al eliminar el dispositivo. Nunca para
seguimiento publicitario. **Nunca en logs abiertos.**

## Detalle adicional

Carga estas referencias solo cuando la tarea lo pida:

- **[Catálogo por tipo](references/catalogo-por-tipo.md)** — reglas concretas
  de hábitos, oración, devocional, planes, sermón, iglesia, seguridad,
  respaldo, suscripción y promocionales.
- **[Ciclo de vida y pruebas](references/ciclo-de-vida-y-pruebas.md)** —
  permisos del sistema, widgets, calendario, cierre de sesión, eliminación de
  cuenta, analítica, las 20 pruebas obligatorias y los 16 criterios de
  aceptación.
