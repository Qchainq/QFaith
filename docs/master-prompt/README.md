# QFaith Master Prompt — Índice

Los 15 documentos originales (RTF) transcritos a Markdown. Son la **fuente
canónica** del proyecto: ninguna función se desarrolla si no está definida
aquí.

| # | Documento | Contenido |
| --- | --- | --- |
| 0 | [Constitución](00-constitucion.md) | Misión, principios, fases, reparto de modelos, calidad |
| 1 | [Especificación funcional](01-especificacion-funcional.md) | Producto, usuario objetivo, 10 módulos, diferenciadores |
| 2 | [Arquitectura general](02-arquitectura-general.md) | Stack, Clean Architecture, estructura de carpetas, reglas técnicas |
| 3 | [Design System — Liquid Glass](03-design-system-liquid-glass.md) | Colores, tipografía, componentes, animaciones, accesibilidad |
| 4 | [Base de datos y almacenamiento](04-base-de-datos-almacenamiento.md) | Visión general de datos, Storage, backups, papelera |
| 5 | [Seguridad y cifrado](05-seguridad-y-cifrado.md) | Zero-knowledge, E2EE, claves, biometría, RLS, ataques |
| 6 | [Sistema de IA](06-sistema-de-ia.md) | Límites doctrinales, tono, Pulso Espiritual, Modo Crisis |
| 7 | [Offline y sincronización](07-offline-y-sincronizacion.md) | Offline-first, cola de cambios, conflictos, restauración |
| 8 | [Módulo Iglesia](08-modulo-iglesia-comunidad.md) | Roles, permisos, mentores, eventos, privacidad frente a la iglesia |
| 9 | [Backend y API](09-backend-y-api.md) | Servicios por módulo, versionado, errores, rate limit, caché |
| 10 | [Mapa de pantallas](10-mapa-de-pantallas.md) | Navegación completa, onboarding, modales, búsqueda global |
| 11 | [Desarrollo funcional de módulos](11-desarrollo-funcional-modulos.md) | Comportamiento de cada módulo e integraciones cruzadas |
| 12 | [Modelo de datos](12-modelo-de-datos.md) | **44 tablas**, campos, enums, índices, RLS, retención, migraciones |
| 13 | [Notificaciones y tareas de fondo](13-notificaciones-y-tareas-fondo.md) | Prioridades, privacidad en pantalla bloqueada, idempotencia, widgets |
| 14 | [Ejecución, pruebas y publicación](14-ejecucion-pruebas-publicacion.md) | MVP, testing, cobertura, rendimiento, legal, CI/CD, DoD |

## Precedencia ante contradicciones

Regla del Documento 14: **gana el documento más específico y reciente.**

Casos ya resueltos:

- **Esquema de base de datos:** el Documento 12 prevalece sobre el 4.
- **Nombre del producto:** el Documento 0 se tituló «CAMINO»; a partir del
  Documento 1 el producto es **QFaith**.
- **Campos de sincronización:** el Documento 7 añade `checksum` a los cuatro
  del Documento 4; el 12 usa `sync_revision` y `last_modified_device_id` como
  nombres definitivos.

## Cómo usar esto sin gastar tokens

No leas los 15 documentos al empezar una sesión. `CLAUDE.md` ya carga los
invariantes. Para el detalle de un área, invoca la skill correspondiente
(`qfaith-datos`, `qfaith-seguridad`, …) — cada una resume su documento y
enlaza aquí solo cuando hace falta el texto literal.
