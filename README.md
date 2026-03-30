# Intern Tracking System

A full-stack internship management platform for tracking interns, tasks, attendance, performance, notifications, badges, and certificate readiness.

## Live Links

- Frontend: `https://intern-tracking-system-seven.vercel.app`
- Backend: `https://intern-tracking-api-system.onrender.com`
- Backend Health: `https://intern-tracking-api-system.onrender.com/api/health`

## Overview

This project now includes both an admin experience and an intern experience:

- Admin login and registration
- Separate intern login portal
- Admin dashboard with interactive widgets, charts, alerts, and filters
- Intern dashboard with personal profile, tasks, attendance, inbox, and certificates
- Task assignment with start date and deadline
- Automatic intern update flow from intern to admin/mentor
- Certificate readiness tracking and certificate download
- Automatic performance-based badge assignment
- Email notifications and broadcast announcements
- Persistent stored data through MongoDB or fallback local storage

## Current Feature Set

### Admin Side
- Dashboard summary cards with click-through navigation
- Intern management with add, edit, and detail views
- Domain-based intern records
- Project and task monitoring
- Attendance tracking and evaluation cards
- Certificates dashboard
- Performance badge dashboard
- Admin profile editing
- Admin password change
- Notification audit and email delivery status
- Direct email to individual interns
- Broadcast announcements to selected or all interns

### Intern Side
- Separate intern login
- My Profile page
- Editable intern profile
- Profile photo upload
- Task tracking and progress updates
- Attendance view
- Inbox for announcements and updates
- Dedicated certificates dashboard
- Certificate download when eligible
- Automatic earned badges based on performance
- Password change

## Badge Logic

Badges are now assigned automatically from overall performance. Every intern receives at least one badge.

Current badge set:

- `Elite Achiever`
- `Rising Star`
- `Consistency Star`
- `Completion Champion`
- `Excellence in Execution`
- `Progress Builder`

Badges are determined from:

- overall performance score
- attendance consistency
- task completion quality

## Certificate Logic

Certificates are generated when:

- attendance is at least `85%`
- all assigned tasks/projects are completed

Once those conditions are met, the intern certificate becomes downloadable from both the admin and intern certificate dashboards.

## Email Notifications

The backend supports automatic mail updates for:

- task assignment
- absent attendance
- behind-schedule task progress
- due-today reminders
- overdue task reminders
- admin direct mail
- admin broadcast announcements

If SMTP is not configured, mail events are saved in the fallback outbox file:

- `backend/BE/data/email_outbox.json`

## Tech Stack

- Frontend: Vite + React + Vanilla CSS
- Backend: FastAPI
- Database: MongoDB with fallback local JSON persistence
- Containerization: Docker + Docker Compose

## Project Structure

- `frontend/FE`: React frontend
- `backend/BE`: FastAPI backend
- `backend/BE/app/services/notifications.py`: notification and mail logic
- `backend/BE/data/fallback_db.json`: fallback persistent data store
- `docker-compose.yml`: app orchestration

## Local Run

### Backend

1. Open `backend/BE`
2. Start the API:

```powershell
venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Backend health:

- `http://127.0.0.1:8000/api/health`

### Frontend

1. Open `frontend/FE`
2. Start the frontend:

```powershell
npm run dev -- --host 127.0.0.1 --port 5174
```

Frontend URL:

- `http://127.0.0.1:5174`

## Docker Run

1. Open the project root
2. Run:

```bash
docker-compose up --build
```

Then open:

- Frontend: `http://localhost:5173`
- API docs: `http://localhost:8000/docs`

## Demo Credentials

### Admin

- Email: `admin@interntrack.com`
- Password: `admin123`

### Interns

- Aarav Sharma
  - Email: `aarav.sharma@example.com`
  - Password: `intern123`

- chandan
  - Email: `chandanchandukv2005@gmail.com`
  - Password: `chandan123`

## Hosted Deployment

- Frontend hosted on `Vercel`
- Backend hosted on `Render`
- Database hosted on `MongoDB Atlas`

Deployment environment variables used for hosting:

### Backend

```env
MONGO_URI=your-mongodb-atlas-uri-with-database-name
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=your-sender-email
SMTP_PASSWORD=your-app-password
SMTP_FROM_EMAIL=your-sender-email
```

### Frontend

```env
VITE_API_BASE_URL=https://intern-tracking-api-system.onrender.com/api
```

## Demo Checklist

Use this order during a live demo:

1. Open the live frontend
2. Log in as admin
3. Show intern management, task assignment, attendance, evaluations, and certificates
4. Show intern login and profile, tasks, attendance, inbox, leave request, and certificate area
5. Show automatic badges and profile completion
6. Show email or announcement flow

## SMTP Setup

Copy `backend/BE/.env.example` to `backend/BE/.env` and configure:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=your-email@gmail.com
SMTP_PASSWORD=your-16-digit-app-password
SMTP_FROM_EMAIL=your-email@gmail.com
SMTP_USE_TLS=true
NOTIFICATION_POLL_SECONDS=900
```

Restart the backend after updating SMTP settings.

## Main API Routes

- `POST /api/auth/login`
- `POST /api/auth/register`
- `POST /api/auth/intern-login`
- `PATCH /api/auth/intern-password/{intern_id}`
- `GET /api/dashboard`
- `GET /api/dashboard/intern/{intern_id}`
- `GET /api/dashboard/certificates/{intern_id}/download`
- `GET /api/tasks/`
- `POST /api/tasks/`
- `PATCH /api/tasks/{task_id}`
- `PATCH /api/tasks/{task_id}/intern-update`
- `GET /api/interns/`
- `POST /api/interns/`
- `PATCH /api/interns/{intern_id}`
- `POST /api/interns/{intern_id}/message`
- `POST /api/interns/broadcast`
