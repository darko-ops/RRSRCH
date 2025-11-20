import React, { useState, useRef, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Sphere, Stars, Grid } from '@react-three/drei';
import * as THREE from 'three';
import { Mail, MessageCircle, FileText, X, Twitter, ArrowRight } from 'lucide-react';

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

function NewsItem({ date, title, excerpt }) {
  return (
    <div style={{ marginBottom: '40px', borderBottom: '1px solid #222', paddingBottom: '30px' }}>
      <div style={{ 
        fontSize: '11px', 
        color: '#666', 
        marginBottom: '12px', 
        fontFamily: theme.fonts.mono 
      }}>
        {date}
      </div>
      <h3 style={{ 
        margin: '0 0 15px 0', 
        fontSize: '24px', 
        color: '#fff', 
        fontWeight: 400,
        letterSpacing: '-0.02em' 
      }}>
        {title}
      </h3>
      <p style={{ 
        fontSize: '15px', 
        lineHeight: '1.7', 
        color: '#888', 
        margin: '0 0 20px 0',
        maxWidth: '90%'
      }}>
        {excerpt}
      </p>
      <button style={{
        background: 'none',
        border: 'none',
        color: '#fff',
        fontSize: '12px',
        display: 'flex',
        alignItems: 'center',
        gap: '5px',
        padding: 0,
        cursor: 'pointer',
        textTransform: 'uppercase',
        letterSpacing: '1px'
      }}>
        Read Report <ArrowRight size={12} />
      </button>
    </div>
  );
}

function TwitterFeed() {
  return (
    <div style={{ 
      background: 'rgba(20,20,20,0.5)', 
      border: '1px solid #222',
      padding: '20px',
      backdropFilter: 'blur(10px)'
    }}>
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: '10px', 
        marginBottom: '20px', 
        paddingBottom: '15px',
        borderBottom: '1px solid #333' 
      }}>
        <Twitter size={16} color="#1DA1F2" />
        <span style={{ fontSize: '12px', fontWeight: 600, color: '#fff' }}>LATEST UPDATES</span>
      </div>
      
      {[1, 2, 3, 4].map(i => (
        <div key={i} style={{ marginBottom: '25px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#fff' }}>@RRSRCH_LAB</span>
            <span style={{ fontSize: '11px', color: '#666' }}>{i}h ago</span>
          </div>
          <p style={{ fontSize: '13px', lineHeight: '1.5', color: '#aaa', margin: 0 }}>
            Deployment of Node {840 + i} successful. Latency reduced by 15% across the western cluster. Continuing observation. #AI #Infra
          </p>
        </div>
      ))}
    </div>
  );
}

function App() {
  const [activeModal, setActiveModal] = useState(null);
  const scrollRef = useRef(0);
  const scrollContainerRef = useRef(null);

  // Handle Scroll for 3D Fade effect without causing re-renders
  useEffect(() => {
    const handleScroll = () => {
      if (scrollContainerRef.current) {
        const scrollTop = scrollContainerRef.current.scrollTop;
        const windowHeight = window.innerHeight;
        // Calculate progress: 0 at top, 1 after scrolling one screen height
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
      case 'subscribe':
        return (
          <div style={{ textAlign: 'center' }}>
            <Mail size={40} style={{ marginBottom: '20px', color: '#fff' }} />
            <h2 style={{ margin: '0 0 10px 0', fontSize: '20px' }}>Join the Network</h2>
            <p style={{ color: '#888', marginBottom: '30px' }}>Receive encrypted transmissions directly to your inbox.</p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <input 
                type="email" 
                placeholder="email@address.com" 
                style={{ 
                  background: 'transparent', 
                  border: '1px solid #333', 
                  padding: '12px', 
                  color: 'white',
                  fontFamily: theme.fonts.mono,
                  flex: 1
                }} 
              />
              <button style={{ 
                background: 'white', 
                color: 'black', 
                border: 'none', 
                padding: '12px 24px', 
                fontWeight: 'bold',
                cursor: 'pointer' 
              }}>CONNECT</button>
            </div>
          </div>
        );
      case 'discord':
        return (
          <div style={{ textAlign: 'center' }}>
            <MessageCircle size={40} style={{ marginBottom: '20px', color: '#5865F2' }} />
            <h2 style={{ margin: '0 0 10px 0', fontSize: '20px' }}>Community Hub</h2>
            <p style={{ color: '#888', marginBottom: '30px' }}>Join 5,000+ researchers in our secure channel.</p>
            <button style={{ 
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
      case 'substack':
        return (
          <div style={{ textAlign: 'center' }}>
            <FileText size={40} style={{ marginBottom: '20px', color: '#FF6719' }} />
            <h2 style={{ margin: '0 0 10px 0', fontSize: '20px' }}>Deep Dives & Reports</h2>
            <p style={{ color: '#888', marginBottom: '30px' }}>Long-form analysis and research papers published weekly.</p>
            <button style={{ 
              background: '#FF6719', 
              color: 'white', 
              border: 'none', 
              padding: '12px 30px', 
              fontWeight: 'bold',
              cursor: 'pointer'
            }}>
              READ ON SUBSTACK
            </button>
          </div>
        );
      default: return null;
    }
  };

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', background: 'black' }}>
      {/* 3D Background Layer - Fixed */}
      <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100vh', zIndex: 10, pointerEvents: 'none' }}>
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
        
        {/* Top Navigation (Fixed visual position) */}
        <div style={{ 
          position: 'fixed', 
          top: '40px', 
          right: '40px', 
          display: 'flex', 
          gap: '15px',
          zIndex: 10
        }}>
          <NavButton onClick={() => setActiveModal('subscribe')} icon={Mail} label="Subscribe" />
          <NavButton onClick={() => setActiveModal('discord')} icon={MessageCircle} label="Discord" />
          <NavButton onClick={() => setActiveModal('substack')} icon={FileText} label="Substack" />
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
          INNOVATING NEWS FOR <br />
          THE COMING WORLD.
          </p>
        </div>

        {/* Main Content Layout with Background Panel */}
        <div style={{
          maxWidth: '1200px',
          width: '100%',
          margin: '0 auto',
          padding: '60px 40px',
          display: 'grid',
          gridTemplateColumns: '2fr 1fr', // 2/3 News, 1/3 Sticky Right
          gap: '60px',
          minHeight: '100vh',
          position: 'relative', // Context for sticky
          zIndex: 5,
          background: 'rgba(22, 22, 22, 0.85)',
          borderRadius: '24px',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255, 255, 255, 0.05)',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)'
        }}>
          
          {/* Left Column: News Feed */}
          <div>
            <h2 style={{ 
              fontSize: '14px', 
              color: '#444', 
              borderBottom: '1px solid #222', 
              paddingBottom: '10px', 
              marginBottom: '30px',
              letterSpacing: '1px',
              textTransform: 'uppercase'
            }}>
              Latest Transmissions
            </h2>
            
            {/* Generated News Items to fill scroll */}
            {[1, 2, 3, 4, 5, 6].map((item) => (
               <NewsItem 
                key={item}
                date={`2023.11.${30-item}`}
                title={item % 2 === 0 ? "Network Protocol Update" : "Cognitive Shard Expansion"}
                excerpt="Analysis of the current vector space indicates a significant improvement in query resolution times. All nodes are reporting nominal efficiency."
              />
            ))}
          </div>

          {/* Right Column: Sticky Sidebar */}
          <div style={{ position: 'relative' }}>
             <div style={{ position: 'sticky', top: '40px' }}>
               <TwitterFeed />
               
               <div style={{ marginTop: '40px', border: '1px solid #222', padding: '20px', background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(10px)' }}>
                 <h3 style={{ margin: '0 0 15px 0', fontSize: '14px', color: '#fff' }}>LABORATORY STATUS</h3>
                 <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontSize: '13px' }}>
                   <span style={{ color: '#666' }}>Active Nodes</span>
                   <span style={{ color: '#fff', fontFamily: theme.fonts.mono }}>8,492</span>
                 </div>
                 <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontSize: '13px' }}>
                   <span style={{ color: '#666' }}>Total Compute</span>
                   <span style={{ color: '#fff', fontFamily: theme.fonts.mono }}>42.8 PF</span>
                 </div>
                 <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                   <span style={{ color: '#666' }}>Uptime</span>
                   <span style={{ color: '#00ff00', fontFamily: theme.fonts.mono }}>99.99%</span>
                 </div>
               </div>
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
