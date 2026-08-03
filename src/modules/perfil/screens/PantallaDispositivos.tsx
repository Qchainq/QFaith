// Dispositivos con acceso a la cuenta. Pantalla pura.
//
// El dispositivo actual se marca y **no ofrece el botón de retirar acceso**.
// Retirárselo a uno mismo desde aquí dejaría a la persona con una aplicación
// que ya no sincroniza sin entender por qué; el camino es cerrar sesión.
import { useTranslation } from 'react-i18next';
import { FlatList, View } from 'react-native';

import { Boton } from '@shared/components/Boton';
import { PantallaBase } from '@shared/components/PantallaBase';
import { Superficie } from '@shared/components/Superficie';
import { Texto } from '@shared/components/Texto';
import { useTema } from '@shared/theme/ProveedorTema';

import type { Dispositivo } from '../models/perfil';

export interface PropsPantallaDispositivos {
  readonly dispositivos: readonly Dispositivo[];
  readonly cargando?: boolean;
  readonly revocando?: boolean;
  readonly alRevocar: (id: string) => void;
  readonly alVolver: () => void;
}

export function PantallaDispositivos({
  dispositivos,
  cargando = false,
  revocando = false,
  alRevocar,
  alVolver,
}: PropsPantallaDispositivos) {
  const { t } = useTranslation();
  const tema = useTema();

  if (cargando) {
    return (
      <PantallaBase
        titulo={t('perfil.dispositivosPantalla.titulo')}
        mensajeVacio={t('perfil.cargando')}
      />
    );
  }

  return (
    <PantallaBase titulo={t('perfil.dispositivosPantalla.titulo')}>
      <Texto nivel="texto" tono="secundario">
        {t('perfil.dispositivosPantalla.descripcion')}
      </Texto>

      <FlatList
        style={{ marginTop: tema.espaciado.md }}
        data={dispositivos}
        keyExtractor={(dispositivo) => dispositivo.id}
        ItemSeparatorComponent={() => <View style={{ height: tema.espaciado.sm }} />}
        ListEmptyComponent={
          <Texto nivel="texto" tono="secundario">
            {t('perfil.dispositivosPantalla.sinDispositivos')}
          </Texto>
        }
        renderItem={({ item }) => (
          <Superficie>
            <Texto nivel="subtitulo">
              {item.nombre ?? item.plataforma}
              {item.esEste ? ` · ${t('perfil.dispositivosPantalla.esteDispositivo')}` : ''}
            </Texto>
            <Texto nivel="nota" tono="tenue">
              {item.vistoEn ?? t('perfil.dispositivosPantalla.vistoNunca')}
            </Texto>

            {item.estado === 'revoked' ? (
              <Texto nivel="nota" tono="secundario">
                {t('perfil.dispositivosPantalla.revocado')}
              </Texto>
            ) : item.esEste ? null : (
              <View style={{ marginTop: tema.espaciado.sm }}>
                <Boton
                  variante="texto"
                  etiqueta={t('perfil.dispositivosPantalla.revocar')}
                  onPress={() => alRevocar(item.id)}
                  deshabilitado={revocando}
                />
              </View>
            )}
          </Superficie>
        )}
      />

      <View style={{ marginTop: 'auto', paddingBottom: tema.espaciado.lg }}>
        <Boton variante="texto" etiqueta={t('perfil.volver')} onPress={alVolver} />
      </View>
    </PantallaBase>
  );
}
