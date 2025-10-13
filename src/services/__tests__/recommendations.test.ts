/**
 * Unit Tests for Recommendation Service
 */

import { describe, it, expect } from 'vitest';
import {
  INTERACTION_SCORES,
  calculateThreadScore,
  apply70_30Split,
  applyDiversityFilters,
} from '../recommendations';
import { Thread, UserPreferences } from '../../types';

// Mock thread data
const createMockThread = (overrides: Partial<Thread> = {}): Thread => ({
  id: 'thread-1',
  title: 'Test Thread',
  creator: {
    id: 'creator-1',
    name: 'Test User',
    alias: 'testuser',
    avatar: '/avatar.jpg',
    handle: '@testuser',
  },
  isPublic: true,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
  questionCount: 5,
  answerCount: 10,
  interactionCount: 15,
  viewCount: 100,
  likeCount: 10,
  saveCount: 5,
  shareCount: 2,
  questions: [],
  category: 'tech',
  ...overrides,
});

// Mock user preferences
const createMockPreferences = (overrides: Partial<UserPreferences> = {}): UserPreferences => ({
  userId: 'user-1',
  categoryAffinities: {
    tech: 80,
    science: 60,
    art: 40,
  },
  favoriteCreators: ['creator-1', 'creator-2'],
  totalEngagementScore: 500,
  lastUpdated: new Date(),
  ...overrides,
});

describe('Recommendation Service', () => {
  describe('INTERACTION_SCORES', () => {
    it('should have correct score weights', () => {
      expect(INTERACTION_SCORES.view).toBe(1);
      expect(INTERACTION_SCORES.like).toBe(5);
      expect(INTERACTION_SCORES.save).toBe(10);
      expect(INTERACTION_SCORES.share).toBe(15);
      expect(INTERACTION_SCORES.time_spent).toBe(2);
      expect(INTERACTION_SCORES.question).toBe(20);
      expect(INTERACTION_SCORES.answer).toBe(15);
    });
  });

  describe('calculateThreadScore', () => {
    it('should calculate score based on category affinity', () => {
      const thread = createMockThread({ category: 'tech' });
      const preferences = createMockPreferences();
      const score = calculateThreadScore(thread, preferences, []);

      // Category affinity: 80 * 0.4 = 32
      // Creator affinity: 100 * 0.3 = 30 (favorite creator)
      // Engagement: (10 + 5 + 2) / 10 * 0.2 = 0.34
      // Freshness: ~100 * 0.1 = 10 (recent thread)
      // Total: ~72.34
      expect(score).toBeGreaterThan(70);
      expect(score).toBeLessThan(80);
    });

    it('should return 0 for recently viewed threads', () => {
      const thread = createMockThread({ id: 'thread-1' });
      const preferences = createMockPreferences();
      const score = calculateThreadScore(thread, preferences, ['thread-1']);

      expect(score).toBe(0);
    });

    it('should score favorite creator threads higher', () => {
      const threadWithFavoriteCreator = createMockThread({
        creator: { ...createMockThread().creator, id: 'creator-1' },
        category: 'tech',
      });
      
      const threadWithoutFavoriteCreator = createMockThread({
        creator: { ...createMockThread().creator, id: 'creator-unknown' },
        category: 'tech',
      });

      const preferences = createMockPreferences({
        favoriteCreators: ['creator-1'],
      });

      const scoreWithFavorite = calculateThreadScore(threadWithFavoriteCreator, preferences, []);
      const scoreWithoutFavorite = calculateThreadScore(threadWithoutFavoriteCreator, preferences, []);

      expect(scoreWithFavorite).toBeGreaterThan(scoreWithoutFavorite);
    });

    it('should penalize old threads with freshness score', () => {
      const recentThread = createMockThread({
        createdAt: new Date(),
        category: 'tech',
      });

      const oldThread = createMockThread({
        createdAt: new Date('2020-01-01'),
        category: 'tech',
      });

      const preferences = createMockPreferences();

      const recentScore = calculateThreadScore(recentThread, preferences, []);
      const oldScore = calculateThreadScore(oldThread, preferences, []);

      expect(recentScore).toBeGreaterThan(oldScore);
    });

    it('should consider engagement metrics', () => {
      const highEngagementThread = createMockThread({
        likeCount: 50,
        saveCount: 30,
        shareCount: 20,
        category: 'tech',
      });

      const lowEngagementThread = createMockThread({
        likeCount: 1,
        saveCount: 0,
        shareCount: 0,
        category: 'tech',
      });

      const preferences = createMockPreferences();

      const highScore = calculateThreadScore(highEngagementThread, preferences, []);
      const lowScore = calculateThreadScore(lowEngagementThread, preferences, []);

      expect(highScore).toBeGreaterThan(lowScore);
    });
  });

  describe('apply70_30Split', () => {
    it('should return 70% personalized and 30% exploration', () => {
      const personalizedThreads = Array.from({ length: 20 }, (_, i) =>
        createMockThread({ id: `personalized-${i}`, title: `Personalized ${i}` })
      );

      const explorationThreads = Array.from({ length: 20 }, (_, i) =>
        createMockThread({ id: `exploration-${i}`, title: `Exploration ${i}` })
      );

      const result = apply70_30Split(personalizedThreads, explorationThreads);

      expect(result.length).toBe(20);

      // Should have ~14 personalized (70%) and ~6 exploration (30%)
      const personalizedCount = result.filter(t => t.id.startsWith('personalized')).length;
      const explorationCount = result.filter(t => t.id.startsWith('exploration')).length;

      expect(personalizedCount).toBe(14);
      expect(explorationCount).toBe(6);
    });

    it('should shuffle the results', () => {
      const personalizedThreads = Array.from({ length: 20 }, (_, i) =>
        createMockThread({ id: `p-${i}` })
      );

      const explorationThreads = Array.from({ length: 20 }, (_, i) =>
        createMockThread({ id: `e-${i}` })
      );

      const result1 = apply70_30Split(personalizedThreads, explorationThreads);
      const result2 = apply70_30Split(personalizedThreads, explorationThreads);

      // Results should be different due to shuffling (with high probability)
      const ids1 = result1.map(t => t.id).join(',');
      const ids2 = result2.map(t => t.id).join(',');

      // Note: This test has a small chance of failing due to randomness
      // but the probability is extremely low (~1/20!)
      expect(ids1).not.toBe(ids2);
    });
  });

  describe('applyDiversityFilters', () => {
    it('should limit same category to 40%', () => {
      const threads = [
        ...Array.from({ length: 15 }, (_, i) =>
          createMockThread({ id: `tech-${i}`, category: 'tech' })
        ),
        ...Array.from({ length: 5 }, (_, i) =>
          createMockThread({ id: `science-${i}`, category: 'science' })
        ),
      ];

      const result = applyDiversityFilters(threads);

      const techCount = result.filter(t => t.category === 'tech').length;
      const techRatio = techCount / result.length;

      expect(techRatio).toBeLessThanOrEqual(0.4);
    });

    it('should limit same creator to 20%', () => {
      const creator1 = { ...createMockThread().creator, id: 'creator-1' };
      const creator2 = { ...createMockThread().creator, id: 'creator-2' };

      const threads = [
        ...Array.from({ length: 15 }, (_, i) =>
          createMockThread({ id: `thread-${i}`, creator: creator1 })
        ),
        ...Array.from({ length: 5 }, (_, i) =>
          createMockThread({ id: `thread-other-${i}`, creator: creator2 })
        ),
      ];

      const result = applyDiversityFilters(threads);

      const creator1Count = result.filter(t => t.creator.id === 'creator-1').length;
      const creator1Ratio = creator1Count / result.length;

      expect(creator1Ratio).toBeLessThanOrEqual(0.2);
    });

    it('should maintain diversity across multiple categories', () => {
      const threads = [
        ...Array.from({ length: 10 }, (_, i) =>
          createMockThread({ id: `tech-${i}`, category: 'tech' })
        ),
        ...Array.from({ length: 10 }, (_, i) =>
          createMockThread({ id: `science-${i}`, category: 'science' })
        ),
        ...Array.from({ length: 10 }, (_, i) =>
          createMockThread({ id: `art-${i}`, category: 'art' })
        ),
      ];

      const result = applyDiversityFilters(threads);

      const categoryCounts = result.reduce((acc, thread) => {
        acc[thread.category || 'uncategorized'] = (acc[thread.category || 'uncategorized'] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      // Each category should be represented
      expect(Object.keys(categoryCounts).length).toBeGreaterThanOrEqual(2);

      // No category should dominate
      Object.values(categoryCounts).forEach(count => {
        const ratio = count / result.length;
        expect(ratio).toBeLessThanOrEqual(0.5);
      });
    });
  });
});

