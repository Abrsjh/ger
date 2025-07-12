// Advanced Russian Checkers AI Implementation with Iterative Deepening, Zobrist Hashing, and Quiescence Search
class ChessAI {
    constructor(game, difficultyLevel = 'medium') {
        this.game = game;
        this.rules = new ChessRules(); // AI needs access to rules (DO NOT MODIFY)
        
        // Set difficulty level
        this.setDifficultyLevel(difficultyLevel);
        this.transpositionTable = new Map(); // Cache { zobristHash: { score, depth, type, bestMoveHash } }
                                             // type: 0=Exact, 1=Lower Bound (alpha), 2=Upper Bound (beta)
        this.startTime = 0;
        this.nodesEvaluated = 0;
        this.qNodesEvaluated = 0; // Nodes evaluated in quiescence search
        this.bestMoveThisIteration = null;
        this.timedOut = false; // Flag to indicate timeout occurred
        this.currentBestMoveHash = null; // Store hash of best move for TT

        // --- Zobrist Hashing Setup ---
        this.zobristTable = this.initZobrist();
        this.zobristTurn = Math.floor(Math.random() * Math.pow(2, 32)); // Random number for player turn

        // Piece values (King significantly more valuable in Russian Checkers)
        this.pieceValues = {
            regular: 100,
            king: 400 // Increased value for kings
        };

        // Central squares (more granular weighting)
        this.centerWeights = [ // Simplified center weights
            [0, 0, 0, 0, 0, 0, 0, 0],
            [0, 1, 1, 1, 1, 1, 1, 0],
            [0, 1, 2, 2, 2, 2, 1, 0],
            [0, 1, 2, 3, 3, 2, 1, 0],
            [0, 1, 2, 3, 3, 2, 1, 0],
            [0, 1, 2, 2, 2, 2, 1, 0],
            [0, 1, 1, 1, 1, 1, 1, 0],
            [0, 0, 0, 0, 0, 0, 0, 0]
        ];
    }

    // Set AI difficulty level by adjusting search parameters
    setDifficultyLevel(level) {
        switch(level) {
            case 'easy':
                this.targetDepth = 3; // Shallow search depth
                this.timeLimitMs = 500; // Short time limit (0.5 seconds)
                this.MAX_QUIESCENCE_DEPTH = 1; // Limited quiescence search
                this.weights = {
                    material: 1.0,       // Material advantage
                    position: 0.1,       // Less emphasis on position
                    kingMobility: 0.2,   // Less emphasis on king mobility
                    promotionThreat: 0.2,// Less emphasis on promotion threats
                    defense: 0.1,        // Less emphasis on defense
                    attack: 0.2,         // Less emphasis on attack
                    backRowDefense: 0.05 // Less emphasis on back row defense
                };
                break;
            
            case 'medium':
                this.targetDepth = 5; // Medium search depth
                this.timeLimitMs = 1000; // Medium time limit (1 second)
                this.MAX_QUIESCENCE_DEPTH = 3; // Medium quiescence search
                this.weights = {
                    material: 1.0,       // Material advantage
                    position: 0.3,       // Board position (advancement, center)
                    kingMobility: 0.4,   // King's ability to move freely
                    promotionThreat: 0.3,// Threatening to promote
                    defense: 0.2,        // Basic defense
                    attack: 0.4,         // Potential captures / forcing moves
                    backRowDefense: 0.1  // Minor bonus for back row
                };
                break;
            
            case 'hard':
                this.targetDepth = 7; // Deep search depth
                this.timeLimitMs = 2000; // Longer time limit (2 seconds)
                this.MAX_QUIESCENCE_DEPTH = 4; // Full quiescence search
                this.weights = {
                    material: 1.0,       // Material advantage
                    position: 0.4,       // More emphasis on position
                    kingMobility: 0.5,   // More emphasis on king mobility
                    promotionThreat: 0.4,// More emphasis on promotion threats
                    defense: 0.3,        // More emphasis on defense
                    attack: 0.5,         // More emphasis on attack
                    backRowDefense: 0.2  // More emphasis on back row defense
                };
                break;
            
            case 'expert':
                this.targetDepth = 9; // Very deep search depth
                this.timeLimitMs = 3000; // Long time limit (3 seconds)
                this.MAX_QUIESCENCE_DEPTH = 5; // Extended quiescence search
                this.weights = {
                    material: 1.0,       // Material advantage
                    position: 0.5,       // Strong emphasis on position
                    kingMobility: 0.6,   // Strong emphasis on king mobility
                    promotionThreat: 0.5,// Strong emphasis on promotion threats
                    defense: 0.4,        // Strong emphasis on defense
                    attack: 0.6,         // Strong emphasis on attack
                    backRowDefense: 0.3  // Strong emphasis on back row defense
                };
                break;
            
            default: // Default to medium if an invalid level is provided
                this.targetDepth = 5;
                this.timeLimitMs = 1000;
                this.MAX_QUIESCENCE_DEPTH = 3;
                this.weights = {
                    material: 1.0,
                    position: 0.3,
                    kingMobility: 0.4,
                    promotionThreat: 0.3,
                    defense: 0.2,
                    attack: 0.4,
                    backRowDefense: 0.1
                };
                break;
        }
    }

    // --- Zobrist Hashing Initialization ---
    initZobrist() {
        const table = [];
        // Create random numbers for each piece type (0=red_reg, 1=red_king, 2=yellow_reg, 3=yellow_king) at each square
        for (let i = 0; i < 4; i++) {
            table[i] = [];
            for (let sq = 0; sq < 64; sq++) {
                table[i][sq] = Math.floor(Math.random() * Math.pow(2, 32)); // Use 32-bit integers for simplicity
            }
        }
        return table;
    }

    getPieceZobristIndex(piece) {
        if (!piece) return -1;
        if (piece.color === 'red') {
            return piece.isKing ? 1 : 0;
        } else { // yellow
            return piece.isKing ? 3 : 2;
        }
    }

    computeZobristHash(board, colorToMove) {
        let hash = 0;
        for (let y = 0; y < 8; y++) {
            for (let x = 0; x < 8; x++) {
                const piece = board[y][x];
                if (piece) {
                    const pieceIndex = this.getPieceZobristIndex(piece);
                    const squareIndex = y * 8 + x;
                    hash ^= this.zobristTable[pieceIndex][squareIndex];
                }
            }
        }
        if (colorToMove === 'yellow') { // Assume yellow might flip the turn hash
            hash ^= this.zobristTurn;
        }
        return hash;
    }

     // --- Core AI Logic ---

    makeMove() {
        this.startTime = Date.now();
        this.nodesEvaluated = 0;
        this.qNodesEvaluated = 0;
        this.bestMoveThisIteration = null;
        this.timedOut = false; // Reset timeout flag
        this.transpositionTable.clear(); // Clear TT for new move calculation

        let bestMoveOverall = null;
        let bestScoreOverall = -Infinity; // Track best score found
        const aiColor = this.game.currentPlayer; // AI plays the current player's color
        const initialBoardHash = this.computeZobristHash(this.game.board, aiColor);

        try {
            // --- Iterative Deepening Loop ---
            for (let depth = 1; depth <= this.targetDepth; depth++) {
                this.bestMoveThisIteration = null; // Reset for this depth
                this.currentBestMoveHash = null;   // Reset best move hash for this depth
                let score;

                try {
                    // Start search from the root
                    score = this.findBestMoveAtDepth(this.game.board, aiColor, depth, initialBoardHash);
                } catch (e) {
                    if (e.message === "Time limit exceeded") {
                         // console.log(`Timeout caught at depth ${depth}. Using previous best move.`);
                         this.timedOut = true;
                         break; // Stop iterative deepening
                    } else {
                         console.error(`Unexpected error during depth ${depth} search:`, e);
                         this.timedOut = true; // Stop search on other errors too
                         break;
                    }
                }

                // Store the best move found at this completed depth
                if (this.bestMoveThisIteration && !this.timedOut) {
                    bestMoveOverall = this.bestMoveThisIteration; // This is the actual move object
                    bestScoreOverall = score; // Update overall best score
                   // console.log(`Depth ${depth} completed. Best move: ${bestMoveOverall.fromX},${bestMoveOverall.fromY} -> ${bestMoveOverall.toX},${bestMoveOverall.toY}. Score: ${score}. Nodes: ${this.nodesEvaluated} (Q: ${this.qNodesEvaluated}) TT Size: ${this.transpositionTable.size}`);

                    // --- Check Time AFTER completing a depth ---
                    if (Date.now() - this.startTime > this.timeLimitMs) {
                      //  console.log(`Time limit reached after completing depth ${depth}.`);
                        this.timedOut = true;
                        break;
                    }

                } else if (this.timedOut) {
                   // console.log(`Search stopped during depth ${depth} due to timeout.`);
                    break; // Exit loop if timed out
                } else {
                   // console.log(`Depth ${depth} completed, but no best move found? Score: ${score}`);
                    // This might happen if the only moves lead to immediate loss very early, or if no moves are possible.
                     if (!bestMoveOverall) { // If we never found *any* move
                        // Try to find if any moves exist at all
                        let fallbackMoves = this.getAllPossibleMoves(this.game.board, aiColor, true);
                        if (fallbackMoves.length === 0) fallbackMoves = this.getAllPossibleMoves(this.game.board, aiColor, false);
                        if (fallbackMoves.length > 0) {
                            bestMoveOverall = fallbackMoves[0]; // Pick the first (best heuristic guess)
                            // console.log(`Depth ${depth} found no improving move, setting fallback: ${bestMoveOverall.fromX},${bestMoveOverall.fromY} -> ${bestMoveOverall.toX},${bestMoveOverall.toY}`);
                        } else {
                            // console.log("No moves possible at all.");
                             break; // Truly no moves
                        }
                     } else {
                        // We had a best move from previous iteration, stick with it.
                       // console.log(`Depth ${depth} found no better move, keeping previous best.`);
                     }
                      // Still check time limit if no new move found
                      if (Date.now() - this.startTime > this.timeLimitMs) {
                           this.timedOut = true;
                           break;
                      }
                }


                 // If no moves found at all (game likely over or stalemate), break
                 if (!bestMoveOverall && depth > 0) { // Check if we have *ever* found a move
                    // console.log("No valid moves found for AI early in search. Game might be over.");
                     break;
                 }
            } // End of iterative deepening loop

        } catch (e) {
            console.error("Error during AI move calculation main loop:", e);
            // Fallback might be needed here too if the error wasn't timeout
             if (!bestMoveOverall) {
                 // Fallback logic similar to below
             }
        }


        // --- Fallback / Execution ---
        if (!bestMoveOverall) {
             console.warn("AI finished search but found no best move overall. Falling back.");
             let fallbackMoves = this.getAllPossibleMoves(this.game.board, aiColor, true); // Jumps first
             if (fallbackMoves.length === 0) {
                 fallbackMoves = this.getAllPossibleMoves(this.game.board, aiColor, false); // Then regular
             }
             if (fallbackMoves.length > 0) {
                 this.sortMoves(fallbackMoves); // Sort by heuristic
                 bestMoveOverall = fallbackMoves[0];
                 console.log(`Executing fallback move (best heuristic): ${bestMoveOverall.fromX},${bestMoveOverall.fromY} -> ${bestMoveOverall.toX},${bestMoveOverall.toY}`);
             } else {
                  console.log("AI Fallback failed: No valid moves found at all.");
                  this.game.updateGameState(); // Ensure game state reflects this
                  return false; // AI cannot move
             }
        }

        // Execute the best move found
        // console.log(`Final AI Move (${aiColor}): ${bestMoveOverall.fromX},${bestMoveOverall.fromY} -> ${bestMoveOverall.toX},${bestMoveOverall.toY} (Score: ${bestScoreOverall}) Nodes: ${this.nodesEvaluated} (Q: ${this.qNodesEvaluated}) TimedOut: ${this.timedOut}`);
        const pieceSelected = this.game.selectPiece(bestMoveOverall.fromX, bestMoveOverall.fromY);
        if (pieceSelected) {
            return this.game.movePiece(bestMoveOverall.toX, bestMoveOverall.toY);
        } else {
            console.error("AI failed to select its chosen piece:", bestMoveOverall, "Current board state:", JSON.stringify(this.game.board));
            return false; // Indicate failure
        }
    }

    // Renamed: Root function to manage the search for a given depth
    findBestMoveAtDepth(board, aiColor, depth, initialBoardHash) {
        const isMaximizing = aiColor === 'yellow'; // Assuming yellow is maximizing AI
        let alpha = -Infinity;
        let beta = Infinity;
        let bestScore = isMaximizing ? -Infinity : Infinity;
        let currentBestMove = null; // This will hold the actual move object

        // Get all possible moves, respecting mandatory jumps
        const possibleMoves = this.getAllPossibleMoves(board, aiColor, true); // Check jumps first
        if (possibleMoves.length === 0) {
             possibleMoves.push(...this.getAllPossibleMoves(board, aiColor, false));
        }

        if (possibleMoves.length === 0) {
            // console.log(`No moves found for ${aiColor} at root of depth ${depth}.`);
            return isMaximizing ? -Infinity : Infinity; // No moves possible
        }

        // Sort moves for better alpha-beta pruning
        this.sortMoves(possibleMoves);

        // --- Principal Variation Search (PVS) inspired approach at root ---
        // Search first move with full window
        const firstMove = possibleMoves[0];
        let score = this.searchMove(board, firstMove, depth, alpha, beta, isMaximizing, aiColor, false, initialBoardHash);

        if (isMaximizing) {
            bestScore = score;
            currentBestMove = firstMove;
            alpha = Math.max(alpha, bestScore);
        } else {
            bestScore = score;
            currentBestMove = firstMove;
            beta = Math.min(beta, bestScore);
        }
        if (this.timedOut) throw new Error("Time limit exceeded"); // Check after first move

        // Search remaining moves with null/zero window
        for (let i = 1; i < possibleMoves.length; i++) {
             const move = possibleMoves[i];
             // Check time limit *before* diving deep for each root move
            if (this.timedOut || Date.now() - this.startTime > this.timeLimitMs) {
                 this.timedOut = true;
                 throw new Error("Time limit exceeded"); // Signal stop
            }

             // Null window search
             let nullWindowScore;
             if (isMaximizing) {
                 nullWindowScore = this.searchMove(board, move, depth, alpha, alpha + 1, isMaximizing, aiColor, false, initialBoardHash);
                 if (nullWindowScore > alpha && nullWindowScore < beta && !this.timedOut) { // If it failed high, re-search with full window
                    // console.log(`PVS re-search needed at root (max) depth ${depth}`);
                     score = this.searchMove(board, move, depth, alpha, beta, isMaximizing, aiColor, false, initialBoardHash);
                 } else {
                     score = nullWindowScore;
                 }
             } else { // Minimizing
                 nullWindowScore = this.searchMove(board, move, depth, beta - 1, beta, isMaximizing, aiColor, false, initialBoardHash);
                  if (nullWindowScore < beta && nullWindowScore > alpha && !this.timedOut) { // If it failed low, re-search with full window
                   // console.log(`PVS re-search needed at root (min) depth ${depth}`);
                     score = this.searchMove(board, move, depth, alpha, beta, isMaximizing, aiColor, false, initialBoardHash);
                  } else {
                      score = nullWindowScore;
                  }
             }
              if (this.timedOut) throw new Error("Time limit exceeded");


            if (isMaximizing) {
                if (score > bestScore) {
                    bestScore = score;
                    currentBestMove = move; // Store the actual move object
                    alpha = Math.max(alpha, bestScore);
                }
            } else { // Minimizing
                if (score < bestScore) {
                    bestScore = score;
                    currentBestMove = move; // Store the actual move object
                    beta = Math.min(beta, bestScore);
                }
            }

             // Optional: Pruning at root (if score already outside bounds) - Alpha/Beta updates handle this implicitly
             // if (alpha >= beta) break;
        }


         if (currentBestMove) {
            this.bestMoveThisIteration = currentBestMove; // Store the best move object found at this depth
            // Compute and store the hash of the state *after* the best move for TT hint
            const tempBoard = this.copyBoard(board);
            const moveHash = this.simulateMove(tempBoard, currentBestMove, initialBoardHash); // Get hash after move
            this.currentBestMoveHash = moveHash; // Store for potential use in TT
         }

        return bestScore;
    }

    // Helper to simulate and search a single move branch
    searchMove(board, move, depth, alpha, beta, isMaximizing, color, isContinuation, currentHash) {
         const boardCopy = this.copyBoard(board);
         const pieceBeforeMove = board[move.fromY][move.fromX]; // Get piece state *before* sim
         if (!pieceBeforeMove) {
            console.error("AI Search Error: Piece to move not found at source", move);
            return isMaximizing ? -Infinity : Infinity; // Penalize invalid state
         }
         const nextHash = this.simulateMove(boardCopy, move, currentHash); // Simulate & update hash
         const nextColor = color === 'red' ? 'yellow' : 'red';

         let score;
         const pieceAfterMove = boardCopy[move.toY][move.toX];
         let furtherJumps = [];
         let promoted = false;

         if (pieceAfterMove && !pieceBeforeMove.isKing && this.rules.shouldPromote(pieceAfterMove.color, move.toY)) {
             promoted = true; // Promotion detected (already handled in simulateMove's hash update)
         }

         if (move.isJump && !promoted && pieceAfterMove) {
             furtherJumps = this.rules.findSingleJumps(boardCopy, [move.toX, move.toY], pieceAfterMove);
         }


         if (move.isJump && furtherJumps.length > 0 && !promoted) {
             // If a multi-jump continues, *same player* keeps going. Depth doesn't decrease yet.
             // Pass the *new* hash and indicate it's a continuation for the *same* player.
             score = this.minimax(boardCopy, depth, alpha, beta, isMaximizing, color, true, nextHash); // Same player, same depth
         } else {
             // Turn ends, switch player. Decrease depth by 1.
             // Pass the *new* hash for the *next* player's turn.
             score = this.minimax(boardCopy, depth - 1, alpha, beta, !isMaximizing, nextColor, false, nextHash);
         }
         return score;
    }


    // Minimax algorithm with alpha-beta pruning, Zobrist TT, and Quiescence Search
    minimax(board, depth, alpha, beta, isMaximizing, color, isContinuation, currentHash) {
        this.nodesEvaluated++;

        // --- Time Limit Check ---
        // Check less frequently using nodes evaluated
        const checkFrequency = depth <= 2 ? 10000 : (depth <= 4 ? 5000 : 2000);
        if (this.nodesEvaluated % checkFrequency === 0) {
            if (Date.now() - this.startTime > this.timeLimitMs) {
                 this.timedOut = true; // Set global flag
                throw new Error("Time limit exceeded"); // Signal to stop search
            }
        }

        // --- Terminal State Check (Win/Loss/Draw) ---
        const winner = this.rules.checkWinner(board);
        if (winner) {
            const aiColorPerspective = 'yellow'; // Always evaluate from Yellow's POV for consistency
            if (winner === aiColorPerspective) return 10000 + depth; // Faster win is better
            if (winner === (aiColorPerspective === 'yellow' ? 'red' : 'yellow')) return -10000 - depth; // Faster loss is worse
            return 0; // Draw
        }

        // --- Base Case: Depth Limit Reached -> Quiescence Search ---
        if (depth <= 0) {
             return this.quiescenceSearch(board, alpha, beta, isMaximizing, color, currentHash, 0);
        }

        // --- Transposition Table Lookup ---
        const originalAlpha = alpha;
        const originalBeta = beta;
        const cachedEntry = this.transpositionTable.get(currentHash);
        if (cachedEntry && cachedEntry.depth >= depth) {
            if (cachedEntry.type === 0) return cachedEntry.score; // Exact
            if (cachedEntry.type === 1) alpha = Math.max(alpha, cachedEntry.score); // Lower Bound
            if (cachedEntry.type === 2) beta = Math.min(beta, cachedEntry.score);   // Upper Bound
            if (alpha >= beta) return cachedEntry.score; // Pruning based on cached bounds
        }


        // --- Generate Moves ---
        // Mandatory jumps are handled by checking jumps first.
        // If isContinuation is true, it means the *previous* move was a jump, and we MUST check
        // for further jumps *from the piece that just moved*. This is handled implicitly by
        // the recursive call structure in searchMove. Here, we generate all moves for the *current* player.
        let possibleMoves = this.getAllPossibleMoves(board, color, true); // Jumps first
        let mustJump = possibleMoves.length > 0;

        if (!mustJump) {
             possibleMoves = this.getAllPossibleMoves(board, color, false); // Regular moves if no jumps
        }

        // If no moves possible for the current player, it's a loss for them
        if (possibleMoves.length === 0) {
             return isMaximizing ? (-10000 - depth) : (10000 + depth); // Loss for current player
        }

        // --- Move Ordering ---
        // Try using TT best move hint first if available
        let bestMoveFromTT = null;
        if (cachedEntry && cachedEntry.bestMoveHash) {
            // Note: We store the hash of the *resulting* board state after the move in TT.
            // To use this for ordering, we'd need to store the move itself or its hash.
            // Simpler: prioritize captures/promotions via sortMoves heuristic.
        }
        this.sortMoves(possibleMoves); // Order moves based on heuristic


        // --- Minimax Logic with PVS ---
        let bestScore = isMaximizing ? -Infinity : Infinity;
        let bestMoveHashForTT = null; // Hash of the board *after* the best move found here

        // Search first move with full window
        const firstMove = possibleMoves[0];
        let score = this.searchMove(board, firstMove, depth, alpha, beta, isMaximizing, color, false, currentHash); // isContinuation is false unless called from multi-jump logic
        if (this.timedOut) throw new Error("Time limit exceeded");

        if (isMaximizing) {
            if (score > bestScore) {
                bestScore = score;
                 // Need hash after move for TT: Re-simulate briefly or get from searchMove if returned
                 const tempBoard = this.copyBoard(board);
                 bestMoveHashForTT = this.simulateMove(tempBoard, firstMove, currentHash);
            }
            alpha = Math.max(alpha, bestScore);
        } else { // Minimizing
             if (score < bestScore) {
                 bestScore = score;
                 const tempBoard = this.copyBoard(board);
                 bestMoveHashForTT = this.simulateMove(tempBoard, firstMove, currentHash);
             }
            beta = Math.min(beta, bestScore);
        }
        if (alpha >= beta) { // Pruning after first move
            // Store TT entry before returning
            this.storeTranspositionEntry(currentHash, depth, bestScore, originalAlpha, originalBeta, bestMoveHashForTT);
            return bestScore;
        }


        // Search remaining moves with null window
        for (let i = 1; i < possibleMoves.length; i++) {
            const move = possibleMoves[i];
             // Check time limit *before* diving deep for each subsequent move
            if (this.timedOut || Date.now() - this.startTime > this.timeLimitMs) {
                 this.timedOut = true;
                 throw new Error("Time limit exceeded"); // Signal stop
            }

            let nullWindowScore;
            let currentMoveEndHash = null; // Store hash resulting from this move

             if (isMaximizing) {
                 nullWindowScore = this.searchMove(board, move, depth, alpha, alpha + 1, isMaximizing, color, false, currentHash);
                 if (this.timedOut) throw new Error("Time limit exceeded");
                 if (nullWindowScore > alpha && nullWindowScore < beta) { // Re-search needed
                    // console.log(`PVS re-search needed (max) depth ${depth}`);
                     score = this.searchMove(board, move, depth, alpha, beta, isMaximizing, color, false, currentHash);
                     if (this.timedOut) throw new Error("Time limit exceeded");
                 } else {
                     score = nullWindowScore;
                 }
             } else { // Minimizing
                 nullWindowScore = this.searchMove(board, move, depth, beta - 1, beta, isMaximizing, color, false, currentHash);
                 if (this.timedOut) throw new Error("Time limit exceeded");
                  if (nullWindowScore < beta && nullWindowScore > alpha) { // Re-search needed
                   // console.log(`PVS re-search needed (min) depth ${depth}`);
                     score = this.searchMove(board, move, depth, alpha, beta, isMaximizing, color, false, currentHash);
                     if (this.timedOut) throw new Error("Time limit exceeded");
                  } else {
                      score = nullWindowScore;
                  }
             }


            if (isMaximizing) {
                if (score > bestScore) {
                    bestScore = score;
                     const tempBoard = this.copyBoard(board); // Re-simulate to get hash if this is the new best
                     bestMoveHashForTT = this.simulateMove(tempBoard, move, currentHash);
                }
                alpha = Math.max(alpha, bestScore);
            } else { // Minimizing
                if (score < bestScore) {
                    bestScore = score;
                     const tempBoard = this.copyBoard(board);
                     bestMoveHashForTT = this.simulateMove(tempBoard, move, currentHash);
                }
                beta = Math.min(beta, bestScore);
            }

            // --- Alpha-Beta Pruning ---
            if (alpha >= beta) {
                 break; // Prune
            }
        }


        // --- Transposition Table Store ---
        this.storeTranspositionEntry(currentHash, depth, bestScore, originalAlpha, originalBeta, bestMoveHashForTT);

        return bestScore;
    }


     // Quiescence Search - Explores captures beyond the main search depth
     quiescenceSearch(board, alpha, beta, isMaximizing, color, currentHash, qDepth) {
        this.qNodesEvaluated++;

        // --- Time Limit Check (less frequent in qsearch) ---
        if (this.qNodesEvaluated % 500 === 0) { // Check less often
            if (this.timedOut || Date.now() - this.startTime > this.timeLimitMs) {
                this.timedOut = true;
                throw new Error("Time limit exceeded");
            }
        }

         // --- Transposition Table Lookup (Optional but can help) ---
         const cachedEntry = this.transpositionTable.get(currentHash);
         // Only use if exact match or helps prune immediately from stand-pat
         if (cachedEntry && cachedEntry.depth >= -qDepth) { // Use negative depth for q-search entries
             if (cachedEntry.type === 0) return cachedEntry.score;
             // Don't adjust alpha/beta yet, use cache score mainly if it causes immediate prune vs stand-pat
         }


        // Calculate "stand pat" score (value of not making a capture)
        // Evaluate from Yellow's perspective
        const standPatScore = this.evaluateBoard(board, 'yellow');

        // Basic pruning based on stand pat score
        if (isMaximizing) {
            alpha = Math.max(alpha, standPatScore);
        } else {
            beta = Math.min(beta, standPatScore);
        }
        if (alpha >= beta) {
            return standPatScore; // Prune based on stand-pat
        }

        // Limit quiescence depth
        if (qDepth >= this.MAX_QUIESCENCE_DEPTH) {
             return standPatScore;
        }

        // --- Generate ONLY Captures ---
        const captureMoves = this.getAllPossibleMoves(board, color, true); // jumpsOnly = true

        // If no captures, return the stand-pat score
        if (captureMoves.length === 0) {
            return standPatScore;
        }

        this.sortMoves(captureMoves); // Order captures (e.g., higher value captures first)


        // --- Explore Captures ---
        let bestScore = standPatScore; // Initialize with stand-pat

        for (const move of captureMoves) {
             const boardCopy = this.copyBoard(board);
             const pieceBeforeMove = board[move.fromY][move.fromX];
              if (!pieceBeforeMove) continue; // Safety

             const nextHash = this.simulateMove(boardCopy, move, currentHash);
             const nextColor = color === 'red' ? 'yellow' : 'red';

             let score;
             const pieceAfterMove = boardCopy[move.toY][move.toX];
             let furtherJumps = [];
             let promoted = false;

             if (pieceAfterMove && !pieceBeforeMove.isKing && this.rules.shouldPromote(pieceAfterMove.color, move.toY)) {
                 promoted = true;
             }
             if (move.isJump && !promoted && pieceAfterMove) {
                 furtherJumps = this.rules.findSingleJumps(boardCopy, [move.toX, move.toY], pieceAfterMove);
             }


             if (move.isJump && furtherJumps.length > 0 && !promoted) {
                 // Multi-jump continues: same player, same alpha/beta, increment qDepth
                 score = this.quiescenceSearch(boardCopy, alpha, beta, isMaximizing, color, nextHash, qDepth + 1);
             } else {
                 // Turn ends: switch player, swap alpha/beta (negamax style), increment qDepth
                 score = this.quiescenceSearch(boardCopy, alpha, beta, !isMaximizing, nextColor, nextHash, qDepth + 1);
             }
              if (this.timedOut) throw new Error("Time limit exceeded");


            if (isMaximizing) {
                bestScore = Math.max(bestScore, score);
                alpha = Math.max(alpha, bestScore);
            } else { // Minimizing
                bestScore = Math.min(bestScore, score);
                beta = Math.min(beta, bestScore);
            }

            // --- Alpha-Beta Pruning in Quiescence ---
            if (alpha >= beta) {
                 break; // Prune
            }
        }


         // --- Store Q-Search results in TT (optional, use negative depth) ---
         // Storing q-search results is less critical than main search, but can help
         // this.storeTranspositionEntry(currentHash, -qDepth, bestScore, originalAlpha, originalBeta, null); // No best move stored


        return bestScore;
    }


    // Store entry in Transposition Table
    storeTranspositionEntry(hash, depth, score, originalAlpha, originalBeta, bestMoveHash) {
         let cacheType;
         if (score <= originalAlpha) {
             cacheType = 2; // Upper Bound (failed low)
         } else if (score >= originalBeta) {
             cacheType = 1; // Lower Bound (failed high)
         } else {
             cacheType = 0; // Exact score
         }
         // Store entry, potentially overwriting older entries with less depth
         // Only overwrite if new entry has same or greater depth
         const existing = this.transpositionTable.get(hash);
         if (!existing || depth >= existing.depth) {
             this.transpositionTable.set(hash, { score: score, depth: depth, type: cacheType, bestMoveHash: bestMoveHash });
         }
    }


    // Get all possible moves (jumps MUST be prioritized) - Uses rules, unchanged functionally
    getAllPossibleMoves(board, color, jumpsOnly) {
        const allMoves = [];
        let hasJumps = false;

        // First pass: Find all jumps for *all* pieces of the given color
        for (let y = 0; y < 8; y++) {
            for (let x = 0; x < 8; x++) {
                const piece = board[y][x];
                if (piece && piece.color === color) {
                    const jumps = this.rules.getJumpMoves(board, [x, y], piece);
                     if (Array.isArray(jumps) && jumps.length > 0) {
                         hasJumps = true;
                         for (const jump of jumps) {
                             if (!Array.isArray(jump) || jump.length < 4) continue;
                             const move = { fromX: x, fromY: y, toX: jump[0], toY: jump[1], isJump: true, captureX: jump[2], captureY: jump[3], score: 0 };
                             move.score = this.scoreMoveHeuristic(board, move); // Score after creating
                             allMoves.push(move);
                         }
                     }
                }
            }
        }

        // If jumpsOnly is true or jumps were found, return only jumps
        if (jumpsOnly || hasJumps) {
            return allMoves.filter(m => m.isJump);
        }

        // Second pass: If no jumps found and jumpsOnly is false, find regular moves
         if (!hasJumps && !jumpsOnly) {
            for (let y = 0; y < 8; y++) {
                for (let x = 0; x < 8; x++) {
                    const piece = board[y][x];
                    if (piece && piece.color === color) {
                        const regularMovesRaw = this.rules.getRegularMoves(board, [x, y], piece);
                        if (Array.isArray(regularMovesRaw)) {
                             for (const moveRaw of regularMovesRaw) {
                                 if (!Array.isArray(moveRaw) || moveRaw.length !== 2) continue;
                                 const move = { fromX: x, fromY: y, toX: moveRaw[0], toY: moveRaw[1], isJump: false, score: 0 };
                                 move.score = this.scoreMoveHeuristic(board, move); // Score after creating
                                 allMoves.push(move);
                             }
                        }
                    }
                }
            }
        }
        return allMoves;
    }


    // Heuristic scoring for move ordering (MUCH SIMPLIFIED AND FASTER)
    // Avoids simulation, relies on current board state only.
    scoreMoveHeuristic(board, move) {
        let score = 0;
        const piece = board[move.fromY][move.fromX];
        if (!piece) return -Infinity; // Should not happen

        // 1. Jumps are best
        if (move.isJump) {
            score += 2000; // Increased jump priority
            // Add value of captured piece (if any)
            if (move.captureX !== undefined && this.isInBounds(move.captureX, move.captureY)) {
                const capturedPiece = board[move.captureY] ? board[move.captureY][move.captureX] : null;
                if (capturedPiece) {
                    score += capturedPiece.isKing ? this.pieceValues.king * 2 : this.pieceValues.regular * 1.5; // Better capture prioritization
                }
            }
             // Very simple check for potential multi-jump: if landing square is safe and allows further jumps
             // This is still slow. Omit for speed. The Quiescence search handles this better.
             /*
             const isLandingSafe = !this.isPieceVulnerable(board, move.toX, move.toY, piece.color); // Simplified check
             if (isLandingSafe) { score += 10; } // Small bonus for safe jump landing
             */

        }

        // 2. Promotion moves are good
        if (!piece.isKing && this.rules.shouldPromote(piece.color, move.toY)) {
            score += this.pieceValues.king * 1.5; // Higher promotion value
        }

        // 3. King moves towards center / avoid edges
         if (piece.isKing) {
             const centerDistBefore = Math.abs(move.fromX - 3.5) + Math.abs(move.fromY - 3.5);
             const centerDistAfter = Math.abs(move.toX - 3.5) + Math.abs(move.toY - 3.5);
             score += (centerDistBefore - centerDistAfter) * 2; // Bonus for moving towards center
             if (move.toX === 0 || move.toX === 7 || move.toY === 0 || move.toY === 7) score -= 10; // Edge penalty
         }

        // 4. Regular pieces advancing
         if (!piece.isKing && !move.isJump) { // Only for non-capture moves
             const forwardDir = piece.color === 'yellow' ? 1 : -1;
             if ((move.toY - move.fromY) * forwardDir > 0) {
                 score += 5; // Small bonus for moving forward
             }
             // Penalize moving backwards slightly? Maybe not needed.
         }

         // 5. Avoid moving non-jump moves into obvious danger (SIMPLE check)
         // This check is relatively expensive, use sparingly or rely on main search/eval
         /*
         if (!move.isJump) {
             // Quick check: Is the landing square immediately attackable by a regular piece?
             const opponentColor = piece.color === 'yellow' ? 'red' : 'yellow';
             const forwardDir = opponentColor === 'yellow' ? 1 : -1; // Attacker's forward
             const attackCheck = [
                 { dx: 1, dy: forwardDir }, { dx: -1, dy: forwardDir } // Squares opponent could attack *from*
             ];
             for (const ac of attackCheck) {
                 const attackerX = move.toX + ac.dx;
                 const attackerY = move.toY + ac.dy;
                 const squareBehindAttackerX = move.toX - ac.dx;
                 const squareBehindAttackerY = move.toY - ac.dy;

                 if (this.isInBounds(attackerX, attackerY)) {
                     const attackerPiece = board[attackerY]?.[attackerX];
                     if (attackerPiece && attackerPiece.color === opponentColor && !attackerPiece.isKing) {
                         // Check if square *behind* attacker (relative to target) is empty
                         if (this.isInBounds(squareBehindAttackerX, squareBehindAttackerY) && !board[squareBehindAttackerY]?.[squareBehindAttackerX]) {
                              score -= 150; // Moving into simple capture threat
                              break;
                         }
                     }
                 }
             }
             // Checking king threats here is too slow for heuristic.
         }
        */


        return score;
    }


    // Sort moves for alpha-beta: Uses pre-calculated heuristic score
    sortMoves(moves) {
        if (!Array.isArray(moves)) return;
        moves.sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity)); // Descending
    }

    // Simulate a move on the board AND update Zobrist hash incrementally
    // Returns the new Zobrist hash
    simulateMove(board, move, currentHash) {
        const { fromX, fromY, toX, toY, isJump } = move;
        if (!board || !board[fromY] || !board[fromY][fromX]) {
            console.warn("Simulate move: Invalid source or board", move);
            return currentHash; // Return unchanged hash on error
        }

        let hash = currentHash;
        const piece = board[fromY][fromX]; // Get piece *before* move
        const pieceIndex = this.getPieceZobristIndex(piece);
        const fromSqIndex = fromY * 8 + fromX;
        const toSqIndex = toY * 8 + toX;

        // 1. XOR out piece from original square
        hash ^= this.zobristTable[pieceIndex][fromSqIndex];

        // 2. Handle capture
        let capturedPiece = null;
        if (isJump) {
            const capX = move.captureX;
            const capY = move.captureY;
            if (capX !== undefined && this.isInBounds(capX, capY) && board[capY]?.[capX]) {
                capturedPiece = board[capY][capX];
                const capturedPieceIndex = this.getPieceZobristIndex(capturedPiece);
                const capturedSqIndex = capY * 8 + capX;
                 // XOR out captured piece
                hash ^= this.zobristTable[capturedPieceIndex][capturedSqIndex];
                board[capY][capX] = null; // Remove piece from board
            } else {
               // console.warn("Simulate move: Invalid capture coords or missing piece", move);
            }
        }

        // 3. Move piece on board
        board[toY][toX] = piece; // Move the reference
        board[fromY][fromX] = null;

        // 4. Handle Promotion (Check BEFORE placing piece in hash at new location)
        let pieceIndexAfterMove = pieceIndex;
        let promoted = false;
        if (!piece.isKing && this.rules.shouldPromote(piece.color, toY)) {
            piece.isKing = true; // Promote the piece object
            promoted = true;
            // Get the *new* index for the king
            pieceIndexAfterMove = this.getPieceZobristIndex(piece);
        }

        // 5. XOR in piece at destination square (using potentially updated index if promoted)
        hash ^= this.zobristTable[pieceIndexAfterMove][toSqIndex];

        // 6. XOR turn hash (since turn usually flips after a move sequence *ends*)
        // The minimax function handles passing the correct hash/turn status based on multi-jumps.
        // We *don't* flip the turn hash here, it's flipped when the player actually changes in minimax/searchMove.
        // Exception: If a multi-jump sequence *ends* here, the calling function should flip it.

        return hash;
    }


    // Evaluate the board state (always from Yellow AI perspective) - Minor optimizations
    evaluateBoard(board, aiColorPerspective = 'yellow') {
         // Cached values from previous eval? Difficult with captures/moves. Recalculate.
         let score = 0;
         const opponentColor = aiColorPerspective === 'yellow' ? 'red' : 'yellow';

         let aiMaterial = 0, oppMaterial = 0;
         let aiPosition = 0, oppPosition = 0;
         let aiKingMobility = 0, oppKingMobility = 0; // Based on available moves now
         let aiPromotionThreat = 0, oppPromotionThreat = 0; // Sum of distances
         let aiDefenseScore = 0, oppDefenseScore = 0; // Protected pieces count/value
         let aiAttackScore = 0, oppAttackScore = 0; // Jumps available now
         let aiBackRowPresence = 0, oppBackRowPresence = 0;
         let aiPieceCount = 0, oppPieceCount = 0;


         for (let y = 0; y < 8; y++) {
             for (let x = 0; x < 8; x++) {
                 const piece = board[y]?.[x];
                 if (!piece) continue;

                 const isAI = piece.color === aiColorPerspective;
                 const value = piece.isKing ? this.pieceValues.king : this.pieceValues.regular;
                 const centerWeight = (this.centerWeights[y]?.[x] ?? 0); // Use nullish coalescing

                 // --- Attributes Calculation (Simplified for speed) ---
                 const mobilityScore = piece.isKing ? Math.min(this.rules.getRegularMoves(board, [x, y], piece).length, 8) : 0; // Cap mobility calculation
                 const availableJumps = this.rules.findSingleJumps(board, [x,y], piece).length;
                 const isProtected = false; // Disabled for speed - too expensive to calculate frequently
                 const isVulnerable = false; // Disabled for speed - too expensive to calculate frequently

                 // --- Accumulate Scores ---
                 if (isAI) {
                     aiPieceCount++;
                     aiMaterial += value;
                     aiPosition += centerWeight * 5; // Simplified position bonus based on center control
                     if (piece.isKing) {
                         aiKingMobility += mobilityScore;
                         aiDefenseScore += 5; // King base defense value
                     } else {
                         const promotionRow = aiColorPerspective === 'yellow' ? 7 : 0;
                         const distToPromo = Math.abs(y - promotionRow);
                         aiPromotionThreat += (7 - distToPromo); // Closer is better
                         const backRow = aiColorPerspective === 'yellow' ? 0 : 7;
                         if (y === backRow) aiBackRowPresence += 1;
                     }
                     aiAttackScore += availableJumps * (piece.isKing ? 15 : 10); // Captures available
                     if (isProtected) aiDefenseScore += 3;
                     if (isVulnerable) aiDefenseScore -= value * 0.4; // Penalty if vulnerable

                 } else { // Opponent
                     oppPieceCount++;
                     oppMaterial += value;
                     oppPosition += centerWeight * 5;
                     if (piece.isKing) {
                         oppKingMobility += mobilityScore;
                         oppDefenseScore += 5;
                     } else {
                         const promotionRow = opponentColor === 'yellow' ? 7 : 0;
                         const distToPromo = Math.abs(y - promotionRow);
                         oppPromotionThreat += (7 - distToPromo);
                         const backRow = opponentColor === 'yellow' ? 0 : 7;
                         if (y === backRow) oppBackRowPresence += 1;
                     }
                     oppAttackScore += availableJumps * (piece.isKing ? 15 : 10);
                     if (isProtected) oppDefenseScore += 3;
                     if (isVulnerable) oppDefenseScore -= value * 0.4;
                 }
             }
         }

         // --- Combine weighted scores ---
         score += this.weights.material * (aiMaterial - oppMaterial);
         score += this.weights.position * (aiPosition - oppPosition);
         score += this.weights.kingMobility * (aiKingMobility - oppKingMobility);
         score += this.weights.promotionThreat * (aiPromotionThreat - oppPromotionThreat);
         score += this.weights.defense * (aiDefenseScore - oppDefenseScore);
         score += this.weights.attack * (aiAttackScore - oppAttackScore);
         score += this.weights.backRowDefense * (aiBackRowPresence - oppBackRowPresence);


         // --- Endgame Scaling ---
         const totalPieces = aiPieceCount + oppPieceCount;
         if (totalPieces <= 8 && aiPieceCount > 0 && oppPieceCount > 0) {
             const materialAdvantage = aiMaterial - oppMaterial;
             const endgameFactor = (1 + (10 - totalPieces) / 8); // Increases as pieces decrease
             score += this.weights.material * materialAdvantage * endgameFactor; // Amplify material difference

             // Encourage king activity for side with advantage
              if (materialAdvantage > this.pieceValues.regular / 2) {
                  score += aiKingMobility * endgameFactor * 0.5; // Bonus AI king mobility
                  score -= oppKingMobility * endgameFactor * 0.2; // Penalize opponent king mobility slightly less
              } else if (materialAdvantage < -this.pieceValues.regular / 2) {
                  score -= oppKingMobility * endgameFactor * 0.5; // Penalize Opponent king mobility
                  score += aiKingMobility * endgameFactor * 0.2; // Bonus AI king mobility slightly less
              }
         }
         // Add small random factor to break ties
         score += (Math.random() - 0.5) * 0.01;

         return Number.isFinite(score) ? score : 0; // Ensure finite number
     }


    // Helper: Check if a piece is protected (Slightly simplified check)
    isPieceProtected(board, x, y, color) {
        const directions = [[-1, -1], [1, -1], [-1, 1], [1, 1]]; // Check diagonals behind
        const backDir = color === 'yellow' ? -1 : 1; // Which 'y' direction is backwards

        for (const dir of directions) {
            const [dx, dy] = dir;
            // Only check directions pointing somewhat backwards relative to piece color
            if (dy !== backDir && dy !== 0) continue; // Skip forward diagonals for protection check

            const protectorX = x - dx;
            const protectorY = y - dy;
            if (this.isInBounds(protectorX, protectorY)) {
                 const protectorPiece = board[protectorY]?.[protectorX];
                 if (protectorPiece && protectorPiece.color === color) {
                     return true; // Found adjacent friendly protector behind
                 }
                 // King check (simplified: only check adjacent)
                 // Checking further back is expensive and less common protection
            }
        }
        return false;
    }

     // Helper: Check if a piece is vulnerable to immediate capture (Unchanged logic)
     isPieceVulnerable(board, x, y, pieceColor) {
         const opponentColor = pieceColor === 'yellow' ? 'red' : 'yellow';
         const checkDirections = [[-1, -1], [1, -1], [-1, 1], [1, 1]];

         for (const dir of checkDirections) {
              const [dx, dy] = dir;
              const attackerX = x - dx;
              const attackerY = y - dy;
              const landingX = x + dx;
              const landingY = y + dy;

              // Regular piece capture check
              if (this.isInBounds(attackerX, attackerY) && this.isInBounds(landingX, landingY)) {
                   const attackerPiece = board[attackerY]?.[attackerX];
                   const landingSquare = board[landingY]?.[landingX];
                   if (attackerPiece && attackerPiece.color === opponentColor && !landingSquare) {
                        // Check direction validity for non-king attacker (Russian: any piece captures any dir)
                        return true; // Vulnerable to simple jump
                   }
              }

              // King capture check (opponent king jumping over piece at x,y)
              // Check further back from attacker position for opponent king
              for (let dist = 2; dist < 8; dist++) {
                   const potentialKingX = x - dx * dist;
                   const potentialKingY = y - dy * dist;
                   if (!this.isInBounds(potentialKingX, potentialKingY)) break;

                   const intermediatePiece = board[potentialKingY]?.[potentialKingX];
                   if (intermediatePiece) {
                        if (intermediatePiece.color === opponentColor && intermediatePiece.isKing) {
                             let pathClear = true;
                             for (let i = 1; i < dist; i++) { // Check squares between king and victim (x,y)
                                 const checkX = potentialKingX + dx * i;
                                 const checkY = potentialKingY + dy * i;
                                 if (checkX === x && checkY === y) continue; // Don't check the victim square itself
                                 if (board[checkY]?.[checkX]) { pathClear = false; break; }
                             }
                             if (pathClear) { // Path to victim clear, check landing spot *behind* victim
                                  const kingLandingX = x + dx;
                                  const kingLandingY = y + dy;
                                  if (this.isInBounds(kingLandingX, kingLandingY) && !board[kingLandingY]?.[kingLandingX]) {
                                      return true; // Vulnerable to king capture
                                  }
                             }
                        }
                        break; // Path blocked, stop checking further in this direction
                   }
              }
         }
         return false;
     }


    // Create a deep copy of the board (Optimized slightly)
    copyBoard(board) {
        // Optimized board copying - avoid unnecessary operations
        const newBoard = Array(8);
        for (let y = 0; y < 8; y++) {
            const row = board[y];
            const newRow = Array(8);
            for (let x = 0; x < 8; x++) {
                const piece = row[x];
                newRow[x] = piece ? { color: piece.color, isKing: piece.isKing } : null;
            }
            newBoard[y] = newRow;
        }
        return newBoard;
    }

    // Check if position is within bounds
    isInBounds(x, y) {
        return x >= 0 && x < 8 && y >= 0 && y < 8; // Assume integers from context
    }
}

// Assume ChessRules class exists elsewhere and provides:
// new ChessRules()
// rules.getJumpMoves(board, [x,y], piece) -> returns [[toX, toY, capX, capY], ...]
// rules.getRegularMoves(board, [x,y], piece) -> returns [[toX, toY], ...]
// rules.findSingleJumps(board, [x,y], piece) -> returns [[toX, toY, capX, capY], ...] (similar to getJumpMoves)
// rules.shouldPromote(color, y) -> returns boolean
// rules.checkWinner(board) -> returns 'red', 'yellow', 'draw', or null