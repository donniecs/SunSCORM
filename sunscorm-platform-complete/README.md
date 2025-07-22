# Sun-SCORM Platform

A production-grade SCORM dispatch platform designed to compete with Rustici's SCORM Cloud. Provides comprehensive e-learning content management with robust analytics and licensing controls.

## 🚀 Features

### Professional SCORM Support
- **Multi-Standard Compatibility**: SCORM 1.2, SCORM 2004, AICC, and xAPI
- **Professional Runtime**: Industry-standard `scorm-again` library integration
- **Smart Validation**: Real manifest parsing with `fast-xml-parser`
- **Mobile-Responsive Player**: Touch-friendly learning interface

### Learning Analytics
- **Real-Time xAPI Tracking**: Comprehensive learning analytics backend
- **Progress Monitoring**: Launch, progress, and completion event tracking
- **Database Integration**: Persistent analytics storage with PostgreSQL
- **Dashboard Insights**: Visual analytics for learning outcomes

### Enterprise Features
- **Multi-Tenant Architecture**: Complete organization isolation
- **License Management**: Hierarchical completion limits and controls
- **Role-Based Access**: Admin, company admin, and user permissions
- **Secure Dispatch System**: Token-based course distribution

### Production Ready
- **External LMS Integration**: SCORM packages work with TalentLMS, Moodle, Cornerstone
- **Chunked Upload**: Large file support up to 500MB with progress tracking
- **System Monitoring**: Real-time health monitoring and status indicators
- **Professional UI**: Modern React interface with dark mode support

## 🏗️ Architecture

### Full-Stack Technology
- **Frontend**: React + TypeScript + Vite + Tailwind CSS
- **Backend**: Express.js + TypeScript + Drizzle ORM
- **Database**: PostgreSQL with type-safe operations
- **Authentication**: Replit Auth with OpenID Connect
- **UI Framework**: shadcn/ui components with Radix UI primitives

### Key Services
- **SCORM Service**: Professional content validation and processing
- **Launch Service**: Secure course delivery and token management
- **xAPI Service**: Learning analytics and statement processing
- **Storage Service**: Multi-tenant file and metadata management

## 🔧 Installation

### Prerequisites
- Node.js 18+
- PostgreSQL database
- Environment variables (see `.env.example`)

### Setup
```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your database and auth credentials

# Push database schema
npm run db:push

# Start development server
npm run dev
```

### Environment Variables
```env
DATABASE_URL=postgresql://user:password@host:port/database
SESSION_SECRET=your-secure-session-secret
REPLIT_DOMAINS=your-domain.replit.app
PUBLIC_DOMAIN=https://your-domain.replit.app
```

## 📚 Usage

### Course Management
1. **Upload SCORM Packages**: Drag-and-drop ZIP files with automatic validation
2. **Preview Courses**: Test SCORM content before dispatch
3. **Tag Organization**: Categorize courses with searchable tags
4. **Edit Metadata**: Update course information and replace SCORM files

### Dispatch System
1. **Create Dispatches**: Assign courses to companies with license limits
2. **SCORM Export**: Generate LMS-compatible ZIP packages
3. **Launch Tracking**: Monitor course access and completion
4. **Analytics Dashboard**: View learning progress and outcomes

### External LMS Integration
1. Export SCORM package from dispatch
2. Upload ZIP file to your LMS (TalentLMS, Moodle, etc.)
3. Launch course - analytics automatically tracked
4. View comprehensive reports in Sun-SCORM dashboard

## 🔒 Security Features

- **CSRF Protection**: Custom token validation for state changes
- **Input Validation**: Comprehensive SCORM package verification
- **Authentication Guards**: Secure API endpoints with role validation
- **Content Security Policy**: Protected iframe sandboxing
- **Tenant Isolation**: Complete data separation between organizations

## 📊 Analytics & Monitoring

### xAPI Integration
- Automatic statement generation for learning events
- Real-time progress tracking and completion monitoring
- Comprehensive learner journey analytics
- Standards-compliant xAPI implementation

### System Health
- Database connection monitoring
- Storage system status tracking
- Authentication service health checks
- Real-time performance metrics

## 🚀 Deployment

### Replit Deployment
1. Configure all environment variables
2. Ensure `PUBLIC_DOMAIN` points to deployed URL
3. Use Replit Web Service for production deployment
4. External LMS integration requires deployed domain

### Production Checklist
- [ ] Database configured and migrated
- [ ] All environment variables set
- [ ] SESSION_SECRET configured for security
- [ ] PUBLIC_DOMAIN set for SCORM exports
- [ ] File upload limits configured
- [ ] Health monitoring endpoints accessible

## 🔄 Recent Updates

### Phase 2 Implementation (January 2025)
- **Professional SCORM Runtime**: Integrated `scorm-again` library
- **Enhanced Validation**: Real XML parsing with namespace detection
- **xAPI Backend**: Complete learning analytics implementation
- **Mobile Optimization**: Responsive SCORM player design
- **System Hardening**: Fixed UI crashes and enhanced error handling

### Production Enhancements
- **Chunked Upload System**: Large file support with progress tracking
- **External LMS Integration**: SCORM packages work with major LMS platforms
- **Professional UI**: Enhanced course management and dispatch interface
- **License Enforcement**: Hierarchical completion limits and controls

## 📖 Documentation

- `COMPREHENSIVE_SCORM_AUDIT_PHASE1.md` - Complete system architecture analysis
- `SCORM_IMPLEMENTATION_PLAN_PHASE1.md` - Technical implementation roadmap
- `DEPLOYMENT.md` - Production deployment guide
- `replit.md` - Project context and architectural decisions

## 🤝 Contributing

This is a professional SCORM platform implementation designed for enterprise e-learning environments. Contributions should maintain production-grade code quality and comprehensive testing.

## 📄 License

Private project - All rights reserved.

---

**Sun-SCORM Platform** - Professional SCORM dispatch platform competing with industry leaders like Rustici's SCORM Cloud. Built with modern web technologies for scalable e-learning content management.