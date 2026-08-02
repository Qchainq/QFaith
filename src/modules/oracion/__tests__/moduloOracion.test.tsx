// Recorrido del módulo completo, con el cifrado real: pantalla → hook → caso
// de uso → repositorio → base local → motor.
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

import { OracionContenedor } from '../screens/OracionContenedor';

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

function montar() {
  return renderizar(
    <ProveedorSincronizacion
      usuarioId={USUARIO}
      dispositivoId="dispositivo-1"
      construir={async () => sincronizacion}
    >
      <OracionContenedor />
    </ProveedorSincronizacion>,
  );
}

async function escribirPeticion(titulo: string, personas = ''): Promise<void> {
  fireEvent.press(await screen.findByRole('button', { name: 'Nueva petición' }));
  fireEvent.changeText(screen.getByLabelText(/Por qué quieres orar/), titulo);
  if (personas.length > 0) {
    fireEvent.changeText(screen.getByLabelText('Personas'), personas);
  }
  fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));
}

describe('vida de una petición', () => {
  it('se escribe y aparece sin pasar por la red', async () => {
    montar();

    await escribirPeticion('Por la salud de Marta', 'Marta Ruiz');

    expect(await screen.findByText('Por la salud de Marta')).toBeTruthy();
    expect(servidor.filas()).toHaveLength(0);
  });

  it('al sincronizar, el servidor no ve el título ni los nombres', async () => {
    montar();
    await escribirPeticion('Por la salud de Marta', 'Marta Ruiz');
    await screen.findByText('Por la salud de Marta');

    await sincronizacion.motor.sincronizar();

    const crudo = JSON.stringify(servidor.filas());
    expect(servidor.filas()).toHaveLength(1);
    expect(crudo).not.toContain('Marta');
    expect(crudo).not.toContain('salud de');
  });

  it('marcarla respondida no la hace desaparecer', async () => {
    montar();
    await escribirPeticion('Por el trabajo de Luis');
    fireEvent.press(await screen.findByRole('button', { name: 'Por el trabajo de Luis' }));

    fireEvent.press(screen.getByRole('button', { name: 'Marcar como respondida' }));

    // Sigue en la lista, ahora con su estado. Es lo que después alimenta el
    // memorial: sin el recorrido, una respuesta es un dato suelto.
    expect(await screen.findByText('Por el trabajo de Luis')).toBeTruthy();
    expect(await screen.findByText(/Respondida/)).toBeTruthy();
  });

  it('una petición respondida se puede volver a activar', async () => {
    montar();
    await escribirPeticion('Por mi familia');
    fireEvent.press(await screen.findByRole('button', { name: 'Por mi familia' }));
    fireEvent.press(screen.getByRole('button', { name: 'Marcar como respondida' }));
    await screen.findByText(/Respondida/);

    fireEvent.press(await screen.findByRole('button', { name: 'Por mi familia' }));
    fireEvent.press(screen.getByRole('button', { name: 'Volver a activar' }));

    expect(await screen.findByText(/Activa/)).toBeTruthy();
  });

  it('no deja guardar una petición sin decir por qué', async () => {
    montar();
    fireEvent.press(await screen.findByRole('button', { name: 'Nueva petición' }));

    fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('Escribe por qué quieres orar.')).toBeTruthy();
  });

  it('eliminar la retira de la lista pero la deja en la papelera', async () => {
    montar();
    await escribirPeticion('Para borrar');
    fireEvent.press(await screen.findByRole('button', { name: 'Para borrar' }));

    fireEvent.press(screen.getByRole('button', { name: 'Eliminar' }));

    await waitFor(() => expect(screen.queryByText('Para borrar')).toBeNull());
    const registros = await sincronizacion.almacen.listar('prayers', { incluirEliminados: true });
    expect(registros[0]?.eliminadoEn).not.toBeNull();
  });
});
