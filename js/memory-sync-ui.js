/* Karen · Sincronización privada de memoria. Las credenciales solo viven en memoria durante la operación. */
(function setupKarenMemorySync(){
  const settings=document.getElementById("set");
  if(!settings||document.getElementById("karenMemorySyncPanel"))return;
  const panel=document.createElement("section");
  panel.id="karenMemorySyncPanel";
  panel.innerHTML='<h3>Memoria privada entre dispositivos</h3><p>Conecta un servidor privado de Karen. Los recuerdos se cifran en este dispositivo antes de enviarse. No se guardan aquí el token ni la frase de cifrado.</p><label for="karenSyncUrl">Dirección HTTPS del servidor</label><input id="karenSyncUrl" type="url" autocomplete="url" placeholder="https://tu-servidor.example"><label for="karenSyncToken">Token de acceso</label><input id="karenSyncToken" type="password" autocomplete="off" placeholder="Token privado del servidor"><label for="karenSyncPassphrase">Frase secreta de cifrado</label><input id="karenSyncPassphrase" type="password" autocomplete="off" placeholder="La misma frase en todos tus dispositivos"><button id="karenSyncPreview" class="sbtn" type="button">Comprobar y previsualizar</button><button id="karenSyncRun" class="sbtn" type="button" disabled>Sincronizar memoria</button><p id="karenSyncStatus" role="status" aria-live="polite">Todavía no hay un servidor configurado.</p>';
  settings.appendChild(panel);
  const $id=id=>document.getElementById(id);
  let pending=null;
  const deviceKey="karen_memory_device_id";
  function deviceId(){
    try{
      let id=localStorage.getItem(deviceKey);
      if(!id){id=globalThis.crypto?.randomUUID?.()||("device-"+Math.random().toString(36).slice(2)+Date.now().toString(36));localStorage.setItem(deviceKey,id);}
      return id;
    }catch{return "session-"+Math.random().toString(36).slice(2);}
  }
  function status(message){$id("karenSyncStatus").textContent=message;}
  function clearSecrets(){ $id("karenSyncToken").value="";$id("karenSyncPassphrase").value="";pending=null;$id("karenSyncRun").disabled=true; }
  $id("karenSyncPreview").addEventListener("click",async()=>{
    const button=$id("karenSyncPreview");button.disabled=true;clearSecrets();
    const url=$id("karenSyncUrl").value.trim(),token=$id("karenSyncToken").value,passphrase=$id("karenSyncPassphrase").value;
    // Captura antes de limpiar: no se persiste en almacenamiento.
    const accessToken=token,secret=passphrase;
    try{
      const [memoryModule,transportModule,syncModule]=await Promise.all([
        EDModules.import("./neural-core/memory-store.mjs"),
        EDModules.import("./neural-core/memory-sync-transport.mjs"),
        EDModules.import("./neural-core/memory-sync.mjs")
      ]);
      const memory=await getStructuredMemory();
      const transport=transportModule.createEncryptedMemoryTransport({baseUrl:url,accessToken,passphrase:secret});
      const sync=syncModule.createMemorySync({memory,transport,deviceId:deviceId()});
      const preview=await sync.preview();
      pending={sync,accessToken,secret};
      const conflictCount=preview.conflicts?.length||0;
      status("Previsualización lista. Recuerdos locales: "+preview.localCount+
        (preview.remoteEmpty?" · servidor vacío":" · recuerdos nuevos para combinar: "+preview.added)+
        " · conflictos: "+conflictCount+". No se ha modificado nada.");
      $id("karenSyncRun").disabled=false;
    }catch(error){clearSecrets();status("No se pudo conectar: "+(error?.message||String(error)));}
    finally{button.disabled=false;}
  });
  $id("karenSyncRun").addEventListener("click",async()=>{
    if(!pending)return;
    const previewMessage=$id("karenSyncStatus").textContent;
    if(!window.confirm(previewMessage+" ¿Quieres continuar? No se borrarán recuerdos locales."))return;
    const button=$id("karenSyncRun");button.disabled=true;
    try{
      const result=await pending.sync.sync();
      status("Sincronización terminada. Recuerdos combinados: "+result.count+
        " · nuevos: "+result.added+" · conflictos para revisar: "+result.conflicts.length+
        ". Las eliminaciones aún no se sincronizan.");
    }catch(error){status("No se pudo completar la sincronización: "+(error?.message||String(error)));}
    finally{clearSecrets();}
  });
})();
