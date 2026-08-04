// Las reglas del modelo de planes.
//
// Casi todas giran alrededor de una sola: **un plan avanza cuando alguien lee,
// nunca cuando pasa el tiempo.** Es lo que separa un acompañamiento de una
// deuda, y el invariante 12 no admite lo segundo.
import {
  diasLeidos,
  posicionEnPlan,
  siguienteDia,
  terminaElPlan,
  type DiaCompletado,
  type Inscripcion,
} from '../models/plan';

const inscripcion = (extra: Partial<Inscripcion> = {}): Inscripcion => ({
  id: 'inscripcion-1',
  planId: 'plan-1',
  diaActual: 1,
  estado: 'active',
  empezadoEn: '2026-08-01',
  completadoEn: null,
  ...extra,
});

const dia = (numero: number, completado: string | null): DiaCompletado => ({
  inscripcionId: 'inscripcion-1',
  numero,
  completadoEn: completado,
  reflexion: '',
});

describe('cómo avanza un plan', () => {
  it('completar el día en el que estás lo mueve uno adelante', () => {
    expect(siguienteDia({ diaActual: 3, diaCompletado: 3, totalDias: 30 })).toBe(4);
  });

  it('completar un día anterior no empuja el plan', () => {
    // Volver sobre el día 1 estando en el 5 —para releerlo o para rellenar un
    // hueco— no es avanzar. Si lo fuera, rellenar huecos saltaría contenido.
    expect(siguienteDia({ diaActual: 5, diaCompletado: 1, totalDias: 30 })).toBe(5);
  });

  it('completar un día posterior tampoco', () => {
    expect(siguienteDia({ diaActual: 2, diaCompletado: 9, totalDias: 30 })).toBe(2);
  });

  it('el último día no lleva a un día que no existe', () => {
    // Estar en el «día 31 de 30» sería una pantalla vacía y un plan que no
    // sabe que terminó.
    expect(siguienteDia({ diaActual: 30, diaCompletado: 30, totalDias: 30 })).toBe(30);
  });

  it('un plan de un solo día se resuelve en ese día', () => {
    expect(siguienteDia({ diaActual: 1, diaCompletado: 1, totalDias: 1 })).toBe(1);
    expect(terminaElPlan({ diaCompletado: 1, totalDias: 1 })).toBe(true);
  });

  it('el resultado solo depende de los tres números', () => {
    // Es la forma de decir que el calendario no interviene: la misma llamada
    // da lo mismo hoy, mañana y dentro de un año. Si algún día alguien metiera
    // aquí una resta de fechas, tendría que cambiar la firma para hacerlo, y
    // eso se ve.
    //
    // Que un plan abandonado meses atrás siga esperando en su día lo comprueba
    // la prueba del repositorio, con reloj controlado.
    const entradas = { diaActual: 3, diaCompletado: 3, totalDias: 30 };

    expect(siguienteDia(entradas)).toBe(siguienteDia({ ...entradas }));
    expect(siguienteDia(entradas)).toBe(4);
  });
});

describe('cuándo termina', () => {
  it('el último día lo termina', () => {
    expect(terminaElPlan({ diaCompletado: 30, totalDias: 30 })).toBe(true);
  });

  it('uno intermedio no', () => {
    expect(terminaElPlan({ diaCompletado: 29, totalDias: 30 })).toBe(false);
  });
});

describe('lo que se cuenta y lo que no', () => {
  it('cuenta los días leídos, no los que faltan', () => {
    const dias = [dia(1, '2026-08-01T09:00:00Z'), dia(2, null), dia(3, '2026-08-05T09:00:00Z')];

    // Dos leídos, no «uno perdido». La diferencia no es de redacción: un
    // recuento dice cuánto has recorrido, un porcentaje te compara con el
    // ideal (invariante 12).
    expect(diasLeidos(dias)).toBe(2);
  });

  it('sin ningún día leído devuelve cero sin ceremonia', () => {
    expect(diasLeidos([])).toBe(0);
  });
});

describe('cómo se dice dónde vas', () => {
  it('en curso enseña el día y el total', () => {
    const texto = posicionEnPlan(inscripcion({ diaActual: 4 }), 30);

    expect(texto).toEqual({ clave: 'planes.posicion.enCurso', valores: { dia: 4, total: 30 } });
  });

  it('completado no habla de días', () => {
    // Al terminar, «día 30 de 30» sobra: lo que importa es que lo terminó.
    const texto = posicionEnPlan(inscripcion({ estado: 'completed' }), 30);

    expect(texto.clave).toBe('planes.posicion.completado');
    expect(JSON.stringify(texto)).not.toContain('dia');
  });

  it('siempre devuelve claves de i18n, nunca texto', () => {
    // Invariante 8: ningún literal visible sale de aquí.
    const enCurso = posicionEnPlan(inscripcion(), 30);
    expect(enCurso.clave.startsWith('planes.')).toBe(true);
  });
});
