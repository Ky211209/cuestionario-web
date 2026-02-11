import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = { apiKey: "AIzaSyAMQpnPJSdicgo5gungVOE0M7OHwkz4P9Y", authDomain: "autenticacion-8faac.firebaseapp.com", projectId: "autenticacion-8faac", storageBucket: "autenticacion-8faac.firebasestorage.app", appId: "1:939518706600:web:d28c3ec7de21da8379939d" };
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

let currentMateria = "", currentMode = "", questions = [], currentIndex = 0;

// 1. MANEJO DE SESIÓN PERMANENTE
onAuthStateChanged(auth, async (user) => {
    if (user) {
        document.getElementById('auth-screen').classList.add('hidden');
        document.getElementById('setup-screen').classList.remove('hidden');
        document.getElementById('user-display').classList.remove('hidden');
        document.getElementById('user-info').innerText = `${user.displayName.toUpperCase()} (2 Disp.)`;
        cargarMaterias();
    } else {
        document.getElementById('auth-screen').classList.remove('hidden');
        document.getElementById('setup-screen').classList.add('hidden');
        document.getElementById('user-display').classList.add('hidden');
    }
});

// 2. CARGAR MATERIAS Y ACTIVAR BOTÓN
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

    select.onchange = () => {
        btnStart.disabled = select.value === "";
        btnStart.style.opacity = select.value === "" ? "0.5" : "1";
    };
}

// 3. INICIAR EXAMEN O RECUPERAR PROGRESO
document.getElementById('btn-start').onclick = async () => {
    currentMateria = document.getElementById('subject-select').value;
    currentMode = document.getElementById('mode-select').value;

    const snap = await getDocs(collection(db, `bancos_preguntas/${currentMateria}/preguntas`));
    if (snap.empty) {
        Swal.fire({ icon: 'info', title: 'Aviso', text: 'Atención: No existen preguntas cargadas para esta materia.', confirmButtonColor: '#1a73e8' });
        return;
    }

    questions = snap.docs.map(d => d.data());

    // MODO ESTUDIO: RECUPERAR AVANCE
    if (currentMode === "study") {
        const saved = localStorage.getItem(`progreso_${currentMateria}`);
        if (saved) {
            const result = await Swal.fire({
                title: 'Avance Detectado',
                text: '¿Deseas retomar lo avanzado o empezar desde la primera pregunta?',
                icon: 'question',
                showCancelButton: true,
                confirmButtonText: 'Retomar avance',
                cancelButtonText: 'Empezar de cero'
            });
            currentIndex = result.isConfirmed ? parseInt(saved) : 0;
        } else { currentIndex = 0; }
    } else { currentIndex = 0; }

    document.getElementById('setup-screen').classList.add('hidden');
    document.getElementById('quiz-screen').classList.remove('hidden');
    document.getElementById('btn-header-return').classList.remove('hidden');
    // Aquí iniciarías la lógica de renderizar la pregunta...
};

// 4. GUARDADO AUTOMÁTICO (Llamar esta función cada vez que cambies de pregunta)
function guardarAvanceAutomatico() {
    if (currentMode === "study") {
        localStorage.setItem(`progreso_${currentMateria}`, currentIndex);
    }
}

// 5. CERRAR SESIÓN CON CONFIRMACIÓN PROFESIONAL
document.getElementById('btn-logout').onclick = () => {
    Swal.fire({
        title: '¿Cerrar Sesión?',
        text: currentMode === "study" ? "Tu progreso en esta materia ha sido guardado automáticamente." : "¿Deseas salir del simulador?",
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#1a73e8',
        confirmButtonText: 'Sí, salir'
    }).then((result) => { if (result.isConfirmed) signOut(auth).then(() => location.reload()); });
};

document.getElementById('btn-header-return').onclick = () => {
    Swal.fire({ title: '¿Volver al menú?', text: 'Se guardará tu progreso si estás en modo estudio.', icon: 'warning', showCancelButton: true })
    .then((res) => { if(res.isConfirmed) location.reload(); });
};

document.getElementById('btn-login').onclick = () => signInWithPopup(auth, provider);
