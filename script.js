import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = { apiKey: "AIzaSyAMQpnPJSdicgo5gungVOE0M7OHwkz4P9Y", authDomain: "autenticacion-8faac.firebaseapp.com", projectId: "autenticacion-8faac", storageBucket: "autenticacion-8faac.firebasestorage.app", appId: "1:939518706600:web:d28c3ec7de21da8379939d" };
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

const VIP = { "kholguinb2@unemi.edu.ec": 2, "iastudillol@unemi.edu.ec": 2, "naguilarb@unemi.edu.ec": 2, "csanchezl3@unemi.edu.ec": 1 };
let currentMateria = "", currentMode = "", questions = [], currentIndex = 0;

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
            document.getElementById('user-display').classList.remove('hidden');
            document.getElementById('user-info').innerText = `${user.displayName.toUpperCase()} (${limit} Disp.)`;
            cargarMaterias();
        } else {
            Swal.fire('Acceso Denegado', 'No estás en la lista autorizada.', 'error');
            signOut(auth);
        }
    } else {
        document.getElementById('auth-screen').classList.remove('hidden');
        document.getElementById('setup-screen').classList.add('hidden');
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

    // FIX: Habilitar botón al seleccionar materia
    select.onchange = () => {
        const btn = document.getElementById('btn-start');
        btn.disabled = select.value === "";
        btn.style.opacity = select.value === "" ? "0.5" : "1";
    };
}

document.getElementById('btn-logout').onclick = () => {
    Swal.fire({
        title: '¿Cerrar Sesión?',
        text: "¿Está seguro que desea salir?",
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#1a73e8',
        confirmButtonText: 'Sí, salir'
    }).then((result) => { if (result.isConfirmed) signOut(auth).then(() => location.reload()); });
};

document.getElementById('btn-start').onclick = async () => {
    currentMateria = document.getElementById('subject-select').value;
    currentMode = document.getElementById('mode-select').value;
    const snap = await getDocs(collection(db, `bancos_preguntas/${currentMateria}/preguntas`));

    if (snap.empty) {
        Swal.fire('Sin Contenido', 'No existen preguntas por el momento para esta materia.', 'info');
        return;
    }

    if (currentMode === "study") {
        const saved = localStorage.getItem(`progreso_${currentMateria}`);
        if (saved) {
            const res = await Swal.fire({ title: 'Progreso detectado', text: '¿Deseas retomar lo avanzado?', icon: 'info', showCancelButton: true });
            currentIndex = res.isConfirmed ? parseInt(saved) : 0;
        }
    }

    document.getElementById('setup-screen').classList.add('hidden');
    document.getElementById('quiz-screen').classList.remove('hidden');
    // Lógica para renderizar pregunta...
};

document.getElementById('btn-login').onclick = () => signInWithPopup(auth, provider);
