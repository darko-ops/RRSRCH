import React, { useState, useEffect, useRef } from 'react';

// Murmuration Component (converted to JS)
function Murmuration() {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const cfgRef = useRef({
    count: 200,
    perception: 52,
    separationDist: 18,
    maxSpeed: 2.2,
    maxForce: 0.045,
    weights: { align: 0.8, cohere: 0.65, separate: 1.6, mouse: 0.3, noise: 0.08 },
    trails: true,
    wrap: true,
    mouseMode: "attract",
  });

  const stateRef = useRef(null);

  const rand = (min, max) => Math.random() * (max - min) + min;
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

  function limit2D(vx, vy, max) {
    const s = vx * vx + vy * vy;
    if (s > max * max) {
      const k = max / Math.sqrt(s);
      return [vx * k, vy * k];
    }
    return [vx, vy];
  }

  function hashNoise(x, y, t) {
    const h = Math.sin(x * 0.013 + y * 0.017 + t * 0.0017) * 43758.5453;
    return (h - Math.floor(h)) * 2 - 1;
  }

  const resetBoids = (count = cfgRef.current.count) => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const width = Math.floor(cvs.clientWidth * dpr);
    const height = Math.floor(cvs.clientHeight * dpr);
    cvs.width = width;
    cvs.height = height;

    const n = Math.max(8, Math.floor(count));
    const x = new Float32Array(n);
    const y = new Float32Array(n);
    const vx = new Float32Array(n);
    const vy = new Float32Array(n);
    const ax = new Float32Array(n);
    const ay = new Float32Array(n);

    for (let i = 0; i < n; i++) {
      x[i] = rand(0, width);
      y[i] = rand(0, height);
      const ang = rand(-Math.PI, Math.PI);
      const sp = rand(0.5, cfgRef.current.maxSpeed);
      vx[i] = Math.cos(ang) * sp;
      vy[i] = Math.sin(ang) * sp;
      ax[i] = 0;
      ay[i] = 0;
    }

    const cell = Math.max(16, cfgRef.current.perception);
    const cols = Math.max(1, Math.floor(width / cell));
    const rows = Math.max(1, Math.floor(height / cell));
    const grid = new Array(cols * rows);
    for (let i = 0; i < grid.length; i++) grid[i] = [];

    stateRef.current = {
      x, y, vx, vy, ax, ay, n, width, height, grid, cols, rows, cell,
      mouse: { x: width * 0.5, y: height * 0.5, down: false },
      lastT: performance.now(),
    };
  };

  const rebuildGrid = () => {
    const st = stateRef.current;
    if (!st) return;
    const { x, y, grid, cols, rows, cell, n } = st;
    for (let i = 0; i < grid.length; i++) grid[i].length = 0;
    for (let i = 0; i < n; i++) {
      let cx = Math.floor(x[i] / cell);
      let cy = Math.floor(y[i] / cell);
      if (cx < 0) cx = 0; else if (cx >= cols) cx = cols - 1;
      if (cy < 0) cy = 0; else if (cy >= rows) cy = rows - 1;
      grid[cx + cy * cols].push(i);
    }
  };

  const loop = () => {
    const cvs = canvasRef.current;
    const ctx = cvs?.getContext("2d");
    const st = stateRef.current;
    if (!cvs || !ctx || !st) return;

    const cfg = cfgRef.current;
    const now = performance.now();
    let dt = Math.min(0.032, (now - st.lastT) / 1000);
    st.lastT = now;

    rebuildGrid();

    const { x, y, vx, vy, ax, ay, n } = st;
    const perc = cfg.perception;
    const sepDist = cfg.separationDist;
    const maxSp = cfg.maxSpeed;
    const maxF = cfg.maxForce;

    for (let i = 0; i < n; i++) { ax[i] = 0; ay[i] = 0; }

    const neigh = (i, fn) => {
      const cx = Math.floor(x[i] / st.cell);
      const cy = Math.floor(y[i] / st.cell);
      for (let oy = -1; oy <= 1; oy++) {
        const yy = cy + oy; if (yy < 0 || yy >= st.rows) continue;
        for (let ox = -1; ox <= 1; ox++) {
          const xx = cx + ox; if (xx < 0 || xx >= st.cols) continue;
          const bucket = st.grid[xx + yy * st.cols];
          for (let k = 0; k < bucket.length; k++) {
            const j = bucket[k];
            if (j === i) continue;
            const dx = x[j] - x[i];
            const dy = y[j] - y[i];
            const d2 = dx * dx + dy * dy;
            if (d2 <= perc * perc) fn(j, dx, dy, d2);
          }
        }
      }
    };

    for (let i = 0; i < n; i++) {
      let count = 0;
      let sumVX = 0, sumVY = 0;
      let sumX = 0, sumY = 0;
      let sepX = 0, sepY = 0;

      neigh(i, (j, dx, dy, d2) => {
        count++;
        sumVX += vx[j]; sumVY += vy[j];
        sumX += x[j]; sumY += y[j];
        if (d2 < sepDist * sepDist && d2 > 0.0001) {
          const inv = 1 / Math.sqrt(d2);
          sepX -= dx * inv;
          sepY -= dy * inv;
        }
      });

      let steerX = 0, steerY = 0;

      if (count > 0) {
        let axx = sumVX / count - vx[i];
        let ayy = sumVY / count - vy[i];
        [axx, ayy] = limit2D(axx, ayy, maxF);
        steerX += axx * cfg.weights.align;
        steerY += ayy * cfg.weights.align;

        let cx = sumX / count - x[i];
        let cy = sumY / count - y[i];
        const clen = Math.hypot(cx, cy) || 1;
        cx = (cx / clen) * maxSp - vx[i];
        cy = (cy / clen) * maxSp - vy[i];
        [cx, cy] = limit2D(cx, cy, maxF);
        steerX += cx * cfg.weights.cohere;
        steerY += cy * cfg.weights.cohere;

        let sx = sepX, sy = sepY;
        const slen = Math.hypot(sx, sy) || 1;
        sx = (sx / slen) * maxSp - vx[i];
        sy = (sy / slen) * maxSp - vy[i];
        [sx, sy] = limit2D(sx, sy, maxF * 1.2);
        steerX += sx * cfg.weights.separate;
        steerY += sy * cfg.weights.separate;
      }

      if (cfg.mouseMode !== "off") {
        const mx = st.mouse.x - x[i];
        const my = st.mouse.y - y[i];
        const d2 = mx * mx + my * my;
        if (d2 > 1e-3) {
          const d = Math.sqrt(d2);
          let ux = mx / d, uy = my / d;
          if (cfg.mouseMode === "repel") { ux = -ux; uy = -uy; }
          const w = (st.mouse.down ? 1.5 : 1.0) * (1 / (1 + d * 0.01));
          let mxs = ux * maxSp * w - vx[i];
          let mys = uy * maxSp * w - vy[i];
          [mxs, mys] = limit2D(mxs, mys, maxF * 0.9);
          steerX += mxs * cfg.weights.mouse;
          steerY += mys * cfg.weights.mouse;
        }
      }

      const n = hashNoise(x[i], y[i], now) * cfg.weights.noise;
      steerX += n * 0.6;
      steerY -= n * 0.6;

      ax[i] += steerX; ay[i] += steerY;
    }

    for (let i = 0; i < n; i++) {
      let nvx = vx[i] + ax[i];
      let nvy = vy[i] + ay[i];
      [nvx, nvy] = limit2D(nvx, nvy, maxSp);
      vx[i] = nvx; vy[i] = nvy;

      x[i] += nvx * (dt * 60 * 0.9);
      y[i] += nvy * (dt * 60 * 0.9);

      if (cfg.wrap) {
        if (x[i] < 0) x[i] += st.width; else if (x[i] >= st.width) x[i] -= st.width;
        if (y[i] < 0) y[i] += st.height; else if (y[i] >= st.height) y[i] -= st.height;
      } else {
        if (x[i] < 0 || x[i] > st.width) { vx[i] *= -1; }
        if (y[i] < 0 || y[i] > st.height) { vy[i] *= -1; }
        x[i] = clamp(x[i], 0, st.width);
        y[i] = clamp(y[i], 0, st.height);
      }
    }

    if (cfg.trails) {
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "rgba(0,0,0,0.08)";
      ctx.fillRect(0, 0, st.width, st.height);
    } else {
      ctx.globalCompositeOperation = "source-over";
      ctx.clearRect(0, 0, st.width, st.height);
    }

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineWidth = 1;
    for (let i = 0; i < n; i++) {
      const sp = Math.hypot(vx[i], vy[i]);
      const len = clamp(sp * 2.2, 1.5, 4.0);
      const nx = vx[i] / (sp || 1);
      const ny = vy[i] / (sp || 1);
      const px = x[i];
      const py = y[i];
      ctx.beginPath();
      ctx.moveTo(px - nx * len * 0.8, py - ny * len * 0.8);
      ctx.lineTo(px + nx * len, py + ny * len);
      const glow = clamp((sp - 0.5) / (cfg.maxSpeed - 0.5 + 1e-6), 0, 1);
      ctx.strokeStyle = `rgba(180,180,200,${0.2 + glow * 0.3})`;
      ctx.stroke();
    }
    ctx.restore();

    rafRef.current = requestAnimationFrame(loop);
  };

  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;

    const ro = new ResizeObserver(() => resetBoids());
    ro.observe(cvs);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;

    const onMove = (e) => {
      const rect = cvs.getBoundingClientRect();
      const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
      const x = (e.clientX - rect.left) * dpr;
      const y = (e.clientY - rect.top) * dpr;
      if (stateRef.current) {
        stateRef.current.mouse.x = x;
        stateRef.current.mouse.y = y;
      }
    };
    const onDown = () => stateRef.current && (stateRef.current.mouse.down = true);
    const onUp = () => stateRef.current && (stateRef.current.mouse.down = false);
    
    cvs.addEventListener("pointermove", onMove);
    cvs.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    
    return () => {
      cvs.removeEventListener("pointermove", onMove);
      cvs.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  useEffect(() => {
    const onVis = () => {
      if (document.hidden) {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      } else {
        loop();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => {
    resetBoids();
    loop();
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 0,
        pointerEvents: 'none'
      }}
    />
  );
}

function App() {
  const [formData, setFormData] = useState({
    name: '',
    organization: '',
    email: '',
    note: ''
  });

  const handleInputChange = (e) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    console.log('Form submitted:', formData);
  };

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#000000',
      color: '#E0E0E0',
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", sans-serif',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Murmuration Background */}
      <Murmuration />
      
      {/* Content */}
      <div style={{ position: 'relative', zIndex: 1 }}>
        {/* Hero */}
        <section style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          padding: '2rem'
        }}>
          <div>
            <h1 style={{
              fontSize: '5rem',
              fontWeight: '300',
              color: '#FFFFFF',
              letterSpacing: '0.2em',
              marginBottom: '1rem',
              fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif'
            }}>
              RRSRCH
            </h1>
            <div style={{
              fontSize: '1.2rem',
              fontFamily: 'SF Mono, Monaco, "Cascadia Code", "Roboto Mono", Consolas, "Courier New", monospace',
              color: '#888888',
              letterSpacing: '0.1em',
              marginBottom: '4rem'
            }}>
              :research/intelligence
            </div>
            <h2 style={{
              fontSize: '1.6rem',
              fontWeight: '300',
              color: '#CCCCCC',
              marginBottom: '2rem',
              letterSpacing: '0.02em'
            }}>
              Clinical AI, Carefully Deployed
            </h2>
            <p style={{
              fontSize: '1rem',
              color: '#999999',
              maxWidth: '600px',
              margin: '0 auto 3rem',
              lineHeight: '1.6',
              fontWeight: '300'
            }}>
              We partner with hospitals to explore, validate, and operationalize responsible AI.
            </p>
            <div>
              <button style={{
                padding: '0.75rem 2rem',
                backgroundColor: '#1a1a1a',
                color: '#FFFFFF',
                border: '1px solid #333333',
                fontSize: '0.85rem',
                fontWeight: '400',
                letterSpacing: '0.1em',
                cursor: 'pointer',
                marginRight: '1rem',
                fontFamily: 'inherit'
              }}>
                START A CONVERSATION
              </button>
              <button style={{
                padding: '0.75rem 2rem',
                backgroundColor: 'transparent',
                color: '#CCCCCC',
                border: '1px solid #666666',
                fontSize: '0.85rem',
                fontWeight: '400',
                letterSpacing: '0.1em',
                cursor: 'pointer',
                fontFamily: 'inherit'
              }}>
                CONTACT
              </button>
            </div>
          </div>
        </section>

        {/* What We Do */}
        <section style={{
          padding: '5rem 2rem',
          borderTop: '1px solid #1a1a1a',
          textAlign: 'center'
        }}>
          <h2 style={{
            fontSize: '2.2rem',
            fontWeight: '300',
            color: '#FFFFFF',
            marginBottom: '3rem',
            letterSpacing: '0.05em'
          }}>
            What we do
          </h2>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
            gap: '3rem',
            maxWidth: '1000px',
            margin: '0 auto'
          }}>
            <div>
              <div style={{width: '4px', height: '4px', backgroundColor: '#444', margin: '0 auto 1.5rem', borderRadius: '50%'}}></div>
              <h3 style={{color: '#FFFFFF', marginBottom: '0.8rem', fontSize: '1rem', fontWeight: '400', letterSpacing: '0.05em'}}>Applied research</h3>
              <p style={{color: '#999999', fontWeight: '300'}}>with clear clinical goals.</p>
            </div>
            <div>
              <div style={{width: '4px', height: '4px', backgroundColor: '#444', margin: '0 auto 1.5rem', borderRadius: '50%'}}></div>
              <h3 style={{color: '#FFFFFF', marginBottom: '0.8rem', fontSize: '1rem', fontWeight: '400', letterSpacing: '0.05em'}}>Measured pilots</h3>
              <p style={{color: '#999999', fontWeight: '300'}}>with defined success criteria.</p>
            </div>
            <div>
              <div style={{width: '4px', height: '4px', backgroundColor: '#444', margin: '0 auto 1.5rem', borderRadius: '50%'}}></div>
              <h3 style={{color: '#FFFFFF', marginBottom: '0.8rem', fontSize: '1rem', fontWeight: '400', letterSpacing: '0.05em'}}>Responsible rollout</h3>
              <p style={{color: '#999999', fontWeight: '300'}}>aligned with your governance.</p>
            </div>
          </div>
        </section>

        {/* How We Work */}
        <section style={{
          padding: '5rem 2rem',
          borderTop: '1px solid #1a1a1a',
          textAlign: 'center'
        }}>
          <h2 style={{
            fontSize: '2.2rem',
            fontWeight: '300',
            color: '#FFFFFF',
            marginBottom: '3rem',
            letterSpacing: '0.05em'
          }}>
            How we work
          </h2>
          <div style={{display: 'flex', justifyContent: 'center', gap: '3rem', marginBottom: '2rem', flexWrap: 'wrap'}}>
            {['Discover', 'Pilot', 'Evaluate', 'Scale'].map((step, index) => (
              <div key={step} style={{textAlign: 'center'}}>
                <div style={{
                  color: '#555555',
                  fontFamily: 'SF Mono, Monaco, "Cascadia Code", monospace',
                  fontSize: '0.8rem',
                  marginBottom: '0.5rem',
                  letterSpacing: '0.1em'
                }}>
                  0{index + 1}
                </div>
                <div style={{
                  color: '#FFFFFF',
                  fontWeight: '300',
                  letterSpacing: '0.05em',
                  fontSize: '0.9rem'
                }}>
                  {step}
                </div>
              </div>
            ))}
          </div>
          <p style={{color: '#999999', maxWidth: '600px', margin: '0 auto', fontWeight: '300'}}>
            Simple, outcome-first engagements with clear checkpoints.
          </p>
        </section>

        {/* Principles */}
        <section style={{
          padding: '5rem 2rem',
          borderTop: '1px solid #1a1a1a',
          textAlign: 'center'
        }}>
          <h2 style={{
            fontSize: '2.2rem',
            fontWeight: '300',
            color: '#FFFFFF',
            marginBottom: '3rem',
            letterSpacing: '0.05em'
          }}>
            Principles
          </h2>
          <div style={{display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: '2rem'}}>
            {['Privacy-first', 'Safety-by-design', 'Human-in-the-loop', 'Transparent results'].map((principle) => (
              <span key={principle} style={{color: '#888888', fontSize: '0.9rem', fontWeight: '300'}}>• {principle}</span>
            ))}
          </div>
        </section>

        {/* Who We Serve */}
        <section style={{
          padding: '5rem 2rem',
          borderTop: '1px solid #1a1a1a',
          textAlign: 'center'
        }}>
          <h2 style={{
            fontSize: '2.2rem',
            fontWeight: '300',
            color: '#FFFFFF',
            marginBottom: '3rem',
            letterSpacing: '0.05em'
          }}>
            Who we serve
          </h2>
          <div style={{display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: '2rem'}}>
            {['Hospitals', 'Academic medical centers', 'Reference labs'].map((client) => (
              <span key={client} style={{color: '#888888', fontSize: '0.9rem', fontWeight: '300'}}>• {client}</span>
            ))}
          </div>
        </section>

        {/* Contact */}
        <section style={{
          padding: '5rem 2rem',
          borderTop: '1px solid #1a1a1a',
          textAlign: 'center'
        }}>
          <h2 style={{
            fontSize: '2.2rem',
            fontWeight: '300',
            color: '#FFFFFF',
            marginBottom: '3rem',
            letterSpacing: '0.05em'
          }}>
            Get in touch
          </h2>
          <div style={{maxWidth: '500px', margin: '0 auto'}}>
            <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem'}}>
              <div>
                <label style={{display: 'block', color: '#888888', fontSize: '0.8rem', marginBottom: '0.5rem', textAlign: 'left', fontWeight: '300'}}>Name</label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    backgroundColor: '#0a0a0a',
                    border: '1px solid #222222',
                    color: '#FFFFFF',
                    fontSize: '0.9rem',
                    fontFamily: 'inherit',
                    fontWeight: '300'
                  }}
                />
              </div>
              <div>
                <label style={{display: 'block', color: '#888888', fontSize: '0.8rem', marginBottom: '0.5rem', textAlign: 'left', fontWeight: '300'}}>Organization</label>
                <input
                  type="text"
                  name="organization"
                  value={formData.organization}
                  onChange={handleInputChange}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    backgroundColor: '#0a0a0a',
                    border: '1px solid #222222',
                    color: '#FFFFFF',
                    fontSize: '0.9rem',
                    fontFamily: 'inherit',
                    fontWeight: '300'
                  }}
                />
              </div>
            </div>
            <label style={{display: 'block', color: '#888888', fontSize: '0.8rem', marginBottom: '0.5rem', textAlign: 'left', fontWeight: '300'}}>Email</label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleInputChange}
              style={{
                width: '100%',
                padding: '0.75rem',
                backgroundColor: '#0a0a0a',
                border: '1px solid #222222',
                color: '#FFFFFF',
                fontSize: '0.9rem',
                marginBottom: '1rem',
                fontFamily: 'inherit',
                fontWeight: '300'
              }}
            />
            <label style={{display: 'block', color: '#888888', fontSize: '0.8rem', marginBottom: '0.5rem', textAlign: 'left', fontWeight: '300'}}>Brief note</label>
            <textarea
              name="note"
              value={formData.note}
              onChange={handleInputChange}
              style={{
                width: '100%',
                padding: '0.75rem',
                backgroundColor: '#0a0a0a',
                border: '1px solid #222222',
                color: '#FFFFFF',
                fontSize: '0.9rem',
                marginBottom: '1rem',
                resize: 'vertical',
                minHeight: '100px',
                fontFamily: 'inherit',
                fontWeight: '300'
              }}
              placeholder="Tell us about your needs..."
            />
            <button
              onClick={handleSubmit}
              style={{
                width: '100%',
                padding: '0.75rem 2rem',
                backgroundColor: '#1a1a1a',
                color: '#FFFFFF',
                border: '1px solid #333333',
                fontSize: '0.85rem',
                fontWeight: '400',
                letterSpacing: '0.1em',
                cursor: 'pointer',
                fontFamily: 'inherit'
              }}
            >
              SUBMIT
            </button>
          </div>
        </section>

        <footer style={{
          padding: '2rem',
          borderTop: '1px solid #1a1a1a',
          textAlign: 'center',
          color: '#555555',
          fontFamily: 'SF Mono, Monaco, "Cascadia Code", monospace',
          fontSize: '0.75rem',
          fontWeight: '300'
        }}>
          <p>&copy; 2025 RRSRCH. Advancing healthcare through responsible AI.</p>
        </footer>
      </div>
    </div>
  );
}

export default App;
