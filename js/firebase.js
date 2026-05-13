// firebase.js - إعداد Firebase والمصادقة والمفضلة
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "modcheck-pro.firebaseapp.com",
  projectId: "modcheck-pro",
  storageBucket: "modcheck-pro.firebasestorage.app",
  messagingSenderId: "144823916189",
  appId: "1:144823916189:web:b38dac9b6ee127331ea674",
  measurementId: "G-GT6N5WM3G5"
};

// تهيئة Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// حالة المستخدم والمفضلة (متغيرات عامة)
let currentUser = null;
let userFavorites = new Set();

// دالة عرض رسالة نخب
function showToast(message) {
  const toast = document.createElement('div');
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
    background: #111; color: #fff; padding: 10px 20px;
    border-radius: 8px; z-index: 9999; white-space: nowrap;
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// الاستماع لتغيرات المصادقة
auth.onAuthStateChanged(async (user) => {
  const wasLoggedIn = !!currentUser;
  currentUser = user;
  if (user) {
    document.getElementById('loginBtn').style.display = 'none';
    document.getElementById('logoutBtn').style.display = 'inline-block';
    try {
      const doc = await db.collection('users').doc(user.uid).get();
      if (doc.exists && Array.isArray(doc.data().favorites)) {
        userFavorites = new Set(doc.data().favorites);
      } else {
        userFavorites = new Set();
      }
    } catch (e) {
      showToast('فشل جلب المفضلة');
      userFavorites = new Set();
    }
  } else {
    document.getElementById('loginBtn').style.display = 'inline-block';
    document.getElementById('logoutBtn').style.display = 'none';
    userFavorites = new Set();
  }
  // استدعاء دالة إعادة العرض من app.js عند تغير حالة الدخول
  if (typeof onAuthStateChangedCallback === 'function') {
    onAuthStateChangedCallback(user);
  }
});

// تسجيل الدخول
document.getElementById('loginBtn').addEventListener('click', () => {
  const provider = new firebase.auth.GoogleAuthProvider();
  auth.signInWithPopup(provider).catch(() => showToast('فشل تسجيل الدخول'));
});

// تسجيل الخروج
document.getElementById('logoutBtn').addEventListener('click', () => {
  auth.signOut();
});

// تحديث المفضلة مع debounce
let favTimeout;
function updateFavoritesFirestoreDebounced() {
  clearTimeout(favTimeout);
  favTimeout = setTimeout(async () => {
    if (!currentUser || !currentUser.uid) return;
    try {
      await db.collection('users').doc(currentUser.uid).set({
        favorites: Array.from(userFavorites)
      }, { merge: true });
    } catch (e) {
      showToast('فشل تحديث المفضلة');
    }
  }, 1000);
}

// تبديل حالة المفضلة
function toggleFavorite(slug) {
  if (!currentUser) return;
  if (typeof slug !== 'string' || !slug.match(/^[a-zA-Z0-9_-]+$/)) return;
  
  if (userFavorites.has(slug)) {
    userFavorites.delete(slug);
  } else {
    userFavorites.add(slug);
  }
  updateFavoritesFirestoreDebounced();
  // إعادة عرض الشبكة
  if (typeof renderGridCallback === 'function') renderGridCallback();
}
