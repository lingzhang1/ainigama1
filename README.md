# Ainigama - AI-Powered Knowledge Platform

Ainigama is a dual-mode knowledge platform that combines private AI chat with public community discussions. Users can ask questions privately to get instant AI responses, then optionally publish conversations to gather community perspectives.

## Features

### Private Mode (AI ChatBot)
- 1:1 private conversations with AI
- Real-time responses using WebSocket connections
- Conversation history and management
- Option to publish conversations publicly

### Public Mode (Community Discussions)
- Public threads with questions and multiple answers
- AI and human contributors can add answers
- Pinned "most popular" answers with collapsed alternatives
- Real-time updates for new answers and comments
- Answer interaction panels with comments and replies

### Forum Features
- Browse public threads (Recent/Trending)
- Search functionality
- Category-based organization
- Suggested topics and popular questions

## Technology Stack

- **Frontend**: React 18 with TypeScript
- **UI Components**: Shadcn/ui with Tailwind CSS
- **Real-time Communication**: Socket.io WebSockets
- **Backend Infrastructure**: AWS Services
  - AWS Lambda for serverless functions
  - DynamoDB for data storage
  - API Gateway for WebSocket connections
  - Cognito for authentication
  - S3 for file storage
  - SNS for notifications

## Getting Started

### Prerequisites
- Node.js 18+ installed
- npm or yarn package manager

### Installation

```
npm install
```

### Development

```
npm run dev
```

The application will be available at [http://localhost:5173/](http://localhost:5173/)

### Production Build

```
npm run build
```

## Architecture

### Real-time Features
- WebSocket connections for instant messaging
- Live updates for public thread interactions
- Typing indicators and presence awareness
- Automatic reconnection handling

### AWS Integration
- **Authentication**: AWS Cognito for user management
- **Data Storage**: DynamoDB for scalable NoSQL storage
- **AI Processing**: Lambda functions for AI response generation
- **File Uploads**: S3 for avatar and media storage
- **Notifications**: SNS for push notifications
- **WebSocket API**: API Gateway WebSocket for real-time communication

### Data Models
- **Users**: Profile information and authentication
- **Threads**: Public discussion containers
- **Questions**: User-generated questions within threads
- **Answers**: AI and human responses to questions
- **Comments**: Interactions on specific answers
- **Private Conversations**: 1:1 AI chat sessions

## Usage

### Private Chat
1. Start a new private conversation
2. Ask questions and receive AI responses
3. Optionally publish interesting conversations publicly

### Public Discussions
1. Browse the forum feed for interesting threads
2. Add answers to any question in public threads
3. Engage with specific answers through comments
4. Original thread creators can add follow-up questions

### Community Features
- Search across all public content
- Filter by recent or trending discussions
- Explore suggested topics and popular questions
- Category-based content organization

## Development Notes

### WebSocket Events
- `private_message`: Send private chat messages
- `ai_response`: Receive AI-generated responses
- `join_thread`/`leave_thread`: Thread subscription management
- `add_answer`/`new_answer`: Real-time answer updates
- `add_comment`/`new_comment`: Comment interactions
- `typing_start`/`typing_stop`: Typing indicators

### Mock Data
The application includes comprehensive mock data for development and demonstration purposes. In production, all data operations would be handled by AWS services.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License.