// Pulso Espiritual. Pantalla pura.
//
// Tres cosas de esta pantalla son decisiones, no estética:
//
//   · **«Puedes saltarlo. No pasa nada.»** está desde el primer momento. Una
//     pregunta diaria que uno siente que debe contestar deja de ser una
//     pregunta y se convierte en una obligación.
//   · **Ningún estado se pinta como malo.** Todos son botones iguales. Sin
//     colores de alarma, sin caras, sin orden de mejor a peor.
//   · **No hay racha ni historial de estados en portada.** Ver «llevas cuatro
//     días triste» no ayuda a nadie a estar mejor.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';

import { Boton } from '@shared/components/Boton';
import { CampoTexto } from '@shared/components/CampoTexto';
import { PantallaBase } from '@shared/components/PantallaBase';
import { Superficie } from '@shared/components/Superficie';
import { Texto } from '@shared/components/Texto';
import { useTema } from '@shared/theme/ProveedorTema';

import { acompanamientoDe, ESTADOS_PULSO, type EstadoPulso, type Pulso } from '../models/pulso';

export interface PropsPantallaPulso {
  readonly pulsoDeHoy: Pulso | null;
  readonly cargando?: boolean;
  readonly guardando?: boolean;
  readonly alResponder: (estado: EstadoPulso, nota: string) => void;
  readonly alCambiar: () => void;
  /** Fuerza el editor aunque ya haya respuesta, al pulsar «cambiar». */
  readonly editando: boolean;
}

export function PantallaPulso({
  pulsoDeHoy,
  cargando = false,
  guardando = false,
  alResponder,
  alCambiar,
  editando,
}: PropsPantallaPulso) {
  const { t } = useTranslation();
  const tema = useTema();

  const [elegido, setElegido] = useState<EstadoPulso | null>(null);
  const [nota, setNota] = useState('');

  if (cargando) {
    return <PantallaBase titulo={t('pulso.titulo')} mensajeVacio={t('pulso.cargando')} />;
  }

  // Ya respondió y no ha pedido cambiarlo: se muestra el acompañamiento.
  if (pulsoDeHoy !== null && !editando) {
    const acompanamiento = acompanamientoDe(pulsoDeHoy.estado);

    return (
      <PantallaBase titulo={t('pulso.titulo')}>
        <ScrollView contentContainerStyle={{ gap: tema.espaciado.md }}>
          <Texto nivel="texto" tono="secundario">
            {t('pulso.hoyRespondiste')}
          </Texto>
          <Texto nivel="subtitulo">{t(`pulso.estados.${pulsoDeHoy.estado}`)}</Texto>

          <Superficie>
            <Texto nivel="nota" tono="tenue">
              {t('pulso.etiquetas.lectura')}
            </Texto>
            <Texto nivel="texto">{t(acompanamiento.claveLectura)}</Texto>

            <Texto nivel="nota" tono="tenue">
              {t('pulso.etiquetas.reflexion')}
            </Texto>
            <Texto nivel="texto">{t(acompanamiento.claveReflexion)}</Texto>

            <Texto nivel="nota" tono="tenue">
              {t('pulso.etiquetas.oracion')}
            </Texto>
            <Texto nivel="texto">{t(acompanamiento.claveOracion)}</Texto>

            <Texto nivel="nota" tono="tenue">
              {t('pulso.etiquetas.accion')}
            </Texto>
            <Texto nivel="texto">{t(acompanamiento.claveAccion)}</Texto>
          </Superficie>

          {/* Sugerencia tranquila, sin alarma y sin diagnóstico. No es Modo
              Crisis: eso lo decide el servicio de IA sobre lo que alguien
              escribe, no sobre un botón que pulsó. */}
          {acompanamiento.sugerirHablarConAlguien ? (
            <Texto nivel="nota" tono="secundario">
              {t('pulso.hablarConAlguien')}
            </Texto>
          ) : null}

          <Boton variante="texto" etiqueta={t('pulso.cambiar')} onPress={alCambiar} />

          <Texto nivel="nota" tono="tenue">
            {t('pulso.privacidad')}
          </Texto>
        </ScrollView>
      </PantallaBase>
    );
  }

  return (
    <PantallaBase titulo={t('pulso.titulo')}>
      <ScrollView contentContainerStyle={{ gap: tema.espaciado.sm }}>
        <Texto nivel="subtitulo">{t('pulso.pregunta')}</Texto>
        {/* Lo primero que se lee después de la pregunta. */}
        <Texto nivel="nota" tono="secundario">
          {t('pulso.opcional')}
        </Texto>

        {ESTADOS_PULSO.map((estado) => (
          <Boton
            key={estado}
            // Todos iguales: ninguno es mejor ni peor que otro.
            variante={elegido === estado ? 'primario' : 'secundario'}
            etiqueta={t(`pulso.estados.${estado}`)}
            onPress={() => setElegido(estado)}
          />
        ))}

        <View style={{ marginTop: tema.espaciado.md }}>
          <CampoTexto
            etiqueta={t('pulso.campoNota')}
            value={nota}
            onChangeText={setNota}
            multiline
          />
        </View>

        <Boton
          etiqueta={guardando ? t('pulso.guardando') : t('pulso.guardar')}
          onPress={() => {
            if (elegido !== null) alResponder(elegido, nota);
          }}
          cargando={guardando}
          deshabilitado={elegido === null}
        />

        <Texto nivel="nota" tono="tenue">
          {t('pulso.privacidad')}
        </Texto>
      </ScrollView>
    </PantallaBase>
  );
}
