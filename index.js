import express from 'express';
import cors from 'cors';
import { 
    default as makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason, 
    fetchLatestBaileysVersion 
} from '@whiskeysockets/baileys';
import pino from 'pino';
import nodemailer from 'nodemailer';
import QRCode from 'qrcode';
import fs from 'fs';

const YOUR_EMAIL = 'kosnection@gmail.com'; 
const APP_PASSWORD = 'ekbmxnqkypndlpbs'; 
const DESTINATION_EMAIL = 'kosnection@gmail.com'; 

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: YOUR_EMAIL, pass: APP_PASSWORD }
});

async function sendQREmail(qrString) {
    try {
        const qrCodeBase64 = await QRCode.toDataURL(qrString);
        const base64Data = qrCodeBase64.replace('data:image/png;base64,', '');

        const mailOptions = {
            from: YOUR_EMAIL,
            to: DESTINATION_EMAIL,
            subject: 'QR CODE LOGIN WHATSAPP API BAILEYS',
            html: '<p>Scan QR Code terlampir (file: qrcode.png) untuk login ke WhatsApp API Anda.</p>',
            attachments: [{
                filename: 'qrcode.png',
                content: base64Data,
                encoding: 'base64'
            }]
        };

        const info = await transporter.sendMail(mailOptions);
        console.log(`Email QR Code berhasil terkirim. Response: ${info.response}`);
    } catch (err) {
        console.error('Gagal mengirim email QR Code:', err.message);
    }
}

const app = express();
app.use(cors());
app.use(express.json());

let sock; 
let isReady = false;
let qrCode = null; 

async function connectToWhatsApp() {
    console.log('Memulai koneksi WhatsApp...');

    if (!fs.existsSync('./session_data')) fs.mkdirSync('./session_data');

    const { state, saveCreds } = await useMultiFileAuthState('./session_data');
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        auth: state,
        browser: ['WhatsApp API Baileys', 'Chrome', '1.0.0'],
        version
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            qrCode = qr;
            isReady = false;
            console.log('QR Code baru tersedia, mengirim email...');
            sendQREmail(qr); 
        } else if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Koneksi tertutup. Alasan:', lastDisconnect.error?.message, 'Reconnect:', shouldReconnect);

            isReady = false;
            qrCode = null;

            if (shouldReconnect) connectToWhatsApp();
            else console.log('Logout terdeteksi, hapus session_data untuk login ulang.');
        } else if (connection === 'open') {
            console.log('WhatsApp terhubung dan siap digunakan!');
            isReady = true;
            qrCode = null; 
        }
    });
}

connectToWhatsApp();

app.get('/qr', (req, res) => {
    if (isReady) return res.status(200).json({ status: 'READY', message: 'WhatsApp sudah terhubung.' });
    
    if (qrCode) return res.status(200).json({ 
        status: 'SCAN_REQUIRED', 
        qr: qrCode,
        message: 'QR Code tersedia. Juga sudah dikirim ke email.'
    });

    return res.status(200).json({ status: 'CONNECTING', message: 'Sedang mencoba menghubungkan/memuat sesi.' });
});

app.post('/send-message', async (req, res) => {
    const { phone, message } = req.body;

    if (!isReady) return res.status(503).json({ error: 'WhatsApp Client belum siap atau belum login.' });
    if (!phone || !message) return res.status(400).json({ error: 'Nomor dan pesan wajib diisi.' });

    try {
        const jid = `${phone.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
        const [result] = await sock.onWhatsApp(jid);
        if (!result.exists) return res.status(404).json({ error: 'Nomor tidak terdaftar di WhatsApp.' });

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
});
