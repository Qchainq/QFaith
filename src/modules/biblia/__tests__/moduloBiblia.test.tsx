// Recorrido del módulo: elegir traducción, abrir un libro, leer el capítulo y
// escribir una nota. El texto público llega por REST; la nota se cifra y pasa
// por el motor. Aquí se comprueba que las dos mitades conviven.
import { fireEvent, screen } from '@testing-library/react-native';
import { crearSincronizacionDePrueba } from '@modules/sincronizacion/__tests__/sincronizacionDePrueba';

import {
  ProveedorSincronizacion,
  type Sincronizacion,
} from '@modules/sincronizacion/services/contextoSincronizacion';
import { crearAlmacenEnMemoria } from '@shared/database/almacenEnMemoria';
import {
  bloquear,
  inicializarCuenta,
  olvidarDispositivo,
} from '@shared/services/keys/servicioClaves';
import {
  crearServidorEnMemoria,
  type ServidorEnMemoria,
} from '@shared/services/sync/__tests__/servidorEnMemoria';
import { renderizar } from '@shared/testing/renderizar';

import { BibliaContenedor } from '../screens/BibliaContenedor';

const USUARIO = 'usuario-1';
const KDF_RAPIDO = {
  algoritmo: 'argon2id',
  memoriaKiB: 256,
  iteraciones: 1,
  paralelismo: 1,
} as const;

// El texto público llega por REST. Se sirve desde aquí, con contenido
// inventado: el proyecto no incrusta texto bíblico sin resolver su licencia.
const mockPeticion = jest.fn();
jest.mock('@shared/services/supabase/rest', () => ({
  crearClienteRest: () => ({
    peticion: (parametros: unknown) => mockPeticion(parametros),
    comoError: () => new Error('fallo del servidor'),
  }),
}));

let servidor: ServidorEnMemoria;
let sincronizacion: Sincronizacion;

beforeEach(async () => {
  bloquear();
  await olvidarDispositivo();
  await inicializarCuenta({ usuarioId: USUARIO, ajustesKdf: KDF_RAPIDO });

  const almacen = crearAlmacenEnMemoria();
  servidor = crearServidorEnMemoria();
  sincronizacion = crearSincronizacionDePrueba({
    almacen,
    usuarioId: USUARIO,
    remoto: servidor,
    dispositivoId: 'dispositivo-1',
  });

  mockPeticion.mockImplementation(async ({ ruta }: { ruta: string }) => {
    if (ruta.includes('bible_translations')) {
      return {
        estado: 200,
        codigo: null,
        filas: [
          {
            id: 't1',
            code: 'prueba',
            name: 'Traducción de prueba',
            language_code: 'es',
            offline_available: false,
          },
        ],
      };
    }
    if (ruta.includes('bible_books')) {
      return {
        estado: 200,
        codigo: null,
        filas: [
          {
            book_code: 'LBR',
            book_name: 'Libro de prueba',
            testament: 'nuevo',
            book_order: 1,
            chapter_count: 3,
          },
        ],
      };
    }
    return {
      estado: 200,
      codigo: null,
      filas: [
        {
          book_code: 'LBR',
          chapter_number: 1,
          verse_number: 1,
          verse_text: 'Primer versículo de prueba.',
        },
      ],
    };
  });
});

function montar() {
  return renderizar(
    <ProveedorSincronizacion
      usuarioId={USUARIO}
      dispositivoId="dispositivo-1"
      construir={async () => sincronizacion}
    >
      <BibliaContenedor />
    </ProveedorSincronizacion>,
  );
}

async function abrirCapitulo(): Promise<void> {
  fireEvent.press(await screen.findByRole('button', { name: 'Traducción de prueba' }));
  fireEvent.press(await screen.findByRole('button', { name: 'Libro de prueba' }));
  await screen.findByText(/Primer versículo/);
}

describe('leer', () => {
  it('elegir traducción lleva a los libros y abrir un libro al capítulo', async () => {
    montar();

    await abrirCapitulo();

    expect(screen.getByText(/Primer versículo/)).toBeTruthy();
  });

  it('el capítulo se puede leer sin haber escrito ninguna nota', async () => {
    montar();

    await abrirCapitulo();

    expect(screen.getByText(/Todavía no has escrito nada sobre este capítulo/)).toBeTruthy();
  });
});

describe('notas sobre el pasaje', () => {
  it('se escriben, se ven y no salen en claro del dispositivo', async () => {
    montar();
    await abrirCapitulo();

    fireEvent.changeText(
      screen.getByLabelText('Tu nota sobre este pasaje'),
      'Esto me recordó a mi hermano.',
    );
    fireEvent.press(screen.getByRole('button', { name: 'Guardar nota' }));

    expect(await screen.findByText('Esto me recordó a mi hermano.')).toBeTruthy();

    await sincronizacion.motor.sincronizar();
    const crudo = JSON.stringify(servidor.filas());
    expect(crudo).not.toContain('mi hermano');
    // La referencia sí viaja: es lo que sitúa la nota en su pasaje.
    expect(crudo).toContain('LBR');
  });

  it('el texto bíblico no se guarda como contenido del usuario', async () => {
    // No pertenece a la persona (Documento 12). Solo su nota se sincroniza.
    montar();
    await abrirCapitulo();
    fireEvent.changeText(screen.getByLabelText('Tu nota sobre este pasaje'), 'Una nota');
    fireEvent.press(screen.getByRole('button', { name: 'Guardar nota' }));
    await screen.findByText('Una nota');

    await sincronizacion.motor.sincronizar();

    expect(servidor.filas()).toHaveLength(1);
    expect(JSON.stringify(servidor.filas())).not.toContain('Primer versículo');
  });

  it('no deja guardar una nota vacía', async () => {
    montar();
    await abrirCapitulo();

    fireEvent.press(screen.getByRole('button', { name: 'Guardar nota' }));

    expect(await screen.findByText('Escribe la nota antes de guardarla.')).toBeTruthy();
  });
});

describe('sin conexión', () => {
  it('lo dice con claridad en vez de mostrar un error técnico', async () => {
    mockPeticion.mockImplementation(async () => ({ estado: 503, codigo: null, filas: [] }));
    montar();

    expect(await screen.findByText(/no está descargado y ahora no hay conexión/)).toBeTruthy();
  });
});
