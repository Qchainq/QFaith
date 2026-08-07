// Puerto de analítica.
//
// El proveedor no está decidido, igual que el de pagos, y esta interfaz
// existe para que esa decisión no se filtre por el resto del código. Cuando
// se elija se escribe una implementación de esto y no cambia nada más.
//
// **Nadie llama a esto directamente.** Se llama a `servicioAnalitica`, que es
// quien comprueba el consentimiento y valida el evento. Un módulo que hablara
// con el proveedor por su cuenta se saltaría las dos cosas, que es
// exactamente el descuido del que este archivo se protege (misma regla que
// con el proveedor de IA en el Documento 6).
import type { EventoAnalitica } from './eventos';

/**
 * Contexto del envío. Todo lo de aquí está en la lista de permitido del
 * Documento 14 y nada identifica a una persona.
 */
export interface ContextoAnalitica {
  /** Versión de la aplicación. */
  readonly version: string;
  readonly plataforma: 'ios' | 'android';
  readonly versionSistema: string;
  /**
   * Identificador de esta ejecución, para poder contar sesiones.
   *
   * Se genera al arrancar y **no se guarda**. Un identificador persistente
   * permitiría seguir a la misma persona entre sesiones, y el Documento 14
   * pide analítica agregada. Que dos sesiones del mismo teléfono no se puedan
   * enlazar es el precio, y es el precio correcto.
   */
  readonly sesionId: string;
}

export interface PuertoAnalitica {
  enviar(evento: EventoAnalitica, contexto: ContextoAnalitica): Promise<void>;
  /**
   * Borra lo que el proveedor tenga de esta ejecución.
   *
   * Existe porque retirar el consentimiento tiene que **hacer algo**, no solo
   * dejar de enviar. El Documento 14 pide retirada de consentimiento y
   * eliminación, y una opción que solo cierra el grifo hacia adelante no
   * cumple ninguna de las dos.
   */
  olvidar(): Promise<void>;
}

/**
 * Implementación vacía, mientras no haya proveedor.
 *
 * No lanza y no acumula nada. Mientras dure el andamio, la aplicación se
 * comporta como si la analítica estuviera apagada, que es el estado seguro.
 */
export const analiticaNoDisponible: PuertoAnalitica = {
  enviar: async () => undefined,
  olvidar: async () => undefined,
};
