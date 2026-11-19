const { invoke } = window.__TAURI__.core;

let setupScreen;
let errorMsg;

let exitBtn;
let exitModal;
let cancelExit;
let confirmExit;
let exitPassword;
let exitError;
let startupExitBtn;

// Disable right-click context menu
document.addEventListener("contextmenu", (e) => {
  e.preventDefault();
});

// Block all keyboard refresh shortcuts except F5 / Fn+F5
document.addEventListener("keydown", (e) => {
  // Block Ctrl+R and Ctrl+Shift+R
  if (e.ctrlKey && (e.key === "r" || e.key === "R")) {
    e.preventDefault();
    return;
  }
  // Block F12 (DevTools)
  if (e.key === "F12") {
    e.preventDefault();
    return;
  }
  // Block Alt+F4, Alt+Tab, Alt+Esc
  if (e.altKey && (e.key === "F4" || e.key === "Tab" || e.key === "Escape")) {
    e.preventDefault();
    return;
  }
  // Block Windows / Meta key
  if (e.metaKey || e.key === "Meta") {
    e.preventDefault();
    return;
  }
  // Block Ctrl+Esc (Start menu)
  if (e.ctrlKey && e.key === "Escape") {
    e.preventDefault();
    return;
  }
});

function setStep(stepNum, state) {
  const el = document.getElementById("step-" + stepNum);
  if (!el) return;
  el.classList.remove("active", "done");
  if (state) el.classList.add(state);
}

function setProgress(pct, label) {
  const fill = document.getElementById("progress-fill");
  const lbl  = document.getElementById("progress-label");
  if (fill) fill.style.width = pct + "%";
  if (lbl)  lbl.textContent = label;
}

window.addEventListener("DOMContentLoaded", async () => {
  // DOM Elements
  setupScreen = document.getElementById("setup-screen");
  errorMsg = document.getElementById("error-msg");

  exitBtn = document.getElementById("exit-btn");
  exitModal = document.getElementById("exit-modal");
  cancelExit = document.getElementById("cancel-exit");
  confirmExit = document.getElementById("confirm-exit");
  exitPassword = document.getElementById("exit-password");
  exitError = document.getElementById("exit-error");
  startupExitBtn = document.getElementById("startup-exit-btn");

  startupExitBtn.addEventListener("click", async () => {
    try {
      await invoke("secure_exit");
    } catch (err) {
      // Silent failure - do not log to console
    }
  });

  // Step 1 — connecting
  setStep(1, "active");
  setProgress(15, "Connecting to examination server...");

  // Fetch Exam URL Automatically
  try {
    await new Promise(r => setTimeout(r, 600));
    setStep(1, "done");

    // Step 2 — verifying
    setStep(2, "active");
    setProgress(50, "Verifying session credentials...");
    const url = await invoke("fetch_exam_url");
    setStep(2, "done");

    // Step 3 — loading
    setStep(3, "active");
    setProgress(85, "Loading your exam...");
    await new Promise(r => setTimeout(r, 500));
    setProgress(100, "Ready!");
    await new Promise(r => setTimeout(r, 400));

    startExam(url);
  } catch (err) {
    errorMsg.textContent = "Failed to synchronize exam link: " + err;
    startupExitBtn.classList.remove("hidden");
  }

  // Exit App Flow
  exitBtn.addEventListener("click", () => {
    exitModal.classList.remove("hidden");
    exitPassword.value = "";
    exitError.textContent = "";
    exitPassword.focus();
  });

  cancelExit.addEventListener("click", () => {
    exitModal.classList.add("hidden");
  });

  confirmExit.addEventListener("click", async () => {
    const password = exitPassword.value;
    if (!password) {
      exitError.textContent = "Please enter the exit password.";
      return;
    }
    
    try {
      // Call the rust backend to verify the password and exit securely.
      const isValid = await invoke("verify_exit_password", { password });
      if (isValid) {
        await invoke("secure_exit");
      } else {
        exitError.textContent = "Incorrect password. Exit denied.";
      }
    } catch (err) {
      exitError.textContent = "Error verifying password: " + err;
    }
  });
});

function startExam(url) {
  // Navigate the WebView directly to the exam URL so cookies work as
  // first-party (no iframe third-party cookie blocking).
  // The Secure Exit button is injected on every page via initialization_script.
  window.location.href = url;
}
