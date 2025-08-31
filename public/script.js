// script.js
// === Firebase SDK ===
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  updatePassword,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  query,
  where,
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  getDoc,
  setDoc,
  increment
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// === CONFIG (ปรับได้) ===
const firebaseConfig = typeof __firebase_config !== "undefined"
  ? JSON.parse(__firebase_config)
  : {
      apiKey: "AIzaSyBR9hKkCHustpcR4B-4rJ13jlU1s6dgo0s",
      authDomain: "project-2987615072467388875.firebaseapp.com",
      projectId: "project-2987615072467388875",
      storageBucket: "project-2987615072467388875.firebasestorage.app",
      messagingSenderId: "284411417820",
      appId: "1:284411417820:web:9601dce8743927bc145019",
      measurementId: "G-EJQCM49STG",
    };

const appId = typeof __app_id !== "undefined" ? __app_id : "default-tsu-offline-app";

// === Init ===
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

let userId = null;
let userRole = "user";
let isAuthReady = false;

// === DOM ===
const authContainer = document.getElementById("auth-container");
const mainAppWrapper = document.getElementById("main-app-wrapper");
const appContent = document.getElementById("app-content");
const authTitle = document.getElementById("auth-title");

const loginForm = document.getElementById("login-form");
const loginEmailInput = document.getElementById("login-email");
const loginPasswordInput = document.getElementById("login-password");
const loginErrorDisplay = document.getElementById("login-error");
const rememberMeCheckbox = document.getElementById("remember-me");

const registerForm = document.getElementById("register-form");
const registerUsernameInput = document.getElementById("register-username");
const registerEmailInput = document.getElementById("register-email");
const registerPasswordInput = document.getElementById("register-password");
const registerConfirmPasswordInput = document.getElementById("register-confirm-password");
const registerErrorDisplay = document.getElementById("register-error");

const switchAuthModeButton = document.getElementById("switch-auth-mode");
const switchToRegisterText = document.getElementById("switch-to-register-text");

const navAdminLink = document.getElementById("nav-admin");
const settingsGearBtn = document.getElementById("settings-gear-btn");
const settingsModal = document.getElementById("settings-modal");
const closeSettingsModalBtn = document.getElementById("close-settings-modal-btn");
const changePasswordForm = document.getElementById("change-password-form");
const newPasswordInput = document.getElementById("new-password");
const confirmNewPasswordInput = document.getElementById("confirm-new-password");
const passwordChangeError = document.getElementById("password-change-error");

const adminPasswordModal = document.getElementById("admin-password-modal");
const adminPasswordForm = document.getElementById("admin-password-form");
const adminAccessPasswordInput = document.getElementById("admin-access-password");
const adminPasswordError = document.getElementById("admin-password-error");
const closeAdminPasswordModalBtn = document.getElementById("close-admin-password-modal-btn");

// === Admin password (เดโม่) ===
const ADMIN_ACCESS_PASSWORD = "admin";

// === Inactivity ===
const INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000; // 10 นาที
let inactivityTimeoutId;

// ===== Utils =====
function showCustomModal(title, message, isConfirm = false) {
  return new Promise((resolve) => {
    const modalOverlay = document.createElement("div");
    modalOverlay.className = "modal-overlay";
    modalOverlay.innerHTML = `
      <div class="modal-content">
        <h3>${title}</h3>
        <p class="text-gray-700 mb-4">${message}</p>
        <div class="flex justify-center space-x-3">
          <button id="modal-ok-btn" class="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded-lg">ตกลง</button>
          ${isConfirm ? `<button id="modal-cancel-btn" class="bg-gray-400 hover:bg-gray-500 text-white font-semibold px-4 py-2 rounded-lg">ยกเลิก</button>` : ""}
        </div>
      </div>`;
    document.body.appendChild(modalOverlay);
    modalOverlay.querySelector("#modal-ok-btn").onclick = () => {
      modalOverlay.remove();
      resolve(true);
    };
    if (isConfirm) {
      modalOverlay.querySelector("#modal-cancel-btn").onclick = () => {
        modalOverlay.remove();
        resolve(false);
      };
    }
  });
}

async function exponentialBackoff(fn, retries = 5, delay = 800) {
  try {
    return await fn();
  } catch (e) {
    if (retries > 0 && (e.code === "resource-exhausted" || e.code === "deadline-exceeded")) {
      await new Promise((r) => setTimeout(r, delay));
      return exponentialBackoff(fn, retries - 1, delay * 1.6);
    }
    throw e;
  }
}

function resetInactivityTimer() {
  clearTimeout(inactivityTimeoutId);
  if (userId) inactivityTimeoutId = setTimeout(handleAutoSignOut, INACTIVITY_TIMEOUT_MS);
}
async function handleAutoSignOut() {
  if (auth.currentUser) {
    await handleSignOut(true);
    showCustomModal("หมดเวลาการใช้งาน", "ออกจากระบบอัตโนมัติเนื่องจากไม่มีการใช้งาน");
  }
}
function setupInactivityListeners() {
  ["mousemove", "keydown", "click"].forEach((ev) => document.body.addEventListener(ev, resetInactivityTimer));
  resetInactivityTimer();
}
function removeInactivityListeners() {
  clearTimeout(inactivityTimeoutId);
  ["mousemove", "keydown", "click"].forEach((ev) => document.body.removeEventListener(ev, resetInactivityTimer));
}

// ===== Auth State =====
onAuthStateChanged(auth, async (user) => {
  if (user) {
    userId = user.uid;
    const disp = document.getElementById("user-id-display");
    if (disp) disp.textContent = userId;

    // สร้าง/อัปเดตโปรไฟล์
    const userProfileRef = doc(db, `artifacts/${appId}/users/${userId}/profile`, "userProfile");
    let profileData = {
      displayName: user.email ? user.email.split("@")[0] : "ผู้ใช้งาน",
      email: user.email || "ไม่ระบุ",
      photoURL: "https://placehold.co/100x100/A0AEC0/FFFFFF?text=USER",
      role: "user",
      totalActivityHours: 0,
      totalActivityPoints: 0,
      createdAt: serverTimestamp(),
    };
    try {
      const snap = await exponentialBackoff(() => getDoc(userProfileRef));
      if (snap.exists()) {
        profileData = { ...profileData, ...snap.data() };
      } else {
        await exponentialBackoff(() => setDoc(userProfileRef, profileData));
      }
      userRole = profileData.role || "user";
    } catch (err) {
      console.error(err);
      showCustomModal("ข้อผิดพลาด", "โหลดโปรไฟล์ไม่สำเร็จ: " + err.message);
    }

    authContainer.classList.add("hidden");
    mainAppWrapper.classList.remove("hidden");
    isAuthReady = true;
    if (navAdminLink) (userRole === "admin" ? navAdminLink.classList.remove("hidden") : navAdminLink.classList.add("hidden"));

    loadPageContent("home");
    setupInactivityListeners();
  } else {
    userId = null;
    userRole = "user";
    const disp = document.getElementById("user-id-display");
    if (disp) disp.textContent = "ไม่ได้เข้าสู่ระบบ";
    authContainer.classList.remove("hidden");
    mainAppWrapper.classList.add("hidden");
    isAuthReady = true;
    if (navAdminLink) navAdminLink.classList.add("hidden");
    removeInactivityListeners();
  }
});

// ===== Auth UI =====
let isLoginForm = true;
function switchAuthMode() {
  isLoginForm = !isLoginForm;
  if (isLoginForm) {
    authTitle.textContent = "เข้าสู่ระบบ";
    loginForm.classList.remove("hidden");
    registerForm.classList.add("hidden");
    switchAuthModeButton.textContent = "ลงทะเบียน";
    switchToRegisterText.textContent = "ยังไม่มีบัญชี?";
  } else {
    authTitle.textContent = "ลงทะเบียน";
    loginForm.classList.add("hidden");
    registerForm.classList.remove("hidden");
    switchAuthModeButton.textContent = "เข้าสู่ระบบ";
    switchToRegisterText.textContent = "มีบัญชีอยู่แล้ว?";
  }
}
if (switchAuthModeButton) switchAuthModeButton.addEventListener("click", switchAuthMode);

// เติม email ที่เคยจำไว้
window.addEventListener("DOMContentLoaded", () => {
  const savedEmail = localStorage.getItem("rememberEmail");
  if (savedEmail) {
    loginEmailInput.value = savedEmail;
    rememberMeCheckbox.checked = true;
  }
});

// Login
if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    loginErrorDisplay.classList.add("hidden");
    const email = loginEmailInput.value.trim();
    const password = loginPasswordInput.value;

    try {
      await setPersistence(auth, rememberMeCheckbox.checked ? browserLocalPersistence : browserSessionPersistence);
      await exponentialBackoff(() => signInWithEmailAndPassword(auth, email, password));

      // จำอีเมล (ไม่เก็บรหัสผ่านเพื่อความปลอดภัย)
      if (rememberMeCheckbox.checked) {
        localStorage.setItem("rememberEmail", email);
      } else {
        localStorage.removeItem("rememberEmail");
      }
    } catch (error) {
      console.error(error);
      let msg = "เข้าสู่ระบบไม่สำเร็จ: ";
      switch (error.code) {
        case "auth/user-not-found":
        case "auth/wrong-password":
          msg += "อีเมลหรือรหัสผ่านไม่ถูกต้อง"; break;
        case "auth/invalid-email":
          msg += "รูปแบบอีเมลไม่ถูกต้อง"; break;
        case "auth/too-many-requests":
          msg += "พยายามมากเกินไป โปรดลองใหม่ภายหลัง"; break;
        default: msg += error.message;
      }
      loginErrorDisplay.textContent = msg;
      loginErrorDisplay.classList.remove("hidden");
    }
  });
}

// Register
if (registerForm) {
  registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    registerErrorDisplay.classList.add("hidden");

    const username = registerUsernameInput.value.trim();
    const email = registerEmailInput.value.trim();
    const password = registerPasswordInput.value;
    const confirm = registerConfirmPasswordInput.value;

    if (!username) {
      registerErrorDisplay.textContent = "กรุณาใส่ชื่อผู้ใช้";
      registerErrorDisplay.classList.remove("hidden");
      return;
    }
    if (password.length < 6) {
      registerErrorDisplay.textContent = "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร";
      registerErrorDisplay.classList.remove("hidden");
      return;
    }
    if (password !== confirm) {
      registerErrorDisplay.textContent = "รหัสผ่านใหม่ไม่ตรงกัน";
      registerErrorDisplay.classList.remove("hidden");
      return;
    }

    try {
      const cred = await exponentialBackoff(() => createUserWithEmailAndPassword(auth, email, password));
      const uid = cred.user.uid;
      const profileRef = doc(db, `artifacts/${appId}/users/${uid}/profile`, "userProfile");
      await setDoc(profileRef, {
        displayName: username,
        email,
        photoURL: "https://placehold.co/100x100/A0AEC0/FFFFFF?text=USER",
        role: "user",
        totalActivityHours: 0,
        totalActivityPoints: 0,
        createdAt: serverTimestamp(),
      });
      showCustomModal("สำเร็จ", "ลงทะเบียนสำเร็จและเข้าสู่ระบบแล้ว");
    } catch (err) {
      console.error(err);
      let msg = "ลงทะเบียนไม่สำเร็จ: ";
      switch (err.code) {
        case "auth/email-already-in-use": msg += "อีเมลนี้ถูกใช้ไปแล้ว"; break;
        case "auth/invalid-email": msg += "อีเมลไม่ถูกต้อง"; break;
        case "auth/weak-password": msg += "รหัสผ่านอ่อนเกินไป"; break;
        default: msg += err.message;
      }
      registerErrorDisplay.textContent = msg;
      registerErrorDisplay.classList.remove("hidden");
    }
  });
}

// Settings modal
function toggleSettingsModal() {
  settingsModal.classList.toggle("hidden");
  if (!settingsModal.classList.contains("hidden")) {
    passwordChangeError.classList.add("hidden");
    newPasswordInput.value = "";
    confirmNewPasswordInput.value = "";
  }
}
if (settingsGearBtn) settingsGearBtn.onclick = toggleSettingsModal;
if (closeSettingsModalBtn) closeSettingsModalBtn.onclick = toggleSettingsModal;

if (changePasswordForm) {
  changePasswordForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    passwordChangeError.classList.add("hidden");

    const p1 = newPasswordInput.value;
    const p2 = confirmNewPasswordInput.value;
    const user = auth.currentUser;

    if (!user) {
      toggleSettingsModal();
      showCustomModal("ข้อผิดพลาด", "กรุณาเข้าสู่ระบบใหม่");
      return;
    }
    if (!p1 || !p2) {
      passwordChangeError.textContent = "กรอกให้ครบ";
      passwordChangeError.classList.remove("hidden");
      return;
    }
    if (p1.length < 6) {
      passwordChangeError.textContent = "รหัสผ่านอย่างน้อย 6 ตัว";
      passwordChangeError.classList.remove("hidden");
      return;
    }
    if (p1 !== p2) {
      passwordChangeError.textContent = "รหัสผ่านใหม่ไม่ตรงกัน";
      passwordChangeError.classList.remove("hidden");
      return;
    }
    try {
      await updatePassword(user, p1);
      toggleSettingsModal();
      showCustomModal("สำเร็จ", "เปลี่ยนรหัสผ่านเรียบร้อย");
    } catch (err) {
      passwordChangeError.textContent = "เปลี่ยนรหัสผ่านไม่ได้: " + err.message;
      passwordChangeError.classList.remove("hidden");
    }
  });
}

// ===== Navigation & Pages =====
const navIds = ["home", "search", "create", "profile", "admin"];
navIds.forEach((id) => {
  const el = document.getElementById(`nav-${id}`);
  if (el) el.addEventListener("click", () => loadPageContent(id));
});

function setActiveNav(page) {
  document.querySelectorAll(".nav-link").forEach((a) => a.classList.remove("active"));
  const active = document.getElementById(`nav-${page}`);
  if (active) active.classList.add("active");
}

async function loadPageContent(pageName) {
  if (!isAuthReady) {
    appContent.innerHTML = `<div class="loading-indicator"><div class="loading-spinner"></div><span>กำลังโหลด...</span></div>`;
    return;
  }
  setActiveNav(pageName);
  appContent.innerHTML = `<div class="loading-indicator"><div class="loading-spinner"></div><span>กำลังโหลดเนื้อหา...</span></div>`;

  switch (pageName) {
    case "home":
      appContent.innerHTML = `
        <h1 class="text-3xl font-extrabold text-center mb-2">ยินดีต้อนรับสู่ TSU Offline</h1>
        <p class="text-center text-gray-600 mb-6">ค้นหา/สร้างกิจกรรม และเข้าร่วมเพื่อสะสมชั่วโมงและคะแนน</p>
        <h2 class="text-xl font-bold mb-3">กิจกรรมล่าสุด</h2>
        <div id="latest-activities" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"></div>
      `;
      await loadLatestActivities();
      break;

    case "search":
      appContent.innerHTML = `
        <h1 class="text-2xl font-extrabold text-center mb-6">ค้นหากิจกรรม</h1>
        <div class="max-w-xl mx-auto bg-white p-5 rounded-xl shadow border border-gray-100">
          <label class="block text-sm font-semibold mb-1" for="search-input">ชื่อกิจกรรม</label>
          <input id="search-input" class="w-full border rounded-lg px-3 py-2 mb-3" placeholder="พิมพ์คำค้น..." />
          <label class="block text-sm font-semibold mb-1" for="search-category">หมวดหมู่</label>
          <select id="search-category" class="w-full border rounded-lg px-3 py-2 mb-4">
            <option value="">ทั้งหมด</option>
            <option>วิชาการ</option><option>กีฬา</option><option>บันเทิง</option><option>จิตอาสา</option><option>อื่นๆ</option>
          </select>
          <button id="search-button" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded-lg">ค้นหา</button>
        </div>
        <div id="search-results" class="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"></div>
      `;
      document.getElementById("search-button").onclick = () => doSearch();
      break;

    case "create":
      appContent.innerHTML = `
        <h1 class="text-2xl font-extrabold text-center mb-6">สร้างกิจกรรมใหม่</h1>
        <form id="create-activity-form" class="max-w-2xl mx-auto bg-white p-6 rounded-xl border border-gray-100 shadow space-y-4">
          <div>
            <label class="block text-sm font-semibold mb-1" for="activity-name">ชื่อกิจกรรม</label>
            <input id="activity-name" required class="w-full border rounded-lg px-3 py-2" />
          </div>
          <div>
            <label class="block text-sm font-semibold mb-1" for="activity-description">รายละเอียด</label>
            <textarea id="activity-description" rows="4" required class="w-full border rounded-lg px-3 py-2"></textarea>
          </div>
          <div>
            <label class="block text-sm font-semibold mb-1" for="activity-category">หมวดหมู่</label>
            <select id="activity-category" required class="w-full border rounded-lg px-3 py-2">
              <option value="">เลือกหมวดหมู่</option>
              <option>วิชาการ</option><option>กีฬา</option><option>บันเทิง</option><option>จิตอาสา</option><option>อื่นๆ</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-semibold mb-1" for="activity-hours">จำนวนชั่วโมงกิจกรรม</label>
            <input id="activity-hours" type="number" min="0" value="1" required class="w-full border rounded-lg px-3 py-2" />
          </div>
          <div>
            <label class="block text-sm font-semibold mb-1" for="activity-date">วันที่จัดกิจกรรม</label>
            <input id="activity-date" type="date" required class="w-full border rounded-lg px-3 py-2" />
          </div>
          <div>
            <label class="block text-sm font-semibold mb-1" for="activity-location">สถานที่</label>
            <input id="activity-location" required class="w-full border rounded-lg px-3 py-2" />
          </div>
          <button class="w-full bg-green-600 hover:bg-green-700 text-white font-semibold px-4 py-2 rounded-lg">สร้างกิจกรรม</button>
          <p id="create-activity-message" class="text-center text-green-600 font-medium hidden"></p>
        </form>
      `;
      document.getElementById("create-activity-form").addEventListener("submit", createActivity);
      break;

    case "profile":
      appContent.innerHTML = `
        <h1 class="text-2xl font-extrabold text-center mb-6">โปรไฟล์ของฉัน</h1>
        <div class="max-w-2xl mx-auto bg-white p-6 rounded-xl border border-gray-100 shadow">
          <div class="flex items-center space-x-4">
            <img id="profile-avatar" src="https://placehold.co/100x100/A0AEC0/FFFFFF?text=USER" class="w-20 h-20 rounded-full border-4 border-blue-200 object-cover" />
            <div class="space-y-1">
              <div class="text-xl font-bold"><span id="profile-display-name-span">กำลังโหลด...</span></div>
              <div class="text-sm text-gray-600">UID: <span id="profile-user-id">-</span></div>
              <div class="text-sm text-gray-600">อีเมล: <span id="profile-user-email">-</span></div>
              <div class="text-sm text-gray-600">บทบาท: <span id="profile-user-role">user</span></div>
            </div>
          </div>

          <div class="mt-4 flex flex-wrap gap-4">
            <div class="bg-blue-50 px-4 py-2 rounded-xl font-semibold">ชั่วโมงสะสม: <span id="profile-total-hours">0</span></div>
            <div class="bg-green-50 px-4 py-2 rounded-xl font-semibold">คะแนนสะสม: <span id="profile-total-points">0</span></div>
          </div>

          <button id="sign-out-button" class="w-full mt-6 bg-red-600 hover:bg-red-700 text-white font-semibold px-4 py-2 rounded-lg">ออกจากระบบ</button>

          <h2 class="text-lg font-bold mt-8 mb-2">กิจกรรมที่ฉันสร้าง</h2>
          <div id="my-activities" class="grid grid-cols-1 gap-3"><p class="text-gray-500">กำลังโหลด...</p></div>

          <h2 class="text-lg font-bold mt-6 mb-2">กิจกรรมที่เข้าร่วม</h2>
          <div id="participated-activities" class="grid grid-cols-1 gap-3"><p class="text-gray-500">กำลังโหลด...</p></div>
        </div>
      `;
      loadProfileData();
      loadMyActivities();
      loadParticipatedActivities();
      document.getElementById("sign-out-button").onclick = () => handleSignOut(false);
      break;

    case "admin":
      if (userRole !== "admin") {
        showCustomModal("ข้อผิดพลาด", "คุณไม่มีสิทธิ์เข้าถึงหน้านี้");
        loadPageContent("home");
        return;
      }
      // เดโม่: ใช้พาสเวิร์ดอีกชั้น (ถ้าต้องการตัดออกสามารถลบ modal ทั้งชุดได้)
      adminPasswordModal.classList.remove("hidden");
      adminPasswordForm.onsubmit = (e) => {
        e.preventDefault();
        adminPasswordError.classList.add("hidden");
        if (adminAccessPasswordInput.value === ADMIN_ACCESS_PASSWORD) {
          adminPasswordModal.classList.add("hidden");
          appContent.innerHTML = `<p class="text-center">แดชบอร์ดผู้ดูแล (ตัวอย่าง) — ยังไม่รวมรายละเอียด</p>`;
        } else {
          adminPasswordError.textContent = "รหัสผ่านแอดมินไม่ถูกต้อง";
          adminPasswordError.classList.remove("hidden");
        }
      };
      closeAdminPasswordModalBtn.onclick = () => adminPasswordModal.classList.add("hidden");
      break;
  }
}

// ===== Data/Activities =====
function activityPublicCol() {
  return collection(db, `artifacts/${appId}/public/data/activities`);
}
function myActivitiesCol(uid) {
  return collection(db, `artifacts/${appId}/users/${uid}/activities`);
}
function myClaimedCol(uid) {
  return collection(db, `artifacts/${appId}/users/${uid}/claimedActivities`);
}

function activityCard(a, { showActions = true, joined = false, mine = false } = {}) {
  const btn =
    !showActions
      ? ""
      : mine
      ? `<button class="delete-btn bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded mt-3" data-id="${a.id}">ลบ</button>`
      : `<button class="join-btn ${joined ? "bg-gray-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700"} text-white px-3 py-1 rounded mt-3"
           data-id="${a.id}" ${joined ? "disabled" : ""}>${joined ? "เข้าร่วมแล้ว" : "เข้าร่วมกิจกรรม"}</button>`;

  return `
    <div class="p-4 bg-white border border-gray-100 rounded-xl shadow">
      <h3 class="text-lg font-bold">${a.name}</h3>
      <p class="text-gray-600">${a.description || ""}</p>
      <div class="text-sm text-gray-500 mt-1">หมวดหมู่: ${a.category || "-"} • ชั่วโมง: ${a.activityHours || 0}</div>
      <div class="text-sm text-gray-500">วันที่: ${a.date || "-"} • สถานที่: ${a.location || "-"}</div>
      ${btn}
    </div>
  `;
}

async function getJoinedIds() {
  if (!userId) return new Set();
  const snap = await exponentialBackoff(() => getDocs(myClaimedCol(userId)));
  return new Set(snap.docs.map((d) => d.id));
}

async function loadLatestActivities() {
  const container = document.getElementById("latest-activities");
  if (!container) return;
  container.innerHTML = `<div class="loading-indicator"><div class="loading-spinner"></div><span>กำลังโหลดกิจกรรม...</span></div>`;

  try {
    const snap = await exponentialBackoff(() => getDocs(activityPublicCol()));
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const joinedIds = await getJoinedIds();

    container.innerHTML =
      list.length === 0
        ? `<p class="text-gray-500">ยังไม่มีกิจกรรม</p>`
        : list
            .slice()
            .reverse()
            .map((a) => activityCard(a, { showActions: true, joined: joinedIds.has(a.id), mine: a.createdBy === userId }))
            .join("");

    // bind buttons
    container.querySelectorAll(".join-btn").forEach((btn) => {
      btn.onclick = () => joinActivity(btn.dataset.id);
    });
    container.querySelectorAll(".delete-btn").forEach((btn) => {
      btn.onclick = () => deleteMyActivity(btn.dataset.id);
    });
  } catch (err) {
    console.error(err);
    container.innerHTML = `<p class="text-red-600">โหลดกิจกรรมไม่สำเร็จ: ${err.message}</p>`;
  }
}

async function doSearch() {
  const kw = (document.getElementById("search-input").value || "").trim().toLowerCase();
  const cat = document.getElementById("search-category").value;
  const container = document.getElementById("search-results");
  container.innerHTML = `<div class="loading-indicator"><div class="loading-spinner"></div><span>ค้นหา...</span></div>`;

  try {
    const snap = await exponentialBackoff(() => getDocs(activityPublicCol()));
    let items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (kw) items = items.filter((a) => (a.name || "").toLowerCase().includes(kw));
    if (cat) items = items.filter((a) => a.category === cat);

    const joinedIds = await getJoinedIds();
    container.innerHTML =
      items.length === 0
        ? `<p class="text-gray-500 text-center">ไม่พบกิจกรรม</p>`
        : items.map((a) => activityCard(a, { showActions: true, joined: joinedIds.has(a.id), mine: a.createdBy === userId })).join("");

    container.querySelectorAll(".join-btn").forEach((btn) => (btn.onclick = () => joinActivity(btn.dataset.id)));
    container.querySelectorAll(".delete-btn").forEach((btn) => (btn.onclick = () => deleteMyActivity(btn.dataset.id)));
  } catch (err) {
    console.error(err);
    container.innerHTML = `<p class="text-red-600">ค้นหาไม่สำเร็จ: ${err.message}</p>`;
  }
}

async function createActivity(e) {
  e.preventDefault();
  if (!userId) { showCustomModal("ข้อผิดพลาด", "กรุณาเข้าสู่ระบบก่อน"); return; }

  const name = document.getElementById("activity-name").value.trim();
  const description = document.getElementById("activity-description").value.trim();
  const category = document.getElementById("activity-category").value;
  const hours = parseInt(document.getElementById("activity-hours").value || "0", 10);
  const date = document.getElementById("activity-date").value;
  const location = document.getElementById("activity-location").value.trim();

  if (!name || !description || !category || !date || !location) {
    showCustomModal("ข้อผิดพลาด", "กรอกข้อมูลให้ครบ");
    return;
  }

  const payload = {
    name, description, category,
    activityHours: hours || 0,
    date, location,
    createdBy: userId,
    createdAt: serverTimestamp()
  };

  try {
    // เพิ่มลง public
    const pubRef = await exponentialBackoff(() => addDoc(activityPublicCol(), payload));
    // คัดลอกไว้ในโฟลเดอร์ของผู้ใช้
    await exponentialBackoff(() => setDoc(doc(db, `artifacts/${appId}/users/${userId}/activities`, pubRef.id), payload));

    showCustomModal("สำเร็จ", "สร้างกิจกรรมเรียบร้อย");
    loadPageContent("home");
  } catch (err) {
    console.error(err);
    showCustomModal("ข้อผิดพลาด", "สร้างกิจกรรมไม่สำเร็จ: " + err.message);
  }
}

async function deleteMyActivity(activityId) {
  const ok = await showCustomModal("ยืนยัน", "ต้องการลบกิจกรรมนี้หรือไม่? (ลบจากระบบสาธารณะด้วย)", true);
  if (!ok) return;
  try {
    await exponentialBackoff(() => deleteDoc(doc(db, `artifacts/${appId}/public/data/activities`, activityId)));
    await exponentialBackoff(() => deleteDoc(doc(db, `artifacts/${appId}/users/${userId}/activities`, activityId)));
    showCustomModal("สำเร็จ", "ลบกิจกรรมแล้ว");
    loadLatestActivities();
    if (document.getElementById("my-activities")) loadMyActivities();
  } catch (err) {
    console.error(err);
    showCustomModal("ข้อผิดพลาด", "ลบกิจกรรมไม่สำเร็จ: " + err.message);
  }
}

// ===== JOIN Activity (ทำงานจริง) =====
async function joinActivity(activityId) {
  if (!userId) { showCustomModal("ข้อผิดพลาด", "กรุณาเข้าสู่ระบบก่อน"); return; }

  try {
    // เช็คว่าเข้าร่วมไปแล้วหรือยัง
    const claimRef = doc(db, `artifacts/${appId}/users/${userId}/claimedActivities`, activityId);
    const already = await exponentialBackoff(() => getDoc(claimRef));
    if (already.exists()) {
      showCustomModal("แจ้งเตือน", "คุณเข้าร่วมกิจกรรมนี้แล้ว");
      return;
    }

    // อ่านข้อมูลกิจกรรมเพื่อเอาชั่วโมง
    const actRef = doc(db, `artifacts/${appId}/public/data/activities`, activityId);
    const actSnap = await exponentialBackoff(() => getDoc(actRef));
    if (!actSnap.exists()) {
      showCustomModal("ข้อผิดพลาด", "ไม่พบบันทึกกิจกรรม");
      return;
    }
    const hours = actSnap.data().activityHours || 0;

    // บันทึกการเข้าร่วม
    await setDoc(claimRef, { joinedAt: serverTimestamp() });

    // อัปเดตโปรไฟล์สะสมชั่วโมง/คะแนน
    const profileRef = doc(db, `artifacts/${appId}/users/${userId}/profile`, "userProfile");
    await updateDoc(profileRef, {
      totalActivityHours: increment(hours),
      totalActivityPoints: increment(10) // ให้ 10 คะแนนต่อกิจกรรม
    });

    showCustomModal("สำเร็จ", "เข้าร่วมกิจกรรมเรียบร้อย!");
    // รีเฟรชรายการที่เกี่ยวข้อง
    if (document.getElementById("latest-activities")) loadLatestActivities();
    if (document.getElementById("search-results")) doSearch();
    if (document.getElementById("participated-activities")) loadParticipatedActivities();
    if (document.getElementById("profile-total-hours")) loadProfileData();
  } catch (err) {
    console.error(err);
    showCustomModal("ข้อผิดพลาด", "ไม่สามารถเข้าร่วมกิจกรรมได้: " + err.message);
  }
}

// ===== Profile Data =====
async function loadProfileData() {
  if (!userId) return;
  document.getElementById("profile-user-id").textContent = userId;
  document.getElementById("profile-user-email").textContent = auth.currentUser?.email || "-";

  const ref = doc(db, `artifacts/${appId}/users/${userId}/profile`, "userProfile");
  try {
    const snap = await exponentialBackoff(() => getDoc(ref));
    if (snap.exists()) {
      const d = snap.data();
      document.getElementById("profile-display-name-span").textContent = d.displayName || "ไม่ระบุ";
      document.getElementById("profile-avatar").src = d.photoURL || "https://placehold.co/100x100/A0AEC0/FFFFFF?text=USER";
      document.getElementById("profile-user-role").textContent = d.role || "user";
      document.getElementById("profile-total-hours").textContent = d.totalActivityHours || 0;
      document.getElementById("profile-total-points").textContent = d.totalActivityPoints || 0;
    }
  } catch (err) {
    console.error(err);
  }
}

async function loadMyActivities() {
  if (!userId) return;
  const container = document.getElementById("my-activities");
  container.innerHTML = `<div class="loading-indicator"><div class="loading-spinner"></div><span>โหลด...</span></div>`;
  try {
    const snap = await exponentialBackoff(() => getDocs(myActivitiesCol(userId)));
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    container.innerHTML = list.length
      ? list.map((a) => activityCard(a, { showActions: true, mine: true })).join("")
      : `<p class="text-gray-500">ยังไม่มีกิจกรรมที่คุณสร้าง</p>`;
    container.querySelectorAll(".delete-btn").forEach((btn) => (btn.onclick = () => deleteMyActivity(btn.dataset.id)));
  } catch (err) {
    console.error(err);
    container.innerHTML = `<p class="text-red-600">โหลดไม่สำเร็จ: ${err.message}</p>`;
  }
}

async function loadParticipatedActivities() {
  if (!userId) return;
  const container = document.getElementById("participated-activities");
  container.innerHTML = `<div class="loading-indicator"><div class="loading-spinner"></div><span>โหลด...</span></div>`;

  try {
    const claimedSnap = await exponentialBackoff(() => getDocs(myClaimedCol(userId)));
    const ids = claimedSnap.docs.map((d) => d.id);
    if (ids.length === 0) {
      container.innerHTML = `<p class="text-gray-500">ยังไม่ได้เข้าร่วมกิจกรรมใด ๆ</p>`;
      return;
    }

    const acts = [];
    for (const id of ids) {
      const aSnap = await exponentialBackoff(() => getDoc(doc(db, `artifacts/${appId}/public/data/activities`, id)));
      if (aSnap.exists()) acts.push({ id, ...aSnap.data() });
    }
    container.innerHTML = acts.map((a) => activityCard(a, { showActions: false })).join("");
  } catch (err) {
    console.error(err);
    container.innerHTML = `<p class="text-red-600">โหลดไม่สำเร็จ: ${err.message}</p>`;
  }
}

// ===== Sign out =====
async function handleSignOut(isAuto = false) {
  try {
    await signOut(auth);
    if (!isAuto) showCustomModal("ออกจากระบบ", "ออกจากระบบเรียบร้อย");
  } catch (err) {
    console.error(err);
    showCustomModal("ข้อผิดพลาด", "ออกจากระบบไม่สำเร็จ: " + err.message);
  }
}
// ---------------- CHAT (Floating Messenger Style) ----------------
const chatWindow = document.getElementById("chat-window");
const chatToggleBtn = document.getElementById("chat-toggle-btn");
const chatCloseBtn = document.getElementById("chat-close-btn");
const chatMessages = document.getElementById("chat-messages");
const chatInput = document.getElementById("chat-input");
const chatSendBtn = document.getElementById("chat-send-btn");
const chatFriendName = document.getElementById("chat-friend-name");

let currentChatFriend = null;

// toggle chat
chatToggleBtn.addEventListener("click", () => {
  chatWindow.classList.toggle("hidden");
});

// close chat
chatCloseBtn.addEventListener("click", () => {
  chatWindow.classList.add("hidden");
});

function getChatId(u1, u2) {
  return [u1, u2].sort().join("_");
}

function openChat(friendId, friendName) {
  currentChatFriend = friendId;
  chatFriendName.textContent = friendName;
  chatWindow.classList.remove("hidden");

  const chatRef = collection(db, `artifacts/${appId}/chats/${getChatId(userId, friendId)}/messages`);
  onSnapshot(query(chatRef, orderBy("sentAt")), (snapshot) => {
    chatMessages.innerHTML = "";
    snapshot.forEach(doc => {
      const m = doc.data();
      const cls = m.sender === userId ? "me" : "friend";
      chatMessages.innerHTML += `<p class="${cls}">${m.text}</p><br>`;
    });
    chatMessages.scrollTop = chatMessages.scrollHeight;
  });
}

chatSendBtn.addEventListener("click", async () => {
  if (!chatInput.value.trim()) return;
  const msg = chatInput.value.trim();
  chatInput.value = "";
  const chatRef = collection(db, `artifacts/${appId}/chats/${getChatId(userId, currentChatFriend)}/messages`);
  await addDoc(chatRef, {
    sender: userId,
    text: msg,
    sentAt: serverTimestamp()
  });
});
