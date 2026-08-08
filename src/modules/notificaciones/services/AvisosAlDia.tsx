// Mantiene los avisos al día mientras la aplicación está abierta.
//
// No pinta nada. Existe como componente porque los hooks solo se pueden usar
// dentro de uno, y ponerlo en una pantalla lo ataría a ella: los
// recordatorios de alguien no dependen de en qué pestaña esté.
//
// Va **dentro** de los proveedores de sincronización y de notificaciones,
// porque necesita los hábitos —que viven en la base local— y el servicio.
import { useAjustes } from '@modules/perfil/hooks/usePerfil';

import { useRecordatoriosDeHabitos } from '../hooks/useRecordatorios';

export function AvisosAlDia() {
  const ajustes = useAjustes();
  // El interruptor se pasa para que el efecto se relance al cambiar. Las
  // preferencias completas las lee el servicio por su cuenta, del proveedor.
  useRecordatoriosDeHabitos(ajustes.data?.notificaciones ?? false);

  return null;
}
