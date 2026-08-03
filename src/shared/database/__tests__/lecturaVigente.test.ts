// Leer sin sacar nada de la papelera.
//
// `almacen.obtener` devuelve los registros marcados de baja porque el motor
// de sincronización los necesita. Un repositorio que lo use para responder a
// una pantalla enseña algo ya borrado, y si además lo edita, lo resucita.
//
// Estas pruebas fijan la diferencia y, sobre todo, la comprueban **sobre los
// repositorios de verdad**: el fallo apareció en el Pulso y era la misma
// forma en seis módulos.
import { crearAlmacenEnMemoria } from '@shared/database/almacenEnMemoria';
import { obtenerVigente } from '@shared/database/lecturaVigente';
import {
  crearClaveContenido,
  derivarClaves,
  generarClaveMaestra,
} from '@shared/services/crypto/servicioCriptografia';
import { crearMotorSincronizacion } from '@shared/services/sync/motorSincronizacion';
import { crearServidorEnMemoria } from '@shared/services/sync/__tests__/servidorEnMemoria';

import { crearRepositorioMemorial } from '@modules/memorial/repositories/repositorioMemorial';
import { crearRepositorioPulso } from '@modules/pulso/repositories/repositorioPulso';

const USUARIO = 'usuario-1';

function montar() {
  const almacen = crearAlmacenEnMemoria();
  const derivadas = derivarClaves(generarClaveMaestra());
  const motor = crearMotorSincronizacion({
    almacen,
    remoto: crearServidorEnMemoria(),
    usuarioId: USUARIO,
    dispositivoId: 'dispositivo-1',
  });

  const comun = { motor, almacen, usuarioId: USUARIO, claveHash: () => derivadas.claveHash };
  const claveMemorial = crearClaveContenido('memorial');
  const clavePulso = crearClaveContenido('pulso');

  return {
    almacen,
    memorial: crearRepositorioMemorial({ ...comun, claveMemorial: () => claveMemorial }),
    pulso: crearRepositorioPulso({ ...comun, clavePulso: () => clavePulso }),
  };
}

describe('el ayudante', () => {
  it('devuelve el registro cuando está vigente', async () => {
    const { almacen, memorial } = montar();
    const creado = await memorial.guardar({ titulo: 'Algo', relato: '', personas: [] });

    expect(await obtenerVigente(almacen, 'memorials', creado.id)).not.toBeNull();
  });

  it('devuelve null cuando está en la papelera', async () => {
    const { almacen, memorial } = montar();
    const creado = await memorial.guardar({ titulo: 'Algo', relato: '', personas: [] });
    await memorial.eliminar(creado.id);

    // `almacen.obtener` sí lo ve: el motor lo necesita para propagar la baja.
    expect(await almacen.obtener('memorials', creado.id)).not.toBeNull();
    // La lectura destinada al usuario, no.
    expect(await obtenerVigente(almacen, 'memorials', creado.id)).toBeNull();
  });

  it('devuelve null cuando no existe', async () => {
    const { almacen } = montar();
    expect(await obtenerVigente(almacen, 'memorials', 'no-existe')).toBeNull();
  });
});

describe('nada borrado vuelve a la pantalla', () => {
  it('un memorial retirado no se puede abrir', async () => {
    const { memorial } = montar();
    const creado = await memorial.guardar({ titulo: 'Retirado', relato: '', personas: [] });

    await memorial.eliminar(creado.id);

    expect(await memorial.obtener(creado.id)).toBeNull();
  });

  it('el pulso de un día borrado deja de contestar por ese día', async () => {
    // Es donde apareció el fallo: la pantalla seguía mostrando la respuesta de
    // hoy después de borrarla, en vez de volver a preguntar.
    const { pulso } = montar();
    await pulso.guardar({ fecha: '2026-08-03', estado: 'enPaz' });

    await pulso.eliminar('2026-08-03');

    expect(await pulso.deLaFecha('2026-08-03')).toBeNull();
  });
});

describe('nada borrado resucita al editarlo', () => {
  it('marcar como favorito un memorial retirado no lo devuelve a la vida', async () => {
    const { memorial } = montar();
    const creado = await memorial.guardar({ titulo: 'Retirado', relato: '', personas: [] });
    await memorial.eliminar(creado.id);

    // Devuelve null en lugar de escribir un cambio: resucitar algo que la
    // persona borró sería sobrescribir su decisión en silencio (invariante 5).
    expect(await memorial.alternarFavorito(creado.id)).toBeNull();
    expect((await memorial.listar()).memoriales).toHaveLength(0);
  });

  it('y responder de nuevo ese día sí crea un pulso, que es lo que se espera', async () => {
    // La diferencia importa: editar lo borrado no vale, pero volver a
    // responder es una acción nueva de la persona y sí debe funcionar.
    const { pulso } = montar();
    await pulso.guardar({ fecha: '2026-08-03', estado: 'enPaz' });
    await pulso.eliminar('2026-08-03');

    const nuevo = await pulso.guardar({ fecha: '2026-08-03', estado: 'agradecido' });

    expect(nuevo.estado).toBe('agradecido');
    expect(await pulso.deLaFecha('2026-08-03')).not.toBeNull();
  });
});
