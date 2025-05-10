const express = require('express');
const XMPP = require('stanza');
const crypto = require('crypto');
const bodyParser = require('body-parser');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
app.use(bodyParser.json());
app.use(cors());

const activeClients = {};

function disconnectUser(account_id) {
    const session = activeClients[account_id];
    if (session && session.client) {
        console.log(`🔴 Disconnecting: ${account_id}`);
        if (session.interval) clearInterval(session.interval);
        if (session.statusLoop) clearInterval(session.statusLoop);
        session.client.removeAllListeners();
        session.client.disconnect();
        delete activeClients[account_id];
    }
}

async function connectUser({ account_id, access_token, status, pastebin_url }) {
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

    client.on('session:started', async () => {
        console.log(`🟢 Connected: ${account_id}`);

        const sendPresence = (msg) => {
            client.sendPresence({
                status: msg,
                onlineType: "online",
                bIsPlaying: true,
                ProductName: "Fortnite"
            });
        };

        if (pastebin_url) {
            try {
                const response = await fetch(pastebin_url);
                const text = await response.text();
                const lines = text.split('\n').filter(l => l.trim().length > 0);

                if (lines.length > 0) {
                    let index = 0;
                    sendPresence(lines[0]); // Initial
                    const statusLoop = setInterval(() => {
                        index = (index + 1) % lines.length;
                        sendPresence(lines[index]);
                    }, 5000);

                    activeClients[account_id].statusLoop = statusLoop;
                } else {
                    sendPresence("🎮 Status Online");
                }
            } catch (e) {
                console.log("❌ Failed to fetch Pastebin:", e);
                sendPresence("🎮 Status Online");
            }
        } else {
            sendPresence(status || "I'm online 24/7 🚀");

            // ✅ Only run keepalive if not using Pastebin
            const interval = setInterval(() => {
                if (client.sessionStarted) {
                    sendPresence(status || "I'm online 24/7 🚀");
                }
            }, 45000);

            activeClients[account_id].interval = interval;
        }
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
    const { account_id, access_token, status, pastebin_url, disable } = req.body;

    if (!account_id) {
        return res.status(400).json({ success: false, message: "Missing account_id." });
    }

    if (disable) {
        disconnectUser(account_id);
        return res.json({ success: true, message: "Presence disabled." });
    }

    if (!access_token) {
        return res.status(400).json({ success: false, message: "Missing access_token." });
    }

    // If already connected, update presence or re-init pastebin
    if (activeClients[account_id] && activeClients[account_id].client.sessionStarted) {
        if (pastebin_url) {
            disconnectUser(account_id);
            connectUser({ account_id, access_token, pastebin_url });
        } else {
            activeClients[account_id].client.sendPresence({
                status: status || "I'm online 24/7 🚀",
                onlineType: "online",
                bIsPlaying: true,
                ProductName: "Fortnite"
            });
        }

        return res.json({ success: true, message: "Presence updated." });
    }

    disconnectUser(account_id);
    connectUser({ account_id, access_token, status, pastebin_url });

    return res.json({ success: true, message: "Presence enabled." });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Presence Manager with Pastebin fixed rotation on port ${PORT}`);
});
