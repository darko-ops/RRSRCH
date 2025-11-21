#!/bin/bash

# Example script to post content to rrsrch.com API
# Usage: ./post-example.sh "Title" "Excerpt" "Optional full content"

API_URL="https://rrsrch.com/api/posts"
API_KEY="75e2278ae36e07077bd7341bffaa758c735608e586962ec343d9470c0ca40e30"

TITLE="$1"
EXCERPT="$2"
CONTENT="${3:-}"

if [ -z "$TITLE" ] || [ -z "$EXCERPT" ]; then
  echo "Usage: $0 \"Title\" \"Excerpt\" \"Optional content\""
  exit 1
fi

curl -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_KEY" \
  -d "{
    \"title\": \"$TITLE\",
    \"excerpt\": \"$EXCERPT\",
    \"content\": \"$CONTENT\"
  }"

echo ""
