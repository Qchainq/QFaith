// Frontera entre el texto y el sobre, con el cifrado y el motor de verdad.
// Aquí se comprueba además lo que distingue a este módulo del Diario: una
// petición respondida no desaparece, y los avances conservan la cronología.
import { crearAlmacenEnMemoria } from '@shared/database/almacenEnMemoria';
import {
  crearClaveContenido,
  derivarClaves,
  generarClaveMaestra,
} from '@shared/services/crypto/servicioCriptografia';
import { crearMotorSincronizacion } from '@shared/services/sync/motorSincronizacion';
import { crearServidorEnMemoria } from '@shared/services/sync/__tests__/servidorEnMemoria';

import {
  crearRepositorioOracion,
  TIPO_AVANCE,
  TIPO_PETICION,
} from '../repositories/repositorioOracion';

const USUARIO = 'usuario-1';

function montar() {
  const almacen = crearAlmacenEnMemoria();
  const servidor = crearServidorEnMemoria();
  const motor = crearMotorSincronizacion({
    almacen,
    remoto: servidor,
    usuarioId: USUARIO,
    dispositivoId: 'dispositivo-1',
  });
  const derivadas = derivarClaves(generarClaveMaestra());
  const clave = crearClaveContenido('oracion');

  return {
    almacen,
    servidor,
    motor,
    repositorio: crearRepositorioOracion({
      motor,
      almacen,
      usuarioId: USUARIO,
      claveOracion: () => clave,
      claveHash: () => derivadas.claveHash,
      ahora: () => '2026-08-02T10:00:00.000Z',
    }),
  };
}

const BORRADOR = {
  titulo: 'Por la salud de Marta',
  detalle: 'Lleva semanas con dolores y mañana tiene consulta.',
  personas: ['Marta Ruiz', 'su madre'],
  categoria: 'salud' as const,
};

describe('privacidad', () => {
  it('ni el texto ni los nombres salen del sobre', async () => {
    // Los nombres son de terceros que nunca dieron su consentimiento para
    // aparecer en un servidor. Es lo más delicado del módulo.
    const { repositorio, almacen } = montar();

    const guardada = await repositorio.guardar(BORRADOR);
    const crudo = JSON.stringify(await almacen.obtener(TIPO_PETICION, guardada.id));

    expect(crudo).not.toContain('Marta Ruiz');
    expect(crudo).not.toContain('dolores');
    expect(crudo).not.toContain('Por la salud');
  });

  it('el estado y la categoría sí viajan en claro, y deben', async () => {
    // El servidor los necesita para los recordatorios y para no descargar
    // toda la vida de oración de alguien en cada sincronización.
    const { repositorio, almacen } = montar();

    const guardada = await repositorio.guardar(BORRADOR);
    const registro = await almacen.obtener(TIPO_PETICION, guardada.id);

    expect(registro?.metadatos).toMatchObject({
      status: 'active',
      category_code: 'salud',
      visibility: 'private',
    });
  });

  it('una petición nace privada, nunca compartida por defecto', async () => {
    const { repositorio, almacen } = montar();

    const guardada = await repositorio.guardar(BORRADOR);

    expect((await almacen.obtener(TIPO_PETICION, guardada.id))?.metadatos.visibility).toBe(
      'private',
    );
  });
});

describe('ciclo de vida', () => {
  it('marcar respondida conserva la petición y anota la fecha', async () => {
    const { repositorio } = montar();
    const original = await repositorio.guardar(BORRADOR);

    const respondida = await repositorio.cambiarEstado(original.id, 'answered');

    expect(respondida?.estado).toBe('answered');
    expect(respondida?.respondidaEn).toBe('2026-08-02T10:00:00.000Z');
    // Sigue ahí y con su contenido intacto: sin el recorrido no hay memorial.
    expect(respondida?.titulo).toBe(BORRADOR.titulo);
    expect((await repositorio.listar()).peticiones).toHaveLength(1);
  });

  it('archivar la saca de la vida activa sin borrarla', async () => {
    const { repositorio } = montar();
    const original = await repositorio.guardar(BORRADOR);

    const archivada = await repositorio.cambiarEstado(original.id, 'archived');

    expect(archivada?.estado).toBe('archived');
    expect(archivada?.archivadaEn).not.toBeNull();
  });

  it('reactivar limpia las fechas de respuesta y archivo', async () => {
    const { repositorio } = montar();
    const original = await repositorio.guardar(BORRADOR);
    await repositorio.cambiarEstado(original.id, 'answered');

    const activa = await repositorio.cambiarEstado(original.id, 'active');

    expect(activa?.estado).toBe('active');
    expect(activa?.respondidaEn).toBeNull();
  });

  it('editar el texto no cambia el estado', async () => {
    // Responder y archivar son decisiones distintas de corregir una falta.
    const { repositorio } = montar();
    const original = await repositorio.guardar(BORRADOR);
    await repositorio.cambiarEstado(original.id, 'answered');

    const editada = await repositorio.guardar({ ...BORRADOR, id: original.id, detalle: 'Otro' });

    expect(editada.estado).toBe('answered');
  });

  it('las activas se listan antes que las respondidas y archivadas', async () => {
    const { repositorio } = montar();
    const primera = await repositorio.guardar({ ...BORRADOR, titulo: 'Respondida' });
    await repositorio.cambiarEstado(primera.id, 'answered');
    await repositorio.guardar({ ...BORRADOR, titulo: 'Activa' });

    const { peticiones } = await repositorio.listar();

    expect(peticiones.map((p) => p.titulo)).toEqual(['Activa', 'Respondida']);
  });
});

describe('avances', () => {
  it('se guardan aparte, cifrados y atados a su petición', async () => {
    const { repositorio, almacen } = montar();
    const peticion = await repositorio.guardar(BORRADOR);

    const avance = await repositorio.anotarAvance(peticion.id, 'Hoy salió bien la consulta.');

    expect(avance.peticionId).toBe(peticion.id);
    const registro = await almacen.obtener(TIPO_AVANCE, avance.id);
    expect(JSON.stringify(registro)).not.toContain('consulta');
    expect(registro?.metadatos.prayer_id).toBe(peticion.id);
  });

  it('se leen del más reciente al más antiguo', async () => {
    const { repositorio } = montar();
    const peticion = await repositorio.guardar(BORRADOR);
    await repositorio.anotarAvance(peticion.id, 'Primero');
    await repositorio.anotarAvance(peticion.id, 'Segundo');

    const avances = await repositorio.listarAvances(peticion.id);

    expect(avances).toHaveLength(2);
    expect(avances.map((a) => a.texto)).toContain('Segundo');
  });

  it('no mezcla los avances de dos peticiones', async () => {
    const { repositorio } = montar();
    const una = await repositorio.guardar(BORRADOR);
    const otra = await repositorio.guardar({ ...BORRADOR, titulo: 'Otra' });
    await repositorio.anotarAvance(una.id, 'De la primera');
    await repositorio.anotarAvance(otra.id, 'De la segunda');

    const avances = await repositorio.listarAvances(una.id);

    expect(avances).toHaveLength(1);
    expect(avances[0]?.texto).toBe('De la primera');
  });
});

describe('sincronización', () => {
  it('el servidor recibe peticiones y avances sin ver una palabra', async () => {
    const { repositorio, motor, servidor } = montar();
    const peticion = await repositorio.guardar(BORRADOR);
    await repositorio.anotarAvance(peticion.id, 'Hoy hubo buenas noticias.');

    await motor.sincronizar();

    expect(servidor.filas()).toHaveLength(2);
    const crudo = JSON.stringify(servidor.filas());
    expect(crudo).not.toContain('Marta');
    expect(crudo).not.toContain('noticias');
    expect(crudo).toContain('salud');
  });
});

describe('lecturas ilegibles', () => {
  it('se cuentan en vez de esconderse', async () => {
    const { repositorio, almacen, motor } = montar();
    await repositorio.guardar(BORRADOR);

    const otro = crearRepositorioOracion({
      motor,
      almacen,
      usuarioId: USUARIO,
      claveOracion: () => crearClaveContenido('oracion'),
      claveHash: () => derivarClaves(generarClaveMaestra()).claveHash,
    });

    expect((await otro.listar()).ilegibles).toBe(1);
  });
});
