/**
 * Background Job: Update User Preferences
 * 
 * This script should be run periodically (e.g., via cron) to update user preferences
 * based on their recent interactions. Recommended schedule: Every 5 minutes
 * 
 * Usage:
 *   node background-jobs/update-preferences.js
 * 
 * Or add to crontab:
 *   */5 * * * * cd /path/to/ainigama && node infrastructure/nodejs-server/background-jobs/update-preferences.js
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Database connection
const dbPath = path.join(__dirname, '../ainigama.db');
const db = new sqlite3.Database(dbPath);

/**
 * Update preferences for a single user
 */
function updateUserPreferences(userId, callback) {
  // Get user's recent interactions (last 90 days)
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  
  db.all(
    `SELECT ui.*, t.category, t.creator_id
     FROM user_interactions ui
     JOIN threads t ON ui.thread_id = t.id
     WHERE ui.user_id = ? AND ui.created_at >= ?
     ORDER BY ui.created_at DESC`,
    [userId, ninetyDaysAgo],
    (err, interactions) => {
      if (err) {
        return callback(err);
      }
      
      // Calculate category affinities
      const categoryScores = {};
      const creatorScores = {};
      let totalScore = 0;
      
      interactions.forEach(interaction => {
        const score = interaction.score;
        totalScore += score;
        
        if (interaction.category) {
          categoryScores[interaction.category] = (categoryScores[interaction.category] || 0) + score;
        }
        
        if (interaction.creator_id) {
          creatorScores[interaction.creator_id] = (creatorScores[interaction.creator_id] || 0) + score;
        }
      });
      
      // Normalize to 0-100 scale
      const maxCategoryScore = Math.max(...Object.values(categoryScores), 1);
      const categoryAffinities = {};
      Object.keys(categoryScores).forEach(category => {
        categoryAffinities[category] = Math.round((categoryScores[category] / maxCategoryScore) * 100);
      });
      
      // Get top 10 favorite creators
      const sortedCreators = Object.entries(creatorScores)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([creatorId]) => creatorId);
      
      const now = new Date().toISOString();
      
      // Upsert user preferences
      db.run(
        `INSERT INTO user_preferences (user_id, category_affinities, favorite_creators, total_engagement_score, last_updated)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           category_affinities = excluded.category_affinities,
           favorite_creators = excluded.favorite_creators,
           total_engagement_score = excluded.total_engagement_score,
           last_updated = excluded.last_updated`,
        [
          userId,
          JSON.stringify(categoryAffinities),
          JSON.stringify(sortedCreators),
          totalScore,
          now
        ],
        callback
      );
    }
  );
}

/**
 * Main job execution
 */
function runJob() {
  console.log('🔄 Starting user preferences update job...');
  const startTime = Date.now();
  
  // Get all users who have recent interactions (last 7 days)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  
  db.all(
    `SELECT DISTINCT user_id FROM user_interactions WHERE created_at >= ?`,
    [sevenDaysAgo],
    (err, users) => {
      if (err) {
        console.error('❌ Error fetching active users:', err);
        db.close();
        process.exit(1);
        return;
      }
      
      console.log(`📊 Found ${users.length} active users to update`);
      
      if (users.length === 0) {
        console.log('✅ No users to update');
        db.close();
        process.exit(0);
        return;
      }
      
      let completed = 0;
      let errors = 0;
      
      users.forEach((user, index) => {
        updateUserPreferences(user.user_id, (err) => {
          if (err) {
            console.error(`❌ Error updating preferences for user ${user.user_id}:`, err);
            errors++;
          } else {
            console.log(`✅ Updated preferences for user ${user.user_id} (${index + 1}/${users.length})`);
          }
          
          completed++;
          
          // Check if all done
          if (completed === users.length) {
            const duration = Date.now() - startTime;
            console.log(`\n🎉 Job completed in ${duration}ms`);
            console.log(`   Successful: ${users.length - errors}`);
            console.log(`   Errors: ${errors}`);
            
            db.close();
            process.exit(errors > 0 ? 1 : 0);
          }
        });
      });
    }
  );
}

// Error handling
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught exception:', error);
  db.close();
  process.exit(1);
});

process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled rejection:', error);
  db.close();
  process.exit(1);
});

// Run the job
runJob();

