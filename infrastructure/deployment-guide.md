# Ainigama Backend Deployment Guide

## 🚀 Deployment Options

### Option 1: AWS Serverless (Recommended for Production)

#### Prerequisites
- AWS CLI installed and configured
- Node.js 18+ installed
- Serverless Framework installed: `npm install -g serverless`

#### Steps
1. **Navigate to AWS infrastructure**:
   ```bash
   cd infrastructure/aws
   npm install
   ```

2. **Set environment variables**:
   ```bash
   export DEEPSEEK_API_KEY=your_deepseek_api_key
   ```

3. **Deploy to AWS**:
   ```bash
   # Deploy to development
   npm run deploy:dev
   
   # Deploy to production
   npm run deploy:prod
   ```

4. **Update frontend environment**:
   - Copy the WebSocket URI from deployment output
   - Update `.env` in your frontend:
   ```
   VITE_WEBSOCKET_URL=wss://your-api-id.execute-api.region.amazonaws.com/dev
   VITE_API_URL=https://your-api-id.execute-api.region.amazonaws.com/dev
   ```

#### AWS Services Used
- **API Gateway**: WebSocket and REST API
- **Lambda**: Serverless functions
- **DynamoDB**: NoSQL database
- **Cognito**: User authentication
- **CloudFormation**: Infrastructure as code

---

### Option 2: Supabase (Easiest Setup)

#### Prerequisites
- Supabase account
- Supabase CLI installed

#### Steps
1. **Create Supabase project**:
   - Go to [supabase.com](https://supabase.com)
   - Create new project
   - Note your project URL and anon key

2. **Set up database**:
   ```bash
   cd infrastructure/supabase
   supabase db reset
   ```

3. **Update frontend environment**:
   ```
   VITE_SUPABASE_URL=your_supabase_project_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

4. **Update frontend to use Supabase**:
   - Install Supabase client: `npm install @supabase/supabase-js`
   - Replace AWS service calls with Supabase calls

#### Supabase Features Used
- **Database**: PostgreSQL with RLS
- **Auth**: Built-in authentication
- **Realtime**: WebSocket subscriptions
- **Edge Functions**: Serverless functions

---

### Option 3: Node.js Server (Development/Self-hosted)

#### Prerequisites
- Node.js 18+ installed
- PM2 for production (optional): `npm install -g pm2`

#### Steps
1. **Navigate to Node.js server**:
   ```bash
   cd infrastructure/nodejs-server
   npm install
   ```

2. **Set up environment**:
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Run in development**:
   ```bash
   npm run dev
   ```

4. **Run in production**:
   ```bash
   # With PM2
   pm2 start server.js --name ainigama-server
   
   # Or directly
   npm start
   ```

5. **Update frontend environment**:
   ```
   VITE_WEBSOCKET_URL=ws://localhost:3001
   VITE_API_URL=http://localhost:3001/api
   ```

#### Features
- **SQLite**: Local database
- **Socket.io**: WebSocket connections
- **Express**: REST API
- **JWT**: Authentication

---

## 🔧 Frontend Integration

### Update WebSocket Service
```typescript
// src/services/websocket.ts
const wsUrl = import.meta.env.VITE_WEBSOCKET_URL || 'ws://localhost:3001';
```

### Update API Service
```typescript
// src/services/api.ts
const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
```

### Environment Variables
Create `.env` in your frontend root:
```
# Choose one based on your deployment option

# Option 1: AWS
VITE_WEBSOCKET_URL=wss://your-api-id.execute-api.region.amazonaws.com/dev
VITE_API_URL=https://your-api-id.execute-api.region.amazonaws.com/dev

# Option 2: Supabase
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

# Option 3: Node.js Server
VITE_WEBSOCKET_URL=ws://localhost:3001
VITE_API_URL=http://localhost:3001/api

# DeepSeek API (required for all options)
VITE_DEEPSEEK_API_KEY=your_deepseek_api_key
```

---

## 🎯 Recommended Deployment Path

### For Development
1. Start with **Node.js Server** (Option 3)
2. Quick setup and local development
3. Easy debugging and testing

### For Production
1. Use **AWS Serverless** (Option 1) for scalability
2. Or **Supabase** (Option 2) for simplicity
3. Both handle scaling automatically

---

## 📊 Cost Comparison

### AWS Serverless
- **Free tier**: 1M requests/month
- **Pay per use**: $0.20 per 1M requests
- **DynamoDB**: $0.25 per GB/month

### Supabase
- **Free tier**: 50,000 monthly active users
- **Pro**: $25/month per project
- **Includes**: Database, Auth, Storage, Edge Functions

### Node.js Server
- **VPS**: $5-20/month (DigitalOcean, Linode)
- **Self-managed**: Requires maintenance
- **Fixed cost**: Predictable pricing

---

## 🔒 Security Considerations

### All Options
- Use HTTPS/WSS in production
- Set up proper CORS policies
- Implement rate limiting
- Use environment variables for secrets

### AWS Specific
- Configure IAM roles properly
- Enable CloudTrail for auditing
- Use VPC for network isolation

### Supabase Specific
- Configure Row Level Security (RLS)
- Set up proper auth policies
- Use service role key securely

### Node.js Specific
- Use helmet.js for security headers
- Implement JWT properly
- Set up reverse proxy (nginx)
- Use PM2 for process management

Choose the option that best fits your needs, budget, and technical requirements!