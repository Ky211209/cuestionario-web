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

let currentMateria = "";
let questions = [];

onAuthStateChanged(auth, async (user) => {
    if (user) {
        document.getElementById('auth-screen').classList.add('hidden');
        document.getElementById('setup-screen').classList.remove('hidden');
        // Mostrar nombre como en tu cabecera
        document.getElementById('user-info').innerText = `${user.displayName.toUpperCase()} (2 Disp.)`;
        cargarMaterias();
    }
});

async function cargarMaterias() {
    const res = await fetch('data/config-materias.json');
    const data = await res.json();
    const select = document.getElementById('subject-select');
    const btnStart = document.getElementById('btn-start');

    select.innerHTML = '<option value="">-- Selecciona Materia --</option>';
    data.materias.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.id; opt.textContent = m.nombre;
        select.appendChild(opt);
    });

    // FIX: Habilita el botón "Empezar" inmediatamente al elegir
    select.onchange = () => {
        if (select.value !== "") {
            btnStart.disabled = false;
            btnStart.style.opacity = "1";
        } else {
            btnStart.disabled = true;
            btnStart.style.opacity = "0.5";
        }
    };
}

document.getElementById('btn-start').onclick = async () => {
    currentMateria = document.getElementById('subject-select').value;
    
    // RUTA UNIFICADA: bancos_preguntas -> materia -> preguntas
    const snap = await getDocs(collection(db, `bancos_preguntas/${currentMateria}/preguntas`));
    
    if (snap.empty) {
        Swal.fire({
            icon: 'info',
            title: 'Materia sin contenido',
            text: 'Atención: No existen preguntas cargadas por el momento para esta materia.',
            confirmButtonColor: '#1a73e8'
        });
        return;
    }

    questions = snap.docs.map(d => d.data());
    document.getElementById('setup-screen').classList.add('hidden');
    document.getElementById('quiz-screen').classList.remove('hidden');
};

document.getElementById('btn-logout').onclick = () => {
    Swal.fire({
        title: '¿Cerrar Sesión?',
        text: "¿Está seguro que desea salir?",
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#1a73e8'
    }).then((result) => { if (result.isConfirmed) signOut(auth).then(() => location.reload()); });
};

document.getElementById('btn-login').onclick = () => signInWithPopup(auth, provider);
