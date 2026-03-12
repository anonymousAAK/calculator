/* ================================================================
   Calculator — Scientific | Financial | Graphing
   Apple-style UI + full expression history tracking
   ================================================================ */

// ── Mode tabs ─────────────────────────────────────────────────────
document.querySelectorAll('.mode-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.mode-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.calc-screen').forEach(s => s.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(tab.dataset.mode + '-calc').classList.add('active');
        if (tab.dataset.mode === 'graphing') setTimeout(() => Graph.resize(), 30);
    });
});

/* ================================================================
   UTILITIES
   ================================================================ */
function fmtNum(v) {
    if (typeof v === 'string') return v;
    if (!isFinite(v) || isNaN(v)) return 'Error';
    // Show up to 12 significant digits, strip trailing zeros
    if (Math.abs(v) >= 1e13 || (Math.abs(v) < 1e-9 && v !== 0)) {
        return v.toExponential(6).replace(/\.?0+e/, 'e');
    }
    const s = parseFloat(v.toPrecision(12)).toString();
    return s;
}

function factorial(n) {
    if (n < 0 || n !== Math.floor(n)) return NaN;
    if (n > 170) return Infinity;
    let r = 1; for (let i = 2; i <= n; i++) r *= i; return r;
}

// Simple expression evaluator (for parenthesized expressions)
function evalExpr(expr) {
    try {
        // Replace symbols
        let e = expr
            .replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-')
            .replace(/π/g, '(' + Math.PI + ')')
            .replace(/\be\b/g, '(' + Math.E + ')')
            .replace(/\^/g, '**');
        // Add implicit multiplication: 2( → 2*(
        e = e.replace(/(\d)\(/g, '$1*(').replace(/\)(\d)/g, ')*$1').replace(/\)\(/g, ')*(');
        const fn = new Function('Math', 'return ' + e);
        const r = fn(Math);
        return isFinite(r) ? r : NaN;
    } catch { return NaN; }
}

/* ================================================================
   SCIENTIFIC CALCULATOR
   ================================================================ */
const Sci = (() => {
    // ── State ──────────────────────────────────────────────────────
    let current   = '0';   // number shown large
    let history   = '';    // expression shown small (e.g. "25 +")
    let prevVal   = null;  // left operand
    let pendingOp = null;  // pending operator string
    let pendingOpSym = ''; // display symbol of pending op
    let justCalc  = false; // just pressed =
    let waitingForOperand = false; // next digit should replace current
    let openParens = 0;
    let memory    = 0;
    let memHasVal = false;
    let ans       = 0;
    let angleMode = 'DEG';
    let shiftOn   = false;
    let hypOn     = false;
    let twoArgFn  = null;  // e.g. 'npr', 'ncr', 'yx', 'xrty'
    let twoArgA   = null;

    // ── DOM refs ────────────────────────────────────────────────────
    const dispEl    = document.getElementById('sci-display');
    const histEl    = document.getElementById('sci-history');
    const acBtn     = document.getElementById('sci-ac-btn');
    const shiftBtn  = document.getElementById('sci-shift-btn');
    const angleInd  = document.getElementById('sci-angle-ind');
    const shiftInd  = document.getElementById('sci-shift-ind');
    const hypInd    = document.getElementById('sci-hyp-ind');
    const memInd    = document.getElementById('sci-mem-ind');
    const degradLbl = document.getElementById('degrad-lbl');
    const sciGrid   = document.querySelector('.sci-grid');

    // ── Render ──────────────────────────────────────────────────────
    function render() {
        dispEl.textContent = current;
        dispEl.className   = 'display-current' + (current === 'Error' ? ' error' : '');
        histEl.textContent = history;
        acBtn.textContent  = (current !== '0' || history) ? 'C' : 'AC';
        shiftInd.textContent  = shiftOn ? 'SHIFT' : '';
        hypInd.textContent    = hypOn   ? 'HYP'   : '';
        memInd.textContent    = memHasVal ? 'M' : '';
        angleInd.textContent  = angleMode;
        degradLbl.textContent = angleMode;
        shiftBtn.classList.toggle('shift-on', shiftOn);
        sciGrid.classList.toggle('shift-active', shiftOn);
        // Highlight active operator button
        document.querySelectorAll('.btn-op-active').forEach(b => b.classList.remove('selected'));
        if (pendingOp && !justCalc) {
            const sel = document.querySelector(`.btn-op-active[data-k="${pendingOp}"]`);
            if (sel) sel.classList.add('selected');
        }
    }

    // ── Helpers ─────────────────────────────────────────────────────
    function toRad(x) { return angleMode === 'DEG' ? x * Math.PI / 180 : x; }
    function fromRad(x) { return angleMode === 'DEG' ? x * 180 / Math.PI : x; }
    function curNum() { return parseFloat(current) || 0; }

    function applyOp(op, a, b) {
        switch (op) {
            case 'add': return a + b;
            case 'sub': return a - b;
            case 'mul': return a * b;
            case 'div': return b !== 0 ? a / b : NaN;
            case 'mod': return a % b;
            case 'pow': return Math.pow(a, b);
        }
        return NaN;
    }
    const opSymbols = { add:'+', sub:'−', mul:'×', div:'÷', mod:'mod', pow:'^' };

    function setResult(val, histSuffix) {
        const v = fmtNum(val);
        current   = v;
        history   = histSuffix || '';
        ans       = isNaN(val) ? ans : val;
        prevVal   = null;
        pendingOp = null;
        pendingOpSym = '';
        justCalc  = true;
        waitingForOperand = false;
        twoArgFn  = null;
        twoArgA   = null;
        openParens = 0;
        render();
    }

    // ── Key handler ─────────────────────────────────────────────────
    function press(k) {
        if (current === 'Error' && k !== 'ac') return;

        // ── Digits ──
        if (/^[0-9]$/.test(k)) {
            if (justCalc || waitingForOperand) {
                current = k;
                justCalc = false;
                waitingForOperand = false;
            } else {
                current = current === '0' ? k : current + k;
            }
            history = pendingOp ? fmtNum(prevVal) + ' ' + pendingOpSym + ' ' + current : '';
            render(); return;
        }

        if (k === '.') {
            if (justCalc || waitingForOperand) {
                current = '0.'; justCalc = false; waitingForOperand = false;
            } else if (!current.includes('.')) {
                current += '.';
            }
            if (pendingOp) history = fmtNum(prevVal) + ' ' + pendingOpSym + ' ' + current;
            render(); return;
        }

        // ── Operators ──
        if (['add','sub','mul','div','mod'].includes(k)) {
            const sym = opSymbols[k];
            const cur = curNum();
            if (pendingOp && !justCalc && !waitingForOperand) {
                // chain: evaluate left side first
                const result = applyOp(pendingOp, prevVal, cur);
                prevVal = isNaN(result) ? cur : result;
            } else {
                prevVal = cur;
            }
            history = fmtNum(prevVal) + ' ' + sym;
            current = fmtNum(prevVal);
            pendingOp    = k;
            pendingOpSym = sym;
            justCalc     = false;
            waitingForOperand = true;
            render(); return;
        }

        // ── Power (yˣ shortcut row button) ──
        if (k === 'pow') {
            twoArgFn = 'pow'; twoArgA = curNum();
            history = fmtNum(twoArgA) + ' ^';
            pendingOp = 'pow'; pendingOpSym = '^'; prevVal = twoArgA;
            justCalc = false;
            render(); return;
        }

        // ── Equals ──
        if (k === 'eq') {
            if (pendingOp) {
                const b   = curNum();
                const result = applyOp(pendingOp, prevVal, b);
                const expr = fmtNum(prevVal) + ' ' + pendingOpSym + ' ' + fmtNum(b) + ' =';
                setResult(isNaN(result) ? NaN : result, expr);
            }
            return;
        }

        // ── AC / C ──
        if (k === 'ac') {
            current = '0'; history = ''; prevVal = null; pendingOp = null;
            pendingOpSym = ''; justCalc = false; waitingForOperand = false; openParens = 0;
            twoArgFn = null; twoArgA = null;
            render(); return;
        }

        // ── DEL (backspace) ──
        if (k === 'del') {
            if (justCalc) { current = '0'; history = ''; justCalc = false; }
            else if (current.length > 1) current = current.slice(0, -1);
            else current = '0';
            if (pendingOp) history = fmtNum(prevVal) + ' ' + pendingOpSym + ' ' + (current === '0' ? '' : current);
            render(); return;
        }

        // ── +/- ──
        if (k === 'neg') {
            const v = curNum();
            current = fmtNum(-v);
            if (pendingOp) history = fmtNum(prevVal) + ' ' + pendingOpSym + ' ' + current;
            render(); return;
        }

        // ── % ──
        if (k === 'pct') {
            const v = curNum() / 100;
            current = fmtNum(v);
            if (pendingOp) history = fmtNum(prevVal) + ' ' + pendingOpSym + ' ' + current;
            else history = current + '%';
            render(); return;
        }

        // ── Parentheses ──
        if (k === '(') {
            history += '('; openParens++; justCalc = false; render(); return;
        }
        if (k === ')') {
            if (openParens > 0) { history += ')'; openParens--; render(); }
            return;
        }
        if (k === 'paren') {
            // smart: open if nothing or last was op, else close
            if (openParens > 0 && current !== '0') press(')'); else press('(');
            return;
        }

        // ── SHIFT ──
        if (k === 'shift') {
            shiftOn = !shiftOn; render(); return;
        }
        if (k === 'hyp') {
            hypOn = !hypOn; render(); return;
        }
        if (k === 'degrad') {
            angleMode = angleMode === 'DEG' ? 'RAD' : 'DEG'; render(); return;
        }

        // ── Trig ──
        const trigFns = {
            sin: v => hypOn ? Math.sinh(v) : Math.sin(toRad(v)),
            cos: v => hypOn ? Math.cosh(v) : Math.cos(toRad(v)),
            tan: v => hypOn ? Math.tanh(v) : Math.tan(toRad(v)),
            asin: v => hypOn ? Math.asinh(v) : fromRad(Math.asin(v)),
            acos: v => hypOn ? Math.acosh(v) : fromRad(Math.acos(v)),
            atan: v => hypOn ? Math.atanh(v) : fromRad(Math.atan(v)),
        };
        if (trigFns[k]) {
            const v = curNum();
            const r = trigFns[k](v);
            const lbl = (k in { asin:1,acos:1,atan:1 } ? (hypOn?'a':'') : (hypOn?'h':'')) + k;
            applyFunc(r, lbl + '(' + fmtNum(v) + ')');
            hypOn = false; shiftOn = false; render(); return;
        }

        // ── Math functions ──
        const v = curNum();
        let r, lbl;
        switch (k) {
            case 'x2':    r = v*v;             lbl = '(' + fmtNum(v) + ')²';   break;
            case 'x3':    r = v*v*v;           lbl = '(' + fmtNum(v) + ')³';   break;
            case 'sqrt':  case 'sqrt2': r = Math.sqrt(v);       lbl = '√(' + fmtNum(v) + ')';   break;
            case 'cbrt':  r = Math.cbrt(v);    lbl = '∛(' + fmtNum(v) + ')';   break;
            case 'ex':    r = Math.exp(v);     lbl = 'e^' + fmtNum(v);         break;
            case '10x':   r = Math.pow(10, v); lbl = '10^' + fmtNum(v);        break;
            case 'ln':    r = Math.log(v);     lbl = 'ln(' + fmtNum(v) + ')';  break;
            case 'log':   r = Math.log10(v);   lbl = 'log(' + fmtNum(v) + ')'; break;
            case 'log2':  r = Math.log2(v);    lbl = 'log₂(' + fmtNum(v) + ')';break;
            case 'recip': r = 1/v;             lbl = '1/(' + fmtNum(v) + ')';  break;
            case 'abs':   r = Math.abs(v);     lbl = '|' + fmtNum(v) + '|';    break;
            case 'fact':  r = factorial(v);    lbl = fmtNum(v) + '!';          break;
            case 'floor': r = Math.floor(v);   lbl = '⌊' + fmtNum(v) + '⌋';   break;
            case 'pi':    r = Math.PI;         lbl = 'π';                       break;
            case 'econ':  r = Math.E;          lbl = 'e';                       break;
            case 'ran':   r = Math.random();   lbl = 'Ran#';                    break;
            case 'ans':
                current = fmtNum(ans);
                if (pendingOp) history = fmtNum(prevVal) + ' ' + pendingOpSym + ' Ans';
                else history = 'Ans';
                render(); return;
            case 'EE':
                if (!current.includes('e')) { current += 'e+'; }
                render(); return;
            case 'frac': {
                // display as fraction approximation
                const frac = toFraction(v);
                history = fmtNum(v) + ' =';
                current = frac;
                render(); return;
            }
            default: break;
        }
        if (r !== undefined) { applyFunc(r, lbl); return; }

        // ── nPr / nCr ──
        if (k === 'npr' || k === 'ncr') {
            twoArgFn = k; twoArgA = v;
            history = fmtNum(v) + (k === 'npr' ? ' P ' : ' C ');
            current = '0'; justCalc = false;
            render(); return;
        }
        // ── ˣ√y ──
        if (k === 'xrty') {
            twoArgFn = 'xrty'; twoArgA = v;
            history = fmtNum(v) + ' ˣ√';
            current = '0'; justCalc = false;
            render(); return;
        }
        // resolve two-arg by pressing = will go through eq above, but also when digits pressed after
        // We handle it: if twoArgFn is set and = is pressed, calculate
        // (already handled in eq branch, but we also need to handle when next number is typed)

        // ── Memory ──
        if (k === 'mc')     { memory = 0; memHasVal = false; render(); return; }
        if (k === 'mr')     { current = fmtNum(memory); if (pendingOp) history = fmtNum(prevVal)+' '+pendingOpSym+' '+current; else history='MR'; render(); return; }
        if (k === 'ms')     { memory += curNum(); memHasVal = true; render(); return; }
        if (k === 'mminus') { memory -= curNum(); memHasVal = (memory !== 0); render(); return; }

        shiftOn = false;
        render();
    }

    // Override press for twoArgFn equality resolution
    const origEqHandler = press;
    function press2(k) {
        if (twoArgFn && k === 'eq') {
            const b = curNum(), a = twoArgA;
            let r, lbl;
            if (twoArgFn === 'npr') {
                r = factorial(a) / factorial(a - b);
                lbl = fmtNum(a) + 'P' + fmtNum(b) + ' =';
            } else if (twoArgFn === 'ncr') {
                r = factorial(a) / (factorial(b) * factorial(a - b));
                lbl = fmtNum(a) + 'C' + fmtNum(b) + ' =';
            } else if (twoArgFn === 'xrty') {
                r = Math.pow(a, 1/b);
                lbl = fmtNum(b) + '√' + fmtNum(a) + ' =';
            }
            setResult(r, lbl);
            return;
        }
        // If twoArgFn is active and operator pressed, use twoArg as left side
        if (twoArgFn && ['add','sub','mul','div'].includes(k)) {
            const b = curNum(), a = twoArgA;
            let r;
            if (twoArgFn === 'npr') r = factorial(a) / factorial(a - b);
            else if (twoArgFn === 'ncr') r = factorial(a) / (factorial(b) * factorial(a - b));
            else if (twoArgFn === 'xrty') r = Math.pow(a, 1/b);
            twoArgFn = null; twoArgA = null;
            current = fmtNum(r); justCalc = true; prevVal = null; pendingOp = null;
            press(k); return;
        }
        origEqHandler(k);
    }

    function applyFunc(result, label) {
        if (isNaN(result)) { current = 'Error'; history = label; render(); return; }
        if (pendingOp) {
            // Apply function to current input, show in history
            history = fmtNum(prevVal) + ' ' + pendingOpSym + ' ' + label;
            current = fmtNum(result);
            justCalc = false;
        } else {
            history = label + ' =';
            current = fmtNum(result);
            ans = result;
            justCalc = true;
        }
        shiftOn = false;
        render();
    }

    function toFraction(decimal) {
        if (Number.isInteger(decimal)) return String(decimal);
        const tol = 1e-6;
        let h1=1, h2=0, k1=0, k2=1, b=decimal;
        do {
            const a = Math.floor(b);
            let t=h1; h1=a*h1+h2; h2=t;
            t=k1; k1=a*k1+k2; k2=t;
            b=1/(b-a);
        } while (Math.abs(decimal - h1/k1) > decimal*tol && b < 1e10);
        const w=Math.floor(h1/k1), n=h1-w*k1;
        if (n===0) return String(w);
        return w ? w+' '+Math.abs(n)+'/'+k1 : h1+'/'+k1;
    }

    // ── Button bindings ─────────────────────────────────────────────
    document.querySelectorAll('.sci-grid .btn[data-k]').forEach(btn => {
        btn.addEventListener('click', () => {
            let k = btn.dataset.k;
            if (shiftOn && btn.dataset.s) k = btn.dataset.s;
            press2(k);
        });
    });
    document.getElementById('sci-shift-btn').addEventListener('click', () => press2('shift'));

    // ── Keyboard support ────────────────────────────────────────────
    document.addEventListener('keydown', e => {
        if (document.querySelector('.calc-screen.active').id !== 'scientific-calc') return;
        const map = {
            '0':'0','1':'1','2':'2','3':'3','4':'4','5':'5','6':'6','7':'7','8':'8','9':'9',
            '.':'.', '+':'add', '-':'sub', '*':'mul', '/':'div', 'Enter':'eq', '=':'eq',
            'Backspace':'del', 'Escape':'ac', '(':'(', ')':')', '%':'pct'
        };
        if (map[e.key]) { e.preventDefault(); press2(map[e.key]); }
    });

    render();
    return { press: press2 };
})();


/* ================================================================
   FINANCIAL CALCULATOR  (TI BA II Plus)
   ================================================================ */
const Fin = (() => {
    const dispEl  = document.getElementById('fin-display');
    const histEl  = document.getElementById('fin-history');
    const btn2nd  = document.getElementById('fin-2nd-btn');
    const wsInd   = document.getElementById('fin-ws-ind');
    const modeInd = document.getElementById('fin-mode-ind');
    const ws2ndEl = document.getElementById('fin-2nd-ind');

    let current = '0', history = '';
    let prevVal = null, pendingOp = null, pendingOpSym = '';
    let justCalc = false, second = false;
    let mem = [0,0,0,0,0,0,0,0,0,0];

    // TVM
    const tvm = { N:0, IY:0, PV:0, PMT:0, FV:0 };
    let PY = 1, bgn = false;
    let lastTvmKey = '';

    // CF
    let cfFlows = [{cf:0, freq:1}];

    function render() {
        dispEl.textContent = current;
        dispEl.className   = 'display-current' + (current === 'Error' ? ' error' : '');
        histEl.textContent = history;
        btn2nd.classList.toggle('fn-2nd-on', second);
        ws2ndEl.style.display = second ? '' : 'none';
        modeInd.textContent = bgn ? 'BGN' : 'END';
    }

    function setDisp(val, hist, ws) {
        current = fmtNum(val); history = hist || '';
        if (ws) wsInd.textContent = ws;
        justCalc = true; render();
    }

    function curNum() { return parseFloat(current) || 0; }

    // Newton-Raphson TVM solver
    function solveTVM(unknown) {
        const n = tvm.N, iy = tvm.IY, pv = tvm.PV, pmt = tvm.PMT, fv = tvm.FV;
        const i = iy / 100 / (PY || 1);
        const typ = bgn ? 1 : 0;
        switch (unknown) {
            case 'N':
                if (i === 0) return pmt ? -(pv+fv)/pmt : NaN;
                const num = pmt*(1+i*typ) - fv*i;
                const den = pmt*(1+i*typ) + pv*i;
                if (den===0||num/den<=0) return NaN;
                return Math.log(num/den) / Math.log(1+i);
            case 'IY': {
                let r = 0.1 / (PY||1);
                for (let it=0;it<200;it++) {
                    const r1=1+r, rn=Math.pow(r1,n);
                    if (!isFinite(rn)) break;
                    const fv_=pv*rn+pmt*(1+r*typ)*(rn-1)/r+fv;
                    const dfv=n*pv*Math.pow(r1,n-1)+pmt*(1+r*typ)*(n*Math.pow(r1,n-1)*r-(rn-1))/(r*r)+pmt*typ*(rn-1)/r;
                    if (!dfv) break;
                    const nr = r - fv_/dfv;
                    if (Math.abs(nr-r)<1e-12){r=nr;break;}
                    r=nr;
                }
                return r * (PY||1) * 100;
            }
            case 'PV':
                if (i===0) return -(fv+pmt*n);
                const rn=Math.pow(1+i,n);
                return -(fv/rn + pmt*(1+i*typ)*(1-1/rn)/i);
            case 'PMT':
                if (i===0) return -(pv+fv)/n;
                const rn2=Math.pow(1+i,n);
                return -(pv*rn2+fv)*i/((1+i*typ)*(rn2-1));
            case 'FV':
                if (i===0) return -(pv+pmt*n);
                const rn3=Math.pow(1+i,n);
                return -(pv*rn3+pmt*(1+i*typ)*(rn3-1)/i);
        }
    }

    function computeNPV(rate) {
        let npv = cfFlows[0].cf, p=1;
        for (let j=1;j<cfFlows.length;j++) {
            for (let f=0;f<cfFlows[j].freq;f++) { npv+=cfFlows[j].cf/Math.pow(1+rate,p); p++; }
        }
        return npv;
    }
    function computeIRR() {
        let lo=-0.9999,hi=10;
        for (let i=0;i<300;i++){
            const m=(lo+hi)/2, n=computeNPV(m);
            if (Math.abs(n)<1e-8) return m*100;
            if(n>0)lo=m;else hi=m;
        }
        return (lo+hi)/2*100;
    }

    function press(k) {
        if (current==='Error'&&k!=='CE') return;

        // digits
        if (/^[0-9]$/.test(k)) {
            if (justCalc) { current=k; history=''; justCalc=false; if(pendingOp) history=fmtNum(prevVal)+' '+pendingOpSym; }
            else current = current==='0'?k:current+k;
            if(pendingOp) history=fmtNum(prevVal)+' '+pendingOpSym+' '+current;
            render(); return;
        }
        if (k==='.') { if(!current.includes('.'))current+='.'; render(); return; }

        if (k==='neg') { current=fmtNum(-curNum()); render(); return; }
        if (k==='CE')  { current='0'; history=''; justCalc=false; pendingOp=null; prevVal=null; render(); return; }

        // operators
        const opMap = {fadd:'add',fsub:'sub',fmul:'mul',fdiv:'div'};
        const syms  = {add:'+',sub:'−',mul:'×',div:'÷'};
        if (opMap[k]) {
            const op=opMap[k], sym=syms[op], cur=curNum();
            if (pendingOp&&!justCalc){
                const r=Sci.press; // reuse logic
                let rv;
                if(pendingOp==='add')rv=prevVal+cur;
                else if(pendingOp==='sub')rv=prevVal-cur;
                else if(pendingOp==='mul')rv=prevVal*cur;
                else if(pendingOp==='div')rv=cur?prevVal/cur:NaN;
                prevVal=isNaN(rv)?cur:rv; current=fmtNum(prevVal);
            } else { prevVal=cur; }
            pendingOp=op; pendingOpSym=sym;
            history=fmtNum(prevVal)+' '+sym;
            justCalc=false; render(); return;
        }
        if (k==='feq') {
            if (pendingOp){
                const b=curNum(); let r;
                if(pendingOp==='add')r=prevVal+b;
                else if(pendingOp==='sub')r=prevVal-b;
                else if(pendingOp==='mul')r=prevVal*b;
                else if(pendingOp==='div')r=b?prevVal/b:NaN;
                history=fmtNum(prevVal)+' '+pendingOpSym+' '+fmtNum(b)+' =';
                current=fmtNum(r); prevVal=null; pendingOp=null; justCalc=true; render();
            } return;
        }

        // 2nd toggle
        if (k==='2nd') { second=!second; render(); return; }

        // TVM keys
        if (['N','IY','PV','PMT','FV'].includes(k)) {
            if (second) { second=false; /* handle 2nd functions */ render(); return; }
            const val = parseFloat(current);
            if (!isNaN(val)) { tvm[k]=val; }
            lastTvmKey=k;
            setDisp(tvm[k], k+' =', 'TVM');
            return;
        }
        if (k==='CPT') {
            if (lastTvmKey) {
                const r = solveTVM(lastTvmKey);
                tvm[lastTvmKey] = r;
                setDisp(r, lastTvmKey+' = (CPT)', 'TVM');
            } return;
        }

        // BGN / P/Y
        if (k==='BGN') { bgn=!bgn; history='Mode: '+(bgn?'BGN':'END'); render(); return; }
        if (k==='PY')  { PY=curNum()||1; setDisp(PY,'P/Y =','P/Y'); return; }
        if (k==='CLRTVM'){ Object.keys(tvm).forEach(kk=>tvm[kk]=0); setDisp(0,'TVM Cleared','TVM'); return; }

        // NPV / IRR
        if (k==='NPV') { setDisp(computeNPV(tvm.IY/100),'NPV =','CF'); return; }
        if (k==='IRR') { setDisp(computeIRR(),'IRR% =','CF'); return; }

        // CF worksheet
        if (k==='CF') { showCFWorksheet(); wsInd.textContent='CF'; return; }
        // STAT
        if (k==='STAT') { showStatWorksheet(); wsInd.textContent='STAT'; return; }
        // QUIT
        if (k==='QUIT') {
            document.getElementById('fin-worksheet').classList.remove('visible');
            wsInd.textContent='TVM'; setDisp(0,'','TVM'); return;
        }

        // Math shortcuts
        if (k==='sqrt') { setDisp(Math.sqrt(curNum()),'√ ='); return; }
        if (k==='ln')   { setDisp(Math.log(curNum()),'ln ='); return; }
        if (k==='recip'){ setDisp(1/curNum(),'1/x ='); return; }
        if (k==='yx') {
            prevVal=curNum(); pendingOp='pow'; pendingOpSym='^';
            history=fmtNum(prevVal)+' ^'; justCalc=false; render(); return;
        }
        // STO/RCL
        if (k==='STO') { mem[0]=curNum(); history='STO → M0'; render(); return; }
        if (k==='RCL') { current=fmtNum(mem[0]); history='RCL M0'; render(); return; }

        // AMORT quick
        if (k==='AMORT') {
            const i=tvm.IY/100/(PY||1);
            const intP=tvm.PV*i, prnP=tvm.PMT-intP;
            history=`INT=${fmtNum(intP)}  PRN=${fmtNum(prnP)}`;
            current=fmtNum(intP); render(); return;
        }

        second=false; render();
    }

    // CF worksheet
    function showCFWorksheet() {
        const ws = document.getElementById('fin-worksheet');
        ws.innerHTML = '<h4>CASH FLOWS</h4>';
        cfFlows.forEach((f,i) => {
            const row = document.createElement('div');
            row.className='ws-row';
            row.innerHTML=`<label>${i===0?'CF0':'C'+String(i).padStart(2,'0')}</label>
                <input type="number" value="${f.cf}" data-cfi="${i}" data-type="cf"/>
                ${i>0?`<label style="margin-left:8px">F</label><input type="number" value="${f.freq}" data-cfi="${i}" data-type="freq" style="width:50px"/>`:''}`
            ws.appendChild(row);
        });
        const btns = document.createElement('div');
        btns.style='display:flex;gap:6px;margin-top:8px';
        btns.innerHTML=`<button class="gbtn" id="ws-cf-add">+CF</button>
            <button class="gbtn gbtn-primary" id="ws-npv-calc">NPV</button>
            <button class="gbtn gbtn-primary" id="ws-irr-calc">IRR</button>`;
        ws.appendChild(btns);
        const res=document.createElement('div'); res.className='ws-result'; res.id='ws-cf-result'; ws.appendChild(res);

        ws.querySelectorAll('input').forEach(inp=>inp.addEventListener('change',()=>{
            const i=parseInt(inp.dataset.cfi);
            if (inp.dataset.type==='cf') cfFlows[i].cf=parseFloat(inp.value)||0;
            else cfFlows[i].freq=Math.max(1,parseInt(inp.value)||1);
        }));
        document.getElementById('ws-cf-add').onclick=()=>{cfFlows.push({cf:0,freq:1});showCFWorksheet();};
        document.getElementById('ws-npv-calc').onclick=()=>{
            const r=computeNPV(tvm.IY/100);
            document.getElementById('ws-cf-result').textContent='NPV = '+fmtNum(r);
            setDisp(r,'NPV =');
        };
        document.getElementById('ws-irr-calc').onclick=()=>{
            const r=computeIRR();
            document.getElementById('ws-cf-result').textContent='IRR = '+fmtNum(r)+'%';
            setDisp(r,'IRR% =');
        };
        ws.classList.add('visible');
    }

    // Stat worksheet
    function showStatWorksheet() {
        const ws=document.getElementById('fin-worksheet');
        ws.innerHTML='<h4>STATISTICS — enter X Y pairs</h4>';
        const tbl=document.createElement('div'); tbl.id='stat-tbl'; ws.appendChild(tbl);
        const statData=[];
        function rerender(){
            tbl.innerHTML='';
            statData.forEach((row,i)=>{
                const d=document.createElement('div'); d.className='ws-row';
                d.innerHTML=`<label>#${i+1}</label>
                    X:<input type="number" value="${row.x}" data-si="${i}" data-st="x" style="width:70px"/>
                    Y:<input type="number" value="${row.y}" data-si="${i}" data-st="y" style="width:70px"/>`;
                tbl.appendChild(d);
            });
            tbl.querySelectorAll('input').forEach(inp=>inp.addEventListener('change',()=>{
                const i=parseInt(inp.dataset.si);
                if(inp.dataset.st==='x')statData[i].x=parseFloat(inp.value)||0;
                else statData[i].y=parseFloat(inp.value)||0;
            }));
        }
        const btns=document.createElement('div'); btns.style='display:flex;gap:6px;margin-top:8px';
        btns.innerHTML=`<button class="gbtn" id="ws-stat-add">+ Row</button>
            <button class="gbtn gbtn-primary" id="ws-stat-calc">Calculate</button>`;
        ws.appendChild(btns);
        const res=document.createElement('div'); res.className='ws-result'; res.id='ws-stat-result'; res.style.whiteSpace='pre'; ws.appendChild(res);
        document.getElementById('ws-stat-add').onclick=()=>{statData.push({x:0,y:0});rerender();};
        document.getElementById('ws-stat-calc').onclick=()=>{
            const n=statData.length; if(!n){return;}
            const sx=statData.reduce((a,r)=>a+r.x,0), sy=statData.reduce((a,r)=>a+r.y,0);
            const mx=sx/n, my=sy/n;
            let ssX=0,ssY=0,ssXY=0;
            statData.forEach(r=>{ssX+=(r.x-mx)**2;ssY+=(r.y-my)**2;ssXY+=(r.x-mx)*(r.y-my);});
            const stdX=Math.sqrt(ssX/(n-1)||0), stdY=Math.sqrt(ssY/(n-1)||0);
            const r=ssX?ssXY/Math.sqrt(ssX*ssY):0;
            const b=ssX?ssXY/ssX:0, a=my-b*mx;
            document.getElementById('ws-stat-result').textContent=
                `n=${n}  x̄=${fmtNum(mx)}  ȳ=${fmtNum(my)}\nSx=${fmtNum(stdX)}  Sy=${fmtNum(stdY)}\nr=${fmtNum(r)}\ny = ${fmtNum(b)}x + ${fmtNum(a)}`;
        };
        ws.classList.add('visible');
    }

    // Bind buttons
    document.querySelectorAll('.fin-grid .btn[data-fk]').forEach(btn => {
        btn.addEventListener('click', () => {
            let k=btn.dataset.fk;
            if (second && btn.dataset.fs) k=btn.dataset.fs;
            press(k);
        });
    });
    document.getElementById('fin-2nd-btn').addEventListener('click', ()=>press('2nd'));

    render();
    return { press };
})();


/* ================================================================
   GRAPHING CALCULATOR
   ================================================================ */
const Graph = (() => {
    const canvas  = document.getElementById('graph-canvas');
    const ctx     = canvas.getContext('2d');
    const xyDiv   = document.getElementById('graph-xy');
    const infoDiv = document.getElementById('graph-info');

    const COLORS = ['#ff9f0a','#30d158','#0a84ff','#ff375f','#bf5af2','#32ade6','#ff9f0a'];
    let funcs  = [{ expr:'', enabled:true, color:COLORS[0], fn:null }];
    let xMin=-10, xMax=10, yMin=-10, yMax=10;
    let traceOn=false, traceX=0, traceFIdx=0;
    let dragging=false, dragSX=0, dragSY=0, dragXMin=0, dragXMax=0, dragYMin=0, dragYMax=0;

    function resize() {
        const wrap = canvas.parentElement;
        canvas.width  = wrap.clientWidth  || 700;
        canvas.height = wrap.clientHeight || 580;
        draw();
    }

    function compileExpr(expr) {
        if (!expr.trim()) return null;
        let e = expr.toLowerCase()
            .replace(/\^/g, '**')
            .replace(/π|pi/g, '(Math.PI)')
            .replace(/\be\b(?!\*\*|x|[a-z])/g, '(Math.E)')
            .replace(/(\d)x/g, '$1*x').replace(/x(\d)/g, 'x*$1')
            .replace(/\)\(/g, ')*(').replace(/(\d)\(/g, '$1*(').replace(/\)x/g, ')*x').replace(/x\(/g, 'x*(')
            .replace(/\bsin\b/g,'Math.sin').replace(/\bcos\b/g,'Math.cos').replace(/\btan\b/g,'Math.tan')
            .replace(/\basin\b/g,'Math.asin').replace(/\bacos\b/g,'Math.acos').replace(/\batan\b/g,'Math.atan')
            .replace(/\bsinh\b/g,'Math.sinh').replace(/\bcosh\b/g,'Math.cosh').replace(/\btanh\b/g,'Math.tanh')
            .replace(/\bsqrt\b/g,'Math.sqrt').replace(/\bcbrt\b/g,'Math.cbrt').replace(/\blogs\b/g,'Math.log10')
            .replace(/\blog\b/g,'Math.log10').replace(/\bln\b/g,'Math.log').replace(/\bexp\b/g,'Math.exp')
            .replace(/\babs\b/g,'Math.abs').replace(/\bfloor\b/g,'Math.floor').replace(/\bceil\b/g,'Math.ceil')
            .replace(/\bsign\b/g,'Math.sign');
        try { return new Function('x', '"use strict"; return ' + e + ';'); }
        catch { return null; }
    }

    function evalFn(fn, x) {
        try { const y = fn(x); return isFinite(y) ? y : NaN; } catch { return NaN; }
    }

    const toX  = x => (x-xMin)/(xMax-xMin)*canvas.width;
    const toY  = y => canvas.height-(y-yMin)/(yMax-yMin)*canvas.height;
    const frX  = cx => xMin+cx/canvas.width*(xMax-xMin);
    const frY  = cy => yMax-cy/canvas.height*(yMax-yMin);

    function niceStep(range) {
        const p=Math.pow(10,Math.floor(Math.log10(range/6)));
        const f=range/6/p;
        return p*(f<1.5?1:f<3.5?2:f<7.5?5:10);
    }

    function draw() {
        const W=canvas.width, H=canvas.height;
        ctx.fillStyle='#0a0a0a';
        ctx.fillRect(0,0,W,H);

        // Grid
        const xs=niceStep(xMax-xMin), ys=niceStep(yMax-yMin);
        ctx.strokeStyle='#1a1a1a'; ctx.lineWidth=.8;
        ctx.font='9px Menlo,monospace'; ctx.fillStyle='#333'; ctx.textAlign='center';
        for (let x=Math.ceil(xMin/xs)*xs; x<=xMax; x+=xs) {
            const cx=toX(x);
            ctx.beginPath(); ctx.moveTo(cx,0); ctx.lineTo(cx,H); ctx.stroke();
            if (Math.abs(x)>xs*.01) ctx.fillText(fmtNum(parseFloat(x.toPrecision(4))),cx,toY(0)+12);
        }
        ctx.textAlign='right';
        for (let y=Math.ceil(yMin/ys)*ys; y<=yMax; y+=ys) {
            const cy=toY(y);
            ctx.beginPath(); ctx.moveTo(0,cy); ctx.lineTo(W,cy); ctx.stroke();
            if (Math.abs(y)>ys*.01) ctx.fillText(fmtNum(parseFloat(y.toPrecision(4))),toX(0)-4,cy+3);
        }

        // Axes
        ctx.strokeStyle='#2a2a2a'; ctx.lineWidth=1.5;
        if (yMin<=0&&yMax>=0){ctx.beginPath();ctx.moveTo(0,toY(0));ctx.lineTo(W,toY(0));ctx.stroke();}
        if (xMin<=0&&xMax>=0){ctx.beginPath();ctx.moveTo(toX(0),0);ctx.lineTo(toX(0),H);ctx.stroke();}

        // Functions
        funcs.forEach((f,idx)=>{
            if (!f.enabled||!f.fn) return;
            ctx.strokeStyle=f.color; ctx.lineWidth=2.2;
            ctx.beginPath();
            let started=false, prevY=null;
            const steps=W*2;
            for (let i=0;i<=steps;i++){
                const x=xMin+i/steps*(xMax-xMin);
                const y=evalFn(f.fn,x);
                if (isNaN(y)){started=false;prevY=null;continue;}
                const cx=toX(x), cy=toY(y);
                // skip near-asymptotes
                if (prevY!==null&&Math.abs(cy-prevY)>H*3){started=false;prevY=null;continue;}
                if (!started){ctx.moveTo(cx,cy);started=true;}
                else ctx.lineTo(cx,cy);
                prevY=cy;
            }
            ctx.stroke();
        });

        // Trace dot
        if (traceOn && funcs[traceFIdx]?.fn) {
            const ty=evalFn(funcs[traceFIdx].fn,traceX);
            if (!isNaN(ty)){
                ctx.beginPath(); ctx.arc(toX(traceX),toY(ty),6,0,2*Math.PI);
                ctx.fillStyle='#fff'; ctx.fill();
                ctx.strokeStyle=funcs[traceFIdx].color; ctx.lineWidth=2; ctx.stroke();
                infoDiv.textContent=`Trace Y${traceFIdx+1}: x=${traceX.toFixed(5)}, y=${ty.toFixed(5)}`;
            }
        }
    }

    function readWindow(){
        xMin=parseFloat(document.getElementById('gxmin').value)||xMin;
        xMax=parseFloat(document.getElementById('gxmax').value)||xMax;
        yMin=parseFloat(document.getElementById('gymin').value)||yMin;
        yMax=parseFloat(document.getElementById('gymax').value)||yMax;
    }
    function writeWindow(){
        ['gxmin','gxmax','gymin','gymax'].forEach((id,i)=>{
            document.getElementById(id).value=parseFloat([xMin,xMax,yMin,yMax][i].toPrecision(5));
        });
    }
    function compileFuncs(){
        document.querySelectorAll('.graph-input').forEach((inp,i)=>{
            if(funcs[i]){funcs[i].expr=inp.value;funcs[i].fn=compileExpr(inp.value);}
        });
    }

    // Plot
    document.getElementById('gplot').addEventListener('click',()=>{readWindow();compileFuncs();draw();});
    // Zoom
    document.getElementById('gzoomin').addEventListener('click',()=>{
        const cx=(xMin+xMax)/2,cy=(yMin+yMax)/2,xr=(xMax-xMin)/4,yr=(yMax-yMin)/4;
        xMin=cx-xr;xMax=cx+xr;yMin=cy-yr;yMax=cy+yr;writeWindow();compileFuncs();draw();
    });
    document.getElementById('gzoomout').addEventListener('click',()=>{
        const cx=(xMin+xMax)/2,cy=(yMin+yMax)/2,xr=(xMax-xMin),yr=(yMax-yMin);
        xMin=cx-xr;xMax=cx+xr;yMin=cy-yr;yMax=cy+yr;writeWindow();compileFuncs();draw();
    });
    document.getElementById('gfit').addEventListener('click',()=>{
        xMin=-10;xMax=10;yMin=-10;yMax=10;writeWindow();compileFuncs();draw();
    });
    // Add function
    document.getElementById('gadd').addEventListener('click',()=>{
        if(funcs.length>=6)return;
        const idx=funcs.length;
        funcs.push({expr:'',enabled:true,color:COLORS[idx%COLORS.length],fn:null});
        const row=document.createElement('div'); row.className='graph-func-row'; row.dataset.idx=idx;
        const subLabels=['₁','₂','₃','₄','₅','₆'];
        row.innerHTML=`<input type="checkbox" checked class="graph-toggle" data-idx="${idx}"/>
            <span class="graph-color-dot" style="background:${COLORS[idx%COLORS.length]}"></span>
            <span class="graph-label">Y${subLabels[idx]}=</span>
            <input type="text" class="graph-input" data-idx="${idx}" placeholder="e.g. x^2"/>`;
        document.getElementById('graph-func-list').appendChild(row);
    });
    // Clear funcs
    document.getElementById('gclear-fn').addEventListener('click',()=>{
        funcs=[{expr:'',enabled:true,color:COLORS[0],fn:null}];
        document.getElementById('graph-func-list').innerHTML=`<div class="graph-func-row" data-idx="0">
            <input type="checkbox" checked class="graph-toggle" data-idx="0"/>
            <span class="graph-color-dot" style="background:#ff9f0a"></span>
            <span class="graph-label">Y₁=</span>
            <input type="text" class="graph-input" data-idx="0" placeholder="e.g. sin(x)"/></div>`;
        xMin=-10;xMax=10;yMin=-10;yMax=10;writeWindow();
        traceOn=false;document.getElementById('gtrace').classList.remove('active');
        infoDiv.textContent='';draw();
    });
    // Toggle enable
    document.getElementById('graph-func-list').addEventListener('change',e=>{
        if(e.target.classList.contains('graph-toggle')){
            const i=parseInt(e.target.dataset.idx);
            if(funcs[i])funcs[i].enabled=e.target.checked;
            compileFuncs();readWindow();draw();
        }
    });
    // Trace
    document.getElementById('gtrace').addEventListener('click',function(){
        traceOn=!traceOn; this.classList.toggle('active',traceOn);
        if(traceOn){traceX=(xMin+xMax)/2;traceFIdx=funcs.findIndex(f=>f.enabled&&f.fn);if(traceFIdx<0)traceFIdx=0;}
        else infoDiv.textContent='';
        compileFuncs();readWindow();draw();
    });
    // Canvas mouse
    canvas.addEventListener('mousemove',e=>{
        const r=canvas.getBoundingClientRect();
        const mx=(e.clientX-r.left)*(canvas.width/r.width);
        const my=(e.clientY-r.top)*(canvas.height/r.height);
        xyDiv.textContent=`x:${frX(mx).toFixed(3)}  y:${frY(my).toFixed(3)}`;
        if(traceOn){traceX=frX(mx);draw();}
        if(dragging){
            const dx=(dragSX-mx)/canvas.width*(dragXMax-dragXMin);
            const dy=(my-dragSY)/canvas.height*(dragYMax-dragYMin);
            xMin=dragXMin+dx;xMax=dragXMax+dx;yMin=dragYMin+dy;yMax=dragYMax+dy;
            writeWindow();draw();
        }
    });
    canvas.addEventListener('mousedown',e=>{
        if(traceOn)return;
        dragging=true;
        const r=canvas.getBoundingClientRect();
        dragSX=(e.clientX-r.left)*(canvas.width/r.width);
        dragSY=(e.clientY-r.top)*(canvas.height/r.height);
        dragXMin=xMin;dragXMax=xMax;dragYMin=yMin;dragYMax=yMax;
    });
    canvas.addEventListener('mouseup',()=>dragging=false);
    canvas.addEventListener('mouseleave',()=>dragging=false);
    canvas.addEventListener('click',e=>{
        if(!traceOn)return;
        for(let i=traceFIdx+1;i<traceFIdx+1+funcs.length;i++){
            const idx=i%funcs.length;
            if(funcs[idx].enabled&&funcs[idx].fn){traceFIdx=idx;break;}
        }
        draw();
    });
    canvas.addEventListener('wheel',e=>{
        e.preventDefault();
        const f=e.deltaY>0?1.15:.87;
        const r=canvas.getBoundingClientRect();
        const cx=frX((e.clientX-r.left)*(canvas.width/r.width));
        const cy=frY((e.clientY-r.top)*(canvas.height/r.height));
        xMin=cx+(xMin-cx)*f;xMax=cx+(xMax-cx)*f;
        yMin=cy+(yMin-cy)*f;yMax=cy+(yMax-cy)*f;
        writeWindow();compileFuncs();draw();
    },{passive:false});

    // Table
    document.getElementById('gtable-btn').addEventListener('click',function(){
        const panel=document.getElementById('graph-table-panel');
        const show=panel.style.display==='none'||!panel.style.display;
        panel.style.display=show?'block':'none';
        if(show){compileFuncs();genTable();}
    });
    document.getElementById('gtgen').addEventListener('click',()=>{compileFuncs();genTable();});
    function genTable(){
        const start=parseFloat(document.getElementById('gtstart').value)||0;
        const step=parseFloat(document.getElementById('gtstep').value)||1;
        const enabled=funcs.filter(f=>f.enabled&&f.fn);
        let head='<tr><th>X</th>'+enabled.map((_,i)=>`<th style="color:${funcs.indexOf(enabled[i])>=0?funcs[funcs.indexOf(enabled[i])].color:'#ff9f0a'}">Y${funcs.indexOf(enabled[i])+1}</th>`).join('')+'</tr>';
        let body='';
        for(let r=0;r<20;r++){
            const x=start+r*step;
            body+=`<tr><td>${fmtNum(parseFloat(x.toPrecision(6)))}</td>`+
                enabled.map(f=>`<td>${isNaN(evalFn(f.fn,x))?'—':fmtNum(evalFn(f.fn,x))}</td>`).join('')+'</tr>';
        }
        document.querySelector('#gtable thead').innerHTML=head;
        document.querySelector('#gtable tbody').innerHTML=body;
    }

    // Analysis
    function findZero(fn){
        const steps=2000,dx=(xMax-xMin)/steps;
        for(let i=0;i<steps;i++){
            const x1=xMin+i*dx,x2=x1+dx,y1=evalFn(fn,x1),y2=evalFn(fn,x2);
            if(!isFinite(y1)||!isFinite(y2))continue;
            if(y1*y2<=0){let lo=x1,hi=x2;for(let j=0;j<80;j++){const m=(lo+hi)/2,ym=evalFn(fn,m);if(Math.abs(ym)<1e-12)return m;if(ym*evalFn(fn,lo)<0)hi=m;else lo=m;}return(lo+hi)/2;}
        }return null;
    }
    function findExtremum(fn,findMin){
        const steps=2000,dx=(xMax-xMin)/steps;
        let bx=xMin,by=evalFn(fn,xMin);
        for(let i=1;i<=steps;i++){const x=xMin+i*dx,y=evalFn(fn,x);if(!isFinite(y))continue;if(findMin?y<by:y>by){bx=x;by=y;}}
        return{x:bx,y:by};
    }
    function firstEnabled(){return funcs.find(f=>f.enabled&&f.fn);}

    document.getElementById('gzero').addEventListener('click',()=>{
        compileFuncs();readWindow();const f=firstEnabled();if(!f)return;
        const z=findZero(f.fn);
        infoDiv.textContent=z!==null?`Zero: x = ${z.toFixed(8)}`:'No zero in window';
        if(z!==null){traceX=z;traceOn=true;traceFIdx=funcs.indexOf(f);document.getElementById('gtrace').classList.add('active');draw();}
    });
    document.getElementById('gmin').addEventListener('click',()=>{
        compileFuncs();readWindow();const f=firstEnabled();if(!f)return;
        const r=findExtremum(f.fn,true);
        infoDiv.textContent=`Min: (${r.x.toFixed(6)}, ${r.y.toFixed(6)})`;
        traceX=r.x;traceOn=true;traceFIdx=funcs.indexOf(f);document.getElementById('gtrace').classList.add('active');draw();
    });
    document.getElementById('gmax').addEventListener('click',()=>{
        compileFuncs();readWindow();const f=firstEnabled();if(!f)return;
        const r=findExtremum(f.fn,false);
        infoDiv.textContent=`Max: (${r.x.toFixed(6)}, ${r.y.toFixed(6)})`;
        traceX=r.x;traceOn=true;traceFIdx=funcs.indexOf(f);document.getElementById('gtrace').classList.add('active');draw();
    });
    document.getElementById('ginter').addEventListener('click',()=>{
        compileFuncs();readWindow();
        const enabled=funcs.filter(f=>f.enabled&&f.fn);
        if(enabled.length<2){infoDiv.textContent='Need 2+ functions';return;}
        const diff=x=>evalFn(enabled[0].fn,x)-evalFn(enabled[1].fn,x);
        const z=findZero({call:diff,...{fn:diff}}.fn||diff);
        // Use findZero with diff function
        const steps=2000,dx=(xMax-xMin)/steps;
        let found=null;
        for(let i=0;i<steps;i++){
            const x1=xMin+i*dx,x2=x1+dx,d1=diff(x1),d2=diff(x2);
            if(!isFinite(d1)||!isFinite(d2))continue;
            if(d1*d2<=0){let lo=x1,hi=x2;for(let j=0;j<80;j++){const m=(lo+hi)/2,dm=diff(m);if(Math.abs(dm)<1e-12){found=m;break;}if(dm*diff(lo)<0)hi=m;else lo=m;}if(!found)found=(lo+hi)/2;break;}
        }
        if(found!==null){
            const y=evalFn(enabled[0].fn,found);
            infoDiv.textContent=`Intersect: (${found.toFixed(6)}, ${y.toFixed(6)})`;
            traceX=found;traceOn=true;traceFIdx=funcs.indexOf(enabled[0]);draw();
        } else infoDiv.textContent='No intersection in window';
    });
    document.getElementById('gderiv').addEventListener('click',()=>{
        compileFuncs();readWindow();const f=firstEnabled();if(!f)return;
        const x=traceOn?traceX:(xMin+xMax)/2;
        const h=(xMax-xMin)*1e-7;
        const d=(evalFn(f.fn,x+h)-evalFn(f.fn,x-h))/(2*h);
        infoDiv.textContent=`dy/dx at x=${x.toFixed(5)} = ${d.toFixed(8)}`;
    });
    document.getElementById('ginteg').addEventListener('click',()=>{
        compileFuncs();readWindow();const f=firstEnabled();if(!f)return;
        const n=2000,h=(xMax-xMin)/n;
        let s=evalFn(f.fn,xMin)+evalFn(f.fn,xMax);
        for(let i=1;i<n;i++){const y=evalFn(f.fn,xMin+i*h);if(isFinite(y))s+=(i%2?4:2)*y;}
        infoDiv.textContent=`∫[${xMin.toFixed(2)},${xMax.toFixed(2)}] = ${(s*h/3).toFixed(8)}`;
    });

    window.addEventListener('resize',resize);
    setTimeout(()=>{resize();draw();},80);
    return { resize, draw };
})();
