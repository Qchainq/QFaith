// Lo que se ve sin desbloquear, lo que viaja por push y qué se comprueba al
// abrir.
//
// Las tres cosas se prueban juntas porque son la misma pregunta vista desde
// tres sitios: qué puede enterarse alguien que coge este teléfono de la mesa.
import en from '@shared/i18n/locales/en.json';
import es from '@shared/i18n/locales/es.json';

import {
  claveDeMotivo,
  decidirApertura,
  llevaAContenidoPrivado,
  MOTIVOS,
  type EstadoApertura,
} from '../aperturaDeNotificacion';
import { esCargaValida, RUTAS, TIPOS_REMOTOS, type CargaRemota } from '../cargaRemota';
import { CLAVES_VISIBLES, contenidoVisible, DETALLE_POR_DEFECTO } from '../contenidoVisible';
import { CATEGORIAS } from '../politica';

/** Cosas que una persona escribe y que jamás deben salir del dispositivo. */
const PRIVADO = {
  peticion: 'Por la enfermedad de mi hermana Marta',
  diario: 'Llevo semanas con una ansiedad que no sé explicar',
  confesion: 'No he podido perdonar a mi padre',
};

const UUID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

// ── Lo que se ve en la pantalla bloqueada ────────────────────────────────

describe('la vista previa nace apagada', () => {
  it('el valor por defecto es el genérico', () => {
    // Privacidad por defecto. Quien nunca entre en los ajustes tiene el
    // comportamiento discreto, no el hablador.
    expect(DETALLE_POR_DEFECTO).toBe('generico');
  });

  it('apagada, ni siquiera se dice de qué módulo es', () => {
    // «Tu momento de oración» ya dice que esta persona reza y a qué hora. Con
    // la vista previa apagada eso tampoco sale.
    for (const categoria of CATEGORIAS) {
      if (categoria === 'seguridad') continue;
      const visible = contenidoVisible(categoria, 'generico');
      expect(visible.claveTitulo).toBe('notificaciones.visible.generico.titulo');
    }
  });

  it('encendida, nombra el área y nada más', () => {
    expect(contenidoVisible('oracion', 'area').claveTitulo).toBe(
      'notificaciones.visible.oracion.titulo',
    );
    expect(contenidoVisible('diario' as never, 'area').claveTitulo).toBe(
      'notificaciones.visible.generico.titulo',
    );
  });

  it('la seguridad se entiende con y sin vista previa', () => {
    // Un aviso de inicio de sesión sospechoso que dijera «tienes un
    // recordatorio» no serviría de nada, y no habla del contenido de nadie.
    for (const detalle of ['generico', 'area'] as const) {
      expect(contenidoVisible('seguridad', detalle).claveTitulo).toBe(
        'notificaciones.visible.seguridad.titulo',
      );
    }
  });

  it('una categoría que este archivo no conoce sale genérica', () => {
    // El valor seguro por defecto: un módulo nuevo empieza siendo discreto
    // hasta que alguien decida su texto a conciencia, no al revés.
    expect(contenidoVisible('inventada' as never, 'area')).toEqual(
      contenidoVisible('inventada' as never, 'generico'),
    );
  });
});

describe('los textos existen en los dos idiomas', () => {
  const leer = (json: unknown, clave: string): unknown =>
    clave.split('.').reduce<unknown>((nodo, parte) => {
      if (typeof nodo !== 'object' || nodo === null) return undefined;
      return (nodo as Record<string, unknown>)[parte];
    }, json);

  it.each(CLAVES_VISIBLES)('«%s» está traducida', (clave) => {
    // Una clave sin traducción sale en pantalla como «notificaciones.visible…»,
    // que además de feo revela la estructura interna.
    expect(typeof leer(es, clave)).toBe('string');
    expect(typeof leer(en, clave)).toBe('string');
  });

  it.each(MOTIVOS)('el motivo «%s» tiene texto', (motivo) => {
    expect(typeof leer(es, claveDeMotivo(motivo))).toBe('string');
    expect(typeof leer(en, claveDeMotivo(motivo))).toBe('string');
  });

  it('ningún texto visible tiene huecos donde interpolar algo', () => {
    // Sin huecos no hay forma de colar el nombre de nadie. Un `{{titulo}}` en
    // uno de estos textos sería la puerta de atrás de todo el archivo.
    for (const clave of CLAVES_VISIBLES) {
      expect(String(leer(es, clave))).not.toMatch(/\{\{|\}\}|%s|\$\{/);
      expect(String(leer(en, clave))).not.toMatch(/\{\{|\}\}|%s|\$\{/);
    }
  });
});

// ── Lo que viaja por push ────────────────────────────────────────────────

describe('la carga de un push remoto', () => {
  const CARGA: CargaRemota = {
    tipo: 'iglesia',
    entidadId: UUID,
    ruta: 'Iglesia',
    emitidoEn: '2026-08-08T10:00:00.000Z',
    prioridad: 'normal',
    firma: 'firma-del-servidor',
  };

  it('una carga correcta pasa', () => {
    expect(esCargaValida(CARGA)).toBe(true);
  });

  it('no admite ningún campo de más', () => {
    // Un push pasa por los servidores de Apple y de Google y se queda escrito
    // en sus registros. Lo que se cuele aquí no se puede retirar después.
    expect(esCargaValida({ ...CARGA, titulo: PRIVADO.peticion })).toBe(false);
    expect(esCargaValida({ ...CARGA, vistaPrevia: PRIVADO.diario })).toBe(false);
    expect(esCargaValida({ ...CARGA, nota: PRIVADO.confesion })).toBe(false);
  });

  it('el identificador tiene que ser opaco', () => {
    // Un UUID no dice nada de lo que hay dentro. Un título recortado sí, y un
    // hash del contenido convierte el push en un oráculo para comprobar si
    // alguien escribió una frase concreta.
    expect(esCargaValida({ ...CARGA, entidadId: PRIVADO.peticion })).toBe(false);
    expect(esCargaValida({ ...CARGA, entidadId: 'peticion-de-marta' })).toBe(false);
    expect(esCargaValida({ ...CARGA, entidadId: '' })).toBe(false);
  });

  it('la ruta sale de una lista cerrada', () => {
    // Una ruta libre que llegue de fuera es decirle a la aplicación adónde ir.
    expect(esCargaValida({ ...CARGA, ruta: 'PantallaSecreta' })).toBe(false);
    for (const ruta of RUTAS) {
      expect(esCargaValida({ ...CARGA, ruta })).toBe(true);
    }
  });

  it('el tipo sale de una lista cerrada', () => {
    expect(esCargaValida({ ...CARGA, tipo: 'diario' })).toBe(false);
    for (const tipo of TIPOS_REMOTOS) {
      expect(esCargaValida({ ...CARGA, tipo })).toBe(true);
    }
  });

  it('la marca temporal va en UTC', () => {
    // Una hora con desplazamiento local dice dónde está la persona.
    expect(esCargaValida({ ...CARGA, emitidoEn: '2026-08-08T12:00:00+02:00' })).toBe(false);
    expect(esCargaValida({ ...CARGA, emitidoEn: 'ayer por la tarde' })).toBe(false);
  });

  it('sin firma no se procesa', () => {
    expect(esCargaValida({ ...CARGA, firma: '' })).toBe(false);
    const { firma: _sin, ...sinFirma } = CARGA;
    expect(esCargaValida(sinFirma)).toBe(false);
  });

  it('lo que no es un objeto no es una carga', () => {
    expect(esCargaValida(null)).toBe(false);
    expect(esCargaValida(PRIVADO.diario)).toBe(false);
    expect(esCargaValida(undefined)).toBe(false);
  });
});

// ── Qué se comprueba al abrir ────────────────────────────────────────────

describe('abrir lo que una notificación señala', () => {
  const TODO_BIEN: EstadoApertura = {
    haySesion: true,
    dispositivoAutorizado: true,
    tienePermiso: true,
    recursoExiste: true,
    desbloqueada: true,
  };
  const con = (cambios: Partial<EstadoApertura>): EstadoApertura => ({ ...TODO_BIEN, ...cambios });

  it('con todo en orden, abre', () => {
    expect(decidirApertura({ categoria: 'oracion', estado: TODO_BIEN })).toEqual({
      abre: true,
      categoria: 'oracion',
    });
  });

  it('sin sesión no se abre nada', () => {
    expect(decidirApertura({ categoria: 'oracion', estado: con({ haySesion: false }) })).toEqual({
      abre: false,
      motivo: 'sinSesion',
    });
  });

  it('el orden importa: sin sesión no se llega a mirar si el recurso existe', () => {
    // Es la mitad de la regla. Responder «eso ya no existe» a quien no ha
    // iniciado sesión ya le ha dicho algo: que existió.
    const decision = decidirApertura({
      categoria: 'oracion',
      estado: con({ haySesion: false, recursoExiste: false, tienePermiso: false }),
    });

    expect(decision).toEqual({ abre: false, motivo: 'sinSesion' });
  });

  it('el dispositivo se comprueba antes que los permisos', () => {
    expect(
      decidirApertura({
        categoria: 'oracion',
        estado: con({ dispositivoAutorizado: false, tienePermiso: false }),
      }),
    ).toEqual({ abre: false, motivo: 'dispositivoNoAutorizado' });
  });

  it('y los permisos antes que la existencia', () => {
    expect(
      decidirApertura({
        categoria: 'oracion',
        estado: con({ tienePermiso: false, recursoExiste: false }),
      }),
    ).toEqual({ abre: false, motivo: 'sinPermiso' });
  });

  it('el contenido privado pide desbloqueo aunque todo lo demás esté bien', () => {
    // El camino que el documento señala como el que más se salta: la acción
    // rápida de una notificación, que abre sin pasar por la aplicación.
    expect(
      decidirApertura({ categoria: 'diario' as never, estado: con({ desbloqueada: false }) }),
    ).toEqual({ abre: true, categoria: 'diario' });

    expect(decidirApertura({ categoria: 'oracion', estado: con({ desbloqueada: false }) })).toEqual(
      { abre: false, motivo: 'requiereDesbloqueo' },
    );
  });

  it('lo que no es privado se abre sin desbloquear', () => {
    // Un evento de la iglesia no es contenido de nadie: pedir la huella para
    // verlo sería estorbar sin proteger nada.
    expect(
      decidirApertura({ categoria: 'evento', estado: con({ desbloqueada: false }) }).abre,
    ).toBe(true);
    expect(
      decidirApertura({ categoria: 'seguridad', estado: con({ desbloqueada: false }) }).abre,
    ).toBe(true);
  });

  it('las categorías espirituales son todas privadas', () => {
    for (const categoria of ['habito', 'oracion', 'devocional', 'lectura', 'sermon'] as const) {
      expect(llevaAContenidoPrivado(categoria)).toBe(true);
    }
  });

  it('el motivo que se enseña no dice qué había detrás', () => {
    // Solo una clave de i18n, y la misma para todos los recursos: el texto no
    // puede hablar de lo que no se llegó a abrir.
    for (const motivo of MOTIVOS) {
      expect(claveDeMotivo(motivo)).toBe(`notificaciones.apertura.${motivo}`);
      expect(claveDeMotivo(motivo)).not.toContain(UUID);
    }
  });
});
