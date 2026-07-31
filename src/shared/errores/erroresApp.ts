// Clasificación central de errores (Documento 9 y Documento 14).
//
// Cada error lleva un código estable, una categoría, si puede reintentarse y
// una clave de i18n con el mensaje que verá el usuario. El mensaje técnico
// queda para diagnóstico interno y **nunca** debe contener contenido privado,
// claves ni tokens.

export type CategoriaError =
  | 'validacion'
  | 'autenticacion'
  | 'permisos'
  | 'servidor'
  | 'sincronizacion'
  | 'conectividad'
  | 'cifrado';

export interface DetallesError {
  /** Código estable, apto para telemetría. Nunca cambia entre versiones. */
  readonly codigo: string;
  readonly categoria: CategoriaError;
  /** Clave de i18n del mensaje visible. Nunca un literal. */
  readonly claveMensaje: string;
  readonly puedeReintentarse: boolean;
  /** Contexto técnico sin datos privados: identificadores y estados, nada más. */
  readonly contexto?: Readonly<Record<string, string | number | boolean>>;
}

export class ErrorApp extends Error {
  readonly codigo: string;
  readonly categoria: CategoriaError;
  readonly claveMensaje: string;
  readonly puedeReintentarse: boolean;
  readonly contexto: Readonly<Record<string, string | number | boolean>>;

  constructor(detalles: DetallesError, causa?: unknown) {
    // El `message` es interno. Se construye solo con el código y la categoría
    // para que ningún volcado accidental revele contenido del usuario.
    super(`${detalles.categoria}/${detalles.codigo}`);
    this.name = 'ErrorApp';
    this.codigo = detalles.codigo;
    this.categoria = detalles.categoria;
    this.claveMensaje = detalles.claveMensaje;
    this.puedeReintentarse = detalles.puedeReintentarse;
    this.contexto = detalles.contexto ?? {};
    if (causa !== undefined) {
      this.cause = causa;
    }
  }

  /** Representación segura para logs y telemetría. */
  aRegistroSeguro(): Record<string, string | number | boolean> {
    return {
      codigo: this.codigo,
      categoria: this.categoria,
      puedeReintentarse: this.puedeReintentarse,
      ...this.contexto,
    };
  }
}

export function esErrorApp(valor: unknown): valor is ErrorApp {
  return valor instanceof ErrorApp;
}
