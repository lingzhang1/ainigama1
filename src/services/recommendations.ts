/**
 * Recommendation Service
 * 
 * Provides personalized thread recommendations using content-based filtering
 * with a 70/30 personalization-to-randomness ratio for discovery.
 */

import { Thread, UserInteraction, UserPreferences, RecommendedThreadsResponse } from '../types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3002/api';

// Interaction score weights (per design)
export const INTERACTION_SCORES = {
  view: 1,
  like: 5,
  save: 10,
  share: 15,
  time_spent: 2, // per minute
  question: 20,
  answer: 15,
} as const;

/**
 * Track a user interaction for recommendation engine
 */
export async function trackInteraction(
  userId: string,
  threadId: string,
  interactionType: UserInteraction['interactionType'],
  metadata?: { timeSpentSeconds?: number }
): Promise<void> {
  try {
    const response = await fetch(`${API_URL}/interactions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId,
        threadId,
        interactionType,
        metadata,
      }),
    });

    if (!response.ok) {
      console.error('Failed to track interaction:', response.statusText);
    }
  } catch (error) {
    console.error('Error tracking interaction:', error);
  }
}

/**
 * Track thread view
 */
export async function trackThreadView(threadId: string, userId: string): Promise<void> {
  return trackInteraction(userId, threadId, 'view');
}

/**
 * Track time spent on thread
 */
export async function trackTimeSpent(
  threadId: string,
  userId: string,
  seconds: number
): Promise<void> {
  return trackInteraction(userId, threadId, 'time_spent', { timeSpentSeconds: seconds });
}

/**
 * Get personalized recommended threads
 */
export async function getRecommendedThreads(
  userId: string,
  limit: number = 20,
  offset: number = 0
): Promise<RecommendedThreadsResponse> {
  try {
    const response = await fetch(
      `${API_URL}/recommendations/threads?userId=${userId}&limit=${limit}&offset=${offset}`
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch recommendations: ${response.statusText}`);
    }

    const data = await response.json();
    
    // Transform dates
    const threads = data.threads.map((thread: any) => ({
      ...thread,
      createdAt: new Date(thread.createdAt),
      updatedAt: new Date(thread.updatedAt),
      questions: (thread.questions || []).map((q: any) => ({
        ...q,
        timestamp: new Date(q.timestamp),
      })),
    }));

    return {
      threads,
      hasMore: data.hasMore ?? false,
      recommendationType: data.recommendationType || 'personalized',
    };
  } catch (error) {
    console.error('Error fetching recommendations:', error);
    
    // Fallback to recent threads
    return {
      threads: [],
      hasMore: false,
      recommendationType: 'cold_start',
    };
  }
}

/**
 * Get user preference profile
 */
export async function getUserPreferences(userId: string): Promise<UserPreferences | null> {
  try {
    const response = await fetch(`${API_URL}/users/${userId}/preferences`);

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    
    return {
      userId: data.userId,
      categoryAffinities: data.categoryAffinities || {},
      favoriteCreators: data.favoriteCreators || [],
      totalEngagementScore: data.totalEngagementScore || 0,
      lastUpdated: new Date(data.lastUpdated),
    };
  } catch (error) {
    console.error('Error fetching user preferences:', error);
    return null;
  }
}

// ==================== CLIENT-SIDE SCORING (for fallback/testing) ====================

/**
 * Calculate content-based score for a thread based on user preferences
 * This is used as a fallback if server-side recommendations fail
 */
export function calculateThreadScore(
  thread: Thread,
  userPreferences: UserPreferences,
  recentlyViewedThreadIds: string[]
): number {
  // Skip recently viewed threads
  if (recentlyViewedThreadIds.includes(thread.id)) {
    return 0;
  }

  let score = 0;

  // Category affinity (40% weight)
  if (thread.category && userPreferences.categoryAffinities[thread.category]) {
    score += userPreferences.categoryAffinities[thread.category] * 0.4;
  }

  // Creator affinity (30% weight)
  const creatorAffinity = userPreferences.favoriteCreators.includes(thread.creator.id) ? 100 : 0;
  score += creatorAffinity * 0.3;

  // Engagement similarity (20% weight) - based on existing interactions
  const engagementScore = Math.min(
    (thread.likeCount + thread.saveCount + thread.shareCount) / 10,
    100
  );
  score += engagementScore * 0.2;

  // Freshness score (10% weight) - prefer recent threads
  const daysSinceCreation = (Date.now() - thread.createdAt.getTime()) / (1000 * 60 * 60 * 24);
  const freshnessScore = Math.max(100 - daysSinceCreation * 5, 0);
  score += freshnessScore * 0.1;

  return score;
}

/**
 * Apply 70/30 split: 70% personalized, 30% exploration
 */
export function apply70_30Split(
  personalizedThreads: Thread[],
  explorationThreads: Thread[]
): Thread[] {
  const targetCount = 20;
  const personalizedCount = Math.floor(targetCount * 0.7); // 14 threads
  const explorationCount = targetCount - personalizedCount; // 6 threads

  const selected = [
    ...personalizedThreads.slice(0, personalizedCount),
    ...explorationThreads.slice(0, explorationCount),
  ];

  // Shuffle slightly to avoid predictable patterns
  return shuffleArray(selected);
}

/**
 * Shuffle array using Fisher-Yates algorithm
 */
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Apply diversity filters to prevent saturation
 */
export function applyDiversityFilters(threads: Thread[]): Thread[] {
  const maxCategoryRatio = 0.4; // Max 40% from same category
  const maxCreatorRatio = 0.2; // Max 20% from same creator

  const categoryCounts = new Map<string, number>();
  const creatorCounts = new Map<string, number>();
  const totalThreads = threads.length;

  const filtered: Thread[] = [];

  for (const thread of threads) {
    const categoryCount = categoryCounts.get(thread.category || 'uncategorized') || 0;
    const creatorCount = creatorCounts.get(thread.creator.id) || 0;

    // Check if adding this thread would exceed diversity limits
    const categoryRatio = (categoryCount + 1) / totalThreads;
    const creatorRatio = (creatorCount + 1) / totalThreads;

    if (categoryRatio <= maxCategoryRatio && creatorRatio <= maxCreatorRatio) {
      filtered.push(thread);
      categoryCounts.set(thread.category || 'uncategorized', categoryCount + 1);
      creatorCounts.set(thread.creator.id, creatorCount + 1);
    }
  }

  return filtered;
}

