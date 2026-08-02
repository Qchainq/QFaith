// La validación vive en el caso de uso, no en la pantalla: mañana una entrada
// puede crearse desde una notificación o desde la IA y la regla debe seguir
// aplicándose sin duplicarla.
import { esErrorApp } from '@shared/errores/erroresApp';

import type { RepositorioDiario } from '../repositories/repositorioDiario';
import { eliminarEntrada, guardarEntrada, listarEntradas } from '../use-cases/gestionEntradas';

function repositorioFalso() {
  const guardar = jest.fn(async (borrador: unknown) => borrador);
  return {
    repositorio: {
      guardar,
      listar: jest.fn(async () => ({ entradas: [], ilegibles: 0 })),
      obtener: jest.fn(async () => null),
      eliminar: jest.fn(async () => undefined),
    } as unknown as RepositorioDiario,
    guardar,
  };
}

const VALIDO = {
  titulo: 'Un título',
  cuerpo: 'Algo que quiero recordar.',
  etiquetas: ['fe'],
  tipo: 'reflection' as const,
  fecha: '2026-08-02',
};

describe('guardar una entrada', () => {
  it('rechaza una entrada sin cuerpo con un mensaje que se puede mostrar', async () => {
    const { repositorio, guardar } = repositorioFalso();

    await guardarEntrada(repositorio, { ...VALIDO, cuerpo: '   ' }).catch((error: unknown) => {
      expect(esErrorApp(error)).toBe(true);
      if (!esErrorApp(error)) return;
      expect(error.categoria).toBe('validacion');
      expect(error.claveMensaje).toBe('diario.errores.cuerpoVacio');
    });
    expect.hasAssertions();
    expect(guardar).not.toHaveBeenCalled();
  });

  it('rechaza una entrada sin título', async () => {
    const { repositorio } = repositorioFalso();

    await expect(guardarEntrada(repositorio, { ...VALIDO, titulo: '' })).rejects.toMatchObject({
      claveMensaje: 'diario.errores.tituloVacio',
    });
  });

  it('rechaza una fecha que la columna del esquema no aceptaría', async () => {
    const { repositorio } = repositorioFalso();

    await expect(
      guardarEntrada(repositorio, { ...VALIDO, fecha: '02/08/2026' }),
    ).rejects.toMatchObject({ claveMensaje: 'diario.errores.fechaInvalida' });
  });

  it('normaliza las etiquetas: sin repetidas, sin espacios y sin vacías', async () => {
    // Como viajan cifradas, el servidor no puede limpiarlas después. O se hace
    // aquí o el usuario acaba con grupos duplicados que no entiende.
    const { repositorio, guardar } = repositorioFalso();

    await guardarEntrada(repositorio, {
      ...VALIDO,
      etiquetas: ['  fe ', 'fe', '', '   ', 'duda'],
    });

    expect(guardar).toHaveBeenCalledWith(expect.objectContaining({ etiquetas: ['fe', 'duda'] }));
  });

  it('una entrada nueva va sin identificador, para que lo asigne el repositorio', async () => {
    const { repositorio, guardar } = repositorioFalso();

    await guardarEntrada(repositorio, VALIDO);

    expect(guardar.mock.calls[0]?.[0]).not.toHaveProperty('id');
  });

  it('al editar conserva el identificador', async () => {
    const { repositorio, guardar } = repositorioFalso();

    await guardarEntrada(repositorio, { ...VALIDO, id: 'entrada-1' });

    expect(guardar).toHaveBeenCalledWith(expect.objectContaining({ id: 'entrada-1' }));
  });
});

describe('lecturas y bajas', () => {
  it('listar delega en el repositorio', async () => {
    const { repositorio } = repositorioFalso();

    await expect(listarEntradas(repositorio)).resolves.toEqual({ entradas: [], ilegibles: 0 });
  });

  it('eliminar delega en el repositorio', async () => {
    const { repositorio } = repositorioFalso();

    await eliminarEntrada(repositorio, 'entrada-1');

    expect(repositorio.eliminar).toHaveBeenCalledWith('entrada-1');
  });
});
