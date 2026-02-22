# LeetCode Widget

A lightweight Electron desktop widget that sits on your home screen/desktop and gives you a quick snapshot of your LeetCode progress.

## Highlights

- Total solved count + difficulty breakdown (Easy / Medium / Hard)
- "Solved today" count
- 7-day activity graph (problems solved per day)
- No login required (only your username)

## Features

- Total problems solved
- Difficulty-wise breakdown (Easy / Medium / Hard)
- Daily progress (today's solved count)
- 7-day activity graph
- Runs as a desktop widget (separate from the browser)

## Tech stack

- Electron.js
- HTML / CSS / JavaScript
- Chart.js (loaded via CDN)

## Installation

### Windows (recommended)

Download the pre-built installer from GitHub Releases:

1. Go to the [**Latest Release**](https://github.com/abdul8704/Leetcode-widget/releases/latest)
2. Under **Assets**, download the `.exe` file (e.g. `LeetCodeWidget-Setup-x.x.x.exe`)
3. Run the installer and launch the widget

#### ⚠️ Windows Security Warnings

Since the app is **not code-signed**, Windows will show security warnings during installation:

- **Microsoft Defender SmartScreen** — You may see a popup saying *"Windows protected your PC"*. Click **"More info"** → **"Run anyway"** to proceed.
- **Windows Security / Antivirus** — Your antivirus may flag the installer as unrecognized. You can safely allow it — the app is open-source and the source code is fully available in this repository.
- **Browser download warning** — Your browser (Chrome, Edge, etc.) might warn that the file *"is not commonly downloaded"*. Click **"Keep"** or **"Keep anyway"** to save the file.

These warnings appear because the app has not been signed with a paid code-signing certificate. They do **not** indicate malware.

---

### macOS / Linux (build from source)

There is no pre-built installer for macOS or Linux yet. You can build one yourself from source:

#### Prerequisites

- [Node.js](https://nodejs.org/) (LTS recommended)
- npm (comes with Node.js)

#### Steps

1. **Clone the repository**
   ```bash
   git clone https://github.com/abdul8704/Leetcode-widget.git
   cd Leetcode-widget
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Build the installer**
   ```bash
   npm run dist
   ```

4. **Find the installer** in the `release/` directory:
   - macOS → `.dmg` file
   - Linux → `.AppImage` file

5. **Install and run**
   - **macOS**: Open the `.dmg`, drag the app to **Applications**, and launch it. You may need to go to **System Preferences → Privacy & Security** and click **"Open Anyway"** since the app is unsigned.
   - **Linux**: Make the AppImage executable and run it:
     ```bash
     chmod +x LeetCodeWidget-*.AppImage
     ./LeetCodeWidget-*.AppImage
     ```

---

### Run from source (all platforms)

If you just want to run the app without creating an installer:

```bash
npm install
npm start
```

## Data source

By default, the widget fetches data from a hosted API endpoint, which uses LeetCode's public GraphQL API under the hood.

If you want to run the API locally, see the repo root README.

## Limitations

- Data accuracy depends on API availability
- No offline mode
- No auto-update support (yet)

## Contributing

Contributions are welcome — feel free to open an issue or submit a pull request.

