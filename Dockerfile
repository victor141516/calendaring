FROM node:lts-alpine as builder

WORKDIR /app
COPY . /app
RUN npm i && \
    npm run build && \
    rm -rf node_modules && \
    npm i --only=prod && \
    mv node_modules dist

FROM node:lts-alpine

ENV PORT=3000
WORKDIR /app
COPY --from=builder /app/dist /app
CMD ["node", "index.js"]