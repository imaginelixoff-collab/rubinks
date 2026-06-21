'use strict';
// =====================================================================
// RUBINKS — un jeu sur l'école, la trahison, et la survie
// Canvas 2D pur. Overworld style Pokémon Noir & Blanc 2 (caméra,
// cycle de marche 4 dir, rendu en couches). 0 dépendance frontend.
// =====================================================================

// ── CANVAS SETUP ────────────────────────────────────────────────────
const canvas = document.getElementById('game');
const ctx    = canvas.getContext('2d');
const off    = document.createElement('canvas');
const oc     = off.getContext('2d');
off.width = 640; off.height = 480;
canvas.width = 1280; canvas.height = 960;
ctx.imageSmoothingEnabled = false;
oc.imageSmoothingEnabled = false;

function resizeCanvas() {
  const ratio = 4/3;
  const ww = window.innerWidth, wh = window.innerHeight;
  let w, h;
  if (ww / wh > ratio) { h = wh; w = h * ratio; }
  else { w = ww; h = w / ratio; }
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// ── CONSTANTS / MATH ────────────────────────────────────────────────
const W = 640, H = 480, TILE = 32;
const TAU = Math.PI * 2;
const lerp  = (a,b,t) => a + (b-a)*t;
const clamp = (v,a,b) => Math.max(a, Math.min(b, v));
const rand  = (a,b) => a + Math.random()*(b-a);
const easeOutCubic = t => 1 - Math.pow(1-t, 3);
const easeInOut    = t => t<0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2,3)/2;
const easeOutBack  = t => { const c1=1.70158, c3=c1+1; return 1 + c3*Math.pow(t-1,3) + c1*Math.pow(t-1,2); };

// ── DIFFICULTÉ ───────────────────────────────────────────────────────
const DIFFS=[
  {key:'FACILE',    hp:0.7, dmg:0.6,  dodge:1.4, color:'#22c55e', sub:"Esquives larges, ennemis affaiblis"},
  {key:'NORMAL',    hp:1.0, dmg:1.0,  dodge:1.0, color:'#f59e0b', sub:"L'équilibre voulu par les devs"},
  {key:'DIFFICILE', hp:1.4, dmg:1.35, dodge:0.7, color:'#ef4444', sub:"Esquives serrées, ennemis coriaces"},
];
let difficulty=1;
const DIFF=()=>DIFFS[difficulty];

// ── TILE REGISTRY ───────────────────────────────────────────────────
// char -> { k:kind, solid:collision, over:drawn above entities (canopy) }
const TILEDEF = {
  '.':{k:'grass'},  ',':{k:'grass2'}, '"':{k:'tallgrass'}, ':':{k:'path'},
  'f':{k:'flower'}, 'T':{k:'tree',solid:1,over:1}, 'Y':{k:'blossom',solid:1,over:1},
  'h':{k:'bush',solid:1}, '~':{k:'water',solid:1}, '=':{k:'fence',solid:1},
  '#':{k:'wall',solid:1}, 'R':{k:'roof',solid:1}, 'W':{k:'window',solid:1},
  'D':{k:'door'}, 'X':{k:'exit'},
  '_':{k:'floor'}, 'o':{k:'floorlit'}, '|':{k:'iwall',solid:1},
  'C':{k:'clock'}, 'S':{k:'stairs'}, 'd':{k:'desk',solid:1}, 'B':{k:'board',solid:1},
  ' ':{k:'void',solid:1},
};

// Build a rectangular room (interior): borders are walls, inside floor.
function room(w, h, feats) {
  const g = [];
  for (let y=0;y<h;y++){
    const row=[];
    for (let x=0;x<w;x++) row.push((x===0||y===0||x===w-1||y===h-1)?'|':'_');
    g.push(row);
  }
  for (const f of feats) if (g[f.y]) g[f.y][f.x]=f.c;
  return g;
}

// Procedural lush exterior (forest border, school at top, winding path).
function genExterior(w, h, seed) {
  let s = seed>>>0;
  const rnd = () => { s=(s*1664525+1013904223)>>>0; return s/4294967296; };
  const g = Array.from({length:h},()=>Array.from({length:w},()=>'.'));
  for (let y=0;y<h;y++) for (let x=0;x<w;x++){
    const r=rnd();
    if (r<0.05) g[y][x]=','; else if (r<0.085) g[y][x]='f';
  }
  // tall-grass clusters
  for (let i=0;i<8;i++){
    const cx=3+Math.floor(rnd()*(w-6)), cy=7+Math.floor(rnd()*(h-11));
    const pw=2+Math.floor(rnd()*3), ph=2+Math.floor(rnd()*3);
    for (let y=cy;y<cy+ph&&y<h-2;y++) for (let x=cx;x<cx+pw&&x<w-2;x++) g[y][x]='"';
  }
  // forest border
  for (let x=0;x<w;x++){ g[0][x]='T'; g[h-1][x]='T'; }
  for (let y=0;y<h;y++){ g[y][0]='T'; g[y][w-1]='T'; }
  // school building near top
  const bw=Math.min(w-6,16), bx=Math.floor((w-bw)/2);
  for (let x=bx;x<bx+bw;x++){ g[1][x]='R'; g[2][x]='R'; g[3][x]=(x%2===0?'#':'W'); g[4][x]='#'; }
  const doorx=bx+Math.floor(bw/2);
  g[3][doorx]='#'; g[4][doorx]='D';
  // plaza in front of door
  for (let y=5;y<=6;y++) for (let x=doorx-2;x<=doorx+2;x++) if (x>0&&x<w-1) g[y][x]=':';
  // winding dirt path down to bottom
  let pc=doorx;
  for (let y=6;y<h-2;y++){
    g[y][pc]=':'; g[y][clamp(pc+1,1,w-2)]=':';
    if (rnd()<0.45) pc += rnd()<0.5?-1:1;
    pc=clamp(pc,3,w-5);
  }
  // fence along left yard
  for (let y=9;y<h-3;y++){ if (g[y][2]==='.'||g[y][2]===',') g[y][2]='='; }
  // cherry-blossom trees
  for (let i=0;i<6;i++){
    const x=3+Math.floor(rnd()*(w-6)), y=7+Math.floor(rnd()*(h-11));
    if (g[y][x]==='.'||g[y][x]===',') g[y][x]='Y';
  }
  // clear spawn + ensure path tiles around bottom
  const spawn={gx:doorx, gy:h-4};
  g[spawn.gy][spawn.gx]=':'; g[spawn.gy+1] && (g[spawn.gy+1][spawn.gx]='.');
  return { grid:g, w, h, spawn, doorx };
}

// ── ZONES ────────────────────────────────────────────────────────────
function buildZones(){
  const ext = genExterior(24, 28, 0x5eed);
  // les PNJ (Thomas/Célestine/Carla) ne sont plus plantés dans la cour :
  // ils font partie de l'équipe et suivent le leader en file indienne (voir initGame)
  ext.npcs = [];

  const rdc = (()=>{
    const w=22,h=18;
    const feats=[ {x:19,y:1,c:'S'}, {x:10,y:8,c:'C'},
      {x:10,y:h-1,c:'X'},{x:11,y:h-1,c:'X'},
      {x:3,y:3,c:'o'},{x:18,y:3,c:'o'},{x:3,y:14,c:'o'},{x:18,y:14,c:'o'} ];
    return { grid:room(w,h,feats), w, h, spawn:{gx:10,gy:h-3}, name:'RDC' };
  })();
  const f1 = (()=>{
    const w=22,h=18;
    const feats=[ {x:19,y:1,c:'S'}, {x:10,y:h-1,c:'X'},{x:11,y:h-1,c:'X'},
      {x:3,y:3,c:'o'},{x:18,y:3,c:'o'},{x:3,y:14,c:'o'},{x:18,y:14,c:'o'} ];
    return { grid:room(w,h,feats), w, h, spawn:{gx:18,gy:3}, name:'1ER ÉTAGE' };
  })();
  const f2 = (()=>{
    const w=22,h=17;
    const feats=[ {x:10,y:h-1,c:'X'},{x:11,y:h-1,c:'X'} ];
    // board across top, rows of desks
    for (let x=2;x<20;x++) feats.push({x,y:1,c:'B'});
    for (let ry=4; ry<=11; ry+=3)
      for (let dx2=4; dx2<=17; dx2+=3){ feats.push({x:dx2,y:ry,c:'d'}); feats.push({x:dx2+1,y:ry,c:'d'}); }
    return { grid:room(w,h,feats), w, h, spawn:{gx:18,gy:3}, name:'2ÈME ÉTAGE' };
  })();

  ext.name='EXTÉRIEUR';
  return [ext, rdc, f1, f2];
}
let ZONES = buildZones();
const curZone = () => ZONES[currentZone];
function inB(z,x,y){ return x>=0&&y>=0&&x<z.w&&y<z.h; }
function charAt(z,x,y){ return inB(z,x,y) ? z.grid[y][x] : '#'; }
function defAt(z,x,y){ return TILEDEF[charAt(z,x,y)] || TILEDEF['#']; }

// ── HERO / NPC DATA ──────────────────────────────────────────────────
const HERO_DEFS = [
  { name:'RUBINS', color:'#7C3AED', shade:'#5b21b6', hair:'#4c1d95', maxHp:120, maxEn:60  },
  { name:'KAYA',   color:'#EC4899', shade:'#be185d', hair:'#9d174d', maxHp:100, maxEn:80  },
  { name:'MAEL',   color:'#06B6D4', shade:'#0e7490', hair:'#155e75', maxHp:110, maxEn:60  },
  { name:'ZARA',   color:'#F59E0B', shade:'#b45309', hair:'#92400e', maxHp:90,  maxEn:100 },
];
const NPC_DEFS = [
  { name:'THOMAS',    color:'#22C55E', shade:'#15803d', hair:'#166534', maxHp:150 },
  { name:'CÉLESTINE', color:'#EF4444', shade:'#b91c1c', hair:'#991b1b', maxHp:130 },
  { name:'CARLA',     color:'#3B82F6', shade:'#1d4ed8', hair:'#1e40af', maxHp:140 },
];

// ── ATTACKS ──────────────────────────────────────────────────────────
const HERO_ATTACKS = [
  { name:'Pomme pote',          type:'heal',    effect:'heal_ally',     amount:30, cost:0,  desc:"Reprends des HP, mv — c'est bon pour la santé." },
  { name:'Machine café',        type:'support', effect:'energy_ally',   amount:20, cost:0,  desc:"De l'énergie — on vit pas sans café ptn." },
  { name:'Ça va aller ptn',     type:'buff',    effect:'atk_boost_all', pct:0.20,  dur:3, cost:10, desc:"On se motive : +20% d'attaque pour tous (3 tours)." },
  { name:'Stoïcisme',           type:'buff',    effect:'dodge_boost',   pct:0.40,  dur:2, cost:15, desc:"Les réflexions ont trop de vice — tu esquives mieux les remarques." },
  { name:'Destruction du opps', type:'attack',  effect:'damage',        amount:35, cost:20, desc:"Explicite. Tu détruis l'opps (35 dégâts)." },
];
// ATTAQUES DU BOSS FINAL (Pierre) — il garde EXCLUSIVEMENT ces 8-là
const CLOCK_ATTACKS = [
  { name:'Les zommes soit fort',      dir:'←', dmg:20, effect:'atk_debuff_male', dur:2 },
  { name:'Elle est juste mal foutue', dir:'→', dmg:25, effect:'def_debuff_rand'        },
  { name:"C'est des pbs de comm",     dir:'↑', dmg:15, effect:'confuse'                },
  { name:'Mizogénie pro max',         dir:'↓', dmg:35, effect:'all_damage', all:true   },
  { name:'De 8h à 23h',               dir:'←', dmg:20, effect:'skip_turn'              },
  { name:'Notation au faciès',        dir:'→', dmg:30, effect:'double_low_hp'          },
  { name:'Manque de respect',         dir:'↑', dmg:25, effect:'energy_drain_all', all:true },
  { name:'Les nénètteeeeeeees',       dir:'↓', dmg:40, effect:'all_half_dodge', all:true },
];
// ATTAQUES DE L'HORLOGE (boss 1)
const HORLOGE_ATTACKS = [
  { name:'La vie sociale pour aller où ?',   dir:'←', dmg:20, effect:'energy_drain_all', all:true },
  { name:"Rubila c'est bien tkt",            dir:'↑', dmg:15, effect:'confuse'                     },
  { name:"Les vacances c'est pour les faibles", dir:'→', dmg:25, effect:'skip_turn'               },
  { name:'#RUBIKAFOREVER',                   dir:'↓', dmg:30, effect:'all_damage', all:true        },
  { name:'7J/7',                             dir:'→', dmg:35, effect:'double_low_hp'               },
];
const AXEL_ATTACKS = [
  { name:'Abérance',    dir:'→', dmg:22, effect:'cancel_buff'             },
  { name:'Gourmandise', dir:'↓', dmg:18, effect:'steal_energy', amount:10 },
];
const BERENICE_ATTACKS = [
  { name:'Gougougaga', dir:'←', dmg:28, effect:'stun'               },
  { name:'Immaturité', dir:'↑', dmg:20, effect:'dodge_debuff', dur:1 },
];
const THEO_ATTACKS = [
  { name:"Manque d'investissement", dir:'→', dmg:15, effect:'delayed' },
  { name:'Enfin berf',              dir:'↓', dmg:0,  effect:'random_5_45' },
  { name:'Énèrvement injustifié',   dir:'←', dmg:30, effect:'highest_hp'  },
];
const PIERRE_ATTACKS = [
  { name:'INTERROGATION SURPRISE', dir:'↑', dmg:30, effect:'stun'                       },
  { name:'NOTE AU FACIÈS',         dir:'→', dmg:35, effect:'atk_debuff', pct:0.30, dur:3 },
  { name:'SOPORIFIQUE MAGISTRAL',  dir:'↓', dmg:25, effect:'sleep_all', all:true         },
  { name:'PRESSION ACADÉMIQUE',    dir:'←', dmg:40, effect:'reduce_maxhp', amount:20     },
  { name:"LA VÉRITÉ C'EST MOI",    dir:'↑', dmg:45, effect:'triple_miss'                 },
  { name:'DEVOIR IMPOSSIBLE',      dir:'→', dmg:50, effect:'unavoidable_low'             },
];

// ── DIALOGUES ────────────────────────────────────────────────────────
const DIALOGUES = {
  intro: [
    { speaker:'THOMAS',    text:"Alors, on est prêts ? C'est notre dernière chance de régler ça." },
    { speaker:'RUBINS',    text:"Je sais pas si je suis prêt, mais je suis là. C'est déjà quelque chose." },
    { speaker:'CÉLESTINE', text:"Ensemble, on peut tout changer. C'est pour ça qu'on est là, non ?" },
    { speaker:'KAYA',      text:"... Ouais. Ensemble. Ça devrait aller." },
    { speaker:'CARLA',     text:"Bon. On entre. Et quoi qu'il arrive, on reste groupés." },
    { speaker:'MAEL',     text:"T'as dit 'quoi qu'il arrive'. T'aurais pu dire autre chose, non ?" },
    { speaker:'ZARA',     text:"Allons-y avant que je change d'avis." },
  ],
  beforeClock: [
    { speaker:'???',     text:"..." },
    { speaker:'HORLOGE', text:"Toc. Toc. Toc. Vous entendez ça ? C'est le temps qui passe." },
    { speaker:'HORLOGE', text:"Vous avez cru que venir ici changerait quelque chose ? Touchant." },
    { speaker:'HORLOGE', text:"Le système existe depuis avant vous. Il existera après vous." },
    { speaker:'HORLOGE', text:"Mais puisque vous insistez... montrez-moi ce que valent vos petites vies." },
  ],
  betrayal: [
    { speaker:'THOMAS',    text:"Attendez. Avant que ça commence... il faut qu'on soit honnêtes avec vous." },
    { speaker:'RUBINS',    text:"Thomas ? Pourquoi vous vous mettez de ce côté ?" },
    { speaker:'THOMAS',    text:"Notre projet. On y a tout mis. Et on a attendu que vous suiviez le rythme." },
    { speaker:'CÉLESTINE', text:"On espérait que vous deveniez assez forts pour le porter avec nous. Vous ne l'êtes pas." },
    { speaker:'KAYA',      text:"Donc on n'est pas... assez bons pour vous. C'est ça ?" },
    { speaker:'CARLA',     text:"Ce n'est pas de la méchanceté, c'est un calcul. Pierre, lui, a les moyens de nous faire avancer." },
    { speaker:'THOMAS',    text:"Vous nous ralentissez. On ne peut plus se permettre de vous porter." },
    { speaker:'CÉLESTINE', text:"Alors on rejoint celui qui peut vraiment nous aider. Désolée." },
    { speaker:'CARLA',     text:"Si vous voulez nous en empêcher... montrez-nous cette force qui vous a manqué." },
    { speaker:'ZARA',      text:"On va vous montrer à quel point vous nous avez sous-estimés." },
  ],
  apology: [
    { speaker:'THOMAS',    text:"Attendez... attendez ! On s'est trompés. Pardon. Reprenez-nous, s'il vous plaît." },
    { speaker:'CÉLESTINE', text:"On n'aurait jamais dû vous lâcher. Pardonnez-nous, on fera tout pour se racheter." },
    { speaker:'CARLA',     text:"On vous a sous-estimés et on le regrette. On peut repartir ensemble, non ?" },
    { speaker:'RUBINS',    text:"ui bas ui." },
  ],
  beforePierre: [
    { speaker:'PIERRE', text:"Enfin. Les petits rebelles. J'espérais que vous arriveriez jusqu'ici." },
    { speaker:'PIERRE', text:"Vous savez ce qui me fait rire ? Vous croyez avoir raison." },
    { speaker:'PIERRE', text:"Moi j'ai vingt ans d'expérience. Vingt ans à voir des gosses comme vous." },
    { speaker:'PIERRE', text:"Ingrats. Incapables. Qui croient que le monde leur doit quelque chose." },
    { speaker:'PIERRE', text:"Je suis la victime dans cette histoire. PAS VOUS." },
    { speaker:'RUBINS', text:"Alors commençons." },
  ],
  ending: [
    { speaker:'RUBINS', text:"C'est fini." },
    { speaker:'KAYA',   text:"Non. Ça ne finit jamais vraiment." },
    { speaker:'MAEL',   text:"Le monde est encore là. Tel qu'il était avant qu'on entre." },
    { speaker:'ZARA',   text:"Mais nous, on a changé. Et ça, personne peut nous le reprendre." },
  ],
};

// ── INPUT ────────────────────────────────────────────────────────────
const keys = {}, justPressed = {};
let typedThisFrame = [];   // caractères tapés (saisie de nom)
window.addEventListener('keydown', e => {
  if (!keys[e.code]) justPressed[e.code] = true;
  keys[e.code] = true;
  if (e.key && e.key.length===1) typedThisFrame.push(e.key);
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) e.preventDefault();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });
const jp = code => justPressed[code];
function clearInput(){ for (const k in justPressed) delete justPressed[k]; typedThisFrame.length=0; }
function keyToDir(code){ return { ArrowLeft:'←', ArrowRight:'→', ArrowUp:'↑', ArrowDown:'↓' }[code] || null; }
const DIRV = { up:[0,-1], down:[0,1], left:[-1,0], right:[1,0] };

// ── DRAW PRIMITIVES ──────────────────────────────────────────────────
function fillRect(x,y,w,h,c){ oc.fillStyle=c; oc.fillRect(x,y,w,h); }
function strokeRect(x,y,w,h,c,lw=1){ oc.strokeStyle=c; oc.lineWidth=lw; oc.strokeRect(x,y,w,h); }
function circle(x,y,r,c){ oc.fillStyle=c; oc.beginPath(); oc.arc(x,y,r,0,TAU); oc.fill(); }
function ellipse(x,y,rx,ry,c){ oc.fillStyle=c; oc.beginPath(); oc.ellipse(x,y,rx,ry,0,0,TAU); oc.fill(); }
function roundRect(x,y,w,h,r,c){
  oc.fillStyle=c; oc.beginPath();
  oc.moveTo(x+r,y); oc.arcTo(x+w,y,x+w,y+h,r); oc.arcTo(x+w,y+h,x,y+h,r);
  oc.arcTo(x,y+h,x,y,r); oc.arcTo(x,y,x+w,y,r); oc.closePath(); oc.fill();
}
function text(str,x,y,c,size=8,align='left'){
  oc.fillStyle=c; oc.font=`${size}px "Press Start 2P", monospace`;
  oc.textAlign=align; oc.fillText(str,x,y); oc.textAlign='left';
}

// ── EFFECTS (screen-space, used in combat) ──────────────────────────
let particles = [], floaters = [], owFx = [];
let shake = { mag:0, t:0, dur:0 }, flashFx = { color:null, a:0 };
function addShake(mag, dur){ if(mag>shake.mag) shake.mag=mag; shake.t=Math.max(shake.t,dur); shake.dur=Math.max(shake.dur,dur); }
function screenFlash(color, a=0.4){ flashFx.color=color; flashFx.a=a; }
function burst(x,y,color,n=10,spd=80,opt={}){
  for(let i=0;i<n;i++){ const a=Math.random()*TAU, s=spd*(0.4+Math.random()*0.8);
    particles.push({ x,y, vx:Math.cos(a)*s, vy:Math.sin(a)*s-(opt.up||0),
      life:opt.life||rand(0.4,0.8), maxLife:opt.life||0.7, r:opt.r||rand(1,3), color, grav:opt.grav!=null?opt.grav:140 }); }
}
function ring(x,y,color,maxR=40){ particles.push({ ring:true, x,y, r:4, maxR, color, life:0.5, maxLife:0.5 }); }
function floater(x,y,str,color,size=10){ floaters.push({ x,y, vy:-34, str, color, size, life:0.9, maxLife:0.9 }); }
// world-space grass particles
function owBurst(wx,wy,color,n=6){
  for(let i=0;i<n;i++){ const a=-Math.PI/2+rand(-1,1), s=rand(30,70);
    owFx.push({ x:wx,y:wy, vx:Math.cos(a)*s, vy:Math.sin(a)*s, life:rand(0.3,0.5), maxLife:0.5, r:rand(1.5,3), color, grav:180 }); }
}
function updateEffects(dt){
  for(const p of particles){ if(p.ring){ p.life-=dt; p.r=lerp(4,p.maxR,1-p.life/p.maxLife); continue; }
    p.x+=p.vx*dt; p.y+=p.vy*dt; p.vy+=p.grav*dt; p.life-=dt; }
  particles=particles.filter(p=>p.life>0);
  for(const f of floaters){ f.y+=f.vy*dt; f.vy+=60*dt; f.life-=dt; }
  floaters=floaters.filter(f=>f.life>0);
  for(const p of owFx){ p.x+=p.vx*dt; p.y+=p.vy*dt; p.vy+=p.grav*dt; p.life-=dt; }
  owFx=owFx.filter(p=>p.life>0);
  if(shake.t>0){ shake.t-=dt; if(shake.t<=0) shake.mag=0; }
  if(flashFx.a>0){ flashFx.a-=dt*1.8; if(flashFx.a<0)flashFx.a=0; }
}
function drawParticles(){
  for(const p of particles){ const a=clamp(p.life/p.maxLife,0,1); oc.globalAlpha=a;
    if(p.ring){ oc.strokeStyle=p.color; oc.lineWidth=2; oc.beginPath(); oc.arc(p.x,p.y,p.r,0,TAU); oc.stroke(); }
    else circle(p.x,p.y,p.r,p.color); }
  oc.globalAlpha=1;
}
function drawFloaters(){
  for(const f of floaters){ const a=clamp(f.life/f.maxLife,0,1);
    const pop=f.life>f.maxLife-0.12?easeOutBack(1-(f.life-(f.maxLife-0.12))/0.12):1;
    oc.globalAlpha=a; const sz=f.size*pop; text(f.str,f.x+1,f.y+1,'#000',sz,'center'); text(f.str,f.x,f.y,f.color,sz,'center'); oc.globalAlpha=1; }
}
function getShakeOffset(){ if(shake.t<=0)return{x:0,y:0}; const m=shake.mag*(shake.t/Math.max(shake.dur,0.001)); return{x:rand(-m,m),y:rand(-m,m)}; }

// ── COMBAT / TITLE CHARACTER SPRITE (front-facing, shaded) ──────────
function drawHero(x, y, def, scale=1, opt={}) {
  const s=scale, bob=opt.bob?Math.sin(opt.bob)*1.5:0; y+=bob;
  const flash=opt.flash||0, ko=opt.ko;
  const main=ko?'#3f3f46':(flash>0?'#fff':def.color);
  const sh=ko?'#27272a':(flash>0?'#fff':(def.shade||def.color));
  oc.save(); oc.translate(x,y); if(opt.flip) oc.scale(-1,1);
  oc.globalAlpha=0.25; ellipse(0,12*s,7*s,3*s,'#000'); oc.globalAlpha=1;
  const O='#0b0b14';
  fillRect(-4*s,4*s,3*s,6*s,sh); fillRect(1*s,4*s,3*s,6*s,sh);
  strokeRect(-4*s,4*s,3*s,6*s,O,1); strokeRect(1*s,4*s,3*s,6*s,O,1);
  fillRect(-5*s,-8*s,10*s,13*s,main); fillRect(1*s,-8*s,4*s,13*s,sh);
  strokeRect(-5*s,-8*s,10*s,13*s,O,1);
  circle(0,-13*s,5.5*s,O); circle(0,-13*s,4.6*s,ko?'#52525b':'#f1d6c0');
  oc.fillStyle=main; oc.beginPath(); oc.arc(0,-14*s,4.6*s,Math.PI,0); oc.fill();
  if(!ko){ fillRect(-2.6*s,-13.5*s,1.8*s,2*s,'#1a1a2e'); fillRect(0.8*s,-13.5*s,1.8*s,2*s,'#1a1a2e'); }
  else { text('x',-2.6*s,-12*s,'#1a1a2e',4); text('x',0.8*s,-12*s,'#1a1a2e',4); }
  oc.restore();
  if(opt.label) text(opt.label,x,y+22*s,opt.labelColor||'#cbd5e1',5,'center');
}

// ── OVERWORLD WALKER SPRITE — 4 dirs × walk cycle ───────────────────
// feetY = baseline (bottom of feet). dir: up/down/left/right. frame 0..3.
function drawWalker(cx, feetY, def, dir, frame, s, opt={}) {
  const main=def.color, sh=def.shade||main, hair=def.hair||sh, skin='#f1c9a5';
  const O='#1c1206';
  const step = (frame===1)?-1 : (frame===3)?1 : 0; // leg swing
  const bob  = (frame===1||frame===3)? -1*s*0.5 : 0;
  oc.save();
  oc.translate(cx, feetY);
  // shadow (stays on ground)
  oc.globalAlpha=0.28; ellipse(0, 1, 7*s, 2.6*s, '#000'); oc.globalAlpha=1;
  if (opt.flash){ } // (overworld doesn't flash)
  oc.translate(0, bob);

  const drawLeg=(lx,offy)=>{ fillRect(lx,-4*s,2.4*s,4*s+offy,sh); strokeRect(lx,-4*s,2.4*s,4*s+offy,O,1); };

  if (dir==='left' || dir==='right'){
    const flip = dir==='left';
    oc.save(); if(flip) oc.scale(-1,1);
    // legs (front/back stride)
    fillRect(-1*s + step*s, -4*s, 2.4*s, 4*s, sh);
    fillRect(-2.4*s - step*s, -4*s, 2.4*s, 4*s, def.shade2||hair);
    strokeRect(-2.4*s - step*s, -4*s, 2.4*s, 4*s, O,1);
    strokeRect(-1*s + step*s, -4*s, 2.4*s, 4*s, O,1);
    // body
    fillRect(-3.2*s,-12*s,6.4*s,8*s,main); strokeRect(-3.2*s,-12*s,6.4*s,8*s,O,1);
    // arm swing
    fillRect(1.4*s - step*s, -11*s, 1.8*s, 5*s, sh);
    // head (profile)
    circle(0.4*s,-15.5*s,4.6*s,O); circle(0.4*s,-15.5*s,3.9*s,skin);
    // hair/cap
    oc.fillStyle=hair; oc.beginPath(); oc.arc(0.4*s,-16.5*s,4.0*s,Math.PI*0.9,TAU*0.15); oc.fill();
    fillRect(-3.6*s,-17*s,5*s,2*s,hair); // cap brim toward face
    // eye
    fillRect(2.2*s,-16*s,1.5*s,1.8*s,'#1a1a2e');
    oc.restore();
  } else {
    // up or down
    drawLeg(-3.0*s, dir==='down'? (frame===1?-1.4*s:0) : (frame===1?-1.4*s:0));
    drawLeg( 0.6*s, dir==='down'? (frame===3?-1.4*s:0) : (frame===3?-1.4*s:0));
    // body
    fillRect(-4.4*s,-12*s,8.8*s,8*s,main); fillRect(1*s,-12*s,3.4*s,8*s,sh);
    strokeRect(-4.4*s,-12*s,8.8*s,8*s,O,1);
    // arms
    fillRect(-5.6*s + (frame===1?1*s:0), -11*s, 1.8*s, 5*s, sh);
    fillRect( 3.8*s - (frame===3?1*s:0), -11*s, 1.8*s, 5*s, sh);
    // head
    circle(0,-15.5*s,5.0*s,O); circle(0,-15.5*s,4.3*s,skin);
    if (dir==='down'){
      // cap
      oc.fillStyle=hair; oc.beginPath(); oc.arc(0,-16.6*s,4.3*s,Math.PI,0); oc.fill();
      fillRect(-4.6*s,-16.2*s,9.2*s,1.8*s,hair);
      // eyes
      fillRect(-2.4*s,-15.6*s,1.7*s,2*s,'#1a1a2e'); fillRect(0.8*s,-15.6*s,1.7*s,2*s,'#1a1a2e');
    } else {
      // back of head: hair fills
      circle(0,-15.5*s,4.3*s,hair);
      fillRect(-4.6*s,-16.4*s,9.2*s,2*s,hair);
    }
  }
  oc.restore();
  if(opt.label) text(opt.label, cx, feetY-32*s, opt.labelColor||'#e5e7eb', 5,'center');
}

// ── BOSS SPRITES ─────────────────────────────────────────────────────
function drawClock(x, y, hp, maxHp, rage, t) {
  const pct=hp/maxHp, body=rage?'#2a0a0a':'#15152e', accent=rage?'#ef4444':'#6366f1', glow=rage?'#7f1d1d':'#312e81';
  oc.save(); oc.translate(x,y);
  oc.globalAlpha=0.4+0.2*Math.sin(t*4); circle(0,0,52,glow); oc.globalAlpha=1;
  circle(0,0,46,'#0b0b14'); circle(0,0,43,body); circle(0,0,40,rage?'#1a0606':'#0f0f24');
  for(let i=0;i<12;i++){ const a=i/12*TAU; fillRect(Math.cos(a)*36-1,Math.sin(a)*36-1,2,2,accent); }
  oc.fillStyle=accent;
  oc.save(); oc.translate(-13,-6); oc.rotate(0.3); oc.fillRect(-5,-3,12,7); oc.restore();
  oc.save(); oc.translate(13,-6); oc.rotate(-0.3); oc.fillRect(-7,-3,12,7); oc.restore();
  circle(-11,-5,2.5,'#fff'); circle(13,-5,2.5,'#fff');
  oc.strokeStyle=accent; oc.lineWidth=3; oc.lineCap='round';
  oc.beginPath(); oc.moveTo(-14,16); for(let i=-14;i<=14;i+=4) oc.lineTo(i,16+(i%8===0?4:-2)); oc.stroke();
  oc.strokeStyle=rage?'#fca5a5':'#a5b4fc'; oc.lineWidth=2.5;
  oc.beginPath(); oc.moveTo(0,0); oc.lineTo(Math.cos(t)*30,Math.sin(t)*30); oc.stroke();
  oc.beginPath(); oc.moveTo(0,0); oc.lineTo(Math.cos(t*0.4)*22,Math.sin(t*0.4)*22); oc.stroke();
  circle(0,0,3,accent); oc.restore();
  drawEnemyHpBar(x,y+56,pct,90,'HORLOGE DU DESTIN',rage);
}
function drawPierre(x, y, hp, maxHp, p2, t, noBar) {
  const pct=hp/maxHp, suit=p2?'#7f1d1d':'#1e293b', suitSh=p2?'#450a0a':'#0f172a';
  oc.save(); oc.translate(x,y);
  if(p2){ oc.globalAlpha=0.35+0.15*Math.sin(t*8); circle(0,-6,40,'#7f1d1d'); oc.globalAlpha=1; }
  fillRect(-13,-6,26,26,suit); fillRect(4,-6,9,26,suitSh); strokeRect(-13,-6,26,26,'#0b0b14',1);
  fillRect(-2,-6,4,16,p2?'#fbbf24':'#94a3b8');
  circle(0,-22,13,'#0b0b14'); circle(0,-22,12,'#e2b48c');
  oc.globalAlpha=0.5; circle(-4,-27,4,'#fff'); oc.globalAlpha=1;
  oc.strokeStyle='#3a2a1a'; oc.lineWidth=2;
  oc.beginPath(); oc.moveTo(-9,-25); oc.lineTo(-3,-23); oc.stroke();
  oc.beginPath(); oc.moveTo(9,-25); oc.lineTo(3,-23); oc.stroke();
  circle(-5,-20,3,'#fff'); circle(5,-20,3,'#fff');
  const pe=p2?'#dc2626':'#1a1a2e'; circle(-5+Math.sin(t*3)*0.6,-20,1.6,pe); circle(5+Math.sin(t*3)*0.6,-20,1.6,pe);
  oc.strokeStyle='#7f1d1d'; oc.lineWidth=2; oc.beginPath(); oc.arc(0,-13,5,0.1,Math.PI-0.1); oc.stroke();
  fillRect(-12,20,9,12,suitSh); fillRect(3,20,9,12,suitSh);
  oc.restore();
  if(!noBar) drawEnemyHpBar(x,y+40,pct,120,p2?'PIERRE — ENRAGÉ':'PIERRE',p2);
}
function drawTraitor(x, y, def, pct, t, opt={}) {
  drawHero(x, y, { color:def.color, shade:def.shade }, 2.4, { bob:t*2+x, flash:opt.flash });
  drawEnemyHpBar(x, y+30, pct, 76, def.name, false);
}
function drawEnemyHpBar(x, cy, pct, w, label, danger){
  const bx=x-w/2; text(label,x,cy-4,danger?'#fca5a5':'#e2e8f0',6,'center');
  fillRect(bx-1,cy,w+2,8,'#0b0b14'); fillRect(bx,cy+1,w,6,'#3f0d0d');
  fillRect(bx,cy+1,w*pct,6,pct>0.5?'#22c55e':pct>0.25?'#f59e0b':'#ef4444');
}

// ── GAME STATE ───────────────────────────────────────────────────────
const STATE = { TITLE:'TITLE', PLAYER_COUNT:'PLAYER_COUNT', DIFFICULTY:'DIFFICULTY', NAME_ENTRY:'NAME_ENTRY', PLAY_MODE:'PLAY_MODE',
  ROOM:'ROOM', OVERWORLD:'OVERWORLD', DIALOGUE:'DIALOGUE', BETRAYAL:'BETRAYAL', KICK:'KICK', BOSS_INTRO:'BOSS_INTRO',
  COMBAT:'COMBAT', WIN:'WIN', GAME_OVER:'GAME_OVER' };
let playerNames=[];   // noms personnalisés par index de héros
let G_state = STATE.TITLE, G_prev = null;
let playerCount=1, playMode='local', playerIndex=0;
let heroes=[], currentZone=0, player=null, party=[];
let introDone=false, clockInteracted=false, traitorDone=false, npcsTalked=[false,false,false];
let cam={x:0,y:0};
let fade={a:0,dir:0,cb:null};
let dlg={lines:[],i:0,ch:0,t:0,cb:null};
let combat=null;
let applyingRemote=false;            // true pendant l'application d'une action distante (anti-rebroadcast)
let crngState=1;                     // RNG déterministe partagé en ligne
let roomCode='', roomInput='', roomSub='choose';
let ws=null;
// URL du serveur WebSocket (Render). Surcharge possible sans rebuild via ?ws=wss://... ou localStorage('rubinks_ws').
// Sinon, remplace la valeur par défaut ci-dessous par l'URL de TON service Render après déploiement.
let WS_URL = (new URLSearchParams(location.search).get('ws'))
  || (typeof localStorage!=='undefined' && localStorage.getItem('rubinks_ws'))
  || 'wss://rubinks-server.onrender.com';
let lastTime=0, gtime=0, envTime=0, titleParticles=[];
let trail=[];

// ── INIT ─────────────────────────────────────────────────────────────
function initGame(){
  ZONES = buildZones();
  // autant de héros jouables que de joueurs (pas systématiquement les 4), nom personnalisable
  heroes = HERO_DEFS.slice(0, clamp(playerCount,1,4)).map((d,i)=>({ ...d, name:(playerNames[i]&&playerNames[i].trim())?playerNames[i].trim():d.name, hp:d.maxHp, en:d.maxEn, alive:true, status:[], index:i }));
  currentZone=0; introDone=false; clockInteracted=false; traitorDone=false; npcsTalked=[false,false,false];
  const sp=ZONES[0].spawn;
  player={ gx:sp.gx, gy:sp.gy, px:sp.gx*TILE, py:sp.gy*TILE, dir:'up',
    moving:false, mt:0, moveDur:0.15, frame:0, animT:0, turnT:0, running:false };
  // équipe : les autres héros joueurs PUIS les 3 PNJ (Thomas/Célestine/Carla) suivent en file indienne
  const followerDefs=[ ...heroes.slice(1).map(h=>({def:h,isNPC:false})), ...NPC_DEFS.map(d=>({def:d,isNPC:true})) ];
  trail=[];
  for(let i=1;i<=followerDefs.length;i++){ const gy=Math.min(ZONES[0].h-2, sp.gy+i); trail.push({gx:sp.gx, gy, dir:'up'}); }
  party = followerDefs.map((fd,i)=>{ const s=trail[i]||{gx:sp.gx,gy:sp.gy}; return { def:fd.def, isNPC:fd.isNPC, gx:s.gx, gy:s.gy, px:s.gx*TILE, py:s.gy*TILE, dir:'up', animT:0, moving:false, frame:0 }; });
  centerCamera();
  titleParticles=Array.from({length:70},()=>({ x:Math.random()*W,y:Math.random()*H,vx:rand(-0.25,0.25),vy:rand(-0.35,-0.05),
    r:rand(1,3.2), color:['#7C3AED','#EC4899','#06B6D4','#F59E0B'][Math.floor(Math.random()*4)], a:rand(0.3,0.9) }));
  const el=document.getElementById('loading'); if(el){ el.style.opacity='0'; setTimeout(()=>el.style.display='none',600); }
}

// ── HERO HELPERS ─────────────────────────────────────────────────────
const getStatus=(e,k)=>e.status.find(s=>s.key===k);
function addStatus(e,k,v,d){ e.status=e.status.filter(s=>s.key!==k); e.status.push({key:k,value:v,dur:d}); }
function tickStatus(e){ e.status=e.status.map(s=>({...s,dur:s.dur-1})).filter(s=>s.dur>0); }
function isMyHero(i){
  if(playMode!=='online'||playerCount===1) return true;
  return i===playerIndex;   // 1 héros par joueur (ordre de connexion)
}

// ── FADE ─────────────────────────────────────────────────────────────
function fadeOut(cb){ fade.a=0; fade.dir=1; fade.cb=cb; }
function updateFade(dt){
  if(fade.dir===1){ fade.a+=dt*2.4; if(fade.a>=1){ fade.a=1; fade.dir=-1; if(fade.cb){const c=fade.cb;fade.cb=null;c();} } }
  else if(fade.dir===-1){ fade.a-=dt*2.4; if(fade.a<=0){ fade.a=0; fade.dir=0; } }
}
function drawFade(){ if(fade.a>0) fillRect(0,0,W,H,`rgba(0,0,0,${fade.a})`); }

// ── DIALOGUE ─────────────────────────────────────────────────────────
function startDialogue(lines, cb){ dlg={lines,i:0,ch:0,t:0,cb}; G_prev=G_state; G_state=STATE.DIALOGUE; }
// retire les répliques des héros absents ET remplace le nom du locuteur par le nom personnalisé
function filterDlg(lines){
  const idxOf={}; HERO_DEFS.forEach((d,i)=>idxOf[d.name]=i);
  const active=new Set(heroes.map(h=>h.index));
  const out=lines.map(l=>{ const i=idxOf[l.speaker];
    if(i===undefined) return l;                                          // PNJ/boss -> garder tel quel
    if(!active.has(i)) return null;                                      // héros absent -> retirer
    return { speaker: heroes.find(h=>h.index===i).name, text:l.text };   // héros présent -> nom perso
  }).filter(Boolean);
  return out.length?out:lines;
}
function charColor(n){
  if(heroes&&heroes.length){ const h=heroes.find(x=>x.name===n); if(h) return h.color; }
  return { RUBINS:'#7C3AED',KAYA:'#EC4899',MAEL:'#06B6D4',ZARA:'#F59E0B',
  THOMAS:'#22C55E','CÉLESTINE':'#EF4444',CARLA:'#3B82F6',HORLOGE:'#a5b4fc',PIERRE:'#ef4444','???':'#94a3b8' }[n]||'#fff'; }
function updateDialogue(dt){
  const line=dlg.lines[dlg.i]; if(!line)return; dlg.t+=dt;
  if(dlg.t>0.025){ dlg.t=0; if(dlg.ch<line.text.length) dlg.ch++; }
  if(jp('Space')||jp('Enter')){
    if(dlg.ch<line.text.length) dlg.ch=line.text.length;
    else { dlg.i++; dlg.ch=0;
      if(dlg.i>=dlg.lines.length){ G_state=G_prev||STATE.OVERWORLD; if(dlg.cb){const c=dlg.cb;dlg.cb=null;c();} } }
  }
}
function wrapText(str,x,y,maxW,lh,color){
  oc.fillStyle=color; oc.font='7px "Press Start 2P", monospace'; oc.textAlign='left';
  const words=str.split(' '); let line='', cy=y;
  for(const w of words){ const test=line+(line?' ':'')+w;
    if(oc.measureText(test).width>maxW&&line){ oc.fillText(line,x,cy); cy+=lh; line=w; } else line=test; }
  if(line) oc.fillText(line,x,cy);
}
function drawDialogue(){
  const line=dlg.lines[dlg.i]; if(!line)return; const boxY=H-104;
  roundRect(12,boxY,W-24,92,6,'rgba(8,8,18,0.94)'); strokeRect(12,boxY,W-24,92,'#6366f1',2);
  strokeRect(15,boxY+3,W-30,86,'#312e81',1);
  const sc=charColor(line.speaker);
  roundRect(18,boxY-13,line.speaker.length*7+14,18,3,'rgba(8,8,18,0.96)'); strokeRect(18,boxY-13,line.speaker.length*7+14,18,sc,1);
  text(line.speaker,25,boxY-1,sc,7);
  wrapText(line.text.substring(0,dlg.ch),26,boxY+24,W-52,13,'#e5e7eb');
  if(dlg.ch>=line.text.length&&Math.sin(gtime*6)>0) text('▼',W-30,boxY+82,'#94a3b8',8);
}

// ── CINÉMATIQUE DE TRAHISON ──────────────────────────────────────────
let betrayal=null;
function startBetrayalCinematic(){
  dlg={ lines:filterDlg(DIALOGUES.betrayal), i:0, ch:0, t:0, cb:null };
  betrayal={ phase:'talk', climaxT:0, bursted:false, pierreA:0,
    npcs:NPC_DEFS.map((d,i)=>({ def:d, x:300, y:194+i*46, red:0, dir:'left' })) };
  G_state=STATE.BETRAYAL;
}
function mixRed(hex,t){ const n=parseInt(hex.slice(1),16);
  const r=Math.round(lerp((n>>16)&255,210,t)), g=Math.round(lerp((n>>8)&255,28,t)), b=Math.round(lerp(n&255,28,t));
  return `rgb(${r},${g},${b})`; }
function drawPierreSil(x,y,a){ oc.save(); oc.globalAlpha=a; oc.translate(x,y);
  fillRect(-13,-6,26,30,'#160708'); circle(0,-20,12,'#160708'); fillRect(-13,24,9,12,'#160708'); fillRect(4,24,9,12,'#160708');
  oc.globalAlpha=a*(0.6+0.4*Math.sin(gtime*6)); circle(-5,-21,2.2,'#ef4444'); circle(5,-21,2.2,'#ef4444'); oc.restore(); oc.globalAlpha=1; }
function updateBetrayal(dt){
  const b=betrayal; if(!b)return;
  const line=dlg.lines[dlg.i];
  if(b.phase==='talk' && line){
    dlg.t+=dt; if(dlg.t>0.025){ dlg.t=0; if(dlg.ch<line.text.length)dlg.ch++; }
    if(jp('Space')||jp('Enter')){
      if(dlg.ch<line.text.length) dlg.ch=line.text.length;
      else { dlg.i++; dlg.ch=0;
        if(dlg.i>=dlg.lines.length){ b.phase='climax'; b.climaxT=0; addShake(11,0.6); screenFlash('#7f1d1d',0.55); } }
    }
  }
  const cross=clamp((dlg.i-2)/3,0,1), red=(b.phase==='climax')?1:clamp((dlg.i-4)/3,0,1);
  b.npcs.forEach(n=>{ const tx=lerp(300,505,easeInOut(cross)); n.x=lerp(n.x,tx,clamp(dt*4,0,1));
    n.dir=cross>0.12?'right':'left'; n.red=lerp(n.red,red,clamp(dt*3,0,1)); });
  b.pierreA=lerp(b.pierreA,clamp((dlg.i-3)/4,0,1),clamp(dt*3,0,1));
  if(b.phase==='climax'){
    b.climaxT+=dt;
    if(!b.bursted){ b.bursted=true; b.npcs.forEach(n=>{ n.red=1; burst(n.x,n.y-16,'#ef4444',22,150,{up:20}); ring(n.x,n.y-16,'#ef4444',60); }); }
    if(b.climaxT>1.7){ betrayal=null; fadeOut(()=>startBoss2()); }
  }
}
function drawBetrayal(){
  const b=betrayal; if(!b)return;
  const g=oc.createLinearGradient(0,0,0,H); g.addColorStop(0,'#0d0a16'); g.addColorStop(1,'#05030a'); oc.fillStyle=g; oc.fillRect(0,0,W,H);
  oc.strokeStyle='rgba(255,255,255,0.04)'; oc.lineWidth=1; for(let i=0;i<8;i++){ const y=110+i*32; oc.beginPath(); oc.moveTo(0,y); oc.lineTo(W,y); oc.stroke(); }
  const rv=b.npcs[0]?b.npcs[0].red:0;
  if(rv>0.01){ oc.globalAlpha=0.22*rv+0.08*Math.sin(gtime*8)*rv; const rg=oc.createRadialGradient(W/2,H/2,60,W/2,H/2,380);
    rg.addColorStop(0,'rgba(0,0,0,0)'); rg.addColorStop(1,'#7f1d1d'); oc.fillStyle=rg; oc.fillRect(0,0,W,H); oc.globalAlpha=1; }
  if(b.pierreA>0.02) drawPierreSil(588,236,b.pierreA*0.85);
  const hn=heroes.length;
  heroes.forEach((h,i)=>{ const fy=240-(hn-1)*23+i*46; drawWalker(110,fy,h,'right',0,2,{label:h.name,labelColor:h.color}); });
  b.npcs.forEach(n=>{ const col=n.red>0.05?{color:mixRed(n.def.color,n.red),shade:mixRed(n.def.shade,n.red),hair:n.def.hair}:n.def;
    const fr=(n.dir==='right'&&Math.abs(n.x-505)>2)?(Math.floor(gtime*6)%2?1:3):0;
    drawWalker(n.x,n.y,col,n.dir,fr,2,{label:n.def.name,labelColor:n.red>0.5?'#fca5a5':n.def.color}); });
  drawParticles();
  if(b.phase==='talk' && dlg.lines[dlg.i]) drawDialogue();
  if(b.phase==='climax'){ const k=clamp(b.climaxT/0.35,0,1), sc=easeOutBack(k);
    oc.save(); oc.translate(W/2,H/2-10); oc.scale(sc,sc); oc.shadowColor='#ef4444'; oc.shadowBlur=20;
    text('TRAHISON',0,0,'#ef4444',40,'center'); oc.shadowBlur=0; oc.restore();
    if(b.climaxT>0.8 && Math.sin(gtime*10)>0) text('Ils ont choisi leur camp.',W/2,H/2+44,'#fca5a5',8,'center'); }
}

// ── ENTRÉE DU BOSS FINAL (Pierre) ────────────────────────────────────
let bossIntro=null;
function startPierreIntro(){ bossIntro={ t:0, slammed:false }; G_state=STATE.BOSS_INTRO; }
function updateBossIntro(dt){
  const b=bossIntro; if(!b)return; b.t+=dt;
  if(!b.slammed && b.t>=0.8){ b.slammed=true; addShake(15,0.5); screenFlash('#7f1d1d',0.6);
    for(let i=0;i<3;i++) ring(W/2,H/2-10,'#ef4444',120+i*46); burst(W/2,H/2-10,'#ef4444',34,190); }
  if((jp('Space')||jp('Enter')) && b.t>0.5) b.t=99;
  if(b.t>2.7){ bossIntro=null; startBoss3(); }
}
function drawBossIntro(){
  const b=bossIntro; if(!b)return; const t=b.t;
  const g=oc.createLinearGradient(0,0,0,H); g.addColorStop(0,'#1a0608'); g.addColorStop(1,'#070205'); oc.fillStyle=g; oc.fillRect(0,0,W,H);
  oc.globalAlpha=0.12+0.06*Math.sin(gtime*7); const rg=oc.createRadialGradient(W/2,H/2,60,W/2,H/2,360); rg.addColorStop(0,'rgba(0,0,0,0)'); rg.addColorStop(1,'#7f1d1d'); oc.fillStyle=rg; oc.fillRect(0,0,W,H); oc.globalAlpha=1;
  const drop=t<0.8?easeOutCubic(clamp(t/0.8,0,1)):1;
  const py=lerp(-130,H/2-10,drop);
  let sc=t<0.8?lerp(2.8,1.6,drop):1.6;
  if(t>=0.8 && t<1.05) sc=1.6+Math.sin((t-0.8)*16)*0.12*(1-(t-0.8)/0.25); // rebond à l'impact
  oc.save(); oc.translate(W/2,py); oc.scale(sc,sc); drawPierre(0,0,600,600,t>1.3,gtime,true); oc.restore();
  if(t>0.95){ const k=clamp((t-0.95)/0.4,0,1), sl=easeOutBack(k);
    oc.save(); oc.globalAlpha=clamp(k*2,0,1);
    roundRect(W/2-186*sl,H-128,372*sl,54,6,'rgba(18,4,6,0.94)'); strokeRect(W/2-186*sl,H-128,372*sl,54,'#ef4444',2);
    if(k>0.55){ oc.shadowColor='#ef4444'; oc.shadowBlur=12; text('CE BON VIEUX PIERRE',W/2,H-100,'#ef4444',13,'center'); oc.shadowBlur=0;
      text('Professeur — Boss Final',W/2,H-82,'#fca5a5',7,'center'); }
    oc.restore(); }
  drawParticles();
  if(t>1.4 && Math.sin(gtime*4)>0) text('ENTRÉE pour commencer',W/2,46,'#94a3b8',7,'center');
}

// ── DÉFAITE DES TRAÎTRES : excuses → « ui bas ui » → coup de pied ─────
let kick=null;
function startApologyKick(){
  dlg={ lines:filterDlg(DIALOGUES.apology), i:0, ch:0, t:0, cb:null };
  const hn=heroes.length;
  kick={ phase:'talk', kickT:0, launched:false, said:false,
    heroes: heroes.map((h,i)=>({ def:h, x:130, y:230-(hn-1)*22+i*44, ox:0 })),
    traitors: NPC_DEFS.map((d,i)=>({ def:d, x:470, y:194+i*46, vx:0, vy:0, rot:0, spin:0 })) };
  G_state=STATE.KICK;
}
function updateKick(dt){
  const k=kick; if(!k)return;
  if(k.phase==='talk'){
    const line=dlg.lines[dlg.i];
    if(line){ dlg.t+=dt; if(dlg.t>0.025){ dlg.t=0; if(dlg.ch<line.text.length)dlg.ch++; }
      if(jp('Space')||jp('Enter')){ if(dlg.ch<line.text.length) dlg.ch=line.text.length;
        else { dlg.i++; dlg.ch=0; if(dlg.i>=dlg.lines.length){ k.phase='kick'; k.kickT=0; } } } }
  } else {
    k.kickT+=dt;
    k.heroes.forEach(h=>{ h.ox = k.kickT<0.22? easeOutCubic(k.kickT/0.22)*70 : Math.max(0,70-(k.kickT-0.22)*280); });
    if(!k.launched && k.kickT>=0.2){ k.launched=true; addShake(11,0.4); screenFlash('#ffffff',0.35);
      k.traitors.forEach(t=>{ t.vx=rand(280,400); t.vy=-rand(190,280); t.spin=rand(-9,9); burst(t.x,t.y-16,'#ef4444',20,170); floater(t.x,t.y-30,'BAM !','#fbbf24',16); }); }
    k.traitors.forEach(t=>{ t.x+=t.vx*dt; t.y+=t.vy*dt; t.vy+=620*dt; t.rot+=t.spin*dt; });
    if(k.kickT>2.0){ kick=null; fadeOut(()=>{ G_state=STATE.OVERWORLD; }); }
  }
}
function drawKick(){
  const k=kick; if(!k)return;
  const g=oc.createLinearGradient(0,0,0,H); g.addColorStop(0,'#10131f'); g.addColorStop(1,'#070a12'); oc.fillStyle=g; oc.fillRect(0,0,W,H);
  oc.strokeStyle='rgba(255,255,255,0.04)'; oc.lineWidth=1; for(let i=0;i<8;i++){ const y=110+i*32; oc.beginPath(); oc.moveTo(0,y); oc.lineTo(W,y); oc.stroke(); }
  k.traitors.forEach(t=>{ oc.save(); oc.translate(t.x,t.y); oc.rotate(t.rot||0); drawWalker(0,0,t.def,'left',0,2,{}); oc.restore(); });
  k.heroes.forEach(h=>{ if(h.def.alive===false)return; drawWalker(h.x+(h.ox||0), h.y, h.def, 'right', k.phase==='kick'?1:0, 2, {label:h.def.name,labelColor:h.def.color}); });
  drawParticles(); drawFloaters();
  if(k.phase==='talk' && dlg.lines[dlg.i]) drawDialogue();
  if(k.phase==='kick' && k.kickT<1.3){ const sc=easeOutBack(clamp(k.kickT*4,0,1)); oc.save(); oc.translate(W/2,120); oc.scale(sc,sc);
    oc.shadowColor='#f59e0b'; oc.shadowBlur=14; text('ui bas ui.',0,0,'#fbbf24',26,'center'); oc.shadowBlur=0; oc.restore(); }
}

// ── TITLE ────────────────────────────────────────────────────────────
function updateTitle(dt){
  for(const p of titleParticles){ p.x+=p.vx; p.y+=p.vy; if(p.y<-4){p.y=H+4;p.x=Math.random()*W;} if(p.x<0)p.x=W; if(p.x>W)p.x=0; }
  if(jp('Space')||jp('Enter')) G_state=STATE.PLAYER_COUNT;
}
function drawTitle(){
  const g=oc.createLinearGradient(0,0,0,H); g.addColorStop(0,'#0a0a1f'); g.addColorStop(1,'#14081f'); oc.fillStyle=g; oc.fillRect(0,0,W,H);
  for(const p of titleParticles){ oc.globalAlpha=p.a*(0.6+0.4*Math.sin(gtime*2+p.x)); circle(p.x,p.y,p.r,p.color); } oc.globalAlpha=1;
  const float=Math.sin(gtime*1.5)*4; oc.textAlign='center'; oc.font='52px "Press Start 2P", monospace';
  oc.fillStyle='#2e1065'; oc.fillText('RUBINKS',W/2+4,H/2-54+float+4);
  oc.shadowColor='#7C3AED'; oc.shadowBlur=24+12*Math.sin(gtime*2); oc.fillStyle='#a78bfa'; oc.fillText('RUBINKS',W/2,H/2-54+float); oc.shadowBlur=0;
  // pas d'accroche scénaristique ici (anti-spoil) — juste un sous-titre neutre
  text("appuie sur entrée pour jouer",W/2,H/2-14,'#64748b',7,'center');
  for(let i=0;i<4;i++) drawHero(W/2-72+i*48,H/2+44+Math.sin(gtime*3+i)*3,HERO_DEFS[i],1.7,{bob:gtime*4+i});
  if(Math.sin(gtime*3)>0) text('APPUIE SUR ENTRÉE',W/2,H-44,'#e5e7eb',10,'center'); oc.textAlign='left';
}

// ── PLAYER COUNT ─────────────────────────────────────────────────────
let pcSel=1;
function updatePlayerCount(dt){
  if(jp('ArrowLeft')&&pcSel>1)pcSel--; if(jp('ArrowRight')&&pcSel<4)pcSel++;
  for(let i=1;i<=4;i++) if(jp('Digit'+i)||jp('Numpad'+i)) pcSel=i;
  if(jp('Enter')||jp('Space')){ playerCount=pcSel; G_state=STATE.DIFFICULTY; }
  if(jp('Escape')) G_state=STATE.TITLE;
}

// ── DIFFICULTÉ (écran) ───────────────────────────────────────────────
function updateDifficulty(dt){
  if(jp('ArrowLeft')&&difficulty>0)difficulty--; if(jp('ArrowRight')&&difficulty<2)difficulty++;
  if(jp('Enter')||jp('Space')){ if(playerCount===1){ playMode='local'; startNameEntry(); } else G_state=STATE.PLAY_MODE; }
  if(jp('Escape')) G_state=STATE.PLAYER_COUNT;
}

// ── SAISIE DES NOMS ──────────────────────────────────────────────────
let nameSel=0, nameInput='';
function startNameEntry(){ nameSel=0; nameInput=''; playerNames=[]; G_state=STATE.NAME_ENTRY; }
function updateNameEntry(dt){
  for(const ch of typedThisFrame){ if(ch.length===1 && ch>=' ' && nameInput.length<10) nameInput+=ch; }
  if(jp('Backspace')) nameInput=nameInput.slice(0,-1);
  if(jp('Enter')){
    playerNames[nameSel] = nameInput.trim() || HERO_DEFS[nameSel].name;
    nameSel++; nameInput='';
    if(nameSel>=playerCount) startNewGame();
  }
  if(jp('Escape')){ if(nameSel>0){ nameSel--; nameInput=''; playerNames.pop(); } else G_state=(playerCount===1?STATE.DIFFICULTY:STATE.PLAY_MODE); }
}
function drawNameEntry(){
  const g=oc.createLinearGradient(0,0,0,H); g.addColorStop(0,'#0a0a1f'); g.addColorStop(1,'#14081f'); oc.fillStyle=g; oc.fillRect(0,0,W,H);
  text('CHOISIS TON NOM',W/2,64,'#e5e7eb',13,'center');
  const def=HERO_DEFS[nameSel];
  text(`Joueur ${nameSel+1} / ${playerCount}`,W/2,96,'#94a3b8',8,'center');
  drawHero(W/2,H/2-34,def,2.4,{bob:gtime*4});
  text('par défaut : '+def.name,W/2,H/2+18,def.color,7,'center');
  roundRect(W/2-130,H/2+34,260,42,5,'#1a1a2e'); strokeRect(W/2-130,H/2+34,260,42,def.color,2);
  const caret=Math.sin(gtime*5)>0?'|':' ';
  text((nameInput||'')+caret,W/2,H/2+62,'#fff',14,'center');
  text('Tape un nom · ENTRÉE valider · ÉCHAP retour',W/2,H-50,'#6b7280',6,'center');
  for(let i=0;i<playerCount;i++){ const dx=W/2-(playerCount-1)*11+i*22; circle(dx,H-28,4,i<nameSel?'#22c55e':i===nameSel?HERO_DEFS[i].color:'#374151'); }
}
function drawDifficulty(){
  const g=oc.createLinearGradient(0,0,0,H); g.addColorStop(0,'#0a0a1f'); g.addColorStop(1,'#14081f'); oc.fillStyle=g; oc.fillRect(0,0,W,H);
  text('DIFFICULTÉ',W/2,84,'#e5e7eb',14,'center');
  for(let i=0;i<3;i++){ const d=DIFFS[i], bx=W/2-150+i*100, by=H/2-46, sel=difficulty===i, pop=sel?1+0.05*Math.sin(gtime*6):1;
    oc.save(); oc.translate(bx+44,by+34); oc.scale(pop,pop); oc.translate(-44,-34);
    roundRect(0,0,88,68,6, sel?d.color+'22':'#1a1a2e'); strokeRect(0,0,88,68, sel?d.color:'#374151',2);
    text(d.key,44,40,sel?'#fff':'#94a3b8',9,'center'); oc.restore(); }
  const d=DIFFS[difficulty];
  roundRect(W/2-170,H/2+44,340,30,4,'rgba(8,8,18,0.9)'); strokeRect(W/2-170,H/2+44,340,30,d.color,1);
  text(d.sub,W/2,H/2+63,d.color,7,'center');
  text('← →  choisir    ENTRÉE  valider',W/2,H-44,'#6b7280',6,'center'); text('ÉCHAP  retour',W/2,H-28,'#475569',6,'center');
}
function drawPlayerCount(){
  const g=oc.createLinearGradient(0,0,0,H); g.addColorStop(0,'#0a0a1f'); g.addColorStop(1,'#14081f'); oc.fillStyle=g; oc.fillRect(0,0,W,H);
  text('COMBIEN DE JOUEURS ?',W/2,90,'#e5e7eb',13,'center');
  for(let i=1;i<=4;i++){ const bx=W/2-96+(i-1)*52, by=H/2-30, sel=pcSel===i, pop=sel?1+0.06*Math.sin(gtime*6):1;
    oc.save(); oc.translate(bx+22,by+22); oc.scale(pop,pop); oc.translate(-22,-22);
    roundRect(0,0,44,44,6,sel?'#7C3AED':'#1a1a2e'); strokeRect(0,0,44,44,sel?'#c4b5fd':'#374151',2);
    text(String(i),22,30,sel?'#fff':'#94a3b8',18,'center'); oc.restore();
    text(['SOLO','2P','3P','4P'][i-1],bx+22,by+62,sel?'#c4b5fd':'#6b7280',7,'center'); }
  text('← →  choisir    ENTRÉE  valider',W/2,H-44,'#6b7280',6,'center'); text('ÉCHAP  retour',W/2,H-28,'#475569',6,'center');
}

// ── PLAY MODE ────────────────────────────────────────────────────────
let pmSel=0;
function updatePlayMode(dt){
  if(jp('ArrowLeft')||jp('ArrowRight')) pmSel^=1;
  if(jp('Enter')||jp('Space')){ if(pmSel===0){ playMode='local'; startNameEntry(); } else { playMode='online'; G_state=STATE.ROOM; roomSub='choose'; } }
  if(jp('Escape')) G_state=STATE.DIFFICULTY;
}
function drawPlayMode(){
  fillRect(0,0,W,H,'#0a0a1f'); text('MODE DE JEU',W/2,84,'#e5e7eb',14,'center'); text(playerCount+' joueurs',W/2,112,'#94a3b8',8,'center');
  const opts=[['LOCAL','même PC','#22c55e'],['EN LIGNE','WebSocket','#3b82f6']];
  for(let i=0;i<2;i++){ const bx=W/2-126+i*132, by=H/2-40, sel=pmSel===i;
    roundRect(bx,by,116,84,6,sel?opts[i][2]+'22':'#1a1a2e'); strokeRect(bx,by,116,84,sel?opts[i][2]:'#374151',2);
    text(opts[i][0],bx+58,by+34,sel?'#fff':'#94a3b8',10,'center'); text(opts[i][1],bx+58,by+58,sel?opts[i][2]:'#6b7280',6,'center'); }
  text('← →  choisir    ENTRÉE  valider',W/2,H-44,'#6b7280',6,'center');
}

// ── ROOM ─────────────────────────────────────────────────────────────
function updateRoom(dt){
  if(roomSub==='choose'){
    if(jp('KeyC')){ roomSub='creating'; connectWS(()=>sendWS({type:'CREATE_ROOM',maxPlayers:playerCount})); }
    if(jp('KeyJ')){ roomSub='joining'; roomInput=''; }
    if(jp('Escape')) G_state=STATE.PLAY_MODE;
  } else if(roomSub==='joining'){
    for(let i=0;i<=9;i++) if(jp('Digit'+i)||jp('Numpad'+i)){ if(roomInput.length<4) roomInput+=i; }
    if(jp('Backspace')) roomInput=roomInput.slice(0,-1);
    if(jp('Enter')&&roomInput.length===4) connectWS(()=>sendWS({type:'JOIN_ROOM',code:roomInput}));
    if(jp('Escape')){ roomSub='choose'; roomInput=''; }
  }
}
function drawRoom(){
  fillRect(0,0,W,H,'#0a0a1f'); text('JOUER EN LIGNE',W/2,60,'#e5e7eb',12,'center');
  if(roomSub==='choose'){
    roundRect(W/2-96,H/2-56,84,56,6,'#0a2a14'); strokeRect(W/2-96,H/2-56,84,56,'#22c55e',2);
    text('C',W/2-54,H/2-24,'#22c55e',16,'center'); text('CRÉER',W/2-54,H/2-8,'#22c55e',7,'center');
    roundRect(W/2+12,H/2-56,84,56,6,'#0a1430'); strokeRect(W/2+12,H/2-56,84,56,'#3b82f6',2);
    text('J',W/2+54,H/2-24,'#3b82f6',16,'center'); text('REJOINDRE',W/2+54,H/2-8,'#3b82f6',6,'center');
  } else if(roomSub==='creating'){
    text('CODE DE LA ROOM',W/2,H/2-26,'#94a3b8',8,'center');
    if(roomCode){ oc.shadowColor='#f59e0b'; oc.shadowBlur=16; text(roomCode,W/2,H/2+22,'#fbbf24',28,'center'); oc.shadowBlur=0;
      text('Partage ce code !',W/2,H/2+58,'#94a3b8',7,'center'); text('En attente des joueurs'+'.'.repeat(1+Math.floor(gtime*2)%3),W/2,H/2+78,'#475569',6,'center');
    } else { text(netMsg||'Connexion...',W/2,H/2+22,'#fbbf24',7,'center'); text('(Render gratuit : 1er réveil ~30s, c\'est normal)',W/2,H/2+44,'#475569',5,'center'); }
  } else {
    text('ENTRE LE CODE',W/2,H/2-40,'#94a3b8',8,'center');
    roundRect(W/2-66,H/2-22,132,40,4,'#1a1a2e'); strokeRect(W/2-66,H/2-22,132,40,'#6366f1',2);
    text(roomInput.padEnd(4,'_').split('').join(' '),W/2,H/2+6,'#fbbf24',16,'center'); text('ENTRÉE pour confirmer',W/2,H/2+52,'#6b7280',6,'center');
    if(netMsg) text(netMsg,W/2,H/2+74,'#fbbf24',6,'center');
  }
  text('ÉCHAP  retour',W/2,H-24,'#475569',6,'center');
}

// ── OVERWORLD: CAMERA + MOVEMENT ─────────────────────────────────────
const WALK_DUR=0.15, RUN_DUR=0.085, TURN_DUR=0.07;
function centerCamera(){
  const z=curZone();
  cam.x=clamp(player.px+TILE/2-W/2, 0, Math.max(0,z.w*TILE-W));
  cam.y=clamp(player.py+TILE/2-H/2, 0, Math.max(0,z.h*TILE-H));
}
function updateCamera(dt){
  const z=curZone();
  const tx=player.px+TILE/2-W/2, ty=player.py+TILE/2-H/2;
  const k=clamp(dt*9,0,1); // lag (~0.15/frame@60)
  cam.x=lerp(cam.x,tx,k); cam.y=lerp(cam.y,ty,k);
  cam.x=clamp(cam.x,0,Math.max(0,z.w*TILE-W)); cam.y=clamp(cam.y,0,Math.max(0,z.h*TILE-H));
}
function startNewGame(){
  initGame(); G_state=STATE.OVERWORLD;
  fadeOut(()=>{ startDialogue(filterDlg(DIALOGUES.intro),()=>{ introDone=true; }); G_prev=STATE.OVERWORLD; });
}
function walkable(z,x,y){
  if(!inB(z,x,y)) return false;
  return !defAt(z,x,y).solid;
}
function npcAt(x,y){ const z=curZone(); return (z.npcs||[]).find(n=>n.gx===x&&n.gy===y); }
function updateOverworld(dt){
  // pendant une transition (fondu), on fige les déplacements et déclencheurs
  if(fade.dir!==0){ updateFollowers(dt); updateCamera(dt); return; }
  // interaction
  if(jp('Space')||jp('Enter')) interactFront();
  // held direction (priority up>down>left>right)
  let held=null;
  if(keys['KeyW']||keys['ArrowUp'])held='up';
  else if(keys['KeyS']||keys['ArrowDown'])held='down';
  else if(keys['KeyA']||keys['ArrowLeft'])held='left';
  else if(keys['KeyD']||keys['ArrowRight'])held='right';
  player.running = !!(keys['ShiftLeft']||keys['ShiftRight']);

  if(!player.moving){
    if(held){
      if(player.dir!==held){ player.dir=held; player.turnT=TURN_DUR; player.frame=0; }
      else if(player.turnT>0){ player.turnT-=dt; }
      else {
        const [dx,dy]=DIRV[held]; const nx=player.gx+dx, ny=player.gy+dy;
        if(walkable(curZone(),nx,ny) && !npcAt(nx,ny)) startStep(nx,ny);
        else player.frame=0;
      }
    } else { player.turnT=0; player.frame=0; player.animT=0; }
  }

  if(player.moving){
    player.mt+=dt; player.animT+=dt;
    const fd=player.moveDur; // cadence d'animation = durée réelle du pas en cours
    player.frame = 1 + (Math.floor(player.animT/(fd*0.5))%2)*2; // alt 1 / 3
    const t=clamp(player.mt/player.moveDur,0,1); // linear interpolation
    player.px=lerp(player.fromX, player.gx*TILE, t);
    player.py=lerp(player.fromY, player.gy*TILE, t);
    if(t>=1){ player.moving=false; player.px=player.gx*TILE; player.py=player.gy*TILE; player.frame=0; onStepComplete(); }
  }

  updateFollowers(dt);
  updateCamera(dt);
}
function startStep(nx,ny){
  trail.unshift({ gx:player.gx, gy:player.gy, dir:player.dir });
  if(trail.length>20) trail.length=20;
  player.fromX=player.gx*TILE; player.fromY=player.gy*TILE;
  player.gx=nx; player.gy=ny; player.moving=true; player.mt=0; player.moveDur=player.running?RUN_DUR:WALK_DUR;
}
function onStepComplete(){
  // grass rustle
  if(defAt(curZone(),player.gx,player.gy).k==='tallgrass') owBurst(player.px+16, player.py+30, '#86efac', 7);
  checkTileEvents();
}
function updateFollowers(dt){
  for(let i=0;i<party.length;i++){
    const f=party[i], slot=trail[i];
    const tx=slot?slot.gx*TILE:player.px, ty=slot?slot.gy*TILE:player.py;
    const dist=Math.abs(tx-f.px)+Math.abs(ty-f.py);
    // direction stable : vers la cible (pas le delta de lerp)
    if(dist>0.6){ if(Math.abs(tx-f.px)>Math.abs(ty-f.py)) f.dir=tx<f.px?'left':'right'; else f.dir=ty<f.py?'up':'down'; }
    const k=clamp(dt*9,0,1);
    f.px=lerp(f.px,tx,k); f.py=lerp(f.py,ty,k);
    if(Math.abs(tx-f.px)<0.6 && Math.abs(ty-f.py)<0.6){ f.px=tx; f.py=ty; f.moving=false; f.animT=0; f.frame=0; } // snap + idle
    else { f.moving=true; f.animT+=dt; f.frame=1+(Math.floor(f.animT/0.09)%2)*2; }
  }
}
function interactFront(){
  const [dx,dy]=DIRV[player.dir]; const n=npcAt(player.gx+dx,player.gy+dy);
  if(n){ const def=NPC_DEFS[n.npcIdx]; n.dir=({up:'down',down:'up',left:'right',right:'left'})[player.dir];
    const line = npcsTalked[n.npcIdx] ? "On y va ? L'entrée est juste là-haut."
      : (npcsTalked[n.npcIdx]=true, ["Prêt pour ce qui nous attend ? Moi j'y crois. On lâche rien.",
        "Hé, ensemble on est plus forts. C'est tout ce qui compte aujourd'hui.",
        "On rentre, on règle ça, et on ressort la tête haute. Simple."][n.npcIdx]);
    startDialogue([{speaker:def.name,text:line}],null);
  }
}
function enterZone(z, after){
  fadeOut(()=>{
    currentZone=z; const sp=ZONES[z].spawn;
    player.gx=sp.gx; player.gy=sp.gy; player.px=sp.gx*TILE; player.py=sp.gy*TILE; player.moving=false; player.dir='up'; player.frame=0;
    trail=[]; party.forEach(f=>{ f.gx=sp.gx; f.gy=sp.gy; f.px=sp.gx*TILE; f.py=sp.gy*TILE; });
    centerCamera();
    if(after) after();
  });
}
function checkTileEvents(){
  const z=curZone(); const k=defAt(z,player.gx,player.gy).k;
  if(k==='door'){ if(currentZone===0 && introDone) enterZone(1); }
  else if(k==='exit'){
    if(currentZone===1) enterZone(0);
    else if(currentZone===2) enterZone(1);
    else if(currentZone===3) enterZone(2);
  }
  else if(k==='stairs'){
    if(currentZone===1 && clockInteracted) enterZone(2,()=>{ if(!traitorDone){ traitorDone=true; party=party.filter(p=>!p.isNPC); startBetrayalCinematic(); } });
    else if(currentZone===2) enterZone(3,()=>{ startDialogue(DIALOGUES.beforePierre,()=>startPierreIntro()); G_prev=STATE.OVERWORLD; });
  }
  else if(k==='clock'){ if(currentZone===1 && !clockInteracted){ clockInteracted=true; startDialogue(DIALOGUES.beforeClock,()=>startBoss1()); G_prev=STATE.OVERWORLD; } }
}

// ── OVERWORLD: RENDERING (layered, camera) ──────────────────────────
function groundTile(z, x, y, px, py, bright){
  const ch=z.grid[y][x], k=(TILEDEF[ch]||TILEDEF['#']).k;
  const ph=(x*13+y*7);
  switch(k){
    case 'grass': case 'flower': case 'tallgrass': case 'blossom': case 'tree': case 'fence': {
      const a=((x+y)%2===0); fillRect(px,py,TILE,TILE,a?'#6cbf5b':'#63b653');
      if((x*7+y*5)%5===0){ oc.fillStyle='#56a849'; oc.fillRect(px+6,py+18,3,2); oc.fillRect(px+20,py+9,3,2); }
      if(k==='flower'){ const sw=Math.sin(envTime*1.5+ph)*1.5; const fc=['#f9a8d4','#fde68a','#fff'][(x+y)%3];
        circle(px+16+sw,py+18,2.4,fc); circle(px+13+sw,py+16,2,fc); circle(px+19+sw,py+16,2,fc); circle(px+16+sw,py+15,2,fc); circle(px+16+sw,py+18,1.2,'#f59e0b'); }
      if(k==='tallgrass'){ fillRect(px,py,TILE,TILE,'#46a23f'); for(let i=0;i<4;i++){ const bx=px+5+i*7, sw=Math.sin(envTime*2.2+bx)*1.2;
        oc.strokeStyle='#2f7a2c'; oc.lineWidth=2; oc.beginPath(); oc.moveTo(bx,py+28); oc.lineTo(bx+sw,py+18); oc.stroke(); } }
      break; }
    case 'grass2': { fillRect(px,py,TILE,TILE,'#4f9d44'); oc.fillStyle='#3f8a37';
      oc.fillRect(px+5,py+7,3,3); oc.fillRect(px+18,py+16,3,3); oc.fillRect(px+11,py+22,3,3); break; }
    case 'path': { fillRect(px,py,TILE,TILE,'#d8b681');
      oc.fillStyle='#c9a36a'; if((x*5+y*3)%3===0) oc.fillRect(px+7,py+10,3,2); if((x*3+y*7)%4===0) oc.fillRect(px+19,py+20,3,2);
      // soft edge where path meets grass
      if((TILEDEF[charAt(z,x,y-1)]||{}).k!=='path' && charAt(z,x,y-1)!=='D'){ oc.fillStyle='rgba(120,90,50,0.18)'; oc.fillRect(px,py,TILE,3); }
      break; }
    case 'water': { const sh=0.5+0.25*Math.sin(envTime*2+ph); fillRect(px,py,TILE,TILE,'#2f6fb0');
      oc.globalAlpha=sh; fillRect(px,py,TILE,TILE,'#3b82c4'); oc.globalAlpha=1;
      oc.fillStyle='rgba(255,255,255,0.5)'; if(Math.sin(envTime*3+ph)>0.6){ oc.fillRect(px+6,py+9,3,2); oc.fillRect(px+20,py+18,2,2); } break; }
    case 'wall': { fillRect(px,py,TILE,TILE,'#c39a6b'); oc.fillStyle='#a8835a';
      for(let by=0;by<TILE;by+=8){ for(let bx=(by/8%2)*8;bx<TILE;bx+=16) oc.fillRect(px+bx,py+by,14,6); } break; }
    case 'window': { fillRect(px,py,TILE,TILE,'#c39a6b'); fillRect(px+5,py+5,22,22,'#1e3a5f');
      oc.globalAlpha=0.6+0.2*Math.sin(envTime*1.3+ph); fillRect(px+6,py+6,9,9,'#bae6fd'); fillRect(px+17,py+6,9,9,'#7dd3fc');
      fillRect(px+6,py+17,9,9,'#7dd3fc'); fillRect(px+17,py+17,9,9,'#bae6fd'); oc.globalAlpha=1; strokeRect(px+5,py+5,22,22,'#5b3a1a',1); break; }
    case 'roof': { fillRect(px,py,TILE,TILE,'#9a4a3a'); oc.fillStyle='#823c2f'; for(let ry=2;ry<TILE;ry+=8) oc.fillRect(px,py+ry,TILE,3);
      oc.fillStyle='#b85a48'; oc.fillRect(px,py,TILE,4); break; }
    case 'door': { fillRect(px,py,TILE,TILE,'#6cbf5b'); fillRect(px+5,py+2,22,30,'#7c4318'); strokeRect(px+5,py+2,22,30,'#4a2810',2);
      fillRect(px+9,py+6,14,12,'#5b3a1a'); circle(px+22,py+18,2,'#fbbf24'); break; }
    case 'fence': { const a=((x+y)%2===0); fillRect(px,py,TILE,TILE,a?'#6cbf5b':'#63b653');
      oc.fillStyle='#e8d5b0'; oc.fillRect(px+5,py+8,4,20); oc.fillRect(px+23,py+8,4,20); oc.fillRect(px+2,py+12,28,3); oc.fillRect(px+2,py+20,28,3);
      oc.strokeStyle='#b89b6a'; oc.lineWidth=1; oc.strokeRect(px+5,py+8,4,20); break; }
    case 'bush': { const a=((x+y)%2===0); fillRect(px,py,TILE,TILE,a?'#6cbf5b':'#63b653');
      circle(px+16,py+18,11,'#3f8a37'); circle(px+10,py+20,7,'#46a23f'); circle(px+22,py+20,7,'#357a2f'); break; }
    // interior
    case 'floor': { const a=((x+y)%2===0); fillRect(px,py,TILE,TILE,a?'#26221c':'#221e19');
      oc.strokeStyle='rgba(0,0,0,0.35)'; oc.lineWidth=1; oc.strokeRect(px,py,TILE,TILE); break; }
    case 'floorlit': { fillRect(px,py,TILE,TILE,'#34302a'); oc.globalAlpha=0.5; ellipse(px+16,py+16,14,12,'#5a4f3a'); oc.globalAlpha=1; break; }
    case 'iwall': { fillRect(px,py,TILE,TILE,'#3a342c'); oc.fillStyle='#4a4339'; oc.fillRect(px,py,TILE,5);
      oc.fillStyle='#262019'; oc.fillRect(px,py+TILE-3,TILE,3); break; }
    case 'stairs': { fillRect(px,py,TILE,TILE,'#26221c'); for(let i=0;i<4;i++) fillRect(px+i*5,py+TILE-7-i*6,TILE-i*5,6,i%2?'#a16207':'#7c4d10'); break; }
    case 'desk': { fillRect(px,py,TILE,TILE,'#26221c'); fillRect(px+2,py+6,28,16,'#8a6a44'); fillRect(px+2,py+6,28,4,'#a07d52');
      fillRect(px+4,py+22,5,8,'#5b3a1a'); fillRect(px+23,py+22,5,8,'#5b3a1a'); break; }
    case 'board': { fillRect(px,py,TILE,TILE,'#26221c'); fillRect(px+1,py+3,TILE-2,TILE-6,'#0f2942'); strokeRect(px+1,py+3,TILE-2,TILE-6,'#3b82f6',1);
      oc.fillStyle='#7fb0e0'; oc.font='5px monospace'; oc.fillText('∑x²',px+4,py+14); oc.fillText('∞?',px+6,py+24); break; }
    case 'clock': { fillRect(px,py,TILE,TILE,'#221e19'); // socle : la grande horloge est dessinée en couche au-dessus
      oc.globalAlpha=0.35+0.18*Math.sin(envTime*3); ellipse(px+16,py+26,22,8,'#312e81'); oc.globalAlpha=1; break; }
    case 'exit': { const a=((x+y)%2===0); fillRect(px,py,TILE,TILE,'#221e19'); fillRect(px+5,py+4,22,28,'#3a2a18'); strokeRect(px+5,py+4,22,28,'#1a120a',2);
      text('▼',px+16,py+24,'#94a3b8',8,'center'); break; }
    default: fillRect(px,py,TILE,TILE,'#15110e');
  }
  // building shadow cast downward from solid tall tiles
  if(['wall','window','roof'].includes(k)){ const below=defAt(z,x,y+1); if(!below.solid){ oc.globalAlpha=0.18; fillRect(px+3,py+TILE,TILE,6,'#000'); oc.globalAlpha=1; } }
}
function drawTreeCanopy(px, py, blossom){
  // tronc (descend dans la tuile, sous le feuillage)
  fillRect(px+13,py+16,6,15,'#5b3a1a'); fillRect(px+13,py+16,2,15,'#6b481f');
  // feuillage : descend jusqu'à ~py+26 pour recouvrir la tête d'un héros juste en dessous
  const cx=px+16, cy=py+4;
  if(blossom){
    circle(cx,cy+8,16,'#7ab85f');
    circle(cx,cy-2,15,'#f9a8d4'); circle(px+6,cy+4,11,'#f6a4cf'); circle(px+26,cy+4,11,'#fbc4e0'); circle(cx,cy+12,12,'#f7b2d6');
    oc.globalAlpha=0.5; circle(cx+4,cy-5,5,'#fff'); oc.globalAlpha=1;
  } else {
    circle(cx,cy+8,16,'#1f6b30'); circle(cx,cy-2,15,'#27843a'); circle(px+6,cy+4,11,'#1f6b30'); circle(px+26,cy+4,11,'#2f9444'); circle(cx,cy+12,12,'#236f33');
    oc.globalAlpha=0.45; circle(cx+5,cy-4,6,'#4ade80'); oc.globalAlpha=1;
  }
}
// grande horloge menaçante sur la map (RDC) — ~3 tuiles de large
function drawBigClock(cx, cy){
  const t=envTime;
  oc.save(); oc.translate(cx, cy-20);
  oc.globalAlpha=0.35+0.2*Math.sin(t*3); circle(0,0,68,'#312e81'); oc.globalAlpha=1;
  circle(0,0,54,'#0b0b14'); circle(0,0,50,'#15152e'); circle(0,0,46,'#0f0f24');
  for(let i=0;i<12;i++){ const a=i/12*TAU; fillRect(Math.cos(a)*41-1.5,Math.sin(a)*41-1.5,3,3,'#6366f1'); }
  // yeux furieux
  oc.fillStyle='#6366f1';
  oc.save(); oc.translate(-17,-9); oc.rotate(0.32); oc.fillRect(-6,-4,16,9); oc.restore();
  oc.save(); oc.translate(17,-9);  oc.rotate(-0.32); oc.fillRect(-10,-4,16,9); oc.restore();
  circle(-14,-6,3.2,'#fff'); circle(17,-6,3.2,'#fff');
  // rictus
  oc.strokeStyle='#6366f1'; oc.lineWidth=3.5; oc.lineCap='round';
  oc.beginPath(); oc.moveTo(-20,22); for(let i=-20;i<=20;i+=5) oc.lineTo(i,22+(i%10===0?5:-3)); oc.stroke();
  // aiguilles-griffes
  oc.strokeStyle='#a5b4fc'; oc.lineWidth=3.2;
  oc.beginPath(); oc.moveTo(0,0); oc.lineTo(Math.cos(t)*39,Math.sin(t)*39); oc.stroke();
  oc.beginPath(); oc.moveTo(0,0); oc.lineTo(Math.cos(t*0.4)*29,Math.sin(t*0.4)*29); oc.stroke();
  circle(0,0,4.5,'#6366f1');
  oc.restore();
}
function drawOverworld(){
  const z=curZone(), bright=(currentZone===0);
  // base background
  if(bright){ const g=oc.createLinearGradient(0,0,0,H); g.addColorStop(0,'#bfe3c5'); g.addColorStop(1,'#86c96b'); oc.fillStyle=g; oc.fillRect(0,0,W,H); }
  else { oc.fillStyle=currentZone===3?'#0d0a16':'#15110e'; oc.fillRect(0,0,W,H); }

  const camX=Math.floor(cam.x), camY=Math.floor(cam.y);
  oc.save(); oc.translate(-camX,-camY);

  const x0=Math.max(0,Math.floor(cam.x/TILE)), x1=Math.min(z.w-1,Math.floor((cam.x+W)/TILE));
  const y0=Math.max(0,Math.floor(cam.y/TILE)), y1=Math.min(z.h-1,Math.floor((cam.y+H)/TILE));

  // PASS 1 — ground
  for(let y=y0;y<=y1;y++) for(let x=x0;x<=x1;x++) groundTile(z,x,y,x*TILE,y*TILE,bright);

  // world particles (grass rustle)
  for(const p of owFx){ oc.globalAlpha=clamp(p.life/p.maxLife,0,1); circle(p.x,p.y,p.r,p.color); } oc.globalAlpha=1;

  // PASS 2 — depth-sorted: entities + tree canopies
  const draws=[];
  // player
  draws.push({ baseY:player.py+30, fn:()=>drawWalker(player.px+16, player.py+30, heroes[0], player.dir, player.frame, 2, {label:'RUBINS',labelColor:'#c4b5fd'}) });
  // followers (héros joueurs + PNJ coéquipiers)
  for(let i=0;i<party.length;i++){ const f=party[i]; if(!f.isNPC && f.def.alive===false) continue;
    draws.push({ baseY:f.py+30, fn:()=>drawWalker(f.px+16, f.py+30, f.def, f.dir, f.frame, 2, f.isNPC?{label:f.def.name,labelColor:f.def.color}:{}) }); }
  // npcs (exterior)
  if(currentZone===0) for(const n of (z.npcs||[])){ const d=NPC_DEFS[n.npcIdx];
    draws.push({ baseY:n.gy*TILE+30, fn:()=>drawWalker(n.gx*TILE+16, n.gy*TILE+30, d, n.dir, 0, 2, {label:d.name.slice(0,5),labelColor:d.color}) }); }
  // cimes d'arbres — baseY décalé pour occulter un héros situé juste en dessous ; ignore la bordure basse
  for(let y=y0;y<=y1+1;y++) for(let x=x0;x<=x1;x++){ if(!inB(z,x,y)||y>=z.h-1)continue; const k=defAt(z,x,y).k;
    if(k==='tree'||k==='blossom'){ const px=x*TILE, py=y*TILE; draws.push({ baseY:(y+1)*TILE+31, fn:()=>drawTreeCanopy(px,py,k==='blossom') }); } }
  // grande horloge (RDC) — triée en profondeur comme un objet
  for(let y=y0;y<=y1;y++) for(let x=x0;x<=x1;x++){ if(!inB(z,x,y))continue;
    if(defAt(z,x,y).k==='clock'){ const cx=x*TILE+16, cy=y*TILE+10; draws.push({ baseY:(y+1)*TILE, fn:()=>drawBigClock(cx,cy) }); } }
  draws.sort((a,b)=>a.baseY-b.baseY);
  for(const d of draws) d.fn();

  // tall-grass tips OVER feet (player + followers standing in grass)
  const overGrass=(gx,gy,px,py)=>{ if(defAt(z,gx,gy).k==='tallgrass'){ for(let i=0;i<4;i++){ const bx=px+5+i*7, sw=Math.sin(envTime*2.2+bx)*1.4;
    oc.strokeStyle='#3a8f34'; oc.lineWidth=2; oc.beginPath(); oc.moveTo(bx,py+30); oc.lineTo(bx+sw,py+16); oc.stroke(); } } };
  overGrass(player.gx,player.gy,player.px,player.py);

  oc.restore();

  // ambient overlays (screen-space)
  if(bright){ const g=oc.createRadialGradient(W*0.78,40,20,W*0.78,40,360); g.addColorStop(0,'rgba(255,255,220,0.22)'); g.addColorStop(1,'rgba(255,255,220,0)'); oc.fillStyle=g; oc.fillRect(0,0,W,H); }
  else {
    const flick=(Math.sin(envTime*13)>0.7||Math.sin(envTime*7+2)>0.85)?0.12:0;
    oc.fillStyle=`rgba(0,0,0,${0.30-flick})`; oc.fillRect(0,0,W,H);
    // lamp pools follow world
    for(let lx=120;lx<z.w*TILE;lx+=200){ const sx=lx-camX; if(sx<-160||sx>W+160)continue;
      const g=oc.createRadialGradient(sx,40-camY*0.2,10,sx,40-camY*0.2,150); g.addColorStop(0,'rgba(255,240,200,0.10)'); g.addColorStop(1,'rgba(255,240,200,0)'); oc.fillStyle=g; oc.fillRect(sx-150,0,300,200); }
  }

  // HUD
  roundRect(6,6,150,18,3,'rgba(8,8,18,0.78)'); text(z.name||'',12,19,'#cbd5e1',7);
  if(currentZone===0 && !introDone===false && currentZone===0){}
  if(currentZone===0){ const a=0.6+0.4*Math.sin(gtime*4); roundRect(W/2-120,H-22,240,16,3,'rgba(8,8,18,0.78)');
    oc.globalAlpha=a; text("↑ vers la porte de l'école    (Maj = courir)",W/2,H-10,'#fde68a',6,'center'); oc.globalAlpha=1; }
  if(currentZone===1 && !clockInteracted){ const a=0.6+0.4*Math.sin(gtime*4); roundRect(W/2-120,H-22,240,16,3,'rgba(8,8,18,0.78)');
    oc.globalAlpha=a; text("Atteins l'horloge au centre",W/2,H-10,'#fbbf24',6,'center'); oc.globalAlpha=1; }
}

// ── COMBAT ───────────────────────────────────────────────────────────
function mkCombatant(base, extra){ return { ...base, displayHp:base.hp, ox:0, oy:0, flash:0, ...extra }; }
// RNG : Math.random en local ; PRNG déterministe (seedé par room+boss) en ligne -> mêmes tirages sur tous les clients
function hashStr(s){ let h=2166136261>>>0; for(let i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,16777619); } return h>>>0; }
function crand(){ if(playMode!=='online') return Math.random(); crngState=(Math.imul(crngState,1664525)+1013904223)>>>0; return crngState/4294967296; }
function startBoss1(){
  const allies=NPC_DEFS.map((d,i)=>mkCombatant({...d,hp:d.maxHp,en:50,maxEn:50,alive:true,status:[],
    attacks:[{name:'Soutien',type:'attack',effect:'damage',amount:20,cost:0}]},{isAlly:true,index:4+i}));
  const ch=Math.round(400*DIFF().hp);
  const clock=mkCombatant({name:'HORLOGE DU DESTIN',color:'#6366f1',hp:ch,maxHp:ch,attacks:HORLOGE_ATTACKS,isBoss:true,kind:'clock',status:[]},{rage:false});
  startCombat([clock],allies,'boss1');
}
function startBoss2(){
  const dh=v=>Math.round(v*DIFF().hp);
  const e=[
    mkCombatant({name:'THOMAS',color:'#22C55E',shade:'#15803d',hp:dh(150),maxHp:dh(150),attacks:AXEL_ATTACKS,kind:'traitor',status:[],def:NPC_DEFS[0]},{}),
    mkCombatant({name:'CÉLESTINE',color:'#EF4444',shade:'#b91c1c',hp:dh(130),maxHp:dh(130),attacks:BERENICE_ATTACKS,kind:'traitor',status:[],def:NPC_DEFS[1]},{}),
    mkCombatant({name:'CARLA',color:'#3B82F6',shade:'#1d4ed8',hp:dh(140),maxHp:dh(140),attacks:THEO_ATTACKS,kind:'traitor',status:[],def:NPC_DEFS[2]},{}),
  ];
  startCombat(e,[],'boss2');
}
// Boss final : Pierre utilise EXCLUSIVEMENT les 8 attaques listées (= CLOCK_ATTACKS)
function startBoss3(){ const ph=Math.round(600*DIFF().hp); const p=mkCombatant({name:'PIERRE',color:'#7f1d1d',hp:ph,maxHp:ph,attacks:CLOCK_ATTACKS,isBoss:true,kind:'pierre',status:[]},{phase2:false}); startCombat([p],[],'boss3'); }
function startCombat(enemies, allies, bossId){
  crngState=((hashStr(roomCode||'0000') ^ Math.imul(({boss1:1,boss2:2,boss3:3}[bossId]||1),2654435761))>>>0)||1;
  combat={ bossId, enemies:enemies.map((e,i)=>({...e,index:i})), allies,
    heroes: heroes.filter(h=>h.alive).map(h=>mkCombatant({...h})),
    order:[], turn:0, phase:'intro', timer:1.0, sel:0, selTarget:0, targetMode:false, log:[],
    queue:[], cur:null, qte:null, act:null, pop:null, banner:{str:'COMBAT !',color:'#ef4444',t:1.0}, victory:false, defeat:false };
  buildOrder(); G_state=STATE.COMBAT; addShake(6,0.4);
  if(HOST()) sendWS({type:'START_COMBAT', bossId, diff:difficulty}); // le client démarre le même combat (lockstep)
}
function buildOrder(){
  combat.order=[];
  combat.heroes.forEach((h,i)=>{ if(h.alive) combat.order.push({type:'hero',idx:i}); });
  combat.allies.forEach((a,i)=>{ if(a.alive) combat.order.push({type:'ally',idx:i}); });
  combat.turn=0;
}
function curEntity(){ const o=combat.order[combat.turn]; if(!o)return null; return o.type==='hero'?combat.heroes[o.idx]:combat.allies[o.idx]; }
function enemyPos(i,n){ return n===1?{x:W/2,y:118}:{x:96+i*((W-192)/(n-1)),y:118}; }
function heroPos(i,n){ const cx=236, span=Math.min(360,n*92); return {x:cx-span/2+span*(i+0.5)/n, y:300}; }
function allyPos(i,n){ const span=Math.min(150,n*54); return {x:54+span*(i+0.5)/n, y:226}; }
function addLog(m){ combat.log.unshift(m); if(combat.log.length>4)combat.log.length=4; }

function updateCombat(dt){
  if(!combat)return; const c=combat;
  c.heroes.forEach(h=>{ h.displayHp=lerp(h.displayHp,h.hp,clamp(dt*8,0,1)); if(h.flash>0)h.flash-=dt*3; h.ox*=0.82; h.oy*=0.82; });
  c.enemies.forEach(e=>{ e.displayHp=lerp(e.displayHp,e.hp,clamp(dt*8,0,1)); if(e.flash>0)e.flash-=dt*3; e.ox*=0.82; e.oy*=0.82; });
  c.allies.forEach(a=>{ a.displayHp=lerp(a.displayHp,a.hp,clamp(dt*8,0,1)); });
  if(c.banner){ c.banner.t-=dt; if(c.banner.t<=0)c.banner=null; }
  if(c.pop){ c.pop.t-=dt; if(c.pop.t<=0)c.pop=null; }

  // ROBUST END CHECK — runs every frame so combat ends no matter who lands the blow
  if(!['intro','victory','defeat'].includes(c.phase)){
    if(c.enemies.every(e=>e.hp<=0)){ doVictory(); }
    else if(c.heroes.every(h=>!h.alive)){ doDefeat(); }
  }

  switch(c.phase){
    case 'intro': c.timer-=dt; if(c.timer<=0) c.phase='choose'; break;
    case 'choose': combatChoose(dt); break;
    case 'act': combatAct(dt); break;
    case 'enemyTurn': c.timer-=dt; if(c.timer<=0){ buildEnemyQueue(); c.phase='nextAttack'; } break;
    case 'nextAttack': nextAttack(); break;
    case 'announce': combatAnnounce(dt); break;
    case 'dodge': updateDodge(dt); break;
    case 'dodgeResult': c.timer-=dt; if(c.timer<=0) afterDodge(); break;
    case 'roundEnd': c.heroes.forEach(tickStatus); c.enemies.forEach(e=>{if(e.hp>0)tickStatus(e);}); buildOrder(); c.phase='choose'; break;
    case 'victory': c.timer-=dt; if(c.timer<=0) endVictory(); break;
    case 'defeat': c.timer-=dt; if(c.timer<=0){ combat=null; G_state=STATE.GAME_OVER; } break;
  }
}
function combatChoose(dt){
  const c=combat;
  if(c.turn>=c.order.length){ c.phase='enemyTurn'; c.timer=0.9; c.banner={str:"TOUR DE L'ENNEMI",color:'#f59e0b',t:0.9}; return; }
  const o=c.order[c.turn], ent=curEntity();
  if(!ent || !ent.alive){ c.turn++; return; }
  if(o.type==='ally'){
    const tgt=c.enemies.find(e=>e.hp>0);
    if(tgt){ dealEnemyDamage(ent,tgt,20); addLog(`${ent.name} soutient : 20 dégâts`);
      const ep=enemyPos(tgt.index,c.enemies.length); burst(ep.x,ep.y,'#86efac',8,90); }
    c.act={kind:'ally',actor:ent,t:0,dur:0.45}; c.phase='act'; return;
  }
  const h=ent;
  if(getStatus(h,'stun')||getStatus(h,'sleep')){ addLog(`${h.name} ne peut pas agir !`);
    const p=heroPos(o.idx,c.heroes.length); floater(p.x,p.y-30,'ZzZ','#94a3b8',9); c.act={kind:'skip',actor:h,t:0,dur:0.6}; c.phase='act'; return; }
  // CONFUS : 50% de chance de frapper un allié à la place
  if(getStatus(h,'confuse') && crand()<0.5){
    const others=c.heroes.filter(x=>x.alive && x!==h);
    if(others.length){ const v=others[Math.floor(crand()*others.length)], dmg=15;
      v.hp=Math.max(0,v.hp-dmg); v.flash=1; const vp=heroPos(c.heroes.indexOf(v),c.heroes.length);
      burst(vp.x,vp.y,'#ef4444',8,90); floater(vp.x,vp.y-28,String(dmg),'#fca5a5',12); addLog(`${h.name} (confus) frappe ${v.name} !`); if(v.hp<=0)v.alive=false; }
    c.act={kind:'skip',actor:h,t:0,dur:0.6}; c.phase='act'; return;
  }
  // EN LIGNE : attendre l'action relayée du joueur distant ; garde-fou IA anti-blocage
  if(playMode==='online' && !isMyHero(h.index)){
    if(c.waitTurn!==c.turn){ c.waitTurn=c.turn; c.waitT=0; }
    c.waitT=(c.waitT||0)+dt;
    if(c.waitT<6) return;
    const en=c.enemies.filter(e=>e.hp>0); applyingRemote=true;
    if(h.en>=20 && en.length) runHeroAction(h,HERO_ATTACKS[4],en[Math.floor(crand()*en.length)],o.idx);
    else runHeroAction(h,HERO_ATTACKS[0],h,o.idx);
    applyingRemote=false; return;
  }
  if(playMode==='online') c.waitT=0;
  if(!c.targetMode){
    if(jp('ArrowUp')&&c.sel>0)c.sel--; if(jp('ArrowDown')&&c.sel<HERO_ATTACKS.length-1)c.sel++;
    if(jp('Enter')||jp('Space')){ const atk=HERO_ATTACKS[c.sel];
      if(atk.cost>h.en){ addLog('Pas assez d\'énergie !'); const p=heroPos(o.idx,c.heroes.length); floater(p.x,p.y-30,'!','#ef4444',10); return; }
      if(atk.effect==='atk_boost_all'||atk.effect==='dodge_boost') runHeroAction(h,atk,null,o.idx);
      else { c.targetMode=true; c.selTarget=0; } }
  } else {
    const isAtk=HERO_ATTACKS[c.sel].effect==='damage';
    const tgts=isAtk?c.enemies.filter(e=>e.hp>0):c.heroes.filter(x=>x.alive);
    if(jp('ArrowUp')&&c.selTarget>0)c.selTarget--; if(jp('ArrowDown')&&c.selTarget<tgts.length-1)c.selTarget++;
    if(jp('Enter')||jp('Space')){ const tg=tgts[c.selTarget]; if(tg) runHeroAction(h,HERO_ATTACKS[c.sel],tg,o.idx); }
    if(jp('Escape')){ c.targetMode=false; c.selTarget=0; }
  }
}
function dealEnemyDamage(src,enemy,dmg){
  enemy.hp=Math.max(0,enemy.hp-dmg); enemy.flash=1; enemy.ox=rand(-3,3); enemy.oy=rand(-3,3);
  if(enemy.isBoss && enemy.kind==='clock' && enemy.hp<enemy.maxHp*0.25) enemy.rage=true;
  if(enemy.kind==='pierre' && enemy.hp<enemy.maxHp*0.5) enemy.phase2=true;
}
function runHeroAction(h,atk,target,heroIdx){
  const c=combat;
  if(playMode==='online' && isMyHero(h.index) && !applyingRemote)
    sendWS({type:'CB_ACT', heroIndex:h.index, sel:HERO_ATTACKS.indexOf(atk), tgt: target?(atk.effect==='damage'?target.index:c.heroes.indexOf(target)):-1});
  h.en=Math.max(0,h.en-atk.cost); c.targetMode=false; c.sel=0; c.selTarget=0;
  c.act={ kind:'hero', actor:h, atk, target, heroIdx, t:0, dur:0.55, applied:false }; c.phase='act';
}
function applyRemoteAct(m){
  const c=combat; if(!c)return; const o=c.order[c.turn];
  if(!o||o.type!=='hero'||c.phase!=='choose'||c.heroes[o.idx].index!==m.heroIndex) return;
  const h=c.heroes[o.idx], atk=HERO_ATTACKS[m.sel]; if(!atk)return;
  let target=null; if(atk.effect==='damage') target=c.enemies[m.tgt]; else if(m.tgt>=0) target=c.heroes[m.tgt];
  applyingRemote=true; runHeroAction(h,atk,target,o.idx); applyingRemote=false;
}
function applyHeroEffect(h,atk,target){
  const c=combat; const hi=c.heroes.indexOf(h), hp=heroPos(hi,c.heroes.length);
  switch(atk.effect){
    case 'damage':{ let dmg=atk.amount;
      if(getStatus(h,'atk_boost'))dmg=Math.floor(dmg*(1+getStatus(h,'atk_boost').value));
      if(getStatus(h,'atk_debuff'))dmg=Math.floor(dmg*(1+getStatus(h,'atk_debuff').value));
      if(getStatus(target,'def_debuff'))dmg=Math.floor(dmg*(1+getStatus(target,'def_debuff').value));
      dealEnemyDamage(h,target,dmg);
      const ep=enemyPos(target.index,c.enemies.length);
      burst(ep.x,ep.y,'#fca5a5',16,140,{up:30}); ring(ep.x,ep.y,'#fff',46); floater(ep.x,ep.y-20,String(dmg),'#fecaca',14);
      screenFlash('#ffffff',0.25); addShake(7,0.3); addLog(`${h.name} → ${dmg} dégâts à ${target.name}`); break; }
    case 'heal_ally':{ target.hp=Math.min(target.maxHp,target.hp+atk.amount); const tp=heroPos(c.heroes.indexOf(target),c.heroes.length);
      burst(tp.x,tp.y-10,'#4ade80',14,70,{up:40,grav:60}); floater(tp.x,tp.y-30,'+'+atk.amount,'#86efac',12); addLog(`${h.name} soigne ${target.name} (+${atk.amount})`); break; }
    case 'energy_ally':{ target.en=Math.min(target.maxEn,target.en+atk.amount); const tp=heroPos(c.heroes.indexOf(target),c.heroes.length);
      floater(tp.x,tp.y-30,'+'+atk.amount+' EN','#60a5fa',10); addLog(`${h.name} → +${atk.amount} énergie à ${target.name}`); break; }
    case 'atk_boost_all': c.heroes.filter(x=>x.alive).forEach(x=>addStatus(x,'atk_boost',atk.pct,atk.dur));
      c.heroes.filter(x=>x.alive).forEach(x=>{const p=heroPos(c.heroes.indexOf(x),c.heroes.length);floater(p.x,p.y-30,'ATK+','#f59e0b',9);});
      screenFlash('#f59e0b',0.2); addLog(`Attaque +${Math.floor(atk.pct*100)}% (3 tours)`); break;
    case 'dodge_boost': c.heroes.filter(x=>x.alive).forEach(x=>addStatus(x,'dodge_boost',atk.pct,atk.dur)); screenFlash('#06b6d4',0.2); addLog('Esquive élargie (2 tours)'); break;
  }
  checkEnd();
}
function combatAct(dt){
  const c=combat, a=c.act; a.t+=dt;
  if(a.kind==='hero'){ const k=a.t/a.dur; const lunge=k<0.4?easeOutCubic(k/0.4):1-easeInOut((k-0.4)/0.6); a.actor.oy=-lunge*26;
    if(!a.applied && k>=0.4){ a.applied=true; applyHeroEffect(a.actor,a.atk,a.target); } }
  if(a.t>=a.dur){ a.actor.oy=0; c.act=null; c.turn++; if(c.phase==='act')c.phase='choose'; }
}
function buildEnemyQueue(){
  const c=combat; c.queue=[];
  for(const e of c.enemies.filter(e=>e.hp>0)){
    const count=(e.isBoss && e.hp<e.maxHp*0.25)?2:1;
    for(let i=0;i<count;i++){
      if(e.pendingDelayed){ c.queue.push({enemy:e,atk:{name:'...le devoir tombe',dir:null,dmg:40,effect:'unavoidable_fixed'},unavoidable:true}); e.pendingDelayed=false; continue; }
      c.queue.push({enemy:e,atk:e.attacks[Math.floor(crand()*e.attacks.length)]});
    }
  }
}
function nextAttack(){
  const c=combat;
  if(c.queue.length===0){ c.phase='roundEnd'; return; }
  const {enemy,atk,unavoidable}=c.queue.shift();
  if(enemy.hp<=0){ nextAttack(); return; }
  const alive=c.heroes.filter(h=>h.alive); if(alive.length===0){ doDefeat(); return; }
  let targets;
  if(atk.all) targets=alive.slice();
  else if(atk.effect==='highest_hp') targets=[alive.reduce((a,b)=>a.hp>b.hp?a:b)];
  else if(atk.effect==='double_low_hp'){ const lo=alive.filter(h=>h.hp<h.maxHp*0.5); targets=[(lo.length?lo:alive)[Math.floor(crand()*(lo.length||alive.length))]]; }
  else targets=[alive[Math.floor(crand()*alive.length)]];
  const unavoid=unavoidable||(atk.effect==='unavoidable_low'&&targets.some(h=>h.hp<h.maxHp*0.4));
  c.cur={ enemy, atk, targets, idx:0, unavoid, results:targets.map(()=>false) };
  c.banner=null; c.phase='announce'; c.timer=1.2; enemy.oy=8; addShake(4,0.3);
}
function combatAnnounce(dt){
  const c=combat; c.timer-=dt; c.cur.enemy.oy=lerp(c.cur.enemy.oy,0,clamp(dt*6,0,1));
  if(c.timer<=0){
    if(c.cur.unavoid){ for(const h of c.cur.targets) applyEnemyHit(c.cur.atk,h,false);
      c.pop={str:'IMPARABLE !',color:'#ef4444',t:0.8}; addShake(9,0.4); screenFlash('#7f1d1d',0.35); finishAttack(); }
    else startDodgeFor(0);
  }
}
function startDodgeFor(idx){
  const c=combat;
  if(idx>=c.cur.targets.length){ finishAttack(); return; }
  c.cur.idx=idx; const h=c.cur.targets[idx];
  if(!h.alive){ startDodgeFor(idx+1); return; }
  let window=0.6, delay=0.8;
  if(getStatus(h,'dodge_boost')){ window*=1+getStatus(h,'dodge_boost').value; delay-=0.2; }
  if(getStatus(h,'dodge_debuff')){ window*=1-getStatus(h,'dodge_debuff').value; }
  window*=DIFF().dodge; // fenêtre d'esquive selon la difficulté
  c.qte={ h, atk:c.cur.atk, dir:c.cur.atk.dir, window, delay, t:0, controlled:isMyHero(h.index), done:false }; c.phase='dodge';
}
function updateDodge(dt){
  const c=combat, q=c.qte; if(!q||q.done)return; q.t+=dt; const armed=q.t>=q.delay;
  if(q.controlled){
    if(armed){ for(const code of ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown']) if(jp(code)){ resolveDodge(keyToDir(code)===q.dir); return; } }
    if(armed && q.t>q.delay+q.window) resolveDodge(false);
  } else if(playMode==='online'){
    if(q.t>q.delay+q.window+2) resolveDodge(crand()>0.5);   // attend le résultat relayé, sinon garde-fou
  } else {
    if(q.t>q.delay+0.25) resolveDodge(crand()>0.5);          // IA locale (solo/local)
  }
}
function resolveDodge(success){
  const c=combat, q=c.qte; q.done=true;
  if(playMode==='online' && isMyHero(q.h.index) && !applyingRemote) sendWS({type:'CB_DODGE', heroIndex:q.h.index, success});
  const hpos=heroPos(c.heroes.indexOf(q.h),c.heroes.length);
  c.cur.results[c.cur.idx]=success;
  if(success){ c.pop={str:'✓ ESQUIVÉ !',color:'#4ade80',t:0.7}; ring(hpos.x,hpos.y,'#22d3ee',50); burst(hpos.x,hpos.y,'#67e8f9',12,90); addLog(`${q.h.name} esquive !`); }
  else { applyEnemyHit(q.atk,q.h,false); c.pop={str:'✗ TOUCHÉ !',color:'#ef4444',t:0.7}; }
  c.qte=null; c.phase='dodgeResult'; c.timer=0.55;
}
function afterDodge(){ const c=combat; if(c.cur.idx+1<c.cur.targets.length) startDodgeFor(c.cur.idx+1); else finishAttack(); }
function finishAttack(){ combat.cur=null; combat.phase='nextAttack'; checkEnd(); }
function applyEnemyHit(atk,h,dodged){
  if(dodged)return; const c=combat; const hpos=heroPos(c.heroes.indexOf(h),c.heroes.length);
  let dmg=atk.dmg||0;
  if(atk.effect==='double_low_hp'&&h.hp<h.maxHp*0.5) dmg*=2;
  if(atk.effect==='all_half_dodge') dmg=Math.floor(dmg*0.5);
  if(atk.effect==='random_5_45') dmg=5+Math.floor(crand()*41);
  if(atk.effect==='triple_miss') dmg*=2;
  dmg=Math.round(dmg*DIFF().dmg); // modulation par la difficulté
  if(dmg>0){ h.hp=Math.max(0,h.hp-dmg); h.flash=1; h.ox=rand(-4,4);
    burst(hpos.x,hpos.y,'#ef4444',14,120,{up:20}); floater(hpos.x,hpos.y-28,String(dmg),'#fecaca',13); addShake(8,0.32); screenFlash('#7f1d1d',0.25); addLog(`${h.name} subit ${dmg} dégâts`); }
  switch(atk.effect){
    case 'stun': addStatus(h,'stun',1,2); addLog(`${h.name} étourdi`); break;
    case 'skip_turn': addStatus(h,'stun',1,2); break;
    case 'sleep_all': if(crand()<0.5){ addStatus(h,'sleep',1,2); addLog(`${h.name} s'endort`); } break;
    case 'confuse': addStatus(h,'confuse',1,2); break;
    case 'atk_debuff_male': if(h.name==='RUBINS'||h.name==='MAEL') addStatus(h,'atk_debuff',-0.15,atk.dur||2); break;
    case 'atk_debuff': addStatus(h,'atk_debuff',-(atk.pct||0.3),atk.dur||3); break;
    case 'def_debuff_rand': addStatus(h,'def_debuff',0.20,2); break;
    case 'energy_drain_all': h.en=Math.max(0,h.en-15); break;
    case 'steal_energy': h.en=Math.max(0,h.en-(atk.amount||10)); break;
    case 'dodge_debuff': addStatus(h,'dodge_debuff',0.30,atk.dur||1); break;
    case 'reduce_maxhp': h.maxHp=Math.max(10,h.maxHp-(atk.amount||20)); h.hp=Math.min(h.hp,h.maxHp); break;
    case 'cancel_buff': h.status=h.status.filter(s=>!['atk_boost','dodge_boost'].includes(s.key)); break;
    case 'delayed': { const e=c.cur.enemy; e.pendingDelayed=true; addLog('THÉO prépare un coup...'); } break;
  }
  if(h.hp<=0){ h.alive=false; addLog(`${h.name} est K.O. !`); burst(hpos.x,hpos.y,'#475569',20,100); }
}
function checkEnd(){ if(!combat)return; if(combat.enemies.every(e=>e.hp<=0)) doVictory(); else if(combat.heroes.every(h=>!h.alive)) doDefeat(); }
function doVictory(){
  if(combat.victory||combat.defeat)return; combat.victory=true; combat.phase='victory'; combat.timer=2.2;
  combat.banner={str:'VICTOIRE !',color:'#4ade80',t:2.2}; burst(W/2,H/2,'#4ade80',40,160,{up:40,life:1.2});
  combat.heroes.forEach(ch=>{ const h=heroes.find(x=>x.index===ch.index); if(h){ h.hp=ch.hp; h.en=ch.en; h.alive=ch.alive; h.maxHp=ch.maxHp; h.status=[]; } });
}
function doDefeat(){ if(combat.victory||combat.defeat)return; combat.defeat=true; combat.phase='defeat'; combat.timer=2.2; combat.banner={str:'DÉFAITE',color:'#ef4444',t:2.2}; }
function endVictory(){
  const id=combat.bossId; combat=null;
  if(id==='boss3'){ fadeOut(()=>{ startDialogue(filterDlg(DIALOGUES.ending),()=>{ G_state=STATE.WIN; }); G_prev=STATE.WIN; }); }
  else {
    // entre deux boss : on restaure l'équipe (soin complet, réanimation, énergie, statuts purgés)
    heroes.forEach(h=>{ const d=HERO_DEFS[h.index]; h.maxHp=d.maxHp; h.hp=d.maxHp; h.en=d.maxEn; h.alive=true; h.status=[]; });
    if(id==='boss2') startApologyKick();   // excuses + « ui bas ui » + coup de pied
    else G_state=STATE.OVERWORLD;
  }
}

// ── COMBAT DRAW ──────────────────────────────────────────────────────
function drawCombat(){
  const c=combat; if(!c)return;
  const bg={boss1:['#15152e','#0a0a18'],boss2:['#1f0a0a','#0f0505'],boss3:['#160a1e','#0a0510']}[c.bossId];
  const g=oc.createLinearGradient(0,0,0,H); g.addColorStop(0,bg[0]); g.addColorStop(1,bg[1]); oc.fillStyle=g; oc.fillRect(0,0,W,H);
  oc.strokeStyle='rgba(255,255,255,0.05)'; oc.lineWidth=1; for(let i=0;i<6;i++){ const y=200+i*30; oc.beginPath(); oc.moveTo(0,y); oc.lineTo(W,y); oc.stroke(); }
  const boss=c.enemies.find(e=>e.isBoss);
  if(boss&&(boss.rage||boss.phase2)){ oc.globalAlpha=0.15+0.1*Math.sin(gtime*8);
    const rg=oc.createRadialGradient(W/2,H/2,80,W/2,H/2,360); rg.addColorStop(0,'rgba(0,0,0,0)'); rg.addColorStop(1,'#7f1d1d'); oc.fillStyle=rg; oc.fillRect(0,0,W,H); oc.globalAlpha=1; }

  const n=c.enemies.length;
  c.enemies.forEach((e,i)=>{ if(e.hp<=0)return; const p=enemyPos(i,n), x=p.x+e.ox, y=p.y+e.oy, fl=e.flash>0;
    if(fl) oc.globalAlpha=clamp(e.flash,0,1);
    if(e.kind==='clock') drawClock(x,y,e.displayHp,e.maxHp,e.rage,gtime);
    else if(e.kind==='pierre') drawPierre(x,y,e.displayHp,e.maxHp,e.phase2,gtime);
    else drawTraitor(x,y,e.def,e.displayHp/e.maxHp,gtime,{flash:fl?1:0});
    oc.globalAlpha=1; });

  // allies — prominent front line (they fight WITH us in boss 1)
  c.allies.forEach((a,i)=>{ if(!a.alive)return; const p=allyPos(i,c.allies.length);
    const o=c.order[c.turn], active=o&&o.type==='ally'&&o.idx===i;
    if(active){ oc.globalAlpha=0.28; circle(p.x,p.y+12,16,a.color); oc.globalAlpha=1; }
    drawHero(p.x,p.y,{color:a.color,shade:a.shade},1.6,{bob:gtime*3+i});
    fillRect(p.x-22,p.y+16,44,5,'#0b0b14'); fillRect(p.x-21,p.y+17,42*(a.displayHp/a.maxHp),3,'#22c55e');
    text(a.name.slice(0,6),p.x,p.y-26,a.color,5,'center'); text('ALLIÉ',p.x,p.y+30,'#16a34a',4,'center'); });

  const hn=c.heroes.length;
  c.heroes.forEach((h,i)=>{ const p=heroPos(i,hn), x=p.x+h.ox, y=p.y+h.oy;
    const o=c.order[c.turn], active=o&&o.type==='hero'&&o.idx===i&&c.phase==='choose';
    if(active){ oc.globalAlpha=0.3; circle(x,y+14,18,h.color); oc.globalAlpha=1; }
    drawHero(x,y,h,2,{bob:gtime*3+i,flash:h.flash,ko:!h.alive});
    if(c.qte&&c.qte.h===h&&Math.sin(gtime*10)>0) text('!',x,y-34,'#fbbf24',14,'center'); });

  drawParticles(); drawFloaters(); drawCombatHUD();

  const o=c.order[c.turn];
  if(o&&o.type==='hero'&&c.phase==='choose'){ const h=c.heroes[o.idx]; if(h&&h.alive){ if(c.targetMode) drawTargetMenu(h); else drawActionMenu(h); } }

  if(c.phase==='announce'&&c.cur){ const k=1-clamp(c.timer/1.2,0,1), a=Math.min(1,k*3); oc.globalAlpha=a;
    roundRect(W/2-200,H/2-94,400,52,6,'rgba(8,4,4,0.9)'); strokeRect(W/2-200,H/2-94,400,52,'#dc2626',2);
    text(c.cur.enemy.name+' utilise',W/2,H/2-72,'#f87171',7,'center'); text(c.cur.atk.name,W/2,H/2-52,'#fecaca',c.cur.atk.name.length>22?8:11,'center'); oc.globalAlpha=1; }
  if(c.phase==='dodge'&&c.qte) drawDodgeQTE();
  if(c.pop){ const k=1-c.pop.t/0.7, sc=easeOutBack(clamp(k*2,0,1)); oc.save(); oc.translate(W/2,H/2-10); oc.scale(sc,sc); text(c.pop.str,0,0,c.pop.color,22,'center'); oc.restore(); }
  if(c.banner){ const a=clamp(c.banner.t*2,0,1); oc.globalAlpha=a; fillRect(0,H/2-30,W,60,'rgba(0,0,0,0.6)'); text(c.banner.str,W/2,H/2+8,c.banner.color,22,'center'); oc.globalAlpha=1; }
  roundRect(W-206,4,202,72,4,'rgba(8,8,18,0.7)'); c.log.forEach((m,i)=>text(m.slice(0,26),W-200,18+i*16,i===0?'#e5e7eb':'#64748b',5));
}
function drawCombatHUD(){
  const c=combat, hudY=H-118, hn=c.heroes.length; roundRect(0,hudY,W,118,0,'rgba(6,6,14,0.92)'); strokeRect(0,hudY,W,2,'#312e81',1);
  const cardW=Math.min((W-20)/hn,152), totalW=cardW*hn, startX=(W-totalW)/2;
  c.heroes.forEach((h,i)=>{ const hx=startX+i*cardW;
    const o=c.order[c.turn], active=o&&o.type==='hero'&&o.idx===i&&c.phase==='choose';
    roundRect(hx+2,hudY+6,cardW-8,106,4,active?'rgba(124,58,237,0.12)':'rgba(255,255,255,0.03)'); strokeRect(hx+2,hudY+6,cardW-8,106,active?h.color:'#27272a',active?2:1);
    drawHero(hx+20,hudY+34,h,1,{flash:h.flash,ko:!h.alive});
    text(h.name,hx+36,hudY+20,active?h.color:'#cbd5e1',7);
    if(active&&Math.sin(gtime*8)>0) text('◄ TON TOUR',hx+36,hudY+102,h.color,5);
    const bw=cardW-48; fillRect(hx+36,hudY+26,bw,9,'#0b0b14'); const hpct=clamp(h.displayHp/h.maxHp,0,1);
    fillRect(hx+37,hudY+27,(bw-2)*hpct,7,hpct>0.5?'#22c55e':hpct>0.25?'#f59e0b':'#ef4444');
    text(`${Math.max(0,Math.round(h.hp))}/${h.maxHp}`,hx+38,hudY+44,'#94a3b8',5);
    fillRect(hx+36,hudY+50,bw,6,'#0b0b14'); fillRect(hx+37,hudY+51,(bw-2)*clamp(h.en/h.maxEn,0,1),4,'#3b82f6'); text('EN '+h.en,hx+38,hudY+64,'#64748b',5);
    h.status.forEach((s,si)=>{ const sx=hx+36+si*26, sy=hudY+70;
      const lab={stun:'STUN',sleep:'ZzZ',confuse:'CONF',atk_boost:'ATK+',dodge_boost:'ESQ+',atk_debuff:'ATK-',def_debuff:'DEF-',dodge_debuff:'ESQ-'}[s.key]||s.key;
      roundRect(sx,sy,24,10,2,'#1a1a2e'); text(lab,sx+2,sy+8,'#fbbf24',4); });
    if(!h.alive){ roundRect(hx+2,hudY+6,cardW-8,106,4,'rgba(0,0,0,0.55)'); text('K.O.',hx+cardW/2,hudY+62,'#ef4444',11,'center'); }
  });
}
function drawActionMenu(h){
  const c=combat, mx=W-214, my=H-232; roundRect(mx,my,206,108,5,'rgba(8,8,18,0.96)'); strokeRect(mx,my,206,108,'#6366f1',2); text('ACTION',mx+6,my+13,'#a78bfa',7);
  HERO_ATTACKS.forEach((a,i)=>{ const ay=my+22+i*17, sel=i===c.sel, ok=a.cost<=h.en;
    if(sel) roundRect(mx+3,ay-7,200,16,2,'#1e1b4b'); text((sel?'▶ ':'  ')+a.name,mx+8,ay+4,sel?'#fff':ok?'#94a3b8':'#475569',6);
    if(a.cost>0) text(a.cost+'',mx+186,ay+4,ok?'#60a5fa':'#475569',5,'right'); });
  // description de l'attaque sélectionnée
  const sa=HERO_ATTACKS[c.sel];
  if(sa.desc){ roundRect(mx,my-36,206,32,4,'rgba(8,8,18,0.96)'); strokeRect(mx,my-36,206,32,'#312e81',1); wrapText(sa.desc,mx+6,my-24,194,9,'#a5b4fc'); }
}
function drawTargetMenu(h){
  const c=combat, isAtk=HERO_ATTACKS[c.sel].effect==='damage'; const tgts=isAtk?c.enemies.filter(e=>e.hp>0):c.heroes.filter(x=>x.alive);
  const mw=200, mh=tgts.length*20+24, mx=W/2-mw/2, my=40; roundRect(mx,my,mw,mh,5,'rgba(8,8,18,0.96)'); strokeRect(mx,my,mw,mh,'#f59e0b',2);
  text(isAtk?'CIBLE :':'ALLIÉ :',W/2,my+14,'#fbbf24',7,'center');
  tgts.forEach((t,i)=>{ const ty=my+26+i*20, sel=i===c.selTarget; if(sel) roundRect(mx+4,ty-9,mw-8,18,2,'#1a1a2e');
    text((sel?'▶ ':'  ')+t.name,mx+10,ty+3,sel?'#fff':'#94a3b8',6); text(Math.round(t.hp/t.maxHp*100)+'%',mx+mw-12,ty+3,sel?'#4ade80':'#64748b',5,'right'); });
}
function drawDodgeQTE(){
  const c=combat, q=c.qte; if(!q)return; const armed=q.t>=q.delay; const left=q.window-(q.t-q.delay); const pct=armed?clamp(left/q.window,0,1):1;
  roundRect(W/2-180,H/2-86,360,120,8,'rgba(6,6,16,0.94)'); strokeRect(W/2-180,H/2-86,360,120,'#6366f1',2); text('ESQUIVE — '+q.h.name,W/2,H/2-66,q.h.color,9,'center');
  if(!armed){ if(Math.sin(q.t*16)>0) text('PRÉPARE-TOI',W/2,H/2-20,'#fbbf24',11,'center'); const tr=lerp(60,18,q.t/q.delay);
    oc.strokeStyle='#f59e0b'; oc.lineWidth=2; oc.beginPath(); oc.arc(W/2,H/2-12,tr,0,TAU); oc.stroke();
  } else { const col=pct>0.4?'#4ade80':pct>0.2?'#f59e0b':'#ef4444'; const sc=easeOutBack(clamp((q.t-q.delay)*6,0,1));
    oc.save(); oc.translate(W/2,H/2-8); oc.scale(sc,sc); oc.font='52px "Press Start 2P", monospace'; oc.textAlign='center'; oc.fillStyle=col; oc.fillText(q.dir,0,18); oc.textAlign='left'; oc.restore();
    fillRect(W/2-120,H/2+18,240,10,'#0b0b14'); fillRect(W/2-119,H/2+19,238*pct,8,col);
    if(!q.controlled) text('(IA)',W/2,H/2+42,'#64748b',6,'center'); else text('Flèche correcte = esquive',W/2,H/2+42,'#475569',5,'center'); }
}

// ── SYNCHRO EN LIGNE (hôte autoritaire pour l'overworld/dialogues/cinématiques ; combat en lockstep) ──
const ONLINE=()=>playMode==='online';
const HOST=()=>ONLINE()&&playerIndex===0;
const CLIENT=()=>ONLINE()&&playerIndex!==0;
const MIRROR_STATES=[STATE.OVERWORLD,STATE.DIALOGUE,STATE.BETRAYAL,STATE.KICK,STATE.BOSS_INTRO];
let _syncAcc=0, _lastSyncG=null;
const cdef=o=>({name:o.name,color:o.color,shade:o.shade,hair:o.hair,alive:o.alive!==false});
function buildSync(){
  const s={ g:G_state, z:currentZone, fa:fade.a, df:difficulty,
    p:{gx:player.gx,gy:player.gy,px:Math.round(player.px),py:Math.round(player.py),dir:player.dir,frame:player.frame,mv:player.moving?1:0},
    pa:party.map(f=>({px:Math.round(f.px),py:Math.round(f.py),dir:f.dir,frame:f.frame,npc:f.isNPC?1:0,
      name:f.def.name,color:f.def.color,shade:f.def.shade,hair:f.def.hair,al:f.def.alive!==false?1:0})),
    fl:{i:introDone?1:0,c:clockInteracted?1:0,t:traitorDone?1:0},
    dl:(dlg&&dlg.lines&&dlg.lines.length)?{i:dlg.i,ch:dlg.ch,L:dlg.lines}:null,
    bz:betrayal?{ph:betrayal.phase,ct:betrayal.climaxT,pa:betrayal.pierreA,
      n:betrayal.npcs.map(n=>({x:Math.round(n.x),y:n.y,red:n.red,dir:n.dir,name:n.def.name,color:n.def.color,shade:n.def.shade,hair:n.def.hair}))}:null,
    kk:kick?{ph:kick.phase,kt:kick.kickT,
      h:kick.heroes.map(h=>({x:Math.round(h.x+(h.ox||0)),y:h.y,name:h.def.name,color:h.def.color,shade:h.def.shade,hair:h.def.hair,al:h.def.alive!==false?1:0})),
      t:kick.traitors.map(t=>({x:Math.round(t.x),y:Math.round(t.y),rot:t.rot,name:t.def.name,color:t.def.color,shade:t.def.shade,hair:t.def.hair}))}:null,
    bi:bossIntro?{t:bossIntro.t}:null };
  return s;
}
function applySync(s){
  if(!s||!player)return;
  G_state=s.g; currentZone=s.z; fade.a=s.fa||0; fade.dir=0; difficulty=s.df;
  player.gx=s.p.gx; player.gy=s.p.gy; player.dir=s.p.dir; player.frame=s.p.frame; player.moving=!!s.p.mv;
  player._tx=s.p.px; player._ty=s.p.py; if(player.px==null){player.px=s.p.px;player.py=s.p.py;}
  party=s.pa.map(f=>({px:f.px,py:f.py,_tx:f.px,_ty:f.py,dir:f.dir,frame:f.frame,isNPC:!!f.npc,
    def:{name:f.name,color:f.color,shade:f.shade,hair:f.hair,alive:!!f.al}}));
  introDone=!!s.fl.i; clockInteracted=!!s.fl.c; traitorDone=!!s.fl.t;
  dlg = s.dl?{lines:s.dl.L,i:s.dl.i,ch:s.dl.ch,t:0,cb:null}:dlg;
  betrayal = s.bz?{phase:s.bz.ph,climaxT:s.bz.ct,pierreA:s.bz.pa,bursted:true,
    npcs:s.bz.n.map(n=>({x:n.x,y:n.y,red:n.red,dir:n.dir,def:{name:n.name,color:n.color,shade:n.shade,hair:n.hair}}))}:null;
  kick = s.kk?{phase:s.kk.ph,kickT:s.kk.kt,launched:true,
    heroes:s.kk.h.map(h=>({x:h.x,ox:0,y:h.y,def:{name:h.name,color:h.color,shade:h.shade,hair:h.hair,alive:!!h.al}})),
    traitors:s.kk.t.map(t=>({x:t.x,y:t.y,rot:t.rot,vx:0,vy:0,spin:0,def:{name:t.name,color:t.color,shade:t.shade,hair:t.hair}}))}:null;
  bossIntro = s.bi?{t:s.bi.t,slammed:true}:null;
}
function netClientMirror(dt){
  // interpolation douce vers les positions reçues
  if(player&&player._tx!=null){ player.px=lerp(player.px,player._tx,clamp(dt*12,0,1)); player.py=lerp(player.py,player._ty,clamp(dt*12,0,1)); }
  if(party) for(const f of party){ if(f._tx!=null){ f.px=lerp(f.px,f._tx,clamp(dt*12,0,1)); f.py=lerp(f.py,f._ty,clamp(dt*12,0,1)); } }
  if(G_state===STATE.OVERWORLD) updateCamera(dt);
}
function netHostBroadcast(dt){
  if(_lastSyncG!==G_state){ _lastSyncG=G_state; if(MIRROR_STATES.includes(G_state)) sendWS({type:'SYNC',s:buildSync()}); }
  if(MIRROR_STATES.includes(G_state)){ _syncAcc+=dt; if(_syncAcc>=0.07){ _syncAcc=0; sendWS({type:'SYNC',s:buildSync()}); } }
}

// ── NETWORK ──────────────────────────────────────────────────────────
// Retry auto : sur Render gratuit, le serveur "dort" après 15 min ; la 1re connexion
// peut échouer ~30-50s le temps du réveil. On réessaie jusqu'à ce qu'il réponde.
let _wsOnOpen=null, _wsTries=0, netMsg='';
function connectWS(onOpen){ _wsOnOpen=onOpen; _wsTries=0; netMsg='Connexion...'; _wsConnect(); }
function _wsConnect(){
  try{
    ws=new WebSocket(WS_URL); let opened=false;
    ws.onopen=()=>{ opened=true; _wsTries=0; netMsg=''; if(_wsOnOpen)_wsOnOpen(); };
    ws.onmessage=e=>{ let m; try{m=JSON.parse(e.data);}catch{return;} handleWS(m); };
    ws.onerror=()=>{};
    ws.onclose=()=>{ ws=null; if(!opened){
      if(_wsTries<12){ _wsTries++; netMsg='Réveil du serveur ('+(_wsTries*5)+'s)...'; setTimeout(_wsConnect,5000); }
      else netMsg='Échec de connexion — réessaie.'; } };
  }catch(e){ if(_wsTries<12){ _wsTries++; setTimeout(_wsConnect,5000); } }
}
function sendWS(m){ if(ws&&ws.readyState===1) ws.send(JSON.stringify(m)); }
function handleWS(m){
  switch(m.type){
    case 'ROOM_CREATED': roomCode=m.code; playerIndex=m.playerIndex; break;
    case 'ROOM_JOINED': roomCode=m.code; playerIndex=m.playerIndex; break;
    case 'GAME_START': if(m.totalPlayers) playerCount=m.totalPlayers; startNewGame(); break;
    case 'SYNC': if(CLIENT()) applySync(m.s); break;
    case 'START_COMBAT': if(CLIENT()){ difficulty=m.diff; ({boss1:startBoss1,boss2:startBoss2,boss3:startBoss3}[m.bossId]||(()=>{}))(); } break;
    case 'CB_ACT': if(!isMyHero(m.heroIndex)) applyRemoteAct(m); break;
    case 'CB_DODGE': if(combat && combat.qte && !combat.qte.done && !isMyHero(m.heroIndex) && combat.qte.h.index===m.heroIndex){ applyingRemote=true; resolveDodge(m.success); applyingRemote=false; } break;
    case 'ERROR': roomSub='choose'; break;
  }
}

// ── WIN / GAME OVER ──────────────────────────────────────────────────
function updateEndScreens(){ if(jp('Enter')||jp('Space')){ initGame(); G_state=STATE.TITLE; } }
function drawWin(){
  const g=oc.createLinearGradient(0,0,0,H); g.addColorStop(0,'#0a1a0f'); g.addColorStop(1,'#05100a'); oc.fillStyle=g; oc.fillRect(0,0,W,H);
  for(let i=0;i<40;i++){ const x=(i*97+gtime*14)%W, y=(i*53)%H; oc.globalAlpha=0.4+0.4*Math.sin(gtime*2+i); circle(x,y,1.2,'#4ade80'); } oc.globalAlpha=1;
  oc.shadowColor='#22c55e'; oc.shadowBlur=20; text('VICTOIRE',W/2,H/2-50,'#4ade80',30,'center'); oc.shadowBlur=0;
  text("Le monde n'a pas changé.",W/2,H/2+12,'#94a3b8',8,'center'); text('Mais vous, oui.',W/2,H/2+32,'#64748b',8,'center');
  if(Math.sin(gtime*3)>0) text('ENTRÉE pour recommencer',W/2,H/2+78,'#475569',7,'center');
}
function drawGameOver(){
  fillRect(0,0,W,H,'#0a0204'); oc.globalAlpha=0.5+0.3*Math.sin(gtime*2); text('DÉFAITE',W/2,H/2-50,'#ef4444',30,'center'); oc.globalAlpha=1;
  text('Le système a gagné.',W/2,H/2+12,'#94a3b8',8,'center'); text('Cette fois.',W/2,H/2+32,'#64748b',8,'center');
  if(Math.sin(gtime*3)>0) text('ENTRÉE pour recommencer',W/2,H/2+78,'#475569',7,'center');
}

// ── MAIN LOOP ────────────────────────────────────────────────────────
function update(dt){
  gtime+=dt; envTime+=dt; updateFade(dt); updateEffects(dt);
  // CLIENT en ligne : on ne pilote pas l'overworld/dialogues/cinématiques, on reflète l'hôte
  if(CLIENT() && MIRROR_STATES.includes(G_state)){ netClientMirror(dt); return; }
  switch(G_state){
    case STATE.TITLE: updateTitle(dt); break;
    case STATE.PLAYER_COUNT: updatePlayerCount(dt); break;
    case STATE.DIFFICULTY: updateDifficulty(dt); break;
    case STATE.NAME_ENTRY: updateNameEntry(dt); break;
    case STATE.PLAY_MODE: updatePlayMode(dt); break;
    case STATE.ROOM: updateRoom(dt); break;
    case STATE.OVERWORLD: updateOverworld(dt); break;
    case STATE.DIALOGUE: updateDialogue(dt); break;
    case STATE.BETRAYAL: updateBetrayal(dt); break;
    case STATE.KICK: updateKick(dt); break;
    case STATE.BOSS_INTRO: updateBossIntro(dt); break;
    case STATE.COMBAT: updateCombat(dt); break;
    case STATE.WIN: case STATE.GAME_OVER: updateEndScreens(); break;
  }
  if(HOST()) netHostBroadcast(dt);   // l'hôte diffuse l'état du monde
}
function draw(){
  oc.clearRect(0,0,W,H); oc.textAlign='left';
  const sh=getShakeOffset(); oc.save(); oc.translate(sh.x,sh.y);
  switch(G_state){
    case STATE.TITLE: drawTitle(); break;
    case STATE.PLAYER_COUNT: drawPlayerCount(); break;
    case STATE.DIFFICULTY: drawDifficulty(); break;
    case STATE.NAME_ENTRY: drawNameEntry(); break;
    case STATE.PLAY_MODE: drawPlayMode(); break;
    case STATE.ROOM: drawRoom(); break;
    case STATE.OVERWORLD: drawOverworld(); break;
    case STATE.DIALOGUE: drawOverworld(); drawDialogue(); break;
    case STATE.BETRAYAL: drawBetrayal(); break;
    case STATE.KICK: drawKick(); break;
    case STATE.BOSS_INTRO: drawBossIntro(); break;
    case STATE.COMBAT: drawCombat(); break;
    case STATE.WIN: drawWin(); break;
    case STATE.GAME_OVER: drawGameOver(); break;
  }
  oc.restore();
  if(flashFx.a>0){ oc.fillStyle=hexToRgba(flashFx.color,flashFx.a); oc.fillRect(0,0,W,H); }
  drawFade();
  ctx.clearRect(0,0,1280,960); ctx.drawImage(off,0,0,1280,960);
}
function hexToRgba(hex,a){ if(hex.startsWith('#')){ const n=parseInt(hex.slice(1),16); return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${a})`; } return hex; }
function loop(ts){ const dt=Math.min((ts-lastTime)/1000,0.05); lastTime=ts; update(dt); draw(); clearInput(); requestAnimationFrame(loop); }

// ── BOOT ─────────────────────────────────────────────────────────────
initGame();
requestAnimationFrame(ts=>{ lastTime=ts; requestAnimationFrame(loop); });
