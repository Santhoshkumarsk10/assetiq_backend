# AssetIQ - IT Asset Management & Onboarding API (Backend)

AssetIQ Backend is a high-performance RESTful API built on **Node.js**, **Express.js**, and **Sequelize ORM** with MySQL. It handles organization-wide multi-tenant scoping, real-time WebSockets communication, location-scoped RBAC, support ticket lifecycles, and a server-side Excel/PDF report generation engine.

## 📋 Table of Contents

- [Core Features](#-core-features)
- [Tech Stack](#%EF%B8%8F-tech-stack)
- [Prerequisites](#-prerequisites)
- [Setup & Installation](#-setup--installation)
- [Database Management](#-database-management)
- [Running the Server](#-running-the-server)
- [API Route Documentation](#-api-route-documentation)
  - [Authentication](#authentication)
  - [Reports System & Filters](#reports-system--filters)
  - [Excel & PDF Exports](#excel--pdf-exports)
  - [Health Check](#health-check)
- [Security Considerations](#-security-considerations)
- [Troubleshooting](#-troubleshooting)

---

## 🚀 Core Features

- **RESTful Endpoints**: Dedicated controllers handling CRUD operations for Assets, Tickets, Users, Locations, and Software Licenses.
- **RBAC & Data Scoping**: Automatic request filtering scoping based on role (Super Admin, Location Admin, User) to isolate site-specific details.
- **Support Ticket Engine**: Formal ticket status transitions, handling assignment locks and resolutions.
- **Automated Export Services**: Native compiler endpoints that generate clean Excel worksheets and PDF documents.
- **Real-time Event Broadcaster**: WebSockets implementation (Socket.io) broadcasting key system events (e.g. ticket updates or new allocations).
- **Email Dispatch Service**: NodeMailer integration to send transaction receipts and onboarding codes.

---

## 🛠️ Tech Stack

- **Runtime Environment**: [Node.js](https://nodejs.org/) (v16.x or higher)
- **Framework**: [Express.js](https://expressjs.com/)
- **ORM & DB Adapter**: [Sequelize](https://sequelize.org/) with `mysql2` driver
- **Password Security**: [bcryptjs](https://github.com/kelektiv/node-bcrypt)
- **Session Tokens**: JWT (`jsonwebtoken`) with dual Access/Refresh token rotation
- **Excel Writer**: [xlsx](https://sheetjs.com/) (SheetJS)
- **PDF Document Designer**: [pdfkit](https://pdfkit.org/)
- **Notification Client**: [nodemailer](https://nodemailer.com/)
- **WebSocket Engine**: [socket.io](https://socket.io/)

---

## 📦 Prerequisites

- **Node.js** (v16.0.0 or higher)
- **npm** (v7.0.0 or higher)
- **MySQL Server** instance running locally or on a remote host

---

## 📂 Setup & Installation

### 1. Clone & Dependencies

```bash
git clone <repository-url>
cd assetiq_backend
npm install
```

### 2. Configure Environment

Create a `.env` file in the root folder:

```ini
PORT=5003
NODE_ENV=development

# Database Settings
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=assetiq_user
DB_PASS=assetiq_password
DB_NAME=assetiq_db

# JWT Keys
JWT_SECRET=your_super_secret_access_key
JWT_REFRESH_SECRET=your_super_secret_refresh_key
JWT_EXPIRY=24h
JWT_REFRESH_EXPIRY=7d

# Email Config
ENABLE_EMAILS=false
MAIL_HOST=smtp.mailtrap.io
MAIL_PORT=2525
MAIL_USER=your_smtp_username
MAIL_PASS=your_smtp_password
MAIL_FROM_ADDRESS=noreply@assetiq.com
MAIL_FROM_NAME="AssetIQ Notifications"
```

---

## 🗄️ Database Management

Sequelize models are mapped to the relational schema using standard migrations.

### Run Database Migrations
```bash
node src/scripts/runMigrations.js
```

### Seed Initial Records
Creates roles, default locations, and the primary admin account:
```bash
node src/scripts/seedDatabase.js
```

### Hard Recreate Database (Destructive)
Drops all schema tables and re-initializes clean:
```bash
node src/scripts/recreateDatabase.js
```

---

## 🚀 Running the Server

### Development Mode (with Nodemon auto-reload)
```bash
npm run dev
```

### Production Mode
```bash
npm start
```

---

## 📡 API Route Documentation

All API endpoints are prefixed with `/api`. Protected routes require a valid bearer token:
```
Authorization: Bearer <your_jwt_token>
```

### Authentication

#### User Login
```http
POST /api/auth/login
```
- **Body**: `{ "email": "admin@assetiq.com", "password": "password" }`
- **Response**: Returns accessToken, refreshToken, and user metadata details.

---

### Reports System & Filters

All report routes are `POST` endpoints to support complex JSON query configurations. They dynamically apply pagination, text search, date filtering, and RBAC location locks.

#### 1. Inventory Report
```http
POST /api/reports/inventory
```
- **Parameters**:
  ```json
  {
    "paginate": true,
    "page": 1,
    "limit": 10,
    "search": "macbook",
    "location_id": 2,
    "type": "laptop",
    "status": "allocated",
    "startDate": "2026-01-01",
    "endDate": "2026-07-21"
  }
  ```

#### 2. Allocation Report
```http
POST /api/reports/allocations
```
- **Parameters**: `search`, `status` (active / returned), `startDate`, `endDate`, `location_id`.

#### 3. Tickets Support Report
```http
POST /api/reports/tickets
```
- **Parameters**: `search`, `category`, `priority`, `status`, `location_id`, `startDate`, `endDate`.

#### 4. Software License Report
```http
POST /api/reports/licenses
```
- **Parameters**: `search`, `status` (active / expired), `startDate`, `endDate`, `location_id`.

#### 5. System Audit Trail Report
```http
POST /api/reports/audit-logs
```
- **Parameters**: `search`, `action`, `startDate`, `endDate`.

---

### Excel & PDF Exports

Generates a formatted binary download from reports telemetry based on active parameters.

```http
POST /api/reports/export
```
- **Headers**:
  ```
  Authorization: Bearer <token>
  Content-Type: application/json
  ```
- **Parameters**:
  ```json
  {
    "reportType": "inventory" | "allocations" | "tickets" | "licenses" | "audit-logs",
    "format": "excel" | "pdf",
    "search": "",
    "status": "available",
    "location_id": 1,
    "startDate": "2026-01-01",
    "endDate": "2026-07-21"
  }
  ```
- **Response**:
  - `excel`: Returns `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` stream containing the Excel workbook.
  - `pdf`: Returns `Content-Type: application/pdf` stream containing a landscape-oriented document with headers, zebra striping, and text wrapping.

---

### Health Check

```http
GET /api/heartBeat
```
- **Response**: `"Aux AssetCare API working...!"` (Status `200 OK`)

---

## 🔐 Security Considerations

- **Multi-Tenant Isolation**: Scoping is handled implicitly in SQL queries based on the authenticated user's `req.user.role_name` and `req.user.location_id`.
- **Secrets Management**: Keep the `.env` out of git commits. Generate random high-entropy strings for your JWT secrets.
- **Hashing**: All passwords stored in MySQL are hashed using standard `bcryptjs` with salt round `10`.

---

## 🐛 Troubleshooting

- **EADDRINUSE (Port Conflict)**: Run `npx kill-port 5003` to clear the listener.
- **Sequelize connection failures**: Ensure your local MySQL server is active and verified by pinging it. Confirm credential strings in `.env`.