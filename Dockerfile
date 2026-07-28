FROM golang:1.24-alpine AS builder

WORKDIR /src/backend

COPY backend/go.mod backend/go.sum ./
RUN go mod download

COPY backend/ ./
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/citraframe .

FROM alpine:3.22

RUN apk add --no-cache ca-certificates tzdata \
    && addgroup -S citraframe \
    && adduser -S -G citraframe citraframe

WORKDIR /app/backend

COPY --from=builder --chown=citraframe:citraframe /out/citraframe ./citraframe
COPY --chown=citraframe:citraframe backend/database ./database
COPY --chown=citraframe:citraframe backend/uploads ./uploads
COPY --chown=citraframe:citraframe frontend /app/frontend

USER citraframe

ENV PORT=8080
EXPOSE 8080

CMD ["./citraframe"]
