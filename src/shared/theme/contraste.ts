// Contraste de color según WCAG 2.1.
//
// Vive en el Design System y no en las pruebas porque también sirve en tiempo
// de ejecución: el día que haya modo de alto contraste, la decisión de qué par
// de colores usar se toma con esto.
//
// La fórmula es la del estándar y no una aproximación: el ojo no percibe el
// brillo de forma lineal, así que cada canal se linealiza antes de pesarlo.
// Una media simple de los tres canales daría números bonitos y falsos.

/** Convierte `#RRGGBB` en sus tres canales. Acepta también `rgba(...)`. */
export function canales(color: string): readonly [number, number, number] | null {
  const hex = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (hex?.[1] !== undefined) {
    const valor = Number.parseInt(hex[1], 16);
    return [(valor >> 16) & 255, (valor >> 8) & 255, valor & 255];
  }

  const rgba = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(color.trim());
  if (rgba?.[1] !== undefined && rgba[2] !== undefined && rgba[3] !== undefined) {
    return [Number(rgba[1]), Number(rgba[2]), Number(rgba[3])];
  }

  // `transparent` y cualquier otra cosa: no se puede medir sin saber qué hay
  // debajo, y devolver un número inventado sería peor que no devolver nada.
  return null;
}

/** Opacidad de un `rgba(...)`, o 1 si el color es opaco. */
export function opacidad(color: string): number {
  const rgba = /^rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([\d.]+)\s*\)$/i.exec(color.trim());
  return rgba?.[1] === undefined ? 1 : Number(rgba[1]);
}

/** Compone un color translúcido sobre un fondo opaco. */
export function componer(encima: string, debajo: string): string | null {
  const arriba = canales(encima);
  const abajo = canales(debajo);
  if (arriba === null || abajo === null) return null;

  const alfa = opacidad(encima);
  const mezcla = arriba.map((canal, i) => Math.round(canal * alfa + (abajo[i] ?? 0) * (1 - alfa)));
  return `#${mezcla.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

/** Luminancia relativa (WCAG 2.1, 1.4.3). */
export function luminancia(color: string): number | null {
  const rgb = canales(color);
  if (rgb === null) return null;

  const lineal = rgb.map((canal) => {
    const proporcion = canal / 255;
    // El umbral y el exponente son los del estándar; cambiarlos daría otra
    // cosa que ya no es WCAG.
    return proporcion <= 0.03928 ? proporcion / 12.92 : ((proporcion + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * (lineal[0] ?? 0) + 0.7152 * (lineal[1] ?? 0) + 0.0722 * (lineal[2] ?? 0);
}

/**
 * Razón de contraste entre dos colores. Va de 1 —idénticos— a 21.
 *
 * Devuelve `null` si alguno no se puede medir; quien llama decide qué hacer
 * con eso en lugar de recibir un número que no significa nada.
 */
export function razonDeContraste(primero: string, segundo: string): number | null {
  const uno = luminancia(primero);
  const otro = luminancia(segundo);
  if (uno === null || otro === null) return null;

  const claro = Math.max(uno, otro);
  const oscuro = Math.min(uno, otro);
  return (claro + 0.05) / (oscuro + 0.05);
}

/**
 * Mínimos de WCAG 2.1 nivel AA.
 *
 * `textoGrande` empieza en 18,66 pt en negrita o 24 pt normal. En la escala
 * del Documento 3 eso son solo los dos títulos, y aun así el proyecto no se
 * apoya en esa excepción: se comprueban todos contra 4,5 y se deja constancia
 * de cuáles la necesitarían.
 */
export const MINIMOS_AA = {
  texto: 4.5,
  textoGrande: 3,
  /** Bordes, iconos y cualquier cosa que haya que distinguir sin leerla. */
  elementoNoTextual: 3,
} as const;

export const cumpleAA = (razon: number | null, minimo: number = MINIMOS_AA.texto): boolean =>
  razon !== null && razon >= minimo;
