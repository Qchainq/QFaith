# Documento 4 — Base de Datos y Almacenamiento

> Versión 1.0. El esquema detallado (tablas, campos, índices) está en el
> [Documento 12](12-modelo-de-datos.md), que prevalece sobre este.

## Objetivo

Diseñar una base de datos segura, escalable y preparada para millones de
usuarios, manteniendo la privacidad como prioridad absoluta.

## Tecnología

- **Base de datos principal:** PostgreSQL (Supabase)
- **Autenticación:** Supabase Auth
- **Archivos:** Supabase Storage
- **Funciones:** Supabase Edge Functions

## Filosofía

Toda información pertenece únicamente al usuario. La empresa nunca será
propietaria de los datos espirituales. Solo almacenará información necesaria
para prestar el servicio.

## Modelo de almacenamiento

Existen dos tipos de información.

### Información pública

Correo. Nombre. Idioma. Zona horaria. Configuración. Dispositivos registrados.
Preferencias.

Esta información puede almacenarse sin cifrado de extremo a extremo.

### Información privada

Diario espiritual. Peticiones. Respuestas de oración. Memorial. Notas bíblicas.
Reflexiones. Objetivos. Archivos personales.

**Toda esta información deberá cifrarse antes de salir del dispositivo.**

## Estructura general

users · profiles · devices · sessions · habits · habit_logs · prayers ·
prayer_updates · memorials · journal_entries · journal_media · bible_notes ·
bible_highlights · reading_plans · reading_progress · sermons · sermon_notes ·
ai_conversations · churches · groups · events · notifications · settings ·
audit_logs

## Reglas

Cada tabla tendrá: UUID, fecha creación, fecha actualización, estado,
propietario, control de versión.

### Identificadores

Nunca utilizar IDs incrementales. Todo utilizará UUID.

### Eliminación

Nunca eliminar inmediatamente. Primero papelera, después eliminación
permanente.

### Papelera

Los elementos permanecerán 30 días. Después serán eliminados definitivamente.

### Sincronización

Cada registro tendrá: `version`, `updated_at`, `device_id`, `sync_status`.

Esto permitirá sincronizar múltiples dispositivos.

### Control de conflictos

Si dos dispositivos modifican el mismo registro: la aplicación detectará el
conflicto e intentará fusionarlo. Si no es posible, preguntará al usuario.

**Nunca sobrescribirá información silenciosamente.**

## Archivos

Todas las imágenes, audios, PDF y documentos se almacenarán en Supabase
Storage.

**Reglas de Storage:** cada usuario tendrá su propio espacio. Nunca podrá
acceder al espacio de otro usuario.

## Respaldos

Backups automáticos: diarios, semanales y mensuales.

## Cifrado

Todo contenido privado será cifrado antes de subirlo. La empresa nunca podrá
leerlo.

## Autenticación

Correo. Apple. Google. Recuperación segura.

## Sesiones

Cada dispositivo tendrá: ID, modelo, sistema operativo, última conexión, IP
aproximada, estado.

## Dispositivos

El usuario podrá ver dispositivos, cerrar sesiones y eliminar dispositivos.

## Configuración

Todo estará centralizado: idioma, tema, notificaciones, privacidad, biometría.

## Notificaciones

No almacenar contenido privado. Solo referencias.

## Auditoría

**Registrar únicamente:** errores, inicios de sesión, cambios importantes.

**Nunca registrar:** diarios, oraciones, conversaciones.

## Búsquedas

Todas las tablas deberán estar indexadas. Optimizar consultas. Evitar consultas
completas.

## Escalabilidad

Preparada para millones de registros. Nunca depender de consultas lentas.

## Seguridad

Todas las tablas utilizarán Row Level Security, permisos mínimos y
validaciones. Nunca exponer tablas directamente.

## API

Nunca acceder directamente a PostgreSQL desde la interfaz. Todo pasará por
servicios.

## Offline

Toda información importante existirá también localmente. El usuario podrá
utilizar la aplicación sin Internet.

## Restauración

Al cambiar de dispositivo: instalar, iniciar sesión, introducir clave de
recuperación si es necesaria, descargar respaldo, continuar utilizando la
aplicación.

## Objetivo final

Construir una base de datos preparada para funcionar durante muchos años, con
máxima privacidad, excelente rendimiento y crecimiento sin necesidad de
rediseños importantes.
