import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, getDocs, query } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

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

const USUARIOS_VIP = {
    "kholguinb2@unemi.edu.ec": 2, 
    "iastudillol@unemi.edu.ec": 2, 
    "naguilarb@unemi.edu.ec": 2,   
    "csanchezl3@unemi.edu.ec": 1   
};

onAuthStateChanged(auth, async (user) => {
    if (user) {
        const email = user.email.toLowerCase();
        let limite = 0;

        if (USUARIOS_VIP[email] !== undefined) {
            limite = USUARIOS_VIP[email];
        } else {
            const snap = await getDoc(doc(db, "settings_usuarios", email));
            if (snap.exists()) limite = snap.data().max_dispositivos;
        }

        if (limite > 0) {
            document.getElementById('auth-screen').classList.add('hidden');
            document.getElementById('setup-screen').classList.remove('hidden');
            document.getElementById('user-display').classList.remove('hidden');
            document.getElementById('user-info').innerText = `${user.displayName} (${limite} Disp.)`;
            cargarMaterias();
        } else {
            alert("Acceso Denegado: No estás en la lista autorizada.");
            signOut(auth);
        }
    } else {
        document.getElementById('auth-screen').classList.remove('hidden');
        document.getElementById('setup-screen').classList.add('hidden');
        document.getElementById('user-display').classList.add('hidden');
    }
});

async function iniciarSimulador() {
    const materiaId = document.getElementById('subject-select').value;
    const snap = await getDocs(collection(db, `bancos_preguntas/${materiaId}/preguntas`));

    if (snap.empty) {
        alert("Atención: No existen preguntas cargadas por el momento para esta materia.");
        return; 
    }

    document.getElementById('setup-screen').classList.add('hidden');
    document.getElementById('quiz-screen').classList.remove('hidden');
}

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
}

document.getElementById('btn-login').onclick = () => signInWithPopup(auth, provider);
document.getElementById('btn-logout').onclick = () => signOut(auth);
document.getElementById('btn-start').onclick = iniciarSimulador;
document.getElementById('btn-return').onclick = () => {
    if(confirm("¿Volver a la selección de materias?")) {
        document.getElementById('quiz-screen').classList.add('hidden');
        document.getElementById('setup-screen').classList.remove('hidden');
    }
};
document.getElementById('subject-select').onchange = (e) => {
    document.getElementById('btn-start').disabled = !e.target.value;
};
