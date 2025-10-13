/**
 * Unified Engagement Handler
 * 
 * Single Lambda function to handle all engagement tracking and metric aggregation
 * Combines trending score calculation and user preference updates
 */

const AWS = require('aws-sdk');
const crypto = require('crypto');
const { addCorsHeaders, handleOptionsRequest } = require('../utils/cors');
const { tables, dbOperations } = require('../utils/db');

const dynamodb = new AWS.DynamoDB.DocumentClient();

// Engagement weight configuration (shared between trending and recommendations)
const ENGAGEMENT_WEIGHTS = {
  trending: {
    answer_saves: 5.0,
    answer_shares: 4.0,
    answer_likes: 3.0,
    comment_likes: 2.0,
    thread_views: 0.1
  },
  recommendation: {
    view: 1,
    like: 5,
    save: 10,
    share: 15,
    question: 20,
    answer: 15,
    time_spent: 2  // per minute
  },
  content: {
    questions: 1.5,
    answers: 2.0,
    comments: 1.0
  }
};

/**
 * Track engagement event
 * Unified entry point for all user interactions
 */
exports.trackEngagement = async (event) => {
  try {
    console.log('trackEngagement called');
    
    if (event.httpMethod === 'OPTIONS') {
      return handleOptionsRequest();
    }

    const body = JSON.parse(event.body || '{}');
    const { userId, threadId, contentId, contentType, action, metadata, timestamp } = body;

    if (!userId || !threadId || !action) {
      return addCorsHeaders({
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing required fields: userId, threadId, action' })
      });
    }

    const now = timestamp || Date.now();
    const id = crypto.randomUUID();
    const ttl = Math.floor(now / 1000) + (90 * 24 * 60 * 60); // 90 days

    console.log(`Tracking ${action} for user ${userId} on thread ${threadId}`);

    // Store in appropriate metrics table
    await storeMetric(userId, threadId, contentId, contentType, action, metadata, now, id, ttl);

    return addCorsHeaders({
      statusCode: 200,
      body: JSON.stringify({ success: true, id })
    });
  } catch (error) {
    console.error('Error tracking engagement:', error);
    return addCorsHeaders({
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Failed to track engagement', 
        message: error.message 
      })
    });
  }
};

/**
 * Store metric in appropriate DynamoDB table
 */
async function storeMetric(userId, threadId, contentId, contentType, action, metadata, timestamp, id, ttl) {
  const baseItem = {
    id,
    user_id: userId,
    thread_id: threadId,
    created_at: timestamp,
    ttl
  };

  switch (action) {
    case 'like':
      if (!contentId || !contentType) {
        throw new Error('contentId and contentType required for like action');
      }
      
      await dynamodb.put({
        TableName: tables.likes,
        Item: {
          ...baseItem,
          content_type: contentType,
          content_id: contentId,
          content_type_id: `${contentType}#${contentId}` // For uniqueness check
        }
      }).promise();
      break;

    case 'save':
      if (!contentId || !contentType) {
        throw new Error('contentId and contentType required for save action');
      }
      
      await dynamodb.put({
        TableName: tables.saves,
        Item: {
          ...baseItem,
          content_type: contentType,
          content_id: contentId
        }
      }).promise();
      break;

    case 'share':
      if (!contentId || !contentType) {
        throw new Error('contentId and contentType required for share action');
      }
      
      await dynamodb.put({
        TableName: tables.shares,
        Item: {
          ...baseItem,
          content_type: contentType,
          content_id: contentId,
          share_method: metadata?.shareMethod || 'unknown'
        }
      }).promise();
      break;

    case 'view':
      await dynamodb.put({
        TableName: tables.views,
        Item: {
          ...baseItem,
          content_type: 'thread',
          content_id: threadId
        }
      }).promise();
      break;

    case 'time_spent':
      await dynamodb.put({
        TableName: tables.timeTracking,
        Item: {
          ...baseItem,
          seconds_spent: metadata?.timeSpentSeconds || 0
        }
      }).promise();
      break;

    default:
      throw new Error(`Unknown action type: ${action}`);
  }

  console.log(`✅ Stored ${action} event: ${id}`);
}

/**
 * Aggregaterics (EventBridge Scheduled - Every 5 minutes)
 * Updates both trending scores and user preferences
 */
exports.aggregateMetrics = async (event) => {
  console.log('🚀 Starting unified metrics aggregation...');
  const startTime = Date.now();

  try {
    // Run both operations in parallel for efficiency
    const [trendingResult, preferencesResult] = await Promise.all([
      updateTrendingScores(),
      updateUserPreferences()
    ]);

    const elapsed = Date.now() - startTime;
    console.log(`✅ Unified aggregation completed in ${elapsed}ms`);
    console.log(`   Trending: ${trendingResult.threadsUpdated} threads`);
    console.log(`   Preferences: ${preferencesResult.usersUpdated} users`);

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        duration: elapsed,
        trending: trendingResult,
        preferences: preferencesResult,
        timestamp: Date.now()
      })
    };
  } catch (error) {
    console.error('❌ Aggregation failed:', error);
    throw error;
  }
};

/**
 * PART 1: Update trending scores for all public threads
 */
async function updateTrendingScores() {
  console.log('📊 Updating trending scores...');
  const updateStart = Date.now();

  // Get all public threads
  const threadsResult = await dbOperations.scan(
    tables.threads,
    'is_public = :isPublic',
    { ':isPublic': 'true' }
  );

  const threads = threadsResult.Items || [];
  console.log(`   Processing ${threads.length} public threads`);

  const now = Date.now();
  const oneDayAgo = now - (24 * 60 * 60 * 1000);
  let threadsUpdated = 0;

  // Process threads in batches of 10 (parallel processing)
  const batchSize = 10;
  for (let i = 0; i < threads.length; i += batchSize) {
    const batch = threads.slice(i, i + batchSize);
    
    await Promise.all(batch.map(async (thread) => {
      try {
        // Aggregate metrics for this thread
        const metrics = await aggregateThreadMetrics(thread.id, oneDayAgo);
        
        // Calculate trending score
        const trendingScore = calculateTrendingScore(thread, metrics, now);
        
        // Store in cache
        await dynamodb.put({
          TableName: tables.threadMetricsCache,
          Item: {
            thread_id: thread.id,
            trending_score: Math.round(trendingScore * 10000) / 10000,
            cached_answer_likes: metrics.answerLikes,
            cached_answer_saves: metrics.answerSaves,
            cached_answer_shares: metrics.answerShares,
            cached_comment_likes: metrics.commentLikes,
            cached_thread_views: metrics.threadViews,
            cached_recent_engagement_24h: metrics.recentEngagement,
            last_updated: now,
            ttl: Math.floor(now / 1000) + (15 * 60) // 15 minute TTL
          }
        }).promise();
        
        threadsUpdated++;
      } catch (err) {
        console.error(`Error processing thread ${thread.id}:`, err);
      }
    }));
    
    // Log progress
    if ((i + batchSize) % 50 === 0 || i + batchSize >= threads.length) {
      console.log(`   Progress: ${Math.min(i + batchSize, threads.length)}/${threads.length}`);
    }
  }

  const elapsed = Date.now() - updateStart;
  console.log(`✅ Updated ${threadsUpdated} trending scores in ${elapsed}ms`);
  
  return { threadsUpdated, duration: elapsed };
}

/**
 * Aggregate all metrics for a single thread
 */
async function aggregateThreadMetrics(threadId, oneDayAgo) {
  const [
    answerLikes,
    answerSaves,
    answerShares,
    commentLikes,
    threadViews,
    recentEngagement
  ] = await Promise.all([
    countByThreadIdAndContentType(tables.likes, threadId, 'answer'),
    countByThreadIdAndContentType(tables.saves, threadId, 'answer'),
    countByThreadIdAndContentType(tables.shares, threadId, 'answer'),
    countByThreadIdAndContentType(tables.likes, threadId, 'comment'),
    countByThreadId(tables.views, threadId),
    countRecentEngagement(threadId, oneDayAgo)
  ]);

  return {
    answerLikes,
    answerSaves,
    answerShares,
    commentLikes,
    threadViews,
    recentEngagement
  };
}

/**
 * Calculate trending score using the algorithm
 */
function calculateTrendingScore(thread, metrics, now) {
  // Engagement Score
  const engagementScore =
    (metrics.answerSaves * ENGAGEMENT_WEIGHTS.trending.answer_saves) +
    (metrics.answerShares * ENGAGEMENT_WEIGHTS.trending.answer_shares) +
    (metrics.answerLikes * ENGAGEMENT_WEIGHTS.trending.answer_likes) +
    (metrics.commentLikes * ENGAGEMENT_WEIGHTS.trending.comment_likes) +
    (metrics.threadViews * ENGAGEMENT_WEIGHTS.trending.thread_views);

  // Content Score
  const contentScore =
    ((thread.question_count || 0) * ENGAGEMENT_WEIGHTS.content.questions) +
    ((thread.answer_count || 0) * ENGAGEMENT_WEIGHTS.content.answers) +
    ((thread.comment_count || 0) * ENGAGEMENT_WEIGHTS.content.comments);

  // Time Decay (λ = 0.08)
  const hoursSinceUpdate = (now - parseInt(thread.updated_at)) / (1000 * 60 * 60);
  const timeDecay = Math.exp(-0.08 * hoursSinceUpdate);

  // Velocity Multiplier
  const totalEngagement = 
    metrics.answerLikes + metrics.answerSaves + metrics.answerShares + 
    metrics.commentLikes + (thread.answer_count || 0) + (thread.comment_count || 0);
  const velocityRatio = metrics.recentEngagement / Math.max(totalEngagement, 1);
  const velocityMultiplier = 1 + (velocityRatio * 0.8);

  // Final score
  const trendingScore = (engagementScore + contentScore) * timeDecay * velocityMultiplier;
  
  return trendingScore;
}

/**
 * PART 2: Update user preferences for active users
 */
async function updateUserPreferences() {
  console.log('👤 Updating user preferences...');
  const updateStart = Date.now();

  const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
  const ninetyDaysAgo = Date.now() - (90 * 24 * 60 * 60 * 1000);

  // Get active users (those with recent interactions)
  const activeUsers = await getActiveUsers(sevenDaysAgo);
  console.log(`   Found ${activeUsers.size} active users`);

  if (activeUsers.size === 0) {
    return { usersUpdated: 0, duration: 0 };
  }

  const users = Array.from(activeUsers);
  let usersUpdated = 0;

  // Process users in batches of 5 (avoid DynamoDB throttling)
  const batchSize = 5;
  for (let i = 0; i < users.length; i += batchSize) {
    const batch = users.slice(i, i + batchSize);
    
    await Promise.all(batch.map(async (userId) => {
      try {
        // Get user's interactions from last 90 days
        const interactions = await getUserInteractions(userId, ninetyDaysAgo);
        
        if (interactions.length === 0) return;

        // Calculate category affinities and creator preferences
        const categoryScores = {};
        const creatorScores = {};
        let totalScore = 0;

        for (const interaction of interactions) {
          totalScore += interaction.score;
          
          if (interaction.category) {
            categoryScores[interaction.category] = 
              (categoryScores[interaction.category] || 0) + interaction.score;
          }
          
          if (interaction.creator_id) {
            creatorScores[interaction.creator_id] = 
              (creatorScores[interaction.creator_id] || 0) + interaction.score;
          }
        }

        // Normalize category affinities to 0-100
        const maxCategoryScore = Math.max(...Object.values(categoryScores), 1);
        const categoryAffinities = {};
        Object.keys(categoryScores).forEach(category => {
          categoryAffinities[category] = 
            Math.round((categoryScores[category] / maxCategoryScore) * 100);
        });

        // Top 10 favorite creators
        const favoriteCreators = Object.entries(creatorScores)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([creatorId]) => creatorId);

        const now = Date.now();

        // Store user preferences with TTL
        await dynamodb.put({
          TableName: tables.userPreferences,
          Item: {
            user_id: userId,
            category_affinities: categoryAffinities,
            favorite_creators: favoriteCreators,
            total_engagement_score: totalScore,
            last_updated: now,
            ttl: Math.floor(now / 1000) + (15 * 60) // 15 minute TTL
          }
        }).promise();
        
        usersUpdated++;
      } catch (err) {
        console.error(`Error processing user ${userId}:`, err);
      }
    }));
    
    // Log progress
    if ((i + batchSize) % 20 === 0 || i + batchSize >= users.length) {
      console.log(`   Progress: ${Math.min(i + batchSize, users.length)}/${users.length}`);
    }
  }

  const elapsed = Date.now() - updateStart;
  console.log(`✅ Updated ${usersUpdated} user preferences in ${elapsed}ms`);
  
  return { usersUpdated, duration: elapsed };
}

// ==================== HELPER FUNCTIONS ====================

/**
 * Count items by thread_id (for views)
 */
async function countByThreadId(tableName, threadId) {
  try {
    const result = await dynamodb.query({
      TableName: tableName,
      IndexName: 'ThreadIdIndex',
      KeyConditionExpression: 'thread_id = :threadId',
      ExpressionAttributeValues: { ':threadId': threadId },
      Select: 'COUNT'
    }).promise();
    
    return result.Count || 0;
  } catch (error) {
    console.error(`Error counting ${tableName} for thread ${threadId}:`, error);
    return 0;
  }
}

/**
 * Count items by thread_id and content_type (for likes/saves/shares)
 */
async function countByThreadIdAndContentType(tableName, threadId, contentType) {
  try {
    const result = await dynamodb.query({
      TableName: tableName,
      IndexName: 'ThreadIdIndex',
      KeyConditionExpression: 'thread_id = :threadId',
      ExpressionAttributeValues: { ':threadId': threadId },
      FilterExpression: 'content_type = :contentType',
      ExpressionAttributeNames: { '#ct': 'content_type' },
      ExpressionAttributeValues: { 
        ':threadId': threadId,
        ':contentType': contentType
      },
      Select: 'COUNT'
    }).promise();
    
    return result.Count || 0;
  } catch (error) {
    console.error(`Error counting ${tableName} for thread ${threadId}, type ${contentType}:`, error);
    return 0;
  }
}

/**
 * Count recent engagement (last 24 hours)
 */
async function countRecentEngagement(threadId, sinceTimestamp) {
  const tablesToCheck = [
    tables.likes,
    tables.saves,
    tables.shares
  ];

  let total = 0;
  
  for (const tableName of tablesToCheck) {
    try {
      const result = await dynamodb.query({
        TableName: tableName,
        IndexName: 'ThreadIdIndex',
        KeyConditionExpression: 'thread_id = :threadId AND created_at > :since',
        ExpressionAttributeValues: {
          ':threadId': threadId,
          ':since': sinceTimestamp
        },
        Select: 'COUNT'
      }).promise();
      
      total += result.Count || 0;
    } catch (error) {
      console.error(`Error counting recent engagement for ${tableName}:`, error);
    }
  }

  return total;
}

/**
 * Get set of active users (with interactions in time window)
 */
async function getActiveUsers(sinceTimestamp) {
  const users = new Set();
  const tablesToScan = [
    tables.likes,
    tables.saves,
    tables.shares,
    tables.views
  ];

  for (const tableName of tablesToScan) {
    try {
      let lastKey = null;
      let scanned = 0;
      
      do {
        const params = {
          TableName: tableName,
          FilterExpression: 'created_at > :since AND attribute_exists(user_id)',
          ExpressionAttributeValues: { ':since': sinceTimestamp },
          ProjectionExpression: 'user_id',
          ExclusiveStartKey: lastKey,
          Limit: 100 // Process in chunks
        };

        const result = await dynamodb.scan(params).promise();
        result.Items.forEach(item => {
          if (item.user_id) users.add(item.user_id);
        });
        
        scanned += result.Items.length;
        lastKey = result.LastEvaluatedKey;
      } while (lastKey && scanned < 1000); // Cap at 1000 users per table for performance
    } catch (error) {
      console.error(`Error scanning ${tableName} for active users:`, error);
    }
  }

  return users;
}

/**
 * Get all interactions for a user within time window
 */
async function getUserInteractions(userId, sinceTimestamp) {
  const interactions = [];

  try {
    // Query likes
    const likes = await dynamodb.query({
      TableName: tables.likes,
      IndexName: 'UserIdIndex',
      KeyConditionExpression: 'user_id = :userId AND created_at > :since',
      ExpressionAttributeValues: {
        ':userId': userId,
        ':since': sinceTimestamp
      },
      Limit: 500 // Limit to prevent memory issues
    }).promise();

    for (const like of likes.Items) {
      const threadData = await getThreadData(like.thread_id);
      if (threadData) {
        interactions.push({
          score: ENGAGEMENT_WEIGHTS.recommendation.like,
          category: threadData.category,
          creator_id: threadData.creator_id
        });
      }
    }

    // Query saves
    const saves = await dynamodb.query({
      TableName: tables.saves,
      IndexName: 'UserIdIndex',
      KeyConditionExpression: 'user_id = :userId AND created_at > :since',
      ExpressionAttributeValues: {
        ':userId': userId,
        ':since': sinceTimestamp
      },
      Limit: 500
    }).promise();

    for (const save of saves.Items) {
      const threadData = await getThreadData(save.thread_id);
      if (threadData) {
        interactions.push({
          score: ENGAGEMENT_WEIGHTS.recommendation.save,
          category: threadData.category,
          creator_id: threadData.creator_id
        });
      }
    }

    // Query shares
    const shares = await dynamodb.query({
      TableName: tables.shares,
      IndexName: 'UserIdIndex',
      KeyConditionExpression: 'user_id = :userId AND created_at > :since',
      ExpressionAttributeValues: {
        ':userId': userId,
        ':since': sinceTimestamp
      },
      Limit: 500
    }).promise();

    for (const share of shares.Items) {
      const threadData = await getThreadData(share.thread_id);
      if (threadData) {
        interactions.push({
          score: ENGAGEMENT_WEIGHTS.recommendation.share,
          category: threadData.category,
          creator_id: threadData.creator_id
        });
      }
    }

    // Query views
    const views = await dynamodb.query({
      TableName: tables.views,
      IndexName: 'UserIdIndex',
      KeyConditionExpression: 'user_id = :userId AND created_at > :since',
      ExpressionAttributeValues: {
        ':userId': userId,
        ':since': sinceTimestamp
      },
      Limit: 500
    }).promise();

    for (const view of views.Items) {
      const threadData = await getThreadData(view.thread_id || view.content_id);
      if (threadData) {
        interactions.push({
          score: ENGAGEMENT_WEIGHTS.recommendation.view,
          category: threadData.category,
          creator_id: threadData.creator_id
        });
      }
    }

  } catch (error) {
    console.error(`Error getting interactions for user ${userId}:`, error);
  }

  return interactions;
}

/**
 * Cache for thread data to avoid repeated DynamoDB calls
 */
const threadDataCache = new Map();

async function getThreadData(threadId) {
  if (threadDataCache.has(threadId)) {
    return threadDataCache.get(threadId);
  }

  try {
    const result = await dbOperations.get(tables.threads, { id: threadId });
    const threadData = result.Item ? {
      category: result.Item.category,
      creator_id: result.Item.creator_id
    } : null;
    
    threadDataCache.set(threadId, threadData);
    return threadData;
  } catch (error) {
    console.error(`Error fetching thread ${threadId}:`, error);
    return null;
  }
}

