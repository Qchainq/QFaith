---
name: qfaith-seguridad
description: >-
  Modelo de seguridad y cifrado de QFaith: zero-knowledge, cifrado extremo a
  extremo en el dispositivo, clave maestra y claves derivadas, sobres de claves
  por dispositivo, clave de recuperación, Keychain/Keystore, biometría, Row
  Level Security, tokens, protección contra ataques y qué se puede y no se
  puede registrar en logs. Úsala SIEMPRE que el trabajo toque cifrado, claves,
  autenticación, login, recuperación de cuenta, biometría, PIN, sesiones,
  dispositivos, políticas RLS, Storage, permisos, logs, analítica o cualquier
  dato del usuario que pueda ser privado. Actívala también antes de escribir
  cualquier consulta que lea o escriba contenido del usuario, y ante cualquier
  duda sobre si algo puede salir del dispositivo sin cifrar.
---

# Seguridad y cifrado de QFaith

Fuente: [Documento 5](docs/master-prompt/05-seguridad-y-cifrado.md).

## Quién decide qué — léelo antes de escribir una sola línea

| | |
| --- | --- |
| **Opus diseña y aprueba** | Esquema de cifrado, derivación y rotación de claves, sobres por dispositivo, flujo de recuperación, autenticación, políticas RLS, modelo de amenazas, pagos, modo crisis |
| **Sonnet implementa** | El diseño **ya aprobado**, sin alterarlo. Puede escribir pruebas de seguridad y corregir errores que no cambien el modelo |
| **Haiku** | Nada de esta área. No aprueba ni modifica seguridad, cifrado, recuperación ni pagos |

> **Ningún cambio en cifrado, autenticación, recuperación, pagos o modo crisis
> se da por terminado sin revisión de Opus.** Si eres Sonnet o Haiku y la tarea
> te obliga a inventar un esquema criptográfico, cambiar una política RLS o
> tocar el flujo de recuperación: **para y escala a Opus.**

Si dudas de si algo es "de seguridad", lo es. Escala.

## Principios

Zero Knowledge · End-to-End Encryption · Least Privilege · Privacy by Design ·
Secure by Default.

La seguridad tiene prioridad sobre la comodidad y sobre la velocidad de
desarrollo. Nunca se elimina una protección para simplificar código.

## Qué se cifra y qué no

| Se cifra en el dispositivo | No se cifra |
| --- | --- |
| Diario espiritual | Correo electrónico |
| Peticiones de oración | Idioma |
| Memorial | Tema |
| Notas bíblicas | Configuración |
| Reflexiones y objetivos | Zona horaria |
| Fotografías, audios, documentos | Identificador del usuario |
| Mensajes y conversaciones de IA | Versión de la aplicación |

Regla práctica: si el usuario lo escribió o lo grabó, se cifra. El servidor
almacena `encrypted_payload` y nunca lo interpreta.

## Claves

- Se generan **localmente**. Nunca viajan al servidor. Nunca se registran.
- Cada usuario tiene una **clave maestra**; de ella derivan las demás.
- Se guardan en el almacén seguro del sistema operativo (Keychain / Keystore).
  Nunca en `AsyncStorage` ni almacenamiento normal.
- `user_key_envelopes` guarda solo claves **envueltas**. La empresa no puede
  desenvolverlas.
- `recovery_configurations` guarda solo el contenedor cifrado y los parámetros
  de KDF (que no son secretos, pero deben validarse). **Nunca la frase de
  recuperación.**
- Cada dispositivo nuevo recibe únicamente las claves autorizadas, usando su
  `public_key`.

## Biometría

Face ID · Touch ID · huella · PIN.

**La biometría solo desbloquea la clave local.** No es un mecanismo de
autenticación contra el servidor y nunca sustituye al cifrado.

`is_ark_protected` (Modo Arca) exige autenticación adicional en el cliente
antes de descifrar.

## Recuperación

El usuario recupera con: inicio de sesión + clave de recuperación + respaldo
cifrado.

Si pierde ambos, **la empresa no puede descifrar sus datos privados.** Esto es
el diseño correcto, no un fallo. Nunca añadas una puerta trasera para
"ayudarle".

## Autenticación y sesiones

- Contraseñas: gestionadas por Supabase Auth. Nunca almacenarlas.
- Proveedores: correo, Apple, Google.
- Una sesión por dispositivo. El usuario puede cerrar sesión, eliminar
  dispositivos y revocar accesos remotamente.
- Un dispositivo revocado no puede sincronizar.
- Tokens: nunca en almacenamiento inseguro. Renovación automática, revocación
  inmediata.

## Row Level Security

Todas las tablas personales llevan RLS. La política base:

```sql
using (user_id = auth.uid())
```

Para datos compartidos: acceso solo con un permiso **activo y no revocado**.

Para iglesias: el permiso se calcula con membresía activa + rol + propiedad del
recurso + permiso específico.

> **Nunca escribas una política general que permita a líderes, pastores,
> mentores o administradores leer contenido privado.** No existe un caso de uso
> que lo justifique.

## Storage

Cada usuario tiene su espacio y nunca puede acceder al de otro. Los archivos se
cifran **antes** de subirse. Sin URLs públicas: acceso por rutas privadas con
autorización temporal.

## Comunicaciones

HTTPS/TLS siempre. Validar certificados. No permitir conexiones inseguras.

Protecciones exigidas: SQL Injection · XSS · CSRF · Replay · Brute Force · MITM
· Session Hijacking · Token Theft.

## Logs, analítica y errores

**Nunca registrar:** contraseñas, claves, tokens push, oraciones, diarios,
reflexiones, notas privadas, mensajes de IA, nombres de archivos privados,
estado espiritual concreto.

**Sí se puede registrar:** errores (sin contenido), intentos de acceso, eventos
críticos, latencia, disponibilidad, métricas agregadas.

`audit_events` guarda `ip_hash`, nunca la IP en claro.

## Notificaciones

Nunca mostrar contenido privado en la pantalla bloqueada.

| ❌ | ✅ |
| --- | --- |
| «Tu oración por Juan fue respondida.» | «Tienes una actualización en QFaith.» |

## Eliminación

Al eliminar información: borrar copia local, copia remota, caché y archivos
temporales. Al eliminar la cuenta: revocar tokens push, cancelar
notificaciones, desvincular calendarios y eliminar según la política de
retención.

## IA

La IA nunca almacena información privada fuera del sistema autorizado, nunca
usa conversaciones para entrenamiento y nunca comparte información entre
usuarios. Enviar contexto al proveedor requiere autorización explícita y
procesamiento temporal.

## Criptografía

**Nunca inventes algoritmos ni construcciones propias.** Usa bibliotecas
ampliamente auditadas. Evita dependencias sin mantenimiento. Toda
vulnerabilidad crítica se corrige de inmediato.

## Pruebas obligatorias

Están detalladas en `qfaith-calidad`, pero como mínimo: el texto privado nunca
llega abierto al servidor · nonces distintos producen cifrados distintos · una
clave incorrecta no descifra · los datos manipulados fallan de forma segura ·
la rotación de claves mantiene acceso a datos antiguos · el servidor no puede
reconstruir la clave maestra.
