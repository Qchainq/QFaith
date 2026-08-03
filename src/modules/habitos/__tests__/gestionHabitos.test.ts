// La regla que define este módulo: se cuenta lo cumplido, nunca lo fallado
// (invariante 12). Estas pruebas la fijan para que no se erosione.
import { esErrorApp } from '@shared/errores/erroresApp';

import { cumplidosRecientes } from '../models/habito';
import type { RepositorioHabitos } from '../repositories/repositorioHabitos';
import { alternarHoy, guardarHabito, resumirHabito } from '../use-cases/gestionHabitos';

function repositorioFalso(dias: string[] = []) {
  const marcados = new Set(dias);
  const guardar = jest.fn(async (borrador: unknown) => borrador);
  const repositorio = {
    guardar,
    diasCumplidos: jest.fn(async () => [...marcados].sort((a, b) => b.localeCompare(a))),
    marcarCumplido: jest.fn(async ({ fecha }: { fecha: string }) => {
      marcados.add(fecha);
      return { id: 'r', habitoId: 'h', fecha, nota: '' };
    }),
    deshacerCumplido: jest.fn(async (_id: string, fecha: string) => {
      marcados.delete(fecha);
    }),
    listar: jest.fn(),
    obtener: jest.fn(),
    eliminar: jest.fn(),
  } as unknown as RepositorioHabitos;
  return { repositorio, guardar, marcados };
}

const VALIDO = {
  titulo: 'Leer diez minutos',
  descripcion: '',
  categoria: 'lectura' as const,
  frecuencia: 'daily' as const,
  configuracion: { dias: [1, 2, 3, 4, 5] },
  fechaInicio: '2026-08-01',
};

describe('guardar', () => {
  it('exige un título', async () => {
    const { repositorio, guardar } = repositorioFalso();

    await guardarHabito(repositorio, { ...VALIDO, titulo: '   ' }).catch((error: unknown) => {
      expect(esErrorApp(error)).toBe(true);
      if (!esErrorApp(error)) return;
      expect(error.claveMensaje).toBe('habitos.errores.tituloVacio');
    });
    expect.hasAssertions();
    expect(guardar).not.toHaveBeenCalled();
  });

  it('acepta un hábito sin descripción ni categoría', async () => {
    const { repositorio, guardar } = repositorioFalso();

    await guardarHabito(repositorio, { ...VALIDO, descripcion: '', categoria: null });

    expect(guardar).toHaveBeenCalled();
  });
});

describe('alternar el día de hoy', () => {
  it('marca si no estaba y devuelve true', async () => {
    const { repositorio, marcados } = repositorioFalso();

    await expect(alternarHoy(repositorio, { habitoId: 'h', hoy: '2026-08-02' })).resolves.toBe(
      true,
    );
    expect(marcados.has('2026-08-02')).toBe(true);
  });

  it('desmarca si ya estaba y devuelve false', async () => {
    const { repositorio, marcados } = repositorioFalso(['2026-08-02']);

    await expect(alternarHoy(repositorio, { habitoId: 'h', hoy: '2026-08-02' })).resolves.toBe(
      false,
    );
    expect(marcados.has('2026-08-02')).toBe(false);
  });
});

describe('resumen', () => {
  it('cuenta los días cumplidos de la ventana', async () => {
    const { repositorio } = repositorioFalso(['2026-08-02', '2026-08-01', '2026-07-30']);

    const resumen = await resumirHabito(repositorio, { habitoId: 'h', hoy: '2026-08-02' });

    expect(resumen.cumplidos).toBe(3);
    expect(resumen.cumplidoHoy).toBe(true);
    expect(resumen.ventana).toBe(30);
  });

  it('no expone en ningún campo los días no cumplidos', async () => {
    // No es una cuestión de redacción: el dato no se calcula. Una racha
    // punitiva no se puede construir a partir de este resumen.
    const { repositorio } = repositorioFalso(['2026-08-02']);

    const resumen = await resumirHabito(repositorio, { habitoId: 'h', hoy: '2026-08-02' });

    expect(Object.keys(resumen).sort()).toEqual(['cumplidoHoy', 'cumplidos', 'ventana']);
    expect(JSON.stringify(resumen)).not.toMatch(/fallad|perdid|racha|streak/i);
  });

  it('un hábito recién creado no arrastra ninguna deuda', async () => {
    const { repositorio } = repositorioFalso();

    const resumen = await resumirHabito(repositorio, { habitoId: 'h', hoy: '2026-08-02' });

    expect(resumen.cumplidos).toBe(0);
    expect(resumen.cumplidoHoy).toBe(false);
  });
});

describe('recuento de la ventana', () => {
  it('deja fuera lo anterior a la ventana', () => {
    const dias = ['2026-08-02', '2026-07-04', '2026-06-01'];

    expect(cumplidosRecientes(dias, '2026-08-02', 30)).toBe(2);
  });

  it('no cuenta días futuros', () => {
    expect(cumplidosRecientes(['2026-09-01'], '2026-08-02', 30)).toBe(0);
  });

  it('incluye el propio día de hoy', () => {
    expect(cumplidosRecientes(['2026-08-02'], '2026-08-02', 1)).toBe(1);
  });
});
