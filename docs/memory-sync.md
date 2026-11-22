# Sincronización privada de la memoria de Karen

## Estado real

El protocolo de combinación, el transporte cifrado y un servidor Node autoalojable están implementados y tienen pruebas automatizadas. **Todavía no hay un servidor desplegado ni sincronización activa entre los dispositivos.** La interfaz para conectar el servidor ya está añadida a los ajustes de Karen; solo funcionará cuando exista un servidor accesible y el usuario introduzca su URL, token y frase secreta.

## Arquitectura

- `memory-store.mjs`: conserva los recuerdos localmente y exige consentimiento para guardarlos.
- `memory-sync.mjs`: combina recuerdos de varios dispositivos, detecta conflictos y usa revisiones compare-and-swap para evitar sobrescrituras silenciosas.
- `memory-sync-transport.mjs`: cifra el paquete completo en el dispositivo con AES-256-GCM antes de enviarlo. La clave se deriva de una frase secreta con PBKDF2-SHA-256 (310.000 iteraciones). La frase nunca se envía al servidor.
- `server/memory-sync-server.mjs`: servidor Node que almacena solo sobres cifrados, exige token de acceso y aplica escrituras condicionales.

El servidor no es un cerebro ni una IA externa: únicamente guarda un paquete cifrado para que los dispositivos autorizados puedan compartir sus recuerdos.

## Preparar el servidor

Requisitos: Node.js 20 o superior y un servidor propio o alojamiento Node que permanezca disponible. Ejecutar el servidor detrás de HTTPS (por ejemplo, mediante un proxy inverso con TLS). No exponerlo directamente a Internet sin HTTPS.

Genera un token aleatorio largo y configura variables de entorno. Ejemplo en Linux:

```bash
export KAREN_SYNC_TOKEN="$(openssl rand -hex 32)"
export KAREN_SYNC_ORIGIN="https://TU-DOMINIO-DE-KAREN"
export KAREN_SYNC_FILE="$HOME/.karen/memory-vault.json"
node server/memory-sync-server.mjs
```

En Windows PowerShell, configura las mismas variables con `$env:KAREN_SYNC_TOKEN`, `$env:KAREN_SYNC_ORIGIN` y `$env:KAREN_SYNC_FILE`. El token debe ser idéntico en los dispositivos autorizados y no debe guardarse en GitHub. El origen debe coincidir exactamente con el dominio desde el que se sirve Karen.

El servidor guarda por defecto en `~/.karen/memory-vault.json`, fuera del repositorio. Está diseñado para una sola instancia/proceso y una bóveda privada; no debe ejecutarse con varias réplicas que compartan el mismo archivo.

## Despliegue con Docker

En un servidor Linux que permanezca disponible:

1. Clona el repositorio y copia `.env.example` a `.env`.
2. Genera un token aleatorio (por ejemplo, `openssl rand -hex 32`) y colócalo en `KAREN_SYNC_TOKEN`. No compartas ni subas `.env`.
3. Configura `KAREN_SYNC_ORIGIN` con el origen HTTPS exacto de la aplicación Karen.
4. Ejecuta `docker compose up -d --build`.
5. Configura un proxy inverso con TLS que reenvíe a `127.0.0.1:8787`. El contenedor no termina HTTPS por sí mismo.
6. Comprueba `https://TU-DOMINIO/v1/memory` desde la aplicación Karen. La ruta requiere autenticación; `/health` sirve para comprobar el proceso.

Los datos persistentes quedan en `./karen-data`, ignorado por Git. Haz una copia cifrada y segura del volumen. El servidor actual es de una sola instancia/proceso; no lo escales horizontalmente compartiendo el mismo archivo.

## Alternativa sin ordenador encendido: Cloudflare Worker + D1

También se incluye un backend opcional para Cloudflare. Es un servicio de almacenamiento, no una IA: guarda únicamente el paquete cifrado. Puede atender a Karen aunque tu ordenador personal esté apagado, sujeto a las cuotas y condiciones actuales del plan de Cloudflare. Requiere una cuenta y una configuración inicial; no se ha desplegado desde este repositorio.

1. Instala Node.js y Wrangler, e inicia sesión con `npx wrangler login`.
2. Crea la base: `npx wrangler d1 create karen-memory-vault`.
3. Copia el `database_id` que devuelve el comando en `wrangler.toml`, sustituyendo el marcador.
4. Inicializa el esquema: `npx wrangler d1 execute karen-memory-vault --remote --file=server/schema.sql`.
5. Crea un token largo: `openssl rand -hex 32`; guárdalo como secreto con `npx wrangler secret put KAREN_SYNC_TOKEN`.
6. Comprueba que `KAREN_SYNC_ORIGIN` en `wrangler.toml` coincide con el origen HTTPS de Karen.
7. Despliega: `npx wrangler deploy`. Usa la URL HTTPS del Worker en el panel de sincronización de Karen.

La frase de cifrado se introduce en cada dispositivo y no se envía a Cloudflare. El token autoriza el acceso a la bóveda, pero por sí solo no descifra los recuerdos. Consulta los límites vigentes de Workers y D1 antes de depender de este servicio.

## Conectar desde el cliente

La aplicación debe pedir al usuario, durante la sesión de sincronización:

- URL HTTPS del servidor.
- Token de acceso.
- Frase secreta de cifrado (mínimo 12 caracteres; es recomendable una frase larga y única).

No guardar el token ni la frase de cifrado en localStorage, en la URL ni en el repositorio. El usuario debe introducir la misma frase en cada dispositivo. Perderla significa perder la capacidad de descifrar la copia remota.

Ejemplo de integración:

```js
const transport = createEncryptedMemoryTransport({
  baseUrl: "https://TU-DOMINIO-DE-KAREN",
  accessToken,
  passphrase
});
const sync = createMemorySync({ memory, transport, deviceId });

// Primero mostrar una previsualización y pedir autorización.
// Después, ejecutar sync.sync() tras la confirmación del usuario.
```

Ambas funciones están exportadas desde `js/neural-core/index.js`.

## Protección de datos y conflictos

- El servidor recibe y almacena ciphertext; no recibe el texto de los recuerdos ni la frase secreta.
- AES-GCM autentica el contenido; si se usa una frase incorrecta o el paquete se altera, el descifrado falla y no se importa.
- El servidor requiere un token de al menos 32 caracteres y solo permite el origen web configurado.
- Las escrituras usan compare-and-swap; si otro dispositivo cambia la revisión, el cliente vuelve a leer y combina.
- Si dos dispositivos modifican el mismo recuerdo de forma incompatible, ambas versiones se conservan como inciertas para revisión.
- **Las eliminaciones todavía no se propagan** porque el almacén no conserva marcas de borrado (tombstones). No se borran recuerdos automáticamente durante la sincronización.

## Pruebas

`tests/memory-sync.test.mjs` cubre combinación, conflictos y concurrencia. `tests/memory-sync-transport.test.mjs` verifica cifrado y rechazo de frases incorrectas. `tests/memory-sync-server.test.mjs` verifica autenticación, control de origen, ciphertext obligatorio y compare-and-swap.

## Interfaz de Karen

En Ajustes aparece el panel **Memoria privada entre dispositivos**. El botón de previsualización comprueba el servidor y calcula la combinación sin escribir. El botón de sincronización pide confirmación antes de guardar. El token y la frase se mantienen solo en memoria durante esa operación y los campos se vacían después. La dirección del servidor no se guarda automáticamente.
