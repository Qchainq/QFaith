// Conversación con el acompañante. Pantalla pura.
//
// Tres cosas de esta pantalla no son decoración:
//
//   1. **La advertencia de que no es una autoridad va siempre visible**, no
//      escondida en un aviso que se acepta una vez. Quien abre esto en un mal
//      momento tiene que verlo.
//   2. **El permiso de envío se pide antes de poder escribir**, con el texto
//      que explica exactamente qué sale del dispositivo y qué no.
//   3. **Borrar la memoria está aquí**, no enterrado en ajustes (Documento 6:
//      la opción debe ser visible y funcionar de verdad).
import { useTranslation } from 'react-i18next';
import { FlatList, ScrollView, View } from 'react-native';

import { Boton } from '@shared/components/Boton';
import { CampoTexto } from '@shared/components/CampoTexto';
import { PantallaBase } from '@shared/components/PantallaBase';
import { Superficie } from '@shared/components/Superficie';
import { Texto } from '@shared/components/Texto';
import { useTema } from '@shared/theme/ProveedorTema';

import type { Conversacion, Mensaje } from '../models/conversacion';

export interface PropsPantallaIa {
  readonly mensajes: readonly Mensaje[];
  readonly conversaciones: readonly Conversacion[];
  readonly conversacionId: string | null;
  readonly borrador: string;
  readonly autorizado: boolean;
  readonly cargando?: boolean;
  readonly pensando?: boolean;
  readonly borrando?: boolean;
  readonly confirmandoBorrado?: boolean;
  readonly alEscribir: (texto: string) => void;
  readonly alEnviar: () => void;
  readonly alAutorizar: () => void;
  readonly alAbrirConversacion: (id: string | null) => void;
  readonly alPedirBorrado: () => void;
  readonly alConfirmarBorrado: () => void;
  readonly alCancelarBorrado: () => void;
}

export function PantallaIa({
  mensajes,
  conversaciones,
  conversacionId,
  borrador,
  autorizado,
  cargando = false,
  pensando = false,
  borrando = false,
  confirmandoBorrado = false,
  alEscribir,
  alEnviar,
  alAutorizar,
  alAbrirConversacion,
  alPedirBorrado,
  alConfirmarBorrado,
  alCancelarBorrado,
}: PropsPantallaIa) {
  const { t } = useTranslation();
  const tema = useTema();

  if (cargando) {
    return <PantallaBase titulo={t('ia.titulo')} mensajeVacio={t('ia.cargando')} />;
  }

  return (
    <PantallaBase titulo={t('ia.titulo')}>
      {/* Nunca deja de verse: no es una autoridad espiritual. */}
      <Texto nivel="nota" tono="secundario">
        {t('ia.descripcion')}
      </Texto>

      {/* Historial. Solo aparece cuando hay algo que retomar; en una
          conversación abierta estorbaría. */}
      {conversacionId === null && conversaciones.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginTop: tema.espaciado.sm }}
        >
          {conversaciones.map((conversacion) => (
            <View key={conversacion.id} style={{ marginRight: tema.espaciado.sm }}>
              <Boton
                variante="texto"
                etiqueta={conversacion.titulo}
                onPress={() => alAbrirConversacion(conversacion.id)}
              />
            </View>
          ))}
        </ScrollView>
      ) : null}

      {conversacionId === null ? null : (
        <Boton
          variante="texto"
          etiqueta={t('ia.nuevaConversacion')}
          onPress={() => alAbrirConversacion(null)}
        />
      )}

      <FlatList
        style={{ marginTop: tema.espaciado.md }}
        data={mensajes}
        keyExtractor={(mensaje) => mensaje.id}
        ItemSeparatorComponent={() => <View style={{ height: tema.espaciado.sm }} />}
        ListEmptyComponent={
          <Texto nivel="texto" tono="secundario">
            {t('ia.sinMensajes')}
          </Texto>
        }
        renderItem={({ item }) => (
          <Superficie>
            <Texto nivel="nota" tono="tenue">
              {item.rol === 'usuario' ? t('ia.tu') : t('ia.asistente')}
            </Texto>
            <Texto nivel="texto">{item.texto}</Texto>
            {item.categoriaSeguridad === 'crisis' ? (
              <Texto nivel="nota" tono="secundario">
                {t('ia.avisoCrisis')}
              </Texto>
            ) : null}
          </Superficie>
        )}
      />

      {confirmandoBorrado ? (
        <Superficie>
          <Texto nivel="texto">{t('ia.confirmarBorrado')}</Texto>
          <View style={{ flexDirection: 'row', gap: tema.espaciado.sm }}>
            <Boton
              etiqueta={borrando ? t('ia.borrando') : t('ia.borrarMemoria')}
              onPress={alConfirmarBorrado}
              cargando={borrando}
            />
            <Boton
              variante="texto"
              etiqueta={t('ia.cancelar')}
              onPress={alCancelarBorrado}
              deshabilitado={borrando}
            />
          </View>
        </Superficie>
      ) : null}

      {autorizado ? null : (
        <Superficie>
          {/* Qué sale del dispositivo, dicho antes de que salga. */}
          <Texto nivel="texto" tono="secundario">
            {t('ia.avisoEnvio')}
          </Texto>
          <Boton etiqueta={t('ia.autorizarEnvio')} onPress={alAutorizar} />
        </Superficie>
      )}

      <View style={{ marginTop: tema.espaciado.md, gap: tema.espaciado.sm }}>
        <CampoTexto
          etiqueta={t('ia.campoMensaje')}
          value={borrador}
          onChangeText={alEscribir}
          multiline
          deshabilitado={pensando}
        />
        <Boton
          etiqueta={pensando ? t('ia.pensando') : t('ia.enviar')}
          onPress={alEnviar}
          cargando={pensando}
          deshabilitado={borrador.trim().length === 0}
        />
        <Boton
          variante="texto"
          etiqueta={t('ia.borrarMemoria')}
          onPress={alPedirBorrado}
          deshabilitado={confirmandoBorrado}
        />
      </View>
    </PantallaBase>
  );
}
