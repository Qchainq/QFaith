// Sincronizar dejando constancia de cómo fue.
//
// El motor sabe sincronizar y el estado global sabe mostrarlo, pero nadie los
// unía: el almacén de estado existía y ninguna pantalla lo alimentaba, así
// que la aplicación nunca podía decir «guardado en este dispositivo» ni
// avisar de un conflicto pendiente. En una aplicación offline-first eso no es
// un detalle: es la diferencia entre confiar en que tus cosas están a salvo y
// no saberlo.
//
// Dos reglas:
//
//   1. **Un fallo de red no es un error del usuario.** Se registra la clave
//      de i18n del mensaje, nunca el mensaje técnico: puede llevar dentro
//      identificadores o rutas (invariante 2).
//
//   2. **Sincronizar nunca lanza hacia arriba.** Quien lo llama suele ser un
//      temporizador o el arranque, y una excepción ahí tumbaría la pantalla
//      por no tener cobertura. El resultado se cuenta en el estado.
import { esErrorApp } from '@shared/errores/erroresApp';
import type {
  MotorSincronizacion,
  ResumenSincronizacion,
} from '@shared/services/sync/motorSincronizacion';
import { useEstadoSincronizacion } from '@shared/state/estadoSincronizacion';

export interface ResultadoSincronizacion {
  readonly correcta: boolean;
  readonly resumen?: ResumenSincronizacion;
}

/**
 * Trabajo extra que hay que hacer en cada vuelta.
 *
 * Los archivos no viajan por el motor: la ficha sí, pero el blob cifrado va
 * por su cuenta al cubo. Sin engancharlo aquí, una foto adjuntada sin
 * cobertura se quedaría en el teléfono para siempre, con la ficha diciendo
 * que existe en un sitio donde no está.
 *
 * Se pasa como función y no como dependencia fija para que este caso de uso
 * siga sin saber nada de archivos.
 */
export type TareaDeFondo = () => Promise<unknown>;

export async function sincronizarConEstado(
  motor: MotorSincronizacion,
  ahora: () => string = () => new Date().toISOString(),
  tareas: readonly TareaDeFondo[] = [],
): Promise<ResultadoSincronizacion> {
  const estado = useEstadoSincronizacion.getState();
  estado.comenzar();

  try {
    const resumen = await motor.sincronizar();

    // Después de sincronizar y no antes: subir el blob de una ficha que
    // todavía no existe en el servidor dejaría un archivo huérfano en el cubo
    // si el envío de la ficha fallara.
    //
    // Que una tarea falle no tumba la ronda: la sincronización sí funcionó, y
    // decir lo contrario haría que la pantalla avisara de un problema que no
    // afecta a lo que la persona acaba de escribir.
    for (const tarea of tareas) {
      await tarea().catch(() => undefined);
    }
    // Los conflictos pendientes se cuentan aparte del resumen: puede haber de
    // rondas anteriores que nadie ha resuelto todavía.
    const pendientes = await motor.conflictosPendientes();

    useEstadoSincronizacion.getState().terminar({
      enviados: resumen.enviados,
      recibidos: resumen.recibidos,
      conflictos: pendientes.length,
      instante: ahora(),
    });

    return { correcta: true, resumen };
  } catch (causa) {
    useEstadoSincronizacion
      .getState()
      .fallar(esErrorApp(causa) ? causa.claveMensaje : 'errores.sinConexion');
    return { correcta: false };
  }
}
