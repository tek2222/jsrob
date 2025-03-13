# Python HTTP Server + JavaScript Web Application

This is a simple web application built with Python's built-in HTTP server backend and JavaScript frontend. It demonstrates basic CRUD operations for managing items.

## Project Structure

```
.
├── backend/
│   └── app/
│       └── main.py
├── frontend/
│   ├── public/
│   │   └── index.html
│   └── src/
│       └── main.js
└── venv/
```

## Setup

1. Create and activate the virtual environment (optional):
```bash
python3 -m venv venv
source venv/bin/activate  # On Windows: .\venv\Scripts\activate
```

## Running the Application

1. Start the Python backend:
```bash
cd backend
python app/main.py
```
The backend will be available at http://localhost:8000

2. For the frontend, use Python's built-in HTTP server:
```bash
cd frontend
python -m http.server 3000
```
The frontend will be available at http://localhost:3000/public

## Features

- Create, Read, Update, and Delete items
- Modern UI with Tailwind CSS
- Real-time updates
- RESTful API endpoints

## API Endpoints

- GET `/items` - Get all items
- POST `/items` - Create a new item
- PUT `/items/{item_id}` - Update an item
- DELETE `/items/{item_id}` - Delete an item

## Technologies Used

- Backend:
  - Python's built-in `http.server`
  - Python 3.9+

- Frontend:
  - Vanilla JavaScript
  - Tailwind CSS
  - HTML5
