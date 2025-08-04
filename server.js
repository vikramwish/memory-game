/**
 * Memory Game Server
 * Purpose: Node.js server with Express for serving static files and Socket.IO for real-time multiplayer functionality
 * Follows modular design principles with proper error handling and security measures
 */

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;

// Middleware for security - sanitize inputs and serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '10mb' }));

// Game state management
class GameState {
    constructor() {
        this.rooms = new Map();
        this.players = new Map();
    }

    /**
     * Create a new game room
     * @param {string} roomId - Unique identifier for the room
     * @param {Object} gameConfig - Configuration for the game
     */
    createRoom(roomId, gameConfig = {}) {
        const defaultConfig = {
            gridSize: 4,
            theme: 'emojis',
            maxPlayers: 2,
            timeLimit: null
        };

        this.rooms.set(roomId, {
            id: roomId,
            config: { ...defaultConfig, ...gameConfig },
            players: [],
            gameBoard: [],
            currentPlayer: 0,
            gameStarted: false,
            paused: false,
            pausedBy: null,
            pausedAt: null,
            scores: {},
            moves: 0,
            startTime: null,
            flippedCards: [],
            matchedPairs: 0
        });
    }

    /**
     * Add player to room with error handling
     * @param {string} roomId - Room identifier
     * @param {Object} player - Player object
     * @returns {boolean} Success status
     */
    addPlayerToRoom(roomId, player) {
        try {
            const room = this.rooms.get(roomId);
            if (!room) return false;
            
            if (room.players.length >= room.config.maxPlayers) return false;
            
            room.players.push(player);
            room.scores[player.id] = 0;
            this.players.set(player.id, { ...player, roomId });
            
            return true;
        } catch (error) {
            console.error('Error adding player to room:', error);
            return false;
        }
    }

    /**
     * Generate game board with shuffled card pairs
     * @param {Object} room - Room object
     */
    generateGameBoard(room) {
        const { gridSize, theme } = room.config;
        const totalCards = gridSize * gridSize;
        const pairs = totalCards / 2;

        // Define theme symbols
        const themes = {
            emojis: ['🎮', '🎯', '🎨', '🎭', '🎪', '🎫', '🎬', '🎤', '🎧', '🎼', '🎹', '🎺', '🎸', '🥁', '🎷', '🎻'],
            animals: ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🐔'],
            numbers: ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟', '🔢', '💯', '📊', '📈', '📉', '💹'],
            letters: ['🅰️', '🅱️', '🅾️', '🆎', '🅿️', '🆘', '🆒', '🆕', '🆓', '🆙', '🔤', '🔠', '🔡', '💠', '🔷', '🔶']
        };

        const symbols = themes[theme] || themes.emojis;
        const selectedSymbols = symbols.slice(0, pairs);
        
        // Create pairs and shuffle
        const cards = [];
        for (let i = 0; i < pairs; i++) {
            cards.push(
                { id: i * 2, symbol: selectedSymbols[i], matched: false, flipped: false },
                { id: i * 2 + 1, symbol: selectedSymbols[i], matched: false, flipped: false }
            );
        }
        
        // Fisher-Yates shuffle
        for (let i = cards.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [cards[i], cards[j]] = [cards[j], cards[i]];
        }
        
        room.gameBoard = cards;
    }
}

const gameState = new GameState();

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id}`);

    /**
     * Handle player joining a room
     */
    socket.on('join-room', (data) => {
        try {
            const { roomId, playerName } = data;
            
            // Input sanitization
            const sanitizedRoomId = roomId.replace(/[^a-zA-Z0-9-_]/g, '');
            const sanitizedPlayerName = playerName.replace(/[<>]/g, '').trim();
            
            if (!sanitizedRoomId || !sanitizedPlayerName) {
                socket.emit('error', { message: 'Invalid room ID or player name' });
                return;
            }

            // Create room if it doesn't exist
            if (!gameState.rooms.has(sanitizedRoomId)) {
                gameState.createRoom(sanitizedRoomId);
            }

            const player = {
                id: socket.id,
                name: sanitizedPlayerName,
                connected: true
            };

            const success = gameState.addPlayerToRoom(sanitizedRoomId, player);
            
            if (success) {
                socket.join(sanitizedRoomId);
                const room = gameState.rooms.get(sanitizedRoomId);
                
                socket.emit('room-joined', {
                    roomId: sanitizedRoomId,
                    playerId: socket.id,
                    room: {
                        players: room.players,
                        config: room.config
                    }
                });

                // Notify other players
                socket.to(sanitizedRoomId).emit('player-joined', player);
                
                console.log(`Player ${sanitizedPlayerName} joined room ${sanitizedRoomId}`);
            } else {
                socket.emit('error', { message: 'Unable to join room. Room may be full.' });
            }
        } catch (error) {
            console.error('Error handling join-room:', error);
            socket.emit('error', { message: 'Server error occurred' });
        }
    });

    /**
     * Handle game start
     */
    socket.on('start-game', (roomId) => {
        try {
            const room = gameState.rooms.get(roomId);
            if (!room) {
                socket.emit('error', { message: 'Room not found' });
                return;
            }

            // Check if player is in room
            const player = room.players.find(p => p.id === socket.id);
            if (!player) {
                socket.emit('error', { message: 'Player not in room' });
                return;
            }

            gameState.generateGameBoard(room);
            room.gameStarted = true;
            room.startTime = Date.now();
            room.currentPlayer = 0;
            room.moves = 0;

            // Broadcast game start to all players in room
            io.to(roomId).emit('game-started', {
                gameBoard: room.gameBoard.map(card => ({
                    id: card.id,
                    matched: card.matched,
                    flipped: false, // Hide symbols initially
                    symbol: card.symbol // Include symbol for client
                })),
                currentPlayer: room.players[room.currentPlayer],
                scores: room.scores
            });

            console.log(`Game started in room ${roomId}. Current player: ${room.players[room.currentPlayer].name} (${room.players[room.currentPlayer].id})`);
            console.log(`Players in room:`, room.players.map(p => ({ id: p.id, name: p.name })));
        } catch (error) {
            console.error('Error starting game:', error);
            socket.emit('error', { message: 'Error starting game' });
        }
    });

    /**
     * Handle card flip
     */
    socket.on('flip-card', (data) => {
        try {
            const { roomId, cardId } = data;
            const room = gameState.rooms.get(roomId);
            
            if (!room || !room.gameStarted) {
                socket.emit('error', { message: 'Game not started or room not found' });
                return;
            }

            if (room.paused) {
                socket.emit('error', { message: 'Game is currently paused' });
                return;
            }

            const currentPlayer = room.players[room.currentPlayer];
            if (currentPlayer.id !== socket.id) {
                console.log(`Turn check failed for ${socket.id}:`, {
                    currentPlayerIndex: room.currentPlayer,
                    currentPlayerId: currentPlayer.id,
                    socketId: socket.id,
                    players: room.players.map(p => ({ id: p.id, name: p.name }))
                });
                socket.emit('error', { message: 'Not your turn' });
                return;
            }

            const card = room.gameBoard.find(c => c.id === cardId);
            if (!card || card.matched || card.flipped) {
                socket.emit('error', { message: 'Invalid card selection' });
                return;
            }

            card.flipped = true;
            room.flippedCards.push(card);

            // Broadcast card flip
            io.to(roomId).emit('card-flipped', {
                cardId: card.id,
                symbol: card.symbol,
                playerId: socket.id
            });

            // Check for match when two cards are flipped
            if (room.flippedCards.length === 2) {
                const [card1, card2] = room.flippedCards;
                
                setTimeout(() => {
                    if (card1.symbol === card2.symbol) {
                        // Match found - same player gets another turn
                        card1.matched = true;
                        card2.matched = true;
                        room.scores[currentPlayer.id]++;
                        room.matchedPairs++;

                        io.to(roomId).emit('match-found', {
                            cards: [card1.id, card2.id],
                            playerId: currentPlayer.id,
                            scores: room.scores
                        });

                        // Check for game end
                        if (room.matchedPairs === room.gameBoard.length / 2) {
                            const endTime = Date.now();
                            const gameDuration = endTime - room.startTime;
                            
                            const winner = room.players.find(p => p.id === Object.keys(room.scores).reduce((a, b) => 
                                room.scores[a] > room.scores[b] ? a : b
                            ));
                            
                            io.to(roomId).emit('game-ended', {
                                scores: room.scores,
                                duration: gameDuration,
                                moves: room.moves,
                                winner: winner
                            });
                        }
                    } else {
                        // No match - flip cards back and switch turn
                        card1.flipped = false;
                        card2.flipped = false;
                        
                        io.to(roomId).emit('no-match', {
                            cards: [card1.id, card2.id]
                        });

                        // Switch to next player ONLY when no match
                        room.currentPlayer = (room.currentPlayer + 1) % room.players.length;
                        io.to(roomId).emit('turn-changed', {
                            currentPlayer: room.players[room.currentPlayer]
                        });
                    }

                    room.flippedCards = [];
                    room.moves++;
                }, 1500); // Show cards for 1.5 seconds
            }

        } catch (error) {
            console.error('Error handling card flip:', error);
            socket.emit('error', { message: 'Error processing card flip' });
        }
    });

    /**
     * Handle game pause
     */
    socket.on('pause-game', (data) => {
        try {
            const { roomId } = data;
            const room = gameState.rooms.get(roomId);
            
            if (!room || !room.gameStarted) {
                socket.emit('error', { message: 'Cannot pause: Game not started or room not found' });
                return;
            }

            const player = room.players.find(p => p.id === socket.id);
            if (!player) {
                socket.emit('error', { message: 'Player not in room' });
                return;
            }

            if (!room.paused) {
                room.paused = true;
                room.pausedBy = socket.id;
                room.pausedAt = Date.now();
                
                io.to(roomId).emit('game-paused', { 
                    pausedBy: socket.id,
                    pausedByName: player.name
                });
                
                console.log(`Game paused in room ${roomId} by ${player.name}`);
            }
        } catch (error) {
            console.error('Error pausing game:', error);
            socket.emit('error', { message: 'Error pausing game' });
        }
    });

    /**
     * Handle game resume
     */
    socket.on('resume-game', (data) => {
        try {
            const { roomId } = data;
            const room = gameState.rooms.get(roomId);
            
            if (!room || !room.gameStarted) {
                socket.emit('error', { message: 'Cannot resume: Game not started or room not found' });
                return;
            }

            const player = room.players.find(p => p.id === socket.id);
            if (!player) {
                socket.emit('error', { message: 'Player not in room' });
                return;
            }

            if (room.paused) {
                room.paused = false;
                
                // Adjust start time to account for pause duration
                if (room.pausedAt) {
                    const pauseDuration = Date.now() - room.pausedAt;
                    room.startTime += pauseDuration;
                }
                
                room.pausedBy = null;
                room.pausedAt = null;
                
                io.to(roomId).emit('game-resumed', { 
                    resumedBy: socket.id,
                    resumedByName: player.name
                });
                
                console.log(`Game resumed in room ${roomId} by ${player.name}`);
            }
        } catch (error) {
            console.error('Error resuming game:', error);
            socket.emit('error', { message: 'Error resuming game' });
        }
    });

    /**
     * Handle leaving room
     */
    socket.on('leave-room', (data) => {
        try {
            const { roomId } = data;
            const room = gameState.rooms.get(roomId);
            
            if (room) {
                const playerIndex = room.players.findIndex(p => p.id === socket.id);
                if (playerIndex !== -1) {
                    const player = room.players[playerIndex];
                    room.players.splice(playerIndex, 1);
                    
                    socket.leave(roomId);
                    socket.to(roomId).emit('player-left', player);
                    
                    // If no players left, clean up room
                    if (room.players.length === 0) {
                        gameState.rooms.delete(roomId);
                        console.log(`Room ${roomId} cleaned up - no players remaining`);
                    }
                    
                    console.log(`Player ${player.name} left room ${roomId}`);
                }
            }
            
            gameState.players.delete(socket.id);
        } catch (error) {
            console.error('Error handling leave-room:', error);
            socket.emit('error', { message: 'Error leaving room' });
        }
    });

    /**
     * Handle disconnection
     */
    socket.on('disconnect', () => {
        try {
            const playerData = gameState.players.get(socket.id);
            if (playerData) {
                const { roomId } = playerData;
                const room = gameState.rooms.get(roomId);
                
                if (room) {
                    // Mark player as disconnected
                    const player = room.players.find(p => p.id === socket.id);
                    if (player) {
                        player.connected = false;
                        socket.to(roomId).emit('player-disconnected', player);
                        
                        // Pause game if it's in progress
                        if (room.gameStarted && !room.paused) {
                            room.paused = true;
                            room.pausedBy = socket.id;
                            room.pausedAt = Date.now();
                            io.to(roomId).emit('game-paused', { 
                                pausedBy: socket.id,
                                reason: 'Player disconnected'
                            });
                        }
                    }
                }
                
                gameState.players.delete(socket.id);
            }
            
            console.log(`Player disconnected: ${socket.id}`);
        } catch (error) {
            console.error('Error handling disconnect:', error);
        }
    });
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// Start server
server.listen(PORT, () => {
    console.log(`Memory Game server running on port ${PORT}`);
    console.log(`Access the game at http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    server.close(() => {
        console.log('Server closed');
    });
});

module.exports = server;