# AWS Implementation Checklist
## Unified Content Discovery System Deployment

**Target Architecture**: AWS Lambda + DynamoDB + React Frontend  
**Deployment Guide**: Step-by-step checklist for implementing the unified system

---

## Pre-Deployment Checklist

### Prerequisites

- [ ] AWS account with appropriate permissions
- [ ] Serverless Framework installed (`npm install -g serverless`)
- [ ] AWS CLI configured (`aws configure`)
- [ ] Current system documented and backed up
- [ ] Read [unified-content-discovery-system.md](./unified-content-discovery-system.md)

### Environment Setup

- [ ] Environment variables configured:
  ```bash
  export AWS_REGION=us-east-1
  export STAGE=dev  # or prod
  ```

- [ ] Review current DynamoDB tables:
  ```bash
  aws dynamodb list-tables
  ```

---

## Phase 1: DynamoDB Tables (Day 1)

### 1.1 Update serverless.yml

**File**: `infrastructure/aws/serverless.yml`

- [ ] Add environment variables:
  ```yaml
  DYNAMODB_TABLE_THREAD_METRICS_CACHE: ${self:service}-${self:provider.stage}-thread-metrics-cache
  DYNAMODB_TABLE_TIME_TRACKING: ${self:service}-${self:provider.stage}-time-tracking
  ```

- [ ] Add IAM permissions:
  ```yaml
  - "arn:aws:dynamodb:${self:provider.region}:*:table/${self:provider.environment.DYNAMODB_TABLE_THREAD_METRICS_CACHE}"
  - "arn:aws:dynamodb:${self:provider.region}:*:table/${self:provider.environment.DYNAMODB_TABLE_THREAD_METRICS_CACHE}/index/*"
  - "arn:aws:dynamodb:${self:provider.region}:*:table/${self:provider.environment.DYNAMODB_TABLE_TIME_TRACKING}"
  - "arn:aws:dynamodb:${self:provider.region}:*:table/${self:provider.environment.DYNAMODB_TABLE_TIME_TRACKING}/index/*"
  ```

- [ ] Add table definitions in `resources.Resources` section:
  ```yaml
  ThreadMetricsCache:
    Type: AWS::DynamoDB::Table
    # ... (copy from unified design doc)
  
  TimeTrackingTable:
    Type: AWS::DynamoDB::Table
    # ... (copy from unified design doc)
  ```

### 1.2 Deploy Tables

```bash
cd infrastructure/aws
serverless deploy
```

**Expected output**:
```
✔ Service deployed to stack ainigama-backend-dev
✔ New tables created:
  - ainigama-dev-thread-metrics-cache
  - ainigama-dev-time-tracking
```

### 1.3 Verify Tables

- [ ] Check tables exist:
  ```bash
  aws dynamodb describe-table --table-name ainigama-dev-thread-metrics-cache
  aws dynamodb describe-table --table-name ainigama-dev-time-tracking
  ```

- [ ] Verify indexes:
  ```bash
  aws dynamodb describe-table --table-name ainigama-dev-thread-metrics-cache \
    --query 'Table.GlobalSecondaryIndexes[*].IndexName'
  ```

**Expected**: `["TrendingScoreIndex"]`

---

## Phase 2: Lambda Functions (Day 2-3)

### 2.1 Create Handler Files

- [ ] Create `infrastructure/aws/src/handlers/unifiedEngagement.js`
  - Copy code from unified design doc, Section: "Shared Infrastructure"
  - Implement `trackEngagement` function
  - Implement `aggregateMetrics` function

- [ ] Create `infrastructure/aws/src/handlers/personalizedTrending.js`
  - Copy code from unified design doc, Section: "Cross-System Features"
  - Implement `getPersonalizedTrending` function

- [ ] Update `infrastructure/aws/src/utils/db.js`:
  ```javascript
  const tables = {
    // ... existing ...
    threadMetricsCache: process.env.DYNAMODB_TABLE_THREAD_METRICS_CACHE,
    timeTracking: process.env.DYNAMODB_TABLE_TIME_TRACKING
  };
  ```

### 2.2 Update serverless.yml Functions

- [ ] Add Lambda function definitions:
  ```yaml
  trackEngagement:
    handler: src/handlers/unifiedEngagement.trackEngagement
    events:
      - http:
          path: /engagement/track
          method: post
          cors: true
  
  aggregateMetrics:
    handler: src/handlers/unifiedEngagement.aggregateMetrics
    timeout: 300
    events:
      - schedule:
          rate: rate(5 minutes)
          enabled: true
  
  getPersonalizedTrending:
    handler: src/handlers/personalizedTrending.getPersonalizedTrending
    events:
      - http:
          path: /trending/personalized
          method: get
          cors: true
  ```

### 2.3 Deploy Lambda Functions

- [ ] Deploy:
  ```bash
  cd infrastructure/aws
  serverless deploy
  ```

- [ ] Verify deployment:
  ```bash
  aws lambda list-functions | grep trackEngagement
  aws lambda list-functions | grep aggregateMetrics
  aws lambda list-functions | grep getPersonalizedTrending
  ```

### 2.4 Test Lambda Functions

- [ ] Test engagement tracking:
  ```bash
  curl -X POST https://YOUR_API_URL/dev/engagement/track \
    -H "Content-Type: application/json" \
    -d '{
      "userId": "test-user-1",
      "threadId": "test-thread-1",
      "action": "view"
    }'
  ```
  **Expected**: `{"success": true, "id": "..."}`

- [ ] Manually invoke aggregation:
  ```bash
  aws lambda invoke \
    --function-name ainigama-backend-dev-aggregateMetrics \
    --payload '{}' \
    response.json
  ```

- [ ] Check CloudWatch logs:
  ```bash
  aws logs tail /aws/lambda/ainigama-backend-dev-aggregateMetrics --follow
  ```

- [ ] Verify EventBridge rule:
  ```bash
  aws events list-rules | grep aggregateMetrics
  ```

---

## Phase 3: Frontend Integration (Day 4-5)

### 3.1 Create Frontend Service

- [ ] Create `src/constants/weights.ts`:
  ```typescript
  export const ENGAGEMENT_WEIGHTS = {
    // ... (copy from unified design)
  };
  ```

- [ ] Create `src/services/engagementTracker.ts`:
  ```typescript
  // Copy from unified design doc
  export class EngagementTracker { ... }
  export const engagementTracker = new EngagementTracker();
  ```

### 3.2 Update Existing Tracking Calls

- [ ] Find all tracking calls:
  ```bash
  grep -r "trackView\|trackThreadView\|metricsService" src/
  ```

- [ ] Replace with unified tracker:
  ```typescript
  // OLD:
  await metricsService.trackView(threadId, userId);
  await trackThreadView(threadId, userId);
  
  // NEW:
  await engagementTracker.trackView(userId, threadId);
  ```

**Files to update**:
- [ ] `src/components/ForumFeed/ForumFeed.tsx`
- [ ] `src/components/PublicThread/PublicThread.tsx`
- [ ] Any other components tracking engagement

### 3.3 Add New Feed Tabs (Optional)

- [ ] Update `FeedFilter` type:
  ```typescript
  export type FeedFilter = 'recent' | 'trending' | 'recommended' | 'for-you' | 'discovery';
  ```

- [ ] Add "For You" button in ForumFeed:
  ```tsx
  <button
    onClick={() => dispatch({ type: 'SET_FEED_FILTER', payload: 'for-you' })}
    title="Trending in Your Interests"
  >
    <TrendingUpIcon /> <SparklesIcon />
  </button>
  ```

### 3.4 Build & Deploy Frontend

- [ ] Install dependencies:
  ```bash
  npm install
  ```

- [ ] Build:
  ```bash
  npm run build
  ```

- [ ] Deploy to hosting:
  ```bash
  # Upload dist/ to S3, Vercel, Netlify, etc.
  ```

---

## Phase 4: Verification & Testing (Day 6-7)

### 4.1 Functional Testing

- [ ] **Test 1: Engagement Tracking**
  - Open browser DevTools > Network
  - Perform actions (view, like, save thread)
  - Verify POST to `/engagement/track` succeeds
  - Check DynamoDB tables have new entries

- [ ] **Test 2: Trending**
  - Navigate to trending tab
  - Verify threads show with scores
  - Check response time < 100ms

- [ ] **Test 3: Recommendations (Cold Start)**
  - Login as new user (no interactions)
  - Click recommendation icon
  - Verify trending threads shown
  - Check `recommendationType: 'cold_start'`

- [ ] **Test 4: Recommendations (Personalized)**
  - Interact with 5+ threads
  - Wait 5 minutes for aggregation
  - Click recommendation icon
  - Verify personalized threads
  - Check `recommendationType: 'personalized'`

- [ ] **Test 5: Personalized Trending** (if implemented)
  - Navigate to "For You" tab
  - Verify trending threads filtered by preferences

### 4.2 Performance Testing

- [ ] Check API response times:
  ```bash
  # Trending
  time curl https://YOUR_API_URL/dev/trending/threads?limit=10
  # Target: < 100ms
  
  # Recommendations
  time curl https://YOUR_API_URL/dev/recommendations/threads?userId=USER_ID&limit=20
  # Target: < 500ms
  ```

- [ ] Monitor aggregation job:
  ```bash
  # Check EventBridge rule
  aws events list-rule-names-by-target \
    --target-arn arn:aws:lambda:REGION:ACCOUNT:function:ainigama-backend-dev-aggregateMetrics
  
  # Check execution logs
  aws logs filter-log-events \
    --log-group-name /aws/lambda/ainigama-backend-dev-aggregateMetrics \
    --start-time $(date -u -d '10 minutes ago' +%s)000
  ```

- [ ] Review CloudWatch metrics:
  - Lambda duration
  - Lambda errors
  - DynamoDB consumed capacity
  - API Gateway 4xx/5xx rates

### 4.3 Load Testing (Optional)

- [ ] Simulate concurrent users:
  ```bash
  # Use Artillery, k6, or similar
  artillery quick --count 100 --num 10 https://YOUR_API_URL/dev/trending/threads
  ```

- [ ] Monitor:
  - Lambda throttling
  - DynamoDB throttling
  - API Gateway latency

---

## Phase 5: Monitoring Setup (Day 7)

### 5.1 CloudWatch Dashboards

- [ ] Create dashboard:
  ```bash
  aws cloudwatch put-dashboard \
    --dashboard-name AinigamaContentDiscovery \
    --dashboard-body file://cloudwatch-dashboard.json
  ```

- [ ] Add widgets:
  - Lambda invocations (all functions)
  - Lambda duration (p50, p95, p99)
  - Lambda errors
  - DynamoDB read/write capacity
  - API Gateway requests

### 5.2 CloudWatch Alarms

- [ ] Create alarms:
  ```bash
  # Lambda errors
  aws cloudwatch put-metric-alarm \
    --alarm-name ainigama-lambda-errors \
    --metric-name Errors \
    --namespace AWS/Lambda \
    --statistic Sum \
    --period 300 \
    --threshold 10 \
    --comparison-operator GreaterThanThreshold
  
  # Lambda duration
  aws cloudwatch put-metric-alarm \
    --alarm-name ainigama-lambda-duration \
    --metric-name Duration \
    --namespace AWS/Lambda \
    --statistic Average \
    --period 300 \
    --threshold 30000 \
    --comparison-operator GreaterThanThreshold
  ```

- [ ] Set up SNS notifications:
  ```bash
  aws sns create-topic --name ainigama-alerts
  aws sns subscribe --topic-arn TOPIC_ARN --protocol email --notification-endpoint your@email.com
  ```

### 5.3 X-Ray Tracing (Optional)

- [ ] Enable X-Ray in serverless.yml:
  ```yaml
  provider:
    tracing:
      lambda: true
      apiGateway: true
  ```

- [ ] View traces:
  ```bash
  # In AWS Console: X-Ray > Traces
  # Or use CLI:
  aws xray get-trace-summaries --start-time START --end-time END
  ```

---

## Phase 6: Optimization (Week 2+)

### 6.1 Performance Tuning

- [ ] Analyze CloudWatch metrics
- [ ] Adjust Lambda memory (128MB → 512MB if needed)
- [ ] Enable Lambda provisioned concurrency (if cold starts are issue)
- [ ] Optimize DynamoDB indexes

### 6.2 Cost Optimization

- [ ] Review AWS Cost Explorer
- [ ] Check DynamoDB capacity:
  ```bash
  aws dynamodb describe-table --table-name TABLE_NAME \
    --query 'Table.BillingModeSummary'
  ```
- [ ] Consider reserved capacity if predictable load
- [ ] Set up DynamoDB auto-scaling (if using provisioned)

### 6.3 A/B Testing

- [ ] Implement feature flags in Lambda:
  ```javascript
  const ALGORITHM_VERSION = process.env.ALGORITHM_VERSION || 'v2';
  ```

- [ ] Test algorithm variants:
  - Different weight configurations
  - Different 70/30 ratios
  - Different cache TTLs

- [ ] Measure impact:
  - Click-through rate
  - User engagement time
  - Retention rates

---

## Phase 7: Cleanup (Week 3)

### 7.1 Remove Old Infrastructure (If Applicable)

- [ ] Disable Node.js server endpoints
- [ ] Archive old data
- [ ] Remove old Lambda functions (if any)
- [ ] Clean up unused DynamoDB tables

### 7.2 Update Documentation

- [ ] Update API documentation
- [ ] Update README files
- [ ] Document any deviations from design
- [ ] Create runbook for common issues

### 7.3 Team Training

- [ ] Train team on new architecture
- [ ] Document troubleshooting procedures
- [ ] Set up on-call rotation
- [ ] Create runbooks

---

## Verification Commands

### Check Deployment Status

```bash
# List all Lambda functions
aws lambda list-functions --query 'Functions[?starts_with(FunctionName, `ainigama`)].FunctionName'

# List all DynamoDB tables
aws dynamodb list-tables --query 'TableNames[?starts_with(@, `ainigama`)]'

# Check EventBridge rules
aws events list-rules --query 'Rules[?starts_with(Name, `ainigama`)]'

# View recent CloudWatch logs
aws logs tail /aws/lambda/ainigama-backend-dev-aggregateMetrics --since 10m

# Check API Gateway endpoints
aws apigateway get-rest-apis --query 'items[?name==`ainigama-backend`].id'
```

### Test Endpoints

```bash
# Set your API URL
API_URL="https://YOUR_API_ID.execute-api.us-east-1.amazonaws.com/dev"

# Test engagement tracking
curl -X POST $API_URL/engagement/track \
  -H "Content-Type: application/json" \
  -d '{"userId":"test1","threadId":"thread1","action":"view"}'

# Test trending
curl $API_URL/trending/threads?limit=10

# Test recommendations
curl "$API_URL/recommendations/threads?userId=test1&limit=20"

# Test personalized trending
curl "$API_URL/trending/personalized?userId=test1&limit=10"
```

---

## Rollback Procedures

### If Unified System Has Issues

**Option 1: Feature Flag Rollback**

```bash
# Disable new aggregation Lambda
aws lambda update-function-configuration \
  --function-name ainigama-backend-dev-aggregateMetrics \
  --environment "Variables={USE_NEW_AGGREGATION=false}"

# Frontend rollback
# Revert to previous deployment or use feature flag
```

**Option 2: Full Rollback**

```bash
# Redeploy previous version
git checkout PREVIOUS_COMMIT
cd infrastructure/aws
serverless deploy

# Or remove new tables
aws dynamodb delete-table --table-name ainigama-dev-thread-metrics-cache
aws dynamodb delete-table --table-name ainigama-dev-time-tracking
```

---

## Success Criteria

### Phase 1 ✅
- [ ] All DynamoDB tables deployed
- [ ] No errors in table creation
- [ ] Indexes created successfully

### Phase 2 ✅
- [ ] All Lambda functions deployed
- [ ] EventBridge rule active (runs every 5 minutes)
- [ ] No cold start issues

### Phase 3 ✅
- [ ] Frontend builds successfully
- [ ] All tracking calls updated
- [ ] New feed tabs functional

### Phase 4 ✅
- [ ] All functional tests pass
- [ ] API response times within targets:
  - Trending: < 100ms
  - Recommendations: < 500ms
  - Engagement tracking: < 200ms
- [ ] Zero errors in CloudWatch logs

### Phase 5 ✅
- [ ] CloudWatch dashboard created
- [ ] Alarms configured and tested
- [ ] SNS notifications working

### Phase 6 ✅
- [ ] 7-day production stability
- [ ] Performance metrics meeting targets
- [ ] User satisfaction maintained/improved
- [ ] Cost within budget

---

## Troubleshooting

### Issue: Lambda Timeout

**Symptoms**: Aggregation Lambda times out (> 300s)

**Solutions**:
- Increase timeout in serverless.yml
- Optimize batch processing (reduce batch size)
- Add parallelization with Promise.all

### Issue: DynamoDB Throttling

**Symptoms**: `ProvisionedThroughputExceededException`

**Solutions**:
- Tables already use PAY_PER_REQUEST (should auto-scale)
- Check for hot partitions
- Implement exponential backoff in code

### Issue: High Costs

**Symptoms**: AWS bill higher than expected

**Solutions**:
- Check DynamoDB consumed capacity
- Review Lambda execution counts
- Optimize aggregation job frequency (5 min → 10 min)
- Enable DynamoDB on-demand to provisioned if steady load

### Issue: Stale Recommendations

**Symptoms**: Users see old recommendations

**Solutions**:
- Check EventBridge rule is enabled
- Verify aggregation Lambda runs successfully
- Check TTL on UserPreferences table
- Manually invoke aggregation

---

## Post-Deployment Monitoring

### Daily (Week 1)
- [ ] Check CloudWatch alarms
- [ ] Review error logs
- [ ] Monitor API response times
- [ ] Check AWS costs

### Weekly (Month 1)
- [ ] Review performance trends
- [ ] Analyze user engagement metrics
- [ ] Check recommendation quality
- [ ] Optimize based on data

### Monthly (Ongoing)
- [ ] Cost optimization review
- [ ] Algorithm tuning (A/B test results)
- [ ] Capacity planning
- [ ] Feature enhancement planning

---

## Reference Links

- **Design Doc**: [unified-content-discovery-system.md](./unified-content-discovery-system.md)
- **Overview**: [CONTENT-DISCOVERY-README.md](./CONTENT-DISCOVERY-README.md)
- **Serverless Framework**: https://www.serverless.com/framework/docs
- **DynamoDB Guide**: https://docs.aws.amazon.com/dynamodb/
- **Lambda Best Practices**: https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html

---

**Checklist Version**: 1.0  
**Last Updated**: October 13, 2025  
**Target Architecture**: AWS Lambda + DynamoDB  
**Estimated Time**: 1-2 weeks for full implementation

