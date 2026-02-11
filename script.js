import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, getDocs, setDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = { apiKey: "AIzaSyAMQpnPJSdicgo5gungVOE0M7OHwkz4P9Y", authDomain: "autenticacion-8faac.firebaseapp.com", projectId: "autenticacion-8faac", storageBucket: "autenticacion-8faac.firebasestorage.app", appId: "1:939518706600:web:d28c3ec7de21da8379939d" };
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

// WHITELIST VIP
const VIP = { "kholguinb2@unemi.edu.ec": 2, "iastudillol@unemi.edu.ec": 2, "naguilarb@unemi.edu.ec": 2, "csanchezl3@unemi.edu.ec": 1 };

onAuthStateChanged(auth, async (user) => {
    if (user) {
        const email = user.email.toLowerCase();
        let limit = VIP[email] || 0;
        if (!limit) {
            const snap = await getDoc(doc(db, "settings_usuarios", email));
            if (snap.exists()) limit = snap.data().max_dispositivos;
        }

        if (limit > 0) {
            document.getElementById('auth-screen').classList.add('hidden');
            document.getElementById('setup-screen').classList.remove('hidden');
            document.getElementById('user-display')?.classList.remove('hidden');
            cargarConfiguracion();
        } else {
            alert("Acceso denegado. No está registrado.");
            signOut(auth);
        }
    } else {
        document.getElementById('auth-screen').classList.remove('hidden');
        document.getElementById('setup-screen').classList.add('hidden');
    }
});

// Carga de Materias
async function cargarConfiguracion() {
    const res = await fetch('data/config-materias.json');
    const data = await res.json();
    const select = document.getElementById('subject-select');
    select.innerHTML = '<option value="">-- Selecciona Materia --</option>';
    data.materias.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.id; opt.textContent = m.nombre;
        select.appendChild(opt);
    });
}

// --- VALIDACIÓN Y CIERRE SEGURO ---
document.getElementById('btn-logout').onclick = () => {
    if (confirm("¿Está seguro que desea salir?")) {
        signOut(auth);
    }
};

document.getElementById('btn-start').onclick = async () => {
    const materiaId = document.getElementById('subject-select').value;
    const modo = document.getElementById('mode-select').value;
    
    // VALIDACIÓN DE PREGUNTAS (Especialmente Computación Forense)
    const snap = await getDocs(collection(db, `bancos_preguntas/${materiaId}/preguntas`));
    
    if (snap.empty) {
        alert("Atención: No existen preguntas por el momento para esta materia.");
        return;
    }

    // Lógica para guardado de progreso en Modo Estudio
    if (modo === "study") {
        const avance = localStorage.getItem(`progreso_${materiaId}`);
        if (avance && confirm("Desea retomar lo avanzado en esta materia?")) {
            // Cargar índice guardado
        }
    }

    document.getElementById('setup-screen').classList.add('hidden');
    document.getElementById('quiz-screen').classList.remove('hidden');
    // Iniciar lógica de preguntas...
};

// Al responder preguntas en Modo Estudio, se debe guardar el índice:
// localStorage.setItem(`progreso_${materiaId}`, indiceActual);

document.getElementById('btn-google').onclick = () => signInWithPopup(auth, provider);
