const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("api", {
  listar: () => ipcRenderer.invoke("listar"),
  abrir: (id, opts) => ipcRenderer.invoke("abrir", id, opts),
  montar: (id, frames, opts) => ipcRenderer.invoke("montar", id, frames, opts),
  ping: () => ipcRenderer.invoke("ping"),
  cfg: () => ipcRenderer.invoke("cfg"),
  salvarCfg: c => ipcRenderer.invoke("salvarCfg", c),
  pasta: id => ipcRenderer.invoke("pasta", id),
  tamanho: ids => ipcRenderer.invoke("tamanho", ids),
  apagar: ids => ipcRenderer.invoke("apagar", ids),
  onAtualizar: fn => ipcRenderer.on("atualizar", () => fn())
});
