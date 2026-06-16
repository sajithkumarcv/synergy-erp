# ERP Web System - Claude Code Context

## Project Overview
Full ERP system built with .NET Web API (backend) and React (frontend).
Business domain: Construction/Project-based company in UAE.

## Repository Structure
- Backend API: D:\Projects\ERPWEB\ (.NET Web API)
- Frontend: D:\Projects\React\weberp\ (React)

## Tech Stack
### Backend
- .NET Web API (C#)
- SQL Server
- Dapper only — all DB access via stored procedures (sp_* naming)
-Add proj schema for all tables
-Add ERPDB as database name
-Add JWT auth details
-Add sessionStorage for token storage

### Frontend
- React
- Axios for API calls

## Database Conventions
- All tables use IDENTITY/AUTO_INCREMENT surrogate primary keys (Id)
- Human-readable codes stored in separate column (e.g. CUST-00001, PO-00001)
- DocumentCounter table handles scoped auto-numbering for all transactional documents
- DocumentCounter columns: Module, Prefix, LastNumber

## ERP Modules & Status

### 1. Procurement
- Purchase Request (PR)
- Purchase Order (PO)
- Goods Receipt Note (GRN)
- PO replenishes GENERAL inventory (not job-specific)
- Job cost allocation happens at MATERIAL ISSUE stage, not PO stage

### 2. Inventory & BOM
- Stock management
- Bill of Materials
- Material Issue to Job (triggers job cost allocation)

### 3. Job Costing
- Cost allocated when material is ISSUED to a Job No.
- Not at PO or GRN stage
- Jobs track material, labour, overhead costs

### 4. Finance & Accounting
- General Ledger
- Accounts Payable/Receivable
- Cost reporting

### 5. Customer Master (Completed)
- B2B customers
- Multiple contact persons per customer (name, email, phone, mobile, designation)
- Credit limit, payment terms, customer segmentation
- Human-readable code: CUST-00001 format

## API Conventions
- RESTful endpoints
- Base route: /api/[module]/[entity]
- Response wrapper: { success, data, message }
- All DTOs separated from domain models

## Business Rules (Critical)
1. PO → GRN → Stock (general inventory increases)
2. Material Issue → Job No. (job cost allocated HERE)
3. Customer codes auto-generated via DocumentCounter table
4. All transactional documents use DocumentCounter for numbering
5. UAE-based business (currency: AED)

## Coding Conventions
### Backend (C#)
- Controllers → Services → Repository pattern
- Async/await throughout
- FluentValidation for request validation
- Separate request/response DTOs

### Frontend (React)
- Functional components with hooks
- Axios for all API calls
- Component per module/entity

## Current Focus
Building module by module — Procurement first (PR → PO → GRN), then Inventory, Job Costing, Finance.