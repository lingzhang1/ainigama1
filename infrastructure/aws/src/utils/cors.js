// CORS utilities for AWS Lambda functions

// Comprehensive CORS headers for all origins
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Access-Control-Max-Age': '86400',
  'Access-Control-Allow-Credentials': 'false'
};

// Helper function to add CORS headers to all responses
const addCorsHeaders = (response) => {
  console.log('Adding CORS headers:', corsHeaders);
  return {
    ...response,
    headers: {
      ...corsHeaders,
      ...(response.headers || {}),
      'Content-Type': 'application/json'
    }
  };
};

// Handle preflight OPTIONS requests
const handleOptionsRequest = () => {
  console.log('Handling OPTIONS request with CORS headers');
  return addCorsHeaders({
    statusCode: 200,
    body: ''
  });
};

module.exports = {
  corsHeaders,
  addCorsHeaders,
  handleOptionsRequest
};