const express = require('express');
const { TwitterApi } = require('twitter-api-v2');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Initialize Twitter client
const twitterClient = new TwitterApi(process.env.TWITTER_BEARER_TOKEN);

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

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
