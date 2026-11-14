"use strict";

const {
  app,
  BrowserWindow,
  Menu,
  Notification,
  Tray,
  globalShortcut,
  ipcMain,
  nativeImage,
  protocol,
  session,
  shell,
} = require("electron");
const { readFile } = require("node:fs/promises");
const path = require("node:path");

/* -------------------------------------------------------------------------- */
/* Constants                                                                 */
/* -------------------------------------------------------------------------- */

const APP_ROOT = path.join(__dirname, "..");
const APP_ORIGIN = "app://bundle";
const START_HIDDEN = process.argv.includes("--hidden");
const IS_DEV = process.argv.includes("--dev") || !app.isPackaged;

// The first available shortcut in each list is the one used. Some combos may
// be taken by drivers/other apps, so there is always a fallback.
const HOTKEYS = {
  toggleWindow: ["CommandOrControl+Shift+M", "CommandOrControl+Alt+M", "CommandOrControl+Alt+F10"],
  toggleMic: ["CommandOrControl+Alt+L", "CommandOrControl+Shift+Alt+L"],
  toggleBypass: ["CommandOrControl+Alt+B", "CommandOrControl+Shift+Alt+B"],
};

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".md": "text/markdown; charset=utf-8",
  ".wav": "audio/wav",
  ".webm": "audio/webm",
  ".txt": "text/plain; charset=utf-8",
};

/* -------------------------------------------------------------------------- */
/* State                                                                     */
/* -------------------------------------------------------------------------- */

let mainWindow = null;
let tray = null;
let isQuitting = false;
let trayHintShown = false;
let autoLaunchEnabled = false;

const uiState = {
  running: false,
  busy: false,
  state: "off",
  bypass: false,
  canStart: false,
};

const shortcutStatus = {
  toggleWindow: { accelerator: null, registered: false },
  toggleBypass: { accelerator: null, registered: false },
  toggleMic: { accelerator: null, registered: false },
};

/* -------------------------------------------------------------------------- */
/* app:// protocol (secure context, required for getUserMedia)               */
/* -------------------------------------------------------------------------- */

protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true,
    },
  },
]);

function registerAppProtocol() {
  protocol.handle("app", async (request) => {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url).pathname);
    } catch {
      return new Response("Invalid request", { status: 400 });
    }

    if (!pathname || pathname === "/") pathname = "/index.html";

    const filePath = path.normalize(path.join(APP_ROOT, pathname));
    const rootWithSep = APP_ROOT.endsWith(path.sep) ? APP_ROOT : APP_ROOT + path.sep;
    if (!filePath.startsWith(rootWithSep)) {
      return new Response("Forbidden", { status: 403 });
    }

    try {
      const data = await readFile(filePath);
      const type = MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream";
      return new Response(data, {
        status: 200,
        headers: { "Content-Type": type, "Cache-Control": "no-cache" },
      });
    } catch {
      return new Response("File not found", { status: 404 });
    }
  });
}

/* -------------------------------------------------------------------------- */
/* Window                                                                    */
/* -------------------------------------------------------------------------- */

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: "#080b12",
    title: "voiceverb",
    icon: path.join(APP_ROOT, "assets", "icon.png"),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
      autoplayPolicy: "no-user-gesture-required",
      spellcheck: false,
    },
  });

  mainWindow.loadURL(`${APP_ORIGIN}/index.html`);

  mainWindow.once("ready-to-show", () => {
    if (!START_HIDDEN) showWindow();
  });

  mainWindow.on("close", (event) => {
    if (isQuitting) return;
    event.preventDefault();
    hideWindow();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(APP_ORIGIN)) {
      event.preventDefault();
      if (/^https?:/i.test(url)) void shell.openExternal(url);
    }
  });

  mainWindow.webContents.on("did-fail-load", (_event, code, description, url) => {
    console.error(`[voiceverb] failed to load ${url}: ${description} (${code})`);
  });

  if (IS_DEV) {
    mainWindow.webContents.on("console-message", (_event, ...args) => {
      const details = args[0];
      if (details && typeof details === "object" && "message" in details) {
        console.log(`[renderer:${details.level}] ${details.message}`);
      } else {
        console.log(`[renderer] ${args[1] ?? args[0]}`);
      }
    });
  }

  if (IS_DEV) {
    mainWindow.webContents.on("before-input-event", (event, input) => {
      if (input.type === "keyDown" && input.key === "F12") {
        mainWindow.webContents.toggleDevTools();
        event.preventDefault();
      }
    });
  }
}

function showWindow() {
  if (!mainWindow) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function hideWindow() {
  if (!mainWindow) return;
  mainWindow.hide();
  showTrayHint();
}

function toggleWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }
  if (mainWindow.isVisible() && !mainWindow.isMinimized()) {
    hideWindow();
  } else {
    showWindow();
  }
}

function showTrayHint() {
  if (trayHintShown) return;
  trayHintShown = true;
  if (!Notification.isSupported()) return;
  const openShortcut = shortcutStatus.toggleWindow.accelerator;
  new Notification({
    title: "voiceverb continua rodando",
    body: `O app segue ativo na bandeja.${openShortcut ? ` Use ${openShortcut}` : " Clique no ícone"} para reabrir.`,
    icon: path.join(APP_ROOT, "assets", "icon-256.png"),
    silent: true,
  }).show();
}

/* -------------------------------------------------------------------------- */
/* Actions from the tray / global shortcuts                                  */
/* -------------------------------------------------------------------------- */

function sendAction(action) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("desktop:action", action);
}

function toggleMic() {
  sendAction("toggle-mic");
}

function toggleBypass() {
  sendAction("toggle-bypass");
}

function registerShortcuts() {
  const bindings = [
    ["toggleWindow", toggleWindow],
    ["toggleBypass", toggleBypass],
    ["toggleMic", toggleMic],
  ];

  for (const [name, handler] of bindings) {
    for (const accelerator of HOTKEYS[name]) {
      let ok = false;
      try {
        ok = globalShortcut.register(accelerator, handler);
      } catch {
        ok = false;
      }
      if (ok) {
        shortcutStatus[name] = { accelerator, registered: true };
        break;
      }
      console.warn(`[voiceverb] shortcut ${accelerator} unavailable, trying another…`);
    }
    if (!shortcutStatus[name].registered) {
      console.error(`[voiceverb] no global shortcut available for ${name}`);
    }
  }

  buildTrayMenu();
}

/* -------------------------------------------------------------------------- */
/* Tray                                                                      */
/* -------------------------------------------------------------------------- */

function shortcutItems() {
  const format = ({ accelerator, registered }, label) => ({
    label: `${label}: ${accelerator ?? "—"}${registered ? "" : accelerator ? " (em uso por outro app)" : ""}`,
    enabled: false,
  });

  return [
    format(shortcutStatus.toggleWindow, "Mostrar/ocultar"),
    format(shortcutStatus.toggleMic, "Ligar/desligar mic"),
    format(shortcutStatus.toggleBypass, "A/B bypass"),
  ];
}

function buildTrayMenu() {
  if (!tray) return;

  const windowAlive = Boolean(mainWindow && !mainWindow.isDestroyed());
  const visible = windowAlive && mainWindow.isVisible();
  const canControl = windowAlive;

  const template = [
    {
      label: visible ? "Ocultar voiceverb" : "Abrir voiceverb",
      click: () => toggleWindow(),
    },
    { type: "separator" },
    {
      label: uiState.running ? "Desligar microfone" : "Ligar microfone",
      enabled: canControl && (uiState.running || uiState.canStart),
      click: () => toggleMic(),
    },
    {
      label: "A/B bypass",
      type: "checkbox",
      checked: uiState.bypass,
      enabled: canControl && !uiState.busy,
      click: () => toggleBypass(),
    },
    {
      label: uiState.busy ? "Aguarde…" : uiState.running ? "Status: ao vivo" : "Status: desligado",
      enabled: false,
    },
    { type: "separator" },
    {
      label: "Atalhos globais",
      submenu: shortcutItems(),
    },
    {
      label: "Iniciar com o Windows",
      type: "checkbox",
      checked: autoLaunchEnabled,
      click: (item) => setAutoLaunch(item.checked),
    },
    { type: "separator" },
    {
      label: "Sair",
      click: () => quitApp(),
    },
  ];

  tray.setContextMenu(Menu.buildFromTemplate(template));
  const openShortcut = shortcutStatus.toggleWindow.accelerator;
  tray.setToolTip(
    `voiceverb — ${uiState.running ? "ao vivo" : "desligado"}${openShortcut ? ` · ${openShortcut} para abrir` : ""}`,
  );
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(APP_ROOT, "assets", "tray.png"));
  tray = new Tray(icon);
  tray.setIgnoreDoubleClickEvents(false);
  tray.on("click", () => toggleWindow());
  tray.on("double-click", () => showWindow());
  buildTrayMenu();
}

/* -------------------------------------------------------------------------- */
/* Auto launch                                                               */
/* -------------------------------------------------------------------------- */

function autoLaunchArgs() {
  return app.isPackaged ? ["--hidden"] : [app.getAppPath(), "--hidden"];
}

function readAutoLaunch() {
  const settings = app.getLoginItemSettings({
    path: process.execPath,
    args: autoLaunchArgs(),
  });
  autoLaunchEnabled = Boolean(settings.openAtLogin);
}

function setAutoLaunch(enabled) {
  const options = {
    openAtLogin: enabled,
    openAsHidden: enabled,
  };
  if (process.platform === "win32" || !app.isPackaged) {
    options.path = process.execPath;
    options.args = autoLaunchArgs();
  }
  app.setLoginItemSettings(options);
  autoLaunchEnabled = enabled;
  buildTrayMenu();
}

/* -------------------------------------------------------------------------- */
/* Media permissions                                                         */
/* -------------------------------------------------------------------------- */

function configureMediaPermissions() {
  const allowed = new Set(["media", "audioCapture", "videoCapture", "speaker-selection"]);

  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(allowed.has(permission));
  });

  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    return allowed.has(permission);
  });
}

/* -------------------------------------------------------------------------- */
/* Lifecycle                                                                 */
/* -------------------------------------------------------------------------- */

function quitApp() {
  isQuitting = true;
  app.quit();
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    showWindow();
  });

  app.whenReady().then(() => {
    if (process.platform === "win32") {
      app.setAppUserModelId("app.voiceverb.desktop");
    }

    Menu.setApplicationMenu(null);
    registerAppProtocol();
    configureMediaPermissions();
    createWindow();
    createTray();
    readAutoLaunch();
    buildTrayMenu();
    registerShortcuts();

    app.on("activate", () => showWindow());
  });

  app.on("window-all-closed", () => {
    // Keeps the app alive in the tray (Windows/Linux). On macOS this is already the default.
  });

  app.on("before-quit", () => {
    isQuitting = true;
  });

  app.on("will-quit", () => {
    globalShortcut.unregisterAll();
    if (tray) {
      tray.destroy();
      tray = null;
    }
  });
}

/* -------------------------------------------------------------------------- */
/* IPC                                                                        */
/* -------------------------------------------------------------------------- */

ipcMain.on("ui-state", (_event, payload) => {
  if (!payload || typeof payload !== "object") return;

  const next = {
    running: Boolean(payload.running),
    busy: Boolean(payload.busy),
    state: String(payload.state || "off"),
    bypass: Boolean(payload.bypass),
    canStart: Boolean(payload.canStart),
  };

  const changed =
    next.running !== uiState.running ||
    next.busy !== uiState.busy ||
    next.bypass !== uiState.bypass ||
    next.canStart !== uiState.canStart;

  Object.assign(uiState, next);
  if (changed) buildTrayMenu();
});
