---
name: qfaith-textos
description: >-
  Redacción de todo el texto visible de QFaith: tono espiritual sin culpa ni
  manipulación, frases prohibidas, mensajes de error comprensibles, claves de
  i18n en español e inglés, textos de onboarding y estados vacíos, citas
  bíblicas y licencias, y datos ficticios para pruebas. Úsala SIEMPRE que
  escribas o traduzcas texto que verá el usuario, añadas una clave de i18n,
  redactes un mensaje de error, un estado vacío, un texto de notificación o
  crees datos de prueba. Actívala si se menciona texto, copy, redactar,
  traducir, i18n, localización, español, inglés, mensaje de error, estado
  vacío, placeholder, onboarding o datos de prueba en QFaith.
---

# Textos, traducciones y datos ficticios

Fuentes: documentos
[0](docs/master-prompt/00-constitucion.md),
[6](docs/master-prompt/06-sistema-de-ia.md) y
[13](docs/master-prompt/13-notificaciones-y-tareas-fondo.md).

## Quién decide qué

| | |
| --- | --- |
| **Haiku es el dueño** | Redacción, traducciones, ajustes de texto, datos ficticios, documentación. Es el modelo principal de esta área |
| **Sonnet** | Integra los textos en componentes y define las claves de i18n |
| **Opus aprueba** | Textos de Modo Crisis, avisos de seguridad, textos legales y cualquier copy con implicación doctrinal |

Los textos de crisis y los legales **no se redactan sin aprobación**. Todo lo
demás avanza sin preguntar.

## Lo que debe sentir el usuario

Paz · esperanza · seguridad · orden · sencillez.

**Nunca:** culpa · ansiedad · presión.

Este es el filtro de cada frase que escribas. Si un texto genera prisa,
vergüenza o miedo a perder algo, está mal aunque sea gramaticalmente
impecable.

## Prohibido en cualquier texto

- Hablar en nombre de Dios: «Dios me dijo…», «Esta es la voluntad de Dios»,
  «Dios quiere que hagas esto», «Dios está esperando».
- Lenguaje profético o revelaciones.
- Juicio doctrinal: «Este pastor está equivocado», «Esta denominación es
  falsa».
- Culpa o reproche: «Has fallado otra vez», «Llevas tres días sin leer».
- Urgencia falsa: «Perderás tu progreso», «Esta puede ser tu última
  oportunidad».
- Presión comercial espiritual: «Paga para crecer en tu fe», «Tu relación con
  Dios merece Premium».
- Comparaciones entre usuarios o calificaciones espirituales.

## Cómo suena bien

| ❌ | ✅ |
| --- | --- |
| «Has fallado otra vez.» | «Puedes continuar hoy donde quedaste.» |
| «Llevas tres días sin leer la Biblia.» | «Tu momento de lectura está disponible.» |
| «Dios está esperando y tú no has orado.» | «¿Deseas dedicar unos minutos a tu oración?» |
| «Perderás tu progreso si no entras ahora.» | «Tu plan sigue disponible cuando estés listo.» |

Breve, amable, en segunda persona, sin signos de exclamación acumulados y sin
emoji decorativo en texto de producto.

## Privacidad en el texto

Un texto puede filtrar datos aunque el sistema esté cifrado. **Nunca escribas
una plantilla que interpole contenido privado** en:

- Notificaciones (usa «Tienes un recordatorio en QFaith»).
- Widgets.
- Mensajes de error.
- Resúmenes diarios o semanales.

Si una plantilla necesita un nombre, un tema del diario o el estado espiritual
para tener sentido, esa plantilla no puede existir.

## Mensajes de error

Cada error necesita un texto **comprensible para una persona**, que diga qué
pasó y qué puede hacer.

**Nunca expongas** stack traces, SQL, tokens, rutas internas, nombres de tabla
ni respuestas del proveedor de IA.

| ❌ | ✅ |
| --- | --- |
| «Error 500: null constraint violation on prayers.user_id» | «No pudimos guardar tu petición. Inténtalo de nuevo.» |
| «Network request failed» | «Sin conexión. Guardamos tu cambio y lo sincronizaremos más tarde.» |

Cuando la app funciona sin conexión, dilo con calma: el usuario no debe sentir
que algo se rompió.

## Estados vacíos

Todo módulo necesita texto de estado vacío. Debe invitar, no reprochar:

- Diario sin entradas: «Aquí guardarás lo que Dios va haciendo en tu vida.»
- Sin oraciones: «Cuando escribas tu primera petición, aparecerá aquí.»

Nunca «Todavía no has hecho nada».

## Internacionalización

- **Ningún texto literal dentro de un componente.** Todo pasa por i18n.
- Idiomas del MVP: **español e inglés**. Ambos se entregan completos; una clave
  sin traducir es una tarea sin terminar.
- Claves descriptivas por módulo y función:
  `oracion.detalle.marcarRespondida`, no `boton1`.
- No concatenes frases a partir de fragmentos: rompe la traducción. Usa una
  clave por frase completa con interpolación de variables.
- Cuida plurales y género con las utilidades de la librería, no con `if`.
- El texto debe soportar escalado tipográfico: evita frases que solo caben en
  una línea a tamaño pequeño.

## Citas bíblicas

El texto bíblico depende de la licencia registrada en `bible_translations`.

- No incrustes versículos en el código ni en las traducciones de interfaz:
  vienen de la base de datos.
- Respeta los requisitos de atribución de cada traducción.
- No reproduzcas grandes fragmentos de traducciones protegidas.

## Datos ficticios

Para seeds, fixtures, capturas y demos:

- **Solo información inventada.** Nunca diarios, oraciones, conversaciones ni
  correos reales, ni siquiera propios.
- Nada de datos de producción en desarrollo, pruebas o staging.
- Los nombres y situaciones deben ser neutros y respetuosos: no uses temas
  sensibles reales (enfermedades concretas, crisis, conflictos familiares) como
  relleno.
- Marca claramente los datos de ejemplo para que nunca se confundan con datos
  reales.

## Documentación y comentarios

Español, directos, sin adornos. Documenta los módulos críticos (cifrado,
sincronización, IA, permisos) explicando **por qué**, no repitiendo lo que el
código ya dice.

**Skills relacionadas:** `qfaith-notificaciones` (dónde se muestra cada texto)
y `qfaith-ia` (los límites doctrinales completos).
