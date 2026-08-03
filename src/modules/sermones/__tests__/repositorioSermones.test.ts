// Frontera entre el texto y el sobre, con el cifrado y el motor de verdad.
//
// Lo propio de este módulo: la nota es privada aunque el sermón sea público,
// y la fecha de una acción viaja en claro mientras su texto no.
import { crearAlmacenEnMemoria } from '@shared/database/almacenEnMemoria';
import {
  crearClaveContenido,
  derivarClaves,
  generarClaveMaestra,
} from '@shared/services/crypto/servicioCriptografia';
import { crearMotorSincronizacion } from '@shared/services/sync/motorSincronizacion';
import {
  crearServidorEnMemoria,
  type ServidorEnMemoria,
} from '@shared/services/sync/__tests__/servidorEnMemoria';

import {
  crearRepositorioSermones,
  TIPO_ACCION,
  TIPO_NOTA,
} from '../repositories/repositorioNotasSermon';

const USUARIO = 'usuario-1';

function montar() {
  const almacen = crearAlmacenEnMemoria();
  const servidor: ServidorEnMemoria = crearServidorEnMemoria();
  const motor = crearMotorSincronizacion({
    almacen,
    remoto: servidor,
    usuarioId: USUARIO,
    dispositivoId: 'dispositivo-1',
  });
  const derivadas = derivarClaves(generarClaveMaestra());
  const clave = crearClaveContenido('notaSermon');

  return {
    almacen,
    servidor,
    motor,
    repositorio: crearRepositorioSermones({
      motor,
      almacen,
      usuarioId: USUARIO,
      claveSermon: () => clave,
      claveHash: () => derivadas.claveHash,
    }),
  };
}

const NOTA = {
  texto: 'Esto va por mí. Tengo que hablar con mi hermano esta semana.',
  destacados: ['El perdón no es olvidar'],
  sermonId: 'sermon-1',
};

describe('notas', () => {
  it('el texto vuelve entero después de pasar por el sobre', async () => {
    const { repositorio } = montar();

    const guardada = await repositorio.guardarNota(NOTA);

    expect(guardada.texto).toBe(NOTA.texto);
    expect(guardada.destacados).toEqual(NOTA.destacados);
    expect(guardada.sermonId).toBe('sermon-1');
  });

  it('el servidor no ve nada de lo anotado, ni siquiera el destacado', async () => {
    const { repositorio, motor, servidor } = montar();
    await repositorio.guardarNota(NOTA);

    await motor.sincronizar();

    const crudo = JSON.stringify(servidor.filas());
    expect(crudo).not.toContain('hermano');
    expect(crudo).not.toContain('perdón');
    // Sí ve de qué sermón es: lo necesita para poder agruparlas sin descifrar.
    expect(crudo).toContain('sermon-1');
  });

  it('una nota suelta no necesita sermón', async () => {
    const { repositorio } = montar();

    const guardada = await repositorio.guardarNota({
      texto: 'Un apunte sin sermón',
      destacados: [],
    });

    expect(guardada.sermonId).toBeNull();
  });

  it('editar el texto no pierde el sermón de origen', async () => {
    const { repositorio } = montar();
    const creada = await repositorio.guardarNota(NOTA);

    const editada = await repositorio.guardarNota({
      id: creada.id,
      texto: 'Otra cosa',
      destacados: [],
    });

    expect(editada.sermonId).toBe('sermon-1');
  });

  it('una nota ilegible se cuenta, no se pierde en silencio', async () => {
    const { almacen, repositorio } = montar();
    const rota = await repositorio.guardarNota(NOTA);
    await repositorio.guardarNota({ texto: 'Esta sí se lee', destacados: [] });

    const registro = await almacen.obtener(TIPO_NOTA, rota.id);
    await almacen.guardar({
      ...registro!,
      sobre: { ...registro!.sobre, encryptedPayload: 'ZGF0b3MtcXVlLW5vLWFicmVu' },
    });

    const { notas, ilegibles } = await repositorio.listarNotas();
    expect(notas).toHaveLength(1);
    expect(ilegibles).toBe(1);
  });
});

describe('acciones', () => {
  it('la fecha viaja en claro y el texto no', async () => {
    const { repositorio, motor, servidor } = montar();

    await repositorio.guardarAccion({
      texto: 'Llamar a mi hermano',
      fechaLimite: '2026-09-05',
    });
    await motor.sincronizar();

    const crudo = JSON.stringify(servidor.filas());
    // La fecha la necesita el recordatorio para saber cuándo sonar.
    expect(crudo).toContain('2026-09-05');
    // El texto dice a quién y para qué. Eso no sale.
    expect(crudo).not.toContain('hermano');
  });

  it('marcar y desmarcar no vuelve a cifrar el texto', async () => {
    const { almacen, repositorio } = montar();
    const creada = await repositorio.guardarAccion({ texto: 'Servir el domingo' });
    const sobreOriginal = (await almacen.obtener(TIPO_ACCION, creada.id))?.sobre;

    const hecha = await repositorio.alternarHecha(creada.id, '2026-09-01T10:00:00.000Z');
    expect(hecha?.completadaEn).toBe('2026-09-01T10:00:00.000Z');
    expect(hecha?.texto).toBe('Servir el domingo');
    expect((await almacen.obtener(TIPO_ACCION, creada.id))?.sobre).toEqual(sobreOriginal);
  });

  it('se puede desmarcar: un propósito no es una deuda', async () => {
    // Un estado que solo avanza convertiría «me lo propuse» en «te lo debo».
    const { repositorio } = montar();
    const creada = await repositorio.guardarAccion({ texto: 'Ayunar el viernes' });

    await repositorio.alternarHecha(creada.id, '2026-09-01T10:00:00.000Z');
    const otraVez = await repositorio.alternarHecha(creada.id, '2026-09-02T10:00:00.000Z');

    expect(otraVez?.completadaEn).toBeNull();
  });

  it('editar el texto no marca ni desmarca por su cuenta', async () => {
    const { repositorio } = montar();
    const creada = await repositorio.guardarAccion({ texto: 'Original' });
    await repositorio.alternarHecha(creada.id, '2026-09-01T10:00:00.000Z');

    const editada = await repositorio.guardarAccion({ id: creada.id, texto: 'Corregido' });

    expect(editada.texto).toBe('Corregido');
    expect(editada.completadaEn).toBe('2026-09-01T10:00:00.000Z');
  });

  it('alternar una acción que no existe devuelve null en vez de romper', async () => {
    const { repositorio } = montar();
    expect(await repositorio.alternarHecha('no-existe', '2026-09-01T10:00:00.000Z')).toBeNull();
  });
});
