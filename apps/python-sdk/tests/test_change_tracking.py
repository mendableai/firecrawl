import unittest
from unittest.mock import patch, MagicMock
import json
import os
from firecrawl import FirecrawlApp

class TestChangeTracking(unittest.TestCase):
    @patch('requests.post')
    def test_change_tracking_format(self, mock_post):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            'success': True,
            'data': {
                'markdown': 'Test markdown content',
                'changeTracking': {
                    'previousScrapeAt': '2023-01-01T00:00:00Z',
                    'changeStatus': 'changed',
                    'visibility': 'visible'
                }
            }
        }
        mock_post.return_value = mock_response

        app = FirecrawlApp(api_key=os.environ.get('TEST_API_KEY', 'dummy-api-key-for-testing'))
        result = app.scrape_url('https://example.com', {
            'formats': ['markdown', 'changeTracking']
        })

        args, kwargs = mock_post.call_args
        self.assertEqual(kwargs['json']['formats'], ['markdown', 'changeTracking'])
        
        self.assertEqual(result['changeTracking']['previousScrapeAt'], '2023-01-01T00:00:00Z')
        self.assertEqual(result['changeTracking']['changeStatus'], 'changed')
        self.assertEqual(result['changeTracking']['visibility'], 'visible')

    @patch('requests.post')
    def test_change_tracking_options(self, mock_post):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            'success': True,
            'data': {
                'markdown': 'Test markdown content',
                'changeTracking': {
                    'previousScrapeAt': '2023-01-01T00:00:00Z',
                    'changeStatus': 'changed',
                    'visibility': 'visible',
                    'diff': {
                        'text': '@@ -1,1 +1,1 @@\n-old content\n+new content',
                        'json': {
                            'files': [{
                                'from': None,
                                'to': None,
                                'chunks': [{
                                    'content': '@@ -1,1 +1,1 @@',
                                    'changes': [{
                                        'type': 'del',
                                        'content': '-old content',
                                        'del': True,
                                        'ln': 1
                                    }, {
                                        'type': 'add',
                                        'content': '+new content',
                                        'add': True,
                                        'ln': 1
                                    }]
                                }]
                            }]
                        }
                    },
                    'json': {
                        'title': {
                            'previous': 'Old Title',
                            'current': 'New Title'
                        }
                    }
                }
            }
        }
        mock_post.return_value = mock_response

        app = FirecrawlApp(api_key=os.environ.get('TEST_API_KEY', 'dummy-api-key-for-testing'))
        result = app.scrape_url('https://example.com', {
            'formats': ['markdown', 'changeTracking'],
            'changeTrackingOptions': {
                'modes': ['git-diff', 'json'],
                'schema': {'type': 'object', 'properties': {'title': {'type': 'string'}}}
            }
        })

        args, kwargs = mock_post.call_args
        self.assertEqual(kwargs['json']['formats'], ['markdown', 'changeTracking'])
        self.assertEqual(kwargs['json']['changeTrackingOptions']['modes'], ['git-diff', 'json'])
        
        self.assertEqual(result['changeTracking']['diff']['text'], '@@ -1,1 +1,1 @@\n-old content\n+new content')
        self.assertEqual(result['changeTracking']['json']['title']['previous'], 'Old Title')
        self.assertEqual(result['changeTracking']['json']['title']['current'], 'New Title')
