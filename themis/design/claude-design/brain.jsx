/* global React */
// THE CASE BRAIN — cinematic edition.
// Adds: particle flow along verified edges, causal-chain narrative spine,
// orbital + time layouts, time-scrubbed visibility, depth/atmosphere.

(function () {
  const { useEffect, useRef, useState, useMemo, useCallback } = React;

  // ── Palette ──
  const C = {
    bg0: "#070b13", bg1: "#0c1622", bg2: "#0f1a28",
    grid: "rgba(202,160,92,0.045)",
    ink: "#e1e7ee", inkSoft: "#9aa6b3", inkFaint: "#5f6973",
    brass: "#caa05c", brassLight: "#e9cf95", brassDeep: "#a67c3a", brassSoft: "#ddc79a",
    info: "#7aa8e8", infoDeep: "#4677c2",
    verify: "#5fbc8a", verifyDeep: "#2f7a57",
    flag: "#e1a258", flagDeep: "#b06a12",
    danger: "#e87269",
  };

  // ── Causal chain — the narrative spine ──
  // Reyes complaint → HR ack → negative review → memo → termination
  // These are the events/docs that form the retaliation arc.
  const CAUSAL_NODES = ["c2", "c3", "d3", "c4", "d4", "c5", "d5", "c6"];
  const CAUSAL_SET = new Set(CAUSAL_NODES);
  function isCausalNode(n) { return CAUSAL_SET.has(n.id); }
  function isCausalEdge(e) {
    return CAUSAL_SET.has(e.a) && CAUSAL_SET.has(e.b);
  }

  // ── Stage scheduling ──
  const STAGES = [
    { key: "upload",    label: "Streaming documents",    from: 0,    to: 1800 },
    { key: "ocr",       label: "OCR · Azure DI",          from: 1800, to: 2800 },
    { key: "bates",     label: "Bates stamp",             from: 2800, to: 3600 },
    { key: "dedup",     label: "Dedup + threading",       from: 3600, to: 4600 },
    { key: "extract",   label: "Entity extraction",       from: 4600, to: 6800 },
    { key: "privilege", label: "Privilege scan",          from: 6800, to: 8200 },
    { key: "settled",   label: "Brain ready · breathing", from: 8200, to: Infinity },
  ];
  function currentStage(elapsed) {
    for (let i = STAGES.length - 1; i >= 0; i--) {
      if (elapsed >= STAGES[i].from) return { ...STAGES[i], index: i };
    }
    return { ...STAGES[0], index: 0 };
  }
  function nodeAppearTime(n) {
    if (n.kind === "doc") return Math.random() * 1700 + 100;
    if (n.kind === "entity") return 4800 + Math.random() * 1200;
    if (n.kind === "event") return 5200 + Math.random() * 1200;
    if (n.kind === "claim") return 7400 + Math.random() * 400;
    if (n.kind === "defense") return 7600 + Math.random() * 400;
    return 8000;
  }

  // ── Layout target positions ──
  // For each layout mode, compute a (targetX, targetY) per node. The sim
  // gently springs toward these so transitions between modes feel alive.
  function computeLayoutTargets(nodes, mode, W, H, timeAt) {
    const cx = W * 0.5, cy = H * 0.5;
    const RX = Math.min(W, H) * 0.42, RY = Math.min(W, H) * 0.34;
    nodes.forEach((n) => { n.targetX = null; n.targetY = null; });

    if (mode === "orbital") {
      // Concentric rings:
      //  center: Maria Reyes (e1) — case gravity
      //  ring 1 (entities): e2 e3 e4
      //  ring 2 (events): chronology c1..c6
      //  ring 3 (docs hot)
      //  ring 4 (claims/defenses)
      //  outer halo: ambient
      const center = nodes.find(n => n.id === "e1");
      if (center) { center.targetX = cx; center.targetY = cy; }
      const ents = nodes.filter(n => n.kind === "entity" && n.id !== "e1");
      ents.forEach((n, i) => {
        const a = (i / ents.length) * Math.PI * 2;
        n.targetX = cx + Math.cos(a) * Math.min(W, H) * 0.10;
        n.targetY = cy + Math.sin(a) * Math.min(W, H) * 0.10;
      });
      const evs = nodes.filter(n => n.kind === "event").sort((a, b) => a.event.date.localeCompare(b.event.date));
      evs.forEach((n, i) => {
        const a = (i / evs.length) * Math.PI * 2 - Math.PI / 2;
        n.targetX = cx + Math.cos(a) * Math.min(W, H) * 0.20;
        n.targetY = cy + Math.sin(a) * Math.min(W, H) * 0.20;
      });
      const docs = nodes.filter(n => n.kind === "doc" && !n.ambient).sort((a, b) => (a.doc?.date || "").localeCompare(b.doc?.date || ""));
      docs.forEach((n, i) => {
        const a = (i / Math.max(docs.length, 1)) * Math.PI * 2 - Math.PI / 2;
        n.targetX = cx + Math.cos(a) * Math.min(W, H) * 0.30;
        n.targetY = cy + Math.sin(a) * Math.min(W, H) * 0.30;
      });
      const claims = nodes.filter(n => n.kind === "claim");
      claims.forEach((n, i) => {
        const a = (i / claims.length) * Math.PI - Math.PI;
        n.targetX = cx + Math.cos(a) * Math.min(W, H) * 0.40;
        n.targetY = cy + Math.sin(a) * Math.min(W, H) * 0.40;
      });
      const defs = nodes.filter(n => n.kind === "defense");
      defs.forEach((n, i) => {
        const a = (i / defs.length) * Math.PI;
        n.targetX = cx + Math.cos(a) * Math.min(W, H) * 0.40;
        n.targetY = cy + Math.sin(a) * Math.min(W, H) * 0.40;
      });
      // ambient docs go to outer halo with jitter
      const amb = nodes.filter(n => n.ambient);
      amb.forEach((n, i) => {
        const a = (i / amb.length) * Math.PI * 2;
        const r = Math.min(W, H) * (0.46 + Math.random() * 0.04);
        n.targetX = cx + Math.cos(a) * r;
        n.targetY = cy + Math.sin(a) * r;
      });
    } else if (mode === "time") {
      // X = position on timeline (2019-2021), Y = kind band
      const minD = new Date("2019-01-01").getTime();
      const maxD = new Date("2021-06-01").getTime();
      const pad = 80;
      const useW = W - pad * 2;
      function xOfDate(d) {
        const t = new Date(d).getTime();
        return pad + ((t - minD) / (maxD - minD)) * useW;
      }
      nodes.forEach((n) => {
        let date = null, band = 0;
        if (n.kind === "doc") { date = n.doc?.date || (n.cluster ? "2021-01-01" : "2020-06-01"); band = -0.15; }
        if (n.kind === "event") { date = n.event.date; band = 0.05; }
        if (n.kind === "entity") { date = "2020-06-01"; band = 0.22; }
        if (n.kind === "claim") { date = "2021-06-01"; band = -0.32; }
        if (n.kind === "defense") { date = "2021-06-01"; band = 0.32; }
        const tx = xOfDate(date);
        const ty = cy + band * H * 0.6 + (Math.sin((n.id.charCodeAt(0) || 0) * 0.31) * 12);
        n.targetX = tx;
        n.targetY = ty;
      });
    }
    // 'force' mode: leave targets null; force layout handles it
  }

  // ── Force step ──
  function step(sim, dt, opts) {
    const { nodes, edges, W, H } = sim;
    const visible = nodes.filter((n) => n.visible !== false);

    // Layout-target spring (orbital/time modes)
    if (opts.layout !== "force") {
      visible.forEach((n) => {
        if (n.targetX != null) {
          n.vx += (n.targetX - n.x) * 0.015;
          n.vy += (n.targetY - n.y) * 0.015;
        }
      });
    }

    if (opts.layout === "force") {
      // Repulsion among visible nodes
      const K_REP = opts.repulsion;
      for (let i = 0; i < visible.length; i++) {
        const a = visible[i];
        for (let j = i + 1; j < visible.length; j++) {
          const b = visible[j];
          let dx = b.x - a.x, dy = b.y - a.y;
          let d2 = dx * dx + dy * dy + 0.01;
          if (d2 > 8000) continue;
          const d = Math.sqrt(d2);
          const f = K_REP / d2;
          const fx = (dx / d) * f, fy = (dy / d) * f;
          a.vx -= fx; a.vy -= fy;
          b.vx += fx; b.vy += fy;
        }
      }
      // Spring forces on edges
      const K_SPR = opts.spring;
      edges.forEach((e) => {
        const a = e._a, b = e._b;
        if (!a || !b || a.visible === false || b.visible === false) return;
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy) + 0.01;
        const target = e.targetLen || (e.type === "timeline" ? 70 : e.type === "thread" ? 40 : 90);
        const f = (d - target) * K_SPR;
        const fx = (dx / d) * f, fy = (dy / d) * f;
        a.vx += fx; a.vy += fy;
        b.vx -= fx; b.vy -= fy;
      });
      // Gravity + elliptical bound
      const cx = W / 2, cy = H / 2;
      const RX = Math.min(W, H) * 0.42, RY = Math.min(W, H) * 0.34;
      visible.forEach((n) => {
        n.vx += (cx - n.x) * 0.0008;
        n.vy += (cy - n.y) * 0.0008;
        if (n.privilege === "flagged" && !n.ambient) {
          const tx = cx - RX * 0.6, ty = cy + RY * 0.4;
          n.vx += (tx - n.x) * 0.004;
          n.vy += (ty - n.y) * 0.004;
        }
        const ex = (n.x - cx) / RX, ey = (n.y - cy) / RY;
        const r = Math.sqrt(ex * ex + ey * ey);
        if (r > 1) {
          const k = (r - 1) * 0.02;
          n.vx -= ex * k * RX;
          n.vy -= ey * k * RY;
        }
      });
    }

    // Integrate w/ damping
    visible.forEach((n) => {
      if (n.pinned) { n.vx = 0; n.vy = 0; return; }
      n.vx *= opts.damping;
      n.vy *= opts.damping;
      const vmag = Math.sqrt(n.vx * n.vx + n.vy * n.vy);
      const vmax = 8;
      if (vmag > vmax) { n.vx = n.vx / vmag * vmax; n.vy = n.vy / vmag * vmax; }
      n.x += n.vx * dt;
      n.y += n.vy * dt;
    });

    // Idle breathing in settled mode
    if (opts.breathe && opts.layout === "force") {
      const t = opts.now / 1000;
      visible.forEach((n) => {
        if (n.ambient) return;
        const phase = (n.id.charCodeAt(0) || 0) * 0.13;
        n.x += Math.sin(t * 0.6 + phase) * 0.05;
        n.y += Math.cos(t * 0.5 + phase) * 0.05;
      });
    }
  }

  // ── Particle system for verified citation edges ──
  function emitParticles(particles, edges, now) {
    edges.forEach((e) => {
      if (!(e.type === "citation" || e.type === "supports")) return;
      if (!e.verified) return;
      if (!e._a.visible || !e._b.visible) return;
      // Emit at ~one per ~1500ms per edge
      e._lastEmit = e._lastEmit || (now + Math.random() * 1500);
      if (now - e._lastEmit > 1400 + Math.random() * 600) {
        particles.push({
          edge: e,
          t: 0,
          speed: 0.0009 + Math.random() * 0.0004, // per ms
          color: e.type === "supports" ? C.brassLight : C.verify,
        });
        e._lastEmit = now;
      }
    });
  }

  function styleOf(node) {
    if (node.kind === "claim")   return { fill: C.brass, ring: C.brassSoft, r: 12, glow: 28 };
    if (node.kind === "defense") return { fill: "#6b7480", ring: "#3a4754", r: 9, glow: 14 };
    if (node.kind === "entity")  return { fill: C.info,  ring: "#a5c3eb", r: Math.max(7, (node.size || 10)), glow: 18 };
    if (node.kind === "event") {
      const accepted = node.event && node.event.accepted === true;
      return { fill: accepted ? C.verify : "#74612e", ring: accepted ? "#9fdfba" : C.flag, r: 7, glow: 16, dashed: !accepted };
    }
    if (node.ambient) {
      return { fill: node.privilege === "flagged" ? "rgba(225,162,88,0.4)" : "rgba(189,200,213,0.32)", ring: null, r: 1.6, glow: 0 };
    }
    if (node.hot)               return { fill: C.brass, ring: C.brassLight, r: 7, glow: 22 };
    if (node.privilege === "flagged")
      return { fill: "rgba(225,162,88,0.55)", ring: C.flag, r: 5.5, glow: 10, locked: true };
    return { fill: "#9aa5b3", ring: null, r: 4, glow: 4 };
  }

  // ── Component ──
  window.Brain = function Brain(props) {
    const {
      filter = "all",
      selectedId,
      onSelectNode,
      replayKey = 0,
      paused = false,
      onStageChange,
      onProgress,
      layout = "force",            // force | orbital | time
      timeAt = null,                // ISO date string — only used in 'time' layout
      causalHighlight = false,      // glow the spine
      showLabels = true,
    } = props;

    const canvasRef = useRef(null);
    const wrapRef = useRef(null);
    const simRef = useRef(null);
    const particlesRef = useRef([]);
    const animRef = useRef(null);
    const startRef = useRef(null);
    const lastTRef = useRef(null);
    const hoverRef = useRef(null);
    const stageRef = useRef({ key: "upload", label: "Initializing", index: 0 });
    const [hoverNode, setHoverNode] = useState(null);
    const [dims, setDims] = useState({ w: 1200, h: 800 });

    // Build sim (reset on replay)
    const built = useMemo(() => {
      const data = window.THEMIS.graph;
      const nodes = data.nodes.map((n) => ({ ...n }));
      const idMap = {};
      nodes.forEach((n) => (idMap[n.id] = n));
      const edges = data.edges.map((e) => ({
        ...e, _a: idMap[e.a], _b: idMap[e.b],
      })).filter((e) => e._a && e._b);
      nodes.forEach((n) => {
        n.appearAt = nodeAppearTime(n);
        n.visible = false;
        n.alpha = 0;
      });
      return { nodes, edges };
    }, [replayKey]);

    // Resize observer
    useEffect(() => {
      if (!wrapRef.current) return;
      const ro = new ResizeObserver((entries) => {
        for (const ent of entries) {
          const r = ent.contentRect;
          setDims({ w: Math.max(400, r.width), h: Math.max(300, r.height) });
        }
      });
      ro.observe(wrapRef.current);
      return () => ro.disconnect();
    }, []);

    // (Re)init sim
    useEffect(() => {
      // Init positions from off-screen edges for stream-in
      built.nodes.forEach((n) => {
        const side = Math.floor(Math.random() * 4);
        const off = 60;
        if (side === 0) { n.x = -off; n.y = Math.random() * dims.h; }
        else if (side === 1) { n.x = dims.w + off; n.y = Math.random() * dims.h; }
        else if (side === 2) { n.x = Math.random() * dims.w; n.y = -off; }
        else { n.x = Math.random() * dims.w; n.y = dims.h + off; }
        n.vx = 0; n.vy = 0;
        n.alpha = 0;
        n.visible = false;
      });
      simRef.current = { nodes: built.nodes, edges: built.edges, W: dims.w, H: dims.h };
      particlesRef.current = [];
      startRef.current = null;
      lastTRef.current = null;
    }, [built, dims.w, dims.h]);

    // Update layout targets whenever layout mode changes
    useEffect(() => {
      if (!simRef.current) return;
      computeLayoutTargets(simRef.current.nodes, layout, dims.w, dims.h, timeAt);
    }, [layout, dims.w, dims.h]);

    // Filter as dim modifier
    useEffect(() => {
      if (!simRef.current) return;
      const { nodes } = simRef.current;
      nodes.forEach((n) => {
        let dim = false;
        if (filter === "hot") dim = !(n.hot || n.kind === "claim" || n.kind === "defense");
        else if (filter === "privileged") dim = !(n.privilege === "flagged" || n.kind === "claim");
        else if (filter === "unverified") dim = !(n.kind === "event" && n.event && n.event.accepted !== true);
        else if (filter && filter !== "all") {
          dim = !(n.kind === "event" && n.event.issueTags && n.event.issueTags.includes(filter));
        }
        n.dim = dim;
      });
    }, [filter]);

    // Time scrubber visibility (in 'time' layout)
    useEffect(() => {
      if (!simRef.current) return;
      if (layout === "time" && timeAt) {
        const tT = new Date(timeAt).getTime();
        simRef.current.nodes.forEach((n) => {
          let nT = null;
          if (n.kind === "doc" && n.doc) nT = new Date(n.doc.date).getTime();
          if (n.kind === "event") nT = new Date(n.event.date).getTime();
          n._afterTime = nT != null && nT > tT;
        });
      } else {
        simRef.current.nodes.forEach((n) => { n._afterTime = false; });
      }
    }, [timeAt, layout]);

    // Animate
    useEffect(() => {
      let stopped = false;
      function frame(now) {
        if (stopped) return;
        if (!startRef.current) startRef.current = now;
        if (!lastTRef.current) lastTRef.current = now;
        const elapsed = now - startRef.current;
        const dt = Math.min(2, (now - lastTRef.current) / 16);
        lastTRef.current = now;
        const stage = currentStage(elapsed);
        if (stage.key !== stageRef.current.key) {
          stageRef.current = stage;
          onStageChange && onStageChange(stage, elapsed);
        }

        const sim = simRef.current;
        if (!sim) { animRef.current = requestAnimationFrame(frame); return; }

        const { nodes } = sim;
        let pages = 0;
        nodes.forEach((n) => {
          const shouldShow = elapsed >= n.appearAt;
          if (shouldShow) {
            n.visible = true;
            n.alpha = Math.min(1, n.alpha + 0.04);
            if (n.kind === "doc") pages += n.doc ? (n.doc.pageCount || 1) : 7;
          } else {
            n.visible = false;
          }
        });
        const targetPages = 84213;
        const uploadProgress = Math.min(1, elapsed / 1800);
        onProgress && onProgress({
          stage, elapsed,
          pages: Math.floor(targetPages * uploadProgress),
          totalPages: targetPages,
        });

        const iters = stage.key === "settled" ? 1 : 2;
        for (let k = 0; k < iters; k++) {
          step(sim, dt, {
            repulsion: 280,
            spring: 0.005,
            damping: 0.86,
            breathe: stage.key === "settled",
            now, layout,
          });
        }

        // Emit + step particles
        emitParticles(particlesRef.current, sim.edges, now);
        particlesRef.current = particlesRef.current.filter((p) => {
          p.t += p.speed * (lastTRef.current - (lastTRef.current - dt * 16));
          return p.t < 1;
        });
        // Increment particle progress
        particlesRef.current.forEach((p) => { p.t += p.speed * dt * 16; });
        particlesRef.current = particlesRef.current.filter((p) => p.t < 1);

        draw(canvasRef.current, sim, particlesRef.current, dims, {
          hoverId: hoverRef.current,
          selectedId,
          filterActive: filter && filter !== "all",
          stage, now, layout, timeAt,
          causalHighlight, showLabels,
        });

        animRef.current = requestAnimationFrame(frame);
      }
      if (!paused) animRef.current = requestAnimationFrame(frame);
      return () => {
        stopped = true;
        cancelAnimationFrame(animRef.current);
      };
    }, [paused, dims, selectedId, layout, timeAt, causalHighlight, showLabels, filter]);

    const pickNode = useCallback((px, py) => {
      const sim = simRef.current;
      if (!sim) return null;
      let best = null, bestD = Infinity;
      for (const n of sim.nodes) {
        if (!n.visible || n.ambient) continue;
        const dx = n.x - px, dy = n.y - py;
        const d2 = dx * dx + dy * dy;
        const s = styleOf(n);
        const hit = (s.r + 8) * (s.r + 8);
        if (d2 < hit && d2 < bestD) { bestD = d2; best = n; }
      }
      return best;
    }, []);

    const onMove = (e) => {
      const rect = canvasRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const n = pickNode(x, y);
      hoverRef.current = n ? n.id : null;
      setHoverNode(n ? { ...n, _sx: x, _sy: y } : null);
      canvasRef.current.style.cursor = n ? "pointer" : "default";
    };
    const onLeave = () => { hoverRef.current = null; setHoverNode(null); };
    const onClick = (e) => {
      const rect = canvasRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const n = pickNode(x, y);
      if (n && onSelectNode) onSelectNode(n);
    };

    return (
      <div ref={wrapRef} className="brain-wrap" style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}>
        <canvas
          ref={canvasRef}
          onMouseMove={onMove}
          onMouseLeave={onLeave}
          onClick={onClick}
          style={{ display: "block", width: "100%", height: "100%" }}
        />
        {hoverNode && <NodeTooltip node={hoverNode} />}
      </div>
    );
  };

  function NodeTooltip({ node }) {
    let title = node.label, sub = "", kindLabel = node.kind;
    if (node.kind === "doc" && node.doc) {
      title = node.doc.bates;
      sub = node.doc.title;
      kindLabel = node.doc.type + (node.hot ? " · hot" : "") + (node.privilege === "flagged" ? " · privileged" : "");
    } else if (node.kind === "entity" && node.entity) {
      title = node.entity.name;
      sub = node.entity.role + " · " + node.entity.mentions.toLocaleString() + " mentions";
      kindLabel = "entity";
    } else if (node.kind === "event" && node.event) {
      title = node.event.date;
      sub = node.event.description;
      kindLabel = "chronology event";
    } else if (node.kind === "claim") { title = "Claim"; sub = node.label; }
    else if (node.kind === "defense") { title = "Defense"; sub = node.label; }
    const left = node._sx + 14;
    const top = node._sy + 14;
    return (
      <div className="brain-tip" style={{ left, top }}>
        <div className="brain-tip-kind">{kindLabel}</div>
        <div className="brain-tip-title">{title}</div>
        {sub && <div className="brain-tip-sub">{sub}</div>}
      </div>
    );
  }

  // ── Render ──
  function draw(canvas, sim, particles, dims, opts) {
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const W = dims.w, H = dims.h;
    if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
      canvas.width = W * dpr; canvas.height = H * dpr;
    }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Atmospheric background
    const grad = ctx.createRadialGradient(W * 0.5, H * 0.55, Math.min(W, H) * 0.04, W * 0.5, H * 0.55, Math.max(W, H) * 0.85);
    grad.addColorStop(0, "#13212e");
    grad.addColorStop(0.45, "#0c1622");
    grad.addColorStop(1, "#050811");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Subtle constellation grid
    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 0.7;
    const G = 64;
    ctx.beginPath();
    for (let x = G; x < W; x += G) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let y = G; y < H; y += G) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();

    // Vignette
    const vig = ctx.createRadialGradient(W * 0.5, H * 0.5, Math.min(W, H) * 0.4, W * 0.5, H * 0.5, Math.max(W, H) * 0.75);
    vig.addColorStop(0, "rgba(0,0,0,0)");
    vig.addColorStop(1, "rgba(0,0,0,0.55)");
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);

    // Privilege wall (frosted region in lower-left for 'force' mode)
    if (opts.layout === "force") {
      const cx = W / 2, cy = H / 2;
      const RX = Math.min(W, H) * 0.42, RY = Math.min(W, H) * 0.34;
      const wallX = cx - RX * 0.95, wallY = cy + RY * 0.1, wallW = RX * 0.65, wallH = RY * 0.7;
      ctx.save();
      // frosted fill
      const wallGrad = ctx.createLinearGradient(wallX, wallY, wallX, wallY + wallH);
      wallGrad.addColorStop(0, "rgba(225, 162, 88, 0.08)");
      wallGrad.addColorStop(1, "rgba(225, 162, 88, 0.02)");
      ctx.fillStyle = wallGrad;
      // diagonal hatching for "walled"
      ctx.strokeStyle = "rgba(225, 162, 88, 0.18)";
      ctx.setLineDash([4, 6]);
      ctx.lineWidth = 1;
      roundRect(ctx, wallX, wallY, wallW, wallH, 12);
      ctx.fill(); ctx.stroke();
      // Hatching
      ctx.save();
      ctx.beginPath();
      roundRect(ctx, wallX, wallY, wallW, wallH, 12);
      ctx.clip();
      ctx.strokeStyle = "rgba(225, 162, 88, 0.06)";
      ctx.setLineDash([]);
      ctx.lineWidth = 0.6;
      for (let i = -wallH; i < wallW; i += 8) {
        ctx.beginPath();
        ctx.moveTo(wallX + i, wallY);
        ctx.lineTo(wallX + i + wallH, wallY + wallH);
        ctx.stroke();
      }
      ctx.restore();
      ctx.setLineDash([]);
      ctx.font = "9px ui-monospace, 'JetBrains Mono', monospace";
      ctx.fillStyle = "rgba(225, 162, 88, 0.85)";
      ctx.fillText("◇ PRIVILEGE WALL · 14 IN QUEUE", wallX + 12, wallY + 18);
      ctx.restore();
    }

    // Time-mode chronological spine
    if (opts.layout === "time") {
      const cy = H * 0.5;
      ctx.strokeStyle = "rgba(202, 160, 92, 0.15)";
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      ctx.moveTo(60, cy); ctx.lineTo(W - 60, cy);
      ctx.stroke();
      ctx.setLineDash([]);
      // year ticks
      ["2019", "2020", "2021"].forEach((y) => {
        const minD = new Date("2019-01-01").getTime();
        const maxD = new Date("2021-06-01").getTime();
        const t = new Date(y + "-01-01").getTime();
        const x = 80 + ((t - minD) / (maxD - minD)) * (W - 160);
        ctx.strokeStyle = "rgba(202,160,92,0.2)";
        ctx.beginPath();
        ctx.moveTo(x, cy - 8); ctx.lineTo(x, cy + 8); ctx.stroke();
        ctx.fillStyle = "rgba(202,160,92,0.6)";
        ctx.font = "10px ui-monospace, monospace";
        ctx.fillText(y, x - 14, cy + 26);
      });
      // current-time marker
      if (opts.timeAt) {
        const minD = new Date("2019-01-01").getTime();
        const maxD = new Date("2021-06-01").getTime();
        const tx = 80 + ((new Date(opts.timeAt).getTime() - minD) / (maxD - minD)) * (W - 160);
        const mg = ctx.createLinearGradient(tx, 0, tx, H);
        mg.addColorStop(0, "rgba(202,160,92,0)");
        mg.addColorStop(0.5, "rgba(202,160,92,0.35)");
        mg.addColorStop(1, "rgba(202,160,92,0)");
        ctx.strokeStyle = mg;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(tx, 0); ctx.lineTo(tx, H);
        ctx.stroke();
      }
    }

    // Causal chain spine — glowing arc connecting the retaliation nodes
    if (opts.causalHighlight || opts.stage.key === "settled") {
      const chainNodes = CAUSAL_NODES.map(id => sim.nodes.find(n => n.id === id)).filter(n => n && n.visible);
      if (chainNodes.length >= 2) {
        const t = opts.now / 1000;
        const pulseAlpha = opts.causalHighlight ? 0.6 + Math.sin(t * 2) * 0.2 : 0.18;
        ctx.save();
        ctx.shadowColor = C.brassLight;
        ctx.shadowBlur = opts.causalHighlight ? 18 : 6;
        ctx.strokeStyle = `rgba(233, 207, 149, ${pulseAlpha})`;
        ctx.lineWidth = opts.causalHighlight ? 2.4 : 1.6;
        ctx.beginPath();
        ctx.moveTo(chainNodes[0].x, chainNodes[0].y);
        for (let i = 1; i < chainNodes.length; i++) {
          const a = chainNodes[i - 1], b = chainNodes[i];
          // Quadratic curve through midpoint with a small lift for elegance
          const mx = (a.x + b.x) / 2;
          const my = (a.y + b.y) / 2 - 12;
          ctx.quadraticCurveTo(mx, my, b.x, b.y);
        }
        ctx.stroke();
        ctx.restore();
      }
    }

    // Edges
    const { nodes, edges } = sim;
    for (const e of edges) {
      const a = e._a, b = e._b;
      if (!a.visible || !b.visible) continue;
      // hide ambient mention edges until settled to keep early stages clean
      if (e.ambient && opts.stage.key !== "settled" && opts.stage.key !== "privilege") continue;
      // hide time-mode edges that span beyond timeAt
      if (a._afterTime || b._afterTime) continue;
      const dim = (a.dim && b.dim);
      const alpha = Math.min(a.alpha, b.alpha);
      const causal = isCausalEdge(e);
      const baseAlpha = e.ambient ? 0.07 : (dim ? 0.05 : 0.55);
      ctx.globalAlpha = baseAlpha * alpha;
      if (e.type === "citation") {
        ctx.strokeStyle = e.verified ? C.verify : C.flag;
        ctx.lineWidth = e.verified ? 1.6 : 1;
        if (!e.verified) ctx.setLineDash([4, 3]);
      } else if (e.type === "supports") {
        ctx.strokeStyle = e.verified ? "rgba(95, 188, 138, 0.7)" : "rgba(225, 162, 88, 0.55)";
        ctx.lineWidth = 1.8;
        if (!e.verified) ctx.setLineDash([3, 3]);
      } else if (e.type === "thread") {
        ctx.strokeStyle = "rgba(202, 160, 92, 0.7)";
        ctx.lineWidth = 1.2;
      } else if (e.type === "timeline") {
        ctx.strokeStyle = "rgba(143, 154, 167, 0.4)";
        ctx.lineWidth = 0.8;
      } else if (e.type === "relation") {
        ctx.strokeStyle = "rgba(122, 168, 232, 0.55)";
        ctx.lineWidth = 1.1;
      } else if (e.type === "author") {
        ctx.strokeStyle = "rgba(122, 168, 232, 0.45)";
        ctx.lineWidth = 0.9;
      } else if (e.type === "mention") {
        ctx.strokeStyle = e.ambient ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.18)";
        ctx.lineWidth = 0.7;
      } else {
        ctx.strokeStyle = "rgba(255,255,255,0.18)";
        ctx.lineWidth = 0.8;
      }
      // emphasize causal edges
      if (causal && opts.causalHighlight) {
        ctx.lineWidth += 0.6;
        ctx.globalAlpha = Math.min(1, ctx.globalAlpha * 1.5);
      }
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.globalAlpha = 1;

    // Particles flowing along verified edges
    particles.forEach((p) => {
      const a = p.edge._a, b = p.edge._b;
      if (!a.visible || !b.visible) return;
      const t = p.t;
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t;
      const trail = 8;
      const x2 = a.x + (b.x - a.x) * Math.max(0, t - 0.05);
      const y2 = a.y + (b.y - a.y) * Math.max(0, t - 0.05);
      ctx.save();
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 2.2;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(x, y, 1.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    // Node glow halos
    for (const n of nodes) {
      if (!n.visible || n._afterTime) continue;
      const s = styleOf(n);
      if (s.glow > 0) {
        const a = n.alpha * (n.dim ? 0.25 : (n.id === opts.selectedId ? 1 : 0.85));
        const causal = isCausalNode(n);
        const boost = (opts.causalHighlight && causal) ? 1.4 : 1;
        const gg = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, s.glow * boost);
        gg.addColorStop(0, hexA(s.fill, 0.55 * a));
        gg.addColorStop(1, hexA(s.fill, 0));
        ctx.fillStyle = gg;
        ctx.beginPath();
        ctx.arc(n.x, n.y, s.glow * boost, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Node cores
    for (const n of nodes) {
      if (!n.visible || n._afterTime) continue;
      const s = styleOf(n);
      const a = n.alpha * (n.dim ? 0.3 : 1);
      ctx.globalAlpha = a;
      if (s.ring) {
        ctx.strokeStyle = s.ring;
        ctx.lineWidth = s.dashed ? 1.4 : 1.8;
        if (s.dashed) ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.arc(n.x, n.y, s.r + 2.4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.fillStyle = s.fill;
      ctx.beginPath();
      ctx.arc(n.x, n.y, s.r, 0, Math.PI * 2);
      ctx.fill();
      // sheen
      if (!n.ambient) {
        ctx.fillStyle = "rgba(255,255,255,0.18)";
        ctx.beginPath();
        ctx.arc(n.x - s.r * 0.3, n.y - s.r * 0.3, s.r * 0.35, 0, Math.PI * 2);
        ctx.fill();
      }
      if (s.locked) {
        ctx.strokeStyle = "rgba(8,14,22,0.85)";
        ctx.lineWidth = 1.2;
        ctx.strokeRect(n.x - 2.2, n.y - 1, 4.4, 3.4);
        ctx.beginPath();
        ctx.arc(n.x, n.y - 1, 2, Math.PI, 0);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // Selection emphasis
    const sel = opts.selectedId && sim.nodes.find((n) => n.id === opts.selectedId);
    if (sel && sel.visible) drawSelection(ctx, sel, opts.now);

    // Hover ring
    const hov = opts.hoverId && sim.nodes.find((n) => n.id === opts.hoverId);
    if (hov && hov.visible && hov.id !== opts.selectedId) {
      const s = styleOf(hov);
      ctx.strokeStyle = "rgba(255,255,255,0.55)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(hov.x, hov.y, s.r + 7, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Labels for non-ambient nodes
    if (opts.showLabels) {
      for (const n of nodes) {
        if (!n.visible || n.ambient || n._afterTime) continue;
        const s = styleOf(n);
        const a = n.alpha * (n.dim ? 0.3 : 1);
        const causal = isCausalNode(n) && opts.causalHighlight;
        const ly = n.y - s.r - 8;
        let text = n.label;
        if (n.kind === "claim") text = "▲ " + (n.label.length > 32 ? n.label.slice(0, 30) + "…" : n.label);
        else if (n.kind === "defense") text = "▽ " + (n.label.length > 28 ? n.label.slice(0, 26) + "…" : n.label);
        else if (n.kind === "entity") text = n.label;
        else if (n.kind === "event") text = "✦ " + n.label;
        ctx.font = (n.kind === "claim" || n.kind === "defense") ? "600 11px Inter, sans-serif" :
                   (n.kind === "entity") ? "500 11px Inter, sans-serif" :
                   "11px ui-monospace, 'JetBrains Mono', monospace";
        ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
        const tw = ctx.measureText(text).width;
        // Backdrop pill
        ctx.globalAlpha = a * 0.7;
        ctx.fillStyle = causal ? "rgba(122, 91, 33, 0.92)" : "rgba(8, 14, 22, 0.85)";
        roundRect(ctx, n.x - tw / 2 - 6, ly - 11, tw + 12, 14, 4);
        ctx.fill();
        if (causal) {
          ctx.strokeStyle = "rgba(233, 207, 149, 0.7)";
          ctx.lineWidth = 0.8;
          ctx.stroke();
        }
        ctx.globalAlpha = a * 0.95;
        ctx.fillStyle = n.kind === "claim" ? C.brassLight :
                         n.kind === "defense" ? "#aab4bf" :
                         n.kind === "entity" ? "#cfe0f6" :
                         n.kind === "event" ? (n.event.accepted ? "#bfeacf" : "#f0c486") :
                         n.hot ? C.brassLight : "#cdd5de";
        ctx.fillText(text, n.x, ly);
        ctx.textAlign = "start";
        ctx.globalAlpha = 1;
      }
    }
  }

  function drawSelection(ctx, n, now) {
    const s = styleOf(n);
    const t = now / 1000;
    for (let i = 0; i < 3; i++) {
      const phase = (t + i * 0.33) % 1;
      const r = s.r + 6 + phase * 36;
      ctx.strokeStyle = "rgba(233, 207, 149, " + (0.55 * (1 - phase)).toFixed(3) + ")";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function hexA(hex, a) {
    if (hex.startsWith("rgba")) return hex.replace(/,[^,]+\)$/, "," + a + ")");
    const h = hex.replace("#", "");
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return "rgba(" + r + "," + g + "," + b + "," + a + ")";
  }

  window.BrainStages = STAGES;
  window.BrainCausalNodes = CAUSAL_NODES;
})();
