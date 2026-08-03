// Casos de uso del Memorial: validación, cronología y el puente desde una
// oración respondida.
import { crearAlmacenEnMemoria } from '@shared/database/almacenEnMemoria';
import {
  crearClaveContenido,
  derivarClaves,
  generarClaveMaestra,
} from '@shared/services/crypto/servicioCriptografia';
import { crearMotorSincronizacion } from '@shared/services/sync/motorSincronizacion';
import { crearServidorEnMemoria } from '@shared/services/sync/__tests__/servidorEnMemoria';

import type { Peticion } from '@modules/oracion/models/peticion';

import type { Memorial } from '../models/memorial';
import { crearRepositorioMemorial } from '../repositories/repositorioMemorial';
import {
  borradorDesdePeticion,
  guardarMemorial,
  listarMemoriales,
  porAno,
  soloFavoritos,
} from '../use-cases/gestionMemoriales';

const USUARIO = 'usuario-1';

function montar() {
  const almacen = crearAlmacenEnMemoria();
  const derivadas = derivarClaves(generarClaveMaestra());
  const clave = crearClaveContenido('memorial');

  return crearRepositorioMemorial({
    almacen,
    usuarioId: USUARIO,
    motor: crearMotorSincronizacion({
      almacen,
      remoto: crearServidorEnMemoria(),
      usuarioId: USUARIO,
      dispositivoId: 'dispositivo-1',
    }),
    claveMemorial: () => clave,
    claveHash: () => derivadas.claveHash,
  });
}

const BASE = { titulo: 'Encontré trabajo', relato: 'Llamaron un martes.', personas: [] };

describe('validación', () => {
  it('un memorial sin título se rechaza con un mensaje traducible', async () => {
    const repositorio = montar();

    await expect(guardarMemorial(repositorio, { ...BASE, titulo: '   ' })).rejects.toMatchObject({
      claveMensaje: 'memorial.errores.tituloVacio',
    });

    expect((await listarMemoriales(repositorio)).memoriales).toHaveLength(0);
  });

  it('una fecha con otra forma se rechaza antes de cifrar nada', async () => {
    const repositorio = montar();

    await expect(
      guardarMemorial(repositorio, { ...BASE, ocurrioEl: '14 de marzo' }),
    ).rejects.toMatchObject({ claveMensaje: 'memorial.errores.fechaInvalida' });
  });

  it('los nombres repetidos y los espacios sueltos se limpian', async () => {
    const repositorio = montar();

    const guardado = await guardarMemorial(repositorio, {
      ...BASE,
      personas: ['  Ana ', 'Ana', '', '  ', 'Beto'],
    });

    expect(guardado.personas).toEqual(['Ana', 'Beto']);
  });
});

describe('desde una oración respondida', () => {
  const peticion: Peticion = {
    id: 'peticion-1',
    titulo: 'Por el trabajo de mi hermana',
    detalle: 'Lleva ocho meses buscando.',
    personas: ['Marta'],
    estado: 'answered',
    categoria: 'familia',
    recordatorioActivo: false,
    proximoRecordatorio: null,
    respondidaEn: '2026-04-02T09:30:00.000Z',
    archivadaEn: null,
    creadaEn: '2025-08-01T10:00:00.000Z',
    actualizadaEn: '2026-04-02T09:30:00.000Z',
  };

  it('trae título, personas y el día de la respuesta', () => {
    const borrador = borradorDesdePeticion(peticion);

    expect(borrador.peticionId).toBe('peticion-1');
    expect(borrador.titulo).toBe('Por el trabajo de mi hermana');
    expect(borrador.personas).toEqual(['Marta']);
    expect(borrador.ocurrioEl).toBe('2026-04-02');
  });

  it('deja el relato vacío: lo que falta contar es qué pasó', () => {
    // Rellenarlo con el detalle de la petición pondría en boca de la persona
    // algo que no dijo.
    expect(borradorDesdePeticion(peticion).relato).toBe('');
    expect(borradorDesdePeticion(peticion).relato).not.toContain('ocho meses');
  });

  it('una petición sin fecha de respuesta no inventa un día', () => {
    expect(borradorDesdePeticion({ ...peticion, respondidaEn: null }).ocurrioEl).toBeNull();
  });

  it('es una copia, no un vínculo: editar el memorial no depende de la petición', async () => {
    const repositorio = montar();
    const guardado = await guardarMemorial(repositorio, {
      ...borradorDesdePeticion(peticion),
      relato: 'La llamaron el jueves.',
    });

    expect(guardado.peticionId).toBe('peticion-1');
    expect(guardado.relato).toBe('La llamaron el jueves.');
  });
});

describe('cronología por años', () => {
  const memorial = (id: string, ocurrioEl: string | null, favorito = false): Memorial => ({
    id,
    titulo: id,
    relato: '',
    personas: [],
    peticionId: null,
    ocurrioEl,
    favorito,
    creadoEn: '2026-01-01T00:00:00.000Z',
    actualizadoEn: '2026-01-01T00:00:00.000Z',
  });

  it('agrupa por año, del más reciente al más antiguo', () => {
    const tramos = porAno([
      memorial('a', '2026-05-01'),
      memorial('b', '2024-02-02'),
      memorial('c', '2026-01-01'),
    ]);

    expect(tramos.map((tramo) => tramo.ano)).toEqual(['2026', '2024']);
    expect(tramos[0]?.memoriales.map((m) => m.id)).toEqual(['a', 'c']);
  });

  it('los que no tienen fecha van en su propio tramo, al final', () => {
    const tramos = porAno([memorial('sin', null), memorial('con', '2026-05-01')]);

    expect(tramos.map((tramo) => tramo.ano)).toEqual(['2026', null]);
    // No se cuelan en el año en curso: sería inventarle un recuerdo a alguien.
    expect(tramos[1]?.memoriales.map((m) => m.id)).toEqual(['sin']);
  });

  it('sin memoriales sin fecha no aparece el tramo vacío', () => {
    expect(porAno([memorial('a', '2026-05-01')]).map((tramo) => tramo.ano)).toEqual(['2026']);
  });

  it('el filtro de favoritos es real, no decorativo', () => {
    const lista = [memorial('a', '2026-01-01', true), memorial('b', '2026-01-02')];

    expect(soloFavoritos(lista, true).map((m) => m.id)).toEqual(['a']);
    expect(soloFavoritos(lista, false)).toHaveLength(2);
  });
});
