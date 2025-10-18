# Contributing to Digital Time Capsule Viewer

Thank you for your interest in contributing to the Digital Time Capsule Viewer! This is a web application for viewing digital time capsule archives.

## Getting Started

### Prerequisites
- Node.js (v18 or higher)
- npm or yarn package manager

### Local Development Setup

1. **Clone the repository**
```bash
git clone <your-repo-url>
cd digital-time-capsule
```

2. **Install dependencies**
```bash
npm install
```

3. **Start development server**
```bash
npm run dev
```

The application will be available at `http://localhost:3000`

### Project Structure
```
src/
├── core/              # Main application classes
├── services/          # File processing services
├── utils/             # Utility functions
├── models/            # Data models
└── main.js            # Application entry point
```

## Development Workflow

### Building for Production
```bash
npm run build
```

### Code Style
- Follow ESLint configuration provided in the project
- Use meaningful variable and function names
- Write clear comments for complex logic

### Testing
```bash
npm run lint
```

## Creating a Pull Request

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Commit your changes (`git commit -m 'Add amazing feature'`)
5. Push to the branch (`git push origin feature/amazing-feature`)
6. Open a Pull Request

## Architecture Overview

The application is built with Vite and uses:
- **PDF.js** for PDF processing
- **JSZip** for archive handling
- **Papa Parse** for CSV processing
- Modern JavaScript (ES6+) with modular architecture

## File Formats Supported

- **Archives**: ZIP files containing manifest and content files
- **Manifest**: `manifest.txt` with pipe-separated format
- **Content Types**: PDF, images, audio, video, text, CSV files

## Archive Format Requirements

- `manifest.txt` with format: `filename | type | title | description | date | tags`
- Minimum requirements for validation:
  - 5+ NEWS files
  - 5+ MEDIA files
  - 2+ PERSONAL files
  - 5+ tags per file

## Questions?

If you have any questions, feel free to open an issue or contact the maintainers.

Thank you for contributing!
