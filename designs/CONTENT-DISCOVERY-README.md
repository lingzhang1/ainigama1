# Content Discovery System - Documentation Guide

This folder contains the complete design documentation for the content discovery features in Ainigama.

**Architecture**: AWS Lambda + DynamoDB + React Frontend

## 📚 Document Overview

### Current State (What's Implemented)

| Document | Status | Purpose | Backend | Last Updated |
|----------|--------|---------|---------|--------------|
| [trending-design.md](./trending-design.md) | ✅ Implemented v2.0 | Global trending algorithm | AWS + Node.js | Oct 2025 |
| [recommendation-system-design.md](./recommendation-system-design.md) | ✅ Implemented v1.0 | Personalized recommendations | AWS + Node.js | Oct 2025 |

### Future State (Proposed AWS-Only Integration)

| Document | Status | Purpose | Backend | Last Updated |
|----------|--------|---------|---------|--------------|
| [unified-content-discovery-system.md](./unified-content-discovery-system.md) | 🎯 Proposed v2.0 | Combined trending + recommendations | **AWS Only** | Oct 2025 |

**Note**: The unified system design is **AWS-only** (Lambda + DynamoDB). Node.js server support has been removed.

---

## 🗺️ Document Relationship

```
┌──────────────────────────────────────────────────────────────┐
│              CURRENT IMPLEMENTATION (Dual Backend)            │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌─────────────────────┐         ┌──────────────────────┐  │
│  │ trending-design.md  │         │ recommendation-      │  │
│  │                     │         │ system-design.md     │  │
│  │ • Global popularity │         │ • Personalized feed  │  │
│  │ • Engagement scoring│         │ • Content-based      │  │
│  │ • Time decay        │         │ • 70/30 split        │  │
│  │ • Velocity boost    │         │ • User preferences   │  │
│  │                     │         │                      │  │
│  │ Backend:            │         │ Backend:             │  │
│  │ AWS + Node.js       │         │ AWS + Node.js        │  │
│  └─────────────────────┘         └──────────────────────┘  │
│           │                                 │                │
│           │        OVERLAP & DUPLICATION    │                │
│           │        • Same metrics           │                │
│           │        • Separate tracking      │                │
│           │        • Different weights      │                │
│           └─────────────┬───────────────────┘                │
│                         │                                    │
└─────────────────────────┼────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────────┐
│             FUTURE AWS-ONLY INTEGRATION                       │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│         unified-content-discovery-system.md (AWS Only)       │
│                                                               │
│  Architecture: AWS Lambda + DynamoDB + React                 │
│                                                               │
│  Combines both systems with:                                 │
│  ✅ Unified event tracking (Lambda)                          │
│  ✅ Shared DynamoDB tables                                   │
│  ✅ Combined EventBridge jobs (40% faster)                   │
│  ✅ Reduced storage (50% less)                               │
│  ✅ Cross-system features                                    │
│  ✅ Consistent weights                                       │
│  ✅ Serverless scalability                                   │
│                                                               │
│  New Features:                                               │
│  🆕 Trending in Your Interests (Lambda)                      │
│  🆕 Discovery Mode (Lambda)                                  │
│  🆕 Smart Feed Tabs                                          │
│                                                               │
│  ⚠️ Node.js server removed - AWS Lambda only                 │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

---

## 📖 Reading Guide

### For Product Managers

**Start here**: [unified-content-discovery-system.md](./unified-content-discovery-system.md)
- Read "Executive Summary" and "System Overview"
- Understand the combined vision
- Review "Cross-System Features" for new capabilities

**Then review**:
- [trending-design.md](./trending-design.md) - Current trending implementation
- [recommendation-system-design.md](./recommendation-system-design.md) - Current recommendation implementation

### For Engineers (New to Project)

**Start here**: [unified-content-discovery-system.md](./unified-content-discovery-system.md)
- Read entire document for complete picture
- Focus on "Unified Architecture" diagram
- Study "Shared Infrastructure" section

**Then dive into specifics**:
- [trending-design.md](./trending-design.md) - Trending algorithm details
- [recommendation-system-design.md](./recommendation-system-design.md) - Recommendation algorithm details

### For Engineers (Implementing AWS Migration)

**Follow this order**:

1. **Review Current State**:
   - [trending-design.md](./trending-design.md) - Understand trending algorithm
   - [recommendation-system-design.md](./recommendation-system-design.md) - Understand recommendation logic

2. **Study Target AWS Architecture**:
   - [unified-content-discovery-system.md](./unified-content-discovery-system.md) - Section: "Unified AWS Architecture"
   - Focus on Lambda + DynamoDB design

3. **AWS Implementation Guide**:
   - [unified-content-discovery-system.md](./unified-content-discovery-system.md) - Section: "Implementation Guide"
   - Follow Phase 1-4 for AWS deployment
   - **Note**: Skip all Node.js/SQLite sections

4. **Migration Strategy**:
   - [unified-content-discovery-system.md](./unified-content-discovery-system.md) - Section: "Migration Path"
   - Choose Option A (Clean Slate) or Option B (Gradual)

### For DevOps/SRE (AWS Deployment)

**Focus on**:
- [unified-content-discovery-system.md](./unified-content-discovery-system.md):
  - "DynamoDB Schema" - Table definitions
  - "Performance & Monitoring" - CloudWatch setup
  - "Migration Path" > Rollback Plan
  - EventBridge scheduling for aggregation job

**AWS Resources to Deploy**:
- 7 new DynamoDB tables
- 3 new Lambda functions
- 1 EventBridge rule (5-minute schedule)
- API Gateway routes
- CloudWatch alarms

---

## 🎯 Quick Reference

### Current Implementation Status

| Feature | Status | Backend | Location |
|---------|--------|---------|----------|
| Trending Algorithm | ✅ Live | AWS + Node.js | trending-design.md |
| Trending API | ✅ Live | AWS Lambda | handlers/trending.js |
| Recommendations | ✅ Live | AWS + Node.js | recommendation-system-design.md |
| Recommendation API | ✅ Live | AWS Lambda | handlers/recommendations.js |
| Background Jobs | ✅ Live | Node.js + EventBridge | Separate implementations |

### Proposed AWS-Only Changes

| Feature | Status | Backend | Impact | Priority |
|---------|--------|---------|--------|----------|
| Unified Event Tracking (Lambda) | 🎯 Proposed | AWS Lambda | High - Eliminates duplication | ⭐⭐⭐ |
| Combined Aggregation (EventBridge) | 🎯 Proposed | AWS Lambda | Medium - 40% faster | ⭐⭐⭐ |
| Trending in Your Interests | 🎯 Proposed | AWS Lambda | High - New user value | ⭐⭐ |
| Discovery Mode | 🎯 Proposed | AWS Lambda | Medium - Enhanced exploration | ⭐⭐ |
| DynamoDB-only Storage | 🎯 Proposed | AWS DynamoDB | Medium - 50% reduction | ⭐⭐ |
| Remove Node.js Backend | 🎯 Proposed | AWS Only | High - Simplified ops | ⭐⭐⭐ |

---

## 🔍 Key Differences Between Documents

### Trending Design vs Recommendation Design

| Aspect | Trending | Recommendations |
|--------|----------|-----------------|
| **Scope** | Global (same for everyone) | Personal (unique per user) |
| **Primary Metric** | Engagement score | User preference match |
| **Time Sensitivity** | High (trending now) | Medium (based on history) |
| **Algorithm** | Weighted scoring + decay | Content-based filtering |
| **Update Frequency** | Every 5 min (background) | Real-time + 5 min refresh |
| **Output Size** | Top 10-50 threads | Full feed (paginated) |
| **Cold Start** | N/A (works for all) | Falls back to trending |

### Unified Design: What's Different?

| What Changed | From Separate Designs | To Unified AWS Design |
|--------------|----------------------|----------------------|
| **Backend** | AWS + Node.js (dual) | AWS Lambda only |
| **Event Tracking** | 2 separate systems | 1 unified Lambda tracker |
| **Data Storage** | Duplicate tables | Single DynamoDB source |
| **Background Jobs** | 2 jobs (Node.js + EventBridge) | 1 EventBridge Lambda |
| **Weight Configuration** | 2 separate configs | 1 unified config |
| **API Endpoints** | Separate Lambda functions | Integrated + new features |
| **Caching** | Independent | Shared DynamoDB TTL |
| **Scalability** | Mixed (Node.js bottleneck) | Full serverless auto-scale |

---

## 📊 Feature Comparison Matrix

| Feature | Trending Only | Recommendations Only | Unified System |
|---------|--------------|---------------------|----------------|
| Global popularity | ✅ | ❌ | ✅ |
| Personalized feed | ❌ | ✅ | ✅ |
| Cold start handling | ✅ (always works) | ⚠️ (falls back to recent) | ✅ (uses trending) |
| Category filtering | ❌ | ✅ | ✅ |
| Creator preferences | ❌ | ✅ | ✅ |
| Time decay | ✅ | ✅ | ✅ |
| Exploration/discovery | ❌ | ✅ (30%) | ✅ (enhanced) |
| **Trending in Your Interests** | ❌ | ❌ | ✅ 🆕 |
| **Discovery Mode** | ❌ | ❌ | ✅ 🆕 |
| Storage efficiency | Medium | Medium | High ✅ |
| Update performance | Fast | Fast | Faster ✅ |

---

## 🚀 Implementation Roadmap

### Current State → AWS-Only Future State

**Phase 0: Baseline** (Already Done ✅)
- Trending system implemented (AWS + Node.js)
- Recommendation system implemented (AWS + Node.js)
- Both running independently

**Phase 1: AWS Infrastructure** (Week 1)
- Add new DynamoDB tables (ThreadMetricsCache, TimeTracking)
- Deploy unified Lambda tracking function
- Deploy aggregation Lambda (EventBridge scheduled)
- No behavior changes yet (parallel deployment)

**Phase 2: Lambda Functions** (Week 1)
- Deploy unified engagement tracker Lambda
- Deploy combined aggregation Lambda (replaces old jobs)
- Deploy personalized trending Lambda
- Run in parallel with existing endpoints

**Phase 3: Frontend Migration** (Week 2)
- Update frontend to use new Lambda endpoints
- Replace all tracking calls with unified tracker
- Add new feed tabs (For You, Discovery)
- A/B test with users

**Phase 4: Cleanup** (Week 2)
- Disable Node.js endpoints (if applicable)
- Remove old Lambda functions
- Archive old data
- Update documentation

**Phase 5: Optimization** (Ongoing)
- Monitor CloudWatch metrics
- Tune Lambda memory/timeout
- Optimize DynamoDB capacity
- Add X-Ray tracing

---

## 💡 Decision Guide

### Should I implement the AWS-only unified system?

**YES, if**:
- ✅ You're moving to AWS-only architecture (no Node.js server)
- ✅ You have > 500 threads
- ✅ You have > 100 active users
- ✅ You want serverless auto-scaling
- ✅ You want new features (Trending in Your Interests)
- ✅ You're concerned about storage/performance
- ✅ You want simpler ops (no server maintenance)

**MAYBE, if**:
- ⚠️ You have 100-500 threads (benefits exist but smaller)
- ⚠️ You need to keep Node.js server temporarily
- ⚠️ Limited AWS experience (learning curve)

**NO, if**:
- ❌ You have < 100 threads (overhead not worth it)
- ❌ You just launched (collect more data first)
- ❌ You must stay on Node.js server
- ❌ Critical features in pipeline (prioritize those)

### Migration Strategy: Big Bang vs Gradual?

**Big Bang** (Recommended for):
- Greenfield AWS deployments
- Small deployments (< 1000 users)
- Development/staging environments
- Weekend deployment windows available

**Gradual** (Recommended for):
- Production with > 1000 active users
- Mission-critical systems
- Risk-averse organizations
- 24/7 uptime requirements
- Migrating from Node.js to AWS

---

## 📞 Support & Questions

### Common Questions

**Q: Why AWS-only? What happened to Node.js server?**  
A: The unified design focuses on AWS Lambda for serverless scalability and simplified operations. Node.js server is no longer maintained.

**Q: Can I implement just the unified tracking without other changes?**  
A: Yes! Phase 1 (DynamoDB tables + tracking Lambda) can be deployed independently.

**Q: Will this break existing features?**  
A: No. The design is backward compatible. You can run old and new systems in parallel during migration.

**Q: How long does AWS migration take?**  
A: 1-2 weeks for full migration. DynamoDB tables and Lambda functions can be deployed in 1-2 days.

**Q: What are the AWS costs?**  
A: With PAY_PER_REQUEST mode: ~$1-5/month for 1000 users. EventBridge: ~$1/month. Lambda: ~$2-10/month. Total: <$20/month for small-medium deployments.

**Q: What if Lambda function fails?**  
A: DLQ (Dead Letter Queue) captures failed events. CloudWatch alarms notify you. Feature flags allow instant rollback.

**Q: Do weights need to be exactly as specified?**  
A: No. Weights are tunable via environment variables. Start with recommended values, then A/B test.

### Getting Help

- **AWS Implementation**: See [aws-implementation-checklist.md](./aws-implementation-checklist.md) - Step-by-step deployment guide
- **AWS Architecture**: See [aws-architecture-summary.md](./aws-architecture-summary.md) - Complete AWS reference
- **Unified Design**: See [unified-content-discovery-system.md](./unified-content-discovery-system.md) - Complete system design
- **Algorithm questions**: See respective design docs (trending or recommendations)
- **Performance issues**: See Performance & Monitoring sections in unified design
- **Migration concerns**: See Migration Path section in unified design

---

## 📝 Document Versions

| Document | Version | Date | Backend | Changes |
|----------|---------|------|---------|---------|
| trending-design.md | v2.0 | Oct 2025 | AWS + Node.js | Updated for new metrics system |
| recommendation-system-design.md | v1.0 | Oct 2025 | AWS + Node.js | Initial implementation |
| unified-content-discovery-system.md | v2.0 | Oct 2025 | **AWS Only** | Combined design, Node.js removed |
| aws-implementation-checklist.md | v1.0 | Oct 2025 | **AWS Only** | Step-by-step deployment guide |
| aws-architecture-summary.md | v1.0 | Oct 2025 | **AWS Only** | Complete AWS reference |
| CONTENT-DISCOVERY-README.md | v1.0 | Oct 2025 | - | Navigation and overview |

---

## ✅ Next Steps for AWS Migration

1. **Review** unified-content-discovery-system.md (AWS-only design)
2. **Decide** on migration timeline (Big Bang vs Gradual)
3. **Deploy** Phase 1: DynamoDB tables via serverless.yml
4. **Deploy** Phase 2: Lambda functions (tracking + aggregation)
5. **Update** Frontend to use unified tracker
6. **Monitor** CloudWatch metrics and alarms
7. **Launch** cross-system features (Trending in Your Interests)
8. **Optimize** based on CloudWatch data
9. **Decommission** Node.js server (if applicable)

### Quick Start (AWS Deployment)

```bash
# 1. Update serverless.yml with new tables
cd infrastructure/aws

# 2. Deploy infrastructure
serverless deploy

# 3. Verify deployment
aws dynamodb list-tables | grep ainigama

# 4. Test endpoints
curl https://YOUR_API_URL/dev/engagement/track -X POST -d '...'

# 5. Monitor
aws cloudwatch get-metric-statistics --namespace AWS/Lambda ...
```

---

**Last Updated**: October 13, 2025  
**Architecture**: AWS Lambda + DynamoDB + React  
**Maintained By**: AI Implementation Team  
**Status**: 📚 AWS-Only Documentation Complete

