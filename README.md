# Intern Tracking System

A full-stack internship management dashboard to track intern progress, attendance, task delivery, alerts, and certification readiness.

## What This Project Includes
- Summary stat cards for interns, completed tasks, pending work, and overdue items
- Intern overview table with mentor, attendance, task progress, and internship timeline
- Task completion chart
- Attendance heatmap
- Recent activity feed
- Low attendance and pending task alerts
- Certification readiness tracker
- Add intern workflow
- Task records with both `start_date` and `deadline`

## Tech Stack
- Frontend: Vite + React + Vanilla CSS
- Backend: FastAPI + MongoDB
- Containerization: Docker + Docker Compose

## Run With Docker
1. Open the project root.
2. Run `docker-compose up --build`.
3. Open `http://localhost:5173` for the frontend.
4. Open `http://localhost:8000/docs` for the API docs.

The backend seeds demo interns, tasks, attendance, and recent activity automatically when the database is empty, so the dashboard is usable immediately.

## Local Structure
- `frontend/FE`: React dashboard
- `backend/BE`: FastAPI API
- `docker-compose.yml`: app orchestration with frontend, backend, and MongoDB

## Main API Routes
- `GET /api/dashboard`
- `GET /api/interns`
- `POST /api/interns/`
- `GET /api/tasks`
- `POST /api/tasks/`
- `GET /api/attendance`
- `POST /api/attendance/`
