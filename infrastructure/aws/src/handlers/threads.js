const crypto = require('crypto');
const { addCorsHeaders, handleOptionsRequest } = require('../utils/cors');
const { tables, dbOperations, parseRequestBody } = require('../utils/db');

// Get public threads
exports.getThreads = async (event) => {
  console.log('getThreads called with method:', event.httpMethod);
  
  try {
    // Handle preflight OPTIONS request
    if (event.httpMethod === 'OPTIONS') {
      console.log('Handling OPTIONS request');
      return handleOptionsRequest();
    }

    const { filter = 'recent' } = event.queryStringParameters || {};
    
    console.log('Getting threads with filter:', filter);
    
    // Use GSI for efficient public thread queries
    let result;
    try {
      result = await dbOperations.query(
        tables.threads,
        'is_public = :isPublic',
        { ':isPublic': 'true' },
        'PublicThreadsIndex',
        false,
        20
      );
      console.log('GSI query successful, found', result.Items?.length || 0, 'threads');
    } catch (gsiError) {
      console.log('GSI query failed, falling back to scan:', gsiError.message);
      // Fallback to scan if GSI query fails
      result = await dbOperations.scan(
        tables.threads,
        'is_public = :isPublic',
        { ':isPublic': 'true' },
        50
      );
      console.log('Scan fallback successful, found', result.Items?.length || 0, 'threads');
    }
    
    let sortedItems = result.Items || [];
    console.log('Processing', sortedItems.length, 'threads');
    
    // Sort in memory based on filter
    if (filter === 'trending') {
      sortedItems = sortedItems.sort((a, b) => 
        new Date(b.updated_at || b.updatedAt || 0).getTime() - 
        new Date(a.updated_at || a.updatedAt || 0).getTime()
      );
    } else {
      sortedItems = sortedItems.sort((a, b) => 
        new Date(b.created_at || b.createdAt || 0).getTime() - 
        new Date(a.created_at || a.createdAt || 0).getTime()
      );
    }
    
    // Take only first 20 after sorting
    sortedItems = sortedItems.slice(0, 20);
    
    // Get user information for each thread creator
    const transformedThreads = await Promise.all(sortedItems.map(async (thread) => {
      let creatorInfo = {
        id: thread.creator_id || thread.creatorId,
        name: 'Unknown User',
        avatar: '/img-5.svg',
        handle: '@unknown'
      };

      // Try to get user info from users table
      if (thread.creator_id) {
        try {
          const userResult = await dbOperations.get(tables.users, { id: thread.creator_id });

          if (userResult.Item) {
            creatorInfo = {
              id: userResult.Item.id,
              name: userResult.Item.name || 'Unknown User',
              avatar: userResult.Item.avatar || '/img-5.svg',
              handle: userResult.Item.handle || '@unknown'
            };
          }
        } catch (userError) {
          console.error('Failed to get user info for thread creator:', userError);
        }
      }

      return {
        id: thread.id,
        title: thread.title,
        creator: creatorInfo,
        isPublic: Boolean(thread.is_public),
        createdAt: thread.created_at || thread.createdAt,
        updatedAt: thread.updated_at || thread.updatedAt,
        questionCount: thread.question_count || 0,
        answerCount: thread.answer_count || 0,
        interactionCount: (thread.question_count || 0) + (thread.answer_count || 0),
        questions: [],
        category: thread.category
      };
    }));

    console.log('Returning', transformedThreads.length, 'transformed threads');

    console.log('Adding CORS headers to response');
    return addCorsHeaders({
      statusCode: 200,
      body: JSON.stringify({
        threads: transformedThreads,
        count: transformedThreads.length
      })
    });

  } catch (error) {
    console.error('Get threads error:', error);
    console.log('Adding CORS headers to error response');
    return addCorsHeaders({
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Failed to fetch threads',
        message: error.message 
      })
    });
  }
};

// Create new thread (Make Public functionality)
exports.createThread = async (event) => {
  try {
    // Handle preflight OPTIONS request
    if (event.httpMethod === 'OPTIONS') {
      return handleOptionsRequest();
    }

    const requestBody = parseRequestBody(event.body);
    const { title, creatorId, category, questions, initialAnswers } = requestBody;
    
    if (!title || !creatorId || !questions || questions.length === 0) {
      return addCorsHeaders({
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing required fields: title, creatorId, questions' })
      });
    }
    
    const threadId = crypto.randomUUID();
    const now = new Date().toISOString();
    
    console.log('Creating thread:', threadId, 'with', questions.length, 'questions');
    
    // Get user information for the creator
    let creatorInfo = {
      id: creatorId,
      name: 'Unknown User',
      avatar: '/img-5.svg',
      handle: '@unknown'
    };

    try {
      const userResult = await dbOperations.get(tables.users, { id: creatorId });

      if (userResult.Item) {
        creatorInfo = {
          id: userResult.Item.id,
          name: userResult.Item.name || 'Unknown User',
          alias: userResult.Item.alias || 'unknown',
          avatar: userResult.Item.avatar || '/img-5.svg',
          handle: userResult.Item.handle || '@unknown'
        };
      }
    } catch (userError) {
      console.error('Failed to get user info for thread creator:', userError);
    }

    // Create thread
    const thread = {
      id: threadId,
      title,
      creator_id: creatorId,
      category: category || 'General',
      is_public: 'true', // String for GSI compatibility
      created_at: now,
      updated_at: now,
      question_count: questions.length,
      answer_count: initialAnswers?.length || 0
    };

    await dbOperations.put(tables.threads, thread);

    console.log('✅ Created thread:', threadId);
    
    // Create questions
    for (const question of questions) {
      const questionId = question.id || crypto.randomUUID();
      
      const questionItem = {
        id: questionId,
        thread_id: threadId,
        content: question.content,
        user_id: question.userId || creatorId,
        created_at: question.timestamp || now
      };

      await dbOperations.put(tables.questions, questionItem);

      console.log('✅ Created question:', questionId);
      
      // Create corresponding AI answer if exists
      const correspondingAnswer = initialAnswers?.find(a => a.questionId === question.id);
      if (correspondingAnswer) {
        const answerId = correspondingAnswer.id || crypto.randomUUID();
        
        const answerItem = {
          id: answerId,
          question_id: questionId,
          content: correspondingAnswer.content,
          user_id: null, // AI answers don't have user_id
          is_ai: true,
          is_pinned: true,
          interaction_count: 0,
          thinking: correspondingAnswer.thinking || null, // Include AI thinking process
          created_at: correspondingAnswer.timestamp || now
        };

        await dbOperations.put(tables.answers, answerItem);

        console.log('✅ Created AI answer:', answerId);
      }
    }
    
    // Return the created thread
    const newThread = {
      id: threadId,
      title,
      creator: creatorInfo,
      isPublic: true,
      createdAt: now,
      updatedAt: now,
      questionCount: questions.length,
      answerCount: initialAnswers?.length || 0,
      interactionCount: questions.length + (initialAnswers?.length || 0),
      questions: questions.map(q => ({
        id: q.id || crypto.randomUUID(),
        content: q.content,
        timestamp: q.timestamp || now,
        userId: q.userId || creatorId,
        threadId
      })),
      category: category || 'General'
    };
    
    console.log('🎉 Successfully created public thread:', threadId);
    
    return addCorsHeaders({
      statusCode: 200,
      body: JSON.stringify(newThread)
    });

  } catch (error) {
    console.error('Create thread error:', error);
    return addCorsHeaders({
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Failed to create thread',
        message: error.message 
      })
    });
  }
};

// Get individual thread by ID
exports.getThread = async (event) => {
  try {
    // Handle preflight OPTIONS request
    if (event.httpMethod === 'OPTIONS') {
      return handleOptionsRequest();
    }

    const { threadId } = event.pathParameters || {};
    
    if (!threadId) {
      return addCorsHeaders({
        statusCode: 400,
        body: JSON.stringify({ error: 'Thread ID is required' })
      });
    }

    // Get thread with creator info
    const threadResult = await dbOperations.get(tables.threads, { id: threadId });

    if (!threadResult.Item) {
      return addCorsHeaders({
        statusCode: 404,
        body: JSON.stringify({ error: 'Thread not found' })
      });
    }

    const thread = threadResult.Item;

    // Get creator information
    let creatorInfo = {
      id: thread.creator_id,
      name: 'Unknown User',
      avatar: '/img-5.svg',
      handle: '@unknown'
    };

    if (thread.creator_id) {
      try {
        const userResult = await dbOperations.get(tables.users, { id: thread.creator_id });

        if (userResult.Item) {
          creatorInfo = {
            id: userResult.Item.id,
            name: userResult.Item.name || 'Unknown User',
            avatar: userResult.Item.avatar || '/img-5.svg',
            handle: userResult.Item.handle || '@unknown'
          };
        }
      } catch (userError) {
        console.error('Failed to get user info for thread creator:', userError);
      }
    }

    // Get questions for this thread
    const questionsResult = await dbOperations.query(
      tables.questions,
      'thread_id = :threadId',
      { ':threadId': threadId },
      'ThreadIdIndex',
      false // Get newest first by default
    );

    const questions = (questionsResult.Items || []).map(q => ({
      id: q.id,
      content: q.content,
      timestamp: q.created_at || q.timestamp,
      userId: q.user_id,
      threadId: q.thread_id,
      isSummary: Boolean(q.is_summary) // Include summary flag
    }));

    // Calculate answer count for the thread
    let totalAnswerCount = 0;
    for (const question of questions) {
      try {
        const answersResult = await dbOperations.query(
          tables.answers,
          'question_id = :questionId',
          { ':questionId': question.id },
          'QuestionIdIndexV2'
        );
        totalAnswerCount += answersResult.Count || 0;
      } catch (error) {
        console.error('Error counting answers for question:', question.id, error);
      }
    }

    // Transform thread data
    const transformedThread = {
      id: thread.id,
      title: thread.title,
      creator: creatorInfo,
      isPublic: Boolean(thread.is_public),
      createdAt: thread.created_at,
      updatedAt: thread.updated_at,
      questionCount: questions.length,
      answerCount: totalAnswerCount,
      interactionCount: questions.length + totalAnswerCount,
      questions,
      category: thread.category
    };

    return addCorsHeaders({
      statusCode: 200,
      body: JSON.stringify(transformedThread)
    });

  } catch (error) {
    console.error('Get thread error:', error);
    return addCorsHeaders({
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Failed to fetch thread',
        message: error.message 
      })
    });
  }
};

// Get answers for a specific thread
exports.getThreadAnswers = async (event) => {
  try {
    // Handle preflight OPTIONS request
    if (event.httpMethod === 'OPTIONS') {
      return handleOptionsRequest();
    }

    const { threadId } = event.pathParameters || {};
    
    if (!threadId) {
      return addCorsHeaders({
        statusCode: 400,
        body: JSON.stringify({ error: 'Thread ID is required' })
      });
    }

    // Get all questions for this thread first
    const questionsResult = await dbOperations.query(
      tables.questions,
      'thread_id = :threadId',
      { ':threadId': threadId },
      'ThreadIdIndex'
    );

    const questionIds = (questionsResult.Items || []).map(q => q.id);

    if (questionIds.length === 0) {
      return addCorsHeaders({
        statusCode: 200,
        body: JSON.stringify({})
      });
    }

    // Get answers for all questions
    const answersByQuestion = {};
    
    for (const questionId of questionIds) {
      // Use GSI query with new index name
      const answersResult = await dbOperations.query(
        tables.answers,
        'question_id = :questionId',
        { ':questionId': questionId },
        'QuestionIdIndexV2',
        false // Get newest first, then we'll sort by pinned
      );

      // Sort answers: pinned first, then by creation time
      const sortedAnswers = (answersResult.Items || []).sort((a, b) => {
        // First by pinned status (pinned answers first)
        if (a.is_pinned && !b.is_pinned) return -1;
        if (!a.is_pinned && b.is_pinned) return 1;
        
        // Then by creation time (newest first)
        const timeA = new Date(a.created_at || 0).getTime();
        const timeB = new Date(b.created_at || 0).getTime();
        return timeB - timeA;
      });

      const answers = sortedAnswers.map(answer => ({
        id: answer.id,
        content: answer.content,
        timestamp: answer.created_at || answer.timestamp,
        userId: answer.user_id,
        questionId: answer.question_id,
        isPinned: Boolean(answer.is_pinned),
        isAI: Boolean(answer.is_ai),
        thinking: answer.thinking || null,
        interactionCount: answer.interaction_count || 0
      }));

      if (answers.length > 0) {
        answersByQuestion[questionId] = answers;
      }
    }

    return addCorsHeaders({
      statusCode: 200,
      body: JSON.stringify(answersByQuestion)
    });

  } catch (error) {
    console.error('Get thread answers error:', error);
    return addCorsHeaders({
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Failed to fetch thread answers',
        message: error.message 
      })
    });
  }
};