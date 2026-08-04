// Recorrido del módulo con el almacén, el motor y el cifrado reales.
//
// Comprueba lo que ninguna prueba de unidad puede: que la pantalla, los
// hooks, el caso de uso y el repositorio encajan, y que lo que sube al
// servidor sigue siendo ilegible después de pasar por todos ellos.
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

import type { BorradorMemorial } from '../models/memorial';
import { MemorialContenedor } from '../screens/MemorialContenedor';

const USUARIO = 'usuario-1';
const KDF_RAPIDO = {
  algoritmo: 'argon2id',
  memoriaKiB: 256,
  iteraciones: 1,
  paralelismo: 1,
} as const;

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
});

function montar(borradorInicial?: BorradorMemorial) {
  return renderizar(
    <ProveedorSincronizacion
      usuarioId={USUARIO}
      dispositivoId="dispositivo-1"
      construir={async () => sincronizacion}
    >
      <MemorialContenedor {...(borradorInicial === undefined ? {} : { borradorInicial })} />
    </ProveedorSincronizacion>,
  );
}

async function anotar(campos: {
  titulo: string;
  relato?: string;
  personas?: string;
  fecha?: string;
}) {
  fireEvent.press(await screen.findByRole('button', { name: 'Anotar una respuesta' }));

  fireEvent.changeText(await screen.findByLabelText('¿Qué pasó?'), campos.titulo);
  if (campos.relato !== undefined) {
    fireEvent.changeText(screen.getByLabelText('Cuéntalo con tus palabras'), campos.relato);
  }
  if (campos.personas !== undefined) {
    fireEvent.changeText(screen.getByLabelText('Personas (separadas por comas)'), campos.personas);
  }
  if (campos.fecha !== undefined) {
    fireEvent.changeText(screen.getByLabelText('¿Qué día fue? (AAAA-MM-DD)'), campos.fecha);
  }

  fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));
}

describe('anotar una respuesta', () => {
  it('se guarda y aparece en su año', async () => {
    montar();

    await anotar({
      titulo: 'Volvió a hablarme mi padre',
      relato: 'Me llamó él, después de cuatro años.',
      fecha: '2026-03-14',
    });

    expect(await screen.findByText('Volvió a hablarme mi padre')).toBeTruthy();
    expect(screen.getByText('2026')).toBeTruthy();
  });

  it('sin fecha va a su propio tramo, no al año en curso', async () => {
    montar();

    await anotar({ titulo: 'No recuerdo cuándo fue', relato: 'Pero pasó.' });

    expect(await screen.findByText('Sin fecha')).toBeTruthy();
  });

  it('un título vacío no guarda nada y lo dice sin culpar a nadie', async () => {
    montar();

    await anotar({ titulo: '   ', relato: 'Algo' });

    expect(await screen.findByText('Escribe al menos unas palabras sobre qué pasó.')).toBeTruthy();
    // Sigue en el editor: lo escrito no se pierde.
    expect(screen.getByLabelText('Cuéntalo con tus palabras')).toBeTruthy();
  });
});

describe('desde una oración respondida', () => {
  it('llega con el título puesto y el relato por escribir', async () => {
    montar({
      peticionId: 'peticion-1',
      titulo: 'Por el trabajo de mi hermana',
      relato: '',
      personas: ['Marta'],
      ocurrioEl: '2026-04-02',
    });

    // El aviso explica de dónde viene, para que nadie se pregunte por qué
    // aparece un texto que no acaba de escribir.
    expect(await screen.findByText('Nació de una oración que marcaste respondida.')).toBeTruthy();

    fireEvent.changeText(screen.getByLabelText('Cuéntalo con tus palabras'), 'La llamaron ayer.');
    fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('Por el trabajo de mi hermana')).toBeTruthy();
    expect(screen.getByText('La llamaron ayer.')).toBeTruthy();
  });
});

describe('favoritos', () => {
  it('el filtro deja solo los marcados', async () => {
    montar();
    await anotar({ titulo: 'Uno importante', fecha: '2026-01-01' });
    await screen.findByText('Uno importante');
    await anotar({ titulo: 'Otro cualquiera', fecha: '2026-01-02' });
    await screen.findByText('Otro cualquiera');

    // El primero de la lista es el más reciente por fecha del recuerdo.
    fireEvent.press(screen.getAllByRole('button', { name: 'Marcar como favorito' })[0]!);
    await screen.findByText('Quitar de favoritos');

    fireEvent.press(screen.getByRole('button', { name: 'Favoritos' }));

    expect(await screen.findByText('Otro cualquiera')).toBeTruthy();
    expect(screen.queryByText('Uno importante')).toBeNull();
  });
});

describe('lo que ve el servidor', () => {
  it('ni el relato ni los nombres viajan legibles', async () => {
    montar();
    await anotar({
      titulo: 'Sanó mi madre',
      relato: 'Los resultados salieron limpios.',
      personas: 'Elena',
      fecha: '2026-02-20',
    });
    await screen.findByText('Sanó mi madre');

    await sincronizacion.motor.sincronizar();

    const crudo = JSON.stringify(servidor.filas());
    expect(crudo).not.toContain('madre');
    expect(crudo).not.toContain('Elena');
    expect(crudo).not.toContain('resultados');
    // La fecha sí: la necesita para ordenar sin descifrar nada.
    expect(crudo).toContain('2026-02-20');
  });
});

describe('estado vacío', () => {
  it('no reprocha nada a quien todavía no ha anotado', async () => {
    montar();

    expect(await screen.findByText(/Todavía no has anotado nada aquí/)).toBeTruthy();
  });
});
