// Ejecutor de SQL sobre el SQLite que trae Node, para las pruebas.
//
// No es un doble: es el mismo motor que corre en el dispositivo, así que el
// SQL del almacén se ejercita de verdad. Un doble que devolviera respuestas
// preparadas dejaría sin comprobar justo lo que puede fallar: las consultas.
import { DatabaseSync } from 'node:sqlite';

import type { EjecutorSql, ValorSql } from '@shared/database/ejecutorSql';

export function crearEjecutorNodeSqlite(ruta = ':memory:'): EjecutorSql {
  const base = new DatabaseSync(ruta);
  base.exec('pragma foreign_keys = ON;');

  const parametrosDe = (parametros?: readonly ValorSql[]): ValorSql[] => [...(parametros ?? [])];

  return {
    async ejecutar(sql) {
      base.exec(sql);
    },
    async correr(sql, parametros) {
      base.prepare(sql).run(...parametrosDe(parametros));
    },
    async todos<T>(sql: string, parametros?: readonly ValorSql[]) {
      return base.prepare(sql).all(...parametrosDe(parametros)) as unknown as readonly T[];
    },
    async primero<T>(sql: string, parametros?: readonly ValorSql[]) {
      const fila = base.prepare(sql).get(...parametrosDe(parametros));
      return (fila ?? null) as T | null;
    },
    async cerrar() {
      base.close();
    },
  };
}
