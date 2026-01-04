#!/bin/bash

# Kodus AI - Database Initialization Script
# This script initializes the database with required schemas

set -e

BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}🐳 Kodus AI - Database Initialization${NC}"
echo -e "${BLUE}======================================${NC}"
echo ""

echo -e "${YELLOW}📋 Creating required database schemas...${NC}"

# Create kodus_workflow schema if it doesn't exist
docker exec db_postgres psql -U kodusdev -d kodus_db -c "CREATE SCHEMA IF NOT EXISTS kodus_workflow;" 2>/dev/null && \
    echo -e "${GREEN}✅ Schema kodus_workflow created/verified${NC}" || \
    echo -e "${YELLOW}⚠️  Could not create schema (may already exist)${NC}"

echo ""
echo -e "${GREEN}🎉 Database initialization completed!${NC}"
echo ""
echo -e "${BLUE}📋 Next steps:${NC}"
echo -e "${BLUE}1.${NC} Run migrations:"
echo -e "   ${YELLOW}yarn migration:run${NC}"
echo ""
echo -e "${BLUE}2.${NC} Seed database:"
echo -e "   ${YELLOW}yarn seed${NC}"
echo ""
echo -e "${BLUE}3.${NC} Verify setup:"
echo -e "   ${YELLOW}yarn dev:health-check${NC}"
echo ""
