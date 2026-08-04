// Puente entre la pantalla de exportación y el caso de uso.
//
// Es una mutación y no una consulta a propósito: generar la copia es algo que
// la persona **pide**, no algo que ocurra por abrir la pantalla. Como consulta,
// React Query la generaría sola al montar y al recuperar el foco, y tendría
// toda la vida espiritual de alguien descifrada en su caché sin que nadie la
// hubiera pedido.
import { useMutation } from '@tanstack/react-query';

import { useSincronizacion } from '@modules/sincronizacion/services/contextoSincronizacion';
import { claveDeDominio } from '@shared/services/keys/servicioClaves';

import type { Exportacion } from '../models/exportacion';
import { exportarContenido } from '../use-cases/exportarContenido';

export function useExportarContenido() {
  const { almacen, usuarioId } = useSincronizacion();

  return useMutation<Exportacion>({
    mutationFn: () => exportarContenido({ almacen, usuarioId, claveDeDominio }),
    // Sin reintento automático: si falló por un campo prohibido, repetirlo
    // fallaría igual, y volver a descifrarlo todo cuesta.
    retry: false,
  });
}
