const express = require('express');
const cors = require('cors');
const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason, 
    fetchLatestBaileysVersion 
} = require('@whiskeysockets/baileys');
const pino = require('pino'); 

const app = express();
app.use(cors());
app.use(express.json());

let sock; 
let isReady = false;

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('./session_data');
    
    const { version } = await fetchLatestBaileysVersion();
    console.log(`Menggunakan Baileys versi: ${version.join('.')}`);

    sock = makeWASocket({
        logger: pino({ level: 'silent' }), 
        printQRInTerminal: true, 
        auth: state,
        browser: ['WhatsApp API Baileys', 'Chrome', '1.0.0'], 
        version
    });

    sock.ev.on('creds.update', saveCreds); 
    
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log('QR Code tersedia. Silakan scan di terminal.');
            isReady = false;
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Koneksi tertutup. Alasan:', lastDisconnect.error, 'Akan reconnect:', shouldReconnect);
            
            if (shouldReconnect) {
                connectToWhatsApp(); 
            } else {
                console.log('Logout, hapus session_data untuk scan ulang.');
                isReady = false;
            }
        } else if (connection === 'open') {
            console.log('WhatsApp terhubung dan siap digunakan!');
            isReady = true;
        }
    });
}

connectToWhatsApp();


app.post('/send-message', async (req, res) => {
    const { phone, message } = req.body;

    if (!isReady) {
        return res.status(503).json({ error: 'WhatsApp Client belum siap atau belum login.' });
    }

    if (!phone || !message) {
        return res.status(400).json({ error: 'Nomor dan pesan wajib diisi.' });
    }

    try {
        const jid = `${phone.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
        
        const [result] = await sock.onWhatsApp(jid);
        if (!result.exists) {
            return res.status(404).json({ error: 'Nomor tidak terdaftar di WhatsApp.' });
        }

        await sock.sendMessage(result.jid, { text: message });

        return res.status(200).json({ success: true, message: 'Pesan berhasil dikirim!', jid: result.jid });

    } catch (err) {
        console.error('Send error:', err);
        return res.status(500).json({ success: false, error: 'Gagal mengirim pesan.', details: err.message });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server WhatsApp berjalan di port ${PORT}`);
    console.log('Pastikan folder session_data ada dan terabaikan di .gitignore!');
});