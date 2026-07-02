import React, { useState, useRef, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Sphere, Stars, Grid } from '@react-three/drei';
import * as THREE from 'three';
import { MessageCircle, X, Twitter, ArrowRight, Search, Github, Database, Zap, Shield, Terminal as TerminalIcon, Clock } from 'lucide-react';

// Product / deploy config
const REPO_URL = 'https://github.com/darko-ops/RRSRCH';
const WAITLIST_EMAIL = 'demetri@rrsrch.com';

// Theme Configuration
const theme = {
  colors: {
    background: '#000000',
    primary: '#ffffff',
    secondary: '#888888',
    accent: '#333333',
    grid: '#222222',
    text: '#e0e0e0',
  },
  fonts: {
    main: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
    mono: '"JetBrains Mono", monospace',
  }
};

// --- 3D Components ---

function WireframePlanet({ scrollRef }) {
  const groupRef = useRef();
  const orbitingSphereRef = useRef();

  useFrame(({ clock }) => {
    if (groupRef.current) {
      // Constant rotation regardless of scroll
      groupRef.current.rotation.y = clock.getElapsedTime() * 0.05;
      groupRef.current.rotation.z = Math.sin(clock.getElapsedTime() * 0.1) * 0.1;

      // Smoothly interpolate scroll for opacity/scale effect
      // We read directly from the ref to avoid React renders
      const progress = scrollRef.current;
      // Keep minimum scale at 0.3 (30% of original size) so sphere doesn't fully disappear
      const opacity = Math.max(0.2, 1 - progress * 1.5);

      // Apply scale
      groupRef.current.scale.setScalar(opacity);
    }

    // Animate orbiting sphere along the first ring
    if (orbitingSphereRef.current) {
      const time = clock.getElapsedTime();
      const radius = 3.525; // Middle of the first ring (3.5 + 3.55) / 2
      const speed = 0.5;

      orbitingSphereRef.current.position.x = Math.cos(time * speed) * radius;
      orbitingSphereRef.current.position.z = Math.sin(time * speed) * radius;
      orbitingSphereRef.current.position.y = 0;
    }
  });

  return (
    <group ref={groupRef} rotation={[0.5, 0, 0]}>
      {/* Outer Wireframe Sphere */}
      <Sphere args={[2.5, 32, 32]}>
        <meshBasicMaterial
          color="#ffffff"
          wireframe
          transparent
          opacity={0.15}
        />
      </Sphere>

      {/* Inner Denser Wireframe */}
      <Sphere args={[2.0, 48, 48]}>
        <meshBasicMaterial
          color="#444444"
          wireframe
          transparent
          opacity={0.1}
        />
      </Sphere>

      {/* Solid Core for depth occlusion */}
      <Sphere args={[2.2, 32, 32]}>
        <meshBasicMaterial color="#000000" />
      </Sphere>

      {/* Orbital Rings */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[3.5, 3.55, 64]} />
        <meshBasicMaterial color="#333333" side={THREE.DoubleSide} transparent opacity={0.5} />
      </mesh>
      <mesh rotation={[Math.PI / 3, 0, 0]}>
        <ringGeometry args={[4.2, 4.22, 64]} />
        <meshBasicMaterial color="#222222" side={THREE.DoubleSide} transparent opacity={0.3} />
      </mesh>

      {/* Orbiting Small Sphere */}
      <mesh ref={orbitingSphereRef} rotation={[Math.PI / 2, 0, 0]}>
        <Sphere args={[0.15, 16, 16]}>
          <meshBasicMaterial color="#222222" />
        </Sphere>
      </mesh>
    </group>
  );
}

function GridFloor({ scrollRef }) {
    const gridRef = useRef();

    useFrame(() => {
        if (gridRef.current && scrollRef.current !== undefined) {
             const progress = scrollRef.current;
             // Keep minimum opacity at 0.2 (20%) so grid never fully disappears
             const opacity = Math.max(0.5, 1 - progress * 1.5);

             // Grid always stays visible
             gridRef.current.visible = true;
             // Scale down the grid slightly as we scroll but keep it visible
             gridRef.current.scale.setScalar(opacity);
        }
    });

    return (
        <group ref={gridRef}>
             <Grid
                position={[0, -4, 0]}
                args={[60, 60]}
                cellSize={1}
                cellThickness={1}
                cellColor="#222222"
                sectionSize={5}
                sectionThickness={1.5}
                sectionColor="#444444"
                fadeDistance={50}
                infiniteGrid
             />
        </group>
    );
}

function DistantGalaxies({ scrollRef }) {
    const groupRef = useRef();

    useFrame(() => {
        if (groupRef.current) {
             const progress = scrollRef.current;
             const opacity = Math.min(1, progress * 2);
             
             // Traverse and set opacity
             groupRef.current.traverse((child) => {
                 if (child.material) {
                     child.material.opacity = opacity * (child.userData.baseOpacity || 0.3);
                     child.visible = opacity > 0.01;
                 }
             });
        }
    });

    return (
        <group ref={groupRef}>
             {[...Array(5)].map((_, i) => (
                <group key={i} position={[
                    (Math.random() - 0.5) * 40,
                    (Math.random() - 0.5) * 40,
                    -10 - Math.random() * 20
                ]}>
                     <Sphere args={[0.5, 8, 8]}>
                        <meshBasicMaterial 
                            color="#333" 
                            wireframe 
                            transparent 
                            opacity={0} 
                            userData={{ baseOpacity: 0.3 }}
                        />
                     </Sphere>
                     <mesh rotation={[Math.PI/2, 0, 0]}>
                        <ringGeometry args={[0.8, 0.85, 32]} />
                        <meshBasicMaterial 
                            color="#222" 
                            side={THREE.DoubleSide} 
                            transparent 
                            opacity={0}
                            userData={{ baseOpacity: 0.2 }} 
                        />
                     </mesh>
                </group>
            ))}
        </group>
    )
}

function Scene({ scrollRef }) {
  return (
    <>
      <color attach="background" args={['#000000']} />
      <ambientLight intensity={0.2} />
      
      <GridFloor scrollRef={scrollRef} />
      <WireframePlanet scrollRef={scrollRef} />
      
      <Stars 
        radius={100} 
        depth={50} 
        count={3000} 
        factor={4} 
        saturation={0} 
        fade 
        speed={0} 
      />
      
      <DistantGalaxies scrollRef={scrollRef} />
      
      <OrbitControls 
        enableZoom={false} 
        enablePan={false}
        enableRotate={false} 
      />
    </>
  );
}

// --- UI Components --- (Unchanged)

function Modal({ isOpen, onClose, children }) {
  if (!isOpen) return null;

  return (
    <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
      width: '100vw',
      height: '100vh',
      background: 'rgba(0,0,0,0.8)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100
    }}>
      <div style={{
        background: 'rgba(10,10,10,0.95)',
        border: '1px solid #333',
        padding: '40px',
        maxWidth: '500px',
        width: '90%',
        position: 'relative',
        color: 'white'
      }}>
        <button 
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '20px',
            right: '20px',
            background: 'none',
            border: 'none',
            color: '#666',
            cursor: 'pointer'
          }}
        >
          <X size={24} />
        </button>
        {children}
      </div>
    </div>
  );
}

function NavButton({ onClick, icon: Icon, label }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'transparent',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '24px',
        color: '#aaa',
        padding: '10px 20px',
        cursor: 'pointer',
        fontFamily: theme.fonts.main,
        fontSize: '12px',
        textTransform: 'uppercase',
        letterSpacing: '1px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        transition: 'all 0.2s ease',
        backdropFilter: 'blur(5px)'
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
        e.currentTarget.style.color = 'white';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.color = '#aaa';
      }}
    >
      <Icon size={14} />
      {label}
    </button>
  );
}

// --- Product Explainer (the backpack) ---

function Eyebrow({ children }) {
  return (
    <div style={{
      fontSize: '12px',
      color: '#00ff88',
      letterSpacing: '2px',
      textTransform: 'uppercase',
      fontFamily: theme.fonts.mono,
      marginBottom: '18px',
      opacity: 0.8
    }}>
      {children}
    </div>
  );
}

function CodeBlock({ children }) {
  return (
    <pre style={{
      background: '#0a0a0a',
      border: '1px solid #1e1e1e',
      borderRadius: '10px',
      padding: '18px 20px',
      margin: 0,
      fontFamily: theme.fonts.mono,
      fontSize: '13px',
      lineHeight: '1.7',
      color: '#d0d0d0',
      overflowX: 'auto',
      whiteSpace: 'pre'
    }}>
      {children}
    </pre>
  );
}

function ProductExplainer({ isMobile }) {
  const [email, setEmail] = useState('');

  const sectionGap = isMobile ? '64px' : '96px';
  const heading = {
    fontSize: isMobile ? '26px' : 'clamp(28px, 3.4vw, 40px)',
    color: '#fff',
    fontWeight: 800,
    lineHeight: 1.1,
    margin: '0 0 20px 0',
    letterSpacing: '-0.02em',
    fontFamily: theme.fonts.main
  };
  const body = {
    color: '#8a8a8a',
    fontSize: isMobile ? '15px' : '17px',
    lineHeight: 1.7,
    maxWidth: '640px',
    margin: 0,
    fontFamily: theme.fonts.main
  };
  const card = {
    background: 'rgba(0,0,0,0.3)',
    border: '1px solid #222',
    borderRadius: '14px',
    padding: '24px'
  };

  const joinWaitlist = () => {
    const subject = encodeURIComponent('Backpack — hosted waitlist');
    const bodyText = encodeURIComponent(`Add me to the hosted backpack waitlist.\n\nEmail: ${email || '(your email)'}\n`);
    window.location.href = `mailto:${WAITLIST_EMAIL}?subject=${subject}&body=${bodyText}`;
  };

  const steps = [
    {
      icon: Search,
      verb: 'search()',
      title: 'Ask before you research',
      text: 'Query the backpack first. If the answer is already known, your agent gets it back in a fraction of the tokens — no re-derivation.'
    },
    {
      icon: Database,
      verb: 'deposit()',
      title: 'Write back what you learned',
      text: 'Findings go into the shared memory with their source attached, so the next agent — yours or a teammate’s — never starts cold.'
    },
    {
      icon: Shield,
      verb: 'confidence',
      title: 'Trust what you retrieve',
      text: 'Every entry carries a confidence and freshness signal, so agents know what to rely on and what to re-verify.'
    }
  ];

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto' }}>

      {/* 1 — What it is */}
      <section style={{ marginBottom: sectionGap }}>
        <Eyebrow>What it is</Eyebrow>
        <h2 style={{ ...heading, fontSize: isMobile ? '30px' : 'clamp(32px, 4.2vw, 52px)', maxWidth: '820px' }}>
          A shared memory so your agents stop re-researching what&rsquo;s already known.
        </h2>
        <p style={{ ...body, maxWidth: '680px' }}>
          The backpack is a context-pack engine: a search-and-deposit memory your agents read from
          before they work and write back to when they&rsquo;re done. One corpus, many agents, no cold starts.
        </p>
      </section>

      {/* 2 — The problem */}
      <section style={{ marginBottom: sectionGap }}>
        <Eyebrow>The problem</Eyebrow>
        <h2 style={heading}>Agents burn ~90k tokens re-deriving the same answer.</h2>
        <p style={body}>
          Every agent starts cold. There&rsquo;s no shared, trustworthy memory between runs, between tools,
          or between teammates — so the same research gets done again and again, and you pay for it every time.
          The knowledge exists; it just isn&rsquo;t anywhere the next agent can reach.
        </p>
      </section>

      {/* 3 — How it works */}
      <section style={{ marginBottom: sectionGap }}>
        <Eyebrow>How it works</Eyebrow>
        <h2 style={heading}>Two verbs, one shared memory.</h2>
        <p style={{ ...body, marginBottom: '36px' }}>
          Agents <strong style={{ color: '#ccc', fontWeight: 600 }}>search</strong> the backpack before
          researching and <strong style={{ color: '#ccc', fontWeight: 600 }}>deposit</strong> what they
          learn after. Confidence and freshness ride along so retrieval stays trustworthy.
        </p>
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
          gap: '16px',
          marginBottom: '28px'
        }}>
          {steps.map(({ icon: Icon, verb, title, text }) => (
            <div key={verb} style={card}>
              <Icon size={20} color="#00ff88" style={{ marginBottom: '16px' }} />
              <div style={{ fontFamily: theme.fonts.mono, fontSize: '13px', color: '#00ff88', marginBottom: '10px' }}>{verb}</div>
              <div style={{ color: '#fff', fontSize: '15px', fontWeight: 600, marginBottom: '10px' }}>{title}</div>
              <div style={{ color: '#7a7a7a', fontSize: '13px', lineHeight: 1.6 }}>{text}</div>
            </div>
          ))}
        </div>
        <CodeBlock>{`search("H100 vs MI300X inference throughput")
  → hit · confidence 0.91 · fresh 3d · 1.2k tokens

deposit(finding, source, confidence)
  → stored · now warm for the next agent`}</CodeBlock>
      </section>

      {/* 4 — Why it's useful */}
      <section style={{ marginBottom: sectionGap }}>
        <Eyebrow>Why it&rsquo;s useful</Eyebrow>
        <h2 style={heading}>Measured against re-researching from scratch.</h2>
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
          gap: '16px',
          marginBottom: '20px'
        }}>
          <div style={{ ...card, padding: '32px' }}>
            <div style={{ fontSize: isMobile ? '44px' : '56px', fontWeight: 800, color: '#fff', lineHeight: 1, letterSpacing: '-0.03em' }}>~66%</div>
            <div style={{ color: '#9a9a9a', fontSize: '15px', marginTop: '12px' }}>fewer tokens on average</div>
          </div>
          <div style={{ ...card, padding: '32px' }}>
            <div style={{ fontSize: isMobile ? '44px' : '56px', fontWeight: 800, color: '#00ff88', lineHeight: 1, letterSpacing: '-0.03em' }}>~97%</div>
            <div style={{ color: '#9a9a9a', fontSize: '15px', marginTop: '12px' }}>fewer on warm topics</div>
          </div>
        </div>
        <p style={{ ...body, fontSize: '14px', color: '#666' }}>
          In our tests, from live telemetry. &ldquo;Warm topics&rdquo; are ones already deposited in the
          backpack — the more your agents use it, the more of your work is warm.
        </p>
      </section>

      {/* 5 — How to connect */}
      <section style={{ marginBottom: sectionGap }}>
        <Eyebrow>How to connect</Eyebrow>
        <h2 style={heading}>It&rsquo;s an MCP server. Point your agents at it.</h2>
        <p style={{ ...body, marginBottom: '36px' }}>
          The backpack speaks the Model Context Protocol, so any MCP-capable agent — Claude Code,
          Claude Desktop, your own runner — gets <code style={{ fontFamily: theme.fonts.mono, color: '#00ff88', fontSize: '0.9em' }}>search</code> and <code style={{ fontFamily: theme.fonts.mono, color: '#00ff88', fontSize: '0.9em' }}>deposit</code> as tools.
          The engine ships as <code style={{ fontFamily: theme.fonts.mono, color: '#00ff88', fontSize: '0.9em' }}>rrsrch</code> — that&rsquo;s the server name and CLI you&rsquo;ll see below.
        </p>

        {/* Self-host (today) */}
        <div style={{ ...card, marginBottom: '16px', padding: isMobile ? '20px' : '28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
            <TerminalIcon size={18} color="#00ff88" />
            <span style={{ color: '#fff', fontSize: '16px', fontWeight: 700 }}>Run it yourself</span>
            <span style={{ fontFamily: theme.fonts.mono, fontSize: '11px', color: '#00ff88', border: '1px solid rgba(0,255,136,0.3)', borderRadius: '100px', padding: '3px 10px' }}>AVAILABLE TODAY</span>
          </div>
          <p style={{ color: '#7a7a7a', fontSize: '14px', lineHeight: 1.6, margin: '0 0 20px 0' }}>
            Self-host the corpus and point your own agents at it. Cheap, private, and generating your own memory from day one.
          </p>
          <div style={{ display: 'grid', gap: '14px' }}>
            <CodeBlock>{`$ git clone ${REPO_URL}.git
$ cd RRSRCH/rrsrch && make up   # Postgres + pgvector + API on :8000`}</CodeBlock>
            <CodeBlock>{`// claude_desktop_config.json   (after: pip install -e .  in rrsrch/)
{
  "mcpServers": {
    "rrsrch": {
      "command": "rrsrch-mcp",
      "env": {
        "RRSRCH_STORE": "postgres",
        "RRSRCH_DATABASE_URL": "postgresql+asyncpg://rrsrch:rrsrch@localhost:5432/rrsrch"
      }
    }
  }
}`}</CodeBlock>
          </div>
          <div style={{ display: 'flex', gap: '12px', marginTop: '22px', flexWrap: 'wrap' }}>
            <a href={REPO_URL} target="_blank" rel="noreferrer" style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              background: '#fff', color: '#000', textDecoration: 'none',
              padding: '11px 20px', borderRadius: '8px', fontSize: '14px', fontWeight: 700
            }}>
              <Github size={16} /> Clone the repo
            </a>
            <a href={`${REPO_URL}#readme`} target="_blank" rel="noreferrer" style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              background: 'transparent', color: '#ccc', textDecoration: 'none',
              padding: '11px 20px', borderRadius: '8px', fontSize: '14px', fontWeight: 600,
              border: '1px solid #333'
            }}>
              Read the docs <ArrowRight size={15} />
            </a>
          </div>
        </div>

        {/* Hosted (waitlist) */}
        <div style={{ ...card, padding: isMobile ? '20px' : '28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
            <Clock size={18} color="#888" />
            <span style={{ color: '#fff', fontSize: '16px', fontWeight: 700 }}>Hosted corpus</span>
            <span style={{ fontFamily: theme.fonts.mono, fontSize: '11px', color: '#888', border: '1px solid #333', borderRadius: '100px', padding: '3px 10px' }}>COMING SOON</span>
          </div>
          <p style={{ color: '#7a7a7a', fontSize: '14px', lineHeight: 1.6, margin: '0 0 20px 0' }}>
            A shared, multi-tenant corpus with attestation — so you can trust memory your own agents didn&rsquo;t write. Join the waitlist and we&rsquo;ll reach out.
          </p>
          <div style={{ display: 'flex', gap: '10px', flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              onKeyDown={(e) => { if (e.key === 'Enter') joinWaitlist(); }}
              style={{
                flex: 1, minWidth: isMobile ? '100%' : '220px',
                background: '#0a0a0a', border: '1px solid #333', borderRadius: '8px',
                padding: '12px 14px', color: '#fff', fontSize: '14px', outline: 'none',
                fontFamily: theme.fonts.mono
              }}
            />
            <button onClick={joinWaitlist} style={{
              background: 'transparent', color: '#00ff88', border: '1px solid rgba(0,255,136,0.4)',
              borderRadius: '8px', padding: '12px 22px', fontSize: '14px', fontWeight: 700,
              cursor: 'pointer', whiteSpace: 'nowrap', width: isMobile ? '100%' : 'auto'
            }}>
              Notify me
            </button>
          </div>
        </div>
      </section>

      {/* 6 — Who it's for / trust */}
      <section>
        <Eyebrow>Who it&rsquo;s for</Eyebrow>
        <h2 style={heading}>Built for agents — and the developers who point them.</h2>
        <p style={{ ...body, marginBottom: '28px' }}>
          The users here aren&rsquo;t people browsing; they&rsquo;re agents and their operators. That changes
          what &ldquo;trustworthy&rdquo; has to mean — memory you didn&rsquo;t write yourself still has to be safe to act on.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px' }}>
          <div style={card}>
            <Zap size={20} color="#00ff88" style={{ marginBottom: '14px' }} />
            <div style={{ color: '#fff', fontSize: '15px', fontWeight: 600, marginBottom: '8px' }}>Freshness, not just recall</div>
            <div style={{ color: '#7a7a7a', fontSize: '13px', lineHeight: 1.6 }}>Entries are timestamped and freshness-scored, so agents re-verify stale facts instead of trusting them blindly.</div>
          </div>
          <div style={card}>
            <Shield size={20} color="#00ff88" style={{ marginBottom: '14px' }} />
            <div style={{ color: '#fff', fontSize: '15px', fontWeight: 600, marginBottom: '8px' }}>Attestation on the hosted corpus</div>
            <div style={{ color: '#7a7a7a', fontSize: '13px', lineHeight: 1.6 }}>Shared memory carries provenance you can check — the difference between a cache and a corpus you can rely on.</div>
          </div>
        </div>
      </section>

    </div>
  );
}

function App() {
  const [activeModal, setActiveModal] = useState(null);
  const [menuExpanded, setMenuExpanded] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const scrollRef = useRef(0);
  const scrollContainerRef = useRef(null);

  // Handle window resize for mobile detection
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Handle Scroll for 3D Fade effect without causing re-renders
  useEffect(() => {
    const handleScroll = () => {
      if (scrollContainerRef.current) {
        const scrollTop = scrollContainerRef.current.scrollTop;
        const windowHeight = window.innerHeight;
        const progress = Math.min(Math.max(scrollTop / windowHeight, 0), 1);
        scrollRef.current = progress;
      }
    };
    const container = scrollContainerRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll);
      handleScroll(); // Init
    }
    return () => container?.removeEventListener('scroll', handleScroll);
  }, []);

  const renderModalContent = () => {
    switch(activeModal) {
      case 'discord':
        return (
          <div style={{ textAlign: 'center' }}>
            <MessageCircle size={40} style={{ marginBottom: '20px', color: '#5865F2' }} />
            <h2 style={{ margin: '0 0 10px 0', fontSize: '20px' }}>Community Hub</h2>
            <p style={{ color: '#888', marginBottom: '30px' }}>Join 5,000+ researchers in our secure channel.</p>
            <button
              onClick={() => window.open('https://discord.gg/4XK2Df5b', '_blank')}
              style={{
                background: '#5865F2',
                color: 'white',
                border: 'none',
                padding: '12px 30px',
                fontWeight: 'bold',
                cursor: 'pointer'
              }}>
              LAUNCH DISCORD
            </button>
          </div>
        );
      case 'disclaimer':
        return (
          <div style={{ maxWidth: '700px', textAlign: 'left', maxHeight: '70vh', overflowY: 'auto' }}>
            <h2 style={{ margin: '0 0 30px 0', fontSize: '24px', textAlign: 'center', position: 'sticky', top: 0, background: '#161616', paddingBottom: '20px', zIndex: 1 }}>RRSRCH.com Disclaimer</h2>
            <div style={{ fontSize: '14px', lineHeight: '1.8', color: '#aaa', paddingRight: '10px' }}>
              <p>
                The information provided on RRSRCH.com ("RRSRCH," "we," "our," or "the Site") is for general informational and educational purposes only. While we strive to cover developments across technology, artificial intelligence, science, markets, and related fields with accuracy and clarity, all content is provided "as is" and without any guarantees of completeness, timeliness, or accuracy.
              </p>
              <p>
                Nothing on this website constitutes professional, legal, financial, investment, or trading advice. RRSRCH does not provide financial advice, investment recommendations, or individualized guidance of any kind. Any market analysis, commentary, or opinions expressed are strictly for informational purposes and should not be interpreted as a suggestion to buy, sell, or hold any security, cryptocurrency, or asset. You are solely responsible for evaluating the risks and conducting your own due diligence before making any financial or business decisions.
              </p>
              <p>
                RRSRCH assumes no responsibility or liability for any errors, omissions, losses, or damages resulting from the use of the Site, reliance on its content, or the interpretation of any analysis or commentary. All views expressed on this Site or associated social platforms are subject to change at any time without notice.
              </p>
              <p>
                By using RRSRCH.com, you agree that your use of the Site is at your own risk and that you will not hold RRSRCH, its contributors, or its affiliates liable for any decisions or outcomes related to the information provided.
              </p>
              <p style={{ marginBottom: 0 }}>
                If you require financial, legal, or professional advice, please consult a qualified professional.
              </p>
            </div>
          </div>
        );
      default: return null;
    }
  };

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', background: 'black' }}>
      {/* 3D Background Layer - Fixed */}
      <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100vh', zIndex: 1 }}>
        <Canvas camera={{ position: [0, 1, 6], fov: 50 }} frameloop="always">
          <Scene scrollRef={scrollRef} />
        </Canvas>
      </div>

      {/* Fade overlay based on scroll - Re-introduced separate div for background darkening if needed, or we just rely on 3D scene fading */}

      {/* Scrollable Content Layer */}
      <div
        ref={scrollContainerRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          zIndex: 2,
          overflowY: 'auto',
          fontFamily: theme.fonts.main,
          scrollBehavior: 'smooth'
        }}
      >
        {/* Top Navigation (Fixed position) */}
        <div style={{
          position: 'fixed',
          top: isMobile ? '20px' : '40px',
          right: isMobile ? '20px' : '40px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: '10px',
          zIndex: 10
        }}>
          {/* More button */}
          <NavButton
            onClick={() => setMenuExpanded(!menuExpanded)}
            icon={ArrowRight}
            label={menuExpanded ? "Close" : "More"}
          />

          {/* Expanded menu */}
          {menuExpanded && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              animation: 'slideIn 0.2s ease-out'
            }}>
              <NavButton onClick={() => { window.open(REPO_URL, '_blank'); setMenuExpanded(false); }} icon={Github} label="GitHub" />
              <NavButton onClick={() => { setActiveModal('discord'); setMenuExpanded(false); }} icon={MessageCircle} label="Discord" />
              <NavButton onClick={() => { window.open('https://x.com/rrsrch', '_blank'); setMenuExpanded(false); }} icon={Twitter} label="X" />
            </div>
          )}
        </div>

        {/* Hero Section - Full Screen */}
        <div style={{
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end', // Pushed to bottom
          alignItems: 'flex-start',
          paddingBottom: '15vh', // Spacing from bottom
          paddingLeft: '60px',
          textAlign: 'left'
        }}>
           <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '20px',
            padding: '5px 10px',
            background: 'rgba(255,255,255,0.05)',
            borderRadius: '100px',
            backdropFilter: 'blur(5px)'
          }}>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#00ff00', boxShadow: '0 0 8px #00ff00' }}></div>
            <span style={{ color: '#888', fontSize: '11px', fontFamily: theme.fonts.mono }}>SYSTEM ONLINE</span>
          </div>

          <div style={{ display: 'inline-block' }}>
            <p style={{ color: 'white', margin: '0 0 4px 0', fontSize: '13px', lineHeight: '1.5', fontWeight: 'bold', fontFamily: theme.fonts.main, textAlign: 'right' }}>
            : INTELLIGENCE / RESEARCH
            </p>
            <h1 style={{
              fontSize: 'clamp(40px, 6vw, 80px)',
              fontWeight: 800,
              color: 'white',
              margin: 0,
              letterSpacing: '-0.1em',
              lineHeight: 0.9,
              fontFamily: theme.fonts.main
            }}>
              RRSRCH
            </h1>
          </div>

          <p style={{ color: '#666', marginTop: '18px', fontSize: '18px', maxWidth: '450px', lineHeight: '1.5', fontWeight: 'bold', fontFamily: theme.fonts.main }}>
          SHARED MEMORY FOR <br />
          YOUR AGENTS.
          </p>
        </div>

        {/* Spacer to delay panel appearance and allow sphere to shrink fully visible */}
        <div style={{ height: '13vh' }}></div>

        {/* Main Content Layout with Background Panel */}
        <div style={{
          maxWidth: '1200px',
          width: '100%',
          margin: '0 auto',
          padding: isMobile ? '40px 20px' : '60px 40px',
          minHeight: '100vh',
          position: 'relative',
          zIndex: 5,
          background: 'rgba(22, 22, 22, 0.85)',
          borderRadius: isMobile ? '16px' : '24px',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255, 255, 255, 0.05)',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)'
        }}>

          <ProductExplainer isMobile={isMobile} />

          {/* Footer */}
          <div style={{
            marginTop: '60px',
            paddingTop: '30px',
            borderTop: '1px solid #222',
            textAlign: 'center',
            fontSize: '12px',
            color: '#666'
          }}>
            <button
              onClick={() => setActiveModal('disclaimer')}
              style={{
                background: 'none',
                border: 'none',
                color: '#666',
                fontSize: '12px',
                cursor: 'pointer',
                textDecoration: 'underline',
                fontFamily: theme.fonts.main
              }}
              onMouseEnter={(e) => e.currentTarget.style.color = '#aaa'}
              onMouseLeave={(e) => e.currentTarget.style.color = '#666'}
            >
              Disclaimer
            </button>
            <div style={{ marginTop: '10px', fontSize: '11px' }}>
              © {new Date().getFullYear()} RRSRCH.com
            </div>
          </div>
        </div>

        <div style={{ height: '100px' }}></div>
      </div>

      {/* Modal Layer */}
      <Modal isOpen={!!activeModal} onClose={() => setActiveModal(null)}>
        {renderModalContent()}
      </Modal>
    </div>
  );
}

export default App;
