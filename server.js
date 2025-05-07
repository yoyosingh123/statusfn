const express = require('express');
const XMPP = require('stanza');
const crypto = require('crypto');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
app.use(bodyParser.json());
app.use(cors());

const activeClients = {};

// Cleanly disconnect a user session
function disconnectUser(account_id) {
    const session = activeClients[account_id];
    if (session && session.client) {
        console.log(`🔴 Disconnecting: ${account_id}`);

        if (session.interval) clearInterval(session.interval);
        session.client.removeAllListeners();
        session.client.disconnect();
        delete activeClients[account_id];
    }
}

// Start and keep a user session alive with pinging
function connectUser({ account_id, access_token, status }) {
    const resource = `V2:Fortnite:PC::${crypto.randomBytes(16).toString('hex').toUpperCase()}`;
    const client = XMPP.createClient({
        jid: `${account_id}@prod.ol.epicgames.com`,
        resource: resource,
        transports: { websocket: 'wss://xmpp-service-prod.ol.epicgames.com' },
        credentials: {
            host: 'prod.ol.epicgames.com',
            username: account_id,
            password: access_token
        }
    });

    client.on('session:started', () => {
        console.log(`🟢 Connected: ${account_id}`);
        client.sendPresence({
            status: status || "I'm online 24/7 🚀",
            onlineType: "online",
            bIsPlaying: true,
            ProductName: "Fortnite"
        });

        // Start keepalive presence ping every 45s
        const interval = setInterval(() => {
            if (client.sessionStarted) {
                client.sendPresence({
                    status: status || "I'm online 24/7 🚀",
                    onlineType: "online",
                    bIsPlaying: true,
                    ProductName: "Fortnite"
                });
            }
        }, 45000);

        activeClients[account_id].interval = interval;
    });

    client.on('disconnected', () => {
        console.log(`❌ Disconnected: ${account_id}. Reconnecting in 5s...`);
        setTimeout(() => {
            if (activeClients[account_id]) client.connect();
        }, 5000);
    });

    client.on('session:error', err => {
        console.error(`❌ Session error (${account_id}):`, err);
    });

    client.connect();
    activeClients[account_id] = { client };
}

app.post('/togglePresence', async (req, res) => {
    const { account_id, access_token, status, disable } = req.body;

    if (!account_id) {
        return res.status(400).json({ success: false, message: "Missing account_id." });
    }

    if (disable) {
        disconnectUser(account_id);
        return res.json({ success: true, message: "Presence disabled." });
    }

    if (!access_token) {
        return res.status(400).json({ success: false, message: "Missing access_token for activation." });
    }

    disconnectUser(account_id); // Reset if already connected
    connectUser({ account_id, access_token, status });

    return res.json({ success: true, message: "Presence enabled." });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Presence Manager with keepalive running on port ${PORT}`);
});
