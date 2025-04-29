import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import './App.css';

const GRID_SIZE = 4;
const TARGET_VALUE = 2048;
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

const difficultySettings = {
  easy: { depth: 2, speed: 300, delay: 1500  },
  medium: { depth: 3, speed: 200 , delay: 1000},
  hard: { depth: 4, speed: 150, delay: 800 },
  expert: { depth: 5, speed: 100, delay: 500 }
};

function App() {
  const [grid, setGrid] = useState(initializeGrid());
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [aiPlaying, setAiPlaying] = useState(false);
  const [aiSpeed, setAiSpeed] = useState(200);
  const [aiDepth, setAiDepth] = useState(3);
  const [aiThinking, setAIThinking] = useState(false);
  const [hintDirection, setHintDirection] = useState(null);
  const [showHints, setShowHints] = useState(false);
  const [aiDifficulty, setAiDifficulty] = useState('medium'); // 'easy', 'medium', 'hard', 'expert'
  const [adaptiveDifficulty, setAdaptiveDifficulty] = useState({
    baseLevel: 'medium', // Starting difficulty
    currentLevel: 'medium',
    performanceHistory: [], // Tracks player performance
    lastAdjustment: 0, // Last time difficulty was changed
  });
  const [predictiveMoves, setPredictiveMoves] = useState([]);
  const [showPredictions, setShowPredictions] = useState(false);
  const [predictionAccuracy, setPredictionAccuracy] = useState('medium'); // 'low', 'medium', 'high'
  const [scoreUpdated, setScoreUpdated] = useState(false);
  const [newBest, setNewBest] = useState(false); 
  const [keepPlaying, setKeepPlaying] = useState(false); // Allow continuing after win
  const [gameWon, setGameWon] = useState(false);
  const [lastDirection, setLastDirection] = useState(null);
  const [directionHighlight, setDirectionHighlight] = useState(false);
  const [scoreHistory, setScoreHistory] = useState([]);
  const [bestScore, setBestScore] = useState(() => {
  // Initialize from localStorage if available
  return parseInt(localStorage.getItem('bestScore')) || 0;
});
  const [tileAnimations, setTileAnimations] = useState({});
  const [showHistory, setShowHistory] = useState(false);

  const moveCountRef = useRef(0);
  const moveSound = useRef(null);
  const mergeSound = useRef(null);
  const appearSound = useRef(null);
  const winSound = useRef(null);
  const loseSound = useRef(null);
  const bestScoreSound = useRef(null);

  // Initialize sounds
  useEffect(() => {
    moveSound.current = new Audio('/sounds/move.mp3');
    mergeSound.current = new Audio('/sounds/merge.mp3');
    appearSound.current = new Audio('/sounds/appear.mp3');
    winSound.current = new Audio('/sounds/win.mp3');
    loseSound.current = new Audio('/sounds/lose.mp3');
    bestScoreSound.current = new Audio('/sounds/best.mp3');
    
    // Preload sounds
    [moveSound, mergeSound, appearSound, winSound, loseSound, bestScoreSound].forEach(sound => {
      sound.current.load();
      sound.current.volume = 0.3; // Set appropriate volume
    });
  }, []);

  const playSound = (soundRef) => {
    if (soundRef.current) {
      soundRef.current.currentTime = 0; // Rewind if already playing
      soundRef.current.play().catch(e => console.log("Audio play failed:", e));
    }
  };
  
  useEffect(() => {
    // Load best score
    const savedBest = localStorage.getItem('bestScore');
    if (savedBest) {
      setBestScore(parseInt(savedBest));
    }
  
    // Load score history
    const savedHistory = localStorage.getItem('scoreHistory');
    if (savedHistory) {
      setScoreHistory(JSON.parse(savedHistory));
    }
  }, []);

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
    setGameWon(false);
    setGameOver(false);
    setKeepPlaying(false);
    setLastDirection(null);
    setScoreHistory(prev => [...prev, {
      score: 0,
      date: new Date().toISOString(),
      status: 'started'
    }]);
    setTileAnimations({});
  }, []);

  function checkWinCondition(grid) {
    // Check if any tile has reached 2048
    for (let i = 0; i < GRID_SIZE; i++) {
      for (let j = 0; j < GRID_SIZE; j++) {
        if (grid[i][j] === TARGET_VALUE) {
          return true;
        }
      }
    }
    return false;
  }

  // Check if the game is over (no moves left)
  function checkGameOver(grid) {
    const hasEmptyCell = grid.some(row => row.some(cell => cell === 0));
  if (hasEmptyCell) {
    return false; // Game can continue
  }

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

    for (let i = 0; i < GRID_SIZE; i++) {
      for (let j = 0; j < GRID_SIZE; j++) {
        const current = grid[i][j];
        
        // Check right neighbor
        if (j < 3 && grid[i][j + 1] === current) {
          return false;
        }
        
        // Check bottom neighbor
        if (i < 3 && grid[i + 1][j] === current) {
          return false;
        }
      }
    }

    setGameOver(true);
    addToScoreHistory(score);
    playSound(loseSound);
    return true;
  }

  // Move tiles in the specified direction
  const moveTiles = useCallback((direction) => {
    if (gameOver && !keepPlaying) return false;

    setLastDirection(direction);
    setDirectionHighlight(true);
    
    // Remove highlight after animation completes
    setTimeout(() => setDirectionHighlight(false), 200);
    
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
      playSound(moveSound);
      setTimeout(() => {
        addRandomTile(newGrid);
      const newScore = score + scoreIncrease;
      setScore(newScore); 
      setScoreUpdated(true);
      setGrid(newGrid);
      checkGameOver(newGrid)
      if (newScore > bestScore) {
        setBestScore(newScore);
        addToScoreHistory(newScore);
      }
      const isNewBest = updateBestScore(newScore);
      if (isNewBest) {
        playSound(bestScoreSound);      
      } 
      if (!gameWon && checkWinCondition(newGrid)) {
        setGameWon(true);
        playSound(winSound);
      }
    }, 100);
      

      setTimeout(() => setScoreUpdated(false), 300);
      
    }
  
    return moved;
  }, [grid, score, gameOver, keepPlaying, gameWon]);

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
    if (!aiPlaying || gameOver || (gameWon && !keepPlaying)) return;
    

    const { depth, delay, speed } = difficultySettings[adaptiveDifficulty.currentLevel];
    
    const makeAiMove = async () => {
      setAIThinking(true);
      try {
        // Get the best move using Expectimax algorithm
       // const bestMove = getBestMove();
      // const bestMove = calculateBestMove(grid, depth);
     // const bestMove = calculateBestMove(grid);

     const bestMove = calculateBestMove(grid, depth);

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
        }, delay);
      } catch (error) {
        console.error("AI decision error:", error);
        setAiPlaying(false); // Stop AI on error
      }
    };
  
    const timer = setTimeout(makeAiMove, speed === aiSpeed ? aiSpeed : speed);
    return () => clearTimeout(timer);
  }, [aiPlaying, aiThinking, gameOver, gameWon, keepPlaying, moveTiles, grid, adaptiveDifficulty, aiDepth]);

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

   
  function evaluateMove(grid, direction, difficulty) {
    const baseScore = evaluateBaseMove(grid, direction);
    
    // Apply difficulty modifiers
    switch (difficulty) {
      case 'easy':
        return baseScore * 0.8; // Less optimal choices
      case 'medium':
        return baseScore;
      case 'hard':
        return baseScore * 1.2; // More optimal choices
      case 'expert':
        return baseScore * 1.5 + evaluateStrategicPosition(grid, direction);
      default:
        return baseScore;
    }
  }      
    

    function evaluateBaseMove(grid, direction) {
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
      score += isMaxValueInCorner(testGrid) * 50; // Higher weight for corner strategy
    score += calculateMonotonicity(testGrid) * 1.5;
    score += calculateSmoothness(testGrid) * 0.5;
      
      return score;
  }

  function evaluateStrategicPosition(grid, direction) {
    // Expert-level strategic evaluation
    let score = 0;
    
    // Prefer keeping high values in corners
    const maxValue = Math.max(...grid.flat());
    if ((direction === DIRECTIONS.LEFT && grid[0][0] === maxValue) ||
        (direction === DIRECTIONS.UP && grid[0][0] === maxValue)) {
      score += 50;
    }
    
    // Penalize moves that create trapped tiles
    score -= calculateTrappedPenalty(grid, direction) * 20;
    
    return score;
  }

  function calculateHint() {
    if (gameOver) return null;
  
    const testGrid = JSON.parse(JSON.stringify(grid));
    const moves = [];
    
    // Test each direction with look-ahead
    for (const direction of Object.values(DIRECTIONS)) {
      if (!isMoveValid(testGrid, direction)) continue;
      
      const simulation = simulateMoveWithLookahead(testGrid, direction, 2);
      moves.push({
        direction,
        score: simulation.score,
        futureOptions: simulation.futureOptions
      });
    }
  
    if (moves.length === 0) return null;
  
    // Weighted scoring considering immediate and future moves
    moves.forEach(move => {
      move.combinedScore = move.score * 1.5 + move.futureOptions * 0.5;
    });
  
    moves.sort((a, b) => b.combinedScore - a.combinedScore);
    return moves[0].direction;
  }
  
  function simulateMoveWithLookahead(grid, direction, depth) {
    if (depth === 0) return { score: 0, futureOptions: 0 };
    
    const testGrid = JSON.parse(JSON.stringify(grid));
    const moved = simulateMove(testGrid, direction);
    
    if (!moved) return { score: -Infinity, futureOptions: 0 };
    
    // Add random tile for lookahead
    addRandomTile(testGrid);
    
    // Evaluate current move
    const score = evaluateMove(grid, direction);
    
    // Count future options
    let futureOptions = 0;
    for (const dir of Object.values(DIRECTIONS)) {
      if (simulateMove(JSON.parse(JSON.stringify(testGrid)), dir)) {
        futureOptions++;
      }
    }
    
    // Recurse if needed
    if (depth > 1) {
      const futureMoves = [];
      for (const dir of Object.values(DIRECTIONS)) {
        const result = simulateMoveWithLookahead(testGrid, dir, depth - 1);
        futureMoves.push(result);
      }
      const bestFuture = Math.max(...futureMoves.map(m => m.score));
      return { score: score + bestFuture * 0.3, futureOptions };
    }
    
    return { score, futureOptions };
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

  function calculateAdaptiveDifficulty(currentState, gameStats) {
    const { score, bestScore, moveCount, gameOver } = gameStats;
    const { performanceHistory, lastAdjustment, baseLevel } = currentState;
    
    // Don't adjust too frequently (minimum 10 moves between changes)
    if (moveCount - lastAdjustment < 10 && !gameOver) return currentState;
    
    const newHistory = [...performanceHistory, {
      score,
      moveCount,
      timestamp: Date.now()
    }].slice(-20); // Keep last 20 data points
    
    // Calculate performance metrics
    const avgScore = newHistory.reduce((sum, entry) => sum + entry.score, 0) / newHistory.length;
    const scoreTrend = newHistory.length > 1 ? 
      (newHistory[newHistory.length - 1].score - newHistory[0].score) / newHistory.length : 0;
    
    const difficultyLevels = ['easy', 'medium', 'hard', 'expert'];
    let currentIndex = difficultyLevels.indexOf(currentState.currentLevel);
    
    // Adjust difficulty based on performance
    if (gameOver) {
      // Make easier if player lost
      currentIndex = Math.max(0, currentIndex - 1);
    } else if (score > bestScore * 1.3 && scoreTrend > 0) {
      // Player is improving - increase challenge
      currentIndex = Math.min(difficultyLevels.length - 1, currentIndex + 1);
    } else if (score < bestScore * 0.7 && scoreTrend < 0) {
      // Player is struggling - decrease challenge
      currentIndex = Math.max(0, currentIndex - 1);
    }
    
    return {
      ...currentState,
      currentLevel: difficultyLevels[currentIndex],
      performanceHistory: newHistory,
      lastAdjustment: moveCount
    };
  }

  function calculatePerformancePercentage() {
    const { performanceHistory, currentLevel } = adaptiveDifficulty;
    if (performanceHistory.length < 2) return 50;
    
    const levels = ['easy', 'medium', 'hard', 'expert'];
    const levelIndex = levels.indexOf(currentLevel);
    const maxIndex = levels.length - 1;
    
    return ((levelIndex / maxIndex) * 100) - 
      (performanceHistory.slice(-5).reduce((sum, entry) => 
        sum + (entry.score < bestScore * 0.8 ? 10 : -10), 0));
  }
  
  function getPerformanceColor() {
    const percentage = calculatePerformancePercentage();
    if (percentage < 30) return '#4CAF50'; // Green (easy)
    if (percentage < 60) return '#FFC107'; // Yellow (medium)
    if (percentage < 85) return '#FF9800'; // Orange (hard)
    return '#F44336'; // Red (expert)
  }

  function getDynamicSpeed(baseSpeed) {
  const recentPerformance = adaptiveDifficulty.performanceHistory.slice(-5);
  if (recentPerformance.length < 3) return baseSpeed;
  
  const avgScore = recentPerformance.reduce((sum, entry) => sum + entry.score, 0) / recentPerformance.length;
  const scoreRatio = avgScore / bestScore;
  
  // Adjust speed based on performance
  if (scoreRatio > 1.2) return baseSpeed * 0.8; // Faster for strong players
  if (scoreRatio < 0.8) return baseSpeed * 1.2; // Slower for struggling players
  return baseSpeed;
}


function getPerformanceTip() {
  const { currentLevel, performanceHistory } = adaptiveDifficulty;
  const recent = performanceHistory.slice(-5);
  
  if (recent.length < 3) return "Keep playing to get personalized tips!";
  
  const avgMoves = recent.reduce((sum, entry) => sum + entry.moveCount, 0) / recent.length;
  
  if (currentLevel === 'easy' && avgMoves > 50) {
    return "Try to keep your highest number in a corner!";
  }
  
  if (currentLevel === 'medium' && avgMoves > 30) {
    return "Plan ahead - think about where new tiles will appear!";
  }
  
  // Add more tips...
}

function calculatePredictions() {
  if (gameOver) return [];
  
  const predictions = [];
  const directions = Object.values(DIRECTIONS);
  
  for (const direction of directions) {
    // Create deep copy of grid
    const testGrid = JSON.parse(JSON.stringify(grid));
    
    // Simulate the move
    const moved = simulateMove(testGrid, direction);
    
    if (moved) {
      // Add random tile for each possible new tile position
      const emptyCells = [];
      for (let i = 0; i < GRID_SIZE; i++) {
        for (let j = 0; j < GRID_SIZE; j++) {
          if (testGrid[i][j] === 0) {
            emptyCells.push({i, j});
          }
        }
      }
      let outcomes;
  switch (predictionAccuracy) {
    case 'low':
      outcomes = [{ grid: addRandomTileCopy(testGrid), value: '?' }];
      break;
    case 'high':
      outcomes = [
        { grid: addTileAtPosition(testGrid, emptyCells, 2), value: 2, probability: '90%' },
        { grid: addTileAtPosition(testGrid, emptyCells, 4), value: 4, probability: '10%' },
        ...(emptyCells.length > 1 ? [
          { grid: addTileAtPosition(testGrid, emptyCells, 2, 1), value: 2, probability: '90%' }
        ] : [])
      ];
      break;
    case 'medium':
    default:
      outcomes = [
        { grid: addTileAtPosition(testGrid, emptyCells, 2), value: 2 },
        { grid: addTileAtPosition(testGrid, emptyCells, 4), value: 4 }
      ];
  }
      
      // Create predictions for most likely outcomes (2 and 4 in random positions)
      const prediction = {
        direction,
        outcomes
      };
      
      predictions.push(prediction);
    }
  }
  
  return predictions;
}

function addTileAtPosition(grid, emptyCells, value) {
  if (emptyCells.length === 0) return grid;
  
  const newGrid = JSON.parse(JSON.stringify(grid));
  const randomIndex = Math.floor(Math.random() * emptyCells.length);
  const {i, j} = emptyCells[randomIndex];
  newGrid[i][j] = value;
  return newGrid;
}

  const addRandomTileCopy = useCallback((grid, options = {}) => {
    // Cache empty cells to avoid recalculating
    const emptyCells = grid.reduce((cells, row, rowIndex) => {
      row.forEach((cell, colIndex) => {
        if (cell === 0) cells.push({ row: rowIndex, col: colIndex });
      });
      return cells;
    }, []);
  
    if (emptyCells.length === 0) return grid;
  
    const newGrid = [...grid.map(row => [...row])];
    const { row, col } = emptyCells[Math.floor(Math.random() * emptyCells.length)];
    
    newGrid[row][col] = options.value || (Math.random() < 0.9 ? 2 : 4);
    
    
    return newGrid;
  }, []);

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

  
  const updateBestScore = (newScore) => {
    if (newScore > bestScore) {
      const newBest = Math.max(newScore, bestScore);
      setBestScore(newBest);
      setNewBest(true); 
      setTimeout(() => setNewBest(false), 1500);
      localStorage.setItem('bestScore', newBest.toString());
      return true;
    }
    return false;
  };
  
  const addToScoreHistory = (score) => {
    const newHistory = [...scoreHistory, {
      score,
      date: new Date().toISOString(),
      grid: JSON.stringify(grid) // Optional: store final grid state
    }].slice(-10); // Keep only last 10 games
    
    setScoreHistory(newHistory);
    localStorage.setItem('scoreHistory', JSON.stringify(newHistory));
  };

  useEffect(() => {
    if (!aiPlaying) return;
  
    setAdaptiveDifficulty(prev => calculateAdaptiveDifficulty(prev, {
      score,
      bestScore,
      moveCount: moveCountRef.current, // Track moves separately
      gameOver
    }));
  }, [score, gameOver, aiPlaying]);
  
  // Track move count separately
  
  useEffect(() => {
    if (aiPlaying) moveCountRef.current++;
  }, [grid]); // Increment when grid changes


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

  useEffect(() => {
    if (!showHints || gameOver || aiPlaying) return;
  
    const hintInterval = setInterval(() => {
      const hint = calculateHint();
      setHintDirection(hint);
    }, 3000); // Update hint every 3 seconds
  
    return () => clearInterval(hintInterval);
  }, [showHints, gameOver, aiPlaying, grid]);

  useEffect(() => {
    if (!aiPlaying) return;
    
    // Increase difficulty if player is winning
    if (score > bestScore * 1.5) {
      setAiDifficulty(prev => {
        const levels = ['easy', 'medium', 'hard', 'expert'];
        const currentIndex = levels.indexOf(prev);
        return currentIndex < levels.length - 1 ? levels[currentIndex + 1] : prev;
      });
    }
  }, [score, bestScore, aiPlaying]);

  // Memoize predictions to avoid expensive recalculations
const memoizedPredictions = useMemo(() => {
  if (showPredictions) {
    return calculatePredictions();
  }
  return [];
}, [grid, showPredictions]);

useEffect(() => {
  if (showPredictions) {
    setPredictiveMoves(memoizedPredictions);
  }
}, [memoizedPredictions, showPredictions]);

useEffect(() => {
  if (gameWon) {
    playSound(winSound);
  } else if (gameOver) {
    playSound(loseSound);
  }
}, [gameWon, gameOver]);

const clearHistory = () => {
  setScoreHistory([]);
  localStorage.removeItem('scoreHistory');
};

  // Change AI speed
  const changeAiSpeed = (e) => {
    setAiSpeed(getDynamicSpeed(parseInt(e.target.value)).toFixed(0));
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

  const getDirectionHighlightStyle = () => {
    if (!directionHighlight || !lastDirection) return {};
    
    const baseStyle = {
      position: 'absolute',
      width: '100%',
      height: '100%',
      borderRadius: '6px',
      pointerEvents: 'none',
      opacity: 0.3,
      animation: 'pulse 0.2s ease-out',
    };

    switch (lastDirection) {
      case 'up':
        return {
          ...baseStyle,
          background: 'linear-gradient(to bottom, rgba(255,255,255,0.8), rgba(255,255,255,0))',
          top: 0,
        };
      case 'down':
        return {
          ...baseStyle,
          background: 'linear-gradient(to top, rgba(255,255,255,0.8), rgba(255,255,255,0))',
          bottom: 0,
        };
      case 'left':
        return {
          ...baseStyle,
          background: 'linear-gradient(to right, rgba(255,255,255,0.8), rgba(255,255,255,0))',
          left: 0,
        };
      case 'right':
        return {
          ...baseStyle,
          background: 'linear-gradient(to left, rgba(255,255,255,0.8), rgba(255,255,255,0))',
          right: 0,
        };
      default:
        return {};
    }
  };

  const ScoreHistory = ({ history }) => {
    return (
      <div className="score-history">
        <h3>Recent Games</h3>
        <div className="history-actions">
            <button onClick={clearHistory} className="clear-history">
                Clear History
            </button>
        </div>
        <div className="history-list">
          {history.length > 0 ? (
            history.map((game, index) => (
              <div key={index} className="history-item">
                <span className="history-score">{game.score}</span>
                <span className="history-date">
                  {new Date(game.date).toLocaleString()}
                </span>
              </div>
            ))
          ) : (
            <p>No games played yet</p>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="app">
      <div className="header">
      <p>Join the numbers and get to the <strong>2048 tile!</strong></p>
        <div className="scores">
          <div className="score-box">
            <div className="score-label">SCORE</div>
            <div className={`score-value ${scoreUpdated ? 'score-update' : ''}`}>{score}</div>
          </div>
          <div className="score-box">
            <div className="score-label">BEST</div>
            <div className={`score-value best-score ${newBest ? 'new-best' : ''}`}> {bestScore}</div>
          </div>
          <button 
      className="history-toggle"
      onClick={() => setShowHistory(!showHistory)}
    >
      {showHistory ? 'Hide History' : 'Show History'}
    </button>
        </div>
        <button 
    className="sound-toggle"
    onClick={() => {
      [moveSound, mergeSound, appearSound, winSound, loseSound, bestScoreSound].forEach(sound => {
        if (sound.current) {
          sound.current.muted = !sound.current.muted;
        }
      });
    }}
    aria-label="Toggle sound"
  >
    🔈
  </button>
      </div>
      {showHistory && <ScoreHistory history={scoreHistory} />}
      
      <div className="controls">
        <button onClick={resetGame}>New Game</button>
        <div className="ai-control-panel">
        <div className="difficulty-selector">
  <label>AI Difficulty:</label>
  <select 
    value={aiDifficulty} 
    onChange={(e) => setAiDifficulty(e.target.value)}
    disabled={aiPlaying}
  >
    <option value="easy">Easy</option>
    <option value="medium">Medium</option>
    <option value="hard">Hard</option>
    <option value="expert">Expert</option>
  </select>
</div>
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
    <div className="ai-speed-control">
    <label>Speed (ms): </label>
    <input
      type="range"
      min="50"
      max="500"
      value={aiSpeed}
      onChange={changeAiSpeed}
    />
    <span>{ aiSpeed} ms</span>
  </div>
  )}
</div>
<div className="adaptive-difficulty-display">
  <div className="difficulty-level">
    Current Challenge: <span>{adaptiveDifficulty.currentLevel.toUpperCase()}</span>
  </div>
  <div className="performance-meter">
    <div 
      className="meter-fill"
      style={{
        width: `${calculatePerformancePercentage()}%`,
        backgroundColor: getPerformanceColor()
      }}
    ></div>
  </div>
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
          className={`grid-cell ${
            showHints && hintDirection 
              ? `hint-${hintDirection.toLowerCase()}` 
              : ''
          }`}
          style={{ 
            backgroundColor: getTileColor(cell),
            color: cell > 4 ? '#f9f6f2' : '#776e65',
            fontSize: cell < 100 ? '55px' : cell < 1000 ? '45px' : '35px',
            position: 'relative' // Needed for hint arrows
          }}
        >
          {cell !== 0 ? cell : ''}
        </div>
      ))}
    </div>
  ))}
</div>
       
{gameWon && !keepPlaying && (
  <div className="win-modal">
    <div className="win-content">
      <h2>You Win!</h2>
      <p>Congratulations! You reached 2048!</p>
      <div className="win-buttons">
        <button 
          onClick={() => setKeepPlaying(true)}
          className="keep-playing-button"
        >
          Keep Playing
        </button>
        <button 
          onClick={resetGame}
          className="new-game-button"
        >
          New Game
        </button>
      </div>
    </div>
  </div>
)}

        {gameOver && (
          <div className="game-over">
            <div>Game Over!</div>
            <button onClick={resetGame}>Try Again</button>
          </div>
        )}

<div className="game-status">
  {gameWon && (
    <div className="win-indicator">
      <span>🏆 You Won! </span>
      {keepPlaying && <span>(Continuing)</span>}
    </div>
  )}
  {gameOver && !gameWon && (
    <div className="game-over-indicator">Game Over!</div>
  )}
</div>
{directionHighlight && (
          <div className="direction-highlight" style={getDirectionHighlightStyle()}></div>
        )}
      </div>
      <div className="direction-hints">
        <button 
          className={`direction-btn up ${lastDirection === 'up' && directionHighlight ? 'active' : ''}`} 
          onClick={() => moveTiles('up')}
        >
          ↑
        </button>
        <div className="horizontal-buttons">
          <button 
            className={`direction-btn left ${lastDirection === 'left' && directionHighlight ? 'active' : ''}`} 
            onClick={() => moveTiles('left')}
          >
            ←
          </button>
          <button 
            className={`direction-btn down ${lastDirection === 'down' && directionHighlight ? 'active' : ''}`} 
            onClick={() => moveTiles('down')}
          >
            ↓
          </button>
          <button 
            className={`direction-btn right ${lastDirection === 'right' && directionHighlight ? 'active' : ''}`} 
            onClick={() => moveTiles('right')}
          >
            →
          </button>
        </div>
      </div>

      <div className="hint-controls">
  <button 
    onClick={() => {
      const hint = calculateHint();
      setHintDirection(hint);
      setShowHints(true);
      setTimeout(() => setShowHints(false), 2000); // Auto-hide after 2 seconds
    }}
    disabled={gameOver || aiPlaying}
  >
    Show Hint
  </button>
  
  <label className="hint-toggle">
    <input 
      type="checkbox" 
      checked={showHints} 
      onChange={(e) => setShowHints(e.target.checked)} 
    />
    Auto-hints
  </label>
</div>
<button
  className="reset-adaptive-button"
  onClick={() => setAdaptiveDifficulty(prev => ({
    ...prev,
    currentLevel: prev.baseLevel,
    performanceHistory: [],
    lastAdjustment: 0
  }))}
>
  Reset Difficulty
</button>
<button 
  className="prediction-toggle"
  onClick={() => {
    if (!showPredictions) {
      setPredictiveMoves(calculatePredictions());
    }
    setShowPredictions(!showPredictions);
  }}
  disabled={gameOver || aiPlaying}
>
  {showPredictions ? 'Hide Predictions' : 'Show Next Moves'}
</button>

{showPredictions && !gameOver && !aiPlaying && (
  <div className="predictions-container">
    <h3>Possible Next Moves:</h3>
    <div className="predictions-grid">
      {predictiveMoves.map((prediction, index) => (
        <div key={index} className="prediction-direction">
          <h4>{prediction.direction.toUpperCase()}</h4>
          <div className="possible-outcomes">
            {prediction.outcomes.map((outcome, idx) => (
              <div key={idx} className="outcome">
                <div className="outcome-label">New: {outcome.value} {outcome.probability}</div>
                <div className="predicted-grid">
                  {outcome.grid.map((row, i) => (
                    <div key={i} className="predicted-row">
                      {row.map((cell, j) => (
                        <div 
                          key={j}
                          className="predicted-cell"
                          style={{
                            backgroundColor: getTileColor(cell),
                            color: cell > 4 ? '#f9f6f2' : '#776e65',
                            fontSize: cell < 100 ? '20px' : cell < 1000 ? '16px' : '12px'
                          }}
                        >
                          {cell !== 0 ? cell : ''}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  </div>
)}

<div className="performance-tip">
  {getPerformanceTip()}
</div>
        
      <div className="instructions">
        <p>Use arrow keys to move tiles. Join the numbers to get to 2048!</p>
        {aiPlaying && <p>AI is playing with Expectimax algorithm (depth: {aiDepth})</p>}
      </div>
    </div>
  );
}

export default App;