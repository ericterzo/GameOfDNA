/* Robot spaceship walk demo — shared by index.html (served) and standalone.html
   (single-file, model embedded). Plain script, no modules, so it runs from file://.
   Expects global THREE (+ THREE.GLTFLoader, THREE.RoomEnvironment).
   Model source: window.ROBOT_B64 (base64 GLB) if present, else window.ROBOT_SRC (url). */
(function () {
'use strict';

// ---------- UI (built in JS so both HTML shells stay tiny) ----------
var css = `
:root{color-scheme:dark}*{box-sizing:border-box}
html,body{margin:0;height:100%;background:#05060a;overflow:hidden;
  font:500 14px/1.4 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
  -webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent;touch-action:none}
#c{display:block;width:100vw;height:100vh}
.ui{position:fixed;pointer-events:none;color:#cfe3ff}
.top{top:max(14px,env(safe-area-inset-top));left:0;right:0;padding:0 18px;display:flex;justify-content:space-between;align-items:flex-start;gap:12px}
.title h1{margin:0;font-size:17px;letter-spacing:.5px;font-weight:700;color:#eaf2ff;text-shadow:0 2px 10px #000}
.title p{margin:3px 0 0;font-size:12.5px;color:#8fb0d8;text-shadow:0 2px 10px #000}
.btn{pointer-events:auto;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;gap:7px;
  background:rgba(20,32,54,.72);border:1px solid #2d466a;color:#dcebff;padding:9px 14px;border-radius:10px;
  font-size:13px;font-weight:600;backdrop-filter:blur(8px);transition:background .15s,transform .15s}
.btn:hover{background:rgba(32,52,86,.9);transform:translateY(-1px)}
.btn svg{width:15px;height:15px}
.hint{bottom:max(16px,env(safe-area-inset-bottom));left:0;right:0;text-align:center;font-size:12px;color:#7f9cc3;text-shadow:0 1px 6px #000;transition:opacity .6s}
#load{position:fixed;inset:0;display:grid;place-content:center;gap:14px;justify-items:center;background:#05060a;z-index:20;transition:opacity .6s;color:#9fc0ea}
#load.hide{opacity:0;pointer-events:none}
.ring{width:42px;height:42px;border-radius:50%;border:3px solid #1d2c44;border-top-color:#5aa0ff;animation:spin 1s linear infinite}
#bar{width:180px;height:4px;border-radius:3px;background:#15223a;overflow:hidden}
#bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,#4a86ff,#73e0ff);transition:width .2s}
@keyframes spin{to{transform:rotate(360deg)}}
/* joystick */
#stick{position:fixed;left:max(22px,env(safe-area-inset-left));bottom:max(26px,env(safe-area-inset-bottom));
  width:132px;height:132px;border-radius:50%;background:rgba(18,28,48,.45);border:1px solid #2a3f60;
  touch-action:none;z-index:15;backdrop-filter:blur(3px)}
#stick b{position:absolute;left:50%;top:50%;width:56px;height:56px;margin:-28px 0 0 -28px;border-radius:50%;
  background:radial-gradient(circle at 40% 35%,#6ea6ff,#2f5fb0);box-shadow:0 4px 14px rgba(0,0,0,.5);transition:background .1s}
#keys{position:fixed;right:max(18px,env(safe-area-inset-right));bottom:max(26px,env(safe-area-inset-bottom));
  font-size:11.5px;color:#6f8cb3;text-align:right;text-shadow:0 1px 6px #000;line-height:1.5}
kbd{display:inline-block;min-width:16px;padding:1px 5px;margin:0 1px;border:1px solid #3a4f6e;border-bottom-width:2px;
  border-radius:4px;background:#17233a;color:#bcd4ff;font:600 11px ui-monospace,monospace}
`;
var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

document.body.innerHTML =
  '<canvas id="c"></canvas>' +
  '<div id="load"><div class="ring"></div><div id="bar"><i></i></div><div id="lt">Loading robot…</div></div>' +
  '<div class="ui top"><div class="title"><h1>Robot · Rigged Walk Cycle</h1>' +
    '<p>Drive it through the spaceship</p></div>' +
    '<a class="btn" id="dl">' +
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m0 0l-4-4m4 4l4-4M4 21h16"/></svg>' +
    'Download VRM</a></div>' +
  '<div class="ui hint" id="hint"></div>' +
  '<div id="keys"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> / arrows move · drag to look · scroll to zoom</div>' +
  '<div id="stick"><b></b></div>';

var canvas = document.getElementById('c');
var loadEl = document.getElementById('load');
var barEl = document.querySelector('#bar i');
var ltEl = document.getElementById('lt');
var hintEl = document.getElementById('hint');
var isTouch = (('ontouchstart' in window) || navigator.maxTouchPoints > 0);
document.getElementById('stick').style.display = isTouch ? 'block' : 'none';
document.getElementById('keys').style.display = isTouch ? 'none' : 'block';
hintEl.textContent = isTouch ? 'Use the joystick to walk · drag to look · pinch to zoom'
                             : 'WASD / arrow keys to walk · drag to look · scroll to zoom';

// ---------- renderer / scene ----------
var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
// match the modern (physical) lighting model so the tuned intensities read right on r137
if ('physicallyCorrectLights' in renderer) renderer.physicallyCorrectLights = true;
if ('useLegacyLights' in renderer) renderer.useLegacyLights = false;
if ('outputColorSpace' in renderer && THREE.SRGBColorSpace) renderer.outputColorSpace = THREE.SRGBColorSpace;
else if ('outputEncoding' in renderer && THREE.sRGBEncoding) renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

var scene = new THREE.Scene();
scene.background = new THREE.Color(0x05070d);
scene.fog = new THREE.Fog(0x05070d, 16, 46);
try {
  var pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new THREE.RoomEnvironment(renderer), 0.04).texture;
} catch (e) { /* env optional */ }

var camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);

// ---------- spaceship corridor ----------
var W = 3.4, H = 2.9, L = 30;
var ship = new THREE.Group(); scene.add(ship);
function mat(c, m, r, e) { return new THREE.MeshStandardMaterial({ color: c, metalness: m, roughness: r, envMapIntensity: (e == null ? 0.35 : e) }); }
var matHull = mat(0x3a4152, 0.85, 0.55), matDark = mat(0x1b2130, 0.9, 0.5, 0.3),
    matPanel = mat(0x4a5268, 0.8, 0.45, 0.4), matFloor = mat(0x232a38, 0.75, 0.5);
var box = function (w, h, d) { return new THREE.BoxGeometry(w, h, d); };

var floor = new THREE.Mesh(box(W, 0.2, L), matFloor); floor.position.y = -0.1; floor.receiveShadow = true; ship.add(floor);
var seamMat = mat(0x0a0e16, 0.6, 0.6);
for (var i = -2; i <= 2; i++) { var s = new THREE.Mesh(box(0.05, 0.205, L), seamMat); s.position.set(i * (W / 5), 0.001, 0); ship.add(s); }
for (var z = -L / 2; z <= L / 2; z += 1.5) { var s2 = new THREE.Mesh(box(W, 0.205, 0.05), seamMat); s2.position.set(0, 0.001, z); ship.add(s2); }
var ceil = new THREE.Mesh(box(W, 0.2, L), matHull); ceil.position.y = H; ceil.receiveShadow = true; ship.add(ceil);

var stripeMat = new THREE.MeshStandardMaterial({ color: 0x1a90ff, emissive: 0x1a70ff, emissiveIntensity: 1.4, roughness: 0.4 });
for (var sidei = 0; sidei < 2; sidei++) {
  var sx = sidei ? 1 : -1;
  var wall = new THREE.Mesh(box(0.2, H, L), matHull); wall.position.set(sx * W / 2, H / 2, 0); wall.receiveShadow = true; ship.add(wall);
  for (var zp = -L / 2 + 1; zp < L / 2; zp += 2) {
    var p = new THREE.Mesh(box(0.08, H * 0.6, 1.5), matPanel); p.position.set(sx * (W / 2 - 0.12), H * 0.52, zp); ship.add(p);
    var stp = new THREE.Mesh(box(0.06, 0.06, 1.2), stripeMat); stp.position.set(sx * (W / 2 - 0.16), H * 0.26, zp); ship.add(stp);
  }
}
for (var zr = -L / 2 + 2; zr < L / 2; zr += 4) {
  var top = new THREE.Mesh(box(W + 0.1, 0.34, 0.4), matDark); top.position.set(0, H - 0.1, zr); top.castShadow = true; ship.add(top);
  for (var ci = 0; ci < 2; ci++) { var cxs = ci ? 1 : -1; var col = new THREE.Mesh(box(0.32, H, 0.4), matDark); col.position.set(cxs * (W / 2 - 0.1), H / 2, zr); col.castShadow = true; ship.add(col); }
}
var stripGeo = box(0.4, 0.06, 1.6);
var stripMat = new THREE.MeshStandardMaterial({ color: 0xbfe0ff, emissive: 0xafe0ff, emissiveIntensity: 2.2, roughness: 0.3 });
for (var zl = -L / 2 + 2; zl < L / 2; zl += 4) {
  var bar = new THREE.Mesh(stripGeo, stripMat); bar.position.set(0, H - 0.22, zl); ship.add(bar);
  var pl = new THREE.PointLight(0xbfe0ff, 7.0, 11, 2.0); pl.position.set(0, H - 0.5, zl); ship.add(pl);
}
function endWall(zSign) {
  var z = zSign * L / 2;
  var frame = new THREE.Mesh(box(W, H, 0.2), matHull); frame.position.set(0, H / 2, z); ship.add(frame);
  var glass = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.62, H * 0.5),
    new THREE.MeshStandardMaterial({ color: 0x0a1226, emissive: 0x0a1836, emissiveIntensity: 0.6, metalness: 0.1, roughness: 0.1 }));
  glass.position.set(0, H * 0.55, z - zSign * 0.11); glass.rotation.y = zSign < 0 ? 0 : Math.PI; ship.add(glass);
}
endWall(-1); endWall(1);
var starGeo = new THREE.BufferGeometry(); var starN = 1200, sp = new Float32Array(starN * 3);
for (var si = 0; si < starN; si++) { sp[si * 3] = (Math.random() - 0.5) * 60; sp[si * 3 + 1] = (Math.random() - 0.2) * 30; sp[si * 3 + 2] = (Math.random() < 0.5 ? -1 : 1) * (L / 2 + 2 + Math.random() * 25); }
starGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xbcd4ff, size: 0.12, sizeAttenuation: true })));
var crateMat = mat(0x5a4a32, 0.4, 0.7, 0.2);
function crate(x, z, s) { var m = new THREE.Mesh(box(s, s, s), crateMat); m.position.set(x, s / 2, z); m.castShadow = true; m.receiveShadow = true; m.rotation.y = Math.random() * 0.5; ship.add(m); }
crate(-W / 2 + 0.6, -L / 2 + 4, 0.7); crate(-W / 2 + 0.55, -L / 2 + 4.8, 0.5); crate(W / 2 - 0.6, L / 2 - 5, 0.8); crate(W / 2 - 0.7, 4, 0.6);

scene.add(new THREE.HemisphereLight(0x8098c0, 0x202430, 0.5));
var key = new THREE.DirectionalLight(0xdfe8ff, 1.4); key.position.set(3, 7, 4); key.castShadow = true;
key.shadow.mapSize.set(2048, 2048); key.shadow.camera.near = 1; key.shadow.camera.far = 18;
key.shadow.camera.left = -3.5; key.shadow.camera.right = 3.5; key.shadow.camera.top = 4.5; key.shadow.camera.bottom = -2;
key.shadow.bias = -0.0004; scene.add(key); scene.add(key.target);
var rim = new THREE.DirectionalLight(0x3a6cff, 0.8); rim.position.set(-4, 3, -5); scene.add(rim);

// ---------- robot ----------
var robot = new THREE.Group(); scene.add(robot);
var SCALE = 1.95;
var mixer = null, walkAction = null, modelReady = false;
var clock = new THREE.Clock();
var heading = 0;                       // yaw (rad); 0 faces +Z
var endZ = L / 2 - 2.4;
robot.position.set(0, 0, 0);           // start mid-corridor

function onModel(gltf) {
  var model = gltf.scene;
  model.scale.setScalar(SCALE);
  model.position.y = 0.5 * SCALE;
  model.traverse(function (o) {
    if (o.isMesh) {
      o.castShadow = true; o.frustumCulled = false;
      if (o.geometry && !o.geometry.getAttribute('normal')) o.geometry.computeVertexNormals();
      if (o.material) { o.material.metalness = Math.min(o.material.metalness == null ? 1 : o.material.metalness, 0.82); o.material.envMapIntensity = 1.15; o.material.needsUpdate = true; }
    }
  });
  robot.add(model);
  mixer = new THREE.AnimationMixer(model);
  var clip = THREE.AnimationClip.findByName(gltf.animations, 'Walk') || gltf.animations[0];
  walkAction = mixer.clipAction(clip);
  walkAction.setLoop(THREE.LoopRepeat); walkAction.play();
  walkAction.enabled = true; walkAction.setEffectiveWeight(0);   // start in rest pose until moving
  modelReady = true;
  loadEl.classList.add('hide');
  window.__ready = true;
}
function onProgress(ev) { if (ev && ev.total) { var p = ev.loaded / ev.total; barEl.style.width = (p * 100).toFixed(0) + '%'; ltEl.textContent = 'Loading robot… ' + (p * 100).toFixed(0) + '%'; } }
function onError(e) { ltEl.textContent = 'Failed to load model'; console.error(e); }

(function loadModel() {
  var loader = new THREE.GLTFLoader();
  if (window.ROBOT_B64) {
    try {
      var bin = atob(window.ROBOT_B64), n = bin.length, buf = new Uint8Array(n);
      for (var i = 0; i < n; i++) buf[i] = bin.charCodeAt(i);
      barEl.style.width = '100%'; ltEl.textContent = 'Preparing robot…';
      loader.parse(buf.buffer, '', onModel, onError);
    } catch (e) { onError(e); }
  } else {
    loader.load(window.ROBOT_SRC || 'robot.vrm', onModel, onProgress, onError);
  }
})();

// download button (hidden where the sandbox blocks downloads, e.g. hosted artifact)
var dl = document.getElementById('dl');
if (window.NO_DOWNLOAD) {
  dl.style.display = 'none';
} else if (window.ROBOT_B64) {
  dl.addEventListener('click', function (e) {
    e.preventDefault();
    var bin = atob(window.ROBOT_B64), n = bin.length, buf = new Uint8Array(n);
    for (var i = 0; i < n; i++) buf[i] = bin.charCodeAt(i);
    var url = URL.createObjectURL(new Blob([buf], { type: 'model/gltf-binary' }));
    var a = document.createElement('a'); a.href = url; a.download = 'robot.vrm'; a.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  });
} else { dl.href = window.ROBOT_SRC || 'robot.vrm'; dl.setAttribute('download', 'robot.vrm'); }

// ---------- input: keyboard + joystick ----------
var keys = {};
var moveInput = 0, turnInput = 0;      // -1..1
var userDriving = false;
function takeOver() { if (!userDriving) { userDriving = true; hintEl.style.opacity = '0.35'; } }
window.addEventListener('keydown', function (e) {
  var k = e.key.toLowerCase();
  if (['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].indexOf(k) >= 0) { keys[k] = true; takeOver(); e.preventDefault(); }
});
window.addEventListener('keyup', function (e) { keys[e.key.toLowerCase()] = false; });

// joystick
var stick = document.getElementById('stick'), thumb = stick.querySelector('b');
var stickId = null, sMoveX = 0, sMoveY = 0, R = 48;
function stickStart(e) { var t = e.changedTouches ? e.changedTouches[0] : e; stickId = e.changedTouches ? t.identifier : 'm'; takeOver(); stickMove(e); }
function stickMove(e) {
  var t = null;
  if (e.changedTouches) { for (var i = 0; i < e.changedTouches.length; i++) if (e.changedTouches[i].identifier === stickId) t = e.changedTouches[i]; }
  else t = e;
  if (!t) return;
  var r = stick.getBoundingClientRect();
  var dx = t.clientX - (r.left + r.width / 2), dy = t.clientY - (r.top + r.height / 2);
  var len = Math.hypot(dx, dy); if (len > R) { dx *= R / len; dy *= R / len; }
  thumb.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
  sMoveX = dx / R; sMoveY = dy / R;
}
function stickEnd() { stickId = null; sMoveX = sMoveY = 0; thumb.style.transform = ''; }
stick.addEventListener('touchstart', function (e) { stickStart(e); e.preventDefault(); }, { passive: false });
stick.addEventListener('touchmove', function (e) { stickMove(e); e.preventDefault(); }, { passive: false });
stick.addEventListener('touchend', stickEnd); stick.addEventListener('touchcancel', stickEnd);
stick.addEventListener('mousedown', function (e) { stickStart(e); e.preventDefault(); });
window.addEventListener('mousemove', function (e) { if (stickId === 'm') stickMove(e); });
window.addEventListener('mouseup', function () { if (stickId === 'm') stickEnd(); });

// ---------- camera orbit (drag / wheel / pinch), follows robot ----------
var camYaw = 0, camPitch = 0.22, camDist = 5.2;
var dragId = null, lastX = 0, lastY = 0, pinchD = 0;
function onCanvasDown(e) {
  if (e.target !== canvas) return;
  if (e.touches) {
    if (e.touches.length === 1) { dragId = e.touches[0].identifier; lastX = e.touches[0].clientX; lastY = e.touches[0].clientY; }
    else if (e.touches.length === 2) { pinchD = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); }
  } else { dragId = 'm'; lastX = e.clientX; lastY = e.clientY; }
}
function onMove(e) {
  if (e.touches) {
    if (e.touches.length === 2 && pinchD) { var d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); camDist = Math.max(2.4, Math.min(12, camDist * pinchD / d)); pinchD = d; return; }
    var t = null; for (var i = 0; i < e.touches.length; i++) if (e.touches[i].identifier === dragId) t = e.touches[i];
    if (!t) return; applyDrag(t.clientX, t.clientY);
  } else if (dragId === 'm') applyDrag(e.clientX, e.clientY);
}
function applyDrag(x, y) { camYaw -= (x - lastX) * 0.006; camPitch = Math.max(-0.2, Math.min(0.9, camPitch + (y - lastY) * 0.005)); lastX = x; lastY = y; }
function onUp() { dragId = null; pinchD = 0; }
canvas.addEventListener('mousedown', onCanvasDown); window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
canvas.addEventListener('touchstart', onCanvasDown, { passive: true }); window.addEventListener('touchmove', onMove, { passive: true }); window.addEventListener('touchend', onUp);
canvas.addEventListener('wheel', function (e) { camDist = Math.max(2.4, Math.min(12, camDist + e.deltaY * 0.01)); e.preventDefault(); }, { passive: false });

// ---------- movement + loop ----------
var SPEED = 2.1, TURN = 2.2;
var autoTurn = 0, autoDir = 1;
var INT = { x: W / 2 - 0.4, z: L / 2 - 0.9 };
var camPos = new THREE.Vector3(), camTarget = new THREE.Vector3(), tmp = new THREE.Vector3();

function readInput() {
  if (userDriving) {
    var mv = 0, tn = 0;
    if (keys['w'] || keys['arrowup']) mv += 1;
    if (keys['s'] || keys['arrowdown']) mv -= 1;
    if (keys['a'] || keys['arrowleft']) tn -= 1;
    if (keys['d'] || keys['arrowright']) tn += 1;
    if (sMoveY || sMoveX) { mv += -sMoveY; tn += sMoveX; }
    moveInput = Math.max(-1, Math.min(1, mv));
    turnInput = Math.max(-1, Math.min(1, tn));
  } else {
    moveInput = 1; turnInput = 0;   // auto-demo; update() handles the about-faces
  }
}

function update(dt) {
  readInput();
  if (!userDriving) {
    // auto pacing with about-faces at the ends
    if (autoTurn > 0) { autoTurn -= dt; heading += autoDir * Math.PI * dt / 0.6; moveInput = 0; if (autoTurn <= 0) heading = (autoDir > 0 ? 0 : Math.PI); }
    else {
      robot.position.z += Math.cos(heading) * SPEED * dt;
      robot.position.x += Math.sin(heading) * SPEED * dt;
      if (robot.position.z >= endZ && Math.abs(heading) < 0.1) { autoDir = 1; autoTurn = 0.6; }
      else if (robot.position.z <= -endZ && Math.abs(heading - Math.PI) < 0.1) { autoDir = -1; autoTurn = 0.6; }
    }
  } else {
    heading -= turnInput * TURN * dt;
    if (moveInput) {
      robot.position.x += Math.sin(heading) * moveInput * SPEED * dt;
      robot.position.z += Math.cos(heading) * moveInput * SPEED * dt;
    }
  }
  robot.position.x = Math.max(-INT.x, Math.min(INT.x, robot.position.x));
  robot.position.z = Math.max(-INT.z, Math.min(INT.z, robot.position.z));
  robot.rotation.y = heading;

  // animation: weight + direction follow movement
  if (mixer) {
    var spd = Math.abs(moveInput);
    if (walkAction) {
      walkAction.setEffectiveTimeScale(moveInput >= 0 ? Math.max(spd, 0.0001) : -Math.max(spd, 0.0001));
      var tw = walkAction.getEffectiveWeight();
      walkAction.setEffectiveWeight(tw + ((spd > 0.05 ? 1 : 0) - tw) * Math.min(1, dt * 10));
    }
    mixer.update(dt);
  }

  // shadow light follows robot
  key.position.set(robot.position.x + 2.5, 7, robot.position.z + 3);
  key.target.position.set(robot.position.x, 0.9, robot.position.z); key.target.updateMatrixWorld();

  // follow camera
  var ang = heading + Math.PI + camYaw;
  var horiz = camDist * Math.cos(camPitch);
  camPos.set(robot.position.x + Math.sin(ang) * horiz, 1.15 + camDist * Math.sin(camPitch) + 0.3, robot.position.z + Math.cos(ang) * horiz);
  camPos.x = Math.max(-INT.x - 0.2, Math.min(INT.x + 0.2, camPos.x));
  camPos.z = Math.max(-(L / 2 - 0.4), Math.min(L / 2 - 0.4, camPos.z));
  camPos.y = Math.max(0.7, Math.min(H - 0.25, camPos.y));
  camera.position.lerp(camPos, 1 - Math.pow(0.0025, dt));
  camTarget.set(robot.position.x, 1.15, robot.position.z);
  camera.lookAt(camTarget);
}

function resize() { var w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
window.addEventListener('resize', resize); resize();
// place camera behind robot initially
camera.position.set(robot.position.x, 1.9, robot.position.z - camDist);

renderer.setAnimationLoop(function () {
  var dt = Math.min(clock.getDelta(), 0.05);
  if (modelReady) update(dt);
  renderer.render(scene, camera);
});

})();
