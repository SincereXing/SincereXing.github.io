// 米字格简体字练字帖生成器
// 作者：SincereXing git：

const CDN_BASE = 'https://cdn.jsdelivr.net/npm/hanzi-writer-data@latest';

const sheetEl = document.getElementById('sheet');
const inputEl = document.getElementById('charInput');
const genBtn = document.getElementById('generateBtn');
const printBtn = document.getElementById('printBtn');

// 优化要求：固定每行 12 格
const COLUMNS_PER_ROW = 12;
// 垂直居中测量与缩放的统一内边距比例
const PAD_RATIO = 0.08;

// 简单缓存，避免重复请求与重复测量
const dataCache = new Map(); // char -> data
const centerCache = new Map(); // char -> { cx, cy, scale }

function sanitizeInput(str) {
  if (!str) return '';
  return str.replace(/\s+/g, '');
}

async function fetchCharData(char) {
  if (dataCache.has(char)) return dataCache.get(char);
  const url = `${CDN_BASE}/${encodeURIComponent(char)}.json`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`网络错误 ${res.status}`);
    const data = await res.json();
    // 数据结构：{ strokes: string[], medians: number[][][] }
    dataCache.set(char, data);
    return data;
  } catch (e) {
    console.error('获取笔画数据失败：', char, e);
    return null;
  }
}

function createGridSVG() {
  // 生成米字格底图（浅灰线）
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'grid');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('preserveAspectRatio', 'none');

  const lines = [
    ['line', { x1: 0, y1: 0, x2: 100, y2: 100 }], // 对角线
    ['line', { x1: 100, y1: 0, x2: 0, y2: 100 }], // 对角线
    ['line', { x1: 50, y1: 0, x2: 50, y2: 100 }], // 中竖线
    ['line', { x1: 0, y1: 50, x2: 100, y2: 50 }], // 中横线
    ['rect', { x: 1, y: 1, width: 98, height: 98, rx: 0, ry: 0 }], // 边框（留 1 单位内边距）
  ];

  lines.forEach(([tag, attrs]) => {
    const elem = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(attrs).forEach(([k, v]) => elem.setAttribute(k, String(v)));
    elem.setAttribute('stroke', getComputedStyle(document.documentElement).getPropertyValue('--grid-color').trim() || '#cfcfcf');
    elem.setAttribute('stroke-width', tag === 'rect' ? '0.8' : '0.6');
    if (tag === 'rect') {
      elem.setAttribute('fill', 'none');
    }
    svg.appendChild(elem);
  });

  return svg;
}

// 真实垂直居中的关键：先对完整字（所有笔画）做翻转后的 bbox 测量，得到统一 scale 与中心点
function measureCenteringForChar(strokePaths) {
  // 创建隐藏测量 SVG（不能 display:none，否则 getBBox 无法工作）
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 1024 1024');
  svg.setAttribute('width', '1');
  svg.setAttribute('height', '1');
  svg.style.position = 'absolute';
  svg.style.left = '-9999px';
  svg.style.top = '-9999px';

  // 应用翻转：translate(0, 1024) scale(1, -1)
  const orientGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  orientGroup.setAttribute('transform', 'translate(0, 1024) scale(1, -1)');

  strokePaths.forEach((d) => {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    // 颜色不影响 bbox 测量
    path.setAttribute('fill', '#000');
    orientGroup.appendChild(path);
  });

  svg.appendChild(orientGroup);
  document.body.appendChild(svg);

  const bbox = orientGroup.getBBox();
  // 移除测量节点
  svg.remove();

  const pad = 1024 * PAD_RATIO;
  const scale = Math.min(
    (1024 - 2 * pad) / bbox.width,
    (1024 - 2 * pad) / bbox.height
  );
  const cx = bbox.x + bbox.width / 2;
  const cy = bbox.y + bbox.height / 2;

  return { cx, cy, scale };
}

function createStrokesSVG(strokePaths, center) {
  // 将给定笔画路径数组渲染为静态 SVG，基于 1024×1024 坐标系，翻转 + 中心缩放，真正左右上下居中
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'strokes');
  svg.setAttribute('viewBox', '0 0 1024 1024');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');

  // 先做翻转（与测量一致）
  const orientGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  orientGroup.setAttribute('transform', 'translate(0, 1024) scale(1, -1)');

  // 再做统一中心缩放：translate(512,512) scale(scale) translate(-cx,-cy)
  const centerGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  centerGroup.setAttribute('transform', `translate(512, 512) scale(${center.scale}) translate(${-center.cx}, ${-center.cy})`);

  strokePaths.forEach((d) => {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', getComputedStyle(document.documentElement).getPropertyValue('--stroke-color').trim() || '#111');
    centerGroup.appendChild(path);
  });

  orientGroup.appendChild(centerGroup);
  svg.appendChild(orientGroup);
  return svg;
}

function createEmptyCell() {
  const cell = document.createElement('div');
  cell.className = 'cell';
  cell.appendChild(createGridSVG());
  return cell;
}

function createProgressCell(strokePathsUpToN, center) {
  const cell = document.createElement('div');
  cell.className = 'cell';
  cell.appendChild(createGridSVG());
  cell.appendChild(createStrokesSVG(strokePathsUpToN, center));
  return cell;
}

function createFullCharCell(strokePaths, center) {
  const cell = document.createElement('div');
  cell.className = 'cell';
  cell.appendChild(createGridSVG());
  cell.appendChild(createStrokesSVG(strokePaths, center));
  return cell;
}

async function buildCharacterBlock(char, data) {
  const block = document.createElement('section');
  block.className = 'character-block';

  const title = document.createElement('div');
  title.className = 'character-title';
  const strokeCount = Array.isArray(data?.strokes) ? data.strokes.length : 0;
  title.textContent = `${char}（${strokeCount}画）`;
  block.appendChild(title);

  if (!Array.isArray(data?.strokes) || data.strokes.length === 0) {
    // 没有数据时：给出 1 行递进（12 空格） + 1 行练习（12 空格）
    const rowP = document.createElement('div');
    rowP.className = 'row';
    rowP.style.gridTemplateColumns = `repeat(${COLUMNS_PER_ROW}, var(--cell-size))`;
    for (let i = 0; i < COLUMNS_PER_ROW; i++) rowP.appendChild(createEmptyCell());

    const rowE = document.createElement('div');
    rowE.className = 'row';
    rowE.style.gridTemplateColumns = `repeat(${COLUMNS_PER_ROW}, var(--cell-size))`;
    for (let i = 0; i < COLUMNS_PER_ROW; i++) rowE.appendChild(createEmptyCell());

    block.appendChild(rowP);
    block.appendChild(rowE);
    return block;
  }

  // 计算统一居中参数（缓存）
  let center = centerCache.get(char);
  if (!center) {
    center = measureCenteringForChar(data.strokes);
    centerCache.set(char, center);
  }

  // 递进行数：ceil(N / 12)
  const progressionRows = Math.ceil(strokeCount / COLUMNS_PER_ROW) || 1;

  // 1) 笔画递进行（可能多行，每行固定 12 格）
  for (let r = 0; r < progressionRows; r++) {
    const row = document.createElement('div');
    row.className = 'row';
    row.style.gridTemplateColumns = `repeat(${COLUMNS_PER_ROW}, var(--cell-size))`;

    for (let c = 0; c < COLUMNS_PER_ROW; c++) {
      const globalStep = r * COLUMNS_PER_ROW + (c + 1);
      if (globalStep <= strokeCount) {
        const paths = data.strokes.slice(0, globalStep);
        row.appendChild(createProgressCell(paths, center));
      } else {
        // 在最后一行，填充剩余格子为完整字；前面的行一定被步骤完全占满
        if (r === progressionRows - 1) {
          row.appendChild(createFullCharCell(data.strokes, center));
        } else {
          // 理论上不会进入此分支，安全兜底：保持空格
          row.appendChild(createEmptyCell());
        }
      }
    }

    block.appendChild(row);
  }

  // 2) 练习行：与递进行数相同，每行 12 个空格
  for (let r = 0; r < progressionRows; r++) {
    const rowPractice = document.createElement('div');
    rowPractice.className = 'row';
    rowPractice.style.gridTemplateColumns = `repeat(${COLUMNS_PER_ROW}, var(--cell-size))`;
    for (let c = 0; c < COLUMNS_PER_ROW; c++) {
      rowPractice.appendChild(createEmptyCell());
    }
    block.appendChild(rowPractice);
  }

  return block;
}

async function generateSheet(charsRaw) {
  const chars = Array.from(new Set(sanitizeInput(charsRaw).split(''))).filter(Boolean);
  sheetEl.innerHTML = '';

  if (chars.length === 0) {
    const tip = document.createElement('p');
    tip.textContent = '请输入要生成的汉字（支持多个）。';
    sheetEl.appendChild(tip);
    return;
  }

  for (const ch of chars) {
    const data = await fetchCharData(ch);
    if (data && Array.isArray(data.strokes) && data.strokes.length > 0) {
      const block = await buildCharacterBlock(ch, data);
      sheetEl.appendChild(block);
      // 追加后再适配每行单元格尺寸
      adjustBlockLayout(block);
    } else {
      const fallback = document.createElement('section');
      fallback.className = 'character-block';
      const title = document.createElement('div');
      title.className = 'character-title';
      title.textContent = `${ch}（未找到笔画数据）`;
      fallback.appendChild(title);
      // 没有数据时：给出 1 行递进（12 空格） + 1 行练习（12 空格）
      const rowP = document.createElement('div');
      rowP.className = 'row';
      rowP.style.gridTemplateColumns = `repeat(${COLUMNS_PER_ROW}, var(--cell-size))`;
      for (let i = 0; i < COLUMNS_PER_ROW; i++) rowP.appendChild(createEmptyCell());
      const rowE = document.createElement('div');
      rowE.className = 'row';
      rowE.style.gridTemplateColumns = `repeat(${COLUMNS_PER_ROW}, var(--cell-size))`;
      for (let i = 0; i < COLUMNS_PER_ROW; i++) rowE.appendChild(createEmptyCell());
      fallback.appendChild(rowP);
      fallback.appendChild(rowE);
      sheetEl.appendChild(fallback);
      adjustBlockLayout(fallback);
    }
  }
}

function adjustBlockLayout(block) {
  const rows = block.querySelectorAll('.row');
  if (!rows.length) return;
  // 固定每行 12 列，读取第一行列数即可
  const columns = rows[0].children.length;
  // 使用整体 sheet 可用宽度计算（减去左右内边距）
  const sheetStyle = getComputedStyle(sheetEl);
  const paddingL = parseFloat(sheetStyle.paddingLeft) || 0;
  const paddingR = parseFloat(sheetStyle.paddingRight) || 0;
  const contentWidth = sheetEl.clientWidth - paddingL - paddingR;
  const gapPx = 8; // 屏幕和打印均使用 px 间距，保证在宽度内自动压缩
  const cellPx = Math.floor((contentWidth - (columns - 1) * gapPx) / columns);
  const finalPx = Math.max(40, cellPx); // 保持最小可读尺寸
  block.style.setProperty('--cell-gap', `${gapPx}px`);
  block.style.setProperty('--cell-size', `${finalPx}px`);
  rows.forEach(row => {
    row.style.gap = 'var(--cell-gap)';
    row.style.gridTemplateColumns = `repeat(${columns}, var(--cell-size))`;
  });
}

function adjustAllBlocks() {
  document.querySelectorAll('.character-block').forEach(b => adjustBlockLayout(b));
}

// 事件绑定
if (genBtn) {
  genBtn.addEventListener('click', () => {
    generateSheet(inputEl.value).then(() => adjustAllBlocks());
  });
}
if (printBtn) {
  printBtn.addEventListener('click', () => {
    adjustAllBlocks();
    window.print();
  });
}

window.addEventListener('resize', adjustAllBlocks);
window.addEventListener('beforeprint', adjustAllBlocks);

// 初始示例（便于立即打印测试）：中华文明上下五千年
window.addEventListener('DOMContentLoaded', () => {
  const demo = '中华文明上下五千年';
  inputEl.value = demo;
  generateSheet(demo).then(() => adjustAllBlocks());
});
