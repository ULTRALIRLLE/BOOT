🤖 BOT WhatsApp - Assistente de Downloads e Jogos
Este é um bot para WhatsApp criado com Baileys, que permite aos usuários baixar vídeos e músicas de plataformas como YouTube, TikTok, Facebook, Instagram, além de fornecer uma lista de jogos online e um ranking personalizado.

📦 Requisitos
Node.js ^18.0.0

Termux (opcional, para execução em Android)

WhatsApp número válido

Conexão com a internet

🚀 Instalação
Clone o repositório:

bash
Copiar
Editar
git clone https://github.com/seu-usuario/seu-bot
cd seu-bot
Instale as dependências:

bash
Copiar
Editar
npm install
Inicie o bot:

bash
Copiar
Editar
node bot.js
Escaneie o QR Code no terminal com seu WhatsApp para autenticar.

📌 Comandos Disponíveis
🎵 Downloads
baixa [nome da música ou vídeo]
Exemplo: baixa shape of you

baixar [link do vídeo ou música]
Exemplo: baixar https://youtube.com/xxxxx

🎮 Jogos
boot jogos
Exibe uma lista de jogos online como PlayOk, Slither.io, Paper.io etc.

boot rank
Exibe um ranking com base na interação dos usuários com os jogos.

👋 Saudações
O bot responde a mensagens como:

oi

olá

hello

oi boot

ola bot
Com uma mensagem explicativa sobre suas funções.

📁 Estrutura de Arquivos
Arquivo/Pasta	Descrição
bot.js	Código principal do bot
tmp/	Pasta temporária para arquivos baixados
auth_info_baileys	Pasta onde o Baileys armazena as credenciais

⚙️ Recursos
Baileys para conexão com WhatsApp Web

API do YouTube Data v3 para busca de vídeos

Geração automática de QR Code no terminal

Ranking dinâmico de jogos por usuário

Logs de erro armazenados em error.log

🛠 Tecnologias Usadas
Node.js

Baileys

Google API

Pino (logger)

fs, path, child_process

qrcode-terminal

📌 Observações
O arquivo bot.js já possui sistema de reconexão automática.

A API Key do YouTube pode ser substituída por sua própria chave em YT_API_KEY.

A pasta tmp é limpa automaticamente após 10 minutos por padrão.

📜 Licença
Este projeto é de uso pessoal e educacional. Modificações são bem-vindas. Compartilhe melhorias!
