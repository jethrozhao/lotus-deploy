import { NextResponse } from 'next/server';

const X_API_KEY = decodeURIComponent(process.env.X_API_KEY || '');
const X_API_URL = 'https://api.twitter.com/2/tweets/search/recent';

if (!X_API_KEY) {
  throw new Error('X_API_KEY is not set in environment variables');
}

// Set response timeout to 30 seconds
export const maxDuration = 30;

// Configure the runtime to use edge for better streaming support
export const runtime = 'edge';
export const dynamic = 'force-dynamic';

interface TwitterUser {
  id: string;
  username: string;
  name: string;
  profile_image_url: string;
}

interface TwitterTweet {
  id: string;
  text: string;
  author_id: string;
  created_at: string;
  public_metrics: {
    retweet_count: number;
    reply_count: number;
    like_count: number;
    quote_count: number;
  };
}

interface TwitterResponse {
  data: TwitterTweet[];
  includes: {
    users: TwitterUser[];
  };
  meta: {
    newest_id: string;
    oldest_id: string;
    result_count: number;
  };
}

async function makeTwitterRequest(url: string, retries = 3): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${X_API_KEY}`,
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Twitter API Error:', errorData);
        
        if (response.status === 401) {
          throw new Error('Twitter API authentication failed. Please check your Bearer Token.');
        }
        
        if (response.status === 429) {
          const resetTime = response.headers.get('x-rate-limit-reset');
          if (resetTime) {
            const waitTime = (parseInt(resetTime) * 1000) - Date.now();
            if (waitTime > 0) {
              console.log(`Rate limited. Waiting ${waitTime/1000} seconds...`);
              await new Promise(resolve => setTimeout(resolve, waitTime));
              continue;
            }
          }
          throw new Error('Twitter API rate limit exceeded. Please try again later.');
        }
        
        throw new Error(errorData.detail || 'Failed to fetch tweets');
      }

      return response;
    } catch (error) {
      console.error('Request error:', error);
      if (i === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1))); // Exponential backoff
    }
  }
  throw new Error('Max retries reached');
}

export async function POST(req: Request) {
  try {
    const { query, max_results = 10 } = await req.json();

    if (!query) {
      return NextResponse.json(
        { error: 'Query parameter is required' },
        { status: 400 }
      );
    }

    // First, search for tweets
    const searchResponse = await makeTwitterRequest(
      `${X_API_URL}?query=${encodeURIComponent(query)}&max_results=${max_results}&expansions=author_id&tweet.fields=created_at,public_metrics,text&user.fields=name,username,profile_image_url`
    );

    if (!searchResponse.ok) {
      const error = await searchResponse.json();
      console.error('Twitter API Error:', error);
      
      if (searchResponse.status === 401) {
        throw new Error('Twitter API authentication failed. Please check your Bearer Token in the .env file. Make sure you are using a valid Twitter API v2 Bearer Token, not an API Key and Secret.');
      }
      
      if (searchResponse.status === 429) {
        throw new Error('Twitter API rate limit exceeded. Please try again later.');
      }
      
      throw new Error(error.detail || 'Failed to fetch tweets');
    }

    const searchData = await searchResponse.json() as TwitterResponse;
    console.log('Twitter API Response:', JSON.stringify(searchData, null, 2));

    // Create a map of users for faster lookup
    const userMap = new Map(
      searchData.includes?.users?.map((user: TwitterUser) => [user.id, user]) || []
    );

    // Process the response in a single pass
    const processedTweets = searchData.data?.map((tweet: TwitterTweet) => {
      const author = userMap.get(tweet.author_id);

      return {
        id: tweet.id,
        text: tweet.text,
        author_id: tweet.author_id,
        created_at: tweet.created_at,
        public_metrics: tweet.public_metrics,
        author: author ? {
          username: author.username,
          name: author.name,
          profile_image_url: author.profile_image_url
        } : undefined
      };
    }) || [];

    console.log('Processed Tweets:', JSON.stringify(processedTweets, null, 2));

    return NextResponse.json({
      data: processedTweets,
      meta: searchData.meta
    });

  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process request' },
      { status: 500 }
    );
  }
} 