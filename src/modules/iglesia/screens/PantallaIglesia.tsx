// Iglesia y comunidad. Pantalla pura.
//
// La garantía va arriba y siempre visible, no en un aviso legal: **la iglesia
// no puede ver tu diario, tus oraciones privadas, tu memorial ni tus
// conversaciones.** Quien duda de si unirse merece leerlo antes de decidir,
// no después.
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';

import { Boton } from '@shared/components/Boton';
import { CampoTexto } from '@shared/components/CampoTexto';
import { PantallaBase } from '@shared/components/PantallaBase';
import { Superficie } from '@shared/components/Superficie';
import { Texto } from '@shared/components/Texto';
import { useTema } from '@shared/theme/ProveedorTema';

import type { Evento, Grupo, Mentoria } from '../models/iglesia';
import type { IglesiaConRol } from '../use-cases/gestionIglesia';

export interface PropsPantallaIglesia {
  readonly mias: readonly IglesiaConRol[];
  readonly grupos: readonly Grupo[];
  readonly eventos: readonly Evento[];
  readonly mentorias: readonly Mentoria[];
  readonly usuarioId: string;
  readonly codigo: string;
  readonly encontrada: { readonly id: string; readonly nombre: string } | null;
  readonly buscada: boolean;
  readonly cargando?: boolean;
  readonly trabajando?: boolean;
  readonly alEscribirCodigo: (codigo: string) => void;
  readonly alBuscar: () => void;
  readonly alUnirse: (iglesiaId: string) => void;
  readonly alAbandonar: (membresiaId: string) => void;
  readonly alAlternarInscripcion: (eventoId: string, inscrito: boolean) => void;
  readonly alTerminarMentoria: (mentoriaId: string) => void;
}

export function PantallaIglesia({
  mias,
  grupos,
  eventos,
  mentorias,
  usuarioId,
  codigo,
  encontrada,
  buscada,
  cargando = false,
  trabajando = false,
  alEscribirCodigo,
  alBuscar,
  alUnirse,
  alAbandonar,
  alAlternarInscripcion,
  alTerminarMentoria,
}: PropsPantallaIglesia) {
  const { t } = useTranslation();
  const tema = useTema();

  if (cargando) {
    return <PantallaBase titulo={t('iglesia.titulo')} mensajeVacio={t('iglesia.cargando')} />;
  }

  const activas = mentorias.filter((mentoria) => mentoria.estado === 'active');

  return (
    <PantallaBase titulo={t('iglesia.titulo')}>
      <ScrollView contentContainerStyle={{ gap: tema.espaciado.md }}>
        {/* Lo primero que se lee, siempre. */}
        <Texto nivel="nota" tono="secundario">
          {t('iglesia.garantia')}
        </Texto>

        {mias.length === 0 ? (
          <Texto nivel="texto" tono="secundario">
            {t('iglesia.sinIglesia')}
          </Texto>
        ) : (
          mias.map(({ iglesia, membresia }) => (
            <Superficie key={iglesia.id}>
              <Texto nivel="subtitulo">{iglesia.nombre}</Texto>
              <Texto nivel="nota" tono="secundario">
                {`${t(`iglesia.roles.${membresia.rol}`)} · ${t(`iglesia.estados.${membresia.estado}`)}`}
              </Texto>
              {membresia.estado === 'pending' ? (
                <Texto nivel="nota" tono="tenue">
                  {t('iglesia.solicitudEnviada')}
                </Texto>
              ) : null}
              <View style={{ marginTop: tema.espaciado.sm }}>
                <Boton
                  variante="texto"
                  etiqueta={t('iglesia.abandonar')}
                  onPress={() => alAbandonar(membresia.id)}
                  deshabilitado={trabajando}
                />
              </View>
            </Superficie>
          ))
        )}

        <Superficie>
          <CampoTexto
            etiqueta={t('iglesia.campoCodigo')}
            value={codigo}
            onChangeText={alEscribirCodigo}
            autoCapitalize="none"
          />
          <View style={{ marginTop: tema.espaciado.sm }}>
            <Boton
              variante="secundario"
              etiqueta={t('iglesia.buscar')}
              onPress={alBuscar}
              deshabilitado={codigo.trim().length === 0 || trabajando}
            />
          </View>

          {encontrada !== null ? (
            <View style={{ marginTop: tema.espaciado.sm }}>
              <Texto nivel="texto">{encontrada.nombre}</Texto>
              <Boton
                etiqueta={t('iglesia.unirse')}
                onPress={() => alUnirse(encontrada.id)}
                cargando={trabajando}
              />
            </View>
          ) : buscada ? (
            <Texto nivel="nota" tono="secundario">
              {t('iglesia.noEncontrada')}
            </Texto>
          ) : null}
        </Superficie>

        {grupos.length === 0 ? null : (
          <Superficie>
            <Texto nivel="subtitulo">{t('iglesia.grupos.titulo')}</Texto>
            {grupos.map((grupo) => (
              <View key={grupo.id} style={{ marginTop: tema.espaciado.xs }}>
                <Texto nivel="texto">{grupo.nombre}</Texto>
                <Texto nivel="nota" tono="tenue">
                  {t(`iglesia.grupos.tipos.${grupo.tipo}`)}
                </Texto>
              </View>
            ))}
          </Superficie>
        )}

        <Superficie>
          <Texto nivel="subtitulo">{t('iglesia.eventos.titulo')}</Texto>
          {eventos.length === 0 ? (
            <Texto nivel="texto" tono="secundario">
              {t('iglesia.eventos.sinEventos')}
            </Texto>
          ) : (
            eventos.map((evento) => (
              <View key={evento.id} style={{ marginTop: tema.espaciado.sm }}>
                <Texto nivel="texto">{evento.titulo}</Texto>
                <Texto nivel="nota" tono="tenue">
                  {evento.lugar ?? evento.comienzaEn}
                </Texto>
                <Boton
                  variante={evento.inscrito ? 'texto' : 'secundario'}
                  etiqueta={
                    evento.inscrito ? t('iglesia.eventos.anular') : t('iglesia.eventos.inscribirse')
                  }
                  onPress={() => alAlternarInscripcion(evento.id, evento.inscrito)}
                  deshabilitado={trabajando}
                />
              </View>
            ))
          )}
        </Superficie>

        <Superficie>
          <Texto nivel="subtitulo">{t('iglesia.mentorias.titulo')}</Texto>
          <Texto nivel="nota" tono="secundario">
            {t('iglesia.mentorias.aviso')}
          </Texto>

          {activas.length === 0 ? (
            <Texto nivel="texto" tono="secundario">
              {t('iglesia.mentorias.sinMentorias')}
            </Texto>
          ) : (
            activas.map((mentoria) => (
              <View key={mentoria.id} style={{ marginTop: tema.espaciado.sm }}>
                <Texto nivel="texto">
                  {mentoria.mentorId === usuarioId
                    ? t('iglesia.mentorias.comoMentor')
                    : t('iglesia.mentorias.comoAcompanado')}
                </Texto>
                {/* Se enumera exactamente lo que alcanza. Sin permisos, se dice
                    que no ve nada: es la respuesta que la gente necesita. */}
                <Texto nivel="nota" tono="tenue">
                  {mentoria.permisos.length === 0
                    ? t('iglesia.mentorias.sinPermisos')
                    : mentoria.permisos
                        .map((permiso) => t(`iglesia.mentorias.permisos.${permiso}`))
                        .join(' · ')}
                </Texto>
                <Boton
                  variante="texto"
                  etiqueta={t('iglesia.mentorias.terminar')}
                  onPress={() => alTerminarMentoria(mentoria.id)}
                  deshabilitado={trabajando}
                />
              </View>
            ))
          )}
        </Superficie>
      </ScrollView>
    </PantallaBase>
  );
}
