import React, { useState, useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Sphere, Stars, Grid } from '@react-three/drei';
import * as THREE from 'three';
import { Activity, Mail, MessageCircle, FileText } from 'lucide-react';

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

// Dither Shader Material
const DitherMaterial = {
  uniforms: {
    uTime: { value: 0 },
    uColor: { value: new THREE.Color('#ffffff') },
    uLightPos: { value: new THREE.Vector3(10, 10, 10) }
  },
  vertexShader: `
    varying vec3 vNormal;
    varying vec3 vPosition;
    void main() {
      vNormal = normalize(normalMatrix * normal);
      vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    varying vec3 vNormal;
    varying vec3 vPosition;
    
    uniform vec3 uColor;
    uniform float uTime;
    uniform vec3 uLightPos;
    
    const float PI = 3.14159265359;

    // 8x8 Bayer Matrix
    const mat4 bayer8_0 = mat4(
      0.0/64.0, 32.0/64.0, 8.0/64.0, 40.0/64.0,
      48.0/64.0, 16.0/64.0, 56.0/64.0, 24.0/64.0,
      12.0/64.0, 44.0/64.0, 4.0/64.0, 36.0/64.0,
      60.0/64.0, 28.0/64.0, 52.0/64.0, 20.0/64.0
    );
    
    const mat4 bayer8_1 = mat4(
      3.0/64.0, 35.0/64.0, 11.0/64.0, 43.0/64.0,
      51.0/64.0, 19.0/64.0, 59.0/64.0, 27.0/64.0,
      15.0/64.0, 47.0/64.0, 7.0/64.0, 39.0/64.0,
      63.0/64.0, 31.0/64.0, 55.0/64.0, 23.0/64.0
    );
    // Note: GLSL ES 1.0 / WebGL 1.0 doesn't support array indexing easily for matrices or huge arrays in older versions.
    // We will use a simpler procedural Bayer function or a texture. 
    // For simplicity and compatibility in raw GLSL string, let's use a coordinate based logic or a simpler 4x4 manual check.

    float dither4x4(vec2 position) {
      int x = int(mod(position.x, 4.0));
      int y = int(mod(position.y, 4.0));
      
      int index = x + y * 4;
      
      float limit = 0.0;
      
      if (x < 2) {
        if (y < 2) {
          if (index == 0) limit = 0.0625;
          if (index == 1) limit = 0.5625;
          if (index == 4) limit = 0.1875;
          if (index == 5) limit = 0.6875;
        } else { // y >= 2
          if (index == 8) limit = 0.8125;
          if (index == 9) limit = 0.3125;
          if (index == 12) limit = 0.9375;
          if (index == 13) limit = 0.4375;
        }
      } else { // x >= 2
        if (y < 2) {
          if (index == 2) limit = 0.125;
          if (index == 3) limit = 0.625;
          if (index == 6) limit = 0.25;
          if (index == 7) limit = 0.75;
        } else { // y >= 2
          if (index == 10) limit = 0.875;
          if (index == 11) limit = 0.375;
          if (index == 14) limit = 1.0; // approx
          if (index == 15) limit = 0.5;
        }
      }
      return limit;
    }

    void main() {
      // Simple directional lighting
      vec3 lightDir = normalize(uLightPos - vPosition);
      float diff = max(dot(vNormal, lightDir), 0.0);
      
      // Add some ambient
      float lighting = diff + 0.1;
      
      // Screen coordinates for dithering
      vec2 screenPos = gl_FragCoord.xy;
      
      float ditherLimit = dither4x4(screenPos);
      
      // Quantize
      if (lighting < ditherLimit) {
        // Dark pixel (transparent or background color)
        // For a "wireframe-ish" or point-cloud look, we might want to discard.
        // But for solid dither, we output black (or background).
        // The user wants "dark mode", so black is good.
        // If we discard, we see stars behind.
        discard; 
      }
      
      gl_FragColor = vec4(uColor, 1.0);
    }
  `
};

function DitheredPlanet() {
  const meshRef = useRef();
  const materialRef = useRef();
  
  useFrame(({ clock }) => {
    if (meshRef.current) {
      meshRef.current.rotation.y = clock.getElapsedTime() * 0.1;
    }
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = clock.getElapsedTime();
    }
  });

  const shaderArgs = useMemo(() => ({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color('#ffffff') },
      uLightPos: { value: new THREE.Vector3(20, 5, 20) }
    },
    vertexShader: DitherMaterial.vertexShader,
    fragmentShader: DitherMaterial.fragmentShader
  }), []);

  return (
    <group>
      <Sphere ref={meshRef} args={[2, 64, 64]}>
        <shaderMaterial ref={materialRef} attach="material" args={[shaderArgs]} />
      </Sphere>
      {/* Optional: Second sphere for "moon" or detail */}
      <Sphere args={[0.5, 32, 32]} position={[3.5, 0, 0]} rotation={[0,0,0]}>
         <shaderMaterial attach="material" args={[shaderArgs]} />
      </Sphere>
    </group>
  );
}

function Scene() {
  return (
    <>
      <color attach="background" args={['#000000']} />
      <ambientLight intensity={0.2} />
      
      {/* Grid Floor - lighter and simpler */}
      <Grid 
        position={[0, -4, 0]} 
        args={[40, 40]} 
        cellSize={1} 
        cellThickness={1} 
        cellColor="#333333" 
        sectionSize={4} 
        sectionThickness={1.5} 
        sectionColor="#555555" 
        fadeDistance={40} 
        infiniteGrid 
      />
      
      {/* Subtle Stars */}
      <Stars radius={100} depth={50} count={2000} factor={4} saturation={0} fade speed={0.5} />
      
      <DitheredPlanet />
      
      <OrbitControls enableZoom={false} autoRotate autoRotateSpeed={0.5} />
    </>
  );
}

// UI Components
function TabButton({ active, onClick, icon: Icon, label }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
        border: 'none',
        borderBottom: active ? '2px solid white' : '2px solid transparent',
        color: active ? 'white' : '#666',
        padding: '12px 24px',
        cursor: 'pointer',
        fontFamily: theme.fonts.main,
        fontSize: '14px',
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        transition: 'all 0.2s ease',
        fontWeight: active ? 600 : 400
      }}
    >
      <Icon size={16} />
      {label}
    </button>
  );
}

function ContentSection({ activeTab }) {
  const contentStyle = {
    padding: '40px',
    maxWidth: '800px',
    width: '100%',
    color: theme.colors.text,
    fontFamily: theme.fonts.main,
    background: 'rgba(0, 0, 0, 0.8)',
    backdropFilter: 'blur(10px)',
    borderRadius: '0px',
    border: '1px solid #222',
    marginTop: '20px',
  };

  const headerStyle = {
    borderBottom: '1px solid #222',
    paddingBottom: '15px',
    marginBottom: '25px',
    fontSize: '20px',
    fontWeight: '300',
    color: '#fff',
    letterSpacing: '-0.02em'
  };

  switch (activeTab) {
    case 'news':
      return (
        <div style={contentStyle}>
          <h2 style={headerStyle}>Latest Intelligence</h2>
          {[1, 2].map((i) => (
            <div key={i} style={{ marginBottom: '30px', paddingBottom: i === 1 ? '30px' : 0, borderBottom: i === 1 ? '1px solid #111' : 'none' }}>
              <div style={{ fontSize: '11px', color: '#666', marginBottom: '8px', fontFamily: theme.fonts.mono }}>
                2023.11.{12 + i} // RELEASE_NOTE
              </div>
              <h3 style={{ margin: '0 0 10px 0', fontSize: '18px', color: '#fff', fontWeight: 500 }}>
                Model Architecture V{3 + i}.0 Alpha
              </h3>
              <p style={{ fontSize: '15px', lineHeight: '1.6', color: '#888', margin: 0 }}>
                Our latest parameter adjustment has yielded a 40% increase in cognitive reasoning tasks. Deployment to the grid scheduled for 0400 hours.
              </p>
            </div>
          ))}
        </div>
      );
    case 'subscribe':
      return (
        <div style={{ ...contentStyle, textAlign: 'center', padding: '60px 40px' }}>
          <Mail size={40} style={{ marginBottom: '20px', color: '#fff', strokeWidth: 1.5 }} />
          <h2 style={{ ...headerStyle, borderBottom: 'none', marginBottom: '10px' }}>Join the Network</h2>
          <p style={{ marginBottom: '40px', color: '#666', maxWidth: '400px', margin: '0 auto 40px' }}>
            Receive encrypted transmissions directly to your inbox. No spam, only signal.
          </p>
          <div style={{ display: 'flex', gap: '0px', justifyContent: 'center', maxWidth: '400px', margin: '0 auto' }}>
            <input 
              type="email" 
              placeholder="email@address.com" 
              style={{ 
                background: 'transparent', 
                border: '1px solid #333', 
                borderRight: 'none',
                padding: '16px', 
                color: 'white',
                fontFamily: theme.fonts.mono,
                width: '100%',
                outline: 'none',
                fontSize: '14px'
              }} 
            />
            <button style={{ 
              background: 'white', 
              color: 'black', 
              border: 'none', 
              padding: '0 30px', 
              fontWeight: '600',
              cursor: 'pointer',
              fontSize: '12px',
              letterSpacing: '1px',
              textTransform: 'uppercase'
            }}>Connect</button>
          </div>
        </div>
      );
    case 'discord':
      return (
        <div style={{ ...contentStyle, textAlign: 'center', padding: '60px 40px' }}>
          <MessageCircle size={40} style={{ marginBottom: '20px', color: '#fff', strokeWidth: 1.5 }} />
          <h2 style={{ ...headerStyle, borderBottom: 'none', marginBottom: '10px' }}>Community Hub</h2>
          <p style={{ marginBottom: '40px', color: '#666' }}>Join 5,000+ researchers in our secure channel.</p>
          <button style={{ 
            background: '#5865F2', 
            color: 'white', 
            border: 'none', 
            padding: '16px 40px', 
            fontWeight: '600',
            cursor: 'pointer',
            fontSize: '14px',
            letterSpacing: '0.5px'
          }}>
            LAUNCH DISCORD
          </button>
        </div>
      );
    case 'substack':
      return (
        <div style={{ ...contentStyle, textAlign: 'center', padding: '60px 40px' }}>
          <FileText size={40} style={{ marginBottom: '20px', color: '#fff', strokeWidth: 1.5 }} />
          <h2 style={{ ...headerStyle, borderBottom: 'none', marginBottom: '10px' }}>Deep Dives & Reports</h2>
          <p style={{ marginBottom: '40px', color: '#666' }}>Long-form analysis and research papers published weekly.</p>
          <button style={{ 
            background: '#FF6719', 
            color: 'white', 
            border: 'none', 
            padding: '16px 40px', 
            fontWeight: '600',
            cursor: 'pointer',
            fontSize: '14px',
            letterSpacing: '0.5px'
          }}>
            READ ON SUBSTACK
          </button>
        </div>
      );
    default:
      return null;
  }
}

function App() {
  const [activeTab, setActiveTab] = useState('news');

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', background: 'black', overflow: 'hidden' }}>
      {/* 3D Background */}
      <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 1 }}>
        <Canvas camera={{ position: [0, 2, 8], fov: 45 }}>
          <Scene />
        </Canvas>
      </div>

      {/* UI Overlay */}
      <div style={{ 
        position: 'absolute', 
        top: 0, 
        left: 0, 
        width: '100%', 
        height: '100%', 
        zIndex: 2,
        display: 'flex', 
        flexDirection: 'column',
        overflowY: 'auto',
        background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.8) 100%)'
      }}>
        {/* Hero Section */}
        <div style={{ 
          minHeight: '55vh', 
          display: 'flex', 
          flexDirection: 'column', 
          justifyContent: 'center', 
          alignItems: 'center',
          textAlign: 'center',
          pointerEvents: 'none',
          paddingTop: '60px'
        }}>
          <div style={{
            border: '1px solid rgba(255,255,255,0.15)',
            padding: '6px 12px',
            borderRadius: '100px',
            marginBottom: '30px',
            backdropFilter: 'blur(5px)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#00ff00', boxShadow: '0 0 5px #00ff00' }}></div>
            <span style={{ color: '#888', fontSize: '11px', letterSpacing: '0.05em', fontFamily: theme.fonts.mono }}>SYSTEM ONLINE</span>
          </div>

          <h1 style={{ 
            fontSize: 'clamp(50px, 8vw, 90px)', 
            fontWeight: '400', 
            color: 'white', 
            margin: '0 0 10px 0', 
            letterSpacing: '-0.04em',
            lineHeight: 0.95,
            fontFamily: theme.fonts.main
          }}>
            RRSRCH
          </h1>
          <p style={{ 
            color: '#666', 
            fontSize: '16px', 
            maxWidth: '500px',
            lineHeight: '1.5',
            marginBottom: '0',
            fontFamily: theme.fonts.main
          }}>
            Building the next generation of intelligent systems.<br/>
            Decentralized. Autonomous. Perpetual.
          </p>
        </div>

        {/* Navigation & Content */}
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center', 
          paddingTop: '20px',
          paddingBottom: '100px'
        }}>
          {/* Tabs */}
          <div style={{ 
            display: 'flex', 
            gap: '10px', 
            marginBottom: '40px', 
            background: 'rgba(20, 20, 20, 0.5)',
            padding: '5px',
            borderRadius: '8px',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255,255,255,0.05)'
          }}>
            <TabButton 
              active={activeTab === 'news'} 
              onClick={() => setActiveTab('news')} 
              icon={Activity} 
              label="News" 
            />
            <TabButton 
              active={activeTab === 'subscribe'} 
              onClick={() => setActiveTab('subscribe')} 
              icon={Mail} 
              label="Subscribe" 
            />
            <TabButton 
              active={activeTab === 'discord'} 
              onClick={() => setActiveTab('discord')} 
              icon={MessageCircle} 
              label="Discord" 
            />
            <TabButton 
              active={activeTab === 'substack'} 
              onClick={() => setActiveTab('substack')} 
              icon={FileText} 
              label="Substack" 
            />
          </div>

          {/* Tab Content */}
          <ContentSection activeTab={activeTab} />
        </div>
      </div>
    </div>
  );
}

export default App;
