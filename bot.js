const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const { google } = require('googleapis');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode-terminal');
const P = require('pino');
const { exec } = require('child_process');
const http = require('http');

const YT_API_KEY = 'AIzaSyBTtE9RhmMgPfSnrBpDO3MBe8QQK4BYD34';
const pesquisaUsuario = {};
const TMP_DIR = './tmp';
const jogosRanking = {};

if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR);

// Configurar logger para registrar erros
const logger = P({ level: 'info' });
const errorLogStream = fs.createWriteStream(path.join(__dirname, 'error.log'), { flags: 'a' });

function logError(error) {
    const timestamp = new Date().toISOString();
    errorLogStream.write(`${timestamp} - ${error.stack || error}\n`);
    logger.error(error);
}

function limparArquivosAntigos(pasta, maxIdadeMin = 10) {
    const agora = Date.now();
    const arquivos = fs.readdirSync(pasta);

    arquivos.forEach(arquivo => {
        const caminho = path.join(pasta, arquivo);
        const stats = fs.statSync(caminho);
        const idadeMin = (agora - stats.mtimeMs) / (1000 * 60);
        if (idadeMin > maxIdadeMin) fs.unlinkSync(caminho);
    });
}

function formatarDuracao(duracaoISO) {
    const match = duracaoISO.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    const horas = parseInt(match[1] || '0', 10);
    const minutos = parseInt(match[2] || '0', 10);
    const segundos = parseInt(match[3] || '0', 10);
    const totalMinutos = horas * 60 + minutos + (segundos >= 30 ? 1 : 0);
    return `${totalMinutos} min`;
}

async function buscarVideos(nome) {
    try {
        const youtube = google.youtube({ version: 'v3', auth: YT_API_KEY });
        const res = await youtube.search.list({
            part: 'snippet',
            q: nome,
            maxResults: 10,
            type: 'video'
        });

        const videoIds = res.data.items.map(item => item.id.videoId).filter(Boolean).join(',');
        const detalhes = await youtube.videos.list({
            part: 'contentDetails',
            id: videoIds
        });

        return res.data.items.map(item => {
            const detalhe = detalhes.data.items.find(d => d.id === item.id.videoId);
            const duracao = detalhe ? formatarDuracao(detalhe.contentDetails.duration) : 'N/A';
            return {
                titulo: item.snippet.title,
                url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
                duracao
            };
        });
    } catch (error) {
        logError(error);
        throw new Error('Erro ao buscar vídeos. Tente novamente mais tarde.');
    }
}

async function waitForFile(path, attempts = 10, delay = 300) {
    while (!fs.existsSync(path) && attempts-- > 0) {
        await new Promise(r => setTimeout(r, delay));
    }
    return fs.existsSync(path);
}

const MAX_FILE_SIZE = 64 * 1024 * 1024; // 64MB in bytes

function getUsernameFromJid(jid) {
    const parts = jid.split('@');
    const user = parts[0].split(':');
    return user[0];
}

async function verificarAtualizacoes() {
    try {
        execSync('npx npm-check-updates -u');
        execSync('npm install');
        logger.info('Atualizações instaladas com sucesso. Reiniciando o bot...');
        process.exit(0);
    } catch (error) {
        logError(error);
    }
}

async function enviarListaJogos(sock, from, sender) {
    const listaJogos = `
🎮 *Lista de Jogos Disponíveis:*

1. *PlayOk*
   - 🔗 [Acessar PlayOk](https://www.playok.com/)
   - 🏆 *Ranking:* Sim
   - 📝 *Descrição:* Jogos clássicos como Damas, Uno e Xadrez.

2. *Paper.io*
   - 🔗 [Acessar Paper.io](https://paper-io.com/)
   - 🏆 *Ranking:* Sim
   - 📝 *Descrição:* Conquiste territórios e suba no ranking.

3. *Slither.io*
   - 🔗 [Acessar Slither.io](https://slither.io/)
   - 🏆 *Ranking:* Sim
   - 📝 *Descrição:* Controle uma cobra e acumule pontos online.

4. *Agar.io*
   - 🔗 [Acessar Agar.io](https://agar.io/)
   - 🏆 *Ranking:* Sim
   - 📝 *Descrição:* Jogo de estratégia onde você come células para crescer.

5. *2048*
   - 🔗 [Acessar 2048](https://play2048.co/)
   - 🏆 *Ranking:* Sim (com salvamento de score)
   - 📝 *Descrição:* Jogo de quebra-cabeça numérico para pontuar.
`;

    await sock.sendMessage(from, {
        text: `@${sender.split('@')[0]} 🎮 Aqui está a lista de jogos disponíveis:\n\n${listaJogos}`,
        mentions: [sender]
    });
}

async function enviarRanking(sock, from, sender) {
    let rankingMessage = `@${sender.split('@')[0]} 🏆 Ranking dos jogos:\n\n`;

    for (const [jogo, usuarios] of Object.entries(jogosRanking)) {
        rankingMessage += `*${jogo}:*\n`;
        usuarios.forEach(usuario => {
            rankingMessage += `- @${usuario.split('@')[0]}\n`;
        });
        rankingMessage += '\n';
    }

    await sock.sendMessage(from, {
        text: rankingMessage,
        mentions: [sender]
    });
}

async function startSock() {
    const { state, saveCreds } = await useMultiFileAuthState('./auth_info_baileys');
    const sock = makeWASocket({
        auth: state,
        browser: ['YTBot', 'Chrome', '1.0'],
        printQRInTerminal: false,
        logger: P({ level: 'silent' })
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
        if (qr) {
            console.log('🔳 Escaneie o QR Code abaixo:');
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Conexão fechada devido a:', lastDisconnect?.error);
            if (shouldReconnect) {
                console.log('Reconectando...');
                setTimeout(startSock, 3000);
            }
        } else if (connection === 'open') {
            console.log('✅ Conectado com sucesso ao WhatsApp!');
        } else if (connection === 'connecting') {
            console.log('🔄 Conectando...');
        }
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        const sender = msg.key.participant || from;
        const body = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
        const text = body.toLowerCase();

        if (!from.endsWith('@g.us')) {
            const saudacoes = ['ola', 'olá', 'ola boot', 'olá boot', 'ola bot', 'oi', 'oi boot', 'hello'];
            if (saudacoes.includes(text.toLowerCase().trim())) {
                await sock.sendMessage(from, {
                    text: `🎉 Olá! Eu sou o *BOOT*, seu assistente de downloads!
*Quer baixar vídeos ou músicas? Estou aqui pra te ajudar!* 😎

📥 *Plataformas suportadas:*
YouTube, Facebook, Instagram, TikTok, Kwai e muito mais!

🤖 *Comandos disponíveis:*
📌 *Como funciona? É simples!*

🎵 *Para baixar músicas ou vídeos pelo nome:*
*Envie:* Baixa música [nome da música ou vídeo]

🔗 *Para baixar pelo link:*
*Envie:* Baixar [link do vídeo ou música]

*Exemplo:* Baixar https://youtube.com/xxxx

⚡ E rapidinho o *BOOT* te envia o arquivo!`,
                    mentions: [sender]
                });
                return;
            }
        }

        if (text === 'boot jogos') {
            await enviarListaJogos(sock, from, sender);
            return;
        }

        if (text === 'boot rank') {
            await enviarRanking(sock, from, sender);
            return;
        }

        const regexLink = /^(baixar|baixa)\s+(https?:\/\/[^\s]+)/i;
        const matchLink = body.match(regexLink);

        if (matchLink) {
            const tipo = 'video';
            const url = matchLink[2];
            const format = tipo === 'musica' ? 'mp3' : 'mp4';
            const nomeBase = `${sender.replace(/[@:]/g, '_')}_${Date.now()}`;
            const file = path.join(TMP_DIR, `${nomeBase}.${format}`);

            const ytCommand = tipo === 'musica'
                ? `yt-dlp -f bestaudio --extract-audio --audio-format mp3 -o "${file}" "${url}"`
                : `yt-dlp --force-overwrites -f mp4 -o "${file}" "${url}"`;

            await sock.sendMessage(from, {
                text: `@${sender.split('@')[0]} 📥 Baixando o vídeo solicitado...`,
                mentions: [sender]
            });

            try {
                execSync(ytCommand, { stdio: 'inherit' });

                if (await waitForFile(file)) {
                    const stats = fs.statSync(file);
                    if (stats.size === 0 || stats.size > MAX_FILE_SIZE) {
                        await sock.sendMessage(from, { text: `⚠️ Desculpe, ${getUsernameFromJid(sender)} não posso enviar este arquivo pois excede o limite de tamanho do WhatsApp (64MB). Por favor, envie outro link.` });
                        return;
                    }

                    const buffer = fs.readFileSync(file);
                    const sendOptions = {
                        video: buffer,
                        mimetype: 'video/mp4',
                        caption: `@${sender.split('@')[0]} Aqui está o vídeo! 🎞️`,
                        mentions: [sender]
                    };

                    await sock.sendMessage(from, sendOptions);
                    fs.unlinkSync(file);
                    limparArquivosAntigos(TMP_DIR, 3);
                } else {
                    await sock.sendMessage(from, { text: '⚠️ Erro: arquivo não encontrado após o download.' });
                }
            } catch (error) {
                logError(error);
                await sock.sendMessage(from, { text: '⚠️ Erro ao baixar o link. Tente novamente mais tarde.' });
            }

            return;
        }

        const comandosVideo = [
            'baixar video de', 'baixar video do', 'baixa video de', 'baixa video do',
            'baixar vídeo de', 'baixar vídeo do', 'baixa vídeo de', 'baixa vídeo do',
            'baixar vídeo da', 'baixar video da', 'baixa video da', 'baixa vídeo da',
            'baixar video', 'baixar vídeo', 'baixa video', 'baixa vídeo',
            'quero video de', 'quero vídeo de', 'me manda o video de', 'me manda o vídeo de',
            'manda o video de', 'manda o vídeo de', 'envia video de', 'envia vídeo de'
        ];

        const comandosMusica = [
            'baixar musica de', 'baixar musica do', 'baixa musica de', 'baixa musica do',
            'baixar música de', 'baixar música do', 'baixa música de', 'baixa música do',
            'baixar música da', 'baixar musica da', 'baixa musica da', 'baixa música da',
            'baixar música', 'baixar musica', 'baixa música', 'baixa musica',
            'quero música de', 'quero musica de', 'me manda a música de', 'me manda a musica de',
            'manda a música de', 'manda a musica de', 'envia música de', 'envia musica de'
        ];

        const comandoVideo = comandosVideo.find(cmd => text.startsWith(cmd));
        const comandoMusica = comandosMusica.find(cmd => text.startsWith(cmd));

        if (comandoVideo || comandoMusica) {
            const termo = body.slice((comandoVideo || comandoMusica).length).trim();
            if (!termo) {
                await sock.sendMessage(from, { text: '⚠️ Por favor, envie o nome após o comando.' });
                return;
            }

            try {
                const resultados = await buscarVideos(termo);
                if (!pesquisaUsuario[from]) pesquisaUsuario[from] = {};
                pesquisaUsuario[from][sender] = { resultados, tipo: comandoMusica ? 'musica' : 'video' };

                setTimeout(() => {
                    if (pesquisaUsuario[from] && pesquisaUsuario[from][sender]) {
                        delete pesquisaUsuario[from][sender];
                        if (Object.keys(pesquisaUsuario[from]).length === 0) delete pesquisaUsuario[from];
                        console.log(`Pesquisa expirada para ${sender} em ${from}`);
                    }
                }, 5 * 60 * 1000);

                let resposta = `@${sender.split('@')[0]} 🔍 Resultados para: ${termo}\n\n`;
                resultados.forEach((r, i) => {
                    resposta += `${i + 1} - ${r.titulo} (${r.duracao})\n`;
                });
                resposta += `\n📲 Escolha o número que deseja ${comandoMusica ? 'baixar como música' : 'baixar como vídeo'}.`;

                await sock.sendMessage(from, {
                    text: resposta,
                    mentions: [sender]
                });
            } catch (error) {
                logError(error);
                await sock.sendMessage(from, { text: '⚠️ Erro ao buscar resultados. Tente novamente mais tarde.' });
            }
            return;
        }

        if (/^\d+$/.test(text) && pesquisaUsuario[from] && pesquisaUsuario[from][sender]) {
            const index = parseInt(text) - 1;
            const { resultados, tipo } = pesquisaUsuario[from][sender];
            const resultado = resultados[index];
            if (!resultado) {
                await sock.sendMessage(from, { text: '🚫 Número inválido. Escolha um da lista enviada.' });
                return;
            }

            const format = tipo === 'musica' ? 'mp3' : 'mp4';
            const nomeBase = `${sender.replace(/[@:]/g, '_')}_${Date.now()}`;
            const file = path.join(TMP_DIR, `${nomeBase}.${format}`);

            const ytCommand = tipo === 'musica'
                ? `yt-dlp -f bestaudio --extract-audio --audio-format mp3 -o "${file}" "${resultado.url}"`
                : `yt-dlp --force-overwrites -f mp4 -o "${file}" "${resultado.url}"`;

            await sock.sendMessage(from, {
                text: `@${sender.split('@')[0]} 📥 Baixando: ${resultado.titulo}`,
                mentions: [sender]
            });

            try {
                execSync(ytCommand, { stdio: 'inherit' });

                if (await waitForFile(file)) {
                    const stats = fs.statSync(file);
                    if (stats.size === 0 || stats.size > MAX_FILE_SIZE) {
                        await sock.sendMessage(from, { text: `⚠️ Desculpe, ${getUsernameFromJid(sender)} não posso enviar este arquivo pois excede o limite de tamanho do WhatsApp (64MB). Por favor, escolha outro vídeo ou música.` });
                        return;
                    }

                    const buffer = fs.readFileSync(file);
                    const sendOptions = tipo === 'musica'
                        ? {
                            document: buffer,
                            fileName: resultado.titulo + '.mp3',
                            mimetype: 'audio/mpeg',
                            caption: `@${sender.split('@')[0]} Aqui está a música! 🎶`,
                            mentions: [sender]
                        }
                        : {
                            video: buffer,
                            mimetype: 'video/mp4',
                            caption: `@${sender.split('@')[0]} Aqui está o vídeo! 🎞️`,
                            mentions: [sender]
                        };

                    await sock.sendMessage(from, sendOptions);
                    fs.unlinkSync(file);
                    delete pesquisaUsuario[from][sender];
                    if (Object.keys(pesquisaUsuario[from]).length === 0) delete pesquisaUsuario[from];
                } else {
                    await sock.sendMessage(from, { text: '⚠️ Erro: arquivo não encontrado após o download.' });
                }

                limparArquivosAntigos(TMP_DIR, 3);
            } catch (error) {
                logError(error);
                await sock.sendMessage(from, { text: '⚠️ Erro ao baixar. Tente novamente mais tarde.' });
            }
        }
    });

    return sock;
}

// Criar servidor HTTP simples
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot está ativo!');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});

// Verificar atualizações a cada 24 horas
setInterval(verificarAtualizacoes, 24 * 60 * 60 * 1000);

startSock().catch(err => {
    logError(err);
    setTimeout(startSock, 5000);
});
