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

const cinco = [
  registro('a', '2026-08-01'),
  registro('b', '2026-08-02'),
  registro('c', '2026-08-03'),
  registro('d', '2026-08-04'),
  registro('e', '2026-08-05'),
];

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
      registros: cinco,
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
      registros: cinco,
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
    const ids: string[] = [];
    let desde: number | null = 0;

    while (desde !== null) {
      const pagina: ReturnType<typeof paginarDescifrando<string>> = paginarDescifrando({
        registros: cinco,
        ordenar: porFecha,
        leer: (reg) => reg.id,
        opciones: { limite: 2, desde },
      });
      ids.push(...pagina.elementos);
      desde = pagina.siguiente;
    }

    expect(ids).toEqual(['e', 'd', 'c', 'b', 'a']);
  });

  it('no altera la lista que recibe', () => {
    // Ordenar en el sitio dejaría reordenada la lista de quien llama, que en
    // el almacén en memoria es la de verdad.
    const originales = [...cinco];

    paginarDescifrando({ registros: cinco, ordenar: porFecha, leer: (reg) => reg.id });

    expect(cinco).toEqual(originales);
  });
});

describe('final de la lista', () => {
  it('la última página no ofrece continuación', () => {
    const pagina = paginarDescifrando({
      registros: cinco,
      ordenar: porFecha,
      leer: (reg) => reg.id,
      opciones: { limite: 2, desde: 4 },
    });

    expect(pagina.elementos).toEqual(['a']);
    expect(pagina.siguiente).toBeNull();
  });

  it('pedir más allá del final devuelve una página vacía y cerrada', () => {
    const pagina = paginarDescifrando({
      registros: cinco,
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
      registros: cinco,
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
      registros: cinco,
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
      registros: cinco,
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
      registros: cinco,
      ordenar: porFecha,
      leer: (reg) => reg.id,
      opciones: { limite: 0 },
    });

    expect(pagina.elementos.length).toBeGreaterThan(0);
  });

  it('un índice negativo empieza por el principio', () => {
    const pagina = paginarDescifrando({
      registros: cinco,
      ordenar: porFecha,
      leer: (reg) => reg.id,
      opciones: { limite: 1, desde: -5 },
    });

    expect(pagina.elementos).toEqual(['e']);
  });
});
