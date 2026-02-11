import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Tu configuración de Firebase
const firebaseConfig = {
    apiKey: "AIzaSyAMQpnPJSdicgo5gungVOE0M7OHwkz4P9Y",
    authDomain: "autenticacion-8faac.firebaseapp.com",
    projectId: "autenticacion-8faac",
    storageBucket: "autenticacion-8faac.firebasestorage.app",
    appId: "1:939518706600:web:d28c3ec7de21da8379939d"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

// CONFIGURACIÓN DE ACCESO VIP (QUEMADOS)
const USUARIOS_VIP = {
    "kholguinb2@unemi.edu.ec": 2,  // Tú (Admin)
    "iastudillol@unemi.edu.ec": 2, // 2 Dispositivos
    "naguilarb@unemi.edu.ec": 2,   // 2 Dispositivos
    "csanchezl3@unemi.edu.ec": 1   // Sánchez (Limitado a 1)
};

// Control de Sesión y Lista Blanca
onAuthStateChanged(auth, async (user) => {
    if (user) {
        const email = user.email.toLowerCase();
        let limiteDispositivos = 0;

        // 1. Verificar si está en la lista quemada
        if (USUARIOS_VIP[email] !== undefined) {
            limiteDispositivos = USUARIOS_VIP[email];
        } else {
            // 2. Buscar en Firestore (Registrados por ti en el panel)
            const snap = await getDoc(doc(db, "settings_usuarios", email));
            if (snap.exists()) {
                limiteDispositivos = snap.data().max_dispositivos;
            }
        }

        if (limiteDispositivos > 0) {
            iniciarSimuladorUI(user, limiteDispositivos);
        } else {
            alert("ACCESO DENEGADO: Tu correo no está autorizado. Contacta a la administradora.");
            signOut(auth);
        }
    } else {
        mostrarLoginUI();
    }
});

function iniciarSimuladorUI(user, limite) {
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('setup-screen').classList.remove('hidden');
    document.getElementById('user-display').classList.remove('hidden');
    document.getElementById('user-info').innerText = `${user.displayName} (${limite} Disp.)`;
    cargarMaterias();
}

function mostrarLoginUI() {
    document.getElementById('auth-screen').classList.remove('hidden');
    document.getElementById('setup-screen').classList.add('hidden');
    document.getElementById('user-display').classList.add('hidden');
    document.getElementById('quiz-screen').classList.add('hidden');
}

// Cargar Materias desde el JSON
async function cargarMaterias() {
    const res = await fetch('data/config-materias.json');
    const data = await res.json();
    const select = document.getElementById('subject-select');
    select.innerHTML = '<option value="">-- Selecciona Materia --</option>';
    data.materias.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = m.nombre;
        select.appendChild(opt);
    });
}

// Eventos de Botones
document.getElementById('btn-login').onclick = () => signInWithPopup(auth, provider);
document.getElementById('btn-logout').onclick = () => signOut(auth);
document.getElementById('subject-select').onchange = (e) => {
    document.getElementById('btn-start').disabled = !e.target.value;
    document.getElementById('btn-start').innerText = e.target.value ? "Empezar Prueba" : "Selecciona una materia";
};
