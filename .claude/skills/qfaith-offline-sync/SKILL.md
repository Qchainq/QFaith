---
name: qfaith-offline-sync
description: >-
  Arquitectura offline-first y sincronización de QFaith: base local cifrada,
  cola de cambios, orden de sincronización, control de versiones con revisiones
  incrementales, los seis estados de un registro, detección y resolución de
  conflictos sin sobrescribir, borrado en dos fases, respaldos cifrados
  incrementales, cambio de dispositivo y restauración. Úsala SIEMPRE que
  trabajes en persistencia local, en el servicio de sincronización, en la cola
  de cambios, en resolución de conflictos, en respaldos, en restaurar una
  cuenta en un dispositivo nuevo, o cuando escribas cualquier operación de
  crear, editar o borrar que deba funcionar sin conexión. Actívala si se
  menciona offline, sin conexión, sincronizar, sync, cola, conflicto,
  restaurar, respaldo, backup o migrar de dispositivo en QFaith.
---

# Offline y sincronización

Fuente: [Documento 7](../../../docs/master-prompt/07-offline-y-sincronizacion.md).

## Regla principal

**El usuario nunca debe notar si tiene conexión o no.**

Toda acción se ejecuta primero en local. La nube solo sirve para sincronizar y
respaldar. Nada bloquea la interfaz esperando la red.

## Qué funciona sin Internet

Biblia descargada · devocionales descargados · diario · notas · oraciones ·
memorial · hábitos · perfil · configuración · planes descargados · versículos
favoritos · notas de sermones · Biblioteca de Vida.

## Qué requiere Internet

Login inicial · recuperación de cuenta · sincronización · descarga de contenido
nuevo · actualización de planes · IA · contenido enviado por la iglesia.

Cuando falta conexión para uno de estos, se informa de esa función concreta y
**el resto de la app sigue funcionando con normalidad**.

## Base local

Toda información importante tiene copia local. **La base local está cifrada.**
Nunca almacenar datos privados sin protección, ni siquiera "temporalmente".

## Cola de cambios

Toda modificación hecha sin conexión entra en una cola local y se envía
automáticamente al recuperar red.

### Orden de sincronización — estricto

1. Eliminar registros pendientes
2. Actualizar registros existentes
3. Crear nuevos registros
4. Descargar cambios del servidor

### Cuándo se sincroniza

Al abrir la app · al recuperar Internet · periódicamente · antes de cerrar
sesión · después de restaurar un respaldo.

Siempre en segundo plano, automática, silenciosa e incremental.

## Control de versiones

Cada registro sincronizable lleva:

`version` · `updated_at` · `device_id` (`last_modified_device_id`) ·
`sync_status` · `checksum`

`sync_change_log` guarda la revisión incremental por usuario: `entity_type`,
`entity_id`, `operation`, `revision`, `device_id`, `changed_at`. **Nunca
contenido privado** — solo identificadores.

La sincronización incremental se hace pidiendo cambios con `revision >` la
última conocida.

## Estados de un registro

Nuevo · Modificado · Sincronizado · Pendiente · Eliminado · En conflicto

## Conflictos

Si dos dispositivos modifican el mismo elemento:

1. Intentar combinar los cambios automáticamente.
2. Si no es posible: mostrar ambas versiones y **dejar decidir al usuario**.

> **Nunca sobrescribir información silenciosamente.** No hay "last write wins"
> en este producto.

Los conflictos se registran en `sync_conflicts` con
`encrypted_local_snapshot` y `encrypted_remote_snapshot` — **cifrados**.

## Borrado

1. Marcar como eliminado (`deleted_at`).
2. Sincronizar la marca.
3. Eliminar definitivamente cuando todos los dispositivos estén sincronizados
   y pase el periodo de papelera (30 días).

## Respaldos

Automáticos, **cifrados** e incrementales. Nunca bloquean la aplicación. Nunca
existe una copia sin cifrar.

## Cambio de dispositivo

1. Instalar
2. Iniciar sesión
3. Verificar identidad
4. Descargar respaldo cifrado
5. Reconstruir la base local
6. Continuar

Un dispositivo revocado no puede sincronizar. Cada dispositivo nuevo recibe
solo las claves autorizadas (ver `qfaith-seguridad`).

**La restauración no sobrescribe datos recientes sin confirmación.**

## Optimización

Nunca volver a descargar lo que ya existe: solo diferencias. Los archivos
(imágenes, audios, documentos) se descargan bajo demanda y luego quedan
disponibles offline.

## Tareas en segundo plano

Deben ser **idempotentes**: poder interrumpirse, reintentarse y ejecutarse
varias veces sin duplicar datos. Usa identificadores únicos (`sync_job_id`,
`backup_revision`).

Reintentos con espera progresiva ante: sin conexión, servidor no disponible,
token expirado, error de carga, timeout. No reintentar indefinidamente errores
permanentes.

Registrar el estado **sin contenido privado**.

## Indicadores en la interfaz

Mostrar discretamente: sincronizando · pendiente · sin conexión · sincronizado.

**Nunca interrumpir al usuario** ni notificar cada sincronización exitosa.

## Pruebas mínimas

Inicio sin Internet · crear, editar y eliminar offline · adjuntos pendientes ·
reinicio del teléfono · cierre forzado · recuperación de conectividad ·
conflicto entre dos dispositivos · interrupción durante la sincronización ·
reintento sin duplicados · modo avión prolongado · restauración interrumpida y
reanudada.
