# Sincronización de memoria de Karen

## Estado

El protocolo está implementado en `js/neural-core/memory-sync.mjs` y cubierto por pruebas automatizadas. **No hay todavía un servidor conectado ni sincronización activa entre dispositivos.** La memoria actual sigue guardándose localmente hasta que la aplicación proporcione un transporte remoto seguro.

## Contrato del transporte

`createMemorySync({ memory, transport, deviceId })` necesita un transporte con dos métodos:

- `read()` devuelve `{ revision: string | null, envelope: object | null }`.
- `compareAndSwap({ expectedRevision, envelope })` guarda el paquete solo si la revisión actual coincide y devuelve `{ ok: boolean, revision?: string }`.

La escritura debe ser atómica: si otro dispositivo cambió el paquete desde la lectura, debe devolver `{ ok: false }`. El protocolo vuelve a leer y reintenta un número limitado de veces. No se debe implementar el contrato con una escritura ciega de tipo "último gana".

## Seguridad obligatoria antes de conectar un servidor

1. El transporte debe autenticar al usuario y autorizar únicamente su espacio privado.
2. El contenido debe viajar cifrado mediante HTTPS y, para datos personales, debe añadirse cifrado de extremo a extremo antes de persistirlo en el servidor.
3. Las credenciales nunca se guardan en el repositorio, el navegador en texto plano ni dentro de los paquetes de memoria.
4. El servidor no debe usar GitHub como base de datos de recuerdos.
5. La aplicación debe permitir revisar una previsualización antes de la primera sincronización.

El módulo no incluye red, autenticación, cifrado ni almacenamiento en la nube. Esas responsabilidades pertenecen al transporte que se conecte más adelante.

## Conflictos y eliminaciones

- Los recuerdos nuevos se combinan por identificador.
- Si el mismo identificador tiene contenidos diferentes, se conservan ambas versiones y se marcan como `uncertain`; no se elige una silenciosamente.
- La sincronización no borra recuerdos locales.
- **Las eliminaciones todavía no se propagan entre dispositivos**: el almacén actual no conserva marcas de borrado (tombstones). No se debe presentar esta versión como sincronización completa hasta implementar y probar esas marcas.

## Uso

```js
const sync = createMemorySync({ memory, transport, deviceId: "phone-unique-id" });

// Solo calcula qué cambiaría; no escribe ni importa nada.
const preview = await sync.preview();

// Sincroniza después de que la aplicación haya obtenido autorización del usuario.
const result = await sync.sync();
```

`sync.sync({ dryRun: true })` también permite simular una sincronización sin modificar el almacenamiento local ni el remoto.

## Pruebas

Las pruebas de `tests/memory-sync.test.mjs` cubren previsualización, intercambio bidireccional, conflictos, modo simulación, paquetes inválidos y cambios concurrentes de revisión.
