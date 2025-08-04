/**
 * Memory Game Client-Side Logic
 * Purpose: Interactive card-matching game with accessibility features and multiplayer support
 * Follows modular design with proper error handling and user feedback
 */

class MemoryGame {
    constructor() {
        this.socket = null;
        this.gameState = {
            isPlaying: false,
            isPaused: false,
            isMultiplayer: false,
            roomId: null,
            playerId: null,
            playerName: '',
            currentPlayer: 0,
            players: [],
            cards: [],
            flippedCards: [],
            matchedPairs: 0,
            moves: 0,
            score: 0,
            timeElapsed: 0,
            pausedTime: 0,
            gameStartTime: null,
            gameConfig: {
                gridSize: 4,
                theme: 'emojis',
                timeLimit: null,
                maxPlayers: 2
            }
        };
        
        this.themes = {
            emojis: ['🎮', '🎯', '🎨', '🎪', '🎭', '🎸', '🎵', '⭐', '🌟', '💎', '🔮', '🎁', '🎉', '🎊', '🎈', '🎀', '🌈', '⚡'],
            animals: ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐯', '🦁', '🐸', '🐵', '🐧', '🐦', '🦄', '🐝', '🐛', '🦋'],
            numbers: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18'],
            letters: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R']
        };
        
        this.timer = null;
        this.flipTimeout = null;
        
        this.init();
    }

    /**
     * Initialize the game
     */
    init() {
        try {
            this.bindEvents();
            // DON'T initialize socket here - only when needed for multiplayer
            this.setupAccessibility();
            this.loadUserPreferences();
            
            // Show initial setup
            this.showGameSetup();
            
            console.log('Memory Game initialized successfully - Socket NOT connected yet');
        } catch (error) {
            this.handleError('Failed to initialize game', error);
        }
    }

    /**
     * Bind event listeners
     */
    bindEvents() {
        // Theme toggle
        const themeToggle = document.getElementById('theme-toggle');
        if (themeToggle) {
            themeToggle.addEventListener('click', () => this.toggleTheme());
        }

        // Help button
        const helpBtn = document.getElementById('help-btn');
        if (helpBtn) {
            helpBtn.addEventListener('click', () => this.showHelp());
        }

        // Pause button
        const pauseBtn = document.getElementById('pause-btn');
        if (pauseBtn) {
            pauseBtn.addEventListener('click', () => this.togglePause());
        }

        // Game setup form
        const startSingleBtn = document.getElementById('start-single');
        if (startSingleBtn) {
            startSingleBtn.addEventListener('click', () => this.startSinglePlayer());
        }

        const createRoomBtn = document.getElementById('create-room');
        if (createRoomBtn) {
            createRoomBtn.addEventListener('click', () => this.createMultiplayerRoom());
        }

        const joinRoomBtn = document.getElementById('join-room');
        if (joinRoomBtn) {
            joinRoomBtn.addEventListener('click', () => this.joinMultiplayerRoom());
        }

        // Game action buttons
        const restartBtn = document.getElementById('restart-game-btn');
        if (restartBtn) {
            restartBtn.addEventListener('click', () => this.restartGame());
        }

        const mainMenuBtn = document.getElementById('main-menu-btn');
        if (mainMenuBtn) {
            mainMenuBtn.addEventListener('click', () => this.returnToSetup());
        }

        // Modal close buttons
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal-close') || e.target.classList.contains('modal')) {
                this.closeModal();
            }
        });

        // Keyboard navigation
        document.addEventListener('keydown', (e) => this.handleKeydown(e));
        
        // ESC key for modals and pause
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (document.querySelector('.modal.active')) {
                    this.closeModal();
                } else if (this.gameState.isPlaying && !this.gameState.isPaused) {
                    this.pauseGame();
                }
            }
            // P key for pause
            if (e.key === 'p' || e.key === 'P') {
                if (this.gameState.isPlaying) {
                    this.togglePause();
                }
            }
            // R key for reset stuck cards (debugging)
            if (e.key === 'r' || e.key === 'R') {
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    this.resetStuckCards();
                }
            }
        });

        // Form changes
        const gridSizeSelect = document.getElementById('grid-size');
        const themeSelect = document.getElementById('theme-select');
        
        if (gridSizeSelect) {
            gridSizeSelect.addEventListener('change', (e) => {
                this.gameState.gameConfig.gridSize = parseInt(e.target.value);
            });
        }
        
        if (themeSelect) {
            themeSelect.addEventListener('change', (e) => {
                this.gameState.gameConfig.theme = e.target.value;
            });
        }
    }

    /**
     * Initialize Socket.IO connection (ONLY FOR MULTIPLAYER)
     */
    initializeSocket() {
        if (this.socket) {
            console.log('Socket already initialized, skipping...');
            return;
        }
        
        try {
            console.log('INITIALIZING SOCKET FOR MULTIPLAYER ONLY');
            this.socket = io();
            
            this.socket.on('connect', () => {
                console.log('MULTIPLAYER: Connected to server with ID:', this.socket.id);
                this.gameState.playerId = this.socket.id;
            });

            this.socket.on('disconnect', () => {
                console.log('MULTIPLAYER: Disconnected from server');
                this.showStatus('Connection lost. Trying to reconnect...', 'error');
            });

            this.socket.on('room-joined', (data) => {
                this.handleRoomJoined(data);
            });

            this.socket.on('player-joined', (data) => {
                this.handlePlayerJoined(data);
            });

            this.socket.on('player-disconnected', (data) => {
                this.handlePlayerDisconnected(data);
            });

            this.socket.on('game-started', (data) => {
                this.handleGameStarted(data);
            });

            this.socket.on('card-flipped', (data) => {
                this.handleCardFlipped(data);
            });

            this.socket.on('match-found', (data) => {
                this.handleMatchFound(data);
            });

            this.socket.on('no-match', (data) => {
                this.handleNoMatch(data);
            });

            this.socket.on('turn-changed', (data) => {
                this.handleTurnChanged(data);
            });

            this.socket.on('game-ended', (data) => {
                this.handleGameEnded(data);
            });

            this.socket.on('game-paused', (data) => {
                this.handleGamePaused(data);
            });

            this.socket.on('game-resumed', (data) => {
                this.handleGameResumed(data);
            });

            this.socket.on('error', (error) => {
                this.handleError('Server error', error);
            });

        } catch (error) {
            this.handleError('Failed to initialize socket connection', error);
        }
    }

    /**
     * Setup accessibility features
     */
    setupAccessibility() {
        // Add ARIA live region for announcements
        const liveRegion = document.createElement('div');
        liveRegion.id = 'live-region';
        liveRegion.setAttribute('aria-live', 'polite');
        liveRegion.setAttribute('aria-atomic', 'true');
        liveRegion.style.position = 'absolute';
        liveRegion.style.left = '-10000px';
        liveRegion.style.width = '1px';
        liveRegion.style.height = '1px';
        liveRegion.style.overflow = 'hidden';
        document.body.appendChild(liveRegion);
    }

    /**
     * Announce message to screen readers
     */
    announce(message) {
        const liveRegion = document.getElementById('live-region');
        if (liveRegion) {
            liveRegion.textContent = message;
        }
    }

    /**
     * Toggle pause state
     */
    togglePause() {
        if (this.gameState.isPaused) {
            this.resumeGame();
        } else {
            this.pauseGame();
        }
    }

    /**
     * Pause the game
     */
    pauseGame() {
        if (!this.gameState.isPlaying || this.gameState.isPaused) return;
        
        this.gameState.isPaused = true;
        this.gameState.pausedTime = Date.now();
        this.stopTimer();
        
        if (this.gameState.isMultiplayer) {
            this.socket.emit('pause-game', { roomId: this.gameState.roomId });
        }
        
        this.showPauseModal();
        this.announce('Game paused');
    }

    /**
     * Resume the game
     */
    resumeGame() {
        if (!this.gameState.isPaused) return;
        
        this.gameState.isPaused = false;
        
        // Adjust start time to account for pause duration
        if (this.gameState.pausedTime) {
            const pauseDuration = Date.now() - this.gameState.pausedTime;
            this.gameState.gameStartTime += pauseDuration;
        }
        
        this.startTimer();
        this.closeModal();
        
        if (this.gameState.isMultiplayer) {
            this.socket.emit('resume-game', { roomId: this.gameState.roomId });
        }
        
        this.announce('Game resumed');
    }

    /**
     * Show pause modal
     */
    showPauseModal() {
        const pauseContent = `
            <div class="pause-content">
                <h3>⏸️ Game Paused</h3>
                <p>The game is currently paused. Click resume to continue playing.</p>
                ${this.gameState.isMultiplayer ? '<p><em>All players will be notified when you resume.</em></p>' : ''}
                <div style="margin-top: 1.5rem; display: flex; gap: 1rem; justify-content: center;">
                    <button class="btn btn-primary" onclick="memoryGame.resumeGame()">Resume Game</button>
                    <button class="btn btn-secondary" onclick="memoryGame.returnToSetup()">Quit Game</button>
                </div>
                <div style="margin-top: 1rem; font-size: 0.9rem; color: var(--text-secondary);">
                    <p>Press <kbd>P</kbd> or <kbd>Esc</kbd> to resume • <kbd>Q</kbd> to quit</p>
                </div>
            </div>
        `;
        
        const modal = this.createModal('Game Paused', pauseContent);
        this.showModal(modal);
    }
    /**
     * Handle keyboard navigation
     */
    handleKeydown(e) {
        // Don't handle game keys if game is paused or not playing
        if (!this.gameState.isPlaying || this.gameState.isPaused) return;

        const gameBoard = document.querySelector('.game-board');
        if (!gameBoard) return;

        const cards = Array.from(gameBoard.querySelectorAll('.memory-card'));
        const focusedCard = document.activeElement;
        const currentIndex = cards.indexOf(focusedCard);

        if (currentIndex === -1) return;

        const gridSize = this.gameState.gameConfig.gridSize;
        let nextIndex = currentIndex;

        switch (e.key) {
            case 'ArrowRight':
                e.preventDefault();
                nextIndex = (currentIndex + 1) % cards.length;
                break;
            case 'ArrowLeft':
                e.preventDefault();
                nextIndex = currentIndex === 0 ? cards.length - 1 : currentIndex - 1;
                break;
            case 'ArrowDown':
                e.preventDefault();
                nextIndex = (currentIndex + gridSize) % cards.length;
                break;
            case 'ArrowUp':
                e.preventDefault();
                nextIndex = currentIndex - gridSize < 0 ? 
                    cards.length + (currentIndex - gridSize) : currentIndex - gridSize;
                break;
            case 'Enter':
            case ' ':
                e.preventDefault();
                this.flipCard(focusedCard, currentIndex);
                return;
        }

        if (nextIndex !== currentIndex && cards[nextIndex]) {
            cards[nextIndex].focus();
        }
    }

    /**
     * Load user preferences from localStorage
     */
    loadUserPreferences() {
        try {
            const savedTheme = localStorage.getItem('memoryGameTheme');
            if (savedTheme && (savedTheme === 'light' || savedTheme === 'dark')) {
                document.body.classList.toggle('dark-mode', savedTheme === 'dark');
                this.updateThemeIcon(savedTheme === 'dark');
            }

            const savedPrefs = localStorage.getItem('memoryGamePrefs');
            if (savedPrefs) {
                const prefs = JSON.parse(savedPrefs);
                this.gameState.gameConfig = { ...this.gameState.gameConfig, ...prefs };
                this.updateFormValues();
            }
        } catch (error) {
            console.warn('Failed to load user preferences:', error);
        }
    }

    /**
     * Save user preferences to localStorage
     */
    saveUserPreferences() {
        try {
            const theme = document.body.classList.contains('dark-mode') ? 'dark' : 'light';
            localStorage.setItem('memoryGameTheme', theme);
            localStorage.setItem('memoryGamePrefs', JSON.stringify(this.gameState.gameConfig));
        } catch (error) {
            console.warn('Failed to save user preferences:', error);
        }
    }

    /**
     * Update form values from game config
     */
    updateFormValues() {
        const gridSizeSelect = document.getElementById('grid-size');
        const themeSelect = document.getElementById('theme-select');
        
        if (gridSizeSelect) {
            gridSizeSelect.value = this.gameState.gameConfig.gridSize;
        }
        
        if (themeSelect) {
            themeSelect.value = this.gameState.gameConfig.theme;
        }
    }

    /**
     * Toggle dark/light theme
     */
    toggleTheme() {
        document.body.classList.toggle('dark-mode');
        const isDark = document.body.classList.contains('dark-mode');
        this.updateThemeIcon(isDark);
        this.saveUserPreferences();
        
        this.announce(`Switched to ${isDark ? 'dark' : 'light'} mode`);
    }

    /**
     * Update theme icon
     */
    updateThemeIcon(isDark) {
        const themeIcon = document.querySelector('.theme-icon');
        if (themeIcon) {
            themeIcon.textContent = isDark ? '☀️' : '🌙';
        }
    }

    /**
     * Show game setup screen
     */
    showGameSetup() {
        const setupSection = document.querySelector('.game-setup');
        const gameSection = document.querySelector('.game-section');
        const pauseBtn = document.getElementById('pause-btn');
        
        if (setupSection) setupSection.style.display = 'block';
        if (gameSection) gameSection.style.display = 'none';
        if (pauseBtn) pauseBtn.style.display = 'none';
        
        this.updateFormValues();
    }

    /**
     * Hide game setup and show game
     */
    hideGameSetup() {
        const setupSection = document.querySelector('.game-setup');
        const gameSection = document.querySelector('.game-section');
        const pauseBtn = document.getElementById('pause-btn');
        
        if (setupSection) setupSection.style.display = 'none';
        if (gameSection) gameSection.style.display = 'block';
        if (pauseBtn) pauseBtn.style.display = 'inline-flex';
    }

    /**
     * Start single player game
     */
    startSinglePlayer() {
        try {
            console.log('Starting SINGLE PLAYER game - NO socket connection needed');
            
            this.gameState.isMultiplayer = false;
            this.gameState.isPlaying = true;
            this.gameState.playerName = document.getElementById('player-name')?.value || 'Player 1';
            
            // Ensure socket is null for single player
            this.socket = null;
            
            this.saveUserPreferences();
            this.initializeGame();
            this.hideGameSetup();
            this.hideRoomInfo();
            
            this.announce('Single player game started');
            this.showStatus('Game started! Find all matching pairs.', 'success');
            
        } catch (error) {
            this.handleError('Failed to start single player game', error);
        }
    }

    /**
     * Create multiplayer room
     */
    createMultiplayerRoom() {
        try {
            console.log('Starting MULTIPLAYER game - Initializing socket connection');
            
            this.gameState.playerName = document.getElementById('player-name')?.value || 'Player 1';
            
            if (!this.gameState.playerName.trim()) {
                this.showStatus('Please enter your name to create a room.', 'error');
                return;
            }

            // Initialize socket ONLY for multiplayer
            if (!this.socket) {
                this.initializeSocket();
            }

            // Wait for socket connection before creating room
            if (this.socket && this.socket.connected) {
                this.createRoom();
            } else {
                this.socket.on('connect', () => {
                    this.createRoom();
                });
            }
            
        } catch (error) {
            this.handleError('Failed to create multiplayer room', error);
        }
    }

    /**
     * Actually create the room (called after socket connection)
     */
    createRoom() {
        // Generate a random room ID
        const roomId = this.generateRoomId();
        
        console.log('Creating room with ID:', roomId, 'Player name:', this.gameState.playerName);
        console.log('Socket connected?', this.socket.connected);
        
        this.socket.emit('join-room', {
            roomId: roomId,
            playerName: this.gameState.playerName
        });
        
        this.showStatus('Creating room...', 'warning');
        
        // Add timeout to detect if room creation fails
        setTimeout(() => {
            if (this.gameState.roomId !== roomId) {
                console.log('Room creation timeout - no response from server');
                this.showStatus('Failed to create room. Please try again.', 'error');
            }
        }, 5000);
    }

    /**
     * Join multiplayer room
     */
    joinMultiplayerRoom() {
        try {
            console.log('Joining MULTIPLAYER room - Initializing socket connection');
            
            const roomId = document.getElementById('room-id')?.value;
            this.gameState.playerName = document.getElementById('player-name')?.value || 'Player 2';
            
            if (!roomId || !this.gameState.playerName.trim()) {
                this.showStatus('Please enter both room ID and your name.', 'error');
                return;
            }

            // Initialize socket ONLY for multiplayer
            if (!this.socket) {
                this.initializeSocket();
            }

            // Wait for socket connection before joining room
            if (this.socket && this.socket.connected) {
                this.joinRoom(roomId);
            } else {
                this.socket.on('connect', () => {
                    this.joinRoom(roomId);
                });
            }
            
        } catch (error) {
            this.handleError('Failed to join multiplayer room', error);
        }
    }

    /**
     * Actually join the room (called after socket connection)
     */
    joinRoom(roomId) {
        console.log('Joining room with ID:', roomId, 'Player name:', this.gameState.playerName);

        this.socket.emit('join-room', {
            roomId: roomId.trim().toUpperCase(),
            playerName: this.gameState.playerName
        });
        
        this.showStatus('Joining room...', 'warning');
    }

    /**
     * Generate a random room ID
     */
    generateRoomId() {
        return Math.random().toString(36).substring(2, 8).toUpperCase();
    }

    /**
     * Initialize game board and cards
     */
    initializeGame() {
        try {
            const { gridSize, theme } = this.gameState.gameConfig;
            const totalCards = gridSize * gridSize;
            const pairsNeeded = totalCards / 2;
            
            // Get symbols for the theme
            const symbols = this.themes[theme] || this.themes.emojis;
            const gameSymbols = symbols.slice(0, pairsNeeded);
            
            // Create pairs and shuffle
            const cards = [...gameSymbols, ...gameSymbols];
            this.shuffleArray(cards);
            
            this.gameState.cards = cards.map((symbol, index) => ({
                id: index,
                symbol: symbol,
                isFlipped: false,
                isMatched: false
            }));
            
            // Initialize player state for single-player
            if (!this.gameState.isMultiplayer) {
                this.gameState.currentPlayer = 0;
                this.gameState.players = [{ id: 'single-player', name: this.gameState.playerName }];
                this.gameState.playerId = 'single-player';
            }
            
            this.renderGameBoard();
            this.startTimer();
            
        } catch (error) {
            this.handleError('Failed to initialize game', error);
        }
    }

    /**
     * Shuffle array using Fisher-Yates algorithm
     */
    shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }

    /**
     * Render the game board
     */
    renderGameBoard() {
        const gameBoard = document.querySelector('.game-board');
        if (!gameBoard) return;

        const { gridSize } = this.gameState.gameConfig;
        gameBoard.className = `game-board grid-${gridSize}x${gridSize}`;
        gameBoard.innerHTML = '';
        
        this.gameState.cards.forEach((card, index) => {
            const cardElement = this.createCardElement(card, index);
            gameBoard.appendChild(cardElement);
        });
        
        // Focus first card for accessibility
        const firstCard = gameBoard.querySelector('.memory-card');
        if (firstCard) {
            firstCard.focus();
        }
    }

    /**
     * Create a card element
     */
    createCardElement(card, index) {
        console.log(`Creating card element for index ${index}:`, card);
        
        const cardElement = document.createElement('button');
        cardElement.className = 'memory-card';
        cardElement.setAttribute('data-index', index);
        cardElement.setAttribute('aria-label', `Card ${index + 1}`);
        cardElement.setAttribute('tabindex', '0');
        
        const cardContent = document.createElement('span');
        cardContent.className = 'card-content';
        cardContent.textContent = card.symbol;
        cardContent.setAttribute('aria-hidden', 'true');
        
        console.log(`Card content created with symbol: ${card.symbol}`);
        
        cardElement.appendChild(cardContent);
        
        cardElement.addEventListener('click', () => this.flipCard(cardElement, index));
        
        // Update visual state
        this.updateCardVisualState(cardElement, card);
        
        return cardElement;
    }

    /**
     * Update card visual state
     */
    updateCardVisualState(cardElement, card) {
        if (!cardElement || !card) return;
        
        console.log(`Updating visual for card ${cardElement.dataset.index}:`, {
            symbol: card.symbol,
            isFlipped: card.isFlipped,
            isMatched: card.isMatched
        });
        
        // Update classes
        cardElement.classList.toggle('flipped', card.isFlipped);
        cardElement.classList.toggle('matched', card.isMatched);
        
        // Disable only matched cards or when we have 2 flipped cards and this isn't one of them
        const shouldDisable = card.isMatched || 
                             (this.gameState.flippedCards.length >= 2 && !card.isFlipped);
        cardElement.classList.toggle('disabled', shouldDisable);
        
        // Update content
        const cardContent = cardElement.querySelector('.card-content');
        if (cardContent) {
            cardContent.textContent = card.symbol;
        }
        
        // Update aria label
        const cardIndex = parseInt(cardElement.dataset.index);
        const ariaLabel = `Card ${cardIndex + 1}`;
        if (card.isMatched) {
            cardElement.setAttribute('aria-label', `${ariaLabel}, matched`);
        } else if (card.isFlipped) {
            cardElement.setAttribute('aria-label', `${ariaLabel}, showing ${card.symbol}`);
        } else {
            cardElement.setAttribute('aria-label', ariaLabel);
        }
    }

    /**
     * Flip a card
     */
    flipCard(cardElement, index) {
        console.log(`=== FLIP CARD START - Index: ${index} ===`);
        
        // Basic validation
        if (!this.gameState.isPlaying || this.gameState.isPaused) {
            console.log('Game not active, blocking flip');
            return;
        }
        
        const card = this.gameState.cards[index];
        if (!card) {
            console.log('Card not found');
            return;
        }
        
        // Check if card can be flipped
        if (card.isFlipped || card.isMatched) {
            console.log('Card already flipped or matched');
            return;
        }
        
        // Check if we already have 2 cards flipped
        if (this.gameState.flippedCards.length >= 2) {
            console.log('Already have 2 cards flipped, blocking');
            return;
        }
        
        // For multiplayer, check turn
        if (this.gameState.isMultiplayer && this.gameState.currentPlayer !== this.getPlayerIndex()) {
            this.showStatus("It's not your turn!", 'warning');
            return;
        }
        
        console.log('FLIPPING CARD:', card.symbol);
        
        // Flip the card
        card.isFlipped = true;
        this.gameState.flippedCards.push(index);
        this.updateCardVisualState(cardElement, card);
        
        // Announce flip
        this.announce(`Flipped card showing ${card.symbol}`);
        
        // Handle based on game mode
        if (this.gameState.isMultiplayer && this.socket) {
            // MULTIPLAYER: Send to server
            this.socket.emit('flip-card', {
                roomId: this.gameState.roomId,
                cardId: card.id
            });
        } else {
            // SINGLE PLAYER: Handle locally
            this.handleSinglePlayerFlip();
        }
        
        console.log(`=== FLIP CARD END - Flipped cards: ${this.gameState.flippedCards.length} ===`);
    }

    /**
     * Handle single player card flip logic
     */
    handleSinglePlayerFlip() {
        console.log(`=== SINGLE PLAYER FLIP HANDLER ===`);
        console.log('Flipped cards:', this.gameState.flippedCards.length);
        
        if (this.gameState.flippedCards.length === 1) {
            console.log('First card flipped, waiting for second');
            return;
        }
        
        if (this.gameState.flippedCards.length === 2) {
            console.log('Two cards flipped, processing match...');
            
            // Increment moves
            this.gameState.moves++;
            this.updateGameInfo();
            
            const [firstIndex, secondIndex] = this.gameState.flippedCards;
            const firstCard = this.gameState.cards[firstIndex];
            const secondCard = this.gameState.cards[secondIndex];
            
            console.log('Checking match:', {
                first: firstCard.symbol,
                second: secondCard.symbol,
                match: firstCard.symbol === secondCard.symbol
            });
            
            if (firstCard.symbol === secondCard.symbol) {
                // MATCH FOUND
                console.log('MATCH FOUND!');
                setTimeout(() => {
                    this.processSinglePlayerMatch(firstIndex, secondIndex);
                }, 800);
            } else {
                // NO MATCH
                console.log('NO MATCH - will flip back');
                setTimeout(() => {
                    this.processSinglePlayerNoMatch();
                }, 1200);
            }
        }
    }

    /**
     * Process single player match
     */
    processSinglePlayerMatch(firstIndex, secondIndex) {
        console.log('=== PROCESSING MATCH ===');
        
        const firstCard = this.gameState.cards[firstIndex];
        const secondCard = this.gameState.cards[secondIndex];
        
        // Mark as matched
        firstCard.isMatched = true;
        secondCard.isMatched = true;
        
        // Update game state
        this.gameState.matchedPairs++;
        this.gameState.score += 10;
        this.gameState.flippedCards = [];
        
        // Update visual
        const firstElement = document.querySelector(`[data-index="${firstIndex}"]`);
        const secondElement = document.querySelector(`[data-index="${secondIndex}"]`);
        
        if (firstElement) this.updateCardVisualState(firstElement, firstCard);
        if (secondElement) this.updateCardVisualState(secondElement, secondCard);
        
        this.showStatus('Great match!', 'success');
        this.announce(`Match found! ${firstCard.symbol}`);
        this.updateGameInfo();
        
        // Check win condition
        const totalPairs = this.gameState.cards.length / 2;
        if (this.gameState.matchedPairs === totalPairs) {
            setTimeout(() => {
                this.endGame(true);
            }, 500);
        }
        
        console.log('Match processed successfully');
    }

    /**
     * Process single player no match
     */
    processSinglePlayerNoMatch() {
        console.log('=== PROCESSING NO MATCH ===');
        
        const [firstIndex, secondIndex] = this.gameState.flippedCards;
        const firstCard = this.gameState.cards[firstIndex];
        const secondCard = this.gameState.cards[secondIndex];
        
        console.log('Flipping back cards:', firstCard.symbol, secondCard.symbol);
        
        // Flip cards back
        firstCard.isFlipped = false;
        secondCard.isFlipped = false;
        
        // Clear flipped cards
        this.gameState.flippedCards = [];
        
        // Update visual
        const firstElement = document.querySelector(`[data-index="${firstIndex}"]`);
        const secondElement = document.querySelector(`[data-index="${secondIndex}"]`);
        
        if (firstElement) this.updateCardVisualState(firstElement, firstCard);
        if (secondElement) this.updateCardVisualState(secondElement, secondCard);
        
        // Update all cards to ensure proper state
        this.updateAllCards();
        
        this.announce('No match, cards flipped back');
        
        console.log('No match processed - ready for next turn');
    }

    /**
     * Update all card states
     */
    updateAllCards() {
        this.gameState.cards.forEach((card, index) => {
            const cardElement = document.querySelector(`[data-index="${index}"]`);
            if (cardElement) {
                this.updateCardVisualState(cardElement, card);
            }
        });
    }

    /**
     * Emergency reset for stuck cards (for debugging)
     */
    resetStuckCards() {
        console.log('EMERGENCY: Resetting stuck cards');
        
        // Clear any timeouts
        if (this.flipTimeout) {
            clearTimeout(this.flipTimeout);
            this.flipTimeout = null;
        }
        
        // Reset all non-matched cards to unflipped state
        this.gameState.cards.forEach((card, index) => {
            if (!card.isMatched) {
                card.isFlipped = false;
            }
        });
        
        // Clear flipped cards array
        this.gameState.flippedCards = [];
        
        // Update all visual states
        this.updateAllCards();
        
        this.showStatus('Cards reset - ready to continue', 'success');
        console.log('Emergency reset complete');
    }

    /**
     * Debug function - expose to global scope for testing
     */
    debug() {
        return {
            gameState: this.gameState,
            resetStuckCards: () => this.resetStuckCards(),
            forceProcessFlip: () => this.processCardFlip()
        };
    }

    /**
     * Get current player index
     */
    getPlayerIndex() {
        // In single-player mode, there's only one player (index 0)
        if (!this.gameState.isMultiplayer) {
            return 0;
        }
        
        // In multiplayer mode, find the player by ID
        const playerIndex = this.gameState.players.findIndex(player => player.id === this.gameState.playerId);
        console.log('getPlayerIndex result:', {
            playerId: this.gameState.playerId,
            players: this.gameState.players.map(p => ({id: p.id, name: p.name})),
            foundIndex: playerIndex
        });
        return playerIndex !== -1 ? playerIndex : 0;
    }

    /**
     * Start game timer
     */
    startTimer() {
        if (!this.gameState.gameStartTime) {
            this.gameState.gameStartTime = Date.now();
        }
        
        this.timer = setInterval(() => {
            if (!this.gameState.isPaused) {
                this.gameState.timeElapsed = Math.floor((Date.now() - this.gameState.gameStartTime) / 1000);
                this.updateGameInfo();
            }
        }, 1000);
    }

    /**
     * Stop game timer
     */
    stopTimer() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    /**
     * Update game information display
     */
    updateGameInfo() {
        const movesElement = document.getElementById('moves-count');
        const scoreElement = document.getElementById('score-count');
        const timeElement = document.getElementById('time-count');
        
        if (movesElement) movesElement.textContent = this.gameState.moves;
        if (scoreElement) scoreElement.textContent = this.gameState.score;
        if (timeElement) timeElement.textContent = this.formatTime(this.gameState.timeElapsed);
        
        // Update multiplayer info
        this.updatePlayersDisplay();
    }

    /**
     * Update players display for multiplayer
     */
    updatePlayersDisplay() {
        const playersContainer = document.querySelector('.players-list');
        if (!playersContainer || !this.gameState.isMultiplayer) return;
        
        playersContainer.innerHTML = '';
        
        this.gameState.players.forEach((player, index) => {
            const playerElement = document.createElement('div');
            playerElement.className = 'player-card';
            
            if (index === this.gameState.currentPlayer) {
                playerElement.classList.add('current-player');
            }
            
            if (player.id === this.gameState.playerId) {
                playerElement.classList.add('active');
            }
            
            playerElement.innerHTML = `
                <span class="player-name">${player.name}</span>
                <span class="player-score">${player.score || 0} points</span>
            `;
            
            playersContainer.appendChild(playerElement);
        });
        
        // Also update room display
        this.updateRoomDisplay();
    }

    /**
     * Update room display in header
     */
    updateRoomDisplay() {
        const roomDisplay = document.querySelector('.room-display');
        const turnDisplay = document.querySelector('.turn-display');
        
        if (!this.gameState.isMultiplayer || !roomDisplay || !turnDisplay) return;
        
        // Update room info
        roomDisplay.textContent = `Room: ${this.gameState.roomId}`;
        
        // Update turn info
        if (this.gameState.players && this.gameState.players.length > 0) {
            const currentPlayer = this.gameState.players[this.gameState.currentPlayer];
            if (currentPlayer) {
                const isMyTurn = currentPlayer.id === this.gameState.playerId;
                turnDisplay.textContent = isMyTurn ? "Your Turn" : `${currentPlayer.name}'s Turn`;
                turnDisplay.className = `turn-display ${isMyTurn ? 'my-turn' : 'other-turn'}`;
            }
        }
    }

    /**
     * Show room info header
     */
    showRoomInfo() {
        const roomInfoHeader = document.querySelector('.room-info-header');
        if (roomInfoHeader) {
            roomInfoHeader.style.display = 'flex';
            this.updateRoomDisplay();
        }
    }

    /**
     * Hide room info header
     */
    hideRoomInfo() {
        const roomInfoHeader = document.querySelector('.room-info-header');
        if (roomInfoHeader) {
            roomInfoHeader.style.display = 'none';
        }
    }

    /**
     * Format time in MM:SS
     */
    formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    /**
     * End the game
     */
    endGame(completed = false) {
        try {
            this.gameState.isPlaying = false;
            this.stopTimer();
            
            if (this.flipTimeout) {
                clearTimeout(this.flipTimeout);
                this.flipTimeout = null;
            }
            
            let message = '';
            if (completed) {
                message = `Congratulations! You completed the game in ${this.gameState.moves} moves and ${this.formatTime(this.gameState.timeElapsed)}!`;
                this.announce(message);
            } else {
                message = 'Game ended.';
            }
            
            this.showGameEndModal(message, completed);
            
        } catch (error) {
            this.handleError('Failed to end game', error);
        }
    }

    /**
     * Show game end modal
     */
    showGameEndModal(message, completed) {
        const modal = this.createModal('Game Complete', `
            <div class="status-message ${completed ? 'status-success' : 'status-warning'}">
                ${message}
            </div>
            <div class="game-stats">
                <p><strong>Score:</strong> ${this.gameState.score} points</p>
                <p><strong>Moves:</strong> ${this.gameState.moves}</p>
                <p><strong>Time:</strong> ${this.formatTime(this.gameState.timeElapsed)}</p>
            </div>
            <div style="margin-top: 1.5rem; display: flex; gap: 1rem; justify-content: center;">
                <button class="btn btn-primary" onclick="memoryGame.restartGame()">Play Again</button>
                <button class="btn btn-secondary" onclick="memoryGame.returnToSetup()">Main Menu</button>
            </div>
        `);
        
        this.showModal(modal);
    }

    /**
     * Restart the current game
     */
    restartGame() {
        this.closeModal();
        this.resetGameState();
        this.initializeGame();
        this.announce('Game restarted');
    }

    /**
     * Return to setup screen
     */
    returnToSetup() {
        this.closeModal();
        this.resetGameState();
        this.hideRoomInfo();
        this.showGameSetup();
        
        if (this.gameState.isMultiplayer && this.socket) {
            this.socket.emit('leaveRoom', { roomId: this.gameState.roomId });
        }
    }

    /**
     * Reset game state
     */
    resetGameState() {
        this.gameState.isPlaying = false;
        this.gameState.cards = [];
        this.gameState.flippedCards = [];
        this.gameState.matchedPairs = 0;
        this.gameState.moves = 0;
        this.gameState.score = 0;
        this.gameState.timeElapsed = 0;
        this.gameState.gameStartTime = null;
        
        this.stopTimer();
        
        if (this.flipTimeout) {
            clearTimeout(this.flipTimeout);
            this.flipTimeout = null;
        }
    }

    /**
     * Show help modal
     */
    showHelp() {
        const helpContent = `
            <div class="help-content">
                <div class="help-section">
                    <h3>🎯 Objective</h3>
                    <p>Find all matching pairs of cards by flipping them over two at a time. Complete the game in the fewest moves possible!</p>
                </div>
                
                <div class="help-section">
                    <h3>🎮 How to Play</h3>
                    <div class="help-steps">
                        <div class="help-step">
                            <span class="step-number">1</span>
                            <div class="step-content">
                                <strong>Choose Game Mode</strong>
                                <p>Select single-player for solo practice or multiplayer to compete with friends</p>
                            </div>
                        </div>
                        <div class="help-step">
                            <span class="step-number">2</span>
                            <div class="step-content">
                                <strong>Configure Settings</strong>
                                <p>Pick your grid size (2x2 for beginners, 4x4 for medium, 6x6 for experts) and theme</p>
                            </div>
                        </div>
                        <div class="help-step">
                            <span class="step-number">3</span>
                            <div class="step-content">
                                <strong>Start Playing</strong>
                                <p>Click or press Enter/Space on cards to flip them and reveal symbols</p>
                            </div>
                        </div>
                        <div class="help-step">
                            <span class="step-number">4</span>
                            <div class="step-content">
                                <strong>Find Matches</strong>
                                <p>Remember card locations and match identical symbols to score points</p>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="help-section">
                    <h3>⌨️ Keyboard Controls</h3>
                    <div class="keyboard-controls">
                        <div class="control-group">
                            <strong>Navigation:</strong>
                            <div class="keys">
                                <kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd> Move between cards
                            </div>
                        </div>
                        <div class="control-group">
                            <strong>Actions:</strong>
                            <div class="keys">
                                <kbd>Enter</kbd> or <kbd>Space</kbd> Flip selected card
                            </div>
                        </div>
                        <div class="control-group">
                            <strong>Game Controls:</strong>
                            <div class="keys">
                                <kbd>P</kbd> Pause/Resume game<br>
                                <kbd>Esc</kbd> Pause game or close modals
                            </div>
                        </div>
                        <div class="control-group">
                            <strong>Interface:</strong>
                            <div class="keys">
                                <kbd>Tab</kbd> Navigate through buttons and interface
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="help-section">
                    <h3>👥 Multiplayer Mode</h3>
                    <div class="multiplayer-info">
                        <div class="mp-step">
                            <strong>🏠 Creating a Room:</strong>
                            <p>Click "Create Room" to generate a unique room ID that you can share with friends</p>
                        </div>
                        <div class="mp-step">
                            <strong>🚪 Joining a Room:</strong>
                            <p>Enter a room ID and click "Join Room" to play with others</p>
                        </div>
                        <div class="mp-step">
                            <strong>🎯 Gameplay:</strong>
                            <p>Take turns flipping cards. The player who finds the most pairs wins!</p>
                        </div>
                        <div class="mp-step">
                            <strong>⏸️ Game Controls:</strong>
                            <p>Any player can pause the game, which pauses it for everyone</p>
                        </div>
                    </div>
                </div>
                
                <div class="help-section">
                    <h3>♿ Accessibility Features</h3>
                    <div class="accessibility-features">
                        <div class="feature">
                            <strong>🔊 Screen Reader Support:</strong>
                            <p>All game elements are properly labeled and announced</p>
                        </div>
                        <div class="feature">
                            <strong>⌨️ Full Keyboard Navigation:</strong>
                            <p>Play the entire game without using a mouse</p>
                        </div>
                        <div class="feature">
                            <strong>🎨 High Contrast Mode:</strong>
                            <p>Supports system high contrast settings</p>
                        </div>
                        <div class="feature">
                            <strong>🎭 Theme Toggle:</strong>
                            <p>Switch between light and dark modes for comfort</p>
                        </div>
                        <div class="feature">
                            <strong>⏸️ Reduced Motion:</strong>
                            <p>Respects system preferences for reduced motion</p>
                        </div>
                    </div>
                </div>
                
                <div class="help-section">
                    <h3>🏆 Scoring System</h3>
                    <div class="scoring-info">
                        <p><strong>Single Player:</strong> Aim for fewer moves and faster completion time</p>
                        <p><strong>Multiplayer:</strong> Each matched pair earns 1 point. Most points wins!</p>
                        <p><strong>Bonus:</strong> Consecutive matches may earn bonus points in future updates</p>
                    </div>
                </div>
            </div>
        `;
        
        const modal = this.createModal('🧠 How to Play Memory Game', helpContent);
        this.showModal(modal);
    }

    /**
     * Create a modal
     */
    createModal(title, content) {
        return `
            <div class="modal-header">
                <h2 class="modal-title">${title}</h2>
                <button class="modal-close" aria-label="Close modal">&times;</button>
            </div>
            <div class="modal-body">
                ${content}
            </div>
        `;
    }

    /**
     * Show modal
     */
    showModal(content) {
        let modal = document.querySelector('.modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.className = 'modal';
            modal.innerHTML = '<div class="modal-content"></div>';
            document.body.appendChild(modal);
        }
        
        const modalContent = modal.querySelector('.modal-content');
        modalContent.innerHTML = content;
        
        modal.classList.add('active');
        
        // Focus the close button for accessibility
        const closeBtn = modal.querySelector('.modal-close');
        if (closeBtn) {
            closeBtn.focus();
        }
    }

    /**
     * Close modal
     */
    closeModal() {
        const modal = document.querySelector('.modal');
        if (modal) {
            modal.classList.remove('active');
        }
    }

    /**
     * Show status message
     */
    showStatus(message, type = 'info') {
        // Remove existing status messages
        const existingStatus = document.querySelector('.status-display');
        if (existingStatus) {
            existingStatus.remove();
        }
        
        // Create new status message
        const statusElement = document.createElement('div');
        statusElement.className = `status-display status-${type}`;
        statusElement.textContent = message;
        
        const main = document.querySelector('.main .container');
        if (main) {
            main.insertBefore(statusElement, main.firstChild);
            
            // Auto-remove after 5 seconds
            setTimeout(() => {
                if (statusElement.parentNode) {
                    statusElement.remove();
                }
            }, 5000);
        }
    }

    /**
     * Handle errors with user-friendly messages
     */
    handleError(message, error) {
        console.error(message, error);
        this.showStatus(message, 'error');
        this.announce(`Error: ${message}`);
    }

    // Socket event handlers for multiplayer
    handleRoomJoined(data) {
        this.gameState.roomId = data.roomId;
        this.gameState.playerId = data.playerId;
        this.gameState.isMultiplayer = true;
        this.gameState.players = data.room.players;
        this.gameState.gameConfig = data.room.config;
        
        this.hideGameSetup();
        this.showRoomInfo();
        this.showMultiplayerWaiting(data.roomId);
        this.updatePlayersDisplay();
        
        this.showStatus(`Joined room ${data.roomId}. Waiting for game to start...`, 'success');
        this.announce(`Joined multiplayer room ${data.roomId}`);
    }

    handlePlayerJoined(data) {
        this.gameState.players.push(data);
        this.updatePlayersDisplay();
        this.showStatus(`${data.name} joined the game.`, 'success');
        this.announce(`${data.name} joined the game`);
        
        // If room is full, show start game option
        if (this.gameState.players.length >= this.gameState.gameConfig.maxPlayers) {
            this.showStartGameButton();
        }
    }

    handlePlayerDisconnected(data) {
        this.gameState.players = this.gameState.players.map(player => 
            player.id === data.id ? { ...player, connected: false } : player
        );
        this.updatePlayersDisplay();
        
        this.showDisconnectionModal(data);
        this.announce(`${data.name} disconnected from the game`);
    }

    handleGameStarted(data) {
        this.gameState.isPlaying = true;
        this.gameState.cards = data.gameBoard.map((card, index) => ({
            id: card.id,
            symbol: this.getSymbolById(card.id),
            isFlipped: card.flipped,
            isMatched: card.matched
        }));
        this.gameState.currentPlayer = data.currentPlayer;
        this.gameState.scores = data.scores;
        
        this.closeModal();
        this.hideGameSetup();
        this.showRoomInfo();
        this.renderGameBoard();
        this.startTimer();
        this.showStatus('Multiplayer game started!', 'success');
        this.announce('Multiplayer game has started');
    }

    handleCardFlipped(data) {
        const { cardId, symbol, playerId } = data;
        const cardIndex = this.gameState.cards.findIndex(card => card.id === cardId);
        
        console.log('handleCardFlipped:', { cardId, symbol, playerId, cardIndex });
        
        if (cardIndex !== -1) {
            const card = this.gameState.cards[cardIndex];
            const cardElement = document.querySelector(`[data-index="${cardIndex}"]`);
            
            card.isFlipped = true;
            card.symbol = symbol;
            
            // Add to flipped cards if not already there
            if (!this.gameState.flippedCards.includes(cardIndex)) {
                this.gameState.flippedCards.push(cardIndex);
            }
            
            if (cardElement) {
                this.updateCardVisualState(cardElement, card);
            }
            
            if (playerId !== this.gameState.playerId) {
                const player = this.gameState.players.find(p => p.id === playerId);
                this.announce(`${player?.name || 'Other player'} flipped card showing ${symbol}`);
            }
        }
    }

    handleMatchFound(data) {
        const { cards, playerId, scores } = data;
        this.gameState.scores = scores;
        
        console.log('handleMatchFound:', { cards, playerId, scores });
        
        cards.forEach(cardId => {
            const cardIndex = this.gameState.cards.findIndex(card => card.id === cardId);
            if (cardIndex !== -1) {
                const card = this.gameState.cards[cardIndex];
                const cardElement = document.querySelector(`[data-index="${cardIndex}"]`);
                
                card.isMatched = true;
                card.isFlipped = true;
                
                if (cardElement) {
                    this.updateCardVisualState(cardElement, card);
                }
            }
        });
        
        // Clear flipped cards array
        this.gameState.flippedCards = [];
        this.gameState.matchedPairs++;
        
        const player = this.gameState.players.find(p => p.id === playerId);
        this.showStatus(`${player?.name || 'Player'} found a match!`, 'success');
        this.announce(`Match found by ${player?.name || 'player'}`);
        
        this.updateGameInfo();
        
        // Update all cards to ensure proper state
        setTimeout(() => {
            this.updateAllCards();
        }, 100);
    }

    handleNoMatch(data) {
        const { cards } = data;
        
        console.log('handleNoMatch:', { cards });
        
        setTimeout(() => {
            cards.forEach(cardId => {
                const cardIndex = this.gameState.cards.findIndex(card => card.id === cardId);
                if (cardIndex !== -1) {
                    const card = this.gameState.cards[cardIndex];
                    const cardElement = document.querySelector(`[data-index="${cardIndex}"]`);
                    
                    card.isFlipped = false;
                    
                    if (cardElement) {
                        this.updateCardVisualState(cardElement, card);
                    }
                }
            });
            
            // Clear flipped cards array
            this.gameState.flippedCards = [];
            
            this.announce('No match found, cards flipped back');
            
            // Update all cards to ensure proper state
            this.updateAllCards();
        }, 500);
    }

    handleTurnChanged(data) {
        const { currentPlayer } = data;
        
        console.log('handleTurnChanged:', {
            currentPlayerFromServer: currentPlayer,
            currentPlayers: this.gameState.players
        });
        
        this.gameState.currentPlayer = this.gameState.players.findIndex(p => p.id === currentPlayer.id);
        this.updatePlayersDisplay();
        
        console.log('Updated current player index:', this.gameState.currentPlayer);
        
        if (currentPlayer.id === this.gameState.playerId) {
            this.showStatus("It's your turn!", 'success');
            this.announce("It's your turn to play");
        } else {
            this.showStatus(`It's ${currentPlayer.name}'s turn`, 'warning');
            this.announce(`It's ${currentPlayer.name}'s turn`);
        }
    }

    handleGameEnded(data) {
        this.endGame(true);
        const { winner, scores, duration, moves } = data;
        const winnerPlayer = this.gameState.players.find(p => p.id === winner);
        
        this.showMultiplayerEndModal(winnerPlayer, scores, duration, moves);
    }

    handleGamePaused(data) {
        this.gameState.isPaused = true;
        this.stopTimer();
        
        const { pausedBy } = data;
        const player = this.gameState.players.find(p => p.id === pausedBy);
        
        this.showStatus(`Game paused by ${player?.name || 'another player'}`, 'warning');
        this.showPauseModal();
    }

    handleGameResumed(data) {
        this.gameState.isPaused = false;
        this.startTimer();
        this.closeModal();
        
        const { resumedBy } = data;
        const player = this.gameState.players.find(p => p.id === resumedBy);
        
        this.showStatus(`Game resumed by ${player?.name || 'another player'}`, 'success');
        this.announce('Game has been resumed');
    }

    /**
     * Show disconnection modal
     */
    showDisconnectionModal(disconnectedPlayer) {
        const disconnectContent = `
            <div class="disconnect-content">
                <h3>⚠️ Player Disconnected</h3>
                <p><strong>${disconnectedPlayer.name}</strong> has left the game.</p>
                <p>The game has been paused automatically.</p>
                <div style="margin-top: 1.5rem; display: flex; gap: 1rem; justify-content: center; flex-direction: column;">
                    <button class="btn btn-primary" onclick="memoryGame.waitForReconnection()">Wait for Reconnection</button>
                    <button class="btn btn-secondary" onclick="memoryGame.returnToSetup()">End Game</button>
                </div>
                <div style="margin-top: 1rem; font-size: 0.9rem; color: var(--text-secondary);">
                    <p>The player has 2 minutes to reconnect before the game ends automatically.</p>
                </div>
            </div>
        `;
        
        const modal = this.createModal('Player Disconnected', disconnectContent);
        this.showModal(modal);
        
        // Auto-close after 2 minutes
        setTimeout(() => {
            if (document.querySelector('.modal.active')) {
                this.returnToSetup();
            }
        }, 120000); // 2 minutes
    }

    /**
     * Show multiplayer waiting screen
     */
    showMultiplayerWaiting(roomId) {
        const waitingContent = `
            <div class="waiting-content">
                <h3>🎮 Multiplayer Room</h3>
                <div class="room-info">
                    <p><strong>Room ID:</strong> <code>${roomId}</code></p>
                    <p>Share this Room ID with other players to invite them!</p>
                </div>
                <div class="players-waiting">
                    <h4>Players in Room:</h4>
                    <div class="players-list"></div>
                </div>
                <div id="start-game-container" style="display: none; margin-top: 1.5rem;">
                    <button class="btn btn-primary" onclick="memoryGame.startMultiplayerGame()">Start Game</button>
                </div>
                <div style="margin-top: 1rem;">
                    <button class="btn btn-secondary" onclick="memoryGame.returnToSetup()">Leave Room</button>
                </div>
            </div>
        `;
        
        const modal = this.createModal('Waiting for Players', waitingContent);
        this.showModal(modal);
    }

    /**
     * Show start game button when room is full
     */
    showStartGameButton() {
        const startGameContainer = document.getElementById('start-game-container');
        if (startGameContainer) {
            startGameContainer.style.display = 'block';
        }
    }

    /**
     * Start multiplayer game
     */
    startMultiplayerGame() {
        if (this.gameState.roomId) {
            this.socket.emit('start-game', this.gameState.roomId);
        }
    }

    /**
     * Wait for player reconnection
     */
    waitForReconnection() {
        this.closeModal();
        this.showStatus('Waiting for player to reconnect...', 'warning');
    }

    /**
     * Show multiplayer end game modal
     */
    showMultiplayerEndModal(winner, scores, duration, moves) {
        const scoresList = Object.entries(scores)
            .map(([playerId, score]) => {
                const player = this.gameState.players.find(p => p.id === playerId);
                return `<div class="score-entry ${playerId === winner.id ? 'winner' : ''}">
                    ${player?.name || 'Unknown'}: ${score} points
                    ${playerId === winner.id ? ' 🏆' : ''}
                </div>`;
            }).join('');

        const endContent = `
            <div class="game-end-content">
                <h3>🎉 Game Complete!</h3>
                <div class="winner-announcement">
                    <p><strong>${winner.name}</strong> wins!</p>
                </div>
                <div class="final-scores">
                    <h4>Final Scores:</h4>
                    ${scoresList}
                </div>
                <div class="game-stats">
                    <p><strong>Total Moves:</strong> ${moves}</p>
                    <p><strong>Game Duration:</strong> ${this.formatTime(Math.floor(duration / 1000))}</p>
                </div>
                <div style="margin-top: 1.5rem; display: flex; gap: 1rem; justify-content: center;">
                    <button class="btn btn-primary" onclick="memoryGame.startMultiplayerGame()">Play Again</button>
                    <button class="btn btn-secondary" onclick="memoryGame.returnToSetup()">Main Menu</button>
                </div>
            </div>
        `;
        
        const modal = this.createModal('Game Results', endContent);
        this.showModal(modal);
    }

    /**
     * Get symbol by card ID (helper for multiplayer)
     */
    getSymbolById(cardId) {
        // This will be set by the server in real implementation
        // For now, use a placeholder
        return '?';
    }
}

// Initialize the game when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.memoryGame = new MemoryGame();
});

// Export for potential module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MemoryGame;
}
