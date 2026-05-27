# Hiraya - Supplier Fulfillment Portal

This project was built with React, Vite, and Tailwind CSS.

## Getting Started Locally

To run this project on your local machine, follow these steps:

1. **Extract the ZIP file** to a logic folder.
2. **Open the folder in VS Code**.
3. **Open a terminal** in VS Code (`Ctrl + ` or `View > Terminal`).
4. **Install dependencies**:
   ```bash
   npm install
   ```
   *Note: This downloads all necessary libraries (React, Express, Vite, etc.) into your `node_modules` folder.*
5. **Start the development server**:
   ```bash
   npm run dev
   ```
   *Note: This starts the Express server which also serves the Vite frontend. The server will run on `http://localhost:3000`.*
6. **Open your browser** to `http://localhost:3000`.

## Working with Firebase

This app uses Firebase Realtime Database for the EDI flow. To use your own Firebase:
1. Create a project at [console.firebase.google.com](https://console.firebase.google.com/).
2. Get your web config and put it in a `.env` file or update `src/lib/firebase.js`.
3. If you just want to see the UI, the mock mode is partially supported.

## Building for Production

To create a production build:
```bash
npm run build
```
The output will be in the `dist/` folder.

## Environment Variables

If the project uses AI features, make sure to set your `GEMINI_API_KEY` in a `.env` file at the root:
```env
GEMINI_API_KEY=your_key_here
```
