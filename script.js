import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, collection, getDocs, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ================================================================
// IDENTIFICADOR DE DISPOSITIVO
// ================================================================
function getDeviceId() {
    let id = localStorage.getItem('device_id');
    if (!id) {
        id = 'dev_' + Math.random().toString(36).substr(2, 12) + '_' + Date.now();
        localStorage.setItem('device_id', id);
    }
    return id;
}

const firebaseConfig = { apiKey: "AIzaSyAMQpnPJSdicgo5gungVOE0M7OHwkz4P9Y", authDomain: "autenticacion-8faac.firebaseapp.com", projectId: "autenticacion-8faac", storageBucket: "autenticacion-8faac.firebasestorage.app", appId: "1:939518706600:web:d28c3ec7de21da8379939d" };
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
auth.useDeviceLanguage();
const db = getFirestore(app);
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });

// ================================================================
// MÓDULO DE SEGURIDAD
// ================================================================
let currentUserEmail = "";
let currentUserName = "";
let watermarkElement = null;
let contentHidden = false;

function crearMarcaDeAgua(email) { watermarkElement = email; }

function insertarMarcaEnPregunta(email) {
    const existente = document.getElementById('security-watermark');
    if (existente) existente.remove();
    const wm = document.createElement('div');
    wm.id = 'security-watermark';
    wm.innerText = `© ${email}`;
    wm.style.cssText = `font-size:0.70rem;color:rgba(100,100,100,0.5);font-family:'Courier New',monospace;user-select:none;pointer-events:none;text-align:right;margin-bottom:6px;letter-spacing:0.03em;`;
    const quizScreen = document.getElementById('quiz-screen');
    const questionText = document.getElementById('question-text');
    quizScreen.insertBefore(wm, questionText);
}

async function registrarAcceso(tipo, detalle = {}) {
    if (!currentUserEmail) return;
    try {
        await addDoc(collection(db, "auditoria_accesos"), {
            usuario: currentUserEmail, nombre: currentUserName, tipo,
            timestamp: serverTimestamp(),
            fecha_legible: new Date().toLocaleString('es-EC', { timeZone: 'America/Guayaquil' }),
            ...detalle
        });
    } catch (e) { console.warn("Log de auditoría falló:", e); }
}

let overlayOcultar = null;
let screenShareStream = null;
let screenShareBloqueado = false;

function crearOverlay() {
    if (overlayOcultar) return;
    overlayOcultar = document.createElement('div');
    overlayOcultar.id = 'security-overlay';
    overlayOcultar.style.cssText = `display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:#000;z-index:99999;justify-content:center;align-items:center;flex-direction:column;text-align:center;`;
    document.body.appendChild(overlayOcultar);
}

function mostrarOverlayBloqueador(motivo, esCompartirPantalla = false) {
    if (!overlayOcultar) return;
    const quizVisible = !document.getElementById('quiz-screen').classList.contains('hidden');
    if (!quizVisible) return;
    contentHidden = true;
    const icono = esCompartirPantalla ? '🔴' : '🛡️';
    const titulo = esCompartirPantalla ? 'COMPARTIR PANTALLA BLOQUEADO' : 'CONTENIDO PROTEGIDO';
    const mensaje = esCompartirPantalla ? 'Has intentado compartir esta pantalla.<br>Las preguntas están ocultas hasta que<br><strong>cierres la transmisión.</strong>' : 'Vuelve a esta pestaña para continuar.';
    overlayOcultar.innerHTML = `<div style="max-width:480px;padding:40px;"><div style="font-size:4rem;margin-bottom:20px;">${icono}</div><p style="color:${esCompartirPantalla?'#ff4444':'#ffffff'};font-size:1.8rem;font-weight:900;letter-spacing:0.05em;margin-bottom:16px;">${titulo}</p><p style="color:#aaa;font-size:1rem;line-height:1.7;margin-bottom:28px;">${mensaje}</p><div style="background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.15);border-radius:12px;padding:16px 24px;display:inline-block;"><p style="color:#fff;font-size:0.75rem;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:6px;opacity:0.6;">Sesión identificada como</p><p style="color:#facc15;font-size:1.1rem;font-weight:700;margin:0;">${currentUserName}</p><p style="color:#aaa;font-size:0.85rem;margin:4px 0 0 0;">${currentUserEmail}</p></div>${esCompartirPantalla?'':'<p style="color:#555;font-size:0.8rem;margin-top:28px;">Este evento ha sido registrado</p>'}</div>`;
    overlayOcultar.style.display = 'flex';
    registrarAcceso(esCompartirPantalla ? 'intento_compartir_pantalla' : 'perder_foco', { motivo });
}

function ocultarOverlay() {
    if (!overlayOcultar || screenShareBloqueado) return;
    contentHidden = false;
    overlayOcultar.style.display = 'none';
}

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
                screenShareBloqueado = false; screenShareStream = null; contentHidden = false;
                overlayOcultar.style.display = 'none';
                registrarAcceso('pantalla_compartida_detenida');
                Swal.fire({ icon:'success', title:'Transmisión cerrada', text:'Puedes continuar con el simulador.', timer:3000, showConfirmButton:false, toast:true, position:'top-end' });
            });
        });
        return screenShareStream;
    } catch (err) { throw err; }
};

document.addEventListener('visibilitychange', () => {
    if (document.hidden) mostrarOverlayBloqueador('cambio_pestaña', false);
    else ocultarOverlay();
});
window.addEventListener('blur', () => mostrarOverlayBloqueador('ventana_minimizada', false));
window.addEventListener('focus', () => ocultarOverlay());

document.addEventListener('contextmenu', (e) => {
    if (!document.getElementById('quiz-screen').classList.contains('hidden')) {
        e.preventDefault();
        Swal.fire({ icon:'warning', title:'Acción Restringida', text:'El clic derecho está deshabilitado durante el simulador.', timer:2000, showConfirmButton:false });
    }
});

document.addEventListener('keydown', (e) => {
    if (document.getElementById('quiz-screen').classList.contains('hidden')) return;
    if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && ['I','J','C'].includes(e.key)) || (e.ctrlKey && e.key === 'u')) {
        e.preventDefault(); registrarAcceso('intento_inspeccionar', { tecla: e.key });
    }
    if (e.key === 'PrintScreen') {
        registrarAcceso('intento_captura_pantalla');
        if (navigator.clipboard?.writeText) navigator.clipboard.writeText('').catch(() => {});
    }
});

// ================================================================
const ADMIN_EMAIL = "kholguinb2@unemi.edu.ec";
let currentMateria = "", currentMode = "", questions = [], currentIndex = 0;
let selectedAnswers = [], timerInterval = null, tiempoLimiteSegundos = 0, tiempoRestante = 0;

// ================================================================
// 1. MANEJO DE SESIÓN
// ================================================================
let sesionInicializada = false;

onAuthStateChanged(auth, async (user) => {
    const adminLinkContainer = document.getElementById('admin-link-container');

    if (user) {
        if (sesionInicializada) return;
        sesionInicializada = true;

        const userEmail = user.email.toLowerCase();
        const displayName = user.displayName || userEmail;
        const esAdminUser = userEmail === ADMIN_EMAIL;

        let userData = null;
        if (!esAdminUser) {
            try {
                const userDoc = await getDoc(doc(db, "usuarios_seguros", userEmail));
                if (!userDoc.exists()) {
                    sesionInicializada = false;
                    await Swal.fire({ icon:'error', title:'Acceso Denegado', text:'No tienes autorización para usar este simulador. Contacta al administrador.', confirmButtonText:'Entendido' });
                    signOut(auth); return;
                }
                userData = userDoc.data();
            } catch (error) {
                sesionInicializada = false;
                const resultado = await Swal.fire({ icon:'warning', title:'Error de conexión', text:'No se pudo verificar tu acceso. ¿Deseas intentar de nuevo?', confirmButtonText:'Reintentar', cancelButtonText:'Cerrar sesión', showCancelButton:true, confirmButtonColor:'#1a73e8' });
                if (resultado.isConfirmed) location.reload();
                else signOut(auth);
                return;
            }
        }

        if (!esAdminUser && userData) {
            const maxDispositivos = userData.max_dispositivos || 2;
            const dispositivosActivos = userData.dispositivos || {};
            const deviceId = getDeviceId();
            if (!dispositivosActivos[deviceId]) {
                const cantidadActual = Object.keys(dispositivosActivos).length;
                if (cantidadActual >= maxDispositivos) {
                    sesionInicializada = false;
                    await Swal.fire({ icon:'error', title:'Límite de dispositivos alcanzado', html:`Tu cuenta permite acceder desde <strong>${maxDispositivos}</strong> dispositivo(s).<br>Ya tienes <strong>${cantidadActual}</strong> registrado(s).<br><br>Contacta al administrador para restablecer tus dispositivos.`, confirmButtonText:'Entendido', confirmButtonColor:'#ea4335' });
                    signOut(auth); return;
                }
                const nuevosDisp = { ...dispositivosActivos };
                nuevosDisp[deviceId] = { registrado: new Date().toLocaleString('es-EC', { timeZone:'America/Guayaquil' }), userAgent: navigator.userAgent.substring(0, 100) };
                try { await updateDoc(doc(db, "usuarios_seguros", userEmail), { dispositivos: nuevosDisp }); }
                catch(e) { console.warn('No se pudo registrar dispositivo:', e); }
            }
        }

        currentUserEmail = userEmail;
        currentUserName = displayName;
        crearMarcaDeAgua(userEmail);
        crearOverlay();
        registrarAcceso('inicio_sesion');

        const maxDisp = userData?.max_dispositivos || 2;
        document.getElementById('auth-screen').classList.add('hidden');
        document.getElementById('setup-screen').classList.remove('hidden');
        document.getElementById('user-display').classList.remove('hidden');
        document.getElementById('user-info').innerText = displayName.split(' ')[0].toUpperCase();

        const welcomeName = document.getElementById('user-welcome-name');
        const welcomeSub = document.getElementById('user-welcome-sub');
        if (welcomeName) welcomeName.innerText = displayName.toUpperCase();
        if (welcomeSub) welcomeSub.innerText = `${userEmail} · ${maxDisp} dispositivo${maxDisp !== 1 ? 's' : ''}`;

        if (esAdminUser) { adminLinkContainer.classList.remove('hidden'); adminLinkContainer.style.display = 'block'; }
        else { adminLinkContainer.classList.add('hidden'); adminLinkContainer.style.display = 'none'; }

        cargarMaterias();

    } else {
        sesionInicializada = false;
        document.getElementById('auth-screen').classList.remove('hidden');
        document.getElementById('setup-screen').classList.add('hidden');
        document.getElementById('user-display').classList.add('hidden');
        if (adminLinkContainer) { adminLinkContainer.classList.add('hidden'); adminLinkContainer.style.display = 'none'; }
    }
});

// ================================================================
// 2. CARGAR MATERIAS
// ================================================================

// Materias por defecto (fallback si el JSON no carga)
const MATERIAS_DEFAULT = [
    { id: "comp-forense",   nombre: "Computación Forense",        activa: true },
    { id: "deontologia",    nombre: "Deontología",                 activa: true },
    { id: "auditoria-ti",   nombre: "Auditoría de TI",             activa: true },
    { id: "emprendimiento", nombre: "Emprendimiento e Innovación", activa: true },
    { id: "ia",             nombre: "Inteligencia Artificial",     activa: true },
    { id: "practicas-1",    nombre: "Prácticas Laborales 1",       activa: true }
];

async function cargarMaterias() {
    try {
        let data = null;

        // Intentar cargar el JSON con rutas relativas al script
        const rutasBase = [
            'config-materias.json',
            './config-materias.json',
            // Ruta relativa al subfolder del repositorio en GitHub Pages
            `${location.pathname.replace(/\/[^/]*$/, '')}/config-materias.json`
        ];
        for (const ruta of rutasBase) {
            try {
                const res = await fetch(ruta);
                if (res.ok) { data = await res.json(); break; }
            } catch(e) { continue; }
        }

        // Si no se pudo cargar el JSON, usar el fallback sin lanzar error
        if (!data) {
            data = { materias: MATERIAS_DEFAULT };
        }

        let materiasVisibles = data.materias.filter(m => m.activa);
        if (currentUserEmail !== ADMIN_EMAIL) {
            try {
                const userDoc = await getDoc(doc(db, "usuarios_seguros", currentUserEmail));
                if (userDoc.exists()) {
                    const ud = userDoc.data();
                    if (ud.rol !== 'admin' && ud.materias && ud.materias.length > 0)
                        materiasVisibles = materiasVisibles.filter(m => ud.materias.includes(m.id));
                }
            } catch(e) { console.error('Error obteniendo rol:', e); }
        }

        const select = document.getElementById('subject-select');
        const btnStart = document.getElementById('btn-start');
        select.innerHTML = '<option value="">-- Selecciona Materia --</option>';
        materiasVisibles.forEach(m => { const opt = document.createElement('option'); opt.value = m.id; opt.textContent = m.nombre; select.appendChild(opt); });

        if (materiasVisibles.length === 0) { select.innerHTML = '<option value="">Sin materias asignadas</option>'; btnStart.disabled = true; btnStart.textContent = "Sin acceso a materias"; return; }

        select.onchange = () => {
            if (select.value === "") { btnStart.disabled = true; btnStart.textContent = "Selecciona una materia"; btnStart.style.opacity = "0.5"; }
            else { btnStart.disabled = false; btnStart.textContent = "Iniciar"; btnStart.style.opacity = "1"; }
        };

        const modeSelect = document.getElementById('mode-select');
        const cantidadContainer = document.getElementById('cantidad-container');
        const opcionSinLimite = document.getElementById('opcion-sin-limite');
        const tiempoSelect = document.getElementById('tiempo-select');
        modeSelect.onchange = () => {
            if (modeSelect.value === 'study') { opcionSinLimite.style.display = ''; cantidadContainer.style.display = 'block'; }
            else { opcionSinLimite.style.display = 'none'; cantidadContainer.style.display = 'none'; if (tiempoSelect.value === '0') tiempoSelect.value = '20'; }
        };
    } catch (error) {
        Swal.fire({ icon:'error', title:'Error', html:`<p>No se pudo cargar la lista de materias.</p><p style="font-size:0.8rem;color:#999;">${error.message}</p>`, confirmButtonColor:'#1a73e8' });
    }
}

// ================================================================
// 3. INICIAR
// ================================================================
document.getElementById('btn-start').onclick = async () => {
    currentMateria = document.getElementById('subject-select').value;
    currentMode = document.getElementById('mode-select').value;
    tiempoLimiteSegundos = (parseInt(document.getElementById('tiempo-select').value) || 0) * 60;

    try {
        const snap = await getDocs(collection(db, `bancos_preguntas/${currentMateria}/preguntas`));
        if (snap.empty) { Swal.fire({ icon:'info', title:'Aviso', text:'No existen preguntas cargadas para esta materia.', confirmButtonColor:'#1a73e8' }); return; }

        questions = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort(() => Math.random() - 0.5);
        if (currentMode === "exam") { questions = questions.slice(0, 20); selectedAnswers = new Array(questions.length).fill(null); }
        else { const ce = document.getElementById('cantidad-select')?.value || '20'; if (ce !== 'todas') questions = questions.slice(0, 20); selectedAnswers = new Array(questions.length).fill(null); }

        if (currentMode === "study") {
            let savedIndex = 0;
            try { const pd = await getDoc(doc(db, "progreso_estudio", `${currentUserEmail}_${currentMateria}`)); if (pd.exists()) savedIndex = pd.data().indice || 0; } catch(e) {}
            if (savedIndex > 0) {
                const result = await Swal.fire({ title:'Avance Detectado', html:`Tienes <strong>${savedIndex} pregunta${savedIndex!==1?'s':''}</strong> completada${savedIndex!==1?'s':''} en esta materia.<br><small style="color:#888">Sincronizado entre todos tus dispositivos</small>`, icon:'question', showCancelButton:true, confirmButtonText:'Retomar avance', cancelButtonText:'Empezar de cero' });
                currentIndex = result.isConfirmed ? savedIndex : 0;
                if (!result.isConfirmed) { try { await setDoc(doc(db, "progreso_estudio", `${currentUserEmail}_${currentMateria}`), { indice:0, actualizado:serverTimestamp() }); } catch(e) {} }
            } else { currentIndex = 0; }
            startTimer();
        } else { currentIndex = 0; startTimer(); }

        document.getElementById('setup-screen').classList.add('hidden');
        document.getElementById('quiz-screen').classList.remove('hidden');
        document.getElementById('btn-header-return').classList.add('hidden');
        renderQuestion();
    } catch (error) {
        Swal.fire({ icon:'error', title:'Error', text:'Hubo un problema al cargar las preguntas. Por favor, intenta de nuevo.' });
    }
};

// ================================================================
// 4. RENDERIZAR PREGUNTA
// ================================================================
function renderQuestion() {
    if (currentIndex >= questions.length) { finalizarExamen(); return; }
    const question = questions[currentIndex];
    const questionText = document.getElementById('question-text');
    const optionsContainer = document.getElementById('options-container');

    registrarAcceso('ver_pregunta', { materia:currentMateria, modo:currentMode, pregunta_num:currentIndex+1, pregunta_id:question.id, pregunta_texto:(question.texto||'').substring(0,80) });
    insertarMarcaEnPregunta(currentUserEmail);
    questionText.textContent = `${currentIndex + 1}. ${question.texto || question.explicacion || question.pregunta || 'Pregunta sin texto'}`;
    optionsContainer.innerHTML = '';

    const menuButton = document.createElement('button');
    menuButton.className = 'btn-back-menu';
    menuButton.innerHTML = '<i class="fas fa-home"></i> Volver al Menú';
    menuButton.onclick = () => Swal.fire({ title:'¿Volver al menú?', text:currentMode==="study"?'Tu progreso se guardará automáticamente.':'Perderás el progreso de este examen.', icon:'warning', showCancelButton:true, confirmButtonColor:'#1a73e8', confirmButtonText:'Sí, volver' }).then(res => { if(res.isConfirmed) { stopTimer(); location.reload(); } });
    optionsContainer.appendChild(menuButton);

    if (!question.opciones || !Array.isArray(question.opciones)) { optionsContainer.innerHTML += '<p style="color:red;">Error: Esta pregunta no tiene opciones válidas.</p>'; return; }

    const yaRespondida = selectedAnswers[currentIndex] !== null;
    question.opciones.forEach((opcion, index) => {
        const button = document.createElement('button');
        button.className = 'option-button';
        button.innerHTML = `<span class="option-letter">${String.fromCharCode(65 + index)}</span> ${opcion}`;
        if (currentMode === "study" && yaRespondida) {
            button.disabled = true;
            if (index === question.respuesta) button.classList.add('correct');
            else if (index === selectedAnswers[currentIndex]) button.classList.add('incorrect');
        } else if (selectedAnswers[currentIndex] === index) button.classList.add('selected');
        button.onclick = () => selectAnswer(index);
        optionsContainer.appendChild(button);
    });

    if (currentMode === "study" && yaRespondida) optionsContainer.appendChild(crearFeedbackBox(question, selectedAnswers[currentIndex]));

    const navDiv = document.createElement('div');
    navDiv.style.cssText = 'display:flex;justify-content:space-between;margin-top:25px;gap:10px;';
    if (currentIndex > 0) {
        const btnPrev = document.createElement('button');
        btnPrev.className = 'btn-secondary';
        btnPrev.innerHTML = '<i class="fas fa-arrow-left"></i> Anterior';
        btnPrev.onclick = () => { currentIndex--; renderQuestion(); guardarAvanceAutomatico(); };
        navDiv.appendChild(btnPrev);
    }
    const btnNext = document.createElement('button');
    btnNext.className = 'btn-primary';
    btnNext.style.cssText = 'margin-left:auto;';
    if (currentIndex === questions.length - 1) { btnNext.textContent = 'Finalizar'; btnNext.onclick = finalizarExamen; }
    else {
        btnNext.innerHTML = 'Siguiente <i class="fas fa-arrow-right"></i>';
        btnNext.onclick = () => {
            if (selectedAnswers[currentIndex] === null && currentMode === "exam") {
                Swal.fire({ icon:'warning', title:'Pregunta sin responder', text:'¿Deseas continuar sin responder?', showCancelButton:true, confirmButtonText:'Sí, continuar' }).then(r => { if(r.isConfirmed) { currentIndex++; renderQuestion(); guardarAvanceAutomatico(); } });
            } else { currentIndex++; renderQuestion(); guardarAvanceAutomatico(); }
        };
    }
    navDiv.appendChild(btnNext);
    optionsContainer.appendChild(navDiv);
}

// ================================================================
// 5. SELECCIONAR RESPUESTA
// ================================================================
function selectAnswer(optionIndex) {
    const buttons = document.querySelectorAll('.option-button');
    if (currentMode === "study") {
        const question = questions[currentIndex];
        buttons.forEach((btn, idx) => { btn.disabled = true; if (idx === question.respuesta) btn.classList.add('correct'); else if (idx === optionIndex) btn.classList.add('incorrect'); });
        selectedAnswers[currentIndex] = optionIndex;
        const optionsContainer = document.getElementById('options-container');
        const existingFeedback = document.getElementById('feedback-box');
        if (existingFeedback) existingFeedback.remove();
        const fb = crearFeedbackBox(question, optionIndex);
        const navButtons = optionsContainer.querySelector('div[style*="justify-content"]');
        if (navButtons) optionsContainer.insertBefore(fb, navButtons); else optionsContainer.appendChild(fb);
    } else {
        buttons.forEach(btn => btn.classList.remove('selected'));
        buttons[optionIndex].classList.add('selected');
        selectedAnswers[currentIndex] = optionIndex;
    }
}

function crearFeedbackBox(question, userAnswer) {
    const correct = question.respuesta;
    const fb = document.createElement('div');
    fb.id = 'feedback-box';
    fb.style.cssText = `margin-top:20px;padding:15px;border-radius:8px;text-align:left;background:${userAnswer===correct?'#e6f4ea':'#fce8e6'};border-left:4px solid ${userAnswer===correct?'#34a853':'#ea4335'};`;
    if (userAnswer === correct) fb.innerHTML = `<p style="font-weight:bold;color:#34a853;margin-bottom:8px;"><i class="fas fa-check-circle"></i> ¡Correcto!</p><p style="color:#555;font-size:0.95rem;">${question.explicacion_correcta||'¡Excelente trabajo!'}</p>`;
    else fb.innerHTML = `<p style="font-weight:bold;color:#ea4335;margin-bottom:8px;"><i class="fas fa-times-circle"></i> Incorrecto</p><p style="color:#555;font-size:0.95rem;margin-bottom:8px;">La respuesta correcta es: <strong>${String.fromCharCode(65+correct)}) ${question.opciones[correct]}</strong></p><p style="color:#666;font-size:0.9rem;">${question.explicacion_correcta||'Revisa el material de estudio.'}</p>`;
    return fb;
}

// ================================================================
// 6. FINALIZAR
// ================================================================
function finalizarExamen() {
    stopTimer();
    if (currentMode === "exam") {
        let correctas = 0;
        questions.forEach((q, idx) => { if (selectedAnswers[idx] === q.respuesta) correctas++; });
        const porcentaje = ((correctas / questions.length) * 100).toFixed(1);
        let tiempoTexto = tiempoLimiteSegundos > 0
            ? `${String(Math.floor((tiempoLimiteSegundos-tiempoRestante)/60)).padStart(2,'0')}:${String((tiempoLimiteSegundos-tiempoRestante)%60).padStart(2,'0')} de ${tiempoLimiteSegundos/60} min`
            : document.getElementById('timer-display').textContent;
        Swal.fire({ icon:'info', title:'Examen Finalizado', html:`<p style="font-size:1.1rem;margin:15px 0;"><strong>Respuestas correctas:</strong> ${correctas} / ${questions.length}<br><strong>Calificación:</strong> ${porcentaje}%<br><strong>Tiempo:</strong> ${tiempoTexto}</p>`, confirmButtonColor:'#1a73e8', confirmButtonText:'Ver Resultados Detallados' }).then(() => mostrarResultadosDetallados(correctas));
    } else {
        Swal.fire({ icon:'success', title:'¡Sesión Completada!', text:'Has terminado todas las preguntas de estudio.', confirmButtonColor:'#1a73e8' }).then(async () => {
            try { await setDoc(doc(db, "progreso_estudio", `${currentUserEmail}_${currentMateria}`), { indice:0, actualizado:serverTimestamp() }); } catch(e) {}
            location.reload();
        });
    }
}

// ================================================================
// 7. RESULTADOS DETALLADOS
// ================================================================
function mostrarResultadosDetallados(correctas) {
    const container = document.getElementById('quiz-screen');
    container.innerHTML = `<h2 style="color:#1a73e8;margin-bottom:20px;">Resultados Detallados</h2><div style="text-align:center;margin-bottom:30px;"><div style="font-size:3rem;color:${correctas>=questions.length*0.7?'#34a853':'#ea4335'};">${((correctas/questions.length)*100).toFixed(1)}%</div><p style="color:#666;">Correctas: ${correctas} / ${questions.length}</p></div><div id="detailed-results"></div><button onclick="location.reload()" class="btn-primary" style="margin-top:20px;">Volver al Menú</button>`;
    const resultsDiv = document.getElementById('detailed-results');
    questions.forEach((q, idx) => {
        const ua = selectedAnswers[idx]; const ic = ua === q.respuesta;
        const card = document.createElement('div');
        card.style.cssText = `background:${ic?'#e6f4ea':'#fce8e6'};padding:15px;border-radius:8px;margin-bottom:15px;text-align:left;border-left:4px solid ${ic?'#34a853':'#ea4335'};`;
        card.innerHTML = `<p style="font-weight:bold;margin-bottom:8px;">${idx+1}. ${q.texto||q.pregunta||'Pregunta sin texto'}</p><p style="color:#666;font-size:0.9rem;">Tu respuesta: <strong>${ua!==null?String.fromCharCode(65+ua):'Sin responder'}</strong><br>Respuesta correcta: <strong>${String.fromCharCode(65+q.respuesta)}</strong></p>`;
        resultsDiv.appendChild(card);
    });
}

// ================================================================
// 8. CRONÓMETRO
// ================================================================
function startTimer() {
    const display = document.getElementById('timer-display');
    const label = document.getElementById('timer-label');
    if (tiempoLimiteSegundos > 0) {
        tiempoRestante = tiempoLimiteSegundos;
        label.style.display = 'block'; label.textContent = 'Tiempo restante';
        display.style.display = 'block';
        function actualizarDisplay() {
            display.textContent = `${String(Math.floor(tiempoRestante/60)).padStart(2,'0')}:${String(tiempoRestante%60).padStart(2,'0')}`;
            if (tiempoRestante <= 60) { display.style.color = '#ea4335'; display.style.opacity = tiempoRestante%2===0?'0.4':'1'; }
            else if (tiempoRestante <= 300) display.style.color = '#f29900';
            else display.style.color = '#1a73e8';
        }
        actualizarDisplay();
        timerInterval = setInterval(() => {
            tiempoRestante--; actualizarDisplay();
            if (tiempoRestante === 300) Swal.fire({ icon:'warning', title:'⏳ 5 minutos restantes', text:'Ve terminando tus respuestas.', timer:3000, showConfirmButton:false, toast:true, position:'top-end' });
            else if (tiempoRestante === 60) Swal.fire({ icon:'error', title:'🚨 ¡1 minuto!', text:'El tiempo está por agotarse.', timer:3000, showConfirmButton:false, toast:true, position:'top-end' });
            else if (tiempoRestante <= 0) {
                clearInterval(timerInterval); display.textContent = '00:00'; display.style.opacity = '1';
                Swal.fire({ icon:'error', title:'⏰ ¡Tiempo agotado!', text:'El tiempo límite ha terminado. Se enviarán tus respuestas automáticamente.', confirmButtonColor:'#ea4335', confirmButtonText:'Ver resultados', allowOutsideClick:false, allowEscapeKey:false }).then(() => finalizarExamen());
            }
        }, 1000);
    } else { label.style.display = 'none'; display.style.display = 'none'; }
}

function stopTimer() { if (timerInterval) clearInterval(timerInterval); }

// ================================================================
// 9. GUARDADO AUTOMÁTICO EN FIRESTORE
// ================================================================
function guardarAvanceAutomatico() {
    if (currentMode === "study" && currentUserEmail) {
        setDoc(doc(db, "progreso_estudio", `${currentUserEmail}_${currentMateria}`), {
            indice: currentIndex, materia: currentMateria, usuario: currentUserEmail, actualizado: serverTimestamp()
        }).catch(e => console.warn("No se pudo guardar progreso:", e));
    }
}

// ================================================================
// 10. EVENTOS DE BOTONES
// ================================================================
document.getElementById('btn-logout').onclick = () => {
    Swal.fire({ title:'Cerrar Sesión', text:currentMode==="study"?"Tu progreso ha sido guardado y podrás continuar más tarde.":"¿Estás seguro de que deseas cerrar sesión?", icon:'question', showCancelButton:true, cancelButtonText:'Cancelar', confirmButtonColor:'#1a73e8', confirmButtonText:'Aceptar' })
    .then(result => { if (result.isConfirmed) { stopTimer(); signOut(auth).then(() => location.reload()); } });
};

document.getElementById('btn-header-return').onclick = () => {
    Swal.fire({ title:'¿Volver al menú?', text:'Se guardará tu progreso si estás en modo estudio.', icon:'warning', showCancelButton:true, confirmButtonColor:'#1a73e8' })
    .then(res => { if(res.isConfirmed) { stopTimer(); location.reload(); } });
};

// Login con Popup — más confiable que Redirect en GitHub Pages y móviles
document.getElementById('btn-login').onclick = () => {
    const btn = document.getElementById('btn-login');
    btn.textContent = 'Conectando...';
    btn.disabled = true;
    signInWithPopup(auth, provider).catch(err => {
        console.error('Error al iniciar sesión:', err);
        btn.textContent = 'Acceder con Google';
        btn.disabled = false;
        if (err.code !== 'auth/popup-closed-by-user') {
            Swal.fire({ icon:'error', title:'Error al iniciar sesión', html:`Código: <code>${err.code}</code><br><small>${err.message}</small>`, confirmButtonText:'Entendido' });
        }
    });
};
