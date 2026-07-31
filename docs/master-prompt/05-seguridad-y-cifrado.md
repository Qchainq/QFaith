# Documento 5 — Seguridad y Cifrado

> Versión 1.0

## Objetivo

Construir una aplicación donde la privacidad del usuario sea prioritaria. La
empresa nunca deberá poder acceder al contenido espiritual de los usuarios. La
seguridad siempre tendrá prioridad sobre la comodidad.

## Filosofía

Todo dato pertenece exclusivamente al usuario. La empresa únicamente
proporciona el servicio. Nunca será propietaria de la información.

## Principios

1. Zero Knowledge.
2. End-to-End Encryption.
3. Least Privilege.
4. Privacy by Design.
5. Secure by Default.

## Zero Knowledge

La empresa nunca podrá leer: diario, oraciones, notas, memorial, reflexiones,
conversaciones privadas, archivos personales.

## Cifrado

Todo contenido privado será cifrado **en el dispositivo** antes de enviarse al
servidor. El servidor únicamente almacenará información cifrada.

### Datos que se cifran

Diario espiritual. Peticiones. Memorial. Notas bíblicas. Objetivos.
Reflexiones. Fotografías. Audios. Documentos. Archivos personales.

### Datos que NO se cifran

Correo electrónico. Idioma. Tema. Configuración. Zona horaria. Identificador
del usuario. Versión de la aplicación.

## Claves

- Las claves nunca deberán almacenarse en texto plano.
- Nunca enviar claves al servidor.
- Nunca registrar claves.

### Generación de claves

Las claves deberán generarse localmente. Cada usuario tendrá una clave maestra.
De ella derivarán las demás claves necesarias.

### Almacenamiento local

Las claves se almacenarán utilizando el almacén seguro del sistema operativo
(Keychain / Keystore). Nunca utilizar almacenamiento normal.

## Biometría

Compatible con Face ID, Touch ID, huella y PIN.

**La biometría únicamente desbloqueará la clave local.**

## Recuperación

El usuario podrá recuperar su información mediante: inicio de sesión, clave de
recuperación, respaldo cifrado.

Si pierde tanto la clave de recuperación como el acceso a su cuenta, la empresa
no podrá descifrar los datos privados.

## Contraseñas

Nunca almacenar contraseñas. Toda autenticación será gestionada mediante
Supabase Auth.

## Sesiones

Cada dispositivo tendrá su propia sesión. El usuario podrá cerrar sesión,
eliminar dispositivos y revocar accesos.

## Comunicaciones

Toda comunicación utilizará HTTPS/TLS. Nunca transmitir datos sensibles sin
cifrado.

**Certificados:** validar certificados. No permitir conexiones inseguras.

**Tokens:** nunca guardar tokens en almacenamiento inseguro. Renovación
automática. Revocación inmediata.

## Protección contra ataques

SQL Injection · XSS · CSRF · Replay · Brute Force · MITM · Session Hijacking ·
Token Theft

## Limitación de accesos

Todos los servicios deberán validar: usuario, permisos, propiedad del recurso,
estado de la sesión.

## Row Level Security

Todas las tablas utilizarán RLS. Un usuario únicamente podrá acceder a su
propia información.

## Registros

**Nunca registrar:** contraseñas, claves, oraciones, diarios, reflexiones,
notas privadas.

## Backups

Los respaldos también permanecerán cifrados. Nunca crear copias sin cifrado.

## Eliminación

Cuando un usuario elimine información: eliminar copia local, copia remota,
caché y archivos temporales.

## Dispositivos

El usuario podrá visualizar dispositivos activos, fecha, sistema operativo,
última conexión, y cerrar sesión remotamente.

## Modo sin Internet

La aplicación continuará funcionando. Toda la información permanecerá cifrada.
La sincronización se realizará posteriormente.

## Seguridad de la IA

- La IA nunca almacenará información privada fuera del sistema autorizado.
- Nunca utilizar conversaciones privadas para entrenamiento.
- Nunca compartir información entre usuarios.

## Notificaciones

Nunca mostrar información privada en la pantalla bloqueada.

| | Ejemplo |
| --- | --- |
| ❌ Incorrecto | «Tu oración por Juan fue respondida.» |
| ✅ Correcto | «Tienes una actualización en QFaith.» |

## Auditoría

**Registrar únicamente:** errores, intentos de acceso, eventos críticos.

**Nunca registrar contenido espiritual.**

## Dependencias

Utilizar únicamente librerías de seguridad ampliamente auditadas. Evitar
librerías sin mantenimiento.

## Actualizaciones

Toda vulnerabilidad crítica deberá corregirse inmediatamente.

## Objetivo final

Construir una aplicación donde el usuario tenga la certeza de que nadie, ni
siquiera la empresa desarrolladora, puede acceder a su información espiritual
privada.
