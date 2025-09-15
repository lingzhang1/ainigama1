const crypto = require('crypto');

// Generate a secure random JWT secret
const generateJWTSecret = () => {
  return crypto.randomBytes(64).toString('hex');
};

console.log('Generated JWT Secret:');
console.log(generateJWTSecret());
console.log('\nCopy this value to your .env file as JWT_SECRET=<generated_value>');