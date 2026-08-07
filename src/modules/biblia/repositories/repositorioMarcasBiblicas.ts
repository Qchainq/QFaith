// Subrayados y marcadores. Lo que alguien deja señalado en su Biblia.
//
// Van juntos en un repositorio y separados de las notas porque son otra cosa:
// una nota es un texto sobre un pasaje, y esto es una marca sobre el propio
// pasaje. Comparten la referencia y poco más.
//
// La frontera de privacidad conviene tenerla presente al leer este archivo:
// **la referencia va en claro y lo que se escribió al subrayar va cifrado.**
// El servidor puede ver que alguien marcó el Salmo 88 —el de la desolación— y
// no puede ver qué escribió al hacerlo. Es un compromiso consciente, el mismo
// que en `bible_notes`: sin la referencia en claro habría que descargar y
// descifrar todos los subrayados de una persona para pintar un capítulo, y en
// un teléfono con años de uso eso no se sostiene.
import type { AlmacenLocal, RegistroLocal } from '@shared/database/tipos';
import { obtenerVigente } from '@shared/database/lecturaVigente';
import { generarUuid } from '@shared/services/crypto/aleatoriedad';
import { cifrar, descifrar } from '@shared/services/crypto/servicioCriptografia';
import type { ClaveContenido, VinculoRegistro } from '@shared/services/crypto/tipos';
import type { MotorSincronizacion } from '@shared/services/sync/motorSincronizacion';

import {
  esEstiloSubrayado,
  esquemaContenidoSubrayado,
  ordenarRango,
  type BorradorSubrayado,
  type Marcador,
  type Subrayado,
} from '../models/biblia';

export const TIPO_SUBRAYADO = 'bible_highlights';
export const TIPO_MARCADOR = 'bible_bookmarks';

export interface DependenciasRepositorioMarcas {
  readonly motor: MotorSincronizacion;
  readonly almacen: AlmacenLocal;
  readonly usuarioId: string;
  readonly claveNotas: () => ClaveContenido;
  readonly claveHash: () => Uint8Array;
}

export function crearRepositorioMarcasBiblicas(dependencias: DependenciasRepositorioMarcas) {
  const { motor, almacen, usuarioId } = dependencias;

  const vinculo = (tipoEntidad: string, entidadId: string): VinculoRegistro => ({
    usuarioId,
    tipoEntidad,
    entidadId,
  });

  function aSubrayado(registro: RegistroLocal): Subrayado | null {
    const { metadatos } = registro;
    const libro = metadatos.book_code;
    const capitulo = metadatos.chapter_number;
    const inicio = metadatos.verse_start;
    const fin = metadatos.verse_end;
    const traduccion = metadatos.translation_id;

    if (
      typeof libro !== 'string' ||
      typeof capitulo !== 'number' ||
      typeof inicio !== 'number' ||
      typeof fin !== 'number' ||
      typeof traduccion !== 'string'
    ) {
      return null;
    }

    // Un estilo que esta versión no conoce **no descarta el subrayado**.
    //
    // El caso es real: si una versión posterior añade un color y la persona lo
    // usa en su teléfono nuevo, el viejo recibiría ese subrayado al
    // sincronizar. Descartarlo haría desaparecer de la pantalla algo que la
    // persona marcó, sin aviso y sin forma de recuperarlo desde ahí. Se pinta
    // con el estilo neutro, que es feo pero honesto: la marca sigue estando.
    const estilo = esEstiloSubrayado(metadatos.highlight_style)
      ? metadatos.highlight_style
      : 'subrayado';

    let nota = '';
    // Una nota que no abre no invalida el subrayado: el pasaje sigue marcado y
    // eso es lo que la pantalla necesita para pintarlo. Perder el color por no
    // poder leer un texto opcional sería el peor de los dos males.
    if (registro.sobre.encryptedPayload.length > 0) {
      try {
        const contenido = esquemaContenidoSubrayado.safeParse(
          JSON.parse(
            descifrar({
              sobre: registro.sobre,
              clave: dependencias.claveNotas(),
              vinculo: vinculo(TIPO_SUBRAYADO, registro.id),
            }),
          ),
        );
        nota = contenido.success ? contenido.data.nota : '';
      } catch {
        nota = '';
      }
    }

    return {
      id: registro.id,
      traduccionId: traduccion,
      libro,
      capitulo,
      versiculoInicio: inicio,
      versiculoFin: fin,
      estilo,
      nota,
      creadoEn: registro.creadoEn,
    };
  }

  function aMarcador(registro: RegistroLocal): Marcador | null {
    const { metadatos } = registro;
    const libro = metadatos.book_code;
    const capitulo = metadatos.chapter_number;
    const traduccion = metadatos.translation_id;

    if (
      typeof libro !== 'string' ||
      typeof capitulo !== 'number' ||
      typeof traduccion !== 'string'
    ) {
      return null;
    }

    return {
      id: registro.id,
      traduccionId: traduccion,
      libro,
      capitulo,
      versiculo: typeof metadatos.verse_number === 'number' ? metadatos.verse_number : null,
      creadoEn: registro.creadoEn,
    };
  }

  /**
   * ¿Este registro es de este capítulo? **Sin descifrar nada.**
   *
   * Es la razón de que la referencia viaje en claro, explicada en la cabecera
   * de este archivo. Descartar aquí, mirando solo los metadatos, es lo que
   * evita pagar un descifrado por cada subrayado de la Biblia entera cada vez
   * que se abre un capítulo. La medida que lo motivó está en
   * `rendimiento.medicion.test.ts`: con tres mil subrayados repartidos por la
   * Biblia, descifrarlos todos costaba unos 375 ms **por capítulo abierto**, y
   * el presupuesto del Documento 14 para abrir contenido privado es 500 ms —
   * en un servidor, no en un teléfono.
   */
  function esDelCapitulo(
    registro: RegistroLocal,
    parametros: {
      readonly traduccionId: string;
      readonly libro: string;
      readonly capitulo: number;
    },
  ): boolean {
    const { metadatos } = registro;
    return (
      metadatos.translation_id === parametros.traduccionId &&
      metadatos.book_code === parametros.libro &&
      metadatos.chapter_number === parametros.capitulo
    );
  }

  const leerSubrayados = (registros: readonly RegistroLocal[]): readonly Subrayado[] =>
    registros.map(aSubrayado).filter((s): s is Subrayado => s !== null);

  const subrayadosVigentes = async (): Promise<readonly Subrayado[]> =>
    leerSubrayados(await almacen.listar(TIPO_SUBRAYADO));

  /**
   * Subrayados de un capítulo, del más antiguo al más reciente.
   *
   * En ese orden porque los solapados se pintan superpuestos y lo último que
   * marcó la persona debe quedar encima, igual que con dos rotuladores.
   *
   * Se filtra **antes** de descifrar, no después. Ver `esDelCapitulo`.
   */
  async function delCapitulo(parametros: {
    readonly traduccionId: string;
    readonly libro: string;
    readonly capitulo: number;
  }): Promise<readonly Subrayado[]> {
    const registros = (await almacen.listar(TIPO_SUBRAYADO)).filter((registro) =>
      esDelCapitulo(registro, parametros),
    );
    return [...leerSubrayados(registros)].sort((a, b) => a.creadoEn.localeCompare(b.creadoEn));
  }

  /** Todos los subrayados, del más reciente al más antiguo. Para repasarlos. */
  async function todosLosSubrayados(): Promise<readonly Subrayado[]> {
    return [...(await subrayadosVigentes())].sort((a, b) => b.creadoEn.localeCompare(a.creadoEn));
  }

  /**
   * Subraya un pasaje.
   *
   * Si ya existe uno igual —mismo pasaje, mismo color— se reutiliza en lugar
   * de crear otro: el esquema lo prohíbe con un índice único y sin esto el
   * segundo solo reventaría al sincronizar. Marcar dos veces lo mismo con el
   * mismo rotulador es marcarlo una vez.
   *
   * Los que se solapan **no** se funden. Marcar 3-5 y luego 4-6 deja dos
   * subrayados: fundirlos cambiaría en silencio lo que la persona marcó y se
   * llevaría por delante la nota de uno de los dos (invariante 5).
   */
  async function subrayar(borrador: BorradorSubrayado): Promise<Subrayado> {
    // Seleccionar de abajo arriba es tan normal como al revés.
    const rango = ordenarRango(borrador.versiculoInicio, borrador.versiculoFin);

    // Por el mismo motivo que en `delCapitulo`: se descarta por la referencia
    // en claro y solo se descifra lo que queda, que son los subrayados de ese
    // capítulo y no los de la Biblia entera.
    const existente = (await delCapitulo(borrador)).find(
      (subrayado) =>
        subrayado.versiculoInicio === rango.versiculoInicio &&
        subrayado.versiculoFin === rango.versiculoFin &&
        subrayado.estilo === borrador.estilo,
    );

    const id = existente?.id ?? generarUuid();
    // Volver a subrayar lo mismo sin escribir nada no borra lo que ya había
    // escrito: sería una pérdida silenciosa por un gesto que la persona hace
    // sin pensar.
    const nota = borrador.nota ?? existente?.nota ?? '';

    const registro = await motor.registrarCambioLocal({
      id,
      tipoEntidad: TIPO_SUBRAYADO,
      sobre: cifrar({
        contenido: JSON.stringify(esquemaContenidoSubrayado.parse({ nota })),
        clave: dependencias.claveNotas(),
        claveHash: dependencias.claveHash(),
        vinculo: vinculo(TIPO_SUBRAYADO, id),
      }),
      metadatos: {
        translation_id: borrador.traduccionId,
        book_code: borrador.libro,
        chapter_number: borrador.capitulo,
        verse_start: rango.versiculoInicio,
        verse_end: rango.versiculoFin,
        highlight_style: borrador.estilo,
      },
    });

    const subrayado = aSubrayado(registro);
    if (subrayado === null) throw new Error('El subrayado recién creado no se puede releer');
    return subrayado;
  }

  /** Quita el subrayado. A la papelera, no de verdad: puede llevar una nota. */
  async function quitarSubrayado(id: string): Promise<void> {
    await motor.registrarEliminacionLocal(TIPO_SUBRAYADO, id);
  }

  const marcadoresVigentes = async (): Promise<readonly Marcador[]> =>
    (await almacen.listar(TIPO_MARCADOR)).map(aMarcador).filter((m): m is Marcador => m !== null);

  /** Marcadores, del más reciente al más antiguo: el último sitio va primero. */
  async function marcadores(): Promise<readonly Marcador[]> {
    return [...(await marcadoresVigentes())].sort((a, b) => b.creadoEn.localeCompare(a.creadoEn));
  }

  /**
   * Deja un marcador.
   *
   * Marcar dos veces el mismo sitio es marcarlo una: se devuelve el que ya
   * había. El capítulo entero y un versículo suyo son sitios distintos, y eso
   * es deliberado: «dejé de leer en Salmos 88» y «quiero volver al 88:14» son
   * dos cosas.
   */
  async function marcar(parametros: {
    readonly traduccionId: string;
    readonly libro: string;
    readonly capitulo: number;
    readonly versiculo?: number | null;
  }): Promise<Marcador> {
    const versiculo = parametros.versiculo ?? null;

    const existente = (await marcadoresVigentes()).find(
      (marcador) =>
        marcador.traduccionId === parametros.traduccionId &&
        marcador.libro === parametros.libro &&
        marcador.capitulo === parametros.capitulo &&
        marcador.versiculo === versiculo,
    );
    if (existente !== undefined) return existente;

    const id = generarUuid();
    const registro = await motor.registrarCambioLocal({
      id,
      tipoEntidad: TIPO_MARCADOR,
      // Un marcador no tiene nada que cifrar: la persona no escribe nada. Se
      // cifra un objeto vacío para que el motor trate todas las filas igual y
      // no haya dos formas de leerlas.
      sobre: cifrar({
        contenido: '{}',
        clave: dependencias.claveNotas(),
        claveHash: dependencias.claveHash(),
        vinculo: vinculo(TIPO_MARCADOR, id),
      }),
      metadatos: {
        translation_id: parametros.traduccionId,
        book_code: parametros.libro,
        chapter_number: parametros.capitulo,
        verse_number: versiculo,
      },
    });

    const marcador = aMarcador(registro);
    if (marcador === null) throw new Error('El marcador recién creado no se puede releer');
    return marcador;
  }

  async function quitarMarcador(id: string): Promise<void> {
    await motor.registrarEliminacionLocal(TIPO_MARCADOR, id);
  }

  /** El subrayado, o `null` si ya no está o está en la papelera. */
  async function subrayado(id: string): Promise<Subrayado | null> {
    const registro = await obtenerVigente(almacen, TIPO_SUBRAYADO, id);
    return registro === null ? null : aSubrayado(registro);
  }

  return {
    delCapitulo,
    todosLosSubrayados,
    subrayar,
    quitarSubrayado,
    subrayado,
    marcadores,
    marcar,
    quitarMarcador,
  };
}

export type RepositorioMarcasBiblicas = ReturnType<typeof crearRepositorioMarcasBiblicas>;
