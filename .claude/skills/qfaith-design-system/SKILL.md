---
name: qfaith-design-system
description: >-
  Design System Liquid Glass de QFaith: filosofía visual, paleta (azul
  profundo, verde oliva, dorado tenue), tipografía Inter y Merriweather,
  efecto cristal, botones, campos, tarjetas, espaciado, animaciones,
  transiciones, modo oscuro diseñado aparte, iconografía, ilustraciones y
  accesibilidad. Úsala ANTES de escribir cualquier estilo, componente visual,
  pantalla, tema, color, animación o icono. Actívala si se menciona diseño,
  estilo, UI, tema, dark mode, colores, tipografía, tarjeta, botón, cristal,
  glass, blur, animación, espaciado o cualquier ajuste de apariencia en QFaith.
---

# Design System — Liquid Glass

Fuente:
[Documento 3](../../../docs/master-prompt/03-design-system-liquid-glass.md).

> Todo estilo sale del Design System. **Ningún componente lleva estilos
> propios.** Si necesitas algo que no existe, se añade al sistema, no al
> componente.

## Filosofía

La app debe sentirse **moderna, elegante, minimalista, premium, tranquila y
humana** — nunca religiosa de forma exagerada.

**Prohibido como decoración:** cruces gigantes, nubes, rayos de luz, palomas,
ángeles, fondos recargados, imágenes religiosas permanentes.

Referencias: Apple Human Interface · Liquid Glass · Notion · NordPass · Monarch
Money · Wallet de Apple. Material Design 3 solo como referencia de
accesibilidad.

## Color

| Rol | Color | Uso |
| --- | --- | --- |
| Principal | Azul profundo | Botones primarios, enlaces, estados activos |
| Secundario | Verde oliva suave | Hábitos, progreso, respuestas de oración |
| Espiritual | Dorado tenue, nunca brillante | Solo detalles pequeños |

**Fondos claro:** blanco cálido, gris muy claro, cristal translúcido.
**Fondos oscuro:** azul noche, negro grafito, cristal oscuro.

**Estados:** éxito verde · advertencia ámbar · error rojo suave · información
azul.

Nunca colores extremadamente saturados. Ningún estado depende solo del color:
siempre acompaña con icono o texto.

## Tipografía

- **Inter** — todo el producto.
- **Merriweather** — solo títulos espirituales.

Jerarquía: título principal · título secundario · subtítulo · texto · nota ·
pie de página.

**Nunca más de dos familias tipográficas.** El texto debe escalar con la
preferencia del sistema (`font_scale` en `user_settings`).

## Efecto Liquid Glass

Toda tarjeta: transparencia moderada + desenfoque + brillo suave + sombra
ligera + borde fino.

**Nunca tarjetas completamente opacas. Nunca exagerar el efecto.**

La barra de pestañas también usa cristal.

## Componentes

**Botones** — tres tipos: primario, secundario, texto. Comparten altura, radio,
tipografía y animación. Nunca crear un cuarto tipo ni dos estilos para la misma
función.

**Campos de texto** — borde suave, fondo translúcido, icono opcional. Estados:
normal, activo, error, deshabilitado.

**Tarjetas** — cristal, sombra ligera, borde fino, espaciado amplio.

**Bordes** — todo redondeado. Nunca esquinas completamente rectas.

**Iconos** — lineales, mismo estilo en todo el producto. Nunca caricaturescos
ni religiosos exagerados.

## Espaciado

Cuadrícula consistente en todo el sistema. La aplicación debe respirar: nunca
componentes demasiado juntos.

## Movimiento

Animaciones lentas, naturales, suaves, elegantes. Nunca llamativas.

Transiciones permitidas: fade, slide, scale. **Nunca rebotes exagerados.**

Microinteracciones: los botones responden con animación pequeña, las tarjetas
reaccionan suavemente al tocarse, las cargas muestran indicadores elegantes.

**Nunca bloquear completamente la interfaz.** Respetar «reducción de
movimiento» del sistema.

## Modo oscuro

**No inviertas colores.** El modo oscuro se diseña específicamente, con su
propia paleta de cristal oscuro.

## Ilustraciones e imágenes

Ilustraciones minimalistas, modernas, de colores suaves. Nunca infantiles.

Imágenes solo cuando aporten valor real. Evitar fotografías genéricas.

## Accesibilidad

Obligatorio: etiquetas para lectores de pantalla · orden lógico de navegación ·
tamaños táctiles suficientes · contraste adecuado · texto adaptable · alto
contraste · reducción de movimiento · mensajes de error comprensibles.

Probar con las herramientas reales de iOS y Android, no solo a ojo.

## Responsivo

Teléfonos pequeños y grandes, plegables cuando sea viable, tabletas, vertical
y horizontal en pantallas compatibles. No estirar interfaces móviles sin
adaptar.

## Notificaciones visuales

Discretas, elegantes, no invasivas. **Nunca interrumpir momentos de oración o
lectura.**

## Coherencia

Antes de crear un componente, busca si ya existe. Duplicar un botón o una
tarjeta para una función similar es un error, no una variante.
