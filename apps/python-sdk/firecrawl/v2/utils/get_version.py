import os
import re

def get_version():
  try:
      from pathlib import Path
      package_path = os.path.dirname(__file__)
      version_file = Path(os.path.join(package_path, '__init__.py')).read_text()
      version_match = re.search(r"^__version__ = ['\"]([^'\"]*)['\"]", version_file, re.M)
      if version_match:
          return version_match.group(1).strip()
  except Exception:
      print("Failed to get version from __init__.py")
      return None