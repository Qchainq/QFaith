// Bloqueo por inactividad.
//
// El reloj entra como dato, así que todos los casos raros —el plazo justo, el
// reloj que va hacia atrás, el plazo apagado— se pueden probar sin simular el
// sistema operativo.
import {
  debeBloquear,
  debeBloquearAlVolver,
  MAXIMO_SEGUNDOS,
  segundosValidos,
  tiempoRestanteMs,
} from '../bloqueoAutomatico';

const T0 = 1_000_000;

describe('bloquear por inactividad', () => {
  it('no bloquea antes de que pase el plazo', () => {
    const estado = { ultimaActividadMs: T0, segundosDeEspera: 60 };
    expect(debeBloquear(estado, T0 + 59_999)).toBe(false);
  });

  it('bloquea justo al cumplirse el plazo, no un milisegundo después', () => {
    // Redondear a favor de dejar abierto sería regalar un margen que nadie
    // pidió.
    const estado = { ultimaActividadMs: T0, segundosDeEspera: 60 };
    expect(debeBloquear(estado, T0 + 60_000)).toBe(true);
  });

  it('con el plazo a cero no bloquea nunca por inactividad', () => {
    const estado = { ultimaActividadMs: T0, segundosDeEspera: 0 };
    expect(debeBloquear(estado, T0 + 86_400_000)).toBe(false);
    expect(tiempoRestanteMs(estado, T0)).toBeNull();
  });

  it('un reloj que va hacia atrás bloquea en vez de mantener la sesión abierta', () => {
    // Cambiar la hora del teléfono no puede ser una forma de que el contenido
    // privado siga descifrado indefinidamente.
    const estado = { ultimaActividadMs: T0, segundosDeEspera: 60 };
    expect(debeBloquear(estado, T0 - 1)).toBe(true);
  });

  it('la cuenta corre desde la última actividad, no desde que se abrió', () => {
    const estado = { ultimaActividadMs: T0 + 300_000, segundosDeEspera: 60 };
    // Han pasado seis minutos desde que se abrió, pero solo diez segundos
    // desde que la persona tocó algo.
    expect(debeBloquear(estado, T0 + 310_000)).toBe(false);
  });
});

describe('tiempo restante', () => {
  it('cuenta atrás hasta cero y no baja de ahí', () => {
    const estado = { ultimaActividadMs: T0, segundosDeEspera: 60 };
    expect(tiempoRestanteMs(estado, T0 + 20_000)).toBe(40_000);
    expect(tiempoRestanteMs(estado, T0 + 120_000)).toBe(0);
  });
});

describe('volver de segundo plano', () => {
  it('sin gracia configurada, bloquea al volver', () => {
    // Es el caso que de verdad importa: el móvil encima de la mesa.
    const estado = { ultimaActividadMs: T0, segundosDeEspera: 60 };
    expect(debeBloquearAlVolver(estado, T0 + 1)).toBe(true);
  });

  it('con unos segundos de gracia, salir un momento no bloquea', () => {
    const estado = { ultimaActividadMs: T0, segundosDeEspera: 60 };
    expect(debeBloquearAlVolver(estado, T0 + 4_000, 10)).toBe(false);
    expect(debeBloquearAlVolver(estado, T0 + 10_000, 10)).toBe(true);
  });

  it('la gracia nunca supera al plazo configurado', () => {
    // Con un plazo de 5 segundos, pedir 60 de gracia no puede alargarlo.
    const estado = { ultimaActividadMs: T0, segundosDeEspera: 5 };
    expect(debeBloquearAlVolver(estado, T0 + 5_000, 60)).toBe(true);
  });

  it('con el bloqueo apagado, volver no bloquea', () => {
    const estado = { ultimaActividadMs: T0, segundosDeEspera: 0 };
    expect(debeBloquearAlVolver(estado, T0 + 86_400_000)).toBe(false);
  });
});

describe('plazos válidos', () => {
  it('recorta al rango que acepta el esquema', () => {
    expect(segundosValidos(-5)).toBe(0);
    expect(segundosValidos(99_999)).toBe(MAXIMO_SEGUNDOS);
    expect(segundosValidos(60.7)).toBe(60);
  });

  it('un valor absurdo se trata como «no bloquear», no como infinito', () => {
    expect(segundosValidos(Number.NaN)).toBe(0);
    expect(segundosValidos(Number.POSITIVE_INFINITY)).toBe(0);
  });
});
