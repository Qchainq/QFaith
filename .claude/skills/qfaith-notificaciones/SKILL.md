---
name: qfaith-notificaciones
description: >-
  Sistema de notificaciones, recordatorios y tareas en segundo plano de QFaith:
  tipos y prioridades, privacidad en la pantalla bloqueada, tono permitido y
  prohibido, horario de silencio, límites de frecuencia y detección de fatiga,
  notificaciones locales frente a remotas, payload sin contenido privado,
  tokens push, zonas horarias y horario de verano, acciones rápidas,
  navegación desde una notificación, widgets y comportamiento al cerrar sesión
  o eliminar la cuenta. Úsala SIEMPRE que programes un recordatorio, escribas
  el texto de una notificación, toques push, configures tareas en segundo
  plano, integres el calendario del sistema o construyas un widget. Actívala si
  se menciona notificación, recordatorio, push, alerta, badge, widget, tarea en
  segundo plano o horario de silencio en QFaith.
---

# Notificaciones y tareas en segundo plano

Fuente:
[Documento 13](../../../docs/master-prompt/13-notificaciones-y-tareas-fondo.md).

> Las notificaciones ayudan al usuario. **Nunca controlan su comportamiento ni
> se convierten en una herramienta adictiva.**

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
espiritual, urgencia falsa.

| ✅ | ❌ |
| --- | --- |
| «Tu momento de lectura está disponible.» | «Has fallado otra vez.» |
| «Puedes continuar hoy donde quedaste.» | «Dios está esperando y tú no has orado.» |
| «¿Deseas dedicar unos minutos a tu oración?» | «Perderás tu progreso si no entras ahora.» |
| «Tu plan sigue disponible cuando estés listo.» | «Esta puede ser tu última oportunidad.» |

**Nunca reiniciar rachas ni amenazar con perder progreso.**

## Prioridades

| Nivel | Uso |
| --- | --- |
| **Crítica** | Login sospechoso, dispositivo nuevo, cambio de clave de recuperación, revocación de sesión, fallo grave de respaldo, riesgo inmediato en crisis. **Nunca para hábitos ni promoción.** |
| **Alta** | Evento próximo confirmado, recordatorio pedido expresamente, plan con hora concreta, acción de seguridad pendiente |
| **Normal** | Devocional, hábito, oración, lectura, sermón |
| **Baja** | Resumen semanal, contenido nuevo, sugerencias, informativos |

## Locales frente a remotas

**Locales** (hábitos, oración, devocional, lectura, sermón, recordatorios
personales): funcionan sin Internet, mantienen la privacidad y reducen coste.
**Son la opción por defecto** cuando no hace falta el servidor.

Reprograma las locales cuando cambie: zona horaria, horario, preferencias,
estado del hábito, pausa de un plan o cierre de sesión.

**Remotas** (seguridad, iglesia, eventos, restauración, facturación): el payload
contiene únicamente tipo, identificador opaco, ruta de navegación, marca
temporal, prioridad y firma. **Nunca contenido privado.**

## Límites de frecuencia

- Máximo 3 notificaciones espirituales normales al día.
- Máximo 1 resumen diario.
- Máximo 1 promocional por semana, solo con consentimiento explícito.
- Alertas operativas según necesidad; seguridad sin límite artificial ante
  riesgo real.

El usuario puede reducir estos límites, nunca subirlos a un nivel abusivo.

**Detección de fatiga:** si ignora repetidamente una categoría, sugerir dentro
de la app «¿Deseas reducir estos recordatorios?». Nunca aumentar la presión
automáticamente ni usar reproche.

## Horario de silencio

Hora de inicio, hora de fin, días y excepciones de seguridad. Durante ese
periodo: sin notificaciones normales, sin sonido, sin vibración; se mantienen
pendientes para entrega posterior cuando corresponda.

## Promocionales

Desactivadas por defecto. Solo con consentimiento explícito. Desactivables sin
afectar a las operativas.

**Nunca segmentar por** ansiedad, oraciones, confesiones, crisis, diario,
estado espiritual, situación familiar ni dificultades económicas.

Nunca mensajes como «Paga para crecer en tu fe» o «Tu relación con Dios merece
Premium».

## Navegación desde una notificación

Antes de navegar, en este orden:

1. Verificar sesión
2. Verificar dispositivo autorizado
3. Verificar permisos
4. Verificar que el recurso existe
5. **Pedir desbloqueo biométrico si el contenido es privado**
6. No mostrar nada si el usuario cerró sesión

Si el recurso ya no existe: mensaje genérico.

**Acciones rápidas** (completar, posponer, abrir, marcar leído, confirmar
asistencia, revisar seguridad) nunca exponen contenido privado sin desbloquear
la app.

**Posponer:** 10 min · 30 min · 1 h · esta tarde · mañana · fecha
personalizada.

## Zonas horarias

Todos los horarios se guardan con contexto de zona horaria. Al viajar,
preguntar si conservar la hora local original o adaptar. Evitar notificaciones
de madrugada.

Manejar horario de verano, horas inexistentes y horas repetidas.

> **Nunca programes recordatorios con cálculos fijos de segundos** cuando deban
> respetar la hora local.

## Permisos del sistema

**No pidas el permiso al abrir la app por primera vez.** Flujo correcto:

1. Pantalla interna explicando qué recordatorios puede recibir
2. Elegir categorías
3. Solicitar el permiso del sistema
4. Respetar la decisión

Si lo rechaza: no insistir, permitir activarlo desde configuración, y **seguir
funcionando** — recordatorios dentro de la app y exportación opcional al
calendario.

## Tareas en segundo plano

Permitidas solo para: sincronización incremental, cola pendiente, descarga
autorizada, actualización de planes, programación de notificaciones, limpieza
de temporales, verificación de respaldo, renovación segura de sesión.

Deben ser **idempotentes** (`sync_job_id`, `notification_schedule_id`,
`backup_revision`) y no crear recordatorios, eventos, registros ni archivos
duplicados.

Respetar batería: agrupar tareas, no despertar el dispositivo sin necesidad,
respetar modo ahorro y Wi-Fi únicamente. **Nunca ejecutar IA en segundo plano
sin acción explícita del usuario.**

## Tokens push

Asociados al dispositivo, protegidos en servidor, actualizados al cambiar,
eliminados al cerrar sesión, revocados al eliminar el dispositivo. Nunca para
seguimiento publicitario. **Nunca en logs abiertos.**

## Widgets

Pueden mostrar: versículo público, progreso genérico, próximo evento, botón de
apertura.

**Nunca:** oraciones privadas, diario, estado emocional, conversaciones con IA,
contenido del Modo Arca. Ocultar lo sensible con el dispositivo bloqueado.

## Calendario del sistema

Integración opcional para eventos, cursos, retiros y reuniones.

**Nunca exportar automáticamente** oraciones, diario, estado espiritual,
confesiones ni crisis. El usuario elige qué se exporta.

## Cierre de sesión y eliminación de cuenta

**Cerrar sesión:** cancelar notificaciones privadas locales, limpiar widgets,
revocar el token push, pausar sincronización, limpiar accesos rápidos.

**Eliminar cuenta:** revocar tokens, cancelar remotas y locales, eliminar
programaciones y preferencias, desvincular calendarios, detener trabajos
pendientes.

## Analítica

Solo agregados: entregada, abierta, descartada, categoría, tiempo aproximado de
apertura. **Nunca** contenido, texto de oración, tema del diario, estado
emocional concreto ni respuesta de IA.

## Pruebas obligatorias

Las 20 del Documento 13, incluyendo: permiso aceptado / rechazado / revocado ·
zona horaria cambiada · horario de verano · sin Internet · ahorro de batería ·
cierre de sesión · cuenta eliminada · dispositivo revocado · notificación
abierta con sesión expirada · recurso eliminado · duplicados · reintentos ·
pantalla bloqueada · vista previa desactivada · múltiples dispositivos ·
restauración en teléfono nuevo · datos móviles restringidos · solo Wi-Fi.
