// Main Three.js Implementation for Russian Checkers
class ChessRenderer {
    constructor(difficultyLevel = 'medium', playerColor = 'red', socket = null, gameCode = null) {
        this.game = new ChessGame();
        
        // Set up game mode - single player vs AI or multiplayer
        this.isMultiplayer = !!socket;
        this.socket = socket;
        this.gameCode = gameCode;
        
        if (this.isMultiplayer) {
            // Multiplayer setup
            this.humanPlayer = playerColor;
            this.opponentPlayer = playerColor === 'red' ? 'yellow' : 'red';
            this.computerPlayer = null; // No AI in multiplayer
            this.setupMultiplayerHandlers();
        } else {
            // Single player vs AI setup
            this.humanPlayer = 'red';
            this.computerPlayer = 'yellow';
            this.ai = new ChessAI(this.game, difficultyLevel); // Create AI with difficulty level
        }
        
        this.isComputerThinking = false;

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000); // Slightly wider angle
        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: true
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setClearColor(0x000000, 0);
        // Ensure the target element exists
        const boardContainer = document.getElementById('chess-board');
        if (boardContainer) {
            boardContainer.appendChild(this.renderer.domElement);
        } else {
            console.error("Error: Could not find 'chess-board' element to attach renderer.");
            return; // Stop initialization if container missing
        }

        this.camera.position.set(0, 18, 16); // Adjusted camera position for larger board
        this.camera.lookAt(0, 0, 0);

        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.15; // Smoother damping
        this.controls.target.set(0, 0, 0); // Ensure controls focus on board center

        this.setupLights();

        this.boardGroup = new THREE.Group(); // Group for board and pieces
        this.highlightGroup = new THREE.Group(); // Separate group for highlights
        this.scene.add(this.boardGroup);
        this.scene.add(this.highlightGroup); // Add highlight group to scene

        this.materials = {
            whiteSquare: new THREE.MeshStandardMaterial({
                color: 0xC0C0C0, // Silver
                roughness: 0.1,
                metalness: 0.8,
                bumpScale: 0.05
            }),
            blackSquare: new THREE.MeshStandardMaterial({
                color: 0x111111, // Carbon fiber black
                roughness: 0.2,
                metalness: 0.6,
                emissive: 0x002244,
                emissiveIntensity: 0.1,
                bumpScale: 0.05
            }),
            redPiece: new THREE.MeshStandardMaterial({
                color: 0x00ffff, // Cyan
                roughness: 0.2,
                metalness: 0.8,
                emissive: 0x00ffff,
                emissiveIntensity: 0.6
            }),
            yellowPiece: new THREE.MeshStandardMaterial({
                color: 0xb000ff, // Purple
                roughness: 0.2,
                metalness: 0.8,
                emissive: 0xb000ff,
                emissiveIntensity: 0.6
            }),
            kingCrown: new THREE.MeshStandardMaterial({
                color: 0xeeeeee, // Platinum
                roughness: 0.05,
                metalness: 1.0,
                emissive: 0x00ffff,
                emissiveIntensity: 0.7
            }),
            selected: new THREE.MeshStandardMaterial({
                color: 0x00ffff, // Bright cyan
                transparent: true,
                opacity: 0.7
            }),
            validMove: new THREE.MeshStandardMaterial({
                color: 0x1e90ff, // Electric blue
                transparent: true,
                opacity: 0.6
            }),
            mandatorySelect: new THREE.MeshStandardMaterial({
                color: 0xffc400, // Caution amber
                transparent: true,
                opacity: 0.8
            })
        };

        this.squareSize = 2.4; // << INCREASED square size for bigger, more realistic board
        this.pieceHeight = this.squareSize * 0.15;
        this.boardOffset = -3.5 * this.squareSize; // Offset to center board at (0,0) - recalculated automatically

        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.clickableObjects = []; // Store board squares and pieces for raycasting

        this.init();
        this.animate();
        this.setupEventListeners();
        this.setupDraggablePanel(); // Make info panel draggable
        this.updateUI(); // Initial UI update
    }

    setupLights() {
        // Sci-fi cool lighting
        const ambientLight = new THREE.AmbientLight(0xb0dfff, 0.6); // Cool white/blue ambient
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.9); // Bright white main light
        directionalLight.position.set(12, 25, 18);
        directionalLight.castShadow = true;
        directionalLight.shadow.mapSize.width = 4096;
        directionalLight.shadow.mapSize.height = 4096;
        directionalLight.shadow.camera.near = 0.5;
        directionalLight.shadow.camera.far = 60;
        this.scene.add(directionalLight);

        const cyanLight = new THREE.PointLight(0x00ffff, 0.6); // Cyan accent
        cyanLight.position.set(-10, 12, -10);
        this.scene.add(cyanLight);

        const purpleLight = new THREE.PointLight(0xb000ff, 0.5); // Purple accent
        purpleLight.position.set(10, 8, 15);
        this.scene.add(purpleLight);

        const whiteLight = new THREE.PointLight(0xffffff, 0.3); // Cool white fill
        whiteLight.position.set(0, 15, -12);
        this.scene.add(whiteLight);

        // Enable shadows in renderer
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }

    init() {
        this.createBoard();
        this.createPieces();
        this.highlightMandatorySelections();
        if (this.game.currentPlayer === this.computerPlayer && this.game.gameState === 'active') {
            this.makeComputerMove();
        }
    }

    createBoard() {
        // Clear previous board
        this.boardGroup.remove(...this.boardGroup.children.filter(c => c.userData.type === 'square' || c.userData.type === 'base'));
        this.clickableObjects = this.clickableObjects.filter(obj => obj.userData.type !== 'square');

        // Board base
        const boardBaseGeo = new THREE.BoxGeometry(8 * this.squareSize, 3.5, 8 * this.squareSize);
        const boardBaseMat = new THREE.MeshStandardMaterial({
            color: 0x111111, // Dark metallic
            roughness: 0.3,
            metalness: 0.8,
            emissive: 0x001122,
            emissiveIntensity: 0.1,
            bumpScale: 0.15
        });
        const boardBase = new THREE.Mesh(boardBaseGeo, boardBaseMat);
        boardBase.position.y = -1.75;
        boardBase.userData = { type: 'base' };
        boardBase.castShadow = true;
        boardBase.receiveShadow = true;
        this.boardGroup.add(boardBase);

        // Frame
        const frameThickness = 1.8;
        const frameHeight = 2.2;
        const frameMaterial = new THREE.MeshStandardMaterial({
            color: 0xdddddd, // Chrome
            roughness: 0.2,
            metalness: 1.0,
            bumpScale: 0.2,
            emissive: 0x00ffff,
            emissiveIntensity: 0.2
        });
        for (let i = 0; i < 2; i++) {
            const frameGeo = new THREE.BoxGeometry(8 * this.squareSize + frameThickness * 2, frameHeight, frameThickness);
            const frame = new THREE.Mesh(frameGeo, frameMaterial);
            frame.position.set(0, frameHeight / 2 - 1.75, (i === 0 ? -1 : 1) * (4 * this.squareSize + frameThickness / 2));
            frame.castShadow = true;
            frame.receiveShadow = true;
            this.boardGroup.add(frame);

            const ornamentGeo = new THREE.CylinderGeometry(0.25, 0.35, frameHeight * 1.1, 8);
            const ornamentMat = new THREE.MeshStandardMaterial({
                color: 0xeeeeee,
                roughness: 0.1,
                metalness: 1.0,
                emissive: 0x00ffff,
                emissiveIntensity: 0.3
            });
            for (let j = 0; j < 2; j++) {
                const ornament = new THREE.Mesh(ornamentGeo, ornamentMat);
                ornament.position.set(
                    (j === 0 ? -1 : 1) * (4 * this.squareSize + frameThickness * 0.8),
                    frameHeight / 2 - 1.75,
                    (i === 0 ? -1 : 1) * (4 * this.squareSize + frameThickness / 2)
                );
                ornament.castShadow = true;
                ornament.receiveShadow = true;
                this.boardGroup.add(ornament);
            }
        }
        for (let i = 0; i < 2; i++) {
            const frameGeo = new THREE.BoxGeometry(frameThickness, frameHeight, 8 * this.squareSize);
            const frame = new THREE.Mesh(frameGeo, frameMaterial);
            frame.position.set((i === 0 ? -1 : 1) * (4 * this.squareSize + frameThickness / 2), frameHeight / 2 - 1.75, 0);
            frame.castShadow = true;
            frame.receiveShadow = true;
            this.boardGroup.add(frame);
        }

        // Medallion
        const medallionGeo = new THREE.CylinderGeometry(1.2, 1.4, 0.3, 16);
        const medallionMat = new THREE.MeshStandardMaterial({
            color: 0x5500ff,
            roughness: 0.2,
            metalness: 0.8,
            emissive: 0x5500ff,
            emissiveIntensity: 0.3
        });
        const medallion = new THREE.Mesh(medallionGeo, medallionMat);
        medallion.position.set(0, -1.9, 0);
        medallion.castShadow = true;
        medallion.receiveShadow = true;
        this.boardGroup.add(medallion);

        // Squares
        const squareGeo = new THREE.BoxGeometry(this.squareSize, 0.2, this.squareSize);
        const playingAreaSize = 8 * this.squareSize;
        const startOffset = -playingAreaSize / 2 + this.squareSize / 2;
        for (let y = 0; y < 8; y++) {
            for (let x = 0; x < 8; x++) {
                const isDark = (x + y) % 2 !== 0;
                const square = new THREE.Mesh(
                    squareGeo,
                    isDark ? this.materials.blackSquare : this.materials.whiteSquare
                );
                square.position.set(
                    startOffset + x * this.squareSize,
                    0.1,
                    startOffset + y * this.squareSize
                );
                square.castShadow = true;
                square.receiveShadow = true;
                square.userData = { type: 'square', gridX: x, gridY: y };
                this.boardGroup.add(square);
                this.clickableObjects.push(square);
            }
        }
    }

    createPieces() {
        const piecesToRemove = this.boardGroup.children.filter(child => child.userData.type === 'piece');
        this.boardGroup.remove(...piecesToRemove);
        this.clickableObjects = this.clickableObjects.filter(obj => obj.userData.type !== 'piece');

        for (let y = 0; y < 8; y++) {
            for (let x = 0; x < 8; x++) {
                const pieceData = this.game.getPieceAt(x, y);
                if (pieceData) {
                    this.createPieceMesh(pieceData.color, pieceData.isKing, x, y);
                }
            }
        }
    }

    createPieceMesh(color, isKing, x, y) {
        const pieceGroup = new THREE.Group();
        const baseRadius = this.squareSize * 0.35;
        const crownHeight = this.pieceHeight * 0.8;

        const discGeo = new THREE.CylinderGeometry(baseRadius, baseRadius * 0.9, this.pieceHeight, 32);
        const discMat = color === 'red' ? this.materials.redPiece : this.materials.yellowPiece;
        const disc = new THREE.Mesh(discGeo, discMat);
        disc.castShadow = true;
        disc.receiveShadow = true;
        pieceGroup.add(disc);

        if (isKing) {
            const crownPoints = 8;
            const crownRadius = baseRadius * 0.8;
            const pointHeight = crownHeight;

            const crownBaseGeo = new THREE.CylinderGeometry(crownRadius, crownRadius * 0.9, this.pieceHeight * 0.3, 32);
            const crownBase = new THREE.Mesh(crownBaseGeo, this.materials.kingCrown);
            crownBase.position.y = this.pieceHeight / 2 + this.pieceHeight * 0.15;
            crownBase.castShadow = true;
            crownBase.receiveShadow = true;
            pieceGroup.add(crownBase);

            for (let i = 0; i < crownPoints; i++) {
                const angle = (i / crownPoints) * Math.PI * 2;
                const isHighPoint = i % 2 === 0;
                const currentPointHeight = isHighPoint ? pointHeight : pointHeight * 0.6;
                const pointRadius = baseRadius * 0.08;

                const pointGeo = new THREE.ConeGeometry(pointRadius, currentPointHeight, 8);
                const point = new THREE.Mesh(pointGeo, this.materials.kingCrown);
                point.position.x = Math.sin(angle) * crownRadius * 0.7;
                point.position.z = Math.cos(angle) * crownRadius * 0.7;
                point.position.y = this.pieceHeight / 2 + this.pieceHeight * 0.3 + currentPointHeight / 2;
                point.castShadow = true;
                point.receiveShadow = true;
                pieceGroup.add(point);
            }

            const jewelGeo = new THREE.SphereGeometry(baseRadius * 0.15, 16, 16);
            const jewel = new THREE.Mesh(jewelGeo, this.materials.kingCrown);
            jewel.position.y = this.pieceHeight / 2 + this.pieceHeight * 0.3 + pointHeight * 0.3;
            jewel.castShadow = true;
            jewel.receiveShadow = true;
            pieceGroup.add(jewel);
        } else {
            const rimGeo = new THREE.TorusGeometry(baseRadius * 0.8, baseRadius * 0.08, 8, 32);
            const rimMat = new THREE.MeshStandardMaterial({
                color: color === 'red' ? 0x00ffff : 0xb000ff,
                roughness: 0.2,
                metalness: 0.8,
                clearcoat: 0.7
            });
            const rim = new THREE.Mesh(rimGeo, rimMat);
            rim.rotation.x = Math.PI / 2;
            rim.position.y = this.pieceHeight / 2 + baseRadius * 0.05;
            rim.castShadow = true;
            rim.receiveShadow = true;
            pieceGroup.add(rim);
        }

        const playingAreaSize = 8 * this.squareSize;
        const startOffset = -playingAreaSize / 2 + this.squareSize / 2;
        pieceGroup.position.set(
            startOffset + x * this.squareSize,
            this.pieceHeight / 2 + 0.2,
            startOffset + y * this.squareSize
        );
        pieceGroup.castShadow = true;
        pieceGroup.receiveShadow = true;
        pieceGroup.userData = { type: 'piece', pieceColor: color, isKing: isKing, gridX: x, gridY: y };
        this.boardGroup.add(pieceGroup);
        this.clickableObjects.push(pieceGroup);

        return pieceGroup;
    }

    highlightSquare(x, y, material) {
        const highlightGeo = new THREE.PlaneGeometry(this.squareSize * 0.95, this.squareSize * 0.95);
        const highlight = new THREE.Mesh(highlightGeo, material);
        const playingAreaSize = 8 * this.squareSize;
        const startOffset = -playingAreaSize / 2 + this.squareSize / 2;
        highlight.position.set(
            startOffset + x * this.squareSize,
            0.21,
            startOffset + y * this.squareSize
        );
        highlight.rotation.x = -Math.PI / 2;
        this.highlightGroup.add(highlight);
        return highlight;
    }

    clearHighlights() {
        while (this.highlightGroup.children.length > 0) {
            this.highlightGroup.remove(this.highlightGroup.children[0]);
        }
    }

    highlightMandatorySelections() {
        if (this.game.canOnlySelectJumpingPieces && this.game.currentPlayer === this.humanPlayer) {
            for (let y = 0; y < 8; y++) {
                for (let x = 0; x < 8; x++) {
                    const piece = this.game.getPieceAt(x, y);
                    if (piece && piece.color === this.game.currentPlayer) {
                        const jumps = this.game.rules.findSingleJumps(this.game.board, [x, y], piece);
                        if (jumps.length > 0) {
                            this.highlightSquare(x, y, this.materials.mandatorySelect);
                        }
                    }
                }
            }
        }
    }

    updateUI() {
        const turnIndicator = document.getElementById('turn-indicator');
        const redCapturedCountEl = document.getElementById('red-captured-count');
        const yellowCapturedCountEl = document.getElementById('yellow-captured-count');
        const thinkingEl = document.getElementById('thinking');
        if (!turnIndicator || !redCapturedCountEl || !yellowCapturedCountEl || !thinkingEl) {
            console.warn("UI elements missing, cannot update UI.");
            return;
        }
        const gameInfo = this.game.getGameInfo();
        switch (gameInfo.gameState) {
            case 'active':
                let turnText = `${gameInfo.currentPlayer.charAt(0).toUpperCase() + gameInfo.currentPlayer.slice(1)}'s Turn`;
                if (gameInfo.mustJump && gameInfo.currentPlayer === this.humanPlayer) turnText += " (Must Jump!)";
                if (this.isComputerThinking && gameInfo.currentPlayer === this.computerPlayer) {
                    turnText = `Computer (${gameInfo.currentPlayer}) is thinking...`;
                } else if (gameInfo.currentPlayer === this.humanPlayer && gameInfo.multiJumpPiece) {
                    turnText += " (Continue Multi-Jump)";
                }
                turnIndicator.textContent = turnText;
                break;
            case 'red_win':
                turnIndicator.textContent = 'Game Over: Red Wins!';
                break;
            case 'yellow_win':
                turnIndicator.textContent = 'Game Over: Yellow Wins!';
                break;
            case 'draw':
                turnIndicator.textContent = 'Game Over: Draw!';
                break;
        }
        redCapturedCountEl.textContent = gameInfo.capturedPieces.yellow.length;
        yellowCapturedCountEl.textContent = gameInfo.capturedPieces.red.length;
        thinkingEl.style.display = this.isComputerThinking ? 'block' : 'none';
    }

    onMouseDown(event) {
        if (this.game.gameState !== 'active' || this.game.currentPlayer !== this.humanPlayer || this.isComputerThinking) {
            return;
        }
        this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObjects(this.clickableObjects, true);
        if (intersects.length > 0) {
            let clickedObject = null;
            for (const intersect of intersects) {
                let obj = intersect.object;
                while (obj.parent && !obj.userData.type) {
                    if (obj.parent === this.boardGroup || obj.parent === this.scene) break;
                    obj = obj.parent;
                }
                if (obj.userData && (obj.userData.type === 'piece' || obj.userData.type === 'square')) {
                    clickedObject = obj;
                    break;
                }
            }
            if (clickedObject) {
                const { gridX, gridY, type } = clickedObject.userData;
                this.clearHighlights();
                if (type === 'piece' && clickedObject.userData.pieceColor === this.humanPlayer) {
                    if (this.game.selectPiece(gridX, gridY)) {
                        this.highlightSquare(gridX, gridY, this.materials.selected);
                        if (Array.isArray(this.game.validMoves)) {
                            this.game.validMoves.forEach(move => {
                                if (Array.isArray(move) && move.length >= 2) {
                                    this.highlightSquare(move[0], move[1], this.materials.validMove);
                                }
                            });
                        }
                    } else {
                        this.highlightMandatorySelections();
                    }
                } else if (type === 'square' && this.game.selectedPiece) {
                    const fromX = this.game.selectedPiece.x;
                    const fromY = this.game.selectedPiece.y;
                    if (this.game.movePiece(gridX, gridY)) {
                        this.updatePiecePositions();
                        this.updateUI();
                        if (this.isMultiplayer && this.socket) {
                            this.sendMove(fromX, fromY, gridX, gridY);
                        }
                        if (this.game.multiJumpPiece && this.game.currentPlayer === this.humanPlayer) {
                            this.highlightSquare(this.game.multiJumpPiece.x, this.game.multiJumpPiece.y, this.materials.selected);
                            if (Array.isArray(this.game.validMoves)) {
                                this.game.validMoves.forEach(move => {
                                    if (Array.isArray(move) && move.length >= 2) {
                                        this.highlightSquare(move[0], move[1], this.materials.validMove);
                                    }
                                });
                            }
                        } else if (this.game.currentPlayer === this.computerPlayer && this.game.gameState === 'active') {
                            this.makeComputerMove();
                        } else {
                            this.highlightMandatorySelections();
                        }
                    } else {
                        if (this.game.selectedPiece) {
                            this.highlightSquare(this.game.selectedPiece.x, this.game.selectedPiece.y, this.materials.selected);
                            if (Array.isArray(this.game.validMoves)) {
                                this.game.validMoves.forEach(move => {
                                    if (Array.isArray(move) && move.length >= 2) {
                                        this.highlightSquare(move[0], move[1], this.materials.validMove);
                                    }
                                });
                            }
                        }
                    }
                } else {
                    this.game.selectedPiece = null;
                    this.game.validMoves = [];
                    this.highlightMandatorySelections();
                }
            } else {
                this.clearHighlights();
                this.game.selectedPiece = null;
                this.game.validMoves = [];
                this.highlightMandatorySelections();
            }
        } else {
            this.clearHighlights();
            this.game.selectedPiece = null;
            this.game.validMoves = [];
            this.highlightMandatorySelections();
        }
    }

    makeComputerMove() {
        if (this.game.gameState !== 'active' || this.game.currentPlayer !== this.computerPlayer || this.isComputerThinking) {
            return;
        }
        this.isComputerThinking = true;
        this.updateUI();
        setTimeout(() => {
            let moveSuccessful = false;
            try {
                moveSuccessful = this.ai.makeMove();
                if (!moveSuccessful) this.game.updateGameState();
            } catch (error) {
                console.error("Error during AI move execution:", error);
                this.game.updateGameState();
            } finally {
                this.isComputerThinking = false;
                this.updatePiecePositions();
                this.clearHighlights();
                this.updateUI();
                if (moveSuccessful && this.game.multiJumpPiece && this.game.currentPlayer === this.computerPlayer && this.game.gameState === 'active') {
                    this.makeComputerMove();
                } else {
                    if (this.game.currentPlayer === this.humanPlayer && this.game.gameState === 'active') {
                        this.highlightMandatorySelections();
                    }
                }
            }
        }, 50);
    }

    updatePiecePositions() {
        this.createPieces();
    }

    setupEventListeners() {
        if (this.renderer && this.renderer.domElement) {
            this.renderer.domElement.addEventListener('mousedown', this.onMouseDown.bind(this), false);
        }
        window.addEventListener('resize', this.onWindowResize.bind(this), false);

        const undoButton = document.getElementById('undo-button');
        if (undoButton) {
            undoButton.addEventListener('click', () => {
                if (!this.isComputerThinking) {
                    if (this.game.undoMove()) {
                        this.clearHighlights();
                        this.updatePiecePositions();
                        this.updateUI();
                        this.highlightMandatorySelections();
                    } else {
                        alert("Cannot undo move now. Check game state or history.");
                    }
                } else {
                    alert("Cannot undo while computer is thinking.");
                }
            });
        } else {
            console.warn("Undo button not found.");
        }

        const newGameBtn = document.getElementById('new-game-btn');
        const newGameBtnInGame = document.getElementById('new-game-btn-ingame');
        if (newGameBtn) {
            newGameBtn.addEventListener('click', () => this.startNewGame(true));
        }
        if (newGameBtnInGame) {
            newGameBtnInGame.addEventListener('click', () => this.startNewGame(false));
        }

        const backToMenuBtn = document.getElementById('back-to-menu');
        if (backToMenuBtn) {
            backToMenuBtn.addEventListener('click', () => {
                const gameContainer = document.getElementById('game-container');
                const welcomeScreen = document.getElementById('welcome-screen');
                if (gameContainer) gameContainer.style.display = 'none';
                if (welcomeScreen) welcomeScreen.style.display = 'flex';
                document.body.classList.remove('game-active');
            });
        } else {
            console.warn("Back to menu button not found.");
        }
    }

    setupDraggablePanel() {
        const gameInfo = document.getElementById('game-info');
        if (!gameInfo) return;
        let isDragging = false, currentX, currentY, initialX, initialY, xOffset = 0, yOffset = 0;

        const dragStart = (e) => {
            if (e.target.tagName === 'BUTTON') return;
            if (e.type === "touchstart") {
                initialX = e.touches[0].clientX - xOffset;
                initialY = e.touches[0].clientY - yOffset;
            } else {
                initialX = e.clientX - xOffset;
                initialY = e.clientY - yOffset;
            }
            if (e.target === gameInfo || gameInfo.contains(e.target)) {
                isDragging = true;
                gameInfo.classList.add('dragging');
            }
        };
        const dragEnd = (e) => {
            initialX = currentX;
            initialY = currentY;
            isDragging = false;
            gameInfo.classList.remove('dragging');
        };
        const drag = (e) => {
            if (isDragging) {
                e.preventDefault();
                if (e.type === "touchmove") {
                    currentX = e.touches[0].clientX - initialX;
                    currentY = e.touches[0].clientY - initialY;
                } else {
                    currentX = e.clientX - initialX;
                    currentY = e.clientY - initialY;
                }
                xOffset = currentX;
                yOffset = currentY;
                const rect = gameInfo.getBoundingClientRect();
                const maxX = window.innerWidth - rect.width;
                const maxY = window.innerHeight - rect.height;
                currentX = Math.max(0, Math.min(currentX, maxX));
                currentY = Math.max(0, Math.min(currentY, maxY));
                gameInfo.style.transform = `translate(${currentX}px, ${currentY}px)`;
                gameInfo.style.position = 'fixed';
                gameInfo.style.top = 'auto';
                gameInfo.style.right = 'auto';
                gameInfo.style.left = '0';
                gameInfo.style.bottom = 'auto';
            }
        };

        gameInfo.addEventListener('mousedown', dragStart);
        document.addEventListener('mousemove', drag);
        document.addEventListener('mouseup', dragEnd);

        gameInfo.addEventListener('touchstart', dragStart);
        document.addEventListener('touchmove', drag);
        document.addEventListener('touchend', dragEnd);
    }

    setupMultiplayerHandlers() {
        if (!this.socket || !this.isMultiplayer) return;
        this.socket.on('move', moveData => {
            if (!moveData || moveData.fromX === undefined || moveData.fromY === undefined || moveData.toX === undefined || moveData.toY === undefined) {
                console.error('Invalid move data received:', moveData);
                return;
            }
            if (this.game.gameState === 'active' && this.game.currentPlayer === this.opponentPlayer) {
                this.game.selectPiece(moveData.fromX, moveData.fromY);
                if (this.game.movePiece(moveData.toX, moveData.toY)) {
                    this.updatePiecePositions();
                    this.updateUI();
                    this.highlightMandatorySelections();
                }
            }
        });

        this.socket.on('gameState', stateData => {
            if (stateData && stateData.board) {
                this.game.board = stateData.board;
                this.updatePiecePositions();
                this.updateUI();
            }
        });

        this.socket.on('chat', msgData => {
            console.log('Chat message:', msgData);
        });

        this.socket.on('disconnect', () => console.log('Disconnected from game server'));
        this.socket.on('reconnect', () => {
            console.log('Reconnected to game server');
            this.socket.emit('getGameState', { gameCode: this.gameCode });
        });
    }

    sendMove(fromX, fromY, toX, toY) {
        if (this.isMultiplayer && this.socket) {
            this.socket.emit('move', { gameCode: this.gameCode, fromX, fromY, toX, toY });
        }
    }

    startNewGame(fromWelcome = false, difficultyLevel = 'medium') {
        if (fromWelcome) {
            const welcomeScreen = document.getElementById('welcome-screen');
            const gameContainer = document.getElementById('game-container');
            if (welcomeScreen) welcomeScreen.style.display = 'none';
            if (gameContainer) gameContainer.style.display = 'flex';
            document.body.classList.add('game-active');
        }
        this.isMultiplayer = false;
        this.socket = null;
        this.gameCode = null;
        this.game = new ChessGame();
        this.ai = new ChessAI(this.game, difficultyLevel);
        this.humanPlayer = 'red';
        this.computerPlayer = 'yellow';
        this.isComputerThinking = false;
        this.clearHighlights();
        this.updatePiecePositions();
        this.updateUI();
        this.highlightMandatorySelections();
        if (this.computerPlayer === this.game.currentPlayer && this.game.gameState === 'active') {
            this.makeComputerMove();
        }
    }

    startMultiplayerGame(fromWelcome = false, playerColor = 'red', socket = null, gameCode = null) {
        if (fromWelcome) {
            const welcomeScreen = document.getElementById('welcome-screen');
            const gameContainer = document.getElementById('game-container');
            if (welcomeScreen) welcomeScreen.style.display = 'none';
            if (gameContainer) gameContainer.style.display = 'flex';
            document.body.classList.add('game-active');
        }
        this.isMultiplayer = true;
        this.socket = socket;
        this.gameCode = gameCode;
        this.humanPlayer = playerColor;
        this.opponentPlayer = playerColor === 'red' ? 'yellow' : 'red';
        this.computerPlayer = null;
        this.game = new ChessGame();
        this.setupMultiplayerHandlers();
        if (socket) {
            if (playerColor === 'red') {
                socket.emit('hostGame', {});
                socket.on('gameCreated', data => {
                    this.gameCode = data.gameCode;
                    console.log(`Hosting game with code: ${this.gameCode}`);
                });
            } else {
                socket.emit('joinGame', { gameCode });
                socket.on('gameJoined', data => {
                    console.log(`Joined game with code: ${data.gameCode}`);
                });
            }
            socket.on('error', data => {
                console.error('Game error:', data.message);
                alert(`Game error: ${data.message}`);
            });
        }
        this.clearHighlights();
        this.updatePiecePositions();
        this.updateUI();
        this.highlightMandatorySelections();
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    animate() {
        requestAnimationFrame(this.animate.bind(this));
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }
}

// --- Welcome Screen & Initialization Logic ---
document.addEventListener('DOMContentLoaded', () => {
    const welcomeScreen = document.getElementById('welcome-screen');
    const gameContainer = document.getElementById('game-container');
    const vsAiBtn = document.getElementById('vs-ai-btn');
    const vsPlayerBtn = document.getElementById('vs-player-btn');
    const difficultySection = document.getElementById('difficulty-section');
    const multiplayerSection = document.getElementById('multiplayer-section');
    const easyBtn = document.getElementById('easy-btn');
    const mediumBtn = document.getElementById('medium-btn');
    const hardBtn = document.getElementById('hard-btn');
    const expertBtn = document.getElementById('expert-btn');
    const hostGameBtn = document.getElementById('host-game-btn');
    const joinGameBtn = document.getElementById('join-game-btn');
    const joinGameInput = document.getElementById('join-game-input');
    const gameCodeInput = document.getElementById('game-code-input');
    const startGameBtn = document.getElementById('start-game-btn');
    const exitBtn = document.getElementById('exit-btn');

    let gameMode = 'vsAI';
    let difficulty = 'medium';
    let multiplayerRole = 'host';
    let gameCode = '';
    let socket = null;

    if (!welcomeScreen || !gameContainer || !startGameBtn || !exitBtn) {
        console.error("Fatal Error: Missing essential HTML elements.");
        document.body.innerHTML = "<h1>Error: HTML structure is missing required elements. Cannot start game.</h1>";
        return;
    }

    welcomeScreen.style.display = 'flex';
    gameContainer.style.display = 'none';

    vsAiBtn.addEventListener('click', () => {
        gameMode = 'vsAI';
        vsAiBtn.classList.add('selected');
        vsPlayerBtn.classList.remove('selected');
        difficultySection.style.display = 'block';
        multiplayerSection.style.display = 'none';
    });
    vsPlayerBtn.addEventListener('click', () => {
        gameMode = 'multiplayer';
        vsPlayerBtn.classList.add('selected');
        vsAiBtn.classList.remove('selected');
        difficultySection.style.display = 'none';
        multiplayerSection.style.display = 'block';
    });

    const difficultyButtons = [easyBtn, mediumBtn, hardBtn, expertBtn];
    const difficultyLevels = ['easy', 'medium', 'hard', 'expert'];
    difficultyButtons.forEach((btn, index) => {
        btn.addEventListener('click', () => {
            difficulty = difficultyLevels[index];
            difficultyButtons.forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
        });
    });

    hostGameBtn.addEventListener('click', () => {
        multiplayerRole = 'host';
        hostGameBtn.classList.add('selected');
        joinGameBtn.classList.remove('selected');
        joinGameInput.style.display = 'none';
    });
    joinGameBtn.addEventListener('click', () => {
        multiplayerRole = 'join';
        joinGameBtn.classList.add('selected');
        hostGameBtn.classList.remove('selected');
        joinGameInput.style.display = 'block';
    });
    gameCodeInput.addEventListener('input', e => {
        gameCode = e.target.value.trim().toUpperCase();
    });

    startGameBtn.addEventListener('click', () => {
        if (gameMode === 'vsAI') {
            startSinglePlayerGame(difficulty);
        } else {
            if (multiplayerRole === 'host') {
                startMultiplayerGame('host');
            } else {
                if (gameCode) {
                    startMultiplayerGame('join', gameCode);
                } else {
                    alert('Please enter a game code to join a game.');
                }
            }
        }
    });

    function startSinglePlayerGame(difficultyLevel) {
        welcomeScreen.style.display = 'none';
        gameContainer.style.display = 'flex';
        document.body.classList.add('game-active');
        if (!window.chessRenderer) {
            window.chessRenderer = new ChessRenderer(difficultyLevel);
        } else {
            window.chessRenderer.startNewGame(true, difficultyLevel);
        }
    }

    function startMultiplayerGame(role, code = null) {
        welcomeScreen.style.display = 'none';
        gameContainer.style.display = 'flex';
        document.body.classList.add('game-active');
        if (!socket) {
            socket = io();
            socket.on('connect_error', error => {
                console.error('Connection error:', error);
                alert('Failed to connect to game server. Please try again.');
                welcomeScreen.style.display = 'flex';
                gameContainer.style.display = 'none';
            });
        }
        if (role === 'host') {
            socket.on('gameCreated', data => {
                const generatedCode = data.gameCode;
                alert(`Your game code is: ${generatedCode}\nShare this code with your opponent.`);
                if (!window.chessRenderer) {
                    window.chessRenderer = new ChessRenderer(null, 'red', socket, generatedCode);
                } else {
                    window.chessRenderer.startMultiplayerGame(true, 'red', socket, generatedCode);
                }
            });
            socket.emit('hostGame', {});
        } else {
            socket.on('gameJoined', data => {
                if (!window.chessRenderer) {
                    window.chessRenderer = new ChessRenderer(null, 'yellow', socket, code);
                } else {
                    window.chessRenderer.startMultiplayerGame(true, 'yellow', socket, code);
                }
            });
            socket.emit('joinGame', { gameCode: code });
        }
    }

    exitBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to exit?')) {
            window.close();
            document.body.innerHTML = '<div style="display:flex;justify-content:center;align-items:center;height:100vh;background-color:#222;color:white;"><h1>Game session ended. Please close the tab/window.</h1></div>';
        }
    });

    const ensureUIElement = (id, parentId, defaultContent = '', elementType = 'span', prefix = '') => {
        let element = document.getElementById(id);
        if (!element) {
            const parent = document.getElementById(parentId);
            if (parent) {
                element = document.createElement(elementType);
                element.id = id;
                element.textContent = defaultContent;
                if (prefix) parent.appendChild(document.createTextNode(prefix));
                parent.appendChild(element);
                console.log(`Created missing UI element: #${id}`);
            } else {
                console.warn(`Cannot create UI element #${id}, parent #${parentId} not found.`);
            }
        }
        return element;
    };

    ensureUIElement('red-captured-count', 'red-captured', '0', 'span', ' Yellow Captured: ');
    ensureUIElement('yellow-captured-count', 'yellow-captured', '0', 'span', ' Red Captured: ');
    const undoBtn = ensureUIElement('undo-button', 'game-info', 'Undo Move', 'button');
    ensureUIElement('thinking', 'game-info', 'Computer is thinking...', 'div');
    const thinkingEl = document.getElementById('thinking');
    if (thinkingEl) thinkingEl.style.display = 'none';
});