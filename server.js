const express = require('express');
const XMPP = require('stanza');
const crypto = require('crypto');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');
const cors = require('cors');
app.use(cors({
    origin: 'https://fnvibes.com', // allow your PHP site's domain
    methods: ['GET', 'POST'],
    credentials: false
}));

const app = express();
app.use(bodyParser.json());

app.get('/ping', (req, res) => {
    res.send('pong');
});

async function refreshAccessToken(device_id, device_secret, account_id) {
    const res = await fetch("https://account-public-service-prod.ol.epicgames.com/account/api/oauth/token", {
        method: "POST",
        headers: {
            "Authorization": "basic ZWM2YTBlZDItYzVmZi00YmY4LTg4ODctZjYwY2IxYjRhY2I1Og==",
            "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
            grant_type: "device_auth",
            account_id,
            device_id,
            secret: device_secret
        })
    });

    const json = await res.json();
    return json.access_token || null;
}

app.post('/sendPresence', async (req, res) => {
    const { access_token, account_id, device_id, device_secret, status } = req.body;

    if (!access_token || !account_id || !status) {
        return res.status(400).json({ success: false, message: "Missing required data." });
    }

    let token = access_token;
    if (token.length < 10 || token.startsWith("expired")) {
        if (!device_id || !device_secret) {
            return res.status(400).json({ success: false, message: "Token expired and no device auth available." });
        }
        token = await refreshAccessToken(device_id, device_secret, account_id);
        if (!token) {
            return res.status(500).json({ success: false, message: "Failed to refresh token." });
        }
    }

    const client = XMPP.createClient({
        jid: `${account_id}@prod.ol.epicgames.com`,
        resource: `V2:Fortnite:PC::${crypto.randomBytes(16).toString('hex').toUpperCase()}`,
        transports: {
            websocket: 'wss://xmpp-service-prod.ol.epicgames.com'
        },
        credentials: {
            host: 'prod.ol.epicgames.com',
            username: account_id,
            password: token
        }
    });

    let responded = false;

    client.on('session:started', () => {
        client.sendPresence({
            status,
            onlineType: "online",
            bIsPlaying: true,
            ProductName: "Fortnite"
        });
        responded = true;
        res.json({ success: true, message: "Presence sent." });
        client.disconnect();
    });

    client.on('session:error', err => {
        console.error("XMPP Error:", err);
        if (!responded) {
            res.status(500).json({ success: false, message: "Session error." });
        }
        client.disconnect();
    });

    client.on('disconnected', () => {
        if (!responded) {
            res.status(500).json({ success: false, message: "Disconnected before response." });
        }
    });

    try {
        client.connect();
    } catch (e) {
        res.status(500).json({ success: false, message: "Connection error." });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ XMPP server is live on port ${PORT}`);
});
