# Tauri Updater Setup

This project is configured to use the Tauri updater with GitHub releases.

## Configuration

The updater is already configured in `src-tauri/tauri.conf.json`:
- **Endpoint**: `https://github.com/Daborsten/TogMic/releases/latest/download/latest.json`
- **Signing**: Public key is configured
- **Artifacts**: Automatically generated during build

## GitHub Secrets Setup

To enable automatic releases, you need to add the following secrets to your GitHub repository:

### 1. TAURI_SIGNING_PRIVATE_KEY

This is the private key content generated with:
```bash
bunx tauri signer generate -w ~/.tauri/myapp.key
```

To add it to GitHub:
1. Go to your repository settings → Secrets and variables → Actions
2. Create a new secret named `TAURI_SIGNING_PRIVATE_KEY`
3. Paste the entire content of your private key file (usually at `~/.tauri/myapp.key`)

### 2. TAURI_SIGNING_PRIVATE_KEY_PASSWORD (if you set one)

If you set a password when generating the key:
1. Create a new secret named `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
2. Enter the password

## Creating a Release

The workflow is triggered in two ways:

### 1. Push a Git Tag (Recommended)
```bash
git tag v0.1.0
git push origin v0.1.0
```

### 2. Manual Trigger
Go to Actions → Release → Run workflow

## What the Workflow Does

1. **Builds** the app for all platforms (Windows, macOS, Linux)
2. **Signs** the installers using your private key
3. **Generates** `latest.json` with update information
4. **Creates** a GitHub release with:
   - Installers for each platform
   - Signatures (`.sig` files)
   - `latest.json` for the updater

## How the Updater Works

When users run your app:
1. The app checks the endpoint for `latest.json`
2. If a newer version exists, a dialog prompts the user to update
3. The update is downloaded and verified using the public key
4. The update is installed automatically

## Testing

To test the updater:
1. Install version 0.1.0
2. Release version 0.2.0
3. Run the app - it should prompt to update

## Important Notes

- The workflow creates **draft releases** by default - review and publish them manually
- Keep your private key secure and never commit it to the repository
- The public key in `tauri.conf.json` is safe to commit
- Update the version in `tauri.conf.json` and `package.json` before creating a new release
