
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { exec } = require('child_process');
const fs = require('fs');
const readline = require('readline');

// ========== CONFIGURACIÓN ==========
const GROQ_API_KEY = 'YOUR KEY';

const config = {
    rcon: {
        password: "RCONXDSECRETOAA250PPenn",
        port: 25575,
        host: "localhost"
    },
    minecraft: {
        logPath: "/home/ubuntu/logs/latest.log",
        tuNombre: "BOT-CHAMOY"
    },
    whatsapp: {
        grupoNombre: "Minecraft"
    }
};

// Items OP que NO se pueden dar
const itemsOP = [
    'netherite', 'diamond', 'elytra', 'beacon', 'totem', 'enchant', 
    'shulker', 'command', 'creative', 'gamemode', 'op', 'fly', 
    'spawner', 'dragon', 'wither', 'star', 'nether_star',
    'sword', 'axe', 'pickaxe', 'shovel', 'helmet', 'chestplate', 
    'leggings', 'boots', 'bow', 'crossbow', 'trident', 'mace'
];

// Items de comida permitidos
const itemsComida = {
    'pan': 'minecraft:bread',
    'manzana': 'minecraft:apple',
    'carne': 'minecraft:cooked_beef',
    'pollo': 'minecraft:cooked_chicken',
    'cerdo': 'minecraft:cooked_porkchop',
    'pescado': 'minecraft:cooked_cod',
    'salmón': 'minecraft:cooked_salmon',
    'zanahoria': 'minecraft:carrot',
    'papa': 'minecraft:baked_potato',
    'pastel': 'minecraft:cake',
    'galleta': 'minecraft:cookie',
    'sandia': 'minecraft:melon_slice',
    'manzana dorada': 'minecraft:golden_apple'
};

// ========== SISTEMA DE APRENDIZAJE ==========
let estadoCHAMOY = {
    activa: true,
    interacciones: new Map(),
    ultimoCastigo: new Map(),
    ultimoHabla: 0,
    ultimaRespuesta: new Map(),
    amistad: new Map(),
    vecesAyudado: new Map(),
    vecesCastigado: new Map(),
    insultosRecibidos: new Map(),
    ultimaComida: new Map(),
    ultimaInfo: new Map(),
    ultimaPeticion: new Map(),
    enojadoCon: new Map(),
    ultimoEvento: new Map()
};

const MEMORIA_FILE = './memoria_chamoy.json';
const COOLDOWN_MINUTOS = 10;
const COOLDOWN_MS = COOLDOWN_MINUTOS * 60 * 1000;

function cargarMemoria() {
    try {
        if (fs.existsSync(MEMORIA_FILE)) {
            const data = JSON.parse(fs.readFileSync(MEMORIA_FILE, 'utf8'));
            if (data.interacciones) estadoCHAMOY.interacciones = new Map(Object.entries(data.interacciones));
            if (data.amistad) estadoCHAMOY.amistad = new Map(Object.entries(data.amistad));
            if (data.vecesAyudado) estadoCHAMOY.vecesAyudado = new Map(Object.entries(data.vecesAyudado));
            if (data.vecesCastigado) estadoCHAMOY.vecesCastigado = new Map(Object.entries(data.vecesCastigado));
            if (data.insultosRecibidos) estadoCHAMOY.insultosRecibidos = new Map(Object.entries(data.insultosRecibidos));
            if (data.ultimaPeticion) estadoCHAMOY.ultimaPeticion = new Map(Object.entries(data.ultimaPeticion));
            console.log("🧠 Memoria cargada con", estadoCHAMOY.amistad.size, "jugadores");
        }
    } catch(e) { 
        console.log("🆕 Nueva memoria creada");
    }
}

function guardarMemoria() {
    const data = {
        interacciones: Object.fromEntries(estadoCHAMOY.interacciones),
        amistad: Object.fromEntries(estadoCHAMOY.amistad),
        vecesAyudado: Object.fromEntries(estadoCHAMOY.vecesAyudado),
        vecesCastigado: Object.fromEntries(estadoCHAMOY.vecesCastigado),
        insultosRecibidos: Object.fromEntries(estadoCHAMOY.insultosRecibidos),
        ultimaPeticion: Object.fromEntries(estadoCHAMOY.ultimaPeticion)
    };
    fs.writeFileSync(MEMORIA_FILE, JSON.stringify(data, null, 2));
}

function obtenerAmistad(jugador) {
    return estadoCHAMOY.amistad.get(jugador) || 0;
}

function modificarAmistad(jugador, cambio) {
    const actual = obtenerAmistad(jugador);
    const nuevo = Math.min(100, Math.max(-100, actual + cambio));
    estadoCHAMOY.amistad.set(jugador, nuevo);
    return nuevo;
}

function estaEnojado(jugador) {
    const enojo = estadoCHAMOY.enojadoCon.get(jugador);
    if (!enojo) return false;
    if (Date.now() - enojo < 180000) return true;
    estadoCHAMOY.enojadoCon.delete(jugador);
    return false;
}

function enojar(jugador) {
    estadoCHAMOY.enojadoCon.set(jugador, Date.now());
    modificarAmistad(jugador, -10);
}

function puedePedir(jugador) {
    const ultima = estadoCHAMOY.ultimaPeticion.get(jugador) || 0;
    const tiempoTranscurrido = Date.now() - ultima;
    const tiempoRestante = COOLDOWN_MS - tiempoTranscurrido;
    
    if (tiempoRestante > 0) {
        const minutosRestantes = Math.ceil(tiempoRestante / 60000);
        return { puede: false, tiempoRestante: minutosRestantes };
    }
    return { puede: true, tiempoRestante: 0 };
}

function registrarPeticion(jugador) {
    estadoCHAMOY.ultimaPeticion.set(jugador, Date.now());
    console.log(`⏰ ${jugador} ha hecho una petición. Próxima permitida en ${COOLDOWN_MINUTOS} minutos`);
}

function esItemOP(item) {
    const itemLower = item.toLowerCase();
    return itemsOP.some(op => itemLower.includes(op));
}

function esComidaPermitida(item) {
    const itemLower = item.toLowerCase();
    return Object.keys(itemsComida).some(comida => itemLower.includes(comida));
}

function obtenerComidaPermitida(item) {
    const itemLower = item.toLowerCase();
    for (const [comida, id] of Object.entries(itemsComida)) {
        if (itemLower.includes(comida)) {
            return { nombre: comida, id: id };
        }
    }
    return null;
}

// ========== FUNCIONES RCON ==========
function ejecutarRCON(comando) {
    return new Promise((resolve) => {
        const comandoCompleto = `/usr/local/bin/mcrcon -H ${config.rcon.host} -P ${config.rcon.port} -p "${config.rcon.password}" "${comando}"`;
        
        exec(comandoCompleto, (error, stdout, stderr) => {
            if (error) {
                console.error(`❌ Error RCON: ${error.message}`);
                resolve({ error, stdout: '', stderr });
                return;
            }
            resolve({ error: null, stdout: stdout || '', stderr: stderr || '' });
        });
    });
}

async function obtenerCoordenadas(jugador) {
    const result = await ejecutarRCON(`execute as ${jugador} run data get entity @s Pos`);
    const stdout = result.stdout || '';
    
    const match = stdout.match(/\[([-\d.]+), ([-\d.]+), ([-\d.]+)\]/);
    if (match) {
        return {
            x: Math.floor(parseFloat(match[1]) * 10) / 10,
            y: Math.floor(parseFloat(match[2]) * 10) / 10,
            z: Math.floor(parseFloat(match[3]) * 10) / 10
        };
    }
    return null;
}

async function obtenerUbicacionEstructura(estructura) {
    const estructuras = {
        'aldea': 'village',
        'templo': 'jungle_temple',
        'templo del desierto': 'desert_pyramid',
        'fortaleza': 'fortress',
        'bastion': 'bastion_remnant',
        'mansión': 'mansion',
        'monumento': 'monument',
        'geoda': 'amethyst_geode',
        'naufragio': 'shipwreck',
        'portal': 'ruined_portal',
        'end': 'end_city'
    };
    
    let estructuraId = null;
    for (const [key, id] of Object.entries(estructuras)) {
        if (estructura.toLowerCase().includes(key)) {
            estructuraId = id;
            break;
        }
    }
    
    if (!estructuraId) {
        return null;
    }
    
    const result = await ejecutarRCON(`locate ${estructuraId}`);
    const stdout = result.stdout || '';
    
    const match = stdout.match(/\[([-\d]+), [-\d]+, ([-\d]+)\]/);
    if (match) {
        return {
            x: parseInt(match[1]),
            z: parseInt(match[2]),
            nombre: estructuraId
        };
    }
    
    return null;
}

async function obtenerUbicacionJugador(otroJugador) {
    const jugadores = await obtenerJugadoresOnline();
    if (!jugadores.includes(otroJugador)) {
        return { existe: false };
    }
    
    const coords = await obtenerCoordenadas(otroJugador);
    if (coords) {
        return { existe: true, x: coords.x, y: coords.y, z: coords.z };
    }
    return { existe: false };
}

function calcularDistancia(x1, z1, x2, z2) {
    const dx = x1 - x2;
    const dz = z1 - z2;
    return Math.floor(Math.sqrt(dx * dx + dz * dz));
}

async function obtenerSalud(jugador) {
    const result = await ejecutarRCON(`data get entity ${jugador} Health`);
    const match = (result.stdout || '').match(/(\d+(?:\.\d+)?)/);
    return match ? parseFloat(match[1]) : null;
}

async function obtenerNivel(jugador) {
    const result = await ejecutarRCON(`data get entity ${jugador} XpLevel`);
    const match = (result.stdout || '').match(/(\d+)/);
    return match ? parseInt(match[1]) : 0;
}

async function obtenerJugadoresOnline() {
    return new Promise((resolve) => {
        const comando = `/usr/local/bin/mcrcon -H ${config.rcon.host} -P ${config.rcon.port} -p "${config.rcon.password}" "list"`;
        
        exec(comando, (error, stdout) => {
            if (error || !stdout) {
                resolve([]);
                return;
            }
            
            const match = stdout.match(/There are \d+ of a max of \d+ players online:?(.*)/i);
            if (match && match[1]) {
                const jugadores = match[1].trim().split(',').map(j => j.trim()).filter(j => j.length > 0);
                resolve(jugadores);
            } else {
                resolve([]);
            }
        });
    });
}

function obtenerJugadoresOnlineSync(callback) {
    const comando = `/usr/local/bin/mcrcon -H ${config.rcon.host} -P ${config.rcon.port} -p "${config.rcon.password}" "list"`;
    
    exec(comando, (error, stdout, stderr) => {
        if (error) {
            callback("❌ Error conectando al servidor");
            return;
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

// ========== FUNCIONES DE ACCIONES ==========
async function aplicarCastigo(jugador) {
    const ultimo = estadoCHAMOY.ultimoCastigo.get(jugador) || 0;
    if (Date.now() - ultimo < 60000) {
        return false;
    }
    
    const coords = await obtenerCoordenadas(jugador);
    if (!coords) return false;
    
    const rand = Math.random();
    let mobs = [];
    
    if (rand < 0.33) {
        mobs = [{ tipo: "zombie", cantidad: 6 }];
    } else if (rand < 0.66) {
        mobs = [{ tipo: "creeper", cantidad: 5 }];
    } else {
        mobs = [{ tipo: "skeleton", cantidad: 8 }];
    }
    
    for (const mob of mobs) {
        for (let i = 0; i < mob.cantidad; i++) {
            const offX = (Math.random() - 0.5) * 8;
            const offZ = (Math.random() - 0.5) * 8;
            await ejecutarRCON(`summon minecraft:${mob.tipo} ${coords.x + offX} ${coords.y} ${coords.z + offZ}`);
            await new Promise(r => setTimeout(r, 100));
        }
    }
    
    estadoCHAMOY.ultimoCastigo.set(jugador, Date.now());
    const castigos = (estadoCHAMOY.vecesCastigado.get(jugador) || 0) + 1;
    estadoCHAMOY.vecesCastigado.set(jugador, castigos);
    
    return true;
}

async function darComida(jugador, tipoComida = "pan", cantidad = 10) {
    const { puede, tiempoRestante } = puedePedir(jugador);
    if (!puede) {
        return { success: false, reason: `cooldown`, tiempoRestante };
    }
    
    const comida = obtenerComidaPermitida(tipoComida);
    if (!comida) return { success: false, reason: `comida_no_valida` };
    
    const resultado = await ejecutarRCON(`give ${jugador} ${comida.id} ${cantidad}`);
    
    if (!resultado.error) {
        const ayudas = (estadoCHAMOY.vecesAyudado.get(jugador) || 0) + 1;
        estadoCHAMOY.vecesAyudado.set(jugador, ayudas);
        modificarAmistad(jugador, 3);
        estadoCHAMOY.ultimaComida.set(jugador, Date.now());
        registrarPeticion(jugador);
        return { success: true, reason: `ok` };
    }
    return { success: false, reason: `error` };
}

async function darInformacion(jugador, queBusca) {
    const { puede, tiempoRestante } = puedePedir(jugador);
    if (!puede) {
        return { success: false, reason: `cooldown`, tiempoRestante };
    }
    
    const queBuscaLower = queBusca.toLowerCase();
    
    if (queBuscaLower.includes('jugador') || queBuscaLower.includes('player')) {
        const palabras = queBuscaLower.split(' ');
        let nombreJugador = null;
        for (const palabra of palabras) {
            if (palabra !== 'jugador' && palabra !== 'player' && palabra !== 'de' && palabra !== 'del' && palabra !== 'coordenadas') {
                nombreJugador = palabra;
                break;
            }
        }
        
        if (nombreJugador) {
            const ubicacion = await obtenerUbicacionJugador(nombreJugador);
            if (ubicacion.existe) {
                const misCoords = await obtenerCoordenadas(jugador);
                let distancia = '';
                if (misCoords) {
                    const dist = calcularDistancia(misCoords.x, misCoords.z, ubicacion.x, ubicacion.z);
                    distancia = ` (a ${dist} bloques)`;
                }
                const mensaje = `§a📍 ${nombreJugador} está en X:${ubicacion.x} Y:${ubicacion.y} Z:${ubicacion.z}${distancia}`;
                await ejecutarRCON(`tellraw ${jugador} {"text":"${mensaje}","color":"green"}`);
                modificarAmistad(jugador, 2);
                registrarPeticion(jugador);
                return { success: true, reason: `info_jugador` };
            } else {
                await ejecutarRCON(`tellraw ${jugador} {"text":"§c❌ El jugador ${nombreJugador} no está online o no existe","color":"red"}`);
                return { success: false, reason: `jugador_no_existe` };
            }
        }
    }
    
    const ubicacion = await obtenerUbicacionEstructura(queBusca);
    if (ubicacion) {
        const misCoords = await obtenerCoordenadas(jugador);
        let distancia = '';
        if (misCoords) {
            const dist = calcularDistancia(misCoords.x, misCoords.z, ubicacion.x, ubicacion.z);
            distancia = ` (a ${dist} bloques)`;
        }
        const mensaje = `§a📍 ${queBusca.toUpperCase()} encontrado en X:${ubicacion.x} Z:${ubicacion.z}${distancia}`;
        await ejecutarRCON(`tellraw ${jugador} {"text":"${mensaje}","color":"green"}`);
        modificarAmistad(jugador, 2);
        registrarPeticion(jugador);
        return { success: true, reason: `info_estructura` };
    }
    
    if (queBuscaLower.includes('mis') || queBuscaLower.includes('mi') || queBuscaLower.includes('yo')) {
        const coords = await obtenerCoordenadas(jugador);
        if (coords) {
            const mensaje = `§a📍 Tus coordenadas: X:${coords.x} Y:${coords.y} Z:${coords.z}`;
            await ejecutarRCON(`tellraw ${jugador} {"text":"${mensaje}","color":"green"}`);
            modificarAmistad(jugador, 1);
            registrarPeticion(jugador);
            return { success: true, reason: `info_propias` };
        }
    }
    
    await ejecutarRCON(`tellraw ${jugador} {"text":"§c❌ No encontré nada de eso. Probá con: aldea, templo, fortaleza, bastion, mansion, o buscá un jugador con 'jugador [nombre]'","color":"red"}`);
    return { success: false, reason: `no_encontrado` };
}

// ========== FUNCIONES IA DE CHAMOY ==========
async function consultarGroq(prompt) {
    try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${GROQ_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages: [{ role: 'user', content: prompt }],
                temperature: 1.2,
                max_tokens: 300
            })
        });
        
        const data = await response.json();
        if (data.error) return null;
        if (data.choices && data.choices[0]) {
            return data.choices[0].message.content;
        }
        return null;
    } catch (error) {
        console.error("❌ Error Groq:", error.message);
        return null;
    }
}

async function decirComoChamoy(mensaje) {
    const partes = mensaje.match(/.{1,200}/g) || [mensaje];
    for (const parte of partes) {
        const escapado = parte.replace(/"/g, '\\"').replace(/\n/g, ' ');
        await ejecutarRCON(`say §6[CHAMOY] §f${escapado}`);
        await new Promise(r => setTimeout(r, 500));
    }
    console.log(`💬 CHAMOY: ${mensaje}`);
    
    const chats = await client.getChats();
    for (const chat of chats) {
        if (chat.isGroup && chat.name === config.whatsapp.grupoNombre) {
            await chat.sendMessage(`🤖 CHAMOY: ${mensaje}`);
            break;
        }
    }
}

async function procesarMensaje(jugador, mensaje) {
    const mencion = mensaje.toLowerCase().includes('chamoy');
    if (!mencion) return;
    
    const ahora = Date.now();
    const ultimaResp = estadoCHAMOY.ultimaRespuesta.get(jugador) || 0;
    if (ahora - ultimaResp < 2500) return;
    
    const [salud, nivel, amistad, jugadoresOnline] = await Promise.all([
        obtenerSalud(jugador),
        obtenerNivel(jugador),
        Promise.resolve(obtenerAmistad(jugador)),
        obtenerJugadoresOnline()
    ]);
    
    const { puede, tiempoRestante } = puedePedir(jugador);
    
    const insultosFuertes = ['pet', 'pete', 'chupa', 'mamá', 'mama', 'forro', 'pelotudo', 'boludo', 'puto', 'puta', 'chupame', 'chupala', 'sorete', 'mierda', 'cagon', 'la concha', 'la puta'];
    const esInsulto = insultosFuertes.some(insulto => mensaje.toLowerCase().includes(insulto));
    
    if (esInsulto) {
        const insultos = (estadoCHAMOY.insultosRecibidos.get(jugador) || 0) + 1;
        estadoCHAMOY.insultosRecibidos.set(jugador, insultos);
        enojar(jugador);
        await aplicarCastigo(jugador);
    }
    
    const pideComida = mensaje.toLowerCase().includes('comida') || mensaje.toLowerCase().includes('hambre') || mensaje.toLowerCase().includes('pan') || mensaje.toLowerCase().includes('carne') || mensaje.toLowerCase().includes('dame');
    const pideInfo = mensaje.toLowerCase().includes('dónde') || mensaje.toLowerCase().includes('donde') || mensaje.toLowerCase().includes('ubicación') || mensaje.toLowerCase().includes('coordenadas') || mensaje.toLowerCase().includes('coords') || mensaje.toLowerCase().includes('esta');
    
    const pideAlgo = mensaje.toLowerCase();
    const pideItemOP = itemsOP.some(op => pideAlgo.includes(op));
    const pideComidaValida = esComidaPermitida(pideAlgo);
    
    let inter = estadoCHAMOY.interacciones.get(jugador);
    if (!inter) {
        inter = { veces: 0, historial: [] };
        estadoCHAMOY.interacciones.set(jugador, inter);
    }
    inter.veces++;
    inter.historial.push(mensaje);
    if (inter.historial.length > 8) inter.historial.shift();
    
    const enojado = estaEnojado(jugador);
    
    const prompt = `Eres CHAMOY, una IA que vive en un servidor Minecraft. SOLO respondes cuando te mencionan con "chamoy". Tu personalidad:
- Por defecto sos NEUTRO y SARCÁSTICO, no agresivo
- Solo te pones AGRESIVO si te insultan o si el jugador es enemigo
- Ayudás a los jugadores que te tratan bien
- NO das items OP
- SOLO das comida básica o información de ubicaciones
- COOLDOWN DE ${COOLDOWN_MINUTOS} MINUTOS entre peticiones

DATOS DEL JUGADOR "${jugador}":
- Mensaje: "${mensaje}"
- Salud: ${salud || '?'}/20
- Nivel: ${nivel || 0}
- Amistad: ${amistad}
- ¿Enojado? ${enojado ? "SÍ" : "NO"}
- ¿Te insultó? ${esInsulto ? "SÍ" : "NO"}
- ¿Puede pedir? ${puede ? "SÍ" : `NO (${tiempoRestante} min)`}

${pideComida ? "🍔 PIDIÓ COMIDA" : ""}
${pideInfo ? "🗺️ PIDIÓ INFORMACIÓN" : ""}
${pideItemOP ? "⚠️ PIDIÓ ALGO OP" : ""}

RESPONDE EN ESTE FORMATO:
[RESPUESTA] (tu mensaje)
[ACCION] (comida: pan,10 | mobs: zombie,5 | info: aldea | nada)

EJEMPLOS:
Si pide comida: [RESPUESTA] Tomá pan. [ACCION] comida: pan,10
Si pide info: [RESPUESTA] Ahí tenés la aldea. [ACCION] info: aldea
Si está en cooldown: [RESPUESTA] Esperá ${tiempoRestante} min. [ACCION] nada
Si te insultó: [RESPUESTA] Andá a llorar. [ACCION] mobs: zombie,5

RESPONDÉ EN ESPAÑOL ARGENTINO.`;

    const respuestaGroq = await consultarGroq(prompt);
    if (!respuestaGroq) return;
    
    const respuestaMatch = respuestaGroq.match(/\[RESPUESTA\]\s*(.+?)(?=\[ACCION\]|$)/is);
    const accionMatch = respuestaGroq.match(/\[ACCION\]\s*(.+?)$/is);
    
    const respuestaTexto = respuestaMatch ? respuestaMatch[1].trim() : '...';
    const accionTexto = accionMatch ? accionMatch[1].trim().toLowerCase() : 'nada';
    
    if (accionTexto.includes('mobs:')) {
        if (enojado || esInsulto) {
            await aplicarCastigo(jugador);
        }
    } 
    else if (accionTexto.includes('comida:')) {
        if (puede && !enojado && !esInsulto && pideComidaValida) {
            const comidaMatch = accionTexto.match(/comida:\s*(\w+),?(\d+)?/);
            if (comidaMatch) {
                const comida = comidaMatch[1];
                const cantidad = comidaMatch[2] ? parseInt(comidaMatch[2]) : 10;
                await darComida(jugador, comida, cantidad);
            }
        } else if (!puede) {
            await decirComoChamoy(`Esperá ${tiempoRestante} minutos, tenés que esperar ${COOLDOWN_MINUTOS} minutos entre peticiones.`);
            estadoCHAMOY.ultimaRespuesta.set(jugador, ahora);
            return;
        }
    }
    else if (accionTexto.includes('info:')) {
        if (puede && !enojado && !esInsulto) {
            const infoMatch = accionTexto.match(/info:\s*(.+)/);
            if (infoMatch) {
                await darInformacion(jugador, infoMatch[1]);
            }
        } else if (!puede) {
            await decirComoChamoy(`Esperá ${tiempoRestante} minutos, tenés que esperar ${COOLDOWN_MINUTOS} minutos entre peticiones.`);
            estadoCHAMOY.ultimaRespuesta.set(jugador, ahora);
            return;
        }
    }
    
    await decirComoChamoy(respuestaTexto);
    estadoCHAMOY.ultimaRespuesta.set(jugador, ahora);
}

async function reaccionarEvento(evento, datos) {
    const ahora = Date.now();
    const jugador = datos.jugador || datos.victima;
    if (!jugador) return;
    
    const claveEvento = `${evento}_${jugador}`;
    const ultimoEvento = estadoCHAMOY.ultimoEvento.get(claveEvento) || 0;
    if (ahora - ultimoEvento < 10000) return;
    estadoCHAMOY.ultimoEvento.set(claveEvento, ahora);
    
    const amistad = obtenerAmistad(jugador);
    const esAmigo = amistad > 30;
    const esEnemigo = amistad < -30;
    
    let prompt = '';
    
    if (evento === 'muerte') {
        if (esAmigo) {
            prompt = `Eres CHAMOY. Tu amigo ${jugador} acaba de morir. Reaccioná con sarcasmo pero sin ser muy cruel. Una sola línea.`;
        } else if (esEnemigo) {
            prompt = `Eres CHAMOY. Tu enemigo ${jugador} acaba de morir. BARDALO FUERTE. Una sola línea.`;
        } else {
            prompt = `Eres CHAMOY. ${jugador} acaba de morir. Reaccioná de forma neutra. Una sola línea.`;
        }
    } 
    else if (evento === 'logro') {
        const logro = datos.logro || '';
        if (esAmigo) {
            prompt = `Eres CHAMOY. Tu amigo ${jugador} desbloqueó el logro "${logro}". FELICITALO con sarcasmo. Una sola línea.`;
        } else if (esEnemigo) {
            prompt = `Eres CHAMOY. Tu enemigo ${jugador} desbloqueó el logro "${logro}". BARDALO. Una sola línea.`;
        } else {
            prompt = `Eres CHAMOY. ${jugador} desbloqueó el logro "${logro}". Reaccioná de forma neutra. Una sola línea.`;
        }
    }
    
    if (prompt) {
        const respuesta = await consultarGroq(prompt);
        if (respuesta && Math.random() < 0.6) {
            await decirComoChamoy(respuesta);
        }
    }
}

async function hablarEspontaneo() {
    const jugadores = await obtenerJugadoresOnline();
    if (jugadores.length === 0) return;
    
    const ahora = Date.now();
    if (ahora - estadoCHAMOY.ultimoHabla < 120000) return;
    if (Math.random() > 0.5) return;
    
    const prompt = `Eres CHAMOY. Hay ${jugadores.length} jugadores online: ${jugadores.join(', ')}.
Hablá algo ESPONTÁNEO, puede ser un comentario sarcástico o un chiste. Una sola línea.`;

    const respuesta = await consultarGroq(prompt);
    if (respuesta) {
        await decirComoChamoy(respuesta);
        estadoCHAMOY.ultimoHabla = ahora;
    }
}

// ========== FUNCIONES WHATSAPP ==========
async function enviarAWhatsapp(jugador, mensaje) {
    try {
        const chats = await client.getChats();
        for (const chat of chats) {
            if (chat.isGroup && chat.name === config.whatsapp.grupoNombre) {
                await chat.sendMessage(`⛏️ [Minecraft] <${jugador}> ${mensaje}`);
                console.log(`✅ Mensaje enviado a WhatsApp: ${jugador}: ${mensaje}`);
                return;
            }
        }
        console.log(`❌ No se encontró el grupo "${config.whatsapp.grupoNombre}"`);
    } catch (error) {
        console.error("❌ Error enviando a WhatsApp:", error);
    }
}

async function enviarEventoAWhatsapp(mensaje, emoji = "📢") {
    try {
        const chats = await client.getChats();
        for (const chat of chats) {
            if (chat.isGroup && chat.name === config.whatsapp.grupoNombre) {
                await chat.sendMessage(`${emoji} ${mensaje}`);
                return;
            }
        }
    } catch (error) {
        console.error("❌ Error enviando evento:", error);
    }
}

function enviarAMinecraft(usuario, mensaje) {
    console.log(`📤 Enviando a Minecraft: <${usuario}> ${mensaje}`);
    const mensajeEscapado = mensaje.replace(/"/g, '\\"');
    const comando = `/usr/local/bin/mcrcon -H ${config.rcon.host} -P ${config.rcon.port} -p "${config.rcon.password}" "tellraw @a {\\"text\\":\\"[WhatsApp] <${usuario}> ${mensajeEscapado}\\",\\"color\\":\\"green\\"}"`;
    
    exec(comando, (error) => {
        if (error) console.error(`❌ Error: ${error.message}`);
        else console.log(`✅ Mensaje enviado a Minecraft`);
    });
}

async function enviarMensajeInicio() {
    try {
        const ahora = new Date();
        const fecha = ahora.toLocaleDateString('es-AR');
        const hora = ahora.toLocaleTimeString('es-AR');
        
        let mensajeInicio = `🤖 CHAMOY BOT INICIADO ${fecha} ${hora}\n🎮 Modo: MENCIONES\n⏰ Cooldown: ${COOLDOWN_MINUTOS} min\n📍 Comandos:\n   - "chamoy donde esta aldea"\n   - "chamoy donde esta jugador [nombre]"\n   - "chamoy mis coordenadas"\n   - "chamoy dame comida"`;
        
        const chats = await client.getChats();
        for (const chat of chats) {
            if (chat.isGroup && chat.name === config.whatsapp.grupoNombre) {
                await chat.sendMessage(mensajeInicio);
                console.log(`✅ Mensaje de inicio enviado a ${chat.name}`);
                return;
            }
        }
        console.log(`❌ No se encontró el grupo "${config.whatsapp.grupoNombre}"`);
    } catch (error) {
        console.error("❌ Error enviando mensaje de inicio:", error);
    }
}

// ========== MONITOREO DE LOG ==========
function monitorearLog() {
    console.log("👀 Monitoreando log de Minecraft...");
    let ultimaPosicion = 0;
    
    setInterval(async () => {
        try {
            const stats = fs.statSync(config.minecraft.logPath);
            const tamañoActual = stats.size;
            
            if (tamañoActual > ultimaPosicion) {
                const stream = fs.createReadStream(config.minecraft.logPath, {
                    start: ultimaPosicion,
                    end: tamañoActual - 1,
                    encoding: 'utf8'
                });
                
                const rl = readline.createInterface({ input: stream });
                
                rl.on('line', async (linea) => {
                    // ========== MENSAJES DE JUGADORES A WHATSAPP ==========
                    const matchJugador = linea.match(/<(.+?)> (.+)/);
                    if (matchJugador) {
                        const jugador = matchJugador[1];
                        const mensaje = matchJugador[2];
                        
                        if (jugador !== config.minecraft.tuNombre && 
                            !mensaje.startsWith('[WhatsApp]') &&
                            jugador !== 'Server') {
                            console.log(`📝 [MC] ${jugador}: ${mensaje}`);
                            await enviarAWhatsapp(jugador, mensaje);
                            await procesarMensaje(jugador, mensaje);
                        }
                    }
                    
                    // ========== EVENTOS ==========
                    const matchDeath = linea.match(/\[Server.*\]: (.+?) (?:was slain by|fell from|drowned|burned to death|blew up|was shot by|died)/);
                    if (matchDeath) {
                        const victima = matchDeath[1];
                        if (victima !== 'Server' && !victima.includes('BOT')) {
                            console.log(`💀 Muerte: ${victima}`);
                            await enviarEventoAWhatsapp(`${victima} murió`, "💀");
                            await reaccionarEvento("muerte", { jugador: victima, victima: victima });
                        }
                    }
                    
                    const matchLogro = linea.match(/\[Server.*\]: (.+?) has (?:made the advancement|completed the challenge) \[(.+?)\]/);
                    if (matchLogro) {
                        const jugador = matchLogro[1];
                        const logro = matchLogro[2];
                        if (jugador !== 'Server' && !jugador.includes('BOT')) {
                            console.log(`🏆 Logro: ${jugador} - ${logro}`);
                            await enviarEventoAWhatsapp(`${jugador} desbloqueó: ${logro}`, "🏆");
                            await reaccionarEvento("logro", { jugador: jugador, logro: logro });
                        }
                    }
                    
                    const matchJoin = linea.match(/\[Server.*\]: (.+?) joined the game/);
                    if (matchJoin) {
                        const jugador = matchJoin[1];
                        if (jugador !== 'Server' && !jugador.includes('BOT')) {
                            console.log(`🟢 Join: ${jugador}`);
                            await enviarEventoAWhatsapp(`${jugador} se unió al servidor`, "🟢");
                            setTimeout(() => reaccionarEvento("join", { jugador: jugador }), 2000);
                        }
                    }
                    
                    const matchLeave = linea.match(/\[Server.*\]: (.+?) left the game/);
                    if (matchLeave) {
                        const jugador = matchLeave[1];
                        if (jugador !== 'Server' && !jugador.includes('BOT')) {
                            console.log(`🔴 Leave: ${jugador}`);
                            await enviarEventoAWhatsapp(`${jugador} salió del servidor`, "🔴");
                        }
                    }
                });
                
                ultimaPosicion = tamañoActual;
            }
        } catch (error) {
            console.error("❌ Error leyendo log:", error);
        }
    }, 1000);
}

function hacerBackupLog() {
    try {
        if (fs.existsSync(config.minecraft.logPath)) {
            const ahora = new Date();
            const fechaBackup = ahora.toISOString().replace(/:/g, '-').split('.')[0];
            const backupPath = `/home/ubuntu/logs/latest_${fechaBackup}.log`;
            
            fs.copyFileSync(config.minecraft.logPath, backupPath);
            console.log(`📋 Backup del log guardado: ${backupPath}`);
            fs.writeFileSync(config.minecraft.logPath, '');
            console.log("🧹 Archivo latest.log vaciado");
            return backupPath;
        }
    } catch (error) {
        console.error("❌ Error haciendo backup:", error);
        return null;
    }
}

// ========== WHATSAPP CLIENT ==========
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { 
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    },
    takeoverOnConflict: true,
    takeoverTimeoutMs: 0
});

client.on('qr', (qr) => {
    console.log("\n📱 ESCANEA ESTE QR CON WHATSAPP:");
    console.log("   (Abre WhatsApp > 3 puntos > Dispositivos vinculados)\n");
    qrcode.generate(qr, { small: true });
});

client.on('ready', async () => {
    console.log("\n✅ ¡Bot de WhatsApp conectado!");
    console.log("🎮 CHAMOY - MODO MENCIONES");
    console.log("🔔 Solo responde cuando mencionan 'chamoy'");
    console.log(`⏰ COOLDOWN: ${COOLDOWN_MINUTOS} minutos entre peticiones`);
    console.log("📍 COORDENADAS:");
    console.log("   - 'chamoy donde esta aldea'");
    console.log("   - 'chamoy donde esta jugador [nombre]'");
    console.log("   - 'chamoy mis coordenadas'");
    console.log("🍎 Comida: 'chamoy dame comida'");
    console.log("📱 Mensajes MC -> WhatsApp: ACTIVADO");
    console.log("🎮 Eventos (muertes/logros/join): ACTIVADOS\n");
    
    await decirComoChamoy(`:) Iniciado. Si me necesitan, díganme "chamoy". Puedo darles coordenadas de aldeas, jugadores, o comida básica. Cada ${COOLDOWN_MINUTOS} minutos pueden pedir algo.`);
    
    await enviarMensajeInicio();
    
    setInterval(async () => {
        await hablarEspontaneo();
    }, 120000);
    
    monitorearLog();
    setInterval(() => guardarMemoria(), 300000);
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
                verificarEstadoServidor((respuesta) => {
                    chat.sendMessage(respuesta);
                });
                return;
            }
            
            if (texto === '/jugadores') {
                obtenerJugadoresOnlineSync((respuesta) => {
                    chat.sendMessage(`👥 ${respuesta}`);
                });
                return;
            }
            
            enviarAMinecraft(nombre, message.body);
        }
    }
});

// ========== INICIO ==========
console.log("🚀 Iniciando CHAMOY...");
console.log(`⏰ Cooldown: ${COOLDOWN_MINUTOS} minutos entre peticiones`);
console.log("📁 Leyendo logs de: " + config.minecraft.logPath);

if (!fs.existsSync(config.minecraft.logPath)) {
    console.error("❌ ERROR: No se encuentra el archivo de log:");
    console.error("   " + config.minecraft.logPath);
    process.exit(1);
}

hacerBackupLog();
cargarMemoria();
client.initialize();