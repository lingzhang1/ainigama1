# Ainigama AWS Infrastructure

## Prerequisites

1. **AWS Account**: Create at [aws.amazon.com](https://aws.amazon.com)
2. **AWS CLI**: Install and configure with your credentials
3. **Node.js**: Version 18 or higher
4. **Serverless Framework**: `npm install -g serverless`
5. **DeepSeek API Key**: Get from [platform.deepseek.com](https://platform.deepseek.com)

## Quick Deployment

### 1. Set Environment Variables
```bash
export DEEPSEEK_API_KEY=sk-0dcbd0d5eca74684919812e175de65b7
```

### 2. Configure AWS Credentials
```bash
aws configure
# Enter your AWS Access Key ID
# Enter your AWS Secret Access Key  
# Enter your preferred region (e.g., us-east-1)
# Enter output format (json)
```

### 3. Deploy Infrastructure
```bash
# From project root
chmod +x deploy-aws.sh
./deploy-aws.sh
```

### 4. Update Frontend Environment
After deployment, update your `.env` file:
```env
VITE_WEBSOCKET_URL=wss://sqi8k7pny5.execute-api.us-east-1.amazonaws.com/dev
VITE_API_URL=https://t9ir58i9z9.execute-api.us-east-1.amazonaws.com/dev
VITE_DEEPSEEK_API_KEY=sk-0dcbd0d5eca74684919812e175de65b7
```

## Manual Deployment

If you prefer manual deployment:

```bash
cd infrastructure/aws
npm install
serverless deploy --stage dev
```

## AWS Services Used

- **API Gateway**: WebSocket and REST endpoints
- **Lambda**: Serverless functions
- **DynamoDB**: NoSQL database
- **Cognito**: User authentication
- **CloudFormation**: Infrastructure as code

## Cost Estimation

### Free Tier (First 12 months)
- **Lambda**: 1M requests/month free
- **DynamoDB**: 25GB storage free
- **API Gateway**: 1M API calls/month free

### After Free Tier
- **Lambda**: ~$0.20 per 1M requests
- **DynamoDB**: ~$0.25 per GB/month
- **API Gateway**: ~$1.00 per 1M requests

## Monitoring

View your deployment:
- **AWS Console**: [console.aws.amazon.com](https://console.aws.amazon.com)
- **CloudWatch Logs**: Monitor function execution
- **DynamoDB Console**: View stored data

## Cleanup

To remove all AWS resources:
```bash
cd infrastructure/aws
serverless remove --stage dev
```

## Troubleshooting

### Common Issues

1. **Permission Denied**: Ensure your AWS user has sufficient permissions
2. **Region Mismatch**: Make sure all services are in the same region
3. **API Key Issues**: Verify your DeepSeek API key is valid

### Getting Help

- Check CloudWatch logs for function errors
- Use `serverless logs -f functionName` for specific function logs
- AWS Support for infrastructure issues