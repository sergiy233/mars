document.addEventListener('DOMContentLoaded', function() {

  (function(){
    const c = document.getElementById('starsCanvas');
    if(!c) return;
    const ctx = c.getContext('2d');
    function resize(){
      const p = c.parentElement;
      c.width = p.offsetWidth; c.height = p.offsetHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    const stars = Array.from({length:120},()=>({
      x:Math.random()*c.width, y:Math.random()*c.height,
      r:Math.random()*1.2+0.2, a:Math.random(),
      speed:Math.random()*0.5+0.2
    }));

    function drawStars(){
      ctx.clearRect(0,0,c.width,c.height);
      stars.forEach(s=>{
        s.a += s.speed * 0.02;
        const alpha = (Math.sin(s.a)+1)*0.5*0.8+0.1;
        ctx.beginPath();
        ctx.arc(s.x,s.y,s.r,0,Math.PI*2);
        ctx.fillStyle='rgba(255,255,255,'+alpha+')';
        ctx.fill();
      });
      requestAnimationFrame(drawStars);
    }
    drawStars();
  })();

  // ══════════════════════════════════════════════════
  // LAUNCH SEQUENCE
  // ══════════════════════════════════════════════════
  document.getElementById('startBtn').addEventListener('click', function(){
    const menu   = document.getElementById('menu');
    const rocket = document.getElementById('rocket-screen');
    const instr  = document.getElementById('instructions-screen');

    // 1. Ховаємо меню
    menu.style.transition = 'opacity 0.5s';
    menu.style.opacity = '0';
    setTimeout(function(){
      menu.style.display = 'none';

      // 2. Показуємо ракету
      rocket.style.display = 'flex';
      rocket.style.opacity = '1';

      // 3. Після анімації ракети — показуємо інструкцію
      setTimeout(function(){
        rocket.style.transition = 'opacity 0.6s';
        rocket.style.opacity = '0';
        setTimeout(function(){
          rocket.style.display = 'none';
          instr.style.display = 'flex';
        }, 650);
      }, 2600);
    }, 500);
  });

  // Кнопка «Розпочати місію» на екрані інструкцій
  document.getElementById('instrStartBtn').addEventListener('click', function(){
    const instr = document.getElementById('instructions-screen');
    instr.style.transition = 'opacity 0.45s';
    instr.style.opacity = '0';
    setTimeout(function(){
      instr.style.display = 'none';
      startGame();
    }, 460);
  });

}); // кінець DOMContentLoaded

// ══════════════════════════════════════════════════
// GAME ENGINE
// ══════════════════════════════════════════════════
function startGame(){
  document.getElementById('game-container').style.display = 'block';
  document.getElementById('hud').style.display = 'flex';

  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');

  function resize(){
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  // ── NOISE / PROCEDURAL MAP ──
  function mulberry32(a){
    return function(){
      a|=0;a=a+0x6D2B79F5|0;
      var t=Math.imul(a^a>>>15,1|a);
      t=t+Math.imul(t^t>>>7,61|t)^t;
      return((t^t>>>14)>>>0)/4294967296;
    };
  }

  const TILE = 64;
  const CHUNK_SIZE = 16;
  const CHUNK_PX = TILE * CHUNK_SIZE;
  const chunks = new Map();

  function chunkKey(cx,cy){return cx+','+cy;}
  function rng(seed){return mulberry32(seed);}

  function getChunk(cx, cy){
    const key = chunkKey(cx,cy);
    if(chunks.has(key)) return chunks.get(key);

    const seed = (cx * 73856093) ^ (cy * 19349663);
    const rand = rng(Math.abs(seed) % 2147483647 + 1);

    const cells = [];
    for(let ty=0;ty<CHUNK_SIZE;ty++){
      for(let tx=0;tx<CHUNK_SIZE;tx++){
        const r = rand();
        let type = 'sand';
        if(r < 0.04) type = 'crater';
        else if(r < 0.12) type = 'dark_sand';
        else if(r < 0.18) type = 'rock';
        else if(r < 0.22) type = 'light_sand';
        cells.push({type, shade: rand()*0.25});
      }
    }

    const objects = [];
    const objCount = Math.floor(rand() * 4);
    for(let i=0;i<objCount;i++){
      const ox = cx * CHUNK_PX + rand() * CHUNK_PX;
      const oy = cy * CHUNK_PX + rand() * CHUNK_PX;
      const otype = rand() < 0.6 ? 'stone' : 'boulder';
      objects.push({x:ox, y:oy, type:otype, sz: rand()*12+6});
    }

    const chunk = {cells, objects};
    chunks.set(key, chunk);
    return chunk;
  }

  const sandColors = ['#c16a3a','#b85e30','#c97446','#d4804e','#bf6535','#c56840','#aa5525','#d07848'];
  const darkSandColors = ['#8b3a1a','#7a2e12','#923d1e','#9a4220'];
  const lightSandColors = ['#d9905a','#e09a64','#cc8048','#d8876a'];
  const rockColors = ['#6b4030','#5a3525','#7a4838','#634030'];

  function getTileColor(type, shade){
    let base;
    switch(type){
      case 'sand': base = sandColors[Math.floor(shade*sandColors.length*3) % sandColors.length]; break;
      case 'dark_sand': base = darkSandColors[Math.floor(shade*darkSandColors.length*4) % darkSandColors.length]; break;
      case 'light_sand': base = lightSandColors[Math.floor(shade*lightSandColors.length*4) % lightSandColors.length]; break;
      case 'rock': base = rockColors[Math.floor(shade*rockColors.length*4) % rockColors.length]; break;
      case 'crater': base = '#5a2510'; break;
      default: base = '#c1440e';
    }
    return base;
  }

  // ── CAMERA ──
  const camera = {x:0, y:0};

  // ── PLAYER — читаємо з HTML <img id="playerImage"> ──
  const playerImg = document.getElementById('playerImage');

  const player = {
    x: 0, y: 0,
    vx: 0, vy: 0,
    speed: 320,
    friction: 0.80,
    w: 32, h: 48,
    facing: 1
  };

  // ── ROVERS — читаємо з HTML <img id="roverImage"> ──
  const roverImg = document.getElementById('roverImage');

  const rovers = [];
  let calibratedCount = 0;
  const ROVER_SPAWN_RADIUS = 800;
  const MAX_ROVERS = 12;

  function spawnRover(){
    if(rovers.length >= MAX_ROVERS) return;
    const angle = Math.random() * Math.PI * 2;
    const dist = ROVER_SPAWN_RADIUS * 0.5 + Math.random() * ROVER_SPAWN_RADIUS * 0.5;
    rovers.push({
      x: player.x + Math.cos(angle) * dist,
      y: player.y + Math.sin(angle) * dist,
      vx: (Math.random()-0.5) * 40,
      vy: (Math.random()-0.5) * 40,
      w: 72, h: 40,
      status: 'neutral',
      glowTimer: 0,
      wanderTimer: 0,
      wanderAngle: Math.random()*Math.PI*2,
      id: Date.now() + Math.random()
    });
  }

  for(let i=0;i<6;i++) spawnRover();

  // ── INPUT ──
  const keys = {};
  window.addEventListener('keydown', function(e){
    keys[e.key.toLowerCase()] = true;
    if(e.key.toLowerCase() === 'e') tryInteract();
  });
  window.addEventListener('keyup', function(e){ keys[e.key.toLowerCase()] = false; });

  document.querySelectorAll('.dpad-btn').forEach(function(btn){
    btn.addEventListener('touchstart', function(e){ e.preventDefault(); keys[btn.dataset.key]=true; },{passive:false});
    btn.addEventListener('touchend', function(e){ e.preventDefault(); keys[btn.dataset.key]=false; },{passive:false});
    btn.addEventListener('mousedown', function(){ keys[btn.dataset.key]=true; });
    btn.addEventListener('mouseup', function(){ keys[btn.dataset.key]=false; });
  });
  document.getElementById('interactBtn').addEventListener('click', tryInteract);
  document.getElementById('interactBtn').addEventListener('touchstart', function(e){ e.preventDefault(); tryInteract(); },{passive:false});

  // ── MINIGAME STATE ──
  let activeRover = null;
  let mgSecret = 0;
  let mgLow = 1, mgHigh = 100;
  let mgAttempts = 0;
  let mgDone = false;
  let nearRover = null;

  function openMinigame(rover){
    activeRover = rover;
    mgSecret = Math.floor(Math.random()*100)+1;
    mgLow = 1; mgHigh = 100;
    mgAttempts = 0;
    mgDone = false;
    document.getElementById('mgDisplay').textContent = '???';
    document.getElementById('mgFeedback').textContent = '';
    document.getElementById('mgFeedback').style.color = '';
    document.getElementById('mgInput').value = '';
    document.getElementById('mgAttempts').textContent = 'Спроб: 0 / 10';
    document.getElementById('mgDot').style.background = 'var(--mars-red)';
    document.getElementById('mgDot').style.boxShadow = '0 0 8px var(--mars-red)';
    document.getElementById('minigame').style.display = 'flex';
    document.getElementById('mgInput').focus();
  }

  function closeMinigame(){
    document.getElementById('minigame').style.display = 'none';
    activeRover = null;
  }

  function getGuessValue(){
    const v = parseInt(document.getElementById('mgInput').value);
    if(isNaN(v)||v<1||v>100){
      document.getElementById('mgFeedback').textContent = 'Введіть число від 1 до 100';
      document.getElementById('mgFeedback').style.color = '#ff8833';
      return null;
    }
    return v;
  }

  document.getElementById('mgMore').addEventListener('click', function(){
    if(mgDone) return;
    const v = getGuessValue(); if(v===null) return;
    mgAttempts++;
    if(v < mgSecret){ mgLow = Math.max(mgLow, v+1); showFeedback('Більше '+v, '#44aaff'); }
    else if(v === mgSecret){ winGame(); return; }
    else { mgHigh = Math.min(mgHigh, v-1); showFeedback('Число менше '+v, '#ffaa44'); }
    updateAttempts();
  });

  document.getElementById('mgLess').addEventListener('click', function(){
    if(mgDone) return;
    const v = getGuessValue(); if(v===null) return;
    mgAttempts++;
    if(v > mgSecret){ mgHigh = Math.min(mgHigh, v-1); showFeedback('Менше '+v, '#44aaff'); }
    else if(v === mgSecret){ winGame(); return; }
    else { mgLow = Math.max(mgLow, v+1); showFeedback('Число більше '+v, '#ffaa44'); }
    updateAttempts();
  });

  document.getElementById('mgGuess').addEventListener('click', function(){
    if(mgDone) return;
    const v = getGuessValue(); if(v===null) return;
    mgAttempts++;
    updateAttempts();
    if(v === mgSecret){ winGame(); }
    else if(v < mgSecret){ showFeedback('Ні! Число більше '+v, '#ff4444'); if(mgAttempts>=10) failGame(); }
    else { showFeedback('Ні! Число менше '+v, '#ff4444'); if(mgAttempts>=10) failGame(); }
  });

  document.getElementById('mgInput').addEventListener('keydown', function(e){
    if(e.key==='Enter') document.getElementById('mgGuess').click();
  });

  document.getElementById('mgClose').addEventListener('click', closeMinigame);

  function showFeedback(msg, color){
    document.getElementById('mgFeedback').textContent = msg;
    document.getElementById('mgFeedback').style.color = color||'#fff';
  }

  function updateAttempts(){
    document.getElementById('mgAttempts').textContent = 'Спроб: '+mgAttempts+' / 10';
  }

  function winGame(){
    mgDone = true;
    if(activeRover){ activeRover.status='calibrated'; activeRover.glowTimer=3; }
    calibratedCount++;
    document.getElementById('mgDisplay').textContent = mgSecret;
    document.getElementById('mgDot').style.background = 'var(--neon-green)';
    document.getElementById('mgDot').style.boxShadow = '0 0 12px var(--neon-green)';
    showFeedback('Калібровка успішна! Код: '+mgSecret, 'var(--neon-green)');
    setTimeout(closeMinigame, 2500);
  }

  function failGame(){
    mgDone = true;
    if(activeRover){ activeRover.status='error'; activeRover.glowTimer=3; }
    document.getElementById('mgDot').style.background = 'var(--neon-red)';
    document.getElementById('mgDot').style.boxShadow = '0 0 12px var(--neon-red)';
    showFeedback('Помилка! Число було '+mgSecret, 'var(--neon-red)');
    setTimeout(closeMinigame, 2500);
  }

  function tryInteract(){
    if(nearRover) openMinigame(nearRover);
  }

  // ── DRAWING HELPERS ──
  function drawMap(){
    const vw = canvas.width, vh = canvas.height;
    const startCx = Math.floor((camera.x - vw/2) / CHUNK_PX) - 1;
    const endCx   = Math.ceil((camera.x + vw/2) / CHUNK_PX) + 1;
    const startCy = Math.floor((camera.y - vh/2) / CHUNK_PX) - 1;
    const endCy   = Math.ceil((camera.y + vh/2) / CHUNK_PX) + 1;

    for(let cy=startCy; cy<=endCy; cy++){
      for(let cx=startCx; cx<=endCx; cx++){
        const chunk = getChunk(cx, cy);
        const chunkWorldX = cx * CHUNK_PX;
        const chunkWorldY = cy * CHUNK_PX;

        for(let ty=0;ty<CHUNK_SIZE;ty++){
          for(let tx=0;tx<CHUNK_SIZE;tx++){
            const cell = chunk.cells[ty*CHUNK_SIZE+tx];
            const wx = chunkWorldX + tx * TILE;
            const wy = chunkWorldY + ty * TILE;
            const sx = wx - camera.x + canvas.width/2;
            const sy = wy - camera.y + canvas.height/2;

            if(sx+TILE<0||sx>canvas.width||sy+TILE<0||sy>canvas.height) continue;

            ctx.fillStyle = getTileColor(cell.type, cell.shade);
            ctx.fillRect(sx, sy, TILE+1, TILE+1);

            if(cell.type === 'crater'){
              const cx2 = sx + TILE/2, cy2 = sy + TILE/2;
              const grad = ctx.createRadialGradient(cx2,cy2,2,cx2,cy2,TILE*0.45);
              grad.addColorStop(0,'rgba(0,0,0,0.6)');
              grad.addColorStop(0.6,'rgba(0,0,0,0.2)');
              grad.addColorStop(1,'rgba(193,68,14,0.15)');
              ctx.fillStyle = grad;
              ctx.beginPath();
              ctx.ellipse(cx2,cy2,TILE*0.42,TILE*0.38,0,0,Math.PI*2);
              ctx.fill();
              ctx.strokeStyle='rgba(220,120,60,0.3)';
              ctx.lineWidth=2;
              ctx.beginPath();
              ctx.ellipse(cx2,cy2-2,TILE*0.44,TILE*0.4,0,0,Math.PI*2);
              ctx.stroke();
            }
          }
        }

        chunk.objects.forEach(function(obj){
          const sx = obj.x - camera.x + canvas.width/2;
          const sy = obj.y - camera.y + canvas.height/2;
          if(sx < -50 || sx > canvas.width+50 || sy < -50 || sy > canvas.height+50) return;

          ctx.save();
          if(obj.type === 'boulder'){
            ctx.fillStyle = '#5a3020';
            ctx.beginPath();
            ctx.ellipse(sx, sy, obj.sz*1.4, obj.sz, 0, 0, Math.PI*2);
            ctx.fill();
            ctx.fillStyle = '#7a4535';
            ctx.beginPath();
            ctx.ellipse(sx-obj.sz*0.2, sy-obj.sz*0.3, obj.sz*0.6, obj.sz*0.5, -0.3, 0, Math.PI*2);
            ctx.fill();
          } else {
            ctx.fillStyle = '#6a3828';
            ctx.beginPath();
            ctx.arc(sx, sy, obj.sz*0.7, 0, Math.PI*2);
            ctx.fill();
          }
          ctx.restore();
        });
      }
    }
  }

  function drawPlayerShadow(){
    const sx = canvas.width/2;
    const sy = canvas.height/2 + player.h*0.4;
    const grad = ctx.createRadialGradient(sx,sy,0,sx,sy,player.w*0.8);
    grad.addColorStop(0,'rgba(0,0,0,0.5)');
    grad.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(sx, sy, player.w*0.75, player.w*0.35, 0, 0, Math.PI*2);
    ctx.fill();
  }

  function drawPlayer(){
    const sx = canvas.width/2 - player.w/2;
    const sy = canvas.height/2 - player.h/2;

    if(playerImg && playerImg.complete && playerImg.naturalWidth > 0){
      ctx.save();
      if(player.facing < 0){
        ctx.translate(sx + player.w, sy);
        ctx.scale(-1,1);
        ctx.drawImage(playerImg, 0, 0, player.w, player.h);
      } else {
        ctx.drawImage(playerImg, sx, sy, player.w, player.h);
      }
      ctx.restore();
    } else {
      ctx.fillStyle = '#c1440e';
      ctx.fillRect(sx, sy, player.w, player.h);
    }
  }

  function drawRovers(dt){
    rovers.forEach(function(rover){
      const sx = rover.x - camera.x + canvas.width/2;
      const sy = rover.y - camera.y + canvas.height/2;

      if(sx < -150 || sx > canvas.width+150 || sy < -100 || sy > canvas.height+100) return;

      const sg = ctx.createRadialGradient(sx+rover.w/2, sy+rover.h+2, 0, sx+rover.w/2, sy+rover.h+2, rover.w*0.6);
      sg.addColorStop(0,'rgba(0,0,0,0.45)');
      sg.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle=sg;
      ctx.beginPath();
      ctx.ellipse(sx+rover.w/2, sy+rover.h+2, rover.w*0.55, rover.w*0.18, 0, 0, Math.PI*2);
      ctx.fill();

      if(rover.status === 'calibrated' && rover.glowTimer > 0){
        const alpha = Math.min(rover.glowTimer / 3, 1) * 0.6;
        ctx.save();
        ctx.shadowColor = '#00ff88';
        ctx.shadowBlur = 30;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = 'rgba(0,255,136,0.15)';
        ctx.fillRect(sx-10, sy-10, rover.w+20, rover.h+20);
        ctx.restore();
        rover.glowTimer -= dt;
      } else if(rover.status === 'error' && rover.glowTimer > 0){
        const alpha = Math.min(rover.glowTimer / 3, 1) * 0.6;
        ctx.save();
        ctx.shadowColor = '#ff3333';
        ctx.shadowBlur = 30;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = 'rgba(255,51,51,0.15)';
        ctx.fillRect(sx-10, sy-10, rover.w+20, rover.h+20);
        ctx.restore();
        rover.glowTimer -= dt;
      }

      if(rover.status === 'calibrated'){
        ctx.save();
        ctx.shadowColor = '#00ff88';
        ctx.shadowBlur = 15;
        ctx.strokeStyle = 'rgba(0,255,136,0.4)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(sx, sy, rover.w, rover.h);
        ctx.restore();
      } else if(rover.status === 'error'){
        ctx.save();
        ctx.shadowColor = '#ff3333';
        ctx.shadowBlur = 15;
        ctx.strokeStyle = 'rgba(255,51,51,0.4)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(sx, sy, rover.w, rover.h);
        ctx.restore();
      }

      if(roverImg && roverImg.complete && roverImg.naturalWidth > 0){
        ctx.drawImage(roverImg, sx, sy, rover.w, rover.h);
      } else {
        ctx.fillStyle = '#c1440e';
        ctx.fillRect(sx, sy, rover.w, rover.h);
        ctx.fillStyle = '#888';
        ctx.fillRect(sx+10, sy-8, rover.w-20, 10);
      }
    });
  }

  function drawAtmosphere(){
    const grad = ctx.createRadialGradient(
      canvas.width/2, canvas.height/2, canvas.height*0.3,
      canvas.width/2, canvas.height/2, canvas.height
    );
    grad.addColorStop(0,'rgba(0,0,0,0)');
    grad.addColorStop(1,'rgba(10,2,0,0.5)');
    ctx.fillStyle = grad;
    ctx.fillRect(0,0,canvas.width,canvas.height);

    ctx.fillStyle = 'rgba(0,0,0,0.03)';
    for(let y=0;y<canvas.height;y+=4){
      ctx.fillRect(0,y,canvas.width,2);
    }
  }

  let fps = 60;
  let fpsTimer = 0;
  let frameCount = 0;

  function updateHUD(){
    document.getElementById('hudCoords').textContent =
      'X: '+Math.floor(player.x/TILE)+' Y: '+Math.floor(player.y/TILE);
    document.getElementById('hudFps').textContent = fps;
    document.getElementById('hudRovers').textContent = rovers.length;
    document.getElementById('hudCalibrated').textContent = calibratedCount;
  }

  let lastTime = 0;
  let spawnTimer = 0;
  const INTERACT_DIST = 80;

  function gameLoop(timestamp){
    const dt = Math.min((timestamp - lastTime)/1000, 0.05);
    lastTime = timestamp;

    frameCount++;
    fpsTimer += dt;
    if(fpsTimer >= 0.5){
      fps = Math.round(frameCount/fpsTimer);
      frameCount = 0; fpsTimer = 0;
    }

    const mgOpen = document.getElementById('minigame').style.display === 'flex';

    if(!mgOpen){
      let ax = 0, ay = 0;
      if(keys['a']||keys['arrowleft']) ax -= 1;
      if(keys['d']||keys['arrowright']) ax += 1;
      if(keys['w']||keys['arrowup']) ay -= 1;
      if(keys['s']||keys['arrowdown']) ay += 1;

      if(ax !== 0 || ay !== 0){
        const len = Math.sqrt(ax*ax+ay*ay);
        ax /= len; ay /= len;
      }

      player.vx += ax * player.speed * dt;
      player.vy += ay * player.speed * dt;
      player.vx *= Math.pow(player.friction, dt*60);
      player.vy *= Math.pow(player.friction, dt*60);

      if(Math.abs(player.vx) < 0.1) player.vx = 0;
      if(Math.abs(player.vy) < 0.1) player.vy = 0;
      if(player.vx !== 0) player.facing = player.vx > 0 ? 1 : -1;

      player.x += player.vx * dt;
      player.y += player.vy * dt;

      rovers.forEach(function(r){
        r.wanderTimer -= dt;
        if(r.wanderTimer <= 0){
          r.wanderAngle = Math.random()*Math.PI*2;
          r.wanderTimer = 2 + Math.random()*4;
          const spd = 20 + Math.random()*30;
          r.vx = Math.cos(r.wanderAngle)*spd;
          r.vy = Math.sin(r.wanderAngle)*spd;
        }
        r.x += r.vx * dt;
        r.y += r.vy * dt;
        r.vx *= Math.pow(0.92, dt*60);
        r.vy *= Math.pow(0.92, dt*60);
      });

      spawnTimer += dt;
      if(spawnTimer > 8){
        spawnTimer = 0;
        if(rovers.length < MAX_ROVERS) spawnRover();
        for(let i=rovers.length-1;i>=0;i--){
          const dx = rovers[i].x - player.x;
          const dy = rovers[i].y - player.y;
          if(Math.sqrt(dx*dx+dy*dy) > ROVER_SPAWN_RADIUS*1.8){
            rovers.splice(i,1);
          }
        }
      }

      nearRover = null;
      let minDist = Infinity;
      rovers.forEach(function(r){
        const dx = (r.x + r.w/2) - player.x;
        const dy = (r.y + r.h/2) - player.y;
        const dist = Math.sqrt(dx*dx+dy*dy);
        if(dist < INTERACT_DIST && dist < minDist){
          minDist = dist;
          nearRover = r;
        }
      });

      document.getElementById('hint').style.display = nearRover ? 'block' : 'none';
    }

    camera.x += (player.x - camera.x) * Math.min(dt*8, 1);
    camera.y += (player.y - camera.y) * Math.min(dt*8, 1);

    ctx.clearRect(0,0,canvas.width,canvas.height);
    drawMap();
    drawPlayerShadow();
    drawRovers(dt);
    drawPlayer();
    drawAtmosphere();

    updateHUD();
    requestAnimationFrame(gameLoop);
  }

  requestAnimationFrame(function(ts){ lastTime=ts; requestAnimationFrame(gameLoop); });
}