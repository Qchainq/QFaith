// Alta de cuenta e inicio de sesión.
//
// El formulario solo valida y entrega credenciales. Quien las usa es el
// servicio de autenticación: esta pantalla nunca llama a Supabase (Documento
// 2), ni registra el correo ni la contraseña en ningún sitio.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';

import { Boton } from '@shared/components/Boton';
import { CampoTexto } from '@shared/components/CampoTexto';
import { PantallaBase } from '@shared/components/PantallaBase';
import { Texto } from '@shared/components/Texto';
import { useTema } from '@shared/theme/ProveedorTema';

import { esquemaContrasena, esquemaCorreo, primerError } from '../use-cases/validacion';

export type ModoAcceso = 'registro' | 'inicioSesion';

export interface PropsPantallaAcceso {
  readonly modo: ModoAcceso;
  readonly cargando?: boolean;
  /** Clave de i18n de un error del servidor, ya clasificado. */
  readonly errorGeneral?: string;
  readonly alEnviar: (credenciales: { correo: string; contrasena: string }) => void;
  readonly alCambiarModo: () => void;
  readonly alRestaurarConFrase?: () => void;
}

export function PantallaAcceso({
  modo,
  cargando = false,
  errorGeneral,
  alEnviar,
  alCambiarModo,
  alRestaurarConFrase,
}: PropsPantallaAcceso) {
  const { t } = useTranslation();
  const tema = useTema();

  const [correo, setCorreo] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [tocados, setTocados] = useState<{ correo: boolean; contrasena: boolean }>({
    correo: false,
    contrasena: false,
  });

  const resultadoCorreo = esquemaCorreo.safeParse(correo);
  const resultadoContrasena = esquemaContrasena.safeParse(contrasena);
  const errorCorreo = tocados.correo ? primerError(resultadoCorreo) : null;
  // En el inicio de sesión no se exige longitud mínima: la contraseña ya
  // existe y decir «necesita 8 caracteres» a quien tiene una antigua sería
  // confuso y no aporta seguridad.
  const errorContrasena =
    modo === 'registro' && tocados.contrasena ? primerError(resultadoContrasena) : null;

  const puedeEnviar =
    resultadoCorreo.success &&
    (modo === 'inicioSesion' ? contrasena.length > 0 : resultadoContrasena.success);

  const titulo =
    modo === 'registro' ? t('autenticacion.crearCuenta') : t('autenticacion.iniciarSesion');

  return (
    <PantallaBase titulo={titulo}>
      <ScrollView
        contentContainerStyle={{ gap: tema.espaciado.md }}
        keyboardShouldPersistTaps="handled"
      >
        <CampoTexto
          etiqueta={t('autenticacion.correo')}
          value={correo}
          onChangeText={setCorreo}
          onBlur={() => setTocados((previos) => ({ ...previos, correo: true }))}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
          {...(errorCorreo === null ? {} : { error: t(errorCorreo) })}
        />

        <CampoTexto
          etiqueta={t('autenticacion.contrasena')}
          value={contrasena}
          onChangeText={setContrasena}
          onBlur={() => setTocados((previos) => ({ ...previos, contrasena: true }))}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          textContentType={modo === 'registro' ? 'newPassword' : 'password'}
          {...(errorContrasena === null ? {} : { error: t(errorContrasena) })}
        />

        {errorGeneral === undefined ? null : (
          <Texto nivel="nota" tono="error" accessibilityLiveRegion="polite">
            {t(errorGeneral)}
          </Texto>
        )}

        <Boton
          etiqueta={titulo}
          deshabilitado={!puedeEnviar}
          cargando={cargando}
          onPress={() => alEnviar({ correo: resultadoCorreo.data ?? correo, contrasena })}
        />

        <View style={{ gap: tema.espaciado.xs }}>
          <Boton
            etiqueta={
              modo === 'registro'
                ? t('autenticacion.yaTengoCuenta')
                : t('autenticacion.crearCuenta')
            }
            variante="texto"
            onPress={alCambiarModo}
          />

          {modo === 'inicioSesion' && alRestaurarConFrase !== undefined ? (
            <Boton
              etiqueta={t('seguridad.restaurarTitulo')}
              variante="texto"
              onPress={alRestaurarConFrase}
            />
          ) : null}
        </View>
      </ScrollView>
    </PantallaBase>
  );
}
