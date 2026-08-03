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

// Avances: el punto 6 del recorrido end-to-end obligatorio (Documento 14).
//
// Sin ellos, una oración respondida es un interruptor. Con ellos es una
// historia, y es lo que después da sentido a un memorial.
describe('avances de una petición', () => {
  const abrir = async (titulo: string) => {
    await escribirPeticion(titulo);
    fireEvent.press(await screen.findByRole('button', { name: titulo }));
  };

  it('se anotan y quedan visibles en la propia petición', async () => {
    montar();
    await abrir('Por el trabajo de mi hermana');

    fireEvent.changeText(
      await screen.findByLabelText('¿Qué ha pasado?'),
      'La han llamado para una segunda entrevista.',
    );
    fireEvent.press(screen.getByRole('button', { name: 'Guardar el avance' }));

    expect(await screen.findByText('La han llamado para una segunda entrevista.')).toBeTruthy();
  });

  it('anotar uno no cierra la petición: se sigue en ella', async () => {
    montar();
    await abrir('Sigo aquí');

    fireEvent.changeText(await screen.findByLabelText('¿Qué ha pasado?'), 'Algo pasó');
    fireEvent.press(screen.getByRole('button', { name: 'Guardar el avance' }));
    await screen.findByText('Algo pasó');

    // El campo del título sigue en pantalla: no se ha vuelto a la lista.
    expect(screen.getByLabelText('¿Por qué quieres orar?')).toBeTruthy();
  });

  it('el campo se limpia solo cuando quedó guardado', async () => {
    montar();
    await abrir('Otra');

    const campo = await screen.findByLabelText('¿Qué ha pasado?');
    fireEvent.changeText(campo, 'Un avance');
    fireEvent.press(screen.getByRole('button', { name: 'Guardar el avance' }));

    await waitFor(() => expect(screen.getByLabelText('¿Qué ha pasado?').props.value).toBe(''));
  });

  it('el estado vacío no reprocha no haber anotado nada', async () => {
    montar();
    await abrir('Recién creada');

    expect(await screen.findByText('Todavía no has anotado nada sobre esta oración.')).toBeTruthy();
  });

  it('el servidor no ve el texto del avance', async () => {
    montar();
    await abrir('Privada');

    fireEvent.changeText(
      await screen.findByLabelText('¿Qué ha pasado?'),
      'Los resultados salieron limpios.',
    );
    fireEvent.press(screen.getByRole('button', { name: 'Guardar el avance' }));
    await screen.findByText('Los resultados salieron limpios.');

    await sincronizacion.motor.sincronizar();

    const crudo = JSON.stringify(servidor.filas());
    expect(crudo).not.toContain('resultados');
    // Sí ve de qué petición cuelga: lo necesita para ordenarlos sin descifrar.
    expect(crudo).toContain('prayer_updates');
  });

  it('creando una petición nueva no se ofrecen avances', async () => {
    // No hay a qué colgarlos mientras la petición no existe.
    montar();
    fireEvent.press(await screen.findByRole('button', { name: 'Nueva petición' }));

    expect(screen.queryByLabelText('¿Qué ha pasado?')).toBeNull();
  });
});
