// Russian Checkers Rules Implementation
class ChessRules {
    constructor() {
        // Directions
        this.directions = {
            // Regular pieces move forward only
            red_move: [[-1, -1], [1, -1]], // Red moves up (negative y)
            yellow_move: [[-1, 1], [1, 1]], // Yellow moves down (positive y)
            // All pieces capture in all directions (forward and backward)
            all_capture: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
            // Kings move and capture in all directions
            king_move: [[-1, -1], [1, -1], [-1, 1], [1, 1]]
        };
        // Add safety check for constructor data
        if (!this.directions || !this.directions.all_capture || !Array.isArray(this.directions.all_capture)) {
             console.error("CRITICAL: ChessRules directions not initialized correctly!");
             this.directions = { all_capture: [] }; // Provide safe default
        }
    }

    // Get valid moves for a piece (handles mandatory jumps)
    getValidMoves(board, position, piece) {
         // --- Input Validation ---
         if (!board || !position || !piece || !Array.isArray(position) || position.length !== 2) {
             console.error("Invalid arguments to getValidMoves:", { board, position, piece });
             return [];
         }
        // --- End Validation ---

        // Check if *any* piece for this player has a mandatory jump
        const mustJump = this.hasMandatoryJumps(board, piece.color);

        // Always calculate jumps first
        const jumpMoves = this.getJumpMoves(board, position, piece);

        if (mustJump) {
            // If mandatory jumps exist *somewhere*, this piece MUST jump if it can.
            // Return only its jump moves. If it can't jump, return empty.
            return jumpMoves;
        } else {
            // If no mandatory jumps exist for the player *anywhere* on the board,
            // return regular moves for this piece.
            // Ensure getRegularMoves is called only when no jumps found *for this piece* too
            if (jumpMoves.length > 0) {
                 // console.warn("getValidMoves inconsistency: mustJump is false, but piece has jumps?", position, piece);
                 return jumpMoves; // Prioritize jumps if found, even if mustJump flag was wrong
            }
            return this.getRegularMoves(board, position, piece);
        }
    }

    // Get ONLY regular (non-capture) moves for a piece
    getRegularMoves(board, position, piece) {
         // --- Input Validation ---
         if (!board || !position || !piece || !Array.isArray(position) || position.length !== 2) {
              console.error("Invalid arguments to getRegularMoves:", { board, position, piece });
              return [];
         }
         // --- End Validation ---

        const [x, y] = position;
        const color = piece.color;
        const isKing = piece.isKing;
        const moves = [];
        const moveDirections = isKing ? this.directions.king_move : (color === 'red' ? this.directions.red_move : this.directions.yellow_move);

         if (!moveDirections || !Array.isArray(moveDirections)) {
              console.error("Error getting move directions for piece:", piece);
              return []; // Cannot proceed
         }


        if (isKing) {
            // Kings move any distance diagonally
            for (const dir of moveDirections) {
                 // Robustness check
                 if (!dir || !Array.isArray(dir) || dir.length !== 2) {
                      console.error("Invalid king direction found:", dir); continue;
                 }
                 const [dx, dy] = dir;
                for (let dist = 1; dist < 8; dist++) {
                    const newX = x + dx * dist;
                    const newY = y + dy * dist;
                    if (!this.isInBounds(newX, newY)) break;
                    if (board[newY][newX]) break; // Path blocked
                    moves.push([newX, newY]);
                }
            }
        } else {
            // Regular pieces move one step diagonally *forward*
            for (const dir of moveDirections) {
                 // Robustness check
                 if (!dir || !Array.isArray(dir) || dir.length !== 2) {
                      console.error("Invalid regular move direction found:", dir); continue;
                 }
                 const [dx, dy] = dir;
                const newX = x + dx;
                const newY = y + dy;
                if (this.isInBounds(newX, newY) && !board[newY][newX]) {
                    moves.push([newX, newY]);
                }
            }
        }
        return moves;
    }


    // Get capture moves (jumps) - including multi-jumps detection
    getJumpMoves(board, position, piece) {
         // --- Input Validation ---
         if (!board || !position || !piece || !Array.isArray(position) || position.length !== 2) {
              console.error("Invalid arguments to getJumpMoves:", { board, position, piece });
              return [];
         }
         // --- End Validation ---

         const finalJumpSequences = [];

         // Recursive function to find jump paths
         const findPaths = (currentBoard, currentPos, currentPiece, pathSoFar) => {
             // Basic validation inside recursion
             if (!currentBoard || !currentPos || !currentPiece || !Array.isArray(currentPos) || currentPos.length !== 2) {
                  console.error("Invalid state in findPaths:", { currentBoard, currentPos, currentPiece });
                  return; // Stop this path
             }

             const singleJumps = this.findSingleJumps(currentBoard, currentPos, currentPiece);

             if (!Array.isArray(singleJumps)) { // Safety check on return value
                  console.error("findSingleJumps returned non-array!", singleJumps);
                  return;
             }

             if (singleJumps.length === 0) {
                 // If no more single jumps from here, and we made at least one jump, this path is complete
                 if (pathSoFar.length > 0) {
                     finalJumpSequences.push(pathSoFar);
                 }
                 return; // End recursion for this branch
             }

             // Explore each possible next jump
             for (const jump of singleJumps) {
                 // Check jump format
                 if (!jump || !Array.isArray(jump) || jump.length !== 4) {
                      console.error("Invalid jump format received from findSingleJumps:", jump);
                      continue; // Skip invalid jump data
                 }
                 const [nextX, nextY, capX, capY] = jump;

                 // Simulate this jump step
                 const nextBoard = this.copyBoard(currentBoard);
                 const pieceToMove = nextBoard[currentPos[1]][currentPos[0]]; // Get piece from simulated board
                  if (!pieceToMove) { // Safety check if piece somehow disappeared
                     console.error("Error finding jump path: piece missing at", currentPos);
                     continue;
                  }
                  // Validate capture coordinates before using them
                  if (!this.isInBounds(capX, capY)) {
                       console.error("Invalid capture coordinates in jump path:", {capX, capY});
                       continue;
                  }
                  // Validate landing coordinates
                   if (!this.isInBounds(nextX, nextY)) {
                        console.error("Invalid landing coordinates in jump path:", {nextX, nextY});
                        continue;
                   }


                 nextBoard[nextY][nextX] = { ...pieceToMove }; // Move piece (use copy)
                 nextBoard[currentPos[1]][currentPos[0]] = null; // Clear old spot
                 if (nextBoard[capY] && nextBoard[capY][capX]) { // Check if capture spot still has something
                     nextBoard[capY][capX] = null; // Remove captured piece
                 } else {
                      // console.warn("Attempted to remove captured piece that wasn't there:", {capX, capY});
                 }


                 // Check for promotion *after* this step
                 let pieceAfterJump = nextBoard[nextY][nextX];
                 let promotedThisStep = false;
                 if (!pieceAfterJump.isKing && this.shouldPromote(pieceAfterJump.color, nextY)) {
                     pieceAfterJump.isKing = true;
                     promotedThisStep = true;
                 }

                 const newPath = [nextX, nextY, capX, capY, ...pathSoFar];

                 if (promotedThisStep) {
                     // Promotion ends the turn
                     finalJumpSequences.push(newPath);
                 } else {
                     // Continue searching for jumps from the new position
                     findPaths(nextBoard, [nextX, nextY], pieceAfterJump, newPath);
                 }
             }
         };

         // Start the search
         findPaths(board, position, piece, []);

         // Reformatting the recursive result
         const formattedMoves = [];
         for (const path of finalJumpSequences) {
              if (!path || !Array.isArray(path) || path.length < 4 || path.length % 4 !== 0) {
                   console.error("Invalid path format found in finalJumpSequences:", path);
                   continue;
              }
             // Extract the *first* jump step from the path sequence.
              // Path is [lastX, lastY, lastCapX, lastCapY, ..., firstX, firstY, firstCapX, firstCapY]
              const firstStepEndX = path[path.length - 4];
              const firstStepEndY = path[path.length - 3];
              const firstStepCapX = path[path.length - 2];
              const firstStepCapY = path[path.length - 1];

               // Validate coordinates from path reconstruction
               if (typeof firstStepEndX !== 'number' || typeof firstStepEndY !== 'number' ||
                   typeof firstStepCapX !== 'number' || typeof firstStepCapY !== 'number') {
                    console.error("Invalid coordinates extracted from path:", path);
                    continue;
               }

              const firstStepMove = [firstStepEndX, firstStepEndY, firstStepCapX, firstStepCapY];

               // Avoid duplicates if multiple multi-jump paths start the same way
               if (!formattedMoves.some(m => m[0] === firstStepMove[0] && m[1] === firstStepMove[1] && m[2] === firstStepMove[2] && m[3] === firstStepMove[3])) {
                   formattedMoves.push(firstStepMove);
               }
         }

         return formattedMoves;
    }


    // Helper method to find ONLY single jump steps from a position
    findSingleJumps(board, position, piece) {
         // --- Input Validation ---
          if (!board || !position || !piece || !Array.isArray(position) || position.length !== 2 || !piece.color || typeof piece.isKing === 'undefined') {
               console.error("Invalid arguments to findSingleJumps:", { board, position, piece });
               return []; // Return empty array for invalid input
          }
           if (!this.directions || !this.directions.all_capture || !Array.isArray(this.directions.all_capture)) {
                console.error("DIRECTIONS missing or invalid in findSingleJumps!");
                return [];
           }
         // --- End Validation ---

        const [x, y] = position;
        const color = piece.color;
        const isKing = piece.isKing;
        const jumps = [];
        const opponentColor = color === 'red' ? 'yellow' : 'red';

        for (const dir of this.directions.all_capture) {
             // Check if direction itself is valid before destructuring
             if (!dir || !Array.isArray(dir) || dir.length !== 2) {
                  console.error("Invalid direction found in this.directions.all_capture:", dir);
                  continue; // Skip this invalid direction
             }
             const [dx, dy] = dir; // Now safe to destructure


            if (isKing) {
                // Kings can jump over a single piece from any distance
                let opponentFound = false;
                let captureX = -1, captureY = -1;
                for (let dist = 1; dist < 8; dist++) {
                    const checkX = x + dx * dist;
                    const checkY = y + dy * dist;

                    if (!this.isInBounds(checkX, checkY)) break; // Off board

                    const squareContent = board[checkY] ? board[checkY][checkX] : undefined; // Safe access
                    if (squareContent) {
                         // Check piece validity
                         if (!squareContent.color) {
                              // console.warn(`Malformed piece found at (${checkX},${checkY}) during king jump check.`);
                              break; // Treat as blockage
                         }
                        if (squareContent.color === opponentColor && !opponentFound) {
                            // Found the opponent piece to jump
                            opponentFound = true;
                            captureX = checkX;
                            captureY = checkY;
                        } else {
                            // Blocked by another piece (friendly or second opponent)
                            break;
                        }
                    } else {
                        // Empty square
                        if (opponentFound) {
                            // This is a valid landing spot after jumping the opponent found earlier
                            jumps.push([checkX, checkY, captureX, captureY]);
                            // King can continue checking further landing spots in the same direction
                        }
                        // If no opponent found yet, just continue checking further squares
                    }
                }
            } else {
                // Regular pieces jump exactly one adjacent opponent piece landing right behind it
                const captureX = x + dx;
                const captureY = y + dy;
                const landX = x + dx * 2;
                const landY = y + dy * 2;

                if (this.isInBounds(captureX, captureY) && this.isInBounds(landX, landY)) {
                     // Ensure indices are valid before accessing board
                    const capturedPiece = board[captureY] ? board[captureY][captureX] : undefined;
                    const landingSquare = board[landY] ? board[landY][landX] : undefined;

                    if (capturedPiece && capturedPiece.color === opponentColor && !landingSquare) {
                         // Check piece validity
                         if (!capturedPiece.color) {
                              // console.warn(`Malformed captured piece found at (${captureX},${captureY}) during regular jump check.`);
                         } else {
                              jumps.push([landX, landY, captureX, captureY]);
                         }
                    }
                }
            }
        }
        return jumps;
    }


    // Check if position is within bounds
    isInBounds(x, y) {
        return x >= 0 && x < 8 && y >= 0 && y < 8 && Number.isInteger(x) && Number.isInteger(y);
    }

    // Check if a piece should be promoted to king
    shouldPromote(color, y) {
        return (color === 'red' && y === 0) || (color === 'yellow' && y === 7);
    }

    // Make a deep copy of the board (can be slow, use cautiously)
    copyBoard(board) {
        if (!board) return null;
         const newBoard = Array(8).fill(null).map(() => Array(8).fill(null));
         for (let y = 0; y < 8; y++) {
             for (let x = 0; x < 8; x++) {
                 if (board[y] && board[y][x]) { // Add check for row existence
                     newBoard[y][x] = { ...board[y][x] };
                 }
             }
         }
         return newBoard;
    }

    // Check for a winner
    checkWinner(board) {
        // Basic check if board is valid
        if (!board || !Array.isArray(board) || board.length !== 8) {
             console.error("Invalid board passed to checkWinner");
             return null; // Cannot determine winner
        }

        let redPieces = 0;
        let yellowPieces = 0;
        let redMovesAvailable = false;
        let yellowMovesAvailable = false;

        for (let y = 0; y < 8; y++) {
             if (!Array.isArray(board[y]) || board[y].length !== 8) { // Check row validity
                 console.error(`Invalid board row ${y} in checkWinner`);
                 continue; // Skip invalid row
             }
            for (let x = 0; x < 8; x++) {
                const piece = board[y][x];
                if (piece) {
                    // Basic piece validation
                     if (!piece.color || typeof piece.isKing === 'undefined') {
                          // console.warn(`Malformed piece at (${x},${y}) in checkWinner`);
                          continue; // Skip malformed piece
                     }

                    if (piece.color === 'red') {
                        redPieces++;
                        if (!redMovesAvailable) {
                             // Check jumps first (more common way to have moves)
                             if (this.findSingleJumps(board, [x, y], piece).length > 0 || this.getRegularMoves(board, [x, y], piece).length > 0) {
                                 redMovesAvailable = true;
                             }
                        }
                    } else { // Yellow piece
                        yellowPieces++;
                        if (!yellowMovesAvailable) {
                             if (this.findSingleJumps(board, [x, y], piece).length > 0 || this.getRegularMoves(board, [x, y], piece).length > 0) {
                                 yellowMovesAvailable = true;
                             }
                        }
                    }
                }
            }
        }

        // Check win by eliminating all opponent pieces
        if (redPieces === 0 && yellowPieces > 0) return 'yellow'; // Need at least one piece left to win
        if (yellowPieces === 0 && redPieces > 0) return 'red';
        if (redPieces === 0 && yellowPieces === 0) return 'draw'; // No pieces left.

        // Check win by blocking all opponent moves
        // This requires knowing whose turn it is, which this function doesn't directly know.
        // Rely on the game state logic calling this and interpreting the *lack* of moves for the *current* player.
        // However, we can return based on general move availability for conditions like AI evaluation.
        if (!redMovesAvailable && yellowMovesAvailable) return 'yellow'; // Red has no moves at all
        if (!yellowMovesAvailable && redMovesAvailable) return 'red'; // Yellow has no moves at all
        // If BOTH have no moves, it's potentially a draw (stalemate - rare in checkers)
        if (!redMovesAvailable && !yellowMovesAvailable && redPieces > 0 && yellowPieces > 0) return 'draw';


        return null; // No winner yet
    }

     // Helper to determine player turn just from board state (crude, assumes alternating turns)
     // Not reliable, game state should track current player. Used only for internal rule check if needed.
     getCurrentPlayerFromBoard(board) {
         return 'unknown'; // Keep as unreliable placeholder
     }


    // Check if a specific player has ANY mandatory jumps available
    hasMandatoryJumps(board, color) {
         // --- Input Validation ---
         if (!board) { // Check board first
              console.error("Invalid arguments to hasMandatoryJumps: board is missing or invalid.", { board, color });
              return false;
         }
         if (!color || typeof color !== 'string' || (color !== 'red' && color !== 'yellow')) { // Check color specifically
             console.error("Invalid arguments to hasMandatoryJumps: color is invalid.", { color: color }); // Log the invalid color value
             return false;
         }
          if (!this.directions || !this.directions.all_capture) { // Check needed here too
               console.error("DIRECTIONS missing in hasMandatoryJumps!");
               return false;
          }
         // --- End Validation ---

        for (let y = 0; y < 8; y++) {
             if (!board[y]) continue; // Skip if row doesn't exist
            for (let x = 0; x < 8; x++) {
                const piece = board[y][x];
                // Add piece validation
                if (piece && piece.color === color && typeof piece.isKing !== 'undefined') {
                    // Call findSingleJumps - already added validation inside it.
                    if (this.findSingleJumps(board, [x, y], piece).length > 0) {
                        return true; // Found at least one jump for this player
                    }
                } else if (piece && piece.color === color) {
                     // console.warn(`Malformed piece at (${x},${y}) in hasMandatoryJumps check.`);
                }
            }
        }
        return false; // No jumps found for this player
    }
}