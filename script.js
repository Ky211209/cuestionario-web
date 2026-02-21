import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, collection, getDocs, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = { apiKey: "AIzaSyAMQpnPJSdicgo5gungVOE0M7OHwkz4P9Y", authDomain: "autenticacion-8faac.firebaseapp.com", projectId: "autenticacion-8faac", storageBucket: "autenticacion-8faac.firebasestorage.app", appId: "1:939518706600:web:d28c3ec7de21da8379939d" };
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

// ================================================================
// MÓDULO DE SEGURIDAD
// ================================================================
let currentUserEmail = "";
let currentUserName = "";
let watermarkElement = null;
let contentHidden = false;

// --- 1. MARCA DE AGUA DISCRETA ---
function crearMarcaDeAgua(email) {
    if (watermarkElement) watermarkElement.remove();
    // La marca se insertará dentro del quiz en renderQuestion()
    // Guardamos el email para usarlo después
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

function mostrarMarcaDeAgua() {
    const wm = document.getElementById('security-watermark');
    if (wm) wm.style.display = 'block';
}

function ocultarMarcaDeAgua() {
    const wm = document.getElementById('security-watermark');
    if (wm) wm.style.display = 'none';
}

// --- 2. LOG DE AUDITORÍA EN FIREBASE ---
async function registrarAcceso(tipo, detalle = {}) {
    if (!currentUserEmail) return;
    try {
        await addDoc(collection(db, "auditoria_accesos"), {
            usuario: currentUserEmail,
            nombre: currentUserName,
            tipo,          // "inicio_sesion" | "ver_pregunta" | "perder_foco" | "pantalla_compartida"
            timestamp: serverTimestamp(),
            fecha_legible: new Date().toLocaleString('es-EC', { timeZone: 'America/Guayaquil' }),
            ...detalle
        });
    } catch (e) {
        console.warn("Log de auditoría falló:", e);
    }
}

// --- 3. OVERLAY BLOQUEADOR + DETECCIÓN DE PANTALLA COMPARTIDA ---
let overlayOcultar = null;
let screenShareStream = null;       // stream activo de captura de pantalla
let screenShareBloqueado = false;   // true = bloqueado por screen share
let esAdminActivo = false;          // se actualiza al autenticar

function esAdmin() {
    return currentUserEmail === ADMIN_EMAIL;
}

function crearOverlay() {
    if (overlayOcultar) return;
    overlayOcultar = document.createElement('div');
    overlayOcultar.id = 'security-overlay';
    // El contenido se actualiza dinámicamente según el motivo
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
    const titulo = esCompartirPantalla
        ? 'COMPARTIR PANTALLA BLOQUEADO'
        : 'CONTENIDO PROTEGIDO';
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
            <div style="
                background: rgba(255,255,255,0.07);
                border: 1px solid rgba(255,255,255,0.15);
                border-radius: 12px;
                padding: 16px 24px;
                display: inline-block;
            ">
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
            ${esCompartirPantalla ? '' : `
            <p style="color: #555; font-size: 0.8rem; margin-top: 28px;">
                Este evento ha sido registrado
            </p>`}
        </div>
    `;

    overlayOcultar.style.display = 'flex';
    registrarAcceso(esCompartirPantalla ? 'intento_compartir_pantalla' : 'perder_foco', { motivo });
}

function ocultarOverlay() {
    if (!overlayOcultar) return;
    if (screenShareBloqueado) return; // No se puede cerrar si sigue compartiendo
    contentHidden = false;
    overlayOcultar.style.display = 'none';
}

// ── DETECCIÓN DE SCREEN SHARE (Screen Capture API) ──────────────────────────
// Interceptamos getDisplayMedia para saber si el usuario inicia una captura
const _originalGetDisplayMedia = navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices);

navigator.mediaDevices.getDisplayMedia = async function(constraints) {
    const quizVisible = !document.getElementById('quiz-screen').classList.contains('hidden');
    if (!quizVisible) {
        // Fuera del quiz, permitir normal
        return _originalGetDisplayMedia(constraints);
    }

    // Usuario normal intentando compartir durante el quiz → interceptar
    try {
        screenShareStream = await _originalGetDisplayMedia(constraints);

        // Compartición activa → bloquear inmediatamente
        screenShareBloqueado = true;
        mostrarOverlayBloqueador('screen_share_detectado', true);

        // Monitorear cuándo se detiene la transmisión
        screenShareStream.getVideoTracks().forEach(track => {
            track.addEventListener('ended', () => {
                // El usuario cerró el Meet o dejó de compartir
                screenShareBloqueado = false;
                screenShareStream = null;
                contentHidden = false;
                overlayOcultar.style.display = 'none';
                registrarAcceso('pantalla_compartida_detenida');
                Swal.fire({
                    icon: 'success',
                    title: 'Transmisión cerrada',
                    text: 'Puedes continuar con el simulador.',
                    timer: 3000,
                    showConfirmButton: false,
                    toast: true,
                    position: 'top-end'
                });
            });
        });

        return screenShareStream;
    } catch (err) {
        // Usuario canceló el diálogo de compartir → no bloquear
        throw err;
    }
};

// ── EVENTOS DE FOCO / PESTAÑA ────────────────────────────────────────────────
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        mostrarOverlayBloqueador('cambio_pestaña', false);
    } else {
        ocultarOverlay();
    }
});

window.addEventListener('blur', () => {
    mostrarOverlayBloqueador('ventana_minimizada', false);
});
window.addEventListener('focus', () => {
    ocultarOverlay();
});

// --- 4. INTERCEPTAR CLIC DERECHO E INSPECCIONAR (disuasivo) ---
document.addEventListener('contextmenu', (e) => {
    const quizVisible = !document.getElementById('quiz-screen').classList.contains('hidden');
    if (quizVisible) {
        e.preventDefault();
        Swal.fire({
            icon: 'warning',
            title: 'Acción Restringida',
            text: 'El clic derecho está deshabilitado durante el simulador.',
            timer: 2000,
            showConfirmButton: false
        });
    }
});

// Atajos de teclado de inspeccionar / captura de pantalla
document.addEventListener('keydown', (e) => {
    const quizVisible = !document.getElementById('quiz-screen').classList.contains('hidden');
    if (!quizVisible) return;
    // F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+U
    if (e.key === 'F12' || 
        (e.ctrlKey && e.shiftKey && ['I','J','C'].includes(e.key)) ||
        (e.ctrlKey && e.key === 'u')) {
        e.preventDefault();
        registrarAcceso('intento_inspeccionar', { tecla: e.key });
    }
    // PrintScreen: registrar intento y limpiar portapapeles si es posible
    if (e.key === 'PrintScreen') {
        registrarAcceso('intento_captura_pantalla');
        // Intentar limpiar portapapeles (solo funciona si el usuario ya dio permiso de escritura)
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText('').catch(() => {
                // Sin permiso de clipboard: se registra el intento pero no se puede vaciar
            });
        }
    }
});

// ================================================================
// Email del administrador autorizado (único con acceso al panel admin)
const ADMIN_EMAIL = "kholguinb2@unemi.edu.ec";

// Usuarios con acceso permanente al simulador (2 dispositivos)
const USUARIOS_PERMITIDOS = [
    "kholguinb2@unemi.edu.ec",  // Administradora
    "iastudillol@unemi.edu.ec",  // Usuario con acceso
    "naguilarb@unemi.edu.ec"    // Usuario con acceso
];

let currentMateria = "", currentMode = "", questions = [], currentIndex = 0;
let selectedAnswers = []; // Para guardar respuestas
let timerInterval = null;
let startTime = null;
let tiempoLimiteSegundos = 0;   // 0 = sin límite
let tiempoRestante = 0;         // para cuenta regresiva

// 1. MANEJO DE SESIÓN PERMANENTE
onAuthStateChanged(auth, async (user) => {
    // IMPORTANTE: Asegurar que el enlace admin esté oculto por defecto
    const adminLinkContainer = document.getElementById('admin-link-container');
    
    if (user) {
        const userEmail = user.email.toLowerCase();
        console.log('Usuario autenticado:', userEmail);
        
        // Verificar si el usuario tiene acceso permitido
        const tieneAcceso = USUARIOS_PERMITIDOS.includes(userEmail);
        
        if (!tieneAcceso) {
            // Verificar en Firebase si está autorizado
            try {
                const userDoc = await getDoc(doc(db, "usuarios_seguros", userEmail));
                if (!userDoc.exists()) {
                    // Usuario no autorizado
                    await Swal.fire({
                        icon: 'error',
                        title: 'Acceso Denegado',
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
        
        // Inicializar módulo de seguridad
        currentUserEmail = userEmail;
        currentUserName = user.displayName || userEmail;
        crearMarcaDeAgua(userEmail);
        crearOverlay();
        registrarAcceso('inicio_sesion');

        document.getElementById('auth-screen').classList.add('hidden');
        document.getElementById('setup-screen').classList.remove('hidden');
        document.getElementById('user-display').classList.remove('hidden');
        document.getElementById('user-info').innerText = `${user.displayName.toUpperCase()} (2 Disp.)`;
        
        // Mostrar enlace de panel admin SOLO si es la administradora
        const esAdmin = userEmail === ADMIN_EMAIL;
        console.log('¿Es administradora?', esAdmin, '(Email admin esperado:', ADMIN_EMAIL + ')');
        
        if (esAdmin) {
            console.log('Mostrando enlace del panel admin');
            adminLinkContainer.classList.remove('hidden');
            adminLinkContainer.style.display = 'block';
        } else {
            console.log('Ocultando enlace del panel admin');
            adminLinkContainer.classList.add('hidden');
            adminLinkContainer.style.display = 'none';
        }
        
        cargarMaterias();
    } else {
        console.log('Usuario no autenticado');
        document.getElementById('auth-screen').classList.remove('hidden');
        document.getElementById('setup-screen').classList.add('hidden');
        document.getElementById('user-display').classList.add('hidden');
        if (adminLinkContainer) {
            adminLinkContainer.classList.add('hidden');
            adminLinkContainer.style.display = 'none';
        }
    }
});

// 2. CARGAR MATERIAS Y ACTIVAR BOTÓN
async function cargarMaterias() {
    try {
        // Intentar múltiples rutas posibles
        const posiblesRutas = [
            'config-materias.json',
            './config-materias.json',
            '/config-materias.json',
            'data/config-materias.json',
            './data/config-materias.json'
        ];

        let data = null;
        let rutaExitosa = null;

        for (const ruta of posiblesRutas) {
            try {
                const res = await fetch(ruta);
                if (res.ok) {
                    data = await res.json();
                    rutaExitosa = ruta;
                    console.log(`✅ Materias cargadas desde: ${ruta}`);
                    break;
                }
            } catch (e) {
                continue;
            }
        }

        if (!data) {
            throw new Error('No se encontró el archivo config-materias.json en ninguna ruta');
        }

        // ── FILTRAR MATERIAS SEGÚN ROL ──────────────────────────────
        let materiasVisibles = data.materias.filter(m => m.activa);

        // Solo si NO es admin, filtrar por materias asignadas en Firebase
        const esAdmin = currentUserEmail === ADMIN_EMAIL;
        if (!esAdmin) {
            try {
                const userDoc = await getDoc(doc(db, "usuarios_seguros", currentUserEmail));
                if (userDoc.exists()) {
                    const userData = userDoc.data();
                    const rol = userData.rol || 'usuario';
                    if (rol !== 'admin' && userData.materias && userData.materias.length > 0) {
                        materiasVisibles = materiasVisibles.filter(m => userData.materias.includes(m.id));
                    }
                }
            } catch(e) {
                console.error('Error obteniendo rol del usuario:', e);
            }
        }
        // ────────────────────────────────────────────────────────────

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

        // Mostrar/ocultar opciones según modo seleccionado
        const modeSelect = document.getElementById('mode-select');
        const tiempoContainer = document.getElementById('tiempo-container');
        const cantidadContainer = document.getElementById('cantidad-container');
        const opcionSinLimite = document.getElementById('opcion-sin-limite');
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
            icon: 'error', 
            title: 'Error', 
            html: `
                <p>No se pudo cargar la lista de materias.</p>
                <p style="font-size: 0.85rem; color: #666; margin-top: 10px;">
                    Verifica que el archivo <code>config-materias.json</code> esté en la raíz del proyecto.
                </p>
                <p style="font-size: 0.8rem; color: #999; margin-top: 5px;">
                    Error técnico: ${error.message}
                </p>
            `,
            confirmButtonColor: '#1a73e8'
        });
    }
}

// 3. INICIAR EXAMEN O RECUPERAR PROGRESO
document.getElementById('btn-start').onclick = async () => {
    currentMateria = document.getElementById('subject-select').value;
    currentMode = document.getElementById('mode-select').value;
    // Leer tiempo: en examen siempre será 15/20/30/60; en estudio puede ser 0 (sin límite)
    const tiempoMinutos = parseInt(document.getElementById('tiempo-select').value) || 0;
    tiempoLimiteSegundos = tiempoMinutos * 60;

    try {
        const snap = await getDocs(collection(db, `bancos_preguntas/${currentMateria}/preguntas`));
        
        if (snap.empty) {
            Swal.fire({ 
                icon: 'info', 
                title: 'Aviso', 
                text: 'Atención: No existen preguntas cargadas para esta materia.', 
                confirmButtonColor: '#1a73e8' 
            });
            return;
        }

        questions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        
        // Mezclar preguntas aleatoriamente
        questions = questions.sort(() => Math.random() - 0.5);

        if (currentMode === "exam") {
            // MODO EXAMEN: siempre 20 preguntas aleatorias
            questions = questions.slice(0, 20);
            selectedAnswers = new Array(questions.length).fill(null);
        } else {
            // MODO ESTUDIO: 20 preguntas O todas, según lo que eligió el usuario
            const cantidadSelect = document.getElementById('cantidad-select');
            const cantidadElegida = cantidadSelect ? cantidadSelect.value : '20';
            if (cantidadElegida !== 'todas') {
                questions = questions.slice(0, 20);
            }
            // Si eligió "todas", se quedan todas las preguntas ya mezcladas
            selectedAnswers = new Array(questions.length).fill(null);
        }

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
            } else { 
                currentIndex = 0; 
            }
            startTimer(); // Iniciar timer también en modo estudio (puede ser con límite o sin límite)
        } else { 
            currentIndex = 0; 
            startTimer();
        }

        document.getElementById('setup-screen').classList.add('hidden');
        document.getElementById('quiz-screen').classList.remove('hidden');
        document.getElementById('btn-header-return').classList.add('hidden'); // OCULTAR botón del header
        
        // MOSTRAR LA PRIMERA PREGUNTA
        renderQuestion();
        
    } catch (error) {
        console.error('Error cargando preguntas:', error);
        Swal.fire({ 
            icon: 'error', 
            title: 'Error', 
            text: 'Hubo un problema al cargar las preguntas. Por favor, intenta de nuevo.' 
        });
    }
};

// 4. RENDERIZAR PREGUNTA
function renderQuestion() {
    if (currentIndex >= questions.length) {
        finalizarExamen();
        return;
    }

    const question = questions[currentIndex];
    const questionText = document.getElementById('question-text');
    const optionsContainer = document.getElementById('options-container');
    
    // Registrar en auditoría que se vio esta pregunta
    registrarAcceso('ver_pregunta', {
        materia: currentMateria,
        modo: currentMode,
        pregunta_num: currentIndex + 1,
        pregunta_id: question.id,
        pregunta_texto: (question.texto || '').substring(0, 80)
    });

    // Insertar marca de agua encima de la pregunta
    insertarMarcaEnPregunta(currentUserEmail);

    // Manejar diferentes estructuras de datos (texto, explicacion, o pregunta)
    const preguntaTexto = question.texto || question.explicacion || question.pregunta || 'Pregunta sin texto';
    questionText.textContent = `${currentIndex + 1}. ${preguntaTexto}`;
    optionsContainer.innerHTML = '';

    // AGREGAR BOTÓN "VOLVER AL MENÚ" VISIBLE
    const menuButton = document.createElement('button');
    menuButton.className = 'btn-back-menu';
    menuButton.innerHTML = '<i class="fas fa-home"></i> Volver al Menú';
    menuButton.onclick = () => {
        Swal.fire({ 
            title: '¿Volver al menú?', 
            text: currentMode === "study" ? 'Tu progreso se guardará automáticamente.' : 'Perderás el progreso de este examen.',
            icon: 'warning', 
            showCancelButton: true,
            confirmButtonColor: '#1a73e8',
            confirmButtonText: 'Sí, volver'
        }).then((res) => { 
            if(res.isConfirmed) {
                stopTimer();
                location.reload(); 
            }
        });
    };
    optionsContainer.appendChild(menuButton);

    // Verificar que existan opciones
    if (!question.opciones || !Array.isArray(question.opciones)) {
        optionsContainer.innerHTML += '<p style="color: red;">Error: Esta pregunta no tiene opciones válidas.</p>';
        return;
    }

    // Verificar si esta pregunta ya fue respondida
    const yaRespondida = selectedAnswers[currentIndex] !== null;

    // Crear botones para cada opción
    question.opciones.forEach((opcion, index) => {
        const button = document.createElement('button');
        button.className = 'option-button';
        button.innerHTML = `<span class="option-letter">${String.fromCharCode(65 + index)}</span> ${opcion}`;
        
        // En modo estudio, si ya fue respondida, mostrar los colores
        if (currentMode === "study" && yaRespondida) {
            button.disabled = true;
            if (index === question.respuesta) {
                button.classList.add('correct');
            } else if (index === selectedAnswers[currentIndex]) {
                button.classList.add('incorrect');
            }
        } else if (selectedAnswers[currentIndex] === index) {
            // Marcar si ya fue seleccionada (modo examen)
            button.classList.add('selected');
        }
        
        button.onclick = () => selectAnswer(index);
        optionsContainer.appendChild(button);
    });

    // Mostrar feedback si ya fue respondida en modo estudio
    if (currentMode === "study" && yaRespondida) {
        const feedbackBox = document.createElement('div');
        feedbackBox.id = 'feedback-box';
        const correct = question.respuesta;
        const userAnswer = selectedAnswers[currentIndex];
        
        feedbackBox.style.cssText = `
            margin-top: 20px;
            padding: 15px;
            border-radius: 8px;
            text-align: left;
            background: ${userAnswer === correct ? '#e6f4ea' : '#fce8e6'};
            border-left: 4px solid ${userAnswer === correct ? '#34a853' : '#ea4335'};
        `;
        
        if (userAnswer === correct) {
            feedbackBox.innerHTML = `
                <p style="font-weight: bold; color: #34a853; margin-bottom: 8px;">
                    <i class="fas fa-check-circle"></i> ¡Correcto!
                </p>
                <p style="color: #555; font-size: 0.95rem;">
                    ${question.explicacion_correcta || 'Has seleccionado la respuesta correcta. ¡Excelente trabajo!'}
                </p>
            `;
        } else {
            feedbackBox.innerHTML = `
                <p style="font-weight: bold; color: #ea4335; margin-bottom: 8px;">
                    <i class="fas fa-times-circle"></i> Incorrecto
                </p>
                <p style="color: #555; font-size: 0.95rem; margin-bottom: 8px;">
                    La respuesta correcta es: <strong>${String.fromCharCode(65 + correct)}) ${question.opciones[correct]}</strong>
                </p>
                <p style="color: #666; font-size: 0.9rem;">
                    ${question.explicacion_correcta || 'Revisa el material de estudio para comprender mejor este tema.'}
                </p>
            `;
        }
        
        optionsContainer.appendChild(feedbackBox);
    }

    // Botones de navegación
    const navDiv = document.createElement('div');
    navDiv.style.cssText = 'display: flex; justify-content: space-between; margin-top: 25px; gap: 10px;';
    
    if (currentIndex > 0) {
        const btnPrev = document.createElement('button');
        btnPrev.className = 'btn-secondary';
        btnPrev.innerHTML = '<i class="fas fa-arrow-left"></i> Anterior';
        btnPrev.onclick = () => {
            currentIndex--;
            renderQuestion();
            guardarAvanceAutomatico();
        };
        navDiv.appendChild(btnPrev);
    }

    const btnNext = document.createElement('button');
    btnNext.className = 'btn-primary';
    btnNext.style.cssText = 'margin-left: auto;'; // Solo alineación
    
    if (currentIndex === questions.length - 1) {
        btnNext.textContent = 'Finalizar';
        btnNext.onclick = finalizarExamen;
    } else {
        btnNext.innerHTML = 'Siguiente <i class="fas fa-arrow-right"></i>';
        btnNext.onclick = () => {
            if (selectedAnswers[currentIndex] === null && currentMode === "exam") {
                Swal.fire({
                    icon: 'warning',
                    title: 'Pregunta sin responder',
                    text: '¿Deseas continuar sin responder?',
                    showCancelButton: true,
                    confirmButtonText: 'Sí, continuar'
                }).then(result => {
                    if (result.isConfirmed) {
                        currentIndex++;
                        renderQuestion();
                        guardarAvanceAutomatico();
                    }
                });
            } else {
                currentIndex++;
                renderQuestion();
                guardarAvanceAutomatico();
            }
        };
    }
    
    navDiv.appendChild(btnNext);
    optionsContainer.appendChild(navDiv);
}

// 5. SELECCIONAR RESPUESTA
function selectAnswer(optionIndex) {
    const buttons = document.querySelectorAll('.option-button');
    
    // Modo Estudio: mostrar retroalimentación visual sin alertas
    if (currentMode === "study") {
        const question = questions[currentIndex];
        const correct = question.respuesta;
        
        buttons.forEach((btn, idx) => {
            btn.disabled = true;
            if (idx === correct) {
                btn.classList.add('correct');
            } else if (idx === optionIndex) {
                btn.classList.add('incorrect');
            }
        });
        
        selectedAnswers[currentIndex] = optionIndex;
        
        // Mostrar explicación debajo de las opciones
        const optionsContainer = document.getElementById('options-container');
        const existingFeedback = document.getElementById('feedback-box');
        if (existingFeedback) existingFeedback.remove();
        
        const feedbackBox = document.createElement('div');
        feedbackBox.id = 'feedback-box';
        feedbackBox.style.cssText = `
            margin-top: 20px;
            padding: 15px;
            border-radius: 8px;
            text-align: left;
            background: ${optionIndex === correct ? '#e6f4ea' : '#fce8e6'};
            border-left: 4px solid ${optionIndex === correct ? '#34a853' : '#ea4335'};
        `;
        
        if (optionIndex === correct) {
            feedbackBox.innerHTML = `
                <p style="font-weight: bold; color: #34a853; margin-bottom: 8px;">
                    <i class="fas fa-check-circle"></i> ¡Correcto!
                </p>
                <p style="color: #555; font-size: 0.95rem;">
                    ${question.explicacion_correcta || 'Has seleccionado la respuesta correcta. ¡Excelente trabajo!'}
                </p>
            `;
        } else {
            feedbackBox.innerHTML = `
                <p style="font-weight: bold; color: #ea4335; margin-bottom: 8px;">
                    <i class="fas fa-times-circle"></i> Incorrecto
                </p>
                <p style="color: #555; font-size: 0.95rem; margin-bottom: 8px;">
                    La respuesta correcta es: <strong>${String.fromCharCode(65 + correct)}) ${question.opciones[correct]}</strong>
                </p>
                <p style="color: #666; font-size: 0.9rem;">
                    ${question.explicacion_correcta || 'Revisa el material de estudio para comprender mejor este tema.'}
                </p>
            `;
        }
        
        // Insertar antes de los botones de navegación
        const navButtons = optionsContainer.querySelector('div[style*="justify-content: space-between"]');
        if (navButtons) {
            optionsContainer.insertBefore(feedbackBox, navButtons);
        } else {
            optionsContainer.appendChild(feedbackBox);
        }
        
    } else {
        // Modo Examen: solo marcar selección
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
        questions.forEach((q, idx) => {
            if (selectedAnswers[idx] === q.respuesta) correctas++;
        });
        
        const porcentaje = ((correctas / questions.length) * 100).toFixed(1);
        
        // Calcular tiempo usado según modo
        let tiempoTexto;
        if (tiempoLimiteSegundos > 0) {
            const usados = tiempoLimiteSegundos - tiempoRestante;
            const min = Math.floor(usados / 60);
            const seg = usados % 60;
            tiempoTexto = `${String(min).padStart(2,'0')}:${String(seg).padStart(2,'0')} de ${tiempoLimiteSegundos/60} min`;
        } else {
            tiempoTexto = document.getElementById('timer-display').textContent;
        }
        
        Swal.fire({
            icon: 'info',
            title: 'Examen Finalizado',
            html: `
                <p style="font-size: 1.1rem; margin: 15px 0;">
                    <strong>Respuestas correctas:</strong> ${correctas} / ${questions.length}<br>
                    <strong>Calificación:</strong> ${porcentaje}%<br>
                    <strong>Tiempo:</strong> ${tiempoTexto}
                </p>
            `,
            confirmButtonColor: '#1a73e8',
            confirmButtonText: 'Ver Resultados Detallados'
        }).then(() => {
            mostrarResultadosDetallados(correctas);
        });
    } else {
        Swal.fire({
            icon: 'success',
            title: '¡Sesión Completada!',
            text: 'Has terminado todas las preguntas de estudio.',
            confirmButtonColor: '#1a73e8'
        }).then(() => {
            localStorage.removeItem(`progreso_${currentMateria}`);
            location.reload();
        });
    }
}

// 7. MOSTRAR RESULTADOS DETALLADOS
function mostrarResultadosDetallados(correctas) {
    const container = document.getElementById('quiz-screen');
    container.innerHTML = `
        <h2 style="color: #1a73e8; margin-bottom: 20px;">Resultados Detallados</h2>
        <div style="text-align: center; margin-bottom: 30px;">
            <div style="font-size: 3rem; color: ${correctas >= questions.length * 0.7 ? '#34a853' : '#ea4335'};">
                ${((correctas / questions.length) * 100).toFixed(1)}%
            </div>
            <p style="color: #666;">Correctas: ${correctas} / ${questions.length}</p>
        </div>
        <div id="detailed-results"></div>
        <button onclick="location.reload()" class="btn-primary" style="margin-top: 20px;">Volver al Menú</button>
    `;
    
    const resultsDiv = document.getElementById('detailed-results');
    questions.forEach((q, idx) => {
        const userAnswer = selectedAnswers[idx];
        const isCorrect = userAnswer === q.respuesta;
        
        const resultCard = document.createElement('div');
        resultCard.style.cssText = `
            background: ${isCorrect ? '#e6f4ea' : '#fce8e6'};
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 15px;
            text-align: left;
            border-left: 4px solid ${isCorrect ? '#34a853' : '#ea4335'};
        `;
        
        resultCard.innerHTML = `
            <p style="font-weight: bold; margin-bottom: 8px;">${idx + 1}. ${q.texto || q.explicacion || q.pregunta || 'Pregunta sin texto'}</p>
            <p style="color: #666; font-size: 0.9rem;">
                Tu respuesta: <strong>${userAnswer !== null ? String.fromCharCode(65 + userAnswer) : 'Sin responder'}</strong><br>
                Respuesta correcta: <strong>${String.fromCharCode(65 + q.respuesta)}</strong>
            </p>
        `;
        resultsDiv.appendChild(resultCard);
    });
}

// 8. CRONÓMETRO / CUENTA REGRESIVA
function startTimer() {
    const display = document.getElementById('timer-display');
    const label   = document.getElementById('timer-label');

    if (tiempoLimiteSegundos > 0) {
        // ── CUENTA REGRESIVA ──────────────────────────────────────────
        tiempoRestante = tiempoLimiteSegundos;
        label.style.display = 'block';
        label.textContent = 'Tiempo restante';
        display.style.color = '#1a73e8';

        function actualizarDisplay() {
            const min = Math.floor(tiempoRestante / 60);
            const seg = tiempoRestante % 60;
            display.textContent = `${String(min).padStart(2,'0')}:${String(seg).padStart(2,'0')}`;

            // Alertas visuales según tiempo restante
            if (tiempoRestante <= 60) {
                display.style.color = '#ea4335';    // rojo último minuto
                display.style.animation = 'none';
                if (tiempoRestante % 2 === 0) {     // parpadeo cada 2 seg
                    display.style.opacity = '0.4';
                } else {
                    display.style.opacity = '1';
                }
            } else if (tiempoRestante <= 300) {
                display.style.color = '#f29900';    // naranja últimos 5 min
            } else {
                display.style.color = '#1a73e8';
            }
        }

        actualizarDisplay();

        timerInterval = setInterval(() => {
            tiempoRestante--;
            actualizarDisplay();

            // Avisos en momentos clave
            if (tiempoRestante === 300) {
                Swal.fire({
                    icon: 'warning',
                    title: '⏳ 5 minutos restantes',
                    text: 'Ve terminando tus respuestas.',
                    timer: 3000,
                    showConfirmButton: false,
                    toast: true,
                    position: 'top-end'
                });
            } else if (tiempoRestante === 60) {
                Swal.fire({
                    icon: 'error',
                    title: '🚨 ¡1 minuto!',
                    text: 'El tiempo está por agotarse.',
                    timer: 3000,
                    showConfirmButton: false,
                    toast: true,
                    position: 'top-end'
                });
            } else if (tiempoRestante <= 0) {
                clearInterval(timerInterval);
                display.textContent = '00:00';
                display.style.opacity = '1';
                // Tiempo agotado → finalizar automáticamente
                Swal.fire({
                    icon: 'error',
                    title: '⏰ ¡Tiempo agotado!',
                    text: 'El tiempo límite ha terminado. Se enviarán tus respuestas automáticamente.',
                    confirmButtonColor: '#ea4335',
                    confirmButtonText: 'Ver resultados',
                    allowOutsideClick: false,
                    allowEscapeKey: false
                }).then(() => {
                    finalizarExamen();
                });
            }
        }, 1000);

    } else {
        // ── SIN LÍMITE: ocultar timer completamente ───────────────────
        label.style.display = 'none';
        display.style.display = 'none';
    }
}

function stopTimer() {
    if (timerInterval) clearInterval(timerInterval);
}

// 9. GUARDADO AUTOMÁTICO
function guardarAvanceAutomatico() {
    if (currentMode === "study") {
        localStorage.setItem(`progreso_${currentMateria}`, currentIndex);
    }
}

// 10. CERRAR SESIÓN
document.getElementById('btn-logout').onclick = () => {
    Swal.fire({
        title: 'Cerrar Sesión',
        text: currentMode === "study" ? "Tu progreso ha sido guardado automáticamente y podrás continuar más tarde." : "¿Estás seguro de que deseas cerrar sesión?",
        icon: 'question',
        showCancelButton: true,
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#1a73e8',
        confirmButtonText: 'Aceptar'
    }).then((result) => { 
        if (result.isConfirmed) {
            stopTimer();
            signOut(auth).then(() => location.reload()); 
        }
    });
};

document.getElementById('btn-header-return').onclick = () => {
    Swal.fire({ 
        title: '¿Volver al menú?', 
        text: 'Se guardará tu progreso si estás en modo estudio.', 
        icon: 'warning', 
        showCancelButton: true,
        confirmButtonColor: '#1a73e8'
    }).then((res) => { 
        if(res.isConfirmed) {
            stopTimer();
            location.reload(); 
        }
    });
};

document.getElementById('btn-login').onclick = () => signInWithPopup(auth, provider);
