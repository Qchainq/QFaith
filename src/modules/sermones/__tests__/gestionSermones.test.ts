// Casos de uso de Sermones: validación, composición y orden.
import type { FilaSermon } from '@shared/services/supabase/repositorioIglesia';

import { pendientesPrimero, type AccionSermon, type NotaSermon } from '../models/sermon';
import { aSermon, componer, sueltas } from '../use-cases/gestionSermones';

const accion = (
  id: string,
  fechaLimite: string | null,
  completadaEn: string | null = null,
): AccionSermon => ({
  id,
  notaId: null,
  texto: id,
  fechaLimite,
  completadaEn,
  recordatorio: false,
});

const nota = (id: string, sermonId: string | null): NotaSermon => ({
  id,
  sermonId,
  texto: id,
  destacados: [],
  creadaEn: '2026-08-01T00:00:00.000Z',
  actualizadaEn: '2026-08-01T00:00:00.000Z',
});

describe('orden de las acciones', () => {
  it('lo más urgente primero', () => {
    const orden = pendientesPrimero([
      accion('tarde', '2026-12-01'),
      accion('pronto', '2026-09-01'),
    ]);

    expect(orden.map((a) => a.id)).toEqual(['pronto', 'tarde']);
  });

  // Se prueban los dos órdenes de entrada a propósito. El comparador tiene dos
  // ramas simétricas —«a no tiene fecha» y «b no tiene fecha»— y con una sola
  // disposición la ordenación solo llega a una de ellas: romper la otra
  // pasaría desapercibido.
  it.each([
    ['la que no tiene fecha primero', ['sin-fecha', 'con-fecha']],
    ['la que no tiene fecha después', ['con-fecha', 'sin-fecha']],
  ])('las que no tienen fecha van al final, entrando con %s', (_caso, entrada) => {
    // Colarlas delante haría que lo indefinido pareciera lo más urgente, que
    // es justo al revés.
    const orden = pendientesPrimero(
      entrada.map((id) => accion(id, id === 'sin-fecha' ? null : '2026-12-01')),
    );

    expect(orden.map((a) => a.id)).toEqual(['con-fecha', 'sin-fecha']);
  });

  it('las hechas desaparecen de la lista: no se acumulan deudas', () => {
    const orden = pendientesPrimero([
      accion('hecha', '2026-09-01', '2026-09-02T10:00:00.000Z'),
      accion('pendiente', '2026-10-01'),
    ]);

    expect(orden.map((a) => a.id)).toEqual(['pendiente']);
  });
});

describe('composición', () => {
  it('cada sermón recoge solo sus propias notas', () => {
    const sermon = (id: string): FilaSermon => ({
      id,
      church_id: 'iglesia-1',
      title: id,
      speaker_name: null,
      sermon_date: null,
      public_summary: null,
      bible_references: null,
      audio_path: null,
      video_url: null,
      publication_status: 'published',
    });

    const compuesto = componer(
      [aSermon(sermon('s1')), aSermon(sermon('s2'))],
      [nota('n1', 's1'), nota('n2', 's2'), nota('n3', null)],
    );

    expect(compuesto[0]?.notas.map((n) => n.id)).toEqual(['n1']);
    expect(compuesto[1]?.notas.map((n) => n.id)).toEqual(['n2']);
  });

  it('las notas sueltas no se pierden por no tener sermón', () => {
    expect(sueltas([nota('n1', 's1'), nota('n3', null)]).map((n) => n.id)).toEqual(['n3']);
  });
});

describe('lectura de un sermón', () => {
  const base: FilaSermon = {
    id: 's1',
    church_id: 'iglesia-1',
    title: 'Sobre el perdón',
    speaker_name: 'Pablo',
    sermon_date: '2026-08-30',
    public_summary: 'Mateo 18.',
    bible_references: ['Mateo 18:21-35', 42, null],
    audio_path: null,
    video_url: null,
    publication_status: 'published',
  };

  it('de las referencias solo se aceptan cadenas', () => {
    // El campo es JSON libre en el esquema; lo que llegue mal no puede acabar
    // pintándose como si fuera una referencia bíblica.
    expect(aSermon(base).referencias).toEqual(['Mateo 18:21-35']);
  });

  it('un estado desconocido se lee como borrador, no como publicado', () => {
    // Ante la duda, no se enseña.
    expect(aSermon({ ...base, publication_status: 'inventado' }).estado).toBe('draft');
  });

  it('unas referencias que no son lista no rompen nada', () => {
    expect(aSermon({ ...base, bible_references: 'Mateo 18' }).referencias).toEqual([]);
  });
});
