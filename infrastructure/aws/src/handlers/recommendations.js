/**
 * AWS Lambda Recommendations Handler
 * 
 * Handles recommendation system operations with DynamoDB
 */

const crypto = require('crypto');
const { addCorsHeaders, handleOptionsRequest } = require('../utils/cors');
const { tables, dbOperations } = require('../utils/db');

// Interaction score weights
const INTERACTION_SCORES = {
  view: 1,
  like: 5,
  save: 10,
  share: 15,
  time_spent: 2, // per minute
  question: 20,
  answer: 15,
};

/**
 * Calculate interaction score
 */
function calculateInteractionScore(interactionType, metadata = {}) {
  if (interactionType === 'time_spent' && metadata.timeSpentSeconds) {
    return Math.floor(metadata.timeSpentSeconds / 60) * 2; // 2 points per minute
  }
  
  return INTERACTION_SCORES[interactionType] || 0;
}

/**
 * Update user preferences based on interactions
 */
async function updateUserPreferences(userId) {
  try {
    // Get user's recent interactions (last 90 days)
    const ninetyDaysAgo = Date.now() - (90 * 24 * 60 * 60 * 1000);
    
    const result = await dbOperations.query(
      tables.userInteractions,
      'user_id = :userId AND created_at > :timestamp',
      {
        ':userId': userId,
        ':timestamp': ninetyDaysAgo.toString()
      },
      'UserIdIndex',
      false,
      1000
    );
    
    const interactions = result.Items || [];
    
    // Calculate category affinities and creator preferences
    const categoryScores = {};
    const creatorScores = {};
    let totalScore = 0;
    
    for (const interaction of interactions) {
      const score = interaction.score || 0;
      totalScore += score;
      
      // Get thread details to extract category and creator
      const threadResult = await dbOperations.get(tables.threads, { id: interaction.thread_id });
      const thread = threadResult.Item;
      
      if (thread) {
        if (thread.category) {
          categoryScores[thread.category] = (categoryScores[thread.category] || 0) + score;
        }
        
        if (thread.creator_id) {
          creatorScores[thread.creator_id] = (creatorScores[thread.creator_id] || 0) + score;
        }
      }
    }
    
    // Normalize to 0-100 scale
    const maxCategoryScore = Math.max(...Object.values(categoryScores), 1);
    const categoryAffinities = {};
    Object.keys(categoryScores).forEach(category => {
      categoryAffinities[category] = Math.round((categoryScores[category] / maxCategoryScore) * 100);
    });
    
    // Get top 10 favorite creators
    const sortedCreators = Object.entries(creatorScores)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([creatorId]) => creatorId);
    
    // Save user preferences with TTL (15 minutes)
    const ttl = Math.floor(Date.now() / 1000) + (15 * 60);
    
    await dbOperations.put(tables.userPreferences, {
      user_id: userId,
      category_affinities: categoryAffinities,
      favorite_creators: sortedCreators,
      total_engagement_score: totalScore,
      last_updated: Date.now(),
      ttl
    });
    
    console.log('Updated user preferences for:', userId);
  } catch (error) {
    console.error('Error updating user preferences:', error);
  }
}

/**
 * Track user interaction
 */
exports.trackInteraction = async (event) => {
  try {
    if (event.httpMethod === 'OPTIONS') {
      return handleOptionsRequest();
    }

    const body = JSON.parse(event.body || '{}');
    const { userId, threadId, interactionType, metadata } = body;

    if (!userId || !threadId || !interactionType) {
      return addCorsHeaders({
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing required fields' })
      });
    }

    const score = calculateInteractionScore(interactionType, metadata);
    const timestamp = Date.now();
    const id = crypto.randomUUID();

    await dbOperations.put(tables.userInteractions, {
      id,
      user_id: userId,
      thread_id: threadId,
      interaction_type: interactionType,
      score,
      metadata: metadata || {},
      created_at: timestamp.toString()
    });

    // Asynchronously update user preferences (don't wait)
    updateUserPreferences(userId).catch(err => {
      console.error('Error updating preferences:', err);
    });

    return addCorsHeaders({
      statusCode: 200,
      body: JSON.stringify({ success: true })
    });
  } catch (error) {
    console.error('Error tracking interaction:', error);
    return addCorsHeaders({
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to track interaction', message: error.message })
    });
  }
};

/**
 * Get user preferences
 */
exports.getUserPreferences = async (event) => {
  try {
    if (event.httpMethod === 'OPTIONS') {
      return handleOptionsRequest();
    }

    const { userId } = event.pathParameters || {};

    if (!userId) {
      return addCorsHeaders({
        statusCode: 400,
        body: JSON.stringify({ error: 'userId is required' })
      });
    }

    const result = await dbOperations.get(tables.userPreferences, { user_id: userId });

    if (!result.Item) {
      // Return empty preferences for new users
      return addCorsHeaders({
        statusCode: 200,
        body: JSON.stringify({
          userId,
          categoryAffinities: {},
          favoriteCreators: [],
          totalEngagementScore: 0,
          lastUpdated: Date.now()
        })
      });
    }

    const preferences = result.Item;

    return addCorsHeaders({
      statusCode: 200,
      body: JSON.stringify({
        userId: preferences.user_id,
        categoryAffinities: preferences.category_affinities || {},
        favoriteCreators: preferences.favorite_creators || [],
        totalEngagementScore: preferences.total_engagement_score || 0,
        lastUpdated: preferences.last_updated
      })
    });
  } catch (error) {
    console.error('Error fetching preferences:', error);
    return addCorsHeaders({
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to fetch preferences', message: error.message })
    });
  }
};

/**
 * Get recommended threads
 */
exports.getRecommendedThreads = async (event) => {
  try {
    if (event.httpMethod === 'OPTIONS') {
      return handleOptionsRequest();
    }

    const { userId, limit = '20', offset = '0' } = event.queryStringParameters || {};

    if (!userId) {
      return addCorsHeaders({
        statusCode: 400,
        body: JSON.stringify({ error: 'userId is required' })
      });
    }

    const limitNum = parseInt(limit);
    const offsetNum = parseInt(offset);

    // Get user preferences
    const preferencesResult = await dbOperations.get(tables.userPreferences, { user_id: userId });
    const preferences = preferencesResult.Item;

    // Cold start - no preferences yet
    if (!preferences || preferences.total_engagement_score === 0) {
      const result = await dbOperations.query(
        tables.threads,
        'is_public = :isPublic',
        { ':isPublic': 'true' },
        'PublicThreadsIndex',
        false,
        limitNum + offsetNum
      );

      let threads = result.Items || [];
      threads = threads.slice(offsetNum, offsetNum + limitNum);

      // Enrich with user data
      const enrichedThreads = await Promise.all(
        threads.map(async (thread) => {
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
            questions: [],
            category: thread.category,
            viewCount: thread.view_count || 0,
            likeCount: thread.like_count || 0,
            saveCount: thread.save_count || 0,
            shareCount: thread.share_count || 0
          };
        })
      );

      return addCorsHeaders({
        statusCode: 200,
        body: JSON.stringify({
          threads: enrichedThreads,
          hasMore: result.Items.length > offsetNum + limitNum,
          recommendationType: 'cold_start'
        })
      });
    }

    // Get threads user hasn't viewed recently (last 7 days)
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    
    const interactionsResult = await dbOperations.query(
      tables.userInteractions,
      'user_id = :userId AND created_at > :timestamp',
      {
        ':userId': userId,
        ':timestamp': sevenDaysAgo.toString()
      },
      'UserIdIndex',
      false,
      1000
    );

    const recentlyViewedIds = (interactionsResult.Items || []).map(i => i.thread_id);

    // Get all public threads
    const threadsResult = await dbOperations.query(
      tables.threads,
      'is_public = :isPublic',
      { ':isPublic': 'true' },
      'PublicThreadsIndex',
      false,
      100
    );

    let threads = (threadsResult.Items || [])
      .filter(thread => !recentlyViewedIds.includes(thread.id));

    // Calculate scores
    const categoryAffinities = preferences.category_affinities || {};
    const favoriteCreators = preferences.favorite_creators || [];

    const scoredThreads = threads.map(thread => {
      let score = 0;

      // Category affinity (40% weight)
      if (thread.category && categoryAffinities[thread.category]) {
        score += categoryAffinities[thread.category] * 0.4;
      }

      // Creator affinity (30% weight)
      const creatorAffinity = favoriteCreators.includes(thread.creator_id) ? 100 : 0;
      score += creatorAffinity * 0.3;

      // Engagement similarity (20% weight)
      const engagementScore = Math.min(
        ((thread.like_count || 0) + (thread.save_count || 0) + (thread.share_count || 0)) / 10,
        100
      );
      score += engagementScore * 0.2;

      // Freshness score (10% weight)
      const daysSinceCreation = (Date.now() - parseInt(thread.created_at)) / (1000 * 60 * 60 * 24);
      const freshnessScore = Math.max(100 - daysSinceCreation * 5, 0);
      score += freshnessScore * 0.1;

      return { ...thread, _score: score };
    });

    // Sort by score
    scoredThreads.sort((a, b) => b._score - a._score);

    // Apply 70/30 split
    const personalizedCount = Math.floor(limitNum * 0.7);
    const explorationCount = limitNum - personalizedCount;

    const personalized = scoredThreads.slice(0, personalizedCount);
    const exploration = scoredThreads.slice(personalizedCount)
      .sort(() => Math.random() - 0.5)
      .slice(0, explorationCount);

    const finalThreads = [...personalized, ...exploration].sort(() => Math.random() - 0.5);

    // Enrich with user data
    const enrichedThreads = await Promise.all(
      finalThreads.slice(offsetNum, offsetNum + limitNum).map(async (thread) => {
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
          questions: [],
          category: thread.category,
          viewCount: thread.view_count || 0,
          likeCount: thread.like_count || 0,
          saveCount: thread.save_count || 0,
          shareCount: thread.share_count || 0
        };
      })
    );

    return addCorsHeaders({
      statusCode: 200,
      body: JSON.stringify({
        threads: enrichedThreads,
        hasMore: finalThreads.length > offsetNum + limitNum,
        recommendationType: 'personalized'
      })
    });
  } catch (error) {
    console.error('Error getting recommendations:', error);
    return addCorsHeaders({
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to get recommendations', message: error.message })
    });
  }
};

