// ==================== CONSTANTS & GAME SETUP ====================

const COLORS = [
  { name: '빨강', value: 'red', primary: '#ea1111', shadow: '#9b0808' },
  { name: '주황', value: 'orange', primary: '#f27911', shadow: '#b05204' },
  { name: '노랑', value: 'yellow', primary: '#f5f517', shadow: '#ab9b0a' },
  { name: '초록', value: 'green', primary: '#11b311', shadow: '#087308' },
  { name: '파랑', value: 'blue', primary: '#1111e8', shadow: '#0808a3' },
  { name: '보라', value: 'purple', primary: '#a212eb', shadow: '#660699' },
  { name: '검정', value: 'black', primary: '#3b4854', shadow: '#1f272e' },
  { name: '흰색', value: 'white', primary: '#d6e0f0', shadow: '#9aa4b3' },
  { name: '갈색', value: 'brown', primary: '#71491e', shadow: '#472d11' },
  { name: '분홍', value: 'pink', primary: '#ed53b9', shadow: '#ad2c80' }
];

// GAS (Google Apps Script / Game Auto Scaling) config
const GAS = {
  getRolesConfig: function(playerCount) {
    const configs = {
      5: { human: 3, zombie: 2, roles: ['항체보유자', '총사령관', '저항군', '저격좀비', '위장좀비'] },
      6: { human: 4, zombie: 2, roles: ['항체보유자', '총사령관', '저항군', '저항군', '저격좀비', '위장좀비'] },
      7: { human: 4, zombie: 3, roles: ['항체보유자', '총사령관', '저항군', '저항군', '저격좀비', '위장좀비', '은신좀비'] },
      8: { human: 5, zombie: 3, roles: ['항체보유자', '총사령관', '저항군', '저항군', '저항군', '저격좀비', '위장좀비', '은신좀비'] },
      9: { human: 6, zombie: 3, roles: ['항체보유자', '총사령관', '저항군', '저항군', '저항군', '저항군', '저격좀비', '위장좀비', '은신좀비'] },
      10: { human: 6, zombie: 4, roles: ['항체보유자', '총사령관', '저항군', '저항군', '저항군', '저항군', '저격좀비', '위장좀비', '은신좀비', '무지성좀비'] }
    };
    return configs[playerCount] || configs[5];
  },
  getTeamSizes: function(playerCount) {
    const teamSizes = {
      5: [3, 2, 3, 2, 3],
      6: [2, 3, 4, 3, 4],
      7: [2, 3, 4, 3, 4],
      8: [3, 4, 4, 5, 5],
      9: [3, 4, 4, 5, 5],
      10: [3, 4, 4, 5, 5]
    };
    return teamSizes[playerCount] || teamSizes[5];
  },
  requiresTwoFails: function(playerCount, roundNum) {
    // 7+ players require 2 fails on Round 4
    return playerCount >= 7 && roundNum === 4;
  }
};

// ==================== STATE MANAGEMENT ====================

let activeView = 'lobby';
let playerCount = 5;
let adminLogged = false;
let userSelectedColor = '';

// Firebase sync variables
let firebaseMode = false;
let db = null;
let myPlayerId = '';
let adminAssignedRoles = {}; // Host-only cache for admin monitoring

let gameState = 'setup'; // 'setup', 'waiting_start', 'role_briefing', 'leader_spinning', 'nomination', 'voting', 'mission_depart', 'mission_action', 'mission_reveal', 'assassination', 'ended'
let players = [];
let currentRound = 1;
let currentPhaseLeader = 0; // index
let rejectCount = 0;
let vaccineSuccesses = 0;
let vaccineFails = 0;
let roundsHistory = []; // Array of 'success' or 'fail'

// Helper to get local player object
function getMyPlayer() {
  const targetId = firebaseMode ? myPlayerId : 0;
  return players.find(p => p.id === targetId) || { id: targetId, name: "Player (나)", color: userSelectedColor || 'red', role: '항체보유자', alliance: 'human', isBot: false };
}

// Timers
let timerSec = 0;
let timerInterval = null;

// Selection states
let selectedNominees = [];
let votes = {};
let missionVotes = [];
let userAssassinationTarget = -1;

// Cheat mode
let cheatMode = false;

// ==================== VECTOR GENERATOR (Among Us SVG) ====================

function getCrewmateSVG(primaryColor, shadowColor, outlineColor = '#000000') {
  return `
    <svg viewBox="0 0 100 120" class="crewmate-svg">
      <!-- Backpack (Oxygen Tank) -->
      <path d="M 25,45 L 18,45 A 6,6 0 0,0 12,51 L 12,89 A 6,6 0 0,0 18,95 L 25,95 Z" fill="${shadowColor}" stroke="${outlineColor}" stroke-width="4" stroke-linejoin="round" />
      <path d="M 25,43 L 18,43 A 6,6 0 0,0 12,49 L 12,87 A 6,6 0 0,0 18,93 L 25,93 Z" fill="${primaryColor}" stroke="${outlineColor}" stroke-width="4" stroke-linejoin="round" />
      <!-- Body & Legs shadow -->
      <path d="M 30,30 A 25,25 0 0,1 80,30 L 80,85 A 5,5 0 0,1 75,90 L 68,90 A 5,5 0 0,1 63,85 L 63,105 A 5,5 0 0,1 58,110 L 48,110 A 5,5 0 0,1 43,105 L 43,85 L 43,105 A 5,5 0 0,1 38,110 L 28,110 A 5,5 0 0,1 23,105 L 23,80 L 30,80 Z" fill="${shadowColor}" stroke="${outlineColor}" stroke-width="4" stroke-linejoin="round" />
      <!-- Body & Legs primary -->
      <path d="M 30,28 A 25,25 0 0,1 80,28 L 80,83 A 5,5 0 0,1 75,88 L 68,88 A 5,5 0 0,1 63,83 L 63,103 A 5,5 0 0,1 58,108 L 48,108 A 5,5 0 0,1 43,103 L 43,83 L 43,103 A 5,5 0 0,1 38,108 L 28,108 A 5,5 0 0,1 23,103 L 23,78 L 30,78 Z" fill="${primaryColor}" stroke="${outlineColor}" stroke-width="4" stroke-linejoin="round" />
      <!-- Visor shadow border -->
      <path d="M 52,38 L 82,38 A 12,12 0 0,1 94,50 L 94,52 A 12,12 0 0,1 82,64 L 52,64 A 12,12 0 0,1 40,52 L 40,50 A 12,12 0 0,1 52,38 Z" fill="#1b2530" stroke="${outlineColor}" stroke-width="4" />
      <!-- Visor glass -->
      <path d="M 53,40 L 81,40 A 10,10 0 0,1 91,50 L 91,51 A 10,10 0 0,1 81,61 L 53,61 A 10,10 0 0,1 43,51 L 43,50 A 10,10 0 0,1 53,40 Z" fill="#8bf0ff" />
      <!-- Visor reflection -->
      <path d="M 58,43 H 76 A 3,3 0 0,1 79,46 V 47 A 3,3 0 0,1 76,50 H 58 A 3,3 0 0,1 55,47 V 46 A 3,3 0 0,1 58,43 Z" fill="#ffffff" opacity="0.6" />
    </svg>
  `;
}

// ==================== LOBBY INITIALIZATION ====================

function initLobbyGrid() {
  const grid = document.getElementById('character-grid');
  grid.innerHTML = '';
  
  COLORS.forEach(color => {
    const card = document.createElement('div');
    card.className = 'char-select-card';
    card.id = `char-card-${color.value}`;
    card.innerHTML = `
      ${getCrewmateSVG(color.primary, color.shadow)}
      <span class="char-name" style="color: ${color.primary}">${color.name}</span>
    `;
    card.onclick = () => selectLobbyColor(color.value);
    grid.appendChild(card);
  });
}

function selectLobbyColor(colorValue) {
  if (gameState !== 'setup' && gameState !== 'waiting_start') return;
  
  // Check if taken in players list
  const taken = players.find(p => p.color === colorValue && p.id !== myPlayerId);
  if (taken) return; // cannot select taken color
  
  userSelectedColor = colorValue;
  
  if (firebaseMode) {
    // Apply local highlight instantly for visual feedback
    COLORS.forEach(c => {
      const card = document.getElementById(`char-card-${c.value}`);
      if (card) {
        if (c.value === colorValue) card.classList.add('selected');
        else card.classList.remove('selected');
      }
    });

    // If already registered, update color immediately
    db.ref(`room/players/${myPlayerId}`).once('value', snapshot => {
      if (snapshot.exists()) {
        db.ref(`room/players/${myPlayerId}/color`).set(colorValue);
      } else {
        updateLobbyGridFromFirebase();
      }
    });
  } else {
    // Local mode: use previous highlight code
    COLORS.forEach(c => {
      const card = document.getElementById(`char-card-${c.value}`);
      if (card) {
        if (c.value === colorValue) card.classList.add('selected');
        else card.classList.remove('selected');
      }
    });
    
    // Disable colors for bots
    COLORS.forEach(color => {
      const card = document.getElementById(`char-card-${color.value}`);
      if (card && color.value !== colorValue) {
        card.classList.remove('disabled');
      }
    });

    const availableColors = COLORS.filter(c => c.value !== colorValue);
    const shuffledColors = availableColors.sort(() => 0.5 - Math.random());
    
    const numBots = playerCount - 1;
    for (let i = 0; i < numBots; i++) {
      const botColor = shuffledColors[i].value;
      const card = document.getElementById(`char-card-${botColor}`);
      if (card) card.classList.add('disabled');
    }
  }
}

function adjustSetupPlayers(dir) {
  const currentVal = parseInt(document.getElementById('setup-player-count').innerText);
  let newVal = currentVal + dir;
  if (newVal < 5) newVal = 5;
  if (newVal > 10) newVal = 10;
  
  document.getElementById('setup-player-count').innerText = newVal;
  playerCount = newVal;
  
  // Update test panel slider value to sync
  document.getElementById('test-player-count').value = newVal;
  document.getElementById('player-count-val').innerText = `${newVal}명`;
  
  if (firebaseMode) {
    db.ref('room/playerCount').set(newVal);
  } else {
    // Re-run color reservation locally
    if (userSelectedColor) {
      selectLobbyColor(userSelectedColor);
    }
  }
}

// ==================== VIEW HANDLING ====================

function switchView(viewName) {
  activeView = viewName;
  
  // Tabs update
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  
  const targetTab = document.getElementById(`tab-${viewName}`);
  if (targetTab) targetTab.classList.add('active');
  
  // Views update
  document.querySelectorAll('.view-content').forEach(view => view.classList.remove('active-view'));
  
  const targetView = document.getElementById(`${viewName}-view`);
  if (targetView) targetView.classList.add('active-view');
  
  // Test toggle button visibility
  const testToggleBtn = document.getElementById('test-toggle-btn');
  const testPanel = document.getElementById('test-control-panel');
  if (testToggleBtn) {
    if (viewName === 'admin') {
      testToggleBtn.classList.remove('hidden');
    } else {
      testToggleBtn.classList.add('hidden');
      if (testPanel) testPanel.classList.add('hidden'); // auto close test panel when switching
    }
  }
  
  // Extra rendering updates
  if (viewName === 'admin') {
    // Redraw roulette
    drawRoulette(rouletteAngle);
  }
}

function toggleTestPanel() {
  const panel = document.getElementById('test-control-panel');
  panel.classList.toggle('hidden');
}

// ==================== ADMIN PASSWORD LOGIN ====================

function openAdminLoginModal() {
  document.getElementById('admin-login-modal').classList.remove('hidden');
  document.getElementById('admin-password-input').value = '';
  document.getElementById('login-error-msg').innerText = '';
  document.getElementById('admin-password-input').focus();
}

function closeAdminLoginModal() {
  document.getElementById('admin-login-modal').classList.add('hidden');
}

function submitAdminPassword() {
  const input = document.getElementById('admin-password-input').value;
  if (input === '2525') {
    adminLogged = true;
    closeAdminLoginModal();
    // Reveal admin tab
    document.getElementById('tab-admin').style.display = 'inline-block';
    // Switch to admin view
    switchView('admin');
  } else {
    document.getElementById('login-error-msg').innerText = '비밀번호가 올바르지 않습니다. (Hint: 2525)';
  }
}

// Bind enter key on password field
document.getElementById('admin-password-input').addEventListener('keypress', function(e) {
  if (e.key === 'Enter') {
    submitAdminPassword();
  }
});

// ==================== CORE GAME FLOW LOGIC ====================

function setupPlayers() {
  players = [];
  
  // 1. Assign selected color to user
  const userColor = userSelectedColor || 'red';
  const remainingColors = COLORS.filter(c => c.value !== userColor).sort(() => 0.5 - Math.random());
  
  // 2. Allocate roles based on GAS scale
  const rolesConfig = GAS.getRolesConfig(playerCount);
  const shuffledRoles = [...rolesConfig.roles].sort(() => 0.5 - Math.random());
  
  // Create user
  players.push({
    id: 0,
    name: "Player (나)",
    color: userColor,
    role: shuffledRoles[0],
    alliance: getAlliance(shuffledRoles[0]),
    isLeader: false,
    isOnline: true,
    isBot: false
  });
  
  // Create bots
  for (let i = 1; i < playerCount; i++) {
    players.push({
      id: i,
      name: `AI_${remainingColors[i-1].name} (${i}번)`,
      color: remainingColors[i-1].value,
      role: shuffledRoles[i],
      alliance: getAlliance(shuffledRoles[i]),
      isLeader: false,
      isOnline: true,
      isBot: true
    });
  }
  
  // Setup display names/details
  document.getElementById('player-nickname').innerText = `Player (${COLORS.find(c => c.value === userColor).name})`;
  renderPlayerAvatarSVG();
}

function getAlliance(role) {
  const goodRoles = ['항체보유자', '총사령관', '저항군'];
  return goodRoles.includes(role) ? 'human' : 'zombie';
}

function renderPlayerAvatarSVG() {
  const container = document.getElementById('player-avatar-svg-placeholder');
  const user = getMyPlayer();
  const colorObj = COLORS.find(c => c.value === user.color);
  if (colorObj) {
    container.innerHTML = getCrewmateSVG(colorObj.primary, colorObj.shadow);
  }
}

function startGameFromLobby() {
  if (!userSelectedColor) {
    alert('참가할 캐릭터를 먼저 선택해 주십시오!');
    return;
  }
  
  const nickInput = document.getElementById('lobby-nickname-input');
  let nick = nickInput ? nickInput.value.trim() : '';
  if (!nick) nick = 'Player';
  
  if (firebaseMode) {
    // Register player in Firebase under myPlayerId
    const newPlayer = {
      id: myPlayerId,
      name: nick,
      color: userSelectedColor,
      isLeader: false,
      isOnline: true,
      isBot: false
    };
    
    db.ref(`room/players/${myPlayerId}`).set(newPlayer);
    
    // Transition to waiting page in player view
    switchView('player');
    document.getElementById('player-game-screen').classList.add('hidden');
    document.getElementById('player-intro-screen').classList.remove('hidden');
    
    const storyField = document.getElementById('intro-story-text');
    storyField.innerText = "대기실 대기 중...\n관리자가 대시보드에서 '게임 시작'을 눌러야 시작됩니다.";
    storyField.classList.add('fade-in');
  } else {
    // Local fallback mode
    setupPlayers();
    gameState = 'waiting_start';
    
    // Transition to waiting page in player view
    switchView('player');
    document.getElementById('player-game-screen').classList.add('hidden');
    document.getElementById('player-intro-screen').classList.remove('hidden');
    
    const storyField = document.getElementById('intro-story-text');
    storyField.innerText = "대기실 대기 중...\n관리자가 대시보드에서 '게임 시작'을 눌러야 시작됩니다.";
    storyField.classList.add('fade-in');
    
    renderAdminMonitor();
    updateAdminStatusBoard();
  }
}

// ==================== INTRO BRIEFING SIMULATION ====================

function adminStartGame() {
  if (firebaseMode) {
    if (players.length < playerCount) {
      alert("참가 인원수가 부족합니다. 더 대기하거나 봇으로 채워주세요.");
      return;
    }
    
    // Assign roles
    const rolesConfig = GAS.getRolesConfig(playerCount);
    const shuffledRoles = [...rolesConfig.roles].sort(() => 0.5 - Math.random());
    
    const privateRoles = {};
    adminAssignedRoles = {};
    players.forEach((p, idx) => {
      privateRoles[p.id] = {
        role: shuffledRoles[idx],
        alliance: getAlliance(shuffledRoles[idx])
      };
      adminAssignedRoles[p.id] = {
        role: shuffledRoles[idx],
        alliance: getAlliance(shuffledRoles[idx])
      };
    });
    
    db.ref('room/privateRoles').set(privateRoles);
    
    // Set game state to briefing
    db.ref('room/state').set('role_briefing');
    
    // Clear logs
    db.ref('room/logs').remove();
    addAdminLog("게임이 시작되었습니다. 역할을 배정하고 브리핑을 재생합니다.", 'success');
  } else {
    // Local fallback
    if (gameState !== 'waiting_start' && gameState !== 'setup') {
      if (players.length === 0) {
        userSelectedColor = 'red';
        setupPlayers();
      }
    }
    
    gameState = 'role_briefing';
    document.getElementById('admin-start-btn').disabled = true;
    document.getElementById('admin-stop-btn').disabled = false;
    
    renderAdminMonitor();
    updateAdminStatusBoard();
    playIntroSequence();
  }
}

function playIntroSequence() {
  const storyFieldPlayer = document.getElementById('intro-story-text');
  const storyFieldAdmin = document.getElementById('admin-intro-story-text');
  const imgContainers = document.querySelectorAll('.intro-image-container');
  
  // Blackout and show Lab briefing photo in both player and admin views
  document.getElementById('player-game-screen').classList.add('hidden');
  document.getElementById('player-intro-screen').classList.remove('hidden');
  document.getElementById('admin-intro-screen').classList.remove('hidden');
  
  setTimeout(() => {
    imgContainers.forEach(c => c.classList.add('show'));
  }, 100);
  
  const storyParagraphs = [
    "인류는 평화로웠다. 그 사건이 있기 전까지는.",
    "거대한 운석이 지구를 강타하고, 좀비 바이러스가 전 인류를 서서히 감염시켜갔다.",
    "인류는 저항하였으나 엄청난 수의 좀비 감염자를 당해낼 수 없었고, 후퇴를 거듭한 끝에 작은 도시 한 곳만이 인류의 마지막 거주지가 되고 말았다.",
    "모든 희망이 사라졌다고 느낄 때, 기적이 발생했다.",
    "그것은 바로 좀비바이러스를 사멸시킬 수 있는 백신을 개발 할 수 있다는 소식.",
    "마지막까지 남은 최후의 인류 중 단 한 명뿐인 항체보유자의 혈액을 백신연구소에 보내면 백신을 개발할 수 있다는 이 소식에 전 인류의 모든 운명이 달렸다.",
    "인류는 백신연구소로 혈액을 운송시킬 수 있을까."
  ];
  
  let paragraphIdx = 0;
  
  function showNextParagraph() {
    if (paragraphIdx >= storyParagraphs.length) {
      endIntroSequence();
      return;
    }
    
    // Fade out previous
    if (storyFieldPlayer) storyFieldPlayer.classList.remove('fade-in');
    if (storyFieldAdmin) storyFieldAdmin.classList.remove('fade-in');
    
    setTimeout(() => {
      if (storyFieldPlayer) {
        storyFieldPlayer.innerText = storyParagraphs[paragraphIdx];
        storyFieldPlayer.classList.add('fade-in');
      }
      if (storyFieldAdmin) {
        storyFieldAdmin.innerText = storyParagraphs[paragraphIdx];
        storyFieldAdmin.classList.add('fade-in');
      }
      paragraphIdx++;
      
      // Auto advance after 3.5 seconds
      setTimeout(showNextParagraph, 3500);
    }, 500); // fade out buffer
  }
  
  showNextParagraph();
}

function endIntroSequence() {
  document.getElementById('player-intro-screen').classList.add('hidden');
  document.getElementById('admin-intro-screen').classList.add('hidden');
  document.getElementById('player-game-screen').classList.remove('hidden');
  
  // Transition game state
  gameState = 'leader_spinning';
  updateAdminStatusBoard();
  
  // Start leader wheel selection
  startLeaderSelectionRoulette();
}

// ==================== LEADER WHEEL SELECTION ====================

let rouletteAngle = 0;
let rouletteSpeed = 0;
let rouletteDecel = 0.98;
let rouletteTargetIdx = -1;
let rouletteAnimating = false;

function startLeaderSelectionRoulette() {
  gameState = 'leader_spinning';
  updateAdminStatusBoard();
  
  // Show overlays on both views
  const playerOverlay = document.getElementById('player-roulette-overlay');
  const adminOverlay = document.getElementById('admin-roulette-overlay');
  if (playerOverlay) playerOverlay.classList.add('show');
  if (adminOverlay) adminOverlay.classList.add('show');
  
  // Set random target leader
  rouletteTargetIdx = Math.floor(Math.random() * players.length);
  
  // Spin roulette wheel
  rouletteAngle = 0;
  const initialSpeed = 0.4 + Math.random() * 0.3; // initial speed rad/frame
  rouletteSpeed = initialSpeed;
  rouletteAnimating = true;
  
  document.getElementById('game-status-msg').innerText = "1라운드 운송대 편성을 담당할 대장을 무작위 선정 중입니다...";
  const winTextPlayer = document.getElementById('roulette-winner-text-player');
  const winTextAdmin = document.getElementById('roulette-winner-text-admin');
  if (winTextPlayer) winTextPlayer.innerText = "회전 중...";
  if (winTextAdmin) winTextAdmin.innerText = "회전 중...";
  
  if (firebaseMode) {
    if (adminLogged) {
      db.ref('room/rouletteStart').set({
        randSpeed: initialSpeed,
        winningIdx: rouletteTargetIdx,
        timestamp: Date.now()
      });
    }
  } else {
    animateRoulette();
  }
}

function animateRoulette() {
  if (!rouletteAnimating) return;
  
  rouletteAngle += rouletteSpeed;
  rouletteSpeed *= rouletteDecel;
  
  // Draw the wheel on both player and admin views if visible
  drawRoulette(rouletteAngle);
  
  if (rouletteSpeed < 0.002) {
    rouletteAnimating = false;
    rouletteSpeed = 0;
    
    // Determine winner based on stopping angle
    // Each slice is (2 * PI / playerCount)
    const numSlices = players.length;
    const sliceAngle = (2 * Math.PI) / numSlices;
    
    // The pointer points at the top (-PI/2)
    // Calc normalized angle representing pointer location on wheel
    let normAngle = (1.5 * Math.PI - rouletteAngle) % (2 * Math.PI);
    if (normAngle < 0) normAngle += 2 * Math.PI;
    
    const winningIdx = Math.floor(normAngle / sliceAngle) % numSlices;
    finalizeLeaderSelection(winningIdx);
  } else {
    requestAnimationFrame(animateRoulette);
  }
}

function finalizeLeaderSelection(winningIdx) {
  // Set as leader
  players.forEach((p, idx) => {
    p.isLeader = (idx === winningIdx);
  });
  currentPhaseLeader = winningIdx;
  
  const leaderPlayer = players[winningIdx];
  const colorObj = COLORS.find(c => c.value === leaderPlayer.color);
  
  const winTextPlayer = document.getElementById('roulette-winner-text-player');
  const winTextAdmin = document.getElementById('roulette-winner-text-admin');
  if (winTextPlayer) winTextPlayer.innerText = `선정됨: ${leaderPlayer.name}`;
  if (winTextAdmin) winTextAdmin.innerText = `선정됨: ${leaderPlayer.name}`;
  
  document.getElementById('game-leader-name').innerText = `${leaderPlayer.name} (${colorObj.name})`;
  
  // Update the host dashboard leader display
  const leaderDisplay = document.getElementById('admin-leader-name-display');
  if (leaderDisplay) {
    leaderDisplay.innerText = `${leaderPlayer.name} (${colorObj.name})`;
    leaderDisplay.style.color = colorObj.primary;
  }
  const avatarPlaceholder = document.getElementById('admin-leader-avatar-placeholder');
  if (avatarPlaceholder) {
    avatarPlaceholder.innerHTML = getCrewmateSVG(colorObj.primary, colorObj.shadow);
  }
  
  // Render
  renderAdminMonitor();
  
  // Fade out overlays after 2 seconds
  setTimeout(() => {
    const playerOverlay = document.getElementById('player-roulette-overlay');
    const adminOverlay = document.getElementById('admin-roulette-overlay');
    if (playerOverlay) playerOverlay.classList.remove('show');
    if (adminOverlay) adminOverlay.classList.remove('show');
    
    // Brief pause before entering Phase 1 (Nomination)
    setTimeout(() => {
      startNominationPhase();
    }, 500);
  }, 2000);
}

// ==================== PHASE 1: LEADER NOMINATION (60s Timer) ====================

function startNominationPhase() {
  gameState = 'nomination';
  updateAdminStatusBoard();
  
  selectedNominees = [];
  document.getElementById('nominated-team-list').innerHTML = '<div class="empty-nominee-slot">미편성</div>';
  
  const teamSizes = GAS.getTeamSizes(playerCount);
  const sizeRequired = teamSizes[currentRound - 1];
  
  const leader = players[currentPhaseLeader];
  const isUserLeader = (leader && leader.id === (firebaseMode ? myPlayerId : 0));
  
  document.getElementById('game-status-msg').innerText = `${leader ? leader.name : '대장'}이 운송대 명단(${sizeRequired}명)을 편성 중입니다.`;
  
  // Set 60s timer
  startTimer(60, () => {
    // Timeout nomination callback
    if (isUserLeader) {
      // Auto Nominate randomly
      autoNominateRandomly(sizeRequired);
    } else {
      // Handled by bot timer trigger
    }
  });
  
  // Render buttons/selectors
  if (isUserLeader && !adminLogged) {
    document.getElementById('control-nomination').classList.remove('hidden');
    document.getElementById('req-team-size').innerText = sizeRequired;
    renderNominationSelectorGrid(sizeRequired);
  } else {
    document.getElementById('control-nomination').classList.add('hidden');
    // Bot nomination schedule
    if (!firebaseMode || adminLogged) {
      setTimeout(() => {
        if (gameState === 'nomination') {
          botPerformNomination(sizeRequired);
        }
      }, 4000 + Math.random() * 3000); // 4-7 seconds delay
    }
  }
}

function renderNominationSelectorGrid(sizeRequired) {
  const container = document.getElementById('nomination-selector-grid');
  container.innerHTML = '';
  
  players.forEach(p => {
    const btn = document.createElement('button');
    btn.className = 'nominate-btn';
    btn.id = `nominate-sel-${p.id}`;
    
    const colorObj = COLORS.find(c => c.value === p.color);
    btn.innerHTML = `
      ${getCrewmateSVG(colorObj.primary, colorObj.shadow)}
      <span>${p.name}</span>
    `;
    
    btn.onclick = () => toggleNomineeSelection(p.id, sizeRequired);
    container.appendChild(btn);
  });
}

function toggleNomineeSelection(playerId, sizeRequired) {
  const idx = selectedNominees.indexOf(playerId);
  const btn = document.getElementById(`nominate-sel-${playerId}`);
  
  if (idx > -1) {
    selectedNominees.splice(idx, 1);
    if (btn) btn.classList.remove('selected');
  } else {
    if (selectedNominees.length >= sizeRequired) {
      // Remove first chosen
      const firstId = selectedNominees.shift();
      const firstBtn = document.getElementById(`nominate-sel-${firstId}`);
      if (firstBtn) firstBtn.classList.remove('selected');
    }
    selectedNominees.push(playerId);
    if (btn) btn.classList.add('selected');
  }
  
  // Enable submit button if matches size
  const submitBtn = document.getElementById('nominate-submit-btn');
  submitBtn.disabled = (selectedNominees.length !== sizeRequired);
}

function submitNomination() {
  if (firebaseMode) {
    db.ref('room/selectedNominees').set(selectedNominees);
    db.ref('room/nominationSubmitted').set(true);
    db.ref('room/state').set('voting');
  } else {
    clearInterval(timerInterval);
    document.getElementById('control-nomination').classList.add('hidden');
    
    // Announce nominated team to everyone
    announceNominatedTeam();
  }
}

function autoNominateRandomly(sizeRequired) {
  // Select random players
  const list = [...players].sort(() => 0.5 - Math.random());
  selectedNominees = list.slice(0, sizeRequired).map(p => p.id);
  submitNomination();
}

function botPerformNomination(sizeRequired) {
  const bot = players[currentPhaseLeader];
  let selection = [];
  
  if (bot.alliance === 'zombie') {
    // Zombie bots try to put themselves and 1 other zombie, or blend in
    const zombies = players.filter(p => p.alliance === 'zombie');
    const humans = players.filter(p => p.alliance === 'human');
    
    selection.push(bot.id); // Add self
    
    // Maybe add another zombie if space permits
    if (sizeRequired > 1 && zombies.length > 1) {
      const otherZombie = zombies.find(z => z.id !== bot.id);
      if (Math.random() < 0.5 && otherZombie) {
        selection.push(otherZombie.id);
      }
    }
    
    // Fill the rest with humans
    while (selection.length < sizeRequired) {
      const randHuman = humans[Math.floor(Math.random() * humans.length)];
      if (!selection.includes(randHuman.id)) {
        selection.push(randHuman.id);
      }
    }
  } else {
    // Human bots select team based on trust
    // Merlin (항체보유자) knows who zombies are. If Merlin is leader, Merlin will NEVER select zombies!
    if (bot.role === '항체보유자') {
      const humans = players.filter(p => p.alliance === 'human');
      const shuffledHumans = [...humans].sort(() => 0.5 - Math.random());
      
      // select only humans
      selection = shuffledHumans.slice(0, sizeRequired).map(p => p.id);
    } else {
      // General human bot selects randomly (but prefers self)
      selection.push(bot.id);
      const others = players.filter(p => p.id !== bot.id).sort(() => 0.5 - Math.random());
      for (let i = 0; selection.length < sizeRequired; i++) {
        selection.push(others[i].id);
      }
    }
  }
  
  selectedNominees = selection;
  clearInterval(timerInterval);
  announceNominatedTeam();
}

function announceNominatedTeam() {
  const container = document.getElementById('nominated-team-list');
  container.innerHTML = '';
  
  selectedNominees.forEach(id => {
    const p = players[id];
    const colorObj = COLORS.find(c => c.value === p.color);
    
    const chip = document.createElement('div');
    chip.className = 'nominee-chip';
    chip.innerHTML = `
      ${getCrewmateSVG(colorObj.primary, colorObj.shadow)}
      <span>${p.name}</span>
    `;
    container.appendChild(chip);
  });
  
  // Transition to Phase 2: Voting
  startVotingPhase();
}

// ==================== PHASE 2: TEAM VOTING (30s Timer) ====================

function startVotingPhase() {
  gameState = 'voting';
  updateAdminStatusBoard();
  
  votes = {};
  document.getElementById('vote-submitted-status').innerText = '';
  
  document.getElementById('game-status-msg').innerText = "지명된 운송대 명단에 대한 찬성/반대 투표가 진행 중입니다.";
  
  // Render voting options
  document.getElementById('control-voting').classList.remove('hidden');
  
  // Start 30s timer
  startTimer(30, () => {
    // Timeout voting callback: Auto-votes for unsubmitted
    players.forEach(p => {
      if (votes[p.id] === undefined) {
        if (p.alliance === 'human') {
          votes[p.id] = true; // Human auto-approve
        } else {
          votes[p.id] = false; // Zombie auto-reject
        }
      }
    });
    tallyVotes();
  });
  
  // Bot voting schedule
  if (!firebaseMode || adminLogged) {
    players.forEach(p => {
      if (p.isBot) { // bots
        setTimeout(() => {
          if (gameState === 'voting' && votes[p.id] === undefined) {
            botCastVote(p);
          }
        }, 1000 + Math.random() * 4000); // 1-5 seconds delay
      }
    });
  }
}

function botCastVote(bot) {
  let approve = true;
  
  if (bot.alliance === 'zombie') {
    // Zombie bots approve if at least one zombie is on the team
    const teamZombies = selectedNominees.filter(id => players[id].alliance === 'zombie');
    if (teamZombies.length >= 1) {
      approve = Math.random() < 0.85; // 85% chance to approve if teammate is in
    } else {
      // 5th vote rejection gives immediate win to zombie, so on 5th reject zombies always reject
      if (rejectCount === 4) {
        approve = false;
      } else {
        approve = Math.random() < 0.2; // 20% approve to build trust/confuse
      }
    }
  } else {
    // Human bots
    // Merlin (항체보유자) rejects if there is a zombie on the team
    if (bot.role === '항체보유자') {
      const teamZombies = selectedNominees.filter(id => players[id].alliance === 'zombie');
      approve = (teamZombies.length === 0);
    } else if (bot.role === '총사령관') {
      // Commander knows who Antibody Carrier is, rejects if team leader is Zombie and not verified
      const teamZombies = selectedNominees.filter(id => players[id].alliance === 'zombie');
      // Weighted logic
      approve = teamZombies.length === 0 ? (Math.random() < 0.75) : (Math.random() < 0.2);
    } else {
      // Citizen bot votes based on size and trust
      approve = Math.random() < 0.65;
    }
  }
  
  votes[bot.id] = approve;
  checkAllVotesCast();
}

function castVote(approve) {
  if (firebaseMode) {
    db.ref(`room/votes/${myPlayerId}`).set(approve);
    document.getElementById('control-voting').classList.add('hidden');
    document.getElementById('vote-submitted-status').innerText = `투표 완료: ${approve ? '찬성' : '반대'}을 제출했습니다. 다른 참가자들을 대기 중...`;
  } else {
    votes[0] = approve;
    document.getElementById('control-voting').classList.add('hidden');
    document.getElementById('vote-submitted-status').innerText = `투표 완료: ${approve ? '찬성' : '반대'}을 제출했습니다. 다른 참가자들을 대기 중...`;
    
    checkAllVotesCast();
  }
}

function checkAllVotesCast() {
  const totalVotesCast = Object.keys(votes).length;
  if (totalVotesCast === playerCount) {
    clearInterval(timerInterval);
    tallyVotes();
  }
}

function tallyVotes() {
  document.getElementById('control-voting').classList.add('hidden');
  
  let approves = 0;
  let rejects = 0;
  
  players.forEach(p => {
    if (votes[p.id]) approves++;
    else rejects++;
  });
  
  // Show vote details in logs / admin monitor
  let logText = `라운드 ${currentRound} 투표 결과: 찬성 ${approves}표 / 반대 ${rejects}표. `;
  
  // Over half approves required. E.g. in 5-player game, 3+ approves. In 6-player, 4+ approves.
  // "과반수 찬성(동수 이하는 부결, 과반 찬성 시 가결)"
  const requiredApproves = Math.floor(playerCount / 2) + 1;
  const passed = (approves >= requiredApproves);
  
  const msgText = passed 
    ? `투표는 ${approves}:${rejects}으로 가결되었습니다. 운송대 편성이 완료되었습니다.`
    : `투표는 ${approves}:${rejects}으로 부결되었습니다. 리더가 다음 인물로 넘어갑니다.`;
    
  const statusMsgField = document.getElementById('game-status-msg');
  if (statusMsgField) {
    if (passed) {
      statusMsgField.innerHTML = `<span class="good-text" style="font-weight: bold; text-shadow: 0 0 10px var(--neon-green);">${msgText}</span>`;
    } else {
      statusMsgField.innerHTML = `<span class="bad-text" style="font-weight: bold; text-shadow: 0 0 10px var(--neon-red);">${msgText}</span>`;
    }
  }
  
  if (firebaseMode && adminLogged) {
    db.ref('room/voteResult').set({
      approves: approves,
      rejects: rejects,
      passed: passed,
      rejectCount: passed ? 0 : (rejectCount + 1)
    });
  }
  
  if (passed) {
    logText += `운송대 명단 가결! 임무를 시작합니다.`;
    rejectCount = 0; // reset
    document.getElementById('admin-reject-num').innerText = rejectCount;
    
    // Add logs
    addAdminLog(logText, 'success');
    
    if (firebaseMode && adminLogged) {
      db.ref('room/state').set('voting_result');
    }
    
    // Delay 4 seconds to show centered message
    setTimeout(() => {
      if (!firebaseMode || adminLogged) {
        startMissionDepart();
      }
    }, 4000);
  } else {
    rejectCount++;
    document.getElementById('admin-reject-num').innerText = rejectCount;
    logText += `운송대 명단 부결! (부결 횟수: ${rejectCount}/5). 대장이 교체됩니다.`;
    
    addAdminLog(logText, 'danger');
    
    if (firebaseMode && adminLogged) {
      db.ref('room/state').set('voting_result');
    }
    
    // Delay 4 seconds to show centered message
    setTimeout(() => {
      if (!firebaseMode || adminLogged) {
        if (rejectCount >= 5) {
          // 5 consecutive rejections -> Zombie wins!
          endGame('zombie_rejections');
        } else {
          // Shift leader clockwise
          const nextLeader = (currentPhaseLeader + 1) % playerCount;
          players.forEach((p, idx) => {
            p.isLeader = (idx === nextLeader);
          });
          currentPhaseLeader = nextLeader;
          
          if (firebaseMode) {
            db.ref('room/leaderIdx').set(currentPhaseLeader);
            db.ref('room/nominationSubmitted').set(false);
            db.ref('room/selectedNominees').set([]);
            db.ref('room/votes').remove();
            db.ref('room/state').set('nomination');
          } else {
            const leaderObj = players[nextLeader];
            const colorName = COLORS.find(c => c.value === leaderObj.color).name;
            document.getElementById('game-leader-name').innerText = `${leaderObj.name} (${colorName})`;
            renderAdminMonitor();
            startNominationPhase();
          }
        }
      }
    }, 4000);
  }
}

// ==================== PHASE 3: MISSION ACTION (30s Timer) ====================

function startMissionDepart() {
  gameState = 'mission_depart';
  updateAdminStatusBoard();
  
  if (firebaseMode && adminLogged) {
    db.ref('room/state').set('mission_depart');
    db.ref('room/missionVotes').remove();
    db.ref('room/votes').remove();
  }
  
  // Show truck departs page
  document.getElementById('screen-info-panel').classList.add('hidden');
  document.getElementById('screen-truck-panel').classList.remove('hidden');
  document.getElementById('game-status-msg').innerText = "운송대가 백신 연구소로 출발했습니다!";
  
  // Wait 4 seconds for narrative immersion before showing card buttons
  setTimeout(() => {
    if (!firebaseMode || adminLogged) {
      startMissionActionPhase();
    }
  }, 4000);
}

function startMissionActionPhase() {
  gameState = 'mission_action';
  updateAdminStatusBoard();
  
  if (firebaseMode && adminLogged) {
    db.ref('room/state').set('mission_action');
  }
  
  missionVotes = [];
  document.getElementById('mission-submitted-status').innerText = '';
  
  const isOnTeam = selectedNominees.includes(firebaseMode ? myPlayerId : 0);
  
  if (isOnTeam) {
    document.getElementById('control-mission').classList.remove('hidden');
    
    // Disable "Zombie Sabotage" (좀비 피습) button for Good alignment
    const me = getMyPlayer();
    const isHuman = (me.alliance === 'human');
    
    document.getElementById('mission-fail-btn').disabled = isHuman;
  } else {
    document.getElementById('control-mission').classList.add('hidden');
    document.getElementById('game-status-msg').innerText = "지명된 운송대원들이 백신 수송 카드를 제출하고 있습니다.";
  }
  
  // 30s timer
  startTimer(30, () => {
    // Timeout card submission:
    selectedNominees.forEach(id => {
      // Find if this player already submitted
      const hasSubmitted = missionVotes.some(v => v.playerId === id);
      if (!hasSubmitted) {
        const p = players.find(x => x.id === id);
        if (p) {
          if (p.alliance === 'human') {
            missionVotes.push({ playerId: id, card: true }); // auto success
          } else {
            missionVotes.push({ playerId: id, card: false }); // auto sabotage/fail
          }
        }
      }
    });
    revealMissionCards();
  });
  
  // Bot submissions schedule
  if (!firebaseMode || adminLogged) {
    selectedNominees.forEach(id => {
      const p = players.find(x => x.id === id);
      if (p && p.isBot) { // bots
        setTimeout(() => {
          if (gameState === 'mission_action' && !missionVotes.some(v => v.playerId === id)) {
            botCastMissionCard(p);
          }
        }, 1500 + Math.random() * 3500); // 1.5 - 5 seconds delay
      }
    });
  }
}

function botCastMissionCard(bot) {
  let card = true; // true = Success, false = Fail
  
  if (bot.alliance === 'zombie') {
    // Zombie bots decide whether to sabotage
    // Typically they sabotage, but sometimes they play success to hide identity
    // E.g., if there are multiple zombies on the team, they might coordinate or just 80% fail
    card = (Math.random() < 0.8) ? false : true;
  } else {
    // Human bots always play Success
    card = true;
  }
  
  missionVotes.push({ playerId: bot.id, card: card });
  checkAllMissionCardsSubmitted();
}

function submitMissionCard(success) {
  if (firebaseMode) {
    db.ref(`room/missionVotes/${myPlayerId}`).set(success);
    document.getElementById('control-mission').classList.add('hidden');
    document.getElementById('mission-submitted-status').innerText = `임무 수행 카드 제출 완료: '${success ? '운송 성공' : '좀비 피습'}'을 제출했습니다.`;
  } else {
    missionVotes.push({ playerId: 0, card: success });
    document.getElementById('control-mission').classList.add('hidden');
    document.getElementById('mission-submitted-status').innerText = `임무 수행 카드 제출 완료: '${success ? '운송 성공' : '좀비 피습'}'을 제출했습니다.`;
    
    checkAllMissionCardsSubmitted();
  }
}

function checkAllMissionCardsSubmitted() {
  const requiredCount = selectedNominees.length;
  if (missionVotes.length === requiredCount) {
    clearInterval(timerInterval);
    revealMissionCards();
  }
}

function revealMissionCards() {
  gameState = 'mission_reveal';
  updateAdminStatusBoard();
  
  // Shuffle cards so identity is hidden
  const shuffledVotes = [...missionVotes].sort(() => 0.5 - Math.random());
  
  if (firebaseMode && adminLogged) {
    db.ref('room/revealedCards').set(shuffledVotes.map(v => v.card));
    db.ref('room/state').set('mission_reveal');
  }
  
  document.getElementById('control-mission').classList.add('hidden');
  document.getElementById('screen-truck-panel').classList.add('hidden');
  document.getElementById('screen-card-reveal').classList.remove('hidden');
  document.getElementById('mission-result-text').innerText = '';
  
  const container = document.getElementById('revealed-cards-container');
  container.innerHTML = '';
  
  // Render cards face down first
  shuffledVotes.forEach((v, idx) => {
    const cardDiv = document.createElement('div');
    cardDiv.className = 'reveal-card card-shake';
    cardDiv.innerHTML = `
      <div class="card-face card-back"></div>
      <div class="card-face card-front ${v.card ? 'success' : 'fail'}">${v.card ? '운송 성공' : '좀비 피습'}</div>
    `;
    container.appendChild(cardDiv);
  });
  
  // Card shaking animation for 3 seconds, then flip
  setTimeout(() => {
    // Stop shaking and flip cards
    document.querySelectorAll('.reveal-card').forEach(card => {
      card.classList.remove('card-shake');
      card.classList.add('card-flipped');
    });
    
    // Tally results
    if (!firebaseMode || adminLogged) {
      setTimeout(tallyMissionResults, 1500);
    }
  }, 3000);
}

function tallyMissionResults() {
  const fails = missionVotes.filter(v => !v.card).length;
  const isTwoFailsRequired = GAS.requiresTwoFails(playerCount, currentRound);
  
  let success = false;
  let logText = `[라운드 ${currentRound} 미션 결과] 지명 대원: ${selectedNominees.length}명. `;
  
  if (isTwoFailsRequired) {
    success = (fails < 2);
    logText += `(4라운드 좀비 피습 카드 2장 이상 시 실패 요건). 피습 카드: ${fails}장. `;
  } else {
    success = (fails === 0);
    logText += `피습 카드: ${fails}장. `;
  }
  
  const statusField = document.getElementById('mission-result-text');
  
  if (success) {
    vaccineSuccesses++;
    roundsHistory.push('success');
    if (statusField) statusField.innerHTML = `<span class="good-text">★ 운송 성공! ★</span><br>백신이 무사히 축적되었습니다.`;
    logText += `운송 성공!`;
    addAdminLog(logText, 'success');
  } else {
    vaccineFails++;
    roundsHistory.push('fail');
    if (statusField) statusField.innerHTML = `<span class="bad-text">☠ 좀비 피습! ☠</span><br>백신 혈액 운송이 수포로 돌아갔습니다.`;
    logText += `좀비 피습으로 인한 백신 운송 실패!`;
    addAdminLog(logText, 'danger');
  }
  
  // Update admin Beaker progress bar
  const beakerPercent = Math.min(100, Math.round((vaccineSuccesses / 3) * 100));
  const beakerPercentElem = document.getElementById('beaker-percent');
  if (beakerPercentElem) beakerPercentElem.innerText = beakerPercent;
  
  const liquidTranslate = 180 - (vaccineSuccesses * 60); // 180 -> 120 -> 60 -> 0
  const liquidGroup = document.getElementById('vaccine-liquid-group');
  if (liquidGroup) liquidGroup.style.transform = `translateY(${Math.max(0, liquidTranslate)}px)`;
  
  // Wait 5 seconds on reveal screen before making round transitions
  setTimeout(() => {
    if (!firebaseMode || adminLogged) {
      document.getElementById('screen-card-reveal').classList.add('hidden');
      document.getElementById('screen-info-panel').classList.remove('hidden');
      
      checkGameWinConditions();
    }
  }, 5000);
}

function checkGameWinConditions() {
  if (vaccineSuccesses >= 3) {
    // Human 3 successes -> Sniper Assassin Phase
    startAssassinationPhase();
  } else if (vaccineFails >= 3) {
    // Zombie 3 successes -> Zombie Wins
    endGame('zombie_fails');
  } else {
    // Advance to next round
    currentRound++;
    document.getElementById('admin-round-num').innerText = currentRound;
    document.getElementById('game-round-num').innerText = currentRound;
    
    // Shift leader
    const nextLeader = (currentPhaseLeader + 1) % playerCount;
    players.forEach((p, idx) => {
      p.isLeader = (idx === nextLeader);
    });
    currentPhaseLeader = nextLeader;
    
    if (firebaseMode && adminLogged) {
      db.ref('room/currentRound').set(currentRound);
      db.ref('room/leaderIdx').set(currentPhaseLeader);
      db.ref('room/nominationSubmitted').set(false);
      db.ref('room/selectedNominees').set([]);
      db.ref('room/votes').remove();
      db.ref('room/missionVotes').remove();
      db.ref('room/revealedCards').remove();
      db.ref('room/state').set('nomination');
    } else {
      const leaderObj = players[nextLeader];
      const colorObj = COLORS.find(c => c.value === leaderObj.color);
      document.getElementById('game-leader-name').innerText = `${leaderObj.name} (${colorObj.name})`;
      
      // Update the host dashboard leader display
      const leaderDisplay = document.getElementById('admin-leader-name-display');
      if (leaderDisplay) {
        leaderDisplay.innerText = `${leaderObj.name} (${colorObj.name})`;
        leaderDisplay.style.color = colorObj.primary;
      }
      const avatarPlaceholder = document.getElementById('admin-leader-avatar-placeholder');
      if (avatarPlaceholder) {
        avatarPlaceholder.innerHTML = getCrewmateSVG(colorObj.primary, colorObj.shadow);
      }
      
      renderAdminMonitor();
      startNominationPhase();
    }
  }
}

// ==================== ASSASSINATION PHASE (30s Timer) ====================

function startAssassinationPhase() {
  gameState = 'assassination';
  updateAdminStatusBoard();
  
  if (firebaseMode && adminLogged) {
    db.ref('room/state').set('assassination');
  }
  
  // Find Sniper Zombie
  const sniper = players.find(p => p.role === '저격좀비');
  const sniperColor = sniper ? COLORS.find(c => c.value === sniper.color).name : '알수없음';
  
  const announcementText = "백신 개발이 거의 끝났습니다! 항체보유자가 생존해있기만 한다면 이제 좀비군단을 다시 인류로 바꿀 수 있습니다!";
  const subText = "저격좀비는 이제 정체를 밝히고 항체보유자를 찾아 암살해야 합니다. 그렇지 못하면 좀비군단의 패배입니다.";
  
  document.getElementById('game-status-msg').innerText = "백신 완성이 코앞입니다! 저격좀비의 암살 대응 중...";
  
  // Display briefing alert on all screens
  alertOnParticipantScreen(announcementText, subText, sniper ? sniper.name : '저격좀비', sniperColor);
  
  // Trigger 30s timer
  startTimer(30, () => {
    // Timeout assassination callback: auto fail for zombies
    finalizeAssassination(false);
  });
  
  // Determine if user is Sniper
  const isUserSniper = (sniper && sniper.id === (firebaseMode ? myPlayerId : 0));
  
  if (isUserSniper && !adminLogged) {
    // Show target selection panel to user
    setTimeout(() => {
      document.getElementById('control-assassination').classList.remove('hidden');
      renderAssassinationTargetGrid();
    }, 4000);
  } else {
    document.getElementById('control-assassination').classList.add('hidden');
    
    if (!firebaseMode || adminLogged) {
      // Bot sniper automatically shoots after 7 seconds
      setTimeout(() => {
        if (gameState === 'assassination') {
          botPerformAssassination();
        }
      }, 7000);
    }
  }
}

function alertOnParticipantScreen(mainMsg, subMsg, sniperName, sniperColor) {
  // Show temporary briefing overlays
  const screenMsg = document.getElementById('game-status-msg');
  screenMsg.innerHTML = `<span class="good-text">${mainMsg}</span><br><br>${subMsg}<br><br><span class="bad-text">저격좀비 정체: ${sniperName} (${sniperColor})</span>`;
}

function renderAssassinationTargetGrid() {
  const container = document.getElementById('assassination-target-grid');
  container.innerHTML = '';
  
  // Targets are other human players (Antibody Carrier, Commander, Resistance)
  const targets = players.filter(p => p.id !== (firebaseMode ? myPlayerId : 0) && p.alliance === 'human'); // exclude self sniper, include human alliance
  
  targets.forEach(p => {
    const btn = document.createElement('button');
    btn.className = 'nominate-btn';
    btn.id = `assassinate-tar-${p.id}`;
    
    const colorObj = COLORS.find(c => c.value === p.color);
    btn.innerHTML = `
      ${getCrewmateSVG(colorObj.primary, colorObj.shadow)}
      <span>${p.name}</span>
    `;
    
    btn.onclick = () => selectAssassinationTarget(p.id);
    container.appendChild(btn);
  });
}

function selectAssassinationTarget(playerId) {
  userAssassinationTarget = playerId;
  
  // UI highlight
  players.forEach(p => {
    const btn = document.getElementById(`assassinate-tar-${p.id}`);
    if (btn) {
      if (p.id === playerId) btn.classList.add('selected');
      else btn.classList.remove('selected');
    }
  });
  
  document.getElementById('assassinate-submit-btn').disabled = false;
}

function submitAssassination() {
  if (firebaseMode) {
    db.ref('room/assassinationTarget').set(userAssassinationTarget);
    document.getElementById('control-assassination').classList.add('hidden');
  } else {
    clearInterval(timerInterval);
    document.getElementById('control-assassination').classList.add('hidden');
    
    const targetPlayer = players.find(p => p.id === userAssassinationTarget);
    const isCorrect = targetPlayer && (targetPlayer.role === '항체보유자');
    
    finalizeAssassination(isCorrect);
  }
}

function botPerformAssassination() {
  clearInterval(timerInterval);
  
  // Bot shoots
  // Standard AI chooses Merlin (항체보유자) with a 70% probability if they are smart
  const merlin = players.find(p => p.role === '항체보유자');
  const humans = players.filter(p => p.alliance === 'human');
  
  let targetId = -1;
  if (Math.random() < 0.7) {
    targetId = merlin.id;
  } else {
    // Choose random human
    const otherHumans = humans.filter(h => h.role !== '저격좀비');
    targetId = otherHumans[Math.floor(Math.random() * otherHumans.length)].id;
  }
  
  const isCorrect = (targetId === merlin.id);
  finalizeAssassination(isCorrect);
}

function finalizeAssassination(isCorrect) {
  if (isCorrect) {
    // Sniper succeeded -> Zombie wins!
    endGame('zombie_assassinated');
  } else {
    // Sniper failed -> Humans win!
    endGame('human_survived');
  }
}

// ==================== GAME OVER END STATES ====================

function endGame(reason) {
  gameState = 'ended';
  clearInterval(timerInterval);
  updateAdminStatusBoard();
  
  if (firebaseMode && adminLogged) {
    db.ref('room/endGameData').set({
      reason: reason
    });
    db.ref('room/state').set('ended');
  }
  
  const title = document.getElementById('final-verdict-title');
  const desc = document.getElementById('final-summary-desc');
  const finalContainer = document.getElementById('revealed-final-players');
  finalContainer.innerHTML = '';
  
  let winnerAlliance = '';
  
  if (reason === 'zombie_assassinated') {
    winnerAlliance = 'zombie';
    title.innerText = "좀비군단 승리";
    title.style.color = 'var(--neon-red)';
    desc.innerText = "저격좀비의 암살이 성공했습니다! 항체보유자가 사망했습니다. 백신의 추가 제작은 이제 불가능합니다.";
  } 
  else if (reason === 'human_survived') {
    winnerAlliance = 'human';
    title.innerText = "인류진영 승리";
    title.style.color = 'var(--neon-cyan)';
    desc.innerText = "항체보유자의 혈액으로 좀비를 정화시킬 백신이 무한정 생성됩니다. 좀비군단의 수가 압도적으로 줄어듭니다.";
  } 
  else if (reason === 'zombie_fails') {
    winnerAlliance = 'zombie';
    title.innerText = "좀비군단 승리";
    title.style.color = 'var(--neon-red)';
    desc.innerText = "백신연구소로 혈액을 운송할 차량이 모두 파괴되었습니다. 백신 개발은 영영 불가능해졌습니다.";
  } 
  else if (reason === 'zombie_rejections') {
    winnerAlliance = 'zombie';
    title.innerText = "좀비군단 승리";
    title.style.color = 'var(--neon-red)';
    desc.innerText = "운송 작전이 너무 지연되어버렸습니다. 좀비군단이 도시로 돌격해옵니다. 막을 수 없습니다.";
  }
  
  const targetAlliance = (winnerAlliance === 'human') ? 'human' : 'zombie';
  const teamTitle = document.getElementById('reveal-team-title');
  teamTitle.innerText = (targetAlliance === 'human') 
    ? "최후의 인류 진영 명단 공개" 
    : "좀비군단 진영 명단 공개";
  
  const revealedPlayers = players.filter(p => p.alliance === targetAlliance);
  
  revealedPlayers.forEach(p => {
    const colorObj = COLORS.find(c => c.value === p.color);
    const chip = document.createElement('div');
    chip.className = 'final-chip';
    chip.innerHTML = `
      ${getCrewmateSVG(colorObj.primary, colorObj.shadow)}
      <span><strong>${p.name}</strong> (${p.role})</span>
    `;
    finalContainer.appendChild(chip);
  });
  
  // Show end game modal overlay on all views
  const overlay = document.getElementById('game-over-overlay');
  overlay.classList.remove('hidden');
  if (winnerAlliance === 'human') {
    overlay.classList.add('win-human');
    overlay.classList.remove('win-zombie');
  } else {
    overlay.classList.add('win-zombie');
    overlay.classList.remove('win-human');
  }
  
  // Add log entry
  const winnerText = (winnerAlliance === 'human') ? '최후의 인류 진영 승리!' : '좀비군단 진영 승리!';
  addAdminLog(`[게임 종료] ${winnerText} (사유: ${desc.innerText})`, (winnerAlliance === 'human') ? 'success' : 'danger');
}

// ==================== TIMER UTILITIES ====================

function startTimer(durationSeconds, timeoutCallback) {
  clearInterval(timerInterval);
  timerSec = durationSeconds;
  updateTimerDisplay();
  
  if (firebaseMode) {
    if (adminLogged) {
      db.ref('room/timerSec').set(timerSec);
      timerInterval = setInterval(() => {
        timerSec--;
        updateTimerDisplay();
        db.ref('room/timerSec').set(timerSec);
        
        if (timerSec <= 0) {
          clearInterval(timerInterval);
          timeoutCallback();
        }
      }, 1000);
    }
  } else {
    // Local mode
    timerInterval = setInterval(() => {
      timerSec--;
      updateTimerDisplay();
      
      if (timerSec <= 0) {
        clearInterval(timerInterval);
        timeoutCallback();
      }
    }, 1000);
  }
}

function updateTimerDisplay() {
  const display = document.getElementById('game-timer');
  const formatted = String(timerSec).padStart(2, '0');
  display.innerText = formatted;
  
  // Visual pulse on red alert
  if (timerSec <= 5) {
    display.style.color = 'var(--neon-red)';
    display.style.textShadow = '0 0 15px var(--neon-red)';
  } else {
    display.style.color = '';
    display.style.textShadow = '';
  }
}

// ==================== ROLE REVEAL ON HOLD (Hold-to-Reveal) ====================

let holdTimer = null;

function startRevealRole(e) {
  if (e) e.preventDefault(); // prevent zoom on touch
  if (players.length === 0) return;
  
  const user = getMyPlayer();
  
  // Set role details
  document.getElementById('revealed-role-name').innerText = user.role;
  
  const allianceDiv = document.getElementById('revealed-role-alliance');
  allianceDiv.innerText = user.alliance === 'human' ? '최후의 인류 진영' : '좀비군단 진영';
  allianceDiv.className = `role-alliance-tag ${user.alliance}`;
  
  // Retrieve description based on user's role
  document.getElementById('revealed-role-desc').innerText = getRoleDescription(user.role);
  
  // Reveal secret details based on requests
  const secretsDiv = document.getElementById('revealed-role-secrets');
  secretsDiv.innerHTML = '';
  
  const secretsHeader = document.createElement('strong');
  secretsHeader.innerText = "🕵️ 기밀 인텔 정보:";
  secretsDiv.appendChild(secretsHeader);
  
  let showSecrets = false;
  
  if (user.role === '항체보유자') {
    showSecrets = true;
    // Sees zombies except 은신좀비 (Stealth Zombie)
    const zombiesToReveal = players.filter(p => p.alliance === 'zombie' && p.role !== '은신좀비');
    if (zombiesToReveal.length > 0) {
      zombiesToReveal.forEach(z => {
        const colorObj = COLORS.find(c => c.value === z.color);
        const item = document.createElement('div');
        item.className = 'secret-item';
        item.innerHTML = `
          ${getCrewmateSVG(colorObj.primary, colorObj.shadow)}
          <span>좀비 의심자: ${z.name}</span>
        `;
        secretsDiv.appendChild(item);
      });
    } else {
      secretsDiv.innerHTML += "<span>감지된 좀비가 없습니다.</span>";
    }
  } 
  else if (user.role === '총사령관') {
    showSecrets = true;
    // Sees real Merlin (항체보유자) and Disguised Zombie (위장좀비) as candidates
    const candidates = players.filter(p => p.role === '항체보유자' || p.role === '위장좀비');
    candidates.forEach(c => {
      const colorObj = COLORS.find(c => c.value === c.color);
      const item = document.createElement('div');
      item.className = 'secret-item';
      item.innerHTML = `
        ${getCrewmateSVG(colorObj.primary, colorObj.shadow)}
        <span>항체보유자 후보: ${c.name}</span>
      `;
      secretsDiv.appendChild(item);
    });
  } 
  else if (user.alliance === 'zombie') {
    showSecrets = true;
    // All zombies see fellow zombies
    const fellowZombies = players.filter(p => p.alliance === 'zombie');
    fellowZombies.forEach(z => {
      const colorObj = COLORS.find(c => c.value === z.color);
      const item = document.createElement('div');
      item.className = 'secret-item';
      item.innerHTML = `
        ${getCrewmateSVG(colorObj.primary, colorObj.shadow)}
        <span>좀비군단 동료: ${z.name}</span>
      `;
      secretsDiv.appendChild(item);
    });
  }
  
  if (!showSecrets) {
    secretsDiv.innerHTML = "<span>(추가적인 보안 정보가 제공되지 않는 일반 저항군 신분입니다)</span>";
  }
  
  // Show popup immediately
  document.getElementById('role-reveal-overlay').classList.remove('hidden');
}

function endRevealRole(e) {
  if (e) e.preventDefault();
  document.getElementById('role-reveal-overlay').classList.add('hidden');
}

function getRoleDescription(role) {
  const descriptions = {
    '항체보유자': "당신의 혈액이 인류를 좀비 바이러스로부터 되돌릴 핵심입니다. 좀비 의심 대상을 탐색하고 신중히 리더를 지원하되, 자신의 정체를 끝까지 좀비에게 숨기십시오.",
    '총사령관': "당신은 항체보유자 후보 2명을 확인하였습니다. 둘 중 한 명은 위장좀비입니다. 진짜 항체보유자를 파악해 그의 지휘를 유도하고 그를 저격 위협으로부터 경호해야 합니다.",
    '저항군': "당신은 인류의 멸망을 막기 위해 징집되었습니다. 특수 능력은 없으나, 운송 작전에 좀비가 투입되는 것을 신중하게 투표하여 무사히 3회 성공을 견인해야 합니다.",
    '저격좀비': "인류가 3회 성공하더라도 실망하지 마십시오. 게임 종료 시 마지막 투표 전에 진짜 항체보유자를 맞추어 암살을 성공하면 전세를 뒤집고 좀비 군단이 역전 승리합니다.",
    '위장좀비': "당신은 총사령관에게 진짜 항체보유자인 것처럼 위장되어 비춰집니다. 총사령관을 교란해 그가 당신을 신뢰하게 만들고, 운송대에 은밀히 좀비를 밀어 넣으십시오.",
    '은신좀비': "당신은 항체보유자의 백신 감지 레이더에 포착되지 않는 은밀함을 갖췄습니다. 항체보유자가 당신을 인류라고 착각해 안심하고 운송대에 태우게 유인하십시오.",
    '무지성좀비': "일반 좀비 대원입니다. 인류의 멸종을 목표로 하여 동료 좀비들의 공작에 협력하고, 원정대에 잡혀 들어가 피습 카드를 성공적으로 찔러 넣으십시오."
  };
  return descriptions[role] || "";
}

// ==================== HOST / ADMIN INTERACTION ====================

function renderAdminMonitor() {
  const container = document.getElementById('admin-monitor-list');
  container.innerHTML = '';
  
  players.forEach(p => {
    const row = document.createElement('tr');
    
    // Status dot
    const statusDot = p.isOnline 
      ? '<span class="status-indicator status-online"></span>온라인' 
      : '<span class="status-indicator status-offline"></span>오프라인';
      
    const colorObj = COLORS.find(c => c.value === p.color);
    
    // SVG and name
    const charDisplay = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <div style="width: 24px; height: 28px;">
          ${getCrewmateSVG(colorObj.primary, colorObj.shadow)}
        </div>
        <span>${colorObj.name}</span>
      </div>
    `;
    
    // Leader tag
    const nameDisplay = p.isLeader 
      ? `<strong style="color: var(--neon-cyan)">👑 ${p.name}</strong>` 
      : p.name;
      
    // Cheat or admin displays the actual role (masked by default as 🔒 기밀 unless cheatMode is on)
    let actualRole = p.role;
    let actualAlliance = p.alliance;
    if (firebaseMode && adminLogged && adminAssignedRoles[p.id]) {
      actualRole = adminAssignedRoles[p.id].role;
      actualAlliance = adminAssignedRoles[p.id].alliance;
    }
    
    const roleDisplay = cheatMode 
      ? `<span class="${actualAlliance === 'human' ? 'good-text' : 'bad-text'}">${actualRole}</span>`
      : `<span style="color: var(--text-muted);">🔒 기밀</span>`;
    
    row.innerHTML = `
      <td>${nameDisplay}</td>
      <td>${charDisplay}</td>
      <td>${statusDot}</td>
      <td>${roleDisplay}</td>
    `;
    container.appendChild(row);
  });
}

function updateAdminStatusBoard() {
  const board = document.getElementById('admin-status-board');
  const gameMsg = document.getElementById('game-status-msg');
  
  switch(gameState) {
    case 'setup':
      board.innerText = '참가자가 역할 확인중';
      gameMsg.innerText = '로비에서 캐릭터를 고르고 대기하십시오.';
      break;
    case 'waiting_start':
      board.innerText = '참가자가 역할 확인중';
      gameMsg.innerText = '대기 중... 관리자가 게임을 시작해야 합니다.';
      break;
    case 'role_briefing':
      board.innerText = '참가자가 역할 확인중';
      gameMsg.innerText = '세계관 설명 및 역할군 확인 연출 재생 중...';
      break;
    case 'leader_spinning':
      board.innerText = '운송대장이 운송대 인원 선택중';
      gameMsg.innerText = '대장 룰렛이 돌고 있습니다.';
      break;
    case 'nomination':
      board.innerText = '운송대장이 운송대 인원 선택중';
      break;
    case 'voting':
      board.innerText = '운송대 명단 투표중';
      break;
    case 'mission_depart':
    case 'mission_action':
      board.innerText = '운송 성공 여부 투표중';
      break;
    case 'mission_reveal':
      board.innerText = '운송 성공 여부 투표중';
      gameMsg.innerText = '운송 카드 확인 중...';
      break;
    case 'assassination':
      board.innerText = '운송 성공 여부 투표중'; // Blinking during assassination too
      break;
    case 'ended':
      board.innerText = '게임 종료';
      gameMsg.innerText = '작전이 종료되었습니다.';
      break;
  }
}

function adminPauseGame() {
  // Pause timers
  clearInterval(timerInterval);
  document.getElementById('admin-start-btn').disabled = false;
  document.getElementById('admin-stop-btn').disabled = true;
  addAdminLog("게임 시뮬레이션이 호스트에 의해 일시정지되었습니다.", 'warning');
}

function adminResetGame() {
  // Clear modal overlay
  const overlay = document.getElementById('game-over-overlay');
  overlay.classList.add('hidden');
  overlay.classList.remove('win-human', 'win-zombie');
  
  // Clear timers
  clearInterval(timerInterval);
  document.getElementById('game-timer').innerText = '--';
  
  // Reset all states
  gameState = 'setup';
  currentRound = 1;
  rejectCount = 0;
  vaccineSuccesses = 0;
  vaccineFails = 0;
  roundsHistory = [];
  players = [];
  userSelectedColor = '';
  selectedNominees = [];
  votes = {};
  missionVotes = [];
  adminAssignedRoles = {};
  
  if (firebaseMode && adminLogged) {
    db.ref('room').set({
      state: 'setup',
      playerCount: playerCount
    });
  }
  
  // Reset Beaker
  document.getElementById('beaker-percent').innerText = '0';
  document.getElementById('vaccine-liquid-group').style.transform = 'translateY(180px)';
  
  // Reset UI components
  document.getElementById('admin-round-num').innerText = '1';
  document.getElementById('admin-reject-num').innerText = '0';
  document.getElementById('game-round-num').innerText = '1';
  document.getElementById('game-leader-name').innerText = '--';
  document.getElementById('nominated-team-list').innerHTML = '<div class="empty-nominee-slot">미편성</div>';
  
  // Reset admin leader display
  const leaderDisplay = document.getElementById('admin-leader-name-display');
  if (leaderDisplay) {
    leaderDisplay.innerText = '-- 대기 중 --';
    leaderDisplay.style.color = '';
  }
  const avatarPlaceholder = document.getElementById('admin-leader-avatar-placeholder');
  if (avatarPlaceholder) {
    avatarPlaceholder.innerHTML = '';
  }
  
  // Hide overlays
  const playerOverlay = document.getElementById('player-roulette-overlay');
  const adminOverlay = document.getElementById('admin-roulette-overlay');
  if (playerOverlay) playerOverlay.classList.remove('show');
  if (adminOverlay) adminOverlay.classList.remove('show');
  document.getElementById('admin-intro-screen').classList.add('hidden');
  document.getElementById('player-intro-screen').classList.add('hidden');
  
  document.getElementById('control-nomination').classList.add('hidden');
  document.getElementById('control-voting').classList.add('hidden');
  document.getElementById('control-mission').classList.add('hidden');
  document.getElementById('control-assassination').classList.add('hidden');
  document.getElementById('screen-card-reveal').classList.add('hidden');
  document.getElementById('screen-truck-panel').classList.add('hidden');
  document.getElementById('screen-info-panel').classList.remove('hidden');
  
  document.getElementById('admin-start-btn').disabled = false;
  document.getElementById('admin-stop-btn').disabled = true;
  
  // Switch to lobby
  switchView('lobby');
  initLobbyGrid();
  
  // Reset log console
  clearAdminLogs();
  addAdminLog("게임이 리셋되었습니다. 신규 매치를 구성해 주십시오.", 'warning');
}

// ==================== ADMIN LOGGER ====================

function addAdminLog(text, type = '') {
  console.log(`[LOG] ${text}`);
  
  const time = new Date().toLocaleTimeString();
  
  if (firebaseMode) {
    // Only host registers logs to prevent duplication
    if (adminLogged) {
      db.ref('room/logs').push({
        time: time,
        text: text,
        type: type
      });
    }
  } else {
    // Local fallback
    let logConsole = document.getElementById('admin-log-console');
    if (!logConsole) {
      const parent = document.querySelector('.admin-main');
      if (parent) {
        const consoleCard = document.createElement('div');
        consoleCard.className = 'admin-card';
        consoleCard.style.marginTop = 'auto';
        consoleCard.style.maxHeight = '140px';
        consoleCard.style.display = 'flex';
        consoleCard.style.flexDirection = 'column';
        consoleCard.innerHTML = `
          <h3 style="font-size: 0.85rem;">📝 작전 활동 로그</h3>
          <div id="admin-log-console" style="overflow-y:auto; flex:1; font-family:'Courier New', monospace; font-size:0.75rem; color:#a0aec0; line-height:1.4; display:flex; flex-direction:column; gap:4px;"></div>
        `;
        parent.appendChild(consoleCard);
        logConsole = document.getElementById('admin-log-console');
      }
    }
    
    if (logConsole) {
      const logItem = document.createElement('div');
      if (type === 'success') logItem.style.color = 'var(--neon-green)';
      else if (type === 'danger') logItem.style.color = 'var(--neon-red)';
      else if (type === 'warning') logItem.style.color = '#ffb100';
      
      logItem.innerText = `[${time}] ${text}`;
      logConsole.appendChild(logItem);
      logConsole.scrollTop = logConsole.scrollHeight;
    }
  }
}

function clearAdminLogs() {
  const logConsole = document.getElementById('admin-log-console');
  if (logConsole) logConsole.innerHTML = '';
}

// ==================== ROULETTE CANVAS RENDERING ====================

function drawRoulette(angle) {
  const canvases = [
    document.getElementById('roulette-canvas-player'),
    document.getElementById('roulette-canvas-admin')
  ];
  
  canvases.forEach(canvas => {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    const numSlices = players.length;
    if (numSlices === 0) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#222';
      ctx.beginPath();
      ctx.arc(110, 110, 90, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    
    const sliceAngle = (2 * Math.PI) / numSlices;
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = centerX - 10;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < numSlices; i++) {
      const startAngle = i * sliceAngle + angle;
      const endAngle = startAngle + sliceAngle;
      const player = players[i];
      const colorObj = COLORS.find(c => c.value === player.color);

      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, radius, startAngle, endAngle);
      ctx.closePath();

      ctx.fillStyle = colorObj ? colorObj.primary : '#333';
      ctx.fill();

      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#0d0e12';
      ctx.stroke();

      // Text labels
      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate(startAngle + sliceAngle / 2);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 9px Orbitron, sans-serif';
      ctx.textAlign = 'right';
      
      const label = player.name.substring(0, 7);
      ctx.fillText(label, radius - 15, 3);
      ctx.restore();
    }

    // Draw inner node
    ctx.beginPath();
    ctx.arc(centerX, centerY, 18, 0, 2 * Math.PI);
    ctx.fillStyle = '#15171e';
    ctx.strokeStyle = 'var(--neon-cyan)';
    ctx.lineWidth = 2.5;
    ctx.fill();
    ctx.stroke();
  });
}

// ==================== DEBUG TEST CONTROL PANEL ACTIONS ====================

function updatePlayerCountLabel(val) {
  document.getElementById('player-count-val').innerText = `${val}명`;
}

function applyTestPlayerCount() {
  const val = parseInt(document.getElementById('test-player-count').value);
  playerCount = val;
  document.getElementById('setup-player-count').innerText = val;
  
  addAdminLog(`테스트 제어: 인원수 설정 변경 -> ${val}인 모드`, 'warning');
  
  if (gameState !== 'setup') {
    // Force re-setup and restart
    adminResetGame();
    alert(`인원이 ${val}명으로 설정되었습니다. 대기실에서 시작을 다시 진행해 주십시오.`);
  } else {
    // If in setup/lobby, reserve colors again
    if (userSelectedColor) {
      selectLobbyColor(userSelectedColor);
    }
  }
}

function skipTimer() {
  if (timerInterval) {
    timerSec = 0;
    updateTimerDisplay();
    addAdminLog("테스트 제어: 현재 진행 중인 타이머를 강제 만료(0초)시켰습니다.", 'warning');
    // The timer callback will execute immediately in its next tick
  } else {
    alert('작동 중인 타이머가 없습니다.');
  }
}

function forceSetUserRole() {
  if (players.length === 0) {
    alert('게임이 아직 시작되지 않았습니다. 플레이어가 등록된 후 적용할 수 있습니다.');
    return;
  }
  
  const selectedRole = document.getElementById('test-role-select').value;
  const previousRole = getMyPlayer().role;
  
  const me = getMyPlayer();
  me.role = selectedRole;
  me.alliance = getAlliance(selectedRole);
  
  // Re-render monitors
  renderAdminMonitor();
  
  addAdminLog(`테스트 제어: 유저 역할 강제 변경 [${previousRole} -> ${selectedRole}]`, 'warning');
  alert(`당신의 비밀 역할이 [${selectedRole}]으로 변경되었습니다. 아이콘을 Hold해 확인해보십시오.`);
}

function forceVoteResult(approve) {
  if (gameState !== 'voting') {
    alert("투표 진행 단계('운송대 명단 투표중')에서만 투표 결과를 강제 결정할 수 있습니다.");
    return;
  }
  
  addAdminLog(`테스트 제어: 투표 가결 결과를 강제 조작했습니다 -> [${approve ? '가결' : '부결'}]`, 'warning');
  
  // Fill all votes with forced result
  players.forEach(p => {
    votes[p.id] = approve;
  });
  
  clearInterval(timerInterval);
  tallyVotes();
}

function forceMissionResult(success) {
  if (gameState !== 'mission_action') {
    alert("임무 카드 제출 단계('운송 성공 여부 투표중')에서만 카드 제출 결과를 강제할 수 있습니다.");
    return;
  }
  
  addAdminLog(`테스트 제어: 미션 카드 결과를 강제 조작했습니다 -> [${success ? '모두 성공' : '피습 1장 포함'}]`, 'warning');
  
  missionVotes = [];
  selectedNominees.forEach((id, idx) => {
    // If success, all true. If fail, make first fail, rest true.
    if (success) {
      missionVotes.push({ playerId: id, card: true });
    } else {
      missionVotes.push({ playerId: id, card: (idx !== 0) ? true : false });
    }
  });
  
  clearInterval(timerInterval);
  revealMissionCards();
}

function jumpToScenario(scenario) {
  if (players.length === 0) {
    // Setup standard 5-player game if empty
    userSelectedColor = 'red';
    setupPlayers();
  }
  
  // Hide current panels
  document.getElementById('player-intro-screen').style.display = 'none';
  document.getElementById('player-game-screen').classList.remove('hidden');
  document.getElementById('screen-info-panel').classList.remove('hidden');
  document.getElementById('screen-card-reveal').classList.add('hidden');
  document.getElementById('screen-truck-panel').classList.add('hidden');
  document.getElementById('control-nomination').classList.add('hidden');
  document.getElementById('control-voting').classList.add('hidden');
  document.getElementById('control-mission').classList.add('hidden');
  document.getElementById('control-assassination').classList.add('hidden');
  
  switchView('player');
  
  if (scenario === 'assassination') {
    addAdminLog("테스트 제어: 인류 3승 상황 강제 워프. 저격암살 시퀀스를 시작합니다.", 'warning');
    vaccineSuccesses = 3;
    startAssassinationPhase();
  } 
  else if (scenario === '3fails') {
    addAdminLog("테스트 제어: 좀비 3피습 강제 워프. 차량 파괴 게임 오버.", 'warning');
    vaccineFails = 3;
    endGame('zombie_fails');
  } 
  else if (scenario === '5rejects') {
    addAdminLog("테스트 제어: 찬반 5회 연속 부결 강제 워프. 피습 게임 오버.", 'warning');
    rejectCount = 5;
    endGame('zombie_rejections');
  }
}

function toggleCheatMode(enabled) {
  cheatMode = enabled;
  
  // Update sidebar elements or table rendering to reveal roles on player screen
  const sidebarTitle = document.querySelector('.rules-header');
  if (sidebarTitle) {
    if (enabled) {
      sidebarTitle.innerHTML = '📜 임무 명세 <span style="color:var(--neon-purple); font-size:0.75rem;">(치트 활성: 역할 보임)</span>';
      revealAllRolesInSidebar();
    } else {
      sidebarTitle.innerHTML = '📜 임무 명세 및 역할 정보';
      // Reset sidebar content to rules
      const scrollBody = document.querySelector('.rules-scroll-body');
    }
  }
  
  renderAdminMonitor();
  addAdminLog(`테스트 제어: 치트(역할군 상시 투시) 모드 -> [${enabled ? 'ON' : 'OFF'}]`, 'warning');
}

function revealAllRolesInSidebar() {
  if (players.length === 0) return;
  
  // Inject player roster roles at the top of the rules sidebar
  const scrollBody = document.querySelector('.rules-scroll-body');
  
  // Find or create cheat div
  let cheatDiv = document.getElementById('cheat-info-box');
  if (!cheatDiv) {
    cheatDiv = document.createElement('div');
    cheatDiv.id = 'cheat-info-box';
    cheatDiv.style.background = 'rgba(189,0,255,0.05)';
    cheatDiv.style.border = '1px solid var(--neon-purple)';
    cheatDiv.style.padding = '10px';
    cheatDiv.style.borderRadius = '6px';
    cheatDiv.style.marginBottom = '15px';
    scrollBody.insertBefore(cheatDiv, scrollBody.firstChild);
  }
  
  cheatDiv.innerHTML = '<strong style="color:var(--neon-purple); display:block; margin-bottom:8px;">👥 전체 역할 투시 (Cheat)</strong>';
  players.forEach(p => {
    const colorObj = COLORS.find(c => c.value === p.color);
    const item = document.createElement('div');
    item.style.display = 'flex';
    item.style.alignItems = 'center';
    item.style.justifyContent = 'space-between';
    item.style.fontSize = '0.8rem';
    item.style.marginTop = '4px';
    
    const isUser = p.id === 0 ? " (나)" : "";
    item.innerHTML = `
      <span style="color:${colorObj.primary}">${p.name}${isUser}</span>
      <span class="${p.alliance === 'human' ? 'good-text' : 'bad-text'}">${p.role}</span>
    `;
    cheatDiv.appendChild(item);
  });
}

// ==================== ON PAGE LOAD INITIALIZATION ====================

// ==================== ON PAGE LOAD INITIALIZATION ====================

window.onload = function() {
  initFirebase();
};

// ==================== FIREBASE REALTIME MULTIPLAYER SYNC ENGINE ====================

function initFirebase() {
  fetch('firebase-config.json')
    .then(response => {
      if (!response.ok) throw new Error("Config not found");
      return response.json();
    })
    .then(config => {
      if (config.apiKey === "YOUR_API_KEY") {
        console.warn("firebase-config.json contains placeholder values. Falling back to local offline mode.");
        firebaseMode = false;
        initLocalMode();
        return;
      }
      firebase.initializeApp(config);
      db = firebase.database();
      firebaseMode = true;
      
      firebase.auth().signInAnonymously()
        .then(userCredential => {
          myPlayerId = userCredential.user.uid;
          console.log("Firebase Authenticated anonymously. myPlayerId:", myPlayerId);
          setupFirebaseListeners();
          initLobbyGrid();
        })
        .catch(err => {
          console.error("Firebase Auth failed, falling back to local mode:", err);
          firebaseMode = false;
          initLocalMode();
        });
    })
    .catch(err => {
      console.warn("Firebase config load failed. Running in Local Offline Mode.", err);
      firebaseMode = false;
      initLocalMode();
    });
}

function initLocalMode() {
  myPlayerId = '0';
  firebaseMode = false;
  initLobbyGrid();
  drawRoulette(0);
}

// Admin helper to fill empty slots with bots
function adminFillWithBots() {
  if (!firebaseMode || !adminLogged) return;
  
  db.ref('room/players').once('value', snapshot => {
    let currentPlayers = {};
    if (snapshot.exists()) {
      currentPlayers = snapshot.val();
    }
    
    const count = Object.keys(currentPlayers).length;
    if (count >= playerCount) {
      alert("이미 설정된 인원만큼 대기실이 꽉 찼습니다.");
      return;
    }
    
    // Determine which colors are already taken
    const takenColors = Object.values(currentPlayers).map(p => p.color);
    const availableColors = COLORS.filter(c => !takenColors.includes(c.value)).sort(() => 0.5 - Math.random());
    
    const fillCount = playerCount - count;
    for (let i = 0; i < fillCount; i++) {
      const botId = `bot_${Math.random().toString(36).substr(2, 9)}`;
      const botColor = availableColors[i].value;
      const botName = `AI_${availableColors[i].name} (${count + i + 1}번)`;
      
      db.ref(`room/players/${botId}`).set({
        id: botId,
        name: botName,
        color: botColor,
        isLeader: false,
        isOnline: true,
        isBot: true
      });
    }
    
    addAdminLog(`관리자가 빈자리에 ${fillCount}명의 봇을 추가했습니다.`, 'info');
  });
}

function updateLobbyGridFromFirebase() {
  if (!firebaseMode) return;
  
  db.ref('room/players').once('value', snapshot => {
    const list = [];
    if (snapshot.exists()) {
      Object.values(snapshot.val()).forEach(p => list.push(p));
    }
    
    // 만약 내가 로컬에서 임시 선택한 색상이 이미 다른 사람에 의해 등록되었다면 로컬 선택 해제
    if (userSelectedColor) {
      const chosenByOther = list.find(p => p.color === userSelectedColor && p.id !== myPlayerId);
      if (chosenByOther) {
        userSelectedColor = '';
      }
    }
    
    COLORS.forEach(color => {
      const card = document.getElementById(`char-card-${color.value}`);
      if (card) {
        card.classList.remove('selected', 'disabled');
        
        // Is chosen by someone else?
        const chosenByOther = list.find(p => p.color === color.value && p.id !== myPlayerId);
        if (chosenByOther) {
          card.classList.add('disabled');
        }
        
        // Is chosen by me?
        const chosenByMe = list.find(p => p.color === color.value && p.id === myPlayerId);
        if (chosenByMe || (userSelectedColor === color.value && !chosenByOther)) {
          card.classList.add('selected');
        }
      }
    });
  });
}

function setupFirebaseListeners() {
  if (!firebaseMode) return;
  
  // Listen to playerCount
  db.ref('room/playerCount').on('value', snapshot => {
    if (snapshot.exists()) {
      playerCount = snapshot.val();
      document.getElementById('setup-player-count').innerText = playerCount;
      document.getElementById('test-player-count').value = playerCount;
      document.getElementById('player-count-val').innerText = `${playerCount}명`;
    }
  });
  
  // Listen to players list
  db.ref('room/players').on('value', snapshot => {
    players = [];
    if (snapshot.exists()) {
      Object.values(snapshot.val()).forEach(p => {
        players.push({
          id: p.id,
          name: p.name,
          color: p.color,
          isLeader: !!p.isLeader,
          isOnline: !!p.isOnline,
          isBot: !!p.isBot,
          role: p.role || '',
          alliance: p.alliance || ''
        });
      });
    }
    
    // Sort players array alphabetically by ID to guarantee identical indices on all clients
    players.sort((a, b) => a.id.localeCompare(b.id));
    
    // Update Lobby UI
    if (gameState === 'setup' || gameState === 'waiting_start') {
      updateLobbyGridFromFirebase();
    }
    
    // Update Admin monitor
    renderAdminMonitor();
    
    // Enable/Disable admin start button based on player count matches
    const startBtn = document.getElementById('admin-start-btn');
    if (startBtn) {
      startBtn.disabled = (players.length !== playerCount);
    }
    
    // Update player avatar SVG if we are registered
    const me = getMyPlayer();
    if (me && me.color) {
      const charName = COLORS.find(c => c.value === me.color).name;
      const nickElem = document.getElementById('player-nickname');
      if (nickElem) nickElem.innerText = `${me.name} (${charName})`;
      renderPlayerAvatarSVG();
    }
  });
  
  // Listen to game state
  db.ref('room/state').on('value', snapshot => {
    if (snapshot.exists()) {
      const newState = snapshot.val();
      if (newState !== gameState) {
        handleStateTransition(newState);
      }
    }
  });
  
  // Listen to logs
  db.ref('room/logs').on('child_added', snapshot => {
    if (snapshot.exists()) {
      const log = snapshot.val();
      // append log locally
      let logConsole = document.getElementById('admin-log-console');
      if (!logConsole) {
        const parent = document.querySelector('.admin-main');
        if (parent) {
          const consoleCard = document.createElement('div');
          consoleCard.className = 'admin-card';
          consoleCard.style.marginTop = 'auto';
          consoleCard.style.maxHeight = '140px';
          consoleCard.style.display = 'flex';
          consoleCard.style.flexDirection = 'column';
          consoleCard.innerHTML = `
            <h3 style="font-size: 0.85rem;">📝 작전 활동 로그</h3>
            <div id="admin-log-console" style="overflow-y:auto; flex:1; font-family:'Courier New', monospace; font-size:0.75rem; color:#a0aec0; line-height:1.4; display:flex; flex-direction:column; gap:4px;"></div>
          `;
          parent.appendChild(consoleCard);
          logConsole = document.getElementById('admin-log-console');
        }
      }
      if (logConsole) {
        const logItem = document.createElement('div');
        if (log.type === 'success') logItem.style.color = 'var(--neon-green)';
        else if (log.type === 'danger') logItem.style.color = 'var(--neon-red)';
        else if (log.type === 'warning') logItem.style.color = '#ffb100';
        
        logItem.innerText = `[${log.time}] ${log.text}`;
        logConsole.appendChild(logItem);
        logConsole.scrollTop = logConsole.scrollHeight;
      }
    }
  });
  
  // Timer Sync
  db.ref('room/timerSec').on('value', snapshot => {
    if (snapshot.exists()) {
      timerSec = snapshot.val();
      updateTimerDisplay();
    }
  });
  
  // Roulette Sync
  db.ref('room/rouletteStart').on('value', snapshot => {
    if (snapshot.exists()) {
      const data = snapshot.val();
      if (Date.now() - data.timestamp < 5000) {
        runLocalRoulette(data.randSpeed, data.winningIdx);
      }
    }
  });
  
  // selectedNominees sync
  db.ref('room/selectedNominees').on('value', snapshot => {
    if (snapshot.exists()) {
      selectedNominees = snapshot.val() || [];
      // Render nominee list chip updates
      const container = document.getElementById('nominated-team-list');
      if (container) {
        container.innerHTML = '';
        if (selectedNominees.length === 0) {
          container.innerHTML = '<div class="empty-nominee-slot">미편성</div>';
        } else {
          selectedNominees.forEach(id => {
            const p = players.find(x => x.id === id);
            if (p) {
              const colorObj = COLORS.find(c => c.value === p.color);
              const chip = document.createElement('div');
              chip.className = 'nominee-chip';
              chip.innerHTML = `
                ${getCrewmateSVG(colorObj.primary, colorObj.shadow)}
                <span>${p.name}</span>
              `;
              container.appendChild(chip);
            }
          });
        }
      }
    }
  });
  
  // nominationSubmitted trigger
  db.ref('room/nominationSubmitted').on('value', snapshot => {
    if (snapshot.exists() && snapshot.val() === true) {
      if (!adminLogged) {
        document.getElementById('control-nomination').classList.add('hidden');
      }
    }
  });
  
  // voteResult Sync (4 seconds popup)
  db.ref('room/voteResult').on('value', snapshot => {
    if (snapshot.exists()) {
      const data = snapshot.val();
      
      const msgText = data.passed 
        ? `투표는 ${data.approves}:${data.rejects}으로 가결되었습니다. 운송대 편성이 완료되었습니다.`
        : `투표는 ${data.approves}:${data.rejects}으로 부결되었습니다. 리더가 다음 인물로 넘어갑니다.`;
        
      const statusMsgField = document.getElementById('game-status-msg');
      if (statusMsgField) {
        if (data.passed) {
          statusMsgField.innerHTML = `<span class="good-text" style="font-weight: bold; text-shadow: 0 0 10px var(--neon-green);">${msgText}</span>`;
        } else {
          statusMsgField.innerHTML = `<span class="bad-text" style="font-weight: bold; text-shadow: 0 0 10px var(--neon-red);">${msgText}</span>`;
        }
      }
      
      rejectCount = data.rejectCount;
      const rejectDisplay = document.getElementById('admin-reject-num');
      if (rejectDisplay) rejectDisplay.innerText = rejectCount;
    }
  });
  
  // revealedCards sync
  db.ref('room/revealedCards').on('value', snapshot => {
    if (snapshot.exists()) {
      const cardVotes = snapshot.val() || [];
      triggerClientCardRevealAnimation(cardVotes);
    }
  });
  
  // End game trigger
  db.ref('room/endGameData').on('value', snapshot => {
    if (snapshot.exists()) {
      const data = snapshot.val();
      triggerClientEndGame(data.reason);
    }
  });
  
  setupAdminDatabaseObservers();
}

function handleStateTransition(newState) {
  gameState = newState;
  updateAdminStatusBoard();
  
  document.getElementById('control-nomination').classList.add('hidden');
  document.getElementById('control-voting').classList.add('hidden');
  document.getElementById('control-mission').classList.add('hidden');
  document.getElementById('control-assassination').classList.add('hidden');
  
  document.getElementById('player-intro-screen').classList.add('hidden');
  document.getElementById('admin-intro-screen').classList.add('hidden');
  document.getElementById('player-game-screen').classList.remove('hidden');
  
  if (newState === 'setup') {
    document.getElementById('game-over-overlay').classList.add('hidden');
    document.getElementById('game-over-overlay').classList.remove('win-human', 'win-zombie');
    document.getElementById('game-timer').innerText = '--';
    document.getElementById('beaker-percent').innerText = '0';
    document.getElementById('vaccine-liquid-group').style.transform = 'translateY(180px)';
    document.getElementById('admin-round-num').innerText = '1';
    document.getElementById('admin-reject-num').innerText = '0';
    document.getElementById('game-round-num').innerText = '1';
    document.getElementById('game-leader-name').innerText = '--';
    document.getElementById('nominated-team-list').innerHTML = '<div class="empty-nominee-slot">미편성</div>';
    
    const leaderDisplay = document.getElementById('admin-leader-name-display');
    if (leaderDisplay) leaderDisplay.innerText = '-- 대기 중 --';
    const avatarPlaceholder = document.getElementById('admin-leader-avatar-placeholder');
    if (avatarPlaceholder) avatarPlaceholder.innerHTML = '';
    
    document.getElementById('screen-card-reveal').classList.add('hidden');
    document.getElementById('screen-truck-panel').classList.add('hidden');
    document.getElementById('screen-info-panel').classList.remove('hidden');
    
    switchView('lobby');
    initLobbyGrid();
  }
  else if (newState === 'role_briefing') {
    playIntroSequence();
  }
  else if (newState === 'leader_spinning') {
    const playerOverlay = document.getElementById('player-roulette-overlay');
    const adminOverlay = document.getElementById('admin-roulette-overlay');
    if (playerOverlay) playerOverlay.classList.add('show');
    if (adminOverlay) adminOverlay.classList.add('show');
  }
  else if (newState === 'nomination') {
    document.getElementById('screen-card-reveal').classList.add('hidden');
    document.getElementById('screen-truck-panel').classList.add('hidden');
    document.getElementById('screen-info-panel').classList.remove('hidden');
    
    db.ref(`room/privateRoles/${myPlayerId}`).once('value', roleSnap => {
      if (roleSnap.exists()) {
        const roleData = roleSnap.val();
        const me = getMyPlayer();
        if (me) {
          me.role = roleData.role;
          me.alliance = roleData.alliance;
        }
      }
      
      db.ref('room/currentRound').once('value', roundSnap => {
        if (roundSnap.exists()) {
          currentRound = roundSnap.val();
          document.getElementById('admin-round-num').innerText = currentRound;
          document.getElementById('game-round-num').innerText = currentRound;
        }
        
        db.ref('room/leaderIdx').once('value', leaderSnap => {
          if (leaderSnap.exists()) {
            currentPhaseLeader = leaderSnap.val();
            const leader = players[currentPhaseLeader];
            if (leader) {
              const colorObj = COLORS.find(c => c.value === leader.color);
              document.getElementById('game-leader-name').innerText = `${leader.name} (${colorObj.name})`;
              
              const leaderDisplay = document.getElementById('admin-leader-name-display');
              if (leaderDisplay) {
                leaderDisplay.innerText = `${leader.name} (${colorObj.name})`;
                leaderDisplay.style.color = colorObj.primary;
              }
              const avatarPlaceholder = document.getElementById('admin-leader-avatar-placeholder');
              if (avatarPlaceholder) {
                avatarPlaceholder.innerHTML = getCrewmateSVG(colorObj.primary, colorObj.shadow);
              }
              
              const isUserLeader = (leader.id === myPlayerId);
              if (isUserLeader && !adminLogged) {
                const teamSizes = GAS.getTeamSizes(playerCount);
                const sizeRequired = teamSizes[currentRound - 1];
                document.getElementById('control-nomination').classList.remove('hidden');
                document.getElementById('req-team-size').innerText = sizeRequired;
                renderNominationSelectorGrid(sizeRequired);
              }
            }
          }
        });
      });
    });
  }
  else if (newState === 'voting') {
    document.getElementById('vote-submitted-status').innerText = '';
    document.getElementById('game-status-msg').innerText = "지명된 운송대 명단에 대한 찬성/반대 투표가 진행 중입니다.";
    
    if (!adminLogged) {
      document.getElementById('control-voting').classList.remove('hidden');
    }
  }
  else if (newState === 'mission_depart') {
    document.getElementById('screen-info-panel').classList.add('hidden');
    document.getElementById('screen-truck-panel').classList.remove('hidden');
    document.getElementById('game-status-msg').innerText = "운송대가 백신 연구소로 출발했습니다!";
  }
  else if (newState === 'mission_action') {
    document.getElementById('mission-submitted-status').innerText = '';
    
    const isOnTeam = selectedNominees.includes(myPlayerId);
    if (isOnTeam && !adminLogged) {
      document.getElementById('control-mission').classList.remove('hidden');
      const me = getMyPlayer();
      const isHuman = (me.alliance === 'human');
      document.getElementById('mission-fail-btn').disabled = isHuman;
    } else {
      document.getElementById('control-mission').classList.add('hidden');
      document.getElementById('game-status-msg').innerText = "지명된 운송대원들이 백신 수송 카드를 제출하고 있습니다.";
    }
  }
  else if (newState === 'assassination') {
    const sniper = players.find(p => p.role === '저격좀비');
    if (sniper) {
      const sniperColor = COLORS.find(c => c.value === sniper.color).name;
      alertOnParticipantScreen(
        "백신 개발이 거의 끝났습니다! 항체보유자가 생존해있기만 한다면 이제 좀비군단을 다시 인류로 바꿀 수 있습니다!",
        "저격좀비는 이제 정체를 밝히고 항체보유자를 찾아 암살해야 합니다. 그렇지 못하면 좀비군단의 패배입니다.",
        sniper.name,
        sniperColor
      );
      
      const isUserSniper = (sniper.id === myPlayerId);
      if (isUserSniper && !adminLogged) {
        setTimeout(() => {
          document.getElementById('control-assassination').classList.remove('hidden');
          renderAssassinationTargetGrid();
        }, 4000);
      }
    }
  }
}

function runLocalRoulette(randSpeed, winningIdx) {
  rouletteAngle = 0;
  rouletteSpeed = randSpeed;
  rouletteTargetIdx = winningIdx;
  rouletteAnimating = true;
  
  const winTextPlayer = document.getElementById('roulette-winner-text-player');
  const winTextAdmin = document.getElementById('roulette-winner-text-admin');
  if (winTextPlayer) winTextPlayer.innerText = "회전 중...";
  if (winTextAdmin) winTextAdmin.innerText = "회전 중...";
  
  animateSyncRoulette();
}

function animateSyncRoulette() {
  if (!rouletteAnimating) return;
  
  rouletteAngle += rouletteSpeed;
  rouletteSpeed *= 0.98;
  
  drawRoulette(rouletteAngle);
  
  if (rouletteSpeed < 0.002) {
    rouletteAnimating = false;
    rouletteSpeed = 0;
    
    const leaderPlayer = players[rouletteTargetIdx];
    if (leaderPlayer) {
      const colorObj = COLORS.find(c => c.value === leaderPlayer.color);
      const winTextPlayer = document.getElementById('roulette-winner-text-player');
      const winTextAdmin = document.getElementById('roulette-winner-text-admin');
      if (winTextPlayer) winTextPlayer.innerText = `선정됨: ${leaderPlayer.name}`;
      if (winTextAdmin) winTextAdmin.innerText = `선정됨: ${leaderPlayer.name}`;
      
      document.getElementById('game-leader-name').innerText = `${leaderPlayer.name} (${colorObj.name})`;
      
      const leaderDisplay = document.getElementById('admin-leader-name-display');
      if (leaderDisplay) {
        leaderDisplay.innerText = `${leaderPlayer.name} (${colorObj.name})`;
        leaderDisplay.style.color = colorObj.primary;
      }
      const avatarPlaceholder = document.getElementById('admin-leader-avatar-placeholder');
      if (avatarPlaceholder) {
        avatarPlaceholder.innerHTML = getCrewmateSVG(colorObj.primary, colorObj.shadow);
      }
      
      renderAdminMonitor();
      
      setTimeout(() => {
        const playerOverlay = document.getElementById('player-roulette-overlay');
        const adminOverlay = document.getElementById('admin-roulette-overlay');
        if (playerOverlay) playerOverlay.classList.remove('show');
        if (adminOverlay) adminOverlay.classList.remove('show');
      }, 2000);
    }
  } else {
    requestAnimationFrame(animateSyncRoulette);
  }
}

function triggerClientCardRevealAnimation(cardVotes) {
  gameState = 'mission_reveal';
  updateAdminStatusBoard();
  
  document.getElementById('control-mission').classList.add('hidden');
  document.getElementById('screen-truck-panel').classList.add('hidden');
  document.getElementById('screen-card-reveal').classList.remove('hidden');
  document.getElementById('mission-result-text').innerText = '';
  
  const container = document.getElementById('revealed-cards-container');
  if (container) {
    container.innerHTML = '';
    
    const shuffled = [...cardVotes].sort(() => 0.5 - Math.random());
    shuffled.forEach(v => {
      const cardDiv = document.createElement('div');
      cardDiv.className = 'reveal-card card-shake';
      cardDiv.innerHTML = `
        <div class="card-face card-back"></div>
        <div class="card-face card-front ${v ? 'success' : 'fail'}">${v ? '운송 성공' : '좀비 피습'}</div>
      `;
      container.appendChild(cardDiv);
    });
    
    setTimeout(() => {
      document.querySelectorAll('.reveal-card').forEach(card => {
        card.classList.remove('card-shake');
        card.classList.add('card-flipped');
      });
    }, 3000);
  }
}

function triggerClientEndGame(reason) {
  gameState = 'ended';
  updateAdminStatusBoard();
  
  const title = document.getElementById('final-verdict-title');
  const desc = document.getElementById('final-summary-desc');
  const finalContainer = document.getElementById('revealed-final-players');
  if (finalContainer) finalContainer.innerHTML = '';
  
  let winnerAlliance = '';
  
  if (reason === 'zombie_assassinated') {
    winnerAlliance = 'zombie';
    title.innerText = "좀비군단 승리";
    title.style.color = 'var(--neon-red)';
    desc.innerText = "저격좀비의 암살이 성공했습니다! 항체보유자가 사망했습니다. 백신의 추가 제작은 이제 불가능합니다.";
  } 
  else if (reason === 'human_survived') {
    winnerAlliance = 'human';
    title.innerText = "인류진영 승리";
    title.style.color = 'var(--neon-cyan)';
    desc.innerText = "항체보유자의 혈액으로 좀비를 정화시킬 백신이 무한정 생성됩니다. 좀비군단의 수가 압도적으로 줄어듭니다.";
  } 
  else if (reason === 'zombie_fails') {
    winnerAlliance = 'zombie';
    title.innerText = "좀비군단 승리";
    title.style.color = 'var(--neon-red)';
    desc.innerText = "백신연구소로 혈액을 운송할 차량이 모두 파괴되었습니다. 백신 개발은 영영 불가능해졌습니다.";
  } 
  else if (reason === 'zombie_rejections') {
    winnerAlliance = 'zombie';
    title.innerText = "좀비군단 승리";
    title.style.color = 'var(--neon-red)';
    desc.innerText = "운송 작전이 너무 지연되어버렸습니다. 좀비군단이 도시로 돌격해옵니다. 막을 수 없습니다.";
  }
  
  const targetAlliance = (winnerAlliance === 'human') ? 'human' : 'zombie';
  const teamTitle = document.getElementById('reveal-team-title');
  if (teamTitle) {
    teamTitle.innerText = (targetAlliance === 'human') 
      ? "최후의 인류 진영 명단 공개" 
      : "좀비군단 진영 명단 공개";
  }
  
  const revealedPlayers = players.filter(p => p.alliance === targetAlliance);
  revealedPlayers.forEach(p => {
    const colorObj = COLORS.find(c => c.value === p.color);
    const chip = document.createElement('div');
    chip.className = 'final-chip';
    chip.innerHTML = `
      ${getCrewmateSVG(colorObj.primary, colorObj.shadow)}
      <span><strong>${p.name}</strong> (${p.role})</span>
    `;
    if (finalContainer) finalContainer.appendChild(chip);
  });
  
  const overlay = document.getElementById('game-over-overlay');
  if (overlay) {
    overlay.classList.remove('hidden');
    if (winnerAlliance === 'human') {
      overlay.classList.add('win-human');
      overlay.classList.remove('win-zombie');
    } else {
      overlay.classList.add('win-zombie');
      overlay.classList.remove('win-human');
    }
  }
}

function setupAdminDatabaseObservers() {
  if (!firebaseMode || !adminLogged) return;
  
  console.log("Setting up Admin database observers...");
  
  db.ref('room/votes').on('value', snapshot => {
    if (gameState !== 'voting') return;
    
    const currentVotes = snapshot.val() || {};
    players.forEach(p => {
      if (currentVotes[p.id] !== undefined) {
        votes[p.id] = currentVotes[p.id];
      }
    });
    
    const totalVotes = Object.keys(votes).length;
    if (totalVotes === playerCount) {
      clearInterval(timerInterval);
      tallyVotes();
    }
  });
  
  db.ref('room/missionVotes').on('value', snapshot => {
    if (gameState !== 'mission_action') return;
    
    const currentMissions = snapshot.val() || {};
    missionVotes = [];
    
    selectedNominees.forEach(id => {
      if (currentMissions[id] !== undefined) {
        missionVotes.push({ playerId: id, card: currentMissions[id] });
      }
    });
    
    const required = selectedNominees.length;
    if (missionVotes.length === required) {
      clearInterval(timerInterval);
      revealMissionCards();
    }
  });
  
  db.ref('room/assassinationTarget').on('value', snapshot => {
    if (gameState !== 'assassination') return;
    if (snapshot.exists()) {
      clearInterval(timerInterval);
      const targetId = snapshot.val();
      const targetPlayer = players.find(p => p.id === targetId);
      if (targetPlayer) {
        const isCorrect = (targetPlayer.role === '항체보유자');
        finalizeAssassination(isCorrect);
      }
    }
  });
}
