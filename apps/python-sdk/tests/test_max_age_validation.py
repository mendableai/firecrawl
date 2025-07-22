import unittest
from unittest.mock import patch, MagicMock
import os
from firecrawl import FirecrawlApp

class TestMaxAgeValidation(unittest.TestCase):
    @patch('requests.post')
    def test_max_age_parameter_accepted(self, mock_post):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            'success': True,
            'data': {
                'markdown': 'Test content',
                'metadata': {'title': 'Test'}
            }
        }
        mock_post.return_value = mock_response

        app = FirecrawlApp(api_key=os.environ.get('TEST_API_KEY', 'dummy-api-key-for-testing'))
        
        result = app.scrape_url('https://example.com', max_age=3600000)
        
        args, kwargs = mock_post.call_args
        self.assertEqual(kwargs['json']['maxAge'], 3600000)
        self.assertIsNotNone(result)

    @patch('requests.post')
    def test_max_age_parameter_with_other_options(self, mock_post):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            'success': True,
            'data': {
                'markdown': 'Test content',
                'metadata': {'title': 'Test'}
            }
        }
        mock_post.return_value = mock_response

        app = FirecrawlApp(api_key=os.environ.get('TEST_API_KEY', 'dummy-api-key-for-testing'))
        
        result = app.scrape_url('https://example.com', 
                               max_age=7200000,
                               formats=['markdown', 'html'],
                               timeout=30000)
        
        args, kwargs = mock_post.call_args
        self.assertEqual(kwargs['json']['maxAge'], 7200000)
        self.assertEqual(kwargs['json']['formats'], ['markdown', 'html'])
        self.assertEqual(kwargs['json']['timeout'], 30000)
        self.assertIsNotNone(result)

    def test_max_age_parameter_validation_error_before_fix(self):
        app = FirecrawlApp(api_key='dummy-key')
        
        original_validate = app._validate_kwargs
        def mock_validate(kwargs, method_name):
            if method_name == "scrape_url":
                allowed_params = {"formats", "include_tags", "exclude_tags", "only_main_content", "wait_for", 
                                "timeout", "location", "mobile", "skip_tls_verification", "remove_base64_images",
                                "block_ads", "proxy", "extract", "json_options", "actions", "change_tracking_options", "integration"}
                unknown_params = set(kwargs.keys()) - allowed_params
                if unknown_params:
                    raise ValueError(f"Unsupported parameter(s) for {method_name}: {', '.join(unknown_params)}")
        
        app._validate_kwargs = mock_validate
        
        with self.assertRaises(ValueError) as context:
            app.scrape_url('https://example.com', max_age=3600000)
        
        self.assertIn("max_age", str(context.exception))
        self.assertIn("Unsupported parameter(s)", str(context.exception))

    @patch('requests.post')
    def test_max_age_zero_value(self, mock_post):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            'success': True,
            'data': {
                'markdown': 'Test content',
                'metadata': {'title': 'Test'}
            }
        }
        mock_post.return_value = mock_response

        app = FirecrawlApp(api_key=os.environ.get('TEST_API_KEY', 'dummy-api-key-for-testing'))
        
        result = app.scrape_url('https://example.com', max_age=0)
        
        args, kwargs = mock_post.call_args
        self.assertEqual(kwargs['json']['maxAge'], 0)
        self.assertIsNotNone(result)

if __name__ == '__main__':
    unittest.main()
