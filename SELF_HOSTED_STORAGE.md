# Self-Hosted Storage for Screenshots in Firecrawl

This document explains how to use the self-hosted storage feature for saving screenshots in the Firecrawl project.

## Overview

The self-hosted version of Firecrawl now supports saving screenshots to a local MinIO storage service, which provides an S3-compatible API. This allows you to store screenshots locally without relying on external services like Supabase.

## Configuration

The following environment variables can be configured to customize the MinIO storage:

| Variable | Description | Default Value |
|----------|-------------|---------------|
| `USE_SELF_HOSTED_STORAGE` | Enable self-hosted storage using MinIO | `true` |
| `MINIO_ENDPOINT` | MinIO server hostname | `minio` |
| `MINIO_PORT` | MinIO server port | `9000` |
| `MINIO_PUBLIC_ENDPOINT` | Public endpoint for MinIO URLs (can be your domain or IP) | `localhost` |
| `MINIO_PUBLIC_PORT` | Public port for MinIO URLs | `9000` |
| `MINIO_ACCESS_KEY` | MinIO access key | `minioadmin` |
| `MINIO_SECRET_KEY` | MinIO secret key | `minioadmin` |
| `MINIO_USE_SSL` | Use SSL for MinIO connections | `false` |

## How It Works

1. When a screenshot is captured during web scraping, it is stored as a data URI in the document.
2. The `uploadScreenshot` transformer checks if self-hosted storage is enabled.
3. If enabled, the screenshot is uploaded to the MinIO server in the `media` bucket.
4. The data URI in the document is replaced with a URL pointing to the MinIO server.

## MinIO Console Access

The MinIO console is available at `http://localhost:9001` with the default credentials:
- Username: `minioadmin`
- Password: `minioadmin`

## Security Considerations

For production use, you should:

1. Change the default MinIO credentials by setting the `MINIO_ACCESS_KEY` and `MINIO_SECRET_KEY` environment variables.
2. Consider setting up TLS for secure connections by setting `MINIO_USE_SSL=true` and configuring appropriate certificates.
3. If exposing MinIO to the public internet, ensure proper security measures are in place.

## Troubleshooting

If screenshots are not being saved or displayed correctly:

1. Check that the MinIO container is running: `docker-compose ps`
2. Verify the MinIO logs: `docker-compose logs minio`
3. Ensure the `media` bucket exists in the MinIO console
4. Check that the `MINIO_PUBLIC_ENDPOINT` is correctly set to an address that can be accessed by your users
