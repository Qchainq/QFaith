// La paginación no es un detalle de presentación: es lo que evita descifrar
// la vida entera de alguien para enseñarle doce líneas. Se prueba con
// registros de mentira porque lo que se comprueba —el corte, el orden y el
// recuento— no depende del cifrado.
import type { RegistroLocal } from '@shared/database/tipos';

import { paginarDescifrando, TAMANO_PAGINA } from '../paginacion';

const registro = (id: string, fecha: string): RegistroLocal => ({
  id,
  usuarioId: 'usuario-1',
  tipoEntidad: 'prueba',
  sobre: {
    encryptedPayload: id,
    encryptionVersion: 1,
    keyId: 'clave-1',
    nonce: 'nonce',
    contentHash: 'hash',
  },
  metadatos: { fecha },
  version: 1,
  revisionRemota: 1,
  estado: 'sincronizado',
  creadoEn: fecha,
  actualizadoEn: fecha,
  eliminadoEn: null,
  dispositivoId: 'dispositivo-1',
});

const porFecha = (a: RegistroLocal, b: RegistroLocal): number =>
  String(b.metadatos.fecha).localeCompare(String(a.metadatos.fecha));

/**
 * Cinco registros **en desorden**, y una lista nueva en cada llamada.
 *
 * Las dos cosas por el mismo motivo. Compartir una sola lista entre pruebas
 * dejaba pasar una versión que ordenaba en el sitio: la primera prueba la
 * dejaba ya ordenada y la que comprobaba «no altera la lista que recibe»
 * comparaba una lista ordenada consigo misma. Y en orden de entrada, ordenar
 * no cambiaría nada y tampoco se notaría.
 */
const desordenados = (): RegistroLocal[] => [
  registro('c', '2026-08-03'),
  registro('e', '2026-08-05'),
  registro('a', '2026-08-01'),
  registro('d', '2026-08-04'),
  registro('b', '2026-08-02'),
];

/**
 * Recorre todas las páginas, con freno.
 *
 * El freno no es paranoia: una versión en la que `siguiente` nunca llegue a
 * `null` convierte este bucle en infinito, y como cada vuelta espera una
 * promesa ya resuelta, el temporizador de Jest no llega a saltar nunca. La
 * prueba no falla: **se cuelga**, y con ella la integración continua. Un
 * bucle de paginación sin tope es una trampa, aquí y en la aplicación.
 */
function recorrerPaginas<T>(
  pedir: (desde: number) => { elementos: readonly T[]; siguiente: number | null },
): readonly T[] {
  const todos: T[] = [];
  let desde: number | null = 0;
  for (let vuelta = 0; vuelta < 100; vuelta += 1) {
    if (desde === null) return todos;
    const pagina = pedir(desde);
    todos.push(...pagina.elementos);
    desde = pagina.siguiente;
  }
  throw new Error('la paginación no termina: `siguiente` nunca llega a null');
}

/** Lee el registro y anota cuál se abrió, para poder contarlos. */
function lectorQueCuenta(abiertos: string[], ilegibles: readonly string[] = []) {
  return (reg: RegistroLocal): string | null => {
    abiertos.push(reg.id);
    return ilegibles.includes(reg.id) ? null : reg.id;
  };
}

describe('cortar antes de descifrar', () => {
  it('solo abre los registros de la página', () => {
    const abiertos: string[] = [];

    paginarDescifrando({
      registros: desordenados(),
      ordenar: porFecha,
      leer: lectorQueCuenta(abiertos),
      opciones: { limite: 2 },
    });

    // La razón de existir de este archivo. Si abriera los cinco, el resultado
    // sería idéntico y el ahorro no existiría.
    expect(abiertos).toEqual(['e', 'd']);
  });

  it('el total se sabe sin abrir ninguno de más', () => {
    const abiertos: string[] = [];

    const pagina = paginarDescifrando({
      registros: desordenados(),
      ordenar: porFecha,
      leer: lectorQueCuenta(abiertos),
      opciones: { limite: 2 },
    });

    expect(pagina.total).toBe(5);
    expect(abiertos).toHaveLength(2);
  });
});

describe('el orden se decide sobre el conjunto entero', () => {
  it('recorrer las páginas da el mismo orden que no paginar', () => {
    const registros = desordenados();

    const ids = recorrerPaginas((desde) =>
      paginarDescifrando({
        registros,
        ordenar: porFecha,
        leer: (reg) => reg.id,
        opciones: { limite: 2, desde },
      }),
    );

    expect(ids).toEqual(['e', 'd', 'c', 'b', 'a']);
  });

  it('no altera la lista que recibe', () => {
    // Ordenar en el sitio dejaría reordenada la lista de quien llama, que en
    // el almacén en memoria es **la de verdad**: paginar el Diario cambiaría
    // el orden guardado de las entradas de alguien.
    const registros = desordenados();
    const ordenDeEntrada = registros.map((reg) => reg.id);

    paginarDescifrando({ registros, ordenar: porFecha, leer: (reg) => reg.id });

    expect(registros.map((reg) => reg.id)).toEqual(ordenDeEntrada);
    // Y que el orden de entrada no sea ya el ordenado, o esto no comprobaría
    // nada: una lista ya ordenada pasa esta prueba aunque se ordene en el sitio.
    expect(ordenDeEntrada).not.toEqual(['e', 'd', 'c', 'b', 'a']);
  });
});

describe('final de la lista', () => {
  it('la última página no ofrece continuación', () => {
    const pagina = paginarDescifrando({
      registros: desordenados(),
      ordenar: porFecha,
      leer: (reg) => reg.id,
      opciones: { limite: 2, desde: 4 },
    });

    expect(pagina.elementos).toEqual(['a']);
    expect(pagina.siguiente).toBeNull();
  });

  it('pedir más allá del final devuelve una página vacía y cerrada', () => {
    const pagina = paginarDescifrando({
      registros: desordenados(),
      ordenar: porFecha,
      leer: (reg) => reg.id,
      opciones: { desde: 99 },
    });

    expect(pagina.elementos).toHaveLength(0);
    expect(pagina.siguiente).toBeNull();
    expect(pagina.total).toBe(5);
  });

  it('una lista vacía no ofrece continuación', () => {
    const pagina = paginarDescifrando({ registros: [], ordenar: porFecha, leer: (reg) => reg.id });

    expect(pagina.total).toBe(0);
    expect(pagina.siguiente).toBeNull();
  });
});

describe('registros que no abren', () => {
  it('se cuentan en lugar de esconderse', () => {
    const pagina = paginarDescifrando({
      registros: desordenados(),
      ordenar: porFecha,
      leer: lectorQueCuenta([], ['e']),
      opciones: { limite: 2 },
    });

    expect(pagina.elementos).toEqual(['d']);
    expect(pagina.ilegibles).toBe(1);
  });

  it('no descuadran dónde empieza la página siguiente', () => {
    // Con `siguiente` calculado sobre lo devuelto, esta página valdría 1 y la
    // siguiente empezaría en «d», que ya se ha visto, dejando fuera un
    // elemento del final sin que nadie lo notara.
    const pagina = paginarDescifrando({
      registros: desordenados(),
      ordenar: porFecha,
      leer: lectorQueCuenta([], ['e']),
      opciones: { limite: 2 },
    });

    expect(pagina.siguiente).toBe(2);
  });

  it('una página entera ilegible sigue avanzando', () => {
    // Si no avanzara, quien tuviera dos registros dañados seguidos se
    // quedaría atascado sin poder llegar a lo que hay detrás.
    const pagina = paginarDescifrando({
      registros: desordenados(),
      ordenar: porFecha,
      leer: lectorQueCuenta([], ['e', 'd']),
      opciones: { limite: 2 },
    });

    expect(pagina.elementos).toHaveLength(0);
    expect(pagina.ilegibles).toBe(2);
    expect(pagina.siguiente).toBe(2);
  });
});

describe('valores por defecto y límites', () => {
  it('sin opciones trae una página, no la lista entera', () => {
    const muchos = Array.from({ length: TAMANO_PAGINA + 10 }, (_, i) =>
      registro(`r${i}`, `2026-08-${String(i).padStart(2, '0')}`),
    );

    const pagina = paginarDescifrando({
      registros: muchos,
      ordenar: porFecha,
      leer: (reg) => reg.id,
    });

    expect(pagina.elementos).toHaveLength(TAMANO_PAGINA);
    expect(pagina.siguiente).toBe(TAMANO_PAGINA);
  });

  it('un límite de cero no deja la lista sin avanzar nunca', () => {
    // Un límite de cero devolvería páginas vacías eternamente y quien
    // recorriera la lista se quedaría girando en el sitio.
    const pagina = paginarDescifrando({
      registros: desordenados(),
      ordenar: porFecha,
      leer: (reg) => reg.id,
      opciones: { limite: 0 },
    });

    expect(pagina.elementos.length).toBeGreaterThan(0);
  });

  it('un índice negativo empieza por el principio', () => {
    // Con `-2` y límite 3, sin recortar a cero, `slice(-2, 1)` sale vacío: la
    // lista aparecería sin nada y con `siguiente` descuadrado. Un `-5` no
    // sirve para comprobarlo —`slice(-5, -4)` acierta el primero por
    // casualidad— y deja pasar la versión sin recorte.
    const pagina = paginarDescifrando({
      registros: desordenados(),
      ordenar: porFecha,
      leer: (reg) => reg.id,
      opciones: { limite: 3, desde: -2 },
    });

    expect(pagina.elementos).toEqual(['e', 'd', 'c']);
    expect(pagina.siguiente).toBe(3);
  });
});
