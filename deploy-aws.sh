#!/bin/bash

echo "🚀 Ainigama AWS Deployment Script"
echo "=================================="

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo "❌ AWS CLI not found. Please install AWS CLI first."
    echo "Visit: https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html"
    exit 1
fi

# Check if Serverless is installed
if ! command -v serverless &> /dev/null; then
    echo "❌ Serverless Framework not found. Installing..."
    npm install -g serverless
fi

# Check AWS credentials
echo "🔍 Checking AWS credentials..."
if ! aws sts get-caller-identity &> /dev/null; then
    echo "❌ AWS credentials not configured."
    echo "Run: aws configure"
    echo "You'll need your AWS Access Key ID and Secret Access Key"
    exit 1
fi

echo "✅ AWS credentials configured"

# Check if DeepSeek API key is set
if [ -z "$DEEPSEEK_API_KEY" ]; then
    echo "❌ DEEPSEEK_API_KEY environment variable not set"
    echo "Please set your DeepSeek API key:"
    echo "export DEEPSEEK_API_KEY=your_api_key_here"
    exit 1
fi

echo "✅ DeepSeek API key found"

# Navigate to AWS infrastructure directory
cd infrastructure/aws

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Deploy to development environment
echo "🚀 Deploying to AWS (development)..."
serverless deploy --stage dev

# Check deployment status
if [ $? -eq 0 ]; then
    echo "✅ Deployment successful!"
    echo ""
    echo "📋 Next Steps:"
    echo "1. Copy the WebSocket URI from the output above"
    echo "2. Update your .env file with the new URLs"
    echo "3. Redeploy your frontend"
    echo ""
    echo "🔧 To update frontend environment:"
    echo "VITE_WEBSOCKET_URL=wss://your-api-id.execute-api.region.amazonaws.com/dev"
    echo "VITE_API_URL=https://your-api-id.execute-api.region.amazonaws.com/dev"
else
    echo "❌ Deployment failed. Check the error messages above."
    exit 1
fi