// Casos de uso de Hábitos.
//
// Aquí vive la regla que define el módulo: **lo que se cuenta es lo cumplido,
// nunca lo fallado** (invariante 12). No hay función que devuelva días
// perdidos ni rachas rotas, y no debe añadirse ninguna: el dato no existe en
// el esquema justamente para que no se pueda calcular por descuido.
import { ErrorApp } from '@shared/errores/erroresApp';

import {
  cumplidosRecientes,
  esquemaBorradorHabito,
  fechaDeHoy,
  type BorradorHabito,
  type Habito,
} from '../models/habito';
import type { LecturaHabitos, RepositorioHabitos } from '../repositories/repositorioHabitos';

function errorValidacion(claveMensaje: string): ErrorApp {
  return new ErrorApp({
    codigo: 'HABITO_INVALIDO',
    categoria: 'validacion',
    claveMensaje,
    puedeReintentarse: false,
  });
}

export async function listarHabitos(repositorio: RepositorioHabitos): Promise<LecturaHabitos> {
  return repositorio.listar();
}

export async function guardarHabito(
  repositorio: RepositorioHabitos,
  borrador: BorradorHabito,
): Promise<Habito> {
  const validado = esquemaBorradorHabito.safeParse({
    titulo: borrador.titulo,
    descripcion: borrador.descripcion,
    categoria: borrador.categoria ?? null,
    frecuencia: borrador.frecuencia ?? 'daily',
    configuracion: borrador.configuracion ?? { dias: [] },
    fechaInicio: borrador.fechaInicio ?? fechaDeHoy(),
  });

  if (!validado.success) {
    throw errorValidacion(validado.error.issues[0]?.message ?? 'errores.validacion');
  }

  return repositorio.guardar({
    ...(borrador.id === undefined ? {} : { id: borrador.id }),
    ...validado.data,
    ...(borrador.activo === undefined ? {} : { activo: borrador.activo }),
  });
}

/** Alterna el día de hoy: si estaba cumplido lo retira, si no lo marca. */
export async function alternarHoy(
  repositorio: RepositorioHabitos,
  parametros: { readonly habitoId: string; readonly hoy?: string },
): Promise<boolean> {
  const hoy = parametros.hoy ?? fechaDeHoy();
  const dias = await repositorio.diasCumplidos(parametros.habitoId);

  if (dias.includes(hoy)) {
    // Deshacer retira el registro. No queda constancia de un fallo, porque
    // nunca se registra lo que alguien no hizo.
    await repositorio.deshacerCumplido(parametros.habitoId, hoy);
    return false;
  }

  await repositorio.marcarCumplido({ habitoId: parametros.habitoId, fecha: hoy });
  return true;
}

export interface ResumenHabito {
  readonly cumplidoHoy: boolean;
  /** Días cumplidos en la ventana. Nunca días perdidos. */
  readonly cumplidos: number;
  readonly ventana: number;
}

/**
 * Resumen de un hábito, en positivo.
 *
 * «7 de los últimos 30» acompaña. «Llevas 23 días sin» culpabiliza, y el
 * Documento 13 lo prohíbe expresamente. La diferencia no es de redacción:
 * esta función no puede devolver lo segundo porque no lo calcula.
 */
export async function resumirHabito(
  repositorio: RepositorioHabitos,
  parametros: { readonly habitoId: string; readonly hoy?: string; readonly ventana?: number },
): Promise<ResumenHabito> {
  const hoy = parametros.hoy ?? fechaDeHoy();
  const ventana = parametros.ventana ?? 30;
  const dias = await repositorio.diasCumplidos(parametros.habitoId);

  return {
    cumplidoHoy: dias.includes(hoy),
    cumplidos: cumplidosRecientes(dias, hoy, ventana),
    ventana,
  };
}

export async function eliminarHabito(repositorio: RepositorioHabitos, id: string): Promise<void> {
  await repositorio.eliminar(id);
}
