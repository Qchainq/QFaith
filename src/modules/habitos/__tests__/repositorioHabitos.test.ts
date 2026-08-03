// Frontera entre el texto y el sobre, con el cifrado y el motor de verdad.
// Lo propio de este módulo: marcar un día es idempotente y no existe forma de
// registrar un día fallado.
import { crearAlmacenEnMemoria } from '@shared/database/almacenEnMemoria';
import {
  crearClaveContenido,
  derivarClaves,
  generarClaveMaestra,
} from '@shared/services/crypto/servicioCriptografia';
import { crearMotorSincronizacion } from '@shared/services/sync/motorSincronizacion';
import { crearServidorEnMemoria } from '@shared/services/sync/__tests__/servidorEnMemoria';

import {
  crearRepositorioHabitos,
  TIPO_HABITO,
  TIPO_REGISTRO,
} from '../repositories/repositorioHabitos';

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
  const clave = crearClaveContenido('habito');

  return {
    almacen,
    servidor,
    motor,
    repositorio: crearRepositorioHabitos({
      motor,
      almacen,
      usuarioId: USUARIO,
      claveHabito: () => clave,
      claveHash: () => derivadas.claveHash,
      ahora: () => '2026-08-02T10:00:00.000Z',
    }),
  };
}

const BORRADOR = {
  titulo: 'Volver a hablar con mi padre',
  descripcion: 'Aunque sea un mensaje corto.',
  categoria: 'comunidad' as const,
  frecuencia: 'daily' as const,
  configuracion: { dias: [1, 3, 5] },
  fechaInicio: '2026-08-01',
};

describe('privacidad', () => {
  it('el título y la descripción no salen del sobre', async () => {
    // Un hábito puede ser «dejar de beber». No es una lista de tareas neutra.
    const { repositorio, almacen } = montar();

    const habito = await repositorio.guardar(BORRADOR);
    const crudo = JSON.stringify(await almacen.obtener(TIPO_HABITO, habito.id));

    expect(crudo).not.toContain('mi padre');
    expect(crudo).not.toContain('mensaje corto');
  });

  it('la configuración de repetición sí viaja en claro: no describe el hábito', async () => {
    const { repositorio, almacen } = montar();

    const habito = await repositorio.guardar(BORRADOR);
    const registro = await almacen.obtener(TIPO_HABITO, habito.id);

    expect(registro?.metadatos.schedule_config).toEqual({ dias: [1, 3, 5] });
    expect(registro?.metadatos.category_code).toBe('comunidad');
  });

  it('la nota de un día tampoco sale en claro', async () => {
    const { repositorio, almacen } = montar();
    const habito = await repositorio.guardar(BORRADOR);

    const registro = await repositorio.marcarCumplido({
      habitoId: habito.id,
      fecha: '2026-08-02',
      nota: 'Hoy costó pero salió',
    });

    const crudo = JSON.stringify(await almacen.obtener(TIPO_REGISTRO, registro.id));
    expect(crudo).not.toContain('costó');
    expect(crudo).toContain('2026-08-02');
  });
});

describe('marcar el día', () => {
  it('es idempotente: marcarlo dos veces no crea dos registros', async () => {
    // El esquema tiene una restricción única por (hábito, día). Dos
    // dispositivos sin conexión chocarían con ella y el recuento saldría
    // doblado.
    const { repositorio } = montar();
    const habito = await repositorio.guardar(BORRADOR);

    const primero = await repositorio.marcarCumplido({ habitoId: habito.id, fecha: '2026-08-02' });
    const segundo = await repositorio.marcarCumplido({ habitoId: habito.id, fecha: '2026-08-02' });

    expect(segundo.id).toBe(primero.id);
    expect(await repositorio.diasCumplidos(habito.id)).toEqual(['2026-08-02']);
  });

  it('deshacer retira el registro, no anota un fallo', async () => {
    // No existe fila para un día no cumplido, así que no hay forma de
    // construir una racha punitiva a partir de estos datos.
    const { repositorio } = montar();
    const habito = await repositorio.guardar(BORRADOR);
    await repositorio.marcarCumplido({ habitoId: habito.id, fecha: '2026-08-02' });

    await repositorio.deshacerCumplido(habito.id, '2026-08-02');

    expect(await repositorio.diasCumplidos(habito.id)).toEqual([]);
  });

  it('deshacer un día que no estaba marcado no rompe nada', async () => {
    const { repositorio } = montar();
    const habito = await repositorio.guardar(BORRADOR);

    await expect(repositorio.deshacerCumplido(habito.id, '2026-07-01')).resolves.toBeUndefined();
  });

  it('no mezcla los días de dos hábitos', async () => {
    const { repositorio } = montar();
    const uno = await repositorio.guardar(BORRADOR);
    const otro = await repositorio.guardar({ ...BORRADOR, titulo: 'Otro' });
    await repositorio.marcarCumplido({ habitoId: uno.id, fecha: '2026-08-02' });

    expect(await repositorio.diasCumplidos(otro.id)).toEqual([]);
  });
});

describe('lista', () => {
  it('los activos van antes que los pausados', async () => {
    const { repositorio } = montar();
    await repositorio.guardar({ ...BORRADOR, titulo: 'Pausado', activo: false });
    await repositorio.guardar({ ...BORRADOR, titulo: 'Activo' });

    const { habitos } = await repositorio.listar();

    expect(habitos.map((habito) => habito.titulo)).toEqual(['Activo', 'Pausado']);
  });

  it('cuenta los que este dispositivo no puede abrir', async () => {
    const { repositorio, almacen, motor } = montar();
    await repositorio.guardar(BORRADOR);

    const otro = crearRepositorioHabitos({
      motor,
      almacen,
      usuarioId: USUARIO,
      claveHabito: () => crearClaveContenido('habito'),
      claveHash: () => derivarClaves(generarClaveMaestra()).claveHash,
    });

    expect((await otro.listar()).ilegibles).toBe(1);
  });
});

describe('sincronización', () => {
  it('el servidor recibe hábitos y días sin ver una palabra', async () => {
    const { repositorio, motor, servidor } = montar();
    const habito = await repositorio.guardar(BORRADOR);
    await repositorio.marcarCumplido({ habitoId: habito.id, fecha: '2026-08-02', nota: 'bien' });

    await motor.sincronizar();

    expect(servidor.filas()).toHaveLength(2);
    const crudo = JSON.stringify(servidor.filas());
    expect(crudo).not.toContain('mi padre');
    expect(crudo).toContain('comunidad');
  });
});
