/* ================================================================
   TI BA II Plus  |  Scientific  |  Graphing  Calculator
   Complete JavaScript Engine
   ================================================================ */

// ===== MODE SWITCHING =====
(function() {
    const tabs = document.querySelectorAll('.mode-tab');
    const containers = document.querySelectorAll('.calc-container');
    tabs.forEach(tab => {
        tab.addEventListener('click', function() {
            tabs.forEach(t => t.classList.remove('active'));
            containers.forEach(c => c.classList.remove('active'));
            this.classList.add('active');
            document.getElementById(this.dataset.mode + '-calc').classList.add('active');
            if (this.dataset.mode === 'graphing') {
                setTimeout(() => graphCalc.resize(), 50);
            }
        });
    });
})();


/* ================================================================
   1. FINANCIAL CALCULATOR  (TI BA II Plus)
   ================================================================ */
const finCalc = (function() {
    const display = document.getElementById('fin-display');
    const indicator = document.getElementById('fin-indicator');
    const label = document.getElementById('fin-label');
    const btn2nd = document.getElementById('fin-2nd');

    // State
    let inputBuffer = '';
    let secondMode = false;
    let currentWorksheet = 'MAIN'; // MAIN, TVM, CF, BOND, DEPR, STAT, AMORT, DATE
    let worksheetIndex = 0;

    // TVM registers
    const tvm = { N: 0, IY: 0, PV: 0, PMT: 0, FV: 0 };
    let PY = 1, CY = 1;
    let beginMode = false; // END or BGN

    // Cash flow worksheet
    let cfFlows = [0]; // CF0, CF1, CF2...
    let cfFreqs = [1];
    let cfIndex = 0;

    // Bond worksheet
    const bond = { SDT: '', CPN: 0, RDT: '', RV: 100, ACT: 0, FREQ: 2, YLD: 0, PRI: 0, AI: 0 };
    let bondKeys = ['SDT','CPN','RDT','RV','ACT','FREQ','YLD','PRI','AI'];
    let bondIdx = 0;

    // Depreciation worksheet
    const depr = { CST: 0, SAL: 0, LIF: 0, YR: 1, METHOD: 'SL', DEP: 0, RBV: 0, RDV: 0 };
    let deprKeys = ['CST','SAL','LIF','YR','METHOD'];
    let deprIdx = 0;

    // Statistics worksheet
    let statX = [], statY = [];
    let statIdx = 0;
    let statMode = 'X'; // X or Y entry

    // Amortization worksheet
    const amort = { P1: 1, P2: 1, BAL: 0, PRN: 0, INT: 0 };
    let amortKeys = ['P1','P2','BAL','PRN','INT'];
    let amortIdx = 0;

    // Memory registers
    const mem = [0,0,0,0,0,0,0,0,0,0]; // M0-M9

    // Basic arithmetic state
    let calcStack = [];
    let pendingOp = null;
    let lastResult = 0;

    function showDisplay(val, lbl, ind) {
        display.textContent = val !== undefined ? val : display.textContent;
        if (lbl !== undefined) label.textContent = lbl;
        if (ind !== undefined) indicator.textContent = ind;
    }

    function formatNum(n) {
        if (isNaN(n) || !isFinite(n)) return 'Error';
        if (Math.abs(n) > 1e12 || (Math.abs(n) < 1e-8 && n !== 0)) return n.toExponential(6);
        return parseFloat(n.toFixed(8)).toString();
    }

    function getInput() {
        return parseFloat(inputBuffer) || parseFloat(display.textContent) || 0;
    }

    // ---- TVM Solver ----
    function solveTVM(unknown) {
        const n = tvm.N;
        const i = tvm.IY / 100 / PY; // periodic rate
        const pv = tvm.PV;
        const pmt = tvm.PMT;
        const fv = tvm.FV;
        const type = beginMode ? 1 : 0; // 0=END, 1=BGN

        switch(unknown) {
            case 'N': {
                // N = ln((PMT*(1+i*type) - FV*i) / (PMT*(1+i*type) + PV*i)) / ln(1+i)
                if (i === 0) {
                    tvm.N = -(pv + fv) / pmt;
                } else {
                    const num = pmt * (1 + i * type) - fv * i;
                    const den = pmt * (1 + i * type) + pv * i;
                    tvm.N = Math.log(num / den) / Math.log(1 + i);
                }
                return tvm.N;
            }
            case 'IY': {
                // Newton-Raphson to solve for i
                let rate = 0.1 / PY;
                for (let iter = 0; iter < 200; iter++) {
                    const r1 = 1 + rate;
                    const rn = Math.pow(r1, n);
                    const fval = pv * rn + pmt * (1 + rate * type) * (rn - 1) / rate + fv;
                    const dfval = n * pv * Math.pow(r1, n-1) +
                        pmt * (1 + rate * type) * (n * Math.pow(r1, n-1) * rate - (rn - 1)) / (rate * rate) +
                        pmt * type * (rn - 1) / rate;
                    const newRate = rate - fval / dfval;
                    if (Math.abs(newRate - rate) < 1e-12) { rate = newRate; break; }
                    rate = newRate;
                }
                tvm.IY = rate * PY * 100;
                return tvm.IY;
            }
            case 'PV': {
                if (i === 0) {
                    tvm.PV = -(fv + pmt * n);
                } else {
                    const rn = Math.pow(1 + i, n);
                    tvm.PV = -(fv / rn + pmt * (1 + i * type) * (1 - 1/rn) / i);
                }
                return tvm.PV;
            }
            case 'PMT': {
                if (i === 0) {
                    tvm.PMT = -(pv + fv) / n;
                } else {
                    const rn = Math.pow(1 + i, n);
                    tvm.PMT = -(pv * rn + fv) * i / ((1 + i * type) * (rn - 1));
                }
                return tvm.PMT;
            }
            case 'FV': {
                if (i === 0) {
                    tvm.FV = -(pv + pmt * n);
                } else {
                    const rn = Math.pow(1 + i, n);
                    tvm.FV = -(pv * rn + pmt * (1 + i * type) * (rn - 1) / i);
                }
                return tvm.FV;
            }
        }
    }

    // ---- NPV / IRR ----
    function computeNPV(rate) {
        let npv = cfFlows[0] || 0;
        let period = 1;
        for (let j = 1; j < cfFlows.length; j++) {
            for (let f = 0; f < (cfFreqs[j] || 1); f++) {
                npv += cfFlows[j] / Math.pow(1 + rate, period);
                period++;
            }
        }
        return npv;
    }

    function computeIRR() {
        let lo = -0.5, hi = 5, mid;
        // Bisection + Newton
        for (let i = 0; i < 300; i++) {
            mid = (lo + hi) / 2;
            const npv = computeNPV(mid);
            if (Math.abs(npv) < 1e-8) return mid * 100;
            if (npv > 0) lo = mid; else hi = mid;
        }
        return mid * 100;
    }

    // ---- Amortization ----
    function computeAmort() {
        const i = tvm.IY / 100 / PY;
        let balance = tvm.PV;
        let totalPrn = 0, totalInt = 0;
        const type = beginMode ? 1 : 0;

        for (let p = 1; p <= amort.P2; p++) {
            const intPmt = balance * i;
            const prnPmt = tvm.PMT - intPmt;
            balance += prnPmt;
            if (p >= amort.P1) {
                totalPrn += prnPmt;
                totalInt += intPmt;
            }
        }
        amort.BAL = balance;
        amort.PRN = totalPrn;
        amort.INT = totalInt;
    }

    // ---- Depreciation ----
    function computeDepr() {
        const cst = depr.CST, sal = depr.SAL, lif = depr.LIF, yr = depr.YR;
        if (depr.METHOD === 'SL') {
            depr.DEP = (cst - sal) / lif;
            depr.RDV = cst - sal - depr.DEP * yr;
            depr.RBV = cst - depr.DEP * yr;
        } else if (depr.METHOD === 'SYD') {
            const sumYears = lif * (lif + 1) / 2;
            const factor = (lif - yr + 1) / sumYears;
            depr.DEP = (cst - sal) * factor;
            let totalDep = 0;
            for (let y = 1; y <= yr; y++) totalDep += (cst - sal) * (lif - y + 1) / sumYears;
            depr.RBV = cst - totalDep;
            depr.RDV = cst - sal - totalDep;
        } else if (depr.METHOD === 'DB') {
            const rate = 1 / lif;
            let bv = cst;
            for (let y = 1; y <= yr; y++) {
                const dep = bv * rate;
                bv -= dep;
                if (y === yr) depr.DEP = dep;
            }
            depr.RBV = bv;
            depr.RDV = bv - sal;
        }
    }

    // ---- Statistics ----
    function statResults() {
        const n = statX.length;
        if (n === 0) return { n: 0, meanX: 0, meanY: 0, sx: 0, sy: 0, r: 0, a: 0, b: 0 };
        const sumX = statX.reduce((a,b) => a+b, 0);
        const sumY = statY.reduce((a,b) => a+b, 0);
        const meanX = sumX / n;
        const meanY = sumY / n;
        let ssX = 0, ssY = 0, ssXY = 0;
        for (let i = 0; i < n; i++) {
            ssX += (statX[i] - meanX) ** 2;
            ssY += (statY[i] - meanY) ** 2;
            ssXY += (statX[i] - meanX) * (statY[i] - meanY);
        }
        const sx = Math.sqrt(ssX / (n - 1));
        const sy = Math.sqrt(ssY / (n - 1));
        const r = n > 1 ? ssXY / Math.sqrt(ssX * ssY) : 0;
        const b = ssX !== 0 ? ssXY / ssX : 0;
        const a = meanY - b * meanX;
        return { n, meanX, meanY, sx, sy, r, a, b, sumX, sumY };
    }

    // ---- Basic arithmetic ----
    function doBasicOp(op, a, b) {
        switch(op) {
            case '+': return a + b;
            case '-': return a - b;
            case '*': return a * b;
            case '/': return b !== 0 ? a / b : NaN;
        }
    }

    // ---- Handle Keypress ----
    function handleKey(key) {
        // 2nd mode toggle
        if (key === '2ND') {
            secondMode = !secondMode;
            btn2nd.classList.toggle('active-2nd', secondMode);
            showDisplay(undefined, undefined, secondMode ? '2nd' : '');
            return;
        }

        // If 2nd is active, remap key
        if (secondMode) {
            secondMode = false;
            btn2nd.classList.remove('active-2nd');
            indicator.textContent = '';
        }

        // Numbers & decimal
        if (/^[0-9]$/.test(key) || key === '.') {
            if (key === '.' && inputBuffer.includes('.')) return;
            inputBuffer += key;
            showDisplay(inputBuffer);
            return;
        }

        // Plus/minus
        if (key === 'PLUSMINUS') {
            if (inputBuffer) {
                inputBuffer = inputBuffer.startsWith('-') ? inputBuffer.slice(1) : '-' + inputBuffer;
                showDisplay(inputBuffer);
            } else {
                const v = parseFloat(display.textContent) || 0;
                showDisplay(formatNum(-v));
            }
            return;
        }

        // CE/C
        if (key === 'CE') {
            inputBuffer = '';
            showDisplay('0', '', '');
            return;
        }

        // QUIT - back to main
        if (key === 'QUIT') {
            currentWorksheet = 'MAIN';
            worksheetIndex = 0;
            inputBuffer = '';
            showDisplay('0', '', '');
            return;
        }

        // RESET
        if (key === 'RESET') {
            Object.keys(tvm).forEach(k => tvm[k] = 0);
            PY = 1; CY = 1; beginMode = false;
            cfFlows = [0]; cfFreqs = [1]; cfIndex = 0;
            statX = []; statY = []; statIdx = 0;
            currentWorksheet = 'MAIN';
            inputBuffer = '';
            showDisplay('0', 'RESET', '');
            return;
        }

        // ---- TVM Keys ----
        if (['N','IY','PV','PMT','FV'].includes(key)) {
            if (inputBuffer) {
                tvm[key] = parseFloat(inputBuffer);
                inputBuffer = '';
                showDisplay(formatNum(tvm[key]), key + ' =');
            } else {
                showDisplay(formatNum(tvm[key]), key + ' =');
            }
            return;
        }

        // CPT (Compute)
        if (key === 'CPT') {
            // need to know which TVM variable to solve
            // Use the label to determine
            const lbl = label.textContent.replace(' =','').trim();
            if (['N','IY','PV','PMT','FV'].includes(lbl)) {
                const result = solveTVM(lbl);
                showDisplay(formatNum(result), lbl + ' = (CPT)');
            }
            return;
        }

        // ENTER
        if (key === 'ENTER') {
            if (currentWorksheet === 'CF') {
                const val = getInput();
                if (cfIndex === 0) {
                    cfFlows[0] = val;
                } else {
                    const fi = Math.ceil(cfIndex / 2);
                    if (cfIndex % 2 === 1) {
                        cfFlows[fi] = val;
                    } else {
                        cfFreqs[fi] = Math.max(1, Math.floor(val));
                    }
                }
                inputBuffer = '';
                showDisplay(formatNum(val), currentWorksheet + ' ENTER');
                return;
            }
            if (currentWorksheet === 'BOND') {
                bond[bondKeys[bondIdx]] = inputBuffer ? parseFloat(inputBuffer) : bond[bondKeys[bondIdx]];
                inputBuffer = '';
                showDisplay(formatNum(bond[bondKeys[bondIdx]]), bondKeys[bondIdx] + ' =');
                return;
            }
            if (currentWorksheet === 'DEPR') {
                const dk = deprKeys[deprIdx];
                if (dk === 'METHOD') {
                    // toggle method
                    depr.METHOD = depr.METHOD === 'SL' ? 'SYD' : depr.METHOD === 'SYD' ? 'DB' : 'SL';
                    showDisplay(depr.METHOD, 'METHOD');
                } else {
                    depr[dk] = parseFloat(inputBuffer) || depr[dk];
                    inputBuffer = '';
                    showDisplay(formatNum(depr[dk]), dk + ' =');
                }
                return;
            }
            if (currentWorksheet === 'STAT') {
                const val = getInput();
                if (statMode === 'X') {
                    statX[statIdx] = val;
                    statMode = 'Y';
                    inputBuffer = '';
                    showDisplay(formatNum(val), 'X' + (statIdx+1) + ' ENTER, now Y');
                } else {
                    statY[statIdx] = val;
                    statMode = 'X';
                    statIdx++;
                    inputBuffer = '';
                    showDisplay(formatNum(val), 'Y' + statIdx + ' ENTER');
                }
                return;
            }
            if (currentWorksheet === 'AMORT') {
                const ak = amortKeys[amortIdx];
                if (ak === 'P1' || ak === 'P2') {
                    amort[ak] = Math.max(1, Math.floor(getInput()));
                    inputBuffer = '';
                    showDisplay(formatNum(amort[ak]), ak + ' =');
                }
                return;
            }
            // Main: push to stack for arithmetic
            const val = getInput();
            lastResult = val;
            inputBuffer = '';
            showDisplay(formatNum(val));
            return;
        }

        // Arrow UP/DOWN for worksheets
        if (key === 'UP' || key === 'DOWN') {
            const dir = key === 'DOWN' ? 1 : -1;
            if (currentWorksheet === 'CF') {
                cfIndex = Math.max(0, cfIndex + dir);
                const fi = Math.ceil(cfIndex / 2);
                if (cfIndex === 0) {
                    showDisplay(formatNum(cfFlows[0]), 'CF0');
                } else if (cfIndex % 2 === 1) {
                    if (!cfFlows[fi] && cfFlows[fi] !== 0) { cfFlows[fi] = 0; cfFreqs[fi] = 1; }
                    showDisplay(formatNum(cfFlows[fi] || 0), 'C' + String(fi).padStart(2,'0'));
                } else {
                    showDisplay(formatNum(cfFreqs[fi] || 1), 'F' + String(fi).padStart(2,'0'));
                }
                inputBuffer = '';
                return;
            }
            if (currentWorksheet === 'BOND') {
                bondIdx = (bondIdx + dir + bondKeys.length) % bondKeys.length;
                showDisplay(formatNum(bond[bondKeys[bondIdx]]), bondKeys[bondIdx]);
                inputBuffer = '';
                return;
            }
            if (currentWorksheet === 'DEPR') {
                deprIdx = (deprIdx + dir + deprKeys.length) % deprKeys.length;
                const dk = deprKeys[deprIdx];
                showDisplay(dk === 'METHOD' ? depr.METHOD : formatNum(depr[dk]), dk);
                inputBuffer = '';
                return;
            }
            if (currentWorksheet === 'STAT') {
                const sr = statResults();
                const statDisp = ['n='+sr.n, 'Sx='+formatNum(sr.sx), 'Sy='+formatNum(sr.sy),
                    'meanX='+formatNum(sr.meanX), 'meanY='+formatNum(sr.meanY),
                    'r='+formatNum(sr.r), 'a='+formatNum(sr.a), 'b='+formatNum(sr.b)];
                worksheetIndex = (worksheetIndex + dir + statDisp.length) % statDisp.length;
                showDisplay(statDisp[worksheetIndex], 'STAT');
                return;
            }
            if (currentWorksheet === 'AMORT') {
                amortIdx = (amortIdx + dir + amortKeys.length) % amortKeys.length;
                const ak = amortKeys[amortIdx];
                showDisplay(formatNum(amort[ak]), ak);
                inputBuffer = '';
                return;
            }
            return;
        }

        // Worksheet entry keys
        if (key === 'CF') {
            currentWorksheet = 'CF';
            cfIndex = 0;
            showDisplay(formatNum(cfFlows[0]), 'CF0');
            inputBuffer = '';
            return;
        }
        if (key === 'NPV') {
            if (currentWorksheet === 'CF') {
                const val = getInput() || tvm.IY;
                const npv = computeNPV(val / 100);
                showDisplay(formatNum(npv), 'NPV @ ' + formatNum(val) + '%');
                inputBuffer = '';
            }
            return;
        }
        if (key === 'IRR') {
            if (currentWorksheet === 'CF') {
                const irr = computeIRR();
                showDisplay(formatNum(irr), 'IRR');
            }
            return;
        }
        if (key === 'BOND') {
            currentWorksheet = 'BOND';
            bondIdx = 0;
            showDisplay(String(bond.SDT || '0'), 'SDT');
            inputBuffer = '';
            return;
        }
        if (key === 'DEPR') {
            currentWorksheet = 'DEPR';
            deprIdx = 0;
            showDisplay(formatNum(depr.CST), 'CST');
            inputBuffer = '';
            return;
        }
        if (key === 'STAT') {
            currentWorksheet = 'STAT';
            statIdx = 0;
            statMode = 'X';
            worksheetIndex = 0;
            showDisplay('0', 'X1 Enter data');
            inputBuffer = '';
            return;
        }
        if (key === 'AMORT') {
            currentWorksheet = 'AMORT';
            amortIdx = 0;
            showDisplay(formatNum(amort.P1), 'P1');
            inputBuffer = '';
            return;
        }
        if (key === 'DATE') {
            currentWorksheet = 'DATE';
            showDisplay('0', 'DT1 (MMDDYYYY)');
            inputBuffer = '';
            return;
        }

        // P/Y
        if (key === 'P/Y') {
            if (inputBuffer) {
                PY = parseFloat(inputBuffer) || 1;
                CY = PY;
                inputBuffer = '';
            }
            showDisplay(formatNum(PY), 'P/Y');
            return;
        }

        // xP/Y
        if (key === 'xP/Y') {
            const val = getInput();
            showDisplay(formatNum(val * PY), 'xP/Y = ' + formatNum(val * PY));
            inputBuffer = '';
            return;
        }

        // BGN toggle
        if (key === 'BGN') {
            beginMode = !beginMode;
            showDisplay(beginMode ? 'BGN' : 'END', 'Payment Mode');
            return;
        }

        // CLR TVM
        if (key === 'CLR_TVM') {
            Object.keys(tvm).forEach(k => tvm[k] = 0);
            showDisplay('0', 'CLR TVM');
            inputBuffer = '';
            return;
        }
        if (key === 'CLR_WORK') {
            if (currentWorksheet === 'CF') { cfFlows = [0]; cfFreqs = [1]; cfIndex = 0; }
            if (currentWorksheet === 'STAT') { statX = []; statY = []; statIdx = 0; }
            showDisplay('0', 'CLR WORK');
            inputBuffer = '';
            return;
        }

        // Basic Arithmetic
        if (['+','-','*','/'].includes(key)) {
            const val = getInput();
            if (pendingOp !== null) {
                lastResult = doBasicOp(pendingOp, lastResult, val);
                showDisplay(formatNum(lastResult));
            } else {
                lastResult = val;
            }
            pendingOp = key;
            inputBuffer = '';
            return;
        }

        // Equals
        if (key === '=') {
            if (pendingOp !== null) {
                const val = getInput();
                lastResult = doBasicOp(pendingOp, lastResult, val);
                pendingOp = null;
                inputBuffer = '';
                showDisplay(formatNum(lastResult));
            }
            // AMORT: compute
            if (currentWorksheet === 'AMORT') {
                computeAmort();
                amortIdx = 2;
                showDisplay(formatNum(amort.BAL), 'BAL');
            }
            // DEPR: compute
            if (currentWorksheet === 'DEPR') {
                computeDepr();
                showDisplay(formatNum(depr.DEP), 'DEP = ' + formatNum(depr.DEP));
            }
            return;
        }

        // Math functions
        if (key === 'SQRT') {
            const v = getInput();
            showDisplay(formatNum(Math.sqrt(v)));
            inputBuffer = '';
            return;
        }
        if (key === 'YX') {
            const base = getInput();
            lastResult = base;
            pendingOp = '**';
            inputBuffer = '';
            return;
        }
        if (key === 'LN') {
            showDisplay(formatNum(Math.log(getInput())));
            inputBuffer = '';
            return;
        }
        if (key === 'EX') {
            showDisplay(formatNum(Math.exp(getInput())));
            inputBuffer = '';
            return;
        }
        if (key === 'RECIPROCAL') {
            const v = getInput();
            showDisplay(formatNum(1 / v));
            inputBuffer = '';
            return;
        }

        // STO / RCL
        if (key === 'STORE') {
            // Store to M0 by default (next digit selects register)
            mem[0] = getInput();
            showDisplay(undefined, 'STO 0');
            inputBuffer = '';
            return;
        }
        if (key === 'RECALL') {
            showDisplay(formatNum(mem[0]), 'RCL 0');
            inputBuffer = '';
            return;
        }

        // FORMAT
        if (key === 'FORMAT') {
            showDisplay(undefined, 'DEC=' + 8);
            return;
        }
    }

    // Bind buttons
    document.querySelectorAll('.fin-btn[data-fin]').forEach(btn => {
        btn.addEventListener('click', function() {
            let key = this.dataset.fin;
            // Check if 2nd mode and has second function
            if (secondMode && this.dataset.second) {
                key = this.dataset.second;
            }
            handleKey(key);
        });
    });
    btn2nd.addEventListener('click', () => handleKey('2ND'));

    return { tvm, handleKey };
})();


/* ================================================================
   2. SCIENTIFIC CALCULATOR
   ================================================================ */
const sciCalc = (function() {
    const display = document.getElementById('sci-display');
    const exprDisplay = document.getElementById('sci-expression');
    const degInd = document.getElementById('sci-deg-ind');
    const shiftInd = document.getElementById('sci-shift-ind');
    const memInd = document.getElementById('sci-mem-ind');
    const shiftBtn = document.getElementById('sci-shift');

    let expression = '';
    let inputBuffer = '';
    let shiftMode = false;
    let hypMode = false;
    let degMode = true; // true=DEG, false=RAD
    let memory = 0;
    let ans = 0;
    let openParens = 0;
    let pendingFunc = null; // for 2-arg functions like nPr, nCr, y^x

    // For nPr/nCr first argument
    let firstArg = null;
    let twoArgFunc = null;

    function toRad(x) { return degMode ? x * Math.PI / 180 : x; }
    function fromRad(x) { return degMode ? x * 180 / Math.PI : x; }

    function formatNum(n) {
        if (typeof n === 'string') return n;
        if (isNaN(n) || !isFinite(n)) return 'Error';
        if (Math.abs(n) > 1e15 || (Math.abs(n) < 1e-10 && n !== 0)) return n.toExponential(8);
        // Round to avoid floating point noise
        return parseFloat(n.toPrecision(12)).toString();
    }

    function factorial(n) {
        if (n < 0 || n !== Math.floor(n)) return NaN;
        if (n > 170) return Infinity;
        if (n === 0 || n === 1) return 1;
        let r = 1;
        for (let i = 2; i <= n; i++) r *= i;
        return r;
    }

    function nPr(n, r) {
        return factorial(n) / factorial(n - r);
    }

    function nCr(n, r) {
        return factorial(n) / (factorial(r) * factorial(n - r));
    }

    function showResult(val, expr) {
        display.textContent = formatNum(val);
        if (expr !== undefined) exprDisplay.textContent = expr;
    }

    function evalExpression(expr) {
        // Replace display symbols with JS math
        let e = expr;
        e = e.replace(/ans/gi, '(' + ans + ')');
        e = e.replace(/\u00d7/g, '*');
        e = e.replace(/\u00f7/g, '/');
        e = e.replace(/\u2212/g, '-');
        e = e.replace(/\u03c0/g, '(' + Math.PI + ')');

        // Handle implicit multiplication: 2sin, 2(, )(
        e = e.replace(/(\d)([a-zA-Z(])/g, '$1*$2');
        e = e.replace(/\)(\d)/g, ')*$1');
        e = e.replace(/\)\(/g, ')*(');

        // Functions
        const funcMap = {
            'sin': (x) => Math.sin(toRad(x)),
            'cos': (x) => Math.cos(toRad(x)),
            'tan': (x) => Math.tan(toRad(x)),
            'asin': (x) => fromRad(Math.asin(x)),
            'acos': (x) => fromRad(Math.acos(x)),
            'atan': (x) => fromRad(Math.atan(x)),
            'sinh': (x) => Math.sinh(x),
            'cosh': (x) => Math.cosh(x),
            'tanh': (x) => Math.tanh(x),
            'asinh': (x) => Math.asinh(x),
            'acosh': (x) => Math.acosh(x),
            'atanh': (x) => Math.atanh(x),
            'log': (x) => Math.log10(x),
            'ln': (x) => Math.log(x),
            'sqrt': (x) => Math.sqrt(x),
            'cbrt': (x) => Math.cbrt(x),
            'abs': (x) => Math.abs(x),
        };

        // Replace function calls
        for (const [name, fn] of Object.entries(funcMap)) {
            const regex = new RegExp(name + '\\(', 'g');
            e = e.replace(regex, '_' + name + '(');
        }

        // Build safe eval with functions
        const safeScope = {};
        for (const [name, fn] of Object.entries(funcMap)) {
            safeScope['_' + name] = fn;
        }
        safeScope.Math = Math;

        // Replace ^ with **
        e = e.replace(/\^/g, '**');

        try {
            const fn = new Function(...Object.keys(safeScope), 'return ' + e);
            return fn(...Object.values(safeScope));
        } catch(err) {
            return NaN;
        }
    }

    function handleKey(key) {
        // Shift toggle
        if (key === 'SHIFT') {
            shiftMode = !shiftMode;
            shiftBtn.classList.toggle('active-shift', shiftMode);
            shiftInd.textContent = shiftMode ? 'SHIFT' : '';
            return;
        }

        // If shift active and button has shift function, remap
        let actualKey = key;
        if (shiftMode) {
            shiftMode = false;
            shiftBtn.classList.remove('active-shift');
            shiftInd.textContent = '';
        }

        // HYP mode
        if (actualKey === 'HYP') {
            hypMode = !hypMode;
            return;
        }

        // DEG/RAD toggle
        if (actualKey === 'DEG_RAD') {
            degMode = !degMode;
            degInd.textContent = degMode ? 'DEG' : 'RAD';
            return;
        }

        // Numbers
        if (/^[0-9]$/.test(actualKey) || actualKey === '.') {
            if (actualKey === '.' && inputBuffer.includes('.')) return;
            inputBuffer += actualKey;
            expression += actualKey;
            showResult(inputBuffer, expression);
            return;
        }

        // Operators
        if (['+','-','*','/'].includes(actualKey)) {
            if (twoArgFunc && inputBuffer) {
                // Complete 2-arg function
                const second = parseFloat(inputBuffer);
                let result;
                if (twoArgFunc === 'NPR') result = nPr(firstArg, second);
                else if (twoArgFunc === 'NCR') result = nCr(firstArg, second);
                else if (twoArgFunc === 'NTHROOT') result = Math.pow(firstArg, 1/second);
                twoArgFunc = null;
                firstArg = null;
                expression = formatNum(result) + actualKey;
                inputBuffer = '';
                showResult(result, expression);
                return;
            }
            inputBuffer = '';
            const sym = actualKey === '*' ? '\u00d7' : actualKey === '/' ? '\u00f7' : actualKey === '-' ? '\u2212' : actualKey;
            expression += sym;
            showResult(display.textContent, expression);
            return;
        }

        // Parentheses
        if (actualKey === '(') {
            expression += '(';
            openParens++;
            inputBuffer = '';
            showResult(display.textContent, expression);
            return;
        }
        if (actualKey === ')') {
            if (openParens > 0) {
                expression += ')';
                openParens--;
                inputBuffer = '';
                showResult(display.textContent, expression);
            }
            return;
        }

        // Equals
        if (actualKey === '=') {
            if (twoArgFunc && inputBuffer) {
                const second = parseFloat(inputBuffer);
                let result;
                if (twoArgFunc === 'NPR') result = nPr(firstArg, second);
                else if (twoArgFunc === 'NCR') result = nCr(firstArg, second);
                else if (twoArgFunc === 'NTHROOT') result = Math.pow(firstArg, 1/second);
                twoArgFunc = null;
                firstArg = null;
                ans = result;
                showResult(result, expression + '=' + formatNum(result));
                expression = '';
                inputBuffer = '';
                return;
            }
            // Close any open parens
            while (openParens > 0) { expression += ')'; openParens--; }
            const result = evalExpression(expression);
            ans = isNaN(result) ? 0 : result;
            showResult(result, expression + '=');
            expression = '';
            inputBuffer = '';
            return;
        }

        // Clear
        if (actualKey === 'AC') {
            expression = '';
            inputBuffer = '';
            openParens = 0;
            twoArgFunc = null;
            firstArg = null;
            showResult(0, '');
            return;
        }
        if (actualKey === 'CE') {
            if (inputBuffer.length > 0) {
                inputBuffer = '';
                // Remove last number from expression
                expression = expression.replace(/[\d.]+$/, '');
                showResult(0, expression);
            }
            return;
        }
        if (actualKey === 'DEL') {
            if (expression.length > 0) {
                const removed = expression.slice(-1);
                expression = expression.slice(0, -1);
                if (/[\d.]/.test(removed) && inputBuffer.length > 0) {
                    inputBuffer = inputBuffer.slice(0, -1);
                }
                showResult(inputBuffer || '0', expression);
            }
            return;
        }

        // Plus/minus
        if (actualKey === 'PLUSMINUS') {
            if (inputBuffer) {
                if (inputBuffer.startsWith('-')) {
                    inputBuffer = inputBuffer.slice(1);
                    expression = expression.replace(/-[\d.]+$/, inputBuffer);
                } else {
                    expression = expression.replace(/[\d.]+$/, '(-' + inputBuffer + ')');
                    inputBuffer = '-' + inputBuffer;
                }
                showResult(inputBuffer, expression);
            }
            return;
        }

        // Scientific functions
        if (actualKey === 'SIN' || actualKey === 'ASIN') {
            const funcName = hypMode ? (actualKey === 'SIN' ? 'sinh' : 'asinh') : (actualKey === 'SIN' ? 'sin' : 'asin');
            hypMode = false;
            expression += funcName + '(';
            openParens++;
            inputBuffer = '';
            showResult(display.textContent, expression);
            return;
        }
        if (actualKey === 'COS' || actualKey === 'ACOS') {
            const funcName = hypMode ? (actualKey === 'COS' ? 'cosh' : 'acosh') : (actualKey === 'COS' ? 'cos' : 'acos');
            hypMode = false;
            expression += funcName + '(';
            openParens++;
            inputBuffer = '';
            showResult(display.textContent, expression);
            return;
        }
        if (actualKey === 'TAN' || actualKey === 'ATAN') {
            const funcName = hypMode ? (actualKey === 'TAN' ? 'tanh' : 'atanh') : (actualKey === 'TAN' ? 'tan' : 'atan');
            hypMode = false;
            expression += funcName + '(';
            openParens++;
            inputBuffer = '';
            showResult(display.textContent, expression);
            return;
        }

        // x^2
        if (actualKey === 'x2') {
            if (inputBuffer) {
                const v = parseFloat(inputBuffer);
                const r = v * v;
                expression = expression.replace(/[\d.]+$/, '') + formatNum(r);
                inputBuffer = formatNum(r);
                showResult(r, expression);
            }
            return;
        }
        // SQRT
        if (actualKey === 'SQRT') {
            expression += 'sqrt(';
            openParens++;
            inputBuffer = '';
            showResult(display.textContent, expression);
            return;
        }
        // x^3
        if (actualKey === 'x3') {
            if (inputBuffer) {
                const v = parseFloat(inputBuffer);
                const r = v * v * v;
                expression = expression.replace(/[\d.]+$/, '') + formatNum(r);
                inputBuffer = formatNum(r);
                showResult(r, expression);
            }
            return;
        }
        // CBRT
        if (actualKey === 'CBRT') {
            expression += 'cbrt(';
            openParens++;
            inputBuffer = '';
            showResult(display.textContent, expression);
            return;
        }
        // y^x
        if (actualKey === 'yx') {
            expression += '^';
            inputBuffer = '';
            showResult(display.textContent, expression);
            return;
        }
        // nth root
        if (actualKey === 'NTHROOT') {
            if (inputBuffer) {
                firstArg = parseFloat(inputBuffer);
                twoArgFunc = 'NTHROOT';
                expression += '^(1/';
                openParens++;
                inputBuffer = '';
                showResult(display.textContent, expression);
            }
            return;
        }
        // 10^x
        if (actualKey === '10x') {
            if (inputBuffer) {
                const v = parseFloat(inputBuffer);
                const r = Math.pow(10, v);
                expression = expression.replace(/[\d.]+$/, '') + formatNum(r);
                inputBuffer = formatNum(r);
                showResult(r, expression);
            }
            return;
        }
        // LOG
        if (actualKey === 'LOG') {
            expression += 'log(';
            openParens++;
            inputBuffer = '';
            showResult(display.textContent, expression);
            return;
        }
        // e^x
        if (actualKey === 'EXP') {
            if (inputBuffer) {
                const v = parseFloat(inputBuffer);
                const r = Math.exp(v);
                expression = expression.replace(/[\d.]+$/, '') + formatNum(r);
                inputBuffer = formatNum(r);
                showResult(r, expression);
            }
            return;
        }
        // LN
        if (actualKey === 'LN') {
            expression += 'ln(';
            openParens++;
            inputBuffer = '';
            showResult(display.textContent, expression);
            return;
        }

        // Factorial
        if (actualKey === 'FACT') {
            if (inputBuffer) {
                const v = parseFloat(inputBuffer);
                const r = factorial(v);
                expression = expression.replace(/[\d.]+$/, '') + formatNum(r);
                inputBuffer = formatNum(r);
                showResult(r, expression);
            }
            return;
        }

        // 1/x
        if (actualKey === 'RECIPROCAL') {
            if (inputBuffer) {
                const v = parseFloat(inputBuffer);
                const r = 1 / v;
                expression = expression.replace(/[\d.]+$/, '') + formatNum(r);
                inputBuffer = formatNum(r);
                showResult(r, expression);
            }
            return;
        }

        // nPr / nCr
        if (actualKey === 'NPR' || actualKey === 'NCR') {
            if (inputBuffer) {
                firstArg = parseFloat(inputBuffer);
                twoArgFunc = actualKey;
                expression += actualKey === 'NPR' ? 'P' : 'C';
                inputBuffer = '';
                showResult(display.textContent, expression);
            }
            return;
        }

        // |x|
        if (actualKey === 'ABS') {
            expression += 'abs(';
            openParens++;
            inputBuffer = '';
            showResult(display.textContent, expression);
            return;
        }

        // Pi
        if (actualKey === 'PI') {
            expression += '\u03c0';
            inputBuffer = String(Math.PI);
            showResult(Math.PI, expression);
            return;
        }
        // e constant
        if (actualKey === 'E_CONST') {
            expression += 'e';
            inputBuffer = String(Math.E);
            showResult(Math.E, expression);
            return;
        }

        // EE (scientific notation input)
        if (actualKey === 'EE') {
            expression += 'e';
            inputBuffer += 'e';
            showResult(inputBuffer, expression);
            return;
        }

        // Percent
        if (actualKey === 'PERCENT') {
            if (inputBuffer) {
                const v = parseFloat(inputBuffer) / 100;
                expression = expression.replace(/[\d.]+$/, '') + formatNum(v);
                inputBuffer = formatNum(v);
                showResult(v, expression);
            }
            return;
        }

        // MOD
        if (actualKey === 'MOD') {
            expression += '%';
            inputBuffer = '';
            showResult(display.textContent, expression);
            return;
        }

        // Random
        if (actualKey === 'RAN') {
            const r = Math.random();
            expression += formatNum(r);
            inputBuffer = formatNum(r);
            showResult(r, expression);
            return;
        }

        // ANS
        if (actualKey === 'ANS') {
            expression += 'ans';
            inputBuffer = String(ans);
            showResult(ans, expression);
            return;
        }

        // Fraction (simple display toggle - display as fraction approximation)
        if (actualKey === 'FRAC') {
            const val = parseFloat(display.textContent) || 0;
            // Simple fraction approximation
            const frac = toFraction(val);
            showResult(frac, expression);
            return;
        }

        // Memory
        if (actualKey === 'MS') { memory = parseFloat(display.textContent) || 0; memInd.textContent = 'M'; return; }
        if (actualKey === 'MR') { inputBuffer = String(memory); expression += String(memory); showResult(memory, expression); return; }
        if (actualKey === 'MC') { memory = 0; memInd.textContent = ''; return; }
        if (actualKey === 'M+') { memory += parseFloat(display.textContent) || 0; memInd.textContent = 'M'; return; }
        if (actualKey === 'M-') { memory -= parseFloat(display.textContent) || 0; memInd.textContent = 'M'; return; }
    }

    function toFraction(decimal) {
        if (Number.isInteger(decimal)) return String(decimal);
        const tolerance = 1.0e-6;
        let h1 = 1, h2 = 0, k1 = 0, k2 = 1;
        let b = decimal;
        do {
            const a = Math.floor(b);
            let aux = h1; h1 = a * h1 + h2; h2 = aux;
            aux = k1; k1 = a * k1 + k2; k2 = aux;
            b = 1 / (b - a);
        } while (Math.abs(decimal - h1/k1) > decimal * tolerance);

        const whole = Math.floor(h1 / k1);
        const num = h1 - whole * k1;
        if (num === 0) return String(whole);
        if (whole === 0) return h1 + '/' + k1;
        return whole + ' ' + Math.abs(num) + '/' + k1;
    }

    // Bind buttons
    document.querySelectorAll('.sci-btn[data-sci]').forEach(btn => {
        btn.addEventListener('click', function() {
            let key = this.dataset.sci;
            if (shiftMode && this.dataset.shift) {
                key = this.dataset.shift;
            }
            handleKey(key);
        });
    });
    document.getElementById('sci-shift').addEventListener('click', () => handleKey('SHIFT'));
    document.getElementById('sci-alpha').addEventListener('click', () => {}); // placeholder

    // Keyboard support
    document.addEventListener('keydown', function(e) {
        const active = document.querySelector('.calc-container.active');
        if (active.id !== 'scientific-calc') return;
        if (/^[0-9.]$/.test(e.key)) handleKey(e.key);
        else if (e.key === '+') handleKey('+');
        else if (e.key === '-') handleKey('-');
        else if (e.key === '*') handleKey('*');
        else if (e.key === '/') { e.preventDefault(); handleKey('/'); }
        else if (e.key === 'Enter' || e.key === '=') handleKey('=');
        else if (e.key === 'Backspace') handleKey('DEL');
        else if (e.key === 'Escape') handleKey('AC');
        else if (e.key === '(') handleKey('(');
        else if (e.key === ')') handleKey(')');
        else if (e.key === '^') handleKey('yx');
        else if (e.key === '!') handleKey('FACT');
        else if (e.key === '%') handleKey('MOD');
    });

    return { handleKey };
})();


/* ================================================================
   3. GRAPHING CALCULATOR
   ================================================================ */
const graphCalc = (function() {
    const canvas = document.getElementById('graph-canvas');
    const ctx = canvas.getContext('2d');
    const coordsDiv = document.getElementById('graph-coords');
    const infoDiv = document.getElementById('graph-info');
    const tableContainer = document.getElementById('graph-table-container');

    const COLORS = ['#e74c3c','#3498db','#2ecc71','#f39c12','#9b59b6','#1abc9c','#e67e22','#e91e63'];
    let functions = [{ expr: '', enabled: true, color: COLORS[0], compiled: null }];

    let xMin = -10, xMax = 10, yMin = -10, yMax = 10;
    let traceMode = false;
    let traceX = 0;
    let traceFuncIdx = 0;

    function resize() {
        const container = canvas.parentElement;
        canvas.width = container.clientWidth || 700;
        canvas.height = container.clientHeight || 600;
        draw();
    }

    // Parse and compile function expression
    function compileExpr(expr) {
        if (!expr || !expr.trim()) return null;
        let e = expr.trim().toLowerCase();
        // Support common math notation
        e = e.replace(/\^/g, '**');
        e = e.replace(/(\d)x/g, '$1*x');
        e = e.replace(/x(\d)/g, 'x*$1');
        e = e.replace(/\)\(/g, ')*(');
        e = e.replace(/(\d)\(/g, '$1*(');
        e = e.replace(/\)x/g, ')*x');
        e = e.replace(/x\(/g, 'x*(');
        e = e.replace(/\bpi\b/g, 'Math.PI');
        e = e.replace(/\be\b(?!\*\*|x|[a-z])/g, 'Math.E');
        e = e.replace(/\bsin\b/g, 'Math.sin');
        e = e.replace(/\bcos\b/g, 'Math.cos');
        e = e.replace(/\btan\b/g, 'Math.tan');
        e = e.replace(/\basin\b/g, 'Math.asin');
        e = e.replace(/\bacos\b/g, 'Math.acos');
        e = e.replace(/\batan\b/g, 'Math.atan');
        e = e.replace(/\bsinh\b/g, 'Math.sinh');
        e = e.replace(/\bcosh\b/g, 'Math.cosh');
        e = e.replace(/\btanh\b/g, 'Math.tanh');
        e = e.replace(/\bsqrt\b/g, 'Math.sqrt');
        e = e.replace(/\bcbrt\b/g, 'Math.cbrt');
        e = e.replace(/\babs\b/g, 'Math.abs');
        e = e.replace(/\blog\b/g, 'Math.log10');
        e = e.replace(/\bln\b/g, 'Math.log');
        e = e.replace(/\bexp\b/g, 'Math.exp');
        e = e.replace(/\bfloor\b/g, 'Math.floor');
        e = e.replace(/\bceil\b/g, 'Math.ceil');
        e = e.replace(/\bround\b/g, 'Math.round');
        e = e.replace(/\bsign\b/g, 'Math.sign');
        e = e.replace(/\bmax\b/g, 'Math.max');
        e = e.replace(/\bmin\b/g, 'Math.min');
        try {
            return new Function('x', 'return ' + e + ';');
        } catch(err) {
            return null;
        }
    }

    function evalFunc(fn, x) {
        try {
            const y = fn(x);
            if (!isFinite(y)) return NaN;
            return y;
        } catch(e) { return NaN; }
    }

    // Coordinate transforms
    function toCanvasX(x) { return (x - xMin) / (xMax - xMin) * canvas.width; }
    function toCanvasY(y) { return canvas.height - (y - yMin) / (yMax - yMin) * canvas.height; }
    function fromCanvasX(cx) { return xMin + cx / canvas.width * (xMax - xMin); }
    function fromCanvasY(cy) { return yMax - cy / canvas.height * (yMax - yMin); }

    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Background
        ctx.fillStyle = '#0a0a18';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        drawGrid();
        drawAxes();

        // Plot each function
        functions.forEach((f, idx) => {
            if (!f.enabled || !f.compiled) return;
            plotFunction(f.compiled, f.color);
        });

        // Trace indicator
        if (traceMode && functions[traceFuncIdx] && functions[traceFuncIdx].compiled) {
            const fn = functions[traceFuncIdx].compiled;
            const ty = evalFunc(fn, traceX);
            if (!isNaN(ty)) {
                const cx = toCanvasX(traceX);
                const cy = toCanvasY(ty);
                ctx.beginPath();
                ctx.arc(cx, cy, 6, 0, Math.PI * 2);
                ctx.fillStyle = '#fff';
                ctx.fill();
                ctx.strokeStyle = functions[traceFuncIdx].color;
                ctx.lineWidth = 2;
                ctx.stroke();
                infoDiv.textContent = 'Trace Y' + (traceFuncIdx+1) + ': x=' + traceX.toFixed(4) + ', y=' + ty.toFixed(4);
            }
        }
    }

    function drawGrid() {
        ctx.strokeStyle = '#1a2040';
        ctx.lineWidth = 0.5;

        // Determine nice grid spacing
        const xRange = xMax - xMin;
        const yRange = yMax - yMin;
        const xStep = niceStep(xRange / 10);
        const yStep = niceStep(yRange / 10);

        // Vertical grid lines
        let x0 = Math.ceil(xMin / xStep) * xStep;
        for (let x = x0; x <= xMax; x += xStep) {
            const cx = toCanvasX(x);
            ctx.beginPath();
            ctx.moveTo(cx, 0);
            ctx.lineTo(cx, canvas.height);
            ctx.stroke();
            // Labels
            if (Math.abs(x) > xStep * 0.1) {
                ctx.fillStyle = '#445';
                ctx.font = '10px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(niceLabel(x), cx, toCanvasY(0) + 14);
            }
        }

        // Horizontal grid lines
        let y0 = Math.ceil(yMin / yStep) * yStep;
        for (let y = y0; y <= yMax; y += yStep) {
            const cy = toCanvasY(y);
            ctx.beginPath();
            ctx.moveTo(0, cy);
            ctx.lineTo(canvas.width, cy);
            ctx.stroke();
            if (Math.abs(y) > yStep * 0.1) {
                ctx.fillStyle = '#445';
                ctx.font = '10px sans-serif';
                ctx.textAlign = 'right';
                ctx.fillText(niceLabel(y), toCanvasX(0) - 4, cy + 4);
            }
        }
    }

    function drawAxes() {
        ctx.strokeStyle = '#334';
        ctx.lineWidth = 1.5;

        // X axis
        if (yMin <= 0 && yMax >= 0) {
            const cy = toCanvasY(0);
            ctx.beginPath();
            ctx.moveTo(0, cy);
            ctx.lineTo(canvas.width, cy);
            ctx.stroke();
        }

        // Y axis
        if (xMin <= 0 && xMax >= 0) {
            const cx = toCanvasX(0);
            ctx.beginPath();
            ctx.moveTo(cx, 0);
            ctx.lineTo(cx, canvas.height);
            ctx.stroke();
        }
    }

    function plotFunction(fn, color) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        let started = false;
        const steps = canvas.width * 2;
        const dx = (xMax - xMin) / steps;

        for (let i = 0; i <= steps; i++) {
            const x = xMin + i * dx;
            const y = evalFunc(fn, x);
            if (isNaN(y) || !isFinite(y)) {
                started = false;
                continue;
            }
            const cx = toCanvasX(x);
            const cy = toCanvasY(y);
            // Skip if way off screen vertically (avoid visual artifacts from asymptotes)
            if (cy < -canvas.height * 2 || cy > canvas.height * 3) {
                started = false;
                continue;
            }
            if (!started) {
                ctx.moveTo(cx, cy);
                started = true;
            } else {
                ctx.lineTo(cx, cy);
            }
        }
        ctx.stroke();
    }

    function niceStep(rough) {
        const pow = Math.pow(10, Math.floor(Math.log10(rough)));
        const frac = rough / pow;
        if (frac <= 1) return pow;
        if (frac <= 2) return 2 * pow;
        if (frac <= 5) return 5 * pow;
        return 10 * pow;
    }

    function niceLabel(n) {
        if (Math.abs(n) < 1e-10) return '0';
        if (Math.abs(n) >= 1000 || (Math.abs(n) < 0.01 && n !== 0)) return n.toExponential(1);
        return parseFloat(n.toPrecision(4)).toString();
    }

    // ---- UI Bindings ----
    function readWindow() {
        xMin = parseFloat(document.getElementById('graph-xmin').value) || -10;
        xMax = parseFloat(document.getElementById('graph-xmax').value) || 10;
        yMin = parseFloat(document.getElementById('graph-ymin').value) || -10;
        yMax = parseFloat(document.getElementById('graph-ymax').value) || 10;
    }

    function updateWindowInputs() {
        document.getElementById('graph-xmin').value = parseFloat(xMin.toPrecision(6));
        document.getElementById('graph-xmax').value = parseFloat(xMax.toPrecision(6));
        document.getElementById('graph-ymin').value = parseFloat(yMin.toPrecision(6));
        document.getElementById('graph-ymax').value = parseFloat(yMax.toPrecision(6));
    }

    function compileFunctions() {
        document.querySelectorAll('.graph-func-input').forEach((inp, i) => {
            if (functions[i]) {
                functions[i].expr = inp.value;
                functions[i].compiled = compileExpr(inp.value);
            }
        });
    }

    // Plot button
    document.getElementById('graph-plot-btn').addEventListener('click', function() {
        readWindow();
        compileFunctions();
        draw();
    });

    // Add function
    document.getElementById('graph-add-func').addEventListener('click', function() {
        const idx = functions.length;
        functions.push({ expr: '', enabled: true, color: COLORS[idx % COLORS.length], compiled: null });
        const row = document.createElement('div');
        row.className = 'graph-func-row';
        row.dataset.idx = idx;
        row.innerHTML = '<input type="checkbox" checked class="graph-func-toggle" data-idx="' + idx + '" />' +
            '<span class="graph-func-color" style="background:' + COLORS[idx % COLORS.length] + '"></span>' +
            '<label>Y' + (idx+1) + '=</label>' +
            '<input type="text" class="graph-func-input" data-idx="' + idx + '" placeholder="e.g. x^2" value="" />';
        document.getElementById('graph-func-list').appendChild(row);
    });

    // Toggle function visibility
    document.getElementById('graph-func-list').addEventListener('change', function(e) {
        if (e.target.classList.contains('graph-func-toggle')) {
            const idx = parseInt(e.target.dataset.idx);
            if (functions[idx]) functions[idx].enabled = e.target.checked;
            compileFunctions();
            readWindow();
            draw();
        }
    });

    // Zoom
    document.getElementById('graph-zoom-in').addEventListener('click', function() {
        readWindow();
        const cx = (xMin + xMax) / 2, cy = (yMin + yMax) / 2;
        const xr = (xMax - xMin) / 4, yr = (yMax - yMin) / 4;
        xMin = cx - xr; xMax = cx + xr; yMin = cy - yr; yMax = cy + yr;
        updateWindowInputs();
        compileFunctions();
        draw();
    });
    document.getElementById('graph-zoom-out').addEventListener('click', function() {
        readWindow();
        const cx = (xMin + xMax) / 2, cy = (yMin + yMax) / 2;
        const xr = (xMax - xMin), yr = (yMax - yMin);
        xMin = cx - xr; xMax = cx + xr; yMin = cy - yr; yMax = cy + yr;
        updateWindowInputs();
        compileFunctions();
        draw();
    });
    document.getElementById('graph-zoom-fit').addEventListener('click', function() {
        xMin = -10; xMax = 10; yMin = -10; yMax = 10;
        updateWindowInputs();
        compileFunctions();
        draw();
    });

    // Trace mode
    document.getElementById('graph-trace-btn').addEventListener('click', function() {
        traceMode = !traceMode;
        this.classList.toggle('active', traceMode);
        if (traceMode) {
            traceX = (xMin + xMax) / 2;
            traceFuncIdx = functions.findIndex(f => f.enabled && f.compiled);
            if (traceFuncIdx < 0) traceFuncIdx = 0;
            compileFunctions();
            readWindow();
            draw();
        } else {
            infoDiv.textContent = '';
            draw();
        }
    });

    // Mouse interaction
    canvas.addEventListener('mousemove', function(e) {
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const x = fromCanvasX(mx);
        const y = fromCanvasY(my);
        coordsDiv.textContent = 'x: ' + x.toFixed(4) + '  y: ' + y.toFixed(4);

        if (traceMode) {
            traceX = x;
            draw();
        }
    });

    canvas.addEventListener('click', function(e) {
        if (traceMode) {
            // Cycle through functions on click
            let next = traceFuncIdx;
            for (let i = 1; i <= functions.length; i++) {
                const idx = (traceFuncIdx + i) % functions.length;
                if (functions[idx].enabled && functions[idx].compiled) {
                    next = idx;
                    break;
                }
            }
            traceFuncIdx = next;
            draw();
        }
    });

    // Pan with drag
    let dragging = false, dragStartX, dragStartY, dragXMin, dragYMin, dragXMax, dragYMax;
    canvas.addEventListener('mousedown', function(e) {
        if (traceMode) return;
        dragging = true;
        const rect = canvas.getBoundingClientRect();
        dragStartX = e.clientX - rect.left;
        dragStartY = e.clientY - rect.top;
        dragXMin = xMin; dragXMax = xMax; dragYMin = yMin; dragYMax = yMax;
    });
    canvas.addEventListener('mousemove', function(e) {
        if (!dragging) return;
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const dx = (dragStartX - mx) / canvas.width * (dragXMax - dragXMin);
        const dy = (my - dragStartY) / canvas.height * (dragYMax - dragYMin);
        xMin = dragXMin + dx; xMax = dragXMax + dx;
        yMin = dragYMin + dy; yMax = dragYMax + dy;
        updateWindowInputs();
        draw();
    });
    canvas.addEventListener('mouseup', function() { dragging = false; });
    canvas.addEventListener('mouseleave', function() { dragging = false; });

    // Scroll to zoom
    canvas.addEventListener('wheel', function(e) {
        e.preventDefault();
        const factor = e.deltaY > 0 ? 1.15 : 0.87;
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const cx = fromCanvasX(mx);
        const cy = fromCanvasY(my);
        xMin = cx + (xMin - cx) * factor;
        xMax = cx + (xMax - cx) * factor;
        yMin = cy + (yMin - cy) * factor;
        yMax = cy + (yMax - cy) * factor;
        updateWindowInputs();
        compileFunctions();
        draw();
    }, { passive: false });

    // Table
    document.getElementById('graph-table-btn').addEventListener('click', function() {
        const show = tableContainer.style.display === 'none';
        tableContainer.style.display = show ? 'block' : 'none';
        if (show) generateTable();
    });
    document.getElementById('table-gen-btn').addEventListener('click', generateTable);

    function generateTable() {
        compileFunctions();
        const start = parseFloat(document.getElementById('table-start').value) || -5;
        const step = parseFloat(document.getElementById('table-step').value) || 1;
        const table = document.getElementById('graph-table');
        const enabledFuncs = functions.filter(f => f.enabled && f.compiled);

        // Header
        let headerHTML = '<tr><th>X</th>';
        enabledFuncs.forEach((f, i) => {
            const idx = functions.indexOf(f);
            headerHTML += '<th style="color:' + f.color + '">Y' + (idx+1) + '</th>';
        });
        headerHTML += '</tr>';
        table.querySelector('thead').innerHTML = headerHTML;

        // Body
        let bodyHTML = '';
        for (let row = 0; row < 25; row++) {
            const x = start + row * step;
            bodyHTML += '<tr><td>' + niceLabel(x) + '</td>';
            enabledFuncs.forEach(f => {
                const y = evalFunc(f.compiled, x);
                bodyHTML += '<td>' + (isNaN(y) ? 'undef' : niceLabel(y)) + '</td>';
            });
            bodyHTML += '</tr>';
        }
        table.querySelector('tbody').innerHTML = bodyHTML;
    }

    // Clear
    document.getElementById('graph-clear-btn').addEventListener('click', function() {
        functions = [{ expr: '', enabled: true, color: COLORS[0], compiled: null }];
        document.getElementById('graph-func-list').innerHTML =
            '<div class="graph-func-row" data-idx="0">' +
            '<input type="checkbox" checked class="graph-func-toggle" data-idx="0" />' +
            '<span class="graph-func-color" style="background:#e74c3c"></span>' +
            '<label>Y1=</label>' +
            '<input type="text" class="graph-func-input" data-idx="0" placeholder="e.g. sin(x)" value="" />' +
            '</div>';
        xMin = -10; xMax = 10; yMin = -10; yMax = 10;
        updateWindowInputs();
        traceMode = false;
        document.getElementById('graph-trace-btn').classList.remove('active');
        infoDiv.textContent = '';
        draw();
    });

    // ---- Analysis Tools ----

    // Find zero (bisection)
    document.getElementById('graph-zero-btn').addEventListener('click', function() {
        compileFunctions();
        readWindow();
        const f = functions.find(f => f.enabled && f.compiled);
        if (!f) { infoDiv.textContent = 'No function to analyze'; return; }
        const zero = findZero(f.compiled, xMin, xMax);
        if (zero !== null) {
            infoDiv.textContent = 'Zero: x = ' + zero.toFixed(8);
            traceX = zero; traceMode = true;
            traceFuncIdx = functions.indexOf(f);
            document.getElementById('graph-trace-btn').classList.add('active');
            draw();
        } else {
            infoDiv.textContent = 'No zero found in window';
        }
    });

    function findZero(fn, a, b) {
        // Scan for sign change
        const steps = 1000;
        const dx = (b - a) / steps;
        for (let i = 0; i < steps; i++) {
            const x1 = a + i * dx;
            const x2 = x1 + dx;
            const y1 = evalFunc(fn, x1);
            const y2 = evalFunc(fn, x2);
            if (isNaN(y1) || isNaN(y2)) continue;
            if (y1 * y2 <= 0) {
                // Bisection
                let lo = x1, hi = x2;
                for (let j = 0; j < 100; j++) {
                    const mid = (lo + hi) / 2;
                    const ym = evalFunc(fn, mid);
                    if (Math.abs(ym) < 1e-12) return mid;
                    if (ym * evalFunc(fn, lo) < 0) hi = mid; else lo = mid;
                }
                return (lo + hi) / 2;
            }
        }
        return null;
    }

    // Minimum / Maximum
    function findExtremum(fn, a, b, findMin) {
        const steps = 1000;
        const dx = (b - a) / steps;
        let bestX = a, bestY = evalFunc(fn, a);
        for (let i = 0; i <= steps; i++) {
            const x = a + i * dx;
            const y = evalFunc(fn, x);
            if (isNaN(y)) continue;
            if (findMin ? y < bestY : y > bestY) {
                bestX = x; bestY = y;
            }
        }
        // Refine with golden section
        let lo = Math.max(a, bestX - (b-a)/20);
        let hi = Math.min(b, bestX + (b-a)/20);
        const gr = (Math.sqrt(5) + 1) / 2;
        for (let i = 0; i < 100; i++) {
            const c = hi - (hi - lo) / gr;
            const d = lo + (hi - lo) / gr;
            const fc = evalFunc(fn, c);
            const fd = evalFunc(fn, d);
            if (findMin ? fc < fd : fc > fd) hi = d; else lo = c;
        }
        const rx = (lo + hi) / 2;
        return { x: rx, y: evalFunc(fn, rx) };
    }

    document.getElementById('graph-min-btn').addEventListener('click', function() {
        compileFunctions(); readWindow();
        const f = functions.find(f => f.enabled && f.compiled);
        if (!f) return;
        const r = findExtremum(f.compiled, xMin, xMax, true);
        infoDiv.textContent = 'Minimum: x=' + r.x.toFixed(6) + ', y=' + r.y.toFixed(6);
        traceX = r.x; traceMode = true; traceFuncIdx = functions.indexOf(f);
        document.getElementById('graph-trace-btn').classList.add('active');
        draw();
    });

    document.getElementById('graph-max-btn').addEventListener('click', function() {
        compileFunctions(); readWindow();
        const f = functions.find(f => f.enabled && f.compiled);
        if (!f) return;
        const r = findExtremum(f.compiled, xMin, xMax, false);
        infoDiv.textContent = 'Maximum: x=' + r.x.toFixed(6) + ', y=' + r.y.toFixed(6);
        traceX = r.x; traceMode = true; traceFuncIdx = functions.indexOf(f);
        document.getElementById('graph-trace-btn').classList.add('active');
        draw();
    });

    // Intersect (two functions)
    document.getElementById('graph-intersect-btn').addEventListener('click', function() {
        compileFunctions(); readWindow();
        const enabled = functions.filter(f => f.enabled && f.compiled);
        if (enabled.length < 2) { infoDiv.textContent = 'Need 2+ functions for intersection'; return; }
        const f1 = enabled[0].compiled;
        const f2 = enabled[1].compiled;
        const diff = (x) => evalFunc(f1, x) - evalFunc(f2, x);
        const zero = findZero({ compiled: diff }.compiled || diff, xMin, xMax);
        // Use findZero with wrapper
        const steps = 1000;
        const dx = (xMax - xMin) / steps;
        let found = null;
        for (let i = 0; i < steps; i++) {
            const x1 = xMin + i * dx;
            const x2 = x1 + dx;
            const d1 = diff(x1);
            const d2 = diff(x2);
            if (isNaN(d1) || isNaN(d2)) continue;
            if (d1 * d2 <= 0) {
                let lo = x1, hi = x2;
                for (let j = 0; j < 100; j++) {
                    const mid = (lo + hi) / 2;
                    const dm = diff(mid);
                    if (Math.abs(dm) < 1e-12) { found = mid; break; }
                    if (dm * diff(lo) < 0) hi = mid; else lo = mid;
                }
                if (!found) found = (lo + hi) / 2;
                break;
            }
        }
        if (found !== null) {
            const y = evalFunc(f1, found);
            infoDiv.textContent = 'Intersect: x=' + found.toFixed(6) + ', y=' + y.toFixed(6);
            traceX = found; traceMode = true; traceFuncIdx = 0;
            document.getElementById('graph-trace-btn').classList.add('active');
            draw();
        } else {
            infoDiv.textContent = 'No intersection found in window';
        }
    });

    // Numerical derivative
    document.getElementById('graph-derivative-btn').addEventListener('click', function() {
        compileFunctions(); readWindow();
        const f = functions.find(f => f.enabled && f.compiled);
        if (!f) return;
        const x = traceMode ? traceX : (xMin + xMax) / 2;
        const h = (xMax - xMin) * 1e-8;
        const deriv = (evalFunc(f.compiled, x + h) - evalFunc(f.compiled, x - h)) / (2 * h);
        infoDiv.textContent = 'dy/dx at x=' + x.toFixed(6) + ': ' + deriv.toFixed(8);
    });

    // Numerical integral (Simpson's rule)
    document.getElementById('graph-integral-btn').addEventListener('click', function() {
        compileFunctions(); readWindow();
        const f = functions.find(f => f.enabled && f.compiled);
        if (!f) return;
        const a = xMin, b = xMax;
        const n = 1000;
        const h = (b - a) / n;
        let sum = evalFunc(f.compiled, a) + evalFunc(f.compiled, b);
        for (let i = 1; i < n; i++) {
            const x = a + i * h;
            const y = evalFunc(f.compiled, x);
            if (isNaN(y)) continue;
            sum += (i % 2 === 0 ? 2 : 4) * y;
        }
        const integral = sum * h / 3;
        infoDiv.textContent = '\u222B f(x)dx from ' + a.toFixed(2) + ' to ' + b.toFixed(2) + ' = ' + integral.toFixed(8);
    });

    // Initial draw
    setTimeout(() => {
        resize();
        draw();
    }, 100);

    window.addEventListener('resize', resize);

    return { draw, resize, compileFunctions };
})();
