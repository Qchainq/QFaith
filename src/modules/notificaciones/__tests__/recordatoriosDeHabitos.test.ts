// La traducción de hábitos a recordatorios.
//
// Lo que más importa aquí no es lo que se programa sino **lo que no viaja**:
// un hábito puede llamarse «dejar de beber» o «llamar a mi madre», y eso no
// aparece en la pantalla bloqueada de nadie por muy útil que resultara.
import type { Habito } from '@modules/habitos/models/habito';

import { recordatoriosDeHabitos } from '../use-cases/recordatoriosDeHabitos';

/** Un título del tipo que la gente pone de verdad, y que no puede salir. */
const TITULO = 'Dejar de beber';

const BASE: Habito = {
  id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
  titulo: TITULO,
  descripcion: 'Llamar a mi padrino cuando lo necesite',
  categoria: null,
  frecuencia: 'daily',
  configuracion: { dias: [] },
  fechaInicio: '2026-01-01',
  fechaFin: null,
  recordatorioActivo: true,
  horaRecordatorio: '07:30',
  activo: true,
  creadoEn: '2026-01-01T00:00:00.000Z',
  actualizadoEn: '2026-01-01T00:00:00.000Z',
};

const con = (cambios: Partial<Habito>): Habito => ({ ...BASE, ...cambios });

describe('qué se convierte en recordatorio', () => {
  it('un hábito activo con hora', () => {
    const [pedido] = recordatoriosDeHabitos([BASE]);

    expect(pedido?.entidadId).toBe(BASE.id);
    expect(pedido?.categoria).toBe('habito');
    expect(pedido?.recordatorio.minutoDelDia).toBe(7 * 60 + 30);
    expect(pedido?.ruta).toBe('Habitos');
  });

  it('uno sin recordatorio activo, no', () => {
    expect(recordatoriosDeHabitos([con({ recordatorioActivo: false })])).toHaveLength(0);
  });

  it('uno pausado, tampoco', () => {
    // Un hábito que alguien dejó a un lado y sigue avisando es de las cosas
    // que más rápido llevan a apagar las notificaciones enteras.
    expect(recordatoriosDeHabitos([con({ activo: false })])).toHaveLength(0);
  });

  it('uno sin hora, tampoco', () => {
    expect(recordatoriosDeHabitos([con({ horaRecordatorio: null })])).toHaveLength(0);
  });

  it('una hora mal escrita se salta sin llevarse los demás por delante', () => {
    const bueno = con({ id: '11111111-1111-4111-8111-111111111111' });

    const pedidos = recordatoriosDeHabitos([con({ horaRecordatorio: 'a las siete' }), bueno]);

    expect(pedidos).toHaveLength(1);
    expect(pedidos[0]?.entidadId).toBe(bueno.id);
  });
});

describe('lo que no viaja', () => {
  it('el recordatorio no lleva nada que la persona haya escrito', () => {
    // El hábito **sí** tiene título y descripción —«Dejar de beber», «Llamar
    // a mi padrino»— y son justo lo que no puede aparecer en la pantalla
    // bloqueada de un teléfono que está encima de una mesa.
    const pedidos = recordatoriosDeHabitos([BASE]);
    const crudo = JSON.stringify(pedidos);

    expect(crudo).not.toContain(TITULO);
    expect(crudo).not.toContain('padrino');
    expect(crudo).not.toContain('beber');
  });

  it('y no hay ningún campo por donde pudiera colarse', () => {
    // La otra mitad: aunque alguien quisiera pasarlo, `RecordatorioPedido` no
    // tiene dónde. La forma del tipo es la garantía; lo de arriba comprueba
    // que además nadie la ha rodeado.
    const pedidos = recordatoriosDeHabitos([BASE]);

    expect(Object.keys(pedidos[0] ?? {}).sort()).toEqual([
      'categoria',
      'entidadId',
      'recordatorio',
      'ruta',
    ]);
  });
});
