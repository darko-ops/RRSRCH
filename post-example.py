#!/usr/bin/env python3
"""
Example Python script to post content to rrsrch.com API
Usage: python post-example.py
"""

import requests
import json

API_URL = "https://rrsrch.com/api/posts"
API_KEY = "75e2278ae36e07077bd7341bffaa758c735608e586962ec343d9470c0ca40e30"

def create_post(title, excerpt, content=""):
    """Create a new post on rrsrch.com"""
    headers = {
        "Content-Type": "application/json",
        "x-api-key": API_KEY
    }

    data = {
        "title": title,
        "excerpt": excerpt,
        "content": content
    }

    response = requests.post(API_URL, headers=headers, json=data)

    if response.status_code == 200:
        print("✓ Post created successfully!")
        print(json.dumps(response.json(), indent=2))
    else:
        print(f"✗ Error: {response.status_code}")
        print(response.text)

def get_all_posts():
    """Get all posts from rrsrch.com"""
    response = requests.get(API_URL)

    if response.status_code == 200:
        posts = response.json().get('posts', [])
        print(f"Found {len(posts)} posts:")
        for post in posts:
            print(f"  - {post['title']} ({post['date']})")
    else:
        print(f"✗ Error: {response.status_code}")

def delete_post(post_id):
    """Delete a post by ID"""
    headers = {"x-api-key": API_KEY}
    response = requests.delete(f"{API_URL}/{post_id}", headers=headers)

    if response.status_code == 200:
        print(f"✓ Post {post_id} deleted successfully!")
    else:
        print(f"✗ Error: {response.status_code}")

if __name__ == "__main__":
    # Example: Create a new post
    create_post(
        title="Network Protocol Update",
        excerpt="Analysis of the current vector space indicates a significant improvement in query resolution times. All nodes are reporting nominal efficiency.",
        content="Full article content goes here..."
    )

    # Example: Get all posts
    # get_all_posts()

    # Example: Delete a post
    # delete_post("1234567890")
