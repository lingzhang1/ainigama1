# AWS Deployment Guide - Local Machine Setup

Since WebContainer has limitations with AWS CLI installation, you'll need to deploy from your local machine. Here's the complete process:

## 🖥️ **Local Machine Setup**

### **Step 1: Install Required Tools on Your Local Machine**

#### **Windows:**
```powershell
# Install AWS CLI
msiexec.exe /i https://awscli.amazonaws.com/AWSCLIV2.msi

# Install Node.js (if not installed)
# Download from: https://nodejs.org/

# Install Serverless Framework
npm install -g serverless
```

#### **macOS:**
```bash
# Install AWS CLI
curl "https://awscli.amazonaws.com/AWSCLIV2.pkg" -o "AWSCLIV2.pkg"
sudo installer -pkg AWSCLIV2.pkg -target /

# Install Serverless Framework
npm install -g serverless
```

#### **Linux:**
```bash
# Install AWS CLI
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install

# Install Serverless Framework
npm install -g serverless
```

### **Step 2: Download Project Files**

1. **Download the infrastructure folder** from this project
2. **Copy the following files to your local machine:**
   - `infrastructure/aws/` (entire folder)
   - `deploy-aws.sh`
   - `.env` (with your DeepSeek API key)

### **Step 3: AWS Account Setup**

1. **Create AWS Account** at [aws.amazon.com](https://aws.amazon.com)
2. **Create IAM User** with programmatic access:
   - Go to AWS Console > IAM > Users
   - Create new user with "Programmatic access"
   - Attach policy: `AdministratorAccess` (for deployment)
   - Save the Access Key ID and Secret Access Key

### **Step 4: Configure AWS Credentials**

```bash
aws configure
# AWS Access Key ID: [Your Access Key]
# AWS Secret Access Key: [Your Secret Key]
# Default region name: us-east-1
# Default output format: json
```

### **Step 5: Set Environment Variables**

```bash
# Set your DeepSeek API key
export DEEPSEEK_API_KEY=your_deepseek_api_key_here

# Verify it's set
echo $DEEPSEEK_API_KEY
```

### **Step 6: Deploy Infrastructure**

```bash
# Navigate to AWS infrastructure folder
cd infrastructure/aws

# Install dependencies
npm install

# Deploy to development environment
serverless deploy --stage dev

# Or use the deployment script
chmod +x ../../deploy-aws.sh
../../deploy-aws.sh
```

### **Step 7: Update Frontend Environment**

After successful deployment, you'll get output like:
```
WebSocket URI: wss://abc123.execute-api.us-east-1.amazonaws.com/dev
API URL: https://abc123.execute-api.us-east-1.amazonaws.com/dev
```

Update your `.env` file in the project:
```env
VITE_WEBSOCKET_URL=wss://your-api-id.execute-api.us-east-1.amazonaws.com/dev
VITE_API_URL=https://your-api-id.execute-api.us-east-1.amazonaws.com/dev
VITE_DEEPSEEK_API_KEY=your_deepseek_api_key_here
```

## 🔧 **Alternative: GitHub Actions Deployment**

If you prefer automated deployment, you can set up GitHub Actions to deploy from this repository.

## 💰 **Cost Estimation**

- **Free Tier**: Covers most small applications
- **After Free Tier**: ~$5-20/month for typical usage
- **DynamoDB**: $0.25 per GB/month
- **Lambda**: $0.20 per 1M requests
- **API Gateway**: $1.00 per 1M requests

## 🚨 **Important Notes**

1. **Security**: Never commit AWS credentials to version control
2. **Cleanup**: Use `serverless remove --stage dev` to delete resources
3. **Monitoring**: Check AWS CloudWatch for logs and metrics
4. **Billing**: Monitor AWS billing dashboard regularly

## 🆘 **Troubleshooting**

### **Common Issues:**

1. **Permission Denied**: Ensure IAM user has sufficient permissions
2. **Region Mismatch**: All services must be in the same region
3. **API Key Issues**: Verify DeepSeek API key is valid
4. **Timeout Errors**: Increase Lambda timeout in serverless.yml

### **Getting Help:**

- AWS Documentation: [docs.aws.amazon.com](https://docs.aws.amazon.com)
- Serverless Framework: [serverless.com/framework/docs](https://serverless.com/framework/docs)
- AWS Support: Available through AWS Console