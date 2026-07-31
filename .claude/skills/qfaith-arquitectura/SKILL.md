---
name: qfaith-arquitectura
description: >-
  Reglas de arquitectura de QFaith: Clean Architecture, capas, estructura de
  carpetas, organización por módulos, estado global con Zustand, React Query,
  repositorios, navegación de cinco pestañas, i18n, servicios únicos y política
  de dependencias. Úsala ANTES de crear un archivo, carpeta, módulo, pantalla,
  hook, servicio o repositorio nuevo; antes de decidir dónde vive un trozo de
  código; antes de instalar cualquier dependencia; y al revisar si un cambio
  respeta las capas. Actívala si se menciona estructura del proyecto, capas,
  Clean Architecture, módulos, Zustand, React Query, navegación, tabs,
  repositorio, caso de uso o dónde colocar código en QFaith.
---

# Arquitectura de QFaith

Fuente: [Documento 2](../../../docs/master-prompt/02-arquitectura-general.md) y
[Documento 9](../../../docs/master-prompt/09-backend-y-api.md).

## Capas (Clean Architecture)

```
Presentación → Aplicación → Dominio ← Datos ← Infraestructura
```

El **Dominio** no importa nada de las otras capas. La **Presentación** nunca
toca Datos directamente. Si un import cruza capas hacia arriba, el diseño está
mal.

Flujo obligatorio de una lectura de datos:

```
Pantalla → hook de React Query → caso de uso → repositorio → fuente (local | Supabase)
```

**Nunca** llames a Supabase desde una pantalla, un componente o un store.

## Estructura

```
src/
  app/            # arranque, providers, configuración raíz
  modules/        # un directorio por módulo de negocio
  shared/
    components/   # Design System y componentes transversales
    services/     # servicios únicos (auth, notificaciones, IA, sync, cripto, biometría)
    database/     # base local cifrada, esquema, migraciones locales
    hooks/
    theme/
    navigation/
    assets/
    utils/
    types/
    constants/
```

Cada módulo contiene: `screens/`, `components/`, `services/`, `repositories/`,
`models/`, `use-cases/`, `__tests__/`.

Módulos: `inicio` · `biblia` · `oracion` · `habitos` · `diario` ·
`biblioteca-vida` · `ia` · `iglesia` · `perfil` · `configuracion` ·
`sincronizacion`.

Cada módulo es independiente. **Nunca módulos gigantes.** Si un módulo crece
demasiado, divídelo antes de seguir añadiendo.

## Estado

- **Zustand** solo para estado verdaderamente global (sesión, tema, bloqueo
  biométrico, estado de conexión y sincronización).
- Todo lo demás vive dentro de su módulo o en React Query.
- Los datos del servidor **no se duplican** en Zustand: son de React Query.

## Servicios únicos

Existe exactamente **uno** de cada, en `shared/services/`:

| Servicio | Regla |
| --- | --- |
| Autenticación | La app nunca llama a Supabase Auth directamente |
| Notificaciones | Ningún módulo programa notificaciones por su cuenta |
| IA | Proveedor intercambiable sin tocar el resto del sistema |
| Sincronización | Independiente de los demás módulos |
| Criptografía | Único punto de cifrado/descifrado y derivación de claves |
| Biometría | Face ID, Touch ID, huella, PIN |
| Archivos | Ninguna subida directa desde el cliente |

Duplicar cualquiera de estos es un error de arquitectura, no un atajo.

## Backend

Cada módulo tiene su propio servicio en el backend y **nunca accede
directamente a módulos ajenos**. Toda la lógica de negocio vive en el backend,
no en el frontend.

- Todo endpoint requiere autenticación salvo registro, login y recuperación.
- Toda respuesta devuelve: estado, mensaje, datos, y código de error si aplica.
- APIs versionadas (`v1`, `v2`). No romper compatibilidad sin migración.
- Toda consulta grande se pagina. Rate limit siempre.
- Caché solo para contenido público. Nunca contenido privado en caché
  compartida.
- Nunca confiar en datos del cliente: validar usuario, permisos, propiedad del
  recurso y estado de la sesión en cada acceso.

## Navegación

Cinco pestañas inferiores con efecto cristal: **Inicio · Biblia · Oración · IA
· Perfil**. Todo lo demás es navegación interna.

Ninguna función a más de tres niveles de profundidad. Toda pantalla tiene botón
volver, título, acción principal y acción secundaria.

El mapa completo de pantallas está en el
[Documento 10](../../../docs/master-prompt/10-mapa-de-pantallas.md).
**Ninguna pantalla se desarrolla si no está en ese documento.**

## Textos y configuración

- Ningún string literal en un componente: todo pasa por i18n (es/en en el MVP).
- Ningún valor de configuración escrito en el código: todo centralizado.

## Dependencias

Antes de instalar cualquier librería, comprueba: mantenimiento activo,
popularidad, seguridad, compatibilidad con Expo y licencia. Si la duda persiste
o la librería toca criptografía, es decisión de Opus.

## Errores

Todo error se captura y se clasifica (validación, autenticación, permisos,
servidor, sincronización, conectividad). Nunca mostrar errores técnicos, stack
traces, SQL, tokens ni rutas internas al usuario.
