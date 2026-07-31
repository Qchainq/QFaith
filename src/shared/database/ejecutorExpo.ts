// Ejecutor de SQL sobre `expo-sqlite`. Es el que corre en el dispositivo.
//
// Aquí no hay lógica de negocio: solo la traducción entre el puerto y la API
// de la librería. Todo el SQL vive en `almacenSqlite`, que se prueba contra
// un motor SQLite real.
import * as SQLite from 'expo-sqlite';

import type { EjecutorSql, ValorSql } from './ejecutorSql';

const NOMBRE_BASE = 'qfaith.db';

export async function crearEjecutorExpo(nombre: string = NOMBRE_BASE): Promise<EjecutorSql> {
  const base = await SQLite.openDatabaseAsync(nombre);

  // `WAL` mejora la concurrencia entre la interfaz y las tareas de fondo, que
  // escriben a la vez durante la sincronización. `foreign_keys` no viene
  // activado por defecto en SQLite.
  await base.execAsync('pragma journal_mode = WAL; pragma foreign_keys = ON;');

  const parametrosDe = (parametros?: readonly ValorSql[]): ValorSql[] => [...(parametros ?? [])];

  return {
    async ejecutar(sql) {
      await base.execAsync(sql);
    },
    async correr(sql, parametros) {
      await base.runAsync(sql, parametrosDe(parametros));
    },
    async todos<T>(sql: string, parametros?: readonly ValorSql[]) {
      return base.getAllAsync<T>(sql, parametrosDe(parametros));
    },
    async primero<T>(sql: string, parametros?: readonly ValorSql[]) {
      return base.getFirstAsync<T>(sql, parametrosDe(parametros));
    },
    async cerrar() {
      await base.closeAsync();
    },
  };
}
