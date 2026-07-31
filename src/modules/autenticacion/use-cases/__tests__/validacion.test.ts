import {
  esquemaContrasena,
  esquemaCorreo,
  esquemaCredenciales,
  esquemaFraseRecuperacion,
  primerError,
} from '../validacion';

describe('correo', () => {
  it('acepta correos válidos y los normaliza', () => {
    const resultado = esquemaCorreo.safeParse('  Ana.Ejemplo@Correo.INVALID  ');
    expect(resultado.success).toBe(true);
    expect(resultado.data).toBe('ana.ejemplo@correo.invalid');
  });

  it('rechaza lo que no es un correo, incluido el campo vacío', () => {
    ['', '   ', 'sin-arroba', 'a@', '@b.com', 'a b@c.com'].forEach((entrada) => {
      const resultado = esquemaCorreo.safeParse(entrada);
      expect(resultado.success).toBe(false);
      expect(primerError(resultado)).toBe('autenticacion.correoInvalido');
    });
  });
});

describe('contraseña', () => {
  it('exige al menos ocho caracteres', () => {
    expect(esquemaContrasena.safeParse('1234567').success).toBe(false);
    expect(esquemaContrasena.safeParse('12345678').success).toBe(true);
  });

  it('devuelve una clave de i18n y no un texto literal', () => {
    expect(primerError(esquemaContrasena.safeParse('corta'))).toBe('autenticacion.contrasenaCorta');
  });
});

describe('credenciales', () => {
  it('valida los dos campos a la vez', () => {
    expect(
      esquemaCredenciales.safeParse({ correo: 'ana@correo.invalid', contrasena: 'unaClaveLarga' })
        .success,
    ).toBe(true);
    expect(
      esquemaCredenciales.safeParse({ correo: 'no-vale', contrasena: 'unaClaveLarga' }).success,
    ).toBe(false);
  });
});

describe('frase de recuperación', () => {
  const veinticuatro = Array.from({ length: 24 }, (_, i) => `palabra${i + 1}`).join(' ');

  it('acepta 24 palabras y normaliza espacios y mayúsculas', () => {
    const resultado = esquemaFraseRecuperacion.safeParse(
      `  ${veinticuatro.toUpperCase().replace(/ /g, '    ')}  `,
    );
    expect(resultado.success).toBe(true);
    expect(resultado.data).toBe(veinticuatro);
  });

  it('rechaza si sobran o faltan palabras', () => {
    [`${veinticuatro} extra`, veinticuatro.split(' ').slice(0, 23).join(' '), ''].forEach(
      (entrada) => {
        const resultado = esquemaFraseRecuperacion.safeParse(entrada);
        expect(resultado.success).toBe(false);
        expect(primerError(resultado)).toBe('errores.cifrado.fraseInvalida');
      },
    );
  });
});

describe('primerError', () => {
  it('devuelve null cuando la validación pasa', () => {
    expect(primerError(esquemaContrasena.safeParse('contraseñaLarga'))).toBeNull();
  });
});
