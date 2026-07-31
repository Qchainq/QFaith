# Documento 2 — Arquitectura General

> Versión 1.0

## Objetivo

Definir la arquitectura completa del proyecto para garantizar escalabilidad,
seguridad, mantenibilidad y facilidad de desarrollo. Toda decisión técnica
deberá respetar este documento.

## Filosofía

QFaith deberá construirse como una aplicación preparada para millones de
usuarios. Prioridad: seguridad, escalabilidad, mantenibilidad, simplicidad,
privacidad.

## Tecnologías

### Frontend

React Native · Expo · TypeScript · React Navigation · React Query · Zustand ·
React Hook Form

### Backend

Supabase · PostgreSQL · Storage · Authentication · Edge Functions · Realtime
(solo donde aporte valor)

## Arquitectura

La aplicación utilizará **Clean Architecture**.

Capas: Presentación · Aplicación · Dominio · Datos · Infraestructura

Las capas nunca deberán depender unas de otras incorrectamente.

## Organización general

La aplicación estará dividida por módulos. Cada módulo tendrá: pantallas,
componentes, servicios, repositorio, modelos, casos de uso, pruebas.

**Nunca existirán módulos gigantes.**

## Estructura del proyecto

```
src/
  app/
  modules/
  shared/
    components/
    services/
    database/
    hooks/
    theme/
    navigation/
    assets/
    utils/
    types/
    constants/
```

## Módulos principales

Inicio · Biblia · Oración · Hábitos · Diario · IA · Iglesia · Perfil ·
Configuración · Sincronización

Cada módulo será independiente.

## Reglas técnicas

| Área | Regla |
| --- | --- |
| **Estado global** | Zustand. Solo se almacenará estado global cuando sea realmente necesario. Todo lo demás permanecerá dentro de cada módulo. |
| **Consultas** | Toda comunicación con Supabase utilizará React Query. Nunca realizar consultas directamente desde las pantallas. |
| **Autenticación** | Centralizada. La aplicación nunca accederá directamente al proveedor de autenticación; siempre usará un servicio dedicado. |
| **Base de datos** | Toda comunicación con PostgreSQL pasará por repositorios. Nunca habrá consultas SQL mezcladas con la interfaz. |
| **Almacenamiento local** | La aplicación funcionará sin Internet. Toda la información importante permanecerá disponible localmente. |
| **Sincronización** | Modelo Offline First: guardar primero localmente, sincronizar después. Nunca bloquear al usuario mientras sincroniza. |
| **Errores** | Todo error deberá ser capturado. Nunca mostrar errores técnicos al usuario. Siempre registrar errores para diagnóstico. |
| **Logs** | Dos tipos: técnicos y de auditoría. Nunca registrar información privada. |
| **Diseño** | Todo utilizará el mismo sistema visual. No se permitirán componentes con estilos propios. Todo saldrá del Design System. |
| **Componentes** | Todos reutilizables. Nunca crear botones diferentes para la misma función. Nunca duplicar componentes. |
| **Configuración** | Centralizada. No habrá valores escritos directamente dentro del código. |
| **Traducciones** | Todo texto será internacionalizable. Nunca escribir textos directamente dentro de componentes. |
| **Notificaciones** | Un único servicio. Nunca programarlas desde diferentes módulos. |
| **Biometría** | Un único servicio: Face ID, Touch ID, huella, PIN. |
| **IA** | Toda comunicación con modelos de IA estará aislada. El proveedor podrá cambiarse sin modificar el resto de la aplicación. |
| **Seguridad** | Toda lógica de seguridad centralizada. Nunca duplicar validaciones. Nunca almacenar información sensible en memoria innecesariamente. |

## Navegación

Navegación inferior con cinco pestañas principales:

Inicio · Biblia · Oración · IA · Perfil

Las funciones secundarias se abrirán mediante navegación interna.

## Dependencias

Solo instalar librerías realmente necesarias. Antes de instalar una dependencia
evaluar: mantenimiento, popularidad, seguridad, compatibilidad, licencia.

## Escalabilidad

Toda arquitectura deberá soportar crecimiento sin reescribir el proyecto. Cada
módulo podrá ampliarse independientemente.

## Objetivo final

Construir una arquitectura preparada para evolucionar durante muchos años sin
perder calidad ni rendimiento.
