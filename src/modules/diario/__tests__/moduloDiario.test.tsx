// Recorrido del módulo completo: pantalla → hook → caso de uso → repositorio
// → base local → motor. Es la prueba que dice si el módulo está terminado,
// porque ejercita las capas juntas y con el cifrado real.
import { fireEvent, screen, waitFor } from '@testing-library/react-native';

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
import { crearMotorSincronizacion } from '@shared/services/sync/motorSincronizacion';
import {
  crearServidorEnMemoria,
  type ServidorEnMemoria,
} from '@shared/services/sync/__tests__/servidorEnMemoria';
import { renderizar } from '@shared/testing/renderizar';

import { DiarioContenedor } from '../screens/DiarioContenedor';

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
  sincronizacion = {
    almacen,
    usuarioId: USUARIO,
    motor: crearMotorSincronizacion({
      almacen,
      remoto: servidor,
      usuarioId: USUARIO,
      dispositivoId: 'dispositivo-1',
    }),
  };
});

// Las claves se limpian en `beforeEach`, no aquí: borrarlas justo al terminar
// puede pillar a una relectura en vuelo, que se queda esperando una clave que
// ya no existe.

function montar() {
  return renderizar(
    <ProveedorSincronizacion
      usuarioId={USUARIO}
      dispositivoId="dispositivo-1"
      construir={async () => sincronizacion}
    >
      <DiarioContenedor />
    </ProveedorSincronizacion>,
  );
}

async function escribirEntrada(titulo: string, cuerpo: string): Promise<void> {
  fireEvent.press(await screen.findByRole('button', { name: 'Nueva entrada' }));
  fireEvent.changeText(screen.getByLabelText('Título'), titulo);
  fireEvent.changeText(screen.getByLabelText(/Qué quieres recordar/), cuerpo);
  fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));
}

describe('escribir y volver a leer', () => {
  it('la entrada aparece en la lista sin pasar por la red', async () => {
    montar();

    await escribirEntrada('Gratitud', 'Agradezco la calma de esta mañana.');

    // Offline-first: está en la lista aunque nadie haya sincronizado nada.
    expect(await screen.findByText('Gratitud')).toBeTruthy();
    expect(servidor.filas()).toHaveLength(0);
  });

  it('al sincronizar, el servidor recibe el sobre y no el texto', async () => {
    montar();
    await escribirEntrada('Gratitud', 'Agradezco la calma de esta mañana.');
    await screen.findByText('Gratitud');

    await sincronizacion.motor.sincronizar();

    expect(servidor.filas()).toHaveLength(1);
    const crudo = JSON.stringify(servidor.filas());
    expect(crudo).not.toContain('Gratitud');
    expect(crudo).not.toContain('calma');
  });

  it('sin conexión el usuario no se entera: su entrada queda guardada', async () => {
    servidor.desconectar();
    montar();

    await escribirEntrada('Sin red', 'Escrito en el metro.');

    expect(await screen.findByText('Sin red')).toBeTruthy();
  });

  it('una entrada se puede abrir, editar y ver actualizada', async () => {
    montar();
    await escribirEntrada('Original', 'Primera versión.');
    fireEvent.press(await screen.findByRole('button', { name: 'Original' }));

    fireEvent.changeText(screen.getByLabelText('Título'), 'Corregida');
    fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('Corregida')).toBeTruthy();
    expect(screen.queryByText('Original')).toBeNull();
  });

  it('eliminar la retira de la lista pero no del almacén', async () => {
    montar();
    await escribirEntrada('Para borrar', 'Texto.');
    fireEvent.press(await screen.findByRole('button', { name: 'Para borrar' }));

    fireEvent.press(screen.getByRole('button', { name: 'Eliminar' }));

    await waitFor(() => expect(screen.queryByText('Para borrar')).toBeNull());
    // Papelera de 30 días: el registro sigue ahí con su fecha de baja.
    const registros = await sincronizacion.almacen.listar('journal_entries', {
      incluirEliminados: true,
    });
    expect(registros).toHaveLength(1);
    expect(registros[0]?.eliminadoEn).not.toBeNull();
  });

  it('no deja guardar una entrada vacía', async () => {
    montar();
    fireEvent.press(await screen.findByRole('button', { name: 'Nueva entrada' }));

    fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('Ponle un título, aunque sea corto.')).toBeTruthy();
  });
});
