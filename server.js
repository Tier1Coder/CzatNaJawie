const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/') {
        fs.readFile(path.join(__dirname, 'index.html'), (err, data) => {
            if (err) {
                res.writeHead(500);
                res.end('Error loading index.html');
            } else {
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(data);
            }
        });
    } else {
        res.writeHead(404);
        res.end();
    }
});

const wss = new WebSocket.Server({ server });

let clients = new Map();
let chatHistory = new Map();

function getChatKey(user1, user2) {
    return [user1, user2].sort().join('-');
}

wss.on('connection', (socket) => {
    let userName = null;

    socket.on('message', (message) => {
        const data = JSON.parse(message);

        if (data.type === 'login') {
            if ([...clients.values()].includes(data.name)) {
                socket.send(JSON.stringify({ type: 'error', message: 'Username already taken' }));
            } else {
                userName = data.name;
                clients.set(socket, userName);
                socket.send(JSON.stringify({ type: 'login', success: true, users: [...clients.values()] }));
                broadcast({ type: 'notification', users: [...clients.values()] });
            }
        } else if (data.type === 'message' && userName) {
            const recipient = [...clients.entries()].find(([_, name]) => name === data.to);
            if (recipient) {
                const chatKey = getChatKey(userName, data.to);
                if (!chatHistory.has(chatKey)) {
                    chatHistory.set(chatKey, []);
                }
                const messageEntry = { name: userName, message: data.message };
                chatHistory.get(chatKey).push(messageEntry);

                recipient[0].send(JSON.stringify({ type: 'message', name: userName, message: data.message }));
                socket.send(JSON.stringify({ type: 'message', name: userName, message: data.message }));
            }
        } else if (data.type === 'getHistory' && userName) {
            const chatKey = getChatKey(userName, data.with);
            if (chatHistory.has(chatKey)) {
                socket.send(JSON.stringify({ type: 'history', messages: chatHistory.get(chatKey) }));
            } else {
                socket.send(JSON.stringify({ type: 'history', messages: [] }));
            }
        }
    });

    socket.on('close', () => {
        if (userName) {
            clients.delete(socket);
            broadcast({ type: 'notification', users: [...clients.values()] });
        }
    });
});

function broadcast(data) {
    clients.forEach((_, client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
}

server.listen(8080, () => {
    console.log('Server is running on http://localhost:8080');
});
