import * as net from 'net';
import IPAddr from 'ipaddr.js';

export class InsecureConnectionError extends Error {
  constructor(public readonly remoteAddress: string | undefined) {
    super(
      `Blocked connection to a private/internal address (${
        remoteAddress ?? 'unknown'
      }): the destination must be public at actual TCP-connect time`,
    );
    this.name = 'InsecureConnectionError';
  }
}

/**
 * Mirrors the address classification of the main API's safeFetch
 * (apps/api/src/scraper/scrapeURL/engines/utils/safeFetch.ts): anything
 * outside ipaddr.js' "unicast" range is treated as private/internal.
 */
export const isIPPrivate = (address: string | undefined): boolean => {
  if (!address || !IPAddr.isValid(address)) return false;
  return IPAddr.parse(address).range() !== 'unicast';
};

export type ConnectTimeSSRFGuardOptions = {
  /**
   * When local targets are explicitly allowed, the guard enforces nothing
   * (same semantics as the existing hostname-level pre-checks).
   */
  allowLocal: boolean;
  /**
   * The operator-configured upstream proxy URL, if any. Connections to this
   * exact (host, port) pair are exempt: the upstream is trusted
   * infrastructure, and filtering tunnelled destinations is the upstream's
   * job. Matching is strict on both host and port so an attacker cannot ride
   * the exemption by scraping a URL that merely shares the proxy's hostname.
   */
  upstreamProxyUrl?: string;
};

type PatchedConnect = (
  this: net.Socket,
  ...args: Parameters<net.Socket['connect']>
) => net.Socket;

/**
 * Installs a connect-time SSRF guard over every outbound TCP socket the
 * service process creates (proxy-chain's direct/forward legs included).
 *
 * The hostname-level pre-check in `startSSRFProxy()` resolves the
 * destination once via `dns.lookup()`; the outbound connection made by
 * proxy-chain afterwards resolves the same hostname again on its own. A
 * hostname under attacker-controlled DNS can answer the two resolutions
 * differently (DNS rebinding), so the pre-check alone cannot prove where the
 * connection ends up. This guard closes that TOCTOU window the same way the
 * main API's safeFetch does: it validates the address the socket actually
 * connected to, at connect time, and destroys the socket if it is
 * private/internal.
 *
 * Inbound sockets (the express server and the local proxy's listening side)
 * never go through `Socket.prototype.connect` and are unaffected, and the
 * browser is a separate process, so its traffic through the local proxy is
 * filtered by the proxy's own outbound legs.
 */
export const installConnectTimeSSRFGuard = ({
  allowLocal,
  upstreamProxyUrl,
}: ConnectTimeSSRFGuardOptions): { uninstall: () => void } => {
  if (allowLocal) {
    return { uninstall: () => {} };
  }

  let upstreamHost: string | undefined;
  let upstreamPort: number | undefined;
  if (upstreamProxyUrl) {
    try {
      const parsed = new URL(upstreamProxyUrl);
      upstreamHost = parsed.hostname.toLowerCase();
      upstreamPort = parsed.port
        ? Number.parseInt(parsed.port, 10)
        : parsed.protocol === 'https:'
          ? 443
          : 80;
    } catch {
      // An unparseable upstream URL cannot earn the exemption.
      upstreamHost = undefined;
      upstreamPort = undefined;
    }
  }

  const originalConnect =
    net.Socket.prototype.connect as unknown as PatchedConnect;

  const parseConnectTarget = (
    args: unknown[],
  ): { host: string | undefined; port: number | undefined } => {
    let target: unknown = args[0];
    // net.createConnection(...) reaches the prototype method with a
    // normalized arguments object shaped like { 0: options, 1: callback }
    // (see Node's net.normalizeArgs), so unwrap that shape first.
    if (
      typeof target === 'object' &&
      target !== null &&
      (target as Record<string, unknown>)['0'] !== undefined
    ) {
      const unwrapped = target as unknown as Record<string, unknown>;
      args = [unwrapped['0'], unwrapped['1']];
      target = args[0];
    }
    if (typeof target === 'object' && target !== null) {
      const options = target as Record<string, unknown>;
      const host = options.host ?? options.hostname;
      const port =
        typeof options.port === 'string'
          ? Number.parseInt(options.port, 10)
          : options.port;
      return {
        host: typeof host === 'string' ? host : undefined,
        port: typeof port === 'number' ? port : undefined,
      };
    }
    if (typeof target === 'string') {
      // net.connect(host, port, listener); net.connect(path, listener) has
      // no TCP destination to inspect, so it resolves to no host either.
      if (typeof args[1] === 'number') {
        return { host: target, port: args[1] };
      }
    }
    return { host: undefined, port: undefined };
  };

  const guardedConnect = function (
    this: net.Socket,
    ...args: Parameters<net.Socket['connect']>
  ): net.Socket {
    const { host, port } = parseConnectTarget(args as unknown[]);

    const isTrustedUpstream =
      upstreamHost !== undefined &&
      host !== undefined &&
      port !== undefined &&
      host.toLowerCase() === upstreamHost &&
      port === upstreamPort;

    if (!isTrustedUpstream) {
      this.once('connect', () => {
        if (isIPPrivate(this.remoteAddress)) {
          this.destroy(new InsecureConnectionError(this.remoteAddress));
        }
      });
    }
    return originalConnect.apply(this, args);
  } as unknown as PatchedConnect;

  net.Socket.prototype.connect = guardedConnect as typeof net.Socket.prototype.connect;

  return {
    uninstall: () => {
      net.Socket.prototype.connect =
        originalConnect as typeof net.Socket.prototype.connect;
    },
  };
};
