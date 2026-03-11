/* =====================================================================
   ADVANCED CALCULATOR — The Most Feature-Rich Calculator on the Planet
   =====================================================================
   Modes: Standard, Scientific, Programmer, Graphing, Converter,
          Matrix, Statistics, Date
   Features: Full keyboard support, history, memory, undo, themes,
             expression parsing, base conversions, unit conversions,
             function graphing, matrix operations, statistical analysis,
             date arithmetic
   ===================================================================== */

(function () {
    'use strict';

    // ─── STATE ────────────────────────────────────────────────
    const state = {
        currentMode: 'standard',
        expression: '',
        result: '0',
        history: [],
        memory: [],
        memoryValue: 0,
        angleUnit: 'deg', // deg, rad, grad
        secondFn: false,
        undoStack: [],
        // Programmer mode
        progBase: 10,
        progBits: 32,
        // Graphing
        graphFunctions: [],
        graphColors: ['#e94560','#4caf50','#2196f3','#ff9800','#9c27b0','#00bcd4','#ff5722','#8bc34a'],
    };

    // ─── DOM REFERENCES ───────────────────────────────────────
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    const elStdExpr = $('#std-expression');
    const elStdResult = $('#std-result');
    const elSciExpr = $('#sci-expression');
    const elSciResult = $('#sci-result');
    const elProgExpr = $('#prog-expression');
    const elProgResult = $('#prog-result');

    // Current display helpers
    function getExprEl() {
        if (state.currentMode === 'scientific') return elSciExpr;
        if (state.currentMode === 'programmer') return elProgExpr;
        return elStdExpr;
    }
    function getResultEl() {
        if (state.currentMode === 'scientific') return elSciResult;
        if (state.currentMode === 'programmer') return elProgResult;
        return elStdResult;
    }

    function updateDisplay() {
        getExprEl().textContent = state.expression;
        getResultEl().textContent = state.result;
        if (state.currentMode === 'programmer') updateBaseDisplay();
    }

    // ─── THEME ────────────────────────────────────────────────
    const themeBtn = $('#theme-toggle');
    let darkTheme = true;

    themeBtn.addEventListener('click', () => {
        darkTheme = !darkTheme;
        document.documentElement.setAttribute('data-theme', darkTheme ? '' : 'light');
        themeBtn.textContent = darkTheme ? '🌙' : '☀️';
    });

    // ─── MODE SWITCHING ───────────────────────────────────────
    $$('.mode-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            $$('.mode-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const mode = tab.dataset.mode;
            state.currentMode = mode;
            $$('.calc-mode').forEach(m => m.classList.remove('active'));
            $(`#mode-${mode}`).classList.add('active');
            if (mode === 'graphing') initGraph();
            if (mode === 'matrix') initMatrices();
            if (mode === 'converter') initConverter();
        });
    });

    // ─── SAFE EXPRESSION EVALUATOR ────────────────────────────
    function safeEval(expr) {
        try {
            // Sanitize: only allow numbers, operators, parens, dots, spaces
            let sanitized = expr
                .replace(/×/g, '*')
                .replace(/÷/g, '/')
                .replace(/−/g, '-')
                .replace(/\^/g, '**');

            // Validate characters
            if (/[^0-9+\-*/().%\s,e]/.test(sanitized.replace(/\*\*/g, ''))) {
                return NaN;
            }
            const fn = new Function('return (' + sanitized + ')');
            const result = fn();
            return result;
        } catch {
            return NaN;
        }
    }

    // ─── MATH HELPERS ─────────────────────────────────────────
    function toRad(val) {
        if (state.angleUnit === 'deg') return val * Math.PI / 180;
        if (state.angleUnit === 'grad') return val * Math.PI / 200;
        return val;
    }

    function fromRad(val) {
        if (state.angleUnit === 'deg') return val * 180 / Math.PI;
        if (state.angleUnit === 'grad') return val * 200 / Math.PI;
        return val;
    }

    function factorial(n) {
        if (n < 0) return NaN;
        if (n === 0 || n === 1) return 1;
        if (n > 170) return Infinity;
        let r = 1;
        for (let i = 2; i <= n; i++) r *= i;
        return r;
    }

    function formatNumber(n) {
        if (typeof n !== 'number' || isNaN(n)) return 'Error';
        if (!isFinite(n)) return n > 0 ? 'Infinity' : '-Infinity';
        if (Number.isInteger(n) && Math.abs(n) < 1e15) return n.toString();
        const s = n.toPrecision(12);
        return parseFloat(s).toString();
    }

    // ─── PUSH UNDO ───────────────────────────────────────────
    function pushUndo() {
        state.undoStack.push({ expression: state.expression, result: state.result });
        if (state.undoStack.length > 50) state.undoStack.shift();
    }

    function undo() {
        const prev = state.undoStack.pop();
        if (prev) {
            state.expression = prev.expression;
            state.result = prev.result;
            updateDisplay();
        }
    }

    // ─── HISTORY ──────────────────────────────────────────────
    function addHistory(expr, result) {
        state.history.unshift({ expr, result });
        if (state.history.length > 100) state.history.pop();
        renderHistory();
    }

    function renderHistory() {
        const list = $('#history-list');
        list.innerHTML = '';
        state.history.forEach((item, i) => {
            const li = document.createElement('li');
            li.innerHTML = `<div class="hist-expr">${item.expr}</div><div class="hist-result">${item.result}</div>`;
            li.addEventListener('click', () => {
                state.result = item.result;
                state.expression = item.expr;
                updateDisplay();
            });
            list.appendChild(li);
        });
    }

    $('#clear-history').addEventListener('click', () => {
        state.history = [];
        renderHistory();
    });

    // ─── MEMORY ───────────────────────────────────────────────
    function renderMemory() {
        const list = $('#memory-list');
        list.innerHTML = '';
        state.memory.forEach((val, i) => {
            const li = document.createElement('li');
            li.textContent = formatNumber(val);
            li.addEventListener('click', () => {
                state.result = formatNumber(val);
                state.expression = '';
                updateDisplay();
            });
            list.appendChild(li);
        });
    }

    $('#clear-memory').addEventListener('click', () => {
        state.memory = [];
        state.memoryValue = 0;
        renderMemory();
    });

    function handleMemory(action) {
        const current = parseFloat(state.result) || 0;
        switch (action) {
            case 'mc':
                state.memoryValue = 0;
                state.memory = [];
                break;
            case 'mr':
                state.result = formatNumber(state.memoryValue);
                state.expression = '';
                break;
            case 'm+':
                state.memoryValue += current;
                state.memory.unshift(state.memoryValue);
                break;
            case 'm-':
                state.memoryValue -= current;
                state.memory.unshift(state.memoryValue);
                break;
            case 'ms':
                state.memoryValue = current;
                state.memory.unshift(current);
                break;
        }
        renderMemory();
        updateDisplay();
    }

    // Attach memory buttons
    $$('[data-mem]').forEach(btn => {
        btn.addEventListener('click', () => handleMemory(btn.dataset.mem));
    });

    // ─── STANDARD & SCIENTIFIC BUTTON HANDLER ─────────────────
    function getCurrentValue() {
        return parseFloat(state.result) || 0;
    }

    function handleCalcButton(val) {
        pushUndo();

        // Digits and decimal
        if (/^[0-9]$/.test(val)) {
            if (state.result === '0' || state.result === 'Error') {
                state.result = val;
            } else {
                state.result += val;
            }
            updateDisplay();
            return;
        }

        if (val === '.') {
            if (!state.result.includes('.')) {
                state.result += '.';
            }
            updateDisplay();
            return;
        }

        // Operators
        if (['+', '-', '*', '/'].includes(val)) {
            state.expression = state.result + ' ' + val + ' ';
            state.result = '0';
            updateDisplay();
            return;
        }

        if (val === 'mod') {
            state.expression = state.result + ' % ';
            state.result = '0';
            updateDisplay();
            return;
        }

        if (val === 'x^y' || val === '^') {
            state.expression = state.result + ' ^ ';
            state.result = '0';
            updateDisplay();
            return;
        }

        // Parentheses — append to expression
        if (val === '(' || val === ')') {
            if (state.result !== '0' && state.result !== 'Error' && val === '(') {
                state.expression += state.result + ' × ';
                state.result = '0';
            }
            state.expression += val;
            updateDisplay();
            return;
        }

        // Evaluate
        if (val === '=') {
            let fullExpr = state.expression + state.result;
            fullExpr = fullExpr.replace(/\^/g, '**');
            const evalResult = safeEval(fullExpr);
            const formatted = formatNumber(evalResult);
            addHistory(state.expression + state.result, formatted);
            state.expression = '';
            state.result = formatted;
            updateDisplay();
            return;
        }

        // Clear
        if (val === 'clear') {
            state.expression = '';
            state.result = '0';
            updateDisplay();
            return;
        }

        if (val === 'ce') {
            state.result = '0';
            updateDisplay();
            return;
        }

        // Delete last character
        if (val === 'del') {
            if (state.result.length > 1) {
                state.result = state.result.slice(0, -1);
            } else {
                state.result = '0';
            }
            updateDisplay();
            return;
        }

        // Negate
        if (val === 'negate') {
            const n = parseFloat(state.result);
            state.result = formatNumber(-n);
            updateDisplay();
            return;
        }

        // Percent
        if (val === '%') {
            const n = parseFloat(state.result);
            state.result = formatNumber(n / 100);
            updateDisplay();
            return;
        }

        // Unary operations
        const cur = getCurrentValue();
        let res;

        switch (val) {
            case '1/x':   res = 1 / cur; break;
            case 'x^2':   res = cur * cur; break;
            case 'x^3':   res = cur * cur * cur; break;
            case 'sqrt':  res = Math.sqrt(cur); break;
            case 'cbrt':  res = Math.cbrt(cur); break;
            case 'n!':    res = factorial(Math.round(cur)); break;
            case '|x|':   res = Math.abs(cur); break;
            case 'log':   res = Math.log10(cur); break;
            case 'log2':  res = Math.log2(cur); break;
            case 'ln':    res = Math.log(cur); break;
            case '10^x':  res = Math.pow(10, cur); break;
            case 'e^x':   res = Math.exp(cur); break;
            case 'exp':   res = Math.exp(cur); break;
            case 'pi':    res = Math.PI; break;
            case 'e':     res = Math.E; break;
            case 'sin':
                res = state.secondFn ? fromRad(Math.asin(cur)) : Math.sin(toRad(cur)); break;
            case 'cos':
                res = state.secondFn ? fromRad(Math.acos(cur)) : Math.cos(toRad(cur)); break;
            case 'tan':
                res = state.secondFn ? fromRad(Math.atan(cur)) : Math.tan(toRad(cur)); break;
            case 'sinh':
                res = state.secondFn ? Math.asinh(cur) : Math.sinh(cur); break;
            case 'cosh':
                res = state.secondFn ? Math.acosh(cur) : Math.cosh(cur); break;
            case 'tanh':
                res = state.secondFn ? Math.atanh(cur) : Math.tanh(cur); break;
            case 'floor': res = Math.floor(cur); break;
            case 'ceil':  res = Math.ceil(cur); break;
            case '2nd':
                state.secondFn = !state.secondFn;
                const btn2nd = $('#btn-2nd');
                if (btn2nd) btn2nd.classList.toggle('active', state.secondFn);
                updateSecondLabels();
                return;
            default: return;
        }

        state.result = formatNumber(res);
        updateDisplay();
    }

    function updateSecondLabels() {
        const map = {
            'sin': ['sin', 'sin⁻¹'], 'cos': ['cos', 'cos⁻¹'], 'tan': ['tan', 'tan⁻¹'],
            'sinh': ['sinh', 'sinh⁻¹'], 'cosh': ['cosh', 'cosh⁻¹'], 'tanh': ['tanh', 'tanh⁻¹'],
            'x^2': ['x²', '√'], 'ln': ['ln', 'eˣ'], 'log': ['log', '10ˣ'],
            '10^x': ['10ˣ', '2ˣ'], 'e^x': ['eˣ', 'ln'],
        };
        $$('#mode-scientific .btn-grid button').forEach(btn => {
            const val = btn.dataset.val;
            if (map[val]) {
                btn.textContent = state.secondFn ? map[val][1] : map[val][0];
            }
        });
    }

    // Attach standard & scientific buttons
    $$('#mode-standard .btn-grid button, #mode-scientific .btn-grid button').forEach(btn => {
        btn.addEventListener('click', () => handleCalcButton(btn.dataset.val));
    });

    // ─── ANGLE MODE ───────────────────────────────────────────
    $$('.angle-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            $$('.angle-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.angleUnit = btn.dataset.angle;
        });
    });

    // ─── PROGRAMMER MODE ──────────────────────────────────────
    function updateBaseDisplay() {
        const n = parseInt(state.result, state.progBase) || 0;
        const bits = state.progBits;
        const mask = bits === 64 ? BigInt('0xFFFFFFFFFFFFFFFF') : (1 << bits) - 1;

        let masked;
        if (bits === 64) {
            masked = Number(BigInt(Math.trunc(n)) & mask);
        } else {
            masked = Math.trunc(n) & mask;
        }

        $('#hex-val').textContent = (masked >>> 0).toString(16).toUpperCase();
        $('#dec-val').textContent = masked.toString(10);
        $('#oct-val').textContent = (masked >>> 0).toString(8);
        $('#bin-val').textContent = (masked >>> 0).toString(2);
    }

    function handleProgButton(val) {
        pushUndo();

        // Hex digits
        if (/^[A-F]$/.test(val) && state.progBase === 16) {
            state.result = (state.result === '0' ? '' : state.result) + val;
            updateDisplay();
            return;
        }

        // Digits
        if (/^[0-9]$/.test(val)) {
            if (state.progBase === 2 && parseInt(val) > 1) return;
            if (state.progBase === 8 && parseInt(val) > 7) return;
            state.result = (state.result === '0' ? '' : state.result) + val;
            updateDisplay();
            return;
        }

        if (val === '.') {
            if (!state.result.includes('.')) state.result += '.';
            updateDisplay();
            return;
        }

        // Operators
        if (['+', '-', '*', '/', '%'].includes(val)) {
            state.expression = state.result + ' ' + val + ' ';
            state.result = '0';
            updateDisplay();
            return;
        }

        if (val === '(' || val === ')') {
            state.expression += val;
            updateDisplay();
            return;
        }

        if (val === '=') {
            let fullExpr = state.expression + state.result;
            // Convert from current base to decimal for evaluation
            const tokens = fullExpr.split(/(\s+[+\-*/%]\s+)/);
            const decExpr = tokens.map(t => {
                t = t.trim();
                if (['+', '-', '*', '/', '%'].includes(t)) return t;
                const n = parseInt(t, state.progBase);
                return isNaN(n) ? t : n.toString();
            }).join(' ');

            const evalResult = safeEval(decExpr);
            const intResult = Math.trunc(evalResult);
            addHistory(fullExpr, intResult.toString(state.progBase).toUpperCase());
            state.expression = '';
            state.result = intResult.toString(state.progBase).toUpperCase();
            updateDisplay();
            return;
        }

        // Bitwise
        const cur = parseInt(state.result, state.progBase) || 0;
        if (val === 'NOT') {
            const mask = state.progBits === 64 ? 0xFFFFFFFF : ((1 << state.progBits) - 1);
            state.result = ((~cur) & mask).toString(state.progBase).toUpperCase();
            updateDisplay();
            return;
        }

        if (['AND', 'OR', 'XOR', 'NAND', 'NOR', '<<', '>>'].includes(val)) {
            state.expression = state.result + ' ' + val + ' ';
            state.result = '0';
            updateDisplay();
            return;
        }

        if (val === 'clear') {
            state.expression = '';
            state.result = '0';
            updateDisplay();
            return;
        }
        if (val === 'del') {
            state.result = state.result.length > 1 ? state.result.slice(0, -1) : '0';
            updateDisplay();
            return;
        }
    }

    // Handle = for bitwise expressions
    function evalProgExpression(expr) {
        // Replace bitwise ops
        expr = expr.replace(/\bAND\b/g, '&')
                   .replace(/\bOR\b/g, '|')
                   .replace(/\bXOR\b/g, '^')
                   .replace(/\bNAND\b/g, '& ~')
                   .replace(/\bNOR\b/g, '| ~')
                   .replace(/<</g, '<<')
                   .replace(/>>/g, '>>');
        return safeEval(expr);
    }

    $$('#mode-programmer .btn-grid button').forEach(btn => {
        btn.addEventListener('click', () => handleProgButton(btn.dataset.val));
    });

    // Base selector
    $$('.base-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const currentVal = parseInt(state.result, state.progBase) || 0;
            $$('.base-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.progBase = parseInt(btn.dataset.base);
            state.result = currentVal.toString(state.progBase).toUpperCase();
            state.expression = '';
            updateDisplay();
            updateProgBtnStates();
        });
    });

    // Bit width
    $$('.bw-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            $$('.bw-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.progBits = parseInt(btn.dataset.bits);
            updateDisplay();
        });
    });

    function updateProgBtnStates() {
        $$('#mode-programmer .btn-grid button').forEach(btn => {
            const v = btn.dataset.val;
            if (/^[A-F]$/.test(v)) {
                btn.disabled = state.progBase !== 16;
            }
            if (/^[2-9]$/.test(v)) {
                btn.disabled = (state.progBase === 2) || (state.progBase === 8 && parseInt(v) > 7);
            }
            if (/^[89]$/.test(v)) {
                btn.disabled = state.progBase === 2 || state.progBase === 8;
            }
        });
    }

    // ─── GRAPHING MODE ────────────────────────────────────────
    let graphCtx = null;
    let graphCanvas = null;

    function initGraph() {
        graphCanvas = $('#graph-canvas');
        graphCtx = graphCanvas.getContext('2d');
        graphCanvas.width = graphCanvas.offsetWidth * (window.devicePixelRatio || 1);
        graphCanvas.height = graphCanvas.offsetHeight * (window.devicePixelRatio || 1);
        graphCtx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
        drawGraph();
    }

    function parseGraphFn(fnStr) {
        // Replace math functions and constants for eval
        let s = fnStr
            .replace(/\bsin\b/g, 'Math.sin')
            .replace(/\bcos\b/g, 'Math.cos')
            .replace(/\btan\b/g, 'Math.tan')
            .replace(/\basin\b/g, 'Math.asin')
            .replace(/\bacos\b/g, 'Math.acos')
            .replace(/\batan\b/g, 'Math.atan')
            .replace(/\bsqrt\b/g, 'Math.sqrt')
            .replace(/\bcbrt\b/g, 'Math.cbrt')
            .replace(/\blogs\b/g, 'Math.log')
            .replace(/\blog\b/g, 'Math.log10')
            .replace(/\bln\b/g, 'Math.log')
            .replace(/\babs\b/g, 'Math.abs')
            .replace(/\bfloor\b/g, 'Math.floor')
            .replace(/\bceil\b/g, 'Math.ceil')
            .replace(/\bround\b/g, 'Math.round')
            .replace(/\bexp\b/g, 'Math.exp')
            .replace(/\bpi\b/gi, 'Math.PI')
            .replace(/\be\b/g, 'Math.E')
            .replace(/\^/g, '**');
        return new Function('x', 'return ' + s);
    }

    function drawGraph() {
        if (!graphCtx) return;
        const w = graphCanvas.offsetWidth;
        const h = graphCanvas.offsetHeight;

        const xmin = parseFloat($('#graph-xmin').value) || -10;
        const xmax = parseFloat($('#graph-xmax').value) || 10;
        const ymin = parseFloat($('#graph-ymin').value) || -10;
        const ymax = parseFloat($('#graph-ymax').value) || 10;

        graphCtx.clearRect(0, 0, w, h);

        // Grid
        graphCtx.strokeStyle = state.graphColors.length ? 'var(--graph-grid)' : '#2a2a4a';
        graphCtx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--graph-grid').trim() || '#2a2a4a';
        graphCtx.lineWidth = 0.5;

        const xScale = w / (xmax - xmin);
        const yScale = h / (ymax - ymin);

        function toCanvasX(x) { return (x - xmin) * xScale; }
        function toCanvasY(y) { return h - (y - ymin) * yScale; }

        // Draw grid lines
        for (let x = Math.ceil(xmin); x <= Math.floor(xmax); x++) {
            graphCtx.beginPath();
            graphCtx.moveTo(toCanvasX(x), 0);
            graphCtx.lineTo(toCanvasX(x), h);
            graphCtx.stroke();
        }
        for (let y = Math.ceil(ymin); y <= Math.floor(ymax); y++) {
            graphCtx.beginPath();
            graphCtx.moveTo(0, toCanvasY(y));
            graphCtx.lineTo(w, toCanvasY(y));
            graphCtx.stroke();
        }

        // Axes
        graphCtx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--graph-axis').trim() || '#e0e0e0';
        graphCtx.lineWidth = 1.5;
        // X axis
        if (ymin <= 0 && ymax >= 0) {
            graphCtx.beginPath();
            graphCtx.moveTo(0, toCanvasY(0));
            graphCtx.lineTo(w, toCanvasY(0));
            graphCtx.stroke();
        }
        // Y axis
        if (xmin <= 0 && xmax >= 0) {
            graphCtx.beginPath();
            graphCtx.moveTo(toCanvasX(0), 0);
            graphCtx.lineTo(toCanvasX(0), h);
            graphCtx.stroke();
        }

        // Axis labels
        graphCtx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim() || '#aaa';
        graphCtx.font = '10px Consolas, monospace';
        for (let x = Math.ceil(xmin); x <= Math.floor(xmax); x++) {
            if (x === 0) continue;
            graphCtx.fillText(x, toCanvasX(x) + 2, toCanvasY(0) - 4);
        }
        for (let y = Math.ceil(ymin); y <= Math.floor(ymax); y++) {
            if (y === 0) continue;
            graphCtx.fillText(y, toCanvasX(0) + 4, toCanvasY(y) - 2);
        }

        // Plot functions
        state.graphFunctions.forEach((fnObj, idx) => {
            try {
                const fn = parseGraphFn(fnObj.expr);
                graphCtx.strokeStyle = fnObj.color;
                graphCtx.lineWidth = 2;
                graphCtx.beginPath();
                let first = true;
                const step = (xmax - xmin) / w;
                for (let px = 0; px < w; px++) {
                    const x = xmin + px * step;
                    const y = fn(x);
                    if (!isFinite(y) || isNaN(y)) {
                        first = true;
                        continue;
                    }
                    const cy = toCanvasY(y);
                    if (first) {
                        graphCtx.moveTo(px, cy);
                        first = false;
                    } else {
                        graphCtx.lineTo(px, cy);
                    }
                }
                graphCtx.stroke();
            } catch (e) {
                // Skip invalid functions
            }
        });
    }

    // Graph controls
    if ($('#graph-plot-btn')) {
        $('#graph-plot-btn').addEventListener('click', () => {
            const expr = $('#graph-fn-input').value.trim();
            if (!expr) return;
            const color = state.graphColors[state.graphFunctions.length % state.graphColors.length];
            state.graphFunctions.push({ expr, color });
            renderGraphFnList();
            drawGraph();
        });
    }

    if ($('#graph-clear-btn')) {
        $('#graph-clear-btn').addEventListener('click', () => {
            state.graphFunctions = [];
            renderGraphFnList();
            drawGraph();
        });
    }

    ['graph-xmin', 'graph-xmax', 'graph-ymin', 'graph-ymax'].forEach(id => {
        const el = $(`#${id}`);
        if (el) el.addEventListener('change', drawGraph);
    });

    function renderGraphFnList() {
        const container = $('#graph-fn-list');
        container.innerHTML = '';
        state.graphFunctions.forEach((fn, i) => {
            const tag = document.createElement('span');
            tag.className = 'fn-tag';
            tag.style.background = fn.color;
            tag.innerHTML = `y = ${fn.expr} <button data-idx="${i}">✕</button>`;
            tag.querySelector('button').addEventListener('click', () => {
                state.graphFunctions.splice(i, 1);
                renderGraphFnList();
                drawGraph();
            });
            container.appendChild(tag);
        });
    }

    // Graph hover coordinates
    if ($('#graph-canvas')) {
        $('#graph-canvas').addEventListener('mousemove', (e) => {
            const rect = graphCanvas.getBoundingClientRect();
            const px = e.clientX - rect.left;
            const py = e.clientY - rect.top;
            const w = graphCanvas.offsetWidth;
            const h = graphCanvas.offsetHeight;
            const xmin = parseFloat($('#graph-xmin').value) || -10;
            const xmax = parseFloat($('#graph-xmax').value) || 10;
            const ymin = parseFloat($('#graph-ymin').value) || -10;
            const ymax = parseFloat($('#graph-ymax').value) || 10;
            const x = xmin + (px / w) * (xmax - xmin);
            const y = ymax - (py / h) * (ymax - ymin);
            $('#graph-info').textContent = `x: ${x.toFixed(4)}  y: ${y.toFixed(4)}`;
        });
    }

    // ─── UNIT CONVERTER ───────────────────────────────────────
    const conversionData = {
        length: {
            units: ['Meter', 'Kilometer', 'Centimeter', 'Millimeter', 'Mile', 'Yard', 'Foot', 'Inch', 'Nautical Mile', 'Micrometer', 'Nanometer', 'Light Year', 'Astronomical Unit'],
            toBase: [1, 1000, 0.01, 0.001, 1609.344, 0.9144, 0.3048, 0.0254, 1852, 1e-6, 1e-9, 9.461e15, 1.496e11]
        },
        weight: {
            units: ['Kilogram', 'Gram', 'Milligram', 'Metric Ton', 'Pound', 'Ounce', 'Stone', 'US Ton', 'Imperial Ton', 'Microgram'],
            toBase: [1, 0.001, 0.000001, 1000, 0.453592, 0.0283495, 6.35029, 907.185, 1016.05, 1e-9]
        },
        temperature: {
            units: ['Celsius', 'Fahrenheit', 'Kelvin'],
            special: true
        },
        area: {
            units: ['Square Meter', 'Square Kilometer', 'Square Mile', 'Square Yard', 'Square Foot', 'Square Inch', 'Hectare', 'Acre'],
            toBase: [1, 1e6, 2.59e6, 0.836127, 0.092903, 0.00064516, 10000, 4046.86]
        },
        volume: {
            units: ['Liter', 'Milliliter', 'Cubic Meter', 'Gallon (US)', 'Quart (US)', 'Pint (US)', 'Cup (US)', 'Fluid Ounce (US)', 'Tablespoon', 'Teaspoon', 'Gallon (UK)', 'Cubic Foot', 'Cubic Inch'],
            toBase: [1, 0.001, 1000, 3.78541, 0.946353, 0.473176, 0.236588, 0.0295735, 0.0147868, 0.00492892, 4.54609, 28.3168, 0.0163871]
        },
        speed: {
            units: ['m/s', 'km/h', 'mph', 'knot', 'ft/s', 'Mach', 'Speed of Light'],
            toBase: [1, 0.277778, 0.44704, 0.514444, 0.3048, 343, 299792458]
        },
        time: {
            units: ['Second', 'Millisecond', 'Microsecond', 'Nanosecond', 'Minute', 'Hour', 'Day', 'Week', 'Month (30d)', 'Year (365d)', 'Decade', 'Century'],
            toBase: [1, 0.001, 1e-6, 1e-9, 60, 3600, 86400, 604800, 2592000, 31536000, 315360000, 3153600000]
        },
        data: {
            units: ['Bit', 'Byte', 'Kilobyte', 'Megabyte', 'Gigabyte', 'Terabyte', 'Petabyte', 'Kibibyte', 'Mebibyte', 'Gibibyte', 'Tebibyte'],
            toBase: [1, 8, 8000, 8e6, 8e9, 8e12, 8e15, 8192, 8388608, 8.59e9, 8.796e12]
        },
        pressure: {
            units: ['Pascal', 'Kilopascal', 'Bar', 'Atmosphere', 'mmHg', 'PSI', 'Torr'],
            toBase: [1, 1000, 100000, 101325, 133.322, 6894.76, 133.322]
        },
        energy: {
            units: ['Joule', 'Kilojoule', 'Calorie', 'Kilocalorie', 'Watt-hour', 'Kilowatt-hour', 'Electronvolt', 'BTU', 'Therm'],
            toBase: [1, 1000, 4.184, 4184, 3600, 3.6e6, 1.602e-19, 1055.06, 1.055e8]
        },
        power: {
            units: ['Watt', 'Kilowatt', 'Megawatt', 'Horsepower', 'BTU/hour', 'Foot-pound/second'],
            toBase: [1, 1000, 1e6, 745.7, 0.293071, 1.35582]
        },
        angle: {
            units: ['Degree', 'Radian', 'Gradian', 'Arcminute', 'Arcsecond', 'Turn'],
            toBase: [1, 57.2958, 0.9, 1/60, 1/3600, 360]
        }
    };

    function convertTemperature(val, from, to) {
        // Convert to Celsius first
        let c;
        if (from === 'Celsius') c = val;
        else if (from === 'Fahrenheit') c = (val - 32) * 5 / 9;
        else c = val - 273.15; // Kelvin

        if (to === 'Celsius') return c;
        if (to === 'Fahrenheit') return c * 9 / 5 + 32;
        return c + 273.15; // Kelvin
    }

    function initConverter() {
        const cat = $('#converter-category').value;
        const data = conversionData[cat];
        const fromSel = $('#converter-from-unit');
        const toSel = $('#converter-to-unit');
        fromSel.innerHTML = '';
        toSel.innerHTML = '';
        data.units.forEach((u, i) => {
            fromSel.innerHTML += `<option value="${i}">${u}</option>`;
            toSel.innerHTML += `<option value="${i}">${u}</option>`;
        });
        if (data.units.length > 1) toSel.selectedIndex = 1;
        doConversion();
    }

    function doConversion() {
        const cat = $('#converter-category').value;
        const data = conversionData[cat];
        const fromIdx = parseInt($('#converter-from-unit').value);
        const toIdx = parseInt($('#converter-to-unit').value);
        const val = parseFloat($('#converter-from-val').value) || 0;

        let result;
        if (data.special) {
            result = convertTemperature(val, data.units[fromIdx], data.units[toIdx]);
        } else {
            const inBase = val * data.toBase[fromIdx];
            result = inBase / data.toBase[toIdx];
        }
        $('#converter-to-val').value = result.toPrecision(10);
    }

    if ($('#converter-category')) {
        $('#converter-category').addEventListener('change', initConverter);
        ['converter-from-val', 'converter-from-unit', 'converter-to-unit'].forEach(id => {
            $(`#${id}`).addEventListener('input', doConversion);
            $(`#${id}`).addEventListener('change', doConversion);
        });
        $('#converter-swap-btn').addEventListener('click', () => {
            const fromSel = $('#converter-from-unit');
            const toSel = $('#converter-to-unit');
            const tmp = fromSel.value;
            fromSel.value = toSel.value;
            toSel.value = tmp;
            doConversion();
        });
        initConverter();
    }

    // ─── MATRIX MODE ──────────────────────────────────────────
    function initMatrices() {
        generateMatrixGrids();
    }

    function generateMatrixGrids() {
        const aRows = parseInt($('#mat-a-rows').value) || 2;
        const aCols = parseInt($('#mat-a-cols').value) || 2;
        const bRows = parseInt($('#mat-b-rows').value) || 2;
        const bCols = parseInt($('#mat-b-cols').value) || 2;
        generateGrid('matrix-a-grid', aRows, aCols, 'a');
        generateGrid('matrix-b-grid', bRows, bCols, 'b');
        $('#matrix-result-grid').innerHTML = '';
        $('#matrix-result-text').textContent = '';
    }

    function generateGrid(containerId, rows, cols, prefix) {
        const container = $(`#${containerId}`);
        container.innerHTML = '';
        container.style.gridTemplateColumns = `repeat(${cols}, 55px)`;
        for (let i = 0; i < rows; i++) {
            for (let j = 0; j < cols; j++) {
                const input = document.createElement('input');
                input.type = 'number';
                input.value = '0';
                input.id = `mat-${prefix}-${i}-${j}`;
                input.step = 'any';
                container.appendChild(input);
            }
        }
    }

    function readMatrix(prefix, rows, cols) {
        const mat = [];
        for (let i = 0; i < rows; i++) {
            mat[i] = [];
            for (let j = 0; j < cols; j++) {
                mat[i][j] = parseFloat($(`#mat-${prefix}-${i}-${j}`).value) || 0;
            }
        }
        return mat;
    }

    function displayResultMatrix(mat) {
        const container = $('#matrix-result-grid');
        container.innerHTML = '';
        if (!mat || !mat.length) return;
        const cols = mat[0].length;
        container.style.gridTemplateColumns = `repeat(${cols}, 65px)`;
        mat.forEach(row => {
            row.forEach(val => {
                const cell = document.createElement('span');
                cell.className = 'mat-cell-ro';
                cell.textContent = Number.isInteger(val) ? val : val.toFixed(4);
                container.appendChild(cell);
            });
        });
    }

    function matAdd(a, b) {
        return a.map((row, i) => row.map((v, j) => v + b[i][j]));
    }

    function matSub(a, b) {
        return a.map((row, i) => row.map((v, j) => v - b[i][j]));
    }

    function matMul(a, b) {
        const rows = a.length, cols = b[0].length, inner = b.length;
        const result = Array.from({ length: rows }, () => Array(cols).fill(0));
        for (let i = 0; i < rows; i++)
            for (let j = 0; j < cols; j++)
                for (let k = 0; k < inner; k++)
                    result[i][j] += a[i][k] * b[k][j];
        return result;
    }

    function matTranspose(m) {
        return m[0].map((_, j) => m.map(row => row[j]));
    }

    function matDet(m) {
        const n = m.length;
        if (n === 1) return m[0][0];
        if (n === 2) return m[0][0] * m[1][1] - m[0][1] * m[1][0];
        let det = 0;
        for (let j = 0; j < n; j++) {
            const sub = m.slice(1).map(row => [...row.slice(0, j), ...row.slice(j + 1)]);
            det += (j % 2 === 0 ? 1 : -1) * m[0][j] * matDet(sub);
        }
        return det;
    }

    function matInverse(m) {
        const n = m.length;
        // Augmented matrix
        const aug = m.map((row, i) => {
            const ident = Array(n).fill(0);
            ident[i] = 1;
            return [...row, ...ident];
        });
        // Gauss-Jordan
        for (let i = 0; i < n; i++) {
            let maxRow = i;
            for (let k = i + 1; k < n; k++)
                if (Math.abs(aug[k][i]) > Math.abs(aug[maxRow][i])) maxRow = k;
            [aug[i], aug[maxRow]] = [aug[maxRow], aug[i]];
            if (Math.abs(aug[i][i]) < 1e-12) return null; // Singular
            const pivot = aug[i][i];
            for (let j = 0; j < 2 * n; j++) aug[i][j] /= pivot;
            for (let k = 0; k < n; k++) {
                if (k === i) continue;
                const factor = aug[k][i];
                for (let j = 0; j < 2 * n; j++) aug[k][j] -= factor * aug[i][j];
            }
        }
        return aug.map(row => row.slice(n));
    }

    function matScalar(m, k) {
        return m.map(row => row.map(v => v * k));
    }

    if ($('#mat-generate')) {
        $('#mat-generate').addEventListener('click', generateMatrixGrids);
    }

    $$('[data-matop]').forEach(btn => {
        btn.addEventListener('click', () => {
            const op = btn.dataset.matop;
            const aRows = parseInt($('#mat-a-rows').value) || 2;
            const aCols = parseInt($('#mat-a-cols').value) || 2;
            const bRows = parseInt($('#mat-b-rows').value) || 2;
            const bCols = parseInt($('#mat-b-cols').value) || 2;
            const a = readMatrix('a', aRows, aCols);
            const b = readMatrix('b', bRows, bCols);
            let result;

            $('#matrix-result-text').textContent = '';
            $('#matrix-scalar-input').style.display = 'none';

            try {
                switch (op) {
                    case 'add':
                        if (aRows !== bRows || aCols !== bCols) throw 'Matrices must have same dimensions';
                        result = matAdd(a, b);
                        break;
                    case 'sub':
                        if (aRows !== bRows || aCols !== bCols) throw 'Matrices must have same dimensions';
                        result = matSub(a, b);
                        break;
                    case 'mul':
                        if (aCols !== bRows) throw 'A columns must equal B rows';
                        result = matMul(a, b);
                        break;
                    case 'det-a':
                        if (aRows !== aCols) throw 'Matrix A must be square';
                        $('#matrix-result-text').textContent = 'det(A) = ' + matDet(a).toFixed(6);
                        return;
                    case 'det-b':
                        if (bRows !== bCols) throw 'Matrix B must be square';
                        $('#matrix-result-text').textContent = 'det(B) = ' + matDet(b).toFixed(6);
                        return;
                    case 'trans-a':
                        result = matTranspose(a);
                        break;
                    case 'trans-b':
                        result = matTranspose(b);
                        break;
                    case 'inv-a':
                        if (aRows !== aCols) throw 'Matrix A must be square';
                        result = matInverse(a);
                        if (!result) throw 'Matrix A is singular (non-invertible)';
                        break;
                    case 'inv-b':
                        if (bRows !== bCols) throw 'Matrix B must be square';
                        result = matInverse(b);
                        if (!result) throw 'Matrix B is singular (non-invertible)';
                        break;
                    case 'scalar-a':
                        $('#matrix-scalar-input').style.display = 'block';
                        const k = parseFloat($('#mat-scalar-k').value) || 0;
                        result = matScalar(a, k);
                        break;
                }
                displayResultMatrix(result);
            } catch (e) {
                $('#matrix-result-text').textContent = typeof e === 'string' ? e : 'Error';
            }
        });
    });

    // ─── STATISTICS MODE ──────────────────────────────────────
    if ($('#stats-calc-btn')) {
        $('#stats-calc-btn').addEventListener('click', () => {
            const raw = $('#stats-data').value;
            const data = raw.split(/[,\s]+/).map(Number).filter(n => !isNaN(n));
            if (data.length === 0) return;

            const n = data.length;
            const sorted = [...data].sort((a, b) => a - b);
            const sum = data.reduce((a, b) => a + b, 0);
            const mean = sum / n;
            const min = sorted[0];
            const max = sorted[n - 1];
            const range = max - min;

            // Median
            const median = n % 2 === 0
                ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2
                : sorted[Math.floor(n / 2)];

            // Mode
            const freq = {};
            data.forEach(v => freq[v] = (freq[v] || 0) + 1);
            const maxFreq = Math.max(...Object.values(freq));
            const modes = Object.keys(freq).filter(k => freq[k] === maxFreq).map(Number);

            // Variance & Std Dev (population)
            const variance = data.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
            const stddev = Math.sqrt(variance);

            // Sample variance & std dev
            const svariance = n > 1 ? data.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1) : 0;
            const sstddev = Math.sqrt(svariance);

            // Geometric mean (positive values only)
            const allPositive = data.every(v => v > 0);
            const gmean = allPositive
                ? Math.exp(data.reduce((s, v) => s + Math.log(v), 0) / n)
                : NaN;

            // Harmonic mean
            const allNonZero = data.every(v => v !== 0);
            const hmean = allNonZero ? n / data.reduce((s, v) => s + 1 / v, 0) : NaN;

            // Skewness
            const skew = n >= 3
                ? (n / ((n - 1) * (n - 2))) * data.reduce((s, v) => s + ((v - mean) / sstddev) ** 3, 0)
                : NaN;

            // Kurtosis (excess)
            const kurt = n >= 4
                ? ((n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3))) *
                  data.reduce((s, v) => s + ((v - mean) / sstddev) ** 4, 0) -
                  (3 * (n - 1) ** 2) / ((n - 2) * (n - 3))
                : NaN;

            // Quartiles
            function percentile(arr, p) {
                const idx = (p / 100) * (arr.length - 1);
                const lo = Math.floor(idx);
                const hi = Math.ceil(idx);
                return arr[lo] + (arr[hi] - arr[lo]) * (idx - lo);
            }
            const q1 = percentile(sorted, 25);
            const q3 = percentile(sorted, 75);
            const iqr = q3 - q1;

            // Sum of squares
            const sumsq = data.reduce((s, v) => s + v * v, 0);

            const fmt = (v) => typeof v === 'number' && !isNaN(v) ? (Number.isInteger(v) ? v.toString() : v.toFixed(6)) : '—';

            $('#stat-n').textContent = n;
            $('#stat-sum').textContent = fmt(sum);
            $('#stat-mean').textContent = fmt(mean);
            $('#stat-median').textContent = fmt(median);
            $('#stat-mode').textContent = maxFreq === 1 ? 'No mode' : modes.join(', ');
            $('#stat-range').textContent = fmt(range);
            $('#stat-min').textContent = fmt(min);
            $('#stat-max').textContent = fmt(max);
            $('#stat-variance').textContent = fmt(variance);
            $('#stat-stddev').textContent = fmt(stddev);
            $('#stat-svariance').textContent = fmt(svariance);
            $('#stat-sstddev').textContent = fmt(sstddev);
            $('#stat-gmean').textContent = fmt(gmean);
            $('#stat-hmean').textContent = fmt(hmean);
            $('#stat-skew').textContent = fmt(skew);
            $('#stat-kurt').textContent = fmt(kurt);
            $('#stat-q1').textContent = fmt(q1);
            $('#stat-q3').textContent = fmt(q3);
            $('#stat-iqr').textContent = fmt(iqr);
            $('#stat-sumsq').textContent = fmt(sumsq);
        });
    }

    // ─── DATE CALCULATOR ──────────────────────────────────────
    if ($('#date-diff-btn')) {
        // Set default dates
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];
        $('#date-from').value = todayStr;
        $('#date-to').value = todayStr;
        $('#date-start').value = todayStr;
        $('#date-info-input').value = todayStr;

        $('#date-diff-btn').addEventListener('click', () => {
            const from = new Date($('#date-from').value);
            const to = new Date($('#date-to').value);
            if (isNaN(from) || isNaN(to)) { $('#date-diff-result').textContent = 'Invalid dates'; return; }

            const diffMs = Math.abs(to - from);
            const days = Math.floor(diffMs / 86400000);
            const weeks = Math.floor(days / 7);
            const remDays = days % 7;

            // Year/month/day breakdown
            let y1 = from < to ? from : to;
            let y2 = from < to ? to : from;
            let years = y2.getFullYear() - y1.getFullYear();
            let months = y2.getMonth() - y1.getMonth();
            let d = y2.getDate() - y1.getDate();
            if (d < 0) { months--; const prevMonth = new Date(y2.getFullYear(), y2.getMonth(), 0); d += prevMonth.getDate(); }
            if (months < 0) { years--; months += 12; }

            $('#date-diff-result').innerHTML =
                `<strong>${days}</strong> days (${weeks} weeks, ${remDays} days)<br>` +
                `${years} year(s), ${months} month(s), ${d} day(s)<br>` +
                `${Math.floor(diffMs / 3600000)} hours | ${Math.floor(diffMs / 60000)} minutes | ${Math.floor(diffMs / 1000)} seconds`;
        });

        $('#date-add-btn').addEventListener('click', () => {
            const start = new Date($('#date-start').value);
            if (isNaN(start)) { $('#date-add-result').textContent = 'Invalid date'; return; }
            const amount = parseInt($('#date-amount').value) || 0;
            const unit = $('#date-unit').value;
            const isSub = $('#date-add-sub').value === 'sub';
            const mult = isSub ? -1 : 1;
            const result = new Date(start);

            switch (unit) {
                case 'days': result.setDate(result.getDate() + amount * mult); break;
                case 'weeks': result.setDate(result.getDate() + amount * 7 * mult); break;
                case 'months': result.setMonth(result.getMonth() + amount * mult); break;
                case 'years': result.setFullYear(result.getFullYear() + amount * mult); break;
            }

            const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            $('#date-add-result').innerHTML =
                `<strong>${result.toDateString()}</strong> (${dayNames[result.getDay()]})`;
        });

        $('#date-info-btn').addEventListener('click', () => {
            const d = new Date($('#date-info-input').value);
            if (isNaN(d)) { $('#date-info-result').textContent = 'Invalid date'; return; }

            const start = new Date(d.getFullYear(), 0, 0);
            const diff = d - start;
            const dayOfYear = Math.floor(diff / 86400000);

            // ISO week number
            const jan4 = new Date(d.getFullYear(), 0, 4);
            const weekNum = Math.ceil(((d - jan4) / 86400000 + jan4.getDay() + 1) / 7);

            const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

            $('#date-info-result').innerHTML =
                `<strong>${d.toDateString()}</strong><br>` +
                `Day of week: ${dayNames[d.getDay()]}<br>` +
                `Day of year: ${dayOfYear} / ${isLeap(d.getFullYear()) ? 366 : 365}<br>` +
                `Week number: ${weekNum}<br>` +
                `Leap year: ${isLeap(d.getFullYear()) ? 'Yes' : 'No'}<br>` +
                `Unix timestamp: ${Math.floor(d.getTime() / 1000)}`;
        });
    }

    // ─── KEYBOARD SUPPORT ─────────────────────────────────────
    document.addEventListener('keydown', (e) => {
        // Don't capture if typing in an input/textarea
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;

        const key = e.key;

        // Shortcuts modal
        if (key === '?') {
            e.preventDefault();
            $('#shortcuts-modal').classList.toggle('open');
            return;
        }

        if (key === 'Escape') {
            if ($('#shortcuts-modal').classList.contains('open')) {
                $('#shortcuts-modal').classList.remove('open');
                return;
            }
            handleCalcButton('clear');
            return;
        }

        // Undo
        if (e.ctrlKey && key === 'z') {
            e.preventDefault();
            undo();
            return;
        }

        // Digits
        if (/^[0-9]$/.test(key)) { handleCalcButton(key); return; }
        if (key === '.') { handleCalcButton('.'); return; }

        // Operators
        if (key === '+') { handleCalcButton('+'); return; }
        if (key === '-') { handleCalcButton('-'); return; }
        if (key === '*') { handleCalcButton('*'); return; }
        if (key === '/') { e.preventDefault(); handleCalcButton('/'); return; }
        if (key === '%') { handleCalcButton('%'); return; }
        if (key === '^') { handleCalcButton('x^y'); return; }
        if (key === '(') { handleCalcButton('('); return; }
        if (key === ')') { handleCalcButton(')'); return; }
        if (key === '!') { handleCalcButton('n!'); return; }

        // Enter / =
        if (key === 'Enter' || key === '=') { e.preventDefault(); handleCalcButton('='); return; }

        // Backspace
        if (key === 'Backspace') { handleCalcButton('del'); return; }

        // Scientific shortcuts
        if (key === 's') { handleCalcButton('sin'); return; }
        if (key === 'c') { handleCalcButton('cos'); return; }
        if (key === 't') { handleCalcButton('tan'); return; }
        if (key === 'l') { handleCalcButton('log'); return; }
        if (key === 'n') { handleCalcButton('ln'); return; }
        if (key === 'r') { handleCalcButton('sqrt'); return; }
        if (key === 'p') { handleCalcButton('pi'); return; }
    });

    // ─── SHORTCUTS MODAL ──────────────────────────────────────
    $('#shortcuts-btn').addEventListener('click', () => {
        $('#shortcuts-modal').classList.add('open');
    });
    $('#close-shortcuts').addEventListener('click', () => {
        $('#shortcuts-modal').classList.remove('open');
    });
    $('#shortcuts-modal').addEventListener('click', (e) => {
        if (e.target === $('#shortcuts-modal')) {
            $('#shortcuts-modal').classList.remove('open');
        }
    });

    // ─── INIT ─────────────────────────────────────────────────
    updateDisplay();
    updateProgBtnStates();

})();
