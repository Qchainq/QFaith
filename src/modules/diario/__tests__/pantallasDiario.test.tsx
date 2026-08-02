// Las pantallas son puras: reciben datos y devuelven acciones. Se prueban sin
// base de datos ni red, que es justo lo que permite esa separación.
import { fireEvent, screen } from '@testing-library/react-native';

import { ErrorApp } from '@shared/errores/erroresApp';
import { renderizar } from '@shared/testing/renderizar';

import type { EntradaDiario } from '../models/entradaDiario';
import { PantallaDiario } from '../screens/PantallaDiario';
import { PantallaEntradaDiario } from '../screens/PantallaEntradaDiario';

const mockConsulta = jest.fn();
jest.mock('../hooks/useDiario', () => ({
  useEntradasDiario: () => mockConsulta(),
}));

const ENTRADA: EntradaDiario = {
  id: 'entrada-1',
  titulo: 'Gratitud de hoy',
  cuerpo: 'Algo que quiero recordar.',
  etiquetas: ['fe'],
  tipo: 'gratitude',
  fecha: '2026-08-02',
  esFavorita: false,
  protegidaConArca: false,
  creadaEn: '2026-08-02T10:00:00.000Z',
  actualizadaEn: '2026-08-02T10:00:00.000Z',
};

describe('lista del diario', () => {
  it('avisa mientras abre el diario', () => {
    mockConsulta.mockReturnValue({ isPending: true, isError: false });
    renderizar(<PantallaDiario alCrear={jest.fn()} alAbrir={jest.fn()} />);

    expect(screen.getByText('Abriendo tu diario…')).toBeTruthy();
  });

  it('el estado vacío invita sin culpabilizar', () => {
    mockConsulta.mockReturnValue({
      isPending: false,
      isError: false,
      data: { entradas: [], ilegibles: 0 },
    });
    renderizar(<PantallaDiario alCrear={jest.fn()} alAbrir={jest.fn()} />);

    expect(screen.getByText(/Todavía no has escrito nada/)).toBeTruthy();
  });

  it('permite reintentar cuando la lectura falla', () => {
    const refetch = jest.fn();
    mockConsulta.mockReturnValue({ isPending: false, isError: true, refetch });
    renderizar(<PantallaDiario alCrear={jest.fn()} alAbrir={jest.fn()} />);

    fireEvent.press(screen.getByRole('button', { name: 'Reintentar' }));

    expect(refetch).toHaveBeenCalled();
  });

  it('muestra las entradas y abre la que se pulsa', () => {
    const alAbrir = jest.fn();
    mockConsulta.mockReturnValue({
      isPending: false,
      isError: false,
      data: { entradas: [ENTRADA], ilegibles: 0 },
    });
    renderizar(<PantallaDiario alCrear={jest.fn()} alAbrir={alAbrir} />);

    fireEvent.press(screen.getByRole('button', { name: 'Gratitud de hoy' }));

    expect(alAbrir).toHaveBeenCalledWith(ENTRADA);
  });

  it('avisa de las entradas que este dispositivo no puede abrir', () => {
    mockConsulta.mockReturnValue({
      isPending: false,
      isError: false,
      data: { entradas: [ENTRADA], ilegibles: 2 },
    });
    renderizar(<PantallaDiario alCrear={jest.fn()} alAbrir={jest.fn()} />);

    expect(screen.getByText(/2 entradas que este dispositivo no puede abrir/)).toBeTruthy();
  });
});

describe('escribir una entrada', () => {
  it('entrega el borrador con lo escrito', async () => {
    const alGuardar = jest.fn(async () => undefined);
    renderizar(<PantallaEntradaDiario alGuardar={alGuardar} alCancelar={jest.fn()} />);

    fireEvent.changeText(screen.getByLabelText('Título'), 'Mi título');
    fireEvent.changeText(screen.getByLabelText(/Qué quieres recordar/), 'Mi texto');
    fireEvent.changeText(screen.getByLabelText('Etiquetas'), ' fe , duda ');
    fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));

    expect(alGuardar).toHaveBeenCalledWith(
      expect.objectContaining({
        titulo: 'Mi título',
        cuerpo: 'Mi texto',
        etiquetas: ['fe', 'duda'],
      }),
    );
  });

  it('al editar parte de lo que ya había', () => {
    renderizar(
      <PantallaEntradaDiario entrada={ENTRADA} alGuardar={jest.fn()} alCancelar={jest.fn()} />,
    );

    expect(screen.getByDisplayValue('Gratitud de hoy')).toBeTruthy();
    expect(screen.getByDisplayValue('fe')).toBeTruthy();
  });

  it('muestra el error del caso de uso sin detalles técnicos', async () => {
    const alGuardar = jest.fn(async () => {
      // Un ErrorApp de verdad: la pantalla lo reconoce por su tipo, así que un
      // objeto parecido pasaría la prueba sin ejercitar el camino real.
      throw new ErrorApp({
        codigo: 'ENTRADA_INVALIDA',
        categoria: 'validacion',
        claveMensaje: 'diario.errores.cuerpoVacio',
        puedeReintentarse: false,
      });
    });
    renderizar(<PantallaEntradaDiario alGuardar={alGuardar} alCancelar={jest.fn()} />);

    fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('Escribe algo antes de guardar.')).toBeTruthy();
    expect(screen.queryByText(/ENTRADA_INVALIDA/)).toBeNull();
  });

  it('la entrada nueva no ofrece eliminar', () => {
    renderizar(<PantallaEntradaDiario alGuardar={jest.fn()} alCancelar={jest.fn()} />);

    expect(screen.queryByRole('button', { name: 'Eliminar' })).toBeNull();
  });
});
