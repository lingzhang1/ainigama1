/**
 * Unified Weight Configuration
 * 
 * Shared between trending and recommendation systems
 * Used by both backend (Lambda) and frontend (TypeScript)
 */

/**
 * Engagement weights for different systems
 * 
 * Rationale for weight differences:
 * - Trending: Balanced for global popularity, emphasizes saves (user intent)
 * - Recommendation: Higher weights for stronger personal preference signals
 * - Shares: Lower in trending (prevent gaming), higher in rec (strong signal)
 */
export const ENGAGEMENT_WEIGHTS = {
  view: {
    trending: 0.1,        // Low weight - passive action, easily inflated
    recommendation: 1,    // Baseline for user preference
    description: 'Thread or content viewed'
  },
  like: {
    trending: 3.0,        // Quality signal
    recommendation: 5,    // Stronger preference indicator
    description: 'Content liked/hearted'
  },
  save: {
    trending: 5.0,        // Highest value for trending (strong intent)
    recommendation: 10,   // Strong personal interest signal
    description: 'Content bookmarked for later'
  },
  share: {
    trending: 4.0,        // Viral amplification signal
    recommendation: 15,   // Strongest personal preference (user promotes it)
    description: 'Content shared externally'
  },
  question: {
    trending: null,       // Not used in trending (content count instead)
    recommendation: 20,   // Very strong engagement (user creates content)
    description: 'User created question in thread'
  },
  answer: {
    trending: null,       // Not used in trending (content count instead)
    recommendation: 15,   // Strong contribution signal
    description: 'User provided answer'
  },
  time_spent: {
    trending: null,       // Not used in trending
    recommendation: 2,    // Per minute of engagement
    description: 'Time actively engaged with thread'
  }
} as const;

/**
 * Content quality weights (used by trending system)
 */
export const CONTENT_WEIGHTS = {
  question: 1.5,   // Activity indicator
  answer: 2.0,     // Core value of thread
  comment: 1.0     // Discussion depth
} as const;

/**
 * Algorithm configuration
 */
export const ALGORITHM_CONFIG = {
  trending: {
    decayRate: 0.08,           // Lambda (λ) for time decay
    velocityWeight: 0.8,       // Weight for velocity multiplier
    minEngagement: 3,          // Minimum engagement to be eligible
    cacheMinutes: 15           // Cache TTL in minutes
  },
  recommendation: {
    categoryWeight: 0.4,       // Category affinity weight
    creatorWeight: 0.3,        // Creator affinity weight
    engagementWeight: 0.2,     // Engagement similarity weight
    freshnessWeight: 0.1,      // Freshness score weight
    trendingBoost: 0.15,       // Boost from trending score
    personalizedRatio: 0.7,    // 70% personalized
    explorationRatio: 0.3,     // 30% exploration
    recentViewDays: 7,         // Days to filter out recently viewed
    interactionLookbackDays: 90, // Days of interaction history to consider
    cacheMinutes: 15           // Cache TTL in minutes
  },
  diversity: {
    maxCategoryRatio: 0.4,     // Max 40% from same category
    maxCreatorRatio: 0.2       // Max 20% from same creator
  }
} as const;

/**
 * Get recommendation score for an interaction type
 */
export function getRecommendationScore(interactionType: string, metadata?: { timeSpentSeconds?: number }): number {
  if (interactionType === 'time_spent' && metadata?.timeSpentSeconds) {
    return Math.floor(metadata.timeSpentSeconds / 60) * ENGAGEMENT_WEIGHTS.time_spent.recommendation;
  }
  
  const weight = ENGAGEMENT_WEIGHTS[interactionType as keyof typeof ENGAGEMENT_WEIGHTS];
  return weight?.recommendation || 0;
}

/**
 * Get trending score contribution for an interaction type
 */
export function getTrendingScore(interactionType: string): number {
  const weight = ENGAGEMENT_WEIGHTS[interactionType as keyof typeof ENGAGEMENT_WEIGHTS];
  return weight?.trending || 0;
}

