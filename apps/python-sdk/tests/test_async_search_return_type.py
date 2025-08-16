#!/usr/bin/env python3
"""
Test async search return type fix - consolidated test suite.
Verifies AsyncSearchResponse maintains backward compatibility while fixing type mismatch.
"""

import asyncio
import warnings
from unittest.mock import AsyncMock, patch
from firecrawl.firecrawl import FirecrawlDocument, SearchResponse, AsyncSearchResponse, AsyncFirecrawlApp


def test_async_search_response_isolation():
    """Test that AsyncSearchResponse is isolated from SearchResponse"""
    
    # Create test data
    test_docs = [
        FirecrawlDocument(url="https://example.com/1", markdown="Test 1"),
        FirecrawlDocument(url="https://example.com/2", markdown="Test 2")
    ]
    
    # Create instances
    async_response = AsyncSearchResponse(
        success=True,
        data=test_docs,
        warning=None,
        error=None
    )
    
    sync_response = SearchResponse(
        success=True,
        data=test_docs,
        warning=None,
        error=None
    )
    
    # Test 1: AsyncSearchResponse supports dict-style access with warnings
    with warnings.catch_warnings(record=True) as w:
        warnings.simplefilter("always")
        
        # Dict-style access should work on async version
        success = async_response['success']
        assert success == True
        assert len(w) == 1
        assert issubclass(w[0].category, DeprecationWarning)
        assert "Dictionary-style access" in str(w[0].message)
    
    # Test 2: SearchResponse does NOT support dict-style access
    try:
        _ = sync_response['success']
        assert False, "SearchResponse should NOT support dict access"
    except TypeError:
        pass  # Expected - sync version doesn't have dict methods
    
    # Test 3: Inheritance is correct
    assert isinstance(async_response, SearchResponse)
    assert isinstance(async_response, AsyncSearchResponse)
    assert not isinstance(sync_response, AsyncSearchResponse)


def test_async_search_response_backward_compatibility():
    """Test all backward compatibility methods with deprecation warnings"""
    
    test_docs = [FirecrawlDocument(url="https://example.com", markdown="Test")]
    response = AsyncSearchResponse(success=True, data=test_docs, warning=None, error=None)
    
    # Test __getitem__ with deprecation warning
    with warnings.catch_warnings(record=True) as w:
        warnings.simplefilter("always")
        assert response['success'] == True
        assert response['data'] == test_docs
        assert len(w) == 2
        assert all("Dictionary-style access" in str(warning.message) for warning in w)
    
    # Test __getitem__ raises KeyError for missing keys (not AttributeError)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")  # Ignore deprecation warning for this test
        try:
            _ = response['nonexistent_key']
            assert False, "Should have raised KeyError"
        except KeyError as e:
            assert str(e) == "'nonexistent_key'"  # Verify it's KeyError with correct key
        except AttributeError:
            assert False, "Should raise KeyError, not AttributeError"
    
    # Test .get() method with deprecation warning
    with warnings.catch_warnings(record=True) as w:
        warnings.simplefilter("always")
        assert response.get('success') == True
        assert response.get('missing', 'default') == 'default'
        assert len(w) == 2
        assert all(".get() method is deprecated" in str(warning.message) for warning in w)
    
    # Test __contains__ (no warning for this one)
    assert 'success' in response
    assert 'data' in response
    assert 'missing' not in response
    
    # Test .keys() method with deprecation warning
    with warnings.catch_warnings(record=True) as w:
        warnings.simplefilter("always")
        keys = list(response.keys())
        assert 'success' in keys
        assert 'data' in keys
        # Should have at least one deprecation warning about keys()
        assert any(".keys() method is deprecated" in str(warning.message) for warning in w)


async def test_async_search_returns_correct_type():
    """Test that AsyncFirecrawlApp.search returns AsyncSearchResponse"""
    
    # Mock API response
    mock_api_response = {
        'success': True,
        'data': [
            {
                'url': 'https://example.com/result1',
                'title': 'First Result',
                'markdown': '# First Result\nContent here'
            },
            {
                'url': 'https://example.com/result2',
                'title': 'Second Result', 
                'markdown': '# Second Result\nMore content'
            }
        ],
        'warning': None,
        'error': None
    }
    
    app = AsyncFirecrawlApp(api_key='test_key', api_url='https://test.api')
    
    with patch.object(app, '_async_post_request', new_callable=AsyncMock) as mock_post:
        mock_post.return_value = mock_api_response
        
        # Call search method
        result = await app.search('test query', limit=10)
        
        # Verify correct API call
        mock_post.assert_called_once()
        call_args = mock_post.call_args
        assert call_args[0][0] == 'https://test.api/v1/search'
        assert call_args[0][1]['query'] == 'test query'
        assert call_args[0][1]['limit'] == 10
        
        # Test 1: Returns AsyncSearchResponse
        assert isinstance(result, AsyncSearchResponse)
        
        # Test 2: Attribute access works (preferred)
        assert result.success == True
        assert len(result.data) == 2
        assert isinstance(result.data[0], FirecrawlDocument)
        assert result.data[0].url == 'https://example.com/result1'
        assert result.data[0].title == 'First Result'
        
        # Test 3: Dict-style access works with warnings (backward compatibility)
        with warnings.catch_warnings(record=True) as w:
            warnings.simplefilter("always")
            success = result['success']
            data = result['data']
            assert success == True
            assert len(data) == 2
            assert len(w) == 2  # Two dict accesses
            assert all("Dictionary-style access" in str(warning.message) for warning in w)


async def test_migration_path():
    """Test that users can migrate from dict to attribute access"""
    
    mock_response = {
        'success': True,
        'data': [{'url': 'https://example.com', 'title': 'Test', 'markdown': 'Content'}],
        'warning': None,
        'error': None
    }
    
    app = AsyncFirecrawlApp(api_key='test_key')
    
    with patch.object(app, '_async_post_request', new_callable=AsyncMock) as mock_post:
        mock_post.return_value = mock_response
        result = await app.search('test')
        
        # Old way (with warnings)
        with warnings.catch_warnings(record=True) as w:
            warnings.simplefilter("always")
            old_success = result['success']
            old_data = result['data']
            assert len(w) > 0  # Should have deprecation warnings
        
        # New way (no warnings)
        with warnings.catch_warnings(record=True) as w:
            warnings.simplefilter("always")
            new_success = result.success
            new_data = result.data
            assert len(w) == 0  # No warnings with attribute access
        
        # Both return identical values
        assert old_success == new_success
        assert old_data == new_data


async def test_error_response():
    """Test that error responses work correctly"""
    
    app = AsyncFirecrawlApp(api_key='test_key')
    
    error_response = {
        'success': False,
        'data': [],
        'error': 'API Error: Invalid query',
        'warning': None
    }
    
    with patch.object(app, '_async_post_request', new_callable=AsyncMock) as mock_post:
        mock_post.return_value = error_response
        
        result = await app.search('bad query')
        
        assert isinstance(result, AsyncSearchResponse)
        assert result.success == False
        assert result.error == 'API Error: Invalid query'
        assert len(result.data) == 0


async def run_async_tests():
    """Run all async tests"""
    await test_async_search_returns_correct_type()
    await test_migration_path()
    await test_error_response()


if __name__ == "__main__":
    import sys
    
    print("Running Async Search Return Type Tests")
    print("=" * 60)
    
    try:
        # Run sync tests
        print("\n✅ Test: AsyncSearchResponse isolation")
        test_async_search_response_isolation()
        print("   Passed - SearchResponse unaffected, AsyncSearchResponse has dict methods")
        
        print("\n✅ Test: Backward compatibility methods")
        test_async_search_response_backward_compatibility()
        print("   Passed - All dict-like methods work with deprecation warnings")
        
        # Run async tests
        print("\n✅ Test: Async search returns correct type")
        asyncio.run(test_async_search_returns_correct_type())
        print("   Passed - Returns AsyncSearchResponse with proper behavior")
        
        print("\n✅ Test: Migration path from dict to attributes")
        asyncio.run(test_migration_path())
        print("   Passed - Both access patterns work, new way has no warnings")
        
        print("\n✅ Test: Error response handling")
        asyncio.run(test_error_response())
        print("   Passed - Error responses handled correctly")
        
        print("\n" + "=" * 60)
        print("✅ ALL TESTS PASSED!")
        print("\nSummary:")
        print("  • AsyncSearchResponse supports backward compatibility")
        print("  • SearchResponse (sync) remains unchanged")
        print("  • Clear migration path with deprecation warnings")
        print("  • Full type safety restored")
        
    except Exception as e:
        print(f"\n❌ Test failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)