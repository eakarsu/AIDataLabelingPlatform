#!/bin/bash

# AI Data Labeling Platform - Start Script
# This script starts both backend and frontend with hot-reload

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║           🏷️  AI Data Labeling Platform                      ║"
echo "║           Auto-Label + Human Review System                  ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

# Load environment variables
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
    echo -e "${GREEN}✓ Environment variables loaded${NC}"
else
    echo -e "${RED}✗ .env file not found! Please create one.${NC}"
    exit 1
fi

BACKEND_PORT=${BACKEND_PORT:-4001}
FRONTEND_PORT=${FRONTEND_PORT:-3001}

# Function to kill process on a port
kill_port() {
    local port=$1
    local pid=$(lsof -ti :$port 2>/dev/null)
    if [ ! -z "$pid" ]; then
        echo -e "${YELLOW}  Killing process on port $port (PID: $pid)${NC}"
        kill -9 $pid 2>/dev/null || true
        sleep 1
    fi
}

# Clean up used ports
echo -e "\n${BLUE}[1/6] Cleaning up ports...${NC}"
kill_port $BACKEND_PORT
kill_port $FRONTEND_PORT
echo -e "${GREEN}✓ Ports $BACKEND_PORT and $FRONTEND_PORT are free${NC}"

# Check PostgreSQL
echo -e "\n${BLUE}[2/6] Checking PostgreSQL...${NC}"
if ! command -v psql &> /dev/null; then
    echo -e "${RED}✗ PostgreSQL is not installed${NC}"
    exit 1
fi

# Check if PostgreSQL is running
if ! pg_isready -q 2>/dev/null; then
    echo -e "${YELLOW}  Starting PostgreSQL...${NC}"
    brew services start postgresql@14 2>/dev/null || brew services start postgresql 2>/dev/null || true
    sleep 2
fi

# Create database if not exists
DB_NAME=${DB_NAME:-ai_labeling_platform}
if ! psql -lqt 2>/dev/null | cut -d \| -f 1 | grep -qw "$DB_NAME"; then
    echo -e "${YELLOW}  Creating database '$DB_NAME'...${NC}"
    createdb "$DB_NAME" 2>/dev/null || true
fi
echo -e "${GREEN}✓ PostgreSQL is ready (database: $DB_NAME)${NC}"

# Install backend dependencies
echo -e "\n${BLUE}[3/6] Installing backend dependencies...${NC}"
cd "$PROJECT_DIR/backend"
if [ ! -d "node_modules" ]; then
    npm install --silent
else
    echo -e "  node_modules exists, checking for updates..."
    npm install --silent 2>/dev/null
fi
echo -e "${GREEN}✓ Backend dependencies installed${NC}"

# Install frontend dependencies
echo -e "\n${BLUE}[4/6] Installing frontend dependencies...${NC}"
cd "$PROJECT_DIR/frontend"
if [ ! -d "node_modules" ]; then
    npm install --silent
else
    echo -e "  node_modules exists, checking for updates..."
    npm install --silent 2>/dev/null
fi
echo -e "${GREEN}✓ Frontend dependencies installed${NC}"

# Cleanup function
cleanup() {
    echo -e "\n${YELLOW}Shutting down...${NC}"
    kill_port $BACKEND_PORT
    kill_port $FRONTEND_PORT
    kill $(jobs -p) 2>/dev/null
    echo -e "${GREEN}✓ All services stopped${NC}"
    exit 0
}
trap cleanup SIGINT SIGTERM

# Start backend with nodemon for hot-reload
echo -e "\n${BLUE}[5/6] Starting backend server (port $BACKEND_PORT)...${NC}"
cd "$PROJECT_DIR/backend"

# Use nodemon if available, otherwise use node --watch
if command -v npx &> /dev/null; then
    npx --yes nodemon --watch . --ext js,json server.js &
else
    node --watch server.js &
fi
BACKEND_PID=$!

# Wait for backend to be ready
echo -e "  Waiting for backend to start..."
for i in {1..30}; do
    if curl -s "http://localhost:$BACKEND_PORT/api/health" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Backend is running on http://localhost:$BACKEND_PORT${NC}"
        break
    fi
    sleep 1
    if [ $i -eq 30 ]; then
        echo -e "${RED}✗ Backend failed to start${NC}"
        exit 1
    fi
done

# Seed the database
echo -e "\n${BLUE}[6/6] Seeding database...${NC}"
SEED_RESPONSE=$(curl -s -X POST "http://localhost:$BACKEND_PORT/api/seed")
echo -e "${GREEN}✓ Database seeded with sample data${NC}"
echo -e "  $SEED_RESPONSE" | head -c 200

# Start frontend with Vite hot-reload
echo -e "\n\n${BLUE}Starting frontend (port $FRONTEND_PORT)...${NC}"
cd "$PROJECT_DIR/frontend"
npm run dev &
FRONTEND_PID=$!

sleep 3

echo -e "\n${CYAN}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  🚀 AI Data Labeling Platform is running!                   ║"
echo "║                                                              ║"
echo "║  Frontend: http://localhost:$FRONTEND_PORT                        ║"
echo "║  Backend:  http://localhost:$BACKEND_PORT                        ║"
echo "║                                                              ║"
echo "║  Login:    admin@labelai.com / password123                   ║"
echo "║                                                              ║"
echo "║  ⚡ Hot-reload enabled - changes auto-refresh               ║"
echo "║  Press Ctrl+C to stop all services                           ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Wait for both processes
wait
