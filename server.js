const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: './session_data'   
    }),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

client.on('qr', qr => {
    console.log('Scan QR code berikut untuk login ke WhatsApp:');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('WhatsApp sudah siap digunakan!');
});

client.on('disconnected', (reason) => {
    console.log('WhatsApp terputus:', reason);
    console.log('Mencoba reconnect...');
    client.initialize();
});

client.initialize();

app.post('/send-message', async (req, res) => {
    const { phone, message } = req.body;

    if (!phone || !message) {
        return res.status(400).json({ error: 'Nomor dan pesan wajib diisi.' });
    }

    try {
        await client.sendMessage(`${phone}@c.us`, message);
        return res.status(200).json({ success: true, message: 'Pesan berhasil dikirim!' });
    } catch (err) {
        console.error('Send error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server WhatsApp berjalan di port ${PORT}`);
});
