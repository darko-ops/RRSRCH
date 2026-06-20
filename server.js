const express = require('express');
const { TwitterApi } = require('twitter-api-v2');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const session = require('express-session');
const bcrypt = require('bcrypt');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'rrsrch-secret-key-2025',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));
app.use(passport.initialize());
app.use(passport.session());

// Initialize Twitter client
const twitterClient = new TwitterApi(process.env.TWITTER_BEARER_TOKEN);

// Configure Google OAuth Strategy
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/api/auth/google/callback`
  },
  function(accessToken, refreshToken, profile, cb) {
    // Here you would normally save the user to a database
    // For now, we'll just return the profile
    return cb(null, {
      id: profile.id,
      name: profile.displayName,
      email: profile.emails[0].value,
      picture: profile.photos[0].value
    });
  }
));

passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((user, done) => {
  done(null, user);
});

// Posts storage file
const POSTS_FILE = path.join(__dirname, 'posts.json');

// Initialize posts file if it doesn't exist
async function initPostsFile() {
  try {
    await fs.access(POSTS_FILE);
  } catch {
    await fs.writeFile(POSTS_FILE, JSON.stringify([], null, 2));
  }
}

// API endpoint to fetch market indices
app.get('/api/markets', async (req, res) => {
  try {
    // Use ETFs and proxy stocks for market data (Finnhub compatible)
    const indices = [
      { symbol: 'SPY', name: 'S&P 500' },
      { symbol: 'DIA', name: 'Dow Jones' },
      { symbol: 'QQQ', name: 'NASDAQ' },
      { symbol: 'IWM', name: 'Russell 2000' },
      { symbol: 'VXX', name: 'VIX (Volatility)' },
      { symbol: 'GLD', name: 'Gold' },
      { symbol: 'USO', name: 'Crude Oil' },
      { symbol: 'TLT', name: '10Y Treasury' }
    ];

    const API_KEY = process.env.FINNHUB_API_KEY;

    if (!API_KEY) {
      return res.status(500).json({ error: 'Finnhub API key not configured' });
    }

    const marketPromises = indices.map(async ({ symbol, name }) => {
      try {
        const quoteResponse = await fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${API_KEY}`);
        const quoteData = await quoteResponse.json();

        const change = quoteData.c && quoteData.pc ? ((quoteData.c - quoteData.pc) / quoteData.pc) * 100 : 0;

        return {
          symbol: name,
          name,
          price: quoteData.c || 0,
          change: change,
          previousClose: quoteData.pc || 0,
          high: quoteData.h || 0,
          low: quoteData.l || 0
        };
      } catch (err) {
        console.error(`Error fetching ${symbol}:`, err);
        return {
          symbol: name,
          name,
          price: 0,
          change: 0,
          previousClose: 0,
          high: 0,
          low: 0
        };
      }
    });

    const markets = await Promise.all(marketPromises);
    res.json({ markets });
  } catch (error) {
    console.error('Error fetching market data:', error);
    res.status(500).json({ error: 'Failed to fetch market data', details: error.message });
  }
});

// API endpoint to fetch individual stock quote from Finnhub
app.get('/api/stock/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const API_KEY = process.env.FINNHUB_API_KEY;

    if (!API_KEY) {
      return res.status(500).json({ error: 'Finnhub API key not configured' });
    }

    const quoteResponse = await fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol.toUpperCase()}&token=${API_KEY}`);
    const quoteData = await quoteResponse.json();

    // Calculate change percentage
    const change = quoteData.c && quoteData.pc ? ((quoteData.c - quoteData.pc) / quoteData.pc) * 100 : 0;

    res.json({
      symbol,
      price: quoteData.c || 0,
      change: change,
      previousClose: quoteData.pc || 0,
      high: quoteData.h || 0,
      low: quoteData.l || 0
    });
  } catch (error) {
    console.error('Error fetching stock quote:', error);
    res.status(500).json({ error: 'Failed to fetch stock quote', details: error.message });
  }
});

// API endpoint to fetch stock quotes from Finnhub
app.get('/api/stocks', async (req, res) => {
  try {
    // All stocks from all presets (AI & Chips, Robotics, Defense, Energy & Power)
    const stockSymbols = [
      // AI & Chips
      'NVDA', 'AMD', 'AVGO', 'TSM', 'INTC', 'QCOM', 'MU', 'SNOW', 'SMCI', 'GOOGL', 'PLTR', 'CLS',
      // Robotics
      'SYM', 'KYCCF', 'ISRG', 'ZBRA', 'PATH', 'EMR', 'TRMB', 'OMCL', 'LECO', 'ABB',
      // Defense
      'LMT', 'RTX', 'NOC', 'GD', 'HWM', 'AXON', 'HII', 'KTOS', 'AVAV',
      // Energy & Power
      'NEE', 'GEV', '300274.SZ', 'FSLR', 'BE', 'ADANIGREEN.NS', 'BEP', 'VWS.CO', '916.HK', 'EDPR.LS', 'CVX', 'XOM', 'BP', 'SLRP', 'SLDP'
    ];
    const API_KEY = process.env.FINNHUB_API_KEY;

    if (!API_KEY) {
      return res.status(500).json({ error: 'Finnhub API key not configured' });
    }

    const stockPromises = stockSymbols.map(async (symbol) => {
      try {
        // Fetch current quote
        const quoteResponse = await fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${API_KEY}`);
        const quoteData = await quoteResponse.json();

        // Calculate 24h change percentage
        const change = quoteData.c && quoteData.pc ? ((quoteData.c - quoteData.pc) / quoteData.pc) * 100 : 0;

        return {
          symbol,
          price: quoteData.c || 0,
          change: change,
          previousClose: quoteData.pc || 0,
          high: quoteData.h || 0,
          low: quoteData.l || 0,
          volume: 0 // Finnhub free tier doesn't provide volume in quote endpoint
        };
      } catch (err) {
        console.error(`Error fetching ${symbol}:`, err);
        return {
          symbol,
          price: 0,
          change: 0,
          previousClose: 0,
          high: 0,
          low: 0,
          volume: 0
        };
      }
    });

    const stocks = await Promise.all(stockPromises);
    res.json({ stocks });
  } catch (error) {
    console.error('Error fetching stock data:', error);
    res.status(500).json({ error: 'Failed to fetch stock data', details: error.message });
  }
});

// API endpoint to fetch AI ETFs from Finnhub
app.get('/api/etfs', async (req, res) => {
  try {
    // Top AI-focused ETFs
    const etfSymbols = [
      'BOTZ',  // Global X Robotics & AI ETF
      'ROBT',  // First Trust Nasdaq AI & Robotics ETF
      'IRBO',  // iShares Robotics and AI Multisector ETF
      'ARKQ',  // ARK Autonomous Tech & Robotics ETF
      'THNQ',  // ROBO Global AI ETF
      'AIQ',   // Global X AI & Technology ETF
      'WTAI',  // WisdomTree AI Enhanced Value Fund
      'AIEQ',  // AI Powered Equity ETF
      'LRNZ',  // TrueShares Tech, AI & Deep Learning ETF
      'BIGZ'   // Roundhill Generative AI & Technology ETF
    ];

    const API_KEY = process.env.FINNHUB_API_KEY;

    if (!API_KEY) {
      return res.status(500).json({ error: 'Finnhub API key not configured' });
    }

    const etfPromises = etfSymbols.map(async (symbol) => {
      try {
        const quoteResponse = await fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${API_KEY}`);
        const quoteData = await quoteResponse.json();

        const change = quoteData.c && quoteData.pc ? ((quoteData.c - quoteData.pc) / quoteData.pc) * 100 : 0;

        return {
          symbol,
          price: quoteData.c || 0,
          change: change,
          previousClose: quoteData.pc || 0,
          high: quoteData.h || 0,
          low: quoteData.l || 0,
          volume: 0
        };
      } catch (err) {
        console.error(`Error fetching ${symbol}:`, err);
        return {
          symbol,
          price: 0,
          change: 0,
          previousClose: 0,
          high: 0,
          low: 0,
          volume: 0
        };
      }
    });

    const etfs = await Promise.all(etfPromises);
    res.json({ etfs });
  } catch (error) {
    console.error('Error fetching ETF data:', error);
    res.status(500).json({ error: 'Failed to fetch ETF data', details: error.message });
  }
});

// API endpoint to fetch tweets
app.get('/api/tweets', async (req, res) => {
  try {
    // First get the user ID for @rrsrch
    const user = await twitterClient.v2.userByUsername('rrsrch');

    if (!user.data) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Then fetch their tweets (with full text, not truncated)
    const tweets = await twitterClient.v2.userTimeline(user.data.id, {
      max_results: 5,
      'tweet.fields': ['created_at', 'public_metrics', 'text'],
      expansions: ['author_id', 'referenced_tweets.id'],
      'user.fields': ['username', 'name'],
      exclude: 'retweets'
    });

    const formattedTweets = tweets.data.data.map(tweet => ({
      id: tweet.id,
      text: tweet.text, // Twitter API v2 returns full text by default
      created_at: tweet.created_at,
      metrics: tweet.public_metrics
    }));

    res.json({ tweets: formattedTweets });
  } catch (error) {
    console.error('Error fetching tweets:', error);
    res.status(500).json({ error: 'Failed to fetch tweets', details: error.message });
  }
});

// Get all posts
app.get('/api/posts', async (req, res) => {
  try {
    const data = await fs.readFile(POSTS_FILE, 'utf8');
    const posts = JSON.parse(data);
    res.json({ posts: posts.sort((a, b) => new Date(b.date) - new Date(a.date)) });
  } catch (error) {
    console.error('Error reading posts:', error);
    res.status(500).json({ error: 'Failed to fetch posts' });
  }
});

// Create a new post (requires API key)
app.post('/api/posts', async (req, res) => {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey || apiKey !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { title, excerpt, content, topic } = req.body;

  if (!title) {
    return res.status(400).json({ error: 'Title is required' });
  }

  try {
    const data = await fs.readFile(POSTS_FILE, 'utf8');
    const posts = JSON.parse(data);

    const newPost = {
      id: Date.now().toString(),
      title,
      excerpt: excerpt || '', // Make excerpt optional for tweets/updates
      content: content || '',
      topic: topic || 'All',
      date: new Date().toISOString()
    };

    posts.push(newPost);
    await fs.writeFile(POSTS_FILE, JSON.stringify(posts, null, 2));

    res.json({ success: true, post: newPost });
  } catch (error) {
    console.error('Error creating post:', error);
    res.status(500).json({ error: 'Failed to create post' });
  }
});

// Delete a post (requires API key)
app.delete('/api/posts/:id', async (req, res) => {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey || apiKey !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const data = await fs.readFile(POSTS_FILE, 'utf8');
    const posts = JSON.parse(data);
    const filteredPosts = posts.filter(p => p.id !== req.params.id);

    if (posts.length === filteredPosts.length) {
      return res.status(404).json({ error: 'Post not found' });
    }

    await fs.writeFile(POSTS_FILE, JSON.stringify(filteredPosts, null, 2));
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting post:', error);
    res.status(500).json({ error: 'Failed to delete post' });
  }
});

// Google OAuth routes
app.get('/api/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

app.get('/api/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/' }),
  function(req, res) {
    // Successful authentication, redirect to frontend with user data
    const frontendURL = process.env.FRONTEND_URL || 'http://localhost:3000';
    res.redirect(`${frontendURL}?auth=success&user=${encodeURIComponent(JSON.stringify(req.user))}`);
  }
);

// Get current user
app.get('/api/auth/user', (req, res) => {
  if (req.isAuthenticated()) {
    res.json({ user: req.user });
  } else {
    res.status(401).json({ error: 'Not authenticated' });
  }
});

// Logout
app.get('/api/auth/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.json({ success: true });
  });
});

// Admin authentication endpoint
app.post('/api/auth/admin', async (req, res) => {
  const { password } = req.body;

  if (!password) {
    return res.status(400).json({ error: 'Password required' });
  }

  try {
    // You can generate a new hash by running: node -e "const bcrypt = require('bcrypt'); bcrypt.hash('yourpassword', 10).then(console.log)"
    const passwordHash = process.env.ADMIN_PASSWORD_HASH;

    if (!passwordHash) {
      return res.status(500).json({ error: 'Admin password not configured' });
    }

    const isValid = await bcrypt.compare(password, passwordHash);

    if (isValid) {
      res.json({ success: true, isAdmin: true });
    } else {
      res.status(401).json({ error: 'Invalid password' });
    }
  } catch (err) {
    console.error('Error verifying admin password:', err);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

initPostsFile().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
});
