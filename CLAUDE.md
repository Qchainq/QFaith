# QFaith

Compañero espiritual cristiano para iOS y Android. Privado por diseño: la
empresa no puede leer el contenido espiritual del usuario.

**Stack:** React Native · Expo · TypeScript estricto · React Navigation · React
Query · Zustand · React Hook Form · Supabase (PostgreSQL, Auth, Storage, Edge
Functions).

**Idioma del proyecto:** español. Código, commits, docs y comentarios en
español; identificadores en inglés cuando sea la convención del ecosistema.

## Invariantes — aplican a todo cambio, sin excepción

1. **Zero-knowledge.** Diario, oraciones, memorial, notas bíblicas,
   reflexiones, objetivos, archivos y mensajes de IA se cifran **en el
   dispositivo** antes de salir. El servidor solo ve `encrypted_payload`.
2. **Nunca registrar** contenido espiritual, claves, tokens ni contraseñas en
   logs, trazas, analítica o mensajes de error.
3. **RLS en todas las tablas personales.** Ninguna política permite a líderes,
   pastores, mentores ni administradores leer contenido privado.
4. **Offline-first.** Toda acción se guarda primero en local. Nunca bloquear al
   usuario esperando la red.
5. **Nunca sobrescribir datos silenciosamente.** Los conflictos se fusionan o
   los decide el usuario.
6. **Soft delete.** `deleted_at` + papelera de 30 días. Nunca `DELETE` directo.
7. **UUID siempre**, nunca IDs incrementales. Fechas en UTC.
8. **Todo texto vía i18n.** Nunca strings literales en componentes.
9. **Todo estilo vía Design System.** Nunca estilos propios en un componente.
10. **Nunca consultas a Supabase desde pantallas.** Repositorio → caso de uso →
    React Query → pantalla.
11. **La IA no tiene autoridad espiritual.** Nunca habla como Dios, nunca
    profetiza, nunca reemplaza consejería pastoral.
12. **Nunca lenguaje culpabilizador ni gamificación agresiva.** Sin rachas
    punitivas, sin urgencia falsa, sin manipulación espiritual.
13. **Nada de `any` indiscriminado**, `@ts-ignore` sin justificar, código
    simulado, TODO permanentes ni secretos en el repo.
14. **Nunca criptografía propia.** Solo bibliotecas auditadas y reconocidas.
15. **Nunca datos reales de usuarios** en desarrollo, pruebas o staging.

## Especificación

La fuente canónica son los 15 documentos en
[`docs/master-prompt/`](docs/master-prompt/README.md). **No los leas todos** —
carga la skill del área en la que trabajas:

| Trabajas en… | Skill |
| --- | --- |
| Capas, módulos, estructura, estado, navegación | `qfaith-arquitectura` |
| Cifrado, claves, biometría, RLS, autenticación | `qfaith-seguridad` |
| Tablas, campos, migraciones, índices | `qfaith-datos` |
| Colores, tipografía, componentes, animaciones | `qfaith-design-system` |
| Prompts, límites doctrinales, Modo Crisis | `qfaith-ia` |
| Cola de cambios, conflictos, restauración | `qfaith-offline-sync` |
| Recordatorios, push, tareas de fondo, widgets | `qfaith-notificaciones` |
| Roles, permisos de iglesia, mentores, compartir | `qfaith-iglesia` |
| Textos, traducciones, errores, datos ficticios | `qfaith-textos` |
| Tests, cobertura, CI/CD, rendimiento, publicación | `qfaith-calidad` |

Cada skill indica **qué modelo decide, cuál implementa y cuándo escalar a
Opus** en su área. Consúltala antes de asumir que puedes tomar una decisión.

Ante contradicción entre documentos: **gana el más específico y reciente.** El
Documento 12 prevalece sobre el 4 en todo lo relativo al esquema.

## Fases

| Fase | Alcance | Criterio de salida |
| --- | --- | --- |
| **1 — Fundamentos** | Arquitectura, Supabase, auth, cifrado, claves, RLS, sync base, Design System, CI/CD | Crear, cifrar, sincronizar y restaurar un registro privado entre dos dispositivos |
| **2 — Producto** | Los 10 módulos del MVP, IA, notificaciones, offline completo, suscripción | Todos los flujos del MVP end-to-end en iOS y Android |
| **3 — Lanzamiento** | Pruebas completas, rendimiento, accesibilidad, auditoría, legal, tiendas | Aprobada para producción, sin errores críticos |

**Estado actual: Fase 1, sin empezar.** El repo solo contiene documentación.

Avanza automáticamente dentro de una fase. No pidas autorización por archivos,
carpetas, nombres internos, componentes, tests ni refactorizaciones
compatibles.

## Cuándo parar y preguntar

Solo ante decisiones humanas reales: requisitos contradictorios sin criterio de
prioridad · cambio del modelo de negocio · compra de licencia · coste externo
relevante · aceptar un riesgo de seguridad · credenciales inexistentes ·
política legal que requiere revisión profesional · exigencia de una plataforma
· borrar datos o infraestructura de producción.

## Reparto de modelos

- **Opus** — arquitectura, criptografía, seguridad, recuperación, auth, modo
  crisis, pagos, auditoría, aprobación de fase. Nunca para tareas repetitivas.
- **Sonnet** — implementación principal: pantallas, servicios, repositorios,
  integraciones, sync, tests, Design System.
- **Haiku** — documentación, traducciones, datos ficticios, formato, tareas
  mecánicas. No aprueba seguridad, cifrado, recuperación, pagos ni crisis.

Los cambios en cifrado, autenticación, recuperación, pagos y modo crisis
**requieren revisión de Opus** antes de darse por terminados.

## Definición de terminado

**Tarea:** compila · cumple el requisito · tiene pruebas · maneja errores ·
respeta accesibilidad y privacidad · sin regresiones · revisada según su
riesgo.

**Módulo:** todos los flujos funcionan online y offline · sincroniza · respeta
permisos · maneja estado vacío, carga, error y pérdida de conexión · mantiene
el Design System · no filtra datos.

Cobertura mínima: 90 % en dominio, seguridad, sync y cifrado · 85 % casos de
uso · 80 % global.

## Git

Rama de trabajo: `claude/skills-setup-token-optimization-tjze3p`. Commits en
español, descriptivos. No abrir PR salvo petición explícita.
