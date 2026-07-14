// 波動シミュレーション - 式入力対応版

let canvasWidth = 900;
let canvasHeight = 600;
let amplitude = 40;
let fixedMediaLength = 800;
let mediaLength = fixedMediaLength;  // 媒質の長さ
let speedFactor = 1;
let waves = [];
let currentAmplitude = 40;
let startTime = 0;
let useEquationMode = false;  // 式入力モードを使用中か
let isRunning = false;
let boundaryType = 'fixed';

function safePositiveNumber(value, fallback) {
  const numeric = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function safeAmplitude(value, fallback = 40) {
  const numeric = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(numeric) ? Math.abs(numeric) : fallback;
}

// 現在時刻(now)と波のtimeOffsetを使って「先端(front)」の位置を返す
function frontPosition(wave, now) {
  const tEff = now - (wave.timeOffset || 0);
  return Math.max(0, Math.min(mediaLength, wave.velocity * Math.max(0, tEff)));
}

class Wave {
  constructor(index, wavelength, period, phase = 0, color = color(100, 150, 255), amplitudeValue = amplitude) {
    this.index = index;
    this.wavelength = safePositiveNumber(wavelength, 100);  // λ
    this.period = safePositiveNumber(period, 2);           // T
    this.frequency = 1 / this.period;    // f = 1/T
    this.velocity = safePositiveNumber(this.wavelength / this.period, 50);  // v = λ/T
    this.phase = phase;  // reserved, not used directly
    this.phaseOffset = 0; // dynamic offset to preserve continuity
    this.timeOffset = 0; // shift in time to preserve front position when velocity changes
    this.color = color;
    this.direction = 1;  // 1: 正方向, -1: 負方向
    this.reflectionCount = 0;  // 反射回数
    this.equationStr = "";  // 元の方程式文字列
    this.amplitude = amplitudeValue;
    this.showReflection = true;
    this.startX = 0;
  }

  calculateDisplacement(x, t, direction = this.direction) {
    // apply time offset to keep front position consistent when parameters change
    let tEff = t - (this.timeOffset || 0);

    // Right-going wave: causal (only where wavefront has reached)
    if (direction === 1) {
      let travel = this.velocity * tEff;
      if (!Number.isFinite(travel) || travel <= 0) return 0;
      if (x > travel) return 0; // not yet reached
      let phase = 2 * PI * ((tEff / this.period) - (x / this.wavelength));
      return this.amplitude * sin(phase + this.phaseOffset);
    }

    // Left-going reflected wave: starts when the incoming front reaches x = l
    let reflectionStartTime = mediaLength / this.velocity;
    if (tEff < reflectionStartTime) return 0;
    let reflectionTravel = this.velocity * (tEff - reflectionStartTime);
    let leftmost = mediaLength - reflectionTravel; // smallest x where reflected wave has reached
    if (x < leftmost || x > mediaLength) return 0; // outside reflected region

    // phase for reflected wave measured from the reflection moment at x = l
    let phase = 2 * PI * (((tEff - reflectionStartTime) / this.period) - ((mediaLength - x) / this.wavelength));
    let value = this.amplitude * sin(phase + this.phaseOffset);
    if (boundaryType === 'fixed') return -value;
    return value;
  }

  display(t, offsetY) {
    this.drawWavePath(t, offsetY, this.direction, this.color);

    if (this.showReflection && this.direction === 1) {
      this.drawWavePath(t, offsetY, -1, color(255, 80, 80));
    }
  }

  drawWavePath(t, offsetY, direction, strokeColor) {
    stroke(strokeColor);
    strokeWeight(2);
    noFill();

    beginShape();
    let stepSize = 2;
    for (let x = 0; x <= mediaLength; x += stepSize) {
      let y = this.calculateDisplacement(x, t, direction);
      if (!Number.isFinite(y)) {
        y = 0;
      }
      vertex(x, offsetY - y);
    }
    endShape();
  }
}

function normalizeEquationInput(equationStr) {
  let eq = equationStr.replace(/\s+/g, '');
  eq = eq.replace(/[−–—]/g, '-');
  eq = eq.replace(/×/g, '*');
  eq = eq.replace(/π/gi, 'PI');
  eq = eq.replace(/pi/gi, 'PI');
  return eq;
}

function extractSinArgument(rightSide) {
  const sinIndex = rightSide.toLowerCase().indexOf('sin(');
  if (sinIndex === -1) {
    return null;
  }

  let depth = 0;
  let start = rightSide.indexOf('(', sinIndex);
  let content = '';

  for (let i = start + 1; i < rightSide.length; i++) {
    const ch = rightSide[i];
    if (ch === '(') {
      depth++;
    } else if (ch === ')') {
      if (depth === 0) {
        return content;
      }
      depth--;
    }
    content += ch;
  }

  return null;
}

function parseVariableAssignments(equationStr) {
  const values = {};
  const variableInputs = {
    A: document.getElementById('varA'),
    T: document.getElementById('varT'),
    v: document.getElementById('varV'),
    lambda: document.getElementById('varLambda'),
    l: document.getElementById('varL')
  };

  Object.entries(variableInputs).forEach(([key, input]) => {
    if (input) {
      const parsed = parseFloat(input.value);
      if (Number.isFinite(parsed)) {
        values[key] = parsed;
      }
    }
  });

  const eq = normalizeEquationInput(equationStr);
  const variableNames = ['A', 'T', 'v', 'lambda', 'l'];
  variableNames.forEach((name) => {
    const regex = new RegExp(name, 'gi');
    const exists = regex.test(eq);
    if (exists) {
      const value = values[name] ?? values[name.toLowerCase()] ?? values.lambda;
      if (typeof value === 'number' && !isNaN(value)) {
        values[name] = value;
      }
    }
  });

  return values;
}

// 波の方程式をパースする関数
function parseWaveEquation(equationStr, selectedFormat = 'auto') {
  let result = {
    success: false,
    amplitude: 40,
    wavelength: 100,
    period: 2,
    velocity: 50,
    direction: 1,
    message: ""
  };

  try {
    let eq = normalizeEquationInput(equationStr);

    if (!eq.includes('=')) {
      throw new Error("'=' を含む必要があります");
    }

    let parts = eq.split('=');
    let rightSide = parts[1];

    const vars = parseVariableAssignments(equationStr);
    let ampMatch = rightSide.match(/^([A-Za-z]+| -?\d*\.?\d+)/i);
    if (ampMatch) {
      const token = ampMatch[1];
      if (/^[A-Za-z]+$/i.test(token)) {
        const value = vars[token.toUpperCase()] ?? vars[token.toLowerCase()] ?? vars.lambda;
        if (typeof value === 'number' && Number.isFinite(value)) {
          result.amplitude = safeAmplitude(value, 40);
        } else {
          throw new Error("振幅 A が見つかりません");
        }
      } else {
        result.amplitude = safeAmplitude(parseFloat(token), 40);
      }
    } else {
      throw new Error("振幅 A が見つかりません");
    }

    let insideSin = extractSinArgument(rightSide);
    if (!insideSin) {
      throw new Error("sin(...)の形式で入力してください");
    }
    let results = [];

    if (selectedFormat === 'form2' || selectedFormat === 'auto') {
      let pattern2 = /2\*?PI\s*\*?\s*\(\s*t\s*\/\s*([A-Za-z]+|\d+\.?\d*)\s*-\s*x\s*\/\s*([A-Za-z]+|\d+\.?\d*)\s*\)/i;
      let match2 = insideSin.match(pattern2);
      if (match2) {
        result.period = safePositiveNumber(thisValue(match2[1], vars, 2), 2);
        result.wavelength = safePositiveNumber(thisValue(match2[2], vars, 100), 100);
        result.velocity = safePositiveNumber(result.wavelength / result.period, 50);
        result.direction = 1;
        results.push(JSON.parse(JSON.stringify(result)));
      }
    }

    if (selectedFormat === 'form1' || selectedFormat === 'auto') {
      let pattern1 = /2\*?PI\s*\/\s*([A-Za-z]+|\d+\.?\d*)\s*\*?\s*\(\s*t\s*-\s*x\s*\/\s*([A-Za-z]+|\d+\.?\d*)\s*\)/i;
      let match1 = insideSin.match(pattern1);
      if (match1) {
        result.period = safePositiveNumber(thisValue(match1[1], vars, 2), 2);
        result.velocity = safePositiveNumber(thisValue(match1[2], vars, 50), 50);
        result.wavelength = safePositiveNumber(result.velocity * result.period, 100);
        result.direction = 1;
        results.push(JSON.parse(JSON.stringify(result)));
      }

      let pattern3 = /2\*?PI\s*\/\s*([A-Za-z]+|\d+\.?\d*)\s*\*?\s*\(\s*t\s*-\s*\(\s*2\s*\*?\s*([A-Za-z]+|\d+\.?\d*)\s*-\s*x\s*\)\s*\/\s*([A-Za-z]+|\d+\.?\d*)\s*\)/i;
      let match3 = insideSin.match(pattern3);
      if (match3) {
        result.period = safePositiveNumber(thisValue(match3[1], vars, 2), 2);
        result.velocity = safePositiveNumber(thisValue(match3[3], vars, 50), 50);
        result.wavelength = safePositiveNumber(result.velocity * result.period, 100);
        result.direction = -1;
        results.push(JSON.parse(JSON.stringify(result)));
      }
    }

    if (results.length === 0) {
      throw new Error("対応する方程式パターンが見つかりません。\n例: y = 5sin(2π/2(t - x/50)) または y = 3sin(2π(t/1.5 - x/60))");
    }

    result = results[0];
    result.success = true;
    result.message = `${result.amplitude.toFixed(2)}, ${result.period.toFixed(2)}, ${result.wavelength.toFixed(2)}, ${result.velocity.toFixed(2)}`;

  } catch (e) {
    result.success = false;
    result.message = `✗ ${e.message}`;
  }

  return result;
}

function thisValue(token, vars, fallback) {
  if (!token) {
    return fallback;
  }
  const normalized = token.toLowerCase();
  if (normalized === 't') {
    return safePositiveNumber(vars.T, fallback);
  }
  if (normalized === 'v') {
    return safePositiveNumber(vars.v, fallback);
  }
  if (normalized === 'lambda' || normalized === 'λ') {
    return safePositiveNumber(vars.lambda ?? vars.λ, fallback);
  }
  if (normalized === 'l') {
    return safePositiveNumber(vars.l, fallback);
  }
  if (normalized === 'a') {
    return safeAmplitude(vars.A, fallback);
  }
  const numeric = parseFloat(token);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function setup() {
  let container = document.getElementById('canvas-container');
  let p5canvas = createCanvas(canvasWidth, canvasHeight);
  container.appendChild(p5canvas.canvas);

  createControls();
  mediaLength = fixedMediaLength;
  document.getElementById('varL').value = fixedMediaLength;
  document.getElementById('wavelengthL').value = fixedMediaLength;
  waves = [];
  useEquationMode = false;
  isRunning = false;
  startTime = millis();
}

function buildWaveFromUI() {
  // Create a single Wave from UI values as a safe fallback
  const amp = safeAmplitude(parseFloat(document.getElementById('varA').value), 40);
  const per = safePositiveNumber(parseFloat(document.getElementById('varT').value), 2);
  const vel = safePositiveNumber(parseFloat(document.getElementById('varV').value), 50);
  const lam = safePositiveNumber(parseFloat(document.getElementById('varLambda').value), vel * per);
  const showRef = document.getElementById('showReflection').checked;

  let w = new Wave(0, lam, per, 0, color(100, 150, 255), amp);
  w.direction = 1;
  w.showReflection = showRef;
  w.velocity = vel;
  w.phaseOffset = 0;
  return w;
}

function adjustVelocity(newV) {
  if (!Number.isFinite(newV) || newV <= 0) return;
  const now = (millis() - startTime) / 1000 * speedFactor;
  for (let i = 0; i < waves.length; i++) {
    const w = waves[i];
    const oldV = w.velocity;
    const oldTimeOffset = w.timeOffset || 0;
    const old_tEff = now - oldTimeOffset;
    const front = frontPosition(w, now);

    // update velocity but keep spatial shape (wavelength, period, amplitude)
    w.velocity = newV;

    // compute new timeOffset so front position remains continuous:
    // newV * (now - timeOffset) = front  => timeOffset = now - front/newV
    w.timeOffset = now - front / newV;

    // adjust phaseOffset to preserve phase at reference point
    const argOld = 2 * PI * ((old_tEff / w.period) - (front / w.wavelength)) + (w.phaseOffset || 0);
    const tEffNew = now - w.timeOffset;
    const argNewBase = 2 * PI * ((tEffNew / w.period) - (front / w.wavelength));
    w.phaseOffset = argOld - argNewBase;
  }
}

function preservePhase(oldWave, newWave) {
  if (!oldWave || !newWave) return;
  const now = (millis() - startTime) / 1000 * speedFactor;

  // choose reference x: use current front position for incoming wave
  if (oldWave.direction === 1) {
    const old_tEff = now - (oldWave.timeOffset || 0);
    const travelOld = frontPosition(oldWave, now);
    const xref = Math.min(mediaLength, Math.max(0, travelOld));

    // compute timeOffset so new wave's front lines up with old front
    newWave.timeOffset = now - (travelOld / newWave.velocity);

    const tEffNew = now - newWave.timeOffset;
    const argOld = 2 * PI * ((old_tEff / oldWave.period) - (xref / oldWave.wavelength)) + (oldWave.phaseOffset || 0);
    const argNewBase = 2 * PI * ((tEffNew / newWave.period) - (xref / newWave.wavelength));
    newWave.phaseOffset = argOld - argNewBase;
  } else {
    // reflected wave: reference at reflection point
    const old_tEff = now - (oldWave.timeOffset || 0);
    const reflectionStartTime = mediaLength / oldWave.velocity;
    if (old_tEff < reflectionStartTime) {
      // no reflected front yet — align future reflection times
      const reflectionStartNew = mediaLength / newWave.velocity;
      newWave.timeOffset = now - reflectionStartNew;
      newWave.phaseOffset = oldWave.phaseOffset || 0;
    } else {
      const elapsed = Math.max(0, old_tEff - reflectionStartTime);
      const leftmost = mediaLength - oldWave.velocity * elapsed;
      const xref = Math.min(mediaLength, Math.max(0, leftmost));

      // align reflected front: compute time offset for new wave relative to reflection moment
      const reflectionStartNew = mediaLength / newWave.velocity;
      newWave.timeOffset = now - (reflectionStartNew + (mediaLength - leftmost) / newWave.velocity);

      const tEffNew = now - newWave.timeOffset;
      const argOld = 2 * PI * (((old_tEff - reflectionStartTime) / oldWave.period) - ((mediaLength - xref) / oldWave.wavelength)) + (oldWave.phaseOffset || 0);
      const argNewBase = 2 * PI * (((tEffNew - reflectionStartNew) / newWave.period) - ((mediaLength - xref) / newWave.wavelength));
      newWave.phaseOffset = argOld - argNewBase;
    }
  }
}

function syncEquationWave() {
  let equationStr = document.getElementById('waveEquation').value;
  let parseResult = document.getElementById('parse-result');
  let selectedFormat = document.getElementById('equationFormat').value;
  let showReflection = document.getElementById('showReflection').checked;

  if (!equationStr.trim()) {
    parseResult.classList.add('error');
    parseResult.classList.remove('success');
    parseResult.innerHTML = '方程式を入力してください';
    waves = [];
    let defaultWave = new Wave(0, 100, 2, 0, color(100, 150, 255), 40);
    defaultWave.direction = 1;
    defaultWave.showReflection = true;
    waves.push(defaultWave);
    useEquationMode = false;
    // do not reset startTime or isRunning here so preview time is preserved
    return;
  }

  let result = parseWaveEquation(equationStr, selectedFormat);
  parseResult.classList.remove('error', 'success');
  parseResult.classList.add(result.success ? 'success' : 'error');
  parseResult.innerHTML = result.message;

  let vars = parseVariableAssignments(equationStr);
  const prevWave = waves && waves.length > 0 ? waves[0] : null;
  let periodValue = result.success ? result.period : safePositiveNumber(vars.T, 2);
  let amplitudeValue = result.success ? result.amplitude : safeAmplitude(vars.A, 40);
  let wavelengthValue = result.success ? result.wavelength : safePositiveNumber(vars.lambda, 100);
  let velocityValue = result.success ? result.velocity : safePositiveNumber(vars.v, wavelengthValue / periodValue);

  // If only velocity changed (user adjusted v), keep previous wavelength/period/amplitude
  let pureVelocityChange = false;
  if (prevWave && Number.isFinite(vars.v)) {
    const vChanged = Math.abs((vars.v || velocityValue) - prevWave.velocity) > 1e-9;
    const periodChanged = Math.abs(periodValue - prevWave.period) > 1e-6;
    const ampChanged = Math.abs(amplitudeValue - prevWave.amplitude) > 1e-6;
    const lambdaChanged = Math.abs((vars.lambda || wavelengthValue) - prevWave.wavelength) > 1e-6;
    if (vChanged && !periodChanged && !ampChanged && !lambdaChanged) {
      // preserve previous spatial shape
      wavelengthValue = prevWave.wavelength;
      periodValue = prevWave.period;
      amplitudeValue = prevWave.amplitude;
      velocityValue = safePositiveNumber(vars.v, prevWave.velocity);
      pureVelocityChange = true;
    }
  }

  if (selectedFormat === 'form1' || (selectedFormat === 'auto' && !result.success)) {
    velocityValue = safePositiveNumber(vars.v, velocityValue);
    wavelengthValue = safePositiveNumber(velocityValue * periodValue, 100);
  } else if (selectedFormat === 'form2' || (selectedFormat === 'auto' && !result.success)) {
    wavelengthValue = safePositiveNumber(vars.lambda, wavelengthValue);
    velocityValue = safePositiveNumber(wavelengthValue / periodValue, 50);
  }

  mediaLength = fixedMediaLength;
  document.getElementById('varL').value = fixedMediaLength;
  document.getElementById('wavelengthL').value = fixedMediaLength;

  const oldWave = waves && waves.length > 0 ? waves[0] : null;
  if (pureVelocityChange && oldWave) {
    // If only speed changed, preserve the existing wave object and its phase position.
    adjustVelocity(velocityValue);
    oldWave.equationStr = equationStr;
    oldWave.showReflection = showReflection;
    oldWave.velocity = velocityValue;
    amplitude = amplitudeValue;
    currentAmplitude = amplitudeValue;
    useEquationMode = true;
    return;
  }

  waves = [];
  let wave = new Wave(0, wavelengthValue, periodValue, 0, color(100, 150, 255), amplitudeValue);
  // preserve phase relative to previous wave so wave appears to translate
  if (oldWave) {
    preservePhase(oldWave, wave);
  }
  wave.direction = result.success ? result.direction : 1;
  wave.equationStr = equationStr;
  wave.showReflection = showReflection;
  wave.velocity = velocityValue;
  amplitude = amplitudeValue;
  currentAmplitude = amplitudeValue;
  waves.push(wave);
  useEquationMode = true;
  // preserve current startTime so changing inputs won't reset the displayed time
}

function createControls() {
  document.getElementById('parseBtn').addEventListener('click', syncEquationWave);

  document.getElementById('runBtn').addEventListener('click', () => {
    boundaryType = document.getElementById('boundaryType').value;
    // ensure we have wave(s) to run
    if (!waves || waves.length === 0) {
      const eqStr = document.getElementById('waveEquation').value || '';
      if (eqStr.trim()) {
        syncEquationWave();
      } else {
        waves = [];
        waves.push(buildWaveFromUI());
        useEquationMode = false;
      }
    }
    isRunning = true;
    startTime = millis();
    document.getElementById('parse-result').innerHTML = `実行中 (${boundaryType === 'fixed' ? '固定端' : '自由端'})`;
  });

  document.getElementById('waveEquation').addEventListener('input', syncEquationWave);
  document.getElementById('equationFormat').addEventListener('change', syncEquationWave);
  document.getElementById('showReflection').addEventListener('change', syncEquationWave);
  document.getElementById('varA').addEventListener('input', () => {
    let value = parseFloat(document.getElementById('varA').value);
    if (!isNaN(value)) {
      amplitude = Math.abs(value);
      currentAmplitude = Math.abs(value);
      if (useEquationMode) {
        syncEquationWave();
      }
    }
  });
  document.getElementById('varT').addEventListener('input', () => {
    if (useEquationMode) {
      syncEquationWave();
    }
  });
  document.getElementById('varV').addEventListener('input', () => {
    let vVal = parseFloat(document.getElementById('varV').value);
    if (!isNaN(vVal) && vVal > 0) {
      if (useEquationMode) {
        syncEquationWave();
      } else if (waves && waves.length > 0) {
        adjustVelocity(vVal);
      }
    }
  });
  document.getElementById('varLambda').addEventListener('input', () => {
    if (useEquationMode) {
      syncEquationWave();
    }
  });
  document.getElementById('varL').addEventListener('input', () => {
    document.getElementById('varL').value = fixedMediaLength;
    document.getElementById('wavelengthL').value = fixedMediaLength;
    mediaLength = fixedMediaLength;
    if (useEquationMode) {
      syncEquationWave();
    }
  });
  
  document.getElementById('numWaves').addEventListener('change', updateWavesFromControls);
  document.getElementById('amplitude').addEventListener('input', (e) => {
    amplitude = parseFloat(e.target.value);
    currentAmplitude = parseFloat(e.target.value);
  });
  document.getElementById('wavelengthL').addEventListener('input', () => {
    document.getElementById('varL').value = fixedMediaLength;
    document.getElementById('wavelengthL').value = fixedMediaLength;
    mediaLength = fixedMediaLength;
  });
  document.getElementById('speedFactor').addEventListener('input', (e) => {
    speedFactor = parseFloat(e.target.value);
  });
  document.getElementById('resetBtn').addEventListener('click', () => {
    startTime = millis();
  });
}

function updateWavesFromControls() {
  if (useEquationMode) {
    return;
  }
  
  let numWaves = parseInt(document.getElementById('numWaves').value);
  waves = [];

  let colors = [
    color(100, 150, 255),
    color(255, 100, 100),
    color(100, 255, 100),
    color(255, 200, 50),
    color(200, 100, 255)
  ];

  let controlPanel = document.getElementById('wave-controls');
  controlPanel.innerHTML = '';

  for (let i = 0; i < numWaves; i++) {
    let waveDiv = document.createElement('div');
    waveDiv.className = 'wave-group';
    waveDiv.id = `wave-${i}`;

    let defaultWavelength = 100 + i * 30;
    let defaultPeriod = 2 + i * 0.5;

    waveDiv.innerHTML = `
      <h4>波 ${i + 1}</h4>
      <label>波長 λ (px): <input type="number" class="wavelength" min="20" max="300" value="${defaultWavelength}" step="10"></label>
      <label>周期 T (s): <input type="number" class="period" min="0.5" max="5" value="${defaultPeriod}" step="0.1"></label>
      <label>方向: 
        <select class="direction">
          <option value="1" ${i % 2 === 0 ? 'selected' : ''}>→ 正方向</option>
          <option value="-1" ${i % 2 === 1 ? 'selected' : ''}>← 反射波</option>
        </select>
      </label>
      <label>反射回数: <input type="number" class="reflection" min="0" max="10" value="${i}" step="1"></label>
    `;

    controlPanel.appendChild(waveDiv);
  }

  updateWaveInstances();
}

function updateWaveInstances() {
  if (useEquationMode) {
    return;
  }
  
  const oldWaves = waves.slice();
  waves = [];
  let numWaves = parseInt(document.getElementById('numWaves').value);
  let colors = [
    color(100, 150, 255),
    color(255, 100, 100),
    color(100, 255, 100),
    color(255, 200, 50),
    color(200, 100, 255)
  ];

  for (let i = 0; i < numWaves; i++) {
    let waveDiv = document.getElementById(`wave-${i}`);
    if (waveDiv) {
      let wavelength = parseFloat(waveDiv.querySelector('.wavelength').value);
      let period = parseFloat(waveDiv.querySelector('.period').value);
      let direction = parseInt(waveDiv.querySelector('.direction').value);
      let reflectionCount = parseInt(waveDiv.querySelector('.reflection').value);

      let wave = new Wave(i, wavelength, period, 0, colors[i % colors.length], amplitude);
      wave.direction = direction;
      wave.reflectionCount = reflectionCount;
      wave.showReflection = document.getElementById('showReflection').checked;
      // preserve phase from previous wave at same index if present
      if (oldWaves && oldWaves[i]) {
        preservePhase(oldWaves[i], wave);
      }
      waves.push(wave);
    }
  }
}

function draw() {
  background(255);

  // Use running time based on startTime so parameter changes don't zero the time.
  // The Run button still sets isRunning, but we keep time progressing so previews remain visible.
  let currentTime = (millis() - startTime) / 1000 * speedFactor;

  let centerX = 50;
  let centerY = height / 2;
  let graphWidth = width - 120;
  let graphHeight = height - 100;

  drawGrid(centerX, centerY, graphWidth, graphHeight);
  drawAmplitudeAxis(centerX, centerY, graphHeight);
  // Only draw waves when running
  if (!isRunning) {
    drawInfo(centerX, centerY, graphWidth, graphHeight, currentTime);
    return;
  }

  push();
  translate(centerX, centerY);

  let waveSpacing = graphHeight / (waves.length + 1);
  for (let i = 0; i < waves.length; i++) {
    let offsetY = (i - waves.length / 2 + 0.5) * waveSpacing;
    waves[i].display(currentTime, offsetY);
  }

  pop();

  drawInfo(centerX, centerY, graphWidth, graphHeight, currentTime);
}

function drawAmplitudeAxis(startX, startY, height) {
  stroke(120);
  strokeWeight(1);
  let maxAmp = Math.max(10, currentAmplitude + 20);
  let topY = startY - height / 2;
  let bottomY = startY + height / 2;

  fill(80);
  textSize(10);
  textAlign(RIGHT, CENTER);
  text(`${maxAmp}`, startX - 8, topY + 8);
  text(`0`, startX - 8, startY);
  text(`${-maxAmp}`, startX - 8, bottomY - 8);

  noFill();
  stroke(80);
  strokeWeight(1);
  line(startX - 20, topY, startX - 20, bottomY);
}

function drawGrid(startX, startY, width, height) {
  stroke(200);
  strokeWeight(1);

  let xTickSpacing = 50;
  if (waves.length > 0 && waves[0].wavelength > 0) {
    xTickSpacing = Math.max(20, Math.min(width, waves[0].wavelength / 2));
  }

  for (let x = 0; x <= mediaLength; x += xTickSpacing) {
    line(startX + x, startY - height / 2, startX + x, startY + height / 2);
    fill(100);
    textSize(10);
    textAlign(CENTER);
    text(`x=${x.toFixed(0)}`, startX + x, startY + height / 2 + 18);
  }

  for (let y = -height / 2; y <= height / 2; y += 30) {
    line(startX, startY + y, startX + width, startY + y);
  }

  stroke(0);
  strokeWeight(2);
  line(startX, startY - height / 2 - 20, startX, startY + height / 2 + 20);
  line(startX - 10, startY, startX + width + 10, startY);

  fill(0);
  textSize(12);
  textAlign(CENTER);
  text('0', startX - 20, startY + 15);

  stroke(150);
  strokeWeight(1);
  line(startX + mediaLength, startY - height / 2 - 20, startX + mediaLength, startY + height / 2 + 20);
  fill(150);
  textAlign(LEFT);
  text('x = l (反射点)', startX + mediaLength - 30, startY - height / 2 - 30);
}

function drawInfo(startX, startY, width, height, t) {
  fill(0);
  textSize(12);
  textAlign(LEFT);

  let infoX = startX + 20;
  let infoY = height / 2 + startY + 50;

  text(`時間: ${t.toFixed(2)} s`, infoX, infoY);
  text(`速度係数: ${speedFactor.toFixed(1)}x`, infoX, infoY + 20);
  text(`振幅: ${currentAmplitude.toFixed(1)} px`, infoX, infoY + 40);

  let waveInfoY = infoY + 60;
  for (let i = 0; i < waves.length; i++) {
    let wave = waves[i];
    let dir = wave.direction === 1 ? '→ 正進' : '← 反射';
    text(`波${i + 1}: λ=${wave.wavelength.toFixed(2)}px, T=${wave.period.toFixed(2)}s, v=${wave.velocity.toFixed(2)}px/s ${dir}`, infoX, waveInfoY + i * 18);
    
    if (useEquationMode && wave.equationStr) {
      text(`式: ${wave.equationStr}`, infoX + 10, waveInfoY + i * 18 + 15);
      waveInfoY += 15;
    }
  }

  fill(100);
  textSize(10);
  text('パラメータを変更すると波がリセットされます', infoX, height - startY + 10);
}

// UI の変更を監視
window.addEventListener('DOMContentLoaded', () => {
  document.addEventListener('change', () => {
    if (!useEquationMode) {
      updateWaveInstances();
    }
  });
});
