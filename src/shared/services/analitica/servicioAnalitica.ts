// El único sitio por el que sale un dato de analítica.
//
// Tres cosas ocurren aquí y en ningún otro lugar: se comprueba el
// consentimiento, se valida el evento y se llama al proveedor. Cualquier
// módulo que quisiera medir algo llama a `registrar` y no conoce al
// proveedor, igual que con la IA.
//
// ── Apagada por defecto ───────────────────────────────────────────────────
//
// Sin consentimiento explícito no sale nada. No es una preferencia
// razonable: es la privacidad por defecto que pide el Documento 14, y el
// perfil ya nace con `analitica: false`. Una analítica que empieza encendida
// y espera a que alguien la apague ya ha enviado lo primero.
//
// ── Retirar el consentimiento hace algo ───────────────────────────────────
//
// Apagarla no se limita a cerrar el grifo: pide al proveedor que olvide lo de
// esta ejecución. El Documento 14 exige retirada de consentimiento **y**
// eliminación, y cumplir solo la primera deja lo ya enviado donde estaba.
//
// ── Nunca rompe la aplicación ─────────────────────────────────────────────
//
// Un fallo de la analítica se traga. Que no se pueda contar una pantalla no
// es motivo para que alguien no pueda escribir en su diario, y una excepción
// que suba desde aquí acabaría en un sitio donde nadie la espera.
import { esEventoPermitido, type EventoAnalitica } from './eventos';
import {
  analiticaNoDisponible,
  type ContextoAnalitica,
  type PuertoAnalitica,
} from './puertoAnalitica';

export interface DependenciasAnalitica {
  readonly puerto?: PuertoAnalitica;
  readonly contexto: ContextoAnalitica;
  /**
   * Avisa de un evento que se ha rechazado.
   *
   * **Recibe el tipo, nunca el evento.** Pasar el evento entero pondría en
   * un informe de errores justo lo que se acaba de impedir que saliera: si
   * algo se rechaza es porque llevaba algo que no debía.
   */
  readonly alRechazar?: (tipo: string) => void;
}

export function crearServicioAnalitica(dependencias: DependenciasAnalitica) {
  const puerto = dependencias.puerto ?? analiticaNoDisponible;
  let consentida = false;

  /** El estado que ha decidido la persona, no el que le convenga a nadie. */
  const activa = (): boolean => consentida;

  /**
   * Enciende o apaga.
   *
   * Al apagar se pide al proveedor que olvide. Al encender no se recupera
   * nada: lo que no se envió mientras estaba apagada no existe, y recuperarlo
   * sería enviar retroactivamente algo que en su momento no estaba
   * consentido.
   */
  async function consentir(valor: boolean): Promise<void> {
    const cambiaAApagada = consentida && !valor;
    consentida = valor;
    if (cambiaAApagada) {
      try {
        await puerto.olvidar();
      } catch {
        // Que el proveedor no responda no puede dejar la analítica encendida:
        // el estado local ya está apagado y así se queda.
      }
    }
  }

  /**
   * Mide algo.
   *
   * Devuelve si se envió, para que se pueda comprobar. No lanza nunca.
   */
  async function registrar(evento: EventoAnalitica): Promise<boolean> {
    if (!consentida) return false;

    // Segunda defensa, después de los tipos. Ver `esEventoPermitido`.
    if (!esEventoPermitido(evento)) {
      dependencias.alRechazar?.(
        typeof (evento as { tipo?: unknown }).tipo === 'string'
          ? String((evento as { tipo: string }).tipo)
          : 'desconocido',
      );
      return false;
    }

    try {
      await puerto.enviar(evento, dependencias.contexto);
      return true;
    } catch {
      // Ver la cabecera: la analítica no rompe la aplicación.
      return false;
    }
  }

  return { registrar, consentir, activa };
}

export type ServicioAnalitica = ReturnType<typeof crearServicioAnalitica>;
