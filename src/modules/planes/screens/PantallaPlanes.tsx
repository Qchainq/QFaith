// Planes de lectura. Pantalla pura.
//
// Tres cosas de esta pantalla son decisiones, no estética:
//
//   · **Un plan en pausa o abandonado se enseña igual de bien que uno en
//     curso.** Sin gris apagado, sin aviso, sin «retomarlo». Dejar algo a
//     medias es una decisión legítima y la pantalla no opina sobre ella.
//
//   · **Se cuenta lo leído, nunca lo que falta.** «4 días leídos» y no «26
//     días pendientes»: lo primero dice cuánto has recorrido, lo segundo te
//     compara con un ideal (invariante 12).
//
//   · **«Tu plan te espera donde lo dejaste»** aparece en los que llevan
//     tiempo parados. Es lo contrario de una racha rota, y es literalmente
//     cierto: el esquema no puede hacer avanzar un plan sin que alguien lo lea.
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';

import { Boton } from '@shared/components/Boton';
import { PantallaBase } from '@shared/components/PantallaBase';
import { Superficie } from '@shared/components/Superficie';
import { Texto } from '@shared/components/Texto';
import { useTema } from '@shared/theme/ProveedorTema';

import { posicionEnPlan, type Inscripcion, type Plan } from '../models/plan';

export interface InscripcionConPlan {
  readonly inscripcion: Inscripcion;
  readonly plan: Plan | null;
  readonly diasLeidos: number;
}

export interface PropsPantallaPlanes {
  readonly mios: readonly InscripcionConPlan[];
  readonly catalogo: readonly Plan[];
  readonly cargando?: boolean;
  readonly empezando?: boolean;
  readonly alEmpezar: (planId: string) => void;
  readonly alAbrir: (inscripcionId: string) => void;
  readonly alCambiarEstado?: (
    inscripcionId: string,
    accion: 'pausar' | 'retomar' | 'abandonar',
  ) => void;
}

export function PantallaPlanes({
  mios,
  catalogo,
  cargando = false,
  empezando = false,
  alEmpezar,
  alAbrir,
  alCambiarEstado,
}: PropsPantallaPlanes) {
  const { t } = useTranslation();
  const tema = useTema();

  if (cargando) {
    return <PantallaBase titulo={t('planes.titulo')} mensajeVacio={t('comun.cargando')} />;
  }

  // Los que ya se siguen no vuelven a ofrecerse como novedad.
  const seguidos = new Set(mios.map((entrada) => entrada.inscripcion.planId));
  const porDescubrir = catalogo.filter((plan) => !seguidos.has(plan.id));

  return (
    <PantallaBase titulo={t('planes.titulo')}>
      <ScrollView contentContainerStyle={{ gap: tema.espaciado.md }}>
        <Texto nivel="subtitulo">{t('planes.mios')}</Texto>

        {mios.length === 0 ? (
          <Texto nivel="pie" tono="secundario">
            {t('planes.sinPlanes')}
          </Texto>
        ) : (
          mios.map(({ inscripcion, plan, diasLeidos }) => {
            const posicion = posicionEnPlan(inscripcion, plan?.dias ?? 0);
            return (
              <Superficie key={inscripcion.id} estilo={{ gap: tema.espaciado.xs }}>
                <Texto espiritual>{plan?.titulo ?? ''}</Texto>
                <Texto nivel="pie" tono="secundario">
                  {`${t(posicion.clave, posicion.valores)} · ${t(
                    `planes.estado.${inscripcion.estado}`,
                  )}`}
                </Texto>
                {/* Lo leído, nunca lo que falta. */}
                <Texto nivel="pie" tono="secundario">
                  {t('planes.leidos', { count: diasLeidos })}
                </Texto>
                {(inscripcion.estado === 'paused' || inscripcion.estado === 'abandoned') && (
                  <Texto nivel="pie" tono="secundario">
                    {t('planes.teEspera')}
                  </Texto>
                )}
                <Boton
                  variante="secundario"
                  etiqueta={
                    inscripcion.estado === 'completed'
                      ? t('planes.volverAEmpezar')
                      : t('planes.continuar')
                  }
                  onPress={() => alAbrir(inscripcion.id)}
                />

                {/* Pausar y dejarlo a un lado están a la vista, no escondidos
                    tras un menú. Que cueste encontrarlos empuja a seguir por
                    inercia, y eso es justo lo contrario de acompañar. */}
                {alCambiarEstado !== undefined && inscripcion.estado === 'active' && (
                  <View style={{ flexDirection: 'row', gap: tema.espaciado.sm }}>
                    <Boton
                      variante="texto"
                      etiqueta={t('planes.pausar')}
                      onPress={() => alCambiarEstado(inscripcion.id, 'pausar')}
                    />
                    <Boton
                      variante="texto"
                      etiqueta={t('planes.abandonar')}
                      onPress={() => alCambiarEstado(inscripcion.id, 'abandonar')}
                    />
                  </View>
                )}

                {alCambiarEstado !== undefined &&
                  (inscripcion.estado === 'paused' || inscripcion.estado === 'abandoned') && (
                    <Boton
                      variante="texto"
                      etiqueta={t('planes.retomar')}
                      onPress={() => alCambiarEstado(inscripcion.id, 'retomar')}
                    />
                  )}
              </Superficie>
            );
          })
        )}

        <Texto nivel="subtitulo">{t('planes.descubrir')}</Texto>

        {porDescubrir.length === 0 ? (
          <Texto nivel="pie" tono="secundario">
            {t('planes.sinCatalogo')}
          </Texto>
        ) : (
          porDescubrir.map((plan) => (
            <Superficie key={plan.id} estilo={{ gap: tema.espaciado.xs }}>
              <Texto espiritual>{plan.titulo}</Texto>
              {plan.descripcion.length > 0 && (
                <Texto nivel="pie" tono="secundario">
                  {plan.descripcion}
                </Texto>
              )}
              <View style={{ flexDirection: 'row', gap: tema.espaciado.sm }}>
                <Texto nivel="pie" tono="secundario">
                  {t('planes.duracion', { dias: plan.dias })}
                </Texto>
                {plan.esDePago && (
                  <Texto nivel="pie" tono="secundario">
                    {t('planes.dePago')}
                  </Texto>
                )}
              </View>
              <Boton
                etiqueta={empezando ? t('planes.empezando') : t('planes.empezar')}
                onPress={() => alEmpezar(plan.id)}
                deshabilitado={empezando}
              />
            </Superficie>
          ))
        )}
      </ScrollView>
    </PantallaBase>
  );
}
