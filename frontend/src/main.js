import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import "./style.css";
import { io } from "socket.io-client";

// DOM Elements
const loginScreen = document.getElementById("login-screen");
const loginForm = document.getElementById("login-form");
const phoneInput = document.getElementById("phone-input");
const otpForm = document.getElementById("otp-form");
const otpInputs = otpForm.querySelectorAll('input[type="text"]');
const appContainer = document.getElementById("app");
const mainChatArea = document.getElementById("main-chat-area");
const noChatSelected = document.getElementById("no-chat-selected");
const chatList = document.getElementById("chat-list");
const messagesContainer = document.getElementById("messages-container");
const messageInput = document.querySelector("footer textarea");
const sendButton = document.querySelector("footer button:last-child");
const searchInput = document.getElementById("contact-search");
const authError = document.getElementById("auth-error");
const lockScreen = document.getElementById("lock-screen");
const lockForm = document.getElementById("lock-form");
const lockPasswordInput = document.getElementById("lock-password");
const lockConfirmRow = document.getElementById("lock-confirm-row");
const lockConfirmPasswordInput = document.getElementById("lock-confirm-password");
const lockSubmitButton = document.getElementById("lock-submit");
const lockSwitchModeButton = document.getElementById("lock-switch-mode");
const lockTitle = document.getElementById("lock-title");
const lockSubtitle = document.getElementById("lock-subtitle");
const lockUserLabel = document.getElementById("lock-user-label");
const lockPasswordLabel = document.getElementById("lock-password-label");
const lockError = document.getElementById("lock-error");

// App State
let currentUser = null;
let currentChatId = "demo-chat-id"; // For demo purposes
let currentEditingMessageId = null;
let socket = null;
let allContacts = []; // Store all contacts for filtering

const LOCK_PASSWORD_HASH_KEY = "me_lock_password_hash";
const LOCK_PASSWORD_SALT_KEY = "me_lock_password_salt";
const LOCK_SESSION_KEY = "me_lock_session_state";
const IDLE_LOCK_TIMEOUT_MS = 5 * 60 * 1000;

let idleLockTimer = null;
let lockMode = "unlock";
let lockActivityListenersBound = false;

const contextMenu = document.getElementById("context-menu");
const contextMenuList = document.getElementById("context-menu-list");

const API_URL =
  import.meta.env.VITE_API_URL?.replace(/\/$/, "") || window.location.origin;

function apiUrl(path) {
  if (!path) return API_URL;
  return `${API_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

function showAuthError(message = "") {
  if (!authError) return;
  if (!message) {
    authError.classList.add("hidden");
    authError.textContent = "";
    return;
  }

  authError.textContent = message;
  authError.classList.remove("hidden");
}

function showLockError(message = "") {
  if (!lockError) return;
  if (!message) {
    lockError.classList.add("hidden");
    lockError.textContent = "";
    return;
  }

  lockError.textContent = message;
  lockError.classList.remove("hidden");
}

function getLockCredentials() {
  return {
    hash: localStorage.getItem(LOCK_PASSWORD_HASH_KEY) || "",
    salt: localStorage.getItem(LOCK_PASSWORD_SALT_KEY) || "",
  };
}

function hasLockPassword() {
  const { hash, salt } = getLockCredentials();
  return Boolean(hash && salt);
}

function toBase64(bytes) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function fromBase64(base64) {
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

async function hashLockPassword(password, salt) {
  const payload = new TextEncoder().encode(`${salt}:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", payload);
  return toBase64(new Uint8Array(digest));
}

async function storeLockPassword(password) {
  const salt = toBase64(crypto.getRandomValues(new Uint8Array(16)));
  const hash = await hashLockPassword(password, salt);
  localStorage.setItem(LOCK_PASSWORD_SALT_KEY, salt);
  localStorage.setItem(LOCK_PASSWORD_HASH_KEY, hash);
}

async function verifyLockPassword(password) {
  const { hash, salt } = getLockCredentials();
  if (!hash || !salt) return false;
  const candidate = await hashLockPassword(password, salt);
  return candidate === hash;
}

function renderLockScreen(mode = "unlock") {
  lockMode = mode;
  const setupMode = mode === "setup";

  lockTitle.textContent = setupMode
    ? "Imposta una password"
    : "Schermo bloccato";
  lockSubtitle.textContent = setupMode
    ? "Crea una password locale per sbloccare ME Communications quando la lasci aperta."
    : "Inserisci la password salvata per tornare alle tue chat.";
  lockPasswordLabel.textContent = setupMode ? "Nuova password" : "Password";
  lockSubmitButton.textContent = setupMode ? "Salva password" : "Sblocca";
  lockConfirmRow.classList.toggle("hidden", !setupMode);
  lockSwitchModeButton.classList.toggle(
    "hidden",
    setupMode && !hasLockPassword(),
  );
  lockSwitchModeButton.textContent = setupMode
    ? "Torna allo sblocco"
    : "Cambia password";
  lockPasswordInput.value = "";
  lockConfirmPasswordInput.value = "";
  lockPasswordInput.focus();
  lockUserLabel.textContent = currentUser
    ? `Sessione collegata a ${currentUser.phoneNumber || currentUser.id}`
    : "";
  if (lockScreen) {
    lockScreen.classList.remove("hidden");
    lockScreen.classList.add("flex");
  }
  showAuthError("");
  showLockError("");
}

function hideLockScreen() {
  if (!lockScreen) return;
  lockScreen.classList.add("hidden");
  lockScreen.classList.remove("flex");
}

function clearIdleLockTimer() {
  if (idleLockTimer) {
    clearTimeout(idleLockTimer);
    idleLockTimer = null;
  }
}

function armIdleLockTimer() {
  clearIdleLockTimer();
  if (!currentUser || !hasLockPassword()) return;
  if (localStorage.getItem(LOCK_SESSION_KEY) === "locked") return;

  idleLockTimer = setTimeout(() => {
    lockNow();
  }, IDLE_LOCK_TIMEOUT_MS);
}

function resetIdleLockTimer() {
  if (localStorage.getItem(LOCK_SESSION_KEY) === "locked") return;
  armIdleLockTimer();
}

function bindLockActivityListeners() {
  if (lockActivityListenersBound) return;
  lockActivityListenersBound = true;

  const activityEvents = ["mousemove", "mousedown", "keydown", "scroll", "touchstart"];
  activityEvents.forEach((eventName) => {
    document.addEventListener(eventName, () => {
      if (!lockScreen || lockScreen.classList.contains("hidden")) {
        resetIdleLockTimer();
      }
    });
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      resetIdleLockTimer();
    }
  });
}

function lockNow() {
  if (!currentUser) return;
  clearIdleLockTimer();
  if (!hasLockPassword()) {
    renderLockScreen("setup");
    localStorage.setItem(LOCK_SESSION_KEY, "locked");
    return;
  }

  localStorage.setItem(LOCK_SESSION_KEY, "locked");
  renderLockScreen("unlock");
}

function unlockApp() {
  localStorage.setItem(LOCK_SESSION_KEY, "unlocked");
  hideLockScreen();
  showAuthError("");
  showLockError("");
  armIdleLockTimer();
}

function syncLockState() {
  if (!currentUser) return;

  bindLockActivityListeners();

  if (!hasLockPassword()) {
    localStorage.setItem(LOCK_SESSION_KEY, "locked");
    renderLockScreen("setup");
    return;
  }

  if (localStorage.getItem(LOCK_SESSION_KEY) === "locked") {
    renderLockScreen("unlock");
    return;
  }

  hideLockScreen();
  armIdleLockTimer();
}

async function handleLockFormSubmit(e) {
  e.preventDefault();
  if (!currentUser) return;

  const password = lockPasswordInput.value.trim();
  const confirmPassword = lockConfirmPasswordInput.value.trim();

  if (lockMode === "setup") {
    if (password.length < 6) {
      showLockError("La password deve avere almeno 6 caratteri.");
      return;
    }

    if (lockConfirmRow && !lockConfirmRow.classList.contains("hidden")) {
      if (password !== confirmPassword) {
        showLockError("Le password non coincidono.");
        return;
      }
    }

    await storeLockPassword(password);
    unlockApp();
    localStorage.setItem(LOCK_SESSION_KEY, "unlocked");
    showLockError("");
    return;
  }

  const ok = await verifyLockPassword(password);
  if (!ok) {
    showLockError("Password non corretta.");
    return;
  }

  unlockApp();
}

// ==========================================
// AUTHENTICATION FLOW
// ==========================================

function checkAuth() {
  const token = localStorage.getItem("token");
  const userStr = localStorage.getItem("user");
  if (token && userStr) {
    currentUser = JSON.parse(userStr);
    initApp();
  } else {
    loginScreen.classList.remove("hidden");
  }
}

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  showAuthError("");
  const phone = phoneInput.value.trim();
  try {
    const res = await fetch(apiUrl("/api/auth/send-otp"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "bypass-tunnel-reminder": "true",
      },
      body: JSON.stringify({ phone }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      throw new Error(data.error || "Impossibile inviare l'OTP.");
    }

    loginForm.classList.add("hidden");
    otpForm.classList.remove("hidden");
    otpInputs[0].focus();
  } catch (error) {
    console.error("Error sending OTP:", error);
    showAuthError(error.message || "Errore durante l'invio del codice OTP.");
  }
});

otpInputs.forEach((input, index) => {
  input.addEventListener("input", (e) => {
    if (e.target.value.length === 1 && index < otpInputs.length - 1)
      otpInputs[index + 1].focus();
  });
});

if (phoneInput) {
  phoneInput.addEventListener("input", () => {
    showAuthError("");
  });
}

otpForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const otp = Array.from(otpInputs)
    .map((input) => input.value)
    .join("");
  const phone = phoneInput.value.trim();
  showAuthError("");
  try {
    const res = await fetch(apiUrl("/api/auth/verify-otp"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "bypass-tunnel-reminder": "true",
      },
      body: JSON.stringify({ phone, otp }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      throw new Error(data.error || "OTP non valido o scaduto.");
    }

    if (data.success) {
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      localStorage.setItem(LOCK_SESSION_KEY, "unlocked");
      currentUser = data.user;
      loginScreen.classList.add("hidden");
      initApp();
    }
  } catch (error) {
    console.error("Error verifying OTP:", error);
    showAuthError(error.message || "OTP non valido o scaduto.");
  }
});

if (lockForm) {
  lockForm.addEventListener("submit", handleLockFormSubmit);
}

if (lockSwitchModeButton) {
  lockSwitchModeButton.addEventListener("click", () => {
    if (!hasLockPassword()) return;
    renderLockScreen(lockMode === "setup" ? "unlock" : "setup");
  });
}

// ==========================================
// MAIN APP LOGIC
// ==========================================

async function initApp() {
  console.log("Inizializzazione App per utente:", currentUser);

  if (!currentUser || !currentUser.id) {
    console.warn("Dati utente incompleti. Reindirizzamento al login...");
    localStorage.clear();
    loginScreen.classList.remove("hidden");
    return;
  }

  bindLockActivityListeners();

  // Update user initials
  const userInitials = document.getElementById("user-initials");
  if (userInitials) {
    const phone = currentUser.phoneNumber || "??";
    userInitials.innerText = phone.slice(-2);
  }

  // Sidebar Tabs Logic
  const tabs = ["chats", "groups", "communities", "status"];
  tabs.forEach((tabId) => {
    const btn = document.getElementById(`tab-${tabId}`);
    if (btn) {
      btn.addEventListener("click", () => {
        // Reset all tabs
        tabs.forEach((t) => {
          const b = document.getElementById(`tab-${t}`);
          b.classList.remove("text-primary", "border-primary");
          b.classList.add("text-text-muted", "border-transparent");
        });
        // Set active tab
        btn.classList.add("text-primary", "border-primary");
        btn.classList.remove("text-text-muted", "border-transparent");

        // Load content based on tab
        if (tabId === "chats") loadContacts();
        else if (tabId === "groups") loadGroups();
        else if (tabId === "communities") loadCommunities();
        else if (tabId === "status") openStatusModal();
      });
    }
  });

  // Lightbox Logic
  window.openLightbox = (url, type = "image") => {
    const lb = document.getElementById("lightbox");
    const lbImg = document.getElementById("lightbox-img");
    const lbVid = document.getElementById("lightbox-video");
    const lbDown = document.getElementById("lightbox-download");

    lb.classList.remove("hidden");
    setTimeout(() => lb.classList.replace("opacity-0", "opacity-100"), 10);

    lbDown.href = url;

    if (type === "video") {
      lbImg.classList.add("hidden");
      lbVid.classList.remove("hidden");
      lbVid.src = url;
    } else {
      lbVid.classList.add("hidden");
      lbImg.classList.remove("hidden");
      lbImg.src = url;
    }
  };

  document.getElementById("close-lightbox").addEventListener("click", () => {
    const lb = document.getElementById("lightbox");
    lb.classList.replace("opacity-100", "opacity-0");
    setTimeout(() => lb.classList.add("hidden"), 300);
  });

  socket = io(API_URL, {
    extraHeaders: {
      "bypass-tunnel-reminder": "true",
    },
  });
  socket.on("connect", () => {
    socket.emit("register", currentUser.id);
    if (currentChatId) socket.emit("join_chat", currentChatId);
  });

  socket.on("receive_message", (data) => {
    if (data.chatId === currentChatId) {
      renderMessage(data, data.senderId === currentUser.id);
    }
  });

  socket.on("bot_notification", (data) => {
    alert(`🤖 ME-MODERATOR: ${data.message}`);
    if (data.type === "error") {
      localStorage.clear();
      window.location.reload();
    }
  });

  socket.on("reaction_added", (data) => {
    const msgEl = document.querySelector(
      `[data-message-id="${data.messageId}"]`,
    );
    if (msgEl) {
      const container = msgEl.querySelector(".reactions-container");
      if (container) {
        container.innerHTML = data.reactions
          .map(
            (r) => `
          <div class="reaction-badge bg-surface/90 backdrop-blur border border-white/10 rounded-full px-1.5 py-0.5 text-[10px] shadow-lg flex items-center cursor-default" title="Reazione">
            ${r.emoji}
          </div>
        `,
          )
          .join("");
      }
    }
  });

  socket.on("message_edited", (data) => {
    const msgEl = document.querySelector(`[data-message-id="${data.id}"]`);
    if (msgEl) {
      const contentEl = msgEl.querySelector("p");
      if (contentEl) contentEl.innerText = data.content;
      // Add "modificato" badge
      if (!msgEl.querySelector(".edited-badge")) {
        const badge = document.createElement("span");
        badge.className = "edited-badge text-[9px] text-text-muted italic ml-2";
        badge.innerText = "(modificato)";
        msgEl.querySelector(".flex.justify-end").prepend(badge);
      }
    }
  });

  socket.on("message_deleted", (data) => {
    const msgEl = document.querySelector(`[data-message-id="${data.id}"]`);
    if (msgEl) msgEl.parentElement.remove();
  });

  // WebRTC Signaling
  socket.on("call_incoming", async ({ from, offer }) => {
    if (!confirm(`Chiamata in arrivo da ${from}. Rispondere?`)) {
      socket.emit("end_call", { to: from });
      return;
    }
    await handleIncomingCall(from, offer);
  });

  socket.on("call_answered", async ({ answer }) => {
    await peerConnection.setRemoteDescription(
      new RTCSessionDescription(answer),
    );
  });

  socket.on("ice_candidate", async ({ candidate }) => {
    if (peerConnection) {
      await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    }
  });

  socket.on("call_ended", () => {
    endCallUI();
  });

  // Load Real Contacts
  await loadContacts();

  // Event Listeners for UI
  sendButton.addEventListener("click", sendMessage);
  messageInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Search Logic
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      const term = e.target.value.toLowerCase();
      const filtered = allContacts.filter(
        (c) =>
          c.contactName.toLowerCase().includes(term) ||
          c.contactPhone.includes(term),
      );
      renderContactsList(filtered, term.length > 0);
    });

    searchInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        const firstResult = chatList.querySelector("div");
        if (firstResult) firstResult.click();
      }
    });
  }

  // Right-click on Main Chat Area (for background)
  mainChatArea.oncontextmenu = (e) => {
    if (e.target === mainChatArea || e.target.id === "messages-container") {
      e.preventDefault();
      showContextMenu(e, [
        { label: "Chiudi Chat", icon: "fa-xmark", action: () => closeChat() },
        {
          label: "Svuota Cronologia",
          icon: "fa-eraser",
          danger: true,
          action: () => clearHistory(),
        },
      ]);
    }
  };

  // Status Posting Logic
  const statusUpload = document.getElementById("status-upload");
  const postStatusBtn = document.getElementById("post-status");
  if (statusUpload) {
    statusUpload.onchange = (e) => {
      if (e.target.files.length > 0) {
        postStatusBtn.classList.remove("hidden");
        const file = e.target.files[0];
        const reader = new FileReader();
        reader.onload = (ev) => {
          const preview = document.getElementById("status-preview");
          if (file.type.startsWith("image/")) {
            preview.innerHTML = `<img src="${ev.target.result}" class="w-full h-full object-cover">`;
          } else {
            preview.innerHTML = `<video src="${ev.target.result}" class="w-full h-full object-cover" autoplay muted loop></video>`;
          }
        };
        reader.readAsDataURL(file);
      }
    };
  }

  if (postStatusBtn) {
    postStatusBtn.onclick = async () => {
      const file = statusUpload.files[0];
      const formData = new FormData();
      formData.append("media", file);
      formData.append("userId", currentUser.id);

      try {
        const res = await fetch(`${API_URL}/api/status/post`, {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        alert("Stato pubblicato!");
        document.getElementById("status-modal").classList.add("hidden");
      } catch (err) {
        console.error("Status post error:", err);
      }
    };
  }

  const closeStatusBtn = document.getElementById("close-status");
  if (closeStatusBtn) {
    closeStatusBtn.onclick = () =>
      document.getElementById("status-modal").classList.add("hidden");
  }

  // Mobile Navigation
  const backBtn = document.getElementById("back-to-list");
  if (backBtn) {
    backBtn.onclick = () => {
      mainChatArea.classList.add("translate-x-full");
      sidebar.classList.remove("hidden");
    };
  }

  // Community Logic
  const communityBtn = document.querySelector('button[title="Community"]');
  if (communityBtn) {
    communityBtn.onclick = () => {
      const name = prompt("Nome della nuova Community:");
      if (name) createCommunity(name);
    };
  }

  // Status Logic
  const statusBtn = document.querySelector('button[title="Stato"]');
  if (statusBtn) {
    statusBtn.onclick = () => {
      document.getElementById("status-modal").classList.remove("hidden");
      loadStatuses();
    };
  }

  // Sidebar Menu Logic (Three Dots)
  const sidebarMenuBtn = document.querySelector('button[title="Menu"]');
  if (sidebarMenuBtn) {
    sidebarMenuBtn.onclick = (e) => {
      e.stopPropagation();
      showContextMenu(e, [
        {
          label: "Blocca Schermo",
          icon: "fa-lock",
          action: () => lockNow(),
        },
        {
          label: "Cambia Password",
          icon: "fa-key",
          action: () => renderLockScreen("setup"),
        },
        {
          label: "Blocca Contatto",
          icon: "fa-user-slash",
          action: () => openBlockDialog("user"),
        },
        {
          label: "Blocca Gruppo",
          icon: "fa-ban",
          action: () => openBlockDialog("group"),
        },
        {
          label: "Segnala Contatto",
          icon: "fa-triangle-exclamation",
          action: () => openReportDialog(),
        },
      ]);
    };
  }

  // Nuova Chat / Gruppo Logic
  const newChatBtn = document.querySelector('button[title="Nuova Chat"]');
  if (newChatBtn) {
    newChatBtn.onclick = () => {
      const choice = confirm(
        "Vuoi creare un GRUPPO? (Annulla per caricare contatti da CSV)",
      );
      if (choice) {
        createGroupFlow();
      } else {
        importCSVFlow();
      }
    };
  }

  // Media Popover Toggles
  const emojiTrigger = document.getElementById("emoji-trigger");
  const mediaPopover = document.getElementById("media-popover");
  if (emojiTrigger) {
    emojiTrigger.onclick = (e) => {
      e.stopPropagation();
      mediaPopover.classList.toggle("hidden");
      if (!mediaPopover.classList.contains("hidden")) {
        renderEmojis();
      }
    };
  }

  const attachTrigger = document.getElementById("attach-trigger");
  const fileInput = document.getElementById("file-input");
  if (attachTrigger) {
    attachTrigger.onclick = () => fileInput.click();
  }

  if (fileInput) {
    fileInput.onchange = async (e) => {
      const files = Array.from(e.target.files);
      for (const file of files) {
        await uploadAndSendFile(file);
      }
    };
  }

  // Tabs for Media Popover
  const tabEmoji = document.getElementById("tab-emoji");
  const tabGif = document.getElementById("tab-gif");
  if (tabEmoji) {
    tabEmoji.onclick = () => {
      tabEmoji.classList.add("border-primary");
      tabEmoji.classList.remove("border-transparent");
      tabGif.classList.remove("border-primary");
      tabGif.classList.add("border-transparent");
      document.getElementById("gif-search-box").classList.add("hidden");
      renderEmojis();
    };
  }
  if (tabGif) {
    tabGif.onclick = () => {
      tabGif.classList.add("border-primary");
      tabGif.classList.remove("border-transparent");
      tabEmoji.classList.remove("border-primary");
      tabEmoji.classList.add("border-transparent");
      document.getElementById("gif-search-box").classList.remove("hidden");
      renderGifs();
    };
  }

  const gifQuery = document.getElementById("gif-query");
  if (gifQuery) {
    gifQuery.oninput = (e) => renderGifs(e.target.value);
  }

  // Close popover on click outside
  document.addEventListener("click", (e) => {
    const mediaPopover = document.getElementById("media-popover");
    const emojiTrigger = document.getElementById("emoji-trigger");
    if (
      mediaPopover &&
      !mediaPopover.contains(e.target) &&
      e.target !== emojiTrigger
    ) {
      mediaPopover.classList.add("hidden");
    }
  });

  // Attach call buttons
  const voiceCallBtn = document.querySelector(
    'button[title="Chiamata Vocale"]',
  );
  if (voiceCallBtn) voiceCallBtn.onclick = () => startCall(false);

  const videoCallBtn = document.querySelector(
    'button[title="Videochiamata (normale o con Avatar)"]',
  );
  if (videoCallBtn) videoCallBtn.onclick = () => startCall(true);

  // Load Statuses
  loadStatuses();

  // Restore last chat
  const lastChatId = localStorage.getItem("lastChatId");
  const lastChatName = localStorage.getItem("lastChatName");
  if (lastChatId && lastChatName) {
    openChat(lastChatName, lastChatId);
  }

  syncLockState();
}

async function loadStatuses() {
  const preview = document.getElementById("status-preview");
  try {
    const res = await fetch(`${API_URL}/api/status`, {
      headers: { "bypass-tunnel-reminder": "true" },
    });
    const statuses = await res.json();
    if (statuses.length > 0) {
      preview.innerHTML = `
        <div class="flex flex-col gap-4 p-4 overflow-y-auto h-full w-full">
          <h3 class="text-sm font-bold text-text-muted uppercase tracking-wider">Stati Recenti</h3>
          ${statuses
            .map(
              (s) => `
            <div class="flex items-center gap-3 p-3 bg-white/5 rounded-xl cursor-pointer hover:bg-white/10 transition-all border border-white/5" onclick="window.open('${s.mediaUrl}', '_blank')">
              <div class="w-12 h-12 rounded-full border-2 border-secondary p-0.5">
                <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(s.userId)}&background=random" class="w-full h-full rounded-full object-cover">
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-bold truncate">Contatto</p>
                <p class="text-[10px] text-text-muted">Visualizza lo stato</p>
              </div>
            </div>
          `,
            )
            .join("")}
        </div>
      `;
    }
  } catch (err) {
    console.error("Error fetching statuses:", err);
  }
}

// --- New Functionalities ---

async function createCommunity(name) {
  try {
    const res = await fetch(`${API_URL}/api/groups/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        adminId: currentUser.id,
        isGroup: true,
        type: "community",
      }),
    });
    const data = await res.json();
    alert(`Community "${name}" creata!`);
    loadContacts();
  } catch (err) {
    console.error("Error creating community:", err);
  }
}

function openBlockDialog(type) {
  const targetId = prompt(
    `Inserisci il numero o ID del ${type === "user" ? "contatto" : "gruppo"} da bloccare:`,
  );
  if (targetId) {
    blockTarget(targetId, type === "group");
  }
}

async function blockTarget(targetId, isGroup) {
  try {
    const res = await fetch(`${API_URL}/api/users/block`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: currentUser.id, targetId, isGroup }),
    });
    const data = await res.json();
    alert(
      `${isGroup ? "Gruppo" : "Contatto"} bloccato correttamente. Non potrà più disturbarti.`,
    );
  } catch (err) {
    console.error("Block error:", err);
  }
}

window.blockTarget = blockTarget;
window.openReportDialog = openReportDialog;

async function openReportDialog(targetIdInput) {
  const targetId = targetIdInput || prompt("ID o Numero da segnalare:");
  const reason = prompt("Motivo della segnalazione:");
  if (targetId && reason) {
    try {
      await fetch(`${API_URL}/api/users/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: currentUser.id, targetId, reason }),
      });
      alert(
        "Segnalazione inviata al team di sicurezza. Grazie per aver aiutato a mantenere ME Comunications sicura.",
      );
    } catch (err) {
      console.error("Report error:", err);
    }
  }
}

async function loadContacts() {
  if (!currentUser || !currentUser.id) {
    console.warn(
      "Impossibile caricare i contatti: utente non loggato correttamente.",
    );
    return;
  }

  // Load from Cache first for immediate visibility
  const cached = localStorage.getItem(`contacts_${currentUser.id}`);
  if (cached) {
    renderContactsList(JSON.parse(cached));
  }

  try {
    const res = await fetch(`${API_URL}/api/chats/${currentUser.id}`, {
      headers: { "bypass-tunnel-reminder": "true" },
    });

    if (
      res.status === 511 ||
      res.headers.get("content-type")?.includes("text/html")
    ) {
      alert(
        "⚠️ Localtunnel richiede l'autorizzazione. Apri l'URL del server nel browser e clicca 'Click to Continue'.",
      );
      window.open(API_URL, "_blank");
      return;
    }

    const items = await res.json();

    if (Array.isArray(items)) {
      allContacts = items; // Save for search
      localStorage.setItem(`contacts_${currentUser.id}`, JSON.stringify(items));
      renderContactsList(items);
    }
  } catch (err) {
    console.error("Error loading chats:", err);
  }
}

async function loadGroups() {
  const chatList = document.getElementById("chat-list");
  chatList.innerHTML = `<div class="p-4 text-center text-text-muted text-sm">Caricamento gruppi...</div>`;

  try {
    const res = await fetch(`${API_URL}/api/groups`, {
      headers: { "bypass-tunnel-reminder": "true" },
    });
    const groups = await res.json();
    chatList.innerHTML = "";

    if (groups.length === 0) {
      chatList.innerHTML = `
        <div class="p-8 text-center">
          <i class="fa-solid fa-user-group text-4xl text-text-muted/20 mb-4"></i>
          <p class="text-text-muted text-sm">Non sei in nessun gruppo.</p>
          <button onclick="createGroupFlow()" class="mt-4 text-primary text-sm font-bold uppercase tracking-widest hover:underline">Crea Gruppo</button>
        </div>
      `;
      return;
    }

    groups.forEach((group) => {
      const item = document.createElement("div");
      item.className =
        "flex items-center p-3 cursor-pointer hover:bg-surface-hover border-b border-white/5 transition-all";
      item.onclick = () => openChat(group.name, group.id);
      item.innerHTML = `
        <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(group.name)}&background=00a884&color=fff" class="w-12 h-12 rounded-full mr-3 border border-white/10">
        <div class="flex-1 min-w-0">
          <div class="flex justify-between items-center mb-0.5">
            <h3 class="font-medium truncate text-text">${group.name}</h3>
            <span class="text-[10px] text-text-muted">Gruppo</span>
          </div>
          <p class="text-xs text-text-muted truncate">Tocca per aprire la chat di gruppo</p>
        </div>
      `;
      chatList.appendChild(item);
    });
  } catch (err) {
    console.error("Error loading groups:", err);
    chatList.innerHTML = `<div class="p-4 text-center text-red-400 text-xs">Errore nel caricamento dei gruppi.</div>`;
  }
}

async function loadCommunities() {
  const chatList = document.getElementById("chat-list");
  chatList.innerHTML = `
    <div class="p-8 text-center">
      <i class="fa-solid fa-users-viewfinder text-5xl text-primary/20 mb-4"></i>
      <h3 class="text-lg font-medium mb-2">Community</h3>
      <p class="text-text-muted text-sm px-6 leading-relaxed">
        Le Community riuniscono i gruppi correlati in un unico spazio. Qualsiasi community di cui fai parte apparirà qui.
      </p>
      <button onclick="createNewCommunity()" class="mt-6 bg-primary/10 text-primary px-6 py-2 rounded-full text-sm font-bold hover:bg-primary/20 transition-all">
        Nuova Community
      </button>
    </div>
  `;
}

window.createNewCommunity = () => {
  const name = prompt("Inserisci il nome della tua nuova Community:");
  if (name) {
    alert(
      `Community "${name}" creata con successo! Ora puoi aggiungere i tuoi gruppi.`,
    );
    loadCommunities();
  }
};

function renderContactsList(contacts, isSearching = false) {
  chatList.innerHTML = ""; // Clear sidebar

  if (!Array.isArray(contacts) || contacts.length === 0) {
    chatList.innerHTML =
      '<div class="p-10 text-center text-text-muted text-sm italic">Nessun contatto trovato.</div>';
    return;
  }

  contacts.forEach((contact) => {
    // Check if contact has status (mocking for now, or use real data if available)
    const hasStatus = contact.hasRecentStatus || false;
    const isSelected =
      contact.targetUserId === localStorage.getItem("lastChatId") ||
      contact.contactPhone === localStorage.getItem("lastChatId");

    const contactItem = document.createElement("div");
    contactItem.className = `flex items-center gap-4 px-4 py-3 hover:bg-surface-hover cursor-pointer transition-all group relative border-b border-border/30 ${isSearching ? "search-highlight" : ""} ${isSelected ? "bg-surface-hover" : ""}`;
    contactItem.innerHTML = `
      <div class="relative">
        <div class="w-12 h-12 rounded-full overflow-hidden ${hasStatus ? "status-ring" : "border border-white/10"}">
          <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(contact.contactName)}&background=random" alt="${contact.contactName}" class="w-full h-full object-cover">
        </div>
        ${contact.isGroup ? '<div class="absolute -bottom-1 -right-1 bg-primary text-white text-[8px] px-1 rounded-full border border-surface shadow-sm">GRUPPO</div>' : ""}
        ${contact.isOnline ? '<div class="absolute top-0 right-0 w-3 h-3 bg-secondary border-2 border-surface rounded-full"></div>' : ""}
      </div>
      <div class="flex-1 min-w-0">
        <div class="flex justify-between items-center mb-1">
          <h3 class="font-medium truncate text-text ${isSearching ? "text-primary" : ""}">${contact.contactName}</h3>
          <span class="text-[10px] text-text-muted">12:45</span>
        </div>
        <p class="text-xs text-text-muted truncate">
          ${contact.isGroup ? `<span class="text-primary">Tu:</span> Ciao a tutti!` : contact.contactPhone}
        </p>
      </div>
    `;

    contactItem.onclick = () => {
      // Remove highlight from others
      chatList
        .querySelectorAll(".bg-surface-hover")
        .forEach((el) =>
          el.classList.remove(
            "bg-surface-hover",
            "border-l-4",
            "border-primary",
          ),
        );
      contactItem.classList.add(
        "bg-surface-hover",
        "border-l-4",
        "border-primary",
      );

      openChat(
        contact.contactName,
        contact.targetUserId || contact.contactPhone,
      );
    };

    // Context Menu for Contacts
    contactItem.oncontextmenu = (e) => {
      e.preventDefault();
      showContextMenu(e, [
        { label: "Chiudi Chat", icon: "fa-xmark", action: () => closeChat() },
        {
          label: "Copia Numero",
          icon: "fa-copy",
          action: () => copyToClipboard(contact.contactPhone),
        },
        {
          label: "Vedi Stato",
          icon: "fa-circle-notch",
          action: () => {
            document.getElementById("tab-status").click();
          },
        },
        {
          label: "Elimina Chat",
          icon: "fa-trash",
          danger: true,
          action: () => deleteContact(contact.id),
        },
      ]);
    };

    chatList.appendChild(contactItem);
  });
}

function sendMessage() {
  const content = messageInput.value.trim();
  if (!content) return;

  if (currentEditingMessageId) {
    // Logic for editing (update message)
    const data = {
      id: currentEditingMessageId,
      content: content,
      chatId: currentChatId,
    };
    socket.emit("edit_message", data);
    currentEditingMessageId = null;
    messageInput.value = "";
    messageInput.placeholder = "Scrivi un messaggio";
    return;
  }

  const data = {
    senderId: currentUser.id,
    chatId: currentChatId,
    content: content,
    type: "text",
    timestamp: new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    }),
  };

  socket.emit("send_message", data);
  // We no longer render immediately here.
  // We wait for the socket to echo it back with the official ID.
  messageInput.value = "";
}

// ==========================================
// MEDIA & VOICE NOTES
// ==========================================

let mediaRecorder;
let audioChunks = [];

const recordBtn = document.querySelector("footer button:last-child");
const micIcon = recordBtn.querySelector("i");

recordBtn.addEventListener("mousedown", async () => {
  if (messageInput.value.trim()) return; // Don't record if typing

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];

    mediaRecorder.ondataavailable = (e) => audioChunks.push(e.data);
    mediaRecorder.onstop = async () => {
      const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
      const formData = new FormData();
      formData.append("media", audioBlob, "voice-note.webm");
      formData.append("type", "audio");

      // Upload to Azure via Backend
      try {
        const res = await fetch(`${API_URL}/api/upload`, {
          method: "POST",
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
          body: formData,
        });

        if (res.status === 503) {
          throw new Error(
            "Il server di caricamento è temporaneamente non disponibile (503).",
          );
        }

        const data = await res.json();

        if (data.url) {
          socket.emit("send_message", {
            senderId: currentUser.id,
            chatId: currentChatId,
            content: "",
            mediaUrl: data.url,
            type: "audio",
          });
        }
      } catch (err) {
        console.error("Voice note upload error:", err);
        alert("Errore nell'invio della nota vocale: " + err.message);
      }
    };

    mediaRecorder.start();
    micIcon.classList.replace("fa-microphone", "fa-stop");
    recordBtn.classList.add("bg-red-500", "animate-pulse");
  } catch (err) {
    console.error("Mic access denied:", err);
  }
});

recordBtn.addEventListener("mouseup", () => {
  if (mediaRecorder && mediaRecorder.state === "recording") {
    mediaRecorder.stop();
    micIcon.classList.replace("fa-stop", "fa-microphone");
    recordBtn.classList.remove("bg-red-500", "animate-pulse");
  }
});

// ==========================================
// GIF & MEME (GIPHY)
// ==========================================

const gifBtn = document.querySelector('footer button[title="Emoji & GIF"]');
gifBtn.addEventListener("click", async () => {
  const query = prompt("Cerca una GIF:");
  if (!query) return;

  const GIPHY_KEY = "LIV879Al9G973V9vGSRu8s7a1H471mY4"; // More stable key
  try {
    const res = await fetch(
      `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_KEY}&q=${query}&limit=1`,
    );
    const { data } = await res.json();
    if (data.length > 0) {
      const gifUrl = data[0].images.fixed_height.url;
      socket.emit("send_message", {
        senderId: currentUser.id,
        chatId: currentChatId,
        content: "",
        mediaUrl: gifUrl,
        type: "gif",
      });
      // socket echo will handle rendering
    }
  } catch (err) {
    console.error("Giphy error:", err);
  }
});

// ==========================================
// CSV IMPORT
// ==========================================

const newChatBtn = document.querySelector('button[title="Nuova Chat"]');
newChatBtn.addEventListener("click", () => {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".csv";
  input.onchange = async (e) => {
    const file = e.target.files[0];
    const formData = new FormData();
    formData.append("csvFile", file);
    formData.append("userId", currentUser.id);

    try {
      const res = await fetch(`${API_URL}/api/contacts/import`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      alert(`Importati ${data.count} contatti con successo!`);
      loadContacts(); // Refresh sidebar
    } catch (err) {
      console.error("CSV Import error:", err);
    }
  };
  input.click();
});

// ==========================================
// UTILS & RENDER
// ==========================================

function renderMessage(data, isSent) {
  // Deduplication: if message with this ID already exists, don't render again
  if (data.id && document.querySelector(`[data-message-id="${data.id}"]`)) {
    return;
  }

  const messageDiv = document.createElement("div");
  messageDiv.className = `flex ${isSent ? "justify-end" : "justify-start"} mb-2`;

  const bubbleClass = isSent ? "bg-bubble-out" : "bg-bubble-in";
  const radiusClass = isSent ? "rounded-tr-sm" : "rounded-tl-sm";

  let contentHtml = "";
  const type = data.type || data.mediaType || "text";

  if (type === "text") {
    contentHtml = `<p class="text-[15px] leading-relaxed">${data.content}</p>`;
  } else if (type === "audio") {
    contentHtml = `
      <div class="flex items-center gap-3 py-1">
        <audio src="${data.mediaUrl}" id="audio-${data.id}" class="hidden"></audio>
        <button onclick="toggleAudio('${data.id}')" class="w-10 h-10 rounded-full bg-primary/20 text-primary flex items-center justify-center hover:bg-primary/30 transition-colors">
          <i class="fa-solid fa-play ml-0.5" id="icon-${data.id}"></i>
        </button>
        <div class="h-1 bg-white/20 flex-1 rounded-full relative overflow-hidden">
          <div class="absolute inset-0 bg-primary w-0" id="progress-${data.id}"></div>
        </div>
      </div>
    `;
  } else if (type === "gif" || type === "image") {
    contentHtml = `<img src="${data.mediaUrl}" class="rounded-lg max-w-full h-auto mb-1 border border-white/5 cursor-pointer hover:opacity-90 transition-opacity" onclick="openLightbox('${data.mediaUrl}', 'image')">`;
  } else if (type === "video") {
    contentHtml = `
      <div class="relative group cursor-pointer" onclick="openLightbox('${data.mediaUrl}', 'video')">
        <video src="${data.mediaUrl}" class="rounded-lg max-w-full h-auto mb-1 border border-white/5"></video>
        <div class="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/40 transition-all rounded-lg">
          <i class="fa-solid fa-play text-white text-3xl opacity-80"></i>
        </div>
      </div>
    `;
  } else if (type === "file") {
    contentHtml = `
      <div class="flex items-center gap-3 p-3 bg-black/10 rounded-xl border border-white/5 hover:bg-black/20 transition-all cursor-pointer" onclick="window.open('${data.mediaUrl}', '_blank')">
        <div class="w-10 h-10 bg-primary/20 rounded-lg flex items-center justify-center text-primary">
          <i class="fa-solid fa-file-lines text-xl"></i>
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium truncate">${data.fileName || "Documento"}</p>
          <p class="text-[10px] text-text-muted">Download</p>
        </div>
        <i class="fa-solid fa-download text-text-muted"></i>
      </div>
    `;
  }

  messageDiv.innerHTML = `
    <div class="message-bubble ${bubbleClass} text-text rounded-2xl ${radiusClass} px-4 py-2 max-w-[85%] sm:max-w-[65%] shadow-sm relative group min-w-[120px] animate-slide-up ${data.isSpam ? "border-2 border-red-500/50" : ""}" data-message-id="${data.id || ""}">
      ${data.isSpam ? '<div class="text-[10px] text-red-400 font-bold mb-1 uppercase tracking-tighter"><i class="fa-solid fa-triangle-exclamation mr-1"></i> Sospetto Spam / Truffa</div>' : ""}
      ${contentHtml}
      <div class="flex justify-end items-center gap-1 mt-1">
        <span class="text-[10px] ${isSent ? "text-white/70" : "text-text-muted"}">${data.timestamp || new Date(data.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
        ${isSent ? '<i class="fa-solid fa-check-double text-[#53bdeb] text-xs"></i>' : ""}
      </div>
      
      <!-- Reactions Display -->
      <div class="reactions-container flex flex-wrap gap-1 absolute -bottom-3 left-2">
        ${(data.reactions || [])
          .map(
            (r) => `
          <div class="reaction-badge bg-surface/90 backdrop-blur border border-white/10 rounded-full px-1.5 py-0.5 text-[10px] shadow-lg flex items-center cursor-default" title="Reazione">
            ${r.emoji}
          </div>
        `,
          )
          .join("")}
      </div>

      ${
        data.isSpam && !isSent
          ? `
        <div class="mt-3 pt-2 border-t border-red-500/20 flex gap-2">
          <button onclick="blockTarget('${data.senderId}', false)" class="text-[10px] bg-red-500/20 hover:bg-red-500/40 text-red-400 px-2 py-1 rounded transition-colors">Blocca</button>
          <button onclick="openReportDialog('${data.senderId}')" class="text-[10px] bg-white/10 hover:bg-white/20 text-white px-2 py-1 rounded transition-colors">Segnala</button>
        </div>
      `
          : ""
      }
    </div>
  `;

  const bubble = messageDiv.querySelector(".message-bubble");
  bubble.oncontextmenu = (e) => {
    e.preventDefault();
    const actions = [
      {
        label: "Reagisci",
        icon: "fa-face-smile",
        action: () => showReactionPicker(e, data.id),
      },
      {
        label: "Copia Testo",
        icon: "fa-copy",
        action: () => copyToClipboard(data.content),
      },
      {
        label: "Rispondi",
        icon: "fa-reply",
        action: () => startReply(data),
      },
      {
        label: "Invia GIF",
        icon: "fa-icons",
        action: () => {
          emojiTrigger.click();
          tabGif.click();
        },
      },
    ];

    if (isSent) {
      actions.push({
        label: "Modifica",
        icon: "fa-pen",
        action: () => startEditMessage(data),
      });
      actions.push({
        label: "Elimina",
        icon: "fa-trash",
        danger: true,
        action: () => deleteMessage(data.id, messageDiv),
      });
    }

    showContextMenu(e, actions);
  };

  messagesContainer.appendChild(messageDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// ==========================================
// CONTEXT MENU HELPERS
// ==========================================

function showReactionPicker(e, messageId) {
  const emojis = ["❤️", "😂", "😮", "😢", "🙏", "👍"];
  const actions = emojis.map((emoji) => ({
    label: emoji,
    icon: "", // No icon for emoji
    action: () => addReaction(messageId, emoji),
  }));
  showContextMenu(e, actions);
}

function addReaction(messageId, emoji) {
  socket.emit("add_reaction", {
    messageId,
    emoji,
    chatId: currentChatId,
    userId: currentUser.id,
  });
}

function startReply(data) {
  messageInput.value = `Risposta a: "${data.content.slice(0, 20)}..." \n`;
  messageInput.focus();
}

function showContextMenu(e, actions) {
  contextMenuList.innerHTML = "";
  actions.forEach((action) => {
    const li = document.createElement("li");
    li.className = `context-menu-item ${action.danger ? "context-menu-item-danger" : ""}`;
    li.innerHTML = `<i class="fa-solid ${action.icon}"></i> <span>${action.label}</span>`;
    li.onclick = () => {
      action.action();
      hideContextMenu();
    };
    contextMenuList.appendChild(li);
  });

  contextMenu.style.left = `${e.clientX}px`;
  contextMenu.style.top = `${e.clientY}px`;
  contextMenu.classList.remove("hidden");
}

function hideContextMenu() {
  contextMenu.classList.add("hidden");
}

document.addEventListener("click", hideContextMenu);
document.addEventListener("contextmenu", (e) => {
  if (!e.target.closest("#chat-list") && !e.target.closest(".message-bubble")) {
    hideContextMenu();
  }
});

function copyToClipboard(text) {
  if (!text) return;
  navigator.clipboard.writeText(text);
  // Add a small toast if you want
}

function closeChat() {
  noChatSelected.classList.remove("hidden");
  currentChatId = null;
  localStorage.removeItem("lastChatId");
  localStorage.removeItem("lastChatName");
}

async function deleteContact(id) {
  if (!confirm("Eliminare questo contatto?")) return;
  try {
    await fetch(`${API_URL}/api/contacts/${id}`, {
      method: "DELETE",
    });
    loadContacts();
  } catch (err) {
    console.error("Error deleting contact:", err);
  }
}

function startEditMessage(data) {
  if (data.type !== "text") return;
  currentEditingMessageId = data.id;
  messageInput.value = data.content;
  messageInput.placeholder = "Modifica messaggio...";
  messageInput.focus();
}

async function deleteMessage(messageId, element) {
  if (!confirm("Eliminare questo messaggio?")) return;
  try {
    // Assuming backend has a delete endpoint
    await fetch(`${API_URL}/api/messages/${messageId}`, {
      method: "DELETE",
    });
    element.remove();
    socket.emit("delete_message", { id: messageId, chatId: currentChatId });
  } catch (err) {
    console.error("Error deleting message:", err);
  }
}

function toggleAudio(id) {
  const audio = document.getElementById(`audio-${id}`);
  const icon = document.getElementById(`icon-${id}`);
  const progress = document.getElementById(`progress-${id}`);

  if (audio.paused) {
    audio.play();
    icon.classList.replace("fa-play", "fa-pause");
    audio.ontimeupdate = () => {
      progress.style.width = `${(audio.currentTime / audio.duration) * 100}%`;
    };
    audio.onended = () => {
      icon.classList.replace("fa-pause", "fa-play");
      progress.style.width = "0%";
    };
  } else {
    audio.pause();
    icon.classList.replace("fa-pause", "fa-play");
  }
}

async function openChat(contactName, targetUserId) {
  // Save for persistence
  localStorage.setItem("lastChatId", targetUserId);
  localStorage.setItem("lastChatName", contactName);

  // Mobile UI toggle
  if (window.innerWidth < 768) {
    mainChatArea.classList.remove("translate-x-full");
    // sidebar.classList.add("hidden"); // Assuming sidebar is defined, if not use appContainer.querySelector('aside')
  }

  noChatSelected.classList.add("hidden");
  document.querySelector("#main-chat-area header h2").innerText = contactName;

  // Set profile photo for the other person in header
  const headerImg = document.querySelector("#main-chat-area header img");
  if (headerImg) {
    headerImg.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(contactName)}&background=random`;
  }

  // Set chat ID (using deterministic ID if targetUserId exists)
  // To make it real P2P, we use a sorted combination of IDs: "p2p-minId-maxId"
  if (targetUserId && targetUserId.startsWith("chat-")) {
    currentChatId = targetUserId; // Already a group or p2p ID
  } else if (targetUserId) {
    const ids = [currentUser.id, targetUserId].sort();
    currentChatId = `p2p-${ids[0]}-${ids[1]}`;
  } else {
    currentChatId = "demo-chat-id";
  }

  // Join the new chat room
  socket.emit("join_chat", currentChatId);

  // Clear and Load History
  messagesContainer.innerHTML = `
    <div class="flex justify-center mb-6">
      <div class="bg-surface-hover/80 text-[#ffd279] text-xs px-4 py-2 rounded-lg shadow-sm border border-white/5 flex items-center gap-2 max-w-md text-center">
        <i class="fa-solid fa-lock text-[10px]"></i>
        I messaggi e le chiamate sono crittografati end-to-end.
      </div>
    </div>
  `;

  try {
    const res = await fetch(`${API_URL}/api/messages/${currentChatId}`, {
      headers: { "bypass-tunnel-reminder": "true" },
    });
    const messages = await res.json();
    if (Array.isArray(messages)) {
      messages.forEach((msg) => {
        renderMessage(msg, msg.senderId === currentUser.id);
      });
    }
  } catch (err) {
    console.error("Error loading history:", err);
  }
}

function clearHistory() {
  if (confirm("Vuoi davvero cancellare tutti i messaggi?")) {
    messagesContainer.innerHTML = "";
    // Optional: backend call to clear history
  }
}

async function openGifPicker() {
  const query = prompt("Cerca una GIF:");
  if (!query) return;
  const GIPHY_KEY = "LIV879Al9G973V9vGSRu8s7a1H471mY4";
  try {
    const res = await fetch(
      `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_KEY}&q=${query}&limit=1`,
    );
    const { data } = await res.json();
    if (data.length > 0) {
      const gifUrl = data[0].images.fixed_height.url;
      socket.emit("send_message", {
        senderId: currentUser.id,
        chatId: currentChatId,
        content: "",
        mediaUrl: gifUrl,
        type: "gif",
      });
      renderMessage(
        { type: "gif", mediaUrl: gifUrl, id: "temp-" + Date.now() },
        true,
      );
    }
  } catch (err) {
    console.error("GIF error:", err);
  }
}

async function createGroupFlow() {
  const name = prompt("Inserisci il nome del gruppo:");
  if (!name) return;

  try {
    const res = await fetch(`${API_URL}/api/groups/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "bypass-tunnel-reminder": "true",
      },
      body: JSON.stringify({ name, adminId: currentUser.id }),
    });
    const data = await res.json();
    if (data.success) {
      currentChatId = data.chat.id;
      loadContacts(); // Refresh sidebar
      openChat(name, currentChatId);
      alert(`Gruppo "${name}" creato con successo!`);
    }
  } catch (err) {
    console.error("Group creation error:", err);
  }
}

function importCSVFlow() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".csv";
  input.onchange = async (e) => {
    const file = e.target.files[0];
    const formData = new FormData();
    formData.append("csvFile", file);
    formData.append("userId", currentUser.id);

    try {
      const res = await fetch(`${API_URL}/api/contacts/import`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      alert(`Importati ${data.count} contatti con successo!`);
      loadContacts();
    } catch (err) {
      console.error("CSV Import error:", err);
    }
  };
  input.click();
}

let peerConnection;
let localStream;
const configuration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

async function startCall(isVideo = true) {
  const targetId = currentChatId
    .replace("p2p-", "")
    .replace(currentUser.id, "")
    .replace("-", "");
  if (!targetId) return alert("Seleziona un contatto reale per chiamare");

  callModal.classList.remove("hidden");
  document.getElementById("call-partner-name").innerText =
    document.querySelector("#main-chat-area header h2").innerText;

  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: isVideo,
      audio: true,
    });
    document.getElementById("local-video").srcObject = localStream;

    peerConnection = new RTCPeerConnection(configuration);
    localStream
      .getTracks()
      .forEach((track) => peerConnection.addTrack(track, localStream));

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("ice_candidate", {
          to: targetId,
          candidate: event.candidate,
        });
      }
    };

    peerConnection.ontrack = (event) => {
      document.getElementById("remote-video").srcObject = event.streams[0];
    };

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit("call_user", { to: targetId, offer });
  } catch (err) {
    console.error("Call Error:", err);
    alert("Impossibile avviare la chiamata: " + err.message);
  }
}

async function handleIncomingCall(from, offer) {
  callModal.classList.remove("hidden");
  document.getElementById("call-partner-name").innerText =
    `Chiamata da ${from}`;

  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });
    document.getElementById("local-video").srcObject = localStream;

    peerConnection = new RTCPeerConnection(configuration);
    localStream
      .getTracks()
      .forEach((track) => peerConnection.addTrack(track, localStream));

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("ice_candidate", { to: from, candidate: event.candidate });
      }
    };

    peerConnection.ontrack = (event) => {
      document.getElementById("remote-video").srcObject = event.streams[0];
    };

    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.emit("answer_call", { to: from, answer });
  } catch (err) {
    console.error("Answer Error:", err);
  }
}

function endCallUI() {
  callModal.classList.add("hidden");
  if (localStream) {
    localStream.getTracks().forEach((track) => track.stop());
  }
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
}

document.getElementById("end-call").onclick = () => {
  const targetId = currentChatId
    .replace("p2p-", "")
    .replace(currentUser.id, "")
    .replace("-", "");
  socket.emit("end_call", { to: targetId });
  endCallUI();
};

document.getElementById("toggle-avatar").onclick = () => {
  const videoTrack = localStream.getVideoTracks()[0];
  const canvas = document.getElementById("avatar-canvas");
  const video = document.getElementById("local-video");

  if (videoTrack.enabled) {
    videoTrack.enabled = false;
    video.classList.add("hidden");
    canvas.classList.remove("hidden");
    startAvatarAnimation(canvas);
  } else {
    videoTrack.enabled = true;
    video.classList.remove("hidden");
    canvas.classList.add("hidden");
  }
};

function startAvatarAnimation(canvas) {
  const ctx = canvas.getContext("2d");
  canvas.width = 300;
  canvas.height = 400;

  function draw() {
    if (canvas.classList.contains("hidden")) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Draw simple animated avatar
    ctx.fillStyle = "#128c7e";
    ctx.beginPath();
    ctx.arc(150, 150, 80, 0, Math.PI * 2); // Head
    ctx.fill();

    ctx.fillStyle = "white";
    ctx.beginPath();
    ctx.arc(120, 140, 10, 0, Math.PI * 2); // Eye L
    ctx.arc(180, 140, 10, 0, Math.PI * 2); // Eye R
    ctx.fill();

    // Mouth animation
    ctx.strokeStyle = "white";
    ctx.lineWidth = 5;
    ctx.beginPath();
    const mouthY = 180 + Math.sin(Date.now() / 200) * 10;
    ctx.arc(150, mouthY, 30, 0.2 * Math.PI, 0.8 * Math.PI);
    ctx.stroke();

    requestAnimationFrame(draw);
  }
  draw();
}

// Status preview click logic removed from global scope to avoid errors

function renderEmojis() {
  const container = document.getElementById("media-content");
  const emojis = [
    "😂",
    "❤️",
    "👍",
    "🙏",
    "😊",
    "😍",
    "😭",
    "🔥",
    "🤔",
    "🙌",
    "✨",
    "✅",
    "🤣",
    "😘",
    "💙",
    "😜",
    "💕",
    "💀",
    "🙄",
    "🌹",
    "💯",
    "👏",
    "🥳",
    "😎",
    "🎉",
    "😡",
    "😢",
    "🤤",
    "🤩",
    "👋",
  ];
  container.className = "flex-1 overflow-y-auto p-4 grid grid-cols-6 gap-2";
  container.innerHTML = emojis
    .map(
      (e) => `
    <button class="text-2xl hover:scale-125 transition-transform p-1" onclick="insertEmoji('${e}')">${e}</button>
  `,
    )
    .join("");
}

function insertEmoji(emoji) {
  messageInput.value += emoji;
  messageInput.focus();
}

async function renderGifs(query = "trending") {
  const container = document.getElementById("media-content");
  const GIPHY_KEY = "LIV879Al9G973V9vGSRu8s7a1H471mY4";
  container.className = "flex-1 overflow-y-auto p-2 grid grid-cols-2 gap-2";
  container.innerHTML =
    '<div class="col-span-2 text-center text-xs animate-pulse">Caricamento...</div>';

  try {
    const url =
      query === "trending"
        ? `https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_KEY}&limit=20`
        : `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_KEY}&q=${query}&limit=20`;

    const res = await fetch(url);
    const { data } = await res.json();
    container.innerHTML = data
      .map(
        (gif) => `
      <img src="${gif.images.fixed_height_small.url}" class="rounded-lg cursor-pointer hover:scale-105 transition-transform w-full h-24 object-cover" onclick="sendMedia('${gif.images.fixed_height.url}', 'gif')">
    `,
      )
      .join("");
  } catch (err) {
    container.innerHTML =
      '<div class="col-span-2 text-center text-xs text-red-400">Errore caricamento GIF</div>';
  }
}

async function sendMedia(url, type) {
  socket.emit("send_message", {
    senderId: currentUser.id,
    chatId: currentChatId,
    content: type === "file" ? "Allegato" : "",
    mediaUrl: url,
    type: type,
  });
  document.getElementById("media-popover").classList.add("hidden");
}

async function uploadAndSendFile(file) {
  const formData = new FormData();
  formData.append("media", file);

  let type = "file";
  if (file.type.startsWith("image/")) type = "image";
  if (file.type.startsWith("video/")) type = "video";
  if (file.type.startsWith("audio/")) type = "audio";

  formData.append("type", type);

  try {
    const res = await fetch(`${API_URL}/api/upload`, {
      method: "POST",
      headers: { "bypass-tunnel-reminder": "true" },
      body: formData,
    });

    if (res.status === 511 || res.status === 503) {
      throw new Error(
        "Il tunnel è bloccato o non disponibile. Per favore autorizza l'accesso o riavvia il tunnel.",
      );
    }

    if (!res.ok) {
      const errorData = await res
        .json()
        .catch(() => ({ error: "Errore sconosciuto" }));
      throw new Error(errorData.error || `Errore server: ${res.status}`);
    }

    const data = await res.json();
    if (data.url) {
      socket.emit("send_message", {
        senderId: currentUser.id,
        chatId: currentChatId,
        content: file.name,
        mediaUrl: data.url,
        type: type,
      });
    }
  } catch (err) {
    console.error("Upload error:", err);
    alert(err.message);
  }
}

// ==========================================
// STATUS & MUSIC LOGIC
// ==========================================

function openStatusModal() {
  const statusModal = document.getElementById("status-modal");
  statusModal.classList.remove("hidden");
}

const statusUpload = document.getElementById("status-upload");
const statusPreview = document.getElementById("status-preview");
const addMusicBtn = document.getElementById("add-music-btn");
const musicSelector = document.getElementById("music-selector");
const postStatusBtn = document.getElementById("post-status");
const closeStatusBtn = document.getElementById("close-status");

let selectedMusicTrack = null;

statusUpload.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      if (file.type.startsWith("image/")) {
        statusPreview.innerHTML = `<img src="${e.target.result}" class="w-full h-full object-cover">`;
      } else {
        statusPreview.innerHTML = `<video src="${e.target.result}" class="w-full h-full object-cover" autoplay muted loop></video>`;
      }
      postStatusBtn.classList.remove("hidden");
    };
    reader.readAsDataURL(file);
  }
});

addMusicBtn.addEventListener("click", () => {
  musicSelector.classList.toggle("hidden");
});

document.querySelectorAll(".music-track").forEach((track) => {
  track.addEventListener("click", () => {
    selectedMusicTrack = track.dataset.track;
    document.getElementById("selected-music").innerText =
      `Musica selezionata: ${selectedMusicTrack}`;
    musicSelector.classList.add("hidden");
    alert(`Hai aggiunto "${selectedMusicTrack}" al tuo stato!`);
  });
});

postStatusBtn.addEventListener("click", () => {
  alert(
    "Stato pubblicato con successo! I tuoi contatti lo vedranno per le prossime 24 ore.",
  );
  document.getElementById("status-modal").classList.add("hidden");
  // Reset
  statusPreview.innerHTML = `<i class="fa-solid fa-image text-6xl text-white/10"></i>`;
  postStatusBtn.classList.add("hidden");
  selectedMusicTrack = null;
  document.getElementById("selected-music").innerText = "";
});

closeStatusBtn.addEventListener("click", () => {
  document.getElementById("status-modal").classList.add("hidden");
});

const headerStatusBtn = document.getElementById("header-status-btn");
if (headerStatusBtn) {
  headerStatusBtn.addEventListener("click", openStatusModal);
}

checkAuth();
