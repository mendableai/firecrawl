import * as dns from 'dns';
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

/**
 * `new URL('http://[::1]:3128/').hostname` keeps the square brackets while
 * Node's socket targets are unbracketed ('::1'), so both sides of the
 * upstream-proxy comparison are normalized: lowercased, brackets stripped.
 */
const normalizeHost = (host: string): string => {
  const lowered = host.toLowerCase();
  return lowered.startsWith('[') && lowered.endsWith(']')
    ? lowered.slice(1, -1)
    : lowered;
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
   * IPv6 URLs keep their brackets in `URL.hostname`; they are normalized
   * before matching so `http://[::1]:3128` exempts the '::1' socket target.
   */
  upstreamProxyUrl?: string;
};

type PatchedConnect = (
  this: net.Socket,
  ...args: Parameters<net.Socket['connect']>
) => net.Socket;

/**
 * dns.lookup's callback is overloaded (a single address, or the `all: true`
 * array shape Node requests with autoSelectFamily); the wrapper stays
 * shape-agnostic and forwards whatever the wrapped lookup produced.
 */
type LooseLookup = (
  hostname: string,
  options: unknown,
  callback: (...args: unknown[]) => void,
) => void;

/**
 * Installs a connect-time SSRF guard over every outbound TCP socket the
 * service process creates (proxy-chain's direct/forward legs included).
 *
 * The hostname-level pre-check in `startSSRFProxy()` resolves the
 * destination once; the outbound connection made by proxy-chain afterwards
 * resolves the same hostname again on its own. A hostname under
 * attacker-controlled DNS can answer the two resolutions differently (DNS
 * rebinding), so the pre-check alone cannot prove where the connection ends
 * up. This guard closes that TOCTOU window the same way the main API's
 * safeFetch does, and validates BEFORE the TCP handshake so a rebinding
 * target cannot even observe a completed connection:
 *
 * - a target that is already a literal private address is destroyed before
 *   the connection is attempted, and
 * - a hostname target is resolved through a wrapped lookup that fails the
 *   resolution when an answer would land on a private/internal address, so
 *   net aborts before any SYN reaches the target.
 *
 * A connect-event backstop still destroys anything that slips through to a
 * private peer (paths that resolve without the guarded lookup).
 *
 * Inbound sockets (the express server and the local proxy's listening side)
 * never go through `Socket.prototype.connect` and are unaffected, and the
 * browser is a separate process whose sockets are not patched, so its
 * traffic through the local proxy is filtered by the proxy's outbound legs.
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
      upstreamHost = normalizeHost(parsed.hostname);
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

  /**
   * Wraps the lookup the socket would have used (the caller's own lookup
   * when it provided one, `dns.lookup` otherwise) so a resolution that lands
   * on a private/internal address fails the lookup with
   * InsecureConnectionError: net then aborts the connection before the TCP
   * handshake, so the rebinding target never sees a completed connection
   * (which would leak reachability and open ports).
   */
  const makePrivateRejectingLookup =
    (base: LooseLookup): LooseLookup =>
    (hostname, options, callback) => {
      base(hostname, options, (...baseArgs: unknown[]) => {
        const error = baseArgs[0] as Error | null;
        if (error) {
          callback(error);
          return;
        }
        const answered = baseArgs[1];
        const addresses: Array<{ address: unknown }> = Array.isArray(answered)
          ? (answered as Array<{ address: unknown }>)
          : [{ address: answered }];
        const privateHit = addresses.find((entry) =>
          isIPPrivate(entry.address as string | undefined),
        );
        if (privateHit) {
          callback(
            new InsecureConnectionError(
              privateHit.address as string | undefined,
            ),
            ...baseArgs.slice(1),
          );
          return;
        }
        callback(null, ...baseArgs.slice(1));
      });
    };

  const guardLookup = (options: Record<string, unknown>): unknown => ({
    ...options,
    lookup: makePrivateRejectingLookup(
      (options.lookup as LooseLookup | undefined) ??
        (dns.lookup as unknown as LooseLookup),
    ),
  });

  type ParsedTarget =
    | { tcp: false }
    | {
        tcp: true;
        host: string | undefined;
        port: number | undefined;
        /** Argument list for the original connect, lookup wrapped. */
        injectedArgs: unknown[];
      };

  const parseConnectTarget = (rawArgs: unknown[]): ParsedTarget => {
    let args = rawArgs;
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
      if (options.path !== undefined) {
        // A named-pipe/unix-socket connect has no TCP destination.
        return { tcp: false };
      }
      const host = options.host ?? options.hostname;
      const port =
        typeof options.port === 'string'
          ? Number.parseInt(options.port, 10)
          : options.port;
      return {
        tcp: true,
        host: typeof host === 'string' ? host : undefined,
        port: typeof port === 'number' ? port : undefined,
        injectedArgs: [guardLookup(options), ...args.slice(1)],
      };
    }
    if (typeof target === 'string') {
      // net.connect(host, port, ...): rewritten as an options object so the
      // lookup can be guarded.
      if (typeof args[1] === 'number') {
        return {
          tcp: true,
          host: target,
          port: args[1],
          injectedArgs: [
            guardLookup({ host: target, port: args[1] }),
            ...args.slice(2),
          ],
        };
      }
      // socket.connect(path, ...) has no TCP destination.
      return { tcp: false };
    }
    if (typeof target === 'number' && !Number.isNaN(target)) {
      // socket.connect(port[, host][, listener]): rewritten the same way.
      const host = typeof args[1] === 'string' ? args[1] : undefined;
      return {
        tcp: true,
        host,
        port: target,
        injectedArgs: [
          guardLookup(
            host === undefined ? { port: target } : { host, port: target },
          ),
          ...args.slice(host === undefined ? 1 : 2),
        ],
      };
    }
    return { tcp: false };
  };

  const guardedConnect = function (
    this: net.Socket,
    ...args: Parameters<net.Socket['connect']>
  ): net.Socket {
    const parsed = parseConnectTarget(args as unknown[]);
    if (!parsed.tcp) {
      return originalConnect.apply(this, args);
    }

    const isTrustedUpstream =
      upstreamHost !== undefined &&
      parsed.host !== undefined &&
      parsed.port !== undefined &&
      normalizeHost(parsed.host) === upstreamHost &&
      parsed.port === upstreamPort;

    if (isTrustedUpstream) {
      return originalConnect.apply(this, args);
    }

    if (
      parsed.host !== undefined &&
      net.isIP(parsed.host) > 0 &&
      isIPPrivate(parsed.host)
    ) {
      // Literal private target: refuse before the TCP handshake is even
      // attempted, so the target cannot observe a completed connection.
      this.destroy(new InsecureConnectionError(parsed.host));
      return this;
    }

    // Hostname (or implicit-host) targets connect through the wrapped
    // lookup, which fails the resolution before the handshake. The
    // connect-event backstop still destroys anything that reaches a private
    // peer without going through the guarded lookup.
    this.once('connect', () => {
      if (isIPPrivate(this.remoteAddress)) {
        this.destroy(new InsecureConnectionError(this.remoteAddress));
      }
    });
    return originalConnect.apply(
      this,
      parsed.injectedArgs as Parameters<net.Socket['connect']>,
    );
  } as unknown as PatchedConnect;

  net.Socket.prototype.connect = guardedConnect as typeof net.Socket.prototype.connect;

  return {
    uninstall: () => {
      net.Socket.prototype.connect =
        originalConnect as typeof net.Socket.prototype.connect;
    },
  };
};
