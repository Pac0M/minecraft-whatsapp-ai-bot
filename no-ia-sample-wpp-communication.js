const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { exec } = require('child_process');
const fs = require('fs');
const readline = require('readline');

// CONFIGURACIÓN 
const config = {
    // Datos de RCON 
    rcon: {
        password: "RCONXDSECRETOAA250PPenn",  
        port: 25575,                           
        host: "localhost"                        
    },
    
    // Ruta al archivo de log de Minecraft
    minecraft: {
        logPath: "/home/ubuntu/logs/latest.log",  
        tuNombre: "BOT-CHAMOY"  
    },
    
    // Opciones de WhatsApp
    whatsapp: {
        grupoNombre: "Minecraft"  // 🎯 NOMBRE DEL GRUPO
    }
};

// SISTEMA DE ENCUESTAS AUTOMÁTICAS
let encuestaActiva = null;
let opcionesEncuesta = [];
let votosEncuesta = new Map();
let votantesEncuesta = new Set();
let temporizadorEncuesta = null;

// ========== NUEVOS EVENTOS PERSONALIZADOS ==========
const eventosPosibles = [
    { 
        nombre: "💎 1 Diamante para todos", 
        tipo: "diamante",
        emoji: "💎",
        generarComando: function() {
            return `/give @a minecraft:diamond 1`;
        }
    },
    { 
        nombre: "🔩 30 Hierro para todos", 
        tipo: "hierro",
        emoji: "🔩",
        generarComando: function() {
            return `/give @a minecraft:iron_ingot 30`;
        }
    },
    { 
        nombre: "🍎 5 Manzanas Doradas", 
        tipo: "manzanas",
        emoji: "🍎",
        generarComando: function() {
            return `/give @a minecraft:golden_apple 5`;
        }
    },
    { 
        nombre: "🍗 Kit de Comida Básico", 
        tipo: "comida",
        emoji: "🍗",
        generarComando: function() {
            // Kit de comida: pan, carne, pescado, zanahorias, patatas
            return `/give @a minecraft:bread 10 & /give @a minecraft:cooked_beef 5 & /give @a minecraft:cooked_cod 5 & /give @a minecraft:carrot 10 & /give @a minecraft:baked_potato 10`;
        }
    },
    { 
        nombre: "💀 Muerte Aleatoria", 
        tipo: "muerte",
        emoji: "💀",
        generarComando: function() {
            return "muerte_aleatoria"; // Comando especial que se maneja en activarEvento
        }
    },
    { 
        nombre: "❌ Ningún evento", 
        tipo: "none",
        emoji: "❌",
        generarComando: function() {
            return "none";
        }
    }
];

// FUNCIÓN PARA EJECUTAR COMANDO RCON (SINCRÓNICA)
function ejecutarRCON(comando) {
    return new Promise((resolve) => {
        const comandoCompleto = `/usr/local/bin/mcrcon -H ${config.rcon.host} -P ${config.rcon.port} -p "${config.rcon.password}" "${comando}"`;
        
        exec(comandoCompleto, (error, stdout, stderr) => {
            if (error) {
                console.error(`❌ Error RCON: ${error.message}`);
                resolve({ error, stdout, stderr });
                return;
            }
            if (stderr) {
                console.log(`⚠️ RCON stderr: ${stderr}`);
            }
            resolve({ error, stdout, stderr });
        });
    });
}

// FUNCIÓN PARA EJECUTAR MÚLTIPLES COMANDOS (para el kit de comida)
async function ejecutarMultiplesComandos(comandoComplejo) {
    if (comandoComplejo.includes('&')) {
        const comandos = comandoComplejo.split('&').map(cmd => cmd.trim());
        for (const cmd of comandos) {
            await ejecutarRCON(cmd);
            // Pequeña pausa para no saturar
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    } else {
        await ejecutarRCON(comandoComplejo);
    }
}

// FUNCIÓN PARA MATAR UN JUGADOR ALEATORIO
async function matarJugadorAleatorio() {
    console.log("💀 Buscando jugador para matar aleatoriamente...");
    
    const jugadores = await new Promise((resolve) => {
        obtenerJugadoresOnlineRaw((j) => resolve(j));
    });
    
    if (!jugadores || jugadores.length === 0) {
        console.log("❌ No hay jugadores online para matar!");
        await ejecutarRCON(`say §c❌ No hay jugadores online para la muerte aleatoria!`);
        return false;
    }
    
    // Seleccionar un jugador aleatorio
    const indiceAleatorio = Math.floor(Math.random() * jugadores.length);
    const jugadorElegido = jugadores[indiceAleatorio];
    
    console.log(`💀 Jugador elegido para morir: ${jugadorElegido}`);
    
    // Matar al jugador
    await ejecutarRCON(`say §c💀 §l¡MUERTE ALEATORIA! §r§c${jugadorElegido} ha sido elegido...`);
    await new Promise(resolve => setTimeout(resolve, 1000));
    await ejecutarRCON(`kill ${jugadorElegido}`);
    await ejecutarRCON(`say §c☠️ ${jugadorElegido} ha sido sacrificado por el destino!`);
    
    return true;
}

// FUNCIÓN PARA OBTENER JUGADORES ONLINE (formato raw)
function obtenerJugadoresOnlineRaw(callback) {
    const comando = `/usr/local/bin/mcrcon -H ${config.rcon.host} -P ${config.rcon.port} -p "${config.rcon.password}" "list"`;
    
    exec(comando, (error, stdout) => {
        if (error || !stdout) {
            callback([]);
            return;
        }
        
        const match = stdout.match(/There are \d+ of a max of \d+ players online:?(.*)/i);
        if (match && match[1]) {
            const jugadores = match[1].trim().split(',').map(j => j.trim()).filter(j => j.length > 0);
            callback(jugadores);
        } else {
            callback([]);
        }
    });
}

// FUNCIÓN PARA OBTENER JUGADORES ONLINE VÍA RCON
function obtenerJugadoresOnline(callback) {
    const comando = `/usr/local/bin/mcrcon -H ${config.rcon.host} -P ${config.rcon.port} -p "${config.rcon.password}" "list"`;
    
    exec(comando, (error, stdout, stderr) => {
        if (error) {
            callback("❌ Error conectando al servidor");
            return;
        }
        if (stderr) {
            if (stdout) {
            } else {
                callback("⚠️ Error en la consulta");
                return;
            }
        }
        
        const match = stdout.match(/There are (\d+) of a max of (\d+) players online:?(.*)/i);
        
        if (match) {
            const cantidad = match[1];
            const max = match[2];
            let jugadores = match[3].trim();
            
            if (cantidad === "0" || jugadores === "") {
                callback(`🟡 0/${max} jugadores online`);
            } else {
                callback(`🟢 ${cantidad}/${max} jugadores: ${jugadores}`);
            }
        } else {
            callback(`📊 ${stdout.trim()}`);
        }
    });
}

// FUNCIÓN PARA VERIFICAR ESTADO DEL SERVIDOR
function verificarEstadoServidor(callback) {
    const comando = `/usr/local/bin/mcrcon -H ${config.rcon.host} -P ${config.rcon.port} -p "${config.rcon.password}" "list"`;
    
    exec(comando, (error, stdout, stderr) => {
        if (error) {
            callback("🔴 Servidor APAGADO");
            return;
        }
        
        const match = stdout.match(/There are (\d+) of a max of (\d+) players online:?(.*)/i);
        
        if (match) {
            const cantidad = match[1];
            const max = match[2];
            let jugadores = match[3].trim();
            
            if (cantidad === "0" || jugadores === "") {
                callback(`🟢 Servidor ONLINE\n👥 0/${max} jugadores`);
            } else {
                callback(`🟢 Servidor ONLINE\n👥 ${cantidad}/${max} jugadores:\n${jugadores.split(',').map(j => `   👤 ${j.trim()}`).join('\n')}`);
            }
        } else {
            callback(`🟢 Servidor ONLINE\n📊 ${stdout.trim()}`);
        }
    });
}

function hacerBackupLog() {
    try {
        if (fs.existsSync(config.minecraft.logPath)) {
            const ahora = new Date();
            const fechaBackup = ahora.toISOString().replace(/:/g, '-').split('.')[0];
            const backupPath = `/home/ubuntu/logs/latest_${fechaBackup}.log`;
            
            // Copiar el archivo actual a backup
            fs.copyFileSync(config.minecraft.logPath, backupPath);
            console.log(`📋 Backup del log guardado: ${backupPath}`);
            
            // Truncar el archivo original (vaciar para empezar nuevo)
            fs.writeFileSync(config.minecraft.logPath, '');
            console.log("🧹 Archivo latest.log vaciado para nueva sesión");
            
            return backupPath;
        }
    } catch (error) {
        console.error("❌ Error haciendo backup del log:", error);
        return null;
    }
}

console.log("🚀 Iniciando bot WhatsApp <-> Minecraft...");
console.log("📁 Leyendo logs de: " + config.minecraft.logPath);

// Verificar que el archivo de log existe
if (!fs.existsSync(config.minecraft.logPath)) {
    console.error("❌ ERROR: No se encuentra el archivo de log:");
    console.error("   " + config.minecraft.logPath);
    console.error("   Revisa la ruta en la configuración");
    process.exit(1);
}

// Hacer backup antes de empezar
const backupRealizado = hacerBackupLog();

// Crear el cliente de WhatsApp VERSIÓN MEJORADA
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { 
        headless: true,
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage', 
            '--disable-accelerated-2d-canvas',
            '--disable-gpu' 
        ]
    },
    takeoverOnConflict: true,
    takeoverTimeoutMs: 0
});

// FUNCIÓN PARA ENVIAR MENSAJES A MINECRAFT (vía RCON)
function enviarAMinecraft(usuario, mensaje) {
    console.log(`📤 Enviando a Minecraft: <${usuario}> ${mensaje}`);
    
    const mensajeEscapado = mensaje.replace(/"/g, '\\"');
    
    const comando = `/usr/local/bin/mcrcon -H ${config.rcon.host} -P ${config.rcon.port} -p "${config.rcon.password}" "tellraw @a {\\"text\\":\\"[WhatsApp] <${usuario}> ${mensajeEscapado}\\",\\"color\\":\\"green\\"}"`;
    
    exec(comando, (error, stdout, stderr) => {
        if (error) {
            console.error(`❌ Error enviando a Minecraft: ${error.message}`);
            return;
        }
        if (stderr) {
            console.error(`⚠️ Advertencia RCON: ${stderr}`);
            return;
        }
        console.log(`✅ Mensaje enviado a Minecraft (tellraw)`);
    });
}

// FUNCIÓN PARA ENVIAR MENSAJES DE INICIO AL GRUPO
async function enviarMensajeInicio() {
    try {
        const ahora = new Date();
        const fecha = ahora.toLocaleDateString('es-AR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
        const hora = ahora.toLocaleTimeString('es-AR', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        
        let mensajeInicio = `🤖 BOT-INICIADO (hecho por la mama del) ${fecha} ${hora}`;
        
        if (backupRealizado) {
            mensajeInicio += ` - Log anterior guardado`;
        }
        
        const chats = await client.getChats();
        for (const chat of chats) {
            if (chat.isGroup && chat.name === config.whatsapp.grupoNombre) {
                await chat.sendMessage(mensajeInicio);
                console.log(`✅ Mensaje de inicio enviado a: ${chat.name}`);
                return;
            }
        }
        
        console.log(`❌ No se encontró el grupo "${config.whatsapp.grupoNombre}" para mensaje de inicio`);
        
    } catch (error) {
        console.error("❌ Error enviando mensaje de inicio:", error);
    }
}

// FUNCIÓN PARA ENVIAR MENSAJES DE JUGADORES A WHATSAPP
async function enviarAWhatsapp(jugador, mensaje) {
    try {
        console.log(`📥 Intentando enviar a WhatsApp: <${jugador}> ${mensaje}`);
        
        const chats = await client.getChats();
        for (const chat of chats) {
            if (chat.isGroup && chat.name === config.whatsapp.grupoNombre) {
                await chat.sendMessage(`⛏️ [Minecraft] <${jugador}> ${mensaje}`);
                console.log(`✅ Mensaje de jugador enviado a grupo: ${chat.name}`);
                return;
            }
        }
        
        console.log(`❌ No se encontró el grupo "${config.whatsapp.grupoNombre}"`);
        console.log("   Grupos disponibles:");
        for (const chat of chats) {
            if (chat.isGroup) {
                console.log(`   - ${chat.name}`);
            }
        }
        
    } catch (error) {
        console.error("❌ Error enviando a WhatsApp:", error);
    }
}

// FUNCIÓN PARA ENVIAR MENSAJES DE PANEL A WHATSAPP
async function enviarPanelAWhatsapp(mensaje) {
    try {
        console.log(`📥 Enviando mensaje del panel a WhatsApp: ${mensaje}`);
        
        const chats = await client.getChats();
        for (const chat of chats) {
            if (chat.isGroup && chat.name === config.whatsapp.grupoNombre) {
                await chat.sendMessage(`🖥️ [Panel] ${mensaje}`);
                console.log(`✅ Mensaje del panel enviado a grupo: ${chat.name}`);
                return;
            }
        }
    } catch (error) {
        console.error("❌ Error enviando mensaje del panel a WhatsApp:", error);
    }
}

// FUNCIÓN PARA ENVIAR EVENTOS A WHATSAPP
async function enviarEventoAWhatsapp(mensaje, emoji = "📢") {
    try {
        const chats = await client.getChats();
        for (const chat of chats) {
            if (chat.isGroup && chat.name === config.whatsapp.grupoNombre) {
                await chat.sendMessage(`${emoji} ${mensaje}`);
                console.log(`✅ Evento enviado a grupo: ${chat.name}`);
                return;
            }
        }
    } catch (error) {
        console.error("❌ Error enviando evento:", error);
    }
}

// FUNCIÓN PARA GENERAR ENCUESTA ALEATORIA (con los nuevos eventos)
function generarEncuestaAleatoria() {
    const eventosSeleccionados = [];
    const indicesUsados = new Set();
    
    // Seleccionar 5 eventos aleatorios (excluyendo "Ningún evento")
    while (eventosSeleccionados.length < 5) {
        const indice = Math.floor(Math.random() * (eventosPosibles.length - 1));
        if (!indicesUsados.has(indice)) {
            indicesUsados.add(indice);
            eventosSeleccionados.push(eventosPosibles[indice]);
        }
    }
    
    // Agregar "Ningún evento" al final
    eventosSeleccionados.push(eventosPosibles[eventosPosibles.length - 1]);
    
    return {
        titulo: "🎲 *EVENTO AUTOMÁTICO*",
        pregunta: "Hermana de mica dice 🤰: ¿Qué evento quiere que active en 3 minutos?",
        opciones: eventosSeleccionados
    };
}

// FUNCIÓN PARA INICIAR ENCUESTA AUTOMÁTICA
async function iniciarEncuestaAutomatica() {
    console.log("⏰ Iniciando encuesta automática (cada 1 hora)");
    
    encuestaActiva = null;
    opcionesEncuesta = [];
    votosEncuesta.clear();
    votantesEncuesta.clear();
    
    const encuesta = generarEncuestaAleatoria();
    encuestaActiva = encuesta.pregunta;
    opcionesEncuesta = encuesta.opciones;
    
    const chats = await client.getChats();
    for (const chat of chats) {
        if (chat.isGroup && chat.name === config.whatsapp.grupoNombre) {
            
            let mensajeEncuesta = `${encuesta.titulo}\n\n`;
            mensajeEncuesta += `*${encuesta.pregunta}*\n\n`;
            
            mensajeEncuesta += `0️⃣ *${encuesta.opciones[5].nombre}*\n`;
            for (let i = 0; i < 5; i++) {
                const emojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'];
                mensajeEncuesta += `${emojis[i]} *${encuesta.opciones[i].nombre}*\n`;
            }
            
            mensajeEncuesta += `\n⏳ Votan con el número (0-5)\n⌛ Cierra en 3 minutos`;
            
            await chat.sendMessage(mensajeEncuesta);
            
            let textoEncuestaMinecraft = `§6[📊 ENCUESTA AUTOMÁTICA]§f\n§e${encuesta.pregunta}§f\n\n`;
            textoEncuestaMinecraft += `§70️⃣ §f${encuesta.opciones[5].nombre}\n`;
            for (let i = 0; i < 5; i++) {
                const emojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'];
                textoEncuestaMinecraft += `§7${emojis[i]} §f${encuesta.opciones[i].nombre}\n`;
            }
            textoEncuestaMinecraft += `\n§aVota en WhatsApp con el número (0-5)`;
            
            const textoEscapado = textoEncuestaMinecraft.replace(/"/g, '\\"');
            const comando = `/usr/local/bin/mcrcon -H ${config.rcon.host} -P ${config.rcon.port} -p "${config.rcon.password}" "tellraw @a {\\"text\\":\\"${textoEscapado}\\",\\"color\\":\\"white\\"}"`;
            exec(comando);
            
            break;
        }
    }
    
    setTimeout(() => {
        cerrarEncuestaAutomatica();
    }, 180000); // 3 minutos
}

// FUNCIÓN PARA CERRAR ENCUESTA Y ACTIVAR EVENTO
async function cerrarEncuestaAutomatica() {
    if (!encuestaActiva) return;
    
    console.log("⏰ Cerrando encuesta automática");
    
    const resultados = new Array(opcionesEncuesta.length).fill(0);
    let totalVotos = 0;
    
    for (const voto of votosEncuesta.values()) {
        if (voto >= 0 && voto < opcionesEncuesta.length) {
            resultados[voto]++;
            totalVotos++;
        }
    }
    
    // Sistema de desempate aleatorio
    let maxVotos = -1;
    let opcionesEmpatadas = [];
    
    for (let i = 0; i < resultados.length; i++) {
        if (resultados[i] > maxVotos) {
            maxVotos = resultados[i];
            opcionesEmpatadas = [i];
        } else if (resultados[i] === maxVotos && maxVotos > 0) {
            opcionesEmpatadas.push(i);
        }
    }
    
    let opcionGanadora;
    if (maxVotos === 0) {
        opcionGanadora = 5; // Ningún evento
    } else if (opcionesEmpatadas.length > 1) {
        const indiceAleatorio = Math.floor(Math.random() * opcionesEmpatadas.length);
        opcionGanadora = opcionesEmpatadas[indiceAleatorio];
        console.log(`🎲 Empate! Seleccionando aleatoriamente entre ${opcionesEmpatadas.length} opciones`);
    } else {
        opcionGanadora = opcionesEmpatadas[0];
    }
    
    const ganadora = opcionesEncuesta[opcionGanadora];
    
    const chats = await client.getChats();
    for (const chat of chats) {
        if (chat.isGroup && chat.name === config.whatsapp.grupoNombre) {
            
            let resultadosTexto = `📊 *RESULTADOS DE LA ENCUESTA*\n\n`;
            resultadosTexto += `*${encuestaActiva}*\n\n`;
            
            for (let i = 0; i < opcionesEncuesta.length; i++) {
                const emoji = i === 5 ? '0️⃣' : ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣'][i];
                const porcentaje = totalVotos > 0 ? Math.round((resultados[i] / totalVotos) * 100) : 0;
                resultadosTexto += `${emoji} *${opcionesEncuesta[i].nombre}*: ${resultados[i]} votos (${porcentaje}%)\n`;
            }
            
            if (opcionesEmpatadas.length > 1) {
                resultadosTexto += `\n🎲 *¡EMPATE! Ganador seleccionado al azar*`;
            }
            
            resultadosTexto += `\n\n🎉 *GANADOR: ${ganadora.nombre}*`;
            
            await chat.sendMessage(resultadosTexto);
            
            // ========== ACTIVACIÓN INMEDIATA ==========
            if (ganadora.tipo !== 'none') {
                await chat.sendMessage(`⚡ ¡Activando *${ganadora.nombre}* AHORA MISMO!`);
                
                // Activar sin espera
                setTimeout(() => {
                    activarEvento(ganadora);
                }, 1000);
            }
            
            break;
        }
    }
    
    let textoResultadosMinecraft = `§6[📊 RESULTADOS]§f\n§e${encuestaActiva}§f\n\n`;
    for (let i = 0; i < opcionesEncuesta.length; i++) {
        const emoji = i === 5 ? '0️⃣' : ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣'][i];
        textoResultadosMinecraft += `§7${emoji} §f${opcionesEncuesta[i].nombre}: §a${resultados[i]} votos§f\n`;
    }
    
    if (opcionesEmpatadas.length > 1) {
        textoResultadosMinecraft += `\n§6🎲 ¡EMPATE! Ganador seleccionado al azar§f\n`;
    }
    
    textoResultadosMinecraft += `\n§6🎉 GANADOR: §e${ganadora.nombre}`;
    
    const textoEscapado = textoResultadosMinecraft.replace(/"/g, '\\"');
    const comando = `/usr/local/bin/mcrcon -H ${config.rcon.host} -P ${config.rcon.port} -p "${config.rcon.password}" "tellraw @a {\\"text\\":\\"${textoEscapado}\\",\\"color\\":\\"white\\"}"`;
    exec(comando);
    
    encuestaActiva = null;
    opcionesEncuesta = [];
    votosEncuesta.clear();
    votantesEncuesta.clear();
}

// FUNCIÓN PARA ACTIVAR EVENTO (NUEVOS EVENTOS)
async function activarEvento(evento) {
    console.log(`⚡ Activando evento: ${evento.nombre}`);
    
    await ejecutarRCON(`say §6[🎉 EVENTO] §f${evento.nombre} activado!`);
    
    // Manejar cada tipo de evento
    if (evento.tipo === 'diamante') {
        await ejecutarRCON(`/give @a minecraft:diamond 1`);
        await ejecutarRCON(`say §a✅ ¡Todos recibieron 1 diamante!`);
        
    } else if (evento.tipo === 'hierro') {
        await ejecutarRCON(`/give @a minecraft:iron_ingot 30`);
        await ejecutarRCON(`say §a✅ ¡Todos recibieron 30 lingotes de hierro!`);
        
    } else if (evento.tipo === 'manzanas') {
        await ejecutarRCON(`/give @a minecraft:golden_apple 5`);
        await ejecutarRCON(`say §a✅ ¡Todos recibieron 5 manzanas doradas!`);
        
    } else if (evento.tipo === 'comida') {
        // Kit de comida básico
        await ejecutarRCON(`/give @a minecraft:bread 10`);
        await ejecutarRCON(`/give @a minecraft:cooked_beef 5`);
        await ejecutarRCON(`/give @a minecraft:cooked_cod 5`);
        await ejecutarRCON(`/give @a minecraft:carrot 10`);
        await ejecutarRCON(`/give @a minecraft:baked_potato 10`);
        await ejecutarRCON(`say §a✅ ¡Todos recibieron un kit de comida básico!`);
        
    } else if (evento.tipo === 'muerte') {
        const resultado = await matarJugadorAleatorio();
        if (!resultado) {
            await ejecutarRCON(`say §c❌ No se pudo ejecutar la muerte aleatoria (sin jugadores)`);
        }
    }
    
    await ejecutarRCON(`say §a✅ Evento completado!`);
}

// MONITOREAR EL ARCHIVO LOG DE MINECRAFT
function monitorearLog() {
    console.log("Monitoreando TODOS los eventos de Minecraft...");
    console.log("📝 El log anterior fue guardado como backup");
    console.log(`👀 Observando archivo: ${config.minecraft.logPath}`);
    
    try {
        const stats = fs.statSync(config.minecraft.logPath);
        console.log(`📊 Tamaño del log: ${stats.size} bytes`);
    } catch (e) {
        console.error(`❌ No se puede acceder al archivo: ${e.message}`);
    }
    
    let ultimaPosicion = 0;
    
    setInterval(() => {
        try {
            const stats = fs.statSync(config.minecraft.logPath);
            const tamañoActual = stats.size;
            
            if (tamañoActual < ultimaPosicion) {
                console.log("🔄 Archivo de log rotado, reiniciando posición");
                ultimaPosicion = 0;
            }
            
            if (tamañoActual > ultimaPosicion) {
                const stream = fs.createReadStream(config.minecraft.logPath, {
                    start: ultimaPosicion,
                    end: tamañoActual - 1,
                    encoding: 'utf8'
                });
                
                const rl = readline.createInterface({ input: stream });
                
                rl.on('line', (linea) => {
                    
                    const matchJugador = linea.match(/<(.+?)> (.+)/);
                    if (matchJugador) {
                        const jugador = matchJugador[1];
                        const mensaje = matchJugador[2];
                        
                        if (jugador !== config.minecraft.tuNombre && 
                            !mensaje.startsWith('[WhatsApp]') &&
                            jugador !== 'Server') {
                            
                            console.log(`📝 Jugador real: ${jugador}: ${mensaje}`);
                            enviarAWhatsapp(jugador, mensaje);
                        }
                    }
                    
                    const matchPanel = linea.match(/\[Server.*\]: (.+)/);
                    if (matchPanel) {
                        const mensaje = matchPanel[1];
                        
                        const palabrasProhibidas = [
                            'Set the world spawn point', 'Set own game mode', 'Gamerule',
                            'Killed', 'was killed', 'Sending item configs', 'Set the weather',
                            'Set the time', 'fell from a high place', 'drowned', 'burned',
                            'blew up', 'was slain', 'died', 'joined the game', 'left the game',
                            'lost connection', 'logged in', 'RCON', 'issued server command',
                            'CONSOLE', 'Advancement', '[Not Secure]', 'Starting minecraft server',
                            'Done (', 'Stopping server', 'Stopped server', 'Preparing spawn area',
                            'Preparing start region', 'Changing view distance'
                        ];
                        
                        let esProhibido = false;
                        for (const palabra of palabrasProhibidas) {
                            if (mensaje.includes(palabra)) {
                                esProhibido = true;
                                break;
                            }
                        }
                        
                        if (mensaje.match(/\[.*\]/) && !mensaje.startsWith('[WhatsApp]')) {
                            esProhibido = true;
                        }
                        
                        if (!esProhibido && 
                            !mensaje.startsWith('[WhatsApp]') && 
                            !linea.includes('RCON') && 
                            !linea.includes('issued server command') &&
                            !mensaje.match(/<.+>/)) {
                            
                            enviarPanelAWhatsapp(mensaje);
                        }
                    }
                    
                    const matchJoin = linea.match(/\[Server.*\]: (.+?) joined the game/);
                    if (matchJoin) {
                        const jugador = matchJoin[1];
                        if (jugador !== 'Server') {
                            enviarEventoAWhatsapp(`${jugador} se unió al servidor`, "🟢");
                        }
                    }
                    
                    const matchLeave = linea.match(/\[Server.*\]: (.+?) left the game/);
                    if (matchLeave) {
                        const jugador = matchLeave[1];
                        if (jugador !== 'Server') {
                            enviarEventoAWhatsapp(`${jugador} salió del servidor`, "🔴");
                        }
                    }
                    
                    const matchLogro = linea.match(/\[Server.*\]: (.+?) has (?:made the advancement|completed the challenge|reached the goal) \[(.+?)\]/);
                    if (matchLogro) {
                        const jugador = matchLogro[1];
                        const logro = matchLogro[2];
                        if (jugador !== 'Server') {
                            enviarEventoAWhatsapp(`${jugador} desbloqueó el logro: ${logro}`, "🏆");
                        }
                    }
                    
                    const matchSlain = linea.match(/\[Server.*\]: (.+?) was slain by (.+)/);
                    if (matchSlain) {
                        const victima = matchSlain[1];
                        const asesino = matchSlain[2];
                        if (victima !== 'Server' && !asesino.includes('[WhatsApp]') && !asesino.includes('Server')) {
                            enviarEventoAWhatsapp(`${victima} fue asesinado por ${asesino}`, "⚔️");
                        }
                    }
                    
                    const matchFell = linea.match(/\[Server.*\]: (.+?) fell from a high place/);
                    if (matchFell) {
                        const victima = matchFell[1];
                        if (victima !== 'Server') {
                            enviarEventoAWhatsapp(`${victima} se cayó de un lugar alto`, "📉");
                        }
                    }
                    
                    const matchDrowned = linea.match(/\[Server.*\]: (.+?) drowned/);
                    if (matchDrowned) {
                        const victima = matchDrowned[1];
                        if (victima !== 'Server') {
                            enviarEventoAWhatsapp(`${victima} se ahogó`, "💧");
                        }
                    }
                    
                    const matchBurnt = linea.match(/\[Server.*\]: (.+?) (?:burned to death|went up in flames)/);
                    if (matchBurnt) {
                        const victima = matchBurnt[1];
                        if (victima !== 'Server') {
                            enviarEventoAWhatsapp(`${victima} murió quemado`, "🔥");
                        }
                    }
                    
                    const matchBlown = linea.match(/\[Server.*\]: (.+?) (?:was blown up by|blew up)/);
                    if (matchBlown) {
                        const victima = matchBlown[1];
                        if (victima !== 'Server') {
                            enviarEventoAWhatsapp(`${victima} explotó`, "💥");
                        }
                    }
                    
                    const matchCactus = linea.match(/\[Server.*\]: (.+?) was pricked to death/);
                    if (matchCactus) {
                        const victima = matchCactus[1];
                        if (victima !== 'Server') {
                            enviarEventoAWhatsapp(`${victima} murió pinchado por un cactus`, "🌵");
                        }
                    }
                    
                    const matchArrow = linea.match(/\[Server.*\]: (.+?) was shot by (.+)/);
                    if (matchArrow) {
                        const victima = matchArrow[1];
                        const asesino = matchArrow[2];
                        if (victima !== 'Server' && !asesino.includes('[WhatsApp]') && !asesino.includes('Server')) {
                            enviarEventoAWhatsapp(`${victima} fue flechado por ${asesino}`, "🏹");
                        }
                    }
                    
                    const matchMagic = linea.match(/\[Server.*\]: (.+?) was killed by magic/);
                    if (matchMagic) {
                        const victima = matchMagic[1];
                        if (victima !== 'Server') {
                            enviarEventoAWhatsapp(`${victima} murió por magia`, "✨");
                        }
                    }
                    
                    const matchVoid = linea.match(/\[Server.*\]: (.+?) fell out of the world/);
                    if (matchVoid) {
                        const victima = matchVoid[1];
                        if (victima !== 'Server') {
                            enviarEventoAWhatsapp(`${victima} cayó al vacío`, "🕳️");
                        }
                    }
                    
                    const matchGenericDeath = linea.match(/\[Server.*\]: (.+?) died/);
                    if (matchGenericDeath && !linea.includes('fell') && !linea.includes('slain') && !linea.includes('drowned') && !linea.includes('burned')) {
                        const victima = matchGenericDeath[1];
                        if (victima !== 'Server') {
                            enviarEventoAWhatsapp(`${victima} murió`, "💔");
                        }
                    }
                    
                    if (linea.includes('Done (') && linea.includes(')! For help, type "help"')) {
                        enviarEventoAWhatsapp(`Servidor iniciado`, "🟢");
                    }
                    
                    if (linea.includes('Stopping server') || linea.includes('Stopped server')) {
                        enviarEventoAWhatsapp(`Servidor detenido`, "🔴");
                    }
                    
                });
                
                ultimaPosicion = tamañoActual;
            }
        } catch (error) {
            console.error("❌ Error leyendo el log:", error);
        }
    }, 1000);
}

client.on('qr', (qr) => {
    console.log("\n📱 ESCANEA ESTE CÓDIGO QR CON WHATSAPP:");
    console.log("   (Abre WhatsApp > 3 puntos > Dispositivos vinculados)\n");
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log("\n✅ ¡Bot de WhatsApp conectado!");
    console.log("🎉 El bot ya está listo. Esperando mensajes...\n");
    console.log("⏰ Encuestas automáticas cada 1 hora");
    console.log("🎮 Eventos disponibles:");
    console.log("   💎 1 Diamante para todos");
    console.log("   🔩 30 Hierro para todos");
    console.log("   🍎 5 Manzanas Doradas");
    console.log("   🍗 Kit de Comida Básico");
    console.log("   💀 Muerte Aleatoria");
    console.log("   ❌ Ningún evento");
    
    enviarMensajeInicio();
    
    setTimeout(() => {
        iniciarEncuestaAutomatica();
        
        setInterval(() => {
            iniciarEncuestaAutomatica();
        }, 3600000); // Cada 1 hora
        
    }, 10000);
    
    monitorearLog();
});

client.on('message', async (message) => {
    if (message.fromMe) return;
    
    if (message.id.remote.endsWith('@g.us')) {
        const chat = await message.getChat();
        
        if (chat.name === config.whatsapp.grupoNombre) {
            const contacto = await message.getContact();
            const nombre = contacto.pushname || contacto.name || contacto.number;
            const texto = message.body.toLowerCase().trim();
            
            console.log(`📱 WhatsApp - ${nombre}: ${message.body}`);
            
            if (texto === '/status') {
                console.log(`🔄 Procesando comando: /status`);
                
                verificarEstadoServidor((respuesta) => {
                    chat.sendMessage(respuesta);
                });
                return;
            }
            
            if (texto === 'chamoy_jugadores') {
                console.log(`🔄 Procesando comando: CHAMOY_JUGADORES (legacy)`);
                
                obtenerJugadoresOnline((respuesta) => {
                    chat.sendMessage(`👥 ${respuesta}`);
                });
                return;
            }
            
            // ==========================================
            // COMANDOS PARA FORZAR EVENTOS (PRUEBAS)
            // ==========================================
            
          /*  if (texto === '!diamante' || texto === '!diamantes') {
                console.log(`💎 Forzando evento: 1 diamante`);
                await chat.sendMessage(`💎 Forzando evento: 1 diamante para todos...`);
                await activarEvento(eventosPosibles[0]);
                return;
            }
            
            if (texto === '!hierro') {
                console.log(`🔩 Forzando evento: 30 hierro`);
                await chat.sendMessage(`🔩 Forzando evento: 30 hierro para todos...`);
                await activarEvento(eventosPosibles[1]);
                return;
            }
            
            if (texto === '!manzanas' || texto === '!doradas') {
                console.log(`🍎 Forzando evento: 5 manzanas doradas`);
                await chat.sendMessage(`🍎 Forzando evento: 5 manzanas doradas para todos...`);
                await activarEvento(eventosPosibles[2]);
                return;
            }
            
            if (texto === '!comida' || texto === '!kit') {
                console.log(`🍗 Forzando evento: kit de comida`);
                await chat.sendMessage(`🍗 Forzando evento: kit de comida básico para todos...`);
                await activarEvento(eventosPosibles[3]);
                return;
            }
            
            if (texto === '!muerte' || texto === '!matar') {
                console.log(`💀 Forzando evento: muerte aleatoria`);
                await chat.sendMessage(`💀 Forzando evento: muerte aleatoria...`);
                await activarEvento(eventosPosibles[4]);
                return;
            }*/
            
            // VOTACIÓN DE ENCUESTAS - MAPEO CORRECTO
            if (encuestaActiva && /^[0-5]$/.test(texto)) {
                const numero = parseInt(texto);
                
                if (numero >= 0 && numero <= 5) {
                    const votante = contacto.id._serialized;
                    
                    if (votantesEncuesta.has(votante)) {
                        chat.sendMessage(`⚠️ Ya votaste en esta encuesta! Esperá la próxima.`);
                    } else {
                        votantesEncuesta.add(votante);
                        
                        // MAPEO CORRECTO: 
                        // - Si vota 0 → índice 5 (Ningún evento)
                        // - Si vota 1-5 → índice (numero-1)
                        let indiceReal;
                        if (numero === 0) {
                            indiceReal = 5; // Ningún evento
                        } else {
                            indiceReal = numero - 1; // 1→0, 2→1, 3→2, 4→3, 5→4
                        }
                        
                        votosEncuesta.set(votante, indiceReal);
                        
                        const opcionElegida = opcionesEncuesta[indiceReal].nombre;
                        chat.sendMessage(`✅ Votaste por: *${opcionElegida}*`);
                        
                        if (votantesEncuesta.size % 5 === 0) {
                            const anuncio = `§a${votantesEncuesta.size} personas ya votaron en la encuesta!`;
                            await ejecutarRCON(`tellraw @a {\\"text\\":\\"${anuncio}\\",\\"color\\":\\"green\\"}`);
                        }
                    }
                }
                return;
            }
            
            enviarAMinecraft(nombre, message.body);
        }
    }
});

console.log("🔄 Inicializando bot...");
client.initialize();