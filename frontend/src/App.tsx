const API_URL = import.meta.env.VITE_API_URL
import { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";
import ForceGraph2D from "react-force-graph-2d";

/* ===========================
   Types
=========================== */
interface GraphNode { id: string; is_suspicious: boolean; suspicion_score: number;patterns: string[]; ring_id: string | null; community: number; x?: number; y?: number; }
interface GraphLink { source: string; target: string; amount: number; age_days: number; }
interface FraudRing { ring_id: string; pattern_type: string; risk_score: number; member_accounts: string[]; }
interface ApiResponse { graph: { nodes: GraphNode[]; links: GraphLink[]; }; fraud_rings: FraudRing[]; }

/* ===========================
   Animated Counter
=========================== */
function AnimatedCounter({ target, duration = 1800 }: { target: number; duration?: number }) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    let start: number;
    const step = (ts: number) => {
      if (!start) start = ts;
      const p = Math.min((ts - start) / duration, 1);
      const ease = 1 - Math.pow(1 - p, 4);
      setVal(Math.floor(ease * target));
      if (p < 1) requestAnimationFrame(step); else setVal(target);
    };
    requestAnimationFrame(step);
  }, [target, duration]);
  return <>{val.toLocaleString()}</>;
}

/* ===========================
   Sphere Canvas (Intro)
=========================== */
function SphereCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const W = 320, H = 320;
    canvas.width = W; canvas.height = H;
    const CX = W / 2, CY = H / 2, R = 110;
    const NODES = 88;
    let angle = 0, lastRed = 0, floatY = 0, floatDir = 1;

    const nodes = Array.from({ length: NODES }, (_, i) => {
      const phi = Math.acos(1 - 2 * (i + 0.5) / NODES);
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;
      return {
        ox: Math.sin(phi) * Math.cos(theta), oy: Math.cos(phi), oz: Math.sin(phi) * Math.sin(theta),
        pulse: Math.random() * Math.PI * 2, speed: 0.012 + Math.random() * 0.022, mix: Math.random(),
      };
    });

    const edges: [number, number][] = [];
    for (let i = 0; i < NODES; i++)
      for (let j = i + 1; j < NODES; j++) {
        const dx = nodes[i].ox - nodes[j].ox, dy = nodes[i].oy - nodes[j].oy, dz = nodes[i].oz - nodes[j].oz;
        if (dx * dx + dy * dy + dz * dz < 0.22) edges.push([i, j]);
      }

    const rings = [
      { nx: 0.3, ny: 1, nz: 0.2, spd: 0.005, r: R * 1.22, t: 0 },
      { nx: 0.9, ny: 0.2, nz: 0.4, spd: -0.007, r: R * 1.12, t: 1.8 },
      { nx: 0.1, ny: 0.5, nz: 0.85, spd: 0.004, r: R * 1.32, t: 3.5 },
    ];

    function blend(mix: number, alpha: number) {
      const r = Math.round(0 + 46 * mix), g = Math.round(255 + (139 - 255) * mix), b = Math.round(178 + (255 - 178) * mix);
      return `rgba(${r},${g},${b},${alpha})`;
    }

    function proj(x: number, y: number, z: number, ry: number, fy: number) {
      const c = Math.cos(ry), s = Math.sin(ry);
      const rx = x * c - z * s, rz = x * s + z * c;
      const ax = 0.28;
      const ry2 = y * Math.cos(ax) - rz * Math.sin(ax), rz2 = y * Math.sin(ax) + rz * Math.cos(ax);
      const p = 1 + rz2 * 0.18;
      return { sx: CX + rx * R * p, sy: CY - ry2 * R * p + fy, depth: rz2, scale: p };
    }

    let rafId: number;
    function draw(ts: number) {
      angle += 0.004;
      floatY += 0.012 * floatDir;
      if (Math.abs(floatY) > 6) floatDir *= -1;
      const isRed = ts - lastRed > 0 && ts - lastRed < 280;
      if (ts - lastRed > 4800 + Math.random() * 2200) lastRed = ts;

      ctx.clearRect(0, 0, W, H);

      // Inner glow
      const g0 = ctx.createRadialGradient(CX, CY, 0, CX, CY, R * 1.4);
      g0.addColorStop(0, isRed ? "rgba(255,59,59,0.08)" : "rgba(0,255,178,0.08)");
      g0.addColorStop(0.5, "rgba(46,139,255,0.05)"); g0.addColorStop(1, "transparent");
      ctx.fillStyle = g0; ctx.beginPath(); ctx.arc(CX, CY + floatY, R * 1.4, 0, Math.PI * 2); ctx.fill();

      // Orbital rings
      rings.forEach((ring) => {
        ring.t += ring.spd;
        const len = Math.sqrt(ring.nx ** 2 + ring.ny ** 2 + ring.nz ** 2);
        const nx = ring.nx / len, ny = ring.ny / len, nz = ring.nz / len;
        const tx = ny, ty = -nx; const tl = Math.sqrt(tx * tx + ty * ty) || 1;
        const utx = tx / tl, uty = ty / tl, utz = 0;
        const bx = ny * utz - nz * uty, by = nz * utx - nx * utz, bz = nx * uty - ny * utx;
        const sc = ring.r / R; const n = 72; const pts = [];
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + ring.t;
          const ca = Math.cos(a), sa = Math.sin(a);
          pts.push(proj((ca * utx + sa * bx) * sc, (ca * uty + sa * by) * sc, (ca * utz + sa * bz) * sc, angle, floatY));
        }
        ctx.beginPath(); pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.sx, p.sy) : ctx.lineTo(p.sx, p.sy));
        ctx.closePath();
        const colors = ["rgba(0,255,178,0.2)", "rgba(46,139,255,0.22)", "rgba(0,229,255,0.14)"];
        ctx.strokeStyle = colors[rings.indexOf(ring)]; ctx.lineWidth = 0.8; ctx.stroke();

        // Dot
        const da = Math.cos(ring.t), dsa = Math.sin(ring.t);
        const dp = proj((da * utx + dsa * bx) * sc, (da * uty + dsa * by) * sc, (da * utz + dsa * bz) * sc, angle, floatY);
        const dotColors = ["#00FFB2", "#2E8BFF", "#00E5FF"];
        const dc = dotColors[rings.indexOf(ring)];
        ctx.beginPath(); ctx.arc(dp.sx, dp.sy, 3, 0, Math.PI * 2); ctx.fillStyle = dc; ctx.fill();
        const gh = ctx.createRadialGradient(dp.sx, dp.sy, 0, dp.sx, dp.sy, 10);
        gh.addColorStop(0, dc + "60"); gh.addColorStop(1, "transparent");
        ctx.beginPath(); ctx.arc(dp.sx, dp.sy, 10, 0, Math.PI * 2); ctx.fillStyle = gh; ctx.fill();
      });

      // Edges
      for (const [i, j] of edges) {
        const a = nodes[i], b = nodes[j];
        const pa = proj(a.ox, a.oy, a.oz, angle, floatY), pb = proj(b.ox, b.oy, b.oz, angle, floatY);
        if (pa.depth < -0.4 && pb.depth < -0.4) continue;
        const d = (pa.depth + pb.depth) / 2, da = Math.max(0, (d + 1) / 2) * 0.28;
        ctx.strokeStyle = isRed && Math.random() < 0.08 ? `rgba(255,59,59,${da})` : blend((a.mix + b.mix) / 2, da);
        ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(pa.sx, pa.sy); ctx.lineTo(pb.sx, pb.sy); ctx.stroke();
      }

      // Equator
      const eq = [];
      for (let i = 0; i < 64; i++) { const a = (i / 64) * Math.PI * 2; eq.push(proj(Math.cos(a), 0, Math.sin(a), angle, floatY)); }
      ctx.beginPath(); eq.forEach((p, i) => i === 0 ? ctx.moveTo(p.sx, p.sy) : ctx.lineTo(p.sx, p.sy));
      ctx.closePath(); ctx.strokeStyle = "rgba(0,229,255,0.1)"; ctx.lineWidth = 0.9; ctx.stroke();

      // Nodes
      for (const n of nodes) {
        n.pulse += n.speed;
        const p = proj(n.ox, n.oy, n.oz, angle, floatY);
        if (p.depth < -0.55) continue;
        const da = Math.max(0, (p.depth + 1) / 2), pulse = (Math.sin(n.pulse) + 1) / 2;
        const nr = 1.6 * p.scale + pulse * 1.5, alpha = da * (0.45 + pulse * 0.55);
        const color = isRed && Math.random() < 0.1 ? `rgba(255,59,59,${alpha})` : blend(n.mix, alpha);
        const grd = ctx.createRadialGradient(p.sx, p.sy, 0, p.sx, p.sy, nr * 5);
        grd.addColorStop(0, blend(n.mix, alpha * 0.4)); grd.addColorStop(1, "transparent");
        ctx.beginPath(); ctx.arc(p.sx, p.sy, nr * 5, 0, Math.PI * 2); ctx.fillStyle = grd; ctx.fill();
        ctx.beginPath(); ctx.arc(p.sx, p.sy, nr, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
      }

      // Shadow
      const sh = ctx.createRadialGradient(CX, CY + R + floatY + 14, 0, CX, CY + R + floatY + 14, 90);
      sh.addColorStop(0, "rgba(0,255,178,0.12)"); sh.addColorStop(1, "transparent");
      ctx.fillStyle = sh; ctx.beginPath(); ctx.ellipse(CX, CY + R + floatY + 14, 90, 18, 0, 0, Math.PI * 2); ctx.fill();

      rafId = requestAnimationFrame(draw);
    }
    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, []);
  return <canvas ref={ref} style={{ filter: "drop-shadow(0 0 24px rgba(0,255,178,0.25))" }} />;
}

/* ===========================
   Particle Canvas (Dashboard BG)
=========================== */
function ParticleCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext("2d")!;
    const resize = () => { c.width = c.offsetWidth; c.height = c.offsetHeight; };
    resize(); window.addEventListener("resize", resize);
    type P = { x: number; y: number; vx: number; vy: number; size: number; alpha: number; pulse: number; isGreen: boolean; };
    const pts: P[] = Array.from({ length: 110 }, () => ({
      x: Math.random() * c.width, y: Math.random() * c.height,
      vx: (Math.random() - 0.5) * 0.45, vy: (Math.random() - 0.5) * 0.45,
      size: Math.random() * 1.8 + 0.4, alpha: Math.random() * 0.55 + 0.1,
      pulse: Math.random() * Math.PI * 2, isGreen: Math.random() < 0.4,
    }));
    let id: number;
    const draw = () => {
      ctx.clearRect(0, 0, c.width, c.height);
      pts.forEach(p => {
        p.pulse += 0.018; p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > c.width) p.vx *= -1;
        if (p.y < 0 || p.y > c.height) p.vy *= -1;
        const a = p.alpha * (0.65 + 0.35 * Math.sin(p.pulse));
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.isGreen ? `rgba(0,255,178,${a})` : `rgba(46,139,255,${a})`; ctx.fill();
      });
      for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
        const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y, d = Math.hypot(dx, dy);
        if (d < 125) {
          const mix = pts[i].isGreen && pts[j].isGreen ? "0,255,178" : "46,139,255";
          ctx.beginPath(); ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(pts[j].x, pts[j].y);
          ctx.strokeStyle = `rgba(${mix},${0.1 * (1 - d / 125)})`; ctx.lineWidth = 0.5; ctx.stroke();
        }
      }
      id = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(id); window.removeEventListener("resize", resize); };
  }, []);
  return <canvas ref={ref} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }} />;
}

/* ===========================
   Radar Ring (enhanced green+blue)
=========================== */
function RadarRing({ size = 120, color = "#00FFB2", speed = 3 }: { size?: number; color?: string; speed?: number }) {
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: `1px solid ${color}18`, animation: `spinCW ${speed * 1.5}s linear infinite` }} />
      <div style={{ position: "absolute", inset: 5, borderRadius: "50%", border: `1px solid ${color}30`, borderTopColor: color, animation: `spinCW ${speed}s linear infinite`, boxShadow: `0 0 10px ${color}50` }} />
      <div style={{ position: "absolute", inset: 12, borderRadius: "50%", border: `1px dashed ${color}22`, animation: `spinCCW ${speed * 1.2}s linear infinite` }} />
      <div style={{ position: "absolute", inset: 20, borderRadius: "50%", border: `1px solid rgba(46,139,255,0.2)`, borderBottomColor: "#2E8BFF", animation: `spinCW ${speed * 0.8}s linear infinite` }} />
      <div style={{ position: "absolute", inset: 28, borderRadius: "50%", border: `1px solid ${color}15`, borderLeftColor: color, animation: `spinCCW ${speed * 0.6}s linear infinite` }} />
      <div style={{
        position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
        width: 10, height: 10, borderRadius: "50%",
        background: `radial-gradient(circle, ${color}, #2E8BFF)`,
        boxShadow: `0 0 18px ${color}, 0 0 36px ${color}60`,
      }} />
    </div>
  );
}

/* ===========================
   Hex Background
=========================== */
function HexDeco() {
  const pts = (cx: number, cy: number, r: number) =>
    Array.from({ length: 6 }, (_, i) => { const a = (i * 60 - 30) * Math.PI / 180; return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`; }).join(" ");
  return (
    <svg style={{ position: "absolute", right: 0, top: "50%", transform: "translateY(-50%)", opacity: 0.04, pointerEvents: "none" }} width="360" height="360" viewBox="0 0 360 360">
      {Array.from({ length: 8 }, (_, row) => Array.from({ length: 8 }, (_, col) => (
        <polygon key={`${row}-${col}`} points={pts(col * 44 + (row % 2 ? 22 : 0) + 18, row * 38 + 20, 17)}
          fill="none" stroke={row % 2 === 0 ? "#00FFB2" : "#2E8BFF"} strokeWidth="0.7" />
      )))}
    </svg>
  );
}

/* ===========================
   Scanner Line
=========================== */
function ScanLine() {
  return (
    <div style={{ position: "absolute", left: 0, right: 0, height: 2, background: "linear-gradient(90deg, transparent, #00FFB2, #2E8BFF, #00FFB2, transparent)", opacity: 0.45, animation: "scanLine 5s ease-in-out infinite", pointerEvents: "none", zIndex: 2 }} />
  );
}

/* ===========================
   Live Alert Ticker
=========================== */
const LIVE_ALERTS = [
  { time: "14:23:01", msg: "Ring detected: 3-hop mule chain — ACC-0041 → ACC-8823 → ACC-0099", sev: "CRITICAL", color: "#FF3B3B" },
  { time: "14:21:45", msg: "Velocity anomaly: ACC-8823 processed 47 txns in 2 mins", sev: "HIGH", color: "#FF8C42" },
  { time: "14:18:30", msg: "New mule pattern: layering × 5 detected in cluster", sev: "HIGH", color: "#FF8C42" },
  { time: "14:12:11", msg: "Account cluster: 12 nodes linked via common IP subnet", sev: "MED", color: "#FFD166" },
  { time: "14:09:04", msg: "Source account flagged: structuring pattern below threshold", sev: "HIGH", color: "#FF8C42" },
  { time: "14:04:55", msg: "Destination account: rapid cash-out sequence detected", sev: "CRITICAL", color: "#FF3B3B" },
];

function LiveAlerts() {
  const [alerts, setAlerts] = useState(LIVE_ALERTS);
  const [newAlert, setNewAlert] = useState(false);
  useEffect(() => {
    const iv = setInterval(() => {
      setAlerts(prev => {
        const fresh = { time: new Date().toLocaleTimeString(), msg: `Auto-detected anomaly in node cluster ${Math.floor(Math.random() * 9000 + 1000)}`, sev: ["CRITICAL","HIGH","MED"][Math.floor(Math.random()*3)], color: ["#FF3B3B","#FF8C42","#FFD166"][Math.floor(Math.random()*3)] };
        setNewAlert(true); setTimeout(() => setNewAlert(false), 600);
        return [fresh, ...prev.slice(0, 7)];
      });
    }, 5000);
    return () => clearInterval(iv);
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 360, overflowY: "auto" }}>
      {alerts.map((a, i) => (
        <div key={i} style={{
          padding: "10px 14px",
          background: `rgba(${a.color === "#FF3B3B" ? "255,59,59" : a.color === "#FF8C42" ? "255,140,66" : "255,209,102"},0.04)`,
          border: `1px solid ${a.color}25`,
          borderLeft: `3px solid ${a.color}`,
          borderRadius: 6,
          animation: i === 0 && newAlert ? "alertSlide 0.4s ease" : undefined,
          transition: "all 0.3s ease",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <span style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--dim)" }}>{a.time}</span>
            <span style={{
              fontFamily: "var(--mono)", fontSize: 8, letterSpacing: "0.15em",
              padding: "2px 8px", borderRadius: 3,
              background: `${a.color}18`, color: a.color, border: `1px solid ${a.color}30`,
            }}>{a.sev}</span>
          </div>
          <div style={{ fontSize: "0.82rem", fontFamily: "var(--mono)", color: "var(--text)", lineHeight: 1.5 }}>{a.msg}</div>
        </div>
      ))}
    </div>
  );
}

/* ===========================
   Node Legend Card
=========================== */
function NodeLegend() {
  const types = [
    { label: "MULE ACCOUNT", color: "#FF3B3B", desc: "Money transfer intermediary", icon: "⬡" },
    { label: "SOURCE ACCOUNT", color: "#00FFB2", desc: "Origin of illicit funds", icon: "⬡" },
    { label: "DESTINATION", color: "#2E8BFF", desc: "Final fund recipient", icon: "⬡" },
    { label: "NORMAL ACCOUNT", color: "rgba(46,139,255,0.5)", desc: "No suspicious activity", icon: "⬡" },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
      {types.map((t, i) => (
        <div key={i} style={{
          padding: "12px 14px",
          background: `${t.color}08`,
          border: `1px solid ${t.color}25`,
          borderRadius: 8,
          display: "flex", alignItems: "center", gap: 10,
          transition: "all 0.25s ease",
        }}
          onMouseEnter={e => (e.currentTarget.style.background = `${t.color}12`)}
          onMouseLeave={e => (e.currentTarget.style.background = `${t.color}08`)}
        >
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: t.color, boxShadow: `0 0 8px ${t.color}`, flexShrink: 0 }} />
          <div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 9, letterSpacing: "0.15em", color: t.color, marginBottom: 2 }}>{t.label}</div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 8, color: "var(--dim)" }}>{t.desc}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ===========================
   Intro Screen
=========================== */
function IntroScreen({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState(0);
  const [countdown, setCountdown] = useState(5);
  const [pct, setPct] = useState(0);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 300);
    const t2 = setTimeout(() => setPhase(2), 900);
    const t3 = setTimeout(() => setPhase(3), 2400);
    return () => [t1, t2, t3].forEach(clearTimeout);
  }, []);

  useEffect(() => {
  if (phase < 3) return;

  const iv = setInterval(() => {
    setCountdown(prev => {
      if (prev <= 1) {
        clearInterval(iv);
        return 0;
      }
      return prev - 1;
    });

    setPct(p => Math.min(p + 20, 100));
  }, 1000);

  return () => clearInterval(iv);
}, [phase]);
useEffect(() => {
  if (countdown === 0) {
    onDone();
  }
}, [countdown, onDone]);


  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 999, overflow: "hidden",
      background: "radial-gradient(ellipse 90% 80% at 50% 50%, #0A1628 0%, #050A0F 65%)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      fontFamily: "var(--mono)",
    }}>
      {/* Grid */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        backgroundImage: "linear-gradient(rgba(0,255,178,0.022) 1px,transparent 1px),linear-gradient(90deg,rgba(0,255,178,0.022) 1px,transparent 1px)",
        backgroundSize: "54px 54px",
        maskImage: "radial-gradient(ellipse 75% 75% at 50% 50%,black 10%,transparent 100%)",
      }} />
      {/* Scanlines */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,255,178,0.007) 2px,rgba(0,255,178,0.007) 4px)" }} />
      {/* Scan beam */}
      <div style={{ position: "absolute", left: 0, right: 0, height: 1, background: "linear-gradient(90deg,transparent,rgba(0,255,178,0.15) 50%,transparent)", animation: "scanLine 5s linear infinite", pointerEvents: "none" }} />

      {/* Corner brackets */}
      {[{ top: 20, left: 20, bw: "2px 0 0 2px" }, { top: 20, right: 20, bw: "2px 2px 0 0" }, { bottom: 20, right: 20, bw: "0 2px 2px 0" }, { bottom: 20, left: 20, bw: "0 0 2px 2px" }].map((c, i) => (
        <div key={i} style={{ position: "absolute",   ...(c as { top?: number; bottom?: number; left?: number; right?: number }),width: 28, height: 28, borderWidth: c.bw, borderStyle: "solid", borderColor: "rgba(0,255,178,0.35)", animation: `cornerPulse 3s ${i * 0.5}s ease-in-out infinite` }} />
      ))}

      {/* Sphere */}
      <div style={{
        position: "relative", marginBottom: 36,
        opacity: phase >= 1 ? 1 : 0, transform: phase >= 1 ? "scale(1) translateY(0)" : "scale(0.6) translateY(30px)",
        transition: "opacity 1s ease, transform 1s cubic-bezier(0.16,1,0.3,1)",
      }}>
        {[420, 370, 320].map((s, i) => (
          <div key={i} style={{ position: "absolute", width: s, height: s, top: "50%", left: "50%", transform: "translate(-50%,-50%)", borderRadius: "50%", border: `1px solid rgba(${i===1?"46,139,255":"0,255,178"},${0.04 + i * 0.03})`, pointerEvents: "none" }} />
        ))}
        <SphereCanvas />
        <div style={{ position: "absolute", bottom: -18, left: "50%", transform: "translateX(-50%)", width: 180, height: 22, background: "radial-gradient(ellipse,rgba(0,255,178,0.18) 0%,transparent 70%)", filter: "blur(6px)" }} />
      </div>

      {/* Text */}
      <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, position: "relative", zIndex: 10 }}>
        {phase >= 2 && (
          <div style={{ fontSize: 10, letterSpacing: "0.55em", color: "#00FFB2", opacity: 0, transform: "translateY(12px)", animation: "fadeUp 0.5s 0s ease forwards" }}>
            WELCOME TO
          </div>
        )}

        {phase >= 2 && (
          <div style={{ position: "relative" }}>
            <div style={{ position: "absolute", inset: 0, fontFamily: "var(--display)", fontSize: "clamp(1.8rem,5vw,4.2rem)", fontWeight: 900, letterSpacing: "-0.025em", WebkitTextStroke: "1px rgba(0,255,178,0.2)", WebkitTextFillColor: "transparent", transform: "translate(-2px,1px)", opacity: 0, animation: "fadeUp 0.7s 0.1s ease forwards", whiteSpace: "nowrap" }}>MONEY MULE DETECTION</div>
            <div style={{ position: "absolute", inset: 0, fontFamily: "var(--display)", fontSize: "clamp(1.8rem,5vw,4.2rem)", fontWeight: 900, letterSpacing: "-0.025em", WebkitTextStroke: "1px rgba(46,139,255,0.2)", WebkitTextFillColor: "transparent", transform: "translate(2px,-1px)", opacity: 0, animation: "fadeUp 0.7s 0.1s ease forwards", whiteSpace: "nowrap" }}>MONEY MULE DETECTION</div>
            <div style={{
              fontFamily: "var(--display)", fontSize: "clamp(1.8rem,5vw,4.2rem)", fontWeight: 900, letterSpacing: "-0.025em",
              background: "linear-gradient(135deg,#00FFB2 0%,#00E5FF 45%,#2E8BFF 100%)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
              filter: "drop-shadow(0 0 22px rgba(0,255,178,0.4))",
              opacity: 0, transform: "translateY(14px) scale(0.97)",
              animation: "titleIn 0.7s 0.1s cubic-bezier(0.16,1,0.3,1) forwards",
              whiteSpace: "nowrap", position: "relative",
            }}>MONEY MULE DETECTION</div>
          </div>
        )}

        {phase >= 2 && (
          <div style={{ width: 120, height: 1, background: "linear-gradient(90deg,transparent,#00FFB2,#00E5FF,#2E8BFF,transparent)", opacity: 0, animation: "fadeUp 0.5s 0.75s ease forwards", margin: "6px auto" }} />
        )}

        {phase >= 2 && (
          <div style={{ fontSize: 11, letterSpacing: "0.2em", color: "var(--dim)", fontWeight: 300, opacity: 0, transform: "translateY(10px)", animation: "fadeUp 0.5s 0.85s ease forwards" }}>
            Graph-Based Financial Crime Intelligence Engine
          </div>
        )}

        {phase >= 2 && (
          <div style={{ display: "flex", gap: 20, marginTop: 6, fontSize: 9, letterSpacing: "0.2em", opacity: 0, animation: "fadeUp 0.5s 1.05s ease forwards" }}>
            {["GRAPH ENGINE", "FRAUD MODEL", "NETWORK"].map((s, i) => (
              <span key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#00FFB2", display: "inline-block", animation: `blink ${1 + i * 0.3}s step-end infinite` }} />
                <span style={{ color: "var(--dim)" }}>{s}</span>
                <span style={{ color: "#00FFB2" }}>OK</span>
              </span>
            ))}
          </div>
        )}

        {phase >= 3 && (
          <div style={{ marginTop: 14, width: 240, opacity: 0, animation: "fadeUp 0.5s 0.1s ease forwards" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "var(--dim)", marginBottom: 5, letterSpacing: "0.15em" }}>
              <span>AUTO-LAUNCHING IN {countdown}s</span><span>{pct}%</span>
            </div>
            <div style={{ height: 2, background: "rgba(255,255,255,0.05)", borderRadius: 1, overflow: "hidden" }}>
              <div style={{ height: "100%", borderRadius: 1, background: "linear-gradient(90deg,#00FFB2,#2E8BFF)", width: `${pct}%`, transition: "width 0.9s ease", boxShadow: "0 0 8px rgba(0,255,178,0.5)" }} />
            </div>
          </div>
        )}
      </div>

      {/* Status bar */}
      <div style={{ position: "absolute", bottom: 20, left: 0, right: 0, display: "flex", justifyContent: "space-between", padding: "0 28px", fontSize: 9, letterSpacing: "0.2em", color: "rgba(58,82,104,0.6)", opacity: phase >= 2 ? 1 : 0, transition: "opacity 0.5s 1.5s ease" }}>
        <span>MMD-SYSTEM v4.2.1</span>
        <span>NODES: 88 &nbsp;│&nbsp; EDGES: LIVE</span>
        <span>SECURE &nbsp;<span style={{ color: "#00FFB2", animation: "blink 1.5s step-end infinite" }}>■</span></span>
      </div>
    </div>
  );
}

/* ===========================
   Main App
=========================== */
function App() {
  const [showIntro, setShowIntro] = useState(true);
  const [introExit, setIntroExit] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadDone, setUploadDone] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [expandedRing, setExpandedRing] = useState<string | null>(null);
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const [showData, setShowData] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleIntroDone = useCallback(() => {
    setIntroExit(true);
    setTimeout(() => setShowIntro(false), 800);
  }, []);

  const handleUpload = async (): Promise<void> => {
    if (!file) { alert("Please select a file first"); return; }
    setLoading(true); setProgress(0); setUploadDone(false);
    const iv = setInterval(() => setProgress(p => { if (p >= 85) { clearInterval(iv); return 85; } return p + Math.random() * 11; }), 180);
    try {
      const fd = new FormData(); fd.append("file", file);
      const res = await axios.post<ApiResponse>(`${API_URL}/upload`, fd);
      console.log("BACKEND RESPONSE:", res.data);

      clearInterval(iv); setProgress(100); setUploadDone(true);
      setTimeout(() => { setData(res.data); setShowData(true); }, 800);
    } catch { clearInterval(iv); setProgress(0); }
    finally { setTimeout(() => setLoading(false), 900); }
  };

  const getRiskMeta = (s: number) =>
    s >= 0.7 ? { label: "CRITICAL", color: "#FF3B3B", bg: "rgba(255,59,59,0.08)" }
    : s >= 0.4 ? { label: "WARNING", color: "#FF8C42", bg: "rgba(255,140,66,0.08)" }
    : { label: "LOW", color: "#00FFB2", bg: "rgba(0,255,178,0.08)" };

  const totalAcc = data?.graph?.nodes?.length ?? 0;

const suspAcc =
  data?.graph?.nodes?.filter(n => n.is_suspicious).length ?? 0;

const rings = data?.fraud_rings?.length ?? 0;


  const handleDownload = () => {
    if (!data) return;
    const b = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    Object.assign(document.createElement("a"), { href: URL.createObjectURL(b), download: "forensics_report.json" }).click();
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;600;700;900&family=Rajdhani:wght@400;500;600;700&family=Share+Tech+Mono&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body, #root {
  width: 100%;
  overflow-x: hidden;
}

body {
  margin: 0;
}
        :root {
          --bg: #050A0F; --bg2: #080E18;
          --green: #00FFB2; --green2: #00E5FF; --blue: #2E8BFF; --blue2: #58a8ff; --blue3: #1a5fd4;
          --red: #FF3B3B; --orange: #FF8C42;
          --card: rgba(6,14,28,0.88);
          --border: rgba(0,255,178,0.1); --border2: rgba(0,255,178,0.28);
          --border-b: rgba(46,139,255,0.14);
          --text: #d0eeff; --dim: rgba(160,210,255,0.42);
          --mono: 'Share Tech Mono', monospace;
          --display: 'Orbitron', sans-serif;
          --body: 'Rajdhani', sans-serif;
        }
        html { scroll-behavior: smooth; }
        body {
          background: var(--bg); font-family: var(--body); color: var(--text);
          min-height: 100vh; overflow-x: hidden;
          background-image:
            radial-gradient(ellipse 130% 65% at 50% 0%, rgba(0,255,178,0.04) 0%, rgba(46,139,255,0.04) 40%, transparent 70%),
            radial-gradient(ellipse 55% 45% at 85% 65%, rgba(255,59,59,0.03) 0%, transparent 50%);
        }
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-track { background: var(--bg); }
        ::-webkit-scrollbar-thumb { background: linear-gradient(#00FFB2, #2E8BFF); border-radius: 2px; }

        @keyframes spinCW { to { transform: rotate(360deg); } }
        @keyframes spinCCW { to { transform: rotate(-360deg); } }
        @keyframes fadeSlideUp { from { opacity: 0; transform: translateY(28px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fadeSlideDown { from { opacity: 0; transform: translateY(-18px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes glowPulseGreen { 0%,100% { box-shadow: 0 0 14px rgba(0,255,178,0.3); } 50% { box-shadow: 0 0 42px rgba(0,255,178,0.75), 0 0 80px rgba(46,139,255,0.2); } }
        @keyframes glowPulseBlue { 0%,100% { box-shadow: 0 0 10px rgba(46,139,255,0.3); } 50% { box-shadow: 0 0 32px rgba(46,139,255,0.7); } }
        @keyframes scanLine { 0% { top: 0%; opacity: 0; } 8% { opacity: 1; } 92% { opacity: 1; } 100% { top: 100%; opacity: 0; } }
        @keyframes shimmerH { from { left: -100%; } to { left: 160%; } }
        @keyframes textFlicker { 0%,89%,91%,96%,100% { opacity: 1; } 90% { opacity: 0.35; } 97% { opacity: 0.7; } }
        @keyframes orbFloat { 0%,100% { transform: translateY(0) scale(1); } 50% { transform: translateY(-22px) scale(1.04); } }
        @keyframes blink { 0%,100% { opacity: 1; } 50% { opacity: 0; } }
        @keyframes progressShimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
        @keyframes progressGlow { 0%,100% { box-shadow: 0 0 8px #00FFB2; } 50% { box-shadow: 0 0 22px #00FFB2, 0 0 44px rgba(0,255,178,0.35); } }
        @keyframes successPop { 0% { transform: scale(0) rotate(-180deg); opacity: 0; } 60% { transform: scale(1.25) rotate(12deg); } 100% { transform: scale(1) rotate(0deg); opacity: 1; } }
        @keyframes slideInRow { from { opacity: 0; transform: translateX(-18px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes ringExpand { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes countBounce { 0% { transform: scale(0.75); opacity: 0; } 65% { transform: scale(1.08); } 100% { transform: scale(1); opacity: 1; } }
        @keyframes dlRipple { to { transform: scale(4); opacity: 0; } }
        @keyframes navShimmer { 0% { left: -100%; } 100% { left: 200%; } }
        @keyframes heroTagPulse { 0%,100% { border-color: rgba(0,255,178,0.2); } 50% { border-color: rgba(0,255,178,0.5); } }
        @keyframes metricBarMove { 0% { background-position: 0% 0%; } 100% { background-position: 200% 0%; } }
        @keyframes cornerPulse { 0%,100% { opacity: 0.4; } 50% { opacity: 1; } }
        @keyframes fadeUp { to { opacity: 1; transform: translateY(0); } }
        @keyframes titleIn { to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes introExit { to { opacity: 0; transform: scale(0.96); } }
        @keyframes alertSlide { from { opacity: 0; transform: translateX(-10px); } to { opacity: 1; transform: translateX(0); } }

        .glitch { animation: textFlicker 6s infinite; position: relative; display: inline-block; }
        .glitch::before, .glitch::after { content: attr(data-text); position: absolute; top: 0; left: 0; width: 100%; }
        .glitch::before { color: #FF3B3B; clip-path: polygon(0 0,100% 0,100% 35%,0 35%); animation: glitchTop 4s infinite; opacity: 0; }
        .glitch::after { color: #00FFB2; clip-path: polygon(0 65%,100% 65%,100% 100%,0 100%); animation: glitchBot 4.5s infinite; opacity: 0; }
        @keyframes glitchTop { 0%,91%,100% { transform: translate(0); opacity: 0; } 92% { transform: translate(-4px,-2px); opacity: 0.85; } 94% { opacity: 0; } }
        @keyframes glitchBot { 0%,88%,100% { transform: translate(0); opacity: 0; } 89% { transform: translate(3px,2px); opacity: 0.8; } 91% { opacity: 0; } }

        .navbar {
          position: fixed; top: 0; left: 0; right: 0; z-index: 200;
          height: 66px; background: rgba(5,10,15,0.92); backdrop-filter: blur(28px);
          border-bottom: 1px solid var(--border);
          display: flex; align-items: center; justify-content: space-between; padding: 0 28px;
          animation: fadeSlideDown 0.7s ease forwards; overflow: hidden;
        }
        .nav-shimmer { position: absolute; top: 0; left: -100%; width: 55%; height: 100%; background: linear-gradient(90deg,transparent,rgba(0,255,178,0.04),rgba(46,139,255,0.04),transparent); animation: navShimmer 4s ease-in-out 1.5s infinite; }
        .nav-border-bottom { position: absolute; bottom: 0; left: 0; right: 0; height: 1px; background: linear-gradient(90deg,transparent,rgba(0,255,178,0.4),rgba(46,139,255,0.4),transparent); }
        .nav-left { display: flex; align-items: center; gap: 14px; }
        .nav-logo {
          width: 40px; height: 40px; border-radius: 10px;
          background: linear-gradient(135deg, #052a18, #00FFB2 50%, #2E8BFF);
          display: flex; align-items: center; justify-content: center;
          animation: glowPulseGreen 3.5s ease-in-out infinite;
          position: relative; overflow: hidden;
        }
        .nav-logo svg { width: 22px; height: 22px; }
        .nav-logo::after { content: ""; position: absolute; inset: 0; background: linear-gradient(135deg,rgba(255,255,255,0.18),transparent); }
        .nav-text-wrap .nt { font-family: var(--display); font-size: 12.5px; font-weight: 700; letter-spacing: 0.13em; background: linear-gradient(90deg,#00FFB2,#2E8BFF); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
        .nav-text-wrap .ns { font-family: var(--mono); font-size: 9px; color: var(--dim); letter-spacing: 0.18em; margin-top: 2px; }
        .nav-right { display: flex; align-items: center; gap: 18px; }
        .nav-meta { font-family: var(--mono); font-size: 10px; color: var(--dim); }
        .nav-meta span { color: var(--green); }
        .status-pill { display: flex; align-items: center; gap: 8px; background: rgba(0,255,178,0.06); border: 1px solid rgba(0,255,178,0.2); border-radius: 30px; padding: 7px 16px; font-family: var(--mono); font-size: 10px; color: var(--green); letter-spacing: 0.1em; }
        .s-ring { position: relative; width: 10px; height: 10px; }
        .s-ring::before { content: ""; position: absolute; inset: 0; border-radius: 50%; background: var(--green); box-shadow: 0 0 10px var(--green); animation: blink 1.8s infinite; }
        .s-ring::after { content: ""; position: absolute; inset: -4px; border-radius: 50%; border: 1px solid rgba(0,255,178,0.25); animation: spinCW 3.5s linear infinite; }

        .hero { position: relative; min-height: 92vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 100px 32px 70px; text-align: center; overflow: hidden; }
        .orb { position: absolute; border-radius: 50%; filter: blur(90px); pointer-events: none; }
        .orb-1 { width: 520px; height: 520px; background: rgba(0,255,178,0.06); top: -80px; left: -130px; animation: orbFloat 9s ease-in-out infinite; }
        .orb-2 { width: 380px; height: 380px; background: rgba(46,139,255,0.05); bottom: 20px; right: -80px; animation: orbFloat 11s ease-in-out 2s infinite reverse; }
        .orb-3 { width: 260px; height: 260px; background: rgba(0,229,255,0.03); top: 45%; right: 220px; animation: orbFloat 13s ease-in-out 1s infinite; }

        .hero-tag { display: inline-flex; align-items: center; gap: 10px; font-family: var(--mono); font-size: 10px; letter-spacing: 0.28em; color: var(--green); background: rgba(0,255,178,0.06); border: 1px solid rgba(0,255,178,0.22); border-radius: 30px; padding: 8px 20px; margin-bottom: 30px; animation: fadeSlideUp 0.65s ease 0.4s both, heroTagPulse 3s ease-in-out 1.5s infinite; }
        .tag-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--green); animation: blink 1.4s infinite; }

        .hero-h1 { font-family: var(--display); font-size: clamp(2.1rem,5.8vw,5.8rem); font-weight: 900; line-height: 1.05; letter-spacing: -0.01em; max-width: 940px; background: linear-gradient(140deg,#fff 0%,#00FFB2 30%,#00E5FF 55%,#2E8BFF 80%,#1660c8 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; animation: fadeSlideUp 0.7s ease 0.6s both; }
        .hero-sub { margin-top: 20px; font-family: var(--mono); font-size: 1.05rem; color: var(--dim); letter-spacing: 0.2em; animation: fadeSlideUp 0.7s ease 0.8s both; }
        .hero-sub em { color: var(--green2); font-style: normal; }
        .hero-cta { margin-top: 50px; display: flex; gap: 14px; justify-content: center; animation: fadeSlideUp 0.7s ease 1s both; flex-wrap: wrap; }
        .btn-hero { position: relative; overflow: hidden; padding: 17px 52px; border-radius: 12px; background: linear-gradient(135deg,#052a18,#00c47a,#2E8BFF); border: none; color: #fff; font-family: var(--display); font-size: 12px; font-weight: 700; letter-spacing: 0.14em; cursor: pointer; transition: all 0.35s ease; box-shadow: 0 0 28px rgba(0,255,178,0.3),0 4px 20px rgba(0,0,0,0.4); }
        .btn-hero:hover { transform: translateY(-4px) scale(1.02); box-shadow: 0 10px 48px rgba(0,255,178,0.5),0 0 100px rgba(46,139,255,0.12); }
        .btn-hero::after { content: ""; position: absolute; inset: 0; background: linear-gradient(135deg,rgba(255,255,255,0.14),transparent); border-radius: inherit; }
        .btn-shimmer { position: absolute; top: 0; left: -100%; width: 60%; height: 100%; background: linear-gradient(90deg,transparent,rgba(255,255,255,0.22),transparent); animation: shimmerH 2.5s ease-in-out 1.5s infinite; }

        .hero-stats { margin-top: 64px; display: flex; gap: 52px; justify-content: center; flex-wrap: wrap; animation: fadeSlideUp 0.7s ease 1.2s both; }
        .hstat { text-align: center; }
        .hstat-val { font-family: var(--display); font-size: 2.1rem; font-weight: 900; background: linear-gradient(135deg,var(--green),var(--blue)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; line-height: 1; }
        .hstat-lbl { font-family: var(--mono); font-size: 9px; color: var(--dim); letter-spacing: 0.22em; margin-top: 7px; }
        .hdiv { width: 1px; background: linear-gradient(#00FFB2,#2E8BFF); align-self: center; height: 48px; opacity: 0.3; }

        .section { max-width: 1300px; margin: 0 auto; padding: 0 28px 68px; }
        .sec-hd { display: flex; align-items: center; gap: 12px; margin-bottom: 22px; }
        .sec-num { font-family: var(--mono); font-size: 9px; color: var(--green); background: rgba(0,255,178,0.07); border: 1px solid rgba(0,255,178,0.18); border-radius: 6px; padding: 4px 10px; }
        .sec-name { font-family: var(--display); font-size: 12px; letter-spacing: 0.18em; background: linear-gradient(90deg,var(--green),var(--blue)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
        .sec-line { flex: 1; height: 1px; background: linear-gradient(90deg,rgba(0,255,178,0.3),rgba(46,139,255,0.3),transparent); }
        .sec-meta { font-family: var(--mono); font-size: 9px; color: var(--dim); }

        .card { background: var(--card); backdrop-filter: blur(22px); border: 1px solid var(--border); border-radius: 20px; position: relative; overflow: hidden; }
        .card::before { content: ""; position: absolute; top: 0; left: 20%; right: 20%; height: 1px; background: linear-gradient(90deg,transparent,rgba(0,255,178,0.3),rgba(46,139,255,0.3),transparent); }
        .cc { position: absolute; width: 18px; height: 18px; border-color: rgba(0,255,178,0.4); border-style: solid; animation: cornerPulse 3s ease-in-out infinite; }
        .cc.tl { top: 10px; left: 10px; border-width: 1px 0 0 1px; }
        .cc.tr { top: 10px; right: 10px; border-width: 1px 1px 0 0; border-color: rgba(46,139,255,0.4); }
        .cc.bl { bottom: 10px; left: 10px; border-width: 0 0 1px 1px; border-color: rgba(46,139,255,0.4); animation-delay: 1s; }
        .cc.br { bottom: 10px; right: 10px; border-width: 0 1px 1px 0; border-color: rgba(0,255,178,0.4); animation-delay: 0.5s; }

        .upload-section { max-width: 640px; margin: 0 auto 76px; padding: 0 28px; animation: fadeSlideUp 0.7s ease 0.15s both; }
        .dropzone { border: 2px dashed rgba(0,255,178,0.2); border-radius: 16px; padding: 54px 24px; text-align: center; cursor: pointer; transition: all 0.35s ease; position: relative; overflow: hidden; }
        .dropzone:hover, .dz-active { border-color: var(--green); background: rgba(0,255,178,0.03); box-shadow: 0 0 48px rgba(0,255,178,0.06) inset; }
        .dz-icon { font-size: 3.2rem; margin-bottom: 14px; display: block; transition: transform 0.4s ease; filter: drop-shadow(0 0 14px rgba(0,255,178,0.55)); }
        .dropzone:hover .dz-icon { transform: scale(1.18) translateY(-7px) rotate(6deg); }
        .dz-title { font-family: var(--display); font-size: 14px; letter-spacing: 0.08em; margin-bottom: 6px; }
        .dz-sub { font-family: var(--mono); font-size: 11px; color: var(--dim); }
        .file-chip { display: inline-flex; align-items: center; gap: 8px; margin-top: 14px; background: rgba(0,255,178,0.07); border: 1px solid rgba(0,255,178,0.22); border-radius: 8px; padding: 6px 14px; font-family: var(--mono); font-size: 11px; color: var(--green); }
        .prog-track { margin-top: 22px; height: 3px; background: rgba(255,255,255,0.04); border-radius: 3px; overflow: hidden; }
        .prog-fill { height: 100%; border-radius: 3px; transition: width 0.25s ease; background: linear-gradient(90deg,#052a18,#00FFB2,#00E5FF,#2E8BFF); background-size: 300% 100%; animation: progressGlow 1.5s ease-in-out infinite, progressShimmer 1.5s linear infinite; }
        .upload-btn-row { margin-top: 22px; }
        .btn-upload { width: 100%; padding: 15px; border-radius: 12px; background: linear-gradient(135deg,#052a18,#00c47a,#2E8BFF); border: none; color: #fff; font-family: var(--display); font-size: 12px; font-weight: 700; letter-spacing: 0.12em; cursor: pointer; transition: all 0.3s ease; position: relative; overflow: hidden; box-shadow: 0 4px 22px rgba(0,255,178,0.2); }
        .btn-upload:hover:not(:disabled) { transform: translateY(-3px); box-shadow: 0 10px 36px rgba(0,255,178,0.4); }
        .btn-upload:disabled { opacity: 0.48; cursor: not-allowed; transform: none; }
        .btn-upload::after { content: ""; position: absolute; inset: 0; background: linear-gradient(135deg,rgba(255,255,255,0.12),transparent); }
        .success-icon { font-size: 2.2rem; animation: successPop 0.65s ease forwards; display: inline-block; }

        .metrics-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 16px; }
        @media (max-width:1024px) { .metrics-grid { grid-template-columns: repeat(2,1fr); } }
        @media (max-width:480px) { .metrics-grid { grid-template-columns: 1fr; } }
        .metric-card { padding: 28px 24px; transition: all 0.35s ease; animation: fadeSlideUp 0.6s ease both; }
        .metric-card:hover { transform: translateY(-7px) scale(1.02); }
        .m-icon { width: 46px; height: 46px; border-radius: 11px; margin-bottom: 18px; display: flex; align-items: center; justify-content: center; font-size: 1.25rem; position: relative; }
        .m-icon .spin-ring { position: absolute; inset: -8px; border-radius: 50%; border: 1px solid; border-top-color: transparent; animation: spinCW 3s linear infinite; }
        .m-lbl { font-family: var(--mono); font-size: 9px; letter-spacing: 0.22em; color: var(--dim); text-transform: uppercase; margin-bottom: 9px; }
        .m-val { font-family: var(--display); font-size: 3.2rem; font-weight: 900; line-height: 1; animation: countBounce 0.6s ease both; }
        .m-suffix { font-size: 1.2rem; }
        .m-sub { font-family: var(--mono); font-size: 9px; color: var(--dim); margin-top: 9px; }
        .m-bar { height: 2px; border-radius: 2px; margin-top: 18px; overflow: hidden; background: rgba(255,255,255,0.04); }
        .m-bar-fill { height: 100%; border-radius: 2px; background-size: 200% 100%; animation: metricBarMove 2s linear infinite; }

        .graph-header { padding: 20px 24px; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
        .g-title { display: flex; align-items: center; gap: 14px; }
        .g-title-text { font-family: var(--display); font-size: 12px; letter-spacing: 0.12em; background: linear-gradient(90deg,var(--green),var(--blue)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
        .g-title-sub { font-family: var(--mono); font-size: 9px; color: var(--dim); margin-top: 3px; }
        .live-badge { display: flex; align-items: center; gap: 6px; font-family: var(--mono); font-size: 9px; color: var(--red); letter-spacing: 0.15em; }
        .live-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--red); animation: blink 1s infinite; }
        .legend { display: flex; gap: 18px; flex-wrap: wrap; }
        .leg-item { display: flex; align-items: center; gap: 7px; font-family: var(--mono); font-size: 10px; color: var(--dim); }
        .leg-dot { width: 9px; height: 9px; border-radius: 50%; }
        .graph-body { position: relative; height: 530px; background: radial-gradient(ellipse at 50% 50%,rgba(5,20,40,0.95) 0%,rgba(5,10,15,0.99) 100%); }
        .graph-label { position: absolute; z-index: 10; font-family: var(--mono); font-size: 9px; color: rgba(0,255,178,0.25); letter-spacing: 0.15em; pointer-events: none; }
        .graph-label.tl { top: 14px; left: 18px; }
        .graph-label.tr { top: 14px; right: 18px; text-align: right; }

        .table-outer { overflow: auto; max-height: 520px; border-radius: 20px; }
        .fraud-table { width: 100%; border-collapse: collapse; }
        .fraud-table thead { position: sticky; top: 0; z-index: 10; background: rgba(5,10,15,0.97); backdrop-filter: blur(12px); }
        .fraud-table th { padding: 14px 20px; text-align: left; font-family: var(--mono); font-size: 9px; letter-spacing: 0.22em; text-transform: uppercase; color: var(--dim); border-bottom: 1px solid var(--border); }
        .fraud-table td { padding: 14px 20px; border-bottom: 1px solid rgba(0,255,178,0.04); font-size: 0.88rem; transition: background 0.2s; }
        .tr-hover td { background: rgba(0,255,178,0.03) !important; }
        .row-animate { animation: slideInRow 0.4s ease both; }
        .ring-id { font-family: var(--mono); font-size: 11px; background: linear-gradient(90deg,var(--green),var(--blue)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
        .pat-pill { display: inline-block; border-radius: 6px; padding: 4px 12px; font-family: var(--mono); font-size: 10px; background: rgba(0,255,178,0.06); border: 1px solid rgba(0,255,178,0.18); color: var(--green); }
        .risk-badge { display: inline-flex; align-items: center; gap: 7px; border-radius: 8px; padding: 5px 12px; font-family: var(--mono); font-size: 10px; font-weight: 600; letter-spacing: 0.08em; }
        .risk-dot { width: 6px; height: 6px; border-radius: 50%; }
        .exp-btn { background: transparent; border: 1px solid rgba(0,255,178,0.2); border-radius: 7px; padding: 5px 12px; font-family: var(--mono); font-size: 10px; color: var(--dim); cursor: pointer; transition: all 0.25s; letter-spacing: 0.08em; }
        .exp-btn:hover { border-color: var(--green); color: var(--green); background: rgba(0,255,178,0.05); }
        .members-cell { background: rgba(5,10,18,0.9) !important; padding: 12px 20px 22px !important; }
        .members-in { animation: ringExpand 0.35s ease both; }
        .members-lbl { font-family: var(--mono); font-size: 9px; color: var(--dim); letter-spacing: 0.22em; margin-bottom: 10px; }
        .chips { display: flex; flex-wrap: wrap; gap: 7px; }
        .chip { font-family: var(--mono); font-size: 10px; background: rgba(0,255,178,0.05); border: 1px solid rgba(0,255,178,0.12); border-radius: 6px; padding: 4px 10px; color: var(--dim); transition: all 0.2s; cursor: default; }
        .chip:hover { border-color: rgba(0,255,178,0.35); color: var(--green); }

        .dl-section { text-align: center; padding-bottom: 90px; }
        .dl-center { display: flex; justify-content: center; align-items: center; gap: 36px; flex-wrap: wrap; margin-bottom: 28px; }
        .dl-info { text-align: left; }
        .dl-info-title { font-family: var(--display); font-size: 13px; letter-spacing: 0.1em; margin-bottom: 8px; background: linear-gradient(90deg,var(--green),var(--blue)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
        .dl-info-row { font-family: var(--mono); font-size: 10px; color: var(--dim); line-height: 2; }
        .dl-btn { position: relative; overflow: hidden; padding: 17px 60px; border-radius: 14px; background: transparent; border: 1px solid rgba(0,255,178,0.3); color: var(--green); font-family: var(--display); font-size: 12px; font-weight: 700; letter-spacing: 0.14em; cursor: pointer; transition: all 0.35s ease; }
        .dl-btn.ready { animation: glowPulseGreen 2.2s ease-in-out infinite; }
        .dl-btn:hover { background: rgba(0,255,178,0.06); transform: translateY(-4px); box-shadow: 0 10px 44px rgba(0,255,178,0.25); }
        .ripple { position: absolute; border-radius: 50%; background: rgba(0,255,178,0.15); transform: scale(0); animation: dlRipple 0.65s linear; pointer-events: none; }

        @media (max-width:768px) { .hero-h1 { font-size: 2.1rem; } .hero-stats { gap: 22px; } .nav-meta { display: none; } }
        @media (max-width:480px) { .metrics-grid { grid-template-columns: 1fr; } .graph-body { height: 380px; } }
      `}</style>

      {/* ── INTRO ── */}
      {showIntro && (
        <div style={{ animation: introExit ? "introExit 0.8s ease forwards" : undefined }}>
          <IntroScreen onDone={handleIntroDone} />
        </div>
      )}

      {/* ── NAVBAR ── */}
      <nav className="navbar">
        <div className="nav-shimmer" />
        <div className="nav-border-bottom" />
        <div className="nav-left">
          <div className="nav-logo">
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5">
              <circle cx="12" cy="12" r="2.5" />
              <circle cx="4" cy="5" r="1.8" /><circle cx="20" cy="5" r="1.8" />
              <circle cx="4" cy="19" r="1.8" /><circle cx="20" cy="19" r="1.8" />
              <circle cx="12" cy="3" r="1.5" /><circle cx="12" cy="21" r="1.5" />
              <line x1="12" y1="9.5" x2="4" y2="5" /><line x1="12" y1="9.5" x2="20" y2="5" />
              <line x1="12" y1="14.5" x2="4" y2="19" /><line x1="12" y1="14.5" x2="20" y2="19" />
              <line x1="12" y1="9.5" x2="12" y2="3" />
            </svg>
          </div>
          <div className="nav-text-wrap">
            <div className="nt">Financial Forensics Engine</div>
            <div className="ns">MONEY MULE DETECTION  v3.1.0</div>
          </div>
        </div>
        <div className="nav-right">
          <span className="nav-meta">NODES: <span>{totalAcc || "—"}</span></span>
          <span className="nav-meta">FLAGS: <span style={{ color: "var(--red)" }}>{suspAcc || "—"}</span></span>
          <div className="status-pill"><div className="s-ring" />SYSTEM ACTIVE</div>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section className="hero">
        <ParticleCanvas />
        <div className="orb orb-1" /><div className="orb orb-2" /><div className="orb orb-3" />
        <HexDeco />

        <div className="hero-tag">
          <div className="tag-dot" />
          FINANCIAL INTELLIGENCE PLATFORM — GNN POWERED
          <div className="tag-dot" />
        </div>

        <h1 className="hero-h1">
          <span className="glitch" data-text="Graph-Based Financial">Graph-Based Financial</span>
          <br />Crime Detection Engine
        </h1>

        <p className="hero-sub">Follow the Money. <em>Expose the Network.</em></p>

        <div className="hero-cta">
          <button className="btn-hero" onClick={() => document.querySelector(".upload-section")?.scrollIntoView({ behavior: "smooth" })}>
            <div className="btn-shimmer" />
            ⬆ UPLOAD TRANSACTION DATA
          </button>
        </div>

        <div className="hero-stats">
          <div className="hstat"><div className="hstat-val">99.7%</div><div className="hstat-lbl">Detection Accuracy</div></div>
          <div className="hdiv" />
          <div className="hstat"><div className="hstat-val">&lt;1s</div><div className="hstat-lbl">Analysis Latency</div></div>
          <div className="hdiv" />
          <div className="hstat"><div className="hstat-val">GNN</div><div className="hstat-lbl">Graph Neural Net</div></div>
          <div className="hdiv" />
          <div className="hstat"><div className="hstat-val">∞</div><div className="hstat-lbl">Scale Capacity</div></div>
        </div>
      </section>

      {/* ── UPLOAD ── */}
      <div className="upload-section">
        <div className="sec-hd">
          <span className="sec-num">01</span>
          <span className="sec-name">UPLOAD TRANSACTION DATA</span>
          <div className="sec-line" />
        </div>
        <div className="card" style={{ padding: 28 }}>
          <div className="cc tl" /><div className="cc tr" /><div className="cc bl" /><div className="cc br" />
          <div
            className={`dropzone ${dragOver ? "dz-active" : ""}`}
            onClick={() => fileRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) setFile(f); }}
          >
            {uploadDone ? <span className="dz-icon"><span className="success-icon">✅</span></span> : <span className="dz-icon">📊</span>}
            <div className="dz-title">{file ? file.name : "Drop CSV File Here"}</div>
            <div className="dz-sub">{file ? `${(file.size / 1024).toFixed(1)} KB · ready to upload` : "or click to browse filesystem"}</div>
            {file && <span className="file-chip">◈ {file.name}</span>}
          </div>
          <input ref={fileRef} type="file" accept=".csv" style={{ display: "none" }} onChange={e => setFile(e.target.files?.[0] ?? null)} />
          {loading && <div className="prog-track"><div className="prog-fill" style={{ width: `${progress}%` }} /></div>}
          <div className="upload-btn-row">
            <button className="btn-upload" onClick={handleUpload} disabled={loading || !file}>
              {loading ? `ANALYZING… ${Math.round(progress)}%` : uploadDone ? "✓ COMPLETE — RE-UPLOAD" : "⬆ ANALYZE TRANSACTIONS"}
            </button>
          </div>
        </div>
      </div>

      {/* ── DATA SECTIONS ── */}
      {showData && data && (<>

        {/* METRICS */}
        <div className="section">
          <div className="sec-hd">
            <span className="sec-num">02</span>
            <span className="sec-name">ANALYTICS OVERVIEW</span>
            <div className="sec-line" />
          </div>
          <div className="metrics-grid">
            {[
              { icon: "⬡", lbl: "Total Accounts", val: totalAcc, color: "var(--green)", barW: 100, delay: "0s", spin: true, spinColor: "rgba(0,255,178,0.4)" },
              { icon: "⚠", lbl: "Suspicious Accounts", val: suspAcc, color: "var(--red)", barW: totalAcc ? (suspAcc / totalAcc) * 100 : 0, delay: "0.1s", spin: false },
              { icon: "⬣", lbl: "Fraud Rings Detected", val: rings, color: "var(--orange)", barW: 65, delay: "0.2s", spin: false },
              { icon: "◷", lbl: "Processing Time", val: 847, color: "var(--blue)", barW: 28, delay: "0.3s", spin: false, suffix: "ms" },
            ].map((m, i) => (
              <div key={i} className="card metric-card" style={{ animationDelay: m.delay }}>
                <div className="cc tl" />
                <div className="m-icon" style={{ background: `color-mix(in srgb,${m.color} 10%,transparent)`, border: `1px solid color-mix(in srgb,${m.color} 25%,transparent)` }}>
                  <span style={{ color: m.color, fontSize: "1.3rem" }}>{m.icon}</span>
                  {m.spin && <div className="spin-ring" style={{ borderColor: m.spinColor ?? "rgba(0,255,178,0.3)", borderTopColor: "var(--green)" }} />}
                </div>
                <div className="m-lbl">{m.lbl}</div>
                <div className="m-val" style={{ color: m.color, textShadow: `0 0 28px color-mix(in srgb,${m.color} 40%,transparent)` }}>
                  <AnimatedCounter target={m.val} />{m.suffix && <span className="m-suffix">{m.suffix}</span>}
                </div>
                <div className="m-bar">
                  <div className="m-bar-fill" style={{ width: `${m.barW}%`, background: `linear-gradient(90deg,${m.color}60,${m.color},${m.color}80,${m.color})`, boxShadow: `0 0 10px color-mix(in srgb,${m.color} 50%,transparent)` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* GRAPH + ALERTS side by side */}
        <div className="section">
          <div className="sec-hd">
            <span className="sec-num">03</span>
            <span className="sec-name">TRANSACTION NETWORK GRAPH</span>
            <div className="sec-line" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 16 }}>
            {/* Graph */}
            <div className="card" style={{ padding: 0 }}>
              <div className="cc tl" /><div className="cc tr" />
              <div className="graph-header">
                <div className="g-title">
                  <RadarRing size={46} color="#00FFB2" speed={4.5} />
                  <div>
                    <div className="g-title-text">Live Transaction Network Analysis</div>
                    <div className="g-title-sub">
  {totalAcc} nodes · {data?.graph?.links?.length ?? 0} edges · real-time processing
</div>

                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                  <div className="live-badge"><div className="live-dot" />LIVE ANALYSIS</div>
                  <div className="legend">
                    <div className="leg-item"><div className="leg-dot" style={{ background: "var(--red)", boxShadow: "0 0 8px var(--red)" }} />Mule</div>
                    <div className="leg-item"><div className="leg-dot" style={{ background: "var(--green)", boxShadow: "0 0 8px var(--green)" }} />Source</div>
                    <div className="leg-item"><div className="leg-dot" style={{ background: "var(--blue)" }} />Dest</div>
                    <div className="leg-item"><div className="leg-dot" style={{ background: "var(--orange)" }} />&lt;7d</div>
                  </div>
                </div>
              </div>
              <div className="graph-body">
                <ScanLine />
                <div className="graph-label tl">NODE GRAPH // FORENSIC MODE</div>
                <div className="graph-label tr">ZOOM + PAN ENABLED</div>
                {data?.graph?.nodes && data?.graph?.links && (
  <ForceGraph2D
    graphData={data.graph}
  backgroundColor="transparent"

  // 🧠 Node Coloring
  nodeColor={(node: GraphNode) =>
    node.is_suspicious ? "#FF3B3B" : "#2E8BFF"
  }

  // 🧾 Tooltip
  nodeLabel={(node: GraphNode) => {
    if (!node.is_suspicious) {
      return `Account: ${node.id}`;
    }

    return `
Account: ${node.id}
Suspicion Score: ${node.suspicion_score ?? 0}
Patterns: ${(node.patterns ?? []).join(", ")}
Ring: ${node.ring_id ?? "N/A"}
    `;
  }}

  nodeRelSize={6}

  // 🔗 Link Styling
  linkWidth={(link: GraphLink) =>
    Math.max(1.2, Math.log10(link.amount + 1))
  }

  linkLabel={(link: GraphLink) =>
    `Amount: ${link.amount}`
  }

  linkColor={(link: GraphLink) => {
    if (link.age_days <= 7) return "#00FFB2";       // Fresh
    if (link.age_days <= 30) return "#2E8BFF";      // Medium
    return "rgba(46,139,255,0.35)";                 // Older
  }}

  linkDirectionalArrowLength={7}
  linkDirectionalArrowRelPos={1}

  // ✨ Animate fresh transactions
  linkDirectionalParticles={(link: GraphLink) =>
    link.age_days <= 7 ? 3 : 0
  }
  linkDirectionalParticleSpeed={0.005}
  linkDirectionalParticleColor={() => "#00FFB2"}

  // ⚙ Physics tuning (smoother layout)
  cooldownTicks={0}
d3AlphaDecay={1}


  // 🖱 Interaction
  enableNodeDrag={true}
  enableZoomInteraction={true}
  enablePanInteraction={true}
  


  // 🔥 Suspicious Node Glow
  nodeCanvasObjectMode={() => "after"}
  nodeCanvasObject={(node: GraphNode, ctx: CanvasRenderingContext2D) => {
    if (node.is_suspicious) {
      const t = Date.now() / 900;
      const r = 10 + 3.5 * Math.sin(t);

      const grd = ctx.createRadialGradient(
        node.x ?? 0,
        node.y ?? 0,
        0,
        node.x ?? 0,
        node.y ?? 0,
        r
      );

      grd.addColorStop(0, "rgba(255,59,59,0.35)");
      grd.addColorStop(1, "rgba(255,59,59,0)");

      ctx.beginPath();
      ctx.arc(node.x ?? 0, node.y ?? 0, r, 0, Math.PI * 2);
      ctx.fillStyle = grd;
      ctx.fill();
    }
  }}
/>)}


              </div>
            </div>

            {/* Right panel: Legend + Live Alerts */}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Node type legend */}
              <div className="card" style={{ padding: "18px 16px" }}>
                <div className="cc tl" />
                <div style={{ fontFamily: "var(--display)", fontSize: 10, letterSpacing: "0.2em", background: "linear-gradient(90deg,var(--green),var(--blue))", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", marginBottom: 14 }}>
                  ◈ NODE CLASSIFICATION
                </div>
                <NodeLegend />
              </div>

              {/* Live Alerts */}
              <div className="card" style={{ padding: "18px 16px", flex: 1 }}>
                <div className="cc tl" /><div className="cc br" />
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                  <div style={{ fontFamily: "var(--display)", fontSize: 10, letterSpacing: "0.2em", color: "var(--red)" }}>⚠ LIVE ALERT FEED</div>
                  <div className="live-badge"><div className="live-dot" />STREAMING</div>
                </div>
                <LiveAlerts />
              </div>
            </div>
          </div>
        </div>

        {/* TABLE */}
        <div className="section">
          <div className="sec-hd">
            <span className="sec-num">04</span>
            <span className="sec-name">FRAUD RING ANALYSIS</span>
            <div className="sec-line" />
            <span className="sec-meta">{rings} RINGS DETECTED</span>
          </div>
          <div className="card" style={{ padding: 0 }}>
            <div className="cc tl" /><div className="cc tr" />
            <div className="table-outer">
              <table className="fraud-table">
                <thead>
                  <tr>
                    <th>Ring ID</th><th>Pattern Type</th><th>Members</th><th>Risk Score</th><th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.fraud_rings?.map((ring, i) => {

                    const rm = getRiskMeta(ring.risk_score);
                    const isExp = expandedRing === ring.ring_id;
                    return (
                      <>
                        <tr key={i}
                          className={`row-animate ${hoveredRow === ring.ring_id ? "tr-hover" : ""}`}
                          style={{ animationDelay: `${i * 0.055}s` }}
                          onMouseEnter={() => setHoveredRow(ring.ring_id)}
                          onMouseLeave={() => setHoveredRow(null)}
                        >
                          <td><span className="ring-id">{ring.ring_id}</span></td>
                          <td><span className="pat-pill">{ring.pattern_type}</span></td>
                          <td style={{ fontFamily: "var(--mono)", fontSize: "0.85rem" }}>{ring.member_accounts.length}</td>
                          <td>
                            <span className="risk-badge" style={{ background: rm.bg, color: rm.color, border: `1px solid ${rm.color}35` }}>
                              <span className="risk-dot" style={{ background: rm.color, boxShadow: `0 0 7px ${rm.color}` }} />
                              {rm.label} · {(ring.risk_score * 100).toFixed(0)}%
                            </span>
                          </td>
                          <td>
                            <button className="exp-btn" onClick={() => setExpandedRing(isExp ? null : ring.ring_id)}>
                              {isExp ? "▲ HIDE" : "▼ VIEW"}
                            </button>
                          </td>
                        </tr>
                        {isExp && (
                          <tr key={`${i}-exp`}>
                            <td colSpan={5} className="members-cell">
                              <div className="members-in">
                                <div className="members-lbl">MEMBER ACCOUNTS ({ring.member_accounts.length})</div>
                                <div className="chips">
                                  {ring.member_accounts.map((m, mi) => <span key={mi} className="chip">{m}</span>)}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* DOWNLOAD */}
        <div className="section dl-section">
          <div className="sec-hd" style={{ justifyContent: "center", marginBottom: 28 }}>
            <span className="sec-num">05</span>
            <span className="sec-name">EXPORT INVESTIGATION REPORT</span>
          </div>
          <div className="dl-center">
            <RadarRing size={82} color="#00FFB2" speed={5.5} />
            <div className="dl-info">
              <div className="dl-info-title">Forensics Report Ready</div>
              <div className="dl-info-row">
                {totalAcc} accounts analyzed<br />
                {suspAcc} suspicious entities flagged<br />
                {rings} fraud rings identified<br />
                Complete graph + metadata included
              </div>
            </div>
            <RadarRing size={62} color="#2E8BFF" speed={4} />
          </div>
          <button
            className={`dl-btn ${data ? "ready" : ""}`}
            onClick={handleDownload}
            onMouseDown={e => {
              const btn = e.currentTarget;
              const d = Math.max(btn.clientWidth, btn.clientHeight);
              const rect = btn.getBoundingClientRect();
              const rip = document.createElement("span");
              rip.className = "ripple";
              rip.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - rect.left - d / 2}px;top:${e.clientY - rect.top - d / 2}px;`;
              btn.appendChild(rip);
              setTimeout(() => rip.remove(), 700);
            }}
          >
            ⬇ DOWNLOAD JSON REPORT
          </button>
        </div>
      </>)}
    </>
  );
}

export default App;