# Test fixtures

`tls-cert.pem` / `tls-key.pem` is a throwaway self-signed pair (CN=localhost,
SAN: DNS:localhost, IP:127.0.0.1, IP:::1) used only by
`ssrf_connect_guard.test.ts` so the TLS leg of the guard is exercised on
every run instead of being skipped when no `openssl` binary is available in
the environment. Regenerate with:

    openssl req -x509 -newkey rsa:2048 -nodes \
      -keyout test-fixtures/tls-key.pem -out test-fixtures/tls-cert.pem \
      -days 3650 -subj "/CN=localhost" \
      -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:::1"

The key is published on purpose: it guards a loopback test listener only
and must never be used anywhere else.
