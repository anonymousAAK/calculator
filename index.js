/* =====================================================================
   ULTIMATE CALCULATOR - BA II Plus + Scientific + Graphing + Everything
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
        angleUnit: 'deg',
        secondFn: false,
        undoStack: [],
        progBase: 10,
        progBits: 32,
        graphFunctions: [],
        graphColors: ['#e94560','#4caf50','#2196f3','#ff9800','#9c27b0','#00bcd4','#ff5722','#8bc34a'],
    };

    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    const elStdExpr = $('#std-expression');
    const elStdResult = $('#std-result');
    const elSciExpr = $('#sci-expression');
    const elSciResult = $('#sci-result');
    const elProgExpr = $('#prog-expression');
    const elProgResult = $('#prog-result');

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

    // ─── HELPERS ─────────────────────────────────────────────
    function fmt(n, dec) {
        if (n === undefined || n === null || isNaN(n)) return 'Error';
        if (!isFinite(n)) return n > 0 ? 'Infinity' : '-Infinity';
        if (dec === undefined) dec = 10;
        let s = parseFloat(n.toFixed(dec));
        return String(s);
    }
    function fmtMoney(n) {
        if (isNaN(n) || !isFinite(n)) return 'Error';
        return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    // ─── MATH HELPERS ────────────────────────────────────────
    function toRad(x) {
        if (state.angleUnit === 'deg') return x * Math.PI / 180;
        if (state.angleUnit === 'grad') return x * Math.PI / 200;
        return x;
    }
    function fromRad(x) {
        if (state.angleUnit === 'deg') return x * 180 / Math.PI;
        if (state.angleUnit === 'grad') return x * 200 / Math.PI;
        return x;
    }
    function factorial(n) {
        if (n < 0) return NaN;
        if (n === 0 || n === 1) return 1;
        if (n > 170) return Infinity;
        let r = 1;
        for (let i = 2; i <= n; i++) r *= i;
        return r;
    }
    function gamma(z) {
        if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * gamma(1 - z));
        z -= 1;
        const g = 7;
        const c = [0.99999999999980993,676.5203681218851,-1259.1392167224028,771.32342877765313,-176.61502916214059,12.507343278686905,-0.13857109526572012,9.9843695780195716e-6,1.5056327351493116e-7];
        let x = c[0];
        for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
        const t = z + g + 0.5;
        return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
    }
    function nPr(n, r) { return factorial(n) / factorial(n - r); }
    function nCr(n, r) { return factorial(n) / (factorial(r) * factorial(n - r)); }
    function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { [a, b] = [b, a % b]; } return a; }
    function lcm(a, b) { return Math.abs(a * b) / gcd(a, b); }

    // ─── EXPRESSION PARSER ──────────────────────────────────
    function safeEval(expr) {
        try {
            let e = expr;
            e = e.replace(/π/g, '(Math.PI)');
            e = e.replace(/\be\b/g, '(Math.E)');
            e = e.replace(/(\d+)!/g, 'factorial($1)');
            e = e.replace(/sin\(/g, 'Math.sin(toRad(');
            e = e.replace(/cos\(/g, 'Math.cos(toRad(');
            e = e.replace(/tan\(/g, 'Math.tan(toRad(');
            e = e.replace(/asin\(/g, 'fromRad(Math.asin(');
            e = e.replace(/acos\(/g, 'fromRad(Math.acos(');
            e = e.replace(/atan\(/g, 'fromRad(Math.atan(');
            e = e.replace(/sinh\(/g, 'Math.sinh(');
            e = e.replace(/cosh\(/g, 'Math.cosh(');
            e = e.replace(/tanh\(/g, 'Math.tanh(');
            e = e.replace(/asinh\(/g, 'Math.asinh(');
            e = e.replace(/acosh\(/g, 'Math.acosh(');
            e = e.replace(/atanh\(/g, 'Math.atanh(');
            e = e.replace(/sec\(/g, '(1/Math.cos(toRad(');
            e = e.replace(/csc\(/g, '(1/Math.sin(toRad(');
            e = e.replace(/cot\(/g, '(1/Math.tan(toRad(');
            e = e.replace(/log₂\(/g, 'Math.log2(');
            e = e.replace(/log\(/g, 'Math.log10(');
            e = e.replace(/ln\(/g, 'Math.log(');
            e = e.replace(/sqrt\(/g, 'Math.sqrt(');
            e = e.replace(/cbrt\(/g, 'Math.cbrt(');
            e = e.replace(/abs\(/g, 'Math.abs(');
            e = e.replace(/floor\(/g, 'Math.floor(');
            e = e.replace(/ceil\(/g, 'Math.ceil(');
            e = e.replace(/round\(/g, 'Math.round(');
            e = e.replace(/sign\(/g, 'Math.sign(');
            e = e.replace(/exp\(/g, 'Math.exp(');
            e = e.replace(/(\d+)\^(\d+)/g, 'Math.pow($1,$2)');
            e = e.replace(/\^/g, '**');
            e = e.replace(/mod/g, '%');
            const fn = new Function('factorial', 'toRad', 'fromRad', 'gamma', 'nPr', 'nCr', '"use strict"; return (' + e + ')');
            return fn(factorial, toRad, fromRad, gamma, nPr, nCr);
        } catch (err) {
            return NaN;
        }
    }

    // ─── MODE SWITCHING ──────────────────────────────────────
    $$('.mode-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            $$('.mode-tab').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            $$('.calc-mode').forEach(m => m.classList.remove('active'));
            const mode = btn.dataset.mode;
            state.currentMode = mode;
            $(`#mode-${mode}`).classList.add('active');
            if (mode === 'graphing') setTimeout(drawGraph, 50);
            if (mode === 'financial') initFinancial();
            if (mode === 'equation') initEquations();
            if (mode === 'statistics') initDistParams();
        });
    });

    // ─── THEME ───────────────────────────────────────────────
    const themeBtn = $('#theme-toggle');
    let darkMode = true;
    themeBtn.addEventListener('click', () => {
        darkMode = !darkMode;
        document.documentElement.setAttribute('data-theme', darkMode ? '' : 'light');
        themeBtn.textContent = darkMode ? '🌙' : '☀️';
        if (state.currentMode === 'graphing') drawGraph();
    });

    // ─── STANDARD / SCIENTIFIC INPUT ─────────────────────────
    function handleInput(val) {
        state.undoStack.push({ expression: state.expression, result: state.result });
        if (val === 'clear') { state.expression = ''; state.result = '0'; updateDisplay(); return; }
        if (val === 'ce') { state.result = '0'; updateDisplay(); return; }
        if (val === 'del') { state.expression = state.expression.slice(0, -1); updateDisplay(); return; }
        if (val === '=') { evaluate(); return; }
        if (val === 'negate') {
            if (state.result !== '0' && state.result !== 'Error') {
                state.result = String(-parseFloat(state.result));
                if (state.expression) state.expression = '(-' + state.expression + ')';
            }
            updateDisplay(); return;
        }
        if (val === '%') { state.result = fmt(parseFloat(state.result) / 100); state.expression += '/100'; updateDisplay(); return; }
        if (val === '1/x') { state.expression = '1/(' + state.expression + ')'; evaluate(); return; }
        if (val === 'x^2') { state.expression = '(' + state.expression + ')^2'; evaluate(); return; }
        if (val === 'x^3') { state.expression = '(' + state.expression + ')^3'; evaluate(); return; }
        if (val === 'sqrt') { state.expression = 'sqrt(' + state.expression + ')'; evaluate(); return; }
        if (val === 'cbrt') { state.expression = 'cbrt(' + state.expression + ')'; evaluate(); return; }
        if (val === 'n!') { let n = parseInt(state.result); state.result = fmt(factorial(n)); state.expression = n + '!'; updateDisplay(); return; }
        if (val === 'pi') { state.expression += 'π'; updateDisplay(); return; }
        if (val === 'e' && state.currentMode === 'scientific') { state.expression += 'e'; updateDisplay(); return; }
        if (val === 'x^y') { state.expression += '^'; updateDisplay(); return; }
        if (val === '10^x') { state.expression = '10^(' + state.expression + ')'; evaluate(); return; }
        if (val === 'e^x') { state.expression = 'exp(' + state.expression + ')'; evaluate(); return; }
        if (val === 'log') { state.expression = 'log(' + state.expression + ')'; evaluate(); return; }
        if (val === 'log2') { state.expression = 'log₂(' + state.expression + ')'; evaluate(); return; }
        if (val === 'ln') { state.expression = 'ln(' + state.expression + ')'; evaluate(); return; }
        if (val === 'exp') { state.expression += 'exp('; updateDisplay(); return; }
        if (val === 'mod') { state.expression += ' mod '; updateDisplay(); return; }
        if (val === '|x|') { state.expression = 'abs(' + state.expression + ')'; evaluate(); return; }
        if (val === 'rand') { let r = Math.random(); state.result = fmt(r); state.expression = String(r); updateDisplay(); return; }
        if (val === 'floor') { state.expression = 'floor(' + state.expression + ')'; evaluate(); return; }
        if (val === 'ceil') { state.expression = 'ceil(' + state.expression + ')'; evaluate(); return; }
        if (val === 'round') { state.expression = 'round(' + state.expression + ')'; evaluate(); return; }
        if (val === 'sign') { state.expression = 'sign(' + state.expression + ')'; evaluate(); return; }
        if (val === 'gamma') { let n = parseFloat(state.result); state.result = fmt(gamma(n)); state.expression = 'Γ(' + n + ')'; updateDisplay(); return; }
        if (val === 'sec') { state.expression = 'sec(' + state.expression + ')'; evaluate(); return; }
        if (val === 'csc') { state.expression = 'csc(' + state.expression + ')'; evaluate(); return; }
        if (val === 'cot') { state.expression = 'cot(' + state.expression + ')'; evaluate(); return; }
        if (val === 'eex') { state.expression += 'e'; updateDisplay(); return; }
        if (val === 'dms') {
            let d = parseFloat(state.result);
            let deg = Math.floor(d), minF = (d - deg) * 60, min = Math.floor(minF), sec = (minF - min) * 60;
            state.result = deg + '°' + min + "'" + sec.toFixed(2) + '"';
            updateDisplay(); return;
        }
        if (val === 'deg-conv') {
            let parts = state.result.match(/(\d+)°(\d+)'([\d.]+)"/);
            if (parts) { state.result = fmt(parseFloat(parts[1]) + parseFloat(parts[2])/60 + parseFloat(parts[3])/3600); }
            updateDisplay(); return;
        }
        if (val === 'to-frac') {
            let d = parseFloat(state.result);
            let best = toFraction(d);
            state.result = best;
            updateDisplay(); return;
        }
        if (val === 'nPr') { state.expression += ' nPr '; updateDisplay(); return; }
        if (val === 'nCr') { state.expression += ' nCr '; updateDisplay(); return; }
        // Trig functions
        const trigFns = ['sin','cos','tan','sinh','cosh','tanh'];
        if (trigFns.includes(val)) {
            if (state.secondFn) {
                state.expression = 'a' + val + '(' + state.expression + ')';
                state.secondFn = false;
                $('#btn-2nd').classList.remove('active');
            } else {
                state.expression = val + '(' + state.expression + ')';
            }
            evaluate(); return;
        }
        if (val === '2nd') {
            state.secondFn = !state.secondFn;
            $('#btn-2nd').classList.toggle('active');
            const ind = $('#sci-indicator');
            if (ind) ind.textContent = state.secondFn ? '2ND' : '';
            return;
        }
        // Default: append
        state.expression += val;
        updateDisplay();
    }

    function toFraction(d, tol) {
        if (!tol) tol = 1e-9;
        if (Math.abs(d - Math.round(d)) < tol) return String(Math.round(d));
        let sign = d < 0 ? -1 : 1;
        d = Math.abs(d);
        let num1 = 0, den1 = 1, num2 = 1, den2 = 0;
        let b = d;
        for (let i = 0; i < 100; i++) {
            let a = Math.floor(b);
            let num = a * num2 + num1, den = a * den2 + den1;
            if (Math.abs(d - num/den) < tol) return (sign * num) + '/' + den;
            num1 = num2; den1 = den2; num2 = num; den2 = den;
            if (Math.abs(b - a) < tol) break;
            b = 1 / (b - a);
        }
        return fmt(sign * d);
    }

    function evaluate() {
        let expr = state.expression;
        // Handle nPr/nCr
        expr = expr.replace(/(\d+)\s*nPr\s*(\d+)/g, (_, a, b) => nPr(parseInt(a), parseInt(b)));
        expr = expr.replace(/(\d+)\s*nCr\s*(\d+)/g, (_, a, b) => nCr(parseInt(a), parseInt(b)));
        const result = safeEval(expr);
        if (isNaN(result)) { state.result = 'Error'; }
        else { state.result = fmt(result); }
        addHistory(state.expression, state.result);
        updateDisplay();
    }

    // ─── BUTTON EVENT BINDING ────────────────────────────────
    ['#mode-standard','#mode-scientific'].forEach(sel => {
        $$(sel + ' .btn-grid button').forEach(btn => {
            btn.addEventListener('click', () => handleInput(btn.dataset.val));
        });
    });

    // Memory
    $$('[data-mem]').forEach(btn => {
        btn.addEventListener('click', () => {
            const op = btn.dataset.mem;
            const val = parseFloat(state.result) || 0;
            if (op === 'mc') { state.memoryValue = 0; }
            if (op === 'mr') { state.expression = String(state.memoryValue); state.result = fmt(state.memoryValue); updateDisplay(); }
            if (op === 'm+') { state.memoryValue += val; }
            if (op === 'm-') { state.memoryValue -= val; }
            if (op === 'ms') { state.memoryValue = val; state.memory.push(val); renderMemory(); }
        });
    });

    // Angle
    $$('.angle-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            $$('.angle-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.angleUnit = btn.dataset.angle;
        });
    });

    // ─── HISTORY & MEMORY PANELS ─────────────────────────────
    function addHistory(expr, result) {
        if (!expr) return;
        state.history.unshift({ expr, result });
        if (state.history.length > 100) state.history.pop();
        renderHistory();
    }
    function renderHistory() {
        const ul = $('#history-list');
        ul.innerHTML = '';
        state.history.forEach(h => {
            const li = document.createElement('li');
            li.innerHTML = '<div class="hist-expr">' + h.expr + '</div><div class="hist-result">' + h.result + '</div>';
            li.addEventListener('click', () => { state.expression = h.expr; state.result = h.result; updateDisplay(); });
            ul.appendChild(li);
        });
    }
    function renderMemory() {
        const ul = $('#memory-list');
        ul.innerHTML = '';
        state.memory.forEach(m => {
            const li = document.createElement('li');
            li.textContent = fmt(m);
            li.addEventListener('click', () => { state.expression = String(m); state.result = fmt(m); updateDisplay(); });
            ul.appendChild(li);
        });
    }
    $('#clear-history').addEventListener('click', () => { state.history = []; renderHistory(); });
    $('#clear-memory').addEventListener('click', () => { state.memory = []; state.memoryValue = 0; renderMemory(); });

    // ─── KEYBOARD ────────────────────────────────────────────
    document.addEventListener('keydown', (e) => {
        if (['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) return;
        if (e.ctrlKey && e.key === 'z') { e.preventDefault(); undo(); return; }
        if (e.key === '?') { toggleShortcuts(); return; }
        const keyMap = {
            '0':'0','1':'1','2':'2','3':'3','4':'4','5':'5','6':'6','7':'7','8':'8','9':'9',
            '.':'.', '+':'+', '-':'-', '*':'*', '/':'/',
            'Enter':'=', '=':'=', 'Backspace':'del', 'Escape':'clear', 'Delete':'clear',
            '(':'(', ')':')', '%':'%', '!':'n!', 'p':'pi', '^':'x^y',
        };
        if (keyMap[e.key]) { e.preventDefault(); handleInput(keyMap[e.key]); }
        if (e.key === 's') handleInput('sin');
        if (e.key === 'c' && !e.ctrlKey) handleInput('cos');
        if (e.key === 't') handleInput('tan');
        if (e.key === 'l') handleInput('log');
        if (e.key === 'n') handleInput('ln');
        if (e.key === 'r') handleInput('sqrt');
    });

    function undo() {
        if (state.undoStack.length === 0) return;
        const prev = state.undoStack.pop();
        state.expression = prev.expression;
        state.result = prev.result;
        updateDisplay();
    }

    // Shortcuts modal
    function toggleShortcuts() { $('#shortcuts-modal').classList.toggle('open'); }
    $('#shortcuts-btn').addEventListener('click', toggleShortcuts);
    $('#close-shortcuts').addEventListener('click', toggleShortcuts);

    // ─── PROGRAMMER MODE ─────────────────────────────────────
    function updateBaseDisplay() {
        try {
            const val = parseInt(state.result) || 0;
            const bits = state.progBits;
            const mask = bits === 64 ? BigInt('0xFFFFFFFFFFFFFFFF') : (1n << BigInt(bits)) - 1n;
            const bv = BigInt(val) & mask;
            $('#hex-val').textContent = bv.toString(16).toUpperCase();
            $('#dec-val').textContent = bv.toString(10);
            $('#oct-val').textContent = bv.toString(8);
            $('#bin-val').textContent = bv.toString(2).padStart(bits, '0').replace(/(.{4})/g, '$1 ').trim();
        } catch(e) { /* ignore */ }
    }
    $$('.base-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            $$('.base-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.progBase = parseInt(btn.dataset.base);
            updateBaseDisplay();
        });
    });
    $$('.bw-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            $$('.bw-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.progBits = parseInt(btn.dataset.bits);
            updateBaseDisplay();
        });
    });
    $$('#mode-programmer .btn-grid button').forEach(btn => {
        btn.addEventListener('click', () => {
            const val = btn.dataset.val;
            if (['A','B','C','D','E','F'].includes(val) && state.progBase < 16) return;
            if (['8','9'].includes(val) && state.progBase < 10) return;
            if (['2','3','4','5','6','7'].includes(val) && state.progBase < 8) return;
            if (val === 'NOT') {
                const n = parseInt(state.result) || 0;
                state.result = String(~n);
                updateDisplay();
                return;
            }
            handleInput(val);
        });
    });

    // ─── CONVERTER MODE ──────────────────────────────────────
    const conversionData = {
        length: { units: ['m','km','cm','mm','mi','yd','ft','in','nm','μm','ly','au','nmi'], base: { m:1,km:1000,cm:0.01,mm:0.001,mi:1609.344,yd:0.9144,ft:0.3048,in:0.0254,nm:1e-9,'μm':1e-6,ly:9.461e15,au:1.496e11,nmi:1852 }},
        weight: { units: ['kg','g','mg','lb','oz','ton','tonne','st','μg','grain','carat'], base: { kg:1,g:0.001,mg:1e-6,lb:0.453592,oz:0.0283495,ton:907.185,tonne:1000,st:6.35029,'μg':1e-9,grain:0.0000648,carat:0.0002 }},
        temperature: { units: ['°C','°F','K','°R'], special: true },
        area: { units: ['m²','km²','cm²','mm²','ha','acre','ft²','in²','mi²','yd²'], base: { 'm²':1,'km²':1e6,'cm²':1e-4,'mm²':1e-6,ha:10000,acre:4046.86,'ft²':0.092903,'in²':0.00064516,'mi²':2.59e6,'yd²':0.836127 }},
        volume: { units: ['L','mL','m³','gal','qt','pt','cup','fl oz','tbsp','tsp','cm³','ft³','in³','bbl'], base: { L:1,mL:0.001,'m³':1000,gal:3.78541,qt:0.946353,pt:0.473176,cup:0.236588,'fl oz':0.0295735,tbsp:0.0147868,tsp:0.00492892,'cm³':0.001,'ft³':28.3168,'in³':0.0163871,bbl:158.987 }},
        speed: { units: ['m/s','km/h','mph','knot','ft/s','c','mach'], base: { 'm/s':1,'km/h':0.277778,mph:0.44704,knot:0.514444,'ft/s':0.3048,c:299792458,mach:343 }},
        time: { units: ['s','ms','μs','ns','min','hr','day','week','month','year'], base: { s:1,ms:0.001,'μs':1e-6,ns:1e-9,min:60,hr:3600,day:86400,week:604800,month:2629746,year:31556952 }},
        data: { units: ['B','KB','MB','GB','TB','PB','KiB','MiB','GiB','TiB','bit'], base: { B:1,KB:1000,MB:1e6,GB:1e9,TB:1e12,PB:1e15,KiB:1024,MiB:1048576,GiB:1073741824,TiB:1099511627776,bit:0.125 }},
        pressure: { units: ['Pa','kPa','MPa','bar','atm','psi','mmHg','torr','inHg'], base: { Pa:1,kPa:1000,MPa:1e6,bar:100000,atm:101325,psi:6894.76,mmHg:133.322,torr:133.322,inHg:3386.39 }},
        energy: { units: ['J','kJ','MJ','cal','kcal','Wh','kWh','eV','BTU','ft·lbf'], base: { J:1,kJ:1000,MJ:1e6,cal:4.184,kcal:4184,Wh:3600,kWh:3600000,eV:1.602e-19,BTU:1055.06,'ft·lbf':1.35582 }},
        power: { units: ['W','kW','MW','hp','BTU/h','ft·lbf/s'], base: { W:1,kW:1000,MW:1e6,hp:745.7,'BTU/h':0.293071,'ft·lbf/s':1.35582 }},
        angle: { units: ['deg','rad','grad','arcmin','arcsec','turn','mrad'], base: { deg:1,rad:57.2958,grad:0.9,arcmin:1/60,arcsec:1/3600,turn:360,mrad:0.0572958 }},
        fuel: { units: ['km/L','mpg(US)','mpg(UK)','L/100km'], special: true },
        frequency: { units: ['Hz','kHz','MHz','GHz','THz','rpm'], base: { Hz:1,kHz:1000,MHz:1e6,GHz:1e9,THz:1e12,rpm:1/60 }},
        force: { units: ['N','kN','lbf','dyn','kgf','pdl'], base: { N:1,kN:1000,lbf:4.44822,dyn:1e-5,kgf:9.80665,pdl:0.138255 }},
        torque: { units: ['N·m','kN·m','lbf·ft','lbf·in','kgf·m'], base: { 'N·m':1,'kN·m':1000,'lbf·ft':1.35582,'lbf·in':0.112985,'kgf·m':9.80665 }},
        density: { units: ['kg/m³','g/cm³','g/mL','kg/L','lb/ft³','lb/in³','lb/gal'], base: { 'kg/m³':1,'g/cm³':1000,'g/mL':1000,'kg/L':1000,'lb/ft³':16.0185,'lb/in³':27679.9,'lb/gal':119.826 }},
        flow: { units: ['m³/s','L/s','L/min','gal/min','ft³/s','ft³/min'], base: { 'm³/s':1,'L/s':0.001,'L/min':1/60000,'gal/min':6.309e-5,'ft³/s':0.0283168,'ft³/min':0.000471947 }},
    };

    function setupConverter() {
        const catSel = $('#converter-category');
        const fromU = $('#converter-from-unit');
        const toU = $('#converter-to-unit');
        function populateUnits() {
            const cat = conversionData[catSel.value];
            fromU.innerHTML = ''; toU.innerHTML = '';
            cat.units.forEach((u, i) => {
                fromU.add(new Option(u, u));
                toU.add(new Option(u, u));
            });
            if (cat.units.length > 1) toU.value = cat.units[1];
            convert();
        }
        function convert() {
            const cat = catSel.value;
            const from = fromU.value, to = toU.value;
            const val = parseFloat($('#converter-from-val').value) || 0;
            let result;
            if (cat === 'temperature') {
                result = convertTemp(val, from, to);
            } else if (cat === 'fuel') {
                result = convertFuel(val, from, to);
            } else {
                const d = conversionData[cat].base;
                result = val * d[from] / d[to];
            }
            $('#converter-to-val').value = result !== undefined ? parseFloat(result.toPrecision(10)) : 'Error';
        }
        function convertTemp(v, f, t) {
            let c;
            if (f === '°C') c = v; else if (f === '°F') c = (v-32)*5/9; else if (f === 'K') c = v-273.15; else c = (v-491.67)*5/9;
            if (t === '°C') return c; if (t === '°F') return c*9/5+32; if (t === 'K') return c+273.15; return c*9/5+491.67;
        }
        function convertFuel(v, f, t) {
            let kpl;
            if (f === 'km/L') kpl = v; else if (f === 'mpg(US)') kpl = v * 0.425144; else if (f === 'mpg(UK)') kpl = v * 0.354006; else kpl = v === 0 ? 0 : 100/v;
            if (t === 'km/L') return kpl; if (t === 'mpg(US)') return kpl / 0.425144; if (t === 'mpg(UK)') return kpl / 0.354006; return kpl === 0 ? 0 : 100/kpl;
        }
        catSel.addEventListener('change', populateUnits);
        $('#converter-from-val').addEventListener('input', convert);
        fromU.addEventListener('change', convert);
        toU.addEventListener('change', convert);
        $('#converter-swap-btn').addEventListener('click', () => {
            const tmp = fromU.value; fromU.value = toU.value; toU.value = tmp; convert();
        });
        populateUnits();
    }
    setupConverter();

    // ─── GRAPHING MODE ───────────────────────────────────────
    const canvas = $('#graph-canvas');
    const ctx = canvas ? canvas.getContext('2d') : null;
    let graphView = { xmin: -10, xmax: 10, ymin: -10, ymax: 10 };

    function parseGraphFn(expr) {
        return function(x) {
            let e = expr;
            e = e.replace(/\bx\b/g, '(' + x + ')');
            e = e.replace(/\bθ\b/g, '(' + x + ')');
            e = e.replace(/\bt\b/g, '(' + x + ')');
            return safeEval(e);
        };
    }

    function drawGraph() {
        if (!canvas || !ctx) return;
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);
        const W = rect.width, H = rect.height;
        const { xmin, xmax, ymin, ymax } = graphView;
        const showGrid = $('#graph-grid-toggle') && $('#graph-grid-toggle').checked;
        const showDeriv = $('#graph-deriv-mode') && $('#graph-deriv-mode').checked;

        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg-display').trim() || '#0a0a1a';
        ctx.fillRect(0, 0, W, H);

        function toCanvasX(x) { return (x - xmin) / (xmax - xmin) * W; }
        function toCanvasY(y) { return H - (y - ymin) / (ymax - ymin) * H; }
        function fromCanvasX(cx) { return xmin + cx / W * (xmax - xmin); }
        function fromCanvasY(cy) { return ymax - cy / H * (ymax - ymin); }

        // Grid
        if (showGrid) {
            ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--graph-grid').trim() || '#2a2a4a';
            ctx.lineWidth = 0.5;
            const xStep = niceStep((xmax - xmin) / 10);
            const yStep = niceStep((ymax - ymin) / 10);
            for (let x = Math.ceil(xmin / xStep) * xStep; x <= xmax; x += xStep) {
                ctx.beginPath(); ctx.moveTo(toCanvasX(x), 0); ctx.lineTo(toCanvasX(x), H); ctx.stroke();
                ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim() || '#a0a0b0';
                ctx.font = '10px sans-serif';
                ctx.fillText(parseFloat(x.toPrecision(6)), toCanvasX(x) + 2, toCanvasY(0) + 12);
            }
            for (let y = Math.ceil(ymin / yStep) * yStep; y <= ymax; y += yStep) {
                ctx.beginPath(); ctx.moveTo(0, toCanvasY(y)); ctx.lineTo(W, toCanvasY(y)); ctx.stroke();
                ctx.fillText(parseFloat(y.toPrecision(6)), toCanvasX(0) + 4, toCanvasY(y) - 3);
            }
        }

        // Axes
        ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--graph-axis').trim() || '#e0e0e0';
        ctx.lineWidth = 1;
        if (xmin <= 0 && xmax >= 0) { ctx.beginPath(); ctx.moveTo(toCanvasX(0), 0); ctx.lineTo(toCanvasX(0), H); ctx.stroke(); }
        if (ymin <= 0 && ymax >= 0) { ctx.beginPath(); ctx.moveTo(0, toCanvasY(0)); ctx.lineTo(W, toCanvasY(0)); ctx.stroke(); }

        // Draw functions
        const graphType = $('#graph-type') ? $('#graph-type').value : 'cartesian';
        state.graphFunctions.forEach((gf, idx) => {
            ctx.strokeStyle = gf.color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            let started = false;
            const fn = gf.fn;

            if (graphType === 'polar') {
                const steps = 1000;
                for (let i = 0; i <= steps; i++) {
                    const theta = i / steps * 4 * Math.PI;
                    const r = fn(theta);
                    if (isNaN(r) || !isFinite(r)) { started = false; continue; }
                    const px = toCanvasX(r * Math.cos(theta));
                    const py = toCanvasY(r * Math.sin(theta));
                    if (!started) { ctx.moveTo(px, py); started = true; }
                    else ctx.lineTo(px, py);
                }
            } else if (graphType === 'parametric' && gf.xtFn && gf.ytFn) {
                const tmin = parseFloat($('#graph-tmin').value) || 0;
                const tmax = parseFloat($('#graph-tmax').value) || 6.28;
                const steps = 1000;
                for (let i = 0; i <= steps; i++) {
                    const t = tmin + (tmax - tmin) * i / steps;
                    const px = toCanvasX(gf.xtFn(t));
                    const py = toCanvasY(gf.ytFn(t));
                    if (isNaN(px) || isNaN(py) || !isFinite(px) || !isFinite(py)) { started = false; continue; }
                    if (!started) { ctx.moveTo(px, py); started = true; }
                    else ctx.lineTo(px, py);
                }
            } else {
                const steps = W * 2;
                for (let i = 0; i <= steps; i++) {
                    const x = xmin + (xmax - xmin) * i / steps;
                    const y = fn(x);
                    if (isNaN(y) || !isFinite(y) || y > 1e8 || y < -1e8) { started = false; continue; }
                    const px = toCanvasX(x), py = toCanvasY(y);
                    if (!started) { ctx.moveTo(px, py); started = true; }
                    else ctx.lineTo(px, py);
                }
            }
            ctx.stroke();

            // Derivative overlay
            if (showDeriv && graphType === 'cartesian') {
                ctx.strokeStyle = gf.color;
                ctx.lineWidth = 1;
                ctx.setLineDash([4, 4]);
                ctx.beginPath();
                started = false;
                const steps = W;
                const dx = (xmax - xmin) / steps;
                for (let i = 0; i <= steps; i++) {
                    const x = xmin + dx * i;
                    const dy = (fn(x + 0.0001) - fn(x - 0.0001)) / 0.0002;
                    if (isNaN(dy) || !isFinite(dy) || Math.abs(dy) > 1e6) { started = false; continue; }
                    const px = toCanvasX(x), py = toCanvasY(dy);
                    if (!started) { ctx.moveTo(px, py); started = true; }
                    else ctx.lineTo(px, py);
                }
                ctx.stroke();
                ctx.setLineDash([]);
            }
        });

        // Mouse tracking
        canvas.onmousemove = function(e) {
            const rect2 = canvas.getBoundingClientRect();
            const mx = e.clientX - rect2.left, my = e.clientY - rect2.top;
            const gx = fromCanvasX(mx), gy = fromCanvasY(my);
            let info = `x: ${gx.toFixed(4)}, y: ${gy.toFixed(4)}`;
            if ($('#graph-trace-mode') && $('#graph-trace-mode').checked && state.graphFunctions.length > 0) {
                const fn = state.graphFunctions[0].fn;
                const fy = fn(gx);
                info = `x: ${gx.toFixed(4)}, f(x): ${isNaN(fy) ? 'undef' : fy.toFixed(4)}`;
            }
            $('#graph-info').textContent = info;
        };
    }

    function niceStep(rough) {
        const pow = Math.pow(10, Math.floor(Math.log10(rough)));
        const norm = rough / pow;
        if (norm <= 1.5) return pow;
        if (norm <= 3.5) return 2 * pow;
        if (norm <= 7.5) return 5 * pow;
        return 10 * pow;
    }

    // Graph controls
    if ($('#graph-plot-btn')) {
        $('#graph-plot-btn').addEventListener('click', () => {
            const graphType = $('#graph-type').value;
            const color = state.graphColors[state.graphFunctions.length % state.graphColors.length];
            if (graphType === 'parametric') {
                const xtExpr = $('#graph-xt-input').value;
                const ytExpr = $('#graph-yt-input').value;
                state.graphFunctions.push({ expr: `x=${xtExpr}, y=${ytExpr}`, fn: null, xtFn: parseGraphFn(xtExpr), ytFn: parseGraphFn(ytExpr), color });
            } else {
                const expr = $('#graph-fn-input').value;
                state.graphFunctions.push({ expr, fn: parseGraphFn(expr), color });
            }
            renderFnList();
            drawGraph();
        });
    }
    if ($('#graph-clear-btn')) {
        $('#graph-clear-btn').addEventListener('click', () => { state.graphFunctions = []; renderFnList(); drawGraph(); });
    }
    if ($('#graph-type')) {
        $('#graph-type').addEventListener('change', () => {
            const v = $('#graph-type').value;
            const paramDiv = $('#graph-param-inputs');
            const fnInput = $('#graph-fn-input');
            if (v === 'parametric') { paramDiv.style.display = 'flex'; fnInput.style.display = 'none'; }
            else { paramDiv.style.display = 'none'; fnInput.style.display = ''; }
            if (v === 'polar') fnInput.placeholder = 'e.g. 2*cos(3*θ)';
            else fnInput.placeholder = 'e.g. sin(x), x^2+2*x-1';
        });
    }

    function renderFnList() {
        const el = $('#graph-fn-list');
        if (!el) return;
        el.innerHTML = '';
        state.graphFunctions.forEach((gf, i) => {
            const tag = document.createElement('span');
            tag.className = 'fn-tag';
            tag.style.background = gf.color;
            tag.innerHTML = gf.expr + ' <button data-idx="' + i + '">✕</button>';
            tag.querySelector('button').addEventListener('click', () => {
                state.graphFunctions.splice(i, 1); renderFnList(); drawGraph();
            });
            el.appendChild(tag);
        });
    }

    // Graph settings
    ['graph-xmin','graph-xmax','graph-ymin','graph-ymax'].forEach(id => {
        const el = $('#' + id);
        if (el) el.addEventListener('change', () => {
            graphView.xmin = parseFloat($('#graph-xmin').value);
            graphView.xmax = parseFloat($('#graph-xmax').value);
            graphView.ymin = parseFloat($('#graph-ymin').value);
            graphView.ymax = parseFloat($('#graph-ymax').value);
            drawGraph();
        });
    });
    if ($('#graph-zoom-in')) $('#graph-zoom-in').addEventListener('click', () => zoomGraph(0.5));
    if ($('#graph-zoom-out')) $('#graph-zoom-out').addEventListener('click', () => zoomGraph(2));
    if ($('#graph-reset-view')) $('#graph-reset-view').addEventListener('click', () => {
        graphView = { xmin: -10, xmax: 10, ymin: -10, ymax: 10 };
        $('#graph-xmin').value = -10; $('#graph-xmax').value = 10;
        $('#graph-ymin').value = -10; $('#graph-ymax').value = 10;
        drawGraph();
    });
    if ($('#graph-grid-toggle')) $('#graph-grid-toggle').addEventListener('change', drawGraph);
    if ($('#graph-deriv-mode')) $('#graph-deriv-mode').addEventListener('change', drawGraph);
    if ($('#graph-trace-mode')) $('#graph-trace-mode').addEventListener('change', drawGraph);

    function zoomGraph(factor) {
        const cx = (graphView.xmin + graphView.xmax) / 2;
        const cy = (graphView.ymin + graphView.ymax) / 2;
        const hw = (graphView.xmax - graphView.xmin) / 2 * factor;
        const hh = (graphView.ymax - graphView.ymin) / 2 * factor;
        graphView = { xmin: cx - hw, xmax: cx + hw, ymin: cy - hh, ymax: cy + hh };
        $('#graph-xmin').value = graphView.xmin.toFixed(2);
        $('#graph-xmax').value = graphView.xmax.toFixed(2);
        $('#graph-ymin').value = graphView.ymin.toFixed(2);
        $('#graph-ymax').value = graphView.ymax.toFixed(2);
        drawGraph();
    }

    // Mouse wheel zoom
    if (canvas) canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        zoomGraph(e.deltaY > 0 ? 1.2 : 0.8);
    });

    // Table of values
    if ($('#graph-table-btn')) {
        $('#graph-table-btn').addEventListener('click', () => {
            const container = $('#graph-table-container');
            container.style.display = container.style.display === 'none' ? '' : 'none';
            if (container.style.display !== 'none') updateTable();
        });
    }
    if ($('#graph-table-close')) $('#graph-table-close').addEventListener('click', () => { $('#graph-table-container').style.display = 'none'; });
    if ($('#graph-table-step')) $('#graph-table-step').addEventListener('change', updateTable);

    function updateTable() {
        if (state.graphFunctions.length === 0) return;
        const fn = state.graphFunctions[0].fn;
        const step = parseFloat($('#graph-table-step').value) || 1;
        const tbody = $('#graph-table tbody');
        tbody.innerHTML = '';
        for (let x = graphView.xmin; x <= graphView.xmax; x += step) {
            const y = fn(x);
            const tr = document.createElement('tr');
            tr.innerHTML = '<td>' + x.toFixed(4) + '</td><td>' + (isNaN(y) ? 'undef' : y.toFixed(6)) + '</td>';
            tbody.appendChild(tr);
        }
    }

    // Find zeros
    if ($('#graph-zeros-btn')) {
        $('#graph-zeros-btn').addEventListener('click', () => {
            if (state.graphFunctions.length === 0) { $('#graph-info').textContent = 'No function plotted'; return; }
            const fn = state.graphFunctions[0].fn;
            const zeros = findZeros(fn, graphView.xmin, graphView.xmax);
            $('#graph-info').textContent = zeros.length ? 'Zeros: ' + zeros.map(z => z.toFixed(6)).join(', ') : 'No zeros found in range';
        });
    }

    function findZeros(fn, a, b) {
        const zeros = [];
        const steps = 1000;
        const dx = (b - a) / steps;
        for (let i = 0; i < steps; i++) {
            const x1 = a + i * dx, x2 = x1 + dx;
            const y1 = fn(x1), y2 = fn(x2);
            if (isNaN(y1) || isNaN(y2)) continue;
            if (y1 * y2 <= 0) {
                let lo = x1, hi = x2;
                for (let j = 0; j < 50; j++) {
                    const mid = (lo + hi) / 2;
                    if (fn(mid) * fn(lo) <= 0) hi = mid; else lo = mid;
                }
                const z = (lo + hi) / 2;
                if (zeros.length === 0 || Math.abs(z - zeros[zeros.length-1]) > dx * 2) zeros.push(z);
            }
        }
        return zeros;
    }

    // Find intersections
    if ($('#graph-intersect-btn')) {
        $('#graph-intersect-btn').addEventListener('click', () => {
            if (state.graphFunctions.length < 2) { $('#graph-info').textContent = 'Need at least 2 functions'; return; }
            const f1 = state.graphFunctions[0].fn, f2 = state.graphFunctions[1].fn;
            const diff = x => f1(x) - f2(x);
            const pts = findZeros(diff, graphView.xmin, graphView.xmax);
            if (pts.length) {
                $('#graph-info').textContent = 'Intersections: ' + pts.map(x => `(${x.toFixed(4)}, ${f1(x).toFixed(4)})`).join(', ');
            } else {
                $('#graph-info').textContent = 'No intersections found in range';
            }
        });
    }

    // ─── MATRIX MODE ─────────────────────────────────────────
    function initMatrixGrids() {
        const ar = parseInt($('#mat-a-rows').value)||3, ac = parseInt($('#mat-a-cols').value)||3;
        const br = parseInt($('#mat-b-rows').value)||3, bc = parseInt($('#mat-b-cols').value)||3;
        buildMatrixGrid('matrix-a-grid', ar, ac, 'a');
        buildMatrixGrid('matrix-b-grid', br, bc, 'b');
    }
    function buildMatrixGrid(id, rows, cols, prefix) {
        const el = $('#' + id);
        el.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
        el.innerHTML = '';
        for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
            const inp = document.createElement('input');
            inp.type = 'number';
            inp.value = i === j ? 1 : 0;
            inp.id = `mat-${prefix}-${i}-${j}`;
            el.appendChild(inp);
        }
    }
    function readMatrix(prefix) {
        const rows = parseInt($(`#mat-${prefix}-rows`).value);
        const cols = parseInt($(`#mat-${prefix}-cols`).value);
        const m = [];
        for (let i = 0; i < rows; i++) {
            const row = [];
            for (let j = 0; j < cols; j++) {
                row.push(parseFloat($(`#mat-${prefix}-${i}-${j}`).value) || 0);
            }
            m.push(row);
        }
        return m;
    }
    function displayMatrix(m, id) {
        const el = $('#' + id);
        if (typeof m === 'string') { $('#matrix-result-text').textContent = m; el.innerHTML = ''; return; }
        el.style.gridTemplateColumns = `repeat(${m[0].length}, 1fr)`;
        el.innerHTML = '';
        m.forEach(row => row.forEach(v => {
            const d = document.createElement('div');
            d.className = 'mat-cell-ro';
            d.textContent = parseFloat(v.toFixed(6));
            el.appendChild(d);
        }));
        $('#matrix-result-text').textContent = '';
    }
    function matMul(a, b) {
        if (a[0].length !== b.length) return null;
        const r = [];
        for (let i = 0; i < a.length; i++) {
            r[i] = [];
            for (let j = 0; j < b[0].length; j++) {
                let s = 0;
                for (let k = 0; k < b.length; k++) s += a[i][k] * b[k][j];
                r[i][j] = s;
            }
        }
        return r;
    }
    function matAdd(a, b, sub) {
        if (a.length !== b.length || a[0].length !== b[0].length) return null;
        return a.map((row, i) => row.map((v, j) => sub ? v - b[i][j] : v + b[i][j]));
    }
    function transpose(m) { return m[0].map((_, j) => m.map(row => row[j])); }
    function determinant(m) {
        const n = m.length;
        if (n === 1) return m[0][0];
        if (n === 2) return m[0][0]*m[1][1] - m[0][1]*m[1][0];
        let det = 0;
        for (let j = 0; j < n; j++) {
            const sub = m.slice(1).map(row => [...row.slice(0,j), ...row.slice(j+1)]);
            det += (j % 2 === 0 ? 1 : -1) * m[0][j] * determinant(sub);
        }
        return det;
    }
    function inverse(m) {
        const n = m.length;
        const aug = m.map((row, i) => [...row, ...Array(n).fill(0).map((_, j) => i === j ? 1 : 0)]);
        for (let i = 0; i < n; i++) {
            let maxR = i;
            for (let k = i+1; k < n; k++) if (Math.abs(aug[k][i]) > Math.abs(aug[maxR][i])) maxR = k;
            [aug[i], aug[maxR]] = [aug[maxR], aug[i]];
            if (Math.abs(aug[i][i]) < 1e-12) return null;
            const div = aug[i][i];
            for (let j = 0; j < 2*n; j++) aug[i][j] /= div;
            for (let k = 0; k < n; k++) {
                if (k === i) continue;
                const f = aug[k][i];
                for (let j = 0; j < 2*n; j++) aug[k][j] -= f * aug[i][j];
            }
        }
        return aug.map(row => row.slice(n));
    }
    function matTrace(m) { let s = 0; for (let i = 0; i < Math.min(m.length, m[0].length); i++) s += m[i][i]; return s; }
    function matRank(m) {
        const r = m.map(row => [...row]);
        const rows = r.length, cols = r[0].length;
        let rank = 0;
        for (let col = 0; col < cols && rank < rows; col++) {
            let pivot = -1;
            for (let row = rank; row < rows; row++) if (Math.abs(r[row][col]) > 1e-10) { pivot = row; break; }
            if (pivot === -1) continue;
            [r[rank], r[pivot]] = [r[pivot], r[rank]];
            const div = r[rank][col];
            for (let j = col; j < cols; j++) r[rank][j] /= div;
            for (let row = 0; row < rows; row++) {
                if (row === rank) continue;
                const f = r[row][col];
                for (let j = col; j < cols; j++) r[row][j] -= f * r[rank][j];
            }
            rank++;
        }
        return rank;
    }
    function rref(m) {
        const r = m.map(row => [...row]);
        const rows = r.length, cols = r[0].length;
        let lead = 0;
        for (let row = 0; row < rows && lead < cols; row++) {
            let i = row;
            while (Math.abs(r[i][lead]) < 1e-10) { i++; if (i === rows) { i = row; lead++; if (lead === cols) return r; } }
            [r[i], r[row]] = [r[row], r[i]];
            const div = r[row][lead];
            for (let j = 0; j < cols; j++) r[row][j] /= div;
            for (let k = 0; k < rows; k++) {
                if (k === row) continue;
                const f = r[k][lead];
                for (let j = 0; j < cols; j++) r[k][j] -= f * r[row][j];
            }
            lead++;
        }
        return r;
    }

    if ($('#mat-generate')) $('#mat-generate').addEventListener('click', initMatrixGrids);
    $$('[data-matop]').forEach(btn => {
        btn.addEventListener('click', () => {
            const op = btn.dataset.matop;
            const A = readMatrix('a'), B = readMatrix('b');
            let result;
            if (op === 'add') result = matAdd(A, B, false);
            else if (op === 'sub') result = matAdd(A, B, true);
            else if (op === 'mul') result = matMul(A, B);
            else if (op === 'det-a') { displayMatrix('det(A) = ' + determinant(A).toFixed(6), 'matrix-result-grid'); return; }
            else if (op === 'det-b') { displayMatrix('det(B) = ' + determinant(B).toFixed(6), 'matrix-result-grid'); return; }
            else if (op === 'trans-a') result = transpose(A);
            else if (op === 'trans-b') result = transpose(B);
            else if (op === 'inv-a') { result = inverse(A); if (!result) { displayMatrix('Matrix A is singular', 'matrix-result-grid'); return; } }
            else if (op === 'inv-b') { result = inverse(B); if (!result) { displayMatrix('Matrix B is singular', 'matrix-result-grid'); return; } }
            else if (op === 'scalar-a') {
                $('#matrix-scalar-input').style.display = '';
                const k = parseFloat($('#mat-scalar-k').value) || 2;
                result = A.map(row => row.map(v => v * k));
            }
            else if (op === 'trace-a') { displayMatrix('tr(A) = ' + matTrace(A).toFixed(6), 'matrix-result-grid'); return; }
            else if (op === 'rank-a') { displayMatrix('rank(A) = ' + matRank(A), 'matrix-result-grid'); return; }
            else if (op === 'rref-a') result = rref(A);
            else if (op === 'power-a') {
                $('#matrix-scalar-input').style.display = '';
                const n = parseInt($('#mat-power-n').value) || 2;
                result = A;
                for (let i = 1; i < n; i++) result = matMul(result, A);
            }
            else if (op === 'eigen-a') {
                if (A.length === 2 && A[0].length === 2) {
                    const tr = A[0][0] + A[1][1], det = determinant(A);
                    const disc = tr*tr - 4*det;
                    if (disc >= 0) {
                        displayMatrix(`Eigenvalues: λ₁=${((tr+Math.sqrt(disc))/2).toFixed(6)}, λ₂=${((tr-Math.sqrt(disc))/2).toFixed(6)}`, 'matrix-result-grid');
                    } else {
                        displayMatrix(`Eigenvalues: λ=${(tr/2).toFixed(4)} ± ${(Math.sqrt(-disc)/2).toFixed(4)}i (complex)`, 'matrix-result-grid');
                    }
                } else { displayMatrix('Eigenvalues: only supported for 2×2 matrices', 'matrix-result-grid'); }
                return;
            }
            if (result) displayMatrix(result, 'matrix-result-grid');
            else displayMatrix('Incompatible dimensions', 'matrix-result-grid');
        });
    });
    initMatrixGrids();

    // ─── STATISTICS MODE ─────────────────────────────────────
    if ($('#stats-calc-btn')) {
        $('#stats-calc-btn').addEventListener('click', () => {
            const raw = $('#stats-data').value.split(',').map(s => parseFloat(s.trim())).filter(n => !isNaN(n));
            const freqRaw = $('#stats-freq').value.trim();
            let data = [];
            if (freqRaw) {
                const freqs = freqRaw.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
                raw.forEach((v, i) => { const f = freqs[i] || 1; for (let j = 0; j < f; j++) data.push(v); });
            } else { data = raw; }
            if (data.length === 0) return;
            data.sort((a,b) => a - b);
            const n = data.length;
            const sum = data.reduce((a,b) => a+b, 0);
            const mean = sum / n;
            const sumx2 = data.reduce((a,b) => a + b*b, 0);
            const variance = sumx2/n - mean*mean;
            const stddev = Math.sqrt(variance);
            const svariance = n > 1 ? data.reduce((a,b) => a + (b-mean)**2, 0) / (n-1) : 0;
            const sstddev = Math.sqrt(svariance);
            const median = n % 2 === 1 ? data[Math.floor(n/2)] : (data[n/2-1]+data[n/2])/2;
            const q1 = percentile(data, 25), q3 = percentile(data, 75);
            // Mode
            const counts = {};
            data.forEach(v => counts[v] = (counts[v]||0)+1);
            const maxCount = Math.max(...Object.values(counts));
            const modes = Object.keys(counts).filter(k => counts[k] === maxCount).map(Number);
            const mode = maxCount === 1 ? 'None' : modes.join(', ');
            // Geometric mean
            const allPos = data.every(v => v > 0);
            const gmean = allPos ? Math.exp(data.reduce((a,v) => a + Math.log(v), 0)/n) : NaN;
            // Harmonic mean
            const hmean = allPos ? n / data.reduce((a,v) => a + 1/v, 0) : NaN;
            // Skewness, Kurtosis
            const m3 = data.reduce((a,v) => a + Math.pow(v-mean,3), 0) / n;
            const m4 = data.reduce((a,v) => a + Math.pow(v-mean,4), 0) / n;
            const skew = stddev > 0 ? m3 / Math.pow(stddev, 3) : 0;
            const kurt = stddev > 0 ? m4 / Math.pow(stddev, 4) - 3 : 0;

            $('#stat-n').textContent = n;
            $('#stat-sum').textContent = fmt(sum);
            $('#stat-mean').textContent = fmt(mean);
            $('#stat-median').textContent = fmt(median);
            $('#stat-mode').textContent = mode;
            $('#stat-range').textContent = fmt(data[n-1] - data[0]);
            $('#stat-min').textContent = fmt(data[0]);
            $('#stat-max').textContent = fmt(data[n-1]);
            $('#stat-variance').textContent = fmt(variance);
            $('#stat-stddev').textContent = fmt(stddev);
            $('#stat-svariance').textContent = fmt(svariance);
            $('#stat-sstddev').textContent = fmt(sstddev);
            $('#stat-sumx2').textContent = fmt(sumx2);
            $('#stat-gmean').textContent = isNaN(gmean) ? 'N/A' : fmt(gmean);
            $('#stat-hmean').textContent = isNaN(hmean) ? 'N/A' : fmt(hmean);
            $('#stat-skew').textContent = fmt(skew);
            $('#stat-kurt').textContent = fmt(kurt);
            $('#stat-q1').textContent = fmt(q1);
            $('#stat-q3').textContent = fmt(q3);
            $('#stat-iqr').textContent = fmt(q3 - q1);
            $('#stat-cv').textContent = mean !== 0 ? fmt(stddev/Math.abs(mean)*100) + '%' : 'N/A';
            $('#stat-sem').textContent = fmt(sstddev / Math.sqrt(n));
        });
    }
    function percentile(sorted, p) {
        const i = (p/100) * (sorted.length - 1);
        const lo = Math.floor(i), hi = Math.ceil(i);
        return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi]-sorted[lo]) * (i-lo);
    }

    // Stats tabs
    $$('.stats-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            $$('.stats-tab').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            $$('.stats-section').forEach(s => s.classList.remove('active'));
            $(`#stats-${btn.dataset.stab}`).classList.add('active');
            if (btn.dataset.stab === 'distributions') initDistParams();
        });
    });

    // 2-Var Regression
    if ($('#stats-reg-btn')) {
        $('#stats-reg-btn').addEventListener('click', () => {
            const xd = $('#stats-xdata').value.split(',').map(s => parseFloat(s.trim())).filter(n => !isNaN(n));
            const yd = $('#stats-ydata').value.split(',').map(s => parseFloat(s.trim())).filter(n => !isNaN(n));
            const n = Math.min(xd.length, yd.length);
            if (n < 2) { $('#stats-reg-result').textContent = 'Need at least 2 data points'; return; }
            const model = $('#stats-reg-model').value;
            let result = '';
            let xv = xd.slice(0, n), yv = yd.slice(0, n);
            if (model === 'lin') {
                const { a, b, r2 } = linearRegression(xv, yv);
                result = `y = ${a.toFixed(6)} + ${b.toFixed(6)}·x\nR² = ${r2.toFixed(6)}`;
                const predX = parseFloat($('#stats-pred-x').value);
                if (!isNaN(predX)) result += `\nŷ(${predX}) = ${(a + b * predX).toFixed(6)}`;
            } else if (model === 'ln') {
                const lnx = xv.map(v => Math.log(v));
                const { a, b, r2 } = linearRegression(lnx, yv);
                result = `y = ${a.toFixed(6)} + ${b.toFixed(6)}·ln(x)\nR² = ${r2.toFixed(6)}`;
                const predX = parseFloat($('#stats-pred-x').value);
                if (!isNaN(predX)) result += `\nŷ(${predX}) = ${(a + b * Math.log(predX)).toFixed(6)}`;
            } else if (model === 'exp') {
                const lny = yv.map(v => Math.log(v));
                const { a, b, r2 } = linearRegression(xv, lny);
                result = `y = ${Math.exp(a).toFixed(6)}·e^(${b.toFixed(6)}·x)\nR² = ${r2.toFixed(6)}`;
                const predX = parseFloat($('#stats-pred-x').value);
                if (!isNaN(predX)) result += `\nŷ(${predX}) = ${(Math.exp(a) * Math.exp(b * predX)).toFixed(6)}`;
            } else if (model === 'pow') {
                const lnx = xv.map(v => Math.log(v)), lny = yv.map(v => Math.log(v));
                const { a, b, r2 } = linearRegression(lnx, lny);
                result = `y = ${Math.exp(a).toFixed(6)}·x^${b.toFixed(6)}\nR² = ${r2.toFixed(6)}`;
                const predX = parseFloat($('#stats-pred-x').value);
                if (!isNaN(predX)) result += `\nŷ(${predX}) = ${(Math.exp(a) * Math.pow(predX, b)).toFixed(6)}`;
            } else if (model === 'quad') {
                const { a, b, c, r2 } = quadraticRegression(xv, yv);
                result = `y = ${a.toFixed(6)} + ${b.toFixed(6)}·x + ${c.toFixed(6)}·x²\nR² = ${r2.toFixed(6)}`;
                const predX = parseFloat($('#stats-pred-x').value);
                if (!isNaN(predX)) result += `\nŷ(${predX}) = ${(a + b*predX + c*predX*predX).toFixed(6)}`;
            }
            $('#stats-reg-result').innerHTML = '<strong>Regression:</strong>\n' + result;
            // Correlation
            const sx = xv.reduce((a,b)=>a+b,0)/n, sy = yv.reduce((a,b)=>a+b,0)/n;
            const sxy = xv.reduce((a,x,i)=>a+(x-sx)*(yv[i]-sy),0);
            const sxx = xv.reduce((a,x)=>a+(x-sx)**2,0);
            const syy = yv.reduce((a,y)=>a+(y-sy)**2,0);
            const r = sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx*syy) : 0;
            $('#stats-corr-result').innerHTML = `<strong>Correlation:</strong> r = ${r.toFixed(6)}, r² = ${(r*r).toFixed(6)}`;
        });
    }
    function linearRegression(x, y) {
        const n = x.length;
        const sx = x.reduce((a,b)=>a+b,0), sy = y.reduce((a,b)=>a+b,0);
        const sxy = x.reduce((a,v,i)=>a+v*y[i],0);
        const sxx = x.reduce((a,v)=>a+v*v,0);
        const syy = y.reduce((a,v)=>a+v*v,0);
        const b = (n*sxy - sx*sy) / (n*sxx - sx*sx);
        const a = (sy - b*sx) / n;
        const sstot = syy - sy*sy/n;
        const ssres = y.reduce((s,v,i)=>s+(v-a-b*x[i])**2,0);
        const r2 = sstot > 0 ? 1 - ssres/sstot : 0;
        return { a, b, r2 };
    }
    function quadraticRegression(x, y) {
        const n = x.length;
        const sx = x.reduce((a,b)=>a+b,0), sx2 = x.reduce((a,v)=>a+v*v,0);
        const sx3 = x.reduce((a,v)=>a+v**3,0), sx4 = x.reduce((a,v)=>a+v**4,0);
        const sy = y.reduce((a,b)=>a+b,0), sxy = x.reduce((a,v,i)=>a+v*y[i],0);
        const sx2y = x.reduce((a,v,i)=>a+v*v*y[i],0);
        // Solve 3x3 system
        const M = [[n,sx,sx2],[sx,sx2,sx3],[sx2,sx3,sx4]];
        const V = [sy, sxy, sx2y];
        const det3 = (m) => m[0][0]*(m[1][1]*m[2][2]-m[1][2]*m[2][1]) - m[0][1]*(m[1][0]*m[2][2]-m[1][2]*m[2][0]) + m[0][2]*(m[1][0]*m[2][1]-m[1][1]*m[2][0]);
        const D = det3(M);
        const Da = det3([[V[0],M[0][1],M[0][2]],[V[1],M[1][1],M[1][2]],[V[2],M[2][1],M[2][2]]]);
        const Db = det3([[M[0][0],V[0],M[0][2]],[M[1][0],V[1],M[1][2]],[M[2][0],V[2],M[2][2]]]);
        const Dc = det3([[M[0][0],M[0][1],V[0]],[M[1][0],M[1][1],V[1]],[M[2][0],M[2][1],V[2]]]);
        const a = Da/D, b = Db/D, c = Dc/D;
        const sstot = y.reduce((s,v)=>s+(v-sy/n)**2,0);
        const ssres = y.reduce((s,v,i)=>s+(v-a-b*x[i]-c*x[i]*x[i])**2,0);
        const r2 = sstot > 0 ? 1 - ssres/sstot : 0;
        return { a, b, c, r2 };
    }

    // Distributions
    function initDistParams() {
        const type = $('#dist-type') ? $('#dist-type').value : 'normal';
        const el = $('#dist-params');
        if (!el) return;
        if (type === 'normal') {
            el.innerHTML = '<label>μ (mean): <input type="number" id="dist-mu" value="0" step="any"></label><label>σ (std dev): <input type="number" id="dist-sigma" value="1" step="any" min="0.001"></label><label>x value: <input type="number" id="dist-x" value="1.96" step="any"></label>';
        } else if (type === 't') {
            el.innerHTML = '<label>df (degrees of freedom): <input type="number" id="dist-df" value="10" min="1"></label><label>t value: <input type="number" id="dist-x" value="2" step="any"></label>';
        } else if (type === 'chi2') {
            el.innerHTML = '<label>df: <input type="number" id="dist-df" value="5" min="1"></label><label>x value: <input type="number" id="dist-x" value="11.07" step="any"></label>';
        } else if (type === 'binomial') {
            el.innerHTML = '<label>n (trials): <input type="number" id="dist-bn" value="10" min="1"></label><label>p (prob): <input type="number" id="dist-bp" value="0.5" step="0.01" min="0" max="1"></label><label>k (successes): <input type="number" id="dist-bk" value="5" min="0"></label>';
        } else if (type === 'poisson') {
            el.innerHTML = '<label>λ (mean): <input type="number" id="dist-lambda" value="3" step="any" min="0"></label><label>k (occurrences): <input type="number" id="dist-pk" value="3" min="0"></label>';
        }
    }
    if ($('#dist-type')) $('#dist-type').addEventListener('change', initDistParams);
    if ($('#dist-calc-btn')) {
        $('#dist-calc-btn').addEventListener('click', () => {
            const type = $('#dist-type').value;
            let result = '';
            if (type === 'normal') {
                const mu = parseFloat($('#dist-mu').value), sigma = parseFloat($('#dist-sigma').value);
                const x = parseFloat($('#dist-x').value);
                const z = (x - mu) / sigma;
                const cdf = normalCDF(z);
                const pdf = Math.exp(-z*z/2) / Math.sqrt(2*Math.PI) / sigma;
                result = `Z-score: ${z.toFixed(6)}\nP(X ≤ ${x}) = ${cdf.toFixed(6)}\nP(X > ${x}) = ${(1-cdf).toFixed(6)}\nPDF f(${x}) = ${pdf.toFixed(6)}`;
            } else if (type === 'binomial') {
                const n = parseInt($('#dist-bn').value), p = parseFloat($('#dist-bp').value), k = parseInt($('#dist-bk').value);
                const pmf = nCr(n,k) * Math.pow(p,k) * Math.pow(1-p,n-k);
                let cdf = 0;
                for (let i = 0; i <= k; i++) cdf += nCr(n,i) * Math.pow(p,i) * Math.pow(1-p,n-i);
                result = `P(X = ${k}) = ${pmf.toFixed(8)}\nP(X ≤ ${k}) = ${cdf.toFixed(8)}\nP(X > ${k}) = ${(1-cdf).toFixed(8)}\nE[X] = ${(n*p).toFixed(4)}\nVar(X) = ${(n*p*(1-p)).toFixed(4)}`;
            } else if (type === 'poisson') {
                const lambda = parseFloat($('#dist-lambda').value), k = parseInt($('#dist-pk').value);
                const pmf = Math.exp(-lambda) * Math.pow(lambda, k) / factorial(k);
                let cdf = 0;
                for (let i = 0; i <= k; i++) cdf += Math.exp(-lambda) * Math.pow(lambda, i) / factorial(i);
                result = `P(X = ${k}) = ${pmf.toFixed(8)}\nP(X ≤ ${k}) = ${cdf.toFixed(8)}\nP(X > ${k}) = ${(1-cdf).toFixed(8)}\nE[X] = Var(X) = ${lambda}`;
            } else if (type === 't') {
                const df = parseInt($('#dist-df').value), t = parseFloat($('#dist-x').value);
                result = `Student's t with df=${df}, t=${t}\nApprox. two-tail p ≈ ${(2*(1-normalCDF(Math.abs(t) * Math.sqrt(1 - 2/(9*df))))).toFixed(6)} (large df approx)`;
            } else if (type === 'chi2') {
                const df = parseInt($('#dist-df').value), x = parseFloat($('#dist-x').value);
                result = `Chi-Square with df=${df}, x=${x}\nMean = ${df}, Variance = ${2*df}\nApprox p-value (using normal approx for large df)`;
            }
            $('#dist-result').innerHTML = '<strong>Distribution Result:</strong>\n' + result;
        });
    }
    function normalCDF(z) {
        const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
        const sign = z < 0 ? -1 : 1;
        z = Math.abs(z) / Math.sqrt(2);
        const t = 1 / (1 + p * z);
        const y = 1 - (((((a5*t + a4)*t) + a3)*t + a2)*t + a1)*t * Math.exp(-z*z);
        return 0.5 * (1 + sign * y);
    }
    initDistParams();

    // ═══════════════════════════════════════════════════════════
    //  BA II PLUS — FINANCIAL WORKSHEETS
    // ═══════════════════════════════════════════════════════════

    function initFinancial() {
        // Tab switching
        $$('.fin-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                $$('.fin-tab').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                $$('.fin-sheet').forEach(s => s.classList.remove('active'));
                $(`#fin-${btn.dataset.fin}`).classList.add('active');
            });
        });
    }

    // ─── TVM (Time Value of Money) ───────────────────────────
    $$('.fin-cpt[data-compute]').forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.dataset.compute;
            const N = parseFloat($('#tvm-n').value);
            const IY = parseFloat($('#tvm-iy').value);
            const PV = parseFloat($('#tvm-pv').value);
            const PMT = parseFloat($('#tvm-pmt').value);
            const FV = parseFloat($('#tvm-fv').value);
            const PY = parseFloat($('#tvm-py').value) || 12;
            const CY = parseFloat($('#tvm-cy').value) || 12;
            const begin = $('#tvm-pmt-timing').value === 'begin';

            try {
                let result;
                if (target === 'n') result = computeTVM_N(IY, PV, PMT, FV, PY, CY, begin);
                else if (target === 'iy') result = computeTVM_IY(N, PV, PMT, FV, PY, CY, begin);
                else if (target === 'pv') result = computeTVM_PV(N, IY, PMT, FV, PY, CY, begin);
                else if (target === 'pmt') result = computeTVM_PMT(N, IY, PV, FV, PY, CY, begin);
                else if (target === 'fv') result = computeTVM_FV(N, IY, PV, PMT, PY, CY, begin);

                if (result !== undefined && !isNaN(result)) {
                    const ids = { n: 'tvm-n', iy: 'tvm-iy', pv: 'tvm-pv', pmt: 'tvm-pmt', fv: 'tvm-fv' };
                    $(`#${ids[target]}`).value = parseFloat(result.toFixed(6));
                    $('#tvm-result').innerHTML = `<strong>${target.toUpperCase()} = ${fmtMoney(result)}</strong>`;
                } else {
                    $('#tvm-result').textContent = 'Error: Cannot compute. Check inputs.';
                }
            } catch(e) {
                $('#tvm-result').textContent = 'Error: ' + e.message;
            }
        });
    });

    function getPeriodicRate(IY, PY, CY) {
        const nomRate = IY / 100;
        if (PY === CY) return nomRate / PY;
        const effRate = Math.pow(1 + nomRate / CY, CY) - 1;
        return Math.pow(1 + effRate, 1 / PY) - 1;
    }

    function computeTVM_N(IY, PV, PMT, FV, PY, CY, begin) {
        const i = getPeriodicRate(IY, PY, CY);
        if (Math.abs(i) < 1e-12) return -(PV + FV) / PMT;
        const adj = begin ? (1 + i) : 1;
        const num = Math.log((-FV * i + PMT * adj) / (PV * i + PMT * adj));
        return num / Math.log(1 + i);
    }

    function computeTVM_PV(N, IY, PMT, FV, PY, CY, begin) {
        const i = getPeriodicRate(IY, PY, CY);
        if (Math.abs(i) < 1e-12) return -(FV + PMT * N);
        const adj = begin ? (1 + i) : 1;
        const pvif = Math.pow(1 + i, -N);
        const pvifa = (1 - pvif) / i;
        return -(PMT * adj * pvifa + FV * pvif);
    }

    function computeTVM_PMT(N, IY, PV, FV, PY, CY, begin) {
        const i = getPeriodicRate(IY, PY, CY);
        if (Math.abs(i) < 1e-12) return -(PV + FV) / N;
        const adj = begin ? (1 + i) : 1;
        const pvif = Math.pow(1 + i, -N);
        const pvifa = (1 - pvif) / i;
        return -(PV + FV * pvif) / (pvifa * adj);
    }

    function computeTVM_FV(N, IY, PV, PMT, PY, CY, begin) {
        const i = getPeriodicRate(IY, PY, CY);
        if (Math.abs(i) < 1e-12) return -(PV + PMT * N);
        const adj = begin ? (1 + i) : 1;
        const fvif = Math.pow(1 + i, N);
        const fvifa = (fvif - 1) / i;
        return -(PV * fvif + PMT * adj * fvifa);
    }

    function computeTVM_IY(N, PV, PMT, FV, PY, CY, begin) {
        // Newton-Raphson to find rate
        let rate = 0.1 / PY;
        for (let iter = 0; iter < 1000; iter++) {
            const adj = begin ? (1 + rate) : 1;
            const pvif = Math.pow(1 + rate, -N);
            const pvifa = Math.abs(rate) > 1e-14 ? (1 - pvif) / rate : N;
            const f = PV + PMT * adj * pvifa + FV * pvif;
            // Derivative
            const dpvif = -N * Math.pow(1 + rate, -N-1);
            let dpvifa;
            if (Math.abs(rate) > 1e-14) {
                dpvifa = (-dpvif * rate - (1 - pvif)) / (rate * rate);
            } else {
                dpvifa = -N*(N-1)/2;
            }
            let df = PMT * adj * dpvifa + FV * dpvif;
            if (begin) df += PMT * pvifa;
            if (Math.abs(df) < 1e-20) break;
            const newRate = rate - f / df;
            if (Math.abs(newRate - rate) < 1e-12) { rate = newRate; break; }
            rate = newRate;
        }
        // Convert periodic rate back to I/Y
        if (PY === CY) return rate * PY * 100;
        const effAnnual = Math.pow(1 + rate, PY) - 1;
        return CY * (Math.pow(1 + effAnnual, 1/CY) - 1) * 100;
    }

    // ─── AMORTIZATION ────────────────────────────────────────
    if ($('#amort-compute')) {
        $('#amort-compute').addEventListener('click', () => {
            const N = parseFloat($('#tvm-n').value);
            const IY = parseFloat($('#tvm-iy').value);
            const PV = parseFloat($('#tvm-pv').value);
            const PY = parseFloat($('#tvm-py').value) || 12;
            const CY = parseFloat($('#tvm-cy').value) || 12;
            const begin = $('#tvm-pmt-timing').value === 'begin';
            const PMT = computeTVM_PMT(N, IY, PV, 0, PY, CY, begin);
            const p1 = parseInt($('#amort-p1').value) || 1;
            const p2 = parseInt($('#amort-p2').value) || 12;
            const i = getPeriodicRate(IY, PY, CY);

            let balance = Math.abs(PV);
            const tbody = $('#amort-table tbody');
            tbody.innerHTML = '';
            let totalInt = 0, totalPrn = 0;

            for (let p = 1; p <= Math.min(p2, N); p++) {
                const interest = balance * i;
                const pmt = Math.abs(PMT);
                const principal = pmt - interest;
                balance -= principal;
                if (balance < 0) balance = 0;
                totalInt += interest;
                totalPrn += principal;
                if (p >= p1) {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `<td>${p}</td><td>${fmtMoney(pmt)}</td><td>${fmtMoney(principal)}</td><td>${fmtMoney(interest)}</td><td>${fmtMoney(balance)}</td>`;
                    tbody.appendChild(tr);
                }
            }
            $('#amort-summary').innerHTML = `<strong>Periods ${p1}-${p2}:</strong>\nTotal Payment: ${fmtMoney(totalPrn+totalInt)}\nTotal Principal: ${fmtMoney(totalPrn)}\nTotal Interest: ${fmtMoney(totalInt)}\nEnding Balance: ${fmtMoney(balance)}`;
        });
    }

    // ─── CASH FLOW ANALYSIS ──────────────────────────────────
    if ($('#cf-add')) {
        $('#cf-add').addEventListener('click', () => {
            const entries = $('#cf-entries');
            const idx = entries.querySelectorAll('.cf-row').length;
            const row = document.createElement('div');
            row.className = 'cf-row';
            row.innerHTML = `<span class="cf-label">CF${idx}</span><input type="number" class="cf-amount" value="0" step="any"><span class="cf-freq-label">×</span><input type="number" class="cf-freq" value="1" min="1" max="9999" style="width:50px">`;
            entries.appendChild(row);
        });
    }
    if ($('#cf-remove')) {
        $('#cf-remove').addEventListener('click', () => {
            const entries = $('#cf-entries');
            if (entries.querySelectorAll('.cf-row').length > 1) entries.removeChild(entries.lastElementChild);
        });
    }
    if ($('#cf-clear')) {
        $('#cf-clear').addEventListener('click', () => {
            $('#cf-entries').innerHTML = '<div class="cf-row"><span class="cf-label">CF₀</span><input type="number" class="cf-amount" value="-1000" step="any"><span class="cf-freq-label">×</span><input type="number" class="cf-freq" value="1" min="1" max="9999" style="width:50px"></div>';
        });
    }

    function getCashFlows() {
        const rows = $$('#cf-entries .cf-row');
        const flows = [];
        rows.forEach(row => {
            const amt = parseFloat(row.querySelector('.cf-amount').value) || 0;
            const freq = parseInt(row.querySelector('.cf-freq').value) || 1;
            for (let i = 0; i < freq; i++) flows.push(amt);
        });
        return flows;
    }

    // NPV
    if ($('#cf-npv-btn')) {
        $('#cf-npv-btn').addEventListener('click', () => {
            const flows = getCashFlows();
            const rate = parseFloat($('#cf-rate').value) / 100;
            let npv = 0;
            flows.forEach((cf, t) => { npv += cf / Math.pow(1 + rate, t); });
            $('#cf-result').innerHTML = `<strong>NPV = ${fmtMoney(npv)}</strong>\nDiscount Rate: ${($('#cf-rate').value)}%\nNumber of periods: ${flows.length - 1}`;
        });
    }

    // IRR
    if ($('#cf-irr-btn')) {
        $('#cf-irr-btn').addEventListener('click', () => {
            const flows = getCashFlows();
            const irr = computeIRR(flows);
            if (irr !== null) {
                $('#cf-result').innerHTML = `<strong>IRR = ${(irr * 100).toFixed(4)}%</strong>`;
            } else {
                $('#cf-result').textContent = 'IRR: Could not converge';
            }
        });
    }

    function computeIRR(flows) {
        let rate = 0.1;
        for (let iter = 0; iter < 1000; iter++) {
            let npv = 0, dnpv = 0;
            flows.forEach((cf, t) => {
                const pv = Math.pow(1 + rate, t);
                npv += cf / pv;
                dnpv -= t * cf / (pv * (1 + rate));
            });
            if (Math.abs(dnpv) < 1e-20) return null;
            const newRate = rate - npv / dnpv;
            if (Math.abs(newRate - rate) < 1e-10) return newRate;
            rate = newRate;
            if (rate < -1) rate = -0.99;
        }
        return null;
    }

    // MIRR
    if ($('#cf-mirr-btn')) {
        $('#cf-mirr-btn').addEventListener('click', () => {
            $('#cf-mirr-extra').style.display = '';
            const flows = getCashFlows();
            const finRate = parseFloat($('#cf-finance-rate').value) / 100;
            const reinRate = parseFloat($('#cf-reinvest-rate').value) / 100;
            const n = flows.length - 1;
            let pvNeg = 0, fvPos = 0;
            flows.forEach((cf, t) => {
                if (cf < 0) pvNeg += cf / Math.pow(1 + finRate, t);
                else fvPos += cf * Math.pow(1 + reinRate, n - t);
            });
            const mirr = Math.pow(-fvPos / pvNeg, 1/n) - 1;
            $('#cf-result').innerHTML = `<strong>MIRR = ${(mirr * 100).toFixed(4)}%</strong>\nFinance Rate: ${($('#cf-finance-rate').value)}%\nReinvestment Rate: ${($('#cf-reinvest-rate').value)}%`;
        });
    }

    // Payback Period
    if ($('#cf-payback-btn')) {
        $('#cf-payback-btn').addEventListener('click', () => {
            const flows = getCashFlows();
            let cum = 0, payback = null;
            const rate = parseFloat($('#cf-rate').value) / 100;
            let cumDisc = 0, discPayback = null;
            for (let t = 0; t < flows.length; t++) {
                cum += flows[t];
                cumDisc += flows[t] / Math.pow(1 + rate, t);
                if (payback === null && cum >= 0 && t > 0) payback = t - cum / flows[t] + (cum - flows[t]) / flows[t];
                if (discPayback === null && cumDisc >= 0 && t > 0) {
                    const prevDisc = cumDisc - flows[t] / Math.pow(1 + rate, t);
                    discPayback = t - 1 + Math.abs(prevDisc) / (flows[t] / Math.pow(1 + rate, t));
                }
            }
            let result = '';
            if (payback !== null) result += `Simple Payback: ${payback.toFixed(2)} periods\n`;
            else result += 'Simple Payback: Never recovers\n';
            if (discPayback !== null) result += `Discounted Payback: ${discPayback.toFixed(2)} periods`;
            else result += 'Discounted Payback: Never recovers';
            $('#cf-result').innerHTML = `<strong>Payback Analysis</strong>\n${result}`;
        });
    }

    // Profitability Index
    if ($('#cf-pi-btn')) {
        $('#cf-pi-btn').addEventListener('click', () => {
            const flows = getCashFlows();
            const rate = parseFloat($('#cf-rate').value) / 100;
            const cf0 = Math.abs(flows[0]);
            let pvFuture = 0;
            for (let t = 1; t < flows.length; t++) pvFuture += flows[t] / Math.pow(1 + rate, t);
            const pi = pvFuture / cf0;
            $('#cf-result').innerHTML = `<strong>Profitability Index = ${pi.toFixed(4)}</strong>\nPV of future CFs: ${fmtMoney(pvFuture)}\nInitial Investment: ${fmtMoney(cf0)}`;
        });
    }

    // ─── BOND PRICING & YIELD ────────────────────────────────
    if ($('#bond-cpt-pri')) {
        $('#bond-cpt-pri').addEventListener('click', () => {
            const cpn = parseFloat($('#bond-cpn').value) / 100;
            const yld = parseFloat($('#bond-yld').value) / 100;
            const rv = parseFloat($('#bond-rv').value) || 100;
            const freq = parseInt($('#bond-freq').value) || 2;
            const sdt = new Date($('#bond-sdt').value);
            const rdt = new Date($('#bond-rdt').value);
            if (isNaN(sdt.getTime()) || isNaN(rdt.getTime())) { $('#bond-result').textContent = 'Enter valid dates'; return; }

            const yearsToMat = (rdt - sdt) / (365.25 * 86400000);
            const n = Math.ceil(yearsToMat * freq);
            const coupon = cpn * rv / freq;
            const y = yld / freq;

            let price = 0;
            for (let t = 1; t <= n; t++) price += coupon / Math.pow(1 + y, t);
            price += rv / Math.pow(1 + y, n);

            // Accrued interest (simple)
            const daysSinceLastCoupon = (365.25 / freq) * (1 - (n - yearsToMat * freq));
            const accrued = coupon * (daysSinceLastCoupon / (365.25 / freq));

            $('#bond-pri').value = price.toFixed(4);
            $('#bond-result').innerHTML = `<strong>Clean Price = ${price.toFixed(4)}</strong>\nDirty Price = ${(price + accrued).toFixed(4)}\nAccrued Interest = ${accrued.toFixed(4)}\nCoupons remaining: ${n}\nCoupon amount: ${coupon.toFixed(4)}\nYears to maturity: ${yearsToMat.toFixed(2)}`;
        });
    }

    if ($('#bond-cpt-yld')) {
        $('#bond-cpt-yld').addEventListener('click', () => {
            const cpn = parseFloat($('#bond-cpn').value) / 100;
            const price = parseFloat($('#bond-pri').value);
            const rv = parseFloat($('#bond-rv').value) || 100;
            const freq = parseInt($('#bond-freq').value) || 2;
            const sdt = new Date($('#bond-sdt').value);
            const rdt = new Date($('#bond-rdt').value);
            if (isNaN(sdt.getTime()) || isNaN(rdt.getTime()) || isNaN(price)) { $('#bond-result').textContent = 'Enter valid inputs'; return; }

            const yearsToMat = (rdt - sdt) / (365.25 * 86400000);
            const n = Math.ceil(yearsToMat * freq);
            const coupon = cpn * rv / freq;

            // Newton's method for yield
            let y = cpn / freq; // initial guess
            for (let iter = 0; iter < 500; iter++) {
                let pv = 0, dpv = 0;
                for (let t = 1; t <= n; t++) {
                    const d = Math.pow(1 + y, t);
                    pv += coupon / d;
                    dpv -= t * coupon / (d * (1 + y));
                }
                pv += rv / Math.pow(1 + y, n);
                dpv -= n * rv / (Math.pow(1 + y, n) * (1 + y));
                const f = pv - price;
                if (Math.abs(f) < 1e-10) break;
                if (Math.abs(dpv) < 1e-20) break;
                y -= f / dpv;
            }
            const annualYld = y * freq * 100;
            $('#bond-yld').value = annualYld.toFixed(4);

            // Duration
            let dur = 0, modDur = 0, pvTotal = 0;
            for (let t = 1; t <= n; t++) {
                const pv = coupon / Math.pow(1 + y, t);
                dur += (t / freq) * pv;
                pvTotal += pv;
            }
            const pvRV = rv / Math.pow(1 + y, n);
            dur += (n / freq) * pvRV;
            pvTotal += pvRV;
            dur /= pvTotal;
            modDur = dur / (1 + y);
            const convexity = computeConvexity(coupon, rv, y, n, freq, pvTotal);

            $('#bond-result').innerHTML = `<strong>Yield (YTM) = ${annualYld.toFixed(4)}%</strong>\nMacaulay Duration = ${dur.toFixed(4)} years\nModified Duration = ${modDur.toFixed(4)}\nConvexity = ${convexity.toFixed(4)}\nCurrent Yield = ${(cpn * 100 / price * 100).toFixed(4)}%`;
        });
    }

    function computeConvexity(coupon, rv, y, n, freq, pvTotal) {
        let conv = 0;
        for (let t = 1; t <= n; t++) {
            conv += t * (t + 1) * coupon / Math.pow(1 + y, t + 2);
        }
        conv += n * (n + 1) * rv / Math.pow(1 + y, n + 2);
        return conv / (pvTotal * freq * freq);
    }

    // ─── DEPRECIATION ────────────────────────────────────────
    if ($('#dep-compute')) {
        $('#dep-compute').addEventListener('click', () => {
            const cost = parseFloat($('#dep-cost').value);
            const salvage = parseFloat($('#dep-salvage').value);
            const life = parseInt($('#dep-life').value);
            const year = parseInt($('#dep-year').value);
            const startMonth = parseInt($('#dep-month').value) || 1;
            const method = $('#dep-method').value;
            const dbRate = parseFloat($('#dep-db-rate').value) || 200;

            const tbody = $('#dep-table tbody');
            tbody.innerHTML = '';
            let bookVal = cost, accumDep = 0;
            let yearDep = 0;

            if (method === 'SL') {
                const annualDep = (cost - salvage) / life;
                for (let y = 1; y <= life; y++) {
                    let dep = annualDep;
                    if (y === 1 && startMonth > 1) dep = annualDep * (13 - startMonth) / 12;
                    if (y === life && startMonth > 1) dep = annualDep * (startMonth - 1) / 12;
                    accumDep += dep;
                    bookVal -= dep;
                    if (bookVal < salvage) { dep -= (salvage - bookVal); bookVal = salvage; }
                    if (y === year) yearDep = dep;
                    addDepRow(tbody, y, dep, accumDep, Math.max(bookVal, salvage));
                }
                if (startMonth > 1) {
                    const dep = annualDep * (startMonth - 1) / 12;
                    accumDep += dep; bookVal -= dep;
                    addDepRow(tbody, life + 1, dep, accumDep, Math.max(bookVal, salvage));
                }
            } else if (method === 'SYD') {
                const sydSum = life * (life + 1) / 2;
                const depBase = cost - salvage;
                for (let y = 1; y <= life; y++) {
                    const dep = depBase * (life - y + 1) / sydSum;
                    accumDep += dep;
                    bookVal -= dep;
                    if (y === year) yearDep = dep;
                    addDepRow(tbody, y, dep, accumDep, Math.max(bookVal, salvage));
                }
            } else if (method === 'DB') {
                const rate = dbRate / 100 / life;
                for (let y = 1; y <= life; y++) {
                    let dep = bookVal * rate;
                    if (bookVal - dep < salvage) dep = bookVal - salvage;
                    if (dep < 0) dep = 0;
                    accumDep += dep;
                    bookVal -= dep;
                    if (y === year) yearDep = dep;
                    addDepRow(tbody, y, dep, accumDep, bookVal);
                }
            } else if (method === 'MACRS') {
                const macrsRates = {
                    3: [33.33,44.45,14.81,7.41],
                    5: [20,32,19.2,11.52,11.52,5.76],
                    7: [14.29,24.49,17.49,12.49,8.93,8.92,8.93,4.46],
                    10: [10,18,14.4,11.52,9.22,7.37,6.55,6.55,6.56,6.55,3.28]
                };
                const rates = macrsRates[life] || macrsRates[5];
                for (let y = 0; y < rates.length; y++) {
                    const dep = cost * rates[y] / 100;
                    accumDep += dep;
                    bookVal -= dep;
                    if (y + 1 === year) yearDep = dep;
                    addDepRow(tbody, y + 1, dep, accumDep, Math.max(bookVal, 0));
                }
            }
            $('#dep-result').innerHTML = `<strong>Year ${year} Depreciation: ${fmtMoney(yearDep)}</strong>\nMethod: ${method}\nDepreciable Base: ${fmtMoney(cost - salvage)}\nUseful Life: ${life} years`;
        });
    }
    function addDepRow(tbody, y, dep, accum, bv) {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${y}</td><td>${fmtMoney(dep)}</td><td>${fmtMoney(accum)}</td><td>${fmtMoney(bv)}</td>`;
        tbody.appendChild(tr);
    }

    // ─── INTEREST RATE CONVERSION ────────────────────────────
    if ($('#iconv-cpt-eff')) {
        $('#iconv-cpt-eff').addEventListener('click', () => {
            const nom = parseFloat($('#iconv-nom').value);
            const cy = parseInt($('#iconv-cy').value);
            const eff = (Math.pow(1 + nom/100/cy, cy) - 1) * 100;
            $('#iconv-eff').value = eff.toFixed(6);
            $('#iconv-result').innerHTML = `<strong>EFF = ${eff.toFixed(6)}%</strong>\nNOM ${nom}% compounded ${cy} times/year`;
        });
    }
    if ($('#iconv-cpt-nom')) {
        $('#iconv-cpt-nom').addEventListener('click', () => {
            const eff = parseFloat($('#iconv-eff').value);
            const cy = parseInt($('#iconv-cy').value);
            const nom = cy * (Math.pow(1 + eff/100, 1/cy) - 1) * 100;
            $('#iconv-nom').value = nom.toFixed(6);
            $('#iconv-result').innerHTML = `<strong>NOM = ${nom.toFixed(6)}%</strong>\nEFF ${eff}% with ${cy} compoundings/year`;
        });
    }
    if ($('#iconv-cpt-apy')) {
        $('#iconv-cpt-apy').addEventListener('click', () => {
            const apr = parseFloat($('#iconv-apr').value);
            const cy = parseInt($('#iconv-cy2').value);
            const apy = (Math.pow(1 + apr/100/cy, cy) - 1) * 100;
            $('#iconv-apy').value = apy.toFixed(6);
            $('#iconv-result2').innerHTML = `<strong>APY = ${apy.toFixed(6)}%</strong>`;
        });
    }
    if ($('#iconv-cpt-apr')) {
        $('#iconv-cpt-apr').addEventListener('click', () => {
            const apy = parseFloat($('#iconv-apy').value);
            const cy = parseInt($('#iconv-cy2').value);
            const apr = cy * (Math.pow(1 + apy/100, 1/cy) - 1) * 100;
            $('#iconv-apr').value = apr.toFixed(6);
            $('#iconv-result2').innerHTML = `<strong>APR = ${apr.toFixed(6)}%</strong>`;
        });
    }

    // ─── PROFIT MARGIN ───────────────────────────────────────
    if ($('#margin-cpt-margin')) {
        $('#margin-cpt-margin').addEventListener('click', () => {
            const cost = parseFloat($('#margin-cost').value);
            const sell = parseFloat($('#margin-sell').value);
            const margin = (sell - cost) / sell * 100;
            $('#margin-margin').value = margin.toFixed(4);
            $('#margin-result').innerHTML = `<strong>Margin = ${margin.toFixed(4)}%</strong>\nProfit = ${fmtMoney(sell - cost)}`;
        });
    }
    if ($('#margin-cpt-sell')) {
        $('#margin-cpt-sell').addEventListener('click', () => {
            const cost = parseFloat($('#margin-cost').value);
            const margin = parseFloat($('#margin-margin').value);
            const sell = cost / (1 - margin / 100);
            $('#margin-sell').value = sell.toFixed(4);
            $('#margin-result').innerHTML = `<strong>Selling Price = ${fmtMoney(sell)}</strong>\nProfit = ${fmtMoney(sell - cost)}`;
        });
    }
    if ($('#margin-cpt-cost')) {
        $('#margin-cpt-cost').addEventListener('click', () => {
            const sell = parseFloat($('#margin-sell').value);
            const margin = parseFloat($('#margin-margin').value);
            const cost = sell * (1 - margin / 100);
            $('#margin-cost').value = cost.toFixed(4);
            $('#margin-result').innerHTML = `<strong>Cost = ${fmtMoney(cost)}</strong>\nProfit = ${fmtMoney(sell - cost)}`;
        });
    }
    if ($('#markup-compute')) {
        $('#markup-compute').addEventListener('click', () => {
            const cost = parseFloat($('#markup-cost').value);
            const sell = parseFloat($('#markup-sell').value);
            const pct = parseFloat($('#markup-pct').value);
            let result = '';
            if (!isNaN(cost) && !isNaN(pct) && isNaN(sell)) {
                const s = cost * (1 + pct/100);
                $('#markup-sell').value = s.toFixed(2);
                result = `Selling Price = ${fmtMoney(s)}`;
            } else if (!isNaN(cost) && !isNaN(sell)) {
                const m = (sell - cost) / cost * 100;
                $('#markup-pct').value = m.toFixed(4);
                result = `Markup = ${m.toFixed(4)}%`;
            } else if (!isNaN(sell) && !isNaN(pct)) {
                const c = sell / (1 + pct/100);
                $('#markup-cost').value = c.toFixed(2);
                result = `Cost = ${fmtMoney(c)}`;
            }
            $('#markup-result').innerHTML = '<strong>' + result + '</strong>';
        });
    }

    // ─── BREAKEVEN ───────────────────────────────────────────
    if ($('#be-compute')) {
        $('#be-compute').addEventListener('click', () => {
            const fc = parseFloat($('#be-fc').value);
            const vc = parseFloat($('#be-vc').value);
            const price = parseFloat($('#be-price').value);
            const profit = parseFloat($('#be-profit').value) || 0;

            if (price <= vc) { $('#be-result').textContent = 'Error: Price must be greater than Variable Cost'; return; }
            const contribution = price - vc;
            const beUnits = (fc + profit) / contribution;
            const beRevenue = beUnits * price;
            const cmRatio = contribution / price * 100;

            $('#be-result').innerHTML =
                `<strong>Breakeven Point: ${beUnits.toFixed(2)} units</strong>\n` +
                `Breakeven Revenue: ${fmtMoney(beRevenue)}\n` +
                `Contribution Margin: ${fmtMoney(contribution)} per unit\n` +
                `CM Ratio: ${cmRatio.toFixed(2)}%\n` +
                (profit > 0 ? `Units for target profit of ${fmtMoney(profit)}: ${beUnits.toFixed(2)}` : '') +
                `\n\nDegree of Operating Leverage at BE: ∞\n` +
                `Margin of Safety: 0% at breakeven`;
        });
    }

    // ─── PERCENT CHANGE & COMPOUND INTEREST ──────────────────
    if ($('#pctchg-compute')) {
        $('#pctchg-compute').addEventListener('click', () => {
            const oldVal = parseFloat($('#pctchg-old').value);
            const newVal = parseFloat($('#pctchg-new').value);
            const change = (newVal - oldVal) / Math.abs(oldVal) * 100;
            $('#pctchg-result').innerHTML = `<strong>Percent Change = ${change.toFixed(4)}%</strong>\nAbsolute Change = ${fmtMoney(newVal - oldVal)}`;
        });
    }
    if ($('#ci-compute')) {
        $('#ci-compute').addEventListener('click', () => {
            const P = parseFloat($('#ci-principal').value);
            const r = parseFloat($('#ci-rate').value) / 100;
            const t = parseFloat($('#ci-time').value);
            const n = parseInt($('#ci-n').value);
            const continuous = $('#ci-continuous').value === 'yes';

            let A;
            if (continuous) A = P * Math.exp(r * t);
            else A = P * Math.pow(1 + r/n, n * t);
            const interest = A - P;

            $('#ci-result').innerHTML = `<strong>Future Value = ${fmtMoney(A)}</strong>\nTotal Interest Earned = ${fmtMoney(interest)}\nCompounding: ${continuous ? 'Continuous' : n + ' times/year'}\nEffective Annual Rate = ${((continuous ? Math.exp(r)-1 : Math.pow(1+r/n,n)-1)*100).toFixed(4)}%`;
        });
    }
    if ($('#r72-compute')) {
        $('#r72-compute').addEventListener('click', () => {
            const rate = parseFloat($('#r72-rate').value);
            const years = 72 / rate;
            const exact = Math.log(2) / Math.log(1 + rate/100);
            $('#r72-result').innerHTML = `<strong>Rule of 72: ≈ ${years.toFixed(2)} years to double</strong>\nExact: ${exact.toFixed(4)} years`;
        });
    }

    // ═══════════════════════════════════════════════════════════
    //  EQUATION SOLVER
    // ═══════════════════════════════════════════════════════════
    function initEquations() {
        // Tab switching
        $$('.eq-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                $$('.eq-tab').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                $$('.eq-section').forEach(s => s.classList.remove('active'));
                $(`#eq-${btn.dataset.eqt}`).classList.add('active');
            });
        });
        buildLinearSystem();
    }

    // Linear System
    function buildLinearSystem() {
        const n = parseInt($('#eq-lin-size').value) || 3;
        const el = $('#eq-lin-inputs');
        el.innerHTML = '';
        const vars = ['x','y','z','w'];
        for (let i = 0; i < n; i++) {
            const row = document.createElement('div');
            row.className = 'eq-lin-row';
            let html = '';
            for (let j = 0; j < n; j++) {
                html += `<input type="number" id="eq-lin-${i}-${j}" value="${i===j?1:0}" step="any">`;
                html += `<span>${vars[j]}${j < n-1 ? ' + ' : ' = '}</span>`;
            }
            html += `<input type="number" id="eq-lin-${i}-b" value="${i+1}" step="any">`;
            row.innerHTML = html;
            el.appendChild(row);
        }
    }
    if ($('#eq-lin-size')) $('#eq-lin-size').addEventListener('change', buildLinearSystem);

    if ($('#eq-lin-solve')) {
        $('#eq-lin-solve').addEventListener('click', () => {
            const n = parseInt($('#eq-lin-size').value);
            const augmented = [];
            for (let i = 0; i < n; i++) {
                const row = [];
                for (let j = 0; j < n; j++) row.push(parseFloat($(`#eq-lin-${i}-${j}`).value) || 0);
                row.push(parseFloat($(`#eq-lin-${i}-b`).value) || 0);
                augmented.push(row);
            }
            // Gauss elimination
            for (let col = 0; col < n; col++) {
                let maxR = col;
                for (let row = col+1; row < n; row++) if (Math.abs(augmented[row][col]) > Math.abs(augmented[maxR][col])) maxR = row;
                [augmented[col], augmented[maxR]] = [augmented[maxR], augmented[col]];
                if (Math.abs(augmented[col][col]) < 1e-12) { $('#eq-lin-result').textContent = 'No unique solution (singular system)'; return; }
                for (let row = 0; row < n; row++) {
                    if (row === col) continue;
                    const f = augmented[row][col] / augmented[col][col];
                    for (let j = col; j <= n; j++) augmented[row][j] -= f * augmented[col][j];
                }
            }
            const vars = ['x','y','z','w'];
            let result = 'Solution:\n';
            for (let i = 0; i < n; i++) {
                result += `${vars[i]} = ${(augmented[i][n] / augmented[i][i]).toFixed(6)}\n`;
            }
            $('#eq-lin-result').innerHTML = '<strong>' + result + '</strong>';
        });
    }

    // Quadratic
    if ($('#eq-quad-solve')) {
        $('#eq-quad-solve').addEventListener('click', () => {
            const a = parseFloat($('#eq-qa').value);
            const b = parseFloat($('#eq-qb').value);
            const c = parseFloat($('#eq-qc').value);
            const disc = b*b - 4*a*c;
            let result = `Discriminant = ${disc.toFixed(6)}\n`;
            if (disc >= 0) {
                const x1 = (-b + Math.sqrt(disc)) / (2*a);
                const x2 = (-b - Math.sqrt(disc)) / (2*a);
                result += `x₁ = ${x1.toFixed(6)}\nx₂ = ${x2.toFixed(6)}\n`;
                result += `Vertex: (${(-b/(2*a)).toFixed(4)}, ${(a*(-b/(2*a))**2 + b*(-b/(2*a)) + c).toFixed(4)})`;
            } else {
                const re = -b / (2*a);
                const im = Math.sqrt(-disc) / (2*a);
                result += `x₁ = ${re.toFixed(6)} + ${im.toFixed(6)}i\nx₂ = ${re.toFixed(6)} - ${im.toFixed(6)}i`;
            }
            result += `\nSum of roots = ${(-b/a).toFixed(6)}\nProduct of roots = ${(c/a).toFixed(6)}`;
            $('#eq-quad-result').innerHTML = '<strong>Roots:</strong>\n' + result;
        });
    }

    // Cubic
    if ($('#eq-cubic-solve')) {
        $('#eq-cubic-solve').addEventListener('click', () => {
            const a = parseFloat($('#eq-ca').value);
            const b = parseFloat($('#eq-cb').value);
            const c = parseFloat($('#eq-cc').value);
            const d = parseFloat($('#eq-cd').value);
            // Cardano's method - convert to depressed cubic
            const p = (3*a*c - b*b) / (3*a*a);
            const q = (2*b*b*b - 9*a*b*c + 27*a*a*d) / (27*a*a*a);
            const disc = q*q/4 + p*p*p/27;
            let result = '';
            if (disc > 0) {
                const u = Math.cbrt(-q/2 + Math.sqrt(disc));
                const v = Math.cbrt(-q/2 - Math.sqrt(disc));
                const x1 = u + v - b/(3*a);
                result = `x₁ = ${x1.toFixed(6)} (real)\nTwo complex conjugate roots`;
            } else if (Math.abs(disc) < 1e-10) {
                const u = Math.cbrt(-q/2);
                const x1 = 2*u - b/(3*a);
                const x2 = -u - b/(3*a);
                result = `x₁ = ${x1.toFixed(6)}\nx₂ = x₃ = ${x2.toFixed(6)}`;
            } else {
                const r = Math.sqrt(-p*p*p/27);
                const theta = Math.acos(-q/(2*r));
                const m = 2 * Math.cbrt(r);
                const x1 = m * Math.cos(theta/3) - b/(3*a);
                const x2 = m * Math.cos((theta + 2*Math.PI)/3) - b/(3*a);
                const x3 = m * Math.cos((theta + 4*Math.PI)/3) - b/(3*a);
                result = `x₁ = ${x1.toFixed(6)}\nx₂ = ${x2.toFixed(6)}\nx₃ = ${x3.toFixed(6)}`;
            }
            $('#eq-cubic-result').innerHTML = '<strong>Roots:</strong>\n' + result;
        });
    }

    // Polynomial root finder (companion matrix / Durand-Kerner)
    if ($('#eq-poly-solve')) {
        $('#eq-poly-solve').addEventListener('click', () => {
            const coeffs = $('#eq-poly-coeffs').value.split(',').map(s => parseFloat(s.trim())).filter(n => !isNaN(n));
            if (coeffs.length < 2) { $('#eq-poly-result').textContent = 'Need at least 2 coefficients'; return; }
            const degree = coeffs.length - 1;
            // Normalize
            const a0 = coeffs[0];
            const norm = coeffs.map(c => c / a0);
            // Durand-Kerner method
            const roots = durandKerner(norm);
            let result = `Degree: ${degree}\nRoots:\n`;
            roots.forEach((r, i) => {
                if (Math.abs(r.im) < 1e-8) result += `x${i+1} = ${r.re.toFixed(8)}\n`;
                else result += `x${i+1} = ${r.re.toFixed(8)} ${r.im >= 0 ? '+' : '-'} ${Math.abs(r.im).toFixed(8)}i\n`;
            });
            $('#eq-poly-result').innerHTML = '<strong>' + result + '</strong>';
        });
    }
    function durandKerner(coeffs) {
        const n = coeffs.length - 1;
        // Initial guesses on unit circle
        let roots = [];
        for (let i = 0; i < n; i++) {
            const angle = 2 * Math.PI * i / n + 0.4;
            roots.push({ re: 0.4 * Math.cos(angle), im: 0.9 * Math.sin(angle) });
        }
        function cmul(a, b) { return { re: a.re*b.re - a.im*b.im, im: a.re*b.im + a.im*b.re }; }
        function cdiv(a, b) { const d = b.re*b.re + b.im*b.im; return { re: (a.re*b.re+a.im*b.im)/d, im: (a.im*b.re-a.re*b.im)/d }; }
        function csub(a, b) { return { re: a.re - b.re, im: a.im - b.im }; }
        function polyEval(x) {
            let result = { re: coeffs[0], im: 0 };
            for (let i = 1; i < coeffs.length; i++) result = { re: result.re * x.re - result.im * x.im + coeffs[i], im: result.re * x.im + result.im * x.re };
            return result;
        }
        for (let iter = 0; iter < 1000; iter++) {
            let maxDelta = 0;
            for (let i = 0; i < n; i++) {
                let denom = { re: 1, im: 0 };
                for (let j = 0; j < n; j++) {
                    if (i !== j) denom = cmul(denom, csub(roots[i], roots[j]));
                }
                const delta = cdiv(polyEval(roots[i]), denom);
                roots[i] = csub(roots[i], delta);
                maxDelta = Math.max(maxDelta, Math.sqrt(delta.re*delta.re + delta.im*delta.im));
            }
            if (maxDelta < 1e-12) break;
        }
        return roots;
    }

    // Newton's Method numerical solver
    if ($('#eq-num-solve')) {
        $('#eq-num-solve').addEventListener('click', () => {
            const fnExpr = $('#eq-num-fn').value;
            const fn = parseGraphFn(fnExpr);
            let x = parseFloat($('#eq-num-x0').value);
            const tol = parseFloat($('#eq-num-tol').value) || 1e-7;
            const h = 1e-8;
            let result = 'Iterations:\n';
            for (let i = 0; i < 100; i++) {
                const fx = fn(x);
                const fpx = (fn(x + h) - fn(x - h)) / (2 * h);
                result += `  x${i} = ${x.toFixed(10)}, f(x) = ${fx.toExponential(4)}\n`;
                if (Math.abs(fx) < tol) { result += `\nConverged at x = ${x.toFixed(10)} after ${i+1} iterations`; break; }
                if (Math.abs(fpx) < 1e-20) { result += '\nDerivative too small. Try different initial guess.'; break; }
                x = x - fx / fpx;
            }
            $('#eq-num-result').innerHTML = '<strong>' + result + '</strong>';
        });
    }
    initEquations();

    // ─── DATE MODE ───────────────────────────────────────────
    if ($('#date-diff-btn')) {
        $('#date-diff-btn').addEventListener('click', () => {
            const from = new Date($('#date-from').value);
            const to = new Date($('#date-to').value);
            if (isNaN(from) || isNaN(to)) { $('#date-diff-result').textContent = 'Enter valid dates'; return; }
            const diffMs = to - from;
            const days = Math.round(diffMs / 86400000);
            const weeks = Math.floor(Math.abs(days) / 7);
            const remDays = Math.abs(days) % 7;
            // Calculate years, months, days
            let y = to.getFullYear() - from.getFullYear();
            let m = to.getMonth() - from.getMonth();
            let d = to.getDate() - from.getDate();
            if (d < 0) { m--; const prev = new Date(to.getFullYear(), to.getMonth(), 0); d += prev.getDate(); }
            if (m < 0) { y--; m += 12; }
            const hours = Math.abs(days) * 24;
            const minutes = hours * 60;
            const seconds = minutes * 60;
            // Day count methods
            const act360 = Math.abs(days) / 360;
            const act365 = Math.abs(days) / 365;
            const d30_360 = (y * 360 + m * 30 + d);
            $('#date-diff-result').innerHTML = `<strong>${Math.abs(days)} days</strong> (${weeks} weeks, ${remDays} days)\n${y} years, ${m} months, ${d} days\n${hours.toLocaleString()} hours | ${minutes.toLocaleString()} minutes | ${seconds.toLocaleString()} seconds\n\nDay Count Methods:\nACT/360: ${act360.toFixed(6)} years\nACT/365: ${act365.toFixed(6)} years\n30/360: ${d30_360} days (${(d30_360/360).toFixed(6)} years)`;
        });
    }
    if ($('#date-add-btn')) {
        $('#date-add-btn').addEventListener('click', () => {
            const start = new Date($('#date-start').value);
            if (isNaN(start)) { $('#date-add-result').textContent = 'Enter valid date'; return; }
            const amount = parseInt($('#date-amount').value) || 0;
            const unit = $('#date-unit').value;
            const sub = $('#date-add-sub').value === 'sub';
            const mult = sub ? -1 : 1;
            const result = new Date(start);
            if (unit === 'days') result.setDate(result.getDate() + amount * mult);
            else if (unit === 'weeks') result.setDate(result.getDate() + amount * 7 * mult);
            else if (unit === 'months') result.setMonth(result.getMonth() + amount * mult);
            else if (unit === 'years') result.setFullYear(result.getFullYear() + amount * mult);
            const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
            $('#date-add-result').innerHTML = `<strong>${result.toISOString().split('T')[0]}</strong> (${dayNames[result.getDay()]})`;
        });
    }
    if ($('#date-info-btn')) {
        $('#date-info-btn').addEventListener('click', () => {
            const d = new Date($('#date-info-input').value);
            if (isNaN(d)) { $('#date-info-result').textContent = 'Enter valid date'; return; }
            const start = new Date(d.getFullYear(), 0, 0);
            const diff = d - start;
            const dayOfYear = Math.floor(diff / 86400000);
            const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
            const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
            // ISO week number
            const jan4 = new Date(d.getFullYear(), 0, 4);
            const daysSinceJan4 = Math.round((d - jan4) / 86400000);
            const weekNum = Math.ceil((daysSinceJan4 + jan4.getDay() + 1) / 7);
            // Is leap year?
            const year = d.getFullYear();
            const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
            // Days remaining in year
            const endOfYear = new Date(year, 11, 31);
            const daysRemaining = Math.round((endOfYear - d) / 86400000);
            // Unix timestamp
            const unix = Math.floor(d.getTime() / 1000);

            $('#date-info-result').innerHTML =
                `<strong>${dayNames[d.getDay()]}, ${monthNames[d.getMonth()]} ${d.getDate()}, ${year}</strong>\n` +
                `Day of Year: ${dayOfYear} / ${isLeap ? 366 : 365}\n` +
                `Week Number: ${weekNum}\n` +
                `Days Remaining: ${daysRemaining}\n` +
                `Leap Year: ${isLeap ? 'Yes' : 'No'}\n` +
                `Quarter: Q${Math.ceil((d.getMonth()+1)/3)}\n` +
                `Unix Timestamp: ${unix}\n` +
                `Julian Day: ${Math.floor(d.getTime()/86400000 + 2440587.5).toFixed(1)}`;
        });
    }
    if ($('#bdays-btn')) {
        $('#bdays-btn').addEventListener('click', () => {
            const from = new Date($('#bdays-from').value);
            const to = new Date($('#bdays-to').value);
            if (isNaN(from) || isNaN(to)) { $('#bdays-result').textContent = 'Enter valid dates'; return; }
            let count = 0, current = new Date(from);
            const dir = to >= from ? 1 : -1;
            while ((dir > 0 && current <= to) || (dir < 0 && current >= to)) {
                const dow = current.getDay();
                if (dow !== 0 && dow !== 6) count++;
                current.setDate(current.getDate() + dir);
            }
            const totalDays = Math.abs(Math.round((to - from) / 86400000));
            const weekendDays = totalDays - count;
            $('#bdays-result').innerHTML = `<strong>${count} business days</strong>\nTotal calendar days: ${totalDays}\nWeekend days: ${weekendDays}`;
        });
    }

    // ─── INITIAL DRAW ────────────────────────────────────────
    updateDisplay();
    if (state.currentMode === 'graphing') drawGraph();

})();
