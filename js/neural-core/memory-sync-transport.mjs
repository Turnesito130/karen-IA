/**
 * Client-side encrypted transport for Karen memory sync.
 * The server stores only AES-GCM ciphertext; the passphrase never leaves this module.
 */
const CIPHER_FORMAT = "karen-memory-ciphertext";
const CIPHER_VERSION = 1;
const AAD = new TextEncoder().encode("karen-memory-sync-v1");

function encodeBase64(bytes) {
  let binary = "";
  for (let i=0;i<bytes.length;i+=0x8000) binary += String.fromCharCode(...bytes.subarray(i, i+0x8000));
  return btoa(binary);
}
function decodeBase64(value) {
  if (typeof value !== "string" || value.length > 6_000_000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
    throw new TypeError("Dato cifrado en Base64 no válido.");
  }
  const binary = atob(value), bytes = new Uint8Array(binary.length);
  for (let i=0;i<binary.length;i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
function validateCipherEnvelope(value) {
  if (!value || typeof value !== "object" || value.format !== CIPHER_FORMAT || value.version !== CIPHER_VERSION) {
    throw new TypeError("El servidor no devolvió un paquete cifrado compatible.");
  }
  const salt = decodeBase64(value.salt), iv = decodeBase64(value.iv), ciphertext = decodeBase64(value.ciphertext);
  if (salt.length !== 16 || iv.length !== 12 || ciphertext.length < 16 || ciphertext.length > 4_000_000) {
    throw new TypeError("El paquete cifrado tiene tamaños no válidos.");
  }
  return { format:CIPHER_FORMAT, version:CIPHER_VERSION, salt:value.salt, iv:value.iv, ciphertext:value.ciphertext };
}
async function deriveKey(cryptoImpl, passphrase, salt) {
  const material = await cryptoImpl.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return cryptoImpl.subtle.deriveKey({ name:"PBKDF2", salt, iterations:310000, hash:"SHA-256" },
    material, { name:"AES-GCM", length:256 }, false, ["encrypt","decrypt"]);
}

export function createEncryptedMemoryTransport({
  baseUrl, accessToken, passphrase, fetchImpl=globalThis.fetch, cryptoImpl=globalThis.crypto
} = {}) {
  if (typeof baseUrl !== "string" || !/^https:\/\/[^/]+(?:\/)?$/i.test(baseUrl) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(?:\/)?$/i.test(baseUrl)) {
    throw new TypeError("Indica solo el dominio HTTPS del servidor (HTTP se permite únicamente en localhost).");
  }
  if (typeof accessToken !== "string" || accessToken.length < 32 || accessToken.length > 4096) {
    throw new TypeError("El token de acceso debe tener al menos 32 caracteres.");
  }
  if (typeof passphrase !== "string" || passphrase.length < 12 || passphrase.length > 1024) {
    throw new TypeError("La frase de cifrado debe tener al menos 12 caracteres.");
  }
  if (typeof fetchImpl !== "function" || !cryptoImpl?.subtle || typeof cryptoImpl.getRandomValues !== "function") {
    throw new TypeError("Este dispositivo no dispone de Fetch y Web Crypto compatibles.");
  }
  const endpoint = baseUrl.replace(/\/+$/,"") + "/v1/memory";
  let lastSalt = null;

  async function request(path, options={}) {
    const response = await fetchImpl(path, {
      ...options,
      headers:{ "Authorization":"Bearer "+accessToken, "Content-Type":"application/json", ...(options.headers||{}) },
      cache:"no-store"
    });
    return response;
  }
  async function read() {
    const response = await request(endpoint, { method:"GET" });
    if (!response.ok) throw new Error("No se pudo leer el almacén de memoria (HTTP "+response.status+").");
    const data = await response.json();
    if (!data || (data.revision !== null && typeof data.revision !== "string")) throw new TypeError("Respuesta de memoria remota no válida.");
    if (data.envelope === null) { lastSalt=null; return { revision:data.revision, envelope:null }; }
    const cipher = validateCipherEnvelope(data.envelope);
    const salt = decodeBase64(cipher.salt), iv = decodeBase64(cipher.iv);
    const key = await deriveKey(cryptoImpl, passphrase, salt);
    let plaintext;
    try {
      plaintext = await cryptoImpl.subtle.decrypt({ name:"AES-GCM", iv, additionalData:AAD }, key, decodeBase64(cipher.ciphertext));
    } catch {
      throw new Error("No se pudo descifrar la memoria. Comprueba la frase de cifrado; no se ha modificado nada.");
    }
    lastSalt = salt;
    let envelope;
    try { envelope = JSON.parse(new TextDecoder().decode(plaintext)); }
    catch { throw new TypeError("El contenido descifrado no es un paquete JSON válido."); }
    return { revision:data.revision, envelope };
  }
  async function compareAndSwap({ expectedRevision, envelope }) {
    let salt = lastSalt;
    if (expectedRevision === null) {
      salt = cryptoImpl.getRandomValues(new Uint8Array(16));
    }
    if (!(salt instanceof Uint8Array) || salt.length !== 16) {
      throw new Error("Lee primero la memoria remota antes de intentar sincronizar.");
    }
    const iv = cryptoImpl.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(cryptoImpl, passphrase, salt);
    const plaintext = new TextEncoder().encode(JSON.stringify(envelope));
    const ciphertext = await cryptoImpl.subtle.encrypt({ name:"AES-GCM", iv, additionalData:AAD }, key, plaintext);
    const payload = { format:CIPHER_FORMAT, version:CIPHER_VERSION, salt:encodeBase64(salt),
      iv:encodeBase64(iv), ciphertext:encodeBase64(new Uint8Array(ciphertext)) };
    const headers = expectedRevision === null ? { "If-None-Match":"*" } : { "If-Match":'"'+expectedRevision+'"' };
    const response = await request(endpoint, { method:"PUT", headers, body:JSON.stringify({ envelope:payload }) });
    if (response.status === 412) return { ok:false };
    if (!response.ok) throw new Error("No se pudo guardar la memoria cifrada (HTTP "+response.status+").");
    const result = await response.json();
    if (typeof result.revision !== "string") throw new TypeError("El servidor no confirmó una revisión válida.");
    lastSalt = salt;
    return { ok:true, revision:result.revision };
  }
  return Object.freeze({ read, compareAndSwap });
}

export { validateCipherEnvelope };
