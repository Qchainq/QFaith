// Recorrido del módulo con los repositorios reales de Diario y Oración. Es la
// prueba que dice si los módulos pueden leerse entre sí sin que ninguno
// conozca al otro y sin romper el aislamiento.
import { fireEvent, screen } from '@testing-library/react-native';

import { crearRepositorioDiario } from '@modules/diario/repositories/repositorioDiario';
import { crearRepositorioOracion } from '@modules/oracion/repositories/repositorioOracion';
import {
  ProveedorSincronizacion,
  type Sincronizacion,
} from '@modules/sincronizacion/services/contextoSincronizacion';
import { crearAlmacenEnMemoria } from '@shared/database/almacenEnMemoria';
import {
  bloquear,
  claveDeDominio,
  clavesDerivadas,
  inicializarCuenta,
  olvidarDispositivo,
} from '@shared/services/keys/servicioClaves';
import { crearMotorSincronizacion } from '@shared/services/sync/motorSincronizacion';
import {
  crearServidorEnMemoria,
  type ServidorEnMemoria,
} from '@shared/services/sync/__tests__/servidorEnMemoria';
import { renderizar } from '@shared/testing/renderizar';

import { BibliotecaContenedor } from '../screens/BibliotecaContenedor';

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
  const motor = crearMotorSincronizacion({
    almacen,
    remoto: servidor,
    usuarioId: USUARIO,
    dispositivoId: 'dispositivo-1',
  });
  sincronizacion = { almacen, usuarioId: USUARIO, motor };

  // Contenido de partida, escrito con los repositorios de verdad de cada
  // módulo: la Biblioteca tiene que poder leerlo sin conocerlos.
  const diario = crearRepositorioDiario({
    motor,
    almacen,
    usuarioId: USUARIO,
    claveDiario: () => claveDeDominio('diario'),
    claveHash: () => clavesDerivadas().claveHash,
  });
  await diario.guardar({
    titulo: 'Gratitud de hoy',
    cuerpo: 'Con mi familia sentí mucho gozo.',
    etiquetas: [],
    tipo: 'gratitude',
    fecha: '2026-08-02',
  });

  const oracion = crearRepositorioOracion({
    motor,
    almacen,
    usuarioId: USUARIO,
    claveOracion: () => claveDeDominio('oracion'),
    claveHash: () => clavesDerivadas().claveHash,
  });
  await oracion.guardar({
    titulo: 'Por la salud de Marta',
    detalle: 'Tengo miedo de lo que digan mañana.',
    personas: ['Marta'],
    categoria: 'salud',
  });
});

function montar() {
  return renderizar(
    <ProveedorSincronizacion
      usuarioId={USUARIO}
      dispositivoId="dispositivo-1"
      construir={async () => sincronizacion}
    >
      <BibliotecaContenedor />
    </ProveedorSincronizacion>,
  );
}

describe('organizar', () => {
  it('recoge lo escrito en el diario y en oración', async () => {
    montar();

    fireEvent.press(await screen.findByRole('button', { name: 'Organizar ahora' }));

    expect(await screen.findByText('Gratitud de hoy')).toBeTruthy();
    expect(await screen.findByText('Por la salud de Marta')).toBeTruthy();
  });

  it('clasifica cada elemento en su tema, en el dispositivo', async () => {
    montar();

    fireEvent.press(await screen.findByRole('button', { name: 'Organizar ahora' }));
    await screen.findByText('Gratitud de hoy');

    fireEvent.press(screen.getByRole('button', { name: 'Ansiedad' }));

    // Solo queda la petición: el filtro es real, no decorativo.
    expect(await screen.findByText('Por la salud de Marta')).toBeTruthy();
    expect(screen.queryByText('Gratitud de hoy')).toBeNull();
  });

  it('el servidor no recibe de qué trata nada de esto', async () => {
    montar();
    fireEvent.press(await screen.findByRole('button', { name: 'Organizar ahora' }));
    await screen.findByText('Gratitud de hoy');

    await sincronizacion.motor.sincronizar();

    const crudo = JSON.stringify(servidor.filas());
    expect(crudo).not.toContain('familia');
    expect(crudo).not.toContain('Marta');
    expect(crudo).not.toContain('gozo');
    // Sí ve que existe una ficha que referencia un registro que ya conocía.
    expect(crudo).toContain('diario');
  });

  it('el estado vacío no culpabiliza a quien todavía no ha escrito nada', async () => {
    // La Biblioteca se llena sola; no hay nada que reprochar si está vacía.
    sincronizacion = {
      ...sincronizacion,
      almacen: crearAlmacenEnMemoria(),
    };
    montar();

    expect(await screen.findByText(/aparecerán aquí/)).toBeTruthy();
  });
});
