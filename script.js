import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = { apiKey: "AIzaSyAMQpnPJSdicgo5gungVOE0M7OHwkz4P9Y", authDomain: "autenticacion-8faac.firebaseapp.com", projectId: "autenticacion-8faac", storageBucket: "autenticacion-8faac.firebasestorage.app", appId: "1:939518706600:web:d28c3ec7de21da8379939d" };
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

let currentMateria = "", currentMode = "", questions = [], currentIndex = 0;
let selectedAnswers = []; // Para guardar respuestas
let timerInterval = null;
let startTime = null;

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
                continue; // Intentar siguiente ruta
            }
        }

        if (!data) {
            throw new Error('No se encontró el archivo config-materias.json en ninguna ruta');
        }

        const select = document.getElementById('subject-select');
        const btnStart = document.getElementById('btn-start');

        select.innerHTML = '<option value="">-- Selecciona Materia --</option>';
        data.materias.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.id; 
            opt.textContent = m.nombre;
            select.appendChild(opt);
        });

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
        
        // Mezclar preguntas si es modo examen
        if (currentMode === "exam") {
            questions = questions.sort(() => Math.random() - 0.5).slice(0, 20);
            selectedAnswers = new Array(questions.length).fill(null);
        } else {
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
        const tiempo = document.getElementById('timer-display').textContent;
        
        Swal.fire({
            icon: 'info',
            title: 'Examen Finalizado',
            html: `
                <p style="font-size: 1.1rem; margin: 15px 0;">
                    <strong>Respuestas correctas:</strong> ${correctas} / ${questions.length}<br>
                    <strong>Calificación:</strong> ${porcentaje}%<br>
                    <strong>Tiempo:</strong> ${tiempo}
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

// 8. CRONÓMETRO
function startTimer() {
    startTime = Date.now();
    timerInterval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const minutes = Math.floor(elapsed / 60000);
        const seconds = Math.floor((elapsed % 60000) / 1000);
        document.getElementById('timer-display').textContent = 
            `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }, 1000);
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
        title: '¿Cerrar Sesión?',
        text: currentMode === "study" ? "Tu progreso en esta materia ha sido guardado automáticamente." : "¿Deseas salir del simulador?",
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#1a73e8',
        confirmButtonText: 'Sí, salir'
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
