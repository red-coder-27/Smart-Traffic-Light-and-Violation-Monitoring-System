# Smart Traffic Light and Violation Monitoring System

A Java-based academic prototype for traffic monitoring and signal-control logic, developed as part of the **Smart Traffic Light and Violation Monitoring System** project.

---

## 📌 Project Overview

The project focuses on implementing and testing core traffic-monitoring logic that can support a smart traffic management system.

The current implementation contains Java modules for:

- Vehicle counting
- Traffic congestion analysis
- Traffic signal control
- Vehicle type representation

> **Current Scope:** This repository represents the currently implemented project increment. It does not claim that all planned system features are implemented.

### Emergency vehicle priority (software simulation)

The backend supports an operator-triggered emergency-priority simulation for
ambulances, fire engines, and police vehicles. This is **not** automatic vehicle
detection: the application has no connected vehicle sensors, GPS tracking, or
physical traffic-light controller. An Administrator or Traffic Police operator
must manually select an intersection, a configured approach, and the vehicle
type.

Before creating a request, an Administrator assigns a direction to each
applicable traffic signal in the existing Traffic signal management form.
Directions are optional in storage so existing signal records remain valid.
Only explicitly mapped approaches are offered for emergency requests.

All emergency-priority endpoints require a bearer token and either the
`ADMIN` or `TRAFFIC_POLICE` role:

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/emergency-priorities/options` | Active intersections and configured approaches |
| `GET` | `/api/emergency-priorities` | Recent request history |
| `POST` | `/api/emergency-priorities` | Validate and record a manual request |
| `POST` | `/api/emergency-priorities/:id/activate` | Activate a validated simulation |
| `POST` | `/api/emergency-priorities/:id/complete` | Record vehicle passage and restore normal state |
| `POST` | `/api/emergency-priorities/:id/cancel` | Cancel a request or restore after active priority |

Create a request with `intersectionId`, `direction` (`NORTH`, `EAST`, `SOUTH`,
or `WEST`), and `vehicleType` (`AMBULANCE`, `FIRE_ENGINE`, or
`POLICE_VEHICLE`). At most one requested or active priority is allowed per
intersection. Activation serializes controller operations and records each
signal transition in signal configuration history. A conflicting green phase
moves through its configured yellow interval, all approaches are set to red,
and a one-second simulated all-red clearance precedes the priority green.
Completion, cancellation, and the two-minute timeout move the priority signal
through yellow and red, clear all signals, then restore the previous green
approach when one existed. The server checks for expired requests every
15 seconds. The application has no autonomous per-intersection phase
scheduler, so restoration returns the saved signal-status snapshot (or
all-red when no approach was previously green); it does not resume a timed
hardware-controller cycle.

The additive Prisma migration is
`backend/prisma/migrations/20261027000000_add_emergency_priority/migration.sql`.
It preserves existing signal rows and leaves their new direction unset. Review
and apply migrations through the normal deployment process; do not reset or
recreate the database.

### Violation appeal submission

The application supports a formal violation appeal submission workflow allowing
citizens to contest recorded traffic citations linked to their account.

All violation appeal endpoints require authentication via Bearer token:

| Method | Path | Allowed Roles | Purpose |
|---|---|---|---|
| `GET` | `/api/appeals` | `ADMIN`, `TRAFFIC_POLICE`, `CITIZEN` | List submitted appeals (citizens see only their own) |
| `POST` | `/api/appeals` | `ADMIN`, `CITIZEN` | Submit a formal appeal for an eligible violation |
| `GET` | `/api/appeals/:id` | `ADMIN`, `TRAFFIC_POLICE`, `CITIZEN` | View details of a specific appeal |
| `PATCH` | `/api/appeals/:id/status` | `ADMIN`, `TRAFFIC_POLICE` | Review and update appeal status (`APPROVED` or `REJECTED`) |

To appeal, a citizen supplies a valid `violationId` and an appeal `reason`
(10 to 1000 characters). Submissions start in `PENDING` status. Submitting an appeal
does not automatically cancel, pause, or modify fines or challans. Duplicate appeals
for the same violation are rejected with a 409 Conflict. Citizens cannot view or appeal
violations belonging to other accounts. Only `ADMIN` and `TRAFFIC_POLICE` roles may
approve or reject appeals with mandatory review records.

The additive Prisma migration is
`backend/prisma/migrations/20261029000000_add_violation_appeals/migration.sql`.
Review and apply migrations through the normal deployment process; do not reset or
recreate the database.

---

## 🛠️ Technology Stack

| Technology | Purpose |
|---|---|
| Java 17 | Core application development |
| Apache Maven | Project build and dependency management |
| JUnit 5 | Unit testing |
| JaCoCo | Code coverage |
| Maven Surefire | Test execution |

---

## 📂 Project Structure

```text
Smart-Traffic-Light-and-Violation-Monitoring-System/
│
├── .gitignore
├── pom.xml
│
└── src/
    ├── main/
    │   └── java/
    │       └── com/
    │           └── trafficmonitor/
    │               ├── CongestionAnalyzer.java
    │               ├── TrafficSignalController.java
    │               ├── VehicleCounter.java
    │               └── VehicleType.java
    │
    └── test/
        └── java/
            └── com/
                └── trafficmonitor/
                    ├── CongestionAnalyzerTest.java
                    ├── TrafficSignalControllerTest.java
                    └── VehicleCounterTest.java
```

---

## ⚙️ Core Modules

### 1. VehicleCounter

Handles vehicle-counting logic based on different vehicle types.

### 2. CongestionAnalyzer

Performs traffic congestion analysis using vehicle-related data.

### 3. TrafficSignalController

Contains traffic signal control logic for traffic-management scenarios.

### 4. VehicleType

Represents the vehicle types used by the traffic-monitoring modules.

---

## 📋 Prerequisites

Make sure the following are installed:

- **JDK 17**
- **Apache Maven 3.9.x or later**
- **Git**

Verify Java:

```bash
java -version
```

Verify Maven:

```bash
mvn -version
```

Verify Git:

```bash
git --version
```

---

## 🚀 Getting Started

## CI

GitHub Actions runs the separate **Backend CI** and **Frontend CI** jobs for pull
requests targeting `main` and for pushes to `main`.

Backend CI installs dependencies, validates and generates Prisma Client, runs the
TypeScript check, executes the complete backend test suite, and checks diff
whitespace. It uses non-production CI-only PostgreSQL URLs because the current
tests do not connect to a database. Frontend CI runs ESLint and the production
Vite build. No deployment or production database migration is performed.

To reproduce the checks locally:

```bash
cd backend
npm ci
npx prisma validate
npx prisma generate
npm run typecheck
npm test

cd ../frontend
npm ci
npm run lint
npm run build
```

Production credentials are never stored in the repository or workflow. Future
deployment workflows should use GitHub Actions secrets for production database
URLs, JWT secrets, and hosting-provider credentials.

## Deployment

This section documents deployment configuration only. The application is not
currently deployed.

```text
Browser
  ↓
Vercel frontend
  ↓
Render backend
  ↓
Supabase PostgreSQL
```

### Vercel

The frontend is deployed from `/frontend` with:

- **Build Command:** `npm run build`
- **Output Directory:** `dist`
- **Environment Variable:** `VITE_API_BASE_URL=<Render backend URL>`

### Render

The backend is deployed from `/backend` with:

- **Build Command:** `npm ci && npm run build`
- **Pre-Deploy Command:** `npx prisma migrate deploy`
- **Start Command:** `npm start`
- **Health Check Path:** `/api/health`

Configure these environment variables in the Render dashboard:

- `DATABASE_URL=<Supabase pooled connection>`
- `DIRECT_URL=<Supabase direct connection>`
- `JWT_SECRET=<production secret>`
- `NODE_ENV=production`

Render provides `PORT` to the application. `DATABASE_URL` is used for the
runtime connection, while `DIRECT_URL` is preferred for Prisma migration
commands. Production migrations use:

```bash
npx prisma migrate deploy
```

Production environment variables and secrets must be configured through the
Vercel and Render dashboards, not committed to Git. Real `.env` files and
credentials must never be committed to the repository.

### 1. Clone the Repository

```bash
git clone https://github.com/red-coder-27/Smart-Traffic-Light-and-Violation-Monitoring-System.git
```

### 2. Navigate to the Project

```bash
cd Smart-Traffic-Light-and-Violation-Monitoring-System
```

### 3. Compile the Project

```bash
mvn clean compile
```

---

## 🧪 Running Tests

Run the complete JUnit test suite:

```bash
mvn clean test
```

### Current Test Suite

| Test Class | Tests |
|---|---:|
| `CongestionAnalyzerTest` | 12 |
| `TrafficSignalControllerTest` | 8 |
| `VehicleCounterTest` | 11 |
| **Total** | **31** |

### Latest Test Result

```text
Tests run: 31
Failures: 0
Errors: 0
Skipped: 0

BUILD SUCCESS
```

All currently implemented unit tests pass successfully.

---

## 📊 Code Coverage

The project uses **JaCoCo** for code coverage.

Running:

```bash
mvn clean test
```

generates the coverage report under:

```text
target/site/jacoco/
```

Open the following file in a browser:

```text
target/site/jacoco/index.html
```

The current test execution successfully generates the JaCoCo coverage report.

---

## 🔬 Testing

JUnit 5 is used for unit testing the core traffic-monitoring modules.

Current test classes:

- `CongestionAnalyzerTest`
- `TrafficSignalControllerTest`
- `VehicleCounterTest`

The test suite contains:

- Normal/valid test cases
- Boundary scenarios
- Invalid/exception scenarios where applicable

The complete suite currently executes successfully with:

```text
31 Tests
31 Passed
0 Failed
0 Errors
0 Skipped
```

---

## 🌿 Version Control

Git and GitHub are used for source-code version control.

### Main Branch

```text
main
```

### Repository

**GitHub:**  
https://github.com/red-coder-27/Smart-Traffic-Light-and-Violation-Monitoring-System

Development should be performed through meaningful incremental changes and commits.

Example:

```bash
git add .
git commit -m "Implement traffic signal control logic"
git push
```

---

## 📈 Development Workflow

The project follows an incremental development approach:

```text
Requirement
     ↓
Jira Story
     ↓
Implementation
     ↓
Testing
     ↓
Git Commit
     ↓
GitHub
```

Each implemented feature should be supported by corresponding source code and testing evidence.

---

## 🎯 Current Implementation Scope

The current repository contains the implemented Java traffic-monitoring core and its unit tests.

The broader project plan contains additional functionality such as:

- User Authentication
- Citizen Registration
- Role-Based Access Control
- User Profile Management
- Change Password
- Traffic Signal Management
- Intersection Management
- Traffic Violation Recording
- Evidence Management
- Digital Challan Generation
- View Challans
- Fine Payment Simulation
- Submit Violation Appeal
- Traffic Reports and Analytics
- Emergency Vehicle Priority

These features should only be marked as implemented after their corresponding functionality has actually been developed and tested.

---

## 🔮 Future Development

Future development will extend the current traffic-monitoring core according to the project's backlog and sprint plan.

Planned areas include:

- Additional traffic signal functionality
- Intersection management
- Traffic violation management
- Evidence handling
- Digital challan functionality
- Citizen-facing features
- Traffic reports and analytics
- Emergency vehicle priority

---

## 👥 Team

**Team:** Team 04

**Project:** Smart Traffic Light and Violation Monitoring System

This project is developed as part of the **Software Engineering and Agile Practices** coursework.

---

## 📄 Project Status

| Area | Status |
|---|---|
| Java project setup | ✅ Completed |
| Maven build | ✅ Working |
| Core traffic modules | ✅ Implemented |
| JUnit 5 testing | ✅ Implemented |
| Unit tests | ✅ 31/31 passing |
| JaCoCo coverage | ✅ Generated |
| Git repository | ✅ Configured |
| GitHub repository | ✅ Connected |
| Additional system features | 🚧 Future increments |

---

## Development Workflow

All changes should be developed on a feature branch and merged into `main` through a pull request after CI checks pass.

## 📜 License

This project is developed for academic purposes.