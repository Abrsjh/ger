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
            // Oily black and white board squares on Jumanji frame
            whiteSquare: new THREE.MeshStandardMaterial({
                color: 0xffffff, // Pure white squares
                roughness: 0.2,
                metalness: 0.1,
                bumpScale: 0.05
            }),
            blackSquare: new THREE.MeshStandardMaterial({
                color: 0x000000, // Oily black squares
                roughness: 0.1,
                metalness: 0.3,
                bumpScale: 0.05
            }),
            redPiece: new THREE.MeshStandardMaterial({
                color: 0x8b0000, // Dark red - mystical crimson
                roughness: 0.4,
                metalness: 0.2,
                emissive: 0x220000, // Subtle glow for mystical effect
                emissiveIntensity: 0.1
            }),
            yellowPiece: new THREE.MeshStandardMaterial({
                color: 0xb8860b, // Dark goldenrod - ancient gold
                roughness: 0.3,
                metalness: 0.6,
                emissive: 0x332200, // Subtle golden glow
                emissiveIntensity: 0.1
            }),
            kingCrown: new THREE.MeshStandardMaterial({
                color: 0xffd700, // Bright gold for mystical crown
                roughness: 0.1,
                metalness: 0.9,
                emissive: 0x443300, // Golden mystical glow
                emissiveIntensity: 0.2
            }),

            selected: new THREE.MeshStandardMaterial({ color: 0x32cd32, transparent: true, opacity: 0.7 }), // Mystical green selection
            validMove: new THREE.MeshStandardMaterial({ color: 0x4169e1, transparent: true, opacity: 0.6 }), // Royal blue valid move
            mandatorySelect: new THREE.MeshStandardMaterial({ color: 0xff4500, transparent: true, opacity: 0.8 }) // Orange-red for mandatory jumps
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
        // Mystical Jumanji-style lighting with warm, ancient atmosphere
        const ambientLight = new THREE.AmbientLight(0xffa500, 0.4); // Warm orange ambient for mystical feel
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffb347, 0.7); // Warm golden main light
        directionalLight.position.set(12, 25, 18);
        directionalLight.castShadow = true;
        directionalLight.shadow.mapSize.width = 2048;
        directionalLight.shadow.mapSize.height = 2048;
        directionalLight.shadow.camera.near = 0.5;
        directionalLight.shadow.camera.far = 60;
        this.scene.add(directionalLight);

        const mysticalLight1 = new THREE.PointLight(0xdaa520, 0.5); // Golden mystical light
        mysticalLight1.position.set(-10, 12, -10);
        this.scene.add(mysticalLight1);
        
        const mysticalLight2 = new THREE.PointLight(0xcd853f, 0.4); // Peru/sandy brown mystical light
        mysticalLight2.position.set(10, 8, 15);
        this.scene.add(mysticalLight2);
        
        const accentLight = new THREE.PointLight(0x8b4513, 0.3); // Saddle brown accent
        accentLight.position.set(0, 15, -12);
        this.scene.add(accentLight);
        
        // Enable shadows in renderer
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }

    init() {
        this.createBoard();
        this.createPieces();
        // Initial mandatory jump check highlight
        this.highlightMandatorySelections();
         // If computer starts, make its move
         if (this.game.currentPlayer === this.computerPlayer && this.game.gameState === 'active') {
            this.makeComputerMove();
        }
    }

    createBoard() {
         // Clear previous board objects if re-initializing
         this.boardGroup.remove(...this.boardGroup.children.filter(c => c.userData.type === 'square' || c.userData.type === 'base'));
         this.clickableObjects = this.clickableObjects.filter(obj => obj.userData.type !== 'square'); // Keep pieces for now


        // Create mystical Jumanji-style ancient wooden board base - THICKER like photo album
        const boardBaseGeo = new THREE.BoxGeometry(8 * this.squareSize, 3.5, 8 * this.squareSize); // MUCH THICKER base
        const boardBaseMat = new THREE.MeshStandardMaterial({
            color: 0x3e2723, // Very dark brown - ancient mystical wood
            roughness: 0.9,
            metalness: 0.05,
            bumpScale: 0.15,
            emissive: 0x1a0e0a, // Subtle dark glow for mystical effect
            emissiveIntensity: 0.05
        });
        const boardBase = new THREE.Mesh(boardBaseGeo, boardBaseMat);
        boardBase.position.y = -1.75; // Adjusted for thicker base
        boardBase.userData = { type: 'base' };
        boardBase.castShadow = true;
        boardBase.receiveShadow = true;
        this.boardGroup.add(boardBase);

        // Add ornate Jumanji-style decorative frame with PHOTO ALBUM THICKNESS
        const frameThickness = 1.8; // MUCH THICKER like photo album cover
        const frameHeight = 2.2; // MUCH TALLER for photo album look
        const frameColor = 0x5d4037; // Brown with mystical undertones
        
        // Create ornate frame material with mystical properties
        const frameMaterial = new THREE.MeshStandardMaterial({
            color: frameColor,
            roughness: 0.8,
            metalness: 0.15,
            bumpScale: 0.2,
            emissive: 0x2d1b13, // Subtle mystical glow
            emissiveIntensity: 0.08
        });
        
        // Create PHOTO ALBUM STYLE thick frame pieces
        // Top and bottom frame pieces with PHOTO ALBUM thickness
        for (let i = 0; i < 2; i++) {
            const frameGeo = new THREE.BoxGeometry(8 * this.squareSize + frameThickness * 2, frameHeight, frameThickness);
            const frame = new THREE.Mesh(frameGeo, frameMaterial);
            frame.position.set(0, frameHeight / 2 - 1.75, (i === 0 ? -1 : 1) * (4 * this.squareSize + frameThickness / 2)); // Adjusted Y for thicker base
            frame.castShadow = true;
            frame.receiveShadow = true;
            this.boardGroup.add(frame);
            
            // Add larger decorative corner ornaments for photo album style
            const ornamentGeo = new THREE.CylinderGeometry(0.25, 0.35, frameHeight * 1.1, 8); // BIGGER ornaments
            const ornamentMat = new THREE.MeshStandardMaterial({
                color: 0xb8860b, // Golden ornaments
                roughness: 0.3,
                metalness: 0.8,
                emissive: 0x332200,
                emissiveIntensity: 0.15
            });
            
            // Corner ornaments - positioned for thicker frame
            for (let j = 0; j < 2; j++) {
                const ornament = new THREE.Mesh(ornamentGeo, ornamentMat);
                ornament.position.set(
                    (j === 0 ? -1 : 1) * (4 * this.squareSize + frameThickness * 0.8), // Adjusted for thicker frame
                    frameHeight / 2 - 1.75, // Adjusted Y for thicker base
                    (i === 0 ? -1 : 1) * (4 * this.squareSize + frameThickness / 2)
                );
                ornament.castShadow = true;
                ornament.receiveShadow = true;
                this.boardGroup.add(ornament);
            }
        }
        
        // Left and right frame pieces with PHOTO ALBUM thickness
        for (let i = 0; i < 2; i++) {
            const frameGeo = new THREE.BoxGeometry(frameThickness, frameHeight, 8 * this.squareSize);
            const frame = new THREE.Mesh(frameGeo, frameMaterial);
            frame.position.set((i === 0 ? -1 : 1) * (4 * this.squareSize + frameThickness / 2), frameHeight / 2 - 1.75, 0); // Adjusted Y for thicker base
            frame.castShadow = true;
            frame.receiveShadow = true;
            this.boardGroup.add(frame);
        }
        
        // Add mystical center medallion under the board
        const medallionGeo = new THREE.CylinderGeometry(1.2, 1.4, 0.3, 16);
        const medallionMat = new THREE.MeshStandardMaterial({
            color: 0x8b4513,
            roughness: 0.6,
            metalness: 0.3,
            emissive: 0x2d1b13,
            emissiveIntensity: 0.1
        });
        const medallion = new THREE.Mesh(medallionGeo, medallionMat);
        medallion.position.set(0, -1.9, 0); // Adjusted Y for thicker base
        medallion.castShadow = true;
        medallion.receiveShadow = true;
        this.boardGroup.add(medallion);

        // Create perfectly positioned squares within the thick frame
        const squareGeo = new THREE.BoxGeometry(this.squareSize, 0.2, this.squareSize);
        const playingAreaSize = 8 * this.squareSize; // Total playing area
        const startOffset = -playingAreaSize / 2 + this.squareSize / 2; // Center the playing area
        
        for (let y = 0; y < 8; y++) {
            for (let x = 0; x < 8; x++) {
                const isDark = (x + y) % 2 !== 0; // Russian starts black bottom-left
                const square = new THREE.Mesh(
                    squareGeo,
                    isDark ? this.materials.blackSquare : this.materials.whiteSquare
                );
                square.position.set(
                    startOffset + x * this.squareSize, // Perfect positioning within frame
                    0.1, // Slightly above base top surface
                    startOffset + y * this.squareSize  // Perfect positioning within frame
                );
                square.castShadow = true;
                square.receiveShadow = true;
                square.userData = { type: 'square', gridX: x, gridY: y };
                this.boardGroup.add(square);
                this.clickableObjects.push(square); // Add square for clicking
            }
        }
    }

    createPieces() {
        // Remove existing piece meshes first
        const piecesToRemove = this.boardGroup.children.filter(child => child.userData.type === 'piece');
        this.boardGroup.remove(...piecesToRemove);
        // Also remove pieces from clickableObjects
        this.clickableObjects = this.clickableObjects.filter(obj => obj.userData.type !== 'piece');


        // Create new pieces based on game state
        for (let y = 0; y < 8; y++) {
            for (let x = 0; x < 8; x++) {
                const pieceData = this.game.getPieceAt(x, y);
                if (pieceData) {
                    this.createPieceMesh(pieceData.color, pieceData.isKing, x, y);
                }
            }
        }
    }

    // Create a single checkers piece mesh with realistic, elegant design
    createPieceMesh(color, isKing, x, y) {
        const pieceGroup = new THREE.Group(); // Group for piece parts

        // Main piece with elegant proportions
        const baseRadius = this.squareSize * 0.35;
        const crownHeight = this.pieceHeight * 0.8;
        
        // Create base disc with beveled edges
        const discGeo = new THREE.CylinderGeometry(baseRadius, baseRadius * 0.9, this.pieceHeight, 32);
        const discMat = color === 'red' ? this.materials.redPiece : this.materials.yellowPiece;
        const disc = new THREE.Mesh(discGeo, discMat);
        disc.castShadow = true;
        disc.receiveShadow = true;
        pieceGroup.add(disc);
        
        // Add decorative elements
        if (isKing) {
            // Create elegant crown with points instead of intimidating spikes
            const crownPoints = 8;
            const crownRadius = baseRadius * 0.8;
            const pointHeight = crownHeight;
            
            // Crown base ring
            const crownBaseGeo = new THREE.CylinderGeometry(crownRadius, crownRadius * 0.9, this.pieceHeight * 0.3, 32);
            const crownBase = new THREE.Mesh(crownBaseGeo, this.materials.kingCrown);
            crownBase.position.y = this.pieceHeight / 2 + this.pieceHeight * 0.15;
            crownBase.castShadow = true;
            crownBase.receiveShadow = true;
            pieceGroup.add(crownBase);
            
            // Crown points in alternating heights for elegant look
            for (let i = 0; i < crownPoints; i++) {
                const angle = (i / crownPoints) * Math.PI * 2;
                const isHighPoint = i % 2 === 0;
                const currentPointHeight = isHighPoint ? pointHeight : pointHeight * 0.6;
                const pointRadius = baseRadius * 0.08;
                
                const pointGeo = new THREE.ConeGeometry(pointRadius, currentPointHeight, 8);
                const point = new THREE.Mesh(pointGeo, this.materials.kingCrown);
                
                // Position points in a circle on crown base
                point.position.x = Math.sin(angle) * crownRadius * 0.7;
                point.position.z = Math.cos(angle) * crownRadius * 0.7;
                point.position.y = this.pieceHeight / 2 + this.pieceHeight * 0.3 + currentPointHeight / 2;
                
                point.castShadow = true;
                point.receiveShadow = true;
                pieceGroup.add(point);
            }
            
            // Central crown jewel
            const jewelGeo = new THREE.SphereGeometry(baseRadius * 0.15, 16, 16);
            const jewel = new THREE.Mesh(jewelGeo, this.materials.kingCrown);
            jewel.position.y = this.pieceHeight / 2 + this.pieceHeight * 0.3 + pointHeight * 0.3;
            jewel.castShadow = true;
            jewel.receiveShadow = true;
            pieceGroup.add(jewel);
        } else {
            // For regular pieces, add elegant rim detail
            const rimGeo = new THREE.TorusGeometry(baseRadius * 0.8, baseRadius * 0.08, 8, 32);
            const rimMat = new THREE.MeshStandardMaterial({
                color: color === 'red' ? 0x8b0000 : 0xb8860b,
                roughness: 0.3,
                metalness: 0.6,
                clearcoat: 0.7
            });
            const rim = new THREE.Mesh(rimGeo, rimMat);
            rim.rotation.x = Math.PI / 2; // Make torus horizontal
            rim.position.y = this.pieceHeight / 2 + baseRadius * 0.05;
            rim.castShadow = true;
            rim.receiveShadow = true;
            pieceGroup.add(rim);
        }

        // Position the entire piece group - perfectly aligned with new square positioning
        const playingAreaSize = 8 * this.squareSize;
        const startOffset = -playingAreaSize / 2 + this.squareSize / 2;
        
        pieceGroup.position.set(
            startOffset + x * this.squareSize, // Perfect alignment with squares
            this.pieceHeight / 2 + 0.2, // Position base of the piece slightly above the thicker square surface
            startOffset + y * this.squareSize  // Perfect alignment with squares
        );
        
        // Enable shadows for the entire piece group
        pieceGroup.castShadow = true;
        pieceGroup.receiveShadow = true;

        pieceGroup.userData = {
            type: 'piece',
            pieceColor: color,
            isKing: isKing,
            gridX: x,
            gridY: y
        };

        this.boardGroup.add(pieceGroup);
        this.clickableObjects.push(pieceGroup); // Add piece group for clicking (raycasting will hit children)

        return pieceGroup;
    }

    highlightSquare(x, y, material) {
        // Use a plane slightly above the board for highlighting to avoid z-fighting
        const highlightGeo = new THREE.PlaneGeometry(this.squareSize * 0.95, this.squareSize * 0.95); // Slightly smaller - scales with squareSize
        const highlight = new THREE.Mesh(highlightGeo, material);

        // Position highlights perfectly aligned with new square positioning
        const playingAreaSize = 8 * this.squareSize;
        const startOffset = -playingAreaSize / 2 + this.squareSize / 2;
        
        highlight.position.set(
            startOffset + x * this.squareSize, // Perfect alignment with squares
            0.21, // Just above the thicker board squares
            startOffset + y * this.squareSize  // Perfect alignment with squares
        );
        highlight.rotation.x = -Math.PI / 2; // Rotate plane to be horizontal

        this.highlightGroup.add(highlight); // Add to highlight group
        return highlight;
    }

    clearHighlights() {
        // Efficiently remove all children from the highlight group
        while (this.highlightGroup.children.length > 0) {
            this.highlightGroup.remove(this.highlightGroup.children[0]);
        }
    }

    // Highlight pieces that HAVE to be selected for a jump
     highlightMandatorySelections() {
         if (this.game.canOnlySelectJumpingPieces && this.game.currentPlayer === this.humanPlayer) {
             for (let y = 0; y < 8; y++) {
                 for (let x = 0; x < 8; x++) {
                     const piece = this.game.getPieceAt(x, y);
                     if (piece && piece.color === this.game.currentPlayer) {
                         // Use findSingleJumps for efficiency here, as we only need to know IF it can jump
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
        // Ensure UI elements exist before updating
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
                 if (gameInfo.mustJump && gameInfo.currentPlayer === this.humanPlayer) {
                     turnText += " (Must Jump!)";
                 }
                 // Indicate if waiting for AI
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

        // Update captured pieces count (simpler UI)
        redCapturedCountEl.textContent = gameInfo.capturedPieces.yellow.length;
        yellowCapturedCountEl.textContent = gameInfo.capturedPieces.red.length;

         // Show/hide thinking indicator
         thinkingEl.style.display = this.isComputerThinking ? 'block' : 'none';
    }

    onMouseDown(event) {
        // Ignore clicks if it's not the human's turn, or game over, or AI is thinking
        if (this.game.gameState !== 'active' || this.game.currentPlayer !== this.humanPlayer || this.isComputerThinking) {
            return;
        }

        this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
        this.raycaster.setFromCamera(this.mouse, this.camera);

        // Intersect with board squares and pieces
        const intersects = this.raycaster.intersectObjects(this.clickableObjects, true); // Check recursively

        if (intersects.length > 0) {
             // Find the first relevant object (piece or square) that was clicked
             let clickedObject = null;
             for (const intersect of intersects) {
                 let obj = intersect.object;
                 // Traverse up to find the group if a child mesh was hit
                 while (obj.parent && !obj.userData.type) {
                      // Stop traversal if we reach top-level groups like boardGroup
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
                 //console.log(`Clicked: ${type} at (${gridX}, ${gridY})`);

                 // --- Action Handling ---
                 this.clearHighlights(); // Clear previous highlights on any relevant click


                 // 1. Trying to select a piece
                  if (type === 'piece' && clickedObject.userData.pieceColor === this.humanPlayer) {
                     // If game logic allows selection (considering mandatory jumps / multi-jumps):
                     if (this.game.selectPiece(gridX, gridY)) {
                         // Highlight selected piece and its valid moves
                         this.highlightSquare(gridX, gridY, this.materials.selected);
                         if (Array.isArray(this.game.validMoves)) {
                            this.game.validMoves.forEach(move => {
                                if (Array.isArray(move) && move.length >= 2) { // Check move format
                                    this.highlightSquare(move[0], move[1], this.materials.validMove);
                                }
                            });
                         }
                        // console.log("Piece selected, highlights shown.");
                     } else {
                          // Selection failed (e.g., tried to select non-jumping piece when required)
                          // Re-highlight mandatory selection squares if applicable
                           this.highlightMandatorySelections();
                          // console.log("Piece selection failed by game logic.");
                     }
                  }
                 // 2. Trying to move a selected piece to a square
                 else if (type === 'square' && this.game.selectedPiece) {
                      // Store the selected piece coordinates before moving
                      const fromX = this.game.selectedPiece.x;
                      const fromY = this.game.selectedPiece.y;
                      
                      // Attempt the move
                      if (this.game.movePiece(gridX, gridY)) {
                          // Move successful in game logic
                          this.updatePiecePositions(); // Update 3D visuals
                          this.updateUI(); // Update text indicators
                          
                          // If in multiplayer mode, send the move to the opponent
                          if (this.isMultiplayer && this.socket) {
                              this.sendMove(fromX, fromY, gridX, gridY);
                          }

                           // If the move resulted in a multi-jump continuation for human:
                           if (this.game.multiJumpPiece && this.game.currentPlayer === this.humanPlayer) {
                                // Highlight the piece and its *next* valid jumps
                                this.highlightSquare(this.game.multiJumpPiece.x, this.game.multiJumpPiece.y, this.materials.selected);
                                if (Array.isArray(this.game.validMoves)) {
                                    this.game.validMoves.forEach(move => {
                                         if (Array.isArray(move) && move.length >= 2) {
                                              this.highlightSquare(move[0], move[1], this.materials.validMove);
                                         }
                                    });
                                }
                               // console.log("Human multi-jump continues, highlights updated.");
                            }
                            // If the turn passed to the computer:
                           else if (this.game.currentPlayer === this.computerPlayer && this.game.gameState === 'active') {
                               // console.log("Human move successful, triggering computer move.");
                                this.makeComputerMove();
                           } else {
                               // Human turn ended, no multi-jump, game might be over or human's turn again (unlikely)
                               this.highlightMandatorySelections(); // Highlight mandatory for next turn (if human)
                           }
                      } else {
                           // Move failed (e.g., clicking an invalid square)
                           // Re-highlight the currently selected piece and its valid moves
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
                           // console.log("Move execution failed by game logic.");
                      }
                 }
                 // 3. Clicking elsewhere or on opponent piece - Deselect and update highlights
                  else {
                      this.game.selectedPiece = null;
                      this.game.validMoves = [];
                      this.highlightMandatorySelections();
                      // console.log("Clicked outside valid action, deselected.");
                  }
            } else {
                 // Clicked, but not on a recognized board element (e.g., base)
                 this.clearHighlights();
                 this.game.selectedPiece = null; // Deselect if clicking background/base
                 this.game.validMoves = [];
                 this.highlightMandatorySelections(); // Re-show mandatory if needed
                 //console.log("Clicked background or unrecognized object.");
            }
        } else {
             // Clicked outside the board area entirely
             this.clearHighlights();
             this.game.selectedPiece = null;
             this.game.validMoves = [];
              this.highlightMandatorySelections();
             //console.log("Clicked outside board.");
        }
    }


    makeComputerMove() {
         if (this.game.gameState !== 'active' || this.game.currentPlayer !== this.computerPlayer || this.isComputerThinking) {
             // console.log("Skipping computer move: wrong state/player or already thinking.");
            return;
         }

        this.isComputerThinking = true;
        this.updateUI(); // Show "thinking..." message

        // Use setTimeout to allow UI update and prevent freezing during AI calculation
        setTimeout(() => {
            let moveSuccessful = false;
            try {
                 moveSuccessful = this.ai.makeMove(); // AI calculates and executes move via game object

                 if (moveSuccessful) {
                     //console.log("AI move executed by AI class.");
                 } else {
                      console.error("AI failed to make a move or no moves available.");
                      // If AI has no moves, game state should reflect this (loss/draw)
                       this.game.updateGameState();
                 }

            } catch (error) {
                 console.error("Error during AI move execution:", error);
                  this.game.updateGameState(); // Re-check game state after error
            } finally {
                  // This block runs regardless of success/error
                  this.isComputerThinking = false;
                  this.updatePiecePositions(); // Update visuals after AI attempt
                  this.clearHighlights(); // Clear any temporary highlights
                  this.updateUI(); // Update indicators based on potentially new game state

                 // IMPORTANT: Check if the AI's move resulted in a multi-jump continuation FOR THE AI
                 if (moveSuccessful && this.game.multiJumpPiece && this.game.currentPlayer === this.computerPlayer && this.game.gameState === 'active') {
                    // console.log("AI multi-jump continues. Triggering next AI move.");
                     this.makeComputerMove(); // AI immediately takes the next jump (recursive call essentially)
                 } else {
                     // AI turn finished (or game ended or failed move)
                     // Highlight mandatory pieces for the human player if it's their turn
                      if(this.game.currentPlayer === this.humanPlayer && this.game.gameState === 'active') {
                          this.highlightMandatorySelections();
                      }
                 }
             }
        }, 50); // Short delay (e.g., 50ms) before AI starts thinking to allow UI refresh
    }


    updatePiecePositions() {
        this.createPieces(); // Re-create all pieces based on current game board state
    }

    setupEventListeners() {
        // Ensure renderer element exists before adding listener
        if (this.renderer && this.renderer.domElement) {
             this.renderer.domElement.addEventListener('mousedown', this.onMouseDown.bind(this), false); // Listen on canvas
        }
        window.addEventListener('resize', this.onWindowResize.bind(this), false);

        // Undo Button - Ensure button exists
        const undoButton = document.getElementById('undo-button');
        if (undoButton) {
            undoButton.addEventListener('click', () => {
                 if (!this.isComputerThinking) { // Simpler check: allow undo unless AI is actively thinking
                     if (this.game.undoMove()) {
                         this.clearHighlights();
                         this.updatePiecePositions();
                         this.updateUI();
                          this.highlightMandatorySelections(); // Highlight jumps after undo if needed
                         // console.log("Undo successful via button.");
                     } else {
                          // console.log("Undo failed via button.");
                          // Provide feedback via alert or UI message
                           alert("Cannot undo move now. Check game state or history.");
                     }
                 } else {
                      alert("Cannot undo while computer is thinking.");
                 }
            });
        } else { console.warn("Undo button not found."); }


        // New Game Button - Ensure button exists
         const newGameBtn = document.getElementById('new-game-btn'); // Welcome screen button
         const newGameBtnInGame = document.getElementById('new-game-btn-ingame'); // Optional in-game button
         if (newGameBtn) {
            newGameBtn.addEventListener('click', () => this.startNewGame(true)); // Pass flag if called from welcome
         }
          if (newGameBtnInGame) {
             newGameBtnInGame.addEventListener('click', () => this.startNewGame(false));
          }


        // Back to Menu Button - Ensure button exists
         const backToMenuBtn = document.getElementById('back-to-menu');
         if (backToMenuBtn) {
             backToMenuBtn.addEventListener('click', () => {
                 const gameContainer = document.getElementById('game-container');
                 const welcomeScreen = document.getElementById('welcome-screen');
                 if (gameContainer) gameContainer.style.display = 'none';
                 if (welcomeScreen) welcomeScreen.style.display = 'flex';
                 // Optionally pause or clean up the renderer here if needed
             });
         } else { console.warn("Back to menu button not found."); }

   }

   setupDraggablePanel() {
       const gameInfo = document.getElementById('game-info');
       if (!gameInfo) return;

       let isDragging = false;
       let currentX;
       let currentY;
       let initialX;
       let initialY;
       let xOffset = 0;
       let yOffset = 0;

       const dragStart = (e) => {
           // Prevent dragging if clicking on buttons
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

               // Constrain to viewport bounds
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

       // Mouse events
       gameInfo.addEventListener('mousedown', dragStart);
       document.addEventListener('mousemove', drag);
       document.addEventListener('mouseup', dragEnd);

       // Touch events for mobile
       gameInfo.addEventListener('touchstart', dragStart);
       document.addEventListener('touchmove', drag);
       document.addEventListener('touchend', dragEnd);
   }

    setupMultiplayerHandlers() {
        // Skip if socket is not available or we're not in multiplayer mode
        if (!this.socket || !this.isMultiplayer) return;
        
        // Listen for opponent moves
        this.socket.on('move', moveData => {
            // Validate move data
            if (!moveData || !moveData.fromX || !moveData.fromY || !moveData.toX || !moveData.toY) {
                console.error('Invalid move data received:', moveData);
                return;
            }
            
            // Apply opponent's move to our game
            if (this.game.gameState === 'active' && this.game.currentPlayer === this.opponentPlayer) {
                // Select piece
                this.game.selectPiece(moveData.fromX, moveData.fromY);
                // Move piece
                if (this.game.movePiece(moveData.toX, moveData.toY)) {
                    this.updatePiecePositions();
                    this.updateUI();
                    this.highlightMandatorySelections();
                }
            }
        });
        
        // Listen for game state updates
        this.socket.on('gameState', stateData => {
            // Handle game state synchronization if needed
            if (stateData && stateData.board) {
                // Update game board
                this.game.board = stateData.board;
                this.updatePiecePositions();
                this.updateUI();
            }
        });
        
        // Listen for chat messages or other game events
        this.socket.on('chat', msgData => {
            // Handle chat messages
            console.log('Chat message:', msgData);
            // Display in UI if desired
        });
        
        // Listen for disconnect/reconnect
        this.socket.on('disconnect', () => {
            console.log('Disconnected from game server');
            // Show reconnect UI
        });
        
        this.socket.on('reconnect', () => {
            console.log('Reconnected to game server');
            // Request current game state
            this.socket.emit('getGameState', { gameCode: this.gameCode });
        });
    }
    
    // Method to send moves to opponent in multiplayer
    sendMove(fromX, fromY, toX, toY) {
        if (this.isMultiplayer && this.socket) {
            this.socket.emit('move', {
                gameCode: this.gameCode,
                fromX: fromX,
                fromY: fromY,
                toX: toX,
                toY: toY
            });
        }
    }

    startNewGame(fromWelcome = false, difficultyLevel = 'medium') {
        // console.log("Starting new game...");
        // If called from welcome screen, ensure game container is visible
        if (fromWelcome) {
            const welcomeScreen = document.getElementById('welcome-screen');
            const gameContainer = document.getElementById('game-container');
            if (welcomeScreen) welcomeScreen.style.display = 'none';
            if (gameContainer) gameContainer.style.display = 'flex'; // Use flex for layout
        }

        // Reset multiplayer settings
        this.isMultiplayer = false;
        this.socket = null;
        this.gameCode = null;

        this.game = new ChessGame(); // Create new game instance
        this.ai = new ChessAI(this.game, difficultyLevel); // Create new AI instance with difficulty
        this.humanPlayer = 'red';
        this.computerPlayer = 'yellow';
        this.isComputerThinking = false;
        this.clearHighlights();
        this.updatePiecePositions(); // Draw initial board
        this.updateUI();
        this.highlightMandatorySelections(); // Highlight initial jumps if any

        // If computer plays 'red' (starts first), make its move
        if (this.computerPlayer === this.game.currentPlayer && this.game.gameState === 'active') {
            this.makeComputerMove();
        }
    }
    
    startMultiplayerGame(fromWelcome = false, playerColor = 'red', socket = null, gameCode = null) {
        // If called from welcome screen, ensure game container is visible
        if (fromWelcome) {
            const welcomeScreen = document.getElementById('welcome-screen');
            const gameContainer = document.getElementById('game-container');
            if (welcomeScreen) welcomeScreen.style.display = 'none';
            if (gameContainer) gameContainer.style.display = 'flex'; // Use flex for layout
        }
        
        // Set up multiplayer
        this.isMultiplayer = true;
        this.socket = socket;
        this.gameCode = gameCode;
        this.humanPlayer = playerColor;
        this.opponentPlayer = playerColor === 'red' ? 'yellow' : 'red';
        this.computerPlayer = null; // No AI in multiplayer
        
        this.game = new ChessGame(); // Create new game instance
        this.setupMultiplayerHandlers(); // Set up socket event handlers
        
        // Inform the server we've joined/created a game
        if (socket) {
            if (playerColor === 'red') {
                // We're hosting a game
                socket.emit('hostGame', {});
                
                // Listen for game created event
                socket.on('gameCreated', (data) => {
                    this.gameCode = data.gameCode;
                    console.log(`Hosting game with code: ${this.gameCode}`);
                });
            } else {
                // We're joining a game
                socket.emit('joinGame', {
                    gameCode: gameCode
                });
                
                // Listen for game joined event
                socket.on('gameJoined', (data) => {
                    console.log(`Joined game with code: ${data.gameCode}`);
                });
            }
            
            // Listen for errors
            socket.on('error', (data) => {
                console.error('Game error:', data.message);
                alert(`Game error: ${data.message}`);
            });
        }
        
        this.clearHighlights();
        this.updatePiecePositions(); // Draw initial board
        this.updateUI();
        this.highlightMandatorySelections(); // Highlight initial jumps if needed
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    animate() {
        requestAnimationFrame(this.animate.bind(this));
        this.controls.update(); // Update orbit controls
        this.renderer.render(this.scene, this.camera);
    }
}

// --- Welcome Screen & Initialization Logic ---
document.addEventListener('DOMContentLoaded', () => {
    // Main containers
    const welcomeScreen = document.getElementById('welcome-screen');
    const gameContainer = document.getElementById('game-container');
    
    // Menu buttons
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

    // Game state variables
    let gameMode = 'vsAI';  // 'vsAI' or 'multiplayer'
    let difficulty = 'medium';  // 'easy', 'medium', 'hard', or 'expert'
    let multiplayerRole = 'host';  // 'host' or 'join'
    let gameCode = '';
    let socket = null;

    // Ensure required elements exist
    if (!welcomeScreen || !gameContainer || !startGameBtn || !exitBtn) {
        console.error("Fatal Error: Missing essential HTML elements (welcome/game container or buttons).");
        document.body.innerHTML = "<h1>Error: HTML structure is missing required elements. Cannot start game.</h1>";
        return;
    }

    // Ensure correct display initially
    welcomeScreen.style.display = 'flex';
    gameContainer.style.display = 'none';

    // Game mode selection event handlers
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

    // Difficulty selection event handlers
    const difficultyButtons = [easyBtn, mediumBtn, hardBtn, expertBtn];
    const difficultyLevels = ['easy', 'medium', 'hard', 'expert'];
    
    difficultyButtons.forEach((btn, index) => {
        btn.addEventListener('click', () => {
            difficulty = difficultyLevels[index];
            difficultyButtons.forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
        });
    });

    // Multiplayer option event handlers
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

    gameCodeInput.addEventListener('input', (e) => {
        gameCode = e.target.value.trim().toUpperCase();
    });

    // Start game button
    startGameBtn.addEventListener('click', () => {
        if (gameMode === 'vsAI') {
            startSinglePlayerGame(difficulty);
        } else {
            // For multiplayer mode
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

    // Start a single player game against AI
    function startSinglePlayerGame(difficultyLevel) {
        welcomeScreen.style.display = 'none';
        gameContainer.style.display = 'flex';

        if (!window.chessRenderer) {
            window.chessRenderer = new ChessRenderer(difficultyLevel);
        } else {
            window.chessRenderer.startNewGame(true, difficultyLevel);
        }
    }

    // Start or join a multiplayer game
    function startMultiplayerGame(role, code = null) {
        welcomeScreen.style.display = 'none';
        gameContainer.style.display = 'flex';

        if (!socket) {
            // Create a real socket.io connection
            socket = io();
            
            // Handle connection errors
            socket.on('connect_error', (error) => {
                console.error('Connection error:', error);
                alert('Failed to connect to game server. Please try again.');
                welcomeScreen.style.display = 'flex';
                gameContainer.style.display = 'none';
            });
        }

        if (role === 'host') {
            // When hosting, the server will generate the game code
            socket.on('gameCreated', (data) => {
                const generatedCode = data.gameCode;
                alert(`Your game code is: ${generatedCode}\nShare this code with your opponent.`);
                
                if (!window.chessRenderer) {
                    window.chessRenderer = new ChessRenderer(null, 'red', socket, generatedCode);
                } else {
                    window.chessRenderer.startMultiplayerGame(true, 'red', socket, generatedCode);
                }
            });
            
            // Request to host a game
            socket.emit('hostGame', {});
        } else {
            // Join an existing game
            socket.on('gameJoined', (data) => {
                if (!window.chessRenderer) {
                    window.chessRenderer = new ChessRenderer(null, 'yellow', socket, code);
                } else {
                    window.chessRenderer.startMultiplayerGame(true, 'yellow', socket, code);
                }
            });
            
            // Request to join a game
            socket.emit('joinGame', { gameCode: code });
        }
    }

    exitBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to exit?')) {
            // Try closing the window/tab, might be blocked by browser
            window.close();
            // Fallback message if close is blocked
            document.body.innerHTML = '<div style="display:flex; justify-content:center; align-items:center; height:100vh; background-color: #222; color: white;"><h1>Game session ended. Please close the tab/window.</h1></div>';
        }
    });

     // Helper function to ensure UI elements for game info exist
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

     // Add/Ensure placeholders for captured counts and buttons in HTML
     ensureUIElement('red-captured-count', 'red-captured', '0', 'span', ' Yellow Captured: ');
     ensureUIElement('yellow-captured-count', 'yellow-captured', '0', 'span', ' Red Captured: ');
     const undoBtn = ensureUIElement('undo-button', 'game-info', 'Undo Move', 'button');
     // Style is now handled by CSS targeting #game-info button

      ensureUIElement('thinking', 'game-info', 'Computer is thinking...', 'div');
       // Hide thinking initially
       const thinkingEl = document.getElementById('thinking');
       if (thinkingEl) thinkingEl.style.display = 'none';


})