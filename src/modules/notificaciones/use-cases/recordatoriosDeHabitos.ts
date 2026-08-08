// De hábitos a recordatorios.
//
// Es la traducción entre lo que el módulo de Hábitos sabe —qué hábitos hay,
// cuáles tienen recordatorio y a qué hora— y lo que el servicio de
// notificaciones necesita. Vive aquí y no dentro del módulo de Hábitos porque
// mañana los planes de lectura y las oraciones pedirán lo mismo, y la forma
// de pedirlo debe ser una sola.
//
// **No pasa el nombre del hábito.** Lo que se manda es el identificador, y el
// texto lo elige el catálogo cerrado. Un hábito puede llamarse «dejar de
// beber» o «llamar a mi madre», y eso no aparece en una pantalla bloqueada
// por muy útil que resultara.
import type { Habito } from '@modules/habitos/models/habito';
import { aMinutoDelDia } from '@shared/services/notificaciones/programacion';
import type { RecordatorioPedido } from '@shared/services/notificaciones/servicioNotificaciones';

/**
 * Los recordatorios que corresponden a estos hábitos.
 *
 * Se descartan los que no tienen recordatorio activo, los que no tienen hora
 * y los hábitos inactivos. Un hábito que alguien pausó y sigue avisando es de
 * las cosas que más rápido llevan a apagar las notificaciones enteras.
 */
export function recordatoriosDeHabitos(habitos: readonly Habito[]): readonly RecordatorioPedido[] {
  const pedidos: RecordatorioPedido[] = [];

  for (const habito of habitos) {
    if (!habito.activo || !habito.recordatorioActivo) continue;
    if (habito.horaRecordatorio === null) continue;

    const minutoDelDia = aMinutoDelDia(habito.horaRecordatorio);
    // Una hora mal escrita se salta, no tumba el resto: el mismo criterio que
    // en toda la aplicación, donde un registro ilegible no se lleva por
    // delante a los demás.
    if (minutoDelDia === null) continue;

    pedidos.push({
      entidadId: habito.id,
      categoria: 'habito',
      // Sin días: todos. La repetición fina del hábito la gobierna su propia
      // configuración, y programar aquí solo los días exactos exigiría
      // duplicar esa lógica en dos sitios que se desincronizarían.
      recordatorio: { minutoDelDia, dias: [] },
      ruta: 'Habitos',
    });
  }

  return pedidos;
}
