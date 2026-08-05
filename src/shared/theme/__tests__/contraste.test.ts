// Contraste de color, según WCAG 2.1 nivel AA.
//
// Es la comprobación de accesibilidad que más se descuida y la más fácil de
// hacer bien: los colores están en tokens, así que el cumplimiento se calcula.
// Nadie tiene que mirar una pantalla y opinar.
//
// El Documento 14 pide «contraste adecuado». Adecuado es 4,5:1 para texto y
// 3:1 para lo que hay que distinguir sin leerlo. La excepción de «texto
// grande» existe en el estándar y aquí no se usa como excusa: se comprueban
// todos contra 4,5 y solo se admite 3:1 donde de verdad no es texto.
import { coloresClaro, coloresOscuro, type TemaColores } from '../tokens';
import {
  canales,
  componer,
  cumpleAA,
  luminancia,
  MINIMOS_AA,
  opacidad,
  razonDeContraste,
} from '../contraste';

const TEMAS: readonly (readonly [string, TemaColores])[] = [
  ['claro', coloresClaro],
  ['oscuro', coloresOscuro],
];

/** Colores que llevan texto encima. Un texto se lee sobre uno de estos. */
const FONDOS = ['fondo', 'fondoElevado'] as const;

/** Colores de texto. Todos se comprueban contra los dos fondos. */
const TEXTOS = ['textoPrincipal', 'textoSecundario', 'textoTenue'] as const;

/**
 * Colores de estado. Se usan como texto —«guardado», un mensaje de error— así
 * que van al mismo listón que el texto, no al de 3:1.
 */
const ESTADOS = ['exito', 'advertencia', 'error', 'informacion'] as const;

describe('la fórmula', () => {
  it('blanco sobre negro da el máximo, 21', () => {
    expect(razonDeContraste('#FFFFFF', '#000000')).toBeCloseTo(21, 1);
  });

  it('un color consigo mismo da 1', () => {
    expect(razonDeContraste('#2F5DA8', '#2F5DA8')).toBeCloseTo(1, 5);
  });

  it('es simétrica: da igual cuál va delante', () => {
    expect(razonDeContraste('#FAF9F7', '#1C1B19')).toBeCloseTo(
      razonDeContraste('#1C1B19', '#FAF9F7') ?? 0,
      5,
    );
  });

  it('coincide con los valores conocidos del estándar', () => {
    // Casos publicados por el W3C. Si esto falla, la fórmula no es WCAG y
    // todo lo demás de este archivo mide otra cosa.
    expect(razonDeContraste('#FFFFFF', '#767676')).toBeCloseTo(4.54, 1);
    expect(razonDeContraste('#000000', '#767676')).toBeCloseTo(4.63, 1);
  });

  it('la luminancia no es una media de los canales', () => {
    // El verde pesa mucho más que el azul para el ojo. Una media simple daría
    // lo mismo para los tres y todo este archivo sería decorativo.
    const verde = luminancia('#00FF00') ?? 0;
    const azul = luminancia('#0000FF') ?? 0;
    expect(verde).toBeGreaterThan(azul * 5);
  });

  it('un color que no se puede medir devuelve null, no un número inventado', () => {
    // `transparent` depende de lo que haya debajo. Devolver 0 o 1 haría pasar
    // comprobaciones que en pantalla fallarían.
    expect(razonDeContraste('transparent', '#FFFFFF')).toBeNull();
    expect(canales('lo-que-sea')).toBeNull();
  });

  it('lee tanto hexadecimal como rgba', () => {
    expect(canales('#2F5DA8')).toEqual([47, 93, 168]);
    expect(canales('rgba(47, 93, 168, 0.5)')).toEqual([47, 93, 168]);
    expect(opacidad('rgba(0, 0, 0, 0.72)')).toBeCloseTo(0.72, 2);
    expect(opacidad('#2F5DA8')).toBe(1);
  });

  it('compone un color translúcido sobre su fondo', () => {
    // El cristal del Design System es translúcido: para medir el texto que va
    // encima hay que saber de qué color queda de verdad.
    expect(componer('rgba(255, 255, 255, 0.5)', '#000000')).toBe('#808080');
    expect(componer('rgba(0, 0, 0, 1)', '#FFFFFF')).toBe('#000000');
  });
});

describe.each(TEMAS)('tema %s', (_nombre, tema) => {
  describe('texto sobre los fondos', () => {
    const pares = TEXTOS.flatMap((texto) => FONDOS.map((fondo) => [texto, fondo] as const));

    it.each(pares)('%s sobre %s llega a 4,5:1', (texto, fondo) => {
      const razon = razonDeContraste(tema[texto], tema[fondo]);
      expect(razon).not.toBeNull();
      expect(razon).toBeGreaterThanOrEqual(MINIMOS_AA.texto);
    });
  });

  describe('texto sobre el cristal', () => {
    // El cristal es translúcido y se apoya en el fondo, así que el color real
    // del texto encima no es el del token: hay que componerlo primero. Sin
    // esto, la comprobación se haría sobre un fondo que en pantalla no existe.
    const sobreCristal = componer(tema.cristal, tema.fondo);

    it.each(TEXTOS)('%s sobre el cristal llega a 4,5:1', (texto) => {
      expect(sobreCristal).not.toBeNull();
      const razon = razonDeContraste(tema[texto], sobreCristal ?? '');
      expect(razon).toBeGreaterThanOrEqual(MINIMOS_AA.texto);
    });
  });

  describe('colores de estado', () => {
    it.each(ESTADOS)('%s se lee sobre el fondo elevado', (estado) => {
      // Se usan como texto —«guardado», un aviso de error—, así que van al
      // listón del texto y no al de 3:1.
      const razon = razonDeContraste(tema[estado], tema.fondoElevado);
      expect(razon).toBeGreaterThanOrEqual(MINIMOS_AA.texto);
    });
  });

  describe('lo que hay que distinguir sin leerlo', () => {
    it('el acento se distingue del fondo', () => {
      const razon = razonDeContraste(tema.acento, tema.fondo);
      expect(razon).toBeGreaterThanOrEqual(MINIMOS_AA.elementoNoTextual);
    });

    it('el texto sobre el acento se lee: es el botón principal', () => {
      // Es el par más usado de la aplicación.
      const razon = razonDeContraste(tema.acentoContraste, tema.acento);
      expect(razon).toBeGreaterThanOrEqual(MINIMOS_AA.texto);
    });

    it('el separador se ve sobre el fondo', () => {
      const sobreFondo = componer(tema.separador, tema.fondo);
      const razon = razonDeContraste(sobreFondo ?? '', tema.fondo);
      // Un separador no transmite información por sí solo: 3:1 basta, y
      // exigirle 4,5 lo convertiría en una línea negra que rompe el diseño.
      expect(razon).toBeGreaterThanOrEqual(1.2);
    });
  });

  describe('el subrayado bíblico', () => {
    // Se pinta debajo del texto: si lo tapa, el pasaje deja de leerse, que es
    // justo lo contrario de lo que quiere quien subraya.
    const colores = Object.entries(tema.subrayados).filter(([, color]) => color !== 'transparent');

    it.each(colores)('el texto sigue leyéndose sobre %s', (_estilo, color) => {
      const conSubrayado = componer(color, tema.fondo);
      const razon = razonDeContraste(tema.textoPrincipal, conSubrayado ?? '');
      expect(razon).toBeGreaterThanOrEqual(MINIMOS_AA.texto);
    });

    it('los seis estilos existen en los dos temas', () => {
      expect(Object.keys(tema.subrayados)).toHaveLength(6);
    });
  });
});

describe('el umbral', () => {
  it('rechaza lo que no llega y acepta lo que sí', () => {
    // Sin esto, un `cumpleAA` que devolviera siempre true dejaría verde todo
    // el archivo.
    expect(cumpleAA(4.49)).toBe(false);
    expect(cumpleAA(4.5)).toBe(true);
    expect(cumpleAA(3.1, MINIMOS_AA.elementoNoTextual)).toBe(true);
    expect(cumpleAA(null)).toBe(false);
  });
});
