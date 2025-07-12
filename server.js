const express = require('express');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

// Game rooms storage
const gameRooms = new Map();

// Serve static files
app.use(express.static(path.join(__dirname, '/')));

// Serve the main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log(`New connection: ${socket.id}`);
    
    // Host a new game
    socket.on('hostGame', (data) => {
        const gameCode = socket.id.substring(0, 8).toUpperCase();
        
        // Create new game room
        gameRooms.set(gameCode, {
            hostId: socket.id,
            hostColor: 'red',
            guestId: null,
            guestColor: 'yellow',
            gameState: null,
            board: null
        });
        
        // Join the room
        socket.join(gameCode);
        
        // Send game code to host
        socket.emit('gameCreated', {
            gameCode: gameCode,
            playerColor: 'red'
        });
        
        console.log(`Game created: ${gameCode} by ${socket.id}`);
    });
    
    // Join an existing game
    socket.on('joinGame', (data) => {
        const { gameCode } = data;
        const room = gameRooms.get(gameCode);
        
        if (!room) {
            socket.emit('error', { message: 'Game not found' });
            return;
        }
        
        if (room.guestId) {
            socket.emit('error', { message: 'Game is full' });
            return;
        }
        
        // Join the room
        socket.join(gameCode);
        room.guestId = socket.id;
        
        // Notify both players
        socket.emit('gameJoined', {
            gameCode: gameCode,
            playerColor: room.guestColor
        });
        
        io.to(room.hostId).emit('playerJoined', {
            gameCode: gameCode,
            opponentConnected: true
        });
        
        console.log(`Player ${socket.id} joined game: ${gameCode}`);
    });
    
    // Handle moves
    socket.on('move', (data) => {
        const { gameCode, fromX, fromY, toX, toY } = data;
        const room = gameRooms.get(gameCode);
        
        if (!room) return;
        
        // Broadcast move to the opponent
        if (socket.id === room.hostId) {
            io.to(room.guestId).emit('move', { fromX, fromY, toX, toY });
        } else if (socket.id === room.guestId) {
            io.to(room.hostId).emit('move', { fromX, fromY, toX, toY });
        }
    });
    
    // Sync game state
    socket.on('gameState', (data) => {
        const { gameCode, board, currentPlayer, gameState } = data;
        const room = gameRooms.get(gameCode);
        
        if (!room) return;
        
        // Store game state
        room.board = board;
        room.gameState = gameState;
        
        // Broadcast to opponent
        if (socket.id === room.hostId) {
            io.to(room.guestId).emit('gameState', { board, currentPlayer, gameState });
        } else if (socket.id === room.guestId) {
            io.to(room.hostId).emit('gameState', { board, currentPlayer, gameState });
        }
    });
    
    // Request current game state
    socket.on('getGameState', (data) => {
        const { gameCode } = data;
        const room = gameRooms.get(gameCode);
        
        if (!room || !room.board) return;
        
        socket.emit('gameState', {
            board: room.board,
            gameState: room.gameState
        });
    });
    
    // Chat message
    socket.on('chat', (data) => {
        const { gameCode, message } = data;
        const room = gameRooms.get(gameCode);
        
        if (!room) return;
        
        // Broadcast to everyone in the room except sender
        socket.to(gameCode).emit('chat', {
            sender: socket.id === room.hostId ? 'host' : 'guest',
            message: message
        });
    });
    
    // Handle disconnection
    socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
        
        // Check all game rooms for this player
        for (const [gameCode, room] of gameRooms.entries()) {
            if (room.hostId === socket.id || room.guestId === socket.id) {
                // Notify other player if they exist
                if (room.hostId === socket.id && room.guestId) {
                    io.to(room.guestId).emit('opponentDisconnected');
                } else if (room.guestId === socket.id && room.hostId) {
                    io.to(room.hostId).emit('opponentDisconnected');
                }
                
                // Clean up after some time
                setTimeout(() => {
                    if (gameRooms.has(gameCode)) {
                        gameRooms.delete(gameCode);
                        console.log(`Game ${gameCode} removed after disconnect`);
                    }
                }, 60000); // Keep room alive for 1 minute in case of reconnect
                
                break;
            }
        }
    });
});

// Start the server
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Open http://localhost:${PORT} in your browser to play the 3D Chess game`);
    console.log(`WebSocket server active for multiplayer functionality`);
});