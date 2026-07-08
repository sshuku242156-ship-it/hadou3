// 波動シミュレーション - 式入力対応版

let canvasWidth = 900;
let canvasHeight = 600;
let amplitude = 40;
let mediaLength = 400;  // 媒質の長さ
let speedFactor = 1;
let waves = [];
let startTime = 0;
let useEquationMode = false;  // 式入力モードを使用中か

class Wave {
  constructor(index, wavelength, period, phase = 0, color = color(100, 150, 255)) {
    this.index = index;
    this.wavelength = wavelength;  // λ
    this.period = period;           // T
    this.frequency = 1 / period;    // f = 1/T
    this.velocity = wavelength / period;  // v = λ/T
    this.phase = phase;  // 初期位相
    this.color = color;
    this.direction = 1;  // 1: 正方向, -1: 負方向
    this.reflectionCount = 0;  // 反射回数
    this.equationStr = "";  // 元の方程式文字列
  }

  // y = A sin(2π/T * (t - x/v)) の形式で波の変位を計算
  calculateDisplacement(x, t) {
    let actualDistance = x;
    let sign = 1;
    let waveTravel = this.velocity * t;
    
    if (this.direction === 1) {
      // 正方向に進む波
      let waveFront = waveTravel;
      if (waveFront < x) {
        return 0;
      }
      actualDistance = waveFront - x;
    } else {
      // 負方向に進む波（反射波）
      let reflectionStartDist = 2 * mediaLength * this.reflectionCount;
      let reflectionTravel = waveTravel - reflectionStartDist;
      if (reflectionTravel < 0) {
        return 0;
      }
      actualDistance = mediaLength - x + reflectionTravel;
      sign = -1;
    }

    let arg = (2 * PI / this.period) * (t - actualDistance / this.velocity);
    return amplitude * sign * sin(arg);
  }

  display(t, offsetY) {
    stroke(this.color);
    strokeWeight(2);
    noFill();

    beginShape();
    let stepSize = 2;
    for (let x = 0; x <= mediaLength; x += stepSize) {
      let y = this.calculateDisplacement(x, t);
      vertex(x, offsetY - y);
    }
    endShape();
  }
}

// 波の方程式をパースする関数
function parseWaveEquation(equationStr) {
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
    // 空白を削除
    let eq = equationStr.replace(/\s+/g, '');
    
    // y = の部分を取り除く
    if (!eq.includes('=')) {
      throw new Error("'=' を含む必要があります");
    }
    
    let parts = eq.split('=');
    let rightSide = parts[1];
    
    // 振幅 A を抽出
    let ampMatch = rightSide.match(/^(-?\d+\.?\d*)/);
    if (!ampMatch) {
      throw new Error("振幅 A が見つかりません");
    }
    result.amplitude = Math.abs(parseFloat(ampMatch[1]));
    
    // sin または cos の内部を抽出
    let sinMatch = rightSide.match(/sin\(([^)]+)\)/i);
    if (!sinMatch) {
      throw new Error("sin(...)の形式で入力してください");
    }
    
    let insideSin = sinMatch[1];
    
    // π を PI に置換（正規表現処理用）
    insideSin = insideSin.replace(/π/g, 'PI');
    
    let results = [];
    
    // パターン1: 2*PI/T*(t-x/v) の形式
    let pattern1 = /2\*?PI\s*\/\s*(\d+\.?\d*)\s*\*?\s*\(\s*t\s*-\s*x\s*\/\s*(\d+\.?\d*)\s*\)/i;
    let match1 = insideSin.match(pattern1);
    if (match1) {
      result.period = parseFloat(match1[1]);
      result.velocity = parseFloat(match1[2]);
      result.wavelength = result.velocity * result.period;
      result.direction = 1;
      results.push(JSON.parse(JSON.stringify(result)));
    }
    
    // パターン2: 2*PI*(t/T-x/λ) の形式
    let pattern2 = /2\*?PI\s*\*?\s*\(\s*t\s*\/\s*(\d+\.?\d*)\s*-\s*x\s*\/\s*(\d+\.?\d*)\s*\)/i;
    let match2 = insideSin.match(pattern2);
    if (match2) {
      result.period = parseFloat(match2[1]);
      result.wavelength = parseFloat(match2[2]);
      result.velocity = result.wavelength / result.period;
      result.direction = 1;
      results.push(JSON.parse(JSON.stringify(result)));
    }
    
    // パターン3: 2π/T(t-(2l-x)/v) 形式（第一反射波）
    let pattern3 = /2\*?PI\s*\/\s*(\d+\.?\d*)\s*\*?\s*\(\s*t\s*-\s*\(\s*2\s*\*?\s*(\d+\.?\d*)\s*-\s*x\s*\)\s*\/\s*(\d+\.?\d*)\s*\)/i;
    let match3 = insideSin.match(pattern3);
    if (match3) {
      result.period = parseFloat(match3[1]);
      result.velocity = parseFloat(match3[3]);
      result.wavelength = result.velocity * result.period;
      result.direction = -1;  // 反射波
      results.push(JSON.parse(JSON.stringify(result)));
    }
    
    if (results.length === 0) {
      throw new Error("対応する方程式パターンが見つかりません。\n例: y = 5sin(2π/2(t - x/50)) または y = 3sin(2π(t/1.5 - x/60))");
    }
    
    result = results[0];
    result.success = true;
    result.message = `✓ 解析成功！ A=${result.amplitude}, λ=${result.wavelength.toFixed(2)}px, T=${result.period.toFixed(2)}s, v=${result.velocity.toFixed(2)}px/s, 方向:${result.direction === 1 ? '→正進' : '←反射'}`;
    
  } catch (e) {
    result.success = false;
    result.message = `✗ エラー: ${e.message}`;
  }
  
  return result;
}

function setup() {
  let container = document.getElementById('canvas-container');
  let p5canvas = createCanvas(canvasWidth, canvasHeight);
  container.appendChild(p5canvas.canvas);

  createControls();
  updateWavesFromControls();
  startTime = millis();
}

function createControls() {
  // パース開始ボタン
  document.getElementById('parseBtn').addEventListener('click', () => {
    let equationStr = document.getElementById('waveEquation').value;
    let parseResult = document.getElementById('parse-result');
    
    if (!equationStr.trim()) {
      parseResult.classList.add('error');
      parseResult.classList.remove('success');
      parseResult.innerHTML = '方程式を入力してください';
      return;
    }
    
    let result = parseWaveEquation(equationStr);
    parseResult.classList.remove('error', 'success');
    parseResult.classList.add(result.success ? 'success' : 'error');
    parseResult.innerHTML = result.message;
    
    if (result.success) {
      // 波を作成して表示
      waves = [];
      let wave = new Wave(0, result.wavelength, result.period, 0, color(100, 150, 255));
      wave.direction = result.direction;
      wave.equationStr = equationStr;
      amplitude = result.amplitude;
      waves.push(wave);
      useEquationMode = true;
      startTime = millis();
    }
  });
  
  // 基本パラメータのイベントリスナー
  document.getElementById('numWaves').addEventListener('change', updateWavesFromControls);
  document.getElementById('amplitude').addEventListener('input', (e) => {
    amplitude = parseFloat(e.target.value);
  });
  document.getElementById('wavelengthL').addEventListener('input', (e) => {
    mediaLength = parseFloat(e.target.value);
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

      let wave = new Wave(i, wavelength, period, 0, colors[i % colors.length]);
      wave.direction = direction;
      wave.reflectionCount = reflectionCount;
      waves.push(wave);
    }
  }
}

function draw() {
  background(255);

  let currentTime = (millis() - startTime) / 1000 * speedFactor;

  let centerX = 50;
  let centerY = height / 2;
  let graphWidth = width - 120;
  let graphHeight = height - 100;

  drawGrid(centerX, centerY, graphWidth, graphHeight);

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

function drawGrid(startX, startY, width, height) {
  stroke(200);
  strokeWeight(1);

  for (let x = 0; x <= width; x += 50) {
    line(startX + x, startY - height / 2, startX + x, startY + height / 2);
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
  text(`振幅: ${amplitude} px`, infoX, infoY + 40);

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
  document.addEventListener('input', () => {
    if (!useEquationMode) {
      updateWaveInstances();
    }
  });
  document.addEventListener('change', () => {
    if (!useEquationMode) {
      updateWaveInstances();
    }
  });
});
