import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as path from 'node:path';
import * as tls from 'node:tls';
import {
  InsecureConnectionError,
  installConnectTimeSSRFGuard,
  isIPPrivate,
} from './helpers/ssrf_connect_guard';

// A throwaway loopback TCP server standing in for "the private address a
// rebound hostname lands on": loopback is outside ipaddr.js' unicast range,
// exactly like the internal addresses the guard must reject.
const startLoopbackServer = (): Promise<net.Server> =>
  new Promise((resolve) => {
    const server = net.createServer((socket) => {
      socket.on('data', () => {
        socket.end('pong');
      });
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });

const serverPort = (server: net.Server): number => {
  const address = server.address();
  assert(address && typeof address === 'object');
  return address.port;
};

// This package compiles as CommonJS, so __dirname is the test file's own
// directory and the committed fixtures resolve regardless of the cwd the
// suite is started from.
const fixturesDir = path.join(__dirname, 'test-fixtures');

// Same as startLoopbackServer, but counts accepted connections so tests can
// prove the private target never saw a completed TCP handshake.
const startCountingLoopbackServer = async (
  host = '127.0.0.1',
): Promise<{
  port: number;
  connectionCount: () => number;
  close: () => Promise<void>;
}> => {
  let connections = 0;
  const server = net.createServer((socket) => {
    connections += 1;
    socket.on('data', () => {
      socket.end('pong');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, host, resolve));
  return {
    port: serverPort(server),
    connectionCount: () => connections,
    close: () =>
      new Promise<void>((resolve) => {
        // closeAllConnections is not available on every Node build in the
        // wild; where it exists it keeps close() from waiting on a socket
        // that is mid-destroy.
        const closeAll = (
          server as unknown as { closeAllConnections?: () => void }
        ).closeAllConnections;
        if (typeof closeAll === 'function') {
          closeAll.call(server);
        }
        server.close(() => resolve());
      }),
  };
};

const connectAndPong = (
  port: number,
  host: string,
  connectOptions: Record<string, unknown> = {},
): Promise<{ ok: boolean; error?: Error; data?: string }> =>
  new Promise((resolve) => {
    const socket = net.createConnection({ host, port, ...connectOptions });
    let data = '';
    socket.on('connect', () => socket.write('ping'));
    socket.on('data', (chunk) => {
      data += chunk.toString();
      socket.end();
    });
    socket.on('error', (error) => resolve({ ok: false, error, data }));
    socket.on('close', () => {
      if (data) {
        resolve({ ok: true, data });
      }
    });
    setTimeout(() => {
      if (!socket.destroyed) {
        socket.destroy();
      }
    }, 3000).unref();
  });

test('isIPPrivate classifies addresses like the main API safeFetch', () => {
  for (const address of [
    '127.0.0.1',
    '10.0.0.1',
    '172.16.0.1',
    '192.168.1.1',
    '169.254.0.1',
    '0.0.0.0',
    '::1',
    'fe80::1',
    'fc00::1',
    '::ffff:127.0.0.1',
  ]) {
    assert.ok(isIPPrivate(address), address + ' must be private');
  }
  for (const address of ['8.8.8.8', '1.1.1.1', '93.184.216.34', '2606:4700::1111']) {
    assert.ok(!isIPPrivate(address), address + ' must be public');
  }
  assert.ok(!isIPPrivate(undefined));
  assert.ok(!isIPPrivate('not-an-ip'));
});

test('guard destroys sockets that connect to a private address', async () => {
  const server = await startLoopbackServer();
  try {
    const { uninstall } = installConnectTimeSSRFGuard({ allowLocal: false });
    try {
      const result = await connectAndPong(serverPort(server), '127.0.0.1');
      assert.ok(!result.ok, 'connection to a private address must not succeed');
      assert.ok(
        result.error instanceof InsecureConnectionError,
        'expected InsecureConnectionError, got ' + result.error,
      );
    } finally {
      uninstall();
    }
  } finally {
    server.close();
  }
});

test('guard exempts the configured upstream proxy host and port', async () => {
  const server = await startLoopbackServer();
  try {
    const port = serverPort(server);
    const { uninstall } = installConnectTimeSSRFGuard({
      allowLocal: false,
      upstreamProxyUrl: 'http://user:pass@127.0.0.1:' + port,
    });
    try {
      const result = await connectAndPong(port, '127.0.0.1');
      assert.ok(result.ok, 'the trusted upstream leg must stay connectable');
      assert.equal(result.data, 'pong');
    } finally {
      uninstall();
    }
  } finally {
    server.close();
  }
});

test('guard does not exempt the upstream host on a different port', async () => {
  const server = await startLoopbackServer();
  try {
    const port = serverPort(server);
    const { uninstall } = installConnectTimeSSRFGuard({
      allowLocal: false,
      upstreamProxyUrl: 'http://127.0.0.1:9999',
    });
    try {
      const result = await connectAndPong(port, '127.0.0.1');
      assert.ok(!result.ok, 'port mismatch must not ride the exemption');
      assert.ok(result.error instanceof InsecureConnectionError);
    } finally {
      uninstall();
    }
  } finally {
    server.close();
  }
});

test('guard is inert when local targets are allowed', async () => {
  const server = await startLoopbackServer();
  try {
    const { uninstall } = installConnectTimeSSRFGuard({ allowLocal: true });
    try {
      const result = await connectAndPong(serverPort(server), '127.0.0.1');
      assert.ok(result.ok, 'ALLOW_LOCAL_WEBHOOKS keeps local targets usable');
      assert.equal(result.data, 'pong');
    } finally {
      uninstall();
    }
  } finally {
    server.close();
  }
});

test('uninstall restores unguarded behavior', async () => {
  const server = await startLoopbackServer();
  try {
    const { uninstall } = installConnectTimeSSRFGuard({ allowLocal: false });
    uninstall();
    const result = await connectAndPong(serverPort(server), '127.0.0.1');
    assert.ok(result.ok, 'uninstall must restore plain net behavior');
    assert.equal(result.data, 'pong');
  } finally {
    server.close();
  }
});

// The committed self-signed pair in test-fixtures/ keeps this leg
// environment-independent: the TLS path runs everywhere instead of being
// skipped wherever no openssl binary exists.
test('guard covers TLS connections (proxy-chain https legs)', { timeout: 15000 }, async () => {
  const server = tls.createServer(
    {
      key: fs.readFileSync(path.join(fixturesDir, 'tls-key.pem')),
      cert: fs.readFileSync(path.join(fixturesDir, 'tls-cert.pem')),
    },
    (socket) => {
      socket.on('data', () => socket.end('pong'));
    },
  );
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const port = (server.address() as net.AddressInfo).port;
    const { uninstall } = installConnectTimeSSRFGuard({ allowLocal: false });
    try {
      const result = await new Promise<{ ok: boolean; error?: Error }>((resolve) => {
        const socket = tls.connect({ host: '127.0.0.1', port, rejectUnauthorized: false });
        socket.on('secureConnect', () => socket.write('ping'));
        socket.on('data', () => socket.end());
        socket.on('error', (error) => resolve({ ok: false, error }));
        socket.on('close', () => resolve({ ok: true }));
        setTimeout(() => {
          if (!socket.destroyed) socket.destroy();
        }, 5000).unref();
      });
      assert.ok(!result.ok, 'TLS connect to a private address must be destroyed');
      assert.ok(result.error instanceof InsecureConnectionError);
    } finally {
      uninstall();
    }
  } finally {
    server.close();
  }
});

// End-to-end TOCTOU reproduction through a real proxy-chain Server, the
// same construction startSSRFProxy() uses: the hostname pre-check resolves
// the target once, the outbound leg re-resolves it at connect time. The
// per-request dnsLookup hook stands in for the attacker-controlled second
// resolution: it answers the pre-check (via the stubbed first lookup) with
// a public address and the connect-time resolution with 127.0.0.1, exactly
// the rebinding shape reported in the issue.
test('SSRF proxy tunnel: DNS rebinding is blocked at connect time', { timeout: 20000 }, async () => {
  const { Server, RequestError } = await import('proxy-chain');
  const PUBLIC_ADDRESS = '93.184.216.34';

  const startProxy = (preCheckApprovesHostname: boolean) => {
    const server = new Server({
      port: 0,
      host: '127.0.0.1',
      prepareRequestFunction: async ({ hostname }: { hostname: string }) => {
        // First, hostname-level pre-check (simulated resolution): this is
        // the check the attacker satisfies with a safe answer.
        if (!preCheckApprovesHostname) {
          throw new RequestError('Blocked: target resolves to a private address', 403);
        }
        return {
          upstreamProxyUrl: undefined,
          // Second, connect-time resolution: the rebinding answer. Node
          // may request the all-addresses shape (autoSelectFamily), which
          // the dns.lookup contract answers with an array.
          dnsLookup: ((_hostname: string, opts: { all?: boolean }, cb: unknown) => {
            const callback = cb as unknown as {
              (err: Error | null, addresses?: unknown, family?: number): void;
            };
            if (opts?.all) {
              callback(null, [{ address: '127.0.0.1', family: 4 }]);
            } else {
              callback(null, '127.0.0.1', 4);
            }
          }) as unknown as typeof import('node:dns').lookup,
        };
      },
    });
    return server;
  };

  const openTunnel = (
    proxyPort: number,
    targetPort: number,
  ): Promise<{ established: boolean; relayed: boolean }> =>
    new Promise((resolve) => {
      const socket = net.connect({ host: '127.0.0.1', port: proxyPort });
      let established = false;
      let relayed = false;
      let buf = '';
      socket.on('connect', () => {
        socket.write(`CONNECT rebind.example:${targetPort} HTTP/1.1\r\nHost: rebind.example:${targetPort}\r\n\r\n`);
      });
      socket.on('data', (chunk) => {
        buf += chunk.toString();
        if (!established && buf.includes('200')) {
          established = true;
          // Anything the attacker can relay to the internal service goes
          // through this tunnel.
          socket.write('intrusion-payload');
        }
        if (buf.includes('internal-service-echo')) {
          relayed = true;
          socket.destroy();
          resolve({ established: true, relayed });
        }
      });
      socket.on('error', () => resolve({ established, relayed }));
      socket.on('close', () => resolve({ established, relayed }));
      setTimeout(() => {
        if (!socket.destroyed) {
          socket.destroy();
        }
      }, 8000).unref();
    });

  let internalConnections = 0;
  const internal = net.createServer((socket) => {
    internalConnections += 1;
    socket.on('data', () => socket.end('internal-service-echo'));
  });
  await new Promise<void>((resolve) => internal.listen(0, '127.0.0.1', resolve));
  const internalPort = (internal.address() as net.AddressInfo).port;

  try {
    // Baseline sanity: the pre-check itself still blocks hostnames it
    // resolves as private (simulated refusal), with or without the guard.
    const refused = await startProxy(false);
    await refused.listen();
    try {
      const baseline = await openTunnel(refused.port, internalPort);
      assert.ok(!baseline.established, 'pre-check refusal must hold the line');
    } finally {
      await refused.close(true);
    }

    // Without the guard: pre-check approves (public first answer), the
    // connect-time resolution lands on 127.0.0.1, and the tunnel relays
    // payloads into the internal service. This is the vulnerability.
    const vulnerable = await startProxy(true);
    await vulnerable.listen();
    try {
      const attack = await openTunnel(vulnerable.port, internalPort);
      assert.ok(attack.established, 'repro: rebinding tunnel gets established without the guard');
      assert.ok(attack.relayed, 'repro: payload is relayed to the internal service without the guard');
      assert.ok(internalConnections > 0, 'repro: the internal service saw the tunnel connection');
    } finally {
      await vulnerable.close(true);
    }

    // With the connect-time guard: same rebinding answers, but the socket
    // actually connecting to 127.0.0.1 is destroyed before any payload is
    // relayed.
    const guardedProxy = await startProxy(true);
    await guardedProxy.listen();
    internalConnections = 0;
    const { uninstall } = installConnectTimeSSRFGuard({
      allowLocal: false,
      // The tunnel client plays the browser, whose sockets live in a
      // separate process and are not patched; exempting the proxy's own
      // port models exactly that, the same way the operator's PROXY_SERVER
      // leg is exempt in production.
      upstreamProxyUrl: 'http://127.0.0.1:' + guardedProxy.port,
    });
    try {
      const blocked = await openTunnel(guardedProxy.port, internalPort);
      assert.ok(!blocked.established, 'guard: the rebinding tunnel must not get established');
      assert.ok(!blocked.relayed, 'guard: no payload may reach the internal service');
      assert.equal(internalConnections, 0, 'guard: the internal service must never see the connection');
    } finally {
      uninstall();
      await guardedProxy.close(true);
    }
  } finally {
    internal.close();
  }
});

// A hostname whose connect-time resolution is a private address must be
// refused BEFORE the TCP handshake: destroying the socket after 'connect'
// still lets the private target observe a completed connection (and use it
// to leak reachability / open ports). The guard therefore validates inside
// the (wrapped) DNS lookup and fails the resolution.
test('rebound hostname is refused before the TCP handshake completes', { timeout: 10000 }, async () => {
  const loopback = await startCountingLoopbackServer();
  try {
    const { uninstall } = installConnectTimeSSRFGuard({ allowLocal: false });
    try {
      const result = await connectAndPong(loopback.port, 'rebind.example', {
        // The rebinding answer, in both dns.lookup callback shapes.
        lookup: ((_hostname: string, opts: { all?: boolean }, cb: unknown) => {
          const callback = cb as (...args: unknown[]) => void;
          if (opts?.all) {
            callback(null, [{ address: '127.0.0.1', family: 4 }]);
          } else {
            callback(null, '127.0.0.1', 4);
          }
        }) as unknown as typeof import('node:dns').lookup,
      });
      assert.ok(!result.ok, 'a hostname resolving to a private address must not connect');
      assert.ok(
        result.error instanceof InsecureConnectionError,
        'expected InsecureConnectionError, got ' + result.error,
      );
      assert.equal(
        loopback.connectionCount(),
        0,
        'the private target must not observe a completed TCP handshake',
      );
    } finally {
      uninstall();
    }
  } finally {
    await loopback.close();
  }
});

// `URL.hostname` keeps the square brackets for IPv6 hosts while Node socket
// targets are unbracketed, so an internal upstream configured as
// http://[::1]:3128 must still earn the exact (host, port) exemption.
test('guard exempts an IPv6 upstream proxy URL written with brackets', { timeout: 10000 }, async (t) => {
  if (!(await ipv6LoopbackAvailable('::1'))) {
    return t.skip('IPv6 loopback is unavailable on this host');
  }
  const loopback = await startCountingLoopbackServer('::1');
  try {
    const { uninstall } = installConnectTimeSSRFGuard({
      allowLocal: false,
      upstreamProxyUrl: 'http://[::1]:' + loopback.port,
    });
    try {
      const result = await connectAndPong(loopback.port, '::1');
      assert.ok(
        result.ok,
        'the bracketed IPv6 upstream leg must stay connectable, got error: ' +
          result.error,
      );
      assert.equal(result.data, 'pong');
      // A different private target must not ride the same exemption.
      const blocked = await connectAndPong(loopback.port, '127.0.0.1');
      assert.ok(!blocked.ok, 'a non-exempt private target must stay blocked');
      assert.ok(blocked.error instanceof InsecureConnectionError);
    } finally {
      uninstall();
    }
  } finally {
    await loopback.close();
  }
});

// Hosts with IPv6 loopback disabled (some CI containers) cannot run the
// bracketed-IPv6 test below: listen(0, '::1') there fails with EADDRNOTAVAIL
// or EAFNOSUPPORT. Probe it and skip instead of failing.
const ipv6LoopbackAvailable = (host: string): Promise<boolean> =>
  new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', () => resolve(false));
    probe.listen(0, host, () => {
      probe.close(() => resolve(true));
    });
  });

// The upstream URL is operator configuration; if it is malformed the guard
// must simply run without the exemption (the affected scrape requests fail
// on their own), never throw.
test('guard tolerates an unparseable upstream proxy URL', { timeout: 10000 }, async () => {
  const loopback = await startCountingLoopbackServer();
  try {
    const { uninstall } = installConnectTimeSSRFGuard({
      allowLocal: false,
      upstreamProxyUrl: '://not-a-url',
    });
    try {
      const result = await connectAndPong(loopback.port, '127.0.0.1');
      assert.ok(!result.ok, 'an unparseable upstream URL earns no exemption');
      assert.ok(result.error instanceof InsecureConnectionError);
    } finally {
      uninstall();
    }
  } finally {
    await loopback.close();
  }
});

// Boot-safety pin for the api.ts wiring: when ALLOW_LOCAL_WEBHOOKS makes the
// guard inert, nothing downstream may throw on a malformed PROXY_SERVER
// (previously it only failed the individual scrape requests that used it).
test('a disabled guard never parses the upstream proxy URL', () => {
  const { uninstall } = installConnectTimeSSRFGuard({
    allowLocal: true,
    upstreamProxyUrl: '://not-a-url',
  });
  uninstall();
});
