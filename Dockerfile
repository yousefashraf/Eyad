# syntax = docker/dockerfile:1
ARG NODE_VERSION=22.21.1
FROM node:${NODE_VERSION}-slim

LABEL fly_launch_runtime="Vite"

WORKDIR /app
ENV NODE_ENV="development"

RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y build-essential node-gyp pkg-config python-is-python3

COPY package-lock.json package.json ./
RUN npm ci --include=dev

COPY . .

EXPOSE 3000
CMD ["npm", "run", "dev"]
