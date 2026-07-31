// Motor de sincronización. Servicio único e independiente de los módulos.
//
// Reglas que implementa (Documento 7):
//
// 1. Todo se guarda primero en local. La sincronización ocurre después y en
//    segundo plano; nunca bloquea al usuario.
// 2. Orden estricto de envío: eliminar, actualizar, crear y por último
//    descargar. Enviar una creación antes que una eliminación pendiente
//    podría resucitar en el servidor algo que el usuario ya borró.
// 3. Ante un conflicto se conservan **las dos** versiones cifradas y decide
//    el usuario. Nunca se sobrescribe en silencio.
// 4. Las operaciones son idempotentes: repetir una sincronización no
//    duplica registros ni pierde cambios.
import type { AlmacenLocal, RegistroLocal, OperacionSincronizacion } from '@shared/database/tipos';
import { generarUuid } from '@shared/services/crypto/aleatoriedad';
import type { SobreCifrado } from '@shared/services/crypto/tipos';

import type { CambioSaliente, PuertoRemoto, ResultadoCambio } from './puertoRemoto';

export interface ResumenSincronizacion {
  readonly enviados: number;
  readonly recibidos: number;
  readonly conflictos: number;
  readonly rechazados: number;
  readonly revisionFinal: number;
}

export interface OpcionesMotor {
  readonly almacen: AlmacenLocal;
  readonly remoto: PuertoRemoto;
  readonly usuarioId: string;
  readonly dispositivoId: string;
  readonly tamanoLote?: number;
  /** Inyectable para que las pruebas no dependan del reloj real. */
  readonly ahora?: () => string;
}

export type EleccionConflicto = 'conservar_local' | 'conservar_remoto' | 'fusionado';

function operacionDe(registro: RegistroLocal): OperacionSincronizacion {
  if (registro.estado === 'eliminado') {
    return 'delete';
  }
  return registro.estado === 'nuevo' ? 'create' : 'update';
}

export function crearMotorSincronizacion(opciones: OpcionesMotor) {
  const { almacen, remoto, usuarioId, dispositivoId } = opciones;
  const tamanoLote = opciones.tamanoLote ?? 100;
  const ahora = opciones.ahora ?? (() => new Date().toISOString());

  /** Guarda un cambio local. No toca la red: eso es lo que permite el offline. */
  async function registrarCambioLocal(parametros: {
    readonly id?: string;
    readonly tipoEntidad: string;
    readonly sobre: SobreCifrado;
    readonly metadatos?: Readonly<Record<string, string | number | boolean | null>>;
  }): Promise<RegistroLocal> {
    const id = parametros.id ?? generarUuid();
    const existente = await almacen.obtener(parametros.tipoEntidad, id);
    const instante = ahora();

    const registro: RegistroLocal = {
      id,
      usuarioId,
      tipoEntidad: parametros.tipoEntidad,
      sobre: parametros.sobre,
      metadatos: parametros.metadatos ?? existente?.metadatos ?? {},
      version: (existente?.version ?? 0) + 1,
      revisionRemota: existente?.revisionRemota ?? 0,
      // Un registro que nunca llegó al servidor sigue siendo «nuevo» aunque
      // se edite varias veces sin conexión: al servidor hay que crearlo.
      estado: existente === null || existente.estado === 'nuevo' ? 'nuevo' : 'modificado',
      creadoEn: existente?.creadoEn ?? instante,
      actualizadoEn: instante,
      eliminadoEn: null,
      dispositivoId,
    };

    await almacen.guardar(registro);
    return registro;
  }

  /** Borrado lógico. El registro sigue existiendo hasta que se purgue. */
  async function registrarEliminacionLocal(
    tipoEntidad: string,
    id: string,
  ): Promise<RegistroLocal | null> {
    const existente = await almacen.obtener(tipoEntidad, id);
    if (existente === null) {
      return null;
    }
    const instante = ahora();
    const registro: RegistroLocal = {
      ...existente,
      estado: 'eliminado',
      eliminadoEn: instante,
      actualizadoEn: instante,
      version: existente.version + 1,
      dispositivoId,
    };
    await almacen.guardar(registro);
    return registro;
  }

  async function aplicarResultado(
    registro: RegistroLocal,
    resultado: ResultadoCambio,
  ): Promise<'aceptado' | 'conflicto' | 'rechazado'> {
    if (resultado.estado === 'aceptado') {
      await almacen.guardar({
        ...registro,
        estado: 'sincronizado',
        version: resultado.version,
        revisionRemota: resultado.revision,
      });
      return 'aceptado';
    }

    if (resultado.estado === 'conflicto') {
      // Las dos versiones se conservan cifradas. El registro queda marcado y
      // no se toca hasta que el usuario decide.
      await almacen.guardarConflicto({
        id: generarUuid(),
        usuarioId,
        tipoEntidad: registro.tipoEntidad,
        entidadId: registro.id,
        versionLocal: registro.version,
        versionRemota: resultado.versionRemota,
        sobreLocal: registro.sobre,
        sobreRemoto: resultado.sobreRemoto,
        creadoEn: ahora(),
      });
      await almacen.guardar({ ...registro, estado: 'conflicto' });
      return 'conflicto';
    }

    // Rechazo: si es reintentable se deja pendiente para el siguiente
    // intento; si no, queda en conflicto para que no se pierda en silencio.
    await almacen.guardar({
      ...registro,
      estado: resultado.reintentable ? 'pendiente' : 'conflicto',
    });
    return 'rechazado';
  }

  /**
   * Aplica un cambio bajado del servidor.
   *
   * Si el registro local tiene cambios sin enviar, no se pisa: se marca
   * conflicto. Esta es la regla que impide la pérdida silenciosa de datos.
   */
  async function aplicarCambioEntrante(cambio: {
    readonly id: string;
    readonly tipoEntidad: string;
    readonly operacion: OperacionSincronizacion;
    readonly revision: number;
    readonly version: number;
    readonly sobre: SobreCifrado | null;
    readonly metadatos: Readonly<Record<string, string | number | boolean | null>>;
    readonly eliminadoEn: string | null;
  }): Promise<'aplicado' | 'conflicto' | 'ignorado'> {
    const local = await almacen.obtener(cambio.tipoEntidad, cambio.id);

    if (local !== null && local.revisionRemota >= cambio.revision) {
      // Ya lo teníamos: repetir una descarga no debe cambiar nada.
      return 'ignorado';
    }

    const tieneCambiosSinEnviar =
      local !== null && local.estado !== 'sincronizado' && local.estado !== 'conflicto';

    if (tieneCambiosSinEnviar && cambio.sobre !== null) {
      await almacen.guardarConflicto({
        id: generarUuid(),
        usuarioId,
        tipoEntidad: cambio.tipoEntidad,
        entidadId: cambio.id,
        versionLocal: local.version,
        versionRemota: cambio.version,
        sobreLocal: local.sobre,
        sobreRemoto: cambio.sobre,
        creadoEn: ahora(),
      });
      await almacen.guardar({ ...local, estado: 'conflicto' });
      return 'conflicto';
    }

    const instante = ahora();
    if (cambio.operacion === 'delete' || cambio.eliminadoEn !== null) {
      if (local === null) {
        return 'ignorado';
      }
      await almacen.guardar({
        ...local,
        estado: 'sincronizado',
        eliminadoEn: cambio.eliminadoEn ?? instante,
        version: cambio.version,
        revisionRemota: cambio.revision,
        actualizadoEn: instante,
      });
      return 'aplicado';
    }

    if (cambio.sobre === null) {
      return 'ignorado';
    }

    await almacen.guardar({
      id: cambio.id,
      usuarioId,
      tipoEntidad: cambio.tipoEntidad,
      sobre: cambio.sobre,
      metadatos: cambio.metadatos,
      version: cambio.version,
      revisionRemota: cambio.revision,
      estado: 'sincronizado',
      creadoEn: local?.creadoEn ?? instante,
      actualizadoEn: instante,
      eliminadoEn: null,
      dispositivoId: local?.dispositivoId ?? null,
    });
    return 'aplicado';
  }

  /** Ejecuta un ciclo completo en el orden estricto del Documento 7. */
  async function sincronizar(): Promise<ResumenSincronizacion> {
    let enviados = 0;
    let conflictos = 0;
    let rechazados = 0;

    const pendientes = await almacen.pendientesDeEnvio();

    for (let inicio = 0; inicio < pendientes.length; inicio += tamanoLote) {
      const lote = pendientes.slice(inicio, inicio + tamanoLote);
      const cambios: CambioSaliente[] = lote.map((registro) => ({
        id: registro.id,
        tipoEntidad: registro.tipoEntidad,
        operacion: operacionDe(registro),
        sobre: registro.sobre,
        metadatos: registro.metadatos,
        // El servidor compara contra la última versión que confirmamos, no
        // contra la local, que ya incluye los cambios sin enviar.
        versionBase: registro.version - 1,
        dispositivoId: registro.dispositivoId,
      }));

      const resultados = await remoto.enviar(cambios);
      const porId = new Map(resultados.map((resultado) => [resultado.id, resultado]));

      for (const registro of lote) {
        const resultado = porId.get(registro.id);
        if (resultado === undefined) {
          // El servidor no se pronunció: se reintenta más adelante.
          await almacen.guardar({ ...registro, estado: 'pendiente' });
          continue;
        }
        const desenlace = await aplicarResultado(registro, resultado);
        if (desenlace === 'aceptado') enviados += 1;
        if (desenlace === 'conflicto') conflictos += 1;
        if (desenlace === 'rechazado') rechazados += 1;
      }
    }

    // Solo después de subir se descarga, para no sobrescribir lo propio con
    // una versión anterior del servidor.
    const cursor = await almacen.leerCursorSincronizacion();
    const descarga = await remoto.descargar({ desdeRevision: cursor, limite: tamanoLote });

    let recibidos = 0;
    for (const cambio of descarga.cambios) {
      const desenlace = await aplicarCambioEntrante(cambio);
      if (desenlace === 'aplicado') recibidos += 1;
      if (desenlace === 'conflicto') conflictos += 1;
    }

    await almacen.escribirCursorSincronizacion(descarga.revisionFinal);

    return {
      enviados,
      recibidos,
      conflictos,
      rechazados,
      revisionFinal: await almacen.leerCursorSincronizacion(),
    };
  }

  /**
   * Resuelve un conflicto con la decisión del usuario.
   *
   * `fusionado` recibe el sobre resultante de combinar ambas versiones, que
   * prepara el módulo correspondiente porque solo él sabe descifrarlas.
   */
  async function resolverConflicto(parametros: {
    readonly conflictoId: string;
    readonly eleccion: EleccionConflicto;
    readonly sobreFusionado?: SobreCifrado;
  }): Promise<void> {
    const conflictos = await almacen.listarConflictos();
    const conflicto = conflictos.find((candidato) => candidato.id === parametros.conflictoId);
    if (conflicto === undefined) {
      return;
    }

    const registro = await almacen.obtener(conflicto.tipoEntidad, conflicto.entidadId);
    if (registro === null) {
      await almacen.eliminarConflicto(parametros.conflictoId);
      return;
    }

    const instante = ahora();

    if (parametros.eleccion === 'conservar_remoto') {
      await almacen.guardar({
        ...registro,
        sobre: conflicto.sobreRemoto,
        version: conflicto.versionRemota,
        estado: 'sincronizado',
        actualizadoEn: instante,
      });
    } else {
      const sobre =
        parametros.eleccion === 'fusionado' && parametros.sobreFusionado !== undefined
          ? parametros.sobreFusionado
          : conflicto.sobreLocal;
      // Se reenvía partiendo de la versión remota, de modo que el próximo
      // envío ya no choque.
      await almacen.guardar({
        ...registro,
        sobre,
        version: conflicto.versionRemota + 1,
        estado: 'modificado',
        actualizadoEn: instante,
      });
    }

    await almacen.eliminarConflicto(parametros.conflictoId);
  }

  return {
    registrarCambioLocal,
    registrarEliminacionLocal,
    sincronizar,
    resolverConflicto,
    conflictosPendientes: () => almacen.listarConflictos(),
  };
}

export type MotorSincronizacion = ReturnType<typeof crearMotorSincronizacion>;
