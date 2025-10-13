# Background Jobs for Recommendation System

This directory contains background jobs that should be run periodically to maintain the recommendation system's performance.

## Available Jobs

### 1. Update User Preferences (`update-preferences.js`)

Updates user preference profiles based on their recent interactions. This job:
- Analyzes user interactions from the last 90 days
- Calculates category affinities
- Identifies favorite creators
- Updates the `user_preferences` table

**Recommended Schedule**: Every 5 minutes

## Setup

### Option 1: Manual Execution

Run the job manually from the project root:

```bash
cd infrastructure/nodejs-server
node background-jobs/update-preferences.js
```

### Option 2: Cron Job (Linux/Mac)

Add to your crontab to run every 5 minutes:

```bash
crontab -e
```

Add this line:

```cron
*/5 * * * * cd /path/to/ainigama/infrastructure/nodejs-server && node background-jobs/update-preferences.js >> /var/log/ainigama-preferences.log 2>&1
```

### Option 3: PM2 (Production)

Use PM2 for more robust job scheduling:

```bash
npm install -g pm2

# Create ecosystem file
cat > ecosystem.config.js << EOF
module.exports = {
  apps: [
    {
      name: 'ainigama-server',
      script: 'server.js',
      cwd: './infrastructure/nodejs-server',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G'
    },
    {
      name: 'update-preferences',
      script: 'background-jobs/update-preferences.js',
      cwd: './infrastructure/nodejs-server',
      cron_restart: '*/5 * * * *',
      autorestart: false,
      watch: false
    }
  ]
};
EOF

# Start all services
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### Option 4: AWS EventBridge (for AWS deployment)

For the AWS Lambda deployment, you can use EventBridge (CloudWatch Events):

Add to `serverless.yml`:

```yaml
functions:
  updatePreferencesJob:
    handler: src/handlers/recommendations.updatePreferencesJob
    timeout: 300
    events:
      - schedule:
          rate: rate(5 minutes)
          enabled: true
```

## Monitoring

### Check Job Logs

```bash
# Manual run
node background-jobs/update-preferences.js

# PM2
pm2 logs update-preferences

# Cron
tail -f /var/log/ainigama-preferences.log
```

### Job Output

Successful execution will show:

```
🔄 Starting user preferences update job...
📊 Found 42 active users to update
✅ Updated preferences for user user_123 (1/42)
✅ Updated preferences for user user_456 (2/42)
...
🎉 Job completed in 2341ms
   Successful: 42
   Errors: 0
```

## Performance Considerations

- **Database Load**: The job reads from `user_interactions` and `threads` tables. Ensure proper indexing.
- **Execution Time**: Scales linearly with active users (~50-100ms per user)
- **Memory**: Minimal memory usage, < 100MB even with 1000s of users
- **Concurrency**: Single-threaded by design to avoid database lock contention

## Troubleshooting

### Error: Database Locked

If you see "database is locked" errors:
1. Ensure only one instance of the job is running
2. Reduce job frequency (e.g., every 10 minutes instead of 5)
3. Consider using WAL mode for SQLite:
   ```sql
   PRAGMA journal_mode=WAL;
   ```

### No Users Updated

Check that:
1. Users have recent interactions (last 7 days)
2. The `user_interactions` table exists and has data
3. Database path is correct in the script

### High Memory Usage

If memory usage is high:
1. Reduce the lookback window (currently 90 days)
2. Process users in batches
3. Add pagination to the query

## Future Enhancements

- [ ] Add batch processing for large user bases (>10k users)
- [ ] Implement distributed locks for multi-server deployment
- [ ] Add Datadog/CloudWatch metrics
- [ ] Create health check endpoint
- [ ] Add retry logic for failed updates
- [ ] Implement incremental updates (only changed data)

