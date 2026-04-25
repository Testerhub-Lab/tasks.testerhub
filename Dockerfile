# Use the official Node.js 20 image as a base
FROM node:20-alpine

# Set the working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

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
