// Implementación en memoria del almacén local.
//
// Se usa en pruebas y como respaldo en entornos donde SQLite no está
// disponible. No es código simulado: implementa el contrato completo y se
// comporta igual que la de SQLite, incluido el orden de envío.
import type { AlmacenLocal, ConflictoLocal, EstadoSincronizacion, RegistroLocal } from './tipos';

/**
 * Orden de envío del Documento 7: primero las eliminaciones, después las
 * actualizaciones y por último las creaciones. Mandar antes una creación que
 * una eliminación pendiente puede resucitar en el servidor algo que el
 * usuario ya había borrado.
 */
const PRIORIDAD_ENVIO: Record<EstadoSincronizacion, number> = {
  eliminado: 0,
  modificado: 1,
  nuevo: 2,
  pendiente: 3,
  conflicto: 99,
  sincronizado: 99,
};

const ESTADOS_ENVIABLES: readonly EstadoSincronizacion[] = [
  'eliminado',
  'modificado',
  'nuevo',
  'pendiente',
];

export function crearAlmacenEnMemoria(): AlmacenLocal {
  const registros = new Map<string, RegistroLocal>();
  const conflictos = new Map<string, ConflictoLocal>();
  let cursor = 0;

  const clave = (tipoEntidad: string, id: string): string => `${tipoEntidad}:${id}`;

  return {
    async guardar(registro) {
      registros.set(clave(registro.tipoEntidad, registro.id), registro);
    },

    async obtener(tipoEntidad, id) {
      return registros.get(clave(tipoEntidad, id)) ?? null;
    },

    async listar(tipoEntidad, opciones) {
      const incluirEliminados = opciones?.incluirEliminados ?? false;
      return [...registros.values()]
        .filter((registro) => registro.tipoEntidad === tipoEntidad)
        .filter((registro) => incluirEliminados || registro.eliminadoEn === null)
        .sort((a, b) => b.actualizadoEn.localeCompare(a.actualizadoEn));
    },

    async pendientesDeEnvio() {
      return [...registros.values()]
        .filter((registro) => ESTADOS_ENVIABLES.includes(registro.estado))
        .sort((a, b) => {
          const porEstado = PRIORIDAD_ENVIO[a.estado] - PRIORIDAD_ENVIO[b.estado];
          // A igualdad de estado, se respeta el orden cronológico para que
          // los cambios lleguen como los hizo el usuario.
          return porEstado !== 0 ? porEstado : a.actualizadoEn.localeCompare(b.actualizadoEn);
        });
    },

    async guardarConflicto(conflicto) {
      conflictos.set(conflicto.id, conflicto);
    },

    async listarConflictos() {
      return [...conflictos.values()];
    },

    async eliminarConflicto(id) {
      conflictos.delete(id);
    },

    async leerCursorSincronizacion() {
      return cursor;
    },

    async escribirCursorSincronizacion(revision) {
      // El cursor nunca retrocede: si dos sincronizaciones se solapan, la
      // más atrasada no debe hacer que se vuelvan a pedir cambios ya vistos.
      cursor = Math.max(cursor, revision);
    },

    async vaciar() {
      registros.clear();
      conflictos.clear();
      cursor = 0;
    },
  };
}
