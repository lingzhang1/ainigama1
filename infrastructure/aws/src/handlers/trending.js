/**
 * Trending Handler
 * 
 * Returns globally trending threads based on cached scores
 */

const AWS = require('aws-sdk');
const { addCorsHeaders, handleOptionsRequest } = require('../utils/cors');
const { tables, dbOperations } = require('../utils/db');

const dynamodb = new AWS.DynamoDB.DocumentClient();

/**
 * Get top trending threads
 * Uses pre-calculated scores from ThreadMetricsCache
 */
exports.getTrendingThreads = async (event) => {
  try {
    console.log('getTrendingThreads called');
    
    if (event.httpMethod === 'OPTIONS') {
      return handleOptionsRequest();
    }

    const { limit = '10' } = event.queryStringParameters || {};
    const limitNum = parseInt(limit);
    const maxLimit = 50; // Safety cap
    const finalLimit = Math.min(limitNum, maxLimit);

    console.log(`Fetching top ${finalLimit} trending threads`);

    // Query cached trending scores
    const result = await dynamodb.scan({
      TableName: tables.threadMetricsCache,
      FilterExpression: 'trending_score > :minScore',
      ExpressionAttributeValues: { ':minScore': 0 }
    }).promise();

    console.log(`Found ${result.Items.length} threads with trending scores`);

    // Sort by trending score descending
    const sorted = (result.Items || []).sort((a, b) => b.trending_score - a.trending_score);
    const topThreads = sorted.slice(0, finalLimit);

    // Enrich with full thread and creator details
    const enriched = await Promise.all(
      topThreads.map(async (cached) => {
        try {
          const threadResult = await dbOperations.get(tables.threads, { id: cached.thread_id });
          const thread = threadResult.Item;
          
          if (!thread) {
            console.warn(`Thread ${cached.thread_id} not found`);
            return null;
          }

          const userResult = await dbOperations.get(tables.users, { id: thread.creator_id });
          const user = userResult.Item;

          return {
            id: thread.id,
            title: thread.title,
            creator: {
              id: thread.creator_id,
              name: user?.name || 'Unknown User',
              alias: user?.alias || 'unknown',
              avatar: user?.avatar || '/img-5.svg',
              handle: user?.handle || '@unknown'
            },
            isPublic: thread.is_public === 'true',
            createdAt: thread.created_at,
            updatedAt: thread.updated_at,
            questionCount: thread.question_count || 0,
            answerCount: thread.answer_count || 0,
            interactionCount: (thread.question_count || 0) + (thread.answer_count || 0),
            category: thread.category,
            viewCount: cached.cached_thread_views || 0,
            likeCount: cached.cached_answer_likes || 0,
            saveCount: cached.cached_answer_saves || 0,
            shareCount: cached.cached_answer_shares || 0,
            trending_score: cached.trending_score,
            cached_metrics: {
              answer_likes: cached.cached_answer_likes,
              answer_saves: cached.cached_answer_saves,
              answer_shares: cached.cached_answer_shares,
              comment_likes: cached.cached_comment_likes,
              thread_views: cached.cached_thread_views,
              recent_engagement_24h: cached.cached_recent_engagement_24h
            },
            questions: []
          };
        } catch (err) {
          console.error(`Error enriching thread ${cached.thread_id}:`, err);
          return null;
        }
      })
    );

    // Filter out null entries (threads that couldn't be enriched)
    const validThreads = enriched.filter(t => t !== null);

    console.log(`Returning ${validThreads.length} trending threads`);

    return addCorsHeaders({
      statusCode: 200,
      body: JSON.stringify({
        threads: validThreads,
        calculatedAt: new Date().toISOString(),
        algorithm: 'v2.0',
        totalScored: result.Items.length
      })
    });
  } catch (error) {
    console.error('Error fetching trending threads:', error);
    return addCorsHeaders({
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Failed to fetch trending threads',
        message: error.message
      })
    });
  }
};

