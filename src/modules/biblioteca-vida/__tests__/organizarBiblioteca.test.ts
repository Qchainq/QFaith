// Las dos reglas del módulo: no se copia contenido y reclasificar actualiza
// en lugar de acumular.
import { crearAlmacenEnMemoria } from '@shared/database/almacenEnMemoria';
import {
  crearClaveContenido,
  derivarClaves,
  generarClaveMaestra,
} from '@shared/services/crypto/servicioCriptografia';
import { crearMotorSincronizacion } from '@shared/services/sync/motorSincronizacion';
import { crearServidorEnMemoria } from '@shared/services/sync/__tests__/servidorEnMemoria';

import type { Aportacion, FuenteBiblioteca } from '../models/biblioteca';
import { crearRepositorioBiblioteca, TIPO_ELEMENTO } from '../repositories/repositorioBiblioteca';
import { identificadorDeFicha, organizar } from '../use-cases/organizarBiblioteca';

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
  const clave = crearClaveContenido('bibliotecaVida');

  return {
    almacen,
    servidor,
    motor,
    repositorio: crearRepositorioBiblioteca({
      motor,
      almacen,
      usuarioId: USUARIO,
      claveBiblioteca: () => clave,
      claveHash: () => derivadas.claveHash,
    }),
  };
}

const fuente = (aportaciones: readonly Aportacion[]): FuenteBiblioteca => ({
  aportaciones: async () => aportaciones,
});

const ENTRADA: Aportacion = {
  origen: 'diario',
  origenId: '11111111-1111-4111-8111-111111111111',
  titulo: 'Gratitud de hoy',
  texto: 'Con mi familia sentí mucho gozo. '.repeat(20),
  ocurridoEn: '2026-08-02T10:00:00.000Z',
};

describe('no se copia contenido', () => {
  it('guarda un resumen corto, no el texto completo', async () => {
    const { repositorio } = montar();

    await organizar(repositorio, [fuente([ENTRADA])]);

    const { elementos } = await repositorio.listar();
    expect(elementos[0]?.resumen.length).toBeLessThanOrEqual(160);
    expect(elementos[0]?.resumen.length).toBeLessThan(ENTRADA.texto.length);
  });

  it('el resumen tampoco sale en claro del dispositivo', async () => {
    const { repositorio, almacen } = montar();

    await organizar(repositorio, [fuente([ENTRADA])]);

    const registros = await almacen.listar(TIPO_ELEMENTO);
    const crudo = JSON.stringify(registros);
    expect(crudo).not.toContain('familia');
    expect(crudo).not.toContain('Gratitud');
    // La referencia al registro de origen sí: el servidor ya lo conocía.
    expect(crudo).toContain(ENTRADA.origenId);
  });

  it('clasifica en temas a partir del texto descifrado', async () => {
    const { repositorio } = montar();

    await organizar(repositorio, [fuente([ENTRADA])]);

    const { elementos } = await repositorio.listar();
    expect(elementos[0]?.temas).toEqual(expect.arrayContaining(['familia', 'gozo']));
  });
});

describe('reclasificar', () => {
  it('pasar el organizador dos veces no duplica nada', async () => {
    const { repositorio } = montar();

    await organizar(repositorio, [fuente([ENTRADA])]);
    await organizar(repositorio, [fuente([ENTRADA])]);

    expect((await repositorio.listar()).elementos).toHaveLength(1);
  });

  it('el identificador de la ficha es estable entre dispositivos', async () => {
    // Dos dispositivos calculan el mismo identificador sin coordinarse, que
    // es lo que evita duplicar la ficha al sincronizar.
    expect(identificadorDeFicha('diario', ENTRADA.origenId)).toBe(
      identificadorDeFicha('diario', ENTRADA.origenId),
    );
    expect(identificadorDeFicha('diario', ENTRADA.origenId)).not.toBe(
      identificadorDeFicha('oracion', ENTRADA.origenId),
    );
  });

  it('actualiza la ficha cuando el original cambia', async () => {
    const { repositorio } = montar();
    await organizar(repositorio, [fuente([ENTRADA])]);

    await organizar(repositorio, [fuente([{ ...ENTRADA, titulo: 'Título corregido' }])]);

    const { elementos } = await repositorio.listar();
    expect(elementos).toHaveLength(1);
    expect(elementos[0]?.titulo).toBe('Título corregido');
  });
});

describe('originales que desaparecen', () => {
  it('retira la ficha cuyo registro de origen ya no está', async () => {
    // Si alguien borró una entrada del diario, su rastro en la Biblioteca
    // tiene que irse también: dejarlo sería una copia por la puerta de atrás.
    const { repositorio } = montar();
    await organizar(repositorio, [fuente([ENTRADA])]);

    const resumen = await organizar(repositorio, [fuente([])]);

    expect(resumen.retirados).toBe(1);
    expect((await repositorio.listar()).elementos).toHaveLength(0);
  });
});

describe('varias fuentes', () => {
  it('compone lo que publica cada módulo sin que se conozcan entre sí', async () => {
    const { repositorio } = montar();
    const peticion: Aportacion = {
      origen: 'oracion',
      origenId: '22222222-2222-4222-8222-222222222222',
      titulo: 'Por la salud de Marta',
      texto: 'Tengo miedo de lo que digan mañana.',
      ocurridoEn: '2026-08-01T10:00:00.000Z',
    };

    await organizar(repositorio, [fuente([ENTRADA]), fuente([peticion])]);

    const { elementos } = await repositorio.listar();
    expect(elementos.map((elemento) => elemento.origen).sort()).toEqual(['diario', 'oracion']);
    // Y cada una se clasifica por su cuenta.
    expect(elementos.find((elemento) => elemento.origen === 'oracion')?.temas).toContain(
      'ansiedad',
    );
  });

  it('ordena por cronología, de lo más reciente a lo más antiguo', async () => {
    const { repositorio } = montar();
    const antigua: Aportacion = {
      ...ENTRADA,
      origenId: '33333333-3333-4333-8333-333333333333',
      titulo: 'Antigua',
      ocurridoEn: '2026-01-01T10:00:00.000Z',
    };

    await organizar(repositorio, [fuente([antigua, ENTRADA])]);

    const { elementos } = await repositorio.listar();
    expect(elementos[0]?.titulo).toBe('Gratitud de hoy');
  });
});
