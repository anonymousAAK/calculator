#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use eframe::egui;
use egui::{
    vec2, Align, Align2, Color32, FontFamily, FontId, Frame, Layout, Margin, Rounding, Vec2,
};
use egui_plot::{Line, Plot, PlotPoints};
use std::f64::consts::{E, PI};

// ── Palette (Apple Calculator) ──────────────────────────────────────────────
const BLACK:   Color32 = Color32::from_rgb(0,   0,   0);
const DARK_BG: Color32 = Color32::from_rgb(28,  28,  30);  // #1c1c1e
const BTN_NUM: Color32 = Color32::from_rgb(51,  51,  51);  // #333
const BTN_FN:  Color32 = Color32::from_rgb(165, 165, 165); // #a5a5a5 (AC/+−/%)
const BTN_SCI: Color32 = Color32::from_rgb(44,  44,  46);  // #2c2c2e (sci fn)
const BTN_OP:  Color32 = Color32::from_rgb(255, 149,  0);  // #ff9500 orange
const BTN_OP_SEL: Color32 = Color32::WHITE;
const BTN_TVM: Color32 = Color32::from_rgb(26,  58,  92);
const BTN_CPT: Color32 = Color32::from_rgb(26,  92,  42);
const TEXT_OP_SEL: Color32 = Color32::from_rgb(255, 149, 0);
const HIST_COL: Color32 = Color32::from_rgb(99,  99,  102); // #636366
const WHITE:   Color32 = Color32::WHITE;

fn main() -> eframe::Result<()> {
    let opts = eframe::NativeOptions {
        viewport: egui::ViewportBuilder::default()
            .with_title("Calculator")
            .with_inner_size([780.0, 780.0])
            .with_min_inner_size([600.0, 600.0]),
        ..Default::default()
    };
    eframe::run_native("Calculator", opts, Box::new(|cc| {
        // Configure fonts
        let fonts = egui::FontDefinitions::default();
        cc.egui_ctx.set_fonts(fonts);
        Box::new(App::default())
    }))
}

// ══════════════════════════════════════════════════════════════════════════════
//  MODE
// ══════════════════════════════════════════════════════════════════════════════
#[derive(PartialEq, Clone, Copy, Default)]
enum Mode { #[default] Scientific, Financial, Graphing }

// ══════════════════════════════════════════════════════════════════════════════
//  SCIENTIFIC STATE
// ══════════════════════════════════════════════════════════════════════════════
#[derive(Default)]
enum AngleMode { #[default] Deg, Rad }

struct SciCalc {
    current:  String,   // large display
    history:  String,   // small expression above
    prev:     Option<f64>,
    op:       Option<Op>,
    just_eq:  bool,
    memory:   f64,
    mem_set:  bool,
    ans:      f64,
    angle:    AngleMode,
    shift:    bool,
    hyp:      bool,
    two_fn:   Option<TwoFn>,
    two_a:    f64,
    open_p:   i32,
}

#[derive(Clone, Copy, PartialEq)]
enum Op { Add, Sub, Mul, Div, Mod, Pow }
impl Op {
    fn sym(self) -> &'static str {
        match self { Op::Add=>"+", Op::Sub=>"−", Op::Mul=>"×", Op::Div=>"÷", Op::Mod=>"mod", Op::Pow=>"^" }
    }
    fn apply(self, a: f64, b: f64) -> f64 {
        match self {
            Op::Add => a+b, Op::Sub => a-b, Op::Mul => a*b,
            Op::Div => if b!=0.0{a/b}else{f64::NAN},
            Op::Mod => a%b,
            Op::Pow => a.powf(b),
        }
    }
}

#[derive(Clone, Copy)]
enum TwoFn { Npr, Ncr, Xrty, Yx }

impl Default for SciCalc {
    fn default() -> Self {
        Self {
            current: "0".into(), history: String::new(),
            prev: None, op: None, just_eq: false,
            memory: 0.0, mem_set: false, ans: 0.0,
            angle: AngleMode::Deg, shift: false, hyp: false,
            two_fn: None, two_a: 0.0, open_p: 0,
        }
    }
}

impl SciCalc {
    fn cur_f(&self) -> f64 { self.current.parse().unwrap_or(self.ans) }
    fn to_rad(&self, x: f64) -> f64 { if matches!(self.angle, AngleMode::Deg) { x*PI/180.0 } else { x } }
    fn from_rad(&self, x: f64) -> f64 { if matches!(self.angle, AngleMode::Deg) { x*180.0/PI } else { x } }

    fn fmt(v: f64) -> String {
        if v.is_nan()      { return "Error".into(); }
        if v.is_infinite() { return if v>0.0{"∞"}else{"−∞"}.into(); }
        if v.abs()>=1e13 || (v.abs()<1e-9 && v!=0.0) { return format!("{:.6e}",v); }
        let s = format!("{:.12}",v);
        let s = s.trim_end_matches('0').trim_end_matches('.');
        s.to_string()
    }

    fn factorial(n: u64) -> f64 {
        if n>170 { return f64::INFINITY; }
        (1..=n).map(|x| x as f64).product()
    }

    fn set_result(&mut self, v: f64, hist: String) {
        self.current = Self::fmt(v);
        self.history = hist;
        self.ans = if v.is_finite() { v } else { self.ans };
        self.prev = None; self.op = None; self.just_eq = true;
        self.two_fn = None; self.open_p = 0;
    }

    fn digit(&mut self, d: &str) {
        if self.just_eq {
            self.current = if d=="0"{"0"}else{d}.to_string();
            self.history = String::new(); self.just_eq = false;
            // keep op/prev for chaining if needed, but start fresh input
            if self.op.is_some() {
                self.history = format!("{} {}", Self::fmt(self.prev.unwrap_or(0.0)),
                    self.op.unwrap().sym());
            }
        } else {
            if self.current == "0" && d != "." { self.current = d.to_string(); }
            else { self.current.push_str(d); }
        }
        if let (Some(prev), Some(op)) = (self.prev, self.op) {
            self.history = format!("{} {} {}", Self::fmt(prev), op.sym(), self.current);
        }
    }

    fn dot(&mut self) {
        if self.just_eq { self.current = "0.".into(); self.just_eq = false; return; }
        if !self.current.contains('.') { self.current.push('.'); }
    }

    fn operator(&mut self, new_op: Op) {
        let cur = self.cur_f();
        if let (Some(prev), Some(op)) = (self.prev, self.op) {
            if !self.just_eq {
                let r = op.apply(prev, cur);
                self.prev = Some(if r.is_finite(){r}else{cur});
            } else {
                self.prev = Some(cur);
            }
        } else {
            self.prev = Some(cur);
        }
        self.op = Some(new_op);
        self.history = format!("{} {}", Self::fmt(self.prev.unwrap()), new_op.sym());
        self.just_eq = false;
    }

    fn equals(&mut self) {
        if let Some(two) = self.two_fn {
            let b = self.cur_f(); let a = self.two_a;
            let (r, lbl) = match two {
                TwoFn::Npr => (Self::factorial(a as u64)/Self::factorial((a-b) as u64),
                               format!("{}P{} =", Self::fmt(a), Self::fmt(b))),
                TwoFn::Ncr => (Self::factorial(a as u64)/(Self::factorial(b as u64)*Self::factorial((a-b) as u64)),
                               format!("{}C{} =", Self::fmt(a), Self::fmt(b))),
                TwoFn::Xrty => (a.powf(1.0/b), format!("{}√{} =", Self::fmt(b), Self::fmt(a))),
                TwoFn::Yx   => (a.powf(b), format!("{}^{} =", Self::fmt(a), Self::fmt(b))),
            };
            self.set_result(r, lbl); return;
        }
        if let (Some(prev), Some(op)) = (self.prev, self.op) {
            let b   = self.cur_f();
            let r   = op.apply(prev, b);
            let lbl = format!("{} {} {} =", Self::fmt(prev), op.sym(), Self::fmt(b));
            self.set_result(r, lbl);
        }
    }

    fn apply_fn(&mut self, r: f64, lbl: String) {
        if let (Some(prev), Some(op)) = (self.prev, self.op) {
            self.history = format!("{} {} {}", Self::fmt(prev), op.sym(), lbl);
            self.current = Self::fmt(r);
            self.just_eq = false;
        } else {
            self.set_result(r, format!("{} =", lbl));
        }
        self.shift = false; self.hyp = false;
    }

    fn press(&mut self, k: &str) {
        if self.current == "Error" && k != "AC" { return; }
        match k {
            "0"|"1"|"2"|"3"|"4"|"5"|"6"|"7"|"8"|"9" => self.digit(k),
            "." => self.dot(),
            "+" => self.operator(Op::Add),
            "−" => self.operator(Op::Sub),
            "×" => self.operator(Op::Mul),
            "÷" => self.operator(Op::Div),
            "mod" => self.operator(Op::Mod),
            "=" => self.equals(),
            "AC" => { *self = Self::default(); }
            "C"  => { self.current="0".into(); self.history.clear(); self.just_eq=false; }
            "⌫"  => {
                if self.just_eq { self.current="0".into(); self.just_eq=false; }
                else if self.current.len()>1 { self.current.pop(); }
                else { self.current="0".into(); }
            }
            "+/−" => {
                let v = -self.cur_f();
                self.current = Self::fmt(v);
                if let (Some(p),Some(op))=(self.prev,self.op){self.history=format!("{} {} {}",Self::fmt(p),op.sym(),self.current);}
            }
            "%" => {
                let v = self.cur_f()/100.0; self.current=Self::fmt(v);
                if let (Some(p),Some(op))=(self.prev,self.op){self.history=format!("{} {} {}",Self::fmt(p),op.sym(),self.current);}
                else{self.history=format!("{}% =",Self::fmt(v*100.0));}
            }
            // Trig
            "sin"|"cos"|"tan" => {
                let v = self.cur_f();
                let r = if self.hyp { match k {"sin"=>v.sinh(),"cos"=>v.cosh(),_=>v.tanh()} }
                        else { let rv=self.to_rad(v); match k {"sin"=>rv.sin(),"cos"=>rv.cos(),_=>rv.tan()} };
                let lbl = if self.hyp { format!("{}h({})",k,Self::fmt(v)) } else { format!("{}({})",k,Self::fmt(v)) };
                self.apply_fn(r,lbl);
            }
            "sin⁻¹"|"cos⁻¹"|"tan⁻¹" => {
                let v = self.cur_f();
                let (r, base) = if self.hyp { match k {
                    "sin⁻¹"=>(v.asinh(),"asinh"), "cos⁻¹"=>(v.acosh(),"acosh"), _=>(v.atanh(),"atanh") } }
                    else { let raw = match k { "sin⁻¹"=>v.asin(), "cos⁻¹"=>v.acos(), _=>v.atan() };
                           (self.from_rad(raw), match k {"sin⁻¹"=>"asin","cos⁻¹"=>"acos",_=>"atan"}) };
                self.apply_fn(r, format!("{}({})",base,Self::fmt(v)));
            }
            // Powers / roots
            "x²" => { let v=self.cur_f(); self.apply_fn(v*v, format!("({})²",Self::fmt(v))); }
            "x³" => { let v=self.cur_f(); self.apply_fn(v*v*v, format!("({})³",Self::fmt(v))); }
            "√"  => { let v=self.cur_f(); self.apply_fn(v.sqrt(), format!("√({})",Self::fmt(v))); }
            "∛"  => { let v=self.cur_f(); self.apply_fn(v.cbrt(), format!("∛({})",Self::fmt(v))); }
            "eˣ" => { let v=self.cur_f(); self.apply_fn(v.exp(), format!("e^{}",Self::fmt(v))); }
            "10ˣ"=> { let v=self.cur_f(); self.apply_fn(10f64.powf(v), format!("10^{}",Self::fmt(v))); }
            "ln" => { let v=self.cur_f(); self.apply_fn(v.ln(), format!("ln({})",Self::fmt(v))); }
            "log"=> { let v=self.cur_f(); self.apply_fn(v.log10(), format!("log({})",Self::fmt(v))); }
            "1/x"=> { let v=self.cur_f(); self.apply_fn(if v!=0.0{1.0/v}else{f64::NAN}, format!("1/({})",Self::fmt(v))); }
            "|x|"=> { let v=self.cur_f(); self.apply_fn(v.abs(), format!("|{}|",Self::fmt(v))); }
            "x!" => { let v=self.cur_f(); self.apply_fn(Self::factorial(v as u64), format!("{}!",Self::fmt(v))); }
            "π"  => { self.apply_fn(PI, "π".into()); }
            "e"  => { self.apply_fn(E, "e".into()); }
            "Ran#"=>{ let v=rand_f64(); self.apply_fn(v, "Ran#".into()); }
            // Two-arg setup
            "yˣ" => { self.two_fn=Some(TwoFn::Yx); self.two_a=self.cur_f(); self.history=format!("{}^",Self::fmt(self.two_a)); self.operator(Op::Pow); }
            "ˣ√y"=> { self.two_fn=Some(TwoFn::Xrty); self.two_a=self.cur_f(); self.history=format!("{}ˣ√",Self::fmt(self.two_a)); self.current="0".into(); self.just_eq=false; }
            "nPr"=> { self.two_fn=Some(TwoFn::Npr); self.two_a=self.cur_f(); self.history=format!("{}P",Self::fmt(self.two_a)); self.current="0".into(); self.just_eq=false; }
            "nCr"=> { self.two_fn=Some(TwoFn::Ncr); self.two_a=self.cur_f(); self.history=format!("{}C",Self::fmt(self.two_a)); self.current="0".into(); self.just_eq=false; }
            // Memory
            "MC" => { self.memory=0.0; self.mem_set=false; }
            "MR" => { let v=self.memory; let c=self.current.clone(); self.current=Self::fmt(v); if self.op.is_some(){self.history.push_str(&format!(" {}",Self::fmt(v)));} }
            "M+" => { self.memory+=self.cur_f(); self.mem_set=true; }
            "M−" => { self.memory-=self.cur_f(); self.mem_set=self.memory!=0.0; }
            "ANS"=> { let v=self.ans; self.current=Self::fmt(v); if let (Some(p),Some(op))=(self.prev,self.op){ self.history=format!("{} {} Ans",Self::fmt(p),op.sym());} else {self.history="Ans".into();} }
            // Angle / hyp / shift
            "DEG/RAD" => { self.angle=match self.angle{AngleMode::Deg=>AngleMode::Rad,AngleMode::Rad=>AngleMode::Deg}; }
            "HYP"     => { self.hyp=!self.hyp; }
            "SHIFT"   => { self.shift=!self.shift; }
            _ => {}
        }
    }

    fn ac_label(&self) -> &str { if self.current!="0"||!self.history.is_empty(){"C"}else{"AC"} }
    fn angle_label(&self) -> &str { match self.angle{AngleMode::Deg=>"DEG",AngleMode::Rad=>"RAD"} }
}

// ══════════════════════════════════════════════════════════════════════════════
//  FINANCIAL STATE  (same logic as before, compacted)
// ══════════════════════════════════════════════════════════════════════════════
#[derive(Default)]
struct FinCalc {
    current: String,
    history: String,
    tvm: Tvm,
    second: bool,
    last_tvm: Option<&'static str>,
    pending_op: Option<Op>,
    prev: f64,
    just_eq: bool,
    cf_flows: Vec<(f64, u32)>,
    bgn: bool,
    py: f64,
    mem: f64,
}

#[derive(Default)]
struct Tvm { n:f64,iy:f64,pv:f64,pmt:f64,fv:f64 }

impl Tvm {
    fn get(&self, k:&str)->f64{match k{"N"=>self.n,"IY"=>self.iy,"PV"=>self.pv,"PMT"=>self.pmt,_=>self.fv}}
    fn set(&mut self,k:&str,v:f64){match k{"N"=>self.n=v,"IY"=>self.iy=v,"PV"=>self.pv=v,"PMT"=>self.pmt=v,_=>self.fv=v}}
    fn solve(&mut self, unknown:&str, py:f64, bgn:bool) -> f64 {
        let (n,iy,pv,pmt,fv)=(self.n,self.iy,self.pv,self.pmt,self.fv);
        let i=iy/100.0/py.max(1.0); let typ=if bgn{1.0}else{0.0};
        let r = match unknown {
            "N" => if i==0.0{if pmt!=0.0{-(pv+fv)/pmt}else{f64::NAN}}else{let a=pmt*(1.0+i*typ)-fv*i;let b=pmt*(1.0+i*typ)+pv*i;if b==0.0||a/b<=0.0{f64::NAN}else{(a/b).ln()/(1.0+i).ln()}},
            "IY" => {
                let mut r=0.1/py.max(1.0);
                for _ in 0..200{let r1=1.0+r;let rn=r1.powf(n);if !rn.is_finite(){break;}
                    let fv_=pv*rn+pmt*(1.0+r*typ)*(rn-1.0)/r+fv;
                    let df=n*pv*r1.powf(n-1.0)+pmt*(1.0+r*typ)*(n*r1.powf(n-1.0)*r-(rn-1.0))/(r*r)+pmt*typ*(rn-1.0)/r;
                    if df==0.0{break;}let nr=r-fv_/df;if(nr-r).abs()<1e-12{r=nr;break;}r=nr;}
                r*py.max(1.0)*100.0
            },
            "PV" => if i==0.0{-(fv+pmt*n)}else{let rn=(1.0+i).powf(n);-(fv/rn+pmt*(1.0+i*typ)*(1.0-1.0/rn)/i)},
            "PMT"=> if i==0.0{-(pv+fv)/n}else{let rn=(1.0+i).powf(n);-(pv*rn+fv)*i/((1.0+i*typ)*(rn-1.0))},
            "FV" => if i==0.0{-(pv+pmt*n)}else{let rn=(1.0+i).powf(n);-(pv*rn+pmt*(1.0+i*typ)*(rn-1.0)/i)},
            _ => f64::NAN,
        };
        self.set(unknown, r); r
    }
}

impl FinCalc {
    fn new() -> Self { let mut s=Self::default(); s.current="0".into(); s.py=1.0; s.cf_flows=vec![(0.0,1)]; s }
    fn cur_f(&self)->f64{self.current.parse().unwrap_or(0.0)}
    fn set_disp(&mut self,v:f64,h:&str){self.current=fmt(v);self.history=h.to_string();self.just_eq=true;}
    fn npv(&self)->f64{let mut npv=self.cf_flows[0].0;let mut p=1i32;for (cf,freq) in &self.cf_flows[1..]{for _ in 0..*freq{npv+=cf/(1.0+self.tvm.iy/100.0).powi(p);p+=1;}}npv}
    fn irr(&self)->f64{let mut lo=-0.9999f64;let mut hi=10.0;for _ in 0..300{let m=(lo+hi)/2.0;let npv=self.npv_at(m);if npv.abs()<1e-8{return m*100.0;}if npv>0.0{lo=m;}else{hi=m;}}(lo+hi)/2.0*100.0}
    fn npv_at(&self,r:f64)->f64{let mut npv=self.cf_flows[0].0;let mut p=1i32;for (cf,freq) in &self.cf_flows[1..]{for _ in 0..*freq{npv+=cf/(1.0+r).powi(p);p+=1;}}npv}

    fn press(&mut self, k:&str) {
        if self.current=="Error"&&k!="CE"{return;}
        match k {
            "0"|"1"|"2"|"3"|"4"|"5"|"6"|"7"|"8"|"9" => {
                if self.just_eq{self.current=k.to_string();self.history=String::new();self.just_eq=false;}
                else if self.current=="0"{self.current=k.to_string();}
                else{self.current.push_str(k);}
            }
            "." => {if !self.current.contains('.'){ self.current.push('.'); }}
            "+"|"−"|"×"|"÷" => {
                let op=match k{"+"=>Op::Add,"−"=>Op::Sub,"×"=>Op::Mul,_=>Op::Div};
                let c=self.cur_f();
                if let Some(po)=self.pending_op{if !self.just_eq{let r=po.apply(self.prev,c);self.prev=if r.is_finite(){r}else{c};}else{self.prev=c;}}else{self.prev=c;}
                self.pending_op=Some(op);self.history=format!("{} {}",fmt(self.prev),op.sym());self.just_eq=false;
            }
            "=" => {
                if let Some(op)=self.pending_op{let b=self.cur_f();let r=op.apply(self.prev,b);self.history=format!("{} {} {} =",fmt(self.prev),op.sym(),fmt(b));self.current=fmt(r);self.pending_op=None;self.just_eq=true;}
            }
            "CE"|"C" => {self.current="0".into();self.history.clear();self.just_eq=false;}
            "+/−" => {let v=-self.cur_f();self.current=fmt(v);}
            "N"|"IY"|"PV"|"PMT"|"FV" => {
                let val=self.cur_f();self.tvm.set(k,val);self.last_tvm=Some(match k{"N"=>"N","IY"=>"IY","PV"=>"PV","PMT"=>"PMT",_=>"FV"});
                self.set_disp(self.tvm.get(k),&format!("{} =",k));
            }
            "CPT" => { if let Some(key)=self.last_tvm{let r=self.tvm.solve(key,self.py,self.bgn);self.set_disp(r,&format!("{} = (CPT)",key));} }
            "BGN" => {self.bgn=!self.bgn;self.history=if self.bgn{"BGN mode"} else{"END mode"}.to_string();}
            "P/Y" => {self.py=self.cur_f().max(1.0);self.set_disp(self.py,"P/Y =");}
            "CLR TVM" => {self.tvm=Tvm::default();self.set_disp(0.0,"TVM Cleared");}
            "NPV" => {let v=self.npv();self.set_disp(v,"NPV =");}
            "IRR" => {let v=self.irr();self.set_disp(v,"IRR% =");}
            "+CF"=> {self.cf_flows.push((0.0,1));}
            "−CF"=> {if self.cf_flows.len()>1{self.cf_flows.pop();}}
            "STO"=> {self.mem=self.cur_f();self.history="STO".into();}
            "RCL"=> {self.current=fmt(self.mem);self.history="RCL".into();}
            _ => {}
        }
    }
}

// ══════════════════════════════════════════════════════════════════════════════
//  GRAPHING STATE
// ══════════════════════════════════════════════════════════════════════════════
struct GraphCalc {
    fns:    Vec<(String, bool, Color32)>,
    xmin:f64,xmax:f64,ymin:f64,ymax:f64,
    info:   String,
}
impl Default for GraphCalc {
    fn default() -> Self {
        Self { fns:vec![(String::new(),true,BTN_OP)], xmin:-10.0,xmax:10.0,ymin:-10.0,ymax:10.0, info:String::new() }
    }
}

impl GraphCalc {
    fn eval(&self, idx:usize, x:f64) -> f64 {
        eval_with_x(&self.fns[idx].0, x)
    }
    fn find_zero(&self, idx:usize) -> Option<f64> {
        let (a,b)=(self.xmin,self.xmax); let dx=(b-a)/2000.0;
        for i in 0..2000 {
            let (x1,x2)=(a+i as f64*dx, a+(i+1)as f64*dx);
            let (y1,y2)=(self.eval(idx,x1),self.eval(idx,x2));
            if !y1.is_finite()||!y2.is_finite() {continue;}
            if y1*y2<=0.0 {
                let (mut lo,mut hi)=(x1,x2);
                for _ in 0..80 {let m=(lo+hi)/2.0;let ym=self.eval(idx,m);if ym.abs()<1e-12{return Some(m);}if ym*self.eval(idx,lo)<0.0{hi=m;}else{lo=m;}}
                return Some((lo+hi)/2.0);
            }
        } None
    }
    fn extremum(&self,idx:usize,find_min:bool)->(f64,f64){
        let dx=(self.xmax-self.xmin)/2000.0;let mut bx=self.xmin;let mut by=self.eval(idx,self.xmin);
        for i in 1..=2000{let x=self.xmin+i as f64*dx;let y=self.eval(idx,x);if !y.is_finite(){continue;}if if find_min{y<by}else{y>by}{bx=x;by=y;}}
        (bx,by)
    }
    fn integral(&self,idx:usize)->f64{
        let n=2000;let h=(self.xmax-self.xmin)/n as f64;
        let mut s=self.eval(idx,self.xmin)+self.eval(idx,self.xmax);
        for i in 1..n{let y=self.eval(idx,self.xmin+i as f64*h);if y.is_finite(){s+=if i%2==0{2.0}else{4.0}*y;}}
        s*h/3.0
    }
}

// ══════════════════════════════════════════════════════════════════════════════
//  APP
// ══════════════════════════════════════════════════════════════════════════════
struct App { mode:Mode, sci:SciCalc, fin:FinCalc, graph:GraphCalc }
impl Default for App {
    fn default() -> Self { Self { mode:Mode::Scientific, sci:SciCalc::default(), fin:FinCalc::new(), graph:GraphCalc::default() } }
}

// Rounded rect button helper
fn calc_btn(ui: &mut egui::Ui, label: &str, size: Vec2, bg: Color32, fg: Color32) -> bool {
    let (rect, resp) = ui.allocate_exact_size(size, egui::Sense::click());
    let hover = resp.hovered();
    let pressed = resp.is_pointer_button_down_on();
    let col = if pressed { bg.linear_multiply(0.75) } else if hover { bg.linear_multiply(1.2) } else { bg };
    let rounding = Rounding::same(size.x.min(size.y) / 2.2);  // ~circular
    ui.painter().rect_filled(rect, rounding, col);
    ui.painter().text(rect.center(), Align2::CENTER_CENTER, label,
        FontId::new(size.y * 0.38, FontFamily::Proportional), fg);
    resp.clicked()
}

fn small_label(ui:&mut egui::Ui, text:&str, color:Color32){
    ui.label(egui::RichText::new(text).size(11.0).color(color));
}

impl eframe::App for App {
    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        // Pure black background
        ctx.set_visuals({
            let mut v=egui::Visuals::dark();
            v.panel_fill=BLACK; v.window_fill=BLACK;
            v.override_text_color=Some(WHITE);
            v
        });

        egui::TopBottomPanel::top("tabs")
            .frame(Frame::none().fill(BLACK).inner_margin(Margin::symmetric(12.0,10.0)))
            .show(ctx, |ui| {
                ui.horizontal(|ui| {
                    for (label, m) in [("Scientific",Mode::Scientific),("Financial",Mode::Financial),("Graphing",Mode::Graphing)] {
                        let active = self.mode == m;
                        let bg = if active { BTN_OP } else { Color32::from_rgb(28,28,30) };
                        let fg = if active { WHITE } else { Color32::from_rgb(140,140,140) };
                        let btn_w = (ctx.available_rect().width()-36.0)/3.0;
                        if calc_btn(ui, label, vec2(btn_w, 34.0), bg, fg) { self.mode = m; }
                        ui.add_space(4.0);
                    }
                });
            });

        egui::CentralPanel::default()
            .frame(Frame::none().fill(BLACK))
            .show(ctx, |ui| {
                match self.mode {
                    Mode::Scientific => self.ui_sci(ui),
                    Mode::Financial  => self.ui_fin(ui),
                    Mode::Graphing   => self.ui_graph(ui),
                }
            });
    }
}

// ── Scientific UI ────────────────────────────────────────────────────────────
impl App {
    fn ui_sci(&mut self, ui: &mut egui::Ui) {
        let w = ui.available_width();
        let cols = 6;
        let gap  = 8.0;
        let bw   = (w - gap * (cols as f32 + 1.0)) / cols as f32;
        let bh   = bw; // circular

        // Display
        Frame::none().fill(DARK_BG).inner_margin(Margin{left:16.0,right:16.0,top:8.0,bottom:12.0})
            .show(ui, |ui| {
                ui.set_min_width(w);
                // indicators
                ui.horizontal(|ui| {
                    small_label(ui, self.sci.angle_label(), BTN_OP);
                    if self.sci.shift { small_label(ui, "SHIFT", BTN_OP); }
                    if self.sci.hyp   { small_label(ui, "HYP", Color32::from_rgb(48,209,88)); }
                    if self.sci.mem_set { small_label(ui, "M", Color32::YELLOW); }
                });
                ui.add_space(2.0);
                // history
                let hist = self.sci.history.clone();
                ui.with_layout(Layout::right_to_left(Align::Min), |ui|{
                    ui.label(egui::RichText::new(&hist).size(14.0).color(HIST_COL));
                });
                // current
                let cur  = self.sci.current.clone();
                let is_err = cur == "Error";
                let font_sz = if cur.len()>12{28.0}else if cur.len()>8{36.0}else{46.0};
                ui.with_layout(Layout::right_to_left(Align::Min), |ui|{
                    ui.label(egui::RichText::new(&cur).size(font_sz)
                        .color(if is_err{Color32::from_rgb(255,69,58)}else{WHITE})
                        .strong());
                });
            });

        ui.add_space(6.0);

        // Helper: emit one button, return key pressed (or None)
        // We'll build the grid manually
        let mut key_pressed: Option<String> = None;

        macro_rules! row {
            ($ui:expr, [$( ($label:expr, $bg:expr, $fg:expr, $k:expr) ),+]) => {{
                $ui.horizontal(|ui| {
                    ui.add_space(gap);
                    $(
                        if calc_btn(ui, $label, vec2(bw,bh), $bg, $fg) {
                            key_pressed = Some($k.to_string());
                        }
                        ui.add_space(gap);
                    )+
                });
            }};
        }

        let shift = self.sci.shift;

        // Row 1: shift, x²/√, x³/∛, yˣ/ˣ√y, eˣ/ln, 10ˣ/log
        let r1 = [
            (if shift{"2nd●"}else{"2nd"}, if shift{BTN_OP}else{BTN_SCI}, WHITE, "SHIFT"),
            (if shift{"√"}else{"x²"},   BTN_SCI, if shift{BTN_OP}else{WHITE}, if shift{"√"}else{"x²"}),
            (if shift{"∛"}else{"x³"},   BTN_SCI, if shift{BTN_OP}else{WHITE}, if shift{"∛"}else{"x³"}),
            (if shift{"ˣ√y"}else{"yˣ"}, BTN_SCI, if shift{BTN_OP}else{WHITE}, if shift{"ˣ√y"}else{"yˣ"}),
            (if shift{"ln"}else{"eˣ"},  BTN_SCI, if shift{BTN_OP}else{WHITE}, if shift{"ln"}else{"eˣ"}),
            (if shift{"log"}else{"10ˣ"},BTN_SCI, if shift{BTN_OP}else{WHITE}, if shift{"log"}else{"10ˣ"}),
        ];
        ui.horizontal(|ui|{
            ui.add_space(gap);
            for (lbl,bg,fg,k) in r1 {
                if calc_btn(ui,lbl,vec2(bw,bh),bg,fg){ key_pressed=Some(k.to_string()); }
                ui.add_space(gap);
            }
        });
        ui.add_space(gap);

        // Row 2: trig
        let r2 = [
            (if shift{"sin⁻¹"}else{"sin"}, BTN_SCI, if shift{BTN_OP}else{WHITE}, if shift{"sin⁻¹"}else{"sin"}),
            (if shift{"cos⁻¹"}else{"cos"}, BTN_SCI, if shift{BTN_OP}else{WHITE}, if shift{"cos⁻¹"}else{"cos"}),
            (if shift{"tan⁻¹"}else{"tan"}, BTN_SCI, if shift{BTN_OP}else{WHITE}, if shift{"tan⁻¹"}else{"tan"}),
            ("π",  BTN_SCI, WHITE, "π"),
            ("e",  BTN_SCI, WHITE, "e"),
            (if self.sci.hyp{"HYP●"}else{"HYP"}, if self.sci.hyp{BTN_OP}else{BTN_SCI}, WHITE, "HYP"),
        ];
        ui.horizontal(|ui|{ui.add_space(gap);for(lbl,bg,fg,k) in r2{if calc_btn(ui,lbl,vec2(bw,bh),bg,fg){key_pressed=Some(k.to_string());}ui.add_space(gap);}});
        ui.add_space(gap);

        // Row 3: misc
        let r3=[("x!",BTN_SCI,WHITE,"x!"),("nPr",BTN_SCI,WHITE,"nPr"),("nCr",BTN_SCI,WHITE,"nCr"),
                ("|x|",BTN_SCI,WHITE,"|x|"),("1/x",BTN_SCI,WHITE,"1/x"),("Ran#",BTN_SCI,WHITE,"Ran#")];
        ui.horizontal(|ui|{ui.add_space(gap);for(lbl,bg,fg,k) in r3{if calc_btn(ui,lbl,vec2(bw,bh),bg,fg){key_pressed=Some(k.to_string());}ui.add_space(gap);}});
        ui.add_space(gap);

        // Row 4: memory + angle
        let agl=self.sci.angle_label();
        let r4=[("MC",BTN_SCI,WHITE,"MC"),("MR",BTN_SCI,WHITE,"MR"),("M+",BTN_SCI,WHITE,"M+"),
                ("M−",BTN_SCI,WHITE,"M−"),("ANS",BTN_SCI,WHITE,"ANS"),(agl,BTN_SCI,BTN_OP,"DEG/RAD")];
        ui.horizontal(|ui|{ui.add_space(gap);for(lbl,bg,fg,k) in r4{if calc_btn(ui,lbl,vec2(bw,bh),bg,fg){key_pressed=Some(k.to_string());}ui.add_space(gap);}});
        ui.add_space(gap);

        // Row 5: clear, +/-, %, ⌫, (, )
        let ac=self.sci.ac_label();
        let r5=[(ac,BTN_FN,BLACK,"AC"),("+/−",BTN_FN,BLACK,"+/−"),("%",BTN_FN,BLACK,"%"),
                ("⌫",BTN_OP,WHITE,"⌫"),("(",BTN_SCI,WHITE,"("),(")",BTN_SCI,WHITE,")")];
        ui.horizontal(|ui|{ui.add_space(gap);for(lbl,bg,fg,k) in r5{if calc_btn(ui,lbl,vec2(bw,bh),bg,fg){key_pressed=Some(k.to_string());}ui.add_space(gap);}});
        ui.add_space(gap);

        // Rows 6-9: numpad + 2 extra operator cols
        let pending_op = self.sci.op;
        let numrows: &[&[(&str, Color32, Color32, &str)]] = &[
            &[("7",BTN_NUM,WHITE,"7"),("8",BTN_NUM,WHITE,"8"),("9",BTN_NUM,WHITE,"9"),
              ("÷",if matches!(pending_op,Some(Op::Div)){BTN_OP_SEL}else{BTN_OP},if matches!(pending_op,Some(Op::Div)){TEXT_OP_SEL}else{WHITE},"÷"),
              ("mod",BTN_SCI,WHITE,"mod"),("log₂",BTN_SCI,WHITE,"log")],
            &[("4",BTN_NUM,WHITE,"4"),("5",BTN_NUM,WHITE,"5"),("6",BTN_NUM,WHITE,"6"),
              ("×",if matches!(pending_op,Some(Op::Mul)){BTN_OP_SEL}else{BTN_OP},if matches!(pending_op,Some(Op::Mul)){TEXT_OP_SEL}else{WHITE},"×"),
              ("√x",BTN_SCI,WHITE,"√"),("ln",BTN_SCI,WHITE,"ln")],
            &[("1",BTN_NUM,WHITE,"1"),("2",BTN_NUM,WHITE,"2"),("3",BTN_NUM,WHITE,"3"),
              ("−",if matches!(pending_op,Some(Op::Sub)){BTN_OP_SEL}else{BTN_OP},if matches!(pending_op,Some(Op::Sub)){TEXT_OP_SEL}else{WHITE},"−"),
              ("log",BTN_SCI,WHITE,"log"),("x!",BTN_SCI,WHITE,"x!")],
        ];
        for row in numrows {
            ui.horizontal(|ui|{ui.add_space(gap);for&(lbl,bg,fg,k) in *row{if calc_btn(ui,lbl,vec2(bw,bh),bg,fg){key_pressed=Some(k.to_string());}ui.add_space(gap);}});
            ui.add_space(gap);
        }

        // Last row: 0(wide), ., +, =
        ui.horizontal(|ui|{
            ui.add_space(gap);
            let zero_w = bw*2.0+gap;
            let (rect,resp)=ui.allocate_exact_size(vec2(zero_w,bh),egui::Sense::click());
            let hover=resp.hovered();let pressed=resp.is_pointer_button_down_on();
            let col=if pressed{BTN_NUM.linear_multiply(0.75)}else if hover{BTN_NUM.linear_multiply(1.2)}else{BTN_NUM};
            ui.painter().rect_filled(rect,Rounding::same(bh/2.2),col);
            ui.painter().text(rect.left_center()+vec2(bh*0.5,0.0),Align2::CENTER_CENTER,"0",
                FontId::new(bh*0.38,FontFamily::Proportional),WHITE);
            if resp.clicked(){key_pressed=Some("0".to_string());}
            ui.add_space(gap);
            if calc_btn(ui,".",vec2(bw,bh),BTN_NUM,WHITE){key_pressed=Some(".".to_string());}
            ui.add_space(gap);
            let add_col=if matches!(pending_op,Some(Op::Add)){BTN_OP_SEL}else{BTN_OP};
            let add_fg=if matches!(pending_op,Some(Op::Add)){TEXT_OP_SEL}else{WHITE};
            if calc_btn(ui,"+",vec2(bw,bh),add_col,add_fg){key_pressed=Some("+".to_string());}
            ui.add_space(gap);
            if calc_btn(ui,"=",vec2(bw,bh),BTN_OP,WHITE){key_pressed=Some("=".to_string());}
            ui.add_space(gap);
        });

        if let Some(k) = key_pressed { self.sci.press(&k); }
    }
}

// ── Financial UI ─────────────────────────────────────────────────────────────
impl App {
    fn ui_fin(&mut self, ui: &mut egui::Ui) {
        let w = ui.available_width();
        let gap = 8.0;
        let bw  = (w - gap * 7.0) / 6.0;
        let bh  = bw.min(52.0);

        // Display
        Frame::none().fill(DARK_BG).inner_margin(Margin{left:16.0,right:16.0,top:8.0,bottom:12.0})
            .show(ui, |ui| {
                ui.set_min_width(w);
                ui.horizontal(|ui|{
                    let badge_col=Color32::from_rgb(52,199,89);
                    let mode_txt=if self.fin.bgn{"BGN"}else{"END"};
                    ui.label(egui::RichText::new(mode_txt).size(10.0).color(badge_col).strong());
                    if self.fin.second { ui.label(egui::RichText::new("2nd").size(10.0).color(BTN_OP).strong()); }
                });
                let hist=self.fin.history.clone();
                ui.with_layout(Layout::right_to_left(Align::Min),|ui|{
                    ui.label(egui::RichText::new(&hist).size(13.0).color(HIST_COL));
                });
                let cur=self.fin.current.clone();
                let font_sz=if cur.len()>12{28.0}else if cur.len()>8{36.0}else{46.0};
                ui.with_layout(Layout::right_to_left(Align::Min),|ui|{
                    ui.label(egui::RichText::new(&cur).size(font_sz).color(WHITE).strong());
                });
            });

        ui.add_space(6.0);
        let mut kp: Option<String> = None;

        macro_rules! fin_row {
            ($ui:expr, $cells:expr) => {{
                $ui.horizontal(|ui|{
                    ui.add_space(gap);
                    for &(lbl,bg,fg,k) in $cells.iter() {
                        if calc_btn(ui,lbl,vec2(bw,bh),bg,fg){ kp=Some(k.to_string()); }
                        ui.add_space(gap);
                    }
                });
                $ui.add_space(gap);
            }};
        }

        let s2 = self.fin.second;
        // Row 1: 2nd + TVM
        let r1 = [
            (if s2{"2nd●"}else{"2nd"}, if s2{BTN_OP_SEL}else{BTN_OP}, if s2{BTN_OP}else{WHITE}, "2ND"),
            ("N",   BTN_TVM, Color32::from_rgb(126,200,227), "N"),
            ("I/Y", BTN_TVM, Color32::from_rgb(126,200,227), "IY"),
            ("PV",  BTN_TVM, Color32::from_rgb(126,200,227), "PV"),
            ("PMT", BTN_TVM, Color32::from_rgb(126,200,227), "PMT"),
            ("FV",  BTN_TVM, Color32::from_rgb(126,200,227), "FV"),
        ];
        fin_row!(ui, r1);

        let r2 = [
            ("CPT",  BTN_CPT, Color32::from_rgb(95,218,128), "CPT"),
            ("CF",   BTN_SCI, WHITE, "CF"),
            ("NPV",  BTN_SCI, WHITE, "NPV"),
            ("IRR",  BTN_SCI, WHITE, "IRR"),
            ("STAT", BTN_SCI, WHITE, "STAT"),
            ("BGN",  if self.fin.bgn{BTN_OP}else{BTN_SCI}, WHITE, "BGN"),
        ];
        fin_row!(ui, r2);

        let r3 = [
            (self.fin.fin_ac(), BTN_FN, BLACK, "CE"),
            ("+/−", BTN_FN, BLACK, "+/−"),
            ("STO", BTN_SCI, WHITE, "STO"),
            ("RCL", BTN_SCI, WHITE, "RCL"),
            ("√x",  BTN_SCI, WHITE, "√"),
            ("ln",  BTN_SCI, WHITE, "ln"),
        ];
        fin_row!(ui, r3);

        // Numpad + ops
        let po=self.fin.pending_op;
        let nr:&[&[(&str,Color32,Color32,&str)]]=&[
            &[("7",BTN_NUM,WHITE,"7"),("8",BTN_NUM,WHITE,"8"),("9",BTN_NUM,WHITE,"9"),("÷",if matches!(po,Some(Op::Div)){BTN_OP_SEL}else{BTN_OP},if matches!(po,Some(Op::Div)){TEXT_OP_SEL}else{WHITE},"÷"),("1/x",BTN_SCI,WHITE,"1/x"),("yˣ",BTN_SCI,WHITE,"yˣ")],
            &[("4",BTN_NUM,WHITE,"4"),("5",BTN_NUM,WHITE,"5"),("6",BTN_NUM,WHITE,"6"),("×",if matches!(po,Some(Op::Mul)){BTN_OP_SEL}else{BTN_OP},if matches!(po,Some(Op::Mul)){TEXT_OP_SEL}else{WHITE},"×"),("P/Y",BTN_SCI,WHITE,"P/Y"),("CLR",BTN_SCI,WHITE,"CLR TVM")],
            &[("1",BTN_NUM,WHITE,"1"),("2",BTN_NUM,WHITE,"2"),("3",BTN_NUM,WHITE,"3"),("−",if matches!(po,Some(Op::Sub)){BTN_OP_SEL}else{BTN_OP},if matches!(po,Some(Op::Sub)){TEXT_OP_SEL}else{WHITE},"−"),("+CF",BTN_SCI,WHITE,"+CF"),("−CF",BTN_SCI,WHITE,"−CF")],
        ];
        for row in nr { fin_row!(ui, *row); }
        ui.horizontal(|ui|{
            ui.add_space(gap);
            let zw=bw*2.0+gap;
            let (rect,resp)=ui.allocate_exact_size(vec2(zw,bh),egui::Sense::click());
            let col=if resp.is_pointer_button_down_on(){BTN_NUM.linear_multiply(0.75)}else if resp.hovered(){BTN_NUM.linear_multiply(1.2)}else{BTN_NUM};
            ui.painter().rect_filled(rect,Rounding::same(bh/2.2),col);
            ui.painter().text(rect.left_center()+vec2(bh*0.5,0.0),Align2::CENTER_CENTER,"0",FontId::new(bh*0.38,FontFamily::Proportional),WHITE);
            if resp.clicked(){kp=Some("0".to_string());}
            ui.add_space(gap);
            if calc_btn(ui,".",vec2(bw,bh),BTN_NUM,WHITE){kp=Some(".".to_string());}
            ui.add_space(gap);
            let ac=if matches!(po,Some(Op::Add)){BTN_OP_SEL}else{BTN_OP};
            let af=if matches!(po,Some(Op::Add)){TEXT_OP_SEL}else{WHITE};
            if calc_btn(ui,"+",vec2(bw,bh),ac,af){kp=Some("+".to_string());}
            ui.add_space(gap);
            if calc_btn(ui,"=",vec2(bw,bh),BTN_OP,WHITE){kp=Some("=".to_string());}
            ui.add_space(gap);
        });
        ui.add_space(gap);

        // CF worksheet inline
        ui.separator();
        ui.add_space(4.0);
        ui.label(egui::RichText::new("Cash Flows").size(11.0).color(BTN_OP).strong());
        egui::ScrollArea::vertical().max_height(120.0).show(ui,|ui|{
            egui::Grid::new("cf").num_columns(3).spacing([6.0,3.0]).show(ui,|ui|{
                let n=self.fin.cf_flows.len();
                for i in 0..n {
                    let lbl=if i==0{"CF0".to_string()}else{format!("C{:02}",i)};
                    ui.label(egui::RichText::new(&lbl).size(10.0).color(HIST_COL));
                    let mut v=self.fin.cf_flows[i].0;
                    if ui.add(egui::DragValue::new(&mut v).speed(1.0).prefix("$").max_decimals(2)).changed(){self.fin.cf_flows[i].0=v;}
                    if i>0{let mut f=self.fin.cf_flows[i].1;if ui.add(egui::DragValue::new(&mut f).speed(1.0).clamp_range(1u32..=999u32).prefix("F=")).changed(){self.fin.cf_flows[i].1=f;}}else{ui.label("");}
                    ui.end_row();
                }
            });
        });

        if let Some(k)=kp {
            match k.as_str() {
                "2ND" => {self.fin.second=!self.fin.second;}
                "√"   => {let v=self.fin.cur_f();self.fin.set_disp(v.sqrt(),"√ =");}
                "ln"  => {let v=self.fin.cur_f();self.fin.set_disp(v.ln(),"ln =");}
                "yˣ"  => {self.fin.prev=self.fin.cur_f();self.fin.pending_op=Some(Op::Pow);self.fin.history=fmt(self.fin.prev)+" ^";}
                "IY"  => {let v=self.fin.cur_f();self.fin.tvm.iy=v;self.fin.last_tvm=Some("IY");self.fin.set_disp(v,"I/Y =");}
                "√"   => {let v=self.fin.cur_f();self.fin.set_disp(v.sqrt(),"√ =");}
                other => {self.fin.press(other);}
            }
        }
    }
}

// extra methods for FinCalc
impl FinCalc {
    fn fin_ac(&self) -> &str { if self.current != "0" || !self.history.is_empty() { "C" } else { "AC" } }
}

// ── Graphing UI ──────────────────────────────────────────────────────────────
impl App {
    fn ui_graph(&mut self, ui: &mut egui::Ui) {
        let colors = [BTN_OP, Color32::from_rgb(48,209,88), Color32::from_rgb(10,132,255),
                      Color32::from_rgb(255,55,95), Color32::from_rgb(191,90,242)];

        egui::SidePanel::left("graph_side")
            .resizable(true).default_width(220.0)
            .frame(Frame::none().fill(Color32::from_rgb(17,17,17)).inner_margin(Margin::same(10.0)))
            .show_inside(ui, |ui| {
                ui.label(egui::RichText::new("FUNCTIONS").size(10.0).color(BTN_OP).strong());
                ui.add_space(4.0);

                for i in 0..self.graph.fns.len() {
                    ui.horizontal(|ui|{
                        let mut en=self.graph.fns[i].1;
                        if ui.checkbox(&mut en,"").changed(){self.graph.fns[i].1=en;}
                        let c=self.graph.fns[i].2;
                        let(r,resp)=ui.allocate_exact_size(vec2(10.0,10.0),egui::Sense::hover());
                        ui.painter().circle_filled(r.center(),5.0,c);
                        ui.label(egui::RichText::new(format!("Y{}=",i+1)).size(11.0).color(HIST_COL));
                        ui.add(egui::TextEdit::singleline(&mut self.graph.fns[i].0)
                            .font(FontId::monospace(11.0)).desired_width(120.0));
                    });
                }
                ui.horizontal(|ui|{
                    if ui.small_button("+ Add").clicked() && self.graph.fns.len()<5 {
                        let i=self.graph.fns.len();
                        self.graph.fns.push((String::new(),true,colors[i%colors.len()]));
                    }
                    if ui.small_button("Clear").clicked(){
                        self.graph.fns=vec![(String::new(),true,colors[0])];
                    }
                });

                ui.separator();
                ui.label(egui::RichText::new("WINDOW").size(10.0).color(BTN_OP).strong());
                egui::Grid::new("wnd").num_columns(2).spacing([4.0,3.0]).show(ui,|ui|{
                    ui.label("Xmin"); ui.add(egui::DragValue::new(&mut self.graph.xmin).speed(0.1)); ui.end_row();
                    ui.label("Xmax"); ui.add(egui::DragValue::new(&mut self.graph.xmax).speed(0.1)); ui.end_row();
                    ui.label("Ymin"); ui.add(egui::DragValue::new(&mut self.graph.ymin).speed(0.1)); ui.end_row();
                    ui.label("Ymax"); ui.add(egui::DragValue::new(&mut self.graph.ymax).speed(0.1)); ui.end_row();
                });

                ui.separator();
                ui.label(egui::RichText::new("ANALYSIS").size(10.0).color(BTN_OP).strong());
                let fi=self.graph.fns.iter().position(|(e,en,_)|*en&&!e.trim().is_empty()).unwrap_or(0);
                egui::Grid::new("anal").num_columns(2).spacing([4.0,4.0]).show(ui,|ui|{
                    if ui.small_button("Zero").clicked(){
                        if let Some(x)=self.graph.find_zero(fi){self.graph.info=format!("Zero: x={:.6}",x);}
                        else{self.graph.info="No zero in window".into();}
                    }
                    if ui.small_button("Min").clicked(){
                        let(x,y)=self.graph.extremum(fi,true);
                        self.graph.info=format!("Min: ({:.5},{:.5})",x,y);
                    }
                    ui.end_row();
                    if ui.small_button("Max").clicked(){
                        let(x,y)=self.graph.extremum(fi,false);
                        self.graph.info=format!("Max: ({:.5},{:.5})",x,y);
                    }
                    if ui.small_button("∫f(x)dx").clicked(){
                        let v=self.graph.integral(fi);
                        self.graph.info=format!("∫[{:.2},{:.2}]={:.8}",self.graph.xmin,self.graph.xmax,v);
                    }
                    ui.end_row();
                    if ui.small_button("dy/dx").clicked(){
                        let x=(self.graph.xmin+self.graph.xmax)/2.0;
                        let h=(self.graph.xmax-self.graph.xmin)*1e-7;
                        let d=(self.graph.eval(fi,x+h)-self.graph.eval(fi,x-h))/(2.0*h);
                        self.graph.info=format!("dy/dx@{:.4}={:.8}",x,d);
                    }
                    if ui.small_button("Intersect").clicked(){
                        let en:Vec<_>=self.graph.fns.iter().enumerate().filter(|(_,(e,en,_))|*en&&!e.trim().is_empty()).collect();
                        if en.len()>=2{
                            let (i0,i1)=(en[0].0,en[1].0);
                            let diff=|x:f64|self.graph.eval(i0,x)-self.graph.eval(i1,x);
                            let dx=(self.graph.xmax-self.graph.xmin)/2000.0;
                            let mut found=None;
                            for i in 0..2000{let x1=self.graph.xmin+i as f64*dx;let x2=x1+dx;let d1=diff(x1);let d2=diff(x2);if d1.is_finite()&&d2.is_finite()&&d1*d2<=0.0{let(mut lo,mut hi)=(x1,x2);for _ in 0..80{let m=(lo+hi)/2.0;let dm=diff(m);if dm.abs()<1e-12{found=Some(m);break;}if dm*diff(lo)<0.0{hi=m;}else{lo=m;}}if found.is_none(){found=Some((lo+hi)/2.0);}break;}}
                            if let Some(x)=found{let y=self.graph.eval(i0,x);self.graph.info=format!("({:.6},{:.6})",x,y);}
                            else{self.graph.info="No intersection".into();}
                        } else {self.graph.info="Need 2+ functions".into();}
                    }
                    ui.end_row();
                });

                if !self.graph.info.is_empty() {
                    ui.add_space(4.0);
                    Frame::none().fill(Color32::from_rgb(10,10,10)).rounding(5.0).inner_margin(Margin::same(6.0))
                        .show(ui,|ui|{ui.label(egui::RichText::new(&self.graph.info).size(10.5).color(BTN_OP).monospace());});
                }
            });

        egui::CentralPanel::default()
            .frame(Frame::none().fill(Color32::from_rgb(10,10,10)))
            .show_inside(ui, |ui| {
                let rect=ui.available_rect_before_wrap();
                let (xmin,xmax,ymin,ymax)=(self.graph.xmin,self.graph.xmax,self.graph.ymin,self.graph.ymax);
                let w=rect.width() as f64;let h=rect.height() as f64;
                let to_x=|x:f64|(x-xmin)/(xmax-xmin)*w;
                let to_y=|y:f64|h-(y-ymin)/(ymax-ymin)*h;

                let plot=Plot::new("graph")
                    .allow_drag(true).allow_scroll(true).allow_zoom(true)
                    .include_x(xmin).include_x(xmax).include_y(ymin).include_y(ymax)
                    .x_axis_label("x").y_axis_label("y");

                plot.show(ui, |pui|{
                    for (i,(expr,enabled,color)) in self.graph.fns.iter().enumerate() {
                        if !enabled || expr.trim().is_empty() { continue; }
                        let fn_ = |x:f64| eval_with_x(expr,x);
                        let steps=800;
                        let dx=(xmax-xmin)/steps as f64;
                        let mut seg:Vec<[f64;2]>=Vec::new();
                        let mut prev_y:Option<f64>=None;
                        for j in 0..=steps {
                            let x=xmin+j as f64*dx;
                            let y=fn_(x);
                            if !y.is_finite(){
                                if !seg.is_empty(){pui.line(Line::new(PlotPoints::new(seg.clone())).color(*color).width(2.2));seg.clear();}
                                prev_y=None; continue;
                            }
                            if let Some(py)=prev_y{if(y-py).abs()>(ymax-ymin)*5.0{if !seg.is_empty(){pui.line(Line::new(PlotPoints::new(seg.clone())).color(*color).width(2.2));seg.clear();}prev_y=None;continue;}}
                            seg.push([x,y]); prev_y=Some(y);
                        }
                        if !seg.is_empty(){pui.line(Line::new(PlotPoints::new(seg)).color(*color).width(2.2));}
                    }
                });
            });
    }
}

// ══════════════════════════════════════════════════════════════════════════════
//  EXPRESSION EVALUATOR  (same recursive descent as before)
// ══════════════════════════════════════════════════════════════════════════════
fn eval_with_x(expr: &str, x: f64) -> f64 {
    let e = prep_expr(expr, x);
    eval_str(&e).unwrap_or(f64::NAN)
}

fn prep_expr(expr: &str, x: f64) -> String {
    let mut e = expr.to_lowercase();
    e = e.replace("pi", &PI.to_string());
    e = e.replace("exp(", "__exp(");
    e = e.replace(" e ", &format!(" {} ", E));
    e = e.replace("__exp(", "exp(");
    e = e.replace('x', &format!("({})", x));
    e = e.replace('^', "**");
    let bytes = e.as_bytes();
    let mut out = String::with_capacity(e.len() + 8);
    for i in 0..bytes.len() {
        let c = bytes[i] as char;
        out.push(c);
        if i + 1 < bytes.len() {
            let n = bytes[i+1] as char;
            if (c.is_ascii_digit() || c == ')') && (n == '(' || n.is_alphabetic()) { out.push('*'); }
        }
    }
    out
}

fn fmt(v: f64) -> String { SciCalc::fmt(v) }

fn eval_str(e: &str) -> Result<f64, ()> {
    let tokens = lex(e);
    let mut p = Prsr { t: tokens, pos: 0 };
    p.expr()
}

#[derive(Clone)] enum Tok { Num(f64), Op(char), LP, RP, Id(String), StarStar }
struct Prsr { t: Vec<Tok>, pos: usize }
impl Prsr {
    fn peek(&self)->Option<&Tok>{self.t.get(self.pos)}
    fn eat(&mut self)->Option<Tok>{let t=self.t.get(self.pos).cloned();self.pos+=1;t}
    fn expr(&mut self)->Result<f64,()>{self.add()}
    fn add(&mut self)->Result<f64,()>{let mut l=self.mul()?;loop{match self.peek(){Some(Tok::Op('+'))=>{self.eat();l+=self.mul()?;}Some(Tok::Op('-'))=>{self.eat();l-=self.mul()?;}_=>break,}}Ok(l)}
    fn mul(&mut self)->Result<f64,()>{let mut l=self.pow()?;loop{match self.peek(){Some(Tok::Op('*'))=>{self.eat();l*=self.pow()?;}Some(Tok::Op('/'))=>{self.eat();let r=self.pow()?;l/=r;}Some(Tok::Op('%'))=>{self.eat();let r=self.pow()?;l%=r;}_=>break,}}Ok(l)}
    fn pow(&mut self)->Result<f64,()>{let b=self.unary()?;if matches!(self.peek(),Some(Tok::StarStar)){self.eat();let e=self.pow()?;Ok(b.powf(e))}else{Ok(b)}}
    fn unary(&mut self)->Result<f64,()>{if matches!(self.peek(),Some(Tok::Op('-'))){self.eat();Ok(-self.primary()?)}else{if matches!(self.peek(),Some(Tok::Op('+'))){self.eat();}self.primary()}}
    fn primary(&mut self)->Result<f64,()>{
        match self.peek().cloned(){
            Some(Tok::Num(v))=>{self.eat();Ok(v)}
            Some(Tok::LP)=>{self.eat();let v=self.expr()?;if matches!(self.peek(),Some(Tok::RP)){self.eat();}Ok(v)}
            Some(Tok::Id(name))=>{self.eat();
                let name=name.to_lowercase();
                if name=="pi"{return Ok(PI);}if name=="e"{return Ok(E);}
                if matches!(self.peek(),Some(Tok::LP)){self.eat();let a=self.expr()?;
                    let b=if matches!(self.peek(),Some(Tok::Op(','))){self.eat();Some(self.expr()?)}else{None};
                    if matches!(self.peek(),Some(Tok::RP)){self.eat();}
                    Ok(apply_fn(&name,a,b))}else{Err(())}
            }
            _=>Err(())
        }
    }
}

fn lex(s:&str)->Vec<Tok>{
    let ch:Vec<char>=s.chars().collect();let mut i=0;let mut t=Vec::new();
    while i<ch.len(){match ch[i]{' '|'\t'=>{i+=1;}
        '('=>{t.push(Tok::LP);i+=1;}')'=> {t.push(Tok::RP);i+=1;}
        '+'|'-'|'/'|'%'=>{t.push(Tok::Op(ch[i]));i+=1;}
        '*'=>{if i+1<ch.len()&&ch[i+1]=='*'{t.push(Tok::StarStar);i+=2;}else{t.push(Tok::Op('*'));i+=1;}}
        '0'..='9'|'.'=>{let s2=i;while i<ch.len()&&(ch[i].is_ascii_digit()||ch[i]=='.'||ch[i]=='e'||ch[i]=='-'&&i>0&&ch[i-1]=='e'){i+=1;}
            let ns:String=ch[s2..i].iter().collect();t.push(Tok::Num(ns.parse().unwrap_or(f64::NAN)));}
        'a'..='z'|'A'..='Z'|'_'=>{let s2=i;while i<ch.len()&&(ch[i].is_alphanumeric()||ch[i]=='_'){i+=1;}
            let ns:String=ch[s2..i].iter().collect();t.push(Tok::Id(ns));}
        _=>{i+=1;}}}
    t
}

fn apply_fn(name:&str,a:f64,b:Option<f64>)->f64{
    match name{
        "sin"=>a.sin(),"cos"=>a.cos(),"tan"=>a.tan(),
        "asin"=>a.asin(),"acos"=>a.acos(),"atan"=>if let Some(y)=b{a.atan2(y)}else{a.atan()},
        "sinh"=>a.sinh(),"cosh"=>a.cosh(),"tanh"=>a.tanh(),
        "asinh"=>a.asinh(),"acosh"=>a.acosh(),"atanh"=>a.atanh(),
        "sqrt"=>a.sqrt(),"cbrt"=>a.cbrt(),"abs"=>a.abs(),
        "log"|"log10"=>a.log10(),"log2"=>a.log2(),"ln"=>a.ln(),"exp"=>a.exp(),
        "floor"=>a.floor(),"ceil"=>a.ceil(),"round"=>a.round(),"sign"|"signum"=>a.signum(),
        "min"=>if let Some(bb)=b{a.min(bb)}else{a},"max"=>if let Some(bb)=b{a.max(bb)}else{a},
        "pow"=>if let Some(e)=b{a.powf(e)}else{a},"mod"=>if let Some(bb)=b{a%bb}else{a},
        _=>f64::NAN,
    }
}

// ── RNG ─────────────────────────────────────────────────────────────────────
static RAND_STATE: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0xdeadbeefcafe1234u64);
fn rand_f64() -> f64 {
    let mut s = RAND_STATE.load(std::sync::atomic::Ordering::Relaxed);
    s ^= s << 13; s ^= s >> 7; s ^= s << 17;
    RAND_STATE.store(s, std::sync::atomic::Ordering::Relaxed);
    (s & 0x000FFFFFFFFFFFFFu64) as f64 / 0x000FFFFFFFFFFFFFu64 as f64
}
