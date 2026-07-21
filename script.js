import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut, browserLocalPersistence, setPersistence } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, collection, getDocs, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

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

        document.getElementById('auth-screen').classList.add('hidden');
        document.getElementById('setup-screen').classList.remove('hidden');
        document.getElementById('user-display').classList.remove('hidden');
        document.getElementById('user-info').innerText = currentUserName.split(' ')[0].toUpperCase();

        const welcomeName = document.getElementById('user-welcome-name');
        const welcomeSub = document.getElementById('user-welcome-sub');
        if (welcomeName) welcomeName.textContent = currentUserName.toUpperCase();
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
        document.getElementById('auth-screen').classList.remove('hidden');
        document.getElementById('setup-screen').classList.add('hidden');
        document.getElementById('user-display').classList.add('hidden');
        if (adminLinkContainer) {
            adminLinkContainer.classList.add('hidden');
            adminLinkContainer.style.display = 'none';
        }
    }
});

// 2. CARGAR MATERIAS
// Las materias están embebidas directamente en el script para evitar
// errores 404 en GitHub Pages al intentar hacer fetch del JSON.
// Si necesitas agregar/quitar materias, edita el objeto CONFIG_MATERIAS abajo.
const CONFIG_MATERIAS = {
  "materias": [
    { "id": "comp-forense",   "nombre": "Computación Forense",        "activa": true },
    { "id": "deontologia",    "nombre": "Deontología",                "activa": true },
    { "id": "auditoria-ti",   "nombre": "Auditoría de TI",            "activa": true },
    { "id": "emprendimiento", "nombre": "Emprendimiento e Innovación", "activa": true },
    { "id": "ia",             "nombre": "Inteligencia Artificial",     "activa": true },
    { "id": "practicas-1",    "nombre": "Prácticas Laborales 1",      "activa": true }
  ]
};

async function cargarMaterias() {
    try {
        const data = CONFIG_MATERIAS;

        let materiasVisibles = data.materias.filter(m => m.activa);

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

        const select = document.getElementById('subject-select');
        const btnStart = document.getElementById('btn-start');

        select.innerHTML = '<option value="">-- Selecciona Materia --</option>';
        materiasVisibles.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.id;
            opt.textContent = m.nombre;
            select.appendChild(opt);
        });

        if (materiasVisibles.length === 0) {
            select.innerHTML = '<option value="">Sin materias asignadas</option>';
            btnStart.disabled = true;
            btnStart.textContent = "Sin acceso a materias";
            return;
        }

        select.onchange = () => {
            if (select.value === "") {
                btnStart.disabled = true;
                btnStart.textContent = "Selecciona una materia";
                btnStart.style.opacity = "0.5";
            } else {
                btnStart.disabled = false;
                btnStart.textContent = "Iniciar";
                btnStart.style.opacity = "1";
            }
        };

        const modeSelect = document.getElementById('mode-select');
        const opcionSinLimite = document.getElementById('opcion-sin-limite');
        const cantidadContainer = document.getElementById('cantidad-container');
        const tiempoSelect = document.getElementById('tiempo-select');

        modeSelect.onchange = () => {
            if (modeSelect.value === 'study') {
                opcionSinLimite.style.display = '';
                cantidadContainer.style.display = 'block';
            } else {
                opcionSinLimite.style.display = 'none';
                cantidadContainer.style.display = 'none';
                if (tiempoSelect.value === '0') tiempoSelect.value = '20';
            }
        };

    } catch (error) {
        console.error('Error cargando materias:', error);
        Swal.fire({
            icon: 'error', title: 'Error',
            html: `<p>No se pudo cargar la lista de materias.</p><p style="font-size:0.85rem;color:#999;margin-top:8px;">Error: ${error.message}</p>`,
            confirmButtonColor: '#1a73e8'
        });
    }
}

// 3. INICIAR EXAMEN
document.getElementById('btn-start').onclick = async () => {
    currentMateria = document.getElementById('subject-select').value;
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
                    icon: 'question', showCancelButton: true,
                    confirmButtonText: 'Retomar avance', cancelButtonText: 'Empezar de cero'
                });
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
        document.getElementById('btn-header-return').classList.add('hidden');

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
    menuButton.onclick = () => {
        Swal.fire({
            title: '¿Volver al menú?',
            text: currentMode === "study" ? 'Tu progreso se guardará automáticamente.' : 'Perderás el progreso de este examen.',
            icon: 'warning', showCancelButton: true,
            confirmButtonColor: '#1a73e8', confirmButtonText: 'Sí, volver'
        }).then((res) => { if (res.isConfirmed) { stopTimer(); location.reload(); } });
    };
    optionsContainer.appendChild(menuButton);

    if (!question.opciones || !Array.isArray(question.opciones)) {
        optionsContainer.innerHTML += '<p style="color: red;">Error: Esta pregunta no tiene opciones válidas.</p>';
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
            location.reload();
        });
    }
}

// 7. RESULTADOS DETALLADOS
function mostrarResultadosDetallados(correctas) {
    const container = document.getElementById('quiz-screen');
    container.innerHTML = `
        <h2 style="color:#1a73e8;margin-bottom:20px;">Resultados Detallados</h2>
        <div style="text-align:center;margin-bottom:30px;">
            <div style="font-size:3rem;color:${correctas >= questions.length * 0.7 ? '#34a853' : '#ea4335'};">
                ${((correctas / questions.length) * 100).toFixed(1)}%
            </div>
            <p style="color:#666;">Correctas: ${correctas} / ${questions.length}</p>
        </div>
        <div id="detailed-results"></div>
        <button onclick="location.reload()" class="btn-primary" style="margin-top:20px;">Volver al Menú</button>
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

document.getElementById('btn-header-return').onclick = () => {
    Swal.fire({
        title: '¿Volver al menú?', text: 'Se guardará tu progreso si estás en modo estudio.',
        icon: 'warning', showCancelButton: true, confirmButtonColor: '#1a73e8'
    }).then((res) => { if (res.isConfirmed) { stopTimer(); location.reload(); } });
};

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
