# React Entity Picker Lab

A production-style React project focused on building **scalable, accessible, async entity pickers** under real-world constraints.

This repository is intentionally **engineering-driven**, showcasing performance, UX, and state-management decisions rather than visual polish.

## ✨ Highlights

- 🔍 Async search with debouncing
- ⛔ Request cancellation via `AbortController`
- ⚡ Virtualized dropdowns (10,000+ entities)
- ⌨️ Keyboard-first UX (Arrow keys, Enter, Escape, Backspace)
- 🧩 Single-select & multi-select APIs
- ➕ Create-new-entity flows
- 💾 State persistence with `localStorage`
- 🔗 Route-driven state hydration (URL ↔ app state)
- 📦 Fast ID → entity rehydration cache
- 📊 Search metrics (start / success / abort)

## 🧠 Why this project exists

Entity pickers appear simple, but become complex when you introduce:

- large datasets
- async APIs
- keyboard accessibility
- performance guarantees
- predictable state restoration

This project demonstrates **how to solve those problems cleanly**, without overengineering.

## 🧩 Architecture Overview

src/
├─ components/
│ ├─ EntityPicker.tsx # single-select picker
│ ├─ EntityMultiPicker.tsx # multi-select + chips + create
│
├─ demo/
│ ├─ DemoPage.tsx # app shell + routing + lab
│ ├─ TaskBoard.tsx # realistic usage scenario
│ ├─ useSearchMetrics.ts # lightweight observability
│
├─ data/
│ ├─ mockPeople.ts
│ ├─ mockPeopleBigResponse.ts
│ ├─ peopleIndex.ts # ID → entity cache
│
├─ hooks/
│ ├─ useDebouncedValue.ts


## 🖥 Demo Modes

### 1️⃣ TaskBoard (Real Application Context)

A small task-management UI demonstrating:

- persisted tasks (localStorage)
- assignees & watchers using entity pickers
- URL-based task selection (`/tasks/:id`)
- hydration after refresh (IDs → real names)

This shows how the picker behaves **inside a real app**, not just in isolation.


### 2️⃣ Component Lab (Engineering Playground)

Toggleable **Lab** section used to stress-test the components:

- Adjustable `debounceMs`, `minChars`, `maxSelected`
- Dataset switching (small vs 10,000 entities)
- Virtualization on/off
- Disabled states
- Custom `renderItem`
- Create-entity scenarios

This mirrors **internal tooling** used by frontend teams to validate behavior.

## 📚 Storybook

Storybook is included to document:

- component APIs
- visual states
- edge cases
- integration expectations

**Storybook** → component contracts  
**Lab UI** → runtime behavior & performance

## 🚀 Getting Started

```bash
npm install
npm run dev
```

```bash
npm run storybook
```
