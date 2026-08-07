// Casos de uso del Diario.
//
// Capa fina a propósito, pero no vacía: aquí vive la validación, que es una
// regla del dominio y no de la pantalla. Si mañana se crea una entrada desde
// una notificación o desde la IA, la regla sigue aplicándose sin duplicarla.
import type { OpcionesPagina } from '@shared/database/paginacion';
import { ErrorApp } from '@shared/errores/erroresApp';

import { esquemaBorrador, type BorradorEntrada, type EntradaDiario } from '../models/entradaDiario';
import type { Lectura, RepositorioDiario } from '../repositories/repositorioDiario';

function errorValidacion(claveMensaje: string): ErrorApp {
  return new ErrorApp({
    codigo: 'ENTRADA_INVALIDA',
    categoria: 'validacion',
    claveMensaje,
    puedeReintentarse: false,
  });
}

export async function listarEntradas(
  repositorio: RepositorioDiario,
  opciones?: OpcionesPagina,
): Promise<Lectura> {
  return repositorio.listar(opciones);
}

export async function obtenerEntrada(
  repositorio: RepositorioDiario,
  id: string,
): Promise<EntradaDiario | null> {
  return repositorio.obtener(id);
}

/**
 * Guarda una entrada, nueva o existente.
 *
 * Las etiquetas se normalizan aquí: repetirlas con distinta caja crearía
 * grupos duplicados que el usuario no entendería, y como viajan cifradas no
 * hay forma de limpiarlas después desde el servidor.
 */
export async function guardarEntrada(
  repositorio: RepositorioDiario,
  borrador: BorradorEntrada,
): Promise<EntradaDiario> {
  const etiquetas = [
    ...new Set(
      borrador.etiquetas
        .map((etiqueta) => etiqueta.trim())
        .filter((etiqueta) => etiqueta.length > 0),
    ),
  ];

  const validado = esquemaBorrador.safeParse({
    titulo: borrador.titulo,
    cuerpo: borrador.cuerpo,
    etiquetas,
    tipo: borrador.tipo,
    fecha: borrador.fecha,
  });

  if (!validado.success) {
    const primero = validado.error.issues[0];
    throw errorValidacion(primero?.message ?? 'errores.validacion');
  }

  return repositorio.guardar({
    ...(borrador.id === undefined ? {} : { id: borrador.id }),
    ...validado.data,
    esFavorita: borrador.esFavorita ?? false,
    protegidaConArca: borrador.protegidaConArca ?? false,
  });
}

/** Envía la entrada a la papelera. No la borra: se puede restaurar 30 días. */
export async function eliminarEntrada(repositorio: RepositorioDiario, id: string): Promise<void> {
  await repositorio.eliminar(id);
}
