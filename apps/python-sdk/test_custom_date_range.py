#!/usr/bin/env python3
"""Test script to reproduce and verify the custom date range validation fix."""

from firecrawl.v2.types import SearchRequest
from firecrawl.v2.methods.search import _validate_search_request

def test_reported_case():
    """Test the specific case mentioned in the user's error message."""
    try:
        request = SearchRequest(query='test', tbs='cdr:1,cd_max:2/28/2023')
        _validate_search_request(request)
        print('ERROR: This should have failed (missing cd_min)')
        return False
    except ValueError as e:
        print(f'SUCCESS: Correctly rejected invalid format: {e}')
        return True

def test_valid_custom_date_range():
    """Test valid custom date range validation."""
    try:
        request = SearchRequest(query='test', tbs='cdr:1,cd_min:2/28/2023,cd_max:3/1/2023')
        _validate_search_request(request)
        print('SUCCESS: Custom date range validation passed')
        return True
    except ValueError as e:
        print(f'ERROR: Valid custom date range rejected: {e}')
        return False

def test_documented_example():
    """Test the example from documentation."""
    try:
        request = SearchRequest(query='test', tbs='cdr:1,cd_min:12/1/2024,cd_max:12/31/2024')
        _validate_search_request(request)
        print('SUCCESS: Documented example passed')
        return True
    except ValueError as e:
        print(f'ERROR: Documented example rejected: {e}')
        return False

def test_predefined_values():
    """Test that predefined values still work."""
    predefined_values = ["qdr:h", "qdr:d", "qdr:w", "qdr:m", "qdr:y", "d", "w", "m", "y"]
    
    for value in predefined_values:
        try:
            request = SearchRequest(query='test', tbs=value)
            _validate_search_request(request)
            print(f'SUCCESS: Predefined value {value} passed')
        except ValueError as e:
            print(f'ERROR with {value}: {e}')
            return False
    return True

if __name__ == "__main__":
    print("Testing custom date range validation fix...")
    
    print("\n1. Testing reported invalid case (should fail):")
    reported_works = test_reported_case()
    
    print("\n2. Testing valid custom date range:")
    custom_works = test_valid_custom_date_range()
    
    print("\n3. Testing documented example:")
    documented_works = test_documented_example()
    
    print("\n4. Testing predefined values:")
    predefined_works = test_predefined_values()
    
    print(f"\nResults:")
    print(f"Reported case correctly rejected: {reported_works}")
    print(f"Valid custom date range works: {custom_works}")
    print(f"Documented example works: {documented_works}")
    print(f"Predefined values work: {predefined_works}")
    
    if custom_works and documented_works and predefined_works and reported_works:
        print("\n✅ All tests passed! The fix is working correctly.")
    else:
        print("\n❌ Some tests failed. The fix needs more work.")
