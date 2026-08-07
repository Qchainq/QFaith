# QFaith

Fortalece tu relación con Dios.

## Variables de entorno

Hay dos clases y **no se guardan en el mismo sitio**, porque no tienen el
mismo alcance.

### Públicas — van en la aplicación

Todo lo que empieza por `EXPO_PUBLIC_` **se empaqueta dentro del binario** y
acaba en el teléfono de cada persona. Ahí solo puede ir lo que ya es público:

| Variable | Qué es |
| --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | Dirección del proyecto |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Clave publicable. La protege RLS, no el secreto |
| `EXPO_PUBLIC_ENTORNO` | `development`, `staging` o `production` |

Van en `.env.local`, que `.gitignore` ya excluye. `.env.example` documenta los
nombres y nunca lleva valores.

### Secretas — nunca en la aplicación

> **`QFAITH_SUPABASE_SECRET` salta RLS por completo.** Con ella se lee y se
> escribe el contenido de cualquier persona. No lleva el prefijo
> `EXPO_PUBLIC_` a propósito: si lo llevara, Expo la empaquetaría en el binario
> y estaría en todos los teléfonos, de donde no se puede retirar.

Solo la necesita `npm run supabase:verificar` para su fase autenticada, que
crea dos cuentas de prueba y comprueba el aislamiento entre ellas. La
aplicación no la usa nunca.

Dónde ponerla, según dónde trabajes:

**En tu máquina.** En `.env.local`, junto a las públicas. El script la lee
solo si el archivo existe:

```
QFAITH_SUPABASE_SECRET=sb_secret_...
```

O, para una sola ejecución y sin dejarla escrita en ningún sitio:

```
QFAITH_SUPABASE_SECRET=sb_secret_... npm run supabase:verificar
```

**En una sesión remota de Claude Code.** En las variables de entorno del
entorno, donde ya están las públicas
([documentación](https://code.claude.com/docs/en/claude-code-on-the-web)). No
la pegues en el chat: la conversación se conserva, y una clave que ha pasado
por ahí hay que rotarla.

**En integración continua.** Como *secret* del repositorio, nunca en el YAML.
Hoy no hace falta: el trabajo de esquema levanta su propio PostgreSQL y no
toca el proyecto real.

### Si una clave secreta se ha expuesto

Rotarla en el panel de Supabase (*Project Settings → API*). La anterior deja
de valer al instante; no hay nada que limpiar en el repositorio porque nunca
llega a escribirse en él.

## Comprobaciones

| Comando | Qué hace |
| --- | --- |
| `npm run verify` | Lint, formato, tipos y las pruebas |
| `npm test` | Solo las pruebas |
| `npm run medir` | Mide el rendimiento contra los presupuestos del Documento 14 |
| `bash supabase/tests/ejecutar-pruebas.sh` | Migraciones y aislamiento sobre un PostgreSQL local |
| `npm run supabase:verificar` | Lo mismo contra el proyecto real |

Las dos últimas se complementan: la local corre sobre un sustituto del esquema
`auth` de Supabase, y la remota usa sesiones y JWT de verdad, que es lo único
que confirma que `auth.uid()` se comporta como se espera. Sin la clave
secreta, la remota ejecuta igualmente todo lo que no necesita dos sesiones.

`npm run medir` va aparte de `npm test` a propósito: sus números dependen de
la máquina, y una comprobación de tiempo mezclada con las demás acaba fallando
en integración continua un día cualquiera. Lo que sí exige son propiedades que
no dependen de la máquina —que abrir una pantalla no cueste proporcional a
todo lo que la persona ha escrito— y esas sí viajan al teléfono.

## Documentación

La especificación son los quince documentos de
[`docs/master-prompt/`](docs/master-prompt/README.md). Para trabajar en un
área concreta, carga su skill: [`CLAUDE.md`](CLAUDE.md) tiene la tabla.
