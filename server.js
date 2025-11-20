const express = require('express');
const { TwitterApi } = require('twitter-api-v2');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Initialize Twitter client
const twitterClient = new TwitterApi(process.env.TWITTER_BEARER_TOKEN);

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

// API endpoint to fetch tweets
app.get('/api/tweets', async (req, res) => {
  try {
    // First get the user ID for @rrsrch
    const user = await twitterClient.v2.userByUsername('rrsrch');

    if (!user.data) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Then fetch their tweets
    const tweets = await twitterClient.v2.userTimeline(user.data.id, {
      max_results: 5,
      'tweet.fields': ['created_at', 'public_metrics'],
      expansions: ['author_id'],
      'user.fields': ['username', 'name']
    });

    const formattedTweets = tweets.data.data.map(tweet => ({
      id: tweet.id,
      text: tweet.text,
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

  const { title, excerpt, content } = req.body;

  if (!title || !excerpt) {
    return res.status(400).json({ error: 'Title and excerpt are required' });
  }

  try {
    const data = await fs.readFile(POSTS_FILE, 'utf8');
    const posts = JSON.parse(data);

    const newPost = {
      id: Date.now().toString(),
      title,
      excerpt,
      content: content || '',
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

initPostsFile().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
});
