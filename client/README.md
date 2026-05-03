# 🌌 RepoScope

### The Next-Gen Repository Introspection & Database Visualizer

RepoScope is a high-performance, OS-like workspace designed to bridge the gap between **heavy Git engines** and **live code introspection**. It enables engineering teams to visualize complex repository structures, map database schemas, and resolve architectural regressions with zero latency.

---

## ✨ Key Features

### 🚀 The "Ghost File System"
Our proprietary virtualization engine allows the UI to handle repositories with **50,000+ files** at a smooth 60fps.
- **Decoupled State**: Prevents the UI thread from "choking" during heavy Git operations.
- **Async Worker Diffs**: Offloads complex diff calculations to Web Workers.
- **Virtualized Trees**: Efficiently renders deep folder hierarchies using `react-virtuoso`.

### 🔍 Deep Introspection
- **Framework Analysis**: Automatic detection and mapping of Django, FastAPI, and Prisma structures.
- **Live DB Mapping**: Generate interactive ER diagrams directly from your source code models.
- **Security Scanning**: Automated PR analysis to catch sensitive data leaks before deployment.

### 🎨 Premium Workspace
- **Glassmorphism Aesthetic**: A sleek, modern design with vibrant accents and smooth animations.
- **Unified Command Center**: Integrated repository search, branch management, and analysis tools.
- **Multi-Panel Layout**: A dense, OS-inspired interface optimized for deep work.

---

## 🛠️ Technology Stack

- **Core**: React 19, TypeScript 6
- **Build System**: Vite 8 + Rolldown
- **Animations**: Framer Motion
- **Icons**: Lucide React + Custom SVG System
- **Server**: FastAPI + Celery + Redis

---

## 🚀 Installation & Setup

### Client
1. Navigate to the `client` directory.
2. Ensure you are in your target environment (WSL or Windows).
3. Run `npm install`.
4. Start the dev server: `npm run dev`.

### Server
1. Navigate to the `server` directory.
2. Install requirements: `pip install -r requirements.txt`.
3. Start the FastAPI server and Celery workers.

---

## 🛡️ Best Practices

- **Avoid Main-Thread Blocking**: Use the provided `treeUtils.ts` helpers for data transformations.
- **Design Consistency**: Stick to the tokens in `index.css` (e.g., `--bg-glass`, `--accent-primary`).
- **Cross-Platform Work**: If working in WSL, ensure you perform a clean `npm install` inside the Linux environment.

---

## 📄 License
MIT License. Created by Raman Sharma.
