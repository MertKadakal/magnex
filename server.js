const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Serve static files from the current directory
app.use(express.static(__dirname));

// Serve index.html as the primary entry point
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Game state storage
const rooms = {}; // roomCode -> { p1: socketId, p2: socketId, players: { [socketId]: 'p1'|'p2' } }
let matchmakingQueue = []; // Array of socket IDs waiting for a match
const arenaShapes = ['circle', 'square', 'triangle'];

function randomArenaShape() {
    return arenaShapes[Math.floor(Math.random() * arenaShapes.length)];
}

io.on('connection', (socket) => {
    console.log(`[Socket] User connected: ${socket.id}`);

    // Helper: Clean up matchmaking queue for this socket
    const removeFromQueue = (socketId) => {
        const initialLength = matchmakingQueue.length;
        matchmakingQueue = matchmakingQueue.filter(id => id !== socketId);
        if (matchmakingQueue.length !== initialLength) {
            console.log(`[Matchmaking] Removed user from queue: ${socketId}`);
        }
    };

    // Helper: Clean up rooms this socket was in
    const cleanRooms = (socketId) => {
        for (const roomCode in rooms) {
            const room = rooms[roomCode];
            if (room.p1 === socketId || room.p2 === socketId) {
                console.log(`[Rooms] Opponent disconnected from room ${roomCode}. Informing other player.`);
                socket.to(roomCode).emit('opponent_disconnected');
                delete rooms[roomCode];
                console.log(`[Rooms] Room ${roomCode} deleted.`);
            }
        }
    };

    // 1. Create Room Mode
    socket.on('create_room', (roomCode) => {
        removeFromQueue(socket.id);
        
        if (rooms[roomCode]) {
            socket.emit('error_message', 'Bu oda kodu zaten kullanımda! Lütfen başka bir kod deneyin.');
            return;
        }

        rooms[roomCode] = {
            p1: socket.id,
            p2: null,
            arenaShape: randomArenaShape(),
            players: { [socket.id]: 'p1' }
        };

        socket.join(roomCode);
        socket.emit('room_created', roomCode);
        console.log(`[Rooms] Room created: ${roomCode} by ${socket.id}`);
    });

    // 2. Join Room Mode
    socket.on('join_room', (roomCode) => {
        removeFromQueue(socket.id);

        const room = rooms[roomCode];
        if (!room) {
            socket.emit('error_message', 'Oda bulunamadı! Lütfen kodu doğru girdiğinizden emin olun.');
            return;
        }

        if (room.p2) {
            socket.emit('error_message', 'Bu oda zaten dolu!');
            return;
        }

        room.p2 = socket.id;
        room.players[socket.id] = 'p2';

        socket.join(roomCode);
        socket.emit('room_joined', roomCode);

        console.log(`[Rooms] User ${socket.id} joined room ${roomCode}`);

        // Notify both players to start the game
        io.to(room.p1).emit('start_online_game', {
            roomCode: roomCode,
            playerRole: 'p1',
            arenaShape: room.arenaShape,
            opponentId: room.p2
        });

        io.to(room.p2).emit('start_online_game', {
            roomCode: roomCode,
            playerRole: 'p2',
            arenaShape: room.arenaShape,
            opponentId: room.p1
        });
    });

    // 3. Matchmaking Mode: Find Match
    socket.on('join_matchmaking', () => {
        removeFromQueue(socket.id);
        cleanRooms(socket.id);

        // Check if there is someone in the queue already
        if (matchmakingQueue.length > 0) {
            // Pair up!
            const opponentId = matchmakingQueue.shift();
            
            // Check if opponent is still connected
            const opponentSocket = io.sockets.sockets.get(opponentId);
            if (!opponentSocket) {
                // Opponent is gone, put this user back in queue
                matchmakingQueue.push(socket.id);
                socket.emit('waiting_for_match');
                return;
            }

            // Generate a random 4-digit room code
            let roomCode;
            do {
                roomCode = Math.floor(1000 + Math.random() * 9000).toString();
            } while (rooms[roomCode]);

            rooms[roomCode] = {
                p1: opponentId,
                p2: socket.id,
                arenaShape: randomArenaShape(),
                players: { [opponentId]: 'p1', [socket.id]: 'p2' }
            };

            opponentSocket.join(roomCode);
            socket.join(roomCode);

            console.log(`[Matchmaking] Match found! Room ${roomCode} created for P1:${opponentId} and P2:${socket.id}`);

            // Start game for both
            io.to(opponentId).emit('start_online_game', {
                roomCode: roomCode,
                playerRole: 'p1',
                arenaShape: rooms[roomCode].arenaShape,
                opponentId: socket.id
            });

            io.to(socket.id).emit('start_online_game', {
                roomCode: roomCode,
                playerRole: 'p2',
                arenaShape: rooms[roomCode].arenaShape,
                opponentId: opponentId
            });

        } else {
            // Put in queue
            matchmakingQueue.push(socket.id);
            socket.emit('waiting_for_match');
            console.log(`[Matchmaking] User ${socket.id} added to queue. Queue size: ${matchmakingQueue.length}`);
        }
    });

    // 4. Cancel/Leave Matchmaking
    socket.on('leave_matchmaking', () => {
        removeFromQueue(socket.id);
        socket.emit('left_matchmaking');
    });

    // 5. Sync Magnet Placement
    socket.on('place_magnet', ({ roomCode, x, y }) => {
        console.log(`[Sync] Magnet placed in room ${roomCode} by ${socket.id} at (${x}, ${y})`);
        socket.to(roomCode).emit('opponent_placed_magnet', { x, y });
    });

    socket.on('place_obstacle', ({ roomCode, x, y, angle }) => {
        console.log(`[Sync] Obstacle placed in room ${roomCode} by ${socket.id} at (${x}, ${y}) angle ${angle}`);
        socket.to(roomCode).emit('opponent_placed_obstacle', { x, y, angle });
    });

    // 6. Sync Restart Request
    socket.on('restart_request', ({ roomCode }) => {
        console.log(`[Sync] Restart requested in room ${roomCode} by ${socket.id}`);
        socket.to(roomCode).emit('opponent_restart_request');
    });

    // 7. Sync Restart Confirmation
    socket.on('restart_confirm', ({ roomCode }) => {
        console.log(`[Sync] Restart confirmed in room ${roomCode}. Resetting board.`);
        if (rooms[roomCode]) {
            rooms[roomCode].arenaShape = randomArenaShape();
        }
        io.to(roomCode).emit('restart_game', {
            arenaShape: rooms[roomCode] ? rooms[roomCode].arenaShape : randomArenaShape()
        });
    });

    // 8. Disconnect
    socket.on('disconnect', () => {
        console.log(`[Socket] User disconnected: ${socket.id}`);
        removeFromQueue(socket.id);
        cleanRooms(socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`\n==================================================`);
    console.log(`🚀 MAGNEX ONLINE SERVER IS NOW RUNNING!`);
    console.log(`🔗 Local Access: http://localhost:${PORT}`);
    console.log(`==================================================\n`);
});
