// El servicio de notificaciones: donde la política se convierte en avisos.
//
// Hasta ahora este módulo era un reglamento sin nadie que lo obedeciera.
// Aquí está quien lo obedece, y es **el único sitio** que habla con el
// sistema operativo. Ninguna pantalla programa un aviso por su cuenta: si lo
// hiciera se saltaría el catálogo de textos, los límites y el horario de
// silencio, que es exactamente lo que el Documento 13 quiere impedir.
//
// ── Qué pasa aquí y en qué orden ──────────────────────────────────────────
//
//   1. Se calcula **cuándo** con `proximaOcurrencia`, en la zona horaria de
//      la persona y respetando los cambios de hora.
//   2. Se descarta lo que caiga en horario de silencio o pase de los
//      límites, con `puedeEnviarse`.
//   3. Se elige **qué se ve** con `contenidoVisible`, según si la persona ha
//      pedido vista previa.
//   4. Se programa con un identificador estable, de modo que reprogramar
//      sustituya en lugar de duplicar.
//
// ── Reprogramar es la operación normal ────────────────────────────────────
//
// El Documento 13 lo pide al cambiar zona horaria, horario, preferencias,
// estado de un hábito, pausa de un plan o cierre de sesión. Por eso la
// operación principal no es «añade un aviso» sino «que lo programado sea
// exactamente esto»: se calcula el conjunto que debería existir y se cancela
// lo que sobra. Una API de añadir y quitar deja restos en cuanto alguien se
// olvida de una llamada, y los restos aquí son avisos que suenan cuando ya no
// tocaba.
import { contenidoVisible, DETALLE_POR_DEFECTO, type Detalle } from './contenidoVisible';
import {
  puedeEnviarse,
  type Categoria,
  type Consumo,
  type HorarioSilencio,
  type Limites,
} from './politica';
import { identificadorDeAviso, proximaOcurrencia, type Recordatorio } from './programacion';
import type { AvisoProgramable, Permiso, PuertoNotificaciones } from './puertoNotificaciones';
import type { Ruta } from './cargaRemota';

/** Lo que una pantalla pide que se recuerde. Nunca trae texto. */
export interface RecordatorioPedido {
  readonly entidadId: string;
  readonly categoria: Categoria;
  readonly recordatorio: Recordatorio;
  readonly ruta: Ruta;
}

export interface Preferencias {
  readonly activas: boolean;
  readonly detalle: Detalle;
  readonly silencio: HorarioSilencio;
  readonly limites: Limites;
  readonly zonaHoraria: string;
  readonly aceptaPromocionales: boolean;
}

export interface DependenciasNotificaciones {
  readonly puerto: PuertoNotificaciones;
  /** Se lee en cada operación: cambian sin avisar y no se cachean. */
  readonly preferencias: () => Preferencias;
  readonly consumo: () => Consumo;
  readonly ahora?: () => Date;
}

/** Minutos desde medianoche en la zona de la persona, para el silencio. */
function minutoLocalDe(instante: Date, zonaHoraria: string): number {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: zonaHoraria,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(instante);
  const valor = (tipo: string): number =>
    Number(partes.find((parte) => parte.type === tipo)?.value ?? '0');
  // Medianoche llega como «24» en algunas configuraciones.
  return (valor('hour') % 24) * 60 + valor('minute');
}

export function crearServicioNotificaciones(dependencias: DependenciasNotificaciones) {
  const ahora = dependencias.ahora ?? (() => new Date());

  /**
   * El permiso actual, sin pedirlo.
   *
   * Pedirlo es una acción aparte y deliberada: el Documento 13 exige explicar
   * para qué **antes** de que salga el diálogo del sistema, porque quien lo
   * ve sin contexto dice que no y ya no hay segunda oportunidad.
   */
  const permiso = (): Promise<Permiso> => dependencias.puerto.permisoActual();

  /** Pide el permiso. Quien llame ya ha explicado para qué sirve. */
  const pedirPermiso = (): Promise<Permiso> => dependencias.puerto.pedirPermiso();

  /**
   * Convierte un recordatorio en el aviso que se programaría, o `null`.
   *
   * Separada de `reprogramar` para poder comprobar la decisión sin tocar el
   * sistema: es donde vive la política y donde conviene mirar.
   */
  function avisoDe(pedido: RecordatorioPedido): AvisoProgramable | null {
    const preferencias = dependencias.preferencias();

    const instante = proximaOcurrencia({
      recordatorio: pedido.recordatorio,
      desde: ahora(),
      zonaHoraria: preferencias.zonaHoraria,
    });
    if (instante === null) return null;

    // El texto se comprueba ya elegido del catálogo: así, si alguien mete un
    // texto propio en el catálogo, `puedeEnviarse` lo rechaza igual.
    const visible = contenidoVisible(pedido.categoria, preferencias.detalle);

    const veredicto = puedeEnviarse({
      categoria: pedido.categoria,
      // Se valida la clave, que es lo que hay: el texto traducido no está
      // disponible aquí y meter i18n en este servicio lo ataría a la capa de
      // presentación. La revisión del lenguaje de los textos del catálogo se
      // hace sobre el catálogo, en sus propias pruebas.
      texto: visible.claveCuerpo,
      minutoLocal: minutoLocalDe(instante, preferencias.zonaHoraria),
      silencio: preferencias.silencio,
      limites: preferencias.limites,
      consumo: dependencias.consumo(),
      aceptaPromocionales: preferencias.aceptaPromocionales,
      notificacionesActivas: preferencias.activas,
    });
    if (!veredicto.aceptado) return null;

    return {
      id: identificadorDeAviso({
        entidadId: pedido.entidadId,
        minutoDelDia: pedido.recordatorio.minutoDelDia,
        instante,
      }),
      categoria: pedido.categoria,
      claveTitulo: visible.claveTitulo,
      claveCuerpo: visible.claveCuerpo,
      instante,
      ruta: pedido.ruta,
      entidadId: pedido.entidadId,
    };
  }

  /**
   * Deja programado **exactamente** lo que corresponde a estos recordatorios.
   *
   * Lo que ya no toca se cancela. Ver la cabecera: una API de añadir y quitar
   * deja avisos sonando cuando ya nadie los espera.
   */
  async function reprogramar(pedidos: readonly RecordatorioPedido[]): Promise<readonly string[]> {
    if (!dependencias.preferencias().activas) {
      // Apagar el interruptor general no solo deja de programar: retira lo
      // que había. Si no, seguirían sonando los de la semana pasada.
      await dependencias.puerto.cancelarTodos();
      return [];
    }

    const avisos = pedidos
      .map(avisoDe)
      .filter((aviso): aviso is AvisoProgramable => aviso !== null);
    const deberian = new Set(avisos.map((aviso) => aviso.id));

    const yaProgramados = await dependencias.puerto.programados();
    for (const id of yaProgramados) {
      if (!deberian.has(id)) await dependencias.puerto.cancelar(id);
    }

    for (const aviso of avisos) {
      // Programar el mismo identificador dos veces sustituye. Se vuelven a
      // programar todos, también los que ya estaban: es la forma de que una
      // hora recalculada por un cambio de horario tome efecto.
      await dependencias.puerto.programar(aviso);
    }

    return [...deberian];
  }

  /** Al cerrar sesión no debe quedar ni uno: son avisos sobre contenido. */
  async function olvidarTodo(): Promise<void> {
    await dependencias.puerto.cancelarTodos();
  }

  return { permiso, pedirPermiso, avisoDe, reprogramar, olvidarTodo };
}

export type ServicioNotificaciones = ReturnType<typeof crearServicioNotificaciones>;

/** Preferencias de partida: discretas y con el interruptor apagado. */
export const PREFERENCIAS_POR_DEFECTO = (zonaHoraria: string): Preferencias => ({
  activas: false,
  detalle: DETALLE_POR_DEFECTO,
  silencio: { desdeMinuto: 22 * 60, hastaMinuto: 7 * 60 },
  limites: { espiritualesAlDia: 3, resumenesAlDia: 1, promocionalesALaSemana: 1 },
  zonaHoraria,
  aceptaPromocionales: false,
});
