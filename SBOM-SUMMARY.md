# Firecrawl Software Bill of Materials (SBOM) Summary

Generated on: July 23, 2025

## Overview

This document provides a comprehensive Software Bill of Materials (SBOM) for the Firecrawl project, generated using Anchore Syft in CycloneDX JSON format. The SBOM covers all major components of the Firecrawl platform.

## Project Information

- **Project**: Firecrawl
- **Repository**: https://github.com/mendableai/firecrawl
- **License**: AGPL v3 (main project)
- **Description**: Web scraping and crawling API service that converts websites into LLM-ready data

## Components Analyzed

### 1. API Server (`apps/api/`)
- **File**: `firecrawl-api-sbom.json`
- **Packages Cataloged**: 1,690
- **File Size**: 1.7MB
- **Technology Stack**: Node.js/TypeScript, Express.js
- **Key Dependencies**: 
  - Express.js, BullMQ, Playwright for core functionality
  - AI/ML libraries (OpenAI SDK, various AI providers)
  - Database: Supabase, Redis
  - Authentication & billing: Stripe integration
  - Web scraping: Cheerio, Turndown, Playwright

### 2. JavaScript SDK (`apps/js-sdk/firecrawl/`)
- **File**: `firecrawl-js-sdk-sbom.json`
- **Packages Cataloged**: 401
- **File Size**: 397KB
- **Technology Stack**: TypeScript, published as `@mendable/firecrawl-js`
- **Key Dependencies**:
  - axios (HTTP client)
  - zod (schema validation)
  - zod-to-json-schema (schema conversion)
  - typescript-event-target (event handling)

### 3. Python SDK (`apps/python-sdk/`)
- **File**: `firecrawl-python-sdk-sbom.json`
- **Packages Cataloged**: 0 (no lock file present)
- **File Size**: 397 bytes
- **Technology Stack**: Python, published as `firecrawl-py`
- **Declared Dependencies** (from pyproject.toml):
  - requests (HTTP client)
  - python-dotenv (environment variables)
  - websockets (WebSocket support)
  - nest-asyncio (async support)
  - pydantic (data validation)
  - aiohttp (async HTTP)

### 4. Rust SDK (`apps/rust-sdk/`)
- **File**: `firecrawl-rust-sdk-sbom.json`
- **Packages Cataloged**: 319
- **File Size**: 368KB
- **Technology Stack**: Rust
- **Key Dependencies**:
  - reqwest (HTTP client)
  - serde (serialization)
  - tokio (async runtime)
  - uuid (UUID generation)

## SBOM Format Details

- **Standard**: CycloneDX 1.5
- **Format**: JSON
- **Tool Used**: Anchore Syft v1.29.0
- **Package Identifiers**: Includes PURL (Package URL) and CPE (Common Platform Enumeration)
- **Metadata**: Package versions, licenses, file locations, dependency relationships

## Security Considerations

### Included Information
- Complete dependency tree with versions
- Package URLs (PURLs) for vulnerability scanning
- CPE identifiers for security databases
- File hashes and locations
- License information where available

### Notable Dependencies
- **Web Scraping**: Playwright, Cheerio, Puppeteer-related packages
- **AI/ML**: OpenAI SDK, various AI provider SDKs
- **Database**: Redis, Supabase clients
- **Authentication**: JWT libraries, OAuth implementations
- **HTTP**: Axios, Fetch implementations, WebSocket libraries

## Usage for Security Assessment

These SBOM files can be used with vulnerability scanning tools such as:
- Grype (by Anchore)
- Snyk
- OWASP Dependency Check
- GitHub Security Advisories
- Commercial vulnerability databases

## Limitations

1. **Python SDK**: No lock file present, so only declared dependencies captured
2. **Development Dependencies**: Includes both production and development dependencies
3. **Transitive Dependencies**: Full dependency tree included (may contain unused packages)
4. **Version Accuracy**: Based on lock files at time of generation

## Files Included

1. `apps/api/firecrawl-api-sbom.json` - Main API server SBOM
2. `apps/js-sdk/firecrawl/firecrawl-js-sdk-sbom.json` - JavaScript SDK SBOM  
3. `apps/python-sdk/firecrawl-python-sdk-sbom.json` - Python SDK SBOM
4. `apps/rust-sdk/firecrawl-rust-sdk-sbom.json` - Rust SDK SBOM
5. `SBOM-SUMMARY.md` - This summary document

## Validation

All SBOM files have been validated as proper CycloneDX JSON format and contain:
- Component metadata
- Dependency relationships
- Package identifiers (PURL/CPE)
- File integrity hashes
- License information where available

For questions about this SBOM or the Firecrawl project, please refer to the project documentation at https://docs.firecrawl.dev
