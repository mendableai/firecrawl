<?php

declare(strict_types=1);

use Firecrawl\Exceptions\FirecrawlException;
use Firecrawl\Version;
use GuzzleHttp\Psr7\Response;

it('finds data provider tools through a find-tools call', function (): void {
    $history = new ArrayObject();
    $client = fakeFirecrawlClient([
        new Response(200, [], json_encode([
            'success' => true,
            'scrape_id' => 'scrape-1',
            'data' => [
                'alexandria' => [[
                    'provider' => 'firecrawl',
                    'capability' => 'find-tools',
                    'creditsCost' => 0,
                    'data' => ['items' => [['id' => 'npmjs-com/packages/get_downloads', 'provider' => 'npmjs-com', 'capability' => 'packages/get_downloads']], 'total' => 1],
                ]],
                'creditsCost' => 0,
            ],
        ])),
    ], $history);

    $tools = $client->findTools(['query' => 'npm downloads', 'limit' => 1]);

    expect($tools['items'][0]['provider'])->toBe('npmjs-com');
    $request = $history[0]['request'];
    expect($request->getUri()->getPath())->toBe('/v2/scrape');
    expect(json_decode((string) $request->getBody(), true))->toBe([
        'alexandria' => [['provider' => 'firecrawl', 'capability' => 'find-tools', 'options' => ['query' => 'npm downloads', 'limit' => 1]]],
        'origin' => 'php-sdk@' . Version::SDK_VERSION,
    ]);
    expect($request->getHeaderLine('x-request-id'))->toMatch('/^[a-f0-9]{32}$/');
});

it('sends and returns the given request ID', function (): void {
    $history = new ArrayObject();
    $client = fakeFirecrawlClient([
        new Response(200, [], json_encode(['success' => true, 'data' => ['alexandria' => [['provider' => 'npmjs-com', 'capability' => 'packages/get_downloads', 'data' => []]], 'creditsCost' => 5]])),
    ], $history);

    $result = $client->scrapeAlexandria([['provider' => 'npmjs-com', 'capability' => 'packages/get_downloads']], requestId: 'retry-1');

    expect($result['requestId'])->toBe('retry-1');
    expect($result['creditsCost'])->toBe(5);
    expect($history[0]['request']->getHeaderLine('x-request-id'))->toBe('retry-1');
    expect(fn () => $client->scrapeAlexandria([['provider' => 'a', 'capability' => 'b']], requestId: 'bad id'))->toThrow(InvalidArgumentException::class);
});

it('rejects a malformed successful response', function (): void {
    $client = fakeFirecrawlClient([
        new Response(200, [], json_encode(['success' => true, 'data' => ['creditsCost' => 0]])),
    ]);

    expect(fn () => $client->scrapeAlexandria([['provider' => 'a', 'capability' => 'b']]))->toThrow(FirecrawlException::class, 'Invalid alexandria response');
});

it('returns a failed tool call as its result and raises a failed find-tools call', function (): void {
    $failure = ['code' => 'missing_option', 'message' => 'packages/get_downloads requires packages.', 'status' => 400];
    $client = fakeFirecrawlClient([
        new Response(200, [], json_encode(['success' => true, 'data' => ['alexandria' => [['provider' => 'npmjs-com', 'capability' => 'packages/get_downloads', 'error' => $failure]], 'creditsCost' => 0]])),
        new Response(200, [], json_encode(['success' => true, 'data' => ['alexandria' => [['provider' => 'firecrawl', 'capability' => 'find-tools', 'error' => $failure]], 'creditsCost' => 0]])),
    ]);

    $result = $client->scrapeAlexandria([['provider' => 'npmjs-com', 'capability' => 'packages/get_downloads']]);
    expect($result['alexandria'][0]['error']['code'])->toBe('missing_option');

    expect(fn () => $client->findTools(['query' => 'npm']))->toThrow(FirecrawlException::class, 'packages/get_downloads requires packages.');
});

it('rejects an empty or oversized call list', function (): void {
    $client = fakeFirecrawlClient([]);
    expect(fn () => $client->scrapeAlexandria([]))->toThrow(InvalidArgumentException::class);
    expect(fn () => $client->scrapeAlexandria(array_fill(0, 11, ['provider' => 'a', 'capability' => 'b'])))->toThrow(InvalidArgumentException::class);
});
