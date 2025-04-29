import React, { useState, useEffect, useCallback } from 'react';
import './App.css';

const GRID_SIZE = 4;
const DIRECTIONS = {
  UP: 'up',
  DOWN: 'down',
  LEFT: 'left',
  RIGHT: 'right'
};

// Heuristic weights (can be tuned for better performance)
const HEURISTIC_WEIGHTS = {
  emptyCells: 10,        // Favors boards with more empty spaces
  smoothness: 0.1,       // Prefers similar adjacent tiles
  monotonicity: 1.0,     // Prefers increasing/decreasing sequences
  maxValue: 1.0,         // Rewards having high-value tiles
  positionScore: 2.0,    // Favors high-value tiles in corners
  potentialMerges: 5.0,  // Rewards boards with merge opportunities
  cornerMax: 20.0,       // Bonus for max value in corner
  trappedPenalty: 10.0   // Penalty for trapped tiles
};


function App() {
  const [grid, setGrid] = useState(initializeGrid());
  const [score, setScore] = useState(0);
  const [bestScore, setBestScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [aiPlaying, setAiPlaying] = useState(false);
  const [aiSpeed, setAiSpeed] = useState(200);
  const [aiDepth, setAiDepth] = useState(3);
  const [aiThinking, setAIThinking] = useState(false);

  // Initialize the grid with two random tiles
  function initializeGrid() {
    const newGrid = Array(GRID_SIZE).fill().map(() => Array(GRID_SIZE).fill(0));
    addRandomTile(newGrid);
    addRandomTile(newGrid);
    return newGrid;
  }

  // Add a random tile (2 or 4) to an empty cell
  function addRandomTile(grid) {
    const emptyCells = [];
    for (let i = 0; i < GRID_SIZE; i++) {
      for (let j = 0; j < GRID_SIZE; j++) {
        if (grid[i][j] === 0) {
          emptyCells.push({ row: i, col: j });
        }
      }
    }
    
    if (emptyCells.length > 0) {
      const { row, col } = emptyCells[Math.floor(Math.random() * emptyCells.length)];
      grid[row][col] = Math.random() < 0.9 ? 2 : 4;
    }
  }

  // Reset the game
  const resetGame = useCallback(() => {
    setGrid(initializeGrid());
    setScore(0);
    setGameOver(false);
  }, []);

  // Check if the game is over (no moves left)
  function checkGameOver(grid) {
    // Check if there are empty cells
    for (let i = 0; i < GRID_SIZE; i++) {
      for (let j = 0; j < GRID_SIZE; j++) {
        if (grid[i][j] === 0) {
          return false;
        }
      }
    }
    
    // Check if there are possible merges
    for (let i = 0; i < GRID_SIZE; i++) {
      for (let j = 0; j < GRID_SIZE; j++) {
        if (j < GRID_SIZE - 1 && grid[i][j] === grid[i][j + 1]) {
          return false;
        }
        if (i < GRID_SIZE - 1 && grid[i][j] === grid[i + 1][j]) {
          return false;
        }
      }
    }
    
    return true;
  }

  // Move tiles in the specified direction
  const moveTiles = useCallback((direction) => {
    if (gameOver) return false;
    
    // Create a deep copy of the grid
    const newGrid = grid.map(row => [...row]);
    let moved = false;
    let scoreIncrease = 0;
  
    // Process movement based on direction
    switch (direction) {
      case DIRECTIONS.UP:
        for (let col = 0; col < GRID_SIZE; col++) {
          const column = [];
          // Extract column
          for (let row = 0; row < GRID_SIZE; row++) {
            column.push(newGrid[row][col]);
          }
          // Process column (move and merge)
          const { processed, changed, score } = processLine(column);
          if (changed) {
            // Update column in grid
            for (let row = 0; row < GRID_SIZE; row++) {
              newGrid[row][col] = processed[row];
            }
            moved = true;
            scoreIncrease += score;
          }
        }
        break;
  
      case DIRECTIONS.DOWN:
        for (let col = 0; col < GRID_SIZE; col++) {
          const column = [];
          // Extract column in reverse
          for (let row = GRID_SIZE - 1; row >= 0; row--) {
            column.push(newGrid[row][col]);
          }
          // Process column
          const { processed, changed, score } = processLine(column);
          if (changed) {
            // Update column in grid (reversed)
            for (let row = 0; row < GRID_SIZE; row++) {
              newGrid[GRID_SIZE - 1 - row][col] = processed[row];
            }
            moved = true;
            scoreIncrease += score;
          }
        }
        break;
  
      case DIRECTIONS.LEFT:
        for (let row = 0; row < GRID_SIZE; row++) {
          const { processed, changed, score } = processLine([...newGrid[row]]);
          if (changed) {
            newGrid[row] = processed;
            moved = true;
            scoreIncrease += score;
          }
        }
        break;
  
      case DIRECTIONS.RIGHT:
        for (let row = 0; row < GRID_SIZE; row++) {
          const reversedRow = [...newGrid[row]].reverse();
          const { processed, changed, score } = processLine(reversedRow);
          if (changed) {
            newGrid[row] = processed.reverse();
            moved = true;
            scoreIncrease += score;
          }
        }
        break;
  
      default:
        break;
    }
  
    if (moved) {
      addRandomTile(newGrid);
      const newScore = score + scoreIncrease;
      setScore(newScore);
      setBestScore(prev => Math.max(prev, newScore));
      setGrid(newGrid);
      
      if (checkGameOver(newGrid)) {
        setGameOver(true);
      }
    }
  
    return moved;
  }, [grid, score, gameOver]);

  // Process a single row/column (left movement logic)
  function processRow(row) {
    const newRow = row.filter(cell => cell !== 0);
    let score = 0;
    let changed = false;
  
    if (newRow.length !== row.filter(cell => cell !== 0).length) {
      changed = true;
    }
  
    for (let i = 0; i < newRow.length - 1; i++) {
      if (newRow[i] === newRow[i + 1]) {
        newRow[i] *= 2;
        newRow[i + 1] = 0;
        score += newRow[i];
        changed = true;
      }
    }
  
    const mergedRow = newRow.filter(cell => cell !== 0);
    while (mergedRow.length < GRID_SIZE) {
      mergedRow.push(0);
    }
  
    return { row: mergedRow, changed, score };
  }

  function processLine(line) {
    // Filter out zeros
    let filtered = line.filter(cell => cell !== 0);
    let score = 0;
    let changed = filtered.length !== line.length;
    const processed = [];
  
    // Merge adjacent equal values
    for (let i = 0; i < filtered.length; i++) {
      if (i < filtered.length - 1 && filtered[i] === filtered[i + 1]) {
        processed.push(filtered[i] * 2);
        score += filtered[i] * 2;
        i++; // Skip next element
        changed = true;
      } else {
        processed.push(filtered[i]);
      }
    }
  
    // Fill remaining spaces with zeros
    while (processed.length < GRID_SIZE) {
      processed.push(0);
    }
  
    return { processed, changed, score };
  }
  // ================== Expectimax AI Implementation ==================

  // Evaluate the grid state using multiple heuristics
  // Enhanced heuristic evaluation function
// Memoization cache for grid evaluations
const evaluationCache = new Map();

function evaluateGrid(grid) {
  const gridKey = JSON.stringify(grid);
  
  // Return cached evaluation if available
  if (evaluationCache.has(gridKey)) {
    return evaluationCache.get(gridKey);
  }
  
  // Calculate evaluation (using the heuristic functions above)
  const evaluation = (
    HEURISTIC_WEIGHTS.emptyCells * countEmptyCells(grid) +
    HEURISTIC_WEIGHTS.smoothness * calculateSmoothness(grid) +
    HEURISTIC_WEIGHTS.monotonicity * calculateMonotonicity(grid) +
    HEURISTIC_WEIGHTS.maxValue * getMaxValue(grid) +
    HEURISTIC_WEIGHTS.positionScore * calculatePositionScore(grid) +
    HEURISTIC_WEIGHTS.potentialMerges * countPotentialMerges(grid) +
    HEURISTIC_WEIGHTS.cornerMax * (isMaxValueInCorner(grid, getMaxValue(grid)) ? 1 : 0) -
    HEURISTIC_WEIGHTS.trappedPenalty * calculateTrappedPenalty(grid)
  );
  
  // Cache the evaluation
  evaluationCache.set(gridKey, evaluation);
  
  return evaluation;
}
// Count empty cells (more is better)
function countEmptyCells(grid) {
  let count = 0;
  for (let i = 0; i < GRID_SIZE; i++) {
    for (let j = 0; j < GRID_SIZE; j++) {
      if (grid[i][j] === 0) count++;
    }
  }
  return count;
}

// Calculate smoothness (lower differences between adjacent tiles is better)
function calculateSmoothness(grid) {
  let smoothness = 0;
  for (let i = 0; i < GRID_SIZE; i++) {
    for (let j = 0; j < GRID_SIZE; j++) {
      if (grid[i][j] !== 0) {
        const value = Math.log2(grid[i][j]);
        
        // Check right neighbor
        for (let k = j + 1; k < GRID_SIZE; k++) {
          if (grid[i][k] !== 0) {
            smoothness -= Math.abs(value - Math.log2(grid[i][k]));
            break;
          }
        }
        
        // Check bottom neighbor
        for (let k = i + 1; k < GRID_SIZE; k++) {
          if (grid[k][j] !== 0) {
            smoothness -= Math.abs(value - Math.log2(grid[k][j]));
            break;
          }
        }
      }
    }
  }
  return smoothness;
}

// Calculate monotonicity (prefer increasing/decreasing sequences)
function calculateMonotonicity(grid) {
  let monotonicity = 0;
  
  // Check rows for monotonicity
  for (let i = 0; i < GRID_SIZE; i++) {
    let increasing = 0;
    let decreasing = 0;
    
    for (let j = 1; j < GRID_SIZE; j++) {
      const current = grid[i][j] !== 0 ? Math.log2(grid[i][j]) : 0;
      const previous = grid[i][j - 1] !== 0 ? Math.log2(grid[i][j - 1]) : 0;
      
      if (current > previous) {
        increasing += current - previous;
      } else if (previous > current) {
        decreasing += previous - current;
      }
    }
    
    monotonicity += Math.max(increasing, decreasing);
  }
  
  // Check columns for monotonicity
  for (let j = 0; j < GRID_SIZE; j++) {
    let increasing = 0;
    let decreasing = 0;
    
    for (let i = 1; i < GRID_SIZE; i++) {
      const current = grid[i][j] !== 0 ? Math.log2(grid[i][j]) : 0;
      const previous = grid[i - 1][j] !== 0 ? Math.log2(grid[i - 1][j]) : 0;
      
      if (current > previous) {
        increasing += current - previous;
      } else if (previous > current) {
        decreasing += previous - current;
      }
    }
    
    monotonicity += Math.max(increasing, decreasing);
  }
  
  return monotonicity;
}

// Get maximum tile value on the board
function getMaxValue(grid) {
  let max = 0;
  for (let i = 0; i < GRID_SIZE; i++) {
    for (let j = 0; j < GRID_SIZE; j++) {
      max = Math.max(max, grid[i][j]);
    }
  }
  return max;
}

// Score based on tile positions (higher values in corners are better)
function calculatePositionScore(grid) {
  const positionWeights = [
    [15, 14, 13, 12],
    [8, 9, 10, 11],
    [7, 6, 5, 4],
    [0, 1, 2, 3]
  ];
  
  let score = 0;
  for (let i = 0; i < GRID_SIZE; i++) {
    for (let j = 0; j < GRID_SIZE; j++) {
      if (grid[i][j] !== 0) {
        score += positionWeights[i][j] * Math.log2(grid[i][j]);
      }
    }
  }
  return score;
}

// Count potential merges (adjacent tiles with same value)
function countPotentialMerges(grid) {
  let merges = 0;
  
  // Check horizontal merges
  for (let i = 0; i < GRID_SIZE; i++) {
    for (let j = 0; j < GRID_SIZE - 1; j++) {
      if (grid[i][j] !== 0 && grid[i][j] === grid[i][j + 1]) {
        merges++;
      }
    }
  }
  
  // Check vertical merges
  for (let j = 0; j < GRID_SIZE; j++) {
    for (let i = 0; i < GRID_SIZE - 1; i++) {
      if (grid[i][j] !== 0 && grid[i][j] === grid[i + 1][j]) {
        merges++;
      }
    }
  }
  
  return merges;
}

// Check if max value is in a corner (preferred)
function isMaxValueInCorner(grid, maxValue) {
  return (
    grid[0][0] === maxValue ||
    grid[0][GRID_SIZE - 1] === maxValue ||
    grid[GRID_SIZE - 1][0] === maxValue ||
    grid[GRID_SIZE - 1][GRID_SIZE - 1] === maxValue
  );
}

// Penalize boards where high-value tiles are trapped
function calculateTrappedPenalty(grid) {
  let penalty = 0;
  const directions = [
    [-1, 0], [1, 0], [0, -1], [0, 1]
  ];
  
  for (let i = 0; i < GRID_SIZE; i++) {
    for (let j = 0; j < GRID_SIZE; j++) {
      if (grid[i][j] !== 0) {
        let isTrapped = true;
        const value = grid[i][j];
        
        for (const [di, dj] of directions) {
          const ni = i + di;
          const nj = j + dj;
          
          if (ni >= 0 && ni < GRID_SIZE && nj >= 0 && nj < GRID_SIZE) {
            if (grid[ni][nj] === 0 || grid[ni][nj] === value) {
              isTrapped = false;
              break;
            }
          }
        }
        
        if (isTrapped) {
          penalty += Math.log2(value);
        }
      }
    }
  }
  
  return penalty;
}

  // Expectimax algorithm implementation
  function expectimax(grid, depth, isPlayerMove) {
    if (depth === 0 || checkGameOver(grid)) {
      return { score: evaluateGrid(grid) };
    }

    if (isPlayerMove) {
      let bestScore = -Infinity;
      let bestMove = null;

      // Try all possible moves
      for (const direction of Object.values(DIRECTIONS)) {
        const newGrid = JSON.parse(JSON.stringify(grid));
        const moved = simulateMove(newGrid, direction);
        
        if (moved) {
          const result = expectimax(newGrid, depth - 1, false);
          if (result.score > bestScore) {
            bestScore = result.score;
            bestMove = direction;
          }
        }
      }

      return { score: bestScore, move: bestMove };
    } else {
      // Chance node (random tile placement)
      let totalScore = 0;
      let possibleSpawns = 0;
      const emptyCells = [];

      // Find all empty cells
      for (let i = 0; i < GRID_SIZE; i++) {
        for (let j = 0; j < GRID_SIZE; j++) {
          if (grid[i][j] === 0) {
            emptyCells.push({ i, j });
          }
        }
      }

      // Calculate expected value for all possible random placements
      for (const cell of emptyCells) {
        // Try placing a 2 (90% chance)
        const gridWith2 = JSON.parse(JSON.stringify(grid));
        gridWith2[cell.i][cell.j] = 2;
        const result2 = expectimax(gridWith2, depth - 1, true);
        totalScore += 0.9 * result2.score;

        // Try placing a 4 (10% chance)
        const gridWith4 = JSON.parse(JSON.stringify(grid));
        gridWith4[cell.i][cell.j] = 4;
        const result4 = expectimax(gridWith4, depth - 1, true);
        totalScore += 0.1 * result4.score;

        possibleSpawns++;
      }

      const expectedScore = possibleSpawns > 0 ? totalScore / emptyCells.length : 0;
      return { score: expectedScore };
    }
  }

  // Simulate a move without modifying the actual grid
  function simulateMove(grid, direction) {
    let moved = false;
    let scoreIncrease = 0;

    switch (direction) {
      case DIRECTIONS.LEFT:
        for (let i = 0; i < GRID_SIZE; i++) {
          const { row, changed, score } = processRow(grid[i]);
          grid[i] = row;
          moved = moved || changed;
          scoreIncrease += score;
        }
        break;
      case DIRECTIONS.RIGHT:
        for (let i = 0; i < GRID_SIZE; i++) {
          const reversedRow = [...grid[i]].reverse();
          const { row, changed, score } = processRow(reversedRow);
          grid[i] = row.reverse();
          moved = moved || changed;
          scoreIncrease += score;
        }
        break;
      case DIRECTIONS.UP:
        for (let j = 0; j < GRID_SIZE; j++) {
          const column = [];
          for (let i = 0; i < GRID_SIZE; i++) {
            column.push(grid[i][j]);
          }
          const { row: processedColumn, changed, score } = processRow(column);
          if (changed) {
            for (let i = 0; i < GRID_SIZE; i++) {
              grid[i][j] = processedColumn[i];
            }
            moved = true;
            scoreIncrease += score;
          }
        }
        break;
      case DIRECTIONS.DOWN:
        for (let j = 0; j < GRID_SIZE; j++) {
          const column = [];
          for (let i = 0; i < GRID_SIZE; i++) {
            column.push(grid[i][j]);
          }
          const reversedColumn = [...column].reverse();
          const { row: processedColumn, changed, score } = processRow(reversedColumn);
          if (changed) {
            const updatedColumn = processedColumn.reverse();
            for (let i = 0; i < GRID_SIZE; i++) {
              grid[i][j] = updatedColumn[i];
            }
            moved = true;
            scoreIncrease += score;
          }
        }
        break;
      default:
        break;
    }

    return moved;
  }

  // Get the best move using Expectimax
  function getBestMove() {
    const result = expectimax(grid, aiDepth, true);
    return result.move;
  }

  // Handle keyboard events
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Only handle arrow keys
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        return;
      }
      
      // Prevent default behavior (page scrolling)
      e.preventDefault();
      
      if (aiPlaying || gameOver) return;
      
      // Process the key press
      switch (e.key) {
        case 'ArrowUp':
          console.log('Up arrow pressed');
          moveTiles(DIRECTIONS.UP);
          break;
        case 'ArrowDown':
          console.log('Down arrow pressed');
          moveTiles(DIRECTIONS.DOWN);
          break;
        case 'ArrowLeft':
          console.log('Left arrow pressed');
          moveTiles(DIRECTIONS.LEFT);
          break;
        case 'ArrowRight':
          console.log('Right arrow pressed');
          moveTiles(DIRECTIONS.RIGHT);
          break;
        default:
          break;
      }
    };
  
    // Add event listener
    window.addEventListener('keydown', handleKeyDown);
    
    // Cleanup
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [moveTiles, aiPlaying, gameOver]); // Include all dependencies


  // AI move logic
  useEffect(() => {
    if (!aiPlaying || gameOver) return;
    setAIThinking(true);
    const makeAiMove = async () => {
      
      try {
        // Get the best move using Expectimax algorithm
       // const bestMove = getBestMove();
       const bestMove = calculateBestMove(grid);
        
        if (bestMove) {
          // Execute the move
          const moved = moveTiles(bestMove);
          
          if (!moved) {
            console.warn("AI attempted invalid move:", bestMove);
            tryAlternativeMoves();
          }
        } else {
          console.warn("AI couldn't determine a valid move");
          tryAlternativeMoves();
        }
        setTimeout(() => {
            setAIThinking(false);
        }, 100);
      } catch (error) {
        console.error("AI decision error:", error);
        setAiPlaying(false); // Stop AI on error
      }
    };
  
    const timer = setTimeout(makeAiMove, aiSpeed);
    return () => clearTimeout(timer);
  }, [aiPlaying, aiThinking, gameOver, moveTiles, aiSpeed, grid, aiDepth]);

  function calculateBestMove(currentGrid) {
    // Try all possible directions with scoring
    const directions = [
      { direction: DIRECTIONS.UP, score: evaluateMove(currentGrid, DIRECTIONS.UP) },
      { direction: DIRECTIONS.RIGHT, score: evaluateMove(currentGrid, DIRECTIONS.RIGHT) },
      { direction: DIRECTIONS.DOWN, score: evaluateMove(currentGrid, DIRECTIONS.DOWN) },
      { direction: DIRECTIONS.LEFT, score: evaluateMove(currentGrid, DIRECTIONS.LEFT) }
    ];
  
    // Sort by score (highest first)
    directions.sort((a, b) => b.score - a.score);
  
    // Return the best valid move
    for (const move of directions) {
      if (isMoveValid(currentGrid, move.direction)) {
        return move.direction;
      }
    }
    
    return null; // No valid moves
  }

  function tryAlternativeMoves() {
    try {
      // Try all possible moves in random order as last resort
      const directions = shuffleArray([
        DIRECTIONS.UP,
        DIRECTIONS.RIGHT,
        DIRECTIONS.DOWN,
        DIRECTIONS.LEFT
      ]);
      
      for (const direction of directions) {
        const testGrid = JSON.parse(JSON.stringify(grid));
        if (simulateMove(testGrid, direction)) {
          console.log(`Emergency fallback to ${direction}`);
          moveTiles(direction);
          return true;
        }
      }
      
      // If we get here, game is really over
      console.log("No possible moves detected");
      setGameOver(true);
      return false;
      
    } catch (error) {
      console.error("Error in tryAlternativeMoves:", error);
      setAiPlaying(false); // Stop AI on error
      return false;
    }
  }
  
  // Helper to shuffle array
  function shuffleArray(array) {
    const newArray = [...array];
    for (let i = newArray.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
    }
    return newArray;
  }

  function getBestMove() {
    // Simple fallback if Expectimax fails
    const directions = [
      DIRECTIONS.UP,
      DIRECTIONS.RIGHT,
      DIRECTIONS.DOWN,
      DIRECTIONS.LEFT
    ];
    
    // First try Expectimax
    try {
      const expectimaxResult = expectimax(grid, aiDepth, true);
      if (expectimaxResult.move) {
        return expectimaxResult.move;
      }
    } catch (e) {
      console.warn("Expectimax failed, using fallback:", e);
    }
    
    // Fallback: Try directions until a valid move is found
    for (const direction of directions) {
      const testGrid = JSON.parse(JSON.stringify(grid));
      if (simulateMove(testGrid, direction)) {
        return direction;
      }
    }
    
    return null; // No valid moves found
  }

  

    function evaluateMove(grid, direction) {
      const testGrid = JSON.parse(JSON.stringify(grid));
      let score = 0;
      
      // Simulate the move
      switch (direction) {
          case DIRECTIONS.UP:
              for (let col = 0; col < GRID_SIZE; col++) {
                  const column = testGrid.map(row => row[col]);
                  const result = processLine(column);
                  score += result.score;
                  // Update the test grid
                  for (let row = 0; row < GRID_SIZE; row++) {
                      testGrid[row][col] = column[row];
                  }
              }
              break;
              
          case DIRECTIONS.RIGHT:
              for (let row = 0; row < GRID_SIZE; row++) {
                  const line = [...testGrid[row]].reverse(); // Process right to left
                  const result = processLine(line);
                  score += result.score;
                  testGrid[row] = line.reverse(); // Restore original order
              }
              break;
              
          case DIRECTIONS.DOWN:
              for (let col = 0; col < GRID_SIZE; col++) {
                  const column = [];
                  for (let row = GRID_SIZE - 1; row >= 0; row--) {
                      column.push(testGrid[row][col]);
                  }
                  const result = processLine(column);
                  score += result.score;
                  // Update the test grid
                  for (let row = 0; row < GRID_SIZE; row++) {
                      testGrid[GRID_SIZE - 1 - row][col] = column[row];
                  }
              }
              break;
              
          case DIRECTIONS.LEFT:
              for (let row = 0; row < GRID_SIZE; row++) {
                  const line = [...testGrid[row]]; // Process left to right
                  const result = processLine(line);
                  score += result.score;
                  testGrid[row] = line;
              }
              break;
      }
      
      // Add additional heuristic scoring
      score += countEmptyCells(testGrid) * 10;
      score += getMaxValue(testGrid) * 2;
      score += isMaxValueInCorner(testGrid) * 0.1;
      score += calculateMonotonicity(testGrid) * 1.5;
      
      return score;
  }

  function validateGrid(grid) {
    if (!grid || !Array.isArray(grid) || grid.length !== GRID_SIZE) {
      return false;
    }
    return grid.every(row => 
      Array.isArray(row) && 
      row.length === GRID_SIZE &&
      row.every(cell => typeof cell === 'number')
    );
  }

  function safeReverse(array) {
    if (!Array.isArray(array)) {
      console.warn("Attempted to reverse non-array:", array);
      return [];
    }
    return [...array].reverse(); // Return new array
  }

  function safeGridAccess(grid, row, col) {
    // Handle edge cases safely
    if (!grid || !Array.isArray(grid)) return 0;
    if (row < 0 || row >= GRID_SIZE || col < 0 || col >= GRID_SIZE) return 0;
    if (!Array.isArray(grid[row])) return 0;
    
    return grid[row][col] ?? 0;
  }
  
  function isMoveValid(grid, direction) {
    const testGrid = JSON.parse(JSON.stringify(grid));
    return simulateMove(testGrid, direction);
  } 

     function simulateMove(grid, direction) {
      let moved = false;
      
      switch (direction) {
        case DIRECTIONS.UP:
          for (let col = 0; col < GRID_SIZE; col++) {
            const column = [];
            for (let row = 0; row < GRID_SIZE; row++) {
              column.push(grid[row][col]);
            }
            const { changed } = processLine(column);
            if (changed) moved = true;
          }
          break;
          
        case DIRECTIONS.RIGHT:
          for (let row = 0; row < GRID_SIZE; row++) {
            const line = [...grid[row]].reverse(); // Process right to left
            const { changed } = processLine(line);
            if (changed) moved = true;
            grid[row] = line.reverse(); // Restore original order
          }
          break;
          
        case DIRECTIONS.DOWN:
          for (let col = 0; col < GRID_SIZE; col++) {
            const column = [];
            for (let row = GRID_SIZE - 1; row >= 0; row--) {
              column.push(grid[row][col]);
            }
            const { changed } = processLine(column);
            if (changed) moved = true;
          }
          break;
          
        case DIRECTIONS.LEFT:
          for (let row = 0; row < GRID_SIZE; row++) {
            const line = [...grid[row]]; // Process left to right
            const { changed } = processLine(line);
            if (changed) moved = true;
            grid[row] = line;
          }
          break;
      }
      
      return moved;
  } 

  // Toggle AI play
  const toggleAi = useCallback(() => {
    if (gameOver) {
      // Don't allow AI to start if game is over
      resetGame()
      return;
    }
    
    setAiPlaying(prev => {
      const newState = !prev;
      console.log(`AI ${newState ? 'started' : 'stopped'}`);
      return newState;
    });
  }, [gameOver, resetGame]);

  

  // Change AI speed
  const changeAiSpeed = (e) => {
    setAiSpeed(parseInt(e.target.value));
  };

  // Change AI depth
  const changeAiDepth = (e) => {
    setAiDepth(parseInt(e.target.value));
  };

  // Get tile color based on value
  const getTileColor = (value) => {
    const colors = {
      0: '#cdc1b4',
      2: '#eee4da',
      4: '#ede0c8',
      8: '#f2b179',
      16: '#f59563',
      32: '#f67c5f',
      64: '#f65e3b',
      128: '#edcf72',
      256: '#edcc61',
      512: '#edc850',
      1024: '#edc53f',
      2048: '#edc22e',
      4096: '#3c3a32',
      8192: '#3c3a32'
    };
    return colors[value] || '#3c3a32';
  };

  return (
    <div className="app">
      <div className="header">
        <h1>2048</h1>
        <div className="scores">
          <div className="score-box">
            <div className="score-label">SCORE</div>
            <div className="score-value">{score}</div>
          </div>
          <div className="score-box">
            <div className="score-label">BEST</div>
            <div className="score-value">{bestScore}</div>
          </div>
        </div>
      </div>
      
      <div className="controls">
        <button onClick={resetGame}>New Game</button>
        <div className="ai-control-panel">
  <button 
    onClick={toggleAi}
    disabled={gameOver}
    className={`ai-button ${aiPlaying ? 'active' : ''}`}
  >
    {aiPlaying ? (
      <>
        <span className="ai-indicator"></span>
        Stop AI
      </>
    ) : 'Start AI'}
  </button>
  
  {aiPlaying && (
    <div className="ai-settings">
      <div className="ai-setting">
        <label>Speed:</label>
        <input
          type="range"
          min="50"
          max="500"
          value={aiSpeed}
          onChange={(e) => setAiSpeed(parseInt(e.target.value))}
        />
        <span>{aiSpeed}ms</span>
      </div>
      <div className="ai-setting">
        <label>Depth:</label>
        <input
          type="range"
          min="1"
          max="5"
          value={aiDepth}
          onChange={(e) => setAiDepth(parseInt(e.target.value))}
        />
        <span>{aiDepth}</span>
      </div>
    </div>
  )}
</div>
{aiThinking && <div className="ai-thinking">AI is thinking...</div>}
      </div>
      
      <div className="game-container"
       tabIndex={0} // Make the div focusable
       onKeyDown={(e) => e.preventDefault()}  // For debugging
        >
        <div className="grid">
          {grid.map((row, rowIndex) => (
            <div key={rowIndex} className="grid-row">
              {row.map((cell, colIndex) => (
                <div 
                  key={colIndex} 
                  className="grid-cell"
                  style={{ 
                    backgroundColor: getTileColor(cell),
                    color: cell > 4 ? '#f9f6f2' : '#776e65',
                    fontSize: cell < 100 ? '55px' : cell < 1000 ? '45px' : '35px'
                  }}
                >
                  {cell !== 0 ? cell : ''}
                </div>
              ))}
            </div>
          ))}
        </div>
        
        {gameOver && (
          <div className="game-over">
            <div>Game Over!</div>
            <button onClick={resetGame}>Try Again</button>
          </div>
        )}
      </div>
      
      <div className="instructions">
        <p>Use arrow keys to move tiles. Join the numbers to get to 2048!</p>
        {aiPlaying && <p>AI is playing with Expectimax algorithm (depth: {aiDepth})</p>}
      </div>
    </div>
  );
}

export default App;