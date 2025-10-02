// Simple test handler to verify Lambda is working
const { addCorsHeaders, handleOptionsRequest } = require('../utils/cors');

exports.testHandler = async (event) => {
  console.log('Test handler called with event:', JSON.stringify(event, null, 2));
  
  try {
    // Handle preflight OPTIONS request
    if (event.httpMethod === 'OPTIONS') {
      console.log('Handling OPTIONS request');
      return handleOptionsRequest();
    }

    console.log('Returning test response');
    
    return addCorsHeaders({
      statusCode: 200,
      body: JSON.stringify({
        message: 'Test handler working!',
        timestamp: new Date().toISOString(),
        event: {
          httpMethod: event.httpMethod,
          path: event.path,
          headers: event.headers
        }
      })
    });

  } catch (error) {
    console.error('Test handler error:', error);
    return addCorsHeaders({
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Test handler failed',
        message: error.message,
        stack: error.stack
      })
    });
  }
};