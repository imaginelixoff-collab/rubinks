'use strict';
const { WebSocketServer } = require('ws');
const http = require('http');

const PORT = process.env.PORT || 3001;

const server = http.createServer((req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/plain',
    'Access-Control-Allow-Origin': '*'
  });
  res.end('RUBINKS WebSocket Server OK');
});

const wss = new WebSocketServer({ server });

// rooms: { code: { players: [ws, ...], state: {...} } }
const rooms = new Map();

function genCode() {
  let code;
  do { code = String(Math.floor(1000 + Math.random() * 9000)); }
  while (rooms.has(code));
  return code;
}

function broadcast(room, msg, exclude = null) {
  const data = JSON.stringify(msg);
  room.players.forEach(ws => {
    if (ws !== exclude && ws.readyState === 1) ws.send(data);
  });
}

function broadcastAll(room, msg) {
  const data = JSON.stringify(msg);
  room.players.forEach(ws => {
    if (ws.readyState === 1) ws.send(data);
  });
}

wss.on('connection', (ws) => {
  ws.roomCode = null;
  ws.playerIndex = -1;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.type) {
      case 'CREATE_ROOM': {
        const code = genCode();
        const room = { players: [ws], state: null, maxPlayers: msg.maxPlayers || 4 };
        rooms.set(code, room);
        ws.roomCode = code;
        ws.playerIndex = 0;
        ws.send(JSON.stringify({ type: 'ROOM_CREATED', code, playerIndex: 0 }));
        console.log(`Room ${code} créée (max ${room.maxPlayers} joueurs)`);
        break;
      }

      case 'JOIN_ROOM': {
        const code = msg.code;
        const room = rooms.get(code);
        if (!room) {
          ws.send(JSON.stringify({ type: 'ERROR', message: 'Room introuvable' }));
          return;
        }
        if (room.players.length >= room.maxPlayers) {
          ws.send(JSON.stringify({ type: 'ERROR', message: 'Room pleine' }));
          return;
        }
        const idx = room.players.length;
        room.players.push(ws);
        ws.roomCode = code;
        ws.playerIndex = idx;
        ws.send(JSON.stringify({ type: 'ROOM_JOINED', code, playerIndex: idx, totalPlayers: room.players.length }));
        broadcast(room, { type: 'PLAYER_JOINED', playerIndex: idx, totalPlayers: room.players.length }, ws);
        console.log(`Joueur ${idx} rejoint room ${code}`);
        if (room.players.length === room.maxPlayers) {
          broadcastAll(room, { type: 'GAME_START', totalPlayers: room.players.length });
        }
        break;
      }

      case 'GAME_STATE': {
        const room = rooms.get(ws.roomCode);
        if (!room) return;
        room.state = msg.state;
        broadcast(room, { type: 'GAME_STATE', state: msg.state, from: ws.playerIndex }, ws);
        break;
      }

      case 'ACTION': {
        const room = rooms.get(ws.roomCode);
        if (!room) return;
        broadcastAll(room, { type: 'ACTION', action: msg.action, playerIndex: ws.playerIndex });
        break;
      }

      case 'MOVE': {
        const room = rooms.get(ws.roomCode);
        if (!room) return;
        broadcast(room, { type: 'MOVE', dx: msg.dx, dy: msg.dy, playerIndex: ws.playerIndex }, ws);
        break;
      }

      case 'DODGE': {
        const room = rooms.get(ws.roomCode);
        if (!room) return;
        broadcastAll(room, { type: 'DODGE', dir: msg.dir, heroIndex: msg.heroIndex, playerIndex: ws.playerIndex });
        break;
      }

      // Relais : actions de combat + synchro monde (hôte) + démarrage de combat
      case 'CB_ACT':
      case 'CB_DODGE':
      case 'SYNC':
      case 'START_COMBAT': {
        const room = rooms.get(ws.roomCode);
        if (!room) return;
        broadcast(room, msg, ws); // renvoyé aux autres joueurs
        break;
      }

      case 'PING': {
        ws.send(JSON.stringify({ type: 'PONG' }));
        break;
      }
    }
  });

  ws.on('close', () => {
    if (!ws.roomCode) return;
    const room = rooms.get(ws.roomCode);
    if (!room) return;
    room.players = room.players.filter(p => p !== ws);
    if (room.players.length === 0) {
      rooms.delete(ws.roomCode);
      console.log(`Room ${ws.roomCode} supprimée (vide)`);
    } else {
      broadcastAll(room, { type: 'PLAYER_LEFT', playerIndex: ws.playerIndex });
      console.log(`Joueur ${ws.playerIndex} quitté room ${ws.roomCode}`);
    }
  });
});

server.listen(PORT, () => {
  console.log(`RUBINKS WebSocket Server sur le port ${PORT}`);
});
