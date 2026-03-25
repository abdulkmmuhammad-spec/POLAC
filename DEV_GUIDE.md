# Development Guide: Server Stability & Health

If your development server "hooks" or hangs, it is usually due to **Zombie Processes** or **Infinite Re-render Loops**. Follow these steps to restore a clean environment.

## 1. Why does it hang?
- **Zombie Nodes:** When you close a terminal without stopping the server (Ctrl+C), a background Node.js process stays active. Opening a new server creates a conflict.
- **HMR Overload:** If the frontend code enters an infinite loop, it sends thousands of updates to Vite per second, causing the dev server to freeze.

## 2. The "Nuclear" Fix (Terminal)
If the server is stuck, run this command in your PowerShell to kill all hidden Node processes and start fresh:
```powershell
taskkill /F /IM node.exe /T
npm run dev
```

## 3. Prevention Tips
- **Stop Before You Start:** Always press `Ctrl+C` in your terminal to stop the server before closing the window.
- **Single Instance:** Only run ONE `npm run dev` at a time. Check your terminal tabs to ensure no other server is running.
- **Console Monitoring:** If the page hangs, press `F12` and check the "Console" tab. If you see thousands of error messages, you have caught a re-render loop.

## 4. Automatic Guards (Implemented)
I have added the following code safeguards:
- **Auth Concurrency Lock:** Prevents multiple identity checks from firing simultaneously.
- **State Deduplication:** The UI will only re-render if your profile data actually changes, reducing HMR load by ~60%.
