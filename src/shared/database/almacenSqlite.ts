// Persistencia local sobre SQLite.
//
// Es la implementación que se usa en el dispositivo: sin ella, todo lo que
// el usuario escribe desaparecería al cerrar la aplicación.
//
// ── Qué guarda y qué no ───────────────────────────────────────────────────
//
// La base local almacena exactamente lo mismo que el servidor: el sobre ya
// cifrado y los metadatos no sensibles que hacen falta para indexar y
// sincronizar. El contenido del usuario nunca llega aquí en claro.
//
// El Documento 7 pide además que la base local esté cifrada por completo.
// Eso exige SQLCipher, que `expo-sqlite` no incorpora, así que hoy los
// metadatos (fechas, estados, tipo de entrada) quedan legibles para quien
// tenga acceso al sistema de archivos de un dispositivo comprometido. Es el
// mismo conjunto que ya ve el servidor, de modo que no amplía lo que se
// sabe del usuario, pero conviene tenerlo presente: cerrar ese hueco
// requiere un módulo nativo con SQLCipher y es trabajo pendiente, no algo
// que se pueda resolver desde aquí.
import type { EjecutorSql, ValorSql } from './ejecutorSql';
import type { AlmacenLocal, ConflictoLocal, EstadoSincronizacion, RegistroLocal } from './tipos';

const ESQUEMA = `
create table if not exists registros (
  tipo_entidad     text    not null,
  id               text    not null,
  usuario_id       text    not null,
  sobre            text    not null,
  metadatos        text    not null,
  version          integer not null,
  revision_remota  integer not null,
  estado           text    not null,
  creado_en        text    not null,
  actualizado_en   text    not null,
  eliminado_en     text,
  dispositivo_id   text,
  primary key (tipo_entidad, id)
);

create index if not exists registros_pendientes_idx
  on registros (estado, actualizado_en);
create index if not exists registros_listado_idx
  on registros (tipo_entidad, eliminado_en, actualizado_en);

create table if not exists conflictos (
  id              text primary key,
  usuario_id      text    not null,
  tipo_entidad    text    not null,
  entidad_id      text    not null,
  version_local   integer not null,
  version_remota  integer not null,
  sobre_local     text    not null,
  sobre_remoto    text    not null,
  creado_en       text    not null
);

create index if not exists conflictos_entidad_idx
  on conflictos (tipo_entidad, entidad_id);

create table if not exists meta (
  clave text primary key,
  valor text not null
);
`;

const CLAVE_CURSOR = 'cursor_sincronizacion';

/**
 * Prioridad de envío en SQL, equivalente a la del almacén en memoria.
 *
 * Se resuelve en la consulta y no en JavaScript para no traer a memoria toda
 * la cola solo para ordenarla.
 */
const ORDEN_ENVIO = `
  case estado
    when 'eliminado'  then 0
    when 'modificado' then 1
    when 'nuevo'      then 2
    when 'pendiente'  then 3
    else 99
  end
`;

interface FilaRegistro {
  readonly tipo_entidad: string;
  readonly id: string;
  readonly usuario_id: string;
  readonly sobre: string;
  readonly metadatos: string;
  readonly version: number;
  readonly revision_remota: number;
  readonly estado: string;
  readonly creado_en: string;
  readonly actualizado_en: string;
  readonly eliminado_en: string | null;
  readonly dispositivo_id: string | null;
}

interface FilaConflicto {
  readonly id: string;
  readonly usuario_id: string;
  readonly tipo_entidad: string;
  readonly entidad_id: string;
  readonly version_local: number;
  readonly version_remota: number;
  readonly sobre_local: string;
  readonly sobre_remoto: string;
  readonly creado_en: string;
}

function aRegistro(fila: FilaRegistro): RegistroLocal {
  return {
    id: fila.id,
    usuarioId: fila.usuario_id,
    tipoEntidad: fila.tipo_entidad,
    sobre: JSON.parse(fila.sobre) as RegistroLocal['sobre'],
    metadatos: JSON.parse(fila.metadatos) as RegistroLocal['metadatos'],
    version: fila.version,
    revisionRemota: fila.revision_remota,
    estado: fila.estado as EstadoSincronizacion,
    creadoEn: fila.creado_en,
    actualizadoEn: fila.actualizado_en,
    eliminadoEn: fila.eliminado_en,
    dispositivoId: fila.dispositivo_id,
  };
}

function aConflicto(fila: FilaConflicto): ConflictoLocal {
  return {
    id: fila.id,
    usuarioId: fila.usuario_id,
    tipoEntidad: fila.tipo_entidad,
    entidadId: fila.entidad_id,
    versionLocal: fila.version_local,
    versionRemota: fila.version_remota,
    sobreLocal: JSON.parse(fila.sobre_local) as ConflictoLocal['sobreLocal'],
    sobreRemoto: JSON.parse(fila.sobre_remoto) as ConflictoLocal['sobreRemoto'],
    creadoEn: fila.creado_en,
  };
}

export async function crearAlmacenSqlite(ejecutor: EjecutorSql): Promise<AlmacenLocal> {
  await ejecutor.ejecutar(ESQUEMA);

  return {
    async guardar(registro) {
      const parametros: readonly ValorSql[] = [
        registro.tipoEntidad,
        registro.id,
        registro.usuarioId,
        JSON.stringify(registro.sobre),
        JSON.stringify(registro.metadatos),
        registro.version,
        registro.revisionRemota,
        registro.estado,
        registro.creadoEn,
        registro.actualizadoEn,
        registro.eliminadoEn,
        registro.dispositivoId,
      ];

      // Un mismo registro se guarda muchas veces según avanza su estado, así
      // que la escritura es idempotente por clave y no genera duplicados.
      await ejecutor.correr(
        `insert into registros (
           tipo_entidad, id, usuario_id, sobre, metadatos, version,
           revision_remota, estado, creado_en, actualizado_en, eliminado_en, dispositivo_id
         ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         on conflict (tipo_entidad, id) do update set
           usuario_id      = excluded.usuario_id,
           sobre           = excluded.sobre,
           metadatos       = excluded.metadatos,
           version         = excluded.version,
           revision_remota = excluded.revision_remota,
           estado          = excluded.estado,
           actualizado_en  = excluded.actualizado_en,
           eliminado_en    = excluded.eliminado_en,
           dispositivo_id  = excluded.dispositivo_id`,
        parametros,
      );
    },

    async obtener(tipoEntidad, id) {
      const fila = await ejecutor.primero<FilaRegistro>(
        'select * from registros where tipo_entidad = ? and id = ?',
        [tipoEntidad, id],
      );
      return fila === null ? null : aRegistro(fila);
    },

    async listar(tipoEntidad, opciones) {
      const incluirEliminados = opciones?.incluirEliminados ?? false;
      const filas = await ejecutor.todos<FilaRegistro>(
        `select * from registros
          where tipo_entidad = ?
            ${incluirEliminados ? '' : 'and eliminado_en is null'}
          order by actualizado_en desc`,
        [tipoEntidad],
      );
      return filas.map(aRegistro);
    },

    async pendientesDeEnvio() {
      const filas = await ejecutor.todos<FilaRegistro>(
        `select * from registros
          where estado in ('eliminado', 'modificado', 'nuevo', 'pendiente')
          order by ${ORDEN_ENVIO} asc, actualizado_en asc`,
      );
      return filas.map(aRegistro);
    },

    async guardarConflicto(conflicto) {
      await ejecutor.correr(
        `insert into conflictos (
           id, usuario_id, tipo_entidad, entidad_id, version_local,
           version_remota, sobre_local, sobre_remoto, creado_en
         ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)
         on conflict (id) do nothing`,
        [
          conflicto.id,
          conflicto.usuarioId,
          conflicto.tipoEntidad,
          conflicto.entidadId,
          conflicto.versionLocal,
          conflicto.versionRemota,
          JSON.stringify(conflicto.sobreLocal),
          JSON.stringify(conflicto.sobreRemoto),
          conflicto.creadoEn,
        ],
      );
    },

    async listarConflictos() {
      const filas = await ejecutor.todos<FilaConflicto>(
        'select * from conflictos order by creado_en asc',
      );
      return filas.map(aConflicto);
    },

    async eliminarConflicto(id) {
      await ejecutor.correr('delete from conflictos where id = ?', [id]);
    },

    async leerCursorSincronizacion() {
      const fila = await ejecutor.primero<{ valor: string }>(
        'select valor from meta where clave = ?',
        [CLAVE_CURSOR],
      );
      return fila === null ? 0 : Number(fila.valor);
    },

    async escribirCursorSincronizacion(revision) {
      // El cursor nunca retrocede: si dos sincronizaciones se solapan, la más
      // atrasada no debe provocar que se vuelvan a pedir cambios ya vistos.
      await ejecutor.correr(
        `insert into meta (clave, valor) values (?, ?)
         on conflict (clave) do update set
           valor = case
             when cast(excluded.valor as integer) > cast(meta.valor as integer)
               then excluded.valor
             else meta.valor
           end`,
        [CLAVE_CURSOR, String(revision)],
      );
    },

    async vaciar() {
      await ejecutor.correr('delete from registros');
      await ejecutor.correr('delete from conflictos');
      await ejecutor.correr('delete from meta');
    },
  };
}
