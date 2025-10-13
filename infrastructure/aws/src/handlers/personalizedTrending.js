/**
 * Personalized Trending Handler
 * 
 * Shows trending threads filtered by user's category preferences
 * "Trending in Your Interests" feature
 */

const AWS = require('aws-sdk');
const { addCorsHeaders, handleOptionsRequest } = require('../utils/cors');
const { tables, dbOperations } = require('../utils/db');

const dynamodb = new AWS.DynamoDB.DocumentClient();

/**
 * Get personalized trending threads
 * Combines global trending with user preferences
 */
exports.getPersonalizedTrending = async (event) => {
  try {
    console.log('getPersonalizedTrending called');
    
    if (event.httpMethod === 'OPTIONS') {
      return handleOptionsRequest();
    }

    const { userId, limit = '10' } = event.queryStringParameters || {};

    if (!userId) {
      return addCorsHeaders({
        statusCode: 400,
        body: JSON.stringify({ error: 'userId is required' })
      });
    }

    const limitNum = parseInt(limit);
    console.log(`Getting personalized trending for user ${userId}, limit ${limitNum}`);

    // Get user preferences
    const prefsResult = await dynamodb.get({
      TableName: tables.userPreferences,
      Key: { user_id: userId }
    }).promise();

    // Get trending threads (fetch more for filtering)
    const trendingThreads = await getTrendingThreadsInternal(limitNum * 3);

    // No preferences yet - return global trending
    if (!prefsResult.Item || prefsResult.Item.total_engagement_score === 0) {
      console.log('No preferences found, returning global trending');
      
      return addCorsHeaders({
        statusCode: 200,
        body: JSON.stringify({
          threads: trendingThreads.slice(0, limitNum),
          recommendationType: 'trending',
          calculatedAt: new Date().toISOString()
        })
      });
    }

    const prefs = prefsResult.Item;
    const categoryAffinities = prefs.category_affinities || {};
    const favoriteCreators = prefs.favorite_creators || [];

    console.log(`User has ${Object.keys(categoryAffinities).length} category affinities, ${favoriteCreators.length} favorite creators`);

    // Score each trending thread by relevance to user
    const scored = trendingThreads.map(thread => {
      const categoryAffinity = categoryAffinities[thread.category] || 0;
      const creatorBonus = favoriteCreators.includes(thread.creator_id) ? 50 : 0;
      
      // Boost trending score by user preference
      const relevance = thread.trending_score * (1 + (categoryAffinity + creatorBonus) / 200);

      return { ...thread, relevance };
    });

    // Sort by relevance and return top N
    scored.sort((a, b) => b.relevance - a.relevance);
    const topThreads = scored.slice(0, limitNum);

    // Enrich with full thread and creator data
    const enriched = await Promise.all(
      topThreads.map(async (thread) => {
        try {
          const threadResult = await dbOperations.get(tables.threads, { id: thread.thread_id });
          const userResult = await dbOperations.get(tables.users, { id: threadResult.Item?.creator_id });
          
          return {
            id: thread.thread_id,
            title: threadResult.Item?.title || 'Unknown',
            creator: {
              id: threadResult.Item?.creator_id,
              name: userResult.Item?.name || 'Unknown User',
              alias: userResult.Item?.alias || 'unknown',
              avatar: userResult.Item?.avatar || '/img-5.svg',
              handle: userResult.Item?.handle || '@unknown'
            },
            isPublic: threadResult.Item?.is_public === 'true',
            createdAt: threadResult.Item?.created_at,
            updatedAt: threadResult.Item?.updated_at,
            questionCount: threadResult.Item?.question_count || 0,
            answerCount: threadResult.Item?.answer_count || 0,
            interactionCount: (threadResult.Item?.question_count || 0) + (threadResult.Item?.answer_count || 0),
            category: threadResult.Item?.category,
            viewCount: thread.cached_thread_views || 0,
            likeCount: thread.cached_answer_likes || 0,
            saveCount: thread.cached_answer_saves || 0,
            shareCount: thread.cached_answer_shares || 0,
            trending_score: thread.trending_score,
            relevance: thread.relevance,
            questions: []
          };
        } catch (err) {
          console.error(`Error enriching thread ${thread.thread_id}:`, err);
          return null;
        }
      })
    );

    // Filter out nulls
    const validThreads = enriched.filter(t => t !== null);

    return addCorsHeaders({
      statusCode: 200,
      body: JSON.stringify({
        threads: validThreads,
        recommendationType: 'trending_personalized',
        calculatedAt: new Date().toISOString(),
        userPreferences: {
          topCategories: Object.entries(categoryAffinities)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([cat, score]) => ({ category: cat, affinity: score }))
        }
      })
    });
  } catch (error) {
    console.error('Error getting personalized trending:', error);
    return addCorsHeaders({
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Failed to get personalized trending',
        message: error.message
      })
    });
  }
};

/**
 * Get trending threads from cache (internal use)
 */
async function getTrendingThreadsInternal(limit = 10) {
  try {
    // Scan ThreadMetricsCache for all cached scores
    const result = await dynamodb.scan({
      TableName: tables.threadMetricsCache,
      FilterExpression: 'trending_score > :minScore',
      ExpressionAttributeValues: { ':minScore': 0 }
    }).promise();

    // Sort by trending score descending
    const sorted = (result.Items || []).sort((a, b) => b.trending_score - a.trending_score);
    
    return sorted.slice(0, limit);
  } catch (error) {
    console.error('Error getting trending threads:', error);
    return [];
  }
}

