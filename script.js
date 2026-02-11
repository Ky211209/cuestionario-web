import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = { apiKey: "AIzaSyAMQpnPJSdicgo5gungVOE0M7OHwkz4P9Y", authDomain: "autenticacion-8faac.firebaseapp.com", projectId: "autenticacion-8faac", storageBucket: "autenticacion-8faac.firebasestorage.app", appId: "1:939518706600:web:d28c3ec7de21da8379939d" };
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

// VARIABLES GLOBALES
let questions = [];
let currentIndex = 0;
let currentMateria = "";
let currentMode = "";

// --- SEGURIDAD: CONFIRMACIÓN AL CERRAR SESIÓN ---
document.getElementById('btn-logout').onclick = () => {
    const mensaje = currentMode === "study" 
        ? "¿Está seguro que desea salir? Su avance actual en Modo Estudio se guardará automáticamente." 
        : "¿Está seguro que desea salir?";
        
    if (confirm(mensaje)) {
        signOut(auth).then(() => location.reload());
    }
};

onAuthStateChanged(auth, async (user) => {
    if (user) {
        document.getElementById('auth-screen').classList.add('hidden');
        document.getElementById('setup-screen').classList.remove('hidden');
        // Mostrar nombre y límite (2 Disp.) como en tu captura
        document.getElementById('user-info').innerText = `${user.displayName.toUpperCase()} (2 Disp.)`;
        cargarMaterias();
    }
});

async function cargarMaterias() {
    const res = await fetch('data/config-materias.json');
    const data = await res.json();
    const select = document.getElementById('subject-select');
    select.innerHTML = '<option value="">-- Selecciona Materia --</option>';
    data.materias.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.id; opt.textContent = m.nombre;
        select.appendChild(opt);
    });

    // CORRECCIÓN: Asegurar que el botón se habilite al elegir materia
    select.addEventListener('change', () => {
        const btnStart = document.getElementById('btn-start');
        btnStart.disabled = select.value === "";
        btnStart.style.opacity = select.value === "" ? "0.5" : "1";
    });
}

document.getElementById('btn-start').onclick = async () => {
    currentMateria = document.getElementById('subject-select').value;
    currentMode = document.getElementById('mode-select').value;

    // VALIDACIÓN: ¿Existen preguntas en Firebase?
    const snap = await getDocs(collection(db, `bancos_preguntas/${currentMateria}/preguntas`));
    
    if (snap.empty) {
        alert("Atención: No existen preguntas por el momento para esta materia.");
        return;
    }

    questions = snap.docs.map(d => d.data());
    
    // GUARDADO AUTOMÁTICO: Recuperar avance en Modo Estudio
    if (currentMode === "study") {
        const savedIndex = localStorage.getItem(`progreso_${currentMateria}`);
        if (savedIndex && confirm("¿Desea retomar lo avanzado en esta materia?")) {
            currentIndex = parseInt(savedIndex);
        }
    }

    document.getElementById('setup-screen').classList.add('hidden');
    document.getElementById('quiz-screen').classList.remove('hidden');
    renderQuestion();
};

function renderQuestion() {
    // Lógica para mostrar la pregunta actual
    // ...
    // GUARDADO AUTOMÁTICO EN MODO ESTUDIO
    if (currentMode === "study") {
        localStorage.setItem(`progreso_${currentMateria}`, currentIndex);
    }
}

document.getElementById('btn-return').onclick = () => {
    if (confirm("¿Seguro que desea volver? Si está en Modo Estudio, su avance se guardará.")) {
        location.reload();
    }
};

document.getElementById('btn-login').onclick = () => signInWithPopup(auth, provider);
