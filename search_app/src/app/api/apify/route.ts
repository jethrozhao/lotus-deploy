import { NextResponse } from 'next/server';
import { ApifyClient } from 'apify-client';

const APIFY_KEY = process.env.APIFY_KEY;

if (!APIFY_KEY) {
  throw new Error('APIFY_KEY is not set in environment variables');
}

// Initialize the ApifyClient with API token
const client = new ApifyClient({
  token: APIFY_KEY,
});

export async function POST(req: Request) {
  try {
    const { query, max_results = 10 } = await req.json();

    if (!query) {
      return NextResponse.json(
        { error: 'Query parameter is required' },
        { status: 400 }
      );
    }

    // Prepare Actor input
    const input = {
      searchTerms: [query],
      sort: "Latest",
      maxItems: max_results
    };

    // Run the Actor and wait for it to finish
    const run = await client.actor("nfp1fpt5gUlBwPcor").call(input);

    // Fetch Actor results from the run's dataset
    const { items } = await client.dataset(run.defaultDatasetId).listItems();

    return NextResponse.json({
      data: items.map((item: any) => ({
        id: item.id,
        text: item.text,
        author: {
          username: item.author?.username,
          name: item.author?.name,
          profile_image_url: item.author?.profileImageUrl
        },
        created_at: item.createdAt,
        public_metrics: {
          retweet_count: item.retweetCount,
          reply_count: item.replyCount,
          like_count: item.likeCount,
          quote_count: item.quoteCount
        }
      }))
    });

  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process request' },
      { status: 500 }
    );
  }
}