// La validación y las reglas de estado viven en el caso de uso, no en la
// pantalla: mañana una petición puede crearse desde un recordatorio o desde
// la IA y las reglas deben seguir aplicándose.
import { esErrorApp } from '@shared/errores/erroresApp';

import type { RepositorioOracion } from '../repositories/repositorioOracion';
import {
  anotarAvance,
  archivarPeticion,
  guardarPeticion,
  marcarRespondida,
  reactivarPeticion,
} from '../use-cases/gestionPeticiones';

function repositorioFalso() {
  const guardar = jest.fn(async (borrador: unknown) => borrador);
  const cambiarEstado = jest.fn(async (_id: string, _estado: string) => null);
  const anotar = jest.fn(async (peticionId: string, texto: string) => ({
    id: 'a',
    peticionId,
    texto,
    creadoEn: '2026-08-02T10:00:00.000Z',
  }));
  return {
    repositorio: {
      guardar,
      cambiarEstado,
      anotarAvance: anotar,
      listar: jest.fn(),
      obtener: jest.fn(),
      eliminar: jest.fn(),
      listarAvances: jest.fn(),
    } as unknown as RepositorioOracion,
    guardar,
    cambiarEstado,
    anotar,
  };
}

const VALIDO = {
  titulo: 'Por la salud de Marta',
  detalle: 'Mañana tiene consulta.',
  personas: ['Marta'],
  categoria: 'salud' as const,
};

describe('guardar', () => {
  it('exige decir por qué se ora', async () => {
    const { repositorio, guardar } = repositorioFalso();

    await guardarPeticion(repositorio, { ...VALIDO, titulo: '  ' }).catch((error: unknown) => {
      expect(esErrorApp(error)).toBe(true);
      if (!esErrorApp(error)) return;
      expect(error.claveMensaje).toBe('oracion.errores.tituloVacio');
    });
    expect.hasAssertions();
    expect(guardar).not.toHaveBeenCalled();
  });

  it('acepta una petición sin detalle: no todo se puede explicar', async () => {
    const { repositorio, guardar } = repositorioFalso();

    await guardarPeticion(repositorio, { ...VALIDO, detalle: '' });

    expect(guardar).toHaveBeenCalled();
  });

  it('normaliza los nombres: sin repetidos, sin espacios y sin vacíos', async () => {
    const { repositorio, guardar } = repositorioFalso();

    await guardarPeticion(repositorio, { ...VALIDO, personas: [' Ana ', 'Ana', '', 'Luis'] });

    expect(guardar).toHaveBeenCalledWith(expect.objectContaining({ personas: ['Ana', 'Luis'] }));
  });

  it('acepta una petición sin categoría', async () => {
    const { repositorio, guardar } = repositorioFalso();

    await guardarPeticion(repositorio, { ...VALIDO, categoria: null });

    expect(guardar).toHaveBeenCalledWith(expect.objectContaining({ categoria: null }));
  });
});

describe('cambios de estado', () => {
  it('responder, archivar y reactivar delegan con el estado correcto', async () => {
    const { repositorio, cambiarEstado } = repositorioFalso();

    await marcarRespondida(repositorio, 'p1');
    await archivarPeticion(repositorio, 'p1');
    await reactivarPeticion(repositorio, 'p1');

    expect(cambiarEstado.mock.calls.map((llamada) => llamada[1])).toEqual([
      'answered',
      'archived',
      'active',
    ]);
  });
});

describe('avances', () => {
  it('no acepta un avance vacío', async () => {
    const { repositorio, anotar } = repositorioFalso();

    await expect(
      anotarAvance(repositorio, { peticionId: 'p1', texto: '   ' }),
    ).rejects.toMatchObject({ claveMensaje: 'oracion.errores.avanceVacio' });
    expect(anotar).not.toHaveBeenCalled();
  });

  it('recorta el texto antes de guardarlo', async () => {
    const { repositorio, anotar } = repositorioFalso();

    await anotarAvance(repositorio, { peticionId: 'p1', texto: '  Buenas noticias  ' });

    expect(anotar).toHaveBeenCalledWith('p1', 'Buenas noticias');
  });
});
