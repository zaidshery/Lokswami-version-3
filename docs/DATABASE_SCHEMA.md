# Lokswami Database Architecture & Schema Specification

This document defines the database architecture for the Lokswami platform. It provides the schema specification for the active production database (MongoDB/Mongoose + JSON file store) along with the migration specification for PostgreSQL / Supabase / Prisma.

---

## 1. Active Production Schema (MongoDB & Mongoose)

### `User` Collection (`lib/models/User.ts`)
| Field | Type | Description |
|---|---|---|
| `_id` | `ObjectId` | Unique document identifier |
| `name` | `String` | Full name of subscriber or staff member (max 120 chars) |
| `email` | `String` | Email address (unique, lowercase, trimmed) |
| `whatsappNumber` | `String` | WhatsApp mobile number (sparse index, normalized E.164: `+91XXXXXXXXXX`) |
| `image` | `String` | Profile picture or avatar URL |
| `role` | `String` | Role: `reader`, `reporter`, `copy_editor`, `admin`, `super_admin` |
| `loginId` | `String` | Staff unique login handle (optional, sparse unique index) |
| `passwordHash` | `String` | Bcrypt password hash for credentials auth |
| `passwordSetAt` | `Date` | Timestamp when password was last set/changed |
| `optInDailyEpaper` | `Boolean` | Flag indicating subscription to daily WhatsApp morning E-Paper delivery (default: `true`) |
| `preferredLanguage`| `String` | `'hi'` (Hindi) or `'en'` (English) |
| `preferredCategories`| `[String]` | Subscribed categories (e.g. `['indore', 'madhya-pradesh', 'national']`) |
| `savedArticles` | `[ObjectId]` | References to bookmarked articles |
| `readCount` | `Number` | Total article reading counter |
| `readHistory` | `[ReadHistoryEntry]` | Last 50 articles read with completion percentages |
| `isActive` | `Boolean` | Account status flag |
| `lastLoginAt` | `Date` | Timestamp of last session initiation |
| `createdAt` | `Date` | Account registration timestamp |
| `updatedAt` | `Date` | Last profile update timestamp |

---

## 2. PostgreSQL / Supabase / Prisma Target Schema

When migrating to or interfacing with PostgreSQL or Supabase:

```sql
-- Role Enum
CREATE TYPE user_role AS ENUM ('user', 'reporter', 'sub_editor', 'editor', 'admin', 'super_admin');

-- Master Users / Subscribers Table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name VARCHAR(120) NOT NULL,
    whatsapp_number VARCHAR(20) UNIQUE,           -- Normalized E.164 (+91XXXXXXXXXX)
    email VARCHAR(150) UNIQUE NOT NULL,
    password_hash VARCHAR(255),                  -- Bcrypt hash
    role user_role DEFAULT 'user' NOT NULL,
    image_url TEXT,
    language_preference VARCHAR(10) DEFAULT 'hi', -- 'hi' | 'en'
    opt_in_daily_epaper BOOLEAN DEFAULT TRUE,
    is_active BOOLEAN DEFAULT TRUE,
    last_login_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Articles Table
CREATE TABLE articles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    content TEXT NOT NULL,
    summary TEXT,
    featured_image_url TEXT,
    category VARCHAR(50) NOT NULL,
    edition_date DATE DEFAULT CURRENT_DATE,
    status VARCHAR(20) DEFAULT 'draft',
    author_id UUID REFERENCES users(id) ON DELETE SET NULL,
    published_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_users_whatsapp ON users(whatsapp_number);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_articles_status_date ON articles(status, edition_date DESC);
```
