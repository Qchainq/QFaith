// Qué puede llevar dentro un push remoto.
//
// El Documento 13 lo enumera y cierra la lista: tipo, identificador opaco,
// ruta de navegación, marca temporal, prioridad y firma. **Nunca contenido
// privado.**
//
// ── Por qué esto merece un archivo ────────────────────────────────────────
//
// Un push remoto pasa por Apple y por Google antes de llegar al teléfono, y
// se queda escrito en los registros de los dos. Lo que se meta aquí sale del
// alcance de QFaith para siempre: no hay forma de retirarlo, ni de saber
// quién lo leyó. Es la única parte del sistema donde un descuido no se puede
// deshacer ni con un despliegue urgente.
//
// Por eso la carga se **valida al construirla**, en vez de confiar en que
// quien la escriba se acuerde. Es la misma técnica que en la analítica y por
// el mismo motivo: una interfaz que acepta un objeto libre acaba llevando
// dentro lo que había a mano en el sitio donde se llamó.
//
// ── El identificador es opaco, y eso importa ──────────────────────────────
//
// Va el identificador de la entidad, nunca su contenido ni nada derivado de
// él. Un UUID no dice nada de lo que hay dentro; un «resumen» del título sí,
// aunque esté cortado, y un hash del contenido convierte el push en un oráculo
// para comprobar si alguien escribió una frase concreta.
import { PRIORIDADES, type Prioridad } from './politica';

/** Tipos de aviso que pueden llegar por push. Solo los que no son locales. */
export const TIPOS_REMOTOS = [
  'seguridad',
  'dispositivo_nuevo',
  'respaldo',
  'iglesia',
  'evento',
  'suscripcion',
] as const;
export type TipoRemoto = (typeof TIPOS_REMOTOS)[number];

/**
 * Destinos a los que un push puede llevar.
 *
 * Cerrado a propósito, y no una ruta libre: una cadena de navegación que
 * llegue de fuera es una forma de decirle a la aplicación adónde ir, y de ahí
 * a abrir una pantalla que la persona no había pedido hay un paso.
 */
export const RUTAS = [
  'Inicio',
  'Perfil',
  'Iglesia',
  'Biblia',
  'Oracion',
  'Diario',
  'Habitos',
  'Planes',
  'Sermones',
] as const;
export type Ruta = (typeof RUTAS)[number];

export interface CargaRemota {
  readonly tipo: TipoRemoto;
  /** Identificador opaco de la entidad. Nunca contenido ni nada derivado. */
  readonly entidadId: string;
  readonly ruta: Ruta;
  /** ISO 8601 en UTC. */
  readonly emitidoEn: string;
  readonly prioridad: Prioridad;
  /** Firma del servidor. Sin ella la carga no se procesa. */
  readonly firma: string;
}

/**
 * Forma de un identificador que se puede mandar.
 *
 * Un UUID y nada más. No es una manía de formato: es el filtro que impide que
 * por el único campo de texto libre pase un título, un nombre o un fragmento
 * de una petición. Ninguna frase escrita por una persona tiene esta forma.
 */
export const FORMA_ENTIDAD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Marca temporal ISO en UTC, sin desplazamiento local. */
export const FORMA_INSTANTE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

const enLista = <T extends string>(lista: readonly T[], valor: unknown): valor is T =>
  typeof valor === 'string' && (lista as readonly string[]).includes(valor);

/**
 * ¿Esta carga se puede enviar o procesar?
 *
 * Se usa en los dos extremos: al construirla y al recibirla. Al recibirla
 * porque lo que llega del exterior no es de fiar, y al construirla porque es
 * donde todavía se puede arreglar.
 */
export function esCargaValida(carga: unknown): carga is CargaRemota {
  if (typeof carga !== 'object' || carga === null) return false;
  const c = carga as Record<string, unknown>;

  // Ningún campo de más. Es por donde entraría el contenido que no debe
  // salir del dispositivo, y aquí «salir» significa quedarse en los
  // servidores de Apple y de Google.
  const permitidos = ['tipo', 'entidadId', 'ruta', 'emitidoEn', 'prioridad', 'firma'];
  if (!Object.keys(c).every((clave) => permitidos.includes(clave))) return false;

  return (
    enLista(TIPOS_REMOTOS, c.tipo) &&
    typeof c.entidadId === 'string' &&
    FORMA_ENTIDAD_ID.test(c.entidadId) &&
    enLista(RUTAS, c.ruta) &&
    typeof c.emitidoEn === 'string' &&
    FORMA_INSTANTE.test(c.emitidoEn) &&
    enLista(PRIORIDADES, c.prioridad) &&
    typeof c.firma === 'string' &&
    c.firma.length > 0
  );
}
