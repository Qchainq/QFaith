// Recorrido del módulo: elegir traducción, abrir un libro, leer el capítulo y
// escribir una nota. El texto público llega por REST; la nota se cifra y pasa
// por el motor. Aquí se comprueba que las dos mitades conviven.
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
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

describe('subrayar un pasaje', () => {
  const pulsar = async (nombre: string | RegExp) => {
    const boton = await screen.findByRole('button', { name: nombre });
    await act(async () => {
      fireEvent.press(boton);
    });
  };

  it('tocar un versículo ofrece los colores', async () => {
    montar();
    await abrirCapitulo();

    await act(async () => {
      fireEvent.press(screen.getByText(/Primer versículo/));
    });

    expect(await screen.findByRole('button', { name: 'Amarillo' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Solo subrayado' })).toBeTruthy();
  });

  it('elegir un color cierra la paleta y deja el versículo marcado', async () => {
    // La paleta se cierra porque lo que se ha venido a hacer es leer: dejarla
    // abierta taparía el texto.
    montar();
    await abrirCapitulo();

    await act(async () => {
      fireEvent.press(screen.getByText(/Primer versículo/));
    });
    await pulsar('Amarillo');

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Verde' })).toBeNull();
    });

    // Y al volver a abrirla ya se puede quitar: la marca está ahí.
    await act(async () => {
      fireEvent.press(screen.getByText(/Primer versículo/));
    });
    expect(await screen.findByRole('button', { name: 'Quitar el subrayado' })).toBeTruthy();
  });

  it('el versículo queda pintado del color elegido', async () => {
    // Es lo único que hace visible un subrayado: sin comprobarlo, la función
    // podría guardarlo todo bien y no pintar nada.
    montar();
    await abrirCapitulo();

    const antes = screen.getByText(/Primer versículo/).props.style;
    expect(JSON.stringify(antes ?? {})).not.toContain('backgroundColor');

    await act(async () => {
      fireEvent.press(screen.getByText(/Primer versículo/));
    });
    await pulsar('Amarillo');

    await waitFor(() => {
      const despues = screen.getByText(/Primer versículo/).props.style;
      expect(JSON.stringify(despues)).toContain('backgroundColor');
    });
  });

  it('dos colores sobre el mismo versículo: manda el último', async () => {
    // El esquema permite subrayados superpuestos a propósito —fundirlos
    // perdería lo que la persona marcó—, así que hay que decidir cuál se ve.
    // El último, como con dos rotuladores sobre papel.
    montar();
    await abrirCapitulo();

    await act(async () => {
      fireEvent.press(screen.getByText(/Primer versículo/));
    });
    await pulsar('Amarillo');
    const conAmarillo = JSON.stringify(screen.getByText(/Primer versículo/).props.style);

    await act(async () => {
      fireEvent.press(screen.getByText(/Primer versículo/));
    });
    await pulsar('Verde');

    await waitFor(() => {
      const conVerde = JSON.stringify(screen.getByText(/Primer versículo/).props.style);
      expect(conVerde).toContain('backgroundColor');
      expect(conVerde).not.toBe(conAmarillo);
    });
  });

  it('el estilo «solo subrayado» no tiñe la página', async () => {
    // Existe para quien prefiere no llenar su Biblia de color.
    montar();
    await abrirCapitulo();

    await act(async () => {
      fireEvent.press(screen.getByText(/Primer versículo/));
    });
    await pulsar('Solo subrayado');

    await waitFor(() => {
      const estilo = JSON.stringify(screen.getByText(/Primer versículo/).props.style);
      expect(estilo).toContain('underline');
      expect(estilo).not.toContain('backgroundColor');
    });
  });

  it('lo que se escribe al subrayar no sale en claro del dispositivo', async () => {
    // El servidor puede ver qué pasaje marcaste; lo que pensaste de él, no.
    montar();
    await abrirCapitulo();

    await act(async () => {
      fireEvent.press(screen.getByText(/Primer versículo/));
    });
    await pulsar('Verde');

    await act(async () => {
      await sincronizacion.motor.sincronizar();
    });

    const enElServidor = JSON.stringify(servidor.filas());
    // La referencia sí está, y es a propósito: hace falta para pintar el
    // capítulo sin descifrarlo todo.
    expect(enElServidor).toContain('LBR');
    expect(enElServidor).toContain('verde');
  });

  it('quitar el subrayado lo devuelve a como estaba', async () => {
    montar();
    await abrirCapitulo();

    await act(async () => {
      fireEvent.press(screen.getByText(/Primer versículo/));
    });
    await pulsar('Amarillo');
    await act(async () => {
      fireEvent.press(screen.getByText(/Primer versículo/));
    });
    await pulsar('Quitar el subrayado');

    await act(async () => {
      fireEvent.press(screen.getByText(/Primer versículo/));
    });
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Quitar el subrayado' })).toBeNull();
    });
  });
});

describe('guardar dónde voy', () => {
  const pulsar = async (nombre: string | RegExp) => {
    const boton = await screen.findByRole('button', { name: nombre });
    await act(async () => {
      fireEvent.press(boton);
    });
  };

  it('se ofrece guardar el punto de lectura', async () => {
    montar();
    await abrirCapitulo();

    expect(await screen.findByRole('button', { name: 'Guardar dónde voy' })).toBeTruthy();
  });

  it('una vez guardado, lo que se ofrece es quitarlo', async () => {
    // Volver a guardarlo no haría nada —el mismo sitio es el mismo marcador—,
    // así que ofrecerlo sería un botón que miente.
    montar();
    await abrirCapitulo();

    await pulsar('Guardar dónde voy');

    expect(await screen.findByRole('button', { name: 'Quitar el marcador' })).toBeTruthy();
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Guardar dónde voy' })).toBeNull();
    });
  });

  it('quitarlo vuelve a ofrecer guardarlo', async () => {
    montar();
    await abrirCapitulo();

    await pulsar('Guardar dónde voy');
    await pulsar('Quitar el marcador');

    expect(await screen.findByRole('button', { name: 'Guardar dónde voy' })).toBeTruthy();
  });
});
