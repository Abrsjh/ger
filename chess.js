// Russian Checkers Game Logic
class ChessGame {
    constructor() {
        this.rules = new ChessRules();
        // Initialize properties *before* complex operations
        this.currentPlayer = 'red'; // Red starts in Russian Checkers
        this.capturedPieces = { red: [], yellow: [] };
        this.gameState = 'active';
        this.moveHistory = [];
        this.selectedPiece = null;
        this.validMoves = [];
        this.multiJumpPiece = null;
        this.mustJump = false;
        this.canOnlySelectJumpingPieces = false;

        // Create the board *after* basic properties are set
        this.board = this.createInitialBoard();

        // Check mandatory jumps *after* board and player are definitely set
        this.checkMandatoryJumps();
    }

    // Create initial checkers board setup (Russian uses bottom left dark square)
    createInitialBoard() {
        const board = Array(8).fill().map(() => Array(8).fill(null));
        // Russian Checkers: Pieces start on the dark squares (where x+y is odd)
        for (let y = 0; y < 8; y++) {
            for (let x = 0; x < 8; x++) {
                if ((x + y) % 2 !== 0) { // Dark squares
                    if (y < 3) {
                        board[y][x] = { color: 'yellow', isKing: false }; // Yellow top
                    } else if (y > 4) {
                        board[y][x] = { color: 'red', isKing: false }; // Red bottom
                    }
                }
            }
        }
        // REMOVED checkMandatoryJumps() call from here
        return board;
    }

    // Check if the current player has any mandatory jumps available
    checkMandatoryJumps() {
        // Add logging here to confirm player value before the call
        // console.log(`CheckMandatoryJumps for player: ${this.currentPlayer}`);
        if (!this.currentPlayer) {
            console.error("CRITICAL: Attempting checkMandatoryJumps with invalid currentPlayer:", this.currentPlayer);
            this.mustJump = false;
            this.canOnlySelectJumpingPieces = false;
            return false;
        }
        // Defensive check for rules object
        if (!this.rules) {
             console.error("CRITICAL: rules object not available in checkMandatoryJumps");
             this.mustJump = false;
             this.canOnlySelectJumpingPieces = false;
             return false;
        }

        this.mustJump = this.rules.hasMandatoryJumps(this.board, this.currentPlayer);
        this.canOnlySelectJumpingPieces = this.mustJump;
        // Reset multi-jump state if the obligation changes
        if (!this.mustJump) {
            this.multiJumpPiece = null;
        }
       // console.log(`Player ${this.currentPlayer} mustJump: ${this.mustJump}`);
        return this.mustJump;
    }

    // Select a piece to move
    selectPiece(x, y) {
        // --- Multi-Jump Continuation ---
        if (this.multiJumpPiece) {
            // If in a multi-jump, can ONLY re-select the same piece
            if (this.multiJumpPiece.x === x && this.multiJumpPiece.y === y) {
                this.selectedPiece = { ...this.multiJumpPiece }; // Select the multi-jump piece
                // Valid moves are ONLY the continuation jumps
                 // Ensure piece exists before getting jumps
                 const currentPiece = this.board[y][x];
                 if (!currentPiece) {
                      console.error("Error re-selecting multi-jump piece: Piece not found at", x, y);
                      this.validMoves = [];
                      return false;
                 }
                 this.validMoves = this.rules.findSingleJumps(this.board, [x, y], currentPiece);
               // console.log("Reselecting multi-jump piece. Valid next jumps:", this.validMoves);
                return this.validMoves.length > 0;
            } else {
              //  console.log("Cannot select another piece during multi-jump.");
                return false; // Cannot select a different piece
            }
        }

        // --- Mandatory Jump Selection Restriction ---
        if (this.canOnlySelectJumpingPieces) {
            const piece = this.board[y][x];
            if (!piece || piece.color !== this.currentPlayer) {
                // console.log("Selection invalid: Not current player's piece.");
                return false; // Not a selectable piece
            }
            // Check if THIS specific piece has a jump move
            const jumps = this.rules.getJumpMoves(this.board, [x, y], piece);
            if (!Array.isArray(jumps)) { // Safety check
                console.error("getJumpMoves returned non-array for mandatory check");
                return false;
            }
            if (jumps.length === 0) {
              //  console.log("Selection rejected: Must select a piece that can jump.");
                this.selectedPiece = null;
                this.validMoves = [];
                return false; // This piece cannot jump, but others can
            }
            // Piece can jump, proceed with selection
        }

        // --- Regular Selection ---
        const piece = this.board[y][x];

        // Check if the selection is valid (correct player, active game)
        if (!piece || piece.color !== this.currentPlayer || this.gameState !== 'active') {
            this.selectedPiece = null;
            this.validMoves = [];
          //  console.log("Invalid selection: No piece, wrong color, or game over.");
            return false;
        }

        this.selectedPiece = { x, y, piece };
        // Get valid moves - rules handle mandatory jumps internally now
        this.validMoves = this.rules.getValidMoves(this.board, [x, y], piece);

        // Safety check on validMoves
        if (!Array.isArray(this.validMoves)) {
            console.error("getValidMoves returned non-array!");
            this.validMoves = [];
            this.selectedPiece = null;
            return false;
        }

        // If mustJump is true, validMoves *should* only contain jumps. Double-check.
         if (this.mustJump && this.validMoves.every(move => !Array.isArray(move) || move.length <= 2)) {
           // console.error("Logic Error: MustJump is true, but no jump moves found for selected piece!", x, y, piece, this.validMoves);
             this.selectedPiece = null;
             this.validMoves = [];
             return false;
         }


       // console.log(`Selected piece at (${x},${y}). MustJump: ${this.mustJump}. Valid moves:`, this.validMoves);

        // If no valid moves for this piece, deselect
        if (this.validMoves.length === 0) {
            // If mustJump is true, this case shouldn't happen if selection logic worked
             if (this.mustJump) {
                // console.warn(`Selected a jumping piece at (${x},${y}) but getValidMoves returned none?`);
             }
            this.selectedPiece = null;
          //  console.log("No valid moves for the selected piece.");
            return false;
        }

        return true;
    }

    // Move a piece
    movePiece(toX, toY) {
        if (!this.selectedPiece || this.gameState !== 'active') {
            // console.log("Move rejected: No selection or game not active.");
            return false;
        }

        const { x: fromX, y: fromY, piece } = this.selectedPiece;

        // Find the chosen move within the valid moves list
        let chosenMove = null;
        if (!Array.isArray(this.validMoves)) { // Safety check
             console.error("Cannot process move: validMoves is not an array");
             return false;
        }
        for (const move of this.validMoves) {
            // Check move format before accessing index
            if (Array.isArray(move) && move.length >= 2 && move[0] === toX && move[1] === toY) {
                chosenMove = move;
                break;
            }
        }

        if (!chosenMove) {
           // console.log("Invalid move target selected.");
            return false; // Target square is not a valid move destination
        }

        // --- Store State for Undo ---
         // Use deep copy for board state
         let boardBefore;
         let capturedBefore;
         try {
             boardBefore = JSON.parse(JSON.stringify(this.board));
             capturedBefore = JSON.parse(JSON.stringify(this.capturedPieces));
         } catch (e) {
              console.error("Error deep copying state for undo:", e);
              return false; // Cannot proceed safely
         }
         const playerBefore = this.currentPlayer;
         const multiJumpBefore = this.multiJumpPiece ? { ...this.multiJumpPiece } : null; // Copy multi-jump state too


        // --- Execute the Move ---
        const isJump = chosenMove.length > 2; // Assumes jump moves have length > 2
        let capturedPieceInfo = []; // To store info about captured piece(s)
        let originalPiece = { ...piece }; // Copy piece data before potential promotion

        // Apply move to board
        this.board[toY][toX] = piece; // Move the piece object
        this.board[fromY][fromX] = null;

        // Handle Capture(s)
        if (isJump) {
            let capX, capY;
            // Expecting format [toX, toY, capX, capY] based on rules refactor
            if (chosenMove.length === 4) {
                capX = chosenMove[2];
                capY = chosenMove[3];
            } else {
                 // If format is different (e.g., longer from old multi-jump logic), try geometry
                 console.warn("Unexpected move format for jump, attempting geometry:", chosenMove);
                 capX = fromX + (toX - fromX) / 2;
                 capY = fromY + (toY - fromY) / 2;
                 // Basic validation for geometry result
                 if (!Number.isInteger(capX) || !Number.isInteger(capY)) {
                     capX = undefined; capY = undefined;
                     console.error("Failed to determine capture location geometrically.");
                 }
            }

            if (capX !== undefined && this.isInBounds(capX, capY) && this.board[capY][capX]) {
                const captured = this.board[capY][capX];
               // console.log(`Capturing piece at (${capX}, ${capY})`);
                capturedPieceInfo.push({ piece: { ...captured }, x: capX, y: capY }); // Store copy
                this.capturedPieces[captured.color].push(captured);
                this.board[capY][capX] = null;
            } else {
                 // Only log error if we expected to find a piece based on move format
                 if (chosenMove.length === 4) {
                     console.error("Could not identify captured piece for move:", chosenMove, `from (${fromX},${fromY}) to (${toX},${toY})`, `Expected at (${capX},${capY})`);
                 }
            }
        }

        // Handle Promotion
        let promoted = false;
        const pieceAtDestination = this.board[toY][toX]; // Get ref to the moved piece
         // Check piece exists before accessing properties
        if (!originalPiece.isKing && pieceAtDestination && this.rules.shouldPromote(pieceAtDestination.color, toY)) {
            pieceAtDestination.isKing = true;
            promoted = true;
          //  console.log(`Piece promoted to King at (${toX}, ${toY})`);
             this.multiJumpPiece = null; // Force end of multi-jump on promotion
        }


         // --- Push move to history AFTER execution ---
         this.moveHistory.push({
             boardBefore: boardBefore,
             playerBefore: playerBefore,
             capturedBefore: capturedBefore,
             multiJumpBefore: multiJumpBefore,
             moveInfo: {
                 from: [fromX, fromY],
                 to: [toX, toY],
                 piece: originalPiece, // Piece state *before* move/promotion
                 isJump: isJump,
                 promoted: promoted,
                 captured: capturedPieceInfo // Array of {piece, x, y}
             }
         });


        // --- Check for Multi-Jump Continuation ---
        let canContinueJump = false;
        if (isJump && !promoted && pieceAtDestination) { // Check piece exists
            // Check for further jumps ONLY for the piece that just moved
            const furtherJumps = this.rules.findSingleJumps(this.board, [toX, toY], pieceAtDestination);
             if (!Array.isArray(furtherJumps)) { // Safety check
                 console.error("findSingleJumps returned non-array during multi-jump check");
             } else if (furtherJumps.length > 0) {
                 canContinueJump = true;
               //  console.log("Multi-jump continues!");
                 this.selectedPiece = { x: toX, y: toY, piece: pieceAtDestination }; // Keep selection
                 this.validMoves = furtherJumps; // Update valid moves to ONLY next jumps
                 this.multiJumpPiece = { ...this.selectedPiece }; // Set multi-jump state
                 this.mustJump = true; // Still in mandatory jump sequence
                 this.canOnlySelectJumpingPieces = true;
             }
        }

        // --- End Turn or Continue Multi-Jump ---
        if (!canContinueJump) {
          //  console.log("Turn ended.");
            // Switch player
            this.currentPlayer = this.currentPlayer === 'red' ? 'yellow' : 'red';
            // Reset selection and states
            this.selectedPiece = null;
            this.validMoves = [];
            this.multiJumpPiece = null;
            // Check mandatory jumps for the *new* player
            this.checkMandatoryJumps(); // !! Crucial step !!
            // Update game state (check for winner)
            this.updateGameState();
        } else {
          //  console.log("Turn continues (multi-jump).");
            // Player stays the same, selection is updated, mustJump remains true
        }

        return true; // Move successful
    }


    // Update game state (check for winner or draw)
    updateGameState() {
        const winner = this.rules.checkWinner(this.board); // checkWinner needs current player info implicitly or explicitly
         // Let's assume checkWinner determines loss if the *next* player to move has no moves.
         // We need to know who would move next if the game continued.
         const nextPlayer = this.currentPlayer; // The player whose turn it is NOW.

        if (winner === 'red') {
            this.gameState = 'red_win';
          //  console.log("Game Over: Red Wins!");
        } else if (winner === 'yellow') {
            this.gameState = 'yellow_win';
          //  console.log("Game Over: Yellow Wins!");
         } else if (winner === 'draw') {
             this.gameState = 'draw';
             // console.log("Game Over: Draw!");
         } else {
             // Check if the current player actually has moves. If not, they lose.
             // This logic is tricky because checkWinner already does this implicitly.
             // Let's trust checkWinner for now. If issues arise, we might need to pass the current player to it.
             this.gameState = 'active';
        }
         // If active, ensure jump status is correct
         if (this.gameState === 'active') {
             this.checkMandatoryJumps();
         }
    }

    // Check if a target square is a valid move destination for the selected piece
    isValidMove(targetX, targetY) {
        if (!this.selectedPiece || !Array.isArray(this.validMoves)) return false;
        for (const move of this.validMoves) {
            if (Array.isArray(move) && move.length >=2 && move[0] === targetX && move[1] === targetY) {
                return true;
            }
        }
        return false;
    }

    // Get current game state information
    getGameInfo() {
        return {
            currentPlayer: this.currentPlayer,
            gameState: this.gameState,
            capturedPieces: this.capturedPieces,
            mustJump: this.mustJump,
            multiJumpPiece: this.multiJumpPiece,
             canOnlySelectJumpingPieces: this.canOnlySelectJumpingPieces
        };
    }

    // Undo the last FULL turn (including multi-jumps)
    undoMove() {
         if (this.moveHistory.length === 0) {
             console.log("Cannot undo: No history.");
             return false;
         }
         // Prevent undo during AI thinking (assuming chessRenderer exists globally or is passed)
         if (typeof chessRenderer !== 'undefined' && chessRenderer.isComputerThinking) {
             console.log("Cannot undo: Computer is thinking.");
             return false;
         }
        // Prevent undo during human multi-jump
         if (this.multiJumpPiece && this.currentPlayer === (typeof chessRenderer !== 'undefined' ? chessRenderer.humanPlayer : 'red')) { // Assuming red is human default
              console.log("Cannot undo during a multi-jump sequence. Complete the turn first.");
              return false;
         }


        const lastState = this.moveHistory.pop();

         if (!lastState || !lastState.boardBefore || !lastState.playerBefore || !lastState.capturedBefore) {
              console.error("Cannot undo: Invalid state found in history.");
              // Attempt to recover or clear history? For now, just fail.
              return false;
         }

        // Restore board state from *before* the move
         try {
             // Use deep copy for safety, although direct assignment might work if copyBoard guarantees new objects
             this.board = JSON.parse(JSON.stringify(lastState.boardBefore));
             this.capturedPieces = JSON.parse(JSON.stringify(lastState.capturedBefore));
         } catch (e) {
              console.error("Error restoring state from undo history:", e);
              // Attempt to push state back? Or just return failure.
              this.moveHistory.push(lastState); // Put it back for inspection maybe?
              return false;
         }


        // Restore player
        this.currentPlayer = lastState.playerBefore;

        // Restore multi-jump state only if it existed before that turn started
        this.multiJumpPiece = lastState.multiJumpBefore ? { ...lastState.multiJumpBefore } : null;


        // Reset selection and recalculate mandatory jumps for the restored player
        this.selectedPiece = null;
        this.validMoves = [];
        // Check mandatory jumps *after* restoring state
        this.checkMandatoryJumps(); // Crucial: re-evaluate jump status

        // Update game state (likely back to 'active')
        this.gameState = 'active'; // Assume undoing brings game back to active
        this.updateGameState(); // Recalculate win/loss/draw state *after* setting active and checking jumps

       // console.log("Undo successful. Restored state for player:", this.currentPlayer);
        return true;
    }


    // Get the piece at a position
    getPieceAt(x, y) {
        if (this.isInBounds(x, y) && this.board && this.board[y]) { // Check board and row exist
            return this.board[y][x];
        }
        return null;
    }

     // Check bounds utility
     isInBounds(x, y) {
         return x >= 0 && x < 8 && y >= 0 && y < 8 && Number.isInteger(x) && Number.isInteger(y);
     }
}