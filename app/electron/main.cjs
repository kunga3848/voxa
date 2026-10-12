const { app, BrowserWindow, shell, session } = require("electron");
const path = require("node:path");

function createWindow() {
  const win = new BrowserWindow({
    width: 1280, height: 860, minWidth: 380, minHeight: 600,
    title: "Voxa", backgroundColor: "#F2F3F6", autoHideMenuBar: true,
    icon: path.join(__dirname, "..", "build", "icon.png"),
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  // Liens externes : navigateur par défaut.
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: "deny" }; });
}

app.whenReady().then(() => {
  // Micro autorisé pour l'enregistrement d'échantillons de voix.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(permission === "media"));
  // Moteur de test cloud : l'app est chargée depuis file://, on garantit les en-têtes CORS du Space Hugging Face.
  session.defaultSession.webRequest.onHeadersReceived({ urls: ["https://*.hf.space/*"] }, (details, cb) => {
    const headers = { ...details.responseHeaders };
    for (const k of Object.keys(headers)) if (k.toLowerCase().startsWith("access-control-")) delete headers[k];
    headers["Access-Control-Allow-Origin"] = ["*"];
    headers["Access-Control-Allow-Headers"] = ["*"];
    headers["Access-Control-Allow-Methods"] = ["GET, POST, OPTIONS"];
    const preflight = details.method === "OPTIONS";
    cb({ responseHeaders: headers, statusLine: preflight ? "HTTP/1.1 204 No Content" : undefined });
  });
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
