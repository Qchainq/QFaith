// Medir antes de modificar.
//
// El Documento 14 fija presupuestos de rendimiento y termina con una
// instrucción que este archivo existe para poder cumplir: «No optimizar
// prematuramente partes no críticas. **Medir antes de modificar.**» Sin una
// medida, optimizar es adivinar, y adivinar en rendimiento sale caro: se
// complica el código que ya iba bien y se deja intacto el que no.
//
// ── Por qué la mediana y no la media ──────────────────────────────────────
//
// Un contenedor de integración continua tiene vecinos ruidosos, y una sola
// muestra lenta arrastra la media lo bastante como para hacer fallar una
// comprobación que en realidad iba bien. La mediana ignora esos picos. El
// percentil 95 se conserva aparte porque es lo que de verdad nota una
// persona: lo malo no es que la aplicación sea rápida de media, es que se
// atasque una vez de cada veinte.
//
// ── Lo que estas medidas no son ───────────────────────────────────────────
//
// **No son el dispositivo.** Aquí se corre sobre Node, con el transpilador de
// pruebas por medio, y en un servidor. Un teléfono modesto es más lento y un
// portátil de desarrollo, más rápido. Sirven para dos cosas concretas:
//
//   1. Comparar entre sí operaciones del mismo tipo, que es lo que descubre
//      dónde está el coste.
//   2. Ver **cómo crece** el coste con el volumen. Que abrir un capítulo
//      cueste el doble con el doble de subrayados es un dato del algoritmo,
//      no de la máquina, y ese sí viaja al teléfono.
//
// Un número absoluto medido aquí no autoriza a decir que en un teléfono se
// cumple el presupuesto. Eso hay que medirlo en el teléfono.

/** Resultado de medir una operación repetida. */
export interface Medicion {
  readonly nombre: string;
  readonly repeticiones: number;
  /**
   * Vueltas agrupadas en cada muestra. Ver `MINIMO_POR_MUESTRA`.
   *
   * Se conserva porque cambia cómo hay que leer el resto: con un lote grande,
   * los tiempos son un promedio dentro del lote y los picos quedan
   * suavizados.
   */
  readonly lote: number;
  /** Milisegundos por vuelta. La medida de referencia. */
  readonly mediana: number;
  /** Milisegundos por vuelta. Lo que nota quien tiene mala suerte. */
  readonly p95: number;
  readonly minimo: number;
  readonly maximo: number;
}

/**
 * Milisegundos que debe durar una muestra como mínimo.
 *
 * El reloj de `performance.now()` bajo el transpilador de pruebas avanza de
 * milisegundo en milisegundo. Medir así una operación que tarda cuatro
 * microsegundos devuelve cero, y cero no es una medida: es no haber medido.
 * Peor todavía, un cero convierte cualquier comparación en un infinito y
 * hace fallar comprobaciones que en realidad estaban bien.
 *
 * La solución de siempre es agrupar: se ejecuta la operación tantas veces
 * como haga falta para que el lote entero se note en el reloj, y se divide.
 * Diez milisegundos dejan el error de redondeo por debajo del diez por
 * ciento, que para comparar operaciones entre sí sobra.
 */
const MINIMO_POR_MUESTRA = 10;

/** Tope de agrupación, para que una operación rapidísima no eternice la medida. */
const LOTE_MAXIMO = 100_000;

export interface OpcionesMedicion {
  /** Vueltas que se miden. */
  readonly repeticiones?: number;
  /**
   * Vueltas previas que se descartan.
   *
   * Las primeras ejecuciones de cualquier función en un motor de JavaScript
   * son mucho más lentas que las siguientes: todavía no está compilada ni
   * tiene las formas de los objetos aprendidas. Medirlas daría un número que
   * no se parece a lo que hace la aplicación, que ejecuta estas rutas
   * continuamente.
   */
  readonly calentamiento?: number;
  /**
   * Vueltas por muestra, si no se quiere calcular solo.
   *
   * Fijarlo a 1 tiene sentido cuando la operación **no puede repetirse**
   * —porque escribe algo, o porque calienta una caché que falsearía la
   * segunda vuelta— y se acepta perder resolución a cambio.
   */
  readonly lote?: number;
}

const percentil = (ordenadas: readonly number[], fraccion: number): number => {
  // Con una sola muestra el índice es 0 y devuelve esa; el `max` evita que
  // una fracción baja produzca -1.
  const indice = Math.max(0, Math.ceil(fraccion * ordenadas.length) - 1);
  return ordenadas[indice] ?? 0;
};

/**
 * Cuántas vueltas hay que agrupar para que el reloj las note.
 *
 * Se duplica hasta llegar al mínimo en lugar de estimar a partir de una sola
 * ejecución: esa primera ejecución puede caer justo en el redondeo a cero, y
 * dividir por ella daría un lote absurdo.
 */
async function calibrarLote(
  ejecutar: (vuelta: number) => unknown | Promise<unknown>,
): Promise<number> {
  let lote = 1;
  while (lote < LOTE_MAXIMO) {
    const inicio = performance.now();
    for (let vuelta = 0; vuelta < lote; vuelta += 1) {
      await ejecutar(vuelta);
    }
    if (performance.now() - inicio >= MINIMO_POR_MUESTRA) return lote;
    lote *= 2;
  }
  return LOTE_MAXIMO;
}

/**
 * Ejecuta la operación varias veces y resume cuánto tarda **cada vuelta**.
 *
 * `ejecutar` recibe el número de vuelta, para que quien mide pueda variar el
 * dato en cada una. Repetir con el mismo dato mediría también la caché, y una
 * persona no abre veinte veces el mismo registro seguido.
 */
export async function medir(
  nombre: string,
  ejecutar: (vuelta: number) => unknown | Promise<unknown>,
  opciones?: OpcionesMedicion,
): Promise<Medicion> {
  const repeticiones = opciones?.repeticiones ?? 20;
  const calentamiento = opciones?.calentamiento ?? Math.min(3, repeticiones);

  for (let vuelta = 0; vuelta < calentamiento; vuelta += 1) {
    await ejecutar(vuelta);
  }

  // La calibración también calienta, así que va después del calentamiento
  // explícito y antes de tomar la primera muestra.
  const lote = opciones?.lote ?? (await calibrarLote(ejecutar));

  const muestras: number[] = [];
  let vuelta = 0;
  for (let muestra = 0; muestra < repeticiones; muestra += 1) {
    const inicio = performance.now();
    for (let dentro = 0; dentro < lote; dentro += 1) {
      await ejecutar(vuelta);
      vuelta += 1;
    }
    muestras.push((performance.now() - inicio) / lote);
  }

  const ordenadas = [...muestras].sort((a, b) => a - b);
  return {
    nombre,
    repeticiones,
    lote,
    mediana: percentil(ordenadas, 0.5),
    p95: percentil(ordenadas, 0.95),
    minimo: ordenadas[0] ?? 0,
    maximo: ordenadas[ordenadas.length - 1] ?? 0,
  };
}

const conDecimales = (milisegundos: number): string => {
  if (milisegundos >= 100) return milisegundos.toFixed(0);
  if (milisegundos >= 1) return milisegundos.toFixed(1);
  // Con lotes, aquí caben microsegundos: cuatro decimales o se leería 0,000
  // justo en las operaciones que más se repiten.
  return milisegundos.toFixed(4);
};

/** Tabla de texto para leer las medidas de un vistazo. */
export function tabla(mediciones: readonly Medicion[]): string {
  const filas = mediciones.map((m) => [
    m.nombre,
    conDecimales(m.mediana),
    conDecimales(m.p95),
    conDecimales(m.maximo),
    String(m.repeticiones),
    String(m.lote),
  ]);
  const cabecera = ['Operación', 'mediana', 'p95', 'máx', 'n', 'lote'];
  const todas = [cabecera, ...filas];
  const anchos = cabecera.map((_, columna) =>
    Math.max(...todas.map((fila) => (fila[columna] ?? '').length)),
  );

  const linea = (fila: readonly string[]): string =>
    fila
      .map((celda, columna) =>
        columna === 0
          ? celda.padEnd(anchos[columna] ?? 0)
          : celda.padStart(anchos[columna] ?? 0),
      )
      .join('  ');

  return [
    linea(cabecera),
    anchos.map((ancho) => '─'.repeat(ancho)).join('  '),
    ...filas.map(linea),
  ].join('\n');
}

/**
 * Cuánto se multiplica el coste al multiplicar el volumen.
 *
 * Es la medida que de verdad viaja al dispositivo. Si al pasar de 500 a 5000
 * registros el coste se multiplica por diez, la operación es lineal y el
 * teléfono la sufrirá igual de proporcionada. Si se multiplica por cien, hay
 * un problema de algoritmo que ninguna máquina rápida arregla.
 */
export const factorDeCrecimiento = (pequena: Medicion, grande: Medicion): number =>
  pequena.mediana === 0 ? Infinity : grande.mediana / pequena.mediana;
