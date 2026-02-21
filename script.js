import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut, browserLocalPersistence, setPersistence } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, getDocs, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

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
    if (document.hidden) {
        mostrarOverlayBloqueador('cambio_pestaña', false);
    } else {
        ocultarOverlay();
    }
});

// FIX CRÍTICO #3: En móvil, el blur se dispara al abrir teclado virtual → NO usar en móvil
if (!esMobil) {
    window.addEventListener('blur', () => mostrarOverlayBloqueador('ventana_minimizada', false));
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

        currentUserEmail = userEmail;
        currentUserName = user.displayName || userEmail;
        crearMarcaDeAgua(userEmail);
        crearOverlay();
        registrarAcceso('inicio_sesion');

        // Mostrar pantalla principal
        document.getElementById('auth-screen').classList.add('hidden');
        document.getElementById('setup-screen').classList.remove('hidden');
        document.getElementById('user-display').classList.remove('hidden');
        document.getElementById('user-info').innerText = `${currentUserName.toUpperCase()} (2 Disp.)`;

        // FIX #4: Rellenar tarjeta de bienvenida del HTML (estaba vacía)
        const welcomeName = document.getElementById('user-welcome-name');
        const welcomeSub = document.getElementById('user-welcome-sub');
        if (welcomeName) welcomeName.textContent = currentUserName.toUpperCase();
        if (welcomeSub) welcomeSub.textContent = userEmail;

        // Admin link
        const esAdminUser = userEmail === ADMIN_EMAIL;
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
            const saved = localStorage.getItem(`progreso_${currentMateria}`);
            if (saved) {
                const result = await Swal.fire({
                    title: 'Avance Detectado',
                    text: '¿Deseas retomar lo avanzado o empezar desde la primera pregunta?',
                    icon: 'question', showCancelButton: true,
                    confirmButtonText: 'Retomar avance', cancelButtonText: 'Empezar de cero'
                });
                currentIndex = result.isConfirmed ? parseInt(saved) : 0;
            } else {
                currentIndex = 0;
            }
        } else {
            currentIndex = 0;
        }

        startTimer();

        document.getElementById('setup-screen').classList.add('hidden');
        document.getElementById('quiz-screen').classList.remove('hidden');
        document.getElementById('btn-header-return').classList.add('hidden');

        renderQuestion();

    } catch (error) {
        console.error('Error cargando preguntas:', error);
        Swal.fire({ icon: 'error', title: 'Error', text: 'Hubo un problema al cargar las preguntas. Intenta de nuevo.' });
    }
};

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
    questionText.textContent = `${currentIndex + 1}. ${preguntaTexto}`;
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

    const yaRespondida = selectedAnswers[currentIndex] !== null;

    question.opciones.forEach((opcion, index) => {
        const button = document.createElement('button');
        button.className = 'option-button';
        button.innerHTML = `<span class="option-letter">${String.fromCharCode(65 + index)}</span> ${opcion}`;

        if (currentMode === "study" && yaRespondida) {
            button.disabled = true;
            if (index === question.respuesta) button.classList.add('correct');
            else if (index === selectedAnswers[currentIndex]) button.classList.add('incorrect');
        } else if (selectedAnswers[currentIndex] === index) {
            button.classList.add('selected');
        }

        button.onclick = () => selectAnswer(index);
        optionsContainer.appendChild(button);
    });

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
            if (selectedAnswers[currentIndex] === null && currentMode === "exam") {
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

// Helper: crear caja de feedback
function crearFeedbackBox(question, userAnswer) {
    const correct = question.respuesta;
    const feedbackBox = document.createElement('div');
    feedbackBox.id = 'feedback-box';
    feedbackBox.style.cssText = `
        margin-top: 20px; padding: 15px; border-radius: 8px; text-align: left;
        background: ${userAnswer === correct ? '#e6f4ea' : '#fce8e6'};
        border-left: 4px solid ${userAnswer === correct ? '#34a853' : '#ea4335'};
    `;
    if (userAnswer === correct) {
        feedbackBox.innerHTML = `
            <p style="font-weight:bold;color:#34a853;margin-bottom:8px;"><i class="fas fa-check-circle"></i> ¡Correcto!</p>
            <p style="color:#555;font-size:0.95rem;">${question.explicacion_correcta || '¡Excelente trabajo!'}</p>
        `;
    } else {
        feedbackBox.innerHTML = `
            <p style="font-weight:bold;color:#ea4335;margin-bottom:8px;"><i class="fas fa-times-circle"></i> Incorrecto</p>
            <p style="color:#555;font-size:0.95rem;margin-bottom:8px;">La respuesta correcta es: <strong>${String.fromCharCode(65 + correct)}) ${question.opciones[correct]}</strong></p>
            <p style="color:#666;font-size:0.9rem;">${question.explicacion_correcta || 'Revisa el material de estudio.'}</p>
        `;
    }
    return feedbackBox;
}

// 5. SELECCIONAR RESPUESTA
function selectAnswer(optionIndex) {
    const buttons = document.querySelectorAll('.option-button');

    if (currentMode === "study") {
        const question = questions[currentIndex];
        const correct = question.respuesta;

        buttons.forEach((btn, idx) => {
            btn.disabled = true;
            if (idx === correct) btn.classList.add('correct');
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

    } else {
        buttons.forEach(btn => btn.classList.remove('selected'));
        buttons[optionIndex].classList.add('selected');
        selectedAnswers[currentIndex] = optionIndex;
    }
}

// 6. FINALIZAR EXAMEN
function finalizarExamen() {
    stopTimer();

    if (currentMode === "exam") {
        let correctas = 0;
        questions.forEach((q, idx) => { if (selectedAnswers[idx] === q.respuesta) correctas++; });

        const porcentaje = ((correctas / questions.length) * 100).toFixed(1);

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
                <strong>Respuestas correctas:</strong> ${correctas} / ${questions.length}<br>
                <strong>Calificación:</strong> ${porcentaje}%<br>
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
        }).then(() => {
            localStorage.removeItem(`progreso_${currentMateria}`);
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
        const isCorrect = userAnswer === q.respuesta;
        const resultCard = document.createElement('div');
        resultCard.style.cssText = `
            background:${isCorrect ? '#e6f4ea' : '#fce8e6'};padding:15px;border-radius:8px;
            margin-bottom:15px;text-align:left;border-left:4px solid ${isCorrect ? '#34a853' : '#ea4335'};
        `;
        resultCard.innerHTML = `
            <p style="font-weight:bold;margin-bottom:8px;">${idx + 1}. ${q.texto || q.explicacion || q.pregunta || 'Sin texto'}</p>
            <p style="color:#666;font-size:0.9rem;">
                Tu respuesta: <strong>${userAnswer !== null ? String.fromCharCode(65 + userAnswer) : 'Sin responder'}</strong><br>
                Respuesta correcta: <strong>${String.fromCharCode(65 + q.respuesta)}</strong>
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
    if (currentMode === "study") localStorage.setItem(`progreso_${currentMateria}`, currentIndex);
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
// localStorage, no en cookies, evitando el bucle en GitHub Pages móvil.
// ================================================================
document.getElementById('btn-login').onclick = async () => {
    const btnLogin = document.getElementById('btn-login');
    btnLogin.disabled = true;
    btnLogin.textContent = 'Conectando...';

    try {
        await signInWithPopup(auth, provider);
        // onAuthStateChanged detecta el login y muestra el simulador
    } catch (error) {
        btnLogin.disabled = false;
        btnLogin.textContent = 'Acceder con Google';

        const cancelaciones = ['auth/popup-closed-by-user', 'auth/cancelled-popup-request'];
        if (!cancelaciones.includes(error.code)) {
            console.error('Error login:', error.code, error.message);

            if (error.code === 'auth/popup-blocked') {
                Swal.fire({
                    icon: 'warning',
                    title: 'Ventana bloqueada',
                    html: 'Tu navegador bloqueó la ventana de Google.<br><br>' +
                          'Toca <strong>"Permitir"</strong> cuando el navegador te lo pida, ' +
                          'o activa los popups en la configuración del navegador.',
                    confirmButtonColor: '#1a73e8',
                    confirmButtonText: 'Intentar de nuevo'
                });
            } else {
                Swal.fire({
                    icon: 'error', title: 'Error al iniciar sesión',
                    text: 'No se pudo conectar con Google. Verifica tu conexión e intenta de nuevo.',
                    confirmButtonColor: '#1a73e8'
                });
            }
        }
    }
};
