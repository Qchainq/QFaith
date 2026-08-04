// Lista de adjuntos. Componente puro y reutilizable.
//
// Los archivos no tienen pantalla propia: se cuelgan de un memorial, de una
// entrada del diario, de una oración o de la nota de un sermón. Por eso esto
// es un bloque que esas pantallas incrustan, y no una pantalla más.
//
// Dos decisiones que no son estética:
//
//   · **Se dice que está cifrado, y se dice en pequeño.** Quien va a subir la
//     foto de un padre que murió merece saber que nadie más podrá abrirla.
//     Pero es una nota al pie, no una promesa gritada: la confianza no se
//     construye repitiéndola en mayúsculas.
//
//   · **«Se subirá cuando haya conexión» se enseña como estado normal**, sin
//     color de alarma. No es un error: es cómo funciona la aplicación. Un
//     triángulo rojo ahí haría creer que se ha perdido algo.
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Boton } from '@shared/components/Boton';
import { Superficie } from '@shared/components/Superficie';
import { Texto } from '@shared/components/Texto';
import { useTema } from '@shared/theme/ProveedorTema';

import { nombreParaMostrar, type Archivo } from '../models/archivo';

export interface PropsListaAdjuntos {
  readonly adjuntos: readonly Archivo[];
  readonly alAnadir?: () => void;
  readonly alAbrir?: (id: string) => void;
  readonly alRetirar?: (id: string) => void;
  readonly abriendo?: boolean;
}

/** Tamaño legible. Sin decimales por debajo del mega: nadie los necesita. */
export function tamanoLegible(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ListaAdjuntos({
  adjuntos,
  alAnadir,
  alAbrir,
  alRetirar,
  abriendo = false,
}: PropsListaAdjuntos) {
  const { t } = useTranslation();
  const tema = useTema();

  return (
    <View style={{ gap: tema.espaciado.sm }}>
      <Texto nivel="subtitulo">{t('archivos.adjuntos')}</Texto>

      {adjuntos.length === 0 ? (
        <Texto nivel="pie" tono="secundario">
          {t('archivos.sinAdjuntos')}
        </Texto>
      ) : (
        adjuntos.map((archivo) => {
          // `nombreParaMostrar` devuelve una clave de i18n cuando no hay
          // nombre; si lo hay, devuelve el nombre tal cual y no hay que
          // traducirlo.
          const etiqueta = nombreParaMostrar(archivo);
          const nombre = archivo.nombre.length > 0 ? archivo.nombre : t(etiqueta);

          return (
            <Superficie key={archivo.id} estilo={{ gap: tema.espaciado.xs }}>
              <Texto>{nombre}</Texto>
              <Texto nivel="pie" tono="secundario">
                {`${tamanoLegible(archivo.tamanoBytes)} · ${t(
                  `archivos.estado.${archivo.estadoSubida}`,
                )}`}
              </Texto>

              <View style={{ flexDirection: 'row', gap: tema.espaciado.sm }}>
                {alAbrir !== undefined && (
                  <Boton
                    variante="secundario"
                    etiqueta={abriendo ? t('archivos.abriendo') : t('archivos.abrir')}
                    onPress={() => alAbrir(archivo.id)}
                    deshabilitado={abriendo}
                  />
                )}
                {alRetirar !== undefined && (
                  <Boton
                    variante="texto"
                    etiqueta={t('archivos.retirar')}
                    onPress={() => alRetirar(archivo.id)}
                  />
                )}
              </View>
            </Superficie>
          );
        })
      )}

      {alAnadir !== undefined && (
        <>
          <Boton variante="secundario" etiqueta={t('archivos.anadir')} onPress={alAnadir} />
          <Texto nivel="pie" tono="secundario">
            {t('archivos.cifradoAviso')}
          </Texto>
        </>
      )}
    </View>
  );
}
