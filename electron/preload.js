"use strict";

const { ipcRenderer } = require("electron");

/* --------------------------------------------------------------------------
   Bridge between the window and the system tray.
   Watches only what already exists in the DOM (status and buttons) and relays it to main.
   -------------------------------------------------------------------------- */

const state = {
  running: false,
  busy: false,
  state: "off",
  bypass: false,
  canStart: false,
};

let lastSent = "";

function readState() {
  const chip = document.getElementById("statusChip");
  const startBtn = document.getElementById("startBtn");
  const bypassBtn = document.getElementById("bypassBtn");

  const chipState = chip?.dataset.state || "off";
  return {
    running: chipState === "live" || chipState === "rec",
    busy: chipState === "busy",
    state: chipState,
    bypass: bypassBtn?.getAttribute("aria-pressed") === "true",
    canStart: Boolean(startBtn) && !startBtn.disabled,
  };
}

function publish(force = false) {
  const next = readState();
  const serialized = JSON.stringify(next);
  if (!force && serialized === lastSent) return;

  Object.assign(state, next);
  lastSent = serialized;
  ipcRenderer.send("ui-state", state);
}

function clickIfEnabled(id) {
  const button = document.getElementById(id);
  if (!button || button.disabled) return false;
  button.click();
  return true;
}

function toggleMic() {
  if (clickIfEnabled("startBtn")) return;
  clickIfEnabled("stopBtn");
}

function toggleBypass() {
  clickIfEnabled("bypassBtn");
}

ipcRenderer.on("desktop:action", (_event, action) => {
  if (action === "toggle-mic") toggleMic();
  else if (action === "toggle-bypass") toggleBypass();

  // Reflect the result in the menu immediately.
  window.setTimeout(() => publish(true), 120);
});

function startWatching() {
  publish(true);

  const observer = new MutationObserver(() => publish());
  const targets = ["statusChip", "bypassBtn", "startBtn", "stopBtn"];
  for (const id of targets) {
    const node = document.getElementById(id);
    if (!node) continue;
    observer.observe(node, {
      attributes: true,
      attributeFilter: ["data-state", "aria-pressed", "disabled", "aria-busy", "hidden"],
    });
  }

  // Safety net for changes that do not go through attributes.
  window.setInterval(() => publish(), 2000);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startWatching, { once: true });
} else {
  startWatching();
}
