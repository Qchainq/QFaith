// Generar la exportación.
//
// Recorre el almacén local módulo a módulo, descifra cada sobre con la clave
// de su dominio y arma un JSON legible. **Nunca toca la red**: todo lo que
// hace falta ya está en el dispositivo, y salir a buscarlo sería pedirle al
// servidor algo que no puede dar.
//
// La correspondencia entre tipo de entidad y dominio de cifrado se declara
// aquí, en una tabla, y no se deduce. Deducirla —por prefijo del nombre, por
// ejemplo— haría que un módulo nuevo se exportara mal o no se exportara, y de
// las dos cosas la segunda es peor porque no se nota.
import type { AlmacenLocal, RegistroLocal } from '@shared/database/tipos';
import { descifrar } from '@shared/services/crypto/servicioCriptografia';
import type { ClaveContenido, DominioCifrado } from '@shared/services/crypto/tipos';

import {
  camposSensiblesEn,
  VERSION_EXPORTACION,
  type Exportacion,
  type ModuloExportado,
  type RegistroExportado,
} from '../models/exportacion';

/**
 * Qué se exporta y con qué clave se abre.
 *
 * Añadir un módulo obliga a añadir su línea aquí. Es deliberado: una tabla
 * explícita se puede comprobar contra la lista de tipos que existen, y una
 * regla automática no.
 */
export const MODULOS_EXPORTABLES: readonly {
  readonly tipo: string;
  readonly dominio: DominioCifrado;
}[] = [
  { tipo: 'journal_entries', dominio: 'diario' },
  { tipo: 'prayers', dominio: 'oracion' },
  { tipo: 'prayer_updates', dominio: 'oracion' },
  { tipo: 'habits', dominio: 'habito' },
  { tipo: 'habit_logs', dominio: 'habito' },
  { tipo: 'bible_notes', dominio: 'notaBiblica' },
  { tipo: 'bible_highlights', dominio: 'notaBiblica' },
  { tipo: 'bible_bookmarks', dominio: 'notaBiblica' },
  { tipo: 'life_library_items', dominio: 'bibliotecaVida' },
  { tipo: 'memorials', dominio: 'memorial' },
  { tipo: 'ai_conversations', dominio: 'ia' },
  { tipo: 'ai_messages', dominio: 'ia' },
  { tipo: 'sermon_notes', dominio: 'notaSermon' },
  { tipo: 'sermon_actions', dominio: 'notaSermon' },
  { tipo: 'spiritual_pulses', dominio: 'pulso' },
  { tipo: 'user_reading_plans', dominio: 'planes' },
  { tipo: 'reading_progress', dominio: 'planes' },
  // Los archivos privados salen como ficha, no como bytes: un JSON con
  // cincuenta megas de fotografías dentro no lo abre nadie. Quien quiera sus
  // fotos las descarga desde la pantalla de cada adjunto.
  { tipo: 'private_media', dominio: 'medios' },
];

export interface DependenciasExportacion {
  readonly almacen: AlmacenLocal;
  readonly usuarioId: string;
  readonly claveDeDominio: (dominio: DominioCifrado) => ClaveContenido;
  readonly ahora?: () => string;
  readonly version?: string;
}

/**
 * Datos que sí puede ver el servidor y que conviene conservar en la copia.
 *
 * Se filtran los del sobre —criptograma, nonce, identificador de clave— porque
 * en un archivo ya descifrado no significan nada y solo darían a entender que
 * ahí queda algo cifrado por abrir.
 */
const CAMPOS_DE_SOBRE = new Set([
  'encrypted_payload',
  'encryption_version',
  'key_id',
  'nonce',
  'content_hash',
  // Los archivos privados guardan su sobre en los metadatos, con nombres
  // propios: la clave del archivo envuelta y el nonce de su contenido. Sin
  // estas dos líneas acabarían en el archivo exportado, que es exactamente
  // donde no deben estar.
  'encrypted_file_key',
  'file_nonce',
]);

const datosVisibles = (registro: RegistroLocal): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(registro.metadatos).filter(([clave]) => !CAMPOS_DE_SOBRE.has(clave)),
  );

export async function exportarContenido(
  dependencias: DependenciasExportacion,
): Promise<Exportacion> {
  const ahora = dependencias.ahora ?? (() => new Date().toISOString());
  const modulos: ModuloExportado[] = [];
  const resumen: Record<string, number> = {};
  let ilegiblesEnTotal = 0;

  for (const { tipo, dominio } of MODULOS_EXPORTABLES) {
    // Con la papelera incluida: lo que espera sus treinta días sigue siendo
    // suyo, y quien exporta antes de borrar la cuenta querría justo eso.
    const registros = await dependencias.almacen.listar(tipo, { incluirEliminados: true });

    const exportados: RegistroExportado[] = [];
    let ilegibles = 0;

    for (const registro of registros) {
      let contenido: unknown = null;

      if (registro.sobre.encryptedPayload.length > 0) {
        try {
          contenido = JSON.parse(
            descifrar({
              sobre: registro.sobre,
              clave: dependencias.claveDeDominio(dominio),
              vinculo: {
                usuarioId: dependencias.usuarioId,
                tipoEntidad: tipo,
                entidadId: registro.id,
              },
            }),
          );
        } catch {
          // Un registro que no abre no detiene la exportación: el resto de la
          // vida de la persona sí se puede llevar. Se cuenta para poder
          // decírselo, que es lo que no se puede callar.
          ilegibles += 1;
          continue;
        }
      }

      exportados.push({
        id: registro.id,
        creadoEn: registro.creadoEn,
        actualizadoEn: registro.actualizadoEn,
        ...(registro.eliminadoEn === null ? {} : { enPapeleraDesde: registro.eliminadoEn }),
        contenido,
        datos: datosVisibles(registro),
      });
    }

    modulos.push({ tipo, registros: exportados, ilegibles });
    resumen[tipo] = exportados.length;
    ilegiblesEnTotal += ilegibles;
  }

  const exportacion: Exportacion = {
    version: VERSION_EXPORTACION,
    generadaEn: ahora(),
    usuarioId: dependencias.usuarioId,
    aplicacion: `QFaith ${dependencias.version ?? ''}`.trim(),
    modulos,
    resumen,
    ilegiblesEnTotal,
  };

  // Red de seguridad, no sustituto de haberlo construido bien: si alguien
  // añade un campo al modelo sin pensarlo, esto lo para **antes** de que el
  // archivo salga del dispositivo. Un archivo con la clave maestra dentro no
  // se puede desandar una vez compartido.
  const sensibles = camposSensiblesEn(exportacion);
  if (sensibles.length > 0) {
    // El mensaje no dice cuál: acabaría en un informe de errores.
    throw new Error('La exportación contenía material que nunca debe salir del dispositivo');
  }

  return exportacion;
}

/** Serializa con sangría: hay que poder leerlo, no solo procesarlo. */
export const comoTexto = (exportacion: Exportacion): string => JSON.stringify(exportacion, null, 2);
