# Server Manager - React Native App

A production-ready React Native/Expo Android app for managing SSH servers with health monitoring, quick actions, and secure credential storage.

## Features

- **Server Management**: Add, edit, delete servers with secure credential storage
- **SSH Integration**: Connect via password or SSH key authentication
- **Quick Actions**: 12 pre-built actions (service restart, logs, deployment, system stats)
- **Health Monitoring**: Background health checks with push notifications
- **OTA Updates**: Automatic app updates via Expo Updates

## Tech Stack

- **Framework**: React Native + Expo SDK 50
- **Navigation**: React Navigation 6
- **SSH**: @dylankenneally/react-native-ssh-sftp
- **Storage**: expo-secure-store (hardware-backed encryption)
- **Background Tasks**: expo-background-fetch + expo-task-manager
- **Testing**: Jest + React Native Testing Library

## Project Structure

```
server-manager/
├── src/
│   ├── components/          # Reusable UI components
│   │   ├── FormInput.tsx
│   │   ├── StatusBadge.tsx
│   │   ├── LoadingSpinner.tsx
│   │   ├── Toast.tsx
│   │   └── EmptyState.tsx
│   ├── screens/             # App screens
│   │   ├── ServerListScreen.tsx
│   │   ├── AddServerScreen_Enhanced.tsx
│   │   ├── ServerDetailsScreen.tsx
│   │   └── SettingsScreen.tsx
│   ├── services/            # Business logic
│   │   ├── CredentialService.ts
│   │   ├── SSHService.ts
│   │   ├── ActionService.ts
│   │   └── MonitoringService.ts
│   ├── types/               # TypeScript types
│   │   ├── index.ts
│   │   └── actions.ts
│   ├── templates/           # Quick action templates
│   │   └── default-actions.json
│   ├── utils/               # Utility functions
│   │   └── validation.ts
│   ├── navigation.tsx       # Navigation configuration
│   └── __tests__/           # Unit tests
├── app.json                 # Expo configuration
├── eas.json                 # EAS Build configuration
├── package.json
└── App.tsx
```

## Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn
- Expo CLI: `npm install -g expo-cli eas-cli`

### Installation

```bash
# Clone the repository
cd code/server-manager

# Install dependencies
npm install

# Start development server
npx expo start

# Run on Android
npx expo start --android
```

### Testing

```bash
# Run all tests
npm test

# Run tests with coverage
npm test -- --coverage

# Type checking
npm run type-check
```

## Building for Production

### Setup EAS

```bash
# Login to Expo
eas login

# Configure project
eas build:configure
```

### Build APK (for testing)

```bash
eas build --platform android --profile preview
```

### Build AAB (for Play Store)

```bash
eas build --platform android --profile production
```

### Publish OTA Update

```bash
eas update --branch production --message "Bug fixes and improvements"
```

## CI/CD Pipeline

GitHub Actions automatically:

1. **On every push**: Run tests and type checking
2. **On main branch**: Build preview APK
3. **On main branch**: Publish OTA update
4. **On main branch**: Build production AAB (for releases)

Required secrets in GitHub:
- `EXPO_TOKEN`: Get from `eas whoami` and create token at expo.dev

## Configuration

### app.json

Update these fields:
- `expo.updates.url`: Your project's update URL
- `expo.extra.eas.projectId`: Your EAS project ID

Get these by running:
```bash
eas init
```

### Environment Variables

The app uses these optional environment variables (configure via EAS Secrets):
- None required for basic functionality
- All credentials stored securely on-device

## Security

- **Credentials**: Stored in expo-secure-store with hardware-backed encryption
- **SSH Keys**: Never logged or exposed
- **Biometric Protection**: Optional Face ID/Fingerprint unlock
- **Network**: All SSH connections use industry-standard encryption

## Quick Actions

12 pre-built actions included:

1. **Service Restart** - Restart systemd services
2. **View Logs** - Tail application logs
3. **Check Disk Space** - df -h output
4. **System Stats** - CPU, memory, uptime
5. **Docker PS** - Running containers
6. **Git Pull** - Update repository
7. **PM2 Status** - Node.js processes
8. **Nginx Reload** - Reload web server
9. **Database Backup** - Automated backups
10. **Clear Cache** - Remove temp files
11. **Network Test** - Ping and connectivity
12. **Process Monitor** - Top running processes

Add custom actions by editing `src/templates/default-actions.json`.

## Troubleshooting

### SSH Connection Fails

- Verify host, port, and credentials
- Check server firewall rules
- Ensure SSH service is running
- Test with password auth first, then key auth

### Background Monitoring Not Working

- Grant notification permissions
- Enable background app refresh (Android settings)
- Check battery optimization settings

### Build Failures

- Clear cache: `npx expo start -c`
- Clear node_modules: `rm -rf node_modules && npm install`
- Update Expo: `npx expo install --fix`

## Roadmap

- [ ] iOS support
- [ ] Multi-server SSH tunnels
- [ ] Server groups and tags
- [ ] Custom action builder UI
- [ ] Export/import server configs
- [ ] SSH session recording

## Contributing

This is a personal project, but suggestions welcome via issues.

## License

MIT License - See LICENSE file for details

## Support

For issues or questions:
- GitHub Issues: [Your repo URL]
- Email: dutchiono@gmail.com
EDIT TO TRIGGER
