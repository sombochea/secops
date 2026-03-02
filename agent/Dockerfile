FROM golang:1.25-alpine AS builder
ARG VERSION=dev
ARG COMMIT=unknown
ARG BUILD_DATE=unknown
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -ldflags="-s -w \
  -X github.com/sombochea/secops/agent/internal/version.Version=${VERSION} \
  -X github.com/sombochea/secops/agent/internal/version.Commit=${COMMIT} \
  -X github.com/sombochea/secops/agent/internal/version.BuildDate=${BUILD_DATE}" \
  -o /secops-agent ./cmd

FROM alpine:latest
RUN apk add --no-cache ca-certificates
COPY --from=builder /secops-agent /usr/local/bin/secops-agent
ENTRYPOINT ["secops-agent"]
CMD ["-config", "/etc/secops-agent/config.yaml"]
