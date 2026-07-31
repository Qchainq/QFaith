// Los dos idiomas del MVP se entregan completos: una clave sin traducir es
// una tarea sin terminar, no un detalle pendiente.
//
// Esta prueba también vigila el tono: el Documento 13 prohíbe expresamente
// el lenguaje culpabilizador y la urgencia falsa en cualquier texto visible.
import en from '../locales/en.json';
import es from '../locales/es.json';

type Diccionario = { [clave: string]: string | Diccionario };

function rutas(diccionario: Diccionario, prefijo = ''): string[] {
  return Object.entries(diccionario).flatMap(([clave, valor]) => {
    const ruta = `${prefijo}${clave}`;
    return typeof valor === 'string' ? [ruta] : rutas(valor, `${ruta}.`);
  });
}

function valores(diccionario: Diccionario): string[] {
  return Object.values(diccionario).flatMap((valor) =>
    typeof valor === 'string' ? [valor] : valores(valor),
  );
}

const rutasEs = rutas(es as Diccionario);
const rutasEn = rutas(en as Diccionario);

describe('paridad entre idiomas', () => {
  it('inglés tiene exactamente las mismas claves que español', () => {
    expect([...rutasEn].sort()).toEqual([...rutasEs].sort());
  });

  it('ninguna traducción está vacía', () => {
    [es, en].forEach((diccionario) => {
      valores(diccionario as Diccionario).forEach((valor) => {
        expect(valor.trim().length).toBeGreaterThan(0);
      });
    });
  });

  it('las interpolaciones coinciden entre idiomas', () => {
    const interpolaciones = (texto: string): string[] =>
      (texto.match(/\{\{(\w+)\}\}/g) ?? []).sort();

    const porRuta = (diccionario: Diccionario): Map<string, string> => {
      const mapa = new Map<string, string>();
      const recorrer = (nodo: Diccionario, prefijo = ''): void => {
        Object.entries(nodo).forEach(([clave, valor]) => {
          const ruta = `${prefijo}${clave}`;
          if (typeof valor === 'string') {
            mapa.set(ruta, valor);
          } else {
            recorrer(valor, `${ruta}.`);
          }
        });
      };
      recorrer(diccionario);
      return mapa;
    };

    const mapaEs = porRuta(es as Diccionario);
    const mapaEn = porRuta(en as Diccionario);

    mapaEs.forEach((texto, ruta) => {
      expect(interpolaciones(mapaEn.get(ruta) ?? '')).toEqual(interpolaciones(texto));
    });
  });
});

describe('tono de los textos', () => {
  // Expresiones que el Documento 13 prohíbe explícitamente. No pretende ser
  // exhaustivo: atrapa las reincidencias más probables al añadir textos.
  const PROHIBIDO_ES = [
    /has fallado/i,
    /llevas \w+ días sin/i,
    /perderás/i,
    /última oportunidad/i,
    /dios (quiere|está esperando|te dice)/i,
    /debes\s+(orar|leer|ayunar)/i,
    /no has (orado|leído)/i,
  ];

  const PROHIBIDO_EN = [
    /you failed/i,
    /you haven'?t (prayed|read)/i,
    /you will lose/i,
    /last chance/i,
    /god (wants|is waiting|tells you)/i,
  ];

  it('el español no usa lenguaje culpabilizador ni urgencia falsa', () => {
    valores(es as Diccionario).forEach((texto) => {
      PROHIBIDO_ES.forEach((patron) => {
        expect(texto).not.toMatch(patron);
      });
    });
  });

  it('el inglés tampoco', () => {
    valores(en as Diccionario).forEach((texto) => {
      PROHIBIDO_EN.forEach((patron) => {
        expect(texto).not.toMatch(patron);
      });
    });
  });

  it('ningún texto promete supervisión humana que no existe', () => {
    [...valores(es as Diccionario), ...valores(en as Diccionario)].forEach((texto) => {
      expect(texto).not.toMatch(/estamos vigil|we'?re watching you|alguien llegará/i);
    });
  });
});
