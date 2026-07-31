# Documento 10 — Mapa de Pantallas y Flujo de Navegación

> Versión 1.0

## Objetivo

Definir toda la navegación de la aplicación.

**Ninguna pantalla podrá desarrollarse sin estar incluida en este documento.**
Toda nueva pantalla deberá respetar la estructura aquí definida.

## Filosofía

La navegación deberá ser simple, intuitiva, consistente, elegante y rápida.

Nunca esconder funciones importantes. Nunca obligar al usuario a navegar más de
tres niveles para encontrar una función.

## Flujo general

```
Splash → Onboarding → Registro / Inicio de sesión → Configuración inicial → Inicio
```

## Navegación principal

Cinco pestañas: **Inicio · Biblia · Oración · IA · Perfil**

### 1. Inicio

Contendrá: saludo, versículo diario, pulso espiritual, hábitos del día,
devocional, accesos rápidos, resumen semanal, Biblioteca de Vida,
recordatorios.

Desde Inicio se podrá acceder a: hábitos, oraciones, devocional, Biblia,
diario, IA, biblioteca, memorial, perfil.

### 2. Biblia

Lista de Biblias · Lector · Capítulos · Marcadores · Notas · Favoritos ·
Planes · Búsqueda · Audio · Historial

### 3. Oración

Lista de peticiones · Nueva oración · Detalle · Editar · Respuestas · Memorial
· Compartir

### 4. IA

Chat · Nueva conversación · Historial · Planes personalizados · Explicación
bíblica · Devocionales · Biblioteca

### 5. Perfil

Perfil · Objetivos · Progreso · Configuración · Privacidad · Seguridad ·
Dispositivos · Suscripción · Ayuda

## Módulos secundarios

| Módulo | Pantallas |
| --- | --- |
| **Diario Espiritual** | Nueva entrada · Editar · Calendario · Buscar · Archivos · Etiquetas |
| **Hábitos** | Lista · Nuevo · Editar · Calendario · Estadísticas · Historial |
| **Memorial** | Listado · Detalle · Filtros · Cronología |
| **Biblioteca de Vida** | Temas · Versículos · Reflexiones · Testimonios · Respuestas · Búsqueda |
| **Sermones** | Lista · Detalle · Notas · Audio · Video · Archivos |
| **Iglesia** | Inicio · Eventos · Grupos · Cursos · Noticias · Calendario · Ministerios |
| **Configuración** | Cuenta · Idioma · Tema · Seguridad · Notificaciones · Sincronización · Respaldo · Biometría · Eliminar cuenta |
| **Seguridad** | PIN · Face ID · Touch ID · Huella · Clave recuperación · Dispositivos |
| **Notificaciones** | Listado · Detalle · Configuración |
| **Ayuda** | Centro de ayuda · Preguntas frecuentes · Contacto · Reportar error · Sugerencias |

## Onboarding

| Pantalla | Contenido |
| --- | --- |
| 1 | Bienvenida |
| 2 | Privacidad |
| 3 | Hábitos |
| 4 | IA |
| 5 | Iglesia |
| 6 | Crear cuenta |

## Autenticación

Registro · Inicio · Olvidé contraseña · Verificación · Cerrar sesión

## Modales

Agregar oración · Agregar hábito · Nueva nota · Nuevo objetivo · Confirmaciones

## Búsqueda global

Permitirá buscar: versículos, notas, diario, oraciones, memorial, biblioteca,
sermones, planes.

## Flujo de navegación

Toda pantalla deberá tener: botón volver, título, acción principal, acción
secundaria.

**Nunca dejar al usuario sin una forma clara de regresar.**

## Accesibilidad

Toda navegación deberá funcionar mediante toques, lectores de pantalla, texto
grande y modo oscuro.

## Objetivo final

El usuario deberá poder acceder a cualquier función importante de QFaith en
pocos pasos, sin sentirse perdido y manteniendo una experiencia fluida,
consistente y elegante.
