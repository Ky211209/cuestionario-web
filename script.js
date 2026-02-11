import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// 1. CONFIGURACIÓN DE TU FIREBASE (Se mantiene la de tu archivo original)
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

// 2. LISTA VIP (Usuarios quemados en el código con sus límites específicos)
const USUARIOS_VIP = {
    "kholguinb2@unemi.edu.ec": 2,  // Tú (Admin Total)
    "iastudillol@unemi.edu.ec": 2, // Compañero 1
    "naguilarb@unemi.edu.ec": 2,   // Compañero 2
    "csanchezl3@unemi.edu.ec": 1   // Sanchez (Limitado a 1)
};

// 3. VARIABLES DE ESTADO DEL SIMULADOR
let preguntas = [];
let indicePreguntaActual = 0;
let puntaje = 0;
let materiaSeleccionada = "";

// --- LÓGICA DE CONTROL DE ACCESO (WHITELIST) ---

onAuthStateChanged(auth, async (user) => {
    if (user) {
        const email = user.email.toLowerCase();

        // PASO A: Verificar si el usuario está en la lista VIP (Quemados)
        if (USUARIOS_VIP[email] !== undefined) {
            const limite = USUARIOS_VIP[email];
            console.log(`Acceso VIP detectado para: ${email}. Límite: ${limite}`);
            prepararInterfazSimulador(user, limite);
            return;
        }

        // PASO B: Si no es VIP, buscar en la base de datos (Registrados por ti)
        try {
            const userRef = doc(db, "settings_usuarios", email);
            const userSnap = await getDoc(userRef);

            if (userSnap.exists()) {
                const configManual = userSnap.data();
                console.log(`Acceso autorizado manualmente para: ${email}`);
                prepararInterfazSimulador(user, configManual.max_dispositivos);
            } else {
                // PASO C: No existe en ningún lado, expulsar por seguridad
                alert("ACCESO DENEGADO: Tu correo no está registrado en el sistema. Contacta a la administradora para obtener acceso.");
                await signOut(auth);
            }
        } catch (error) {
            console.error("Error al validar permisos:", error);
            alert("Error técnico al verificar tu cuenta.");
            await signOut(auth);
        }
    } else {
        // No hay sesión activa: Mostrar login
        document.getElementById('login-section').classList.remove('hidden');
        document.getElementById('materia-selection').classList.add('hidden');
        document.getElementById('quiz-container').classList.add('hidden');
    }
});

function prepararInterfazSimulador(user, limite) {
    // Guardamos el límite en el almacenamiento local para futuras validaciones
    localStorage.setItem('userLimit', limite);
    
    // Cambiar vista de secciones
    document.getElementById('login-section').classList.add('hidden');
    document.getElementById('materia-selection').classList.remove('hidden');
    document.getElementById('user-info').innerText = `${user.displayName} | Límite: ${limite} disp.`;
    
    cargarMaterias();
}

// --- LÓGICA DEL SIMULADOR (BASADA EN TU SCRIPT ORIGINAL) ---

async function cargarMaterias() {
    try {
        const response = await fetch('data/config-materias.json'); //
        const materias = await response.json();
        const container = document.getElementById('materias-grid');
        container.innerHTML = "";

        materias.forEach(m => {
            const btn = document.createElement('button');
            btn.className = "btn-materia";
            btn.innerHTML = `<i class="fas fa-book"></i> ${m.nombre}`;
            btn.onclick = () => iniciarQuiz(m.id);
            container.appendChild(btn);
        });
    } catch (e) {
        console.error("Error cargando materias:", e);
    }
}

async function iniciarQuiz(materiaId) {
    materiaSeleccionada = materiaId;
    document.getElementById('materia-selection').classList.add('hidden');
    document.getElementById('quiz-container').classList.remove('hidden');
    
    // Cargar preguntas desde Firebase
    const q = collection(db, `bancos_preguntas/${materiaId}/preguntas`);
    const querySnapshot = await getDocs(q);
    preguntas = [];
    querySnapshot.forEach(doc => preguntas.push(doc.data()));

    // Barajar preguntas aleatoriamente
    preguntas.sort(() => Math.random() - 0.5);
    
    indicePreguntaActual = 0;
    puntaje = 0;
    mostrarPregunta();
}

function mostrarPregunta() {
    const p = preguntas[indicePreguntaActual];
    document.getElementById('question-text').innerText = p.texto;
    
    const optionsContainer = document.getElementById('options-container');
    optionsContainer.innerHTML = "";

    p.opciones.forEach((op, i) => {
        const btn = document.createElement('button');
        btn.className = "btn-option";
        btn.innerText = op;
        btn.onclick = () => verificarRespuesta(i);
        optionsContainer.appendChild(btn);
    });

    document.getElementById('progress-text').innerText = `Pregunta ${indicePreguntaActual + 1} de ${preguntas.length}`;
}

function verificarRespuesta(indiceSeleccionado) {
    const p = preguntas[indicePreguntaActual];
    if (indiceSeleccionado === p.respuesta) {
        puntaje++;
        alert("¡Correcto! " + (p.explicacion || ""));
    } else {
        alert("Incorrecto. La respuesta era: " + p.opciones[p.respuesta] + "\n\n" + (p.explicacion || ""));
    }

    indicePreguntaActual++;
    if (indicePreguntaActual < preguntas.length) {
        mostrarPregunta();
    } else {
        finalizarQuiz();
    }
}

function finalizarQuiz() {
    alert(`Quiz finalizado. Tu puntaje: ${puntaje}/${preguntas.length}`);
    location.reload(); // Volver al inicio
}

// BOTONES DE ACCIÓN GLOBAL
document.getElementById('btn-login').onclick = () => signInWithPopup(auth, provider);
document.getElementById('btn-logout').onclick = () => signOut(auth);
