import React, { useState, useRef, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Sphere, Stars, Grid } from '@react-three/drei';
import * as THREE from 'three';
import { Mail, MessageCircle, FileText, X, Twitter, ArrowRight, Search, User } from 'lucide-react';

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

  // Tidbit/tweet style - rounded box
  if (isTidbit) {
    return (
      <div
        style={{
          marginBottom: '30px',
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: '16px',
          padding: '24px',
          cursor: 'default'
        }}
      >
        <div style={{
          fontSize: '10px',
          color: '#aaa',
          marginBottom: '12px',
          fontFamily: theme.fonts.mono,
          textTransform: 'uppercase',
          letterSpacing: '1px',
          fontWeight: 600
        }}>
          Update · {date}
        </div>
        <h3 style={{
          margin: '0',
          fontSize: '18px',
          color: '#fff',
          fontWeight: 400,
          letterSpacing: '-0.02em',
          lineHeight: '1.5'
        }}>
          {parseMarkdown(title)}
        </h3>
      </div>
    );
  }

  // Regular article style
  return (
    <div
      style={{
        marginBottom: '40px',
        borderBottom: '1px solid #222',
        paddingBottom: '30px',
        cursor: 'pointer'
      }}
      onClick={onClick}
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
    </div>
  );
}

function ArticleView({ post, onBack, relatedPosts, onSelectPost }) {
  // Parse markdown-style bold text (**text**), headers (###), and URLs
  const parseMarkdown = (text) => {
    if (!text) return '';

    // Split by newlines to handle headers line by line
    const lines = text.split('\n');
    return lines.map((line, lineIndex) => {
      // Check for headers (### header text)
      if (line.trim().startsWith('###')) {
        const headerText = line.replace(/^###\s*/, '').trim();
        return (
          <h3 key={lineIndex} style={{
            color: '#fff',
            fontWeight: 700,
            fontSize: '20px',
            margin: '30px 0 15px 0',
            lineHeight: '1.3'
          }}>
            {headerText}
          </h3>
        );
      }

      // Check for Source: URL pattern - match and replace entire line
      if (line.match(/Source:/i) && line.match(/https?:\/\//)) {
        // First try to match markdown link syntax: [text](url)
        const markdownMatch = line.match(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/);
        if (markdownMatch) {
          const cleanUrl = markdownMatch[2].trim();
          return (
            <div key={lineIndex} style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid #333' }}>
              <span style={{ color: '#666' }}>Source: </span>
              <a
                href={cleanUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: '#00ff88',
                  textDecoration: 'none',
                  borderBottom: '1px solid #00ff88'
                }}
                onMouseEnter={(e) => e.currentTarget.style.opacity = '0.7'}
                onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
              >
                Here
              </a>
            </div>
          );
        }
        // Fallback to plain URL matching
        const urlMatch = line.match(/(https?:\/\/[^\s)]+)/);
        if (urlMatch) {
          const cleanUrl = urlMatch[1].replace(/[.,;:)}\]]+$/, ''); // Remove trailing punctuation
          return (
            <div key={lineIndex} style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid #333' }}>
              <span style={{ color: '#666' }}>Source: </span>
              <a
                href={cleanUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: '#00ff88',
                  textDecoration: 'none',
                  borderBottom: '1px solid #00ff88'
                }}
                onMouseEnter={(e) => e.currentTarget.style.opacity = '0.7'}
                onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
              >
                Here
              </a>
            </div>
          );
        }
      }

      // Handle bold text and inline URLs within regular lines
      const parts = line.split(/(\*\*.*?\*\*|https?:\/\/[^\s]+)/g);
      const parsedLine = parts.map((part, index) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={`${lineIndex}-${index}`} style={{ color: '#fff', fontWeight: 600 }}>{part.slice(2, -2)}</strong>;
        }
        if (part.match(/^https?:\/\//)) {
          return (
            <a
              key={`${lineIndex}-${index}`}
              href={part}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: '#00ff88',
                textDecoration: 'none',
                borderBottom: '1px solid #00ff88'
              }}
              onMouseEnter={(e) => e.currentTarget.style.opacity = '0.7'}
              onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
            >
              Here
            </a>
          );
        }
        return <span key={`${lineIndex}-${index}`}>{part}</span>;
      });

      return <div key={lineIndex}>{parsedLine}</div>;
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
            <div
              key={related.id}
              onClick={() => onSelectPost && onSelectPost(related)}
              style={{
                marginBottom: '20px',
                paddingBottom: '20px',
                borderBottom: '1px solid #111',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.opacity = '0.7';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity = '1';
              }}
            >
              <div style={{ fontSize: '16px', color: '#fff', marginBottom: '8px' }}>{related.title}</div>
              <div style={{ fontSize: '13px', color: '#666' }}>{related.excerpt.substring(0, 100)}...</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LiveTable({ selectedTopic, selectedPreset }) {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const isFirstFetch = useRef(true);

  // Preset symbol mappings
  const presetSymbols = {
    'AI & Chips': [
      'NVDA',   // Nvidia
      'AMD',    // Advanced Micro Devices
      'AVGO',   // Broadcom
      'TSM',    // Taiwan Semiconductor Manufacturing Company
      'INTC',   // Intel
      'QCOM',   // Qualcomm
      'MU',     // Micron Technology
      'SNOW',   // Snowflake
      'SMCI',   // Super Micro Computer
      'GOOGL',  // Alphabet (Google)
      'PLTR',   // Palantir Technologies
      'CLS'     // Celestica
    ],
    'Robotics': [
      'SYM',    // Symbotic
      'KYCCF',  // Keyence
      'ISRG',   // Intuitive Surgical
      'ZBRA',   // Zebra Technologies
      'PATH',   // UiPath
      'EMR',    // Emerson Electric
      'TRMB',   // Trimble
      'OMCL',   // Omnicell
      'LECO',   // Lincoln Electric Holdings
      'ABB'     // ABB
    ],
    'Defense': [
      'LMT',    // Lockheed Martin
      'RTX',    // Raytheon
      'NOC',    // Northrop Grumman
      'GD',     // General Dynamics
      'HWM',    // Howmet Aerospace
      'AXON',   // Axon Enterprise
      'HII',    // Huntington Ingalls Industries
      'KTOS',   // Kratos Defense & Security
      'AVAV'    // AeroVironment
    ],
    'Energy & Power': [
      'NEE',    // NextEra Energy
      'GEV',    // GE Vernova
      'FSLR',   // First Solar
      'BE',     // Bloom Energy
      'BEP',    // Brookfield Renewable Partners
      'CVX',    // Chevron
      'XOM',    // Exxon Mobil
      'BP',     // BP
      'SRLP'    // Solid Power
    ],
  };

  useEffect(() => {
    const fetchAssets = async () => {
      try {
        // Only show loading on first fetch
        if (isFirstFetch.current) {
          setLoading(true);
        }

        const API_URL = process.env.REACT_APP_API_URL || '';
        let allAssets = [];

        // Fetch data based on selected topic
        if (selectedTopic === 'Markets') {
          // Fetch macro market indices
          const marketResponse = await fetch(`${API_URL}/api/markets`);

          if (marketResponse.ok) {
            const marketData = await marketResponse.json();

            if (marketData.markets && marketData.markets.length > 0) {
              const formattedMarkets = marketData.markets.map(market => ({
                symbol: market.symbol,
                name: market.name,
                price: market.price,
                change: market.change,
                volume: 0,
                high: market.high,
                low: market.low,
                type: 'market'
              }));
              allAssets = [...allAssets, ...formattedMarkets];
            }
          }
        } else if (selectedTopic === 'Crypto') {
          // Fetch crypto data - Top 15 by market cap
          const cryptoIds = [
            'bitcoin', 'ethereum', 'tether', 'binancecoin', 'solana',
            'usd-coin', 'ripple', 'dogecoin', 'cardano', 'tron',
            'avalanche-2', 'chainlink', 'polkadot', 'shiba-inu', 'bitcoin-cash'
          ];
          const cryptoResponse = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${cryptoIds.join(',')}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true&include_market_cap=true&include_24hr_high=true&include_24hr_low=true`);

          if (cryptoResponse.ok) {
            const cryptoData = await cryptoResponse.json();

            if (cryptoData && Object.keys(cryptoData).length > 0) {
              const nameMap = {
                'bitcoin': { symbol: 'BTC', name: 'Bitcoin' },
                'ethereum': { symbol: 'ETH', name: 'Ethereum' },
                'tether': { symbol: 'USDT', name: 'Tether' },
                'binancecoin': { symbol: 'BNB', name: 'BNB' },
                'solana': { symbol: 'SOL', name: 'Solana' },
                'usd-coin': { symbol: 'USDC', name: 'USD Coin' },
                'ripple': { symbol: 'XRP', name: 'XRP' },
                'dogecoin': { symbol: 'DOGE', name: 'Dogecoin' },
                'cardano': { symbol: 'ADA', name: 'Cardano' },
                'tron': { symbol: 'TRX', name: 'TRON' },
                'avalanche-2': { symbol: 'AVAX', name: 'Avalanche' },
                'chainlink': { symbol: 'LINK', name: 'Chainlink' },
                'polkadot': { symbol: 'DOT', name: 'Polkadot' },
                'shiba-inu': { symbol: 'SHIB', name: 'Shiba Inu' },
                'bitcoin-cash': { symbol: 'BCH', name: 'Bitcoin Cash' }
              };

              const formattedCrypto = Object.entries(cryptoData).map(([id, data]) => {
                const mapped = nameMap[id] || { symbol: id.toUpperCase().slice(0, 4), name: id };

                return {
                  symbol: mapped.symbol,
                  name: mapped.name,
                  price: data.usd || 0,
                  change: data.usd_24h_change || 0,
                  volume: data.usd_24h_vol || 0,
                  marketCap: data.usd_market_cap || 0,
                  high: data.usd_24h_high || 0,
                  low: data.usd_24h_low || 0,
                  type: 'crypto'
                };
              });

              // Sort by market cap descending
              formattedCrypto.sort((a, b) => b.marketCap - a.marketCap);
              allAssets = [...allAssets, ...formattedCrypto];
            }
          }
        } else if (selectedTopic === 'Stocks') {
          // Fetch stock data from backend
          const stockResponse = await fetch(`${API_URL}/api/stocks`);

          if (stockResponse.ok) {
            const stockData = await stockResponse.json();

            if (stockData.stocks && stockData.stocks.length > 0) {
              const formattedStocks = stockData.stocks.map(stock => ({
                symbol: stock.symbol,
                name: stock.symbol,
                price: stock.price,
                change: stock.change,
                volume: stock.volume,
                high: stock.high,
                low: stock.low,
                type: 'stock'
              }));
              allAssets = [...allAssets, ...formattedStocks];
            }
          }
        } else if (selectedTopic === 'ETFs') {
          // Fetch AI ETF data from backend
          const etfResponse = await fetch(`${API_URL}/api/etfs`);

          if (etfResponse.ok) {
            const etfData = await etfResponse.json();

            if (etfData.etfs && etfData.etfs.length > 0) {
              const formattedEtfs = etfData.etfs.map(etf => ({
                symbol: etf.symbol,
                name: etf.symbol,
                price: etf.price,
                change: etf.change,
                volume: etf.volume,
                high: etf.high,
                low: etf.low,
                type: 'etf'
              }));
              allAssets = [...allAssets, ...formattedEtfs];
            }
          }
        }

        // Apply preset filter if selected
        if (selectedPreset && selectedPreset !== 'All' && presetSymbols[selectedPreset]) {
          const presetList = presetSymbols[selectedPreset];
          allAssets = allAssets.filter(asset => presetList.includes(asset.symbol));
        }

        if (allAssets.length > 0) {
          setAssets(allAssets);
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
    const interval = setInterval(fetchAssets, 30000); // 30 second auto-refresh (to avoid rate limits)
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTopic, selectedPreset]);

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
      {[1, 2, 3, 4, 5].map(i => (
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

      {/* Session Summary Strip */}
      {selectedTopic === 'Markets' && assets.length > 0 && (
        <div style={{
          background: 'rgba(0,0,0,0.3)',
          border: '1px solid #222',
          borderRadius: '6px',
          padding: '12px 16px',
          marginBottom: '20px',
          fontSize: '12px',
          fontFamily: theme.fonts.mono,
          color: '#aaa',
          display: 'flex',
          alignItems: 'center',
          gap: '20px',
          flexWrap: 'wrap'
        }}>
          <span style={{ color: '#666', fontWeight: 600 }}>US Session:</span>
          {(() => {
            const spyAsset = assets.find(a => a.symbol === 'S&P 500');
            const nasdaqAsset = assets.find(a => a.symbol === 'NASDAQ');
            const vixAsset = assets.find(a => a.symbol === 'VIX (Volatility)');
            const positiveCount = assets.filter(a => a.change > 0).length;
            const negativeCount = assets.filter(a => a.change < 0).length;
            const sessionSentiment = positiveCount > negativeCount ? 'Bullish' : negativeCount > positiveCount ? 'Bearish' : 'Mixed';
            const sentimentColor = sessionSentiment === 'Bullish' ? '#00ff88' : sessionSentiment === 'Bearish' ? '#ff4444' : '#ffa500';

            return (
              <>
                <span style={{ color: sentimentColor, fontWeight: 600 }}>{sessionSentiment}</span>
                {spyAsset && (
                  <>
                    <span>·</span>
                    <span>
                      S&P <span style={{ color: spyAsset.change >= 0 ? '#00ff88' : '#ff4444', fontWeight: 600 }}>
                        {spyAsset.change >= 0 ? '+' : ''}{spyAsset.change.toFixed(2)}%
                      </span>
                    </span>
                  </>
                )}
                {nasdaqAsset && (
                  <>
                    <span>·</span>
                    <span>
                      NASDAQ <span style={{ color: nasdaqAsset.change >= 0 ? '#00ff88' : '#ff4444', fontWeight: 600 }}>
                        {nasdaqAsset.change >= 0 ? '+' : ''}{nasdaqAsset.change.toFixed(2)}%
                      </span>
                    </span>
                  </>
                )}
                {vixAsset && vixAsset.price > 0 && (
                  <>
                    <span>·</span>
                    <span>
                      VIX {vixAsset.price.toFixed(1)} <span style={{
                        color: vixAsset.price < 15 ? '#00ff88' : vixAsset.price > 25 ? '#ff4444' : '#ffa500',
                        fontWeight: 600
                      }}>
                        ({vixAsset.price < 15 ? 'Calm' : vixAsset.price > 25 ? 'High' : 'Elevated'})
                      </span>
                    </span>
                  </>
                )}
              </>
            );
          })()}
        </div>
      )}

      {selectedTopic === 'Crypto' && assets.length > 0 && (
        <div style={{
          background: 'rgba(0,0,0,0.3)',
          border: '1px solid #222',
          borderRadius: '6px',
          padding: '12px 16px',
          marginBottom: '20px',
          fontSize: '12px',
          fontFamily: theme.fonts.mono,
          color: '#aaa',
          display: 'flex',
          alignItems: 'center',
          gap: '20px',
          flexWrap: 'wrap'
        }}>
          <span style={{ color: '#666', fontWeight: 600 }}>Crypto Market:</span>
          {(() => {
            const btcAsset = assets.find(a => a.symbol === 'BTC');
            const ethAsset = assets.find(a => a.symbol === 'ETH');
            const positiveCount = assets.filter(a => a.change > 0).length;
            const negativeCount = assets.filter(a => a.change < 0).length;
            const sessionSentiment = positiveCount > negativeCount ? 'Bullish' : negativeCount > positiveCount ? 'Bearish' : 'Mixed';
            const sentimentColor = sessionSentiment === 'Bullish' ? '#00ff88' : sessionSentiment === 'Bearish' ? '#ff4444' : '#ffa500';

            return (
              <>
                <span style={{ color: sentimentColor, fontWeight: 600 }}>{sessionSentiment}</span>
                {btcAsset && (
                  <>
                    <span>·</span>
                    <span>
                      BTC <span style={{ color: btcAsset.change >= 0 ? '#00ff88' : '#ff4444', fontWeight: 600 }}>
                        {btcAsset.change >= 0 ? '+' : ''}{btcAsset.change.toFixed(2)}%
                      </span>
                    </span>
                  </>
                )}
                {ethAsset && (
                  <>
                    <span>·</span>
                    <span>
                      ETH <span style={{ color: ethAsset.change >= 0 ? '#00ff88' : '#ff4444', fontWeight: 600 }}>
                        {ethAsset.change >= 0 ? '+' : ''}{ethAsset.change.toFixed(2)}%
                      </span>
                    </span>
                  </>
                )}
                <span>·</span>
                <span>
                  {positiveCount} Up, {negativeCount} Down
                </span>
              </>
            );
          })()}
        </div>
      )}

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
              <th style={{ padding: '12px 10px', textAlign: 'left', fontSize: '11px', color: '#666', fontWeight: 600, textTransform: 'uppercase' }}>Day Range</th>
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
              assets.map((asset, index) => {
                const isDataOffline = !asset.price || asset.price === 0;
                const isPreMarket = asset.type === 'stock' && new Date().getDay() !== 0 && new Date().getDay() !== 6;

                return (
                  <tr key={index} style={{ borderBottom: '1px solid #222' }}>
                    <td style={{ padding: '15px 10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: 600, color: '#fff' }}>{asset.symbol}</div>
                          <div style={{ fontSize: '11px', color: '#666' }}>{asset.name}</div>
                        </div>
                        {isDataOffline && (
                          <span style={{
                            fontSize: '9px',
                            padding: '2px 6px',
                            background: 'rgba(255,68,68,0.1)',
                            color: '#ff4444',
                            border: '1px solid rgba(255,68,68,0.3)',
                            borderRadius: '3px',
                            textTransform: 'uppercase',
                            fontWeight: 600,
                            letterSpacing: '0.5px'
                          }}>
                            {asset.type === 'stock' || asset.type === 'etf' ? 'PRE-MARKET' : 'DATA OFFLINE'}
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '15px 10px', textAlign: 'right', fontSize: '14px', color: isDataOffline ? '#555' : '#fff' }}>
                      {isDataOffline ? '—' : formatPrice(asset.price)}
                    </td>
                    <td style={{
                      padding: '15px 10px',
                      textAlign: 'right',
                      fontSize: '13px',
                      fontWeight: 600,
                      color: isDataOffline ? '#555' : (asset.change >= 0 ? '#00ff88' : '#ff4444')
                    }}>
                      {isDataOffline ? '—' : formatChange(asset.change)}
                    </td>
                    <td style={{ padding: '15px 10px' }}>
                      {!isDataOffline && asset.high && asset.low && asset.high > asset.low ? (
                        <div style={{ width: '120px' }}>
                          <div style={{
                            height: '4px',
                            background: '#222',
                            borderRadius: '2px',
                            position: 'relative',
                            overflow: 'hidden'
                          }}>
                            <div style={{
                              position: 'absolute',
                              left: `${((asset.price - asset.low) / (asset.high - asset.low)) * 100}%`,
                              top: '50%',
                              transform: 'translate(-50%, -50%)',
                              width: '8px',
                              height: '8px',
                              borderRadius: '50%',
                              background: asset.change >= 0 ? '#00ff88' : '#ff4444',
                              border: '1px solid #000'
                            }} />
                          </div>
                          <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            fontSize: '9px',
                            color: '#555',
                            marginTop: '4px'
                          }}>
                            <span>{formatPrice(asset.low)}</span>
                            <span>{formatPrice(asset.high)}</span>
                          </div>
                        </div>
                      ) : (
                        <div style={{ fontSize: '11px', color: '#555' }}>—</div>
                      )}
                    </td>
                    <td style={{ padding: '15px 10px', textAlign: 'right', fontSize: '13px', color: isDataOffline ? '#555' : '#aaa' }}>
                      {isDataOffline ? '—' : formatVolume(asset.volume)}
                    </td>
                  </tr>
                );
              })
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

// ATLAS Sidebar Component
function AtlasSidebar({ selectedTopic, selectedSubsection, hoveredEntity }) {
  const domainColors = {
    'Software': '#0088ff',
    'Hardware': '#00ff88',
    'Manufacturing': '#ff8800',
    'Robotics': '#ff0088',
    'People': '#8800ff'
  };

  const domainColor = domainColors[selectedTopic] || '#00ff88';

  // Subsection-specific rankings
  const subsectionRankings = {
    'Models': {
      title: 'Model Rankings',
      items: [
        { rank: 1, name: 'Gemini 3 Pro Preview', score: 100, company: 'Google DeepMind' },
        { rank: 2, name: 'GPT-5.1 (High)', score: 99, company: 'OpenAI' },
        { rank: 3, name: 'GPT-5 Codex (High)', score: 98, company: 'OpenAI' },
        { rank: 4, name: 'GPT-5 (High)', score: 97, company: 'OpenAI' },
        { rank: 5, name: 'Kimi K2 Thinking', score: 96, company: 'Moonshot AI' },
        { rank: 6, name: 'GPT-5 (Medium)', score: 95, company: 'OpenAI' },
        { rank: 7, name: 'o3', score: 94, company: 'OpenAI' },
        { rank: 8, name: 'Grok 4', score: 93, company: 'xAI' },
        { rank: 9, name: 'GPT-5 Mini (High)', score: 92, company: 'OpenAI' },
        { rank: 10, name: 'Grok 4.1 Fast', score: 91, company: 'xAI' },
        { rank: 11, name: 'GPT-4o', score: 90, company: 'OpenAI' },
        { rank: 12, name: 'Claude 3.5 Opus', score: 89, company: 'Anthropic' }
      ]
    },
    'GPUs': {
      title: 'GPU Rankings',
      items: [
        { rank: 1, name: 'H100 SXM', score: 100, company: 'NVIDIA' },
        { rank: 2, name: 'B200', score: 98, company: 'NVIDIA' },
        { rank: 3, name: 'H200', score: 97, company: 'NVIDIA' },
        { rank: 4, name: 'MI300X', score: 95, company: 'AMD' },
        { rank: 5, name: 'A100 80GB', score: 92, company: 'NVIDIA' },
        { rank: 6, name: 'RTX 4090', score: 89, company: 'NVIDIA' },
        { rank: 7, name: 'MI250X', score: 86, company: 'AMD' },
        { rank: 8, name: 'L40S', score: 84, company: 'NVIDIA' },
        { rank: 9, name: 'H20', score: 82, company: 'NVIDIA' },
        { rank: 10, name: 'A800', score: 80, company: 'NVIDIA' }
      ]
    },
    'AI Frameworks': {
      title: 'Framework Rankings',
      items: [
        { rank: 1, name: 'PyTorch', score: 98, company: 'Meta' },
        { rank: 2, name: 'JAX', score: 94, company: 'Google' },
        { rank: 3, name: 'TensorFlow', score: 92, company: 'Google' },
        { rank: 4, name: 'MLX', score: 88, company: 'Apple' },
        { rank: 5, name: 'Keras', score: 85, company: 'Independent' },
        { rank: 6, name: 'MXNet', score: 75, company: 'Apache' }
      ]
    },
    'Fabs': {
      title: 'Fab Rankings',
      items: [
        { rank: 1, name: 'TSMC', score: 100, company: 'Taiwan' },
        { rank: 2, name: 'Samsung Foundry', score: 95, company: 'South Korea' },
        { rank: 3, name: 'Intel Foundry', score: 90, company: 'USA' },
        { rank: 4, name: 'GlobalFoundries', score: 85, company: 'USA' },
        { rank: 5, name: 'SMIC', score: 80, company: 'China' },
        { rank: 6, name: 'UMC', score: 75, company: 'Taiwan' },
        { rank: 7, name: 'Tower Semiconductor', score: 72, company: 'Israel' },
        { rank: 8, name: 'Rapidus', score: 68, company: 'Japan' },
        { rank: 9, name: 'Hua Hong Semiconductor', score: 65, company: 'China' },
        { rank: 10, name: 'DB HiTek', score: 62, company: 'South Korea' }
      ]
    },
    'Humanoid Robotics': {
      title: 'Humanoid Robot Rankings',
      items: [
        { rank: 1, name: 'Figure 01', score: 100, company: 'Figure AI' },
        { rank: 2, name: 'Tesla Optimus Gen 2', score: 98, company: 'Tesla' },
        { rank: 3, name: 'Digit Gen 3', score: 96, company: 'Agility Robotics' },
        { rank: 4, name: 'Phoenix', score: 94, company: 'Sanctuary AI' },
        { rank: 5, name: 'Unitree G1 Pro', score: 92, company: 'Unitree' },
        { rank: 6, name: 'Apollo', score: 89, company: 'Apptronik' },
        { rank: 7, name: 'GR1', score: 87, company: 'Fourier Intelligence' },
        { rank: 8, name: 'NEO', score: 85, company: '1X Robotics' },
        { rank: 9, name: 'Robosapien X', score: 83, company: 'Raytheon' },
        { rank: 10, name: 'Walker X', score: 81, company: 'UBTECH' }
      ]
    }
  };

  // Entity details for hover previews
  const entityDetails = {
    // Models - Top 10 Rankings
    'GPT-4o': {
      name: 'GPT-4o',
      subtitle: 'OpenAI - Most capable multimodal model',
      specs: ['State-of-the-art reasoning', 'Vision, audio, real-time', 'Best-in-class tool integration'],
      score: 100,
      rank: 1,
      company: 'OpenAI',
      why: 'Most capable, multimodal general-purpose model. State-of-the-art reasoning, vision, audio, and high-fidelity agent tool-use.',
      strengths: ['Cognitive reliability', 'Real-time multimodal', 'Best tool integration'],
      weaknesses: ['Proprietary', 'Expensive']
    },
    'Gemini 3 Pro': {
      name: 'Gemini 3 Pro',
      subtitle: 'Google DeepMind - Long-context reasoning champion',
      specs: ['Huge context windows', 'Strong multimodal embeddings', 'Deep Google ecosystem'],
      score: 98,
      rank: 2,
      company: 'Google DeepMind',
      why: 'Rivals GPT-4o in reasoning and multimodal depth; excels in long-context research tasks and integrated agent workflows.',
      strengths: ['Huge context windows', 'Strong multimodal embeddings', 'Google ecosystem'],
      weaknesses: ['Access + licensing constraints']
    },
    'Claude 3.5 Opus': {
      name: 'Claude 3.5 Opus',
      subtitle: 'Anthropic - Most consistent and reliable',
      specs: ['Least hallucinatory', 'Exceptional structured reasoning', 'Long-document mastery'],
      score: 97,
      rank: 3,
      company: 'Anthropic',
      why: 'The most consistent and least hallucinatory model. Exceptional structured reasoning and analysis.',
      strengths: ['Safety', 'Reliability', 'Long-document mastery'],
      weaknesses: ['Slightly behind in multimodal creativity']
    },
    'Llama 3.1 405B': {
      name: 'Llama 3.1 405B',
      subtitle: 'Meta - Strongest open-weight model',
      specs: ['Near-frontier performance', 'Full self-hosting control', 'Massive community'],
      score: 95,
      rank: 4,
      company: 'Meta',
      why: 'The strongest open-weight model in the world. Near-frontier performance with full self-hosting control.',
      strengths: ['Open-source', 'Customizable', 'Community momentum'],
      weaknesses: ['Very compute-heavy to run at scale']
    },
    'Qwen 2.5-72B': {
      name: 'Qwen 2.5-72B',
      subtitle: 'Alibaba - Best open-source all-rounder',
      specs: ['Strong multilingual', 'Excellent coding & math', 'Flexible licensing'],
      score: 93,
      rank: 5,
      company: 'Alibaba',
      why: 'Currently the most consistently strong open-source family across multilingual, coding, math, and reasoning.',
      strengths: ['Cost-efficient', 'Fast adoption', 'Flexible licensing'],
      weaknesses: ['Benchmarks vary model-to-model']
    },
    'Mistral Large 2': {
      name: 'Mistral Large 2',
      subtitle: 'Mistral AI - Lightweight frontier performance',
      specs: ['Strong speed and efficiency', 'European open ecosystem', 'Clean API'],
      score: 91,
      rank: 6,
      company: 'Mistral AI',
      why: 'Lightweight frontier-class performance with strong speed and efficiency.',
      strengths: ['European ecosystem', 'Clean API', 'Rapidly improving'],
      weaknesses: ['Slightly behind Qwen/Llama in raw reasoning']
    },
    'GPT-4o mini': {
      name: 'GPT-4o mini',
      subtitle: 'OpenAI - Best small model in the world',
      specs: ['Frontier performance at 1/10th cost', 'Excellent for agents', 'Tool-use at scale'],
      score: 89,
      rank: 7,
      company: 'OpenAI',
      why: 'Best small model in the world. Frontier-level performance at 1/10th the cost.',
      strengths: ['Highly efficient', 'Excellent for agents', 'Tool-use and reasoning at scale'],
      weaknesses: ['Not a full frontier model']
    },
    'DeepSeek-V3': {
      name: 'DeepSeek-V3',
      subtitle: 'DeepSeek - Elite math and code performance',
      specs: ['Insane price-performance', 'Open weights available', 'Strong for cost-aware'],
      score: 88,
      rank: 8,
      company: 'DeepSeek',
      why: 'Elite math, code, and reasoning performance relative to size; extremely strong for cost-aware deployments.',
      strengths: ['Insane price-performance', 'Open weights', 'Math and code'],
      weaknesses: ['Not as multimodal as GPT/Gemini']
    },
    'Gemma 2-27B': {
      name: 'Gemma 2-27B',
      subtitle: 'Google - Best mid-sized open model',
      specs: ['Efficient with strong reasoning', 'Lightweight and fast', 'Runs practically anywhere'],
      score: 86,
      rank: 9,
      company: 'Google',
      why: 'One of the best mid-sized open models ever built — efficient with impressive reasoning for its size.',
      strengths: ['Lightweight', 'Fast', 'Runs anywhere'],
      weaknesses: ['Not frontier-tier']
    },
    'Phi-4': {
      name: 'Phi-4',
      subtitle: 'Microsoft Research - Best small model per parameter',
      specs: ['Small footprint', 'Excellent training efficiency', 'Reasoning champion'],
      score: 85,
      rank: 10,
      company: 'Microsoft Research',
      why: 'Best-in-class small model family for reasoning per parameter.',
      strengths: ['Small footprint', 'Training efficiency', 'Excellent reasoning'],
      weaknesses: ['Limited raw frontier performance']
    },
    // Hardware - GPUs Top 10 Rankings
    'H100 SXM': {
      name: 'H100 SXM',
      subtitle: 'NVIDIA - Backbone of frontier AI',
      specs: ['80GB–96GB HBM3', '700W TDP', 'Best for frontier model training'],
      score: 100,
      rank: 1,
      company: 'NVIDIA',
      why: 'Still the backbone of nearly every frontier AI cluster on Earth. HBM, tensor throughput, and NVLink ecosystem lock-in make it unstoppable.',
      strengths: ['Best real-world performance', 'Best scaling', 'Highest adoption'],
      weaknesses: ['Extremely supply-constrained']
    },
    'B200': {
      name: 'B200',
      subtitle: 'NVIDIA - Next-gen Blackwell architecture',
      specs: ['192GB HBM3e', '1000W TDP', '2×–4× uplift over H100'],
      score: 98,
      rank: 2,
      company: 'NVIDIA',
      why: 'Next-gen Blackwell architecture — massive gains in FP8/FP16 throughput and inference perf.',
      strengths: ['~2×–4× uplift over H100', 'Massive throughput gains'],
      weaknesses: ['Limited availability until mid–late 2025', 'Early customers only']
    },
    'H200': {
      name: 'H200',
      subtitle: 'NVIDIA - Memory champion for inference',
      specs: ['141GB HBM3e', '700W TDP', 'Inference-optimized'],
      score: 97,
      rank: 3,
      company: 'NVIDIA',
      why: 'An H100 but with more memory — absolutely dominant for LLM inference + long-context models.',
      strengths: ['Huge HBM3 capacity + bandwidth', 'LLM inference champion'],
      weaknesses: ['Slightly behind H100/B200 in training throughput']
    },
    'MI300X': {
      name: 'MI300X',
      subtitle: 'AMD - Best non-NVIDIA alternative',
      specs: ['192GB HBM3', 'Chiplet architecture', 'Competitive pricing vs NVIDIA'],
      score: 95,
      rank: 4,
      company: 'AMD',
      why: 'Best non-NVIDIA alternative — impressive memory capacity, strong inference throughput.',
      strengths: ['Major hyperscaler adoption', 'Excellent per-dollar performance'],
      weaknesses: ['Software ecosystem still behind CUDA stack']
    },
    'A100 80GB': {
      name: 'A100 80GB',
      subtitle: 'NVIDIA - Previous gen workhorse',
      specs: ['80GB HBM2e', '400W TDP', 'Still widely deployed'],
      score: 92,
      rank: 5,
      company: 'NVIDIA',
      why: 'The previous generation still widely deployed and very strong in inference.',
      strengths: ['Massive installed base', 'Proven reliability'],
      weaknesses: ['Aging architecture', 'Lower FP8 flexibility']
    },
    'RTX 4090': {
      name: 'RTX 4090',
      subtitle: 'NVIDIA - King of consumer AI compute',
      specs: ['24GB GDDR6X', '450W TDP', 'Best price/performance for research'],
      score: 89,
      rank: 6,
      company: 'NVIDIA',
      why: 'The king of consumer AI compute — unrivaled price/performance for local LLM/UI workloads.',
      strengths: ['Insane value', 'Dominates personal clusters + dev setups'],
      weaknesses: ['Not designed for multi-GPU scaling', 'Not data center ready']
    },
    'MI250X': {
      name: 'MI250X',
      subtitle: 'AMD - HPC-focused GPU',
      specs: ['128GB HBM2e', 'High memory bandwidth', 'Dual-GPU design'],
      score: 86,
      rank: 7,
      company: 'AMD',
      why: 'HPC-focused GPU still strong in certain scientific + ML training environments.',
      strengths: ['High memory bandwidth', 'Competitive in HPC/FP64'],
      weaknesses: ['Not ideal for cutting-edge LLM training']
    },
    'L40S': {
      name: 'L40S',
      subtitle: 'NVIDIA - Cost-optimized inference GPU',
      specs: ['48GB GDDR6', 'Enterprise deployments', 'Great inference efficiency'],
      score: 84,
      rank: 8,
      company: 'NVIDIA',
      why: 'A cost-optimized inference GPU for enterprise deployments; very strong for dev clusters.',
      strengths: ['Great inference cost efficiency', 'Enterprise-ready'],
      weaknesses: ['Mediocre for training large models']
    },
    'H20': {
      name: 'H20',
      subtitle: 'NVIDIA - China-only export variant',
      specs: ['96GB HBM3', 'Export-compliant', 'Strong FP8 throughput'],
      score: 82,
      rank: 9,
      company: 'NVIDIA',
      why: 'Export-compliant variant of H100; strong in LLM inference workloads.',
      strengths: ['Good FP8 throughput for its category', 'Compliant for China market'],
      weaknesses: ['Limited globally', 'Intentionally constrained']
    },
    'A800': {
      name: 'A800',
      subtitle: 'NVIDIA - Legacy China-only variant',
      specs: ['80GB HBM2e', 'A100-based', 'Widely used in China'],
      score: 80,
      rank: 10,
      company: 'NVIDIA',
      why: 'Legacy but still widely used in China for large-scale inference clustering.',
      strengths: ['Stable', 'Scalable', 'Affordable'],
      weaknesses: ['Far behind H100-class compute']
    },
    // Other entities
    'TPU v5e': { name: 'TPU v5e', subtitle: 'Google AI accelerator', specs: ['Cost-optimized training', 'High performance/watt', 'GCP exclusive'], score: 94 },
    'Trainium2': { name: 'Trainium2', subtitle: 'AWS training chip', specs: ['4x performance vs v1', 'NeuronLink interconnect', 'AWS infrastructure'], score: 92 },
    'Groq LPU': { name: 'Groq LPU', subtitle: 'Inference specialist chip', specs: ['Ultra-low latency', '500 tok/s inference', 'Deterministic performance'], score: 91 },
    'PyTorch': { name: 'PyTorch', subtitle: 'Dominant ML framework', specs: ['150M monthly downloads', 'Dynamic computation graphs', 'Meta-backed'], score: 98 },
    // Manufacturing - Semiconductor Fabs Top 10 Rankings
    'TSMC': {
      name: 'TSMC',
      subtitle: 'Taiwan - Undisputed leader in advanced nodes',
      specs: ['3nm process leader', '90% AI chip production', 'Apple & NVIDIA partner'],
      score: 100,
      rank: 1,
      company: 'Taiwan',
      why: 'Undisputed leader in advanced nodes (3nm, 2nm incoming), responsible for NVIDIA H100/B200/H200, Apple M-series, AMD MI300, and nearly every modern AI chip.',
      strengths: ['Best yields at leading nodes', 'Exclusive advanced packaging (CoWoS, InFO)', 'Largest AI-relevant production in the world'],
      weaknesses: ['Single-region geopolitical risk']
    },
    'Samsung Foundry': {
      name: 'Samsung Foundry',
      subtitle: 'South Korea - Only real competitor to TSMC',
      specs: ['3nm GAA shipping', 'World leader in memory', 'Advanced EUV capacity'],
      score: 95,
      rank: 2,
      company: 'South Korea',
      why: 'Only real competitor to TSMC at the cutting edge. Strong in GAA FET development (3nm GAA shipping), plus massive memory leadership.',
      strengths: ['World leader in memory (HBM + DDR)', 'Advanced EUV capacity'],
      weaknesses: ['Yields behind TSMC on leading logic nodes']
    },
    'Intel Foundry': {
      name: 'Intel Foundry',
      subtitle: 'USA - Re-emerging with advanced nodes',
      specs: ['18A/20A nodes', 'Advanced packaging', 'Government subsidies'],
      score: 90,
      rank: 3,
      company: 'USA',
      why: 'Re-emerging with 18A/20A nodes and heavy government subsidies. Strong bet for future AI chips and packaging.',
      strengths: ['Most advanced packaging stack (Foveros, EMIB)', 'Strong U.S. strategic positioning'],
      weaknesses: ['Still lagging TSMC/Samsung in leading-node volume']
    },
    'GlobalFoundries': {
      name: 'GlobalFoundries',
      subtitle: 'USA - Mid-tier node specialist',
      specs: ['12nm/22nm/45nm', 'Automotive/industrial', 'Edge AI chips'],
      score: 85,
      rank: 4,
      company: 'USA',
      why: 'Dominant in mid-tier nodes (12nm, 22nm, 45nm). Not cutting-edge, but huge for automotive, industrial, RF, and edge AI chips.',
      strengths: ['Essential for global supply chain resilience'],
      weaknesses: ['No EUV', 'Not competing at 5nm/3nm']
    },
    'SMIC': {
      name: 'SMIC',
      subtitle: 'China - Largest Chinese foundry',
      specs: ['Rapidly advancing', 'Domestic AI chips', 'Massive scale'],
      score: 80,
      rank: 5,
      company: 'China',
      why: 'China\'s top fab, rapidly advancing with constrained tools. Important for domestic AI chip production.',
      strengths: ['Massive scale', 'Strategic importance'],
      weaknesses: ['Tech restricted (no EUV)', 'Lower yields']
    },
    'UMC': {
      name: 'UMC',
      subtitle: 'Taiwan - Second-largest Taiwan foundry',
      specs: ['Mature nodes', 'IoT/automotive', 'Stable supply'],
      score: 75,
      rank: 6,
      company: 'Taiwan',
      why: 'Taiwan\'s second-largest foundry; excels in mature nodes.',
      strengths: ['Stable supply for IoT, automotive, controllers'],
      weaknesses: ['No leading-edge nodes']
    },
    'Tower Semiconductor': {
      name: 'Tower Semiconductor',
      subtitle: 'Israel - Specialty process leader',
      specs: ['Analog/RF specialist', 'Sensors/power', 'Global presence'],
      score: 72,
      rank: 7,
      company: 'Israel',
      why: 'Global niche leader for analog, RF, and specialty process technologies.',
      strengths: ['Essential for sensors, power management, RF ICs'],
      weaknesses: ['Lower AI-chip relevance']
    },
    'Rapidus': {
      name: 'Rapidus',
      subtitle: 'Japan - Emerging advanced-node fab',
      specs: ['2nm program with IBM', 'Japan/U.S. backed', 'Strategic positioning'],
      score: 68,
      rank: 8,
      company: 'Japan',
      why: 'Still emerging, but backed by Japan + U.S. to create a new advanced-node competitor (2nm program with IBM).',
      strengths: ['Strategic government support'],
      weaknesses: ['Not in volume production yet']
    },
    'Hua Hong Semiconductor': {
      name: 'Hua Hong Semiconductor',
      subtitle: 'China - Specialty-node foundry',
      specs: ['Analog/power specialist', 'Domestic independence', 'Huge scale'],
      score: 65,
      rank: 9,
      company: 'China',
      why: 'Major Chinese specialty-node foundry (analog/power), essential for domestic chip independence.',
      strengths: ['Huge scale in older nodes'],
      weaknesses: ['Not a leading-edge logic player']
    },
    'DB HiTek': {
      name: 'DB HiTek',
      subtitle: 'South Korea - Analog/mixed-signal specialist',
      specs: ['Automotive chips', 'Display drivers', 'Sensor ICs'],
      score: 62,
      rank: 10,
      company: 'South Korea',
      why: 'Specializes in analog/mixed-signal and automotive chips.',
      strengths: ['Strong for sensors, display drivers'],
      weaknesses: ['Limited relevance to frontier AI silicon']
    },
    // Robotics - Humanoid Robots Top 10 Rankings
    'Figure 01': {
      name: 'Figure 01',
      subtitle: 'Figure AI - Most advanced full-stack humanoid',
      specs: ['BMW partnership', 'OpenAI integration', 'Full dexterity'],
      score: 100,
      rank: 1,
      company: 'Figure AI',
      why: 'Most advanced full-stack humanoid today. Excellent mobility, stable locomotion, human-level hand control progress, and strongest enterprise partnerships (BMW, OpenAI).',
      strengths: ['Best-in-class teleoperation + imitation learning', 'Real warehouse deployment tests', 'Tightest AI integration with foundation models'],
      weaknesses: ['Still early in mass production']
    },
    'Tesla Optimus Gen 2': {
      name: 'Tesla Optimus Gen 2',
      subtitle: 'Tesla - Fastest improvement curve',
      specs: ['Real-time end-to-end control', 'Human-like hands', 'Smooth gait'],
      score: 98,
      rank: 2,
      company: 'Tesla',
      why: 'Fastest improvement curve in robotics. Real-time end-to-end learned control, human-like hands, extremely smooth gait, and Tesla\'s manufacturing scale gives it the long-term edge.',
      strengths: ['Best hand dexterity in the field', 'Insane training data advantage (Optimus Gym)', 'Robotics + FSD model cross-pollination'],
      weaknesses: ['Not in customer pilots yet']
    },
    'Digit Gen 3': {
      name: 'Digit Gen 3',
      subtitle: 'Agility Robotics - First commercial deployment',
      specs: ['Warehouse deployments', 'Safety certified', 'Stable mobility'],
      score: 96,
      rank: 3,
      company: 'Agility Robotics',
      why: 'First humanoid approved for actual commercial deployment in warehouses. Most mature hardware, safety certs, and stable mobility.',
      strengths: ['Only humanoid with real on-site deployments', 'Rugged, reliable, affordable', 'Great at repetitive warehouse tasks'],
      weaknesses: ['Not as dexterous or human-like as Figure/Tesla']
    },
    'Phoenix': {
      name: 'Phoenix',
      subtitle: 'Sanctuary AI - Hands-first dexterity leader',
      specs: ['Fine motor skills', 'Foundation model cognition', 'Teleoperation'],
      score: 94,
      rank: 4,
      company: 'Sanctuary AI',
      why: 'Industry leader in dexterous teleoperation and fine motor skills — the "hands-first" approach. Strong cognitive layer using foundation models.',
      strengths: ['Best manipulation of small objects', 'Excellent remote operation fidelity'],
      weaknesses: ['Locomotion and mobile autonomy lag behind leaders']
    },
    'Unitree G1 Pro': {
      name: 'Unitree G1 Pro',
      subtitle: 'Unitree - Price-performance king',
      specs: ['Fast locomotion', 'Affordable', 'Strong AI pipeline'],
      score: 92,
      rank: 5,
      company: 'Unitree',
      why: 'The price-performance king. Most affordable humanoid with surprisingly good mobility and strong early AI pipeline.',
      strengths: ['Very fast locomotion', 'Affordable enough for research + startups'],
      weaknesses: ['Limited manipulation capabilities']
    },
    'Apollo': {
      name: 'Apollo',
      subtitle: 'Apptronik - Industrial reliability focus',
      specs: ['Mercedes partnership', 'Good mobility', 'Industry-focused'],
      score: 89,
      rank: 6,
      company: 'Apptronik',
      why: 'Well-designed with industry-focused reliability. Strong partnerships (Mercedes) and good engineering discipline.',
      strengths: ['Practical industrial-first design', 'Good mobility and endurance'],
      weaknesses: ['Not frontier-level in dexterity']
    },
    'GR1': {
      name: 'GR1',
      subtitle: 'Fourier Intelligence - China manufacturing leader',
      specs: ['Strong China presence', 'Improving locomotion', 'Manufacturing scale'],
      score: 87,
      rank: 7,
      company: 'Fourier Intelligence',
      why: 'Strong presence in China and rapidly improving locomotion + manufacturing capacity.',
      strengths: ['Scaling manufacturing fastest after Unitree'],
      weaknesses: ['Early software stack', 'Limited manipulation']
    },
    'NEO': {
      name: 'NEO',
      subtitle: '1X Robotics - Indoor autonomy specialist',
      specs: ['Mobile indoor robotics', 'Excellent torso control', 'AI workforce integration'],
      score: 85,
      rank: 8,
      company: '1X Robotics',
      why: 'Leader in mobile indoor robotics. Excellent torso + arm control, heavy focus on teleop + "AI workforce" integration.',
      strengths: ['Strong autonomy indoors', 'Good manipulation training'],
      weaknesses: ['Not truly humanoid legs-first design (some variants use wheels)']
    },
    'Robosapien X': {
      name: 'Robosapien X',
      subtitle: 'Raytheon - Defense-grade robustness',
      specs: ['Military-grade', 'Advanced telepresence', 'Rugged hardware'],
      score: 83,
      rank: 9,
      company: 'Raytheon Collaborative Systems',
      why: 'More defense-focused, but strong balance, rugged hardware, and advanced telepresence control.',
      strengths: ['Military-grade robustness'],
      weaknesses: ['Not optimized for commercial markets']
    },
    'Walker X': {
      name: 'Walker X',
      subtitle: 'UBTECH - Balanced general-purpose humanoid',
      specs: ['Smooth locomotion', 'Good stability', 'Home robotics'],
      score: 81,
      rank: 10,
      company: 'UBTECH',
      why: 'Older than most on this list, but still one of the most balanced general-purpose humanoids.',
      strengths: ['Smooth locomotion, good stability', 'Solid home robotics demos'],
      weaknesses: ['Outpaced by newer AI-first entrants']
    }
  };

  // Domain-specific insights
  const domainInsights = {
    'Software': {
      topRankings: [
        { name: 'GPT-4o' },
        { name: 'Gemini 3 Pro' },
        { name: 'Claude 3.5 Opus' },
        { name: 'Llama 3.1 405B' },
        { name: 'Qwen 2.5-72B' }
      ],
      vendors: ['OpenAI', 'Anthropic', 'Google DeepMind', 'Meta', 'Alibaba'],
      trends: [
        'Multimodal models are the new standard',
        'Context windows pushing 1M+ tokens',
        'Open-weight models closing the gap',
        'Reasoning capabilities leap forward',
        'Agent-native architectures emerging'
      ]
    },
    'Hardware': {
      topRankings: [
        { name: 'H100 SXM' },
        { name: 'B200' },
        { name: 'H200' },
        { name: 'MI300X' },
        { name: 'A100 80GB' }
      ],
      vendors: ['NVIDIA', 'AMD', 'Intel', 'Google (TPU)', 'AWS (Trainium)'],
      trends: [
        'HBM3e memory is the main bottleneck',
        'NVIDIA supply-constrained through 2025',
        'Blackwell architecture 2-4× performance leap',
        'AMD gaining enterprise traction',
        'Custom ASICs for inference scaling'
      ]
    },
    'Manufacturing': {
      topRankings: [
        { name: 'TSMC' },
        { name: 'Samsung Foundry' },
        { name: 'Intel Foundry' },
        { name: 'GlobalFoundries' },
        { name: 'SMIC' }
      ],
      vendors: ['ASML', 'Lam Research', 'Applied Materials', 'Tokyo Electron', 'KLA'],
      trends: [
        'CoWoS packaging capacity is critical path',
        '2nm GAA nodes entering production 2025',
        'US-China supply chain bifurcation',
        'Advanced packaging more important than node',
        'Geopolitical risk driving diversification'
      ]
    },
    'Robotics': {
      topRankings: [
        { name: 'Figure 01' },
        { name: 'Tesla Optimus Gen 2' },
        { name: 'Digit Gen 3' },
        { name: 'Phoenix' },
        { name: 'Unitree G1 Pro' }
      ],
      vendors: ['Figure AI', 'Tesla', 'Agility Robotics', 'Sanctuary AI', 'Unitree'],
      trends: [
        'Vision-Language-Action models enable generalization',
        'First commercial humanoid deployments in 2025',
        'Embodied AI is the next frontier',
        'Teleoperation → imitation learning pipeline',
        'Hardware costs dropping rapidly'
      ]
    },
    'People': {
      topRankings: [
        { name: 'Sam Altman' },
        { name: 'Demis Hassabis' },
        { name: 'Jensen Huang' },
        { name: 'Ilya Sutskever' },
        { name: 'Dario Amodei' }
      ],
      vendors: ['OpenAI', 'Google DeepMind', 'NVIDIA', 'Anthropic', 'Meta AI'],
      trends: [
        'Founder-led AI labs dominating innovation',
        'Research talent consolidating at top labs',
        'Safety-focused leadership emerging',
        'Technical founders vs. business executives',
        'Investor networks shaping AGI roadmaps'
      ]
    }
  };

  const insights = domainInsights[selectedTopic] || domainInsights['Software'];
  const entity = hoveredEntity ? entityDetails[hoveredEntity] : null;
  const rankings = selectedSubsection ? subsectionRankings[selectedSubsection] : null;

  // Safety check - if no insights and no rankings, don't render
  if (!insights && !rankings) {
    return null;
  }

  return (
    <div style={{
      background: 'rgba(0,0,0,0.5)',
      border: '1px solid #222',
      borderRadius: '8px',
      padding: '20px',
      backdropFilter: 'blur(10px)'
    }}>
      {rankings ? (
        // Subsection Rankings View
        <div>
          <h3 style={{
            fontSize: '13px',
            color: domainColor,
            textTransform: 'uppercase',
            letterSpacing: '1px',
            fontWeight: 700,
            marginBottom: '20px'
          }}>
            {rankings.title}
          </h3>
          <div>
            {rankings.items.map((item, i) => (
              <div key={i} style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px',
                marginBottom: '16px',
                paddingBottom: '16px',
                borderBottom: i < rankings.items.length - 1 ? '1px solid #222' : 'none'
              }}>
                <div style={{
                  fontSize: '16px',
                  fontWeight: 700,
                  color: domainColor,
                  fontFamily: theme.fonts.mono,
                  minWidth: '24px'
                }}>
                  {item.rank}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontSize: '13px',
                    color: '#fff',
                    fontWeight: 600,
                    marginBottom: '4px'
                  }}>
                    {item.name}
                  </div>
                  <div style={{
                    fontSize: '11px',
                    color: '#666',
                    fontFamily: theme.fonts.mono
                  }}>
                    {item.company}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : entity ? (
        // Entity Preview Mode
        <div>
          <div style={{
            fontSize: '11px',
            color: domainColor,
            textTransform: 'uppercase',
            letterSpacing: '1px',
            fontWeight: 600,
            marginBottom: '12px'
          }}>
            {entity.rank ? `#${entity.rank} Model` : 'Entity Preview'}
          </div>
          <h3 style={{
            fontSize: '18px',
            color: '#fff',
            fontWeight: 700,
            margin: '0 0 4px 0'
          }}>
            {entity.name}
          </h3>
          <p style={{
            fontSize: '12px',
            color: '#888',
            margin: '0 0 16px 0'
          }}>
            {entity.subtitle}
          </p>

          {entity.why && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{
                fontSize: '11px',
                color: domainColor,
                textTransform: 'uppercase',
                letterSpacing: '1px',
                fontWeight: 600,
                marginBottom: '8px'
              }}>
                Why #{entity.rank}
              </div>
              <p style={{
                fontSize: '12px',
                color: '#aaa',
                lineHeight: '1.6',
                margin: 0
              }}>
                {entity.why}
              </p>
            </div>
          )}

          {entity.strengths && (
            <div style={{ marginBottom: '12px' }}>
              <div style={{
                fontSize: '11px',
                color: '#00ff88',
                textTransform: 'uppercase',
                letterSpacing: '1px',
                fontWeight: 600,
                marginBottom: '6px'
              }}>
                Strengths
              </div>
              {entity.strengths.map((strength, i) => (
                <div key={i} style={{
                  fontSize: '11px',
                  color: '#aaa',
                  marginBottom: '4px',
                  paddingLeft: '12px',
                  position: 'relative'
                }}>
                  <span style={{
                    position: 'absolute',
                    left: 0,
                    color: '#00ff88'
                  }}>+</span>
                  {strength}
                </div>
              ))}
            </div>
          )}

          {entity.weaknesses && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{
                fontSize: '11px',
                color: '#ff4444',
                textTransform: 'uppercase',
                letterSpacing: '1px',
                fontWeight: 600,
                marginBottom: '6px'
              }}>
                Weaknesses
              </div>
              {entity.weaknesses.map((weakness, i) => (
                <div key={i} style={{
                  fontSize: '11px',
                  color: '#aaa',
                  marginBottom: '4px',
                  paddingLeft: '12px',
                  position: 'relative'
                }}>
                  <span style={{
                    position: 'absolute',
                    left: 0,
                    color: '#ff4444'
                  }}>−</span>
                  {weakness}
                </div>
              ))}
            </div>
          )}

          <div style={{ marginBottom: '16px' }}>
            {entity.specs.map((spec, i) => (
              <div key={i} style={{
                fontSize: '12px',
                color: '#aaa',
                marginBottom: '6px',
                paddingLeft: '12px',
                position: 'relative'
              }}>
                <span style={{
                  position: 'absolute',
                  left: 0,
                  color: domainColor
                }}>•</span>
                {spec}
              </div>
            ))}
          </div>
        </div>
      ) : (
        // Domain RRSRCH Leaderboard Mode
        <div>
          <h3 style={{
            fontSize: '13px',
            color: domainColor,
            textTransform: 'uppercase',
            letterSpacing: '1px',
            fontWeight: 700,
            marginBottom: '20px'
          }}>
            RRSRCH Leaderboards
          </h3>

          {/* Software Domain - Models */}
          {selectedTopic === 'Software' && (
            <div>
              <div style={{
                fontSize: '11px',
                color: '#666',
                textTransform: 'uppercase',
                letterSpacing: '1px',
                fontWeight: 600,
                marginBottom: '12px'
              }}>
                Top AI Models
              </div>
              <div style={{ marginBottom: '20px' }}>
                {subsectionRankings['Models'].items.slice(0, 8).map((item, i) => (
                  <div key={i} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    marginBottom: '10px',
                    paddingBottom: '10px',
                    borderBottom: i < 7 ? '1px solid #1a1a1a' : 'none'
                  }}>
                    <div style={{
                      fontSize: '13px',
                      fontWeight: 700,
                      color: domainColor,
                      fontFamily: theme.fonts.mono,
                      minWidth: '20px'
                    }}>
                      {item.rank}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{
                        fontSize: '12px',
                        color: '#fff',
                        fontWeight: 500
                      }}>
                        {item.name}
                      </div>
                      <div style={{
                        fontSize: '10px',
                        color: '#555',
                        fontFamily: theme.fonts.mono
                      }}>
                        {item.company}
                      </div>
                    </div>
                    <div style={{
                      fontSize: '11px',
                      color: '#666',
                      fontFamily: theme.fonts.mono
                    }}>
                      {item.score}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Hardware Domain - GPUs */}
          {selectedTopic === 'Hardware' && (
            <div>
              <div style={{
                fontSize: '11px',
                color: '#666',
                textTransform: 'uppercase',
                letterSpacing: '1px',
                fontWeight: 600,
                marginBottom: '12px'
              }}>
                Top AI GPUs
              </div>
              <div style={{ marginBottom: '20px' }}>
                {subsectionRankings['GPUs'].items.slice(0, 8).map((item, i) => (
                  <div key={i} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    marginBottom: '10px',
                    paddingBottom: '10px',
                    borderBottom: i < 7 ? '1px solid #1a1a1a' : 'none'
                  }}>
                    <div style={{
                      fontSize: '13px',
                      fontWeight: 700,
                      color: domainColor,
                      fontFamily: theme.fonts.mono,
                      minWidth: '20px'
                    }}>
                      {item.rank}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{
                        fontSize: '12px',
                        color: '#fff',
                        fontWeight: 500
                      }}>
                        {item.name}
                      </div>
                      <div style={{
                        fontSize: '10px',
                        color: '#555',
                        fontFamily: theme.fonts.mono
                      }}>
                        {item.company}
                      </div>
                    </div>
                    <div style={{
                      fontSize: '11px',
                      color: '#666',
                      fontFamily: theme.fonts.mono
                    }}>
                      {item.score}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Manufacturing Domain - Fabs */}
          {selectedTopic === 'Manufacturing' && (
            <div>
              <div style={{
                fontSize: '11px',
                color: '#666',
                textTransform: 'uppercase',
                letterSpacing: '1px',
                fontWeight: 600,
                marginBottom: '12px'
              }}>
                Top Semiconductor Fabs
              </div>
              <div style={{ marginBottom: '20px' }}>
                {subsectionRankings['Fabs'].items.slice(0, 8).map((item, i) => (
                  <div key={i} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    marginBottom: '10px',
                    paddingBottom: '10px',
                    borderBottom: i < 7 ? '1px solid #1a1a1a' : 'none'
                  }}>
                    <div style={{
                      fontSize: '13px',
                      fontWeight: 700,
                      color: domainColor,
                      fontFamily: theme.fonts.mono,
                      minWidth: '20px'
                    }}>
                      {item.rank}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{
                        fontSize: '12px',
                        color: '#fff',
                        fontWeight: 500
                      }}>
                        {item.name}
                      </div>
                      <div style={{
                        fontSize: '10px',
                        color: '#555',
                        fontFamily: theme.fonts.mono
                      }}>
                        {item.company}
                      </div>
                    </div>
                    <div style={{
                      fontSize: '11px',
                      color: '#666',
                      fontFamily: theme.fonts.mono
                    }}>
                      {item.score}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Robotics Domain - Humanoid Robots */}
          {selectedTopic === 'Robotics' && (
            <div>
              <div style={{
                fontSize: '11px',
                color: '#666',
                textTransform: 'uppercase',
                letterSpacing: '1px',
                fontWeight: 600,
                marginBottom: '12px'
              }}>
                Top Humanoid Robots
              </div>
              <div style={{ marginBottom: '20px' }}>
                {subsectionRankings['Humanoid Robotics'].items.slice(0, 8).map((item, i) => (
                  <div key={i} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    marginBottom: '10px',
                    paddingBottom: '10px',
                    borderBottom: i < 7 ? '1px solid #1a1a1a' : 'none'
                  }}>
                    <div style={{
                      fontSize: '13px',
                      fontWeight: 700,
                      color: domainColor,
                      fontFamily: theme.fonts.mono,
                      minWidth: '20px'
                    }}>
                      {item.rank}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{
                        fontSize: '12px',
                        color: '#fff',
                        fontWeight: 500
                      }}>
                        {item.name}
                      </div>
                      <div style={{
                        fontSize: '10px',
                        color: '#555',
                        fontFamily: theme.fonts.mono
                      }}>
                        {item.company}
                      </div>
                    </div>
                    <div style={{
                      fontSize: '11px',
                      color: '#666',
                      fontFamily: theme.fonts.mono
                    }}>
                      {item.score}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* People Domain - Keep trends for now since we don't have people rankings */}
          {selectedTopic === 'People' && (
            <div>
              <div style={{
                fontSize: '11px',
                color: '#666',
                textTransform: 'uppercase',
                letterSpacing: '1px',
                fontWeight: 600,
                marginBottom: '12px'
              }}>
                AI Leadership Landscape
              </div>
              <div>
                {insights.trends.map((trend, i) => (
                  <div key={i} style={{
                    fontSize: '12px',
                    color: '#aaa',
                    marginBottom: '10px',
                    paddingBottom: '10px',
                    paddingLeft: '12px',
                    position: 'relative',
                    lineHeight: '1.5',
                    borderBottom: i < insights.trends.length - 1 ? '1px solid #1a1a1a' : 'none'
                  }}>
                    <span style={{
                      position: 'absolute',
                      left: 0,
                      color: domainColor
                    }}>•</span>
                    {trend}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Subsection Detail Page Component
function SubsectionDetail({ subsectionName, domainColor, onBack, items, onEntityHover, onEntityClick }) {
  const [expandedEntity, setExpandedEntity] = useState(null);

  // Subsection content data
  const subsectionContent = {
    'Models': {
      title: 'AI Models',
      explanation: 'Large language models (LLMs) and foundation models are neural networks trained on massive datasets to understand, generate, and reason about human language. These models range from 7 billion to over 1 trillion parameters and power everything from ChatGPT to coding assistants.',
      newcomerInfo: [
        'Start with GPT-4 or Claude 3 for general tasks',
        'Llama 3 and Mistral are leading open-weight options',
        'Context window (how much text the model can process) is critical',
        'Benchmark scores (MMLU, HumanEval) indicate capability',
        'Multimodal models can process images, not just text'
      ],
      keyMetrics: [
        { label: 'Active Production Models', value: '120+' },
        { label: 'Average Benchmark Score', value: '79.2/100' },
        { label: 'Largest Context Window', value: '1M tokens' },
        { label: 'Market Leaders', value: 'OpenAI, Anthropic' }
      ]
    },
    'GPUs': {
      title: 'GPUs',
      explanation: 'Graphics Processing Units (GPUs) are specialized processors designed for parallel computation, making them essential for training and running AI models. NVIDIA dominates the market with H100 and upcoming B200 chips, though AMD and others are competing.',
      newcomerInfo: [
        'H100 is the gold standard for training frontier models',
        'NVIDIA controls ~88% of the AI accelerator market',
        'HBM (High Bandwidth Memory) capacity is often the bottleneck',
        'Supply is severely constrained through 2026',
        'RTX 4090 offers best price/performance for researchers'
      ],
      keyMetrics: [
        { label: 'Peak Performance', value: '1979 TFLOPS (H100)' },
        { label: 'Market Leader', value: 'NVIDIA' },
        { label: 'Avg Top-Tier Cost', value: '$18K-$30K' },
        { label: '2024 Shipments', value: '2.5M units' }
      ]
    },
    'AI Frameworks': {
      title: 'AI Frameworks',
      explanation: 'Machine learning frameworks are software libraries that provide the building blocks for developing AI models. PyTorch and TensorFlow dominate, with PyTorch winning mindshare in research while both remain strong in production.',
      newcomerInfo: [
        'PyTorch is recommended for most new projects',
        'Dynamic computation graphs make debugging easier',
        'JAX is emerging for high-performance computing',
        'Most modern models are trained with PyTorch',
        'Framework choice affects ecosystem access'
      ],
      keyMetrics: [
        { label: 'Top Framework', value: 'PyTorch' },
        { label: 'Monthly Downloads', value: '265M combined' },
        { label: 'Active ML Projects', value: '1.2M+' },
        { label: 'GitHub Stars', value: '366K combined' }
      ]
    },
    'Fabs': {
      title: 'Semiconductor Fabs',
      explanation: 'Semiconductor fabrication plants (fabs) are specialized facilities that manufacture the chips powering AI. TSMC dominates advanced process nodes, producing over 90% of cutting-edge AI chips. Their 3nm and upcoming 2nm processes are critical to AI hardware advancement.',
      newcomerInfo: [
        'TSMC manufactures chips for NVIDIA, Apple, AMD',
        'CoWoS packaging enables HBM integration',
        'Geopolitical risk is a major concern',
        'Process node leadership drives AI performance',
        'Capacity constraints affect entire industry'
      ],
      keyMetrics: [
        { label: 'Market Leader', value: 'TSMC' },
        { label: 'Leading Process', value: '3nm' },
        { label: 'Major Fabs', value: '5 key players' },
        { label: 'TSMC Market Share', value: '90% advanced nodes' }
      ]
    },
    'Humanoid Robotics': {
      title: 'Humanoid Robotics',
      explanation: 'Humanoid robots are autonomous systems designed to replicate human form and movement. Recent advances in AI and actuator technology have enabled Figure 02, Tesla Optimus, and others to perform complex manipulation tasks.',
      newcomerInfo: [
        'Figure 02 leads in commercial deployment',
        'Tesla Optimus targets mass manufacturing',
        'Hardware costs are decreasing rapidly',
        'Autonomy stacks leverage LLMs for task planning',
        'Key challenges: dexterity, power, and cost'
      ],
      keyMetrics: [
        { label: 'Leading Platform', value: 'Figure 02' },
        { label: 'Est. Market Size', value: '$38B by 2035' },
        { label: 'Active Platforms', value: '12+' },
        { label: 'Key Players', value: 'Figure, Tesla, 1X' }
      ]
    }
  };

  const content = subsectionContent[subsectionName] || {
    title: subsectionName,
    explanation: `Detailed information about ${subsectionName} in the AI ecosystem.`,
    newcomerInfo: [
      'This is a key component of modern AI infrastructure',
      'Understanding this area is essential for AI practitioners',
      'Market dynamics are rapidly evolving'
    ],
    keyMetrics: []
  };

  return (
    <div>
      {/* Back button */}
      <button
        onClick={onBack}
        style={{
          background: 'transparent',
          border: `1px solid ${domainColor}`,
          borderRadius: '6px',
          color: domainColor,
          padding: '8px 16px',
          fontSize: '12px',
          fontWeight: 600,
          cursor: 'pointer',
          marginBottom: '30px',
          transition: 'all 0.2s ease'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = `${domainColor}22`;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent';
        }}
      >
        ← Back to {subsectionName.split(' ')[0]} Overview
      </button>

      {/* Title */}
      <h1 style={{
        fontSize: '36px',
        color: domainColor,
        fontWeight: 700,
        margin: '0 0 20px 0',
        letterSpacing: '1px'
      }}>
        {content.title}
      </h1>

      {/* Explanation */}
      <div style={{
        background: 'rgba(0,0,0,0.3)',
        border: '1px solid #222',
        borderRadius: '8px',
        padding: '24px',
        marginBottom: '30px'
      }}>
        <h3 style={{
          fontSize: '14px',
          color: domainColor,
          textTransform: 'uppercase',
          letterSpacing: '1px',
          fontWeight: 700,
          marginBottom: '16px'
        }}>
          What is this?
        </h3>
        <p style={{
          fontSize: '15px',
          color: '#aaa',
          lineHeight: '1.8',
          margin: 0
        }}>
          {content.explanation}
        </p>
      </div>

      {/* Entity Collage */}
      {items && items.length > 0 && (
        <div style={{
          background: 'rgba(0,0,0,0.3)',
          border: '1px solid #222',
          borderRadius: '8px',
          padding: '24px'
        }}>
          <h3 style={{
            fontSize: '14px',
            color: domainColor,
            textTransform: 'uppercase',
            letterSpacing: '1px',
            fontWeight: 700,
            marginBottom: '20px'
          }}>
            Explore {subsectionName}
          </h3>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
            gap: '12px'
          }}>
            {items.map((item, i) => (
              <React.Fragment key={i}>
                <div
                  onClick={() => {
                    if (entityInfo[item]) {
                      setExpandedEntity(expandedEntity === item ? null : item);
                    }
                  }}
                  onMouseEnter={() => onEntityHover && onEntityHover(item)}
                  onMouseLeave={() => onEntityHover && onEntityHover(null)}
                  style={{
                    background: expandedEntity === item ? `${domainColor}22` : `${domainColor}11`,
                    border: expandedEntity === item ? `1px solid ${domainColor}` : `1px solid ${domainColor}33`,
                    borderRadius: '6px',
                    padding: '16px',
                    fontSize: '13px',
                    color: '#fff',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    textAlign: 'center',
                    fontWeight: 500
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.background = `${domainColor}22`;
                    e.currentTarget.style.borderColor = domainColor;
                    e.currentTarget.style.transform = 'translateY(-2px)';
                  }}
                  onMouseOut={(e) => {
                    if (expandedEntity !== item) {
                      e.currentTarget.style.background = `${domainColor}11`;
                      e.currentTarget.style.borderColor = `${domainColor}33`;
                      e.currentTarget.style.transform = 'translateY(0)';
                    }
                  }}
                >
                {item}
              </div>

              {/* Expanded entity info */}
              {expandedEntity === item && entityInfo[item] && (
                <div style={{
                  gridColumn: '1 / -1',
                  background: 'rgba(0,0,0,0.5)',
                  border: `1px solid ${domainColor}`,
                  borderRadius: '8px',
                  padding: '20px',
                  marginTop: '-10px',
                  marginBottom: '10px'
                }}>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: '15px'
                  }}>
                    <div>
                      <h4 style={{
                        fontSize: '18px',
                        color: '#fff',
                        margin: '0 0 5px 0',
                        fontWeight: 700
                      }}>
                        {entityInfo[item].name}
                      </h4>
                      <div style={{
                        fontSize: '12px',
                        color: '#666',
                        fontFamily: theme.fonts.mono
                      }}>
                        {entityInfo[item].developer}
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedEntity(null);
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#666',
                        fontSize: '20px',
                        cursor: 'pointer',
                        padding: 0,
                        lineHeight: 1
                      }}
                      onMouseEnter={(e) => e.target.style.color = '#fff'}
                      onMouseLeave={(e) => e.target.style.color = '#666'}
                    >
                      ×
                    </button>
                  </div>

                  {/* Benchmarks Grid (if available) */}
                  {(entityInfo[item].contextWindow || entityInfo[item].aaiIndex) && (
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))',
                      gap: '10px',
                      marginBottom: '15px',
                      padding: '12px',
                      background: 'rgba(0,0,0,0.3)',
                      borderRadius: '6px'
                    }}>
                      {entityInfo[item].contextWindow && (
                        <div>
                          <div style={{ fontSize: '9px', color: '#666', marginBottom: '3px' }}>CONTEXT</div>
                          <div style={{ fontSize: '12px', color: domainColor, fontWeight: 600, fontFamily: theme.fonts.mono }}>{entityInfo[item].contextWindow}</div>
                        </div>
                      )}
                      {entityInfo[item].aaiIndex && (
                        <div>
                          <div style={{ fontSize: '9px', color: '#666', marginBottom: '3px' }}>AAI INDEX</div>
                          <div style={{ fontSize: '12px', color: domainColor, fontWeight: 600, fontFamily: theme.fonts.mono }}>{entityInfo[item].aaiIndex}</div>
                        </div>
                      )}
                      {entityInfo[item].critPt && (
                        <div>
                          <div style={{ fontSize: '9px', color: '#666', marginBottom: '3px' }}>CRITPT</div>
                          <div style={{ fontSize: '12px', color: domainColor, fontWeight: 600, fontFamily: theme.fonts.mono }}>{entityInfo[item].critPt}</div>
                        </div>
                      )}
                      {entityInfo[item].mmmuPro && (
                        <div>
                          <div style={{ fontSize: '9px', color: '#666', marginBottom: '3px' }}>MMMU PRO</div>
                          <div style={{ fontSize: '12px', color: domainColor, fontWeight: 600, fontFamily: theme.fonts.mono }}>{entityInfo[item].mmmuPro}</div>
                        </div>
                      )}
                      {entityInfo[item].price && (
                        <div>
                          <div style={{ fontSize: '9px', color: '#666', marginBottom: '3px' }}>PRICE</div>
                          <div style={{ fontSize: '11px', color: domainColor, fontWeight: 600 }}>{entityInfo[item].price}</div>
                        </div>
                      )}
                      {entityInfo[item].speed && entityInfo[item].speed !== 'TBD' && (
                        <div>
                          <div style={{ fontSize: '9px', color: '#666', marginBottom: '3px' }}>SPEED</div>
                          <div style={{ fontSize: '12px', color: domainColor, fontWeight: 600, fontFamily: theme.fonts.mono }}>{entityInfo[item].speed}</div>
                        </div>
                      )}
                    </div>
                  )}

                  <div style={{ marginBottom: '12px' }}>
                    <div style={{
                      fontSize: '10px',
                      color: domainColor,
                      textTransform: 'uppercase',
                      letterSpacing: '1px',
                      marginBottom: '5px',
                      fontWeight: 600
                    }}>Type</div>
                    <div style={{ fontSize: '13px', color: '#fff', lineHeight: '1.5' }}>
                      {entityInfo[item].type}
                    </div>
                  </div>

                  <div style={{ marginBottom: '12px' }}>
                    <div style={{
                      fontSize: '10px',
                      color: domainColor,
                      textTransform: 'uppercase',
                      letterSpacing: '1px',
                      marginBottom: '5px',
                      fontWeight: 600
                    }}>Strengths</div>
                    <div style={{ fontSize: '13px', color: '#aaa', lineHeight: '1.5' }}>
                      {entityInfo[item].strengths}
                    </div>
                  </div>

                  <div style={{ marginBottom: '12px' }}>
                    <div style={{
                      fontSize: '10px',
                      color: domainColor,
                      textTransform: 'uppercase',
                      letterSpacing: '1px',
                      marginBottom: '5px',
                      fontWeight: 600
                    }}>Use Cases</div>
                    <div style={{ fontSize: '13px', color: '#aaa', lineHeight: '1.5' }}>
                      {entityInfo[item].useCases}
                    </div>
                  </div>

                  <div>
                    <div style={{
                      fontSize: '10px',
                      color: domainColor,
                      textTransform: 'uppercase',
                      letterSpacing: '1px',
                      marginBottom: '5px',
                      fontWeight: 600
                    }}>Notes</div>
                    <div style={{ fontSize: '13px', color: '#aaa', lineHeight: '1.5' }}>
                      {entityInfo[item].notes}
                    </div>
                  </div>
                </div>
              )}
            </React.Fragment>
            ))}
          </div>
        </div>
      )}

      {/* Info for Newcomers */}
      <div style={{
        background: 'rgba(0,0,0,0.3)',
        border: '1px solid #222',
        borderRadius: '8px',
        padding: '24px',
        marginTop: '30px'
      }}>
        <h3 style={{
          fontSize: '14px',
          color: domainColor,
          textTransform: 'uppercase',
          letterSpacing: '1px',
          fontWeight: 700,
          marginBottom: '16px'
        }}>
          Essential Knowledge
        </h3>
        <div>
          {content.newcomerInfo.map((info, i) => (
            <div key={i} style={{
              fontSize: '14px',
              color: '#aaa',
              marginBottom: '12px',
              paddingLeft: '20px',
              position: 'relative',
              lineHeight: '1.6'
            }}>
              <span style={{
                position: 'absolute',
                left: 0,
                color: domainColor,
                fontSize: '18px'
              }}>•</span>
              {info}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AtlasDashboard({ selectedTopic, onEntityHover, onSubsectionClick, onEntityClick }) {
  // Domain subsections data
  const domainData = {
    'Software': {
      subsections: [
        {
          title: 'Models',
          items: ['Gemini 3 Pro Preview', 'GPT-5.1 (High)', 'GPT-5 Codex (High)', 'GPT-5 (High)', 'Kimi K2 Thinking', 'GPT-5 (Medium)', 'o3', 'Grok 4', 'GPT-5 Mini (High)', 'Grok 4.1 Fast', 'GPT-4o', 'Claude 3.5 Opus']
        },
        {
          title: 'Model Families',
          items: ['Transformers', 'Diffusion Models', 'Mixture-of-Experts', 'State Space Models', 'Retrieval-Augmented']
        },
        {
          title: 'AI Frameworks',
          items: ['PyTorch', 'JAX', 'TensorFlow', 'MLX', 'Keras']
        },
        {
          title: 'Runtimes / Serving',
          items: ['vLLM', 'Ollama', 'Triton', 'TensorRT', 'llama.cpp', 'SGLang']
        },
        {
          title: 'AI Benchmarks',
          items: ['MMLU', 'GSM8K', 'HumanEval', 'MATH', 'MLPerf', 'GPQA']
        },
        {
          title: 'Core Infrastructure',
          items: ['Qdrant', 'Pinecone', 'Weaviate', 'Ray', 'Airflow', 'Weights & Biases', 'MLflow']
        }
      ]
    },
    'Hardware': {
      subsections: [
        {
          title: 'GPUs',
          items: ['H100 SXM', 'B200', 'MI300X', 'H200', 'A100 80GB', 'RTX 4090']
        },
        {
          title: 'AI Accelerators / ASICs',
          items: ['TPU v5e', 'Groq LPU', 'Cerebras WSE-3', 'Trainium2', 'Inferentia2', 'SambaNova SN40L']
        },
        {
          title: 'Memory & Interconnect',
          items: ['HBM3e', 'HBM3', 'NVLink', 'PCIe Gen5', 'CXL', 'Infinity Fabric']
        },
        {
          title: 'Data Center Servers',
          items: ['NVIDIA DGX', 'Supermicro AI', 'Dell PowerEdge', 'HPE Cray', 'AWS Trainium Pods']
        },
        {
          title: 'Networking',
          items: ['Infiniband', 'RoCE', 'Ultra Ethernet', 'Spectrum-X', 'AI Cluster Fabric']
        }
      ]
    },
    'Manufacturing': {
      subsections: [
        {
          title: 'Fabs',
          items: ['TSMC', 'Intel Foundry', 'Samsung', 'SMIC', 'GlobalFoundries']
        },
        {
          title: 'Packaging & Assembly',
          items: ['CoWoS', 'Chiplets', '3D Stacking', 'Advanced Packaging', 'FOWLP']
        },
        {
          title: 'Component Supply',
          items: ['SK Hynix (HBM)', 'Micron (HBM)', 'Samsung Memory', 'TSMC CoWoS']
        },
        {
          title: 'Equipment Makers',
          items: ['ASML', 'Lam Research', 'Applied Materials', 'Tokyo Electron', 'KLA']
        },
        {
          title: 'Supply Chain',
          items: ['Substrates', 'Lithography', 'Cooling Systems', 'Photoresists', 'Chemicals']
        }
      ]
    },
    'Robotics': {
      subsections: [
        {
          title: 'Humanoid Robotics',
          items: ['Figure 02', 'Tesla Optimus', 'Agility Robotics', '1X NEO', 'Unitree H1']
        },
        {
          title: 'Industrial Robotics',
          items: ['Fanuc', 'ABB', 'Kuka', 'Yaskawa', 'Universal Robots']
        },
        {
          title: 'Embedded AI / Edge Chips',
          items: ['Jetson Orin', 'Snapdragon 8 Gen 3', 'Apple Neural Engine', 'Hailo-8', 'Edge TPU']
        },
        {
          title: 'Sensors & Actuators',
          items: ['LiDAR', 'Depth Cameras', 'IMUs', 'Force Sensors', 'Servo Motors']
        },
        {
          title: 'Autonomy Stacks',
          items: ['Tesla FSD', 'Waymo Driver', 'NVIDIA DRIVE', 'Apollo', 'Mobileye SuperVision']
        }
      ]
    },
    'People': {
      subsections: [
        {
          title: 'Founders',
          items: ['Sam Altman', 'Demis Hassabis', 'Dario Amodei', 'Elon Musk', 'Mark Zuckerberg', 'Reid Hoffman']
        },
        {
          title: 'Researchers',
          items: ['Ilya Sutskever', 'Andrej Karpathy', 'Yann LeCun', 'Geoffrey Hinton', 'Yoshua Bengio', 'Andrew Ng']
        },
        {
          title: 'Executives',
          items: ['Jensen Huang', 'Satya Nadella', 'Sundar Pichai', 'Lisa Su', 'Pat Gelsinger', 'Andy Jassy']
        },
        {
          title: 'Investors',
          items: ['Marc Andreessen', 'Vinod Khosla', 'Peter Thiel', 'Daniel Gross', 'Nat Friedman', 'Elad Gil']
        }
      ]
    }
  };

  const InfoCard = ({ title, value, subtitle, icon, trend }) => (
    <div style={{
      background: 'rgba(0,0,0,0.3)',
      border: '1px solid #222',
      borderRadius: '8px',
      padding: '20px',
      flex: 1,
      minWidth: '200px'
    }}>
      <div style={{
        fontSize: '11px',
        color: '#666',
        textTransform: 'uppercase',
        letterSpacing: '1px',
        marginBottom: '12px',
        fontWeight: 600
      }}>
        {icon && <span style={{ marginRight: '8px' }}>{icon}</span>}
        {title}
      </div>
      <div style={{
        fontSize: '28px',
        color: '#fff',
        fontWeight: 700,
        marginBottom: '8px',
        fontFamily: theme.fonts.main
      }}>
        {value}
      </div>
      <div style={{
        fontSize: '12px',
        color: '#888',
        display: 'flex',
        alignItems: 'center',
        gap: '8px'
      }}>
        <span>{subtitle}</span>
        {trend && (
          <span style={{
            color: trend.startsWith('+') ? '#00ff88' : trend.startsWith('-') ? '#ff4444' : '#888',
            fontWeight: 600,
            fontFamily: theme.fonts.mono
          }}>
            {trend}
          </span>
        )}
      </div>
    </div>
  );

  const FeatureCard = ({ name, description, metrics, image }) => (
    <div style={{
      background: 'rgba(0,0,0,0.3)',
      border: '1px solid #222',
      borderRadius: '8px',
      padding: '20px',
      display: 'flex',
      gap: '20px',
      alignItems: 'flex-start'
    }}>
      {image && (
        <div style={{
          width: '80px',
          height: '80px',
          background: 'rgba(255,255,255,0.05)',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '32px',
          flexShrink: 0
        }}>
          {image}
        </div>
      )}
      <div style={{ flex: 1 }}>
        <h4 style={{
          fontSize: '18px',
          color: '#fff',
          fontWeight: 700,
          margin: '0 0 8px 0'
        }}>
          {name}
        </h4>
        <p style={{
          fontSize: '13px',
          color: '#aaa',
          lineHeight: '1.6',
          margin: '0 0 12px 0'
        }}>
          {description}
        </p>
        <div style={{
          display: 'flex',
          gap: '20px',
          fontSize: '12px',
          fontFamily: theme.fonts.mono
        }}>
          {metrics.map((metric, i) => (
            <div key={i}>
              <span style={{ color: '#666' }}>{metric.label}: </span>
              <span style={{ color: '#fff', fontWeight: 600 }}>{metric.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // Domain color mapping
  const domainColors = {
    'Software': '#0088ff',
    'Hardware': '#00ff88',
    'Manufacturing': '#ff8800',
    'Robotics': '#ff0088',
    'People': '#8800ff'
  };

  // Subsection descriptions
  const subsectionDescriptions = {
    'Models': 'Foundation models and LLMs driving the current AI revolution',
    'Model Families': 'Architectural paradigms and approaches to building AI systems',
    'AI Frameworks': 'Core libraries for building and training neural networks',
    'Runtimes / Serving': 'Tools for deploying and running models in production',
    'AI Benchmarks': 'Standardized tests measuring model capabilities',
    'Core Infrastructure': 'Vector databases, orchestration, and ML tooling',
    'GPUs': 'Graphics processors powering AI training and inference',
    'AI Accelerators / ASICs': 'Custom silicon designed specifically for AI workloads',
    'Memory & Interconnect': 'High-bandwidth memory and chip-to-chip communication',
    'Data Center Servers': 'Compute systems optimized for large-scale AI',
    'Networking': 'High-speed fabrics connecting AI clusters',
    'Fabs': 'Semiconductor fabrication facilities producing AI chips',
    'Packaging & Assembly': 'Advanced techniques for assembling modern chips',
    'Component Supply': 'Critical components in the AI silicon supply chain',
    'Equipment Makers': 'Companies producing semiconductor manufacturing equipment',
    'Supply Chain': 'Materials and processes enabling chip production',
    'Humanoid Robotics': 'Human-form robots with AI capabilities',
    'Industrial Robotics': 'Manufacturing and automation robot systems',
    'Embedded AI / Edge Chips': 'AI processors for edge devices and robotics',
    'Sensors & Actuators': 'Hardware enabling robot perception and movement',
    'Autonomy Stacks': 'Software systems for autonomous navigation'
  };

  // Subsection component - displays items in a collage with explore button
  const SubsectionCard = ({ title, items, domainColor, onEntityHover, onSubsectionClick, onEntityClick }) => {
  const [expandedEntity, setExpandedEntity] = useState(null);

  return (
    <div style={{
      background: 'rgba(0,0,0,0.2)',
      border: '1px solid #222',
      borderRadius: '8px',
      padding: '20px',
      marginBottom: '20px'
    }}>
      <h4 style={{
        fontSize: '13px',
        color: domainColor,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '1px',
        marginBottom: '8px'
      }}>
        {title}
      </h4>
      <p style={{
        fontSize: '12px',
        color: '#666',
        margin: '0 0 20px 0',
        lineHeight: '1.5'
      }}>
        {subsectionDescriptions[title] || 'Explore this category'}
      </p>

      {/* Collage Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
        gap: '10px'
      }}>
        {/* Explore More Button - larger and prominent */}
        <div
          onClick={() => onSubsectionClick && onSubsectionClick(title)}
          style={{
            gridColumn: 'span 2',
            gridRow: 'span 2',
            background: `linear-gradient(135deg, ${domainColor}22 0%, ${domainColor}11 100%)`,
            border: `2px solid ${domainColor}`,
            borderRadius: '8px',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'all 0.3s ease',
            minHeight: '140px'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = `linear-gradient(135deg, ${domainColor}33 0%, ${domainColor}22 100%)`;
            e.currentTarget.style.transform = 'scale(1.02)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = `linear-gradient(135deg, ${domainColor}22 0%, ${domainColor}11 100%)`;
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          <div style={{
            fontSize: '16px',
            fontWeight: 700,
            color: domainColor,
            marginBottom: '8px',
            textAlign: 'center'
          }}>
            Explore {title}
          </div>
          <div style={{
            fontSize: '11px',
            color: '#888',
            textAlign: 'center'
          }}>
            View full directory →
          </div>
        </div>

        {/* Item Pills */}
        {items.slice(0, 8).map((item, i) => (
          <React.Fragment key={i}>
            <div style={{
              background: expandedEntity === item ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)',
              border: expandedEntity === item ? `1px solid ${domainColor}` : '1px solid #333',
              borderRadius: '6px',
              padding: '12px 10px',
              fontSize: '11px',
              color: expandedEntity === item ? '#fff' : '#aaa',
              fontFamily: theme.fonts.mono,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              minHeight: '60px',
              lineHeight: '1.3'
            }}
            onClick={() => {
              if (entityInfo[item]) {
                setExpandedEntity(expandedEntity === item ? null : item);
              }
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = domainColor;
              e.currentTarget.style.color = '#fff';
              e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
              if (onEntityHover) onEntityHover(item);
            }}
            onMouseLeave={(e) => {
              if (expandedEntity !== item) {
                e.currentTarget.style.borderColor = '#333';
                e.currentTarget.style.color = '#aaa';
                e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
              }
              if (onEntityHover) onEntityHover(null);
            }}
            >
              {item}
            </div>

            {/* Expanded entity info */}
            {expandedEntity === item && entityInfo[item] && (
              <div style={{
                gridColumn: '1 / -1',
                background: 'rgba(0,0,0,0.5)',
                border: `1px solid ${domainColor}`,
                borderRadius: '8px',
                padding: '20px',
                marginTop: '-10px',
                marginBottom: '10px'
              }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  marginBottom: '15px'
                }}>
                  <div>
                    <h4 style={{
                      fontSize: '18px',
                      color: '#fff',
                      margin: '0 0 5px 0',
                      fontWeight: 700
                    }}>
                      {entityInfo[item].name}
                    </h4>
                    <div style={{
                      fontSize: '12px',
                      color: '#666',
                      fontFamily: theme.fonts.mono
                    }}>
                      {entityInfo[item].developer}
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpandedEntity(null);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#666',
                      fontSize: '20px',
                      cursor: 'pointer',
                      padding: 0,
                      lineHeight: 1
                    }}
                    onMouseEnter={(e) => e.target.style.color = '#fff'}
                    onMouseLeave={(e) => e.target.style.color = '#666'}
                  >
                    ×
                  </button>
                </div>

                {/* Benchmarks Grid (if available) */}
                {(entityInfo[item].contextWindow || entityInfo[item].aaiIndex) && (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))',
                    gap: '10px',
                    marginBottom: '15px',
                    padding: '12px',
                    background: 'rgba(0,0,0,0.3)',
                    borderRadius: '6px'
                  }}>
                    {entityInfo[item].contextWindow && (
                      <div>
                        <div style={{ fontSize: '9px', color: '#666', marginBottom: '3px' }}>CONTEXT</div>
                        <div style={{ fontSize: '12px', color: domainColor, fontWeight: 600, fontFamily: theme.fonts.mono }}>{entityInfo[item].contextWindow}</div>
                      </div>
                    )}
                    {entityInfo[item].aaiIndex && (
                      <div>
                        <div style={{ fontSize: '9px', color: '#666', marginBottom: '3px' }}>AAI INDEX</div>
                        <div style={{ fontSize: '12px', color: domainColor, fontWeight: 600, fontFamily: theme.fonts.mono }}>{entityInfo[item].aaiIndex}</div>
                      </div>
                    )}
                    {entityInfo[item].critPt && (
                      <div>
                        <div style={{ fontSize: '9px', color: '#666', marginBottom: '3px' }}>CRITPT</div>
                        <div style={{ fontSize: '12px', color: domainColor, fontWeight: 600, fontFamily: theme.fonts.mono }}>{entityInfo[item].critPt}</div>
                      </div>
                    )}
                    {entityInfo[item].mmmuPro && (
                      <div>
                        <div style={{ fontSize: '9px', color: '#666', marginBottom: '3px' }}>MMMU PRO</div>
                        <div style={{ fontSize: '12px', color: domainColor, fontWeight: 600, fontFamily: theme.fonts.mono }}>{entityInfo[item].mmmuPro}</div>
                      </div>
                    )}
                    {entityInfo[item].price && (
                      <div>
                        <div style={{ fontSize: '9px', color: '#666', marginBottom: '3px' }}>PRICE</div>
                        <div style={{ fontSize: '11px', color: domainColor, fontWeight: 600 }}>{entityInfo[item].price}</div>
                      </div>
                    )}
                    {entityInfo[item].speed && entityInfo[item].speed !== 'TBD' && (
                      <div>
                        <div style={{ fontSize: '9px', color: '#666', marginBottom: '3px' }}>SPEED</div>
                        <div style={{ fontSize: '12px', color: domainColor, fontWeight: 600, fontFamily: theme.fonts.mono }}>{entityInfo[item].speed}</div>
                      </div>
                    )}
                  </div>
                )}

                <div style={{ marginBottom: '12px' }}>
                  <div style={{
                    fontSize: '10px',
                    color: domainColor,
                    textTransform: 'uppercase',
                    letterSpacing: '1px',
                    marginBottom: '5px',
                    fontWeight: 600
                  }}>Type</div>
                  <div style={{ fontSize: '13px', color: '#fff', lineHeight: '1.5' }}>
                    {entityInfo[item].type}
                  </div>
                </div>

                <div style={{ marginBottom: '12px' }}>
                  <div style={{
                    fontSize: '10px',
                    color: domainColor,
                    textTransform: 'uppercase',
                    letterSpacing: '1px',
                    marginBottom: '5px',
                    fontWeight: 600
                  }}>Strengths</div>
                  <div style={{ fontSize: '13px', color: '#aaa', lineHeight: '1.5' }}>
                    {entityInfo[item].strengths}
                  </div>
                </div>

                <div style={{ marginBottom: '12px' }}>
                  <div style={{
                    fontSize: '10px',
                    color: domainColor,
                    textTransform: 'uppercase',
                    letterSpacing: '1px',
                    marginBottom: '5px',
                    fontWeight: 600
                  }}>Use Cases</div>
                  <div style={{ fontSize: '13px', color: '#aaa', lineHeight: '1.5' }}>
                    {entityInfo[item].useCases}
                  </div>
                </div>

                <div>
                  <div style={{
                    fontSize: '10px',
                    color: domainColor,
                    textTransform: 'uppercase',
                    letterSpacing: '1px',
                    marginBottom: '5px',
                    fontWeight: 600
                  }}>Notes</div>
                  <div style={{ fontSize: '13px', color: '#aaa', lineHeight: '1.5' }}>
                    {entityInfo[item].notes}
                  </div>
                </div>
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
  };

  // Get current domain data - default to Software if not set
  const currentDomain = domainData[selectedTopic] || domainData['Software'];
  const currentColor = domainColors[selectedTopic] || domainColors['Software'];

  // Domain descriptions
  const domainDescriptions = {
    'Software': 'Code, models, and measurements of AI capabilities',
    'Hardware': 'Physical compute that powers and trains AI systems',
    'Manufacturing': 'Global industrial chain making AI silicon possible',
    'Robotics': 'Where AI interacts with the physical world',
    'People': 'The people driving the AI revolution',
  };

  // If no valid domain, don't render
  if (!currentDomain) {
    return null;
  }

  return (
    <div>
      {/* Domain Header */}
      <div style={{
        marginBottom: '40px',
        paddingBottom: '20px',
        borderBottom: `2px solid ${currentColor}`
      }}>
        <h2 style={{
          fontSize: '32px',
          color: currentColor,
          fontWeight: 700,
          margin: '0 0 12px 0',
          textTransform: 'uppercase',
          letterSpacing: '2px'
        }}>
          {selectedTopic}
        </h2>
        <p style={{
          fontSize: '15px',
          color: '#888',
          margin: 0,
          lineHeight: '1.6'
        }}>
          {domainDescriptions[selectedTopic]}
        </p>
      </div>

      {/* Subsections */}
      <div>
        {currentDomain.subsections.map((subsection, index) => (
          <SubsectionCard
            key={index}
            title={subsection.title}
            items={subsection.items}
            domainColor={currentColor}
            onEntityHover={onEntityHover}
            onSubsectionClick={onSubsectionClick}
            onEntityClick={onEntityClick}
          />
        ))}
      </div>
    </div>
  );
}


function MarketWatch() {
  const [watchList, setWatchList] = useState(() => {
    const saved = localStorage.getItem('marketWatchList');
    return saved ? JSON.parse(saved) : ['BTC', 'ETH', 'NVDA', 'TSLA'];
  });
  const [prices, setPrices] = useState({});
  const [loading, setLoading] = useState(true);
  const [showAddTicker, setShowAddTicker] = useState(false);
  const [newTicker, setNewTicker] = useState('');

  useEffect(() => {
    localStorage.setItem('marketWatchList', JSON.stringify(watchList));
  }, [watchList]);

  useEffect(() => {
    const fetchPrices = async () => {
      try {
        const newPrices = {};
        const API_URL = process.env.REACT_APP_API_URL || '';

        // Separate crypto and stock tickers
        const cryptoTickers = watchList.filter(t => ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'ADA', 'AVAX', 'DOT'].includes(t.toUpperCase()));
        const stockTickers = watchList.filter(t => !['BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'ADA', 'AVAX', 'DOT'].includes(t.toUpperCase()));

        // Fetch crypto prices
        if (cryptoTickers.length > 0) {
          const cryptoMap = {
            'BTC': 'bitcoin', 'ETH': 'ethereum', 'SOL': 'solana',
            'XRP': 'ripple', 'DOGE': 'dogecoin', 'ADA': 'cardano',
            'AVAX': 'avalanche-2', 'DOT': 'polkadot'
          };
          const ids = cryptoTickers.map(t => cryptoMap[t.toUpperCase()]).filter(Boolean).join(',');

          if (ids) {
            const cryptoResponse = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`);
            const cryptoData = await cryptoResponse.json();

            cryptoTickers.forEach(ticker => {
              const id = cryptoMap[ticker.toUpperCase()];
              if (cryptoData[id]) {
                newPrices[ticker] = {
                  price: cryptoData[id].usd || 0,
                  change: cryptoData[id].usd_24h_change || 0
                };
              }
            });
          }
        }

        // Fetch stock prices from backend
        if (stockTickers.length > 0) {
          for (const ticker of stockTickers) {
            try {
              const stockResponse = await fetch(`${API_URL}/api/stock/${ticker}`);
              if (stockResponse.ok) {
                const stockData = await stockResponse.json();
                newPrices[ticker] = {
                  price: stockData.price || 0,
                  change: stockData.change || 0
                };
              } else {
                newPrices[ticker] = { price: 0, change: 0 };
              }
            } catch (err) {
              console.error(`Error fetching ${ticker}:`, err);
              newPrices[ticker] = { price: 0, change: 0 };
            }
          }
        }

        setPrices(newPrices);
        setLoading(false);
      } catch (err) {
        console.error('Error fetching prices:', err);
        setLoading(false);
      }
    };

    fetchPrices();
    const interval = setInterval(fetchPrices, 60000); // Update every minute
    return () => clearInterval(interval);
  }, [watchList]);

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

  const handleAddTicker = () => {
    const ticker = newTicker.trim().toUpperCase();
    if (ticker && !watchList.includes(ticker)) {
      setWatchList([...watchList, ticker]);
      setNewTicker('');
      setShowAddTicker(false);
    }
  };

  const handleRemoveTicker = (ticker) => {
    setWatchList(watchList.filter(t => t !== ticker));
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
        justifyContent: 'space-between',
        marginBottom: '20px',
        paddingBottom: '15px',
        borderBottom: '1px solid #333'
      }}>
        <span style={{ fontSize: '12px', fontWeight: 600, color: '#fff' }}>MARKET WATCH</span>
        <button
          onClick={() => setShowAddTicker(!showAddTicker)}
          style={{
            background: 'none',
            border: '1px solid #333',
            color: '#fff',
            padding: '4px 8px',
            fontSize: '12px',
            cursor: 'pointer',
            borderRadius: '3px',
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => e.target.style.borderColor = '#666'}
          onMouseLeave={(e) => e.target.style.borderColor = '#333'}
        >
          {showAddTicker ? '✕' : '+'}
        </button>
      </div>

      {showAddTicker && (
        <div style={{ marginBottom: '15px' }}>
          <input
            type="text"
            value={newTicker}
            onChange={(e) => setNewTicker(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleAddTicker()}
            placeholder="Enter ticker (e.g., BTC, AAPL)"
            style={{
              width: '100%',
              padding: '8px',
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid #333',
              color: '#fff',
              fontSize: '13px',
              borderRadius: '3px',
              marginBottom: '8px',
              outline: 'none'
            }}
          />
          <button
            onClick={handleAddTicker}
            style={{
              width: '100%',
              padding: '8px',
              background: '#0066ff',
              border: 'none',
              color: '#fff',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              borderRadius: '3px'
            }}
          >
            Add Ticker
          </button>
        </div>
      )}

      {loading ? (
        <div style={{ color: '#666', fontSize: '13px', textAlign: 'center', padding: '20px' }}>
          Loading prices...
        </div>
      ) : (
        <div>
          {watchList.map((symbol) => {
            const data = prices[symbol] || { price: 0, change: 0 };
            return (
              <div key={symbol} style={{
                marginBottom: '20px',
                paddingBottom: '15px',
                borderBottom: '1px solid #222',
                position: 'relative'
              }}>
                <button
                  onClick={() => handleRemoveTicker(symbol)}
                  style={{
                    position: 'absolute',
                    top: 0,
                    right: 0,
                    background: 'none',
                    border: 'none',
                    color: '#666',
                    fontSize: '12px',
                    cursor: 'pointer',
                    padding: '2px 4px'
                  }}
                  onMouseEnter={(e) => e.target.style.color = '#ff4444'}
                  onMouseLeave={(e) => e.target.style.color = '#666'}
                >
                  ✕
                </button>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingRight: '20px' }}>
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
            );
          })}
        </div>
      )}
    </div>
  );
}

// Entity info database
const entityInfo = {
  'GPT-4o': {
    name: 'GPT-4o',
    developer: 'OpenAI',
    type: 'Multimodal frontier model',
    strengths: 'Fast reasoning, audio-native capabilities, strong coding + agent performance, robust real-time vision/audio.',
    useCases: 'Agents, coding copilots, high-context chat, real-time multimodal apps.',
    notes: 'Best all-around model for speed + breadth; strong API cost/performance.'
  },
  'Gemini 3 Pro': {
    name: 'Gemini 3 Pro',
    developer: 'Google DeepMind',
    type: 'Multimodal generalist model',
    strengths: 'Extremely strong reasoning on complex tasks, native video & long-context strengths, great math/science.',
    useCases: 'Research, problem-solving, long document QA, multimodal pipelines.',
    notes: 'Strong competitor to Opus/4o for reasoning workloads.'
  },
  'Claude 3.5 Opus': {
    name: 'Claude 3.5 Opus',
    developer: 'Anthropic',
    type: 'Frontier reasoning & aligned LLM',
    strengths: 'Best-in-class safety/alignment, exceptional writing, formal reasoning, and long-context coherence.',
    useCases: 'Legal, policy, strategic planning, long-form writing, analysis.',
    notes: 'Performs extremely well on tasks requiring nuance and deep clarity.'
  },
  'Llama 3.1 405B': {
    name: 'Llama 3.1 405B',
    developer: 'Meta',
    type: 'Open-weight frontier model',
    strengths: 'Huge context, excellent multilingual ability, competitive with commercial models in open-weight form.',
    useCases: 'Self-hosted agents, enterprise deployments, research.',
    notes: 'Ideal for DGX/cluster setups; unmatched flexibility for on-prem ops.'
  },
  'Qwen 2.5-72B': {
    name: 'Qwen 2.5-72B',
    developer: 'Alibaba',
    type: 'Open-weight flagship model',
    strengths: 'Great coding, multilingual proficiency, competitive reasoning at a fraction of compute.',
    useCases: 'Cost-efficient reasoning, code assistants, enterprise internal workloads.',
    notes: 'Often overperforms relative to size; extremely efficient at inference.'
  },
  'Mistral Large 2': {
    name: 'Mistral Large 2',
    developer: 'Mistral AI',
    type: 'High-efficiency flagship model',
    strengths: 'Extremely fast, highly optimized, great for structured reasoning and enterprise tasks.',
    useCases: 'Fast agents, financial workflows, retrieval-heavy pipelines.',
    notes: 'Known for speed + efficiency with strong reasoning balance.'
  },
  'GPT-4o mini': {
    name: 'GPT-4o mini',
    developer: 'OpenAI',
    type: 'Small multimodal intelligence model',
    strengths: 'Very fast, very cheap, surprisingly high quality for size; good for lightweight reasoning + agents.',
    useCases: 'Bots, automation, embedded AI inside products.',
    notes: 'Highest "cost-to-performance" ratio in OpenAI\'s lineup.'
  },
  'DeepSeek-V3': {
    name: 'DeepSeek-V3',
    developer: 'DeepSeek',
    type: 'Advanced open-weight transformer',
    strengths: 'Strong analytical reasoning, efficient architecture, highly competitive coding ability.',
    useCases: 'Research setups, on-prem deployments, cost-optimized clusters.',
    notes: 'Known for efficiency and outperforming Western models in many benchmarks.'
  },
  'Gemma 2-27B': {
    name: 'Gemma 2-27B',
    developer: 'Google',
    type: 'Open-weight model (mid-size)',
    strengths: 'Great safety, stable performance, ideal for fine-tuning, strong for resource-constrained self-hosting.',
    useCases: 'Custom fine-tuned systems, mid-tier local agents, domain-specific LLMs.',
    notes: 'Part of a reliable open-source ecosystem with clean training pipeline.'
  },
  'Phi-4': {
    name: 'Phi-4',
    developer: 'Microsoft Research',
    type: 'Small reasoning model',
    strengths: 'Shockingly strong reasoning for size, efficient and cheap to run, top-tier for lightweight cognitive tasks.',
    useCases: 'On-device AI, fast agents, embedded reasoning tools.',
    notes: 'The "small model that punches above its weight"—highly flexible for local or product use.'
  },
  'Gemini 3 Pro Preview': {
    name: 'Gemini 3 Pro Preview',
    developer: 'Google',
    type: 'Next-gen multimodal frontier',
    contextWindow: '1M tokens',
    aaiIndex: '73',
    critPt: '9%',
    mmmuPro: '80%',
    price: '$4.50 / 1M tokens',
    speed: 'TBD',
    latency: 'TBD',
    strengths: 'Leading visual reasoning (80% MMMU Pro), massive context window, strong physics understanding (9% CritPt).',
    useCases: 'Long-context research, scientific analysis, visual understanding tasks.',
    notes: 'Highest AAI Index (73) and MMMU Pro score in current lineup; ideal for complex multimodal reasoning.'
  },
  'GPT-5.1 (High)': {
    name: 'GPT-5.1 (High)',
    developer: 'OpenAI',
    type: 'Frontier reasoning model',
    contextWindow: '400k tokens',
    aaiIndex: '70',
    critPt: '5%',
    mmmuPro: '76%',
    price: '$3.44 / 1M tokens',
    speed: '152 tokens/s',
    latency: '29.80s',
    strengths: 'High AAI index (70), strong visual reasoning (76% MMMU Pro), fast inference at 152 tok/s.',
    useCases: 'Production AI apps, agents, advanced reasoning tasks.',
    notes: 'Balanced performance/cost; excellent for high-throughput workloads.'
  },
  'GPT-5 Codex (High)': {
    name: 'GPT-5 Codex (High)',
    developer: 'OpenAI',
    type: 'Code-specialized model',
    contextWindow: '400k tokens',
    aaiIndex: '68',
    price: '$3.44 / 1M tokens',
    speed: '123 tokens/s',
    latency: '20.80s',
    strengths: 'Optimized for coding tasks, AAI 68, strong inference speed at 123 tok/s.',
    useCases: 'Code generation, software engineering copilots, technical documentation.',
    notes: 'Specialized variant of GPT-5 for software development workflows.'
  },
  'GPT-5 (High)': {
    name: 'GPT-5 (High)',
    developer: 'OpenAI',
    type: 'Frontier general-purpose model',
    contextWindow: '400k tokens',
    aaiIndex: '68',
    critPt: '6%',
    mmmuPro: '74%',
    price: '$3.44 / 1M tokens',
    strengths: 'Strong general reasoning (AAI 68), solid physics performance (6% CritPt), 74% MMMU Pro.',
    useCases: 'General AI tasks, research, content creation.',
    notes: 'Flagship GPT-5 tier; reliable for broad use cases.'
  },
  'Kimi K2 Thinking': {
    name: 'Kimi K2 Thinking',
    developer: 'Moonshot AI',
    type: 'Reasoning-focused model',
    contextWindow: '256k tokens',
    aaiIndex: '67',
    critPt: '3%',
    price: '$1.07 / 1M tokens',
    speed: '77 tokens/s',
    latency: '0.79s',
    strengths: 'Excellent cost-to-performance ($1.07/1M tokens), AAI 67, ultra-low latency (0.79s).',
    useCases: 'Cost-sensitive deployments, real-time apps, high-frequency inference.',
    notes: 'Best value in AAI 67+ tier; ideal for budget-conscious production use.'
  },
  'GPT-5 (Medium)': {
    name: 'GPT-5 (Medium)',
    developer: 'OpenAI',
    type: 'Mid-tier general model',
    contextWindow: '400k tokens',
    aaiIndex: '66',
    mmmuPro: '74%',
    price: '$3.44 / 1M tokens',
    strengths: 'AAI 66, strong visual reasoning (74% MMMU Pro), same pricing as High tier.',
    useCases: 'Balanced workloads, cost-conscious general tasks.',
    notes: 'Slight performance tradeoff vs High tier; same cost structure.'
  },
  'o3': {
    name: 'o3',
    developer: 'OpenAI',
    type: 'Reasoning model',
    contextWindow: '200k tokens',
    aaiIndex: '65',
    mmmuPro: '70%',
    price: '$3.50 / 1M tokens',
    speed: '207 tokens/s',
    latency: '12.97s',
    strengths: 'Fastest inference (207 tok/s), AAI 65, low latency (12.97s).',
    useCases: 'Real-time applications, high-throughput systems.',
    notes: 'Speed-optimized variant; ideal when latency matters most.'
  },
  'Grok 4': {
    name: 'Grok 4',
    developer: 'xAI',
    type: 'Frontier model',
    contextWindow: '256k tokens',
    aaiIndex: '65',
    critPt: '2%',
    mmmuPro: '69%',
    price: '$6.00 / 1M tokens',
    speed: '39 tokens/s',
    latency: '8.93s',
    strengths: 'AAI 65, low latency (8.93s), competitive visual reasoning (69% MMMU Pro).',
    useCases: 'xAI ecosystem integration, multimodal tasks.',
    notes: 'Premium pricing ($6/1M tokens); strong for physics and visual tasks.'
  },
  'GPT-5 Mini (High)': {
    name: 'GPT-5 Mini (High)',
    developer: 'OpenAI',
    type: 'Efficient small model',
    contextWindow: '400k tokens',
    aaiIndex: '64',
    mmmuPro: '70%',
    price: '$0.69 / 1M tokens',
    strengths: 'Excellent cost-to-performance ($0.69/1M), AAI 64, strong visual reasoning (70%).',
    useCases: 'High-volume inference, embedded AI, cost-sensitive production.',
    notes: 'Best price/performance in GPT-5 family; ideal for scale.'
  },
  'Grok 4.1 Fast': {
    name: 'Grok 4.1 Fast',
    developer: 'xAI',
    type: 'Ultra-fast inference model',
    contextWindow: '2M tokens',
    aaiIndex: '64',
    critPt: '3%',
    mmmuPro: '63%',
    price: '$0.28 / 1M tokens',
    speed: '76 tokens/s',
    latency: '13.61s',
    strengths: 'Massive 2M context, cheapest option ($0.28/1M), AAI 64, decent speed (76 tok/s).',
    useCases: 'Ultra-long context tasks, cost-sensitive large-scale deployments.',
    notes: 'Unmatched context length; exceptional value for document-heavy workloads.'
  }
};

function App() {
  const [activeModal, setActiveModal] = useState(null);
  const [menuExpanded, setMenuExpanded] = useState(false);
  const [posts, setPosts] = useState([]);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [selectedPost, setSelectedPost] = useState(null);
  const [selectedPage, setSelectedPage] = useState('NEWS');
  const [selectedTopic, setSelectedTopic] = useState('All');
  const [selectedSubsection, setSelectedSubsection] = useState(null);
  const [selectedPreset, setSelectedPreset] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [hoveredEntity, setHoveredEntity] = useState(null);
  const [selectedEntity, setSelectedEntity] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [user, setUser] = useState(null);
  const [showUserLogin, setShowUserLogin] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const scrollRef = useRef(0);
  const scrollContainerRef = useRef(null);

  const pages = ['NEWS', 'TERMINAL', 'ATLAS'];

  const pageTopics = {
    'TERMINAL': ['Markets', 'Stocks', 'Crypto', 'ETFs'],
    'NEWS': ['All', 'AI', 'Tech', 'Science', 'Energy', 'Crypto', 'Markets', 'Policy', 'Cybersecurity', 'Hardware', 'Space'],
    'ATLAS': ['Software', 'Hardware', 'Manufacturing', 'Robotics', 'People']
  };

  // Filter topics to only show those with posts (for NEWS page)
  const getAvailableTopics = () => {
    if (selectedPage === 'NEWS') {
      const allTopics = pageTopics[selectedPage];
      const topicsWithPosts = allTopics.filter(topic => {
        if (topic === 'All') return true; // Always show 'All'
        return posts.some(post =>
          (post.topic && post.topic.toLowerCase() === topic.toLowerCase()) ||
          (post.title && post.title.toLowerCase().includes(topic.toLowerCase())) ||
          (post.excerpt && post.excerpt.toLowerCase().includes(topic.toLowerCase()))
        );
      });
      return topicsWithPosts;
    }
    return pageTopics[selectedPage];
  };

  const currentTopics = getAvailableTopics();

  // Handle admin login
  const handleAdminLogin = async () => {
    const API_URL = process.env.REACT_APP_API_URL || '';

    try {
      const response = await fetch(`${API_URL}/api/auth/admin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ password: adminPassword })
      });

      if (response.ok) {
        const data = await response.json();
        if (data.isAdmin) {
          setIsAdmin(true);
          setAdminPassword('');
          setShowAdminLogin(false);
          localStorage.setItem('rrsrch_admin', 'true');
        }
      } else {
        alert('Incorrect password');
      }
    } catch (err) {
      console.error('Admin login error:', err);
      alert('Login failed');
    }
  };

  // Handle window resize for mobile detection
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Reset topic and preset when page changes
  useEffect(() => {
    if (selectedPage === 'ATLAS') {
      setSelectedTopic('Software');
    } else if (selectedPage === 'TERMINAL') {
      setSelectedTopic('Markets');
      setSelectedPreset('All');
    } else if (selectedPage === 'NEWS') {
      setSelectedTopic('All');
    }
  }, [selectedPage]);

  // Reset preset when topic changes
  useEffect(() => {
    setSelectedPreset('All');
  }, [selectedTopic]);

  // Check for OAuth callback and restore user session
  useEffect(() => {
    // Check URL params for OAuth callback
    const urlParams = new URLSearchParams(window.location.search);
    const authSuccess = urlParams.get('auth');
    const userData = urlParams.get('user');

    if (authSuccess === 'success' && userData) {
      try {
        const user = JSON.parse(decodeURIComponent(userData));
        setUser(user);
        localStorage.setItem('rrsrch_user', JSON.stringify(user));
        // Clean up URL
        window.history.replaceState({}, document.title, window.location.pathname);
      } catch (err) {
        console.error('Error parsing user data:', err);
      }
    } else {
      // Try to restore user from localStorage
      const savedUser = localStorage.getItem('rrsrch_user');
      if (savedUser) {
        try {
          setUser(JSON.parse(savedUser));
        } catch (err) {
          console.error('Error restoring user:', err);
          localStorage.removeItem('rrsrch_user');
        }
      }
    }
  }, []);

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
      case 'profile':
        if (!user && !isAdmin) {
          return (
            <div style={{ textAlign: 'center' }}>
              <User size={40} style={{ marginBottom: '20px', color: '#fff' }} />
              <h2 style={{ margin: '0 0 10px 0', fontSize: '20px' }}>Profile</h2>
              <p style={{ color: '#888', marginBottom: '30px' }}>Sign in to personalize your experience.</p>

              {/* Google Sign In Button */}
              <button
                onClick={() => {
                  // This will be handled by Google OAuth
                  const API_URL = process.env.REACT_APP_API_URL || '';
                  window.location.href = `${API_URL}/api/auth/google`;
                }}
                style={{
                  background: 'white',
                  color: 'black',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '12px 30px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  width: '100%',
                  marginBottom: '20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '10px'
                }}>
                <svg width="18" height="18" viewBox="0 0 18 18">
                  <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
                  <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/>
                  <path fill="#FBBC05" d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71s.102-1.17.282-1.71V4.958H.957C.347 6.173 0 7.548 0 9s.348 2.827.957 4.042l3.007-2.332z"/>
                  <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
                </svg>
                Sign in with Google
              </button>

              {/* Divider */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                margin: '20px 0',
                color: '#666'
              }}>
                <div style={{ flex: 1, height: '1px', background: '#333' }}></div>
                <span style={{ padding: '0 15px', fontSize: '12px' }}>OR</span>
                <div style={{ flex: 1, height: '1px', background: '#333' }}></div>
              </div>

              {/* Admin Access */}
              {!showAdminLogin ? (
                <button
                  onClick={() => setShowAdminLogin(true)}
                  style={{
                    background: 'transparent',
                    color: '#888',
                    border: '1px solid #333',
                    borderRadius: '6px',
                    padding: '12px 30px',
                    fontSize: '12px',
                    cursor: 'pointer',
                    width: '100%'
                  }}>
                  Admin Access
                </button>
              ) : (
                <div style={{ marginTop: '10px' }}>
                  <input
                    type="password"
                    placeholder="Admin password"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        handleAdminLogin();
                      }
                    }}
                    style={{
                      background: 'transparent',
                      border: '1px solid #333',
                      borderRadius: '6px',
                      padding: '12px',
                      color: 'white',
                      fontFamily: theme.fonts.mono,
                      width: '100%',
                      marginBottom: '10px'
                    }}
                  />
                  <button
                    onClick={handleAdminLogin}
                    style={{
                      background: '#ff4444',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '12px 30px',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      width: '100%'
                    }}>
                    ADMIN LOGIN
                  </button>
                </div>
              )}
            </div>
          );
        } else if (user && !isAdmin) {
          return (
            <div style={{ textAlign: 'center' }}>
              <div style={{
                width: '80px',
                height: '80px',
                borderRadius: '50%',
                background: '#222',
                margin: '0 auto 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '32px',
                color: '#fff',
                backgroundImage: user.picture ? `url(${user.picture})` : 'none',
                backgroundSize: 'cover',
                backgroundPosition: 'center'
              }}>
                {!user.picture && user.name?.charAt(0)}
              </div>
              <h2 style={{ margin: '0 0 5px 0', fontSize: '20px' }}>{user.name}</h2>
              <p style={{ color: '#888', marginBottom: '30px', fontSize: '14px' }}>{user.email}</p>

              <div style={{
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid #333',
                borderRadius: '8px',
                padding: '20px',
                marginBottom: '20px',
                textAlign: 'left'
              }}>
                <h3 style={{ margin: '0 0 15px 0', fontSize: '14px', color: '#aaa' }}>Account Settings</h3>
                <div style={{ fontSize: '13px', color: '#666', lineHeight: '1.8' }}>
                  <div style={{ marginBottom: '10px' }}>
                    <span style={{ color: '#888' }}>Member since:</span> {new Date().toLocaleDateString()}
                  </div>
                  <div>
                    <span style={{ color: '#888' }}>Account type:</span> Standard
                  </div>
                </div>
              </div>

              <button
                onClick={() => {
                  setUser(null);
                  localStorage.removeItem('rrsrch_user');
                  setActiveModal(null);
                }}
                style={{
                  background: 'transparent',
                  color: '#ff4444',
                  border: '1px solid #ff4444',
                  borderRadius: '6px',
                  padding: '12px 30px',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  width: '100%'
                }}>
                SIGN OUT
              </button>
            </div>
          );
        } else if (isAdmin) {
          return (
            <div style={{ maxWidth: '600px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
                <h2 style={{ margin: 0, fontSize: '20px' }}>Admin Panel</h2>
                <button
                  onClick={() => {
                    setIsAdmin(false);
                    setActiveModal(null);
                  }}
                  style={{
                    background: 'transparent',
                    color: '#ff4444',
                    border: '1px solid #ff4444',
                    borderRadius: '6px',
                    padding: '8px 16px',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    cursor: 'pointer'
                  }}>
                  LOGOUT
                </button>
              </div>

              <div style={{
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid #333',
                borderRadius: '8px',
                padding: '20px',
                marginBottom: '20px'
              }}>
                <h3 style={{ fontSize: '14px', color: '#888', marginBottom: '15px', textTransform: 'uppercase', letterSpacing: '1px' }}>Post Management</h3>
                <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                  {posts.map((post) => (
                    <div key={post.id} style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '12px',
                      borderBottom: '1px solid #222',
                      fontSize: '13px'
                    }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ color: '#fff', marginBottom: '4px' }}>{post.title}</div>
                        <div style={{ color: '#666', fontSize: '11px', fontFamily: theme.fonts.mono }}>
                          {new Date(post.date).toLocaleDateString()}
                        </div>
                      </div>
                      <button
                        onClick={async () => {
                          if (window.confirm(`Delete "${post.title}"?`)) {
                            try {
                              const API_URL = process.env.REACT_APP_API_URL || '';
                              const response = await fetch(`${API_URL}/api/posts/${post.id}`, {
                                method: 'DELETE',
                                headers: {
                                  'x-api-key': '75e2278ae36e07077bd7341bffaa758c735608e586962ec343d9470c0ca40e30'
                                }
                              });

                              if (response.ok) {
                                setPosts(posts.filter(p => p.id !== post.id));
                              } else {
                                alert('Failed to delete post');
                              }
                            } catch (error) {
                              console.error('Error deleting post:', error);
                              alert('Error deleting post');
                            }
                          }
                        }}
                        style={{
                          background: 'transparent',
                          border: '1px solid #ff4444',
                          borderRadius: '4px',
                          color: '#ff4444',
                          padding: '6px 12px',
                          fontSize: '11px',
                          cursor: 'pointer',
                          fontWeight: 600
                        }}>
                        DELETE
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid #333',
                borderRadius: '8px',
                padding: '20px'
              }}>
                <h3 style={{ fontSize: '14px', color: '#888', marginBottom: '15px', textTransform: 'uppercase', letterSpacing: '1px' }}>ATLAS Rankings</h3>
                <p style={{ color: '#666', fontSize: '12px', marginBottom: '15px' }}>
                  Rankings order managed in code. Future: drag-and-drop reordering.
                </p>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <div style={{
                    background: 'rgba(0,136,255,0.1)',
                    border: '1px solid rgba(0,136,255,0.3)',
                    borderRadius: '6px',
                    padding: '8px 12px',
                    fontSize: '11px',
                    color: '#0088ff',
                    fontWeight: 600
                  }}>Software</div>
                  <div style={{
                    background: 'rgba(0,255,136,0.1)',
                    border: '1px solid rgba(0,255,136,0.3)',
                    borderRadius: '6px',
                    padding: '8px 12px',
                    fontSize: '11px',
                    color: '#00ff88',
                    fontWeight: 600
                  }}>Hardware</div>
                  <div style={{
                    background: 'rgba(255,136,0,0.1)',
                    border: '1px solid rgba(255,136,0,0.3)',
                    borderRadius: '6px',
                    padding: '8px 12px',
                    fontSize: '11px',
                    color: '#ff8800',
                    fontWeight: 600
                  }}>Manufacturing</div>
                  <div style={{
                    background: 'rgba(255,0,136,0.1)',
                    border: '1px solid rgba(255,0,136,0.3)',
                    borderRadius: '6px',
                    padding: '8px 12px',
                    fontSize: '11px',
                    color: '#ff0088',
                    fontWeight: 600
                  }}>Robotics</div>
                </div>
              </div>
            </div>
          );
        }
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
        {/* Profile Button (Top-left of page, scrolls with content) */}
        <div style={{
          position: 'absolute',
          top: isMobile ? '20px' : '40px',
          left: isMobile ? '20px' : '40px',
          zIndex: 10
        }}>
          <NavButton onClick={() => setActiveModal('profile')} icon={User} label="Profile" />
        </div>

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

          {selectedPost ? (
            <ArticleView
              post={selectedPost}
              onBack={() => setSelectedPost(null)}
              relatedPosts={posts.filter(p => p.id !== selectedPost.id).slice(0, 3)}
              onSelectPost={setSelectedPost}
            />
          ) : (
            <>
              {/* Search Bar - Full Width */}
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

              {/* Pages Bar - Full Width */}
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

              {/* Topics Bar - Full Width */}
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

              {/* Preset Filters Row - Only show on TERMINAL page for Stocks */}
              {selectedPage === 'TERMINAL' && (selectedTopic === 'Stocks' || selectedTopic === 'ETFs') && (
                <div style={{
                  display: 'flex',
                  gap: '8px',
                  marginBottom: '30px',
                  overflowX: 'auto',
                  paddingBottom: '10px'
                }}>
                  <span style={{
                    fontSize: '11px',
                    color: '#555',
                    padding: '8px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    fontFamily: theme.fonts.mono,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    Presets:
                  </span>
                  {['All', 'AI & Chips', 'Robotics', 'Defense', 'Energy & Power'].map((preset) => (
                    <button
                      key={preset}
                      onClick={() => setSelectedPreset(preset)}
                      style={{
                        background: selectedPreset === preset ? 'rgba(0,255,136,0.1)' : 'transparent',
                        border: selectedPreset === preset ? '1px solid rgba(0,255,136,0.3)' : '1px solid #222',
                        borderRadius: '16px',
                        color: selectedPreset === preset ? '#00ff88' : '#666',
                        padding: '6px 14px',
                        cursor: 'pointer',
                        fontSize: '11px',
                        fontFamily: theme.fonts.main,
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                        whiteSpace: 'nowrap',
                        transition: 'all 0.2s ease',
                        fontWeight: selectedPreset === preset ? 600 : 400
                      }}
                      onMouseEnter={(e) => {
                        if (selectedPreset !== preset) {
                          e.currentTarget.style.borderColor = '#333';
                          e.currentTarget.style.color = '#aaa';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (selectedPreset !== preset) {
                          e.currentTarget.style.borderColor = '#222';
                          e.currentTarget.style.color = '#666';
                        }
                      }}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              )}

              {/* Two Column Layout: Content + Sidebar */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr',
                gap: '60px'
              }}>
                {/* Left Column: Main Content */}
                <div>
                  {selectedPage === 'TERMINAL' ? (
                  <>
                    <LiveTable selectedTopic={selectedTopic} selectedPreset={selectedPreset} />

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
                              margin: '0',
                              fontWeight: 600,
                              lineHeight: '1.4'
                            }}>
                              {post.title}
                            </h4>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                ) : selectedPage === 'ATLAS' ? (
                  <>
                    {selectedSubsection ? (
                      <SubsectionDetail
                        subsectionName={selectedSubsection}
                        domainColor={
                          selectedTopic === 'Software' ? '#0088ff' :
                          selectedTopic === 'Hardware' ? '#00ff88' :
                          selectedTopic === 'Manufacturing' ? '#ff8800' :
                          selectedTopic === 'Robotics' ? '#ff0088' :
                          '#8800ff'
                        }
                        onBack={() => setSelectedSubsection(null)}
                        items={(() => {
                          const domainData = {
                            'Software': {
                              subsections: [
                                { title: 'Models', items: ['Gemini 3 Pro Preview', 'GPT-5.1 (High)', 'GPT-5 Codex (High)', 'GPT-5 (High)', 'Kimi K2 Thinking', 'GPT-5 (Medium)', 'o3', 'Grok 4', 'GPT-5 Mini (High)', 'Grok 4.1 Fast', 'GPT-4o', 'Claude 3.5 Opus'] },
                                { title: 'Model Families', items: ['Transformers', 'Diffusion Models', 'Mixture-of-Experts', 'State Space Models', 'Retrieval-Augmented', 'Vision Transformers', 'Multimodal Models', 'Generative Adversarial Networks'] },
                                { title: 'AI Frameworks', items: ['PyTorch', 'JAX', 'TensorFlow', 'MLX', 'Keras', 'Hugging Face Transformers', 'LangChain', 'LlamaIndex'] },
                                { title: 'Runtimes / Serving', items: ['vLLM', 'Ollama', 'Triton', 'TensorRT', 'llama.cpp', 'SGLang', 'Text Generation Inference', 'Mosaic ML'] },
                                { title: 'AI Benchmarks', items: ['MMLU', 'GSM8K', 'HumanEval', 'MATH', 'MLPerf', 'GPQA', 'HellaSwag', 'TruthfulQA'] },
                                { title: 'Core Infrastructure', items: ['Qdrant', 'Pinecone', 'Weaviate', 'Ray', 'Airflow', 'Weights & Biases', 'MLflow', 'Chroma', 'Redis', 'Milvus'] }
                              ]
                            },
                            'Hardware': {
                              subsections: [
                                { title: 'GPUs', items: ['H100 SXM', 'B200', 'H200', 'MI300X', 'A100 80GB', 'RTX 4090', 'MI250X', 'L40S', 'H20', 'A800'] },
                                { title: 'AI Accelerators / ASICs', items: ['TPU v5e', 'Groq LPU', 'Cerebras WSE-3', 'Trainium2', 'Inferentia2', 'SambaNova SN40L', 'Graphcore IPU'] },
                                { title: 'Memory & Interconnect', items: ['HBM3e', 'HBM3', 'NVLink', 'PCIe Gen5', 'CXL', 'Infinity Fabric', 'NVSwitch'] },
                                { title: 'Data Center Servers', items: ['NVIDIA DGX', 'Supermicro AI', 'Dell PowerEdge', 'HPE Cray', 'AWS Trainium Pods', 'Lambda GPU Cloud'] },
                                { title: 'Networking', items: ['Infiniband', 'RoCE', 'Ultra Ethernet', 'Spectrum-X', 'AI Cluster Fabric', '400G Ethernet'] }
                              ]
                            },
                            'Manufacturing': {
                              subsections: [
                                { title: 'Fabs', items: ['TSMC', 'Samsung Foundry', 'Intel Foundry', 'GlobalFoundries', 'SMIC', 'UMC', 'Tower Semiconductor', 'Rapidus', 'Hua Hong Semiconductor', 'DB HiTek'] },
                                { title: 'Packaging & Assembly', items: ['CoWoS', 'Chiplets', '3D Stacking', 'Advanced Packaging', 'FOWLP', '2.5D Integration'] },
                                { title: 'Component Supply', items: ['SK Hynix (HBM)', 'Micron (HBM)', 'Samsung Memory', 'TSMC CoWoS', 'ASE Technology'] },
                                { title: 'Equipment Makers', items: ['ASML', 'Lam Research', 'Applied Materials', 'Tokyo Electron', 'KLA', 'SCREEN Holdings'] },
                                { title: 'Supply Chain', items: ['Substrates', 'Lithography', 'Cooling Systems', 'Photoresists', 'Chemicals', 'Wafer Materials'] }
                              ]
                            },
                            'Robotics': {
                              subsections: [
                                { title: 'Humanoid Robotics', items: ['Figure 01', 'Tesla Optimus Gen 2', 'Digit Gen 3', 'Phoenix', 'Unitree G1 Pro', 'Apollo', 'GR1', 'NEO', 'Robosapien X', 'Walker X'] },
                                { title: 'Industrial Robotics', items: ['Fanuc', 'ABB', 'Kuka', 'Yaskawa', 'Universal Robots', 'Boston Dynamics Spot'] },
                                { title: 'Embedded AI / Edge Chips', items: ['Jetson Orin', 'Snapdragon 8 Gen 3', 'Apple Neural Engine', 'Hailo-8', 'Edge TPU', 'RK3588'] },
                                { title: 'Sensors & Actuators', items: ['LiDAR', 'Depth Cameras', 'IMUs', 'Force Sensors', 'Servo Motors', 'Tactile Sensors'] },
                                { title: 'Autonomy Stacks', items: ['Tesla FSD', 'Waymo Driver', 'NVIDIA DRIVE', 'Apollo', 'Mobileye SuperVision', 'Autoware'] }
                              ]
                            },
                            'People': {
                              subsections: [
                                { title: 'Founders', items: ['Sam Altman', 'Demis Hassabis', 'Dario Amodei', 'Elon Musk', 'Mark Zuckerberg', 'Reid Hoffman'] },
                                { title: 'Researchers', items: ['Ilya Sutskever', 'Andrej Karpathy', 'Yann LeCun', 'Geoffrey Hinton', 'Yoshua Bengio', 'Andrew Ng'] },
                                { title: 'Executives', items: ['Jensen Huang', 'Satya Nadella', 'Sundar Pichai', 'Lisa Su', 'Pat Gelsinger', 'Andy Jassy'] },
                                { title: 'Investors', items: ['Marc Andreessen', 'Vinod Khosla', 'Peter Thiel', 'Daniel Gross', 'Nat Friedman', 'Elad Gil'] }
                              ]
                            }
                          };
                          const subsection = domainData[selectedTopic]?.subsections.find(s => s.title === selectedSubsection);
                          return subsection?.items || [];
                        })()}
                        onEntityHover={setHoveredEntity}
                        onEntityClick={setSelectedEntity}
                      />
                    ) : (
                      <AtlasDashboard
                        selectedTopic={selectedTopic}
                        onEntityHover={setHoveredEntity}
                        onSubsectionClick={setSelectedSubsection}
                        onEntityClick={setSelectedEntity}
                      />
                    )}

                    {/* Relevant Articles Section */}
                    <div style={{ marginTop: selectedSubsection ? '30px' : '0' }}>
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
                          <div
                            key={post.id}
                            onClick={() => setSelectedPost(post)}
                            style={{
                              marginBottom: '20px',
                              borderBottom: '1px solid #222',
                              paddingBottom: '15px',
                              cursor: 'pointer'
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
                              fontSize: '16px',
                              color: '#fff',
                              margin: '0',
                              fontWeight: 400,
                              lineHeight: '1.4'
                            }}>
                              {post.title}
                            </h4>
                          </div>
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
                </div>

                {/* Right Column: Sticky Sidebar */}
                {!isMobile && (
                  <div style={{ position: 'relative' }}>
                    <div style={{ position: 'sticky', top: '40px' }}>
                      {selectedPage === 'ATLAS' ? (
                        <AtlasSidebar
                          selectedTopic={selectedTopic}
                          selectedSubsection={selectedSubsection}
                          hoveredEntity={hoveredEntity}
                        />
                      ) : (
                        <MarketWatch />
                      )}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

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
