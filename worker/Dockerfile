FROM golang:1.25-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o /worker ./cmd

FROM alpine:3.23
RUN apk add --no-cache ca-certificates
COPY --from=build /worker /usr/local/bin/worker
RUN mkdir -p /data/wal
ENTRYPOINT ["worker"]
CMD ["-addr", ":4000", "-wal-dir", "/data/wal"]
