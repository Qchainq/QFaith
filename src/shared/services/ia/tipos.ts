// Contrato con el proveedor de IA.
//
// El proveedor tiene que poder cambiarse sin tocar nada más (Documento 6).
// Por eso el resto del sistema solo conoce esta interfaz: ningún módulo,
// pantalla ni hook importa jamás un SDK de LLM.
export type RolMensaje = 'usuario' | 'asistente';

export interface MensajeIa {
  readonly rol: RolMensaje;
  readonly texto: string;
}

/** Lo que el proveedor recibe. Nunca más que esto. */
export interface PeticionProveedor {
  readonly promptSistema: string;
  readonly mensajes: readonly MensajeIa[];
}

export interface RespuestaProveedor {
  readonly texto: string;
  /**
   * Referencia opaca de la conversación en el proveedor, si la da. No puede
   * derivarse del usuario ni revelar nada de él (Documento 12).
   */
  readonly referencia?: string;
}

export interface ProveedorIa {
  responder(peticion: PeticionProveedor): Promise<RespuestaProveedor>;
}

/** Por qué una respuesta salió como salió. Sirve para probar y para auditar. */
export type OrigenRespuesta = 'proveedor' | 'crisis' | 'filtrada' | 'sinConexion';

export interface RespuestaAsistente {
  readonly texto: string;
  readonly origen: OrigenRespuesta;
  /** Solo se marca el hecho, nunca el contenido ni el indicador concreto. */
  readonly categoriaSeguridad: 'crisis' | null;
}
