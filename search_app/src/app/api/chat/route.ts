import { NextResponse } from 'next/server';

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';

if (!DEEPSEEK_API_KEY) {
  console.error('DEEPSEEK_API_KEY is not set in environment variables');
  throw new Error('DEEPSEEK_API_KEY is not set in environment variables');
}

// Set response timeout to 30 seconds
export const maxDuration = 30;

// Configure the runtime to use edge for better streaming support
export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const { messages, context } = await req.json();

    // // Log the incoming context data
    // console.log('Incoming context data:', {
    //   hasSearchResults: !!context?.searchResults,
    //   searchResultsCount: context?.searchResults?.length || 0,
    //   hasSocialMediaResults: !!context?.socialMediaResults,
    //   socialMediaResultsCount: context?.socialMediaResults?.length || 0,
    //   socialMediaSample: context?.socialMediaResults?.slice(0, 2)?.map(post => ({
    //     text: post.text,
    //     author: post.author?.name,
    //     likes: post.public_metrics?.like_count
    //   }))
    // });

    // // First, try a minimal test request
    // console.log('Attempting minimal test request to DeepSeek API...');
    // const testResponse = await fetch(DEEPSEEK_API_URL, {
    //   method: 'POST',
    //   headers: {
    //     'Content-Type': 'application/json',
    //     'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
    //   },
    //   body: JSON.stringify({
    //     model: 'deepseek-reasoner',
    //     messages: [
    //       { role: 'system', content: 'You are a helpful assistant.' },
    //       { role: 'user', content: 'Hello' }
    //     ],
    //     stream: false,
    //     max_tokens: 100,
    //     temperature: 0.7,
    //   }),
    // });

    // if (!testResponse.ok) {
    //   const testError = await testResponse.json();
    //   console.error('DeepSeek Test Request Error:', {
    //     status: testResponse.status,
    //     statusText: testResponse.statusText,
    //     error: testError
    //   });
    //   throw new Error(`DeepSeek API test failed: ${testError.message || 'Unknown error'}`);
    // }

    // const testResult = await testResponse.json();
    // console.log('DeepSeek Test Request Success:', testResult);

    // If test succeeds, proceed with the full request
    const systemMessage = {
      role: 'system',
      content: `You are a research assistant analyzing information from multiple sources. Here is the context for your analysis:

Search Results: ${JSON.stringify(context?.searchResults?.slice(0, 3) || [])}
Social Media Posts: ${JSON.stringify(context?.socialMediaResults?.slice(0, 3) || [])}
Tavily Data: ${JSON.stringify({
        answer: context?.tavilyData?.answer,
        query: context?.tavilyData?.query
      } || {})}

      'Please use this context to inform your analysis and responses. Make sure to specifically reference and analyze any social media posts provided, as they often contain valuable real-time insights.`
    };

    // Ensure we have at least one user message
    if (!messages || messages.length === 0) {
      throw new Error('No messages provided');
    }

    // If the last message is not from the user, add a user message
    const lastMessage = messages[messages.length - 1];
    if (lastMessage.role !== 'user') {
      messages.push({
        role: 'user',
        content: 'Please analyze the provided context and generate a report.'
      });
    }

    const requestBody = {
      model: 'deepseek-reasoner',
      messages: [systemMessage, ...messages],
      stream: true,
      max_tokens: 2000,
      temperature: 0.7,
    };

    console.log('Sending full request to DeepSeek API with messages:', requestBody.messages.map(m => ({
      role: m.role,
      content: m.content.substring(0, 100) + '...' // Log first 100 chars of content
    })));

    const response = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('DeepSeek API Error:', {
        status: response.status,
        statusText: response.statusText,
        error: error
      });
      throw new Error(error.message || 'Failed to get response from DeepSeek');
    }

    if (!response.body) {
      console.error('No response body from DeepSeek API');
      throw new Error('No response body available');
    }

    const reader = response.body.getReader();
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          while (true) {
            const { done, value } = await reader.read();
            
            if (done) {
              controller.close();
              break;
            }

            const text = decoder.decode(value);
            const lines = text.split('\n');

            for (const line of lines) {
              if (line.trim() === '') continue;
              if (line.trim() === 'data: [DONE]') continue;

              let data = line;
              if (line.startsWith('data: ')) {
                data = line.slice(6);
              }

              try {
                const parsed = JSON.parse(data);
                if (parsed.choices?.[0]?.delta?.content || parsed.choices?.[0]?.delta?.reasoning_content) {
                  controller.enqueue(encoder.encode(JSON.stringify(parsed) + '\n'));
                }
              } catch (e) {
                console.error('Error parsing JSON:', e, 'Line:', line);
              }
            }
          }
        } catch (e) {
          console.error('Stream error:', e);
          controller.error(e);
        }
      },

      cancel() {
        reader.cancel();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process request' },
      { status: 500 }
    );
  }
} 