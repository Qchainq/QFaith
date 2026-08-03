// Compartir contenido con otra persona.
//
// Es el único camino por el que algo escrito por alguien llega a otro, así
// que las pruebas van a por lo que tiene que ser imposible: que lo abra quien
// no debe, que se mueva un sobre de una fila a otra, o que el servidor
// aprenda algo del criptograma.
import { generarClaveMaestra } from '../servicioCriptografia';
import {
  abrirSobreSellado,
  contextoDeComparticion,
  derivarParDeCompartir,
  sellarPara,
} from '../comparticion';

const CONTEXTO = contextoDeComparticion({
  peticionId: 'peticion-1',
  propietarioId: 'usuario-marta',
});

const TEXTO = 'Por la salud de mi hermana. Tengo miedo de lo que digan mañana.';

describe('par de claves', () => {
  it('es siempre el mismo para la misma clave maestra', () => {
    // Determinista: el mismo usuario obtiene el mismo par en otro dispositivo
    // y después de restaurar con la frase.
    const maestra = generarClaveMaestra();

    expect(derivarParDeCompartir(maestra).publicaBase64).toBe(
      derivarParDeCompartir(maestra).publicaBase64,
    );
  });

  it('dos personas distintas nunca comparten par', () => {
    expect(derivarParDeCompartir(generarClaveMaestra()).publicaBase64).not.toBe(
      derivarParDeCompartir(generarClaveMaestra()).publicaBase64,
    );
  });

  it('la pública no permite reconstruir la privada', () => {
    const par = derivarParDeCompartir(generarClaveMaestra());
    // Comprobación elemental pero que ha fallado en sistemas reales: que no
    // se esté publicando la privada por error.
    expect(par.publicaBase64).not.toContain(Buffer.from(par.privada).toString('base64'));
  });
});

describe('sellar y abrir', () => {
  it('el destinatario lo abre y recupera el texto entero', () => {
    const elisa = derivarParDeCompartir(generarClaveMaestra());

    const sobre = sellarPara({
      publicaDestinoBase64: elisa.publicaBase64,
      contenido: TEXTO,
      datosAsociados: CONTEXTO,
    });

    expect(abrirSobreSellado({ privada: elisa.privada, sobre, datosAsociados: CONTEXTO })).toBe(
      TEXTO,
    );
  });

  it('nadie más puede abrirlo, aunque tenga el sobre entero', () => {
    const elisa = derivarParDeCompartir(generarClaveMaestra());
    const pablo = derivarParDeCompartir(generarClaveMaestra());

    const sobre = sellarPara({
      publicaDestinoBase64: elisa.publicaBase64,
      contenido: TEXTO,
      datosAsociados: CONTEXTO,
    });

    expect(() =>
      abrirSobreSellado({ privada: pablo.privada, sobre, datosAsociados: CONTEXTO }),
    ).toThrow();
  });

  it('mover el sobre a otra petición hace que no abra', () => {
    // El contexto ata el sobre a su fila. Sin esto, quien administra la base
    // podría copiar la compartición de una petición inocua sobre otra y
    // hacérsela llegar al mismo destinatario.
    const elisa = derivarParDeCompartir(generarClaveMaestra());
    const sobre = sellarPara({
      publicaDestinoBase64: elisa.publicaBase64,
      contenido: TEXTO,
      datosAsociados: CONTEXTO,
    });

    expect(() =>
      abrirSobreSellado({
        privada: elisa.privada,
        sobre,
        datosAsociados: contextoDeComparticion({
          peticionId: 'otra-peticion',
          propietarioId: 'usuario-marta',
        }),
      }),
    ).toThrow();
  });

  it('alterar un solo byte del criptograma lo invalida', () => {
    const elisa = derivarParDeCompartir(generarClaveMaestra());
    const sobre = sellarPara({
      publicaDestinoBase64: elisa.publicaBase64,
      contenido: TEXTO,
      datosAsociados: CONTEXTO,
    });

    const bytes = Buffer.from(sobre.criptogramaBase64, 'base64');
    bytes[0] = (bytes[0]! + 1) % 256;

    expect(() =>
      abrirSobreSellado({
        privada: elisa.privada,
        sobre: { ...sobre, criptogramaBase64: bytes.toString('base64') },
        datosAsociados: CONTEXTO,
      }),
    ).toThrow();
  });

  it('sustituir la pública efímera tampoco sirve', () => {
    const elisa = derivarParDeCompartir(generarClaveMaestra());
    const otro = derivarParDeCompartir(generarClaveMaestra());
    const sobre = sellarPara({
      publicaDestinoBase64: elisa.publicaBase64,
      contenido: TEXTO,
      datosAsociados: CONTEXTO,
    });

    expect(() =>
      abrirSobreSellado({
        privada: elisa.privada,
        sobre: { ...sobre, efimeraPublicaBase64: otro.publicaBase64 },
        datosAsociados: CONTEXTO,
      }),
    ).toThrow();
  });

  it('dos sobres del mismo texto para la misma persona son distintos', () => {
    // Con la efímera fija, el servidor vería que dos peticiones dicen lo
    // mismo. Ni eso puede aprender.
    const elisa = derivarParDeCompartir(generarClaveMaestra());
    const uno = sellarPara({
      publicaDestinoBase64: elisa.publicaBase64,
      contenido: TEXTO,
      datosAsociados: CONTEXTO,
    });
    const dos = sellarPara({
      publicaDestinoBase64: elisa.publicaBase64,
      contenido: TEXTO,
      datosAsociados: CONTEXTO,
    });

    expect(uno.criptogramaBase64).not.toBe(dos.criptogramaBase64);
    expect(uno.efimeraPublicaBase64).not.toBe(dos.efimeraPublicaBase64);
  });

  it('el criptograma no contiene el texto en claro', () => {
    const elisa = derivarParDeCompartir(generarClaveMaestra());
    const sobre = sellarPara({
      publicaDestinoBase64: elisa.publicaBase64,
      contenido: TEXTO,
      datosAsociados: CONTEXTO,
    });

    const todo = JSON.stringify(sobre);
    expect(todo).not.toContain('hermana');
    expect(todo).not.toContain('miedo');
  });

  it('una clave pública con longitud equivocada se rechaza, no se usa a medias', () => {
    expect(() =>
      sellarPara({
        publicaDestinoBase64: 'YWJj',
        contenido: TEXTO,
        datosAsociados: CONTEXTO,
      }),
    ).toThrow();
  });
});
