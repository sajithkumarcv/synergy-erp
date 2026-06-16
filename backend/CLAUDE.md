# WebERP - Claude Code Context

## Project Overview
Full ERP system built with .NET Web API (backend) and React (frontend).
Business domain: Construction/Project-based company in UAE.
Multi-client product — each client gets isolated database and deployment.

## Repository Structure (Monorepo)
- Root: D:\Projects\WebERP\
- Backend API: D:\Projects\WebERP\backend\ (.NET Web API)
- Frontend: D:\Projects\WebERP\frontend\ (React - Create React App)
- GitHub: https://github.com/sajithkumarcv/weberp (Private)

## Git Branching Strategy
- main → production-ready releases only
- develop → daily integration branch (work here)
- feature/xxx → one branch per feature/module
- hotfix/xxx → urgent fixes off main
- Tags: v1.0-clientA, v1.0-clientB per client release

## Multi-Client Architecture
- Each client gets own database: ERPDB_ClientA, ERPDB_ClientB
- Backend config: appsettings.{ClientName}.json per client
- Frontend config: .env.{clientName} per client
- Same codebase, same schema, isolated data per client
- ASPNETCORE_ENVIRONMENT controls which appsettings loads on server

## Tech Stack
### Backend
- .NET Web API (C#)
- SQL Server (Database: ERPDB, Schema: proj)
- Dapper only — all DB access via stored procedures (sp_* naming)
- JWT authentication (sessionStorage for token on frontend)
- Controllers → Services → Repository pattern
- Async/await throughout
- FluentValidation for request validation
- Separate request/response DTOs

### Frontend
- React (Create React App)
- Axios for API calls
- Functional components with hooks
- Component per module/entity
- Environment variables prefixed with REACT_APP_
- Three themes: Ocean Blue, Midnight Dark, Forest Green (via ThemeContext)

## Dev Environment
- Backend runs on: http://localhost:7151
- Frontend runs on: http://localhost:3000
- Database: ERPDB on SP-SCS-SAJITH\SQLEXPRESS01
- Start backend: F5 in Visual Studio
- Start frontend: npm start in D:\Projects\WebERP\frontend\

## Database Conventions
- Schema: proj (all tables under proj schema)
- All tables use IDENTITY surrogate primary keys (Id)
- Human-readable codes in separate column (CUST-00001, PO-00001)
- DocumentCounter table for all transactional document numbering
- DocumentCounter columns: Module, Prefix, LastNumber

## ERP Modules & Status
### 1. Customer Master (Completed)
- B2B customers, multiple contact persons per customer
- Fields: name, email, phone, mobile, designation
- Credit limit, payment terms, customer segmentation
- Code format: CUST-00001

### 2. Job Module (Completed)
- Document-centric detail page pattern (/jobs list, /jobs/:jobId detail)
- jobConstants.js = single source of truth for status maps, transitions, tab configs
- Live Job ID preview using sp_PreviewJobId
- Role-based tab access

### 3. Procurement
- Purchase Request (PR)
- Purchase Order (PO)
- Goods Receipt Note (GRN)
- GRN reversal: LIFO cascading, prerequisite checks required

### 4. Inventory & BOM
- Stock management
- Bill of Materials
- Material Issue to Job (triggers job cost allocation)

### 5. Job Costing
- Cost allocated when material ISSUED to Job No. — NOT at PO or GRN stage
- Jobs track material, labour, overhead costs

### 6. Finance & Accounting
- General Ledger
- Accounts Payable/Receivable
- Cost reporting

## Business Rules (Critical)
1. PO → GRN → Stock (general inventory increases)
2. Material Issue → Job No. (job cost allocated HERE, not at PO stage)
3. All document codes auto-generated via DocumentCounter table
4. UAE-based business, default currency: AED
5. Multi-currency support required across all modules
6. All modules require: Approval Workflow, Audit Trail, Attachments,
   Comments, Status Tracking, Role-Based Security, Exchange Rates,
   Job/Project linkage

## API Conventions
- RESTful endpoints
- Base route: /api/[module]/[entity]
- Response wrapper: { success, data, message }
- All DTOs separated from domain models

## Coding Conventions
### Backend (C#)
- Stored procedures named: sp_* 
- Never write inline SQL — always stored procedures
- Controllers → Services → Repository pattern

### Frontend (React)
- No inline styles — use CSS classes
- CSS changes: always use str_replace, never rewrite full CSS files
- jobConstants.js pattern for all module constants

## Current Focus
Active development on develop branch. Building module by module:
Procurement (PR → PO → GRN) → Inventory → Job Costing → Finance → Sales