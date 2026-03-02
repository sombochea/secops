FROM golang:1.25-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o /secops-agent ./cmd

FROM alpine:latest
RUN apk add --no-cache ca-certificates
COPY --from=builder /secops-agent /usr/local/bin/secops-agent
ENTRYPOINT ["secops-agent"]
CMD ["-config", "/etc/secops-agent/config.yaml"]
