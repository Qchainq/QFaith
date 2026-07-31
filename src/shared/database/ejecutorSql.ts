// Puerto mínimo hacia SQLite.
//
// El almacén escribe SQL contra esta interfaz en lugar de contra `expo-sqlite`
// directamente. Así el SQL —que es donde de verdad puede haber errores— se
// ejecuta también en las pruebas, contra un motor SQLite real, en vez de
// quedarse sin comprobar detrás de un doble.

export type ValorSql = string | number | null;

export interface EjecutorSql {
  /** Sentencias sin parámetros, típicamente la creación del esquema. */
  ejecutar(sql: string): Promise<void>;
  correr(sql: string, parametros?: readonly ValorSql[]): Promise<void>;
  todos<T>(sql: string, parametros?: readonly ValorSql[]): Promise<readonly T[]>;
  primero<T>(sql: string, parametros?: readonly ValorSql[]): Promise<T | null>;
  cerrar(): Promise<void>;
}
