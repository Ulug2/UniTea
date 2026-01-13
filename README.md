# UniTea

**Your anonymous university community**

UniTea is a React Native mobile application built with Expo that serves as an anonymous community platform for university students. Share thoughts, find lost items, connect with peers, and engage in discussions—all while maintaining privacy when you choose.

## 🚀 Features

### Core Features
- **📱 Feed** - Browse and create posts from the university community
- **🔍 Lost & Found** - Post and find lost items on campus
- **💬 Chat** - Direct messaging with other users
- **💭 Comments** - Nested comment threads with replies
- **👍 Voting** - Upvote and downvote posts and comments
- **🔖 Bookmarks** - Save posts for later
- **👤 Profiles** - User profiles with verification badges
- **🎭 Anonymous Posting** - Option to post anonymously while maintaining account functionality
- **🌓 Theme Support** - Light and dark theme support

### Technical Features
- **Real-time Data** - Powered by Supabase for real-time updates
- **Smart Caching** - TanStack Query for efficient data fetching and caching
- **Type Safety** - Full TypeScript support
- **Modern UI** - Clean, intuitive interface with smooth animations

## 🛠️ Tech Stack

- **Framework**: React Native with Expo (~54.0.30)
- **Navigation**: Expo Router (file-based routing)
- **Backend**: Supabase (PostgreSQL, Authentication, Real-time)
- **State Management**: TanStack Query (React Query) v5
- **Language**: TypeScript
- **UI Components**: Custom components with Expo Vector Icons
- **Fonts**: Poppins (Google Fonts)

## 📋 Prerequisites

Before you begin, ensure you have the following installed:

- [Node.js](https://nodejs.org/) (v18 or later)
- [npm](https://www.npmjs.com/) or [yarn](https://yarnpkg.com/)
- [Expo CLI](https://docs.expo.dev/get-started/installation/)
- [Supabase Account](https://supabase.com/) (for backend services)

## 🔧 Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd unitea
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   
   Create a `.env` file in the root directory:
   ```env
   EXPO_PUBLIC_SUPABASE_URL=your_supabase_project_url
   EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

4. **Set up Supabase Database**
   
   Run the SQL scripts in your Supabase SQL Editor to create tables:
   - `profiles` - User profile information
   - `posts` - Feed and lost & found posts
   - `comments` - Post comments with nested replies
   - `votes` - Upvotes and downvotes
   - `chats` - Chat conversations
   - `chat_messages` - Individual chat messages
   - `notifications` - User notifications
   - `bookmarks` - Saved posts
   - `blocks` - User blocking functionality
   - `reports` - Content reporting

5. **Start the development server**
   ```bash
   npm start
   ```

   Then press:
   - `i` for iOS simulator
   - `a` for Android emulator
   - `w` for web browser
   - Scan QR code with Expo Go app on your device

## 📱 Project Structure

```
unitea/
├── src/
│   ├── app/                    # Expo Router pages
│   │   ├── (auth)/            # Authentication screens
│   │   ├── (protected)/       # Protected routes
│   │   │   ├── (tabs)/        # Tab navigation screens
│   │   │   │   ├── index.tsx  # Feed screen
│   │   │   │   ├── chat.tsx   # Chat list
│   │   │   │   ├── lostfound.tsx # Lost & Found
│   │   │   │   └── profile.tsx   # User profile
│   │   │   ├── post/[id].tsx  # Post detail view
│   │   │   └── create-post.tsx # Create new post
│   │   └── _layout.tsx        # Root layout
│   ├── components/            # Reusable components
│   │   ├── PostListItem.tsx
│   │   ├── CommentListItem.tsx
│   │   ├── ChatListItem.tsx
│   │   └── ...
│   ├── context/               # React Context providers
│   │   ├── AuthContext.tsx
│   │   └── ThemeContext.tsx
│   ├── hooks/                 # Custom React hooks
│   │   └── usePostScore.ts
│   ├── lib/                   # Utilities and configurations
│   │   └── supabase.ts        # Supabase client setup
│   ├── types/                 # TypeScript type definitions
│   │   ├── types.ts
│   │   └── database.types.ts   # Generated Supabase types
│   └── utils/                 # Helper functions
│       └── votes.ts           # Vote calculation utilities
├── assets/                    # Images, fonts, and static data
└── app.json                   # Expo configuration
```

## 🗄️ Database Schema

### Key Tables

- **profiles** - Extends `auth.users` with additional user data (username, avatar, bio, verification status)
- **posts** - Main content table (feed posts and lost & found items)
- **comments** - Nested comment structure with `parent_comment_id` for replies
- **votes** - Stores upvotes/downvotes for posts and comments
- **chats** - Chat conversations between users
- **chat_messages** - Individual messages within chats
- **notifications** - User notifications (comment replies, upvotes, messages)
- **bookmarks** - User saved posts
- **blocks** - User blocking relationships
- **reports** - Content moderation reports

## 🔐 Authentication

UniTea uses Supabase Authentication with email/password. Users must sign up with a university email address (e.g., `@nu.edu.kz`).

## 🎨 Theming

The app supports light and dark themes through a custom `ThemeContext`. Theme preferences are managed globally and can be toggled in the app settings.

## 📊 Data Fetching

UniTea uses **TanStack Query** for all server state management:

- Automatic caching and background refetching
- Optimistic updates
- Request deduplication
- Error handling and retry logic
- Loading states

## 🚦 Development

### Running on Different Platforms

```bash
# iOS
npm run ios

# Android
npm run android

# Web
npm run web
```

### Debugging

- **React Query DevTools**: Press `Shift + M` in Expo and select "Open @dev-plugins/react-query" to view query cache and state
- **Supabase Dashboard**: Monitor database queries and real-time subscriptions

## 📝 Scripts

- `npm start` - Start Expo development server
- `npm run ios` - Start on iOS simulator
- `npm run android` - Start on Android emulator
- `npm run web` - Start web version

## 🔒 Security

- Row Level Security (RLS) policies protect user data
- Authentication required for all protected routes
- Anonymous posting option maintains user privacy
- Content moderation through reporting system

## 🐛 Troubleshooting

### Common Issues

1. **Supabase Connection Errors**
   - Verify your `.env` file has correct credentials
   - Check Supabase project is active
   - Ensure RLS policies allow your user to read/write

2. **TypeScript Errors**
   - Run `npm install` to ensure all dependencies are installed
   - Regenerate Supabase types if database schema changed

3. **Build Errors**
   - Clear Expo cache: `npx expo start -c`
   - Delete `node_modules` and reinstall

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is private and proprietary.

## 👥 Authors

Built for the university community.

---

**Note**: This app is designed specifically for university students and requires a valid university email address for authentication.