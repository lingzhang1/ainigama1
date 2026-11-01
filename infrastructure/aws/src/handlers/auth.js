const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { addCorsHeaders, handleOptionsRequest } = require('../utils/cors');
const { tables, dbOperations, parseRequestBody } = require('../utils/db');

// Check if user exists
exports.checkUserExists = async (event) => {
  try {
    console.log('checkUserExists called with method:', event.httpMethod);
    
    // Handle preflight OPTIONS request
    if (event.httpMethod === 'OPTIONS') {
      console.log('Handling OPTIONS request');
      return handleOptionsRequest();
    }

    const requestBody = parseRequestBody(event.body);
    const { email } = requestBody;
    
    if (!email) {
      return addCorsHeaders({
        statusCode: 400,
        body: JSON.stringify({ error: 'Email is required' })
      });
    }

    const result = await dbOperations.scan(
      tables.users,
      'email = :email',
      { ':email': email.toLowerCase() }
    );

    return addCorsHeaders({
      statusCode: 200,
      body: JSON.stringify({ exists: result.Items.length > 0 })
    });
  } catch (error) {
    console.error('Check user exists error:', error);
    return addCorsHeaders({
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Failed to check user existence',
        message: error.message 
      })
    });
  }
};

// User registration
exports.registerUser = async (event) => {
  try {
    console.log('registerUser called with method:', event.httpMethod);
    
    // Handle preflight OPTIONS request
    if (event.httpMethod === 'OPTIONS') {
      console.log('Handling OPTIONS request');
      return handleOptionsRequest();
    }

    const requestBody = parseRequestBody(event.body);
    const { name, email, alias, password } = requestBody;
    
    if (!name || !email || !alias || !password) {
      return addCorsHeaders({
        statusCode: 400,
        body: JSON.stringify({ error: 'All fields are required' })
      });
    }
    
    if (password.length < 6) {
      return addCorsHeaders({
        statusCode: 400,
        body: JSON.stringify({ error: 'Password must be at least 6 characters' })
      });
    }

    // Check if user already exists
    const existingUser = await dbOperations.scan(
      tables.users,
      'email = :email OR alias = :alias',
      {
        ':email': email.toLowerCase(),
        ':alias': alias.toLowerCase()
      }
    );
    
    if (existingUser.Items.length > 0) {
      return addCorsHeaders({
        statusCode: 400,
        body: JSON.stringify({ error: 'User with this email or username already exists' })
      });
    }
    
    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);
    
    // Create user
    const userId = crypto.randomUUID();
    const handle = `@${alias}`;
    const now = new Date().toISOString();
    
    const user = {
      id: userId,
      name,
      email: email.toLowerCase(),
      alias: alias.toLowerCase(),
      password_hash: passwordHash,
      avatar: '/img-5.svg',
      handle,
      created_at: now,
      updated_at: now
    };

    await dbOperations.put(tables.users, user);
    
    // Return user data (without password hash)
    const userData = {
      id: userId,
      name,
      email: email.toLowerCase(),
      alias: alias.toLowerCase(),
      avatar: '/img-5.svg',
      handle
    };
    
    console.log('✅ User registered successfully:', email);
    
    return addCorsHeaders({
      statusCode: 200,
      body: JSON.stringify({ user: userData })
    });
  } catch (error) {
    console.error('Registration error:', error);
    return addCorsHeaders({
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Registration failed',
        message: error.message 
      })
    });
  }
};

// User login
exports.loginUser = async (event) => {
  try {
    console.log('loginUser called with method:', event.httpMethod);
    
    // Handle preflight OPTIONS request
    if (event.httpMethod === 'OPTIONS') {
      console.log('Handling OPTIONS request');
      return handleOptionsRequest();
    }

    const requestBody = parseRequestBody(event.body);
    const { email, password } = requestBody;
    
    if (!email || !password) {
      return addCorsHeaders({
        statusCode: 400,
        body: JSON.stringify({ error: 'Email and password are required' })
      });
    }

    // Find user by email
    const result = await dbOperations.scan(
      tables.users,
      'email = :email',
      { ':email': email.toLowerCase() }
    );
    
    if (result.Items.length === 0) {
      return addCorsHeaders({
        statusCode: 401,
        body: JSON.stringify({ error: 'Invalid email or password' })
      });
    }
    
    const user = result.Items[0];
    
    // Verify password
    const passwordValid = await bcrypt.compare(password, user.password_hash);
    if (!passwordValid) {
      return addCorsHeaders({
        statusCode: 401,
        body: JSON.stringify({ error: 'Invalid email or password' })
      });
    }
    
    // Return user data (without password hash)
    const userData = {
      id: user.id,
      name: user.name,
      email: user.email,
      alias: user.alias,
      avatar: user.avatar,
      handle: user.handle
    };
    
    console.log('✅ User logged in successfully:', email);
    
    return addCorsHeaders({
      statusCode: 200,
      body: JSON.stringify({ user: userData })
    });
  } catch (error) {
    console.error('Login error:', error);
    return addCorsHeaders({
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Login failed',
        message: error.message 
      })
    });
  }
};

// Check alias availability
exports.checkAlias = async (event) => {
  try {
    console.log('checkAlias called with method:', event.httpMethod);
    
    // Handle preflight OPTIONS request
    if (event.httpMethod === 'OPTIONS') {
      console.log('Handling OPTIONS request');
      return handleOptionsRequest();
    }

    const { alias } = event.pathParameters || {};
    
    if (!alias || alias.length < 3) {
      return addCorsHeaders({
        statusCode: 400,
        body: JSON.stringify({ error: 'Alias must be at least 3 characters' })
      });
    }
    
    if (!/^[a-z0-9_]+$/.test(alias)) {
      return addCorsHeaders({
        statusCode: 400,
        body: JSON.stringify({ error: 'Alias can only contain lowercase letters, numbers, and underscores' })
      });
    }

    const result = await dbOperations.scan(
      tables.users,
      'alias = :alias',
      { ':alias': alias }
    );

    return addCorsHeaders({
      statusCode: 200,
      body: JSON.stringify({ available: result.Items.length === 0 })
    });
  } catch (error) {
    console.error('Check alias error:', error);
    return addCorsHeaders({
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Failed to check alias availability',
        message: error.message 
      })
    });
  }
};

// Get user by ID
exports.getUserById = async (event) => {
  try {
    console.log('getUserById called with method:', event.httpMethod);
    
    // Handle preflight OPTIONS request
    if (event.httpMethod === 'OPTIONS') {
      console.log('Handling OPTIONS request');
      return handleOptionsRequest();
    }

    const { userId } = event.pathParameters || {};
    
    if (!userId) {
      return addCorsHeaders({
        statusCode: 400,
        body: JSON.stringify({ error: 'User ID is required' })
      });
    }

    const result = await dbOperations.get(tables.users, { id: userId });

    if (!result.Item) {
      return addCorsHeaders({
        statusCode: 404,
        body: JSON.stringify({ error: 'User not found' })
      });
    }

    // Return user data (without password hash)
    const userData = {
      id: result.Item.id,
      name: result.Item.name,
      email: result.Item.email,
      alias: result.Item.alias,
      avatar: result.Item.avatar,
      handle: result.Item.handle
    };

    return addCorsHeaders({
      statusCode: 200,
      body: JSON.stringify(userData)
    });

  } catch (error) {
    console.error('Get user by ID error:', error);
    return addCorsHeaders({
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Failed to fetch user',
        message: error.message 
      })
    });
  }
};