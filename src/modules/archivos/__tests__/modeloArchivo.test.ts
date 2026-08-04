// Reglas del modelo de archivos, sueltas del repositorio.
//
// Son funciones pequeñas y aburridas, y por eso mismo conviene fijarlas: el
// nombre que se enseña cuando no hay nombre, el tamaño legible y el orden en
// que se comprueban las cosas antes de cifrar.
import {
  motivoDeRechazo,
  nombreParaMostrar,
  rutaEnCubo,
  TAMANO_MAXIMO_BYTES,
  type Archivo,
} from '../models/archivo';
import { tamanoLegible } from '../components/ListaAdjuntos';

const archivo = (extra: Partial<Archivo>): Archivo => ({
  id: 'archivo-1',
  origen: 'memorial',
  origenId: 'memorial-1',
  tipo: 'application/pdf',
  nombre: '',
  tamanoBytes: 100,
  estadoSubida: 'uploaded',
  creadoEn: '2026-08-03T10:00:00.000Z',
  ...extra,
});

describe('nombre que se enseña', () => {
  it('usa el original cuando lo hay', () => {
    expect(nombreParaMostrar(archivo({ nombre: 'carta.pdf' }))).toBe('carta.pdf');
  });

  it.each([
    ['image/jpeg' as const, 'archivos.sinNombre.imagen'],
    ['audio/m4a' as const, 'archivos.sinNombre.audio'],
    ['application/pdf' as const, 'archivos.sinNombre.documento'],
  ])('sin nombre, %s cae en una clave de i18n', (tipo, clave) => {
    // Nunca un literal: el Documento 13 exige que todo texto visible pase por
    // i18n, también los de relleno.
    expect(nombreParaMostrar(archivo({ tipo }))).toBe(clave);
  });
});

describe('tamaño legible', () => {
  it.each([
    [512, '512 B'],
    [2048, '2 KB'],
    [5 * 1024 * 1024, '5.0 MB'],
  ])('%i bytes se enseñan como %s', (bytes, esperado) => {
    expect(tamanoLegible(bytes)).toBe(esperado);
  });

  it('no enseña decimales por debajo del mega', () => {
    // «1,37 KB» no ayuda a nadie a decidir nada.
    expect(tamanoLegible(1400)).not.toContain('.');
  });
});

describe('qué se puede adjuntar', () => {
  it('el tipo se comprueba antes que el tamaño', () => {
    // Al revés, un vídeo de un giga con extensión rara haría recorrer todo el
    // búfer antes de decir que no vale por el tipo.
    expect(
      motivoDeRechazo({ tipo: 'video/mp4', contenido: new Uint8Array(TAMANO_MAXIMO_BYTES + 1) }),
    ).toBe('tipoNoAdmitido');
  });

  it('justo en el límite se acepta', () => {
    // Un `>=` en vez de un `>` dejaría fuera el archivo del tamaño exacto que
    // el esquema sí admite.
    expect(
      motivoDeRechazo({ tipo: 'application/pdf', contenido: new Uint8Array(TAMANO_MAXIMO_BYTES) }),
    ).toBeNull();
  });

  it('un byte por encima se rechaza', () => {
    expect(
      motivoDeRechazo({
        tipo: 'application/pdf',
        contenido: new Uint8Array(TAMANO_MAXIMO_BYTES + 1),
      }),
    ).toBe('demasiadoGrande');
  });
});

describe('ruta en el cubo', () => {
  it('es exactamente usuario y archivo separados por una barra', () => {
    // La restricción `private_media_ruta_propia` de la migración 0016 exige
    // esta forma literal: cualquier otra cosa deja de escribir.
    expect(rutaEnCubo('usuario-1', 'archivo-1')).toBe('usuario-1/archivo-1');
  });
});
