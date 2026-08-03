// Casos de uso de Biblia.
//
// La regla propia de este módulo es de licencias, no de privacidad: el texto
// bíblico **no pertenece al usuario** (Documento 12). No se exporta, no se
// vuelca a su respaldo cifrado y no se trata como contenido suyo. Lo suyo son
// sus notas, que sí van cifradas y sí se respaldan.
import { ErrorApp } from '@shared/errores/erroresApp';

import { esquemaBorradorNota, type BorradorNota, type NotaBiblica } from '../models/biblia';
import type { RepositorioBiblia } from '../repositories/repositorioBiblia';
import type { RepositorioNotasBiblicas } from '../repositories/repositorioNotasBiblicas';

export async function listarTraducciones(repositorio: RepositorioBiblia) {
  return repositorio.traducciones();
}

export async function listarLibros(repositorio: RepositorioBiblia, traduccionId: string) {
  return repositorio.libros(traduccionId);
}

export async function leerCapitulo(
  repositorio: RepositorioBiblia,
  parametros: { readonly traduccionId: string; readonly libro: string; readonly capitulo: number },
) {
  return repositorio.capitulo(parametros);
}

export async function notasDelCapitulo(
  repositorio: RepositorioNotasBiblicas,
  parametros: { readonly libro: string; readonly capitulo: number },
): Promise<readonly NotaBiblica[]> {
  return repositorio.delCapitulo(parametros.libro, parametros.capitulo);
}

export async function guardarNota(
  repositorio: RepositorioNotasBiblicas,
  borrador: BorradorNota,
): Promise<NotaBiblica> {
  const validado = esquemaBorradorNota.safeParse({
    texto: borrador.texto,
    libro: borrador.libro,
    capitulo: borrador.capitulo,
    versiculoInicio: borrador.versiculoInicio,
    versiculoFin: borrador.versiculoFin,
  });

  if (!validado.success) {
    throw new ErrorApp({
      codigo: 'NOTA_INVALIDA',
      categoria: 'validacion',
      claveMensaje: validado.error.issues[0]?.message ?? 'errores.validacion',
      puedeReintentarse: false,
    });
  }

  return repositorio.guardar({
    ...(borrador.id === undefined ? {} : { id: borrador.id }),
    ...validado.data,
    traduccionId: borrador.traduccionId ?? null,
  });
}

export async function eliminarNota(
  repositorio: RepositorioNotasBiblicas,
  id: string,
): Promise<void> {
  await repositorio.eliminar(id);
}
