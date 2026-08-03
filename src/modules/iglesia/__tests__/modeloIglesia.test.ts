// Modelo de Iglesia.
//
// `estaVigente` decide si la pantalla ofrece revocar una compartición, y
// estaba sin probar. La verdad la tiene la política de la base de datos, pero
// una función de seguridad que nadie ejercita es una función que nadie sabe
// si funciona: si dijera que sigue vigente lo que ya caducó, la interfaz
// mentiría sobre quién puede leer una oración.
import { ROLES_IGLESIA, esLiderazgo, estaVigente, type Comparticion } from '../models/iglesia';

const AHORA = new Date('2026-08-03T12:00:00.000Z');

const comparticion = (cambios: Partial<Comparticion> = {}): Comparticion => ({
  id: 'share-1',
  peticionId: 'peticion-1',
  destino: { tipo: 'persona', id: 'elisa' },
  caducaEn: null,
  revocadaEn: null,
  ...cambios,
});

describe('vigencia de una compartición', () => {
  it('sin caducidad ni revocación sigue vigente', () => {
    expect(estaVigente(comparticion(), AHORA)).toBe(true);
  });

  it('revocada no está vigente, aunque no haya caducado', () => {
    expect(estaVigente(comparticion({ revocadaEn: '2026-08-01T00:00:00.000Z' }), AHORA)).toBe(
      false,
    );
  });

  it('caducada no está vigente, aunque no se haya revocado', () => {
    expect(estaVigente(comparticion({ caducaEn: '2026-08-02T00:00:00.000Z' }), AHORA)).toBe(false);
  });

  it('con caducidad futura sigue vigente', () => {
    expect(estaVigente(comparticion({ caducaEn: '2026-09-01T00:00:00.000Z' }), AHORA)).toBe(true);
  });

  it('la revocación manda sobre una caducidad futura', () => {
    // Revocar corta el acceso ya, sin esperar a ninguna caducidad.
    expect(
      estaVigente(
        comparticion({
          caducaEn: '2026-09-01T00:00:00.000Z',
          revocadaEn: '2026-08-02T00:00:00.000Z',
        }),
        AHORA,
      ),
    ).toBe(false);
  });

  it('en el instante exacto de caducar ya no está vigente', () => {
    // Se compara con `>` a propósito: dar el minuto de gracia sería regalar
    // un acceso que la persona ya había puesto fecha de fin.
    expect(estaVigente(comparticion({ caducaEn: AHORA.toISOString() }), AHORA)).toBe(false);
  });
});

describe('roles de liderazgo', () => {
  it.each(['leader', 'pastor', 'administrator'] as const)('%s administra la iglesia', (rol) => {
    expect(esLiderazgo(rol)).toBe(true);
  });

  it.each(['visitor', 'member', 'mentor'] as const)('%s no administra nada', (rol) => {
    expect(esLiderazgo(rol)).toBe(false);
  });

  it('ningún rol nuevo se cuela como liderazgo sin decidirlo', () => {
    // Si alguien añade un rol al enum y olvida clasificarlo, cae del lado
    // seguro: no administra.
    const liderazgo = ROLES_IGLESIA.filter(esLiderazgo);
    expect(liderazgo).toEqual(['leader', 'pastor', 'administrator']);
  });
});
