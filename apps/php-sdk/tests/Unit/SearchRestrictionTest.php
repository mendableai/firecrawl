<?php

declare(strict_types=1);

use Firecrawl\Models\SearchOptions;
use GuzzleHttp\Psr7\Response;

it('sends the search cr and lr options in the request body', function (): void {
    $history = new ArrayObject();
    $client = fakeFirecrawlClient([
        new Response(200, [], json_encode(['success' => true, 'data' => ['web' => []]])),
    ], $history);

    $client->search('firecrawl', SearchOptions::with(cr: 'countryGR', lr: 'lang_el'));

    $body = json_decode((string) $history[0]['request']->getBody(), true);
    expect($body['cr'])->toBe('countryGR');
    expect($body['lr'])->toBe('lang_el');
});

it('omits the search cr and lr options when they are unset', function (): void {
    $options = SearchOptions::with(limit: 5);

    expect($options->toArray())->toBe(['limit' => 5]);
});
