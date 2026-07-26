# Pin the active Node.js LTS line used for production builds.
FROM node:24.18.0-alpine3.23

# Set the working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./
COPY packages/pulsar-mcp/package.json packages/pulsar-mcp/package.json

# Install exactly the dependency graph from package-lock.json.
RUN npm ci

# Copy the rest of the application code
COPY . .

# Generate Prisma client and build the application
# Prisma needs DATABASE_URL at build time to load config
ENV DATABASE_URL="postgresql://user:password@localhost:5432/tasks_tracker"
RUN npx prisma generate
RUN npm run build

# Expose the port the app runs on
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
