# AI-Based Timetable Generation System

## Overview

This is a full-stack web application for generating AI-optimized academic timetables aligned with NEP 2020 requirements. The system is designed for educational institutions offering programs like B.Ed., M.Ed., FYUP, and ITEP, with support for various course types including Major, Minor, Skill-Based, Ability Enhancement, and Value-Added courses.

The application provides automated conflict detection and resolution, AI/ML-based optimization for faculty workload balancing, room utilization efficiency, and support for complex academic structures including electives, teaching practice, and field work scheduling.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript using Vite as the build tool
- **UI Components**: Shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS with CSS variables for theming support
- **State Management**: TanStack Query (React Query) for server state management
- **Routing**: Wouter for lightweight client-side routing
- **Authentication**: Context-based authentication with role-based access control (Admin, Faculty, Student)

### Backend Architecture
- **Runtime**: Node.js with Express.js REST API
- **Language**: TypeScript with ES modules
- **API Design**: RESTful endpoints with role-based middleware protection
- **Session Management**: In-memory session store with Bearer token authentication
- **File Structure**: Monorepo structure with shared types between client and server

### Data Storage Solutions
- **Primary Database**: MongoDB with Mongoose ODM
- **Development Mode**: In-memory MongoDB server using mongodb-memory-server
- **Schema Management**: Drizzle ORM integration for type-safe database operations
- **Data Models**: Comprehensive schema for Students, Faculty, Courses, Rooms, Timetables, and supporting entities

### Authentication and Authorization
- **Authentication Method**: Bearer token-based authentication
- **Session Management**: Map-based session storage with 24-hour expiration
- **Role-Based Access**: Three-tier access control (Admin, Faculty, Student)
- **Route Protection**: Middleware-based authentication and authorization
- **Persistent Sessions**: localStorage for client-side session persistence

### AI Scheduling Engine
- **Algorithm**: Constraint Satisfaction Problem (CSP) with forward checking
- **Heuristics**: Minimum Remaining Values (MRV) and Least Constraining Value (LCV)
- **Optimization**: Multi-objective optimization for faculty workload, room utilization, and conflict minimization
- **Conflict Detection**: Automated detection of faculty, room, and student scheduling conflicts

## External Dependencies

### UI and Styling
- **Radix UI**: Complete set of accessible UI primitives for React
- **Tailwind CSS**: Utility-first CSS framework for styling
- **Lucide React**: Icon library for consistent iconography
- **Class Variance Authority**: Utility for creating variant-based component APIs

### Data Management
- **TanStack Query**: Server state synchronization and caching
- **MongoDB**: Document database for flexible academic data storage
- **Mongoose**: MongoDB object modeling for Node.js
- **Drizzle ORM**: Type-safe SQL-like operations for database management

### Development Tools
- **Vite**: Fast build tool with HMR support
- **TypeScript**: Type safety across the entire application stack
- **Replit Integration**: Development environment optimizations for Replit platform
- **ESBuild**: Fast JavaScript bundler for production builds

### Form Handling and Validation
- **React Hook Form**: Performant forms with minimal re-renders
- **Zod**: TypeScript-first schema validation library
- **Hookform Resolvers**: Integration between React Hook Form and Zod

### Database Connectivity
- **Neon Database**: Serverless PostgreSQL platform integration
- **Connect PG Simple**: PostgreSQL session store for Express sessions
- **MongoDB Memory Server**: In-memory MongoDB for development and testing