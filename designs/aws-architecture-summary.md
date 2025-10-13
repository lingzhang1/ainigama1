# AWS Architecture Summary
## Content Discovery System

**Last Updated**: October 13, 2025  
**Architecture**: AWS Lambda + DynamoDB + React Frontend  
**Status**: Implementation Ready

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     FRONTEND (React)                         │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │ Recent   │  │ Trending │  │Recommend │  │ For You  │   │
│  │  Feed    │  │   Feed   │  │   Feed   │  │   Feed   │   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘   │
│       │             │             │             │           │
└───────┼─────────────┼─────────────┼─────────────┼───────────┘
        │             │             │             │
        └─────────────┴─────────────┴─────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    API GATEWAY                               │
│  https://YOUR_API_ID.execute-api.us-east-1.amazonaws.com    │
└────────────────────────┬────────────────────────────────────┘
                         │
        ┌────────────────┼────────────────┐
        │                │                │
        ▼                ▼                ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ AWS LAMBDA   │  │ AWS LAMBDA   │  │ AWS LAMBDA   │
│              │  │              │  │              │
│ Engagement   │  │  Trending    │  │ Recommend    │
│  Tracker     │  │   API        │  │   API        │
│              │  │              │  │              │
│ POST /track  │  │ GET /trending│  │ GET /rec     │
└──────┬───────┘  └──────┬───────┘  └──────┬───────┘
       │                 │                 │
       └─────────────────┴─────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                  DYNAMODB TABLES                             │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │  Likes   │  │  Saves   │  │  Shares  │  │  Views   │   │
│  │  (GSI)   │  │  (GSI)   │  │  (GSI)   │  │  (GSI)   │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                  │
│  │ Thread   │  │   User   │  │  Time    │                  │
│  │ Metrics  │  │  Prefs   │  │ Tracking │                  │
│  │ (Cache)  │  │ (Cache)  │  │          │                  │
│  └──────────┘  └──────────┘  └──────────┘                  │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▲
                          │
┌─────────────────────────┴───────────────────────────────────┐
│             AWS EVENTBRIDGE (Scheduled Rule)                 │
│                  Every 5 minutes                             │
│                         │                                    │
│                         ▼                                    │
│              AWS LAMBDA: Aggregator                          │
│         Updates trending + preferences                       │
└─────────────────────────────────────────────────────────────┘
```

---

## AWS Resources

### DynamoDB Tables (10 total)

| Table Name | Purpose | Indexes | TTL |
|------------|---------|---------|-----|
| `Likes` | Store all like events | ThreadIdIndex, UserIdIndex | 90 days |
| `Saves` | Store all save events | ThreadIdIndex, UserIdIndex | 90 days |
| `Shares` | Store all share events | ThreadIdIndex, UserIdIndex | 90 days |
| `Views` | Store all view events | ThreadIdIndex, UserIdIndex | 30 days |
| `TimeTracking` | Track time spent | UserIdIndex | 90 days |
| `ThreadMetricsCache` | Cached trending scores | TrendingScoreIndex | 15 min |
| `UserPreferences` | Cached user preferences | - | 15 min |
| `UserInteractions` | For recommendations | UserIdIndex, ThreadIdIndex | - |
| `Threads` | Core thread data | PublicThreadsIndex | - |
| `Users` | User profiles | - | - |

**Total Storage (estimated)**:
- Small (1k users, 5k threads): ~100 MB
- Medium (10k users, 50k threads): ~1 GB
- Large (100k users, 500k threads): ~10 GB

### Lambda Functions (6 total)

| Function | Purpose | Timeout | Memory | Trigger |
|----------|---------|---------|--------|---------|
| `trackEngagement` | Unified event tracker | 10s | 256 MB | API Gateway POST |
| `aggregateMetrics` | Update scores/preferences | 300s | 1024 MB | EventBridge (5 min) |
| `getTrendingThreads` | Return trending threads | 30s | 512 MB | API Gateway GET |
| `getRecommendedThreads` | Return personalized feed | 30s | 512 MB | API Gateway GET |
| `getPersonalizedTrending` | Trending in interests | 30s | 512 MB | API Gateway GET |
| `getUserPreferences` | Get user profile | 10s | 256 MB | API Gateway GET |

**Estimated Lambda Costs** (monthly):
- 1k users, 100k requests: ~$2-5
- 10k users, 1M requests: ~$10-20
- 100k users, 10M requests: ~$50-100

### EventBridge Rules (1)

| Rule Name | Schedule | Target | Enabled |
|-----------|----------|--------|---------|
| `aggregateMetricsSchedule` | rate(5 minutes) | aggregateMetrics Lambda | ✅ |

**Cost**: ~$1/month (12 invocations/hour × 24 × 30 = 8,640 invocations)

---

## API Endpoints

### Base URL
```
https://YOUR_API_ID.execute-api.us-east-1.amazonaws.com/dev
```

### Endpoints

#### 1. Engagement Tracking
```http
POST /engagement/track
Content-Type: application/json

{
  "userId": "user-123",
  "threadId": "thread-456",
  "action": "view" | "like" | "save" | "share"
}

Response: { "success": true, "id": "evt_..." }
```

#### 2. Trending Threads
```http
GET /trending/threads?limit=10

Response: {
  "threads": [...],
  "calculatedAt": "2025-10-13T10:00:00Z",
  "algorithm": "v2.0"
}
```

#### 3. Recommended Threads
```http
GET /recommendations/threads?userId=user-123&limit=20&offset=0

Response: {
  "threads": [...],
  "hasMore": true,
  "recommendationType": "personalized" | "cold_start"
}
```

#### 4. Personalized Trending
```http
GET /trending/personalized?userId=user-123&limit=10

Response: {
  "threads": [...],
  "recommendationType": "trending_personalized"
}
```

#### 5. User Preferences
```http
GET /users/user-123/preferences

Response: {
  "userId": "user-123",
  "categoryAffinities": { "tech": 80, "science": 60 },
  "favoriteCreators": ["creator1", "creator2"],
  "totalEngagementScore": 500
}
```

---

## Data Flow

### 1. User Interaction Flow

```
User clicks thread
     │
     ▼
Frontend calls engagementTracker.trackView()
     │
     ▼
POST /engagement/track → Lambda: trackEngagement
     │
     ├─→ Insert into DynamoDB (Likes/Saves/Shares/Views)
     ├─→ Update thread cache counters (atomic increment)
     └─→ Response: { success: true }
     
(Background - every 5 minutes)
     │
EventBridge triggers aggregateMetrics Lambda
     │
     ├─→ Scan all metrics tables
     ├─→ Calculate trending scores
     ├─→ Update ThreadMetricsCache
     ├─→ Calculate user preferences
     └─→ Update UserPreferences
```

### 2. Trending Request Flow

```
User clicks "Trending" tab
     │
     ▼
Frontend calls /trending/threads?limit=10
     │
     ▼
Lambda: getTrendingThreads
     │
     ├─→ Query ThreadMetricsCache (GSI: TrendingScoreIndex)
     ├─→ Sort by trending_score DESC
     ├─→ Enrich with thread + user data
     └─→ Response: { threads: [...] }
     
Response time: ~20-50ms
```

### 3. Recommendation Request Flow

```
User clicks "For You" tab
     │
     ▼
Frontend calls /recommendations/threads?userId=X&limit=20
     │
     ▼
Lambda: getRecommendedThreads
     │
     ├─→ Get UserPreferences from DynamoDB
     │   ├─→ If empty: return trending (cold start)
     │   └─→ If exists: continue
     ├─→ Query user's recent views (last 7 days)
     ├─→ Get all public threads
     ├─→ Filter out recently viewed
     ├─→ Score threads by user preferences
     ├─→ Apply 70/30 split (personalized + exploration)
     ├─→ Enrich with user data
     └─→ Response: { threads: [...], recommendationType: "personalized" }
     
Response time: ~200-500ms
```

---

## Cost Breakdown (Estimated)

### Small Deployment (1,000 users, 5,000 threads)

| Service | Usage | Monthly Cost |
|---------|-------|--------------|
| **DynamoDB** | 100 MB storage, 50k reads, 10k writes | ~$1-2 |
| **Lambda** | 100k invocations, 50k GB-seconds | ~$2-3 |
| **EventBridge** | 8,640 invocations | ~$1 |
| **API Gateway** | 100k requests | ~$0.35 |
| **CloudWatch** | Logs + metrics | ~$1-2 |
| **Total** | | **~$5-10/month** |

### Medium Deployment (10,000 users, 50,000 threads)

| Service | Usage | Monthly Cost |
|---------|-------|--------------|
| **DynamoDB** | 1 GB storage, 500k reads, 100k writes | ~$5-10 |
| **Lambda** | 1M invocations, 500k GB-seconds | ~$10-15 |
| **EventBridge** | 8,640 invocations | ~$1 |
| **API Gateway** | 1M requests | ~$3.50 |
| **CloudWatch** | Logs + metrics | ~$5-10 |
| **Total** | | **~$25-40/month** |

### Large Deployment (100,000 users, 500,000 threads)

| Service | Usage | Monthly Cost |
|---------|-------|--------------|
| **DynamoDB** | 10 GB storage, 5M reads, 1M writes | ~$30-50 |
| **Lambda** | 10M invocations, 5M GB-seconds | ~$50-80 |
| **EventBridge** | 8,640 invocations | ~$1 |
| **API Gateway** | 10M requests | ~$35 |
| **CloudWatch** | Logs + metrics | ~$20-30 |
| **Total** | | **~$140-200/month** |

**Cost Optimization Tips**:
- Use DynamoDB on-demand (PAY_PER_REQUEST) initially
- Switch to provisioned capacity when usage is predictable (20-30% savings)
- Enable Lambda reserved concurrency to avoid over-provisioning
- Implement CloudWatch Logs retention (7-30 days instead of forever)
- Use S3 for long-term log archival

---

## Deployment Commands

### Initial Deployment

```bash
# 1. Set up AWS credentials
aws configure

# 2. Install dependencies
cd infrastructure/aws
npm install

# 3. Deploy everything
serverless deploy

# 4. Note the API Gateway URL
# Output: endpoints:
#   POST - https://abc123.execute-api.us-east-1.amazonaws.com/dev/engagement/track
#   GET  - https://abc123.execute-api.us-east-1.amazonaws.com/dev/trending/threads
#   ...

# 5. Update frontend .env
echo "VITE_API_URL=https://abc123.execute-api.us-east-1.amazonaws.com/dev" > ../../.env

# 6. Build and deploy frontend
cd ../..
npm run build
# Deploy dist/ to S3, Vercel, Netlify, etc.
```

### Update Deployment

```bash
# Update Lambda code only (fast)
serverless deploy function -f trackEngagement

# Update infrastructure (slower)
serverless deploy

# Remove a function
serverless remove function -f oldFunction

# Full teardown (careful!)
serverless remove
```

---

## Monitoring & Operations

### CloudWatch Dashboard Widgets

1. **Lambda Metrics**:
   - Invocations (all functions)
   - Duration (p50, p95, p99)
   - Errors
   - Throttles
   - Cold starts

2. **DynamoDB Metrics**:
   - Consumed read/write capacity
   - Throttled requests
   - System errors
   - Conditional check failures

3. **API Gateway Metrics**:
   - Request count
   - 4xx/5xx errors
   - Latency (p50, p95, p99)

### Key CloudWatch Logs

```bash
# Aggregation job logs
aws logs tail /aws/lambda/ainigama-backend-dev-aggregateMetrics --follow

# Tracking logs
aws logs tail /aws/lambda/ainigama-backend-dev-trackEngagement --follow

# Search for errors
aws logs filter-log-events \
  --log-group-name /aws/lambda/ainigama-backend-dev-aggregateMetrics \
  --filter-pattern "ERROR"
```

### Alarms to Configure

```yaml
# In serverless.yml
custom:
  alerts:
    stages:
      - dev
      - prod
    topics:
      alarm:
        topic: ${self:service}-${self:provider.stage}-alerts
        notifications:
          - protocol: email
            endpoint: alerts@yourcompany.com
    alarms:
      - functionErrors:
          threshold: 10
          period: 300
      - functionDuration:
          threshold: 30000
      - functionThrottles:
          threshold: 5
```

---

## Security Considerations

### IAM Permissions

Lambda execution role needs:
- DynamoDB: `GetItem`, `PutItem`, `Query`, `Scan`, `UpdateItem`
- CloudWatch: `PutMetricData`, `CreateLogGroup`, `CreateLogStream`, `PutLogEvents`
- X-Ray: `PutTraceSegments`, `PutTelemetryRecords` (if tracing enabled)

### API Gateway Security

```yaml
# Add API key (optional)
provider:
  apiGateway:
    apiKeys:
      - name: ainigama-api-key
        value: ${env:API_KEY}
    usagePlan:
      quota:
        limit: 100000
        period: DAY
      throttle:
        burstLimit: 200
        rateLimit: 100
```

### DynamoDB Security

- Enable point-in-time recovery (PITR)
- Enable encryption at rest (default)
- Use VPC endpoints (if in VPC)
- Set up backup plans

```bash
# Enable PITR
aws dynamodb update-continuous-backups \
  --table-name ainigama-dev-likes \
  --point-in-time-recovery-specification PointInTimeRecoveryEnabled=true
```

---

## Disaster Recovery

### Backup Strategy

**DynamoDB**:
- Point-in-time recovery: 35-day window
- On-demand backups: Before major deployments
- Cross-region replication: Optional for critical data

```bash
# Create backup
aws dynamodb create-backup \
  --table-name ainigama-dev-likes \
  --backup-name ainigama-likes-backup-$(date +%Y%m%d)

# Restore from backup
aws dynamodb restore-table-from-backup \
  --target-table-name ainigama-dev-likes-restored \
  --backup-arn BACKUP_ARN
```

**Lambda**:
- Code stored in S3 automatically
- Versions enabled by default
- Can rollback via serverless.yml git history

### Recovery Procedures

**Scenario 1: Bad deployment**
```bash
# Rollback to previous version
git checkout PREVIOUS_COMMIT
cd infrastructure/aws
serverless deploy
```

**Scenario 2: Data corruption**
```bash
# Restore DynamoDB table from backup
aws dynamodb restore-table-from-backup \
  --target-table-name TABLE_NAME_RESTORED \
  --backup-arn BACKUP_ARN

# Update Lambda to use restored table
# Update serverless.yml environment variables
serverless deploy
```

**Scenario 3: Lambda function failure**
```bash
# Check dead letter queue
aws sqs receive-message --queue-url DLQ_URL

# Reprocess failed events
# (implement reprocessing Lambda)
```

---

## Performance Optimization

### Lambda Optimization

1. **Memory Tuning**:
   ```bash
   # Test different memory sizes
   for mem in 256 512 1024; do
     aws lambda update-function-configuration \
       --function-name FUNCTION_NAME \
       --memory-size $mem
     # Run load test
     # Measure duration and cost
   done
   ```

2. **Provisioned Concurrency** (for critical functions):
   ```yaml
   functions:
     getTrendingThreads:
       provisionedConcurrency: 5  # Keep 5 warm instances
   ```

3. **VPC Configuration** (if needed):
   ```yaml
   provider:
     vpc:
       securityGroupIds:
         - sg-xxxxx
       subnetIds:
         - subnet-xxxxx
         - subnet-yyyyy
   ```

### DynamoDB Optimization

1. **Indexes**: Only create indexes you actually query
2. **Batch Operations**: Use `BatchGetItem` and `BatchWriteItem`
3. **Projection**: Use `KEYS_ONLY` or `INCLUDE` instead of `ALL` when possible
4. **TTL**: Clean up old data automatically

```javascript
// Batch write example
const items = [...]; // Up to 25 items
await dynamodb.batchWrite({
  RequestItems: {
    [tableName]: items.map(item => ({
      PutRequest: { Item: item }
    }))
  }
}).promise();
```

---

## Maintenance Runbook

### Daily Tasks

- [ ] Check CloudWatch alarms
- [ ] Review error logs for anomalies
- [ ] Monitor API response times
- [ ] Check EventBridge rule execution

### Weekly Tasks

- [ ] Review cost trends in Cost Explorer
- [ ] Analyze user engagement metrics
- [ ] Check recommendation quality (manual sampling)
- [ ] Verify backup retention

### Monthly Tasks

- [ ] Review and optimize Lambda memory settings
- [ ] Analyze DynamoDB capacity patterns
- [ ] Consider switching to provisioned capacity if steady
- [ ] Review and tune algorithm weights
- [ ] Update documentation

### Quarterly Tasks

- [ ] Disaster recovery drill
- [ ] Security audit (IAM roles, API keys)
- [ ] Cost optimization review
- [ ] Feature enhancement planning

---

## Common Issues & Solutions

### High Lambda Costs

**Check**:
```bash
# Find most expensive functions
aws ce get-cost-and-usage \
  --time-period Start=2025-10-01,End=2025-10-31 \
  --granularity MONTHLY \
  --metrics BlendedCost \
  --group-by Type=DIMENSION,Key=SERVICE
```

**Solutions**:
- Reduce aggregation frequency (5 min → 10 min)
- Optimize Lambda memory (over-provisioning wastes money)
- Implement caching to reduce invocations
- Use provisioned concurrency only if needed

### Slow Recommendations

**Check**:
```bash
# View Lambda duration metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Duration \
  --dimensions Name=FunctionName,Value=ainigama-backend-dev-getRecommendedThreads \
  --start-time 2025-10-13T00:00:00Z \
  --end-time 2025-10-13T23:59:59Z \
  --period 3600 \
  --statistics Average,Maximum
```

**Solutions**:
- Increase Lambda memory (improves CPU)
- Optimize DynamoDB queries (use projection expressions)
- Implement result caching
- Reduce data fetched per request

### DynamoDB Throttling

**Check**:
```bash
aws cloudwatch get-metric-statistics \
  --namespace AWS/DynamoDB \
  --metric-name UserErrors \
  --dimensions Name=TableName,Value=ainigama-dev-likes
```

**Solutions**:
- Already using PAY_PER_REQUEST (should auto-scale)
- Check for hot partition keys
- Implement exponential backoff in Lambda
- Consider distributing writes across time

---

## Reference Documentation

1. **Design Documents** (this folder):
   - [unified-content-discovery-system.md](./unified-content-discovery-system.md) - Complete system design
   - [CONTENT-DISCOVERY-README.md](./CONTENT-DISCOVERY-README.md) - Navigation guide
   - [aws-implementation-checklist.md](./aws-implementation-checklist.md) - Step-by-step checklist

2. **AWS Documentation**:
   - [DynamoDB Best Practices](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/best-practices.html)
   - [Lambda Best Practices](https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html)
   - [API Gateway Optimization](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-request-throttling.html)

3. **Implementation Files**:
   - `infrastructure/aws/serverless.yml` - Infrastructure as code
   - `infrastructure/aws/src/handlers/unifiedEngagement.js` - Tracking + aggregation
   - `src/services/engagementTracker.ts` - Frontend service
   - `src/constants/weights.ts` - Weight configuration

---

**Document Version**: 1.0  
**Architecture**: AWS Lambda + DynamoDB + React  
**Last Updated**: October 13, 2025  
**Status**: Production Ready 🚀

