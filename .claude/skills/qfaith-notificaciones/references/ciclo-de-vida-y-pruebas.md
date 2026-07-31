# Ciclo de vida, integraciones y pruebas de notificaciones

Detalle del [Documento 13](../../../../docs/master-prompt/13-notificaciones-y-tareas-fondo.md).

## Permisos del sistema

**No pidas el permiso al abrir la app por primera vez.** Flujo correcto:

1. Pantalla interna explicando qué recordatorios puede recibir
2. Permitir elegir categorías
3. Solicitar el permiso del sistema
4. Respetar la decisión

Si lo rechaza: no insistir repetidamente, permitir activarlo desde
configuración.

### Sin permiso de notificaciones

QFaith **sigue funcionando**. Muestra recordatorios dentro de la aplicación y
permite exportar ciertos eventos al calendario con consentimiento. **No
bloquear funciones.**

## Reintentos en tareas de fondo

Espera progresiva ante: sin conexión, servidor temporalmente no disponible,
token expirado, error de carga, tiempo de espera agotado.

No reintentar indefinidamente errores permanentes. Registrar el estado **sin
contenido privado**.

## Archivos grandes

Las cargas de audio, imagen y documentos deben poder pausarse y reanudarse,
verificar integridad, cifrarse antes de cargar, mostrar progreso dentro de la
app y respetar «solo Wi-Fi» si está configurado.

No enviar notificaciones repetitivas durante la carga.

## Calendario del sistema

Integración **opcional** con Apple Calendar y Google Calendar, para eventos de
iglesia, cursos, retiros, reuniones y recordatorios seleccionados.

**Nunca exportar automáticamente:** oraciones, diario, estado espiritual,
confesiones, crisis.

El usuario elige explícitamente qué elemento se exporta.

## Widgets del sistema

Opcionales. **Pueden mostrar:** versículo público, progreso genérico, próximo
evento, botón para abrir QFaith.

**Nunca mostrar:** oraciones privadas, diario, estado emocional,
conversaciones con IA, contenido del Modo Arca.

Por defecto, ocultar contenido sensible cuando el dispositivo está bloqueado.

## Cierre de sesión

- Cancelar notificaciones privadas locales
- Eliminar contenido visible de widgets
- Revocar o desasociar el token push
- Pausar sincronización
- Limpiar accesos rápidos
- Mantener solo avisos públicos permitidos, si el usuario lo autorizó

## Eliminación de cuenta

- Revocar tokens push
- Cancelar notificaciones remotas y locales
- Eliminar programaciones y preferencias
- Desvincular calendarios
- Detener trabajos pendientes
- Eliminar datos conforme a la política de retención

## Analítica de notificaciones

**Solo agregados:** entregada, abierta, descartada, categoría, tiempo
aproximado de apertura.

**Nunca:** contenido privado, texto de oración, tema del diario, estado
emocional específico, respuesta de IA.

Debe respetar la configuración de privacidad del usuario.

## Las 20 pruebas obligatorias

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

## Los 16 criterios de aceptación

El módulo está terminado cuando:

1. El usuario puede activar y desactivar cada categoría.
2. Las notificaciones respetan el horario de silencio.
3. No se muestra contenido sensible por defecto.
4. Los recordatorios funcionan sin Internet.
5. No existen duplicados.
6. Los cambios de zona horaria se manejan correctamente.
7. Las notificaciones abren la pantalla correcta.
8. Los recursos privados exigen desbloqueo.
9. Los tokens se revocan al cerrar sesión o eliminar el dispositivo.
10. Los procesos en segundo plano son idempotentes.
11. La aplicación funciona aunque el permiso sea rechazado.
12. No existe lenguaje culpabilizador o manipulador.
13. Las iglesias no pueden ignorar las preferencias del usuario.
14. La analítica no captura información espiritual privada.
15. La batería y el consumo de datos permanecen en límites razonables.
16. Las pruebas de iOS y Android son satisfactorias.
