import requests
import argparse
import sys
import os

def main():
    parser = argparse.ArgumentParser(description='Run evaluation benchmark')
    parser.add_argument('--label', required=True, help='Label for the evaluation run')
    parser.add_argument('--api-url', required=True, help='API URL')
    parser.add_argument('--api-key', required=True, help='API key')
    parser.add_argument('--experiment-id', required=True, help='Experiment ID')

    args = parser.parse_args()

    try:
        response = requests.post(
            f"{args.api_url}/run",
            json={
                "experiment_id": args.experiment_id,
                "api_key": args.api_key,
                "label": args.label
            },
            headers={
                "Content-Type": "application/json"
            }
        )
        
        response.raise_for_status()
        
        print("Evaluation run started successfully")
        print(f"Response: {response.json()}")
        
    except requests.exceptions.RequestException as e:
        print(f"Error running evaluation: {str(e)}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()