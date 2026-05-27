import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { Eye, EyeOff } from "lucide-react";
import { auth } from "../lib/firebase";
import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged } from "firebase/auth";

// ── Inline SVG logo fallback ──────────────────────────────────────────────────
function HirayaLogoSVG({ size = 80 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <defs>
        <linearGradient id="lg" x1="5" y1="5" x2="95" y2="95" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#4169e1" />
          <stop offset="100%" stopColor="#1a2fb5" />
        </linearGradient>
        <clipPath id="bc"><circle cx="48" cy="52" r="44" /></clipPath>
      </defs>
      <circle cx="48" cy="52" r="44" fill="url(#lg)" />
      <g clipPath="url(#bc)" stroke="#0a0f1e" strokeWidth="7" strokeLinecap="round" fill="none">
        <path d="M8 36 Q28 14 58 22 Q78 28 88 46" />
        <path d="M6 54 Q24 36 54 44 Q74 50 90 68" />
        <path d="M12 70 Q32 58 60 64 Q78 68 88 80" />
        <path d="M28 10 Q36 34 34 60 Q32 78 24 94" />
        <path d="M50 8 Q56 32 52 58 Q50 76 44 96" />
        <path d="M68 14 Q72 38 68 62 Q64 80 58 96" />
      </g>
      <line x1="82" y1="10" x2="36" y2="96" stroke="white" strokeWidth="5.5" strokeLinecap="round" />
      <ellipse cx="80" cy="13" rx="6" ry="4" transform="rotate(-58 80 13)" fill="white" />
      <ellipse cx="80" cy="13" rx="3" ry="2" transform="rotate(-58 80 13)" fill="#1a2fb5" />
    </svg>
  );
}

// ── Canvas particle + aurora background ──────────────────────────────────────
function AnimatedBackground() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let raf;
    let W = window.innerWidth;
    let H = window.innerHeight;
    canvas.width  = W;
    canvas.height = H;

    const resize = () => {
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width  = W;
      canvas.height = H;
    };
    window.addEventListener("resize", resize);

    // ── Particles ────────────────────────────────────────────────────────────
    const PARTICLE_COUNT = 90;
    const particles = Array.from({ length: PARTICLE_COUNT }, () => ({
      x:     Math.random() * W,
      y:     Math.random() * H,
      r:     Math.random() * 2.2 + 0.4,
      vx:    (Math.random() - 0.5) * 0.35,
      vy:    (Math.random() - 0.5) * 0.35,
      alpha: Math.random() * 0.6 + 0.2,
      pulse: Math.random() * Math.PI * 2,
      speed: Math.random() * 0.02 + 0.008,
    }));

    // ── Glowing orbs ─────────────────────────────────────────────────────────
    const orbs = [
      { x: W * 0.15, y: H * 0.25, r: 220, color: "65,105,225",  vx: 0.18, vy: 0.12, alpha: 0.13 },
      { x: W * 0.82, y: H * 0.65, r: 280, color: "100,60,220",  vx: -0.14, vy: 0.10, alpha: 0.11 },
      { x: W * 0.50, y: H * 0.10, r: 180, color: "30,100,255",  vx: 0.10, vy: 0.16, alpha: 0.10 },
      { x: W * 0.70, y: H * 0.85, r: 200, color: "80,40,200",   vx: -0.12, vy: -0.09, alpha: 0.09 },
      { x: W * 0.05, y: H * 0.75, r: 160, color: "50,120,255",  vx: 0.16, vy: -0.11, alpha: 0.08 },
    ];

    // ── Aurora beams ─────────────────────────────────────────────────────────
    const beams = Array.from({ length: 5 }, (_, i) => ({
      x:     W * (0.1 + i * 0.2),
      width: 60 + Math.random() * 80,
      speed: 0.0004 + Math.random() * 0.0003,
      phase: Math.random() * Math.PI * 2,
      hue:   210 + i * 20,
    }));

    // ── Geometric rings ───────────────────────────────────────────────────────
    const rings = Array.from({ length: 4 }, (_, i) => ({
      x:     W * [0.12, 0.88, 0.22, 0.78][i],
      y:     H * [0.18, 0.75, 0.82, 0.25][i],
      r:     50 + i * 30,
      rot:   0,
      speed: (0.003 + i * 0.001) * (i % 2 === 0 ? 1 : -1),
      alpha: 0.12 + i * 0.02,
      dash:  [12 + i * 4, 8 + i * 2],
    }));

    let t = 0;

    const draw = () => {
      ctx.clearRect(0, 0, W, H);

      // ── Aurora beams ──────────────────────────────────────────────────────
      beams.forEach(b => {
        const y0 = H * 0.3 + Math.sin(t * b.speed * 1000 + b.phase) * H * 0.15;
        const grad = ctx.createLinearGradient(b.x - b.width, 0, b.x + b.width, H);
        grad.addColorStop(0,   `hsla(${b.hue}, 80%, 60%, 0)`);
        grad.addColorStop(0.4, `hsla(${b.hue}, 80%, 65%, 0.07)`);
        grad.addColorStop(0.5, `hsla(${b.hue}, 80%, 70%, 0.12)`);
        grad.addColorStop(0.6, `hsla(${b.hue}, 80%, 65%, 0.07)`);
        grad.addColorStop(1,   `hsla(${b.hue}, 80%, 60%, 0)`);
        ctx.save();
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(b.x, y0, b.width, H * 0.7, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });

      // ── Glowing orbs ──────────────────────────────────────────────────────
      orbs.forEach(o => {
        o.x += o.vx;
        o.y += o.vy;
        if (o.x < -o.r || o.x > W + o.r) o.vx *= -1;
        if (o.y < -o.r || o.y > H + o.r) o.vy *= -1;

        const g = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.r);
        g.addColorStop(0,   `rgba(${o.color}, ${o.alpha})`);
        g.addColorStop(0.5, `rgba(${o.color}, ${o.alpha * 0.5})`);
        g.addColorStop(1,   `rgba(${o.color}, 0)`);
        ctx.beginPath();
        ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
        ctx.fillStyle = g;
        ctx.fill();
      });

      // ── Geometric rings ───────────────────────────────────────────────────
      rings.forEach(ring => {
        ring.rot += ring.speed;
        ctx.save();
        ctx.translate(ring.x, ring.y);
        ctx.rotate(ring.rot);
        ctx.setLineDash(ring.dash);
        ctx.strokeStyle = `rgba(150,180,255,${ring.alpha})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, ring.r, 0, Math.PI * 2);
        ctx.stroke();
        // Inner ring
        ctx.setLineDash([6, 10]);
        ctx.strokeStyle = `rgba(180,200,255,${ring.alpha * 0.6})`;
        ctx.beginPath();
        ctx.arc(0, 0, ring.r * 0.6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      });

      // ── Particles ─────────────────────────────────────────────────────────
      particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.pulse += p.speed;
        if (p.x < 0) p.x = W;
        if (p.x > W) p.x = 0;
        if (p.y < 0) p.y = H;
        if (p.y > H) p.y = 0;

        const a = p.alpha * (0.6 + 0.4 * Math.sin(p.pulse));
        const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 3);
        glow.addColorStop(0, `rgba(180,210,255,${a})`);
        glow.addColorStop(1, `rgba(180,210,255,0)`);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 3, 0, Math.PI * 2);
        ctx.fillStyle = glow;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(220,235,255,${a})`;
        ctx.fill();
      });

      // ── Particle connections ───────────────────────────────────────────────
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 100) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(150,190,255,${0.12 * (1 - dist / 100)})`;
            ctx.lineWidth = 0.6;
            ctx.stroke();
          }
        }
      }

      t += 0.016;
      raf = requestAnimationFrame(draw);
    };

    draw();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" style={{ pointerEvents: "none" }} />;
}

// ── Floating glowing orb (CSS/motion layer on top of canvas) ─────────────────
function GlowOrb({ className, size, color, delay, duration }) {
  return (
    <motion.div
      className={`absolute rounded-full ${className}`}
      style={{
        width: size, height: size,
        background: `radial-gradient(circle at 35% 35%, ${color}, transparent 70%)`,
        filter: "blur(40px)",
      }}
      animate={{ scale: [1, 1.15, 0.92, 1.08, 1], opacity: [0.5, 0.8, 0.4, 0.7, 0.5] }}
      transition={{ duration, delay, repeat: Infinity, ease: "easeInOut" }}
    />
  );
}

const LoginPage = () => {
  const navigate = useNavigate();
  const [loading, setLoading]           = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg]         = useState("");
  const [formData, setFormData]         = useState({ username: "", password: "" });

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) navigate("/dashboard");
    });
    return () => unsub();
  }, [navigate]);

  const handleGoogleLogin = async () => {
    setLoading(true); setErrorMsg("");
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
      navigate("/dashboard");
    } catch {
      setErrorMsg("Google sign-in failed. Please try again.");
    } finally { setLoading(false); }
  };

  const handleSubmit = (e) => {
    e.preventDefault(); setLoading(true); setErrorMsg("");
    setTimeout(() => {
      if (formData.username.toLowerCase() === "admin" && formData.password === "admin") {
        localStorage.setItem("mock_auth", "true");
        navigate("/dashboard");
      } else {
        setErrorMsg("Invalid credentials. Use admin / admin for demo.");
        setLoading(false);
      }
    }, 800);
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center overflow-hidden relative"
      style={{ background: "linear-gradient(135deg, #0d1b4b 0%, #0a1128 50%, #060d1f 100%)" }}
    >
      {/* ── Canvas animation layer ── */}
      <AnimatedBackground />

      {/* ── CSS glow orbs (soft blobs on top of canvas) ── */}
      <GlowOrb className="-top-32 -left-32"   size={500} color="rgba(65,105,225,0.35)"  delay={0}   duration={12} />
      <GlowOrb className="-bottom-40 -right-40" size={600} color="rgba(80,40,200,0.30)"  delay={3}   duration={15} />
      <GlowOrb className="top-1/3 right-0"    size={350} color="rgba(30,80,255,0.25)"   delay={1.5} duration={10} />
      <GlowOrb className="bottom-1/4 left-0"  size={300} color="rgba(100,60,220,0.22)"  delay={5}   duration={13} />
      <GlowOrb className="top-0 right-1/3"    size={250} color="rgba(50,130,255,0.20)"  delay={2}   duration={9}  />

      {/* ── Login card ── */}
      <motion.div
        initial={{ opacity: 0, y: 40, scale: 0.94 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 w-full max-w-md mx-4"
      >
        {/* Subtle card glow ring */}
        <div className="absolute -inset-px rounded-3xl"
          style={{ background: "linear-gradient(135deg, rgba(100,150,255,0.25), rgba(80,40,200,0.15), rgba(100,150,255,0.1))", filter: "blur(1px)" }} />

        <div
          className="relative rounded-3xl px-10 py-10"
          style={{
            background: "rgba(8,16,48,0.72)",
            backdropFilter: "blur(32px)",
            WebkitBackdropFilter: "blur(32px)",
            border: "1px solid rgba(100,150,255,0.20)",
            boxShadow: "0 40px 90px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.08)",
          }}
        >
          {/* Logo + branding */}
          <motion.div
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.18, duration: 0.55 }}
            className="flex flex-col items-center text-center mb-8"
          >
            <motion.div
              className="mb-4"
              animate={{ y: [0, -6, 0], filter: ["drop-shadow(0 0 8px rgba(65,105,225,0.5))", "drop-shadow(0 0 18px rgba(65,105,225,0.9))", "drop-shadow(0 0 8px rgba(65,105,225,0.5))"] }}
              transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
            >
              <img
                src="/logo.png"
                alt="Hiraya"
                className="w-20 h-20 object-contain"
                onError={e => { e.target.style.display = "none"; e.target.nextSibling.style.display = "flex"; }}
              />
              <div style={{ display: "none" }} className="items-center justify-center">
                <HirayaLogoSVG size={80} />
              </div>
            </motion.div>

            <h1 className="text-white font-black tracking-tight leading-none mb-2"
              style={{ fontSize: "2.75rem", textShadow: "0 0 30px rgba(100,150,255,0.4)" }}>
              Hiraya
            </h1>

            <p className="text-white/50 text-xs font-medium leading-snug max-w-[260px]">
              High-quality Imports &amp; Retail of Authentic Yarn and Fabrics
            </p>

            <div className="w-16 h-px mt-4 mb-1"
              style={{ background: "linear-gradient(90deg, transparent, rgba(100,150,255,0.5), transparent)" }} />

            <p className="text-white/35 text-[10px] font-bold uppercase tracking-[0.22em]">
              Supplier Portal
            </p>
          </motion.div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {errorMsg && (
              <motion.div
                initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
                className="px-4 py-2.5 rounded-xl text-[11px] font-bold uppercase tracking-widest text-center"
                style={{ background: "rgba(239,68,68,0.18)", color: "#fca5a5", border: "1px solid rgba(239,68,68,0.25)" }}
              >
                {errorMsg}
              </motion.div>
            )}

            {/* Username */}
            <motion.div
              initial={{ opacity: 0, x: -18 }} animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3, duration: 0.45 }}
              className="space-y-1.5"
            >
              <label className="text-white/60 text-[11px] font-bold uppercase tracking-widest">Username</label>
              <input
                required type="text" placeholder="username@gmail.com"
                value={formData.username}
                onChange={e => setFormData({ ...formData, username: e.target.value })}
                className="w-full h-12 px-4 rounded-xl text-sm outline-none transition-all"
                style={{ background: "rgba(255,255,255,0.92)", color: "#0a1128", border: "1px solid rgba(100,150,255,0.2)" }}
                onFocus={e => (e.target.style.boxShadow = "0 0 0 3px rgba(100,150,255,0.25)")}
                onBlur={e  => (e.target.style.boxShadow = "none")}
              />
            </motion.div>

            {/* Password */}
            <motion.div
              initial={{ opacity: 0, x: -18 }} animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4, duration: 0.45 }}
              className="space-y-1.5"
            >
              <label className="text-white/60 text-[11px] font-bold uppercase tracking-widest">Password</label>
              <div className="relative">
                <input
                  required type={showPassword ? "text" : "password"} placeholder="Password"
                  value={formData.password}
                  onChange={e => setFormData({ ...formData, password: e.target.value })}
                  className="w-full h-12 pl-4 pr-11 rounded-xl text-sm outline-none transition-all"
                  style={{ background: "rgba(255,255,255,0.92)", color: "#0a1128", border: "1px solid rgba(100,150,255,0.2)" }}
                  onFocus={e => (e.target.style.boxShadow = "0 0 0 3px rgba(100,150,255,0.25)")}
                  onBlur={e  => (e.target.style.boxShadow = "none")}
                />
                <button type="button" tabIndex={-1}
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <div className="text-right">
                <button type="button" className="text-white/45 text-[11px] font-medium hover:text-white transition-colors">
                  Forgot Password?
                </button>
              </div>
            </motion.div>

            {/* Log in */}
            <motion.div
              initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.45 }}
            >
              <motion.button
                type="submit" disabled={loading}
                whileHover={{ scale: loading ? 1 : 1.02, boxShadow: "0 0 30px rgba(65,105,225,0.5)" }}
                whileTap={{ scale: loading ? 1 : 0.97 }}
                className="w-full h-12 rounded-xl text-sm font-black uppercase tracking-widest transition-all"
                style={{
                  background: "linear-gradient(135deg, #1a3a8f, #0a1128)",
                  color: "white", border: "1px solid rgba(100,150,255,0.25)",
                  cursor: loading ? "not-allowed" : "pointer",
                  boxShadow: "0 4px 24px rgba(0,0,0,0.45)",
                  opacity: loading ? 0.75 : 1,
                }}
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <motion.span
                      className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full inline-block"
                      animate={{ rotate: 360 }}
                      transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
                    />
                    Logging in...
                  </span>
                ) : "Log in"}
              </motion.button>
            </motion.div>

            {/* Divider */}
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}
              className="flex items-center gap-3 my-1"
            >
              <div className="flex-1 h-px" style={{ background: "rgba(100,150,255,0.18)" }} />
              <span className="text-white/40 text-[11px] font-medium">or continue with</span>
              <div className="flex-1 h-px" style={{ background: "rgba(100,150,255,0.18)" }} />
            </motion.div>

            {/* Google */}
            <motion.div
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.67, duration: 0.4 }}
            >
              <motion.button
                type="button" onClick={handleGoogleLogin} disabled={loading}
                whileHover={{ scale: loading ? 1 : 1.02 }}
                whileTap={{ scale: loading ? 1 : 0.97 }}
                className="w-full h-12 rounded-xl flex items-center justify-center gap-3 text-sm font-bold transition-all"
                style={{
                  background: "rgba(255,255,255,0.95)", color: "#0a1128",
                  border: "1px solid rgba(255,255,255,0.3)",
                  boxShadow: "0 2px 16px rgba(0,0,0,0.2)",
                  cursor: loading ? "not-allowed" : "pointer",
                }}
              >
                <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-5 h-5" />
                Sign in with Google
              </motion.button>
            </motion.div>
          </form>
        </div>

        <motion.p
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.85 }}
          className="text-center text-white/25 text-[10px] font-bold uppercase tracking-[0.25em] mt-5"
        >
          Hiraya · Supplier Fulfillment Portal
        </motion.p>
      </motion.div>
    </div>
  );
};

export default LoginPage;
