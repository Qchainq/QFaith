// Recorrido del módulo completo con el cifrado real.
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

import { HabitosContenedor } from '../screens/HabitosContenedor';

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
      <HabitosContenedor />
    </ProveedorSincronizacion>,
  );
}

async function crearHabito(titulo: string): Promise<void> {
  fireEvent.press(await screen.findByRole('button', { name: 'Nuevo hábito' }));
  fireEvent.changeText(screen.getByLabelText(/Qué quieres cultivar/), titulo);
  fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));
}

describe('vida de un hábito', () => {
  it('se crea y aparece sin pasar por la red', async () => {
    montar();

    await crearHabito('Leer diez minutos');

    expect(await screen.findByText('Leer diez minutos')).toBeTruthy();
    expect(servidor.filas()).toHaveLength(0);
  });

  it('marcar hoy cambia la acción y no habla de días perdidos', async () => {
    montar();
    await crearHabito('Leer diez minutos');

    fireEvent.press(await screen.findByRole('button', { name: 'Marcar hoy' }));

    expect(await screen.findByRole('button', { name: 'Hecho hoy' })).toBeTruthy();
    // Lo que se muestra es lo cumplido. Nunca «llevas X días sin».
    expect(await screen.findByText(/1 día en los últimos 30/)).toBeTruthy();
  });

  it('se puede deshacer el día sin que quede constancia de un fallo', async () => {
    montar();
    await crearHabito('Orar por la mañana');
    fireEvent.press(await screen.findByRole('button', { name: 'Marcar hoy' }));
    await screen.findByRole('button', { name: 'Hecho hoy' });

    fireEvent.press(screen.getByRole('button', { name: 'Hecho hoy' }));

    expect(await screen.findByRole('button', { name: 'Marcar hoy' })).toBeTruthy();
    expect(await screen.findByText(/0 días en los últimos 30/)).toBeTruthy();
  });

  it('al sincronizar, el servidor no ve el título', async () => {
    montar();
    await crearHabito('Volver a hablar con mi padre');
    await screen.findByText('Volver a hablar con mi padre');

    await sincronizacion.motor.sincronizar();

    expect(JSON.stringify(servidor.filas())).not.toContain('mi padre');
  });

  it('no deja crear un hábito sin título', async () => {
    montar();
    fireEvent.press(await screen.findByRole('button', { name: 'Nuevo hábito' }));

    fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('Escribe qué quieres cultivar.')).toBeTruthy();
  });

  it('eliminar lo retira de la lista pero lo deja en la papelera', async () => {
    montar();
    await crearHabito('Para borrar');
    fireEvent.press(await screen.findByRole('button', { name: 'Para borrar' }));

    fireEvent.press(screen.getByRole('button', { name: 'Eliminar' }));

    await waitFor(() => expect(screen.queryByText('Para borrar')).toBeNull());
    const registros = await sincronizacion.almacen.listar('habits', { incluirEliminados: true });
    expect(registros[0]?.eliminadoEn).not.toBeNull();
  });
});
