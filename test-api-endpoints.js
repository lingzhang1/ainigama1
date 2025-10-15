// 测试新的API端点
const API_BASE = 'https://t9ir58i9z9.execute-api.us-east-1.amazonaws.com/dev';
const USER_ID = 'd7ce1123-4295-4190-9f69-a4916c90c64e';

async function testEndpoint(name, url) {
  try {
    console.log(`\n🧪 Testing ${name}...`);
    const response = await fetch(url);
    const data = await response.json();
    
    if (response.ok) {
      console.log(`✅ ${name}: SUCCESS`);
      console.log(`   Response:`, JSON.stringify(data, null, 2));
    } else {
      console.log(`❌ ${name}: FAILED`);
      console.log(`   Status: ${response.status}`);
      console.log(`   Error:`, data);
    }
  } catch (error) {
    console.log(`❌ ${name}: ERROR`);
    console.log(`   Error:`, error.message);
  }
}

async function runTests() {
  console.log('🚀 Testing User Center API Endpoints...\n');
  
  // 测试新的超快统计API
  await testEndpoint('getUserStats', `${API_BASE}/users/${USER_ID}/stats`);
  
  // 测试现有的端点
  await testEndpoint('getUserSaves', `${API_BASE}/users/${USER_ID}/saves`);
  await testEndpoint('getUserLikes', `${API_BASE}/users/${USER_ID}/likes`);
  await testEndpoint('getUserReplies', `${API_BASE}/users/${USER_ID}/replies`);
  
  console.log('\n🎉 API测试完成！');
}

// 在浏览器控制台中运行
if (typeof window !== 'undefined') {
  runTests();
} else {
  console.log('请在浏览器控制台中运行此脚本');
}
