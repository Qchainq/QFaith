# Documento 13 — Notificaciones, Recordatorios y Tareas en Segundo Plano

> Versión 1.0

## Objetivo

Definir cómo QFaith utilizará notificaciones, recordatorios y procesos en
segundo plano sin generar presión, culpa, saturación ni exposición de
información privada.

Las notificaciones deberán ayudar al usuario. Nunca deberán controlar su
comportamiento. Nunca deberán convertirse en una herramienta adictiva.

## Principios generales

1. Las notificaciones serán opcionales.
2. El usuario decidirá qué tipos desea recibir.
3. La aplicación no enviará notificaciones excesivas.
4. Nunca se mostrará información espiritual sensible en la pantalla bloqueada.
5. No se utilizarán mensajes que generen culpa.
6. No se reiniciarán rachas ni se amenazará con perder progreso.
7. Las notificaciones deberán respetar horarios de descanso.
8. Los recordatorios locales tendrán prioridad sobre los remotos cuando no se
   necesite servidor.
9. Los procesos en segundo plano deberán ser eficientes y respetar la batería.
10. La ausencia de permisos de notificación no deberá impedir usar la
    aplicación.

## Tipos de notificaciones

1. Recordatorios de hábitos
2. Recordatorios de oración
3. Planes de lectura
4. Devocional diario
5. Revisión de sermón
6. Eventos de iglesia
7. Cursos y grupos
8. Sincronización o respaldo
9. Seguridad de cuenta
10. Suscripción y facturación
11. Modo crisis, únicamente bajo condiciones estrictas
12. Actualizaciones importantes de la aplicación

## Clasificación por prioridad

### Prioridad crítica

Solo para: inicio de sesión sospechoso, dispositivo nuevo, cambio de clave de
recuperación, revocación de sesión, problema grave de respaldo, riesgo
inmediato detectado durante una conversación de crisis (cuando sea técnica y
legalmente apropiado).

**Estas notificaciones no podrán utilizarse para hábitos o contenido
promocional.**

### Prioridad alta

Evento próximo confirmado. Recordatorio solicitado expresamente. Plan que el
usuario configuró con hora concreta. Acción de seguridad pendiente.

### Prioridad normal

Devocional. Hábito. Oración. Lectura. Sermón.

### Prioridad baja

Resumen semanal. Contenido nuevo. Sugerencias. Mensajes informativos.

## Configuración del usuario

El usuario podrá configurar individualmente: notificaciones generales, hábitos,
oración, devocionales, Biblia, sermones, iglesia, seguridad, sincronización,
suscripción, sonido, vibración, vista previa del contenido, horario de
silencio, días activos, frecuencia máxima, canal de entrega.

La configuración deberá sincronizarse entre dispositivos cuando corresponda.

## Horario de silencio

El usuario podrá definir hora de inicio, hora de finalización, días de
aplicación y excepciones de seguridad.

Durante este periodo: no enviar notificaciones normales, no reproducir sonido,
no vibrar, mantener pendientes para entrega posterior cuando sea apropiado.

Las alertas críticas de seguridad podrán ser una excepción, según preferencia
del usuario y capacidades del sistema operativo.

## Privacidad en pantalla bloqueada

**Nunca mostrar directamente:** texto de una oración, nombre de una persona
incluida en una petición, contenido del diario, estado espiritual, confesiones,
respuestas de IA, detalles de crisis, notas de sermón privadas.

| | Ejemplos |
| --- | --- |
| ✅ Permitidos | «Tienes un recordatorio en QFaith.» · «Tu tiempo personal está listo.» · «Hay una actualización de seguridad.» · «Tienes un evento próximo.» |
| ❌ Prohibidos | «Recuerda orar por la enfermedad de María.» · «Llevas tres días sin leer la Biblia.» · «Tu diario sobre ansiedad está pendiente.» · «Dios quiere hablarte hoy.» |

## Tono de las notificaciones

El tono deberá ser amable, breve, respetuoso, no invasivo y esperanzador.

**Nunca utilizar:** culpa, amenazas, presión, lenguaje profético, manipulación
espiritual, urgencia falsa.

| | Ejemplos |
| --- | --- |
| ✅ Correctos | «Tu momento de lectura está disponible.» · «Puedes continuar hoy donde quedaste.» · «¿Deseas dedicar unos minutos a tu oración?» · «Tu plan sigue disponible cuando estés listo.» |
| ❌ Incorrectos | «Has fallado otra vez.» · «Dios está esperando y tú no has orado.» · «Perderás tu progreso si no entras ahora.» · «Esta puede ser tu última oportunidad.» |

## Recordatorios de hábitos

Cada hábito podrá definir: días, hora, ventana horaria, repetición, zona
horaria, sonido, vibración, posponer, omitir hoy.

**Acciones disponibles desde la notificación:** marcar como completado,
posponer, abrir hábito, omitir hoy.

No permitir más de un número razonable de recordatorios por hábito al día.
Valor recomendado por defecto: **un recordatorio diario**. El usuario podrá
ampliar la frecuencia dentro de límites seguros.

## Recordatorios de oración

Cada petición podrá tener: hora específica, días seleccionados, frecuencia
semanal, fecha especial, recordatorio único, periodo temporal.

La notificación no mostrará el texto privado salvo que el usuario habilite
expresamente la vista previa.

Por defecto utilizar: «Tienes una oración programada.»

## Devocional diario

El usuario podrá seleccionar: mañana, tarde, noche, hora personalizada, sin
recordatorio.

La aplicación no deberá enviar múltiples avisos por el mismo devocional. Si el
usuario no abre la notificación, no insistir automáticamente más de una vez
salvo que él lo configure.

## Planes de lectura

Los recordatorios podrán indicar: lectura disponible, día del plan, tiempo
estimado.

**No mostrar mensajes punitivos por atraso.**

La lógica deberá permitir: pausar el plan, reprogramar, recuperar días,
continuar sin reiniciar, adaptar el calendario.

## Revisión de sermón

Después de guardar un sermón, el usuario podrá activar recordatorios: al día
siguiente, a mitad de semana, antes del siguiente culto, fecha personalizada.

Ejemplo: «Revisa la aplicación práctica que guardaste esta semana.»

No incluir el contenido privado de la nota en la pantalla bloqueada.

## Eventos de iglesia

Podrán enviarse notificaciones por: inscripción confirmada, cambio de horario,
cambio de lugar, cancelación, inicio próximo, nuevo material.

El usuario podrá desactivar notificaciones por iglesia, grupo o evento. No
enviar anuncios masivos sin límites.

Las iglesias deberán respetar: consentimiento, frecuencia, horario de silencio,
preferencias del usuario.

## Notificaciones de seguridad

Enviar cuando ocurra: inicio de sesión desde un dispositivo nuevo, revocación
de dispositivo, cambio de correo, cambio de contraseña, modificación de
recuperación, fallo repetido de desbloqueo, desactivación del respaldo, riesgo
de pérdida de datos, acceso sospechoso.

Deberán ser claras y accionables. Ejemplo: «Se inició sesión en un nuevo
dispositivo. Revisa la actividad.»

## Respaldo y sincronización

Notificar únicamente cuando sea necesario: respaldo detenido durante un periodo
prolongado, clave de recuperación no configurada, conflicto que requiere
decisión, dispositivo sin sincronizar durante demasiado tiempo, error
persistente, restauración completada.

**No notificar cada sincronización exitosa.** Mostrar éxito dentro de la
aplicación de forma discreta.

## Notificaciones de suscripción

Permitidas para: compra confirmada, renovación próxima cuando la normativa lo
exija, pago rechazado, cambio de plan, cancelación, fin de prueba, restauración
de compra.

No utilizar notificaciones de pago para presionar espiritualmente. Nunca
comunicar: «Paga para crecer en tu fe.» · «Tu relación con Dios merece
Premium.»

## Notificaciones promocionales

Por defecto estarán desactivadas. Solo se enviarán con consentimiento
explícito. Deberán poder desactivarse sin afectar las notificaciones
operativas.

**Nunca utilizar datos espirituales para segmentación.** No segmentar según:
ansiedad, oraciones, confesiones, crisis, diario, estado espiritual, situación
familiar, dificultades económicas.

## Notificaciones locales

Se utilizarán para: hábitos, oración, devocional, lectura, sermón,
recordatorios personales.

**Ventajas:** funcionan sin Internet, mantienen mayor privacidad, reducen
dependencia del servidor, disminuyen costos.

La programación local deberá actualizarse cuando cambien: zona horaria,
horario, preferencias, estado del hábito, pausa del plan, cierre de sesión.

## Notificaciones remotas

Se utilizarán para: seguridad, iglesia, cambios en eventos, restauración,
facturación, mensajes operativos, contenido nuevo autorizado.

**El servidor nunca incluirá contenido privado en el payload.** El payload
deberá contener únicamente: tipo, identificador opaco, ruta de navegación,
marca temporal, prioridad, firma o validación cuando corresponda.

## Tokens push

Los tokens de Apple y Google deberán: asociarse al dispositivo, cifrarse o
protegerse en servidor, actualizarse cuando cambien, eliminarse al cerrar
sesión, revocarse al eliminar un dispositivo, no utilizarse para seguimiento
publicitario.

**Nunca registrar tokens push en logs abiertos.**

## Navegación desde notificaciones

Cada notificación podrá abrir una ruta específica. Antes de navegar:

1. Verificar sesión.
2. Verificar dispositivo autorizado.
3. Verificar permisos.
4. Verificar existencia del recurso.
5. Solicitar desbloqueo biométrico cuando el contenido sea privado.
6. Evitar mostrar información si el usuario cerró sesión.

Si el recurso ya no existe: mostrar un mensaje genérico.

## Acciones rápidas

Completar. Posponer. Abrir. Marcar como leído. Confirmar asistencia. Revisar
seguridad.

No permitir acciones que expongan contenido privado sin desbloquear la
aplicación.

## Posponer

Opciones recomendadas: 10 minutos · 30 minutos · 1 hora · esta tarde · mañana ·
fecha personalizada.

El usuario podrá definir sus opciones favoritas.

## Resumen diario

Función opcional. Podrá agrupar: hábitos, lectura, oraciones, eventos, acciones
de sermón.

En lugar de enviar varias notificaciones, QFaith podrá enviar una sola.
Ejemplo: «Tienes 3 actividades personales para hoy.»

El resumen nunca mostrará detalles sensibles.

## Resumen semanal

Función opcional. Podrá mostrar: ritmo semanal, hábitos completados, planes
activos, memoriales agregados, próximos eventos.

No utilizar comparaciones con otros usuarios. No utilizar calificaciones
espirituales. No afirmar que una persona es mejor o peor cristiana.

## Límites de frecuencia

Recomendación por defecto:

- Máximo 3 notificaciones espirituales normales al día.
- Máximo 1 resumen diario.
- Máximo 1 notificación promocional por semana, solo con consentimiento.
- Alertas operativas según necesidad.
- Seguridad sin límite artificial cuando exista riesgo real.

El usuario podrá reducir estos límites. No podrá aumentarlos hasta un nivel
abusivo.

## Detección de fatiga

Si el usuario ignora repetidamente una categoría, la aplicación podrá sugerir
dentro de la app: «¿Deseas reducir estos recordatorios?»

Nunca aumentar automáticamente la presión. Nunca utilizar lenguaje de reproche.

## Zonas horarias

Todos los horarios se almacenarán con contexto de zona horaria.

Al viajar: actualizar recordatorios según preferencia, preguntar si desea
conservar la hora local original o adaptar a la nueva zona, evitar
notificaciones durante la madrugada.

Los eventos de iglesia se mostrarán en la zona horaria correspondiente.

### Cambio de hora y horario de verano

El sistema deberá manejar: horario de verano, cambio automático de zona, horas
inexistentes, horas repetidas, viajes internacionales.

**No programar recordatorios mediante cálculos fijos de segundos cuando deban
respetar hora local.**

## Procesos en segundo plano

Se permitirán únicamente para: sincronización incremental, carga de cola
pendiente, descarga autorizada, actualización de planes, programación de
notificaciones, limpieza de archivos temporales, verificación de respaldo,
renovación segura de sesión cuando corresponda.

No mantener procesos permanentes innecesarios.

### Restricciones de iOS y Android

La implementación deberá respetar las políticas de cada sistema. No asumir
ejecución continua. Diseñar procesos idempotentes.

Cada tarea deberá poder: interrumpirse, reintentarse, continuar después,
ejecutarse varias veces sin duplicar datos.

### Idempotencia

Toda tarea en segundo plano deberá utilizar identificadores únicos:
`sync_job_id`, `notification_schedule_id`, `backup_revision`.

**No crear:** recordatorios duplicados, eventos duplicados, registros de
hábitos duplicados, archivos duplicados.

### Reintentos

Aplicar reintentos con espera progresiva para: sin conexión, servidor
temporalmente no disponible, token expirado, error de carga, tiempo de espera
agotado.

No reintentar indefinidamente errores permanentes. Registrar el estado sin
contenido privado.

### Batería y datos

Los procesos deberán: agrupar tareas, evitar despertar el dispositivo
innecesariamente, respetar modo ahorro, permitir sincronización solo por Wi-Fi,
evitar descargas grandes sin consentimiento, **no ejecutar IA en segundo plano
sin una acción explícita del usuario**.

### Archivos grandes

Las cargas de audio, imagen y documentos deberán: poder pausarse, poder
reanudarse, verificar integridad, cifrarse antes de cargar, mostrar progreso
dentro de la app, respetar Wi-Fi únicamente si está configurado.

No enviar notificaciones repetitivas durante la carga.

## Permisos del sistema

La aplicación solicitará permiso de notificaciones solo después de explicar su
utilidad. **No solicitarlo inmediatamente al abrir por primera vez.**

Flujo recomendado:

1. Mostrar una pantalla interna.
2. Explicar qué recordatorios puede recibir.
3. Permitir elegir categorías.
4. Solicitar permiso del sistema.
5. Respetar la decisión.

Si el permiso es rechazado: no insistir repetidamente. Permitir activarlo desde
configuración.

### Sin permiso de notificaciones

QFaith seguirá funcionando. Mostrará recordatorios dentro de la aplicación.
Permitirá exportar ciertos eventos al calendario, con consentimiento. No
bloquear funciones.

## Calendario del sistema

La integración con Apple Calendar o Google Calendar será opcional. Se utilizará
para: eventos de iglesia, cursos, retiros, reuniones, recordatorios
seleccionados.

**Nunca exportar automáticamente:** oraciones, diario, estado espiritual,
confesiones, crisis.

El usuario deberá elegir qué elemento se exporta.

## Modo Crisis

Las notificaciones relacionadas con crisis requieren máximo cuidado.

- No enviar mensajes automáticos que puedan agravar la situación.
- No mostrar detalles en pantalla bloqueada.
- No crear seguimiento invasivo sin consentimiento.

Cuando el usuario active una acción de ayuda: facilitar contacto autorizado,
mostrar recursos relevantes, permitir recordatorios de seguridad elegidos por
el usuario, no fingir supervisión humana permanente.

QFaith nunca afirmará «Estamos vigilándote» ni «Alguien llegará pronto», salvo
que exista realmente un servicio humano confirmado.

## Menores de edad

Para usuarios menores de edad: aplicar configuración de privacidad reforzada,
evitar notificaciones sensibles en pantalla bloqueada, cumplir normativa
aplicable, no enviar mensajes de marketing personalizados, no compartir
información con padres o iglesia sin base legal y consentimiento apropiado
(excepto obligaciones legales reales).

## Analítica de notificaciones

**Solo se podrán medir datos agregados:** entregada, abierta, descartada,
categoría, tiempo aproximado de apertura.

**Nunca registrar:** contenido privado, texto de oración, tema del diario,
estado emocional específico, respuesta de IA.

La analítica deberá respetar la configuración de privacidad.

## Eliminación de cuenta

Revocar tokens push. Cancelar notificaciones remotas. Cancelar notificaciones
locales. Eliminar programaciones. Eliminar preferencias. Desvincular
calendarios. Detener trabajos pendientes. Eliminar datos conforme a la política
de retención.

## Cierre de sesión

Cancelar notificaciones privadas locales. Eliminar contenido visible de
widgets. Revocar o desasociar el token push. Pausar sincronización. Limpiar
accesos rápidos. Mantener únicamente avisos públicos permitidos, si el usuario
lo autorizó.

## Widgets del sistema

Los widgets de inicio serán opcionales.

**Podrán mostrar:** versículo público, progreso genérico, próximo evento, botón
para abrir QFaith.

**No mostrar:** oraciones privadas, diario, estado emocional, conversaciones
con IA, contenido del Modo Arca.

Por defecto ocultar contenido sensible cuando el dispositivo esté bloqueado.

## Pruebas obligatorias

1. Permiso aceptado
2. Permiso rechazado
3. Permiso revocado posteriormente
4. Zona horaria cambiada
5. Horario de verano
6. Dispositivo sin Internet
7. Modo ahorro de batería
8. Cierre de sesión
9. Eliminación de cuenta
10. Dispositivo revocado
11. Notificación abierta con sesión expirada
12. Recurso eliminado
13. Recordatorios duplicados
14. Reintentos de tareas
15. Pantalla bloqueada
16. Vista previa desactivada
17. Usuario con múltiples dispositivos
18. Restauración en un teléfono nuevo
19. Datos móviles restringidos
20. Sincronización solo por Wi-Fi

## Criterios de aceptación

El módulo se considerará terminado cuando:

1. El usuario pueda activar y desactivar cada categoría.
2. Las notificaciones respeten el horario de silencio.
3. No se muestre contenido sensible por defecto.
4. Los recordatorios funcionen sin Internet.
5. No existan duplicados.
6. Los cambios de zona horaria se manejen correctamente.
7. Las notificaciones abran la pantalla correcta.
8. Los recursos privados exijan desbloqueo.
9. Los tokens se revoquen al cerrar sesión o eliminar el dispositivo.
10. Los procesos en segundo plano sean idempotentes.
11. La aplicación funcione aunque el permiso sea rechazado.
12. No exista lenguaje culpabilizador o manipulador.
13. Las iglesias no puedan ignorar las preferencias del usuario.
14. La analítica no capture información espiritual privada.
15. La batería y el consumo de datos permanezcan dentro de límites razonables.
16. Las pruebas de iOS y Android sean satisfactorias.

## Objetivo final

Construir un sistema de recordatorios útil, privado y respetuoso que acompañe
al usuario sin presionarlo. QFaith deberá recordar con amabilidad, guardar
silencio cuando corresponda y proteger la intimidad espiritual incluso en la
pantalla bloqueada.
