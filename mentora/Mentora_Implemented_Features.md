# 🚀 Mentora - Implemented Features

Welcome to the feature documentation for **Mentora**. This document outlines all the core functionalities, architectural decisions, and visual aesthetics that have been implemented in the application so far.

---

## 🎨 Global UI & UX Aesthetics
Mentora was built with a strong emphasis on a highly premium, state-of-the-art user experience.
* **iOS 18 Glassmorphism**: Heavy use of `expo-blur` to create stunning, frosted glass overlays across all cards, banners, and navigation elements.
* **Dynamic Theme Engine**: Full support for Light and Dark modes. 
  * **Dark Mode**: Utilizes deep charcoal/matte frosted glass that seamlessly blends with the dark background.
  * **Light Mode**: Features pure, highly translucent frosted glass.
* **Global Watermark**: A signature Mentora logo watermark sits at the absolute bottom layer of the application (at 40% opacity), elegantly peeking through the blurred frosted glass cards as the user scrolls over it.
* **Pill-Shaped Architecture**: UI components (like the navigation bar and course cards) heavily utilize smooth, 100% rounded "pill" shapes for a soft, approachable, and highly modern aesthetic.

---

## 🔐 Authentication & Onboarding
Fully integrated with **Supabase Auth** for secure user management.
* **Role-Based Routing**: Users select their role (Student or Teacher) during onboarding, which dynamically dictates their dashboard experience.
* **Student Onboarding**: Captures essential data including First/Last Name, School, Grade Level, and specific Syllabus/Board (e.g., Cambridge, ZIMSEC).
* **Teacher Onboarding**: Captures professional details, verified status, and specific subjects taught.

---

## 📊 Dashboards
The home screen dynamically renders different dashboards based on the user's authenticated role.

### Student Dashboard
* **Personalized Greeting**: Welcomes the student by name.
* **Community Stats**: Queries the database to show exactly how many other students from their specific school are currently on Mentora.
* **Career Hub Access**: A dedicated portal for exploring universities, scholarships, and future career roadmaps.
* **Available Teachers**: A horizontally scrollable list of active, verified teachers that students can connect with.

### Teacher Dashboard
* Provides a specialized view for educators to manage their classes, view analytics, and interact with students.

---

## 📚 Courses & Learning
* **AI Exam Intelligence**: A prominent, frosted-glass banner that acts as the entry point for turning static past papers into an interactive AI tutor.
* **Syllabus-Tailored Curriculum**: Courses are fetched from Supabase and dynamically displayed based on the user's selected board/level.
* **Pill-Shaped List Layout**: Courses are displayed as full-width horizontal rows (matching the tab bar aesthetic), complete with cover images (or dynamic icons) and a topic count badge.

---

## 🤝 Study Rooms
A collaborative environment for students to study together.
* **Categorized Rooms**: Supports both **Public** global rooms and private **School-specific** rooms.
* **Live Status Badges**: Displays whether a room is currently in **"Focus Mode"** (microphones/chat disabled) or **"Chat Open"**.
* **Participant Tracking**: Real-time counters showing how many students are currently active in the room.

---

## 👤 Profile & Settings
A centralized hub for user management.
* **Profile Header**: Displays the user's avatar, name, school, and role.
* **Theme Controller**: A live segmented control switch allowing the user to instantly toggle the app between System, Light, and Dark modes.
* **Frosted Menu Sections**: Highly polished glass sections for Account Settings, Notifications, and Help & Support.
* **Secure Sign Out**: Clears the Supabase session and correctly routes the user back to the authentication flow.
