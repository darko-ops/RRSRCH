import React, { useState, useRef, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Sphere, Stars, Grid } from '@react-three/drei';
import * as THREE from 'three';
import { Mail, MessageCircle, FileText, X, Twitter, ArrowRight, Search } from 'lucide-react';

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

function NewsItem({ date, title, excerpt, onClick }) {
  // Parse markdown-style bold text (**text**)
  const parseMarkdown = (text) => {
    if (!text) return '';

    const parts = text.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, index) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={index} style={{ color: '#fff', fontWeight: 600 }}>{part.slice(2, -2)}</strong>;
      }
      return <span key={index}>{part}</span>;
    });
  };

  // Check if excerpt is same as title (tidbit post)
  const isTidbit = !excerpt || excerpt.trim() === '' || excerpt.trim() === title.trim();

  return (
    <div
      style={{
        marginBottom: '40px',
        borderBottom: '1px solid #222',
        paddingBottom: '30px',
        cursor: isTidbit ? 'default' : 'pointer'
      }}
      onClick={isTidbit ? undefined : onClick}
    >
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
        {parseMarkdown(title)}
      </h3>
      {!isTidbit && (
        <>
          <p style={{
            fontSize: '15px',
            lineHeight: '1.7',
            color: '#888',
            margin: '0 0 20px 0',
            maxWidth: '90%'
          }}>
            {parseMarkdown(excerpt)}
          </p>
          <button
            onClick={(e) => { e.stopPropagation(); onClick(); }}
            style={{
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
            }}
          >
            Read Report <ArrowRight size={12} />
          </button>
        </>
      )}
    </div>
  );
}

function ArticleView({ post, onBack, relatedPosts }) {
  // Parse markdown-style bold text (**text**)
  const parseMarkdown = (text) => {
    if (!text) return '';

    const parts = text.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, index) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={index} style={{ color: '#fff', fontWeight: 600 }}>{part.slice(2, -2)}</strong>;
      }
      return <span key={index}>{part}</span>;
    });
  };

  return (
    <div>
      <button
        onClick={onBack}
        style={{
          background: 'none',
          border: 'none',
          color: '#666',
          fontSize: '12px',
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
          padding: '0 0 20px 0',
          cursor: 'pointer',
          textTransform: 'uppercase',
          letterSpacing: '1px',
          marginBottom: '20px'
        }}
      >
        <ArrowRight size={12} style={{ transform: 'rotate(180deg)' }} /> Back to Transmissions
      </button>

      <div style={{
        fontSize: '11px',
        color: '#666',
        marginBottom: '12px',
        fontFamily: theme.fonts.mono
      }}>
        {new Date(post.date).toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '.')}
      </div>

      <h1 style={{
        margin: '0 0 30px 0',
        fontSize: '36px',
        color: '#fff',
        fontWeight: 400,
        letterSpacing: '-0.02em',
        lineHeight: '1.2'
      }}>
        {post.title}
      </h1>

      <div style={{
        fontSize: '16px',
        lineHeight: '1.8',
        color: '#aaa',
        marginBottom: '60px',
        whiteSpace: 'pre-wrap'
      }}>
        {parseMarkdown(post.content || post.excerpt)}
      </div>

      {relatedPosts.length > 0 && (
        <div style={{ marginTop: '60px', paddingTop: '40px', borderTop: '1px solid #222' }}>
          <h3 style={{
            fontSize: '14px',
            color: '#444',
            marginBottom: '30px',
            letterSpacing: '1px',
            textTransform: 'uppercase'
          }}>
            Related Transmissions
          </h3>
          {relatedPosts.map((related) => (
            <div key={related.id} style={{ marginBottom: '20px', paddingBottom: '20px', borderBottom: '1px solid #111' }}>
              <div style={{ fontSize: '16px', color: '#fff', marginBottom: '8px' }}>{related.title}</div>
              <div style={{ fontSize: '13px', color: '#666' }}>{related.excerpt.substring(0, 100)}...</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LiveTable({ selectedTopic }) {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const isFirstFetch = useRef(true);

  useEffect(() => {
    const fetchAssets = async () => {
      try {
        // Only show loading on first fetch
        if (isFirstFetch.current) {
          setLoading(true);
        }

        // Fetch crypto data
        const cryptoIds = ['bitcoin', 'ethereum', 'solana', 'cardano', 'polkadot', 'dogecoin', 'ripple', 'litecoin'];
        const cryptoResponse = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${cryptoIds.join(',')}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true`);

        if (!cryptoResponse.ok) {
          throw new Error(`HTTP error! status: ${cryptoResponse.status}`);
        }

        const cryptoData = await cryptoResponse.json();

        // Check if we got valid data
        if (cryptoData && Object.keys(cryptoData).length > 0) {
          const formattedAssets = Object.entries(cryptoData).map(([id, data]) => ({
            symbol: id.toUpperCase().slice(0, 3),
            name: id.charAt(0).toUpperCase() + id.slice(1),
            price: data.usd || 0,
            change: data.usd_24h_change || 0,
            volume: data.usd_24h_vol || 0,
            type: 'crypto'
          }));

          setAssets(formattedAssets);
          setLastUpdate(new Date());
          isFirstFetch.current = false;
        }

        setLoading(false);
      } catch (err) {
        console.error('Error fetching asset data:', err);
        setLoading(false);
      }
    };

    fetchAssets();
    const interval = setInterval(fetchAssets, 10000); // 10 second auto-refresh
    return () => clearInterval(interval);
  }, [selectedTopic]);

  const formatPrice = (price) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(price);
  };

  const formatVolume = (volume) => {
    if (volume >= 1e9) return `$${(volume / 1e9).toFixed(2)}B`;
    if (volume >= 1e6) return `$${(volume / 1e6).toFixed(2)}M`;
    return `$${(volume / 1e3).toFixed(2)}K`;
  };

  const formatChange = (change) => {
    const sign = change >= 0 ? '+' : '';
    return `${sign}${change.toFixed(2)}%`;
  };

  const SkeletonRow = () => (
    <tr style={{ borderBottom: '1px solid #222' }}>
      {[1, 2, 3, 4].map(i => (
        <td key={i} style={{ padding: '15px 10px' }}>
          <div style={{
            height: '14px',
            background: 'rgba(255,255,255,0.05)',
            borderRadius: '4px',
            animation: 'pulse 1.5s ease-in-out infinite'
          }} />
        </td>
      ))}
    </tr>
  );

  return (
    <div>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '20px'
      }}>
        <h2 style={{
          fontSize: '18px',
          color: '#fff',
          fontWeight: 700,
          margin: 0
        }}>
          LIVE TERMINAL
        </h2>
        <div style={{
          fontSize: '11px',
          color: '#666',
          fontFamily: theme.fonts.mono
        }}>
          Updated: {lastUpdate.toLocaleTimeString()}
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontFamily: theme.fonts.mono
        }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #333' }}>
              <th style={{ padding: '12px 10px', textAlign: 'left', fontSize: '11px', color: '#666', fontWeight: 600, textTransform: 'uppercase' }}>Asset</th>
              <th style={{ padding: '12px 10px', textAlign: 'right', fontSize: '11px', color: '#666', fontWeight: 600, textTransform: 'uppercase' }}>Price</th>
              <th style={{ padding: '12px 10px', textAlign: 'right', fontSize: '11px', color: '#666', fontWeight: 600, textTransform: 'uppercase' }}>24h %</th>
              <th style={{ padding: '12px 10px', textAlign: 'right', fontSize: '11px', color: '#666', fontWeight: 600, textTransform: 'uppercase' }}>Volume</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <>
                <SkeletonRow />
                <SkeletonRow />
                <SkeletonRow />
                <SkeletonRow />
              </>
            ) : (
              assets.map((asset, index) => (
                <tr key={index} style={{ borderBottom: '1px solid #222' }}>
                  <td style={{ padding: '15px 10px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#fff' }}>{asset.symbol}</div>
                    <div style={{ fontSize: '11px', color: '#666' }}>{asset.name}</div>
                  </td>
                  <td style={{ padding: '15px 10px', textAlign: 'right', fontSize: '14px', color: '#fff' }}>
                    {formatPrice(asset.price)}
                  </td>
                  <td style={{
                    padding: '15px 10px',
                    textAlign: 'right',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: asset.change >= 0 ? '#00ff88' : '#ff4444'
                  }}>
                    {formatChange(asset.change)}
                  </td>
                  <td style={{ padding: '15px 10px', textAlign: 'right', fontSize: '13px', color: '#aaa' }}>
                    {formatVolume(asset.volume)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 0.6; }
        }
      `}</style>
    </div>
  );
}

function AtlasDashboard({ selectedTopic }) {
  const dashboardData = {
    'Models': [
      { rank: 1, name: 'GPT-4 Turbo', company: 'OpenAI', score: 86.4, change: '+2.1%' },
      { rank: 2, name: 'Claude 3 Opus', company: 'Anthropic', score: 84.9, change: '+1.8%' },
      { rank: 3, name: 'Gemini Ultra', company: 'Google', score: 83.7, change: '+0.5%' },
      { rank: 4, name: 'GPT-4', company: 'OpenAI', score: 83.1, change: '0%' },
      { rank: 5, name: 'Claude 3 Sonnet', company: 'Anthropic', score: 79.0, change: '+1.2%' },
    ],
    'GPUs': [
      { rank: 1, name: 'H100 SXM', company: 'NVIDIA', tflops: '1979', price: '$30k' },
      { rank: 2, name: 'MI300X', company: 'AMD', tflops: '1300', price: '$15k' },
      { rank: 3, name: 'H100 PCIe', company: 'NVIDIA', tflops: '1513', price: '$25k' },
      { rank: 4, name: 'A100 80GB', company: 'NVIDIA', tflops: '312', price: '$15k' },
      { rank: 5, name: 'L40S', company: 'NVIDIA', tflops: '362', price: '$10k' },
    ],
    'Companies': [
      { rank: 1, name: 'OpenAI', valuation: '$86B', employees: '750+', founded: '2015' },
      { rank: 2, name: 'Anthropic', valuation: '$18B', employees: '500+', founded: '2021' },
      { rank: 3, name: 'Cohere', valuation: '$2.2B', employees: '250+', founded: '2019' },
      { rank: 4, name: 'Mistral AI', valuation: '$2B', employees: '150+', founded: '2023' },
      { rank: 5, name: 'Stability AI', valuation: '$1B', employees: '200+', founded: '2020' },
    ],
    'Benchmarks': [
      { rank: 1, name: 'MMLU', category: 'Knowledge', tasks: 57, leader: 'GPT-4' },
      { rank: 2, name: 'HumanEval', category: 'Coding', tasks: 164, leader: 'GPT-4' },
      { rank: 3, name: 'MATH', category: 'Reasoning', tasks: 500, leader: 'Claude 3' },
      { rank: 4, name: 'GSM8K', category: 'Math', tasks: 8500, leader: 'GPT-4' },
      { rank: 5, name: 'HellaSwag', category: 'Common Sense', tasks: 10000, leader: 'GPT-4' },
    ],
    'Frameworks': [
      { rank: 1, name: 'PyTorch', downloads: '150M/mo', stars: '77k', language: 'Python' },
      { rank: 2, name: 'TensorFlow', downloads: '80M/mo', stars: '180k', language: 'Python' },
      { rank: 3, name: 'JAX', downloads: '8M/mo', stars: '28k', language: 'Python' },
      { rank: 4, name: 'Keras', downloads: '25M/mo', stars: '60k', language: 'Python' },
      { rank: 5, name: 'MXNet', downloads: '2M/mo', stars: '21k', language: 'Python' },
    ],
    'Chips': [
      { rank: 1, name: 'TPU v5e', company: 'Google', type: 'Training', efficiency: 'High' },
      { rank: 2, name: 'Trainium2', company: 'AWS', type: 'Training', efficiency: 'High' },
      { rank: 3, name: 'Inferentia2', company: 'AWS', type: 'Inference', efficiency: 'Very High' },
      { rank: 4, name: 'Gaudi2', company: 'Intel', type: 'Training', efficiency: 'Medium' },
      { rank: 5, name: 'TPU v4', company: 'Google', type: 'Training', efficiency: 'High' },
    ],
    'Research Labs': [
      { rank: 1, name: 'OpenAI', papers: 250, citations: '45k', focus: 'AGI' },
      { rank: 2, name: 'DeepMind', papers: 500, citations: '120k', focus: 'Reinforcement Learning' },
      { rank: 3, name: 'Meta AI (FAIR)', papers: 800, citations: '200k', focus: 'Open Research' },
      { rank: 4, name: 'Google Brain', papers: 600, citations: '180k', focus: 'Deep Learning' },
      { rank: 5, name: 'Microsoft Research', papers: 400, citations: '90k', focus: 'Applied AI' },
    ],
    'Founders': [
      { rank: 1, name: 'Sam Altman', company: 'OpenAI', role: 'CEO', background: 'Y Combinator' },
      { rank: 2, name: 'Dario Amodei', company: 'Anthropic', role: 'CEO', background: 'OpenAI VP' },
      { rank: 3, name: 'Demis Hassabis', company: 'DeepMind', role: 'CEO', background: 'Neuroscience' },
      { rank: 4, name: 'Ilya Sutskever', company: 'Safe Superintelligence', role: 'Co-Founder', background: 'OpenAI Chief Scientist' },
      { rank: 5, name: 'Emad Mostaque', company: 'Stability AI', role: 'Founder', background: 'Hedge Funds' },
    ],
  };

  const DashboardSection = ({ title, data, columns }) => (
    <div style={{
      background: 'rgba(0,0,0,0.3)',
      border: '1px solid #222',
      borderRadius: '8px',
      padding: '20px',
      marginBottom: '30px'
    }}>
      <h3 style={{
        fontSize: '14px',
        color: '#fff',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '1px',
        marginBottom: '20px',
        paddingBottom: '12px',
        borderBottom: '2px solid #333'
      }}>
        {title}
      </h3>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: theme.fonts.mono }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #333' }}>
              <th style={{ padding: '10px', textAlign: 'left', fontSize: '11px', color: '#666', fontWeight: 600 }}>#</th>
              {columns.map((col, i) => (
                <th key={i} style={{ padding: '10px', textAlign: 'left', fontSize: '11px', color: '#666', fontWeight: 600 }}>
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((item, index) => (
              <tr key={index} style={{ borderBottom: '1px solid #222' }}>
                <td style={{ padding: '12px 10px', fontSize: '13px', color: '#888', fontWeight: 600 }}>
                  {item.rank}
                </td>
                {Object.entries(item).filter(([key]) => key !== 'rank').map(([key, value], i) => (
                  <td key={i} style={{
                    padding: '12px 10px',
                    fontSize: '13px',
                    color: i === 0 ? '#fff' : '#aaa',
                    fontWeight: i === 0 ? 600 : 400
                  }}>
                    {value}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const sections = {
    'All': [
      { title: 'Top AI Models', data: dashboardData['Models'], columns: ['Model', 'Company', 'Score', 'Change'] },
      { title: 'Leading Companies', data: dashboardData['Companies'], columns: ['Company', 'Valuation', 'Employees', 'Founded'] },
      { title: 'Top GPUs', data: dashboardData['GPUs'], columns: ['GPU', 'Company', 'TFLOPS', 'Price'] },
    ],
    'Companies': [
      { title: 'Top AI Companies', data: dashboardData['Companies'], columns: ['Company', 'Valuation', 'Employees', 'Founded'] },
    ],
    'Models': [
      { title: 'Model Leaderboard', data: dashboardData['Models'], columns: ['Model', 'Company', 'Score', 'Change'] },
    ],
    'GPUs': [
      { title: 'GPU Rankings', data: dashboardData['GPUs'], columns: ['GPU', 'Company', 'TFLOPS', 'Price'] },
    ],
    'Chips': [
      { title: 'AI Chip Landscape', data: dashboardData['Chips'], columns: ['Chip', 'Company', 'Type', 'Efficiency'] },
    ],
    'Benchmarks': [
      { title: 'Key Benchmarks', data: dashboardData['Benchmarks'], columns: ['Benchmark', 'Category', 'Tasks', 'Leader'] },
    ],
    'Frameworks': [
      { title: 'Framework Popularity', data: dashboardData['Frameworks'], columns: ['Framework', 'Downloads', 'Stars', 'Language'] },
    ],
    'Research Labs': [
      { title: 'Research Impact', data: dashboardData['Research Labs'], columns: ['Lab', 'Papers', 'Citations', 'Focus'] },
    ],
    'Founders': [
      { title: 'Key Founders', data: dashboardData['Founders'], columns: ['Name', 'Company', 'Role', 'Background'] },
    ],
  };

  const currentSections = sections[selectedTopic] || sections['All'];

  return (
    <div>
      <div style={{
        marginBottom: '30px',
        paddingBottom: '20px',
        borderBottom: '2px solid #222'
      }}>
        <h2 style={{
          fontSize: '24px',
          color: '#fff',
          fontWeight: 700,
          margin: 0
        }}>
          AI ATLAS DASHBOARD
        </h2>
        <p style={{
          fontSize: '13px',
          color: '#666',
          margin: '8px 0 0 0'
        }}>
          Real-time rankings, metrics, and intelligence on the AI ecosystem
        </p>
      </div>

      {currentSections.map((section, index) => (
        <DashboardSection
          key={index}
          title={section.title}
          data={section.data}
          columns={section.columns}
        />
      ))}
    </div>
  );
}

function MarketWatch() {
  const [prices, setPrices] = useState({
    'BTC': { price: 0, change: 0 },
    'ETH': { price: 0, change: 0 },
    'NVDA': { price: 0, change: 0 },
    'TSLA': { price: 0, change: 0 }
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPrices = async () => {
      try {
        // Using CoinGecko API for crypto (free, no API key needed)
        const cryptoResponse = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true');
        const cryptoData = await cryptoResponse.json();

        setPrices({
          'BTC': {
            price: cryptoData.bitcoin?.usd || 0,
            change: cryptoData.bitcoin?.usd_24h_change || 0
          },
          'ETH': {
            price: cryptoData.ethereum?.usd || 0,
            change: cryptoData.ethereum?.usd_24h_change || 0
          },
          'NVDA': { price: 0, change: 0 }, // Placeholder for stock data
          'TSLA': { price: 0, change: 0 }  // Placeholder for stock data
        });
        setLoading(false);
      } catch (err) {
        console.error('Error fetching prices:', err);
        setLoading(false);
      }
    };

    fetchPrices();
    const interval = setInterval(fetchPrices, 60000); // Update every minute
    return () => clearInterval(interval);
  }, []);

  const formatPrice = (price) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(price);
  };

  const formatChange = (change) => {
    const sign = change >= 0 ? '+' : '';
    return `${sign}${change.toFixed(2)}%`;
  };

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
        <span style={{ fontSize: '12px', fontWeight: 600, color: '#fff' }}>MARKET WATCH</span>
      </div>

      {loading ? (
        <div style={{ color: '#666', fontSize: '13px', textAlign: 'center', padding: '20px' }}>
          Loading prices...
        </div>
      ) : (
        <div>
          {Object.entries(prices).map(([symbol, data]) => (
            <div key={symbol} style={{
              marginBottom: '20px',
              paddingBottom: '15px',
              borderBottom: '1px solid #222'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#fff', marginBottom: '4px' }}>
                    {symbol}
                  </div>
                  <div style={{ fontSize: '18px', color: '#fff', fontFamily: theme.fonts.mono }}>
                    {data.price > 0 ? formatPrice(data.price) : '—'}
                  </div>
                </div>
                {data.price > 0 && (
                  <div style={{
                    fontSize: '13px',
                    fontWeight: 600,
                    color: data.change >= 0 ? '#00ff88' : '#ff4444',
                    fontFamily: theme.fonts.mono
                  }}>
                    {formatChange(data.change)}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function App() {
  const [activeModal, setActiveModal] = useState(null);
  const [menuExpanded, setMenuExpanded] = useState(false);
  const [posts, setPosts] = useState([]);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [selectedPost, setSelectedPost] = useState(null);
  const [selectedPage, setSelectedPage] = useState('NEWS');
  const [selectedTopic, setSelectedTopic] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const scrollRef = useRef(0);
  const scrollContainerRef = useRef(null);

  const pages = ['NEWS', 'TERMINAL', 'ATLAS'];

  const pageTopics = {
    'TERMINAL': ['All', 'Stocks', 'Crypto', 'ETFs', 'Indexes'],
    'NEWS': ['All', 'AI', 'Tech', 'Science', 'Energy', 'Crypto', 'Markets', 'Policy', 'Cybersecurity', 'Hardware', 'Space'],
    'ATLAS': ['All', 'Companies', 'Models', 'GPUs', 'Chips', 'Benchmarks', 'Frameworks', 'Research Labs', 'Founders']
  };

  const currentTopics = pageTopics[selectedPage];

  // Reset topic to 'All' when page changes
  useEffect(() => {
    setSelectedTopic('All');
  }, [selectedPage]);

  // Fetch posts from API
  useEffect(() => {
    const API_URL = process.env.REACT_APP_API_URL || '';
    fetch(`${API_URL}/api/posts`)
      .then(res => res.json())
      .then(data => {
        setPosts(data.posts || []);
        setLoadingPosts(false);
      })
      .catch(err => {
        console.error('Error fetching posts:', err);
        setLoadingPosts(false);
      });
  }, []);

  // Filter posts based on topic and search query
  const filteredPosts = posts.filter(post => {
    const matchesTopic = selectedTopic === 'All' ||
      (post.topic && post.topic.toLowerCase() === selectedTopic.toLowerCase()) ||
      (post.title && post.title.toLowerCase().includes(selectedTopic.toLowerCase())) ||
      (post.excerpt && post.excerpt.toLowerCase().includes(selectedTopic.toLowerCase()));

    const matchesSearch = !searchQuery ||
      (post.title && post.title.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (post.excerpt && post.excerpt.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (post.content && post.content.toLowerCase().includes(searchQuery.toLowerCase()));

    return matchesTopic && matchesSearch;
  });

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
          top: '40px',
          right: '40px',
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
              <NavButton onClick={() => { setActiveModal('subscribe'); setMenuExpanded(false); }} icon={Mail} label="Subscribe" />
              <NavButton onClick={() => { setActiveModal('discord'); setMenuExpanded(false); }} icon={MessageCircle} label="Discord" />
              <NavButton onClick={() => { window.open('https://substack.com/@rrsrch', '_blank'); setMenuExpanded(false); }} icon={FileText} label="Substack" />
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
          INNOVATING NEWS FOR <br />
          THE COMING WORLD.
          </p>
        </div>

        {/* Spacer to delay panel appearance and allow sphere to shrink fully visible */}
        <div style={{ height: '13vh' }}></div>

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
          
          {/* Left Column: News Feed or Article View */}
          <div>
            {selectedPost ? (
              <ArticleView
                post={selectedPost}
                onBack={() => setSelectedPost(null)}
                relatedPosts={posts.filter(p => p.id !== selectedPost.id).slice(0, 3)}
              />
            ) : (
              <>
                {/* Search Bar */}
                <div style={{
                  marginBottom: '20px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  background: 'rgba(0,0,0,0.3)',
                  border: '1px solid #333',
                  borderRadius: '8px',
                  padding: '10px 15px'
                }}>
                  <Search size={16} color="#666" />
                  <input
                    type="text"
                    placeholder="Search transmissions..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{
                      flex: 1,
                      background: 'transparent',
                      border: 'none',
                      color: '#fff',
                      fontSize: '14px',
                      outline: 'none',
                      fontFamily: theme.fonts.main
                    }}
                  />
                </div>

                {/* Pages Bar */}
                <div style={{
                  display: 'flex',
                  gap: '15px',
                  marginBottom: '20px',
                  paddingBottom: '15px',
                  borderBottom: '2px solid #222'
                }}>
                  {pages.map((page) => (
                    <button
                      key={page}
                      onClick={() => setSelectedPage(page)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: selectedPage === page ? '#fff' : '#555',
                        padding: '0 0 5px 0',
                        cursor: 'pointer',
                        fontSize: '16px',
                        fontFamily: theme.fonts.main,
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '1px',
                        borderBottom: selectedPage === page ? '2px solid #fff' : '2px solid transparent',
                        marginBottom: '-17px',
                        transition: 'all 0.2s ease'
                      }}
                      onMouseEnter={(e) => {
                        if (selectedPage !== page) {
                          e.currentTarget.style.color = '#aaa';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (selectedPage !== page) {
                          e.currentTarget.style.color = '#555';
                        }
                      }}
                    >
                      {page}
                    </button>
                  ))}
                </div>

                {/* Topics Bar (Sub-filters) */}
                <div style={{
                  display: 'flex',
                  gap: '10px',
                  marginBottom: '30px',
                  overflowX: 'auto',
                  paddingBottom: '10px',
                  borderBottom: '1px solid #222'
                }}>
                  {currentTopics.map((topic) => (
                    <button
                      key={topic}
                      onClick={() => setSelectedTopic(topic)}
                      style={{
                        background: selectedTopic === topic ? 'rgba(255,255,255,0.1)' : 'transparent',
                        border: selectedTopic === topic ? '1px solid rgba(255,255,255,0.2)' : '1px solid #333',
                        borderRadius: '20px',
                        color: selectedTopic === topic ? '#fff' : '#666',
                        padding: '8px 16px',
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontFamily: theme.fonts.main,
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                        whiteSpace: 'nowrap',
                        transition: 'all 0.2s ease'
                      }}
                      onMouseEnter={(e) => {
                        if (selectedTopic !== topic) {
                          e.currentTarget.style.borderColor = '#555';
                          e.currentTarget.style.color = '#aaa';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (selectedTopic !== topic) {
                          e.currentTarget.style.borderColor = '#333';
                          e.currentTarget.style.color = '#666';
                        }
                      }}
                    >
                      {topic}
                    </button>
                  ))}
                </div>

                {selectedPage === 'TERMINAL' ? (
                  <>
                    <LiveTable selectedTopic={selectedTopic} />

                    {/* Recommended Articles Section */}
                    <div style={{ marginTop: '60px' }}>
                      <h3 style={{
                        fontSize: '14px',
                        color: '#666',
                        marginBottom: '20px',
                        letterSpacing: '1px',
                        textTransform: 'uppercase',
                        fontWeight: 600
                      }}>
                        Recommended Reading
                      </h3>
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
                        gap: '20px'
                      }}>
                        {filteredPosts.slice(0, 3).map((post) => (
                          <div
                            key={post.id}
                            onClick={() => setSelectedPost(post)}
                            style={{
                              background: 'rgba(0,0,0,0.3)',
                              border: '1px solid #222',
                              borderRadius: '8px',
                              padding: '15px',
                              cursor: 'pointer',
                              transition: 'all 0.2s ease'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.borderColor = '#444';
                              e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.borderColor = '#222';
                              e.currentTarget.style.background = 'rgba(0,0,0,0.3)';
                            }}
                          >
                            <div style={{
                              fontSize: '11px',
                              color: '#666',
                              marginBottom: '8px',
                              fontFamily: theme.fonts.mono
                            }}>
                              {new Date(post.date).toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '.')}
                            </div>
                            <h4 style={{
                              fontSize: '15px',
                              color: '#fff',
                              margin: '0 0 10px 0',
                              fontWeight: 600,
                              lineHeight: '1.4'
                            }}>
                              {post.title}
                            </h4>
                            <p style={{
                              fontSize: '13px',
                              color: '#888',
                              margin: 0,
                              lineHeight: '1.5',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical'
                            }}>
                              {post.excerpt}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                ) : selectedPage === 'ATLAS' ? (
                  <>
                    <AtlasDashboard selectedTopic={selectedTopic} />

                    {/* Relevant Articles Section */}
                    <div>
                      <h3 style={{
                        fontSize: '14px',
                        color: '#666',
                        marginBottom: '20px',
                        letterSpacing: '1px',
                        textTransform: 'uppercase',
                        fontWeight: 600
                      }}>
                        Relevant Articles
                      </h3>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                        {filteredPosts.slice(0, 5).map((post) => (
                          <NewsItem
                            key={post.id}
                            date={new Date(post.date).toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '.')}
                            title={post.title}
                            excerpt={post.excerpt}
                            onClick={() => setSelectedPost(post)}
                          />
                        ))}
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <h2 style={{
                      fontSize: '14px',
                      color: '#444',
                      borderBottom: '1px solid #222',
                      paddingBottom: '10px',
                      marginBottom: '30px',
                      letterSpacing: '1px',
                      textTransform: 'uppercase'
                    }}>
                      {selectedPage} {selectedTopic !== 'All' ? `/ ${selectedTopic}` : ''}
                    </h2>

                    {/* Posts from API */}
                    {loadingPosts ? (
                      <div style={{ color: '#666', fontSize: '13px', textAlign: 'center', padding: '40px' }}>
                        Loading transmissions...
                      </div>
                    ) : filteredPosts.length === 0 ? (
                      <div style={{ color: '#666', fontSize: '13px', textAlign: 'center', padding: '40px' }}>
                        No transmissions found
                      </div>
                    ) : (
                      filteredPosts.map((post) => (
                        <NewsItem
                          key={post.id}
                          date={new Date(post.date).toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '.')}
                          title={post.title}
                          excerpt={post.excerpt}
                          onClick={() => setSelectedPost(post)}
                        />
                      ))
                    )}
                  </>
                )}
              </>
            )}
          </div>

          {/* Right Column: Sticky Sidebar */}
          <div style={{ position: 'relative' }}>
             <div style={{ position: 'sticky', top: '40px' }}>
               <MarketWatch />
               
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
