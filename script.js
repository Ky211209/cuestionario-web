import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut, browserLocalPersistence, setPersistence } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, collection, getDocs, addDoc, getCountFromServer, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

function getDeviceId() {
    let id = localStorage.getItem('device_id');
    if (!id) { id = 'dev_' + Math.random().toString(36).substr(2,12) + '_' + Date.now(); localStorage.setItem('device_id', id); }
    return id;
}

const firebaseConfig = {
    apiKey: "AIzaSyAMQpnPJSdicgo5gungVOE0M7OHwkz4P9Y",
    authDomain: "autenticacion-8faac.firebaseapp.com",
    projectId: "autenticacion-8faac",
    storageBucket: "autenticacion-8faac.firebasestorage.app",
    appId: "1:939518706600:web:d28c3ec7de21da8379939d"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Usar localStorage en vez de cookies → funciona en móvil sin bloqueo cross-domain
setPersistence(auth, browserLocalPersistence).catch(e => console.warn("setPersistence error:", e));
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

// ================================================================
// DETECCIÓN DE DISPOSITIVO MÓVIL
// ================================================================
const esMobil = /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(navigator.userAgent)
    || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent)); // iPad iPadOS

// ================================================================
// MÓDULO DE SEGURIDAD
// ================================================================
let currentUserEmail = "";
let currentUserName = "";
let watermarkElement = null;
let contentHidden = false;

// --- 1. MARCA DE AGUA ---
function crearMarcaDeAgua(email) {
    watermarkElement = email;
}

function insertarMarcaEnPregunta(email) {
    const existente = document.getElementById('security-watermark');
    if (existente) existente.remove();

    const wm = document.createElement('div');
    wm.id = 'security-watermark';
    wm.innerText = `© ${email}`;
    wm.style.cssText = `
        font-size: 0.70rem;
        color: rgba(100, 100, 100, 0.5);
        font-family: 'Courier New', monospace;
        user-select: none;
        pointer-events: none;
        text-align: right;
        margin-bottom: 6px;
        letter-spacing: 0.03em;
    `;
    const quizScreen = document.getElementById('quiz-screen');
    const questionText = document.getElementById('question-text');
    quizScreen.insertBefore(wm, questionText);
}

// --- 2. LOG DE AUDITORÍA ---
async function registrarAcceso(tipo, detalle = {}) {
    if (!currentUserEmail) return;
    try {
        await addDoc(collection(db, "auditoria_accesos"), {
            usuario: currentUserEmail,
            nombre: currentUserName,
            tipo,
            timestamp: serverTimestamp(),
            fecha_legible: new Date().toLocaleString('es-EC', { timeZone: 'America/Guayaquil' }),
            dispositivo: esMobil ? 'móvil' : 'escritorio',
            ...detalle
        });
    } catch (e) {
        console.warn("Log de auditoría falló:", e);
    }
}

// --- 3. OVERLAY DE SEGURIDAD ---
let overlayOcultar = null;
let screenShareStream = null;
let screenShareBloqueado = false;

function crearOverlay() {
    if (overlayOcultar) return;
    overlayOcultar = document.createElement('div');
    overlayOcultar.id = 'security-overlay';
    overlayOcultar.style.cssText = `
        display: none;
        position: fixed;
        top: 0; left: 0;
        width: 100%; height: 100%;
        background: #000;
        z-index: 99999;
        justify-content: center;
        align-items: center;
        flex-direction: column;
        text-align: center;
    `;
    document.body.appendChild(overlayOcultar);
}

function mostrarOverlayBloqueador(motivo, esCompartirPantalla = false) {
    if (!overlayOcultar) return;
    const quizVisible = !document.getElementById('quiz-screen').classList.contains('hidden');
    if (!quizVisible) return;

    contentHidden = true;
    const icono = esCompartirPantalla ? '🔴' : '🛡️';
    const titulo = esCompartirPantalla ? 'COMPARTIR PANTALLA BLOQUEADO' : 'CONTENIDO PROTEGIDO';
    const mensaje = esCompartirPantalla
        ? 'Has intentado compartir esta pantalla.<br>Las preguntas están ocultas hasta que<br><strong>cierres la transmisión.</strong>'
        : 'Vuelve a esta pestaña para continuar.';
    const colorTitulo = esCompartirPantalla ? '#ff4444' : '#ffffff';

    overlayOcultar.innerHTML = `
        <div style="max-width: 480px; padding: 40px;">
            <div style="font-size: 4rem; margin-bottom: 20px;">${icono}</div>
            <p style="color: ${colorTitulo}; font-size: 1.8rem; font-weight: 900; letter-spacing: 0.05em; margin-bottom: 16px;">
                ${titulo}
            </p>
            <p style="color: #aaa; font-size: 1rem; line-height: 1.7; margin-bottom: 28px;">
                ${mensaje}
            </p>
            <div style="background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.15); border-radius: 12px; padding: 16px 24px; display: inline-block;">
                <p style="color: #fff; font-size: 0.75rem; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 6px; opacity: 0.6;">
                    Sesión identificada como
                </p>
                <p style="color: #facc15; font-size: 1.1rem; font-weight: 700; margin: 0;">
                    ${currentUserName}
                </p>
                <p style="color: #aaa; font-size: 0.85rem; margin: 4px 0 0 0;">
                    ${currentUserEmail}
                </p>
            </div>
            ${esCompartirPantalla ? '' : `<p style="color: #555; font-size: 0.8rem; margin-top: 28px;">Este evento ha sido registrado</p>`}
        </div>
    `;
    overlayOcultar.style.display = 'flex';
    registrarAcceso(esCompartirPantalla ? 'intento_compartir_pantalla' : 'perder_foco', { motivo });
}

function ocultarOverlay() {
    if (!overlayOcultar) return;
    if (screenShareBloqueado) return;
    contentHidden = false;
    overlayOcultar.style.display = 'none';
}

// ── DETECCIÓN DE SCREEN SHARE (SOLO DESKTOP — en móvil no existe getDisplayMedia) ─
// FIX CRÍTICO #2: Verificar que getDisplayMedia exista antes de interceptarlo
if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
    const _originalGetDisplayMedia = navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getDisplayMedia = async function(constraints) {
        const quizVisible = !document.getElementById('quiz-screen').classList.contains('hidden');
        if (!quizVisible) return _originalGetDisplayMedia(constraints);

        try {
            screenShareStream = await _originalGetDisplayMedia(constraints);
            screenShareBloqueado = true;
            mostrarOverlayBloqueador('screen_share_detectado', true);

            screenShareStream.getVideoTracks().forEach(track => {
                track.addEventListener('ended', () => {
                    screenShareBloqueado = false;
                    screenShareStream = null;
                    contentHidden = false;
                    overlayOcultar.style.display = 'none';
                    registrarAcceso('pantalla_compartida_detenida');
                    Swal.fire({
                        icon: 'success', title: 'Transmisión cerrada',
                        text: 'Puedes continuar con el simulador.',
                        timer: 3000, showConfirmButton: false, toast: true, position: 'top-end'
                    });
                });
            });
            return screenShareStream;
        } catch (err) {
            throw err;
        }
    };
}

// ── EVENTOS DE FOCO / PESTAÑA ─────────────────────────────────────────────────
document.addEventListener('visibilitychange', () => {
    if (!extensionYaVerificada) return;
    const quizVisible = !document.getElementById('quiz-screen').classList.contains('hidden');
    if (!quizVisible) return;
    if (document.hidden) {
        mostrarOverlayBloqueador('cambio_pestaña', false);
    } else {
        ocultarOverlay();
    }
});

// FIX CRÍTICO #3: En móvil, el blur se dispara al abrir teclado virtual → NO usar en móvil
if (!esMobil) {
    window.addEventListener('blur', () => {
        if (!extensionYaVerificada) return;
        const quizVisible = !document.getElementById('quiz-screen').classList.contains('hidden');
        if (quizVisible) mostrarOverlayBloqueador('ventana_minimizada', false);
    });
    window.addEventListener('focus', () => ocultarOverlay());
}

// --- 4. PROTECCIÓN: CLIC DERECHO Y TECLADO ---
document.addEventListener('contextmenu', (e) => {
    const quizVisible = !document.getElementById('quiz-screen').classList.contains('hidden');
    if (quizVisible) {
        e.preventDefault();
        Swal.fire({
            icon: 'warning', title: 'Acción Restringida',
            text: 'El clic derecho está deshabilitado durante el simulador.',
            timer: 2000, showConfirmButton: false
        });
    }
});

document.addEventListener('keydown', (e) => {
    const quizVisible = !document.getElementById('quiz-screen').classList.contains('hidden');
    if (!quizVisible) return;
    if (e.key === 'F12' ||
        (e.ctrlKey && e.shiftKey && ['I','J','C'].includes(e.key)) ||
        (e.ctrlKey && e.key === 'u')) {
        e.preventDefault();
        registrarAcceso('intento_inspeccionar', { tecla: e.key });
    }
    if (e.key === 'PrintScreen') {
        registrarAcceso('intento_captura_pantalla');
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText('').catch(() => {});
        }
    }
});

// ================================================================
// INTEGRACIÓN OPCIONAL CON EXTENSIÓN QUIZELI STUDY HELPER
// (ya NO es requisito obligatorio para usar el simulador; si el
// usuario la tiene instalada, se siguen enviando notificaciones,
// pero su ausencia no bloquea el acceso)
// ================================================================
const EXTENSION_ID = 'dipmmfekidehflkmgdlcmlgadnehljfn';

let bloqueadoPorMeet = false;
let extensionYaVerificada = true;

function notificarExamenIniciado() {
    try { if (typeof chrome !== 'undefined' && chrome.runtime) chrome.runtime.sendMessage(EXTENSION_ID, { tipo: 'EXAMEN_INICIADO' }); } catch(e) {}
}
function notificarExamenTerminado() {
    try { if (typeof chrome !== 'undefined' && chrome.runtime) chrome.runtime.sendMessage(EXTENSION_ID, { tipo: 'EXAMEN_TERMINADO' }); } catch(e) {}
}

window.addEventListener('unemi_meet_detectado', (e) => {
    if (bloqueadoPorMeet) return;
    bloqueadoPorMeet = true;
    const plataforma = e.detail?.plataforma || '';
    // Usar el campo nombre si viene del nuevo content.js, sino calcularlo
    const nombre = e.detail?.nombre || (plataforma.includes('meet.google') ? 'Google Meet' : plataforma.includes('zoom') ? 'Zoom' : plataforma.includes('teams') ? 'Microsoft Teams' : plataforma.includes('discord') ? 'Discord' : 'videoconferencia');
    registrarAcceso('meet_detectado', { plataforma: nombre });
    if (!overlayOcultar) return;
    const quizVisible = !document.getElementById('quiz-screen').classList.contains('hidden');
    if (!quizVisible) return;
    contentHidden = true;
    overlayOcultar.innerHTML = `<div style="max-width:480px;padding:40px;text-align:center;">
        <div style="font-size:4rem;margin-bottom:20px;">🔴</div>
        <p style="color:#ff4444;font-size:1.8rem;font-weight:900;margin-bottom:16px;">${nombre.toUpperCase()} DETECTADO</p>
        <p style="color:#aaa;font-size:1rem;line-height:1.7;margin-bottom:28px;">Se detectó <strong>${nombre}</strong>. Las preguntas están ocultas hasta que cierres la aplicación.</p>
        <div style="background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.15);border-radius:12px;padding:16px 24px;display:inline-block;">
            <p style="color:#facc15;font-size:1.1rem;font-weight:700;margin:0;">${currentUserName}</p>
            <p style="color:#aaa;font-size:0.85rem;margin:4px 0 0;">${currentUserEmail}</p>
        </div>
        <p style="color:#555;font-size:0.8rem;margin-top:28px;">Este evento ha sido registrado</p>
    </div>`;
    overlayOcultar.style.display = 'flex';
});

window.addEventListener('unemi_meet_cerrado', () => {
    if (!bloqueadoPorMeet) return;
    bloqueadoPorMeet = false; screenShareBloqueado = false; contentHidden = false;
    if (overlayOcultar) overlayOcultar.style.display = 'none';
    registrarAcceso('meet_cerrado');
    Swal.fire({ icon:'success', title:'✅ Aplicación cerrada', text:'Puedes continuar.', timer:3000, showConfirmButton:false, toast:true, position:'top-end' });
});

// ================================================================
// CONFIGURACIÓN
// ================================================================
const ADMIN_EMAIL = "kholguinb2@unemi.edu.ec";
const USUARIOS_PERMITIDOS = [
    "kholguinb2@unemi.edu.ec",
    "iastudillol@unemi.edu.ec",
    "naguilarb@unemi.edu.ec"
];

let currentMateria = "", currentMode = "", questions = [], currentIndex = 0;
let selectedAnswers = [];
let enPantallaResultados = false;   // true mientras se muestran los resultados detallados
let timerInterval = null;
let tiempoLimiteSegundos = 0;
let tiempoRestante = 0;

// ================================================================
// SOPORTE PARA PREGUNTAS DE SELECCIÓN MÚLTIPLE
// Compatibilidad: "respuesta" puede ser un número (opción única, formato
// clásico) o un arreglo de números (selección múltiple, 2+ correctas).
// ================================================================
let seleccionTemporalMultiple = []; // selección en progreso (modo estudio, antes de confirmar)

function obtenerRespuestasCorrectas(question) {
    const r = question.respuesta;
    return Array.isArray(r) ? r.slice().sort((a, b) => a - b) : [r];
}

// Detecta si el texto de una opción es en realidad la ruta/URL de una imagen
// (para preguntas donde cada opción es una gráfica en vez de texto).
function esOpcionImagen(texto) {
    return typeof texto === 'string' && /\.(png|jpe?g|gif|webp)(\?.*)?$/i.test(texto.trim());
}

function esPreguntaMultiple(question) {
    return obtenerRespuestasCorrectas(question).length > 1;
}

// Evalúa una respuesta del usuario (número o arreglo) contra la(s) correcta(s).
// Para selección múltiple aplica crédito parcial: (aciertos - errores) / total de correctas, mínimo 0.
function evaluarRespuesta(question, respuestaUsuario) {
    const correctas = obtenerRespuestasCorrectas(question);
    if (Array.isArray(respuestaUsuario)) {
        const usuarioOrdenado = respuestaUsuario.slice().sort((a, b) => a - b);
        const esCorrectaExacta = usuarioOrdenado.length === correctas.length &&
            usuarioOrdenado.every((v, i) => v === correctas[i]);
        const aciertos = respuestaUsuario.filter(i => correctas.includes(i)).length;
        const errores = respuestaUsuario.filter(i => !correctas.includes(i)).length;
        const puntaje = Math.max(0, (aciertos - errores) / correctas.length);
        return { esCorrectaExacta, puntaje };
    } else {
        const esCorrectaExacta = correctas.includes(respuestaUsuario);
        return { esCorrectaExacta, puntaje: esCorrectaExacta ? 1 : 0 };
    }
}

// Convierte una respuesta (número, arreglo o null) en texto de letras legible (ej. "A, C")
function formatearRespuestaLegible(resp) {
    if (resp === null || resp === undefined) return 'Sin responder';
    if (Array.isArray(resp)) {
        if (resp.length === 0) return 'Sin responder';
        return resp.slice().sort((a, b) => a - b).map(i => String.fromCharCode(65 + i)).join(', ');
    }
    return String.fromCharCode(65 + resp);
}


// 1. MANEJO DE SESIÓN
onAuthStateChanged(auth, async (user) => {
    const adminLinkContainer = document.getElementById('admin-link-container');

    if (user) {
        const userEmail = user.email.toLowerCase();
        console.log('Usuario autenticado:', userEmail);

        const tieneAcceso = USUARIOS_PERMITIDOS.includes(userEmail);

        if (!tieneAcceso) {
            try {
                const userDoc = await getDoc(doc(db, "usuarios_seguros", userEmail));
                if (!userDoc.exists()) {
                    await Swal.fire({
                        icon: 'error', title: 'Acceso Denegado',
                        text: 'No tienes autorización para usar este simulador. Contacta al administrador.',
                        confirmButtonText: 'Entendido'
                    });
                    signOut(auth);
                    return;
                }
            } catch (error) {
                console.error('Error verificando usuario:', error);
            }
        }

        // ── CONTROL DE DISPOSITIVOS ─────────────────────────────
        let userData = null;
        const esAdminUser = userEmail === ADMIN_EMAIL;

        if (!esAdminUser) {
            try {
                const userDoc = await getDoc(doc(db, "usuarios_seguros", userEmail));
                if (userDoc.exists()) userData = userDoc.data();
            } catch(e) { console.warn('Error leyendo userData:', e); }

            if (userData) {
                const maxDisp = userData.max_dispositivos || 2;
                const dispositivosActivos = userData.dispositivos || {};
                const deviceId = getDeviceId();

                if (!dispositivosActivos[deviceId]) {
                    const cantActual = Object.keys(dispositivosActivos).length;
                    if (cantActual >= maxDisp) {
                        await Swal.fire({
                            icon: 'error', title: 'Límite de dispositivos alcanzado',
                            html: `Tu cuenta permite <strong>${maxDisp}</strong> dispositivo(s).<br>Ya tienes <strong>${cantActual}</strong> registrado(s).<br><br>Contacta al administrador para resetear tus dispositivos.`,
                            confirmButtonColor: '#ea4335', confirmButtonText: 'Entendido'
                        });
                        signOut(auth); return;
                    }
                    const nuevosDisp = { ...dispositivosActivos };
                    nuevosDisp[deviceId] = {
                        registrado: new Date().toLocaleString('es-EC', { timeZone: 'America/Guayaquil' }),
                        userAgent: navigator.userAgent.substring(0, 100)
                    };
                    try { await updateDoc(doc(db, "usuarios_seguros", userEmail), { dispositivos: nuevosDisp }); }
                    catch(e) { console.warn('No se pudo registrar dispositivo:', e); }
                }
            }
        }

        const maxDispFinal = userData?.max_dispositivos || 2;
        currentUserEmail = userEmail;
        currentUserName = user.displayName || userEmail;
        crearMarcaDeAgua(userEmail);
        crearOverlay();
        registrarAcceso('inicio_sesion');

        ocultarPantallaCarga();
        document.getElementById('auth-screen').classList.add('hidden');
        document.getElementById('setup-screen').classList.remove('hidden');
        document.body.classList.remove('auth-mode');
        document.getElementById('user-display').classList.remove('hidden');
        document.getElementById('user-info').innerText = currentUserName.split(' ')[0].toUpperCase();

        const welcomeName = document.getElementById('user-welcome-name');
        const welcomeSub = document.getElementById('user-welcome-sub');
        if (welcomeName) {
            const primer = (currentUserName || '').split(' ')[0].split('@')[0];
            welcomeName.textContent = 'Hola, ' + primer.charAt(0).toUpperCase() + primer.slice(1).toLowerCase();
        }
        if (welcomeSub) welcomeSub.textContent = `${userEmail} · ${maxDispFinal} dispositivo${maxDispFinal !== 1 ? 's' : ''}`;

        if (esAdminUser) {
            adminLinkContainer.classList.remove('hidden');
            adminLinkContainer.style.display = 'block';
        } else {
            adminLinkContainer.classList.add('hidden');
            adminLinkContainer.style.display = 'none';
        }

        cargarMaterias();
    } else {
        ocultarPantallaCarga();
        document.getElementById('auth-screen').classList.remove('hidden');
        document.getElementById('setup-screen').classList.add('hidden');
        document.body.classList.add('auth-mode');
        document.getElementById('user-display').classList.add('hidden');
        if (adminLinkContainer) {
            adminLinkContainer.classList.add('hidden');
            adminLinkContainer.style.display = 'none';
        }
    }
});

// 2. CARGAR MATERIAS
// La lista embebida (CONFIG_MATERIAS) trae la malla curricular (semestre y código) y se
// mantiene como respaldo para evitar errores 404 en GitHub Pages. Las materias creadas desde el Panel Administrativo
// se guardan en Firestore (colección "config_materias") y se suman a esta lista
// automáticamente; no hace falta editar este archivo para agregar materias nuevas.
const CONFIG_MATERIAS = {
  "materias": [
  { "id": "gestion-de-base-de-datos", "nombre": "Gestión de Base de Datos", "codigo": "", "semestre": 5, "icono": "fa-database", "activa": true },
  { "id": "diseno-de-investigacion", "nombre": "Diseño de Investigación", "codigo": "TI06-01", "semestre": 6, "icono": "fa-magnifying-glass", "activa": true },
  { "id": "mineria-de-datos", "nombre": "Minería de Datos", "codigo": "TI06-02", "semestre": 6, "icono": "fa-gem", "activa": true },
  { "id": "tecnologias-de-conmutacion-y-enrutamiento", "nombre": "Tecnologías de Conmutación y Enrutamiento", "codigo": "TI06-03", "semestre": 6, "icono": "fa-network-wired", "activa": true },
  { "id": "desarrollo-de-aplicaciones-web", "nombre": "Desarrollo de Aplicaciones Web", "codigo": "TI06-04", "semestre": 6, "icono": "fa-laptop-code", "activa": true },
  { "id": "ingenieria-de-software-ii", "nombre": "Ingeniería de Software II", "codigo": "TI06-05", "semestre": 6, "icono": "fa-code-branch", "activa": true },
  { "id": "liderazgo", "nombre": "Liderazgo", "codigo": "TI06-06", "semestre": 6, "icono": "fa-users", "activa": true },
  { "id": "gestion-de-proyectos-informaticos", "nombre": "Gestión de Proyectos Informáticos", "codigo": "TI07-01", "semestre": 7, "icono": "fa-diagram-project", "activa": true },
  { "id": "inteligencia-de-negocios", "nombre": "Inteligencia de Negocios", "codigo": "TI07-02", "semestre": 7, "icono": "fa-chart-line", "activa": true },
  { "id": "escalabilidad-y-redes", "nombre": "Escalabilidad y Redes", "codigo": "TI07-03", "semestre": 7, "icono": "fa-sitemap", "activa": true },
  { "id": "seguridad-informatica", "nombre": "Seguridad Informática", "codigo": "TI07-04", "semestre": 7, "icono": "fa-shield-halved", "activa": true },
  { "id": "administracion-y-organizacion-empresarial", "nombre": "Administración y Organización Empresarial", "codigo": "TI07-05", "semestre": 7, "icono": "fa-building", "activa": true },
  { "id": "practicas-servicio-comunitario", "nombre": "Prácticas de Servicio Comunitario", "codigo": "", "semestre": 7, "icono": "fa-hand-holding-heart", "activa": true },
  { "id": "comp-forense", "nombre": "Computación Forense", "codigo": "TI08-01", "semestre": 8, "icono": "fa-microscope", "activa": true },
  { "id": "ia", "nombre": "Inteligencia Artificial", "codigo": "TI08-02", "semestre": 8, "icono": "fa-robot", "activa": true },
  { "id": "emprendimiento", "nombre": "Emprendimiento e Innovación", "codigo": "TI08-03", "semestre": 8, "icono": "fa-lightbulb", "activa": true },
  { "id": "auditoria-ti", "nombre": "Auditoría de TI", "codigo": "TI08-04", "semestre": 8, "icono": "fa-clipboard-check", "activa": true },
  { "id": "deontologia", "nombre": "Deontología", "codigo": "TI08-05", "semestre": 8, "icono": "fa-scale-balanced", "activa": true },
  { "id": "practicas-1", "nombre": "Prácticas Laborales I", "codigo": "PPP", "semestre": 8, "icono": "fa-briefcase", "activa": true },
  { "id": "sgsi", "nombre": "Sistema de Gestión de la Seguridad de la Información", "codigo": "TI09-01", "semestre": 9, "icono": "fa-lock", "activa": true },
  { "id": "sistemas-distribuidos", "nombre": "Sistemas Distribuidos", "codigo": "TI09-02", "semestre": 9, "icono": "fa-share-nodes", "activa": true },
  { "id": "computacion-movil", "nombre": "Computación Móvil", "codigo": "TI09-03", "semestre": 9, "icono": "fa-mobile-screen", "activa": true },
  { "id": "gestion-de-sistemas-de-calidad", "nombre": "Gestión de Sistemas de Calidad", "codigo": "TI09-04", "semestre": 9, "icono": "fa-award", "activa": true },
  { "id": "formulacion-trabajo-titulacion", "nombre": "Formulación y Evaluación del Trabajo de Titulación", "codigo": "TI09-05", "semestre": 9, "icono": "fa-graduation-cap", "activa": true },
  { "id": "practicas-2", "nombre": "Prácticas Laborales II", "codigo": "PPP", "semestre": 9, "icono": "fa-user-tie", "activa": true }
  ]
};

// Combina la lista de respaldo con las materias guardadas en Firestore.
// Un documento de Firestore con el mismo ID sobrescribe (nombre, activa, etc.) al de respaldo.
async function obtenerMateriasConfiguradas() {
    const lista = CONFIG_MATERIAS.materias.map(m => ({ ...m }));
    const nuevas = [];
    try {
        const snap = await getDocs(collection(db, "config_materias"));
        snap.forEach(d => {
            const datos = d.data();
            const idx = lista.findIndex(m => m.id === d.id);
            if (idx >= 0) lista[idx] = { ...lista[idx], ...datos, id: d.id };
            else if (datos.nombre) nuevas.push({ ...datos, id: d.id });
        });
    } catch (e) {
        console.warn('No se pudo leer config_materias; se usa la lista de respaldo.', e);
    }
    nuevas.sort((a, b) => (a.creada || 0) - (b.creada || 0));
    return [...lista, ...nuevas].filter(m => m.eliminada !== true);   // las eliminadas desde el panel no se muestran
}

// ================================================================
// MENÚ DE MATERIAS EN TARJETAS (agrupadas por semestre)
// ================================================================
const NOMBRES_SEMESTRE = { 1: 'Primer', 2: 'Segundo', 3: 'Tercer', 4: 'Cuarto', 5: 'Quinto', 6: 'Sexto', 7: 'Séptimo', 8: 'Octavo', 9: 'Noveno', 10: 'Décimo' };
const CLAVE_CONTEOS = 'qz_conteos';
let materiasMenu = [];                 // materias que este usuario puede ver
const datosTarjeta = {};               // id -> { total, avance, portada }
const filtroMenu = { semestre: 'todos', texto: '', soloConPreguntas: false };
let cargaDatosId = 0;

function escHtml(t) {
    return String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function normalizarTexto(t) {
    return String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}
function claseSemestre(s) { return [5, 6, 7, 8, 9].includes(Number(s)) ? `sem-${Number(s)}` : 'sem-0'; }
function tituloSemestre(s) { return s ? `${NOMBRES_SEMESTRE[s] || s + '.º'} semestre` : 'Otras materias'; }
// El azul por defecto del panel no cuenta como color elegido: se usa el color del semestre
function colorPersonalizado(m) {
    return /^#[0-9a-fA-F]{6}$/.test(m.color || '') && m.color.toLowerCase() !== '#1a73e8' ? m.color : null;
}

function ordenarMaterias(lista) {
    const clave = (m) => [m.semestre ? Number(m.semestre) : 99, m.codigo ? 0 : 1, m.codigo || '', m.nombre || ''];
    return lista.slice().sort((a, b) => {
        const x = clave(a), y = clave(b);
        for (let i = 0; i < 4; i++) { if (x[i] < y[i]) return -1; if (x[i] > y[i]) return 1; }
        return 0;
    });
}

function htmlTarjeta(m) {
    const custom = colorPersonalizado(m);
    return `<article class="mcard ${claseSemestre(m.semestre)}" data-id="${escHtml(m.id)}" role="button" tabindex="0"${custom ? ` style="--hue:${custom}"` : ''}>
        <div class="mcard-cover">
            <i class="fas ${escHtml(m.icono || 'fa-book')} mcard-icono"></i>
            ${m.semestre ? `<span class="pill pill-sem">${escHtml(m.semestre)}.º</span>` : ''}
        </div>
        <div class="mcard-body">
            <h4>${escHtml(m.nombre)}</h4>
            <p class="mcard-meta"></p>
        </div>
        <div class="mcard-foot">
            <div class="prog-label"></div>
            <div class="prog-bar"><i></i></div>
        </div>
    </article>`;
}

// Actualiza los datos variables de una tarjeta (preguntas, avance, portada, estado)
function pintarTarjeta(card) {
    const m = materiasMenu.find(x => x.id === card.dataset.id);
    if (!m) return;
    const d = datosTarjeta[m.id] || {};
    const sinPreguntas = d.total === 0;
    card.classList.toggle('es-proximamente', sinPreguntas);
    card.setAttribute('aria-disabled', sinPreguntas ? 'true' : 'false');
    card.setAttribute('aria-label', `${m.nombre}${sinPreguntas ? ' (próximamente)' : ''}`);

    const meta = [];
    if (m.codigo) meta.push(escHtml(m.codigo));
    if (typeof d.total === 'number' && d.total > 0) meta.push(`${d.total} pregunta${d.total !== 1 ? 's' : ''}`);
    card.querySelector('.mcard-meta').innerHTML = meta.join(' · ') || '&nbsp;';

    const cover = card.querySelector('.mcard-cover');
    let estado = cover.querySelector('.pill-estado');
    if (sinPreguntas) {
        if (!estado) { estado = document.createElement('span'); estado.className = 'pill pill-estado'; cover.appendChild(estado); }
        estado.textContent = 'Próximamente';
    } else if (estado) { estado.remove(); }

    let img = cover.querySelector('img');
    if (d.portada) {
        if (!img) { img = document.createElement('img'); img.alt = ''; cover.insertBefore(img, cover.firstChild); }
        if (img.getAttribute('src') !== d.portada) img.src = d.portada;
        cover.classList.add('con-imagen');
    } else {
        if (img) img.remove();
        cover.classList.remove('con-imagen');
    }

    const label = card.querySelector('.prog-label');
    const barra = card.querySelector('.prog-bar i');
    if (sinPreguntas) { label.textContent = 'Sin preguntas todavía'; barra.style.width = '0%'; }
    else if (typeof d.avance === 'number') { label.textContent = `${d.avance}% completado`; barra.style.width = `${d.avance}%`; }
    else if (d.total === undefined) { label.textContent = 'Cargando…'; barra.style.width = '0%'; }
    else { label.textContent = '0% completado'; barra.style.width = '0%'; }
}

function actualizarEncabezadosSeccion() {
    document.querySelectorAll('#menu-secciones .sem-section').forEach(sec => {
        const ids = [...sec.querySelectorAll('.mcard')].map(c => c.dataset.id);
        const conPreguntas = ids.filter(id => (datosTarjeta[id] || {}).total > 0).length;
        const conocidos = ids.every(id => typeof (datosTarjeta[id] || {}).total === 'number');
        sec.querySelector('.sem-head span').textContent =
            `${ids.length} materia${ids.length !== 1 ? 's' : ''}` + (conocidos ? ` · ${conPreguntas} con preguntas` : '');
    });
}

function aplicarFiltrosMenu() {
    const q = normalizarTexto(filtroMenu.texto).trim();
    let visibles = 0;
    document.querySelectorAll('#menu-secciones .sem-section').forEach(sec => {
        let visiblesSeccion = 0;
        sec.querySelectorAll('.mcard').forEach(card => {
            const m = materiasMenu.find(x => x.id === card.dataset.id);
            const d = datosTarjeta[m.id] || {};
            let ok = true;
            if (filtroMenu.semestre !== 'todos' && String(m.semestre || 0) !== String(filtroMenu.semestre)) ok = false;
            if (ok && q && !normalizarTexto(`${m.nombre} ${m.codigo || ''}`).includes(q)) ok = false;
            if (ok && filtroMenu.soloConPreguntas && d.total === 0) ok = false;
            card.classList.toggle('hidden', !ok);
            if (ok) visiblesSeccion++;
        });
        sec.classList.toggle('hidden', visiblesSeccion === 0);
        visibles += visiblesSeccion;
    });
    document.querySelectorAll('#menu-chips .chip').forEach(c => c.classList.toggle('active', c.dataset.sem === String(filtroMenu.semestre)));
    const vacio = document.getElementById('menu-vacio');
    if (materiasMenu.length === 0) {
        vacio.textContent = 'No tiene materias asignadas. Contacte al administrador.';
        vacio.classList.remove('hidden');
    } else if (visibles === 0) {
        vacio.textContent = 'No hay materias que coincidan con la búsqueda.';
        vacio.classList.remove('hidden');
    } else {
        vacio.classList.add('hidden');
    }
}

function actualizarTarjetas() {
    document.querySelectorAll('#menu-secciones .mcard').forEach(pintarTarjeta);
    actualizarEncabezadosSeccion();
    aplicarFiltrosMenu();
}

function renderMenuMaterias() {
    const cont = document.getElementById('menu-secciones');
    const chips = document.getElementById('menu-chips');
    const grupos = new Map();
    materiasMenu.forEach(m => {
        const k = m.semestre ? Number(m.semestre) : 0;
        if (!grupos.has(k)) grupos.set(k, []);
        grupos.get(k).push(m);
    });
    const claves = [...grupos.keys()].sort((a, b) => (a || 99) - (b || 99));
    cont.innerHTML = claves.map(k => `<section class="sem-section ${claseSemestre(k)}" data-sem="${k}">
            <div class="sem-head"><h3>${tituloSemestre(k)}</h3><span></span></div>
            <div class="cards-grid">${grupos.get(k).map(htmlTarjeta).join('')}</div>
        </section>`).join('');
    chips.innerHTML = '<button type="button" class="chip" data-sem="todos">Todos</button>' +
        claves.map(k => `<button type="button" class="chip" data-sem="${k}">${k ? k + '.º' : 'Otras'}</button>`).join('');
    if (filtroMenu.semestre !== 'todos' && !claves.map(String).includes(String(filtroMenu.semestre))) filtroMenu.semestre = 'todos';
    actualizarTarjetas();
}

// ── Datos de las tarjetas: preguntas, avance y portadas ──
function leerConteosCache() {
    try {
        const c = JSON.parse(sessionStorage.getItem(CLAVE_CONTEOS) || 'null');
        if (c && Date.now() - c.ts < 10 * 60 * 1000) return c.datos || {};
    } catch (e) { /* sin caché */ }
    return {};
}

// Muestra al instante las portadas ya guardadas en este dispositivo
function aplicarPortadasCache() {
    materiasMenu.forEach(m => {
        datosTarjeta[m.id] = datosTarjeta[m.id] || {};
        if (!m.portada_v) { datosTarjeta[m.id].portada = null; return; }
        try {
            const c = JSON.parse(localStorage.getItem(`qz_portada_${m.id}`) || 'null');
            if (c && c.v === m.portada_v && c.d) datosTarjeta[m.id].portada = c.d;
        } catch (e) { /* sin caché */ }
    });
}

async function cargarPortadas(miCarga) {
    await Promise.all(materiasMenu.filter(m => m.portada_v && !datosTarjeta[m.id].portada).map(async (m) => {
        try {
            const p = await getDoc(doc(db, 'config_materias', m.id, 'recursos', 'portada'));
            if (p.exists() && p.data().dataUrl) {
                datosTarjeta[m.id].portada = p.data().dataUrl;
                try { localStorage.setItem(`qz_portada_${m.id}`, JSON.stringify({ v: m.portada_v, d: p.data().dataUrl })); } catch (e) { /* sin espacio */ }
            }
        } catch (e) { console.warn('No se pudo leer la portada de', m.id, e); }
    }));
    if (miCarga === cargaDatosId) actualizarTarjetas();
}

async function cargarAvances(ids, miCarga) {
    await Promise.all(ids.filter(id => datosTarjeta[id].total > 0).map(async (id) => {
        try {
            const p = await getDoc(doc(db, 'progreso_estudio', `${currentUserEmail}_${id}`));
            const indice = p.exists() ? (p.data().indice || 0) : 0;
            datosTarjeta[id].avance = Math.max(0, Math.min(100, Math.round((indice / datosTarjeta[id].total) * 100)));
        } catch (e) { /* sin avance */ }
    }));
    if (miCarga === cargaDatosId) actualizarTarjetas();
}

async function cargarDatosTarjetas() {
    const miCarga = ++cargaDatosId;
    const ids = materiasMenu.map(m => m.id);
    const conteos = leerConteosCache();
    aplicarPortadasCache();
    ids.forEach(id => { datosTarjeta[id] = datosTarjeta[id] || {}; if (typeof conteos[id] === 'number') datosTarjeta[id].total = conteos[id]; });
    actualizarTarjetas();

    const faltan = ids.filter(id => typeof conteos[id] !== 'number');
    await Promise.all(faltan.map(async (id) => {
        try {
            const snap = await getCountFromServer(collection(db, `bancos_preguntas/${id}/preguntas`));
            conteos[id] = snap.data().count;
        } catch (e) { conteos[id] = null; }
    }));
    if (miCarga !== cargaDatosId) return;
    if (faltan.length) {
        try {
            const numericos = Object.fromEntries(Object.entries(conteos).filter(([, v]) => typeof v === 'number'));
            sessionStorage.setItem(CLAVE_CONTEOS, JSON.stringify({ ts: Date.now(), datos: numericos }));
        } catch (e) { /* sin caché */ }
    }
    ids.forEach(id => { datosTarjeta[id].total = typeof conteos[id] === 'number' ? conteos[id] : null; });
    actualizarTarjetas();
    await Promise.all([cargarAvances(ids, miCarga), cargarPortadas(miCarga)]);
}

// ── Panel de inicio (Examen / Estudio) ──
function panelMateriaAbierto() {
    return !document.getElementById('launch-panel').classList.contains('hidden');
}

function establecerModoPanel(modo) {
    const modeSelect = document.getElementById('mode-select');
    modeSelect.value = modo;
    if (modeSelect.onchange) modeSelect.onchange();
    document.querySelectorAll('#launch-panel .mode-card').forEach(b => b.classList.toggle('active', b.dataset.mode === modo));
    document.getElementById('btn-start').textContent = modo === 'study' ? 'Iniciar estudio' : 'Iniciar examen';
}

function abrirPanelMateria(id) {
    const m = materiasMenu.find(x => x.id === id);
    if (!m) return;
    const d = datosTarjeta[id] || {};
    document.getElementById('subject-select').value = id;
    document.getElementById('tiempo-select').value = '20';
    document.getElementById('cantidad-select').value = '20';
    establecerModoPanel('exam');

    const tarjeta = document.getElementById('launch-card');
    tarjeta.className = `launch-card ${claseSemestre(m.semestre)}`;
    const custom = colorPersonalizado(m);
    if (custom) tarjeta.style.setProperty('--hue', custom); else tarjeta.style.removeProperty('--hue');
    const cover = document.getElementById('launch-cover');
    const img = document.getElementById('launch-img');
    if (d.portada) { img.src = d.portada; img.classList.remove('hidden'); cover.classList.add('con-imagen'); }
    else { img.removeAttribute('src'); img.classList.add('hidden'); cover.classList.remove('con-imagen'); }
    document.getElementById('launch-icon').className = `fas ${m.icono || 'fa-book'} launch-icon`;
    document.getElementById('launch-title').textContent = m.nombre;
    document.getElementById('launch-meta').textContent =
        [m.codigo, m.semestre ? tituloSemestre(m.semestre) : ''].filter(Boolean).join(' · ') +
        (typeof d.total === 'number' && d.total > 0 ? ` · ${d.total} preguntas` : '');

    document.getElementById('launch-panel').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    document.getElementById('btn-start').focus();
}

function cerrarPanelMateria() {
    document.getElementById('launch-panel').classList.add('hidden');
    document.body.style.overflow = '';
    document.getElementById('subject-select').value = '';
}

function accionTarjeta(card) {
    if (card.classList.contains('es-proximamente')) {
        Swal.fire({ toast: true, position: 'top-end', icon: 'info', title: 'Próximamente',
                    text: 'Esta materia aún no tiene preguntas cargadas.', timer: 2500, showConfirmButton: false });
        return;
    }
    abrirPanelMateria(card.dataset.id);
}

// Conexión de eventos del menú (una sola vez)
(function conectarMenu() {
    const modeSelect = document.getElementById('mode-select');
    modeSelect.onchange = () => {
        const opcionSinLimite = document.getElementById('opcion-sin-limite');
        const cantidadContainer = document.getElementById('cantidad-container');
        const tiempoSelect = document.getElementById('tiempo-select');
        if (modeSelect.value === 'study') {
            opcionSinLimite.style.display = '';
            cantidadContainer.style.display = 'block';
        } else {
            opcionSinLimite.style.display = 'none';
            cantidadContainer.style.display = 'none';
            if (tiempoSelect.value === '0') tiempoSelect.value = '20';
        }
    };

    const secciones = document.getElementById('menu-secciones');
    secciones.addEventListener('click', (e) => { const card = e.target.closest('.mcard'); if (card) accionTarjeta(card); });
    secciones.addEventListener('keydown', (e) => {
        if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('mcard')) {
            e.preventDefault();
            accionTarjeta(e.target);
        }
    });
    document.getElementById('menu-chips').addEventListener('click', (e) => {
        const b = e.target.closest('.chip');
        if (!b) return;
        filtroMenu.semestre = b.dataset.sem;
        aplicarFiltrosMenu();
    });
    document.getElementById('menu-buscar').addEventListener('input', (e) => { filtroMenu.texto = e.target.value; aplicarFiltrosMenu(); });
    document.getElementById('menu-solo-preguntas').addEventListener('change', (e) => { filtroMenu.soloConPreguntas = e.target.checked; aplicarFiltrosMenu(); });

    document.querySelectorAll('#launch-panel .mode-card').forEach(b => b.addEventListener('click', () => establecerModoPanel(b.dataset.mode)));
    document.getElementById('launch-close').addEventListener('click', cerrarPanelMateria);
    document.getElementById('launch-panel').addEventListener('click', (e) => { if (e.target.id === 'launch-panel') cerrarPanelMateria(); });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && panelMateriaAbierto() && !Swal.isVisible()) cerrarPanelMateria();
    });
})();

async function cargarMaterias() {
    try {
        const todasLasMaterias = await obtenerMateriasConfiguradas();

        let materiasVisibles = todasLasMaterias.filter(m => m.activa !== false);

        const esAdminUser = currentUserEmail === ADMIN_EMAIL;
        if (!esAdminUser) {
            try {
                const userDoc = await getDoc(doc(db, "usuarios_seguros", currentUserEmail));
                if (userDoc.exists()) {
                    const userData = userDoc.data();
                    if (userData.rol !== 'admin' && userData.materias && userData.materias.length > 0) {
                        materiasVisibles = materiasVisibles.filter(m => userData.materias.includes(m.id));
                    }
                }
            } catch(e) {
                console.error('Error obteniendo rol:', e);
            }
        }

        materiasMenu = ordenarMaterias(materiasVisibles);

        // Select oculto: el resto del script (inicio del examen) sigue leyendo la materia de aquí
        const select = document.getElementById('subject-select');
        const previo = select.value;
        select.innerHTML = '<option value="">-- Selecciona Materia --</option>';
        materiasMenu.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.id;
            opt.textContent = m.nombre;
            select.appendChild(opt);
        });
        if (previo && materiasMenu.some(m => m.id === previo)) select.value = previo;

        renderMenuMaterias();
        cargarDatosTarjetas();   // en segundo plano: preguntas, avance y portadas

    } catch (error) {
        console.error('Error cargando materias:', error);
        Swal.fire({
            icon: 'error', title: 'Error',
            html: `<p>No se pudo cargar la lista de materias.</p><p style="font-size:0.85rem;color:#999;margin-top:8px;">Error: ${escHtml(error.message)}</p>`,
            confirmButtonColor: '#1a73e8'
        });
    }
}

// 3. INICIAR EXAMEN
document.getElementById('btn-start').onclick = async () => {
    currentMateria = document.getElementById('subject-select').value;
    if (!currentMateria) return;
    currentMode = document.getElementById('mode-select').value;
    const tiempoMinutos = parseInt(document.getElementById('tiempo-select').value) || 0;
    tiempoLimiteSegundos = tiempoMinutos * 60;

    try {
        const snap = await getDocs(collection(db, `bancos_preguntas/${currentMateria}/preguntas`));

        if (snap.empty) {
            Swal.fire({ icon: 'info', title: 'Aviso', text: 'No existen preguntas cargadas para esta materia.', confirmButtonColor: '#1a73e8' });
            return;
        }

        questions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        questions = questions.sort(() => Math.random() - 0.5);

        if (currentMode === "exam") {
            questions = questions.slice(0, 20);
        } else {
            const cantidadSelect = document.getElementById('cantidad-select');
            const cantidadElegida = cantidadSelect ? cantidadSelect.value : '20';
            if (cantidadElegida !== 'todas') questions = questions.slice(0, 20);
        }
        selectedAnswers = new Array(questions.length).fill(null);

        if (currentMode === "study") {
            let savedIndex = 0;
            try {
                const pd = await getDoc(doc(db, "progreso_estudio", `${currentUserEmail}_${currentMateria}`));
                if (pd.exists()) savedIndex = pd.data().indice || 0;
            } catch(e) {}
            if (savedIndex > 0) {
                const result = await Swal.fire({
                    title: 'Avance Detectado',
                    html: `Tienes <strong>${savedIndex} pregunta${savedIndex!==1?'s':''}</strong> completada${savedIndex!==1?'s':''} en esta materia.<br><small style="color:#888">Sincronizado entre todos tus dispositivos</small>`,
                    icon: 'question', showCancelButton: true, showDenyButton: true,
                    confirmButtonText: 'Retomar avance', cancelButtonText: 'Empezar de cero',
                    denyButtonText: 'Volver al menú', denyButtonColor: '#5f6368',
                    allowOutsideClick: false, allowEscapeKey: false
                });
                if (result.isDenied) return;   // vuelve al menú: no se inicia nada ni se toca el avance guardado
                currentIndex = result.isConfirmed ? savedIndex : 0;
                if (!result.isConfirmed) {
                    try { await setDoc(doc(db, "progreso_estudio", `${currentUserEmail}_${currentMateria}`), { indice: 0, actualizado: serverTimestamp() }); } catch(e) {}
                }
            } else { currentIndex = 0; }
        } else {
            currentIndex = 0;
        }

        startTimer();
        notificarExamenIniciado();

        document.getElementById('setup-screen').classList.add('hidden');
        document.getElementById('quiz-screen').classList.remove('hidden');
        enPantallaResultados = false;
        document.getElementById('btn-header-return').classList.remove('hidden');   // siempre visible arriba mientras se está en una materia

        renderQuestion();

        // FIX: verificar proactivamente si Meet ya está abierto ANTES de que iniciara el examen
        // La extensión lo hace en background, pero también lo verificamos desde aquí por seguridad
        setTimeout(() => {
            try {
                if (typeof chrome !== 'undefined' && chrome.runtime) {
                    chrome.runtime.sendMessage(EXTENSION_ID, { tipo: 'VERIFICAR_MEET' }, (response) => {
                        if (chrome.runtime.lastError || !response) return;
                        if (response.meetAbierto && !bloqueadoPorMeet) {
                            bloqueadoPorMeet = true;
                            const nombre = response.nombre || (response.plataforma?.includes('meet.google') ? 'Google Meet'
                                : response.plataforma?.includes('zoom') ? 'Zoom'
                                : response.plataforma?.includes('teams') ? 'Microsoft Teams'
                                : 'Videoconferencia');
                            registrarAcceso('meet_detectado_al_iniciar', { plataforma: nombre });
                            if (overlayOcultar) {
                                contentHidden = true;
                                overlayOcultar.innerHTML = `<div style="max-width:480px;padding:40px;text-align:center;">
                                    <div style="font-size:4rem;margin-bottom:20px;">🔴</div>
                                    <p style="color:#ff4444;font-size:1.8rem;font-weight:900;margin-bottom:16px;">${nombre.toUpperCase()} DETECTADO</p>
                                    <p style="color:#aaa;font-size:1rem;line-height:1.7;margin-bottom:28px;">Tienes <strong>${nombre}</strong> abierto. Las preguntas están ocultas hasta que cierres la aplicación.</p>
                                    <div style="background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.15);border-radius:12px;padding:16px 24px;display:inline-block;">
                                        <p style="color:#facc15;font-size:1.1rem;font-weight:700;margin:0;">${currentUserName}</p>
                                        <p style="color:#aaa;font-size:0.85rem;margin:4px 0 0;">${currentUserEmail}</p>
                                    </div>
                                    <p style="color:#555;font-size:0.8rem;margin-top:28px;">Este evento ha sido registrado</p>
                                </div>`;
                                overlayOcultar.style.display = 'flex';
                            }
                        }
                    });
                }
            } catch(e) {}
        }, 800); // pequeño delay para asegurar que background procesó EXAMEN_INICIADO

    } catch (error) {
        console.error('Error cargando preguntas:', error);
        Swal.fire({ icon: 'error', title: 'Error', text: 'Hubo un problema al cargar las preguntas. Intenta de nuevo.' });
    }
};

// ================================================================
// ZOOM DE IMAGEN DE PREGUNTA
// En computador: se amplía al pasar el mouse (hover). En móvil/táctil,
// donde no existe hover, se amplía con un toque y se cierra con otro.
// ================================================================
let zoomOverlayEl = null;

function crearZoomOverlay() {
    if (zoomOverlayEl) return zoomOverlayEl;
    zoomOverlayEl = document.createElement('div');
    zoomOverlayEl.id = 'image-zoom-overlay';
    zoomOverlayEl.style.cssText = `
        display: none;
        position: fixed;
        top: 0; left: 0;
        width: 100%; height: 100%;
        background: rgba(0,0,0,0.82);
        z-index: 9990;
        justify-content: center;
        align-items: center;
        padding: 30px;
        cursor: zoom-out;
    `;
    const imgZoom = document.createElement('img');
    imgZoom.id = 'image-zoom-content';
    imgZoom.style.cssText = `
        max-width: 100%;
        max-height: 100%;
        border-radius: 10px;
        box-shadow: 0 10px 40px rgba(0,0,0,0.5);
        background: #fff;
    `;
    zoomOverlayEl.appendChild(imgZoom);
    zoomOverlayEl.onclick = ocultarZoomImagen;
    document.body.appendChild(zoomOverlayEl);
    return zoomOverlayEl;
}

function mostrarZoomImagen(src) {
    const overlay = crearZoomOverlay();
    document.getElementById('image-zoom-content').src = src;
    overlay.style.display = 'flex';
}

function ocultarZoomImagen() {
    if (zoomOverlayEl) zoomOverlayEl.style.display = 'none';
}

function activarZoomImagen(imgEl) {
    if (!imgEl) return;
    // Un clic/toque abre la imagen ampliada en pantalla completa (funciona en móvil y escritorio).
    // El agrandado "al pasar el mouse" en escritorio se maneja con CSS puro (ver style.css),
    // para evitar que este overlay tape el cursor y dispare mouseleave sobre la imagen original.
    imgEl.onclick = () => mostrarZoomImagen(imgEl.src);
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') ocultarZoomImagen();
});

// 4. RENDERIZAR PREGUNTA
function renderQuestion() {
    if (currentIndex >= questions.length) { finalizarExamen(); return; }

    const question = questions[currentIndex];
    const questionText = document.getElementById('question-text');
    const optionsContainer = document.getElementById('options-container');

    registrarAcceso('ver_pregunta', {
        materia: currentMateria,
        modo: currentMode,
        pregunta_num: currentIndex + 1,
        pregunta_id: question.id,
        pregunta_texto: (question.texto || '').substring(0, 80)
    });

    insertarMarcaEnPregunta(currentUserEmail);

    const preguntaTexto = question.texto || question.explicacion || question.pregunta || 'Pregunta sin texto';

    // Imagen de la pregunta (si existe)
    if (question.imagen_url) {
        questionText.innerHTML = `
            <div style="position:relative;margin-bottom:14px;">
                <img id="question-image" src="${question.imagen_url}" 
                     alt="Imagen de la pregunta"
                     style="width:100%;max-height:280px;object-fit:contain;border-radius:8px;border:1px solid #e0e0e0;display:block;cursor:zoom-in;"
                     onerror="this.parentElement.style.display='none'">
                <span style="position:absolute;bottom:6px;right:6px;background:rgba(0,0,0,0.55);color:#fff;font-size:0.7rem;padding:3px 8px;border-radius:12px;pointer-events:none;">
                    <i class="fas fa-search-plus"></i> Ampliar
                </span>
            </div>
            <span>${currentIndex + 1}. ${preguntaTexto}</span>
        `;
        activarZoomImagen(document.getElementById('question-image'));
    } else {
        questionText.textContent = `${currentIndex + 1}. ${preguntaTexto}`;
    }
    optionsContainer.innerHTML = '';

    // Botón volver al menú
    const menuButton = document.createElement('button');
    menuButton.className = 'btn-back-menu';
    menuButton.innerHTML = '<i class="fas fa-home"></i> Volver al Menú';
    menuButton.onclick = pedirVolverAlMenu;
    optionsContainer.appendChild(menuButton);

    if (!question.opciones || !Array.isArray(question.opciones)) {
        const errorOpciones = document.createElement('p');
        errorOpciones.style.color = 'red';
        errorOpciones.textContent = 'Error: Esta pregunta no tiene opciones válidas.';
        optionsContainer.appendChild(errorOpciones);
        return;
    }

    const yaRespondida = selectedAnswers[currentIndex] !== null && selectedAnswers[currentIndex] !== undefined;
    const preguntaMultiple = esPreguntaMultiple(question);
    seleccionTemporalMultiple = []; // reiniciar selección en progreso al (re)dibujar la pregunta

    if (preguntaMultiple && !(currentMode === "study" && yaRespondida)) {
        const hint = document.createElement('p');
        hint.style.cssText = 'font-size: 0.85rem; color: #1a73e8; font-weight: 600; text-align: left; margin-bottom: 12px;';
        hint.innerHTML = '<i class="fas fa-check-double"></i> Esta pregunta tiene más de una respuesta correcta. Marca todas las que apliquen.';
        optionsContainer.appendChild(hint);
    }

    question.opciones.forEach((opcion, index) => {
        const button = document.createElement('button');
        button.className = 'option-button';
        if (esOpcionImagen(opcion)) {
            button.classList.add('option-button-imagen');
            button.innerHTML = `<span class="option-letter">${String.fromCharCode(65 + index)}</span>
                <img src="${opcion}" alt="Opción ${String.fromCharCode(65 + index)}" onerror="this.alt='(No se pudo cargar la imagen)'">`;
        } else {
            button.innerHTML = `<span class="option-letter">${String.fromCharCode(65 + index)}</span> ${opcion}`;
        }

        if (currentMode === "study" && yaRespondida) {
            button.disabled = true;
            const correctas = obtenerRespuestasCorrectas(question);
            const respuestaGuardada = selectedAnswers[currentIndex];
            const userArr = Array.isArray(respuestaGuardada) ? respuestaGuardada : [respuestaGuardada];
            if (correctas.includes(index)) button.classList.add('correct');
            else if (userArr.includes(index)) button.classList.add('incorrect');
        } else if (preguntaMultiple) {
            const seleccionActual = currentMode === "study"
                ? seleccionTemporalMultiple
                : (Array.isArray(selectedAnswers[currentIndex]) ? selectedAnswers[currentIndex] : []);
            if (seleccionActual.includes(index)) button.classList.add('selected');
        } else if (selectedAnswers[currentIndex] === index) {
            button.classList.add('selected');
        }

        button.onclick = () => selectAnswer(index);
        optionsContainer.appendChild(button);
    });

    if (currentMode === "study" && preguntaMultiple && !yaRespondida) {
        const btnConfirmar = document.createElement('button');
        btnConfirmar.id = 'btn-confirmar-multiple';
        btnConfirmar.className = 'btn-primary full-width';
        btnConfirmar.style.marginTop = '10px';
        btnConfirmar.textContent = 'Confirmar Respuesta';
        btnConfirmar.onclick = () => confirmarRespuestaMultipleEstudio();
        optionsContainer.appendChild(btnConfirmar);
    }

    if (currentMode === "study" && yaRespondida) {
        optionsContainer.appendChild(crearFeedbackBox(question, selectedAnswers[currentIndex]));
    }

    // Navegación
    const navDiv = document.createElement('div');
    navDiv.style.cssText = 'display: flex; justify-content: space-between; margin-top: 25px; gap: 10px;';

    if (currentIndex > 0) {
        const btnPrev = document.createElement('button');
        btnPrev.className = 'btn-secondary';
        btnPrev.innerHTML = '<i class="fas fa-arrow-left"></i> Anterior';
        btnPrev.onclick = () => { currentIndex--; renderQuestion(); guardarAvanceAutomatico(); };
        navDiv.appendChild(btnPrev);
    }

    const btnNext = document.createElement('button');
    btnNext.className = 'btn-primary';
    btnNext.style.cssText = 'margin-left: auto;';

    if (currentIndex === questions.length - 1) {
        btnNext.textContent = 'Finalizar';
        btnNext.onclick = finalizarExamen;
    } else {
        btnNext.innerHTML = 'Siguiente <i class="fas fa-arrow-right"></i>';
        btnNext.onclick = () => {
            const sinResponder = selectedAnswers[currentIndex] === null ||
                selectedAnswers[currentIndex] === undefined ||
                (Array.isArray(selectedAnswers[currentIndex]) && selectedAnswers[currentIndex].length === 0);
            if (sinResponder && currentMode === "exam") {
                Swal.fire({
                    icon: 'warning', title: 'Pregunta sin responder',
                    text: '¿Deseas continuar sin responder?',
                    showCancelButton: true, confirmButtonText: 'Sí, continuar'
                }).then(result => {
                    if (result.isConfirmed) { currentIndex++; renderQuestion(); guardarAvanceAutomatico(); }
                });
            } else {
                currentIndex++; renderQuestion(); guardarAvanceAutomatico();
            }
        };
    }

    navDiv.appendChild(btnNext);
    optionsContainer.appendChild(navDiv);
}

// Helper: crear caja de feedback (soporta respuesta única o múltiple)
function crearFeedbackBox(question, userAnswer) {
    const correctas = obtenerRespuestasCorrectas(question);
    const multiple = correctas.length > 1;
    const { esCorrectaExacta } = evaluarRespuesta(question, userAnswer);

    const feedbackBox = document.createElement('div');
    feedbackBox.id = 'feedback-box';
    feedbackBox.style.cssText = `
        margin-top: 20px; padding: 15px; border-radius: 8px; text-align: left;
        background: ${esCorrectaExacta ? '#e6f4ea' : '#fce8e6'};
        border-left: 4px solid ${esCorrectaExacta ? '#34a853' : '#ea4335'};
    `;
    if (esCorrectaExacta) {
        feedbackBox.innerHTML = `
            <p style="font-weight:bold;color:#34a853;margin-bottom:8px;"><i class="fas fa-check-circle"></i> ¡Correcto!</p>
            <p style="color:#555;font-size:0.95rem;">${question.explicacion_correcta || '¡Excelente trabajo!'}</p>
        `;
    } else {
        const textoOpciones = correctas.map(i => `${String.fromCharCode(65 + i)}) ${question.opciones[i]}`).join(' &nbsp;·&nbsp; ');
        feedbackBox.innerHTML = `
            <p style="font-weight:bold;color:#ea4335;margin-bottom:8px;"><i class="fas fa-times-circle"></i> Incorrecto</p>
            <p style="color:#555;font-size:0.95rem;margin-bottom:8px;">${multiple ? 'Las respuestas correctas son' : 'La respuesta correcta es'}: <strong>${textoOpciones}</strong></p>
            <p style="color:#666;font-size:0.9rem;">${question.explicacion_correcta || 'Revisa el material de estudio.'}</p>
        `;
    }
    return feedbackBox;
}

// Confirma la selección múltiple en modo estudio (se llama desde el botón "Confirmar Respuesta")
function confirmarRespuestaMultipleEstudio() {
    if (seleccionTemporalMultiple.length === 0) {
        Swal.fire({ icon: 'warning', title: 'Selecciona al menos una opción', timer: 1800, showConfirmButton: false, toast: true, position: 'top-end' });
        return;
    }

    const question = questions[currentIndex];
    selectedAnswers[currentIndex] = seleccionTemporalMultiple.slice();
    const correctas = obtenerRespuestasCorrectas(question);

    const buttons = document.querySelectorAll('.option-button');
    buttons.forEach((btn, idx) => {
        btn.disabled = true;
        if (correctas.includes(idx)) btn.classList.add('correct');
        else if (seleccionTemporalMultiple.includes(idx)) btn.classList.add('incorrect');
    });

    const btnConfirmar = document.getElementById('btn-confirmar-multiple');
    if (btnConfirmar) btnConfirmar.remove();

    const optionsContainer = document.getElementById('options-container');
    const existingFeedback = document.getElementById('feedback-box');
    if (existingFeedback) existingFeedback.remove();

    const feedbackBox = crearFeedbackBox(question, selectedAnswers[currentIndex]);
    const navButtons = optionsContainer.querySelector('div[style*="justify-content: space-between"]');
    if (navButtons) {
        optionsContainer.insertBefore(feedbackBox, navButtons);
    } else {
        optionsContainer.appendChild(feedbackBox);
    }
}

// 5. SELECCIONAR RESPUESTA
function selectAnswer(optionIndex) {
    const question = questions[currentIndex];
    const multiple = esPreguntaMultiple(question);
    const buttons = document.querySelectorAll('.option-button');

    if (currentMode === "study") {
        if (multiple) {
            // Selección múltiple en estudio: solo marcar/desmarcar hasta que se confirme
            const pos = seleccionTemporalMultiple.indexOf(optionIndex);
            if (pos >= 0) seleccionTemporalMultiple.splice(pos, 1);
            else seleccionTemporalMultiple.push(optionIndex);
            buttons.forEach((btn, idx) => btn.classList.toggle('selected', seleccionTemporalMultiple.includes(idx)));
            return;
        }

        // Opción única en estudio: feedback inmediato (comportamiento original)
        buttons.forEach((btn, idx) => {
            btn.disabled = true;
            if (idx === question.respuesta) btn.classList.add('correct');
            else if (idx === optionIndex) btn.classList.add('incorrect');
        });

        selectedAnswers[currentIndex] = optionIndex;

        const optionsContainer = document.getElementById('options-container');
        const existingFeedback = document.getElementById('feedback-box');
        if (existingFeedback) existingFeedback.remove();

        const feedbackBox = crearFeedbackBox(question, optionIndex);

        const navButtons = optionsContainer.querySelector('div[style*="justify-content: space-between"]');
        if (navButtons) {
            optionsContainer.insertBefore(feedbackBox, navButtons);
        } else {
            optionsContainer.appendChild(feedbackBox);
        }

    } else if (multiple) {
        // Selección múltiple en examen: toggle libre, sin bloqueo hasta finalizar
        let sel = Array.isArray(selectedAnswers[currentIndex]) ? selectedAnswers[currentIndex] : [];
        const pos = sel.indexOf(optionIndex);
        if (pos >= 0) sel.splice(pos, 1);
        else sel.push(optionIndex);
        selectedAnswers[currentIndex] = sel;
        buttons.forEach((btn, idx) => btn.classList.toggle('selected', sel.includes(idx)));
    } else {
        buttons.forEach(btn => btn.classList.remove('selected'));
        buttons[optionIndex].classList.add('selected');
        selectedAnswers[currentIndex] = optionIndex;
    }
}

// 6. FINALIZAR EXAMEN
function finalizarExamen() {
    notificarExamenTerminado();
    stopTimer();

    if (currentMode === "exam") {
        let correctas = 0; // preguntas totalmente correctas (para el conteo mostrado)
        let puntajeTotal = 0; // suma de puntajes, con crédito parcial en selección múltiple

        questions.forEach((q, idx) => {
            const resp = selectedAnswers[idx];
            if (resp === null || resp === undefined || (Array.isArray(resp) && resp.length === 0)) return;
            const { esCorrectaExacta, puntaje } = evaluarRespuesta(q, resp);
            if (esCorrectaExacta) correctas++;
            puntajeTotal += puntaje;
        });

        const porcentaje = ((puntajeTotal / questions.length) * 100).toFixed(1);

        let tiempoTexto;
        if (tiempoLimiteSegundos > 0) {
            const usados = tiempoLimiteSegundos - tiempoRestante;
            const min = Math.floor(usados / 60), seg = usados % 60;
            tiempoTexto = `${String(min).padStart(2,'0')}:${String(seg).padStart(2,'0')} de ${tiempoLimiteSegundos/60} min`;
        } else {
            tiempoTexto = document.getElementById('timer-display').textContent;
        }

        Swal.fire({
            icon: 'info', title: 'Examen Finalizado',
            html: `<p style="font-size:1.1rem;margin:15px 0;">
                <strong>Preguntas totalmente correctas:</strong> ${correctas} / ${questions.length}<br>
                <strong>Calificación (con crédito parcial):</strong> ${porcentaje}%<br>
                <strong>Tiempo:</strong> ${tiempoTexto}
            </p>`,
            confirmButtonColor: '#1a73e8',
            confirmButtonText: 'Ver Resultados Detallados'
        }).then(() => mostrarResultadosDetallados(correctas));
    } else {
        Swal.fire({
            icon: 'success', title: '¡Sesión Completada!',
            text: 'Has terminado todas las preguntas de estudio.',
            confirmButtonColor: '#1a73e8'
        }).then(async () => {
            try { await setDoc(doc(db, 'progreso_estudio', `${currentUserEmail}_${currentMateria}`), { indice: 0, actualizado: serverTimestamp() }); } catch(e) {}
            volverAlMenu();
        });
    }
}

// 7. RESULTADOS DETALLADOS
function mostrarResultadosDetallados(correctas) {
    const container = document.getElementById('quiz-screen');
    enPantallaResultados = true;
    container.innerHTML = `
        <div style="text-align:left;"><button onclick="volverAlMenu()" class="btn-back-menu"><i class="fas fa-home"></i> Volver al Menú</button></div>
        <h2 style="color:#1a73e8;margin-bottom:20px;">Resultados Detallados</h2>
        <div style="text-align:center;margin-bottom:30px;">
            <div style="font-size:3rem;color:${correctas >= questions.length * 0.7 ? '#34a853' : '#ea4335'};">
                ${((correctas / questions.length) * 100).toFixed(1)}%
            </div>
            <p style="color:#666;">Correctas: ${correctas} / ${questions.length}</p>
        </div>
        <div id="detailed-results"></div>
        <button onclick="volverAlMenu()" class="btn-primary" style="margin-top:20px;">Volver al Menú</button>
    `;

    const resultsDiv = document.getElementById('detailed-results');
    questions.forEach((q, idx) => {
        const userAnswer = selectedAnswers[idx];
        const { esCorrectaExacta } = evaluarRespuesta(q, userAnswer);
        const isCorrect = esCorrectaExacta;
        const resultCard = document.createElement('div');
        resultCard.style.cssText = `
            background:${isCorrect ? 'linear-gradient(135deg, #1a73e8, #155eef)' : '#fce8e6'};color:${isCorrect ? '#ffffff' : '#333'};padding:15px;border-radius:8px;
            margin-bottom:15px;text-align:left;border-left:4px solid ${isCorrect ? '#155eef' : '#ea4335'};
        `;
        resultCard.innerHTML = `
            <p style="font-weight:bold;margin-bottom:8px;">${idx + 1}. ${q.texto || q.explicacion || q.pregunta || 'Sin texto'}</p>
            <p style="${isCorrect ? 'color:rgba(255,255,255,0.85);' : 'color:#666;'}font-size:0.9rem;">
                Tu respuesta: <strong>${formatearRespuestaLegible(userAnswer)}</strong><br>
                Respuesta correcta: <strong>${formatearRespuestaLegible(obtenerRespuestasCorrectas(q))}</strong>
            </p>
        `;
        resultsDiv.appendChild(resultCard);
    });
}

// 8. TIMER
function startTimer() {
    const display = document.getElementById('timer-display');
    const label = document.getElementById('timer-label');

    if (tiempoLimiteSegundos > 0) {
        tiempoRestante = tiempoLimiteSegundos;
        label.style.display = 'block';
        label.textContent = 'Tiempo restante';
        display.style.display = 'block';
        display.style.color = '#1a73e8';

        function actualizarDisplay() {
            const min = Math.floor(tiempoRestante / 60), seg = tiempoRestante % 60;
            display.textContent = `${String(min).padStart(2,'0')}:${String(seg).padStart(2,'0')}`;
            if (tiempoRestante <= 60) {
                display.style.color = '#ea4335';
                display.style.opacity = tiempoRestante % 2 === 0 ? '0.4' : '1';
            } else if (tiempoRestante <= 300) {
                display.style.color = '#f29900';
                display.style.opacity = '1';
            } else {
                display.style.color = '#1a73e8';
                display.style.opacity = '1';
            }
        }

        actualizarDisplay();

        timerInterval = setInterval(() => {
            tiempoRestante--;
            actualizarDisplay();

            if (tiempoRestante === 300) {
                Swal.fire({ icon:'warning', title:'⏳ 5 minutos restantes', text:'Ve terminando tus respuestas.', timer:3000, showConfirmButton:false, toast:true, position:'top-end' });
            } else if (tiempoRestante === 60) {
                Swal.fire({ icon:'error', title:'🚨 ¡1 minuto!', text:'El tiempo está por agotarse.', timer:3000, showConfirmButton:false, toast:true, position:'top-end' });
            } else if (tiempoRestante <= 0) {
                clearInterval(timerInterval);
                display.textContent = '00:00';
                display.style.opacity = '1';
                Swal.fire({
                    icon:'error', title:'⏰ ¡Tiempo agotado!',
                    text:'El tiempo límite ha terminado. Se enviarán tus respuestas automáticamente.',
                    confirmButtonColor:'#ea4335', confirmButtonText:'Ver resultados',
                    allowOutsideClick:false, allowEscapeKey:false
                }).then(() => finalizarExamen());
            }
        }, 1000);

    } else {
        label.style.display = 'none';
        display.style.display = 'none';
    }
}

function stopTimer() {
    if (timerInterval) clearInterval(timerInterval);
}

// 9. GUARDADO AUTOMÁTICO
function guardarAvanceAutomatico() {
    if (currentMode === "study" && currentUserEmail) {
        setDoc(doc(db, "progreso_estudio", `${currentUserEmail}_${currentMateria}`), {
            indice: currentIndex, materia: currentMateria, usuario: currentUserEmail, actualizado: serverTimestamp()
        }).catch(e => console.warn("No se pudo guardar progreso:", e));
    }
}

// 10. CERRAR SESIÓN
document.getElementById('btn-logout').onclick = () => {
    Swal.fire({
        title: 'Cerrar Sesión',
        text: currentMode === "study" ? "Tu progreso ha sido guardado y podrás continuar más tarde." : "¿Estás seguro?",
        icon: 'question', showCancelButton: true,
        cancelButtonText: 'Cancelar', confirmButtonColor: '#1a73e8', confirmButtonText: 'Aceptar'
    }).then((result) => {
        if (result.isConfirmed) { stopTimer(); signOut(auth).then(() => location.reload()); }
    });
};

document.getElementById('btn-header-return').onclick = pedirVolverAlMenu;

// ================================================================
// VOLVER AL MENÚ SIN RECARGAR LA PÁGINA
// La sesión de Google se mantiene: solo "Cerrar Sesión" la termina.
// ================================================================
// Estructura original de la pantalla del quiz (la pantalla de resultados la reemplaza)
const QUIZ_SCREEN_HTML_ORIGINAL = document.getElementById('quiz-screen').innerHTML;

// ================================================================
// FONDO DE LA PANTALLA DE ACCESO (editable por el administrador)
// Lectura pública en Firestore (config_app/apariencia): se necesita antes de iniciar sesión.
// ================================================================
const CLAVE_FONDO_AUTH = 'qz_fondo_auth';

function aplicarFondoAuth(dataUrl) {
    const bg = document.getElementById('auth-bg');
    if (bg && dataUrl) bg.style.backgroundImage = `url("${dataUrl}")`;
}

async function cargarFondoAuth() {
    let cache = null;
    try { cache = JSON.parse(localStorage.getItem(CLAVE_FONDO_AUTH) || 'null'); } catch (e) { /* sin caché */ }
    if (cache && cache.d) aplicarFondoAuth(cache.d);   // se ve al instante mientras se confirma la versión

    try {
        const cfg = await getDoc(doc(db, 'config_app', 'apariencia'));
        const v = cfg.exists() ? cfg.data().fondo_v : null;
        if (!v) {   // sin imagen personalizada: queda el fondo por defecto del CSS
            if (cache) { try { localStorage.removeItem(CLAVE_FONDO_AUTH); } catch (e) { /* nada que hacer */ } }
            return;
        }
        if (cache && cache.v === v) return;   // ya está aplicada
        const r = await getDoc(doc(db, 'config_app', 'apariencia', 'recursos', 'fondo'));
        if (r.exists() && r.data().dataUrl) {
            aplicarFondoAuth(r.data().dataUrl);
            try { localStorage.setItem(CLAVE_FONDO_AUTH, JSON.stringify({ v, d: r.data().dataUrl })); } catch (e) { /* sin espacio */ }
        }
    } catch (e) { console.warn('No se pudo cargar el fondo de la pantalla de acceso:', e); }
}
cargarFondoAuth();
window.cargarFondoAuth = cargarFondoAuth;

function ocultarPantallaCarga() {
    const carga = document.getElementById('loading-screen');
    if (carga) carga.classList.add('hidden');
}
// Plan B: si Firebase tarda demasiado en responder, se muestra el acceso con Google
setTimeout(() => {
    const carga = document.getElementById('loading-screen');
    if (carga && !carga.classList.contains('hidden')) {
        carga.classList.add('hidden');
        if (!currentUserEmail) { document.getElementById('auth-screen').classList.remove('hidden'); document.body.classList.add('auth-mode'); }
    }
}, 8000);

// true mientras el popup de Google está abierto (no se debe recargar en ese momento)
function iniciandoSesion() {
    return !document.getElementById('auth-screen').classList.contains('hidden')
        && document.getElementById('btn-login').disabled;
}

function hayQuizActivo() {
    return !document.getElementById('quiz-screen').classList.contains('hidden');
}

// Recarga la lista de materias y los datos de las tarjetas (forzar = ignorar la caché de conteos)
async function refrescarListaMaterias(forzar = false) {
    if (forzar) { try { sessionStorage.removeItem(CLAVE_CONTEOS); } catch (e) { /* sin caché */ } }
    await cargarMaterias();
}

// Pide confirmación (si hay avance que perder) y vuelve al menú. La usan el botón rojo de cada
// pregunta y el botón "Volver al Menú" del encabezado, que queda siempre visible.
function pedirVolverAlMenu() {
    if (enPantallaResultados) { volverAlMenu(); return; }   // ya terminó: no hay nada que perder
    Swal.fire({
        title: '¿Volver al menú?',
        text: currentMode === "study" ? 'Tu progreso se guardará automáticamente.' : 'Perderás el progreso de este examen.',
        icon: 'warning', showCancelButton: true,
        confirmButtonColor: '#1a73e8', confirmButtonText: 'Sí, volver', cancelButtonText: 'Cancelar'
    }).then((res) => { if (res.isConfirmed) { stopTimer(); volverAlMenu(); } });
}
window.pedirVolverAlMenu = pedirVolverAlMenu;

function volverAlMenu() {
    stopTimer();
    enPantallaResultados = false;
    if (hayQuizActivo()) notificarExamenTerminado();

    // Limpiar el intento en curso
    questions = []; selectedAnswers = []; currentIndex = 0;
    currentMateria = ""; currentMode = ""; tiempoRestante = 0;
    seleccionTemporalMultiple = [];
    if (typeof ocultarZoomImagen === 'function') ocultarZoomImagen();

    // Restaurar la pantalla del quiz y mostrar el menú
    const quizScreen = document.getElementById('quiz-screen');
    quizScreen.innerHTML = QUIZ_SCREEN_HTML_ORIGINAL;
    quizScreen.classList.add('hidden');
    document.getElementById('btn-header-return').classList.add('hidden');
    document.getElementById('setup-screen').classList.remove('hidden');
    document.getElementById('update-banner').classList.add('hidden');
    window.scrollTo(0, 0);

    // Tarjetas al día (el avance del modo Estudio acaba de cambiar) y sin panel abierto
    cerrarPanelMateria();
    cargarMaterias();

    // Si había una versión nueva esperando, se aplica ahora que no hay examen en curso
    if (actualizacionPendiente) programarActualizacion();
}
window.volverAlMenu = volverAlMenu;

// ================================================================
// ACTUALIZACIÓN AUTOMÁTICA + BOTÓN "ACTUALIZAR"
// Cada 5 minutos (y al volver a la pestaña) se compara la versión publicada
// de index.html, script.js y style.css con la que se cargó. Si cambió:
//   · en el menú → se actualiza sola;
//   · resolviendo un examen/estudio → se avisa y se aplica al volver al menú
//     (así nunca se pierde un examen en curso).
// Las preguntas y materias se leen de Firestore, por lo que siempre están al día.
// ================================================================
const ARCHIVOS_APP = ['index.html', 'script.js', 'style.css'];
const INTERVALO_REVISION_MS = 5 * 60 * 1000;
let firmaAppCargada = null;
let actualizacionPendiente = false;
let ultimaRevision = Date.now();

async function obtenerFirmaApp() {
    const partes = await Promise.all(ARCHIVOS_APP.map(async (archivo) => {
        let r = await fetch(archivo, { method: 'HEAD', cache: 'no-store' });
        if (!r.ok) throw new Error(`${archivo}: HTTP ${r.status}`);
        const etag = r.headers.get('etag'), modificado = r.headers.get('last-modified');
        if (etag || modificado) return `${archivo}|${etag || ''}|${modificado || ''}`;
        // Servidor sin ETag/Last-Modified: se compara el contenido
        r = await fetch(archivo, { cache: 'no-store' });
        const txt = await r.text();
        let h = 0;
        for (let k = 0; k < txt.length; k++) h = (h * 31 + txt.charCodeAt(k)) | 0;
        return `${archivo}|${txt.length}|${h}`;
    }));
    return partes.join('||');
}

// Devuelve 'nueva', 'igual' o 'error'
async function comprobarActualizacion() {
    ultimaRevision = Date.now();
    let firma;
    try { firma = await obtenerFirmaApp(); }
    catch (e) { console.warn('No se pudo comprobar actualizaciones:', e); return 'error'; }
    if (firmaAppCargada === null) { firmaAppCargada = firma; return 'igual'; }
    return firma !== firmaAppCargada ? 'nueva' : 'igual';
}

// Descarga la versión nueva saltándose la caché del navegador y recarga (la sesión se conserva)
async function aplicarActualizacion() {
    try {
        sessionStorage.setItem('ultima_actualizacion', String(Date.now()));
        await Promise.all(ARCHIVOS_APP.map(a => fetch(a, { cache: 'reload' })));
    } catch (e) { console.warn('No se pudo precargar la versión nueva:', e); }
    location.reload();
}

function programarActualizacion() {
    Swal.fire({ toast: true, position: 'top-end', icon: 'info', title: 'Nueva versión disponible',
                text: 'Actualizando…', timer: 1500, showConfirmButton: false });
    setTimeout(aplicarActualizacion, 1300);
}

async function revisionAutomatica() {
    if (document.visibilityState !== 'visible') return;
    const estado = await comprobarActualizacion();
    if (estado === 'nueva') {
        const recienActualizado = Date.now() - Number(sessionStorage.getItem('ultima_actualizacion') || 0) < 60000;
        if (recienActualizado) return;                       // evita bucles de recarga
        actualizacionPendiente = true;
        if (hayQuizActivo()) {
            document.getElementById('update-banner').classList.remove('hidden');
        } else if (!Swal.isVisible() && !iniciandoSesion()) {
            programarActualizacion();
        }
    } else if (estado === 'igual' && !hayQuizActivo()) {
        // En el menú: mantener la lista de materias al día (sin molestar si el panel de inicio está abierto)
        const enMenu = !document.getElementById('setup-screen').classList.contains('hidden');
        if (enMenu && !panelMateriaAbierto()) refrescarListaMaterias();
        if (!currentUserEmail) cargarFondoAuth();   // pantalla de acceso: por si el administrador cambió la imagen
    }
}

async function accionBotonActualizar() {
    const icono = document.querySelector('#btn-actualizar i');
    if (icono) icono.classList.add('fa-spin');
    const estado = actualizacionPendiente ? 'nueva' : await comprobarActualizacion();
    if (icono) icono.classList.remove('fa-spin');

    if (estado === 'error') {
        Swal.fire({ icon: 'info', title: 'No se pudo comprobar', text: 'Revise su conexión a Internet e intente de nuevo.', confirmButtonColor: '#1a73e8' });
        return;
    }
    if (estado === 'nueva') {
        const enQuiz = hayQuizActivo();
        const avisoQuiz = currentMode === 'study' ? 'Su progreso de estudio está guardado.' : 'Perderá el avance de este examen.';
        const r = await Swal.fire({
            icon: 'info', title: 'Nueva versión disponible',
            text: enQuiz ? `Se recargará la página. ${avisoQuiz}` : 'Se recargará la página para aplicarla. Su sesión se mantiene.',
            showCancelButton: true, confirmButtonText: 'Actualizar ahora', cancelButtonText: 'Más tarde', confirmButtonColor: '#1a73e8'
        });
        if (r.isConfirmed) { stopTimer(); await aplicarActualizacion(); }
        return;
    }
    if (!hayQuizActivo()) await refrescarListaMaterias(true);
    Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Ya tiene la versión más reciente', timer: 2500, showConfirmButton: false });
}

document.getElementById('btn-actualizar').onclick = accionBotonActualizar;
document.getElementById('btn-banner-actualizar').onclick = accionBotonActualizar;

// Versión con la que se cargó esta página (línea base para detectar cambios)
obtenerFirmaApp().then(f => { if (firmaAppCargada === null) firmaAppCargada = f; }).catch(() => {});
setInterval(revisionAutomatica, INTERVALO_REVISION_MS);
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - ultimaRevision > 60000) revisionAutomatica();
});
window.addEventListener('online', revisionAutomatica);

// ================================================================
// BOTÓN LOGIN — signInWithPopup (móvil y escritorio)
// browserLocalPersistence garantiza que la sesión se guarda en
// localStorage, no en cookies.
// FIX MÓVIL: se usa signInWithPopup también en móvil (antes era
// signInWithRedirect). El redirect dependía de que el navegador
// guardara estado temporal entre el dominio de la página y el
// authDomain de Firebase (dominio distinto); en Chrome de Android/iOS
// ese almacenamiento entre dominios puede bloquearse, y el usuario
// vuelve a la pantalla de Bienvenido sin haber iniciado sesión.
// signInWithPopup no depende de eso porque nunca sale del dominio
// de la página.
// ================================================================
document.getElementById('btn-login').onclick = () => {
    const btn = document.getElementById('btn-login');
    btn.disabled = true;
    btn.textContent = 'Conectando...';
    signInWithPopup(auth, provider).catch(err => {
        btn.disabled = false; btn.textContent = 'Acceder con Google';
        if (!['auth/popup-closed-by-user','auth/cancelled-popup-request'].includes(err.code)) {
            Swal.fire({ icon:'error', title:'Error al iniciar sesión', html:`Código: <code>${err.code}</code>`, confirmButtonText:'Entendido' });
        }
    });
};
