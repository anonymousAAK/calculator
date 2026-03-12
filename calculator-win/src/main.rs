#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use eframe::{egui, NativeOptions};
use egui::{Color32, FontId, RichText, Stroke, Vec2};
use egui_plot::{Line, Plot, PlotPoints};
use std::f64::consts::{E, PI};

fn main() -> eframe::Result<()> {
    let options = NativeOptions {
        viewport: egui::ViewportBuilder::default()
            .with_title("TI BA II Plus | Scientific | Graphing Calculator")
            .with_inner_size([900.0, 700.0])
            .with_min_inner_size([700.0, 500.0])
            .with_icon(eframe::icon_data::from_png_bytes(&[]).unwrap_or_default()),
        ..Default::default()
    };
    eframe::run_native(
        "Calculator",
        options,
        Box::new(|_cc| Box::new(CalculatorApp::default())),
    )
}

// ── Mode ──────────────────────────────────────────────────────────────────────
#[derive(PartialEq, Clone, Copy)]
enum Mode {
    Financial,
    Scientific,
    Graphing,
}

// ── Angle mode ─────────────────────────────────────────────────────────────────
#[derive(PartialEq, Clone, Copy)]
enum AngleMode {
    Deg,
    Rad,
}

impl AngleMode {
    fn to_rad(self, x: f64) -> f64 {
        match self {
            AngleMode::Deg => x * PI / 180.0,
            AngleMode::Rad => x,
        }
    }
    fn from_rad(self, x: f64) -> f64 {
        match self {
            AngleMode::Deg => x * 180.0 / PI,
            AngleMode::Rad => x,
        }
    }
}

// ══════════════════════════════════════════════════════════════════════════════
//  FINANCIAL STATE
// ══════════════════════════════════════════════════════════════════════════════
#[derive(Default)]
struct TvmState {
    n: f64,
    iy: f64,
    pv: f64,
    pmt: f64,
    fv: f64,
    py: f64,   // payments per year
    bgn: bool, // BGN=true, END=false
}

impl TvmState {
    fn new() -> Self {
        Self { py: 1.0, ..Default::default() }
    }
    fn solve(&mut self, unknown: &str) -> f64 {
        let n = self.n;
        let i = self.iy / 100.0 / self.py.max(1.0);
        let pv = self.pv;
        let pmt = self.pmt;
        let fv = self.fv;
        let typ = if self.bgn { 1.0 } else { 0.0 };

        match unknown {
            "N" => {
                if i == 0.0 {
                    self.n = if pmt == 0.0 { 0.0 } else { -(pv + fv) / pmt };
                } else {
                    let num = pmt * (1.0 + i * typ) - fv * i;
                    let den = pmt * (1.0 + i * typ) + pv * i;
                    if den == 0.0 || num / den <= 0.0 { return f64::NAN; }
                    self.n = (num / den).ln() / (1.0 + i).ln();
                }
                self.n
            }
            "IY" => {
                // Newton-Raphson
                let mut rate = 0.1 / self.py.max(1.0);
                for _ in 0..200 {
                    let r1 = 1.0 + rate;
                    let rn = r1.powf(n);
                    if !rn.is_finite() { break; }
                    let f_val = pv * rn + pmt * (1.0 + rate * typ) * (rn - 1.0) / rate + fv;
                    let df = n * pv * r1.powf(n - 1.0)
                        + pmt * (1.0 + rate * typ)
                            * (n * r1.powf(n - 1.0) * rate - (rn - 1.0))
                            / (rate * rate)
                        + pmt * typ * (rn - 1.0) / rate;
                    if df == 0.0 { break; }
                    let new_rate = rate - f_val / df;
                    if (new_rate - rate).abs() < 1e-12 { rate = new_rate; break; }
                    rate = new_rate;
                }
                self.iy = rate * self.py.max(1.0) * 100.0;
                self.iy
            }
            "PV" => {
                if i == 0.0 {
                    self.pv = -(fv + pmt * n);
                } else {
                    let rn = (1.0 + i).powf(n);
                    self.pv = -(fv / rn + pmt * (1.0 + i * typ) * (1.0 - 1.0 / rn) / i);
                }
                self.pv
            }
            "PMT" => {
                if i == 0.0 {
                    self.pmt = -(pv + fv) / n;
                } else {
                    let rn = (1.0 + i).powf(n);
                    self.pmt = -(pv * rn + fv) * i / ((1.0 + i * typ) * (rn - 1.0));
                }
                self.pmt
            }
            "FV" => {
                if i == 0.0 {
                    self.fv = -(pv + pmt * n);
                } else {
                    let rn = (1.0 + i).powf(n);
                    self.fv = -(pv * rn + pmt * (1.0 + i * typ) * (rn - 1.0) / i);
                }
                self.fv
            }
            _ => f64::NAN,
        }
    }
}

// Cash-flow analysis
fn compute_npv(flows: &[(f64, u32)], rate: f64) -> f64 {
    let mut npv = 0.0;
    let mut period = 0i32;
    for (cf, freq) in flows {
        if period == 0 {
            npv += cf;
            period += 1;
            continue;
        }
        for _ in 0..*freq {
            npv += cf / (1.0 + rate).powi(period);
            period += 1;
        }
    }
    npv
}

fn compute_irr(flows: &[(f64, u32)]) -> f64 {
    let mut lo = -0.9999f64;
    let mut hi = 100.0f64;
    for _ in 0..300 {
        let mid = (lo + hi) / 2.0;
        let npv = compute_npv(flows, mid);
        if npv.abs() < 1e-8 { return mid * 100.0; }
        if npv > 0.0 { lo = mid; } else { hi = mid; }
    }
    (lo + hi) / 2.0 * 100.0
}

// ══════════════════════════════════════════════════════════════════════════════
//  SCIENTIFIC STATE
// ══════════════════════════════════════════════════════════════════════════════
struct SciState {
    expression: String,
    input: String,
    result: f64,
    ans: f64,
    memory: f64,
    angle: AngleMode,
    shift: bool,
    hyp: bool,
    pending_func: Option<String>, // first arg already entered
    first_arg: f64,
    error: bool,
}

impl Default for SciState {
    fn default() -> Self {
        Self {
            expression: String::new(),
            input: String::new(),
            result: 0.0,
            ans: 0.0,
            memory: 0.0,
            angle: AngleMode::Deg,
            shift: false,
            hyp: false,
            pending_func: None,
            first_arg: 0.0,
            error: false,
        }
    }
}

impl SciState {
    fn factorial(n: u64) -> f64 {
        if n > 170 { return f64::INFINITY; }
        (1..=n).map(|x| x as f64).product()
    }

    fn press(&mut self, key: &str) {
        if self.error && key != "AC" { return; }

        match key {
            // Digits
            "0"|"1"|"2"|"3"|"4"|"5"|"6"|"7"|"8"|"9" => {
                self.input.push_str(key);
                self.expression.push_str(key);
            }
            "." => {
                if !self.input.contains('.') {
                    self.input.push('.');
                    self.expression.push('.');
                }
            }
            // Operators
            "+" | "-" | "×" | "÷" => {
                if let Some(ref f) = self.pending_func.clone() {
                    self.apply_two_arg(f);
                }
                self.expression.push_str(match key { "×" => "×", "÷" => "÷", s => s });
                self.input.clear();
            }
            "(" | ")" => { self.expression.push_str(key); self.input.clear(); }
            "+/-" => {
                if !self.input.is_empty() {
                    if self.input.starts_with('-') {
                        self.input.remove(0);
                    } else {
                        self.input.insert(0, '-');
                    }
                    // rebuild expression end
                    let expr_end = self.expression.trim_end_matches(&self.input[1..]).len();
                    self.expression = format!("{}{}", &self.expression[..expr_end], self.input);
                }
            }
            "=" => self.evaluate(),
            "AC" => {
                self.expression.clear();
                self.input.clear();
                self.result = 0.0;
                self.error = false;
                self.pending_func = None;
                self.shift = false;
                self.hyp = false;
            }
            "CE" => {
                // Remove last token from expression
                if !self.input.is_empty() {
                    let len = self.input.len();
                    self.expression.truncate(self.expression.len() - len);
                    self.input.clear();
                } else if !self.expression.is_empty() {
                    self.expression.pop();
                }
            }
            "DEL" => {
                if !self.input.is_empty() {
                    self.input.pop();
                    self.expression.pop();
                }
            }
            "ANS" => {
                let s = fmt_num(self.ans);
                self.input = s.clone();
                self.expression.push_str(&s);
            }
            // Memory
            "MS" => { self.memory = self.current_val(); }
            "MR" => {
                let s = fmt_num(self.memory);
                self.input = s.clone();
                self.expression.push_str(&s);
            }
            "MC" => { self.memory = 0.0; }
            "M+" => { self.memory += self.current_val(); }
            "M-" => { self.memory -= self.current_val(); }
            // Constants
            "π" => {
                let s = fmt_num(PI);
                self.input = s.clone();
                self.expression.push_str("π");
            }
            "e" => {
                let s = fmt_num(E);
                self.input = s.clone();
                self.expression.push_str("e");
            }
            // Single-arg math
            "x²" => self.apply_single(|x| x * x, "²"),
            "x³" => self.apply_single(|x| x * x * x, "³"),
            "√" => self.apply_single(|x| x.sqrt(), "√"),
            "∛" => self.apply_single(|x| x.cbrt(), "∛"),
            "1/x" => self.apply_single(|x| if x == 0.0 { f64::NAN } else { 1.0 / x }, "⁻¹"),
            "|x|" => self.apply_single(f64::abs, "|·|"),
            "10^x" => self.apply_single(|x| 10f64.powf(x), "10^"),
            "e^x" => self.apply_single(|x| x.exp(), "e^"),
            "log" => self.apply_single(f64::log10, "log"),
            "ln" => self.apply_single(f64::ln, "ln"),
            "n!" => {
                let v = self.current_val();
                if v >= 0.0 && v == v.floor() && v <= 170.0 {
                    let r = Self::factorial(v as u64);
                    self.set_result(r, &format!("{}!", fmt_num(v)));
                } else {
                    self.error = true;
                }
            }
            "%" => {
                let v = self.current_val() / 100.0;
                self.set_result(v, "%");
            }
            "Ran#" => {
                let r: f64 = js_random();
                self.set_result(r, "Ran#");
            }
            "EE" => {
                self.input.push('e');
                self.expression.push_str("×10^");
            }
            // Trig
            "sin" | "cos" | "tan" | "sin⁻¹" | "cos⁻¹" | "tan⁻¹" => {
                let v = self.current_val();
                let result = match key {
                    "sin"   => if self.hyp { v.sinh() } else { self.angle.to_rad(v).sin() }
                    "cos"   => if self.hyp { v.cosh() } else { self.angle.to_rad(v).cos() }
                    "tan"   => if self.hyp { v.tanh() } else { self.angle.to_rad(v).tan() }
                    "sin⁻¹" => if self.hyp { v.asinh() } else { self.angle.from_rad(v.asin()) }
                    "cos⁻¹" => if self.hyp { v.acosh() } else { self.angle.from_rad(v.acos()) }
                    "tan⁻¹" => if self.hyp { v.atanh() } else { self.angle.from_rad(v.atan()) }
                    _ => f64::NAN
                };
                self.hyp = false;
                self.set_result(result, key);
            }
            // Two-arg: first press stores arg
            "yˣ" | "ˣ√y" | "nPr" | "nCr" => {
                self.first_arg = self.current_val();
                self.pending_func = Some(key.to_string());
                self.expression.push_str(key);
                self.input.clear();
            }
            // Toggle modes
            "SHIFT" => { self.shift = !self.shift; }
            "HYP"   => { self.hyp = !self.hyp; }
            "DEG/RAD" => {
                self.angle = match self.angle {
                    AngleMode::Deg => AngleMode::Rad,
                    AngleMode::Rad => AngleMode::Deg,
                };
            }
            _ => {}
        }
    }

    fn apply_single<F: Fn(f64) -> f64>(&mut self, f: F, label: &str) {
        let v = self.current_val();
        let r = f(v);
        self.set_result(r, label);
    }

    fn apply_two_arg(&mut self, func: &str) {
        let second = self.current_val();
        let result = match func {
            "yˣ"  => self.first_arg.powf(second),
            "ˣ√y" => self.first_arg.powf(1.0 / second),
            "nPr" => {
                let n = self.first_arg as u64;
                let r = second as u64;
                if second > self.first_arg { f64::NAN }
                else { Self::factorial(n) / Self::factorial(n - r) }
            }
            "nCr" => {
                let n = self.first_arg as u64;
                let r = second as u64;
                if second > self.first_arg { f64::NAN }
                else { Self::factorial(n) / (Self::factorial(r) * Self::factorial(n - r)) }
            }
            _ => f64::NAN,
        };
        self.set_result(result, func);
        self.pending_func = None;
    }

    fn evaluate(&mut self) {
        if let Some(ref f) = self.pending_func.clone() {
            self.apply_two_arg(f);
            return;
        }
        // Simple expression evaluator
        let expr = self.expression.replace('×', "*").replace('÷', "/")
            .replace('π', &PI.to_string())
            .replace('e', &E.to_string());
        match eval_expr(&expr) {
            Ok(v) => {
                self.ans = v;
                self.result = v;
                self.expression = fmt_num(v);
                self.input = fmt_num(v);
            }
            Err(_) => { self.error = true; }
        }
    }

    fn set_result(&mut self, v: f64, _label: &str) {
        if !v.is_finite() { self.error = true; return; }
        self.result = v;
        self.ans = v;
        self.input = fmt_num(v);
        self.expression = fmt_num(v);
    }

    fn current_val(&self) -> f64 {
        self.input.parse::<f64>().unwrap_or(self.result)
    }
}

// ══════════════════════════════════════════════════════════════════════════════
//  GRAPHING STATE
// ══════════════════════════════════════════════════════════════════════════════
struct GraphFunc {
    expr: String,
    color: Color32,
    enabled: bool,
}

struct GraphState {
    functions: Vec<GraphFunc>,
    x_min: f64,
    x_max: f64,
    y_min: f64,
    y_max: f64,
    info: String,
    show_table: bool,
    table_start: f64,
    table_step: f64,
}

impl Default for GraphState {
    fn default() -> Self {
        let colors = [
            Color32::from_rgb(231, 76, 60),
            Color32::from_rgb(52, 152, 219),
            Color32::from_rgb(46, 204, 113),
            Color32::from_rgb(243, 156, 18),
            Color32::from_rgb(155, 89, 182),
        ];
        Self {
            functions: vec![GraphFunc {
                expr: String::new(),
                color: colors[0],
                enabled: true,
            }],
            x_min: -10.0, x_max: 10.0,
            y_min: -10.0, y_max: 10.0,
            info: String::new(),
            show_table: false,
            table_start: -5.0,
            table_step: 1.0,
        }
    }
}

impl GraphState {
    fn plot_data(&self, func_idx: usize, samples: usize) -> Vec<[f64; 2]> {
        let f = &self.functions[func_idx];
        if !f.enabled || f.expr.trim().is_empty() { return vec![]; }
        let mut points = Vec::with_capacity(samples);
        let step = (self.x_max - self.x_min) / samples as f64;
        let mut prev_y: Option<f64> = None;
        for i in 0..=samples {
            let x = self.x_min + i as f64 * step;
            let y = eval_with_x(&f.expr, x);
            if y.is_finite() {
                // Discontinuity detection (asymptotes)
                if let Some(py) = prev_y {
                    if (y - py).abs() > (self.y_max - self.y_min) * 5.0 {
                        points.push([x, f64::NAN]);
                        prev_y = None;
                        continue;
                    }
                }
                points.push([x, y]);
                prev_y = Some(y);
            } else {
                if prev_y.is_some() {
                    points.push([x, f64::NAN]);
                }
                prev_y = None;
            }
        }
        points
    }

    fn find_zero(&self, idx: usize) -> Option<f64> {
        let f = &self.functions[idx];
        let steps = 2000;
        let dx = (self.x_max - self.x_min) / steps as f64;
        for i in 0..steps {
            let x1 = self.x_min + i as f64 * dx;
            let x2 = x1 + dx;
            let y1 = eval_with_x(&f.expr, x1);
            let y2 = eval_with_x(&f.expr, x2);
            if !y1.is_finite() || !y2.is_finite() { continue; }
            if y1 * y2 <= 0.0 {
                let mut lo = x1; let mut hi = x2;
                for _ in 0..80 {
                    let mid = (lo + hi) / 2.0;
                    let ym = eval_with_x(&f.expr, mid);
                    if ym.abs() < 1e-12 { return Some(mid); }
                    if ym * eval_with_x(&f.expr, lo) < 0.0 { hi = mid; } else { lo = mid; }
                }
                return Some((lo + hi) / 2.0);
            }
        }
        None
    }

    fn find_extremum(&self, idx: usize, find_min: bool) -> Option<(f64, f64)> {
        let f = &self.functions[idx];
        let steps = 2000;
        let dx = (self.x_max - self.x_min) / steps as f64;
        let mut best_x = self.x_min;
        let mut best_y = eval_with_x(&f.expr, best_x);
        for i in 1..=steps {
            let x = self.x_min + i as f64 * dx;
            let y = eval_with_x(&f.expr, x);
            if !y.is_finite() { continue; }
            if find_min && y < best_y || !find_min && y > best_y {
                best_x = x; best_y = y;
            }
        }
        if best_y.is_finite() { Some((best_x, best_y)) } else { None }
    }

    fn numerical_integral(&self, idx: usize) -> f64 {
        let f = &self.functions[idx];
        let n = 2000;
        let h = (self.x_max - self.x_min) / n as f64;
        let mut sum = eval_with_x(&f.expr, self.x_min) + eval_with_x(&f.expr, self.x_max);
        for i in 1..n {
            let x = self.x_min + i as f64 * h;
            let y = eval_with_x(&f.expr, x);
            if y.is_finite() { sum += if i % 2 == 0 { 2.0 } else { 4.0 } * y; }
        }
        sum * h / 3.0
    }

    fn numerical_derivative(&self, idx: usize, x: f64) -> f64 {
        let f = &self.functions[idx];
        let h = (self.x_max - self.x_min) * 1e-7;
        (eval_with_x(&f.expr, x + h) - eval_with_x(&f.expr, x - h)) / (2.0 * h)
    }
}

// ══════════════════════════════════════════════════════════════════════════════
//  MAIN APP
// ══════════════════════════════════════════════════════════════════════════════
struct CalculatorApp {
    mode: Mode,
    // Financial
    tvm: TvmState,
    fin_input: String,
    fin_display: String,
    fin_label: String,
    fin_2nd: bool,
    fin_pending_op: Option<char>,
    fin_pending_val: f64,
    fin_last: f64,
    cf_flows: Vec<(f64, u32)>, // (cashflow, frequency)
    cf_input: String,
    cf_result: String,
    // Scientific
    sci: SciState,
    // Graphing
    graph: GraphState,
}

impl Default for CalculatorApp {
    fn default() -> Self {
        Self {
            mode: Mode::Financial,
            tvm: TvmState::new(),
            fin_input: String::new(),
            fin_display: "0".into(),
            fin_label: String::new(),
            fin_2nd: false,
            fin_pending_op: None,
            fin_pending_val: 0.0,
            fin_last: 0.0,
            cf_flows: vec![(0.0, 1)],
            cf_input: String::new(),
            cf_result: String::new(),
            sci: SciState::default(),
            graph: GraphState::default(),
        }
    }
}

impl eframe::App for CalculatorApp {
    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        // Dark theme
        ctx.set_visuals(egui::Visuals::dark());

        egui::TopBottomPanel::top("tabs").show(ctx, |ui| {
            ui.horizontal(|ui| {
                ui.spacing_mut().button_padding = Vec2::new(20.0, 8.0);
                for (label, m) in [("TI BA II Plus", Mode::Financial), ("Scientific", Mode::Scientific), ("Graphing", Mode::Graphing)] {
                    let selected = self.mode == m;
                    let btn = egui::Button::new(RichText::new(label).size(14.0).color(
                        if selected { Color32::from_rgb(233, 69, 96) } else { Color32::GRAY }
                    ));
                    if ui.add(btn).clicked() { self.mode = m; }
                }
            });
        });

        egui::CentralPanel::default().show(ctx, |ui| {
            match self.mode {
                Mode::Financial => self.ui_financial(ui),
                Mode::Scientific => self.ui_scientific(ui),
                Mode::Graphing   => self.ui_graphing(ui),
            }
        });
    }
}

// ══════════════════════════════════════════════════════════════════════════════
//  FINANCIAL UI
// ══════════════════════════════════════════════════════════════════════════════
impl CalculatorApp {
    fn ui_financial(&mut self, ui: &mut egui::Ui) {
        let disp_color = Color32::from_rgb(197, 207, 160);

        // Display
        egui::Frame::none()
            .fill(Color32::from_rgb(30, 40, 20))
            .rounding(8.0)
            .inner_margin(egui::Margin::same(10.0))
            .show(ui, |ui| {
                ui.set_min_width(500.0);
                ui.label(RichText::new(&self.fin_label).size(11.0).color(Color32::GRAY));
                ui.add_space(2.0);
                let display_text = &self.fin_display.clone();
                ui.label(RichText::new(display_text).size(28.0).color(disp_color).monospace());
                if self.fin_2nd {
                    ui.label(RichText::new("2nd").size(10.0).color(Color32::from_rgb(240, 150, 50)));
                }
            });

        ui.add_space(8.0);

        let btn_size = Vec2::new(76.0, 44.0);

        // Helper macro-like closure for fin buttons
        let tvm_ref = &mut self.tvm;
        let fin_2nd = &mut self.fin_2nd;
        let fin_input = &mut self.fin_input;
        let fin_display = &mut self.fin_display;
        let fin_label = &mut self.fin_label;
        let fin_pending_op = &mut self.fin_pending_op;
        let fin_pending_val = &mut self.fin_pending_val;
        let fin_last = &mut self.fin_last;
        let cf_flows = &mut self.cf_flows;
        let cf_result = &mut self.cf_result;

        macro_rules! fin_btn {
            ($ui:expr, $primary:expr, $second:expr, $color:expr) => {{
                let label = if *fin_2nd && !$second.is_empty() { $second } else { $primary };
                let btn = egui::Button::new(
                    RichText::new(label).size(12.0)
                ).fill($color).min_size(btn_size);
                $ui.add(btn).clicked()
            }};
        }

        // Row 1: TVM keys
        ui.horizontal(|ui| {
            if ui.add(egui::Button::new(
                RichText::new("2nd").size(12.0).color(Color32::WHITE)
            ).fill(Color32::from_rgb(200, 100, 20)).min_size(btn_size)).clicked() {
                *fin_2nd = !*fin_2nd;
            }

            for (primary, second, var) in [
                ("N", "xP/Y", "N"), ("I/Y", "P/Y", "IY"),
                ("PV", "AMORT", "PV"), ("PMT", "BGN", "PMT"),
                ("FV", "CLR TVM", "FV"),
            ] {
                let lbl = if *fin_2nd && !second.is_empty() { second } else { primary };
                if ui.add(egui::Button::new(RichText::new(lbl).size(12.0))
                    .fill(Color32::from_rgb(50, 50, 70)).min_size(btn_size)).clicked()
                {
                    if *fin_2nd {
                        *fin_2nd = false;
                        match second {
                            "CLR TVM" => { tvm_ref.n=0.0; tvm_ref.iy=0.0; tvm_ref.pv=0.0; tvm_ref.pmt=0.0; tvm_ref.fv=0.0; *fin_display="0".into(); }
                            "BGN"     => { tvm_ref.bgn = !tvm_ref.bgn; *fin_display = if tvm_ref.bgn {"BGN"} else {"END"}.into(); }
                            "P/Y"     => {
                                if let Ok(v) = fin_input.parse::<f64>() { tvm_ref.py = v; }
                                *fin_display = fmt_num(tvm_ref.py);
                                *fin_label = "P/Y".into();
                                fin_input.clear();
                            }
                            _ => {}
                        }
                    } else {
                        // Enter TVM value or show it
                        if let Ok(v) = fin_input.parse::<f64>() {
                            match var {
                                "N"   => tvm_ref.n   = v,
                                "IY"  => tvm_ref.iy  = v,
                                "PV"  => tvm_ref.pv  = v,
                                "PMT" => tvm_ref.pmt = v,
                                "FV"  => tvm_ref.fv  = v,
                                _ => {}
                            }
                            fin_input.clear();
                        }
                        let val = match var {
                            "N"   => tvm_ref.n,
                            "IY"  => tvm_ref.iy,
                            "PV"  => tvm_ref.pv,
                            "PMT" => tvm_ref.pmt,
                            "FV"  => tvm_ref.fv,
                            _ => 0.0,
                        };
                        *fin_display = fmt_num(val);
                        *fin_label = format!("{} =", primary);
                    }
                }
            }
        });

        // CPT row
        ui.horizontal(|ui| {
            for (lbl, color) in [("CPT", Color32::from_rgb(30, 140, 80)), ("CE/C", Color32::from_rgb(100, 30, 30))] {
                if ui.add(egui::Button::new(RichText::new(lbl).size(12.0))
                    .fill(color).min_size(btn_size)).clicked()
                {
                    match lbl {
                        "CPT" => {
                            // Solve for whichever register was last displayed
                            let var = fin_label.trim_end_matches(" =").trim().to_string();
                            let result = tvm_ref.solve(&var);
                            *fin_display = fmt_num(result);
                            *fin_label = format!("{} = (CPT)", var);
                        }
                        "CE/C" => { *fin_input = String::new(); *fin_display = "0".into(); }
                        _ => {}
                    }
                }
            }

            // NPV button
            if ui.add(egui::Button::new(RichText::new("NPV").size(12.0))
                .fill(Color32::from_rgb(40, 70, 110)).min_size(btn_size)).clicked()
            {
                let rate = tvm_ref.iy / 100.0;
                let npv = compute_npv(cf_flows, rate);
                *cf_result = format!("NPV = {}", fmt_num(npv));
                *fin_display = fmt_num(npv);
                *fin_label = "NPV".into();
            }
            // IRR button
            if ui.add(egui::Button::new(RichText::new("IRR").size(12.0))
                .fill(Color32::from_rgb(40, 70, 110)).min_size(btn_size)).clicked()
            {
                let irr = compute_irr(cf_flows);
                *cf_result = format!("IRR = {}%", fmt_num(irr));
                *fin_display = fmt_num(irr);
                *fin_label = "IRR%".into();
            }
            // Amortization quick button
            if ui.add(egui::Button::new(RichText::new("AMORT").size(11.0))
                .fill(Color32::from_rgb(40, 70, 110)).min_size(btn_size)).clicked()
            {
                // Compute single period amort
                let i = tvm_ref.iy / 100.0 / tvm_ref.py.max(1.0);
                let int_pmt = tvm_ref.pv * i;
                let prn_pmt = tvm_ref.pmt - int_pmt;
                *fin_display = fmt_num(int_pmt);
                *fin_label = format!("INT={} PRN={}", fmt_num(int_pmt), fmt_num(prn_pmt));
            }
        });

        // Numpad + operators
        ui.add_space(4.0);
        let num_layout = [
            ["7", "8", "9", "÷", "√"],
            ["4", "5", "6", "×", "yˣ"],
            ["1", "2", "3", "-", "LN"],
            ["0", ".", "+/-", "+", "="],
        ];

        for row in &num_layout {
            ui.horizontal(|ui| {
                for &key in row {
                    let color = match key {
                        "=" => Color32::from_rgb(180, 40, 50),
                        "÷"|"×"|"-"|"+" => Color32::from_rgb(40, 80, 130),
                        "√"|"yˣ"|"LN"   => Color32::from_rgb(60, 60, 90),
                        _ => Color32::from_rgb(30, 35, 50),
                    };
                    if ui.add(egui::Button::new(RichText::new(key).size(14.0))
                        .fill(color).min_size(btn_size)).clicked()
                    {
                        fin_press(key, fin_input, fin_display, fin_label, fin_pending_op, fin_pending_val, fin_last);
                    }
                }
            });
        }

        // CF worksheet
        ui.add_space(8.0);
        ui.separator();
        ui.label(RichText::new("Cash Flow Worksheet").size(13.0).color(Color32::from_rgb(233,69,96)));
        egui::Grid::new("cf_grid").num_columns(3).spacing([6.0, 4.0]).show(ui, |ui| {
            for (i, (cf, freq)) in cf_flows.iter_mut().enumerate() {
                ui.label(RichText::new(if i == 0 { "CF0".to_string() } else { format!("C{:02}", i) }).size(11.0));
                let mut cf_str = fmt_num(*cf);
                if ui.add(egui::TextEdit::singleline(&mut cf_str).desired_width(80.0)).changed() {
                    if let Ok(v) = cf_str.parse::<f64>() { *cf = v; }
                }
                if i > 0 {
                    let mut freq_str = freq.to_string();
                    ui.label("F=");
                    if ui.add(egui::TextEdit::singleline(&mut freq_str).desired_width(40.0)).changed() {
                        if let Ok(v) = freq_str.parse::<u32>() { *freq = v.max(1); }
                    }
                } else {
                    ui.label("");
                }
                ui.end_row();
            }
        });
        ui.horizontal(|ui| {
            if ui.button("+ Flow").clicked() { cf_flows.push((0.0, 1)); }
            if ui.button("- Flow").clicked() && cf_flows.len() > 1 { cf_flows.pop(); }
        });
        if !cf_result.is_empty() {
            ui.label(RichText::new(cf_result.as_str()).size(13.0).color(Color32::YELLOW));
        }
    }
}

fn fin_press(
    key: &str,
    input: &mut String, display: &mut String, label: &mut String,
    pending_op: &mut Option<char>, pending_val: &mut f64, last: &mut f64,
) {
    match key {
        "0"|"1"|"2"|"3"|"4"|"5"|"6"|"7"|"8"|"9"|"." => {
            if key == "." && input.contains('.') { return; }
            input.push_str(key);
            *display = input.clone();
        }
        "+/-" => {
            if input.starts_with('-') { input.remove(0); } else { input.insert(0, '-'); }
            *display = input.clone();
        }
        "+" | "-" | "×" | "÷" => {
            let v = input.parse::<f64>().unwrap_or(*last);
            if let Some(op) = pending_op {
                *last = apply_op(*op, *pending_val, v);
                *display = fmt_num(*last);
            } else {
                *last = v;
            }
            let c = match key { "×" => '*', "÷" => '/', s => s.chars().next().unwrap() };
            *pending_op = Some(c);
            *pending_val = *last;
            input.clear();
        }
        "=" => {
            let v = input.parse::<f64>().unwrap_or(*last);
            if let Some(op) = pending_op {
                *last = apply_op(*op, *pending_val, v);
                *display = fmt_num(*last);
                *pending_op = None;
                input.clear();
            }
        }
        "√" => {
            let v = input.parse::<f64>().unwrap_or(*last);
            let r = v.sqrt();
            *display = fmt_num(r);
            *last = r;
            input.clear();
        }
        "yˣ" => {
            let v = input.parse::<f64>().unwrap_or(*last);
            *pending_op = Some('^');
            *pending_val = v;
            *label = format!("{} ^ ?", fmt_num(v));
            input.clear();
        }
        "LN" => {
            let v = input.parse::<f64>().unwrap_or(*last);
            let r = v.ln();
            *display = fmt_num(r);
            *last = r;
            input.clear();
        }
        _ => {}
    }
}

fn apply_op(op: char, a: f64, b: f64) -> f64 {
    match op {
        '+' => a + b,
        '-' => a - b,
        '*' => a * b,
        '/' => if b != 0.0 { a / b } else { f64::NAN },
        '^' => a.powf(b),
        _ => b,
    }
}

// ══════════════════════════════════════════════════════════════════════════════
//  SCIENTIFIC UI
// ══════════════════════════════════════════════════════════════════════════════
impl CalculatorApp {
    fn ui_scientific(&mut self, ui: &mut egui::Ui) {
        // Display
        egui::Frame::none()
            .fill(Color32::from_rgb(10, 22, 40))
            .rounding(8.0)
            .stroke(Stroke::new(1.5, Color32::from_rgb(15, 52, 96)))
            .inner_margin(egui::Margin::same(10.0))
            .show(ui, |ui| {
                ui.set_min_width(440.0);
                ui.horizontal(|ui| {
                    let angle_str = if self.sci.angle == AngleMode::Deg { "DEG" } else { "RAD" };
                    ui.label(RichText::new(angle_str).size(10.0).color(Color32::from_rgb(74, 144, 217)));
                    if self.sci.shift {
                        ui.label(RichText::new("SHIFT").size(10.0).color(Color32::from_rgb(240,150,50)));
                    }
                    if self.sci.hyp {
                        ui.label(RichText::new("HYP").size(10.0).color(Color32::from_rgb(150,240,150)));
                    }
                    if self.sci.memory != 0.0 {
                        ui.label(RichText::new("M").size(10.0).color(Color32::YELLOW));
                    }
                });
                ui.label(RichText::new(&self.sci.expression).size(11.0).color(Color32::GRAY));
                let disp = if self.sci.error { "Error".to_string() } else { fmt_num(self.sci.result) };
                ui.label(RichText::new(disp).size(30.0).color(Color32::WHITE).monospace());
            });

        ui.add_space(8.0);

        // Button grid
        let btn_size = Vec2::new(78.0, 40.0);

        let layout: &[(&[(&str, &str)])] = &[
            // (primary, shift_label)
            &[("MC",""),("MR",""),("MS",""),("M+",""),("M-","")],
            &[("SHIFT",""),("HYP",""),("DEG/RAD",""),("(",""),(")",")") ],
            &[("x²","√"),("x³","∛"),("yˣ","ˣ√y"),("10^x","log"),("e^x","ln")],
            &[("sin","sin⁻¹"),("cos","cos⁻¹"),("tan","tan⁻¹"),("n!",""),("1/x","")],
            &[("nPr","nCr"),("π","e"),("EE",""),("Ran#",""),("%","")],
            &[("7",""),("8",""),("9",""),("÷",""),("CE","")],
            &[("4",""),("5",""),("6",""),("×",""),("AC","")],
            &[("1",""),("2",""),("3",""),("-",""),("DEL","")],
            &[("0",""),(".",""),("ANS",""),("",""),("","")],
        ];

        for (row_idx, row) in layout.iter().enumerate() {
            ui.horizontal(|ui| {
                for &(primary, shift_lbl) in *row {
                    if primary.is_empty() { ui.add_space(btn_size.x + 4.0); continue; }

                    // Display label: if shift active and shift label exists, show shift label
                    let lbl = if self.sci.shift && !shift_lbl.is_empty() { shift_lbl } else { primary };

                    let color = match primary {
                        "SHIFT" => if self.sci.shift { Color32::from_rgb(255, 170, 0) } else { Color32::from_rgb(200,100,20) },
                        "AC"    => Color32::from_rgb(100, 20, 20),
                        "CE"|"DEL" => Color32::from_rgb(80, 20, 20),
                        "÷"|"×"|"-"|"+" => Color32::from_rgb(15, 52, 96),
                        "0"|"1"|"2"|"3"|"4"|"5"|"6"|"7"|"8"|"9"|"." => Color32::from_rgb(20, 30, 50),
                        _ => Color32::from_rgb(22, 33, 62),
                    };

                    // Special: = button is bigger and different
                    let btn = egui::Button::new(RichText::new(lbl).size(12.5)).fill(color).min_size(btn_size);
                    if ui.add(btn).clicked() {
                        let key = if self.sci.shift && !shift_lbl.is_empty() { shift_lbl } else { primary };
                        self.sci.press(key);
                    }
                }
                // Equals button at end of last row
                if row_idx == layout.len() - 1 {
                    if ui.add(egui::Button::new(RichText::new("=").size(16.0).color(Color32::WHITE))
                        .fill(Color32::from_rgb(233,69,96))
                        .min_size(Vec2::new(btn_size.x * 2.0 + 4.0, btn_size.y))).clicked()
                    {
                        self.sci.press("=");
                    }
                    // + button
                    if ui.add(egui::Button::new(RichText::new("+").size(14.0))
                        .fill(Color32::from_rgb(15,52,96))
                        .min_size(btn_size)).clicked()
                    {
                        self.sci.press("+");
                    }
                }
            });
        }
    }
}

// ══════════════════════════════════════════════════════════════════════════════
//  GRAPHING UI
// ══════════════════════════════════════════════════════════════════════════════
impl CalculatorApp {
    fn ui_graphing(&mut self, ui: &mut egui::Ui) {
        let colors = [
            Color32::from_rgb(231, 76, 60),
            Color32::from_rgb(52, 152, 219),
            Color32::from_rgb(46, 204, 113),
            Color32::from_rgb(243, 156, 18),
            Color32::from_rgb(155, 89, 182),
        ];

        egui::SidePanel::left("graph_controls")
            .resizable(true)
            .default_width(280.0)
            .show_inside(ui, |ui| {
                ui.heading(RichText::new("Functions").color(Color32::from_rgb(233,69,96)));
                ui.add_space(4.0);

                // Function inputs
                let n_funcs = self.graph.functions.len();
                for i in 0..n_funcs {
                    ui.horizontal(|ui| {
                        let mut enabled = self.graph.functions[i].enabled;
                        if ui.checkbox(&mut enabled, "").changed() {
                            self.graph.functions[i].enabled = enabled;
                        }
                        let c = self.graph.functions[i].color;
                        egui::color_picker::show_color(ui, c, Vec2::new(12.0, 12.0));
                        ui.label(RichText::new(format!("Y{}=", i + 1)).size(12.0).color(Color32::GRAY));
                        let mut expr = self.graph.functions[i].expr.clone();
                        ui.add(egui::TextEdit::singleline(&mut expr)
                            .desired_width(140.0)
                            .font(FontId::monospace(12.0)));
                        self.graph.functions[i].expr = expr;
                    });
                }

                ui.horizontal(|ui| {
                    if ui.button("+ Add").clicked() && self.graph.functions.len() < 5 {
                        let idx = self.graph.functions.len();
                        self.graph.functions.push(GraphFunc {
                            expr: String::new(),
                            color: colors[idx % colors.len()],
                            enabled: true,
                        });
                    }
                    if ui.button("Clear").clicked() {
                        self.graph.functions = vec![GraphFunc { expr: String::new(), color: colors[0], enabled: true }];
                    }
                });

                ui.separator();
                ui.label(RichText::new("Window").size(12.0).color(Color32::from_rgb(233,69,96)));
                egui::Grid::new("window_grid").num_columns(2).spacing([4.0, 4.0]).show(ui, |ui| {
                    ui.label("Xmin"); ui.add(egui::DragValue::new(&mut self.graph.x_min).speed(0.1)); ui.end_row();
                    ui.label("Xmax"); ui.add(egui::DragValue::new(&mut self.graph.x_max).speed(0.1)); ui.end_row();
                    ui.label("Ymin"); ui.add(egui::DragValue::new(&mut self.graph.y_min).speed(0.1)); ui.end_row();
                    ui.label("Ymax"); ui.add(egui::DragValue::new(&mut self.graph.y_max).speed(0.1)); ui.end_row();
                });

                ui.separator();
                ui.label(RichText::new("Analysis").size(12.0).color(Color32::from_rgb(233,69,96)));
                let first_idx = self.graph.functions.iter().position(|f| f.enabled && !f.expr.trim().is_empty()).unwrap_or(0);
                egui::Grid::new("analysis_grid").num_columns(2).spacing([4.0, 4.0]).show(ui, |ui| {
                    if ui.button("Zero").clicked() {
                        if let Some(x) = self.graph.find_zero(first_idx) {
                            let _y = eval_with_x(&self.graph.functions[first_idx].expr, x);
                            self.graph.info = format!("Zero: x = {:.6}", x);
                        } else {
                            self.graph.info = "No zero in window".into();
                        }
                    }
                    if ui.button("Minimum").clicked() {
                        if let Some((x, y)) = self.graph.find_extremum(first_idx, true) {
                            self.graph.info = format!("Min: ({:.5}, {:.5})", x, y);
                        }
                    }
                    ui.end_row();
                    if ui.button("Maximum").clicked() {
                        if let Some((x, y)) = self.graph.find_extremum(first_idx, false) {
                            self.graph.info = format!("Max: ({:.5}, {:.5})", x, y);
                        }
                    }
                    if ui.button("∫ f(x)dx").clicked() {
                        let v = self.graph.numerical_integral(first_idx);
                        self.graph.info = format!("∫[{:.2},{:.2}] = {:.8}", self.graph.x_min, self.graph.x_max, v);
                    }
                    ui.end_row();
                    if ui.button("dy/dx @mid").clicked() {
                        let x_mid = (self.graph.x_min + self.graph.x_max) / 2.0;
                        let d = self.graph.numerical_derivative(first_idx, x_mid);
                        self.graph.info = format!("dy/dx @ {:.4} = {:.8}", x_mid, d);
                    }
                    if ui.button("Table").clicked() {
                        self.graph.show_table = !self.graph.show_table;
                    }
                    ui.end_row();
                });

                if !self.graph.info.is_empty() {
                    ui.add_space(4.0);
                    egui::Frame::none().fill(Color32::from_rgb(10, 18, 30)).rounding(4.0)
                        .inner_margin(egui::Margin::same(6.0)).show(ui, |ui| {
                        ui.label(RichText::new(&self.graph.info).size(11.0).color(Color32::YELLOW).monospace());
                    });
                }

                if self.graph.show_table {
                    ui.separator();
                    ui.label(RichText::new("Table").size(12.0).color(Color32::from_rgb(233,69,96)));
                    ui.horizontal(|ui| {
                        ui.label("Start"); ui.add(egui::DragValue::new(&mut self.graph.table_start).speed(0.1));
                        ui.label("Step");  ui.add(egui::DragValue::new(&mut self.graph.table_step).speed(0.1).clamp_range(0.001..=100.0));
                    });
                    egui::ScrollArea::vertical().max_height(200.0).show(ui, |ui| {
                        egui::Grid::new("table_grid").num_columns(1 + self.graph.functions.len()).striped(true).show(ui, |ui| {
                            ui.label(RichText::new("X").size(10.0).color(Color32::GRAY));
                            for (i, f) in self.graph.functions.iter().enumerate() {
                                if f.enabled { ui.label(RichText::new(format!("Y{}", i+1)).size(10.0).color(f.color)); }
                            }
                            ui.end_row();
                            for row in 0..20 {
                                let x = self.graph.table_start + row as f64 * self.graph.table_step;
                                ui.label(RichText::new(fmt_num(x)).size(10.0).monospace());
                                for f in self.graph.functions.iter() {
                                    if f.enabled {
                                        let y = eval_with_x(&f.expr, x);
                                        let s = if y.is_finite() { fmt_num(y) } else { "undef".into() };
                                        ui.label(RichText::new(s).size(10.0).monospace().color(f.color));
                                    }
                                }
                                ui.end_row();
                            }
                        });
                    });
                }
            });

        // Central: plot area
        egui::CentralPanel::default().show_inside(ui, |ui| {
            let available = ui.available_size();
            let plot = Plot::new("main_plot")
                .allow_drag(true)
                .allow_scroll(true)
                .allow_zoom(true)
                .include_x(self.graph.x_min)
                .include_x(self.graph.x_max)
                .include_y(self.graph.y_min)
                .include_y(self.graph.y_max)
                .width(available.x)
                .height(available.y)
                .x_axis_label("x")
                .y_axis_label("y");

            plot.show(ui, |plot_ui| {
                for (i, func) in self.graph.functions.iter().enumerate() {
                    if !func.enabled || func.expr.trim().is_empty() { continue; }
                    let samples = 800;
                    let data = self.graph.plot_data(i, samples);
                    // Split at NaN gaps
                    let mut segment: Vec<[f64; 2]> = Vec::new();
                    for pt in &data {
                        if pt[1].is_nan() {
                            if !segment.is_empty() {
                                let pts = PlotPoints::new(segment.clone());
                                plot_ui.line(Line::new(pts).color(func.color).width(2.0));
                                segment.clear();
                            }
                        } else {
                            segment.push(*pt);
                        }
                    }
                    if !segment.is_empty() {
                        let pts = PlotPoints::new(segment);
                        plot_ui.line(Line::new(pts).color(func.color).width(2.0));
                    }
                }
            });
        });
    }
}

// ══════════════════════════════════════════════════════════════════════════════
//  EXPRESSION EVALUATOR  (minimal recursive descent)
// ══════════════════════════════════════════════════════════════════════════════
fn eval_with_x(expr: &str, x: f64) -> f64 {
    let e = normalize_expr(expr, x);
    eval_expr(&e).unwrap_or(f64::NAN)
}

fn normalize_expr(expr: &str, x: f64) -> String {
    let mut e = expr.to_lowercase();
    e = e.replace("pi", &PI.to_string());
    // Replace standalone 'e' with Euler's number, but not 'e' in 'exp'/'e^'
    e = e.replace("exp(", "__EXP(");
    e = e.replace(" e ", &format!(" {} ", E));
    e = e.replace("__EXP(", "exp(");
    e = e.replace('x', &format!("({})", x));
    e = e.replace('^', "**");
    // implicit mult: 2( => 2*(
    let bytes = e.as_bytes();
    let mut out = String::with_capacity(e.len() + 10);
    for i in 0..bytes.len() {
        let c = bytes[i] as char;
        if i + 1 < bytes.len() {
            let next = bytes[i+1] as char;
            out.push(c);
            if (c.is_ascii_digit() || c == ')') && (next == '(' || next.is_alphabetic()) {
                out.push('*');
            }
        } else {
            out.push(c);
        }
    }
    out
}

// Recursive descent parser
struct Parser<'a> {
    tokens: Vec<Token<'a>>,
    pos: usize,
}

#[derive(Clone, Debug)]
enum Token<'a> {
    Num(f64),
    Op(char),
    LParen,
    RParen,
    Ident(&'a str),
    StarStar,
}

fn tokenize(expr: &str) -> Vec<Token<'_>> {
    let mut tokens = Vec::new();
    let chars: Vec<char> = expr.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        match chars[i] {
            ' ' | '\t' => { i += 1; }
            '(' => { tokens.push(Token::LParen); i += 1; }
            ')' => { tokens.push(Token::RParen); i += 1; }
            '+' | '-' | '*' | '/' | '%' => {
                if chars[i] == '*' && i + 1 < chars.len() && chars[i+1] == '*' {
                    tokens.push(Token::StarStar);
                    i += 2;
                } else {
                    tokens.push(Token::Op(chars[i]));
                    i += 1;
                }
            }
            '0'..='9' | '.' => {
                let start = i;
                while i < chars.len() && (chars[i].is_ascii_digit() || chars[i] == '.' || chars[i] == 'e' || (chars[i] == '-' && i > 0 && chars[i-1] == 'e')) {
                    i += 1;
                }
                let s: String = chars[start..i].iter().collect();
                tokens.push(Token::Num(s.parse().unwrap_or(f64::NAN)));
            }
            'a'..='z' | 'A'..='Z' | '_' => {
                let start = i;
                while i < chars.len() && (chars[i].is_alphanumeric() || chars[i] == '_') { i += 1; }
                // SAFETY: expr is valid UTF-8, indices are char boundaries
                let s = &expr[chars[..start].iter().map(|c| c.len_utf8()).sum::<usize>()..
                              chars[..i].iter().map(|c| c.len_utf8()).sum::<usize>()];
                tokens.push(Token::Ident(s));
            }
            _ => { i += 1; }
        }
    }
    tokens
}

fn eval_expr(expr: &str) -> Result<f64, ()> {
    let tokens = tokenize(expr);
    let mut p = Parser { tokens, pos: 0 };
    let result = p.parse_expr()?;
    Ok(result)
}

impl<'a> Parser<'a> {
    fn peek(&self) -> Option<&Token<'a>> { self.tokens.get(self.pos) }
    fn consume(&mut self) -> Option<Token<'a>> {
        let t = self.tokens.get(self.pos).cloned();
        self.pos += 1;
        t
    }

    fn parse_expr(&mut self) -> Result<f64, ()> { self.parse_add() }

    fn parse_add(&mut self) -> Result<f64, ()> {
        let mut left = self.parse_mul()?;
        loop {
            match self.peek() {
                Some(Token::Op('+')) => { self.consume(); left += self.parse_mul()?; }
                Some(Token::Op('-')) => { self.consume(); left -= self.parse_mul()?; }
                _ => break,
            }
        }
        Ok(left)
    }

    fn parse_mul(&mut self) -> Result<f64, ()> {
        let mut left = self.parse_pow()?;
        loop {
            match self.peek() {
                Some(Token::Op('*')) => { self.consume(); left *= self.parse_pow()?; }
                Some(Token::Op('/')) => { self.consume(); let r = self.parse_pow()?; left /= r; }
                Some(Token::Op('%')) => { self.consume(); let r = self.parse_pow()?; left %= r; }
                _ => break,
            }
        }
        Ok(left)
    }

    fn parse_pow(&mut self) -> Result<f64, ()> {
        let base = self.parse_unary()?;
        if matches!(self.peek(), Some(Token::StarStar)) {
            self.consume();
            let exp = self.parse_pow()?; // right-associative
            Ok(base.powf(exp))
        } else {
            Ok(base)
        }
    }

    fn parse_unary(&mut self) -> Result<f64, ()> {
        if let Some(Token::Op('-')) = self.peek() {
            self.consume();
            return Ok(-self.parse_primary()?);
        }
        if let Some(Token::Op('+')) = self.peek() {
            self.consume();
        }
        self.parse_primary()
    }

    fn parse_primary(&mut self) -> Result<f64, ()> {
        match self.peek().cloned() {
            Some(Token::Num(v)) => { self.consume(); Ok(v) }
            Some(Token::LParen) => {
                self.consume();
                let v = self.parse_expr()?;
                if let Some(Token::RParen) = self.peek() { self.consume(); }
                Ok(v)
            }
            Some(Token::Ident(name)) => {
                let name = name.to_lowercase();
                self.consume();
                // Could be a constant or function
                match name.as_str() {
                    "pi" => Ok(PI),
                    "e"  => Ok(E),
                    "inf" | "infinity" => Ok(f64::INFINITY),
                    fname => {
                        // Expect '(' arg ')'
                        if let Some(Token::LParen) = self.peek() {
                            self.consume();
                            let arg = self.parse_expr()?;
                            // Optional comma + second arg
                            let arg2 = if let Some(Token::Op(',')) = self.peek() {
                                self.consume();
                                Some(self.parse_expr()?)
                            } else { None };
                            if let Some(Token::RParen) = self.peek() { self.consume(); }
                            Ok(apply_func(fname, arg, arg2))
                        } else {
                            Err(())
                        }
                    }
                }
            }
            _ => Err(()),
        }
    }
}

fn apply_func(name: &str, arg: f64, arg2: Option<f64>) -> f64 {
    match name {
        "sin"   => arg.sin(),
        "cos"   => arg.cos(),
        "tan"   => arg.tan(),
        "asin"  => arg.asin(),
        "acos"  => arg.acos(),
        "atan"  => if let Some(y) = arg2 { y.atan2(arg) } else { arg.atan() },
        "atan2" => if let Some(x) = arg2 { arg.atan2(x) } else { arg.atan() },
        "sinh"  => arg.sinh(),
        "cosh"  => arg.cosh(),
        "tanh"  => arg.tanh(),
        "asinh" => arg.asinh(),
        "acosh" => arg.acosh(),
        "atanh" => arg.atanh(),
        "sqrt"  => arg.sqrt(),
        "cbrt"  => arg.cbrt(),
        "abs"   => arg.abs(),
        "log" | "log10" => arg.log10(),
        "log2"  => arg.log2(),
        "ln"    => arg.ln(),
        "exp"   => arg.exp(),
        "floor" => arg.floor(),
        "ceil"  => arg.ceil(),
        "round" => arg.round(),
        "sign" | "signum" => arg.signum(),
        "min"   => if let Some(b) = arg2 { arg.min(b) } else { arg }
        "max"   => if let Some(b) = arg2 { arg.max(b) } else { arg }
        "pow"   => if let Some(e) = arg2 { arg.powf(e) } else { arg }
        "mod"   => if let Some(b) = arg2 { arg % b } else { arg }
        "logn"  => if let Some(base) = arg2 { arg.log(base) } else { arg.ln() }
        _ => f64::NAN,
    }
}

// ══════════════════════════════════════════════════════════════════════════════
//  UTILITIES
// ══════════════════════════════════════════════════════════════════════════════
fn fmt_num(v: f64) -> String {
    if v.is_nan() { return "NaN".into(); }
    if v.is_infinite() { return if v > 0.0 { "∞".into() } else { "-∞".into() }; }
    if v.abs() >= 1e15 || (v.abs() < 1e-9 && v != 0.0) {
        return format!("{:.6e}", v);
    }
    let s = format!("{:.10}", v);
    let s = s.trim_end_matches('0');
    let s = s.trim_end_matches('.');
    s.to_string()
}

// Simple LCG random (no std::rand for simplicity)
static RAND_STATE: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(12345678901234u64);
fn js_random() -> f64 {
    let mut s = RAND_STATE.load(std::sync::atomic::Ordering::Relaxed);
    s ^= s << 13; s ^= s >> 7; s ^= s << 17;
    RAND_STATE.store(s, std::sync::atomic::Ordering::Relaxed);
    (s & 0x000FFFFFFFFFFFFF) as f64 / (0x000FFFFFFFFFFFFFu64 as f64)
}
