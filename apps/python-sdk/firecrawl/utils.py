"""
Utility functions for the Firecrawl SDK.
"""
import re
from typing import Any, Dict, List, Union


def camel_to_snake(name: str) -> str:
    """
    Convert a camelCase string to snake_case.
    
    Args:
        name (str): The camelCase string to convert.
        
    Returns:
        str: The snake_case string.
    """
    if not name:
        return name
        
    s1 = re.sub('(.)([A-Z][a-z]+)', r'\1_\2', name)
    return re.sub('([a-z0-9])([A-Z])', r'\1_\2', s1).lower()


def convert_dict_keys_to_snake_case(data: Any) -> Any:
    """
    Recursively convert all dictionary keys from camelCase to snake_case.
    
    Args:
        data (Any): The data to convert. Can be a dictionary, list, or primitive type.
        
    Returns:
        Any: The converted data with snake_case keys.
    """
    if isinstance(data, dict):
        return {camel_to_snake(k): convert_dict_keys_to_snake_case(v) for k, v in data.items()}
    elif isinstance(data, list):
        return [convert_dict_keys_to_snake_case(item) for item in data]
    else:
        return data


class DotDict(dict):
    """
    A dictionary that supports dot notation access to its items.
    
    Example:
        >>> d = DotDict({'foo': 'bar'})
        >>> d.foo
        'bar'
        >>> d['foo']
        'bar'
    """
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        for key, value in self.items():
            if isinstance(value, dict):
                self[key] = DotDict(value)
            elif isinstance(value, list):
                self[key] = [DotDict(item) if isinstance(item, dict) else item for item in value]
    
    def __getattr__(self, key):
        try:
            return self[key]
        except KeyError:
            raise AttributeError(f"'DotDict' object has no attribute '{key}'")
    
    def __setattr__(self, key, value):
        self[key] = value


def convert_to_dot_dict(data: Union[Dict, List, Any]) -> Union[DotDict, List, Any]:
    """
    Convert a dictionary or list of dictionaries to DotDict objects.
    
    Args:
        data (Union[Dict, List, Any]): The data to convert.
        
    Returns:
        Union[DotDict, List, Any]: The converted data with DotDict objects.
    """
    if isinstance(data, dict):
        return DotDict(data)
    elif isinstance(data, list):
        return [convert_to_dot_dict(item) for item in data]
    else:
        return data
